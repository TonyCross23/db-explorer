import { InvalidQueryError, ResourceNotFoundError } from '../../domain/errors';
import { Client as PgClient } from 'pg';
import { Socket, connect as connectSocket } from 'node:net';
import mysql, { type Connection as MysqlConnection, type RowDataPacket } from 'mysql2/promise';
import type {
  ConnectionInput,
  SshOptions,
  TableInfo,
  ColumnInfo,
  RowQuery,
  RowResult,
} from '@db-explorer/shared';
import type { DatabaseGateway } from '../../domain/repositories/database.gateway';
import { openTunnel, inspectSshFingerprint, connectSsh } from '../external-services/ssh-tunnel';
import { quoteIdentifier, safeRows } from './sql';
import { connectionFailure, type ConnectionStage } from './connection-errors';
import { readSchemaDiagram } from './schema-diagram';
import { existsSync } from 'node:fs';
type Query = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
export class NativeDatabaseGateway implements DatabaseGateway {
  private active = 0;
  async testSsh(options: SshOptions): Promise<{ ok: true }> {
    try {
      const client = await connectSsh(options);
      client.end();
      return { ok: true };
    } catch (error) {
      throw connectionFailure(error, {
        stage: 'ssh-connect',
        ssh: true,
        container: existsSync('/.dockerenv'),
        host: options.host,
      });
    }
  }

  async sshFingerprint(host: string, port: number) {
    try {
      return { fingerprint: await inspectSshFingerprint(host, port) };
    } catch (error) {
      throw connectionFailure(error, {
        stage: 'ssh-connect',
        ssh: true,
        container: existsSync('/.dockerenv'),
        host,
      });
    }
  }
  private async session<T>(
    c: ConnectionInput,
    operation: (query: Query) => Promise<T>,
  ): Promise<T> {
    if (this.active >= 8)
      throw new InvalidQueryError(
        'Too many active requests. Wait for the current requests to finish.',
      );
    this.active++;
    let close = () => {};
    let tunnelFailure: () => unknown = () => undefined;
    let stage: ConnectionStage = c.ssh ? 'ssh-connect' : 'database-connect';
    let pg: PgClient | undefined;
    let pgConnected = false;
    let my: MysqlConnection | undefined;
    try {
      const tunnel = await openTunnel(c);
      close = tunnel.close;
      tunnelFailure = tunnel.failure;
      stage = 'database-connect';
      const tls = c.tls.enabled
        ? {
            rejectUnauthorized: true,
            verifyIdentity: true,
            ca: c.tls.ca || undefined,
            servername: c.tls.serverName || c.host,
          }
        : undefined;
      if (c.engine === 'postgresql') {
        pg = new PgClient({
          host: c.tls.serverName || c.host,
          port: tunnel.port,
          database: c.database,
          user: c.username,
          password: c.password,
          ssl: tls,
          stream: () => {
            const socket = new Socket();
            const route = socket.connect.bind(socket) as (options: {
              host: string;
              port: number;
            }) => Socket;
            socket.connect = ((..._args: unknown[]) =>
              route({ host: tunnel.host, port: tunnel.port })) as Socket['connect'];
            return socket;
          },
          connectionTimeoutMillis: 10000,
          statement_timeout: 15000,
          query_timeout: 17000,
          application_name: 'DB Explorer (read-only)',
        });
        pg.on('error', () => {});
        await pg.connect();
        pgConnected = true;
        stage = 'session-setup';
        await pg.query('BEGIN READ ONLY');
        await pg.query("SET LOCAL statement_timeout = '15s'");
        stage = 'read-query';
        return await operation(async (sql, params = []) => {
          const result = await pg!.query(sql, params);
          return result.rows;
        });
      }
      my = await mysql.createConnection({
        host: c.tls.serverName || c.host,
        port: tunnel.port,
        database: c.database,
        user: c.username,
        password: c.password,
        ssl: tls,
        stream: () => connectSocket({ host: tunnel.host, port: tunnel.port }),
        connectTimeout: 10000,
        multipleStatements: false,
        supportBigNumbers: true,
        bigNumberStrings: true,
        dateStrings: true,
        enableKeepAlive: true,
      });
      stage = 'session-setup';
      await my.query('SET SESSION MAX_EXECUTION_TIME=15000');
      await my.query('START TRANSACTION READ ONLY');
      stage = 'read-query';
      return await operation(async (sql, params = []) => {
        const [rows] = await my!.query<RowDataPacket[]>({ sql, timeout: 17000 }, params);
        return rows;
      });
    } catch (e) {
      if (e instanceof InvalidQueryError || e instanceof ResourceNotFoundError) throw e;
      throw connectionFailure(tunnelFailure() ?? e, {
        stage,
        ssh: !!c.ssh,
        container: existsSync('/.dockerenv'),
        host: c.host,
      });
    } finally {
      if (pg) {
        if (pgConnected) {
          await pg.end().catch(() => {});
        } else {
          void pg.end().catch(() => {});
        }
      }
      if (my) {
        my.destroy();
      }
      close();
      this.active--;
    }
  }
  diagram(c: ConnectionInput, schema: string) {
    return this.session(c, (q) => readSchemaDiagram(q, c, schema));
  }
  test(c: ConnectionInput) {
    return this.session(c, async (q) => {
      const rows = await q('SELECT VERSION() AS version');
      return { version: String(rows[0]?.version ?? 'Connected') };
    });
  }
  tables(c: ConnectionInput): Promise<TableInfo[]> {
    return this.session(c, async (q) => {
      if (c.engine === 'postgresql') {
        const rows = await q(
          `SELECT n.nspname AS schema,c.relname AS name,CASE WHEN c.relkind IN ('v','m') THEN 'view' ELSE 'table' END AS type,CASE WHEN c.reltuples<0 THEN NULL ELSE c.reltuples::bigint::text END AS "estimatedRows" FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p','v','m','f') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND has_table_privilege(c.oid,'SELECT') ORDER BY n.nspname,c.relname LIMIT 10000`,
        );
        return rows as TableInfo[];
      }
      return (await q(
        `SELECT TABLE_SCHEMA AS \`schema\`,TABLE_NAME AS name,CASE WHEN TABLE_TYPE='VIEW' THEN 'view' ELSE 'table' END AS type,CAST(TABLE_ROWS AS CHAR) AS estimatedRows FROM information_schema.TABLES WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME LIMIT 10000`,
        [c.database],
      )) as TableInfo[];
    });
  }
  private async inspect(
    c: ConnectionInput,
    q: Query,
    schema: string,
    table: string,
  ): Promise<ColumnInfo[]> {
    if (c.engine === 'mysql' && schema !== c.database)
      throw new InvalidQueryError('Select a table in this connection’s database.');
    let rows: Record<string, unknown>[];
    if (c.engine === 'postgresql')
      rows = await q(
        `SELECT a.attname AS name,pg_catalog.format_type(a.atttypid,a.atttypmod) AS type,NOT a.attnotnull AS nullable,EXISTS(SELECT 1 FROM pg_catalog.pg_index i WHERE i.indrelid=t.oid AND i.indisprimary AND a.attnum=ANY(i.indkey)) AS "primaryKey",pg_get_expr(d.adbin,d.adrelid) AS "defaultValue" FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class t ON t.oid=a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=t.oid AND d.adnum=a.attnum WHERE n.nspname=$1 AND t.relname=$2 AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`,
        [schema, table],
      );
    else
      rows = await q(
        `SELECT COLUMN_NAME AS name,COLUMN_TYPE AS type,IS_NULLABLE='YES' AS nullable,COLUMN_KEY='PRI' AS \`primaryKey\`,COLUMN_DEFAULT AS defaultValue FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? ORDER BY ORDINAL_POSITION`,
        [schema, table],
      );
    if (!rows.length) throw new ResourceNotFoundError('Table does not exist or is not accessible.');
    return rows.map((r) => ({
      name: String(r.name),
      type: String(r.type),
      nullable: !!r.nullable,
      primaryKey: !!r.primaryKey,
      defaultValue: r.defaultValue === null ? null : String(r.defaultValue),
    }));
  }
  columns(c: ConnectionInput, schema: string, table: string) {
    return this.session(c, (q) => this.inspect(c, q, schema, table));
  }
  rows(c: ConnectionInput, options: RowQuery): Promise<RowResult> {
    return this.session(c, async (q) => {
      const start = performance.now(),
        columns = await this.inspect(c, q, options.schema, options.table),
        quote = (name: string) => quoteIdentifier(c.engine, name);
      if (options.sort && !columns.some((x) => x.name === options.sort))
        throw new InvalidQueryError('Unknown sort column.');
      if (options.searchColumn && !columns.some((x) => x.name === options.searchColumn))
        throw new InvalidQueryError('Unknown search column.');
      const params: unknown[] = [];
      const bind = (v: unknown) => {
        params.push(v);
        return c.engine === 'postgresql' ? '$' + params.length : '?';
      };
      let sql = `SELECT * FROM ${quote(options.schema)}.${quote(options.table)}`;
      if (options.search) {
        const target = options.searchColumn
          ? columns.filter((x) => x.name === options.searchColumn)
          : columns.filter((x) => !/(bytea|blob|binary)/i.test(x.type));
        if (!target.length) throw new InvalidQueryError('Choose a searchable column.');
        const escaped = options.search.replace(/[!%_]/g, '!$&');
        sql +=
          ' WHERE (' +
          target
            .map((x) =>
              c.engine === 'postgresql'
                ? `CAST(${quote(x.name)} AS text) ILIKE ${bind('%' + escaped + '%')} ESCAPE '!'`
                : `CAST(${quote(x.name)} AS CHAR) LIKE ${bind('%' + escaped + '%')} ESCAPE '!'`,
            )
            .join(' OR ') +
          ')';
      }
      const pk = columns.filter((x) => x.primaryKey).map((x) => x.name),
        order = options.sort ? [options.sort, ...pk.filter((x) => x !== options.sort)] : pk;
      if (order.length)
        sql +=
          ' ORDER BY ' +
          order.map((x) => quote(x) + ' ' + options.direction.toUpperCase()).join(', ');
      sql += ` LIMIT ${options.limit + 1} OFFSET ${(options.page - 1) * options.limit}`;
      const raw = await q(sql, params),
        more = raw.length > options.limit,
        safe = safeRows(raw.slice(0, options.limit));
      return {
        columns,
        ...safe,
        page: options.page,
        limit: options.limit,
        hasMore: more,
        elapsedMs: Math.round(performance.now() - start),
        sql,
        stableOrder: pk.length > 0,
        truncated: safe.truncated,
      };
    });
  }
}
