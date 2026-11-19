import type {
  ConnectionInput,
  SchemaDiagram,
  DiagramRelationship,
  DiagramTable,
} from '@db-explorer/shared';
import { InvalidQueryError } from '../../domain/errors';
type Query = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
const action = (value: unknown) =>
  ({ a: 'NO ACTION', r: 'RESTRICT', c: 'CASCADE', n: 'SET NULL', d: 'SET DEFAULT' })[
    String(value)
  ] ?? String(value);
/** Metadata only, bounded independently of table sizes. Uses the existing read-only session. */
export async function readSchemaDiagram(
  query: Query,
  c: ConnectionInput,
  schema: string,
): Promise<SchemaDiagram> {
  const pg = c.engine === 'postgresql';
  if (!pg && schema !== c.database)
    throw new InvalidQueryError('Select a schema in this connection’s database.');
  const tableRows = await query(
    pg
      ? `SELECT c.relname AS name FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind IN ('r','p') AND has_table_privilege(c.oid,'SELECT') ORDER BY c.relname LIMIT 101`
      : `SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME LIMIT 101`,
    [schema],
  );
  const names = tableRows.slice(0, 100).map((t) => String(t.name));
  if (!names.length)
    return { schema, tables: [], relationships: [], truncated: false, externalRelationships: 0 };
  const placeholders = names.map(() => '?').join(',');
  const params = pg ? [schema, names] : [schema, ...names];
  const columnRows = await query(
    pg
      ? `SELECT c.relname AS "table",a.attname AS name,pg_catalog.format_type(a.atttypid,a.atttypmod) AS type,NOT a.attnotnull AS nullable,EXISTS(SELECT 1 FROM pg_catalog.pg_index i WHERE i.indrelid=c.oid AND i.indisprimary AND a.attnum=ANY(i.indkey)) AS "primaryKey" FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=ANY($2::text[]) AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum LIMIT 5001`
      : `SELECT TABLE_NAME AS \`table\`,COLUMN_NAME AS name,COLUMN_TYPE AS type,IS_NULLABLE='YES' AS nullable,COLUMN_KEY='PRI' AS \`primaryKey\` FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME IN (${placeholders}) ORDER BY TABLE_NAME,ORDINAL_POSITION LIMIT 5001`,
    params,
  );
  const tables: DiagramTable[] = names.map((name) => ({ schema, name, columns: [] }));
  const byName = new Map(tables.map((t) => [t.name, t]));
  for (const column of columnRows.slice(0, 5000))
    byName.get(String(column.table))?.columns.push({
      name: String(column.name),
      type: String(column.type),
      nullable: !!column.nullable,
      primaryKey: !!column.primaryKey,
    });
  const foreignRows = await query(
    pg
      ? `SELECT f.conname AS name,sn.nspname AS "fromSchema",sc.relname AS "fromTable",sa.attname AS "fromColumn",tn.nspname AS "toSchema",tc.relname AS "toTable",ta.attname AS "toColumn",f.confdeltype AS "onDelete",f.confupdtype AS "onUpdate" FROM pg_catalog.pg_constraint f JOIN pg_catalog.pg_class sc ON sc.oid=f.conrelid JOIN pg_catalog.pg_namespace sn ON sn.oid=sc.relnamespace JOIN pg_catalog.pg_class tc ON tc.oid=f.confrelid JOIN pg_catalog.pg_namespace tn ON tn.oid=tc.relnamespace JOIN LATERAL unnest(f.conkey,f.confkey) WITH ORDINALITY AS k(source_num,target_num,ordinal) ON true JOIN pg_catalog.pg_attribute sa ON sa.attrelid=sc.oid AND sa.attnum=k.source_num JOIN pg_catalog.pg_attribute ta ON ta.attrelid=tc.oid AND ta.attnum=k.target_num WHERE f.contype='f' AND sn.nspname=$1 AND sc.relname=ANY($2::text[]) ORDER BY sc.relname,f.conname,k.ordinal LIMIT 2001`
      : `SELECT k.CONSTRAINT_NAME AS name,k.TABLE_SCHEMA AS fromSchema,k.TABLE_NAME AS fromTable,k.COLUMN_NAME AS fromColumn,k.REFERENCED_TABLE_SCHEMA AS toSchema,k.REFERENCED_TABLE_NAME AS toTable,k.REFERENCED_COLUMN_NAME AS toColumn,r.DELETE_RULE AS onDelete,r.UPDATE_RULE AS onUpdate FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME WHERE k.TABLE_SCHEMA=? AND k.TABLE_NAME IN (${placeholders}) AND k.REFERENCED_TABLE_NAME IS NOT NULL ORDER BY k.TABLE_NAME,k.CONSTRAINT_NAME,k.ORDINAL_POSITION LIMIT 2001`,
    params,
  );
  // Build complete composite constraints. Never render a partially truncated FK as a valid relationship.
  const grouped = new Map<string, DiagramRelationship>();
  for (const row of foreignRows) {
    const key = JSON.stringify([row.fromSchema, row.fromTable, row.name]);
    let relation = grouped.get(key);
    if (!relation) {
      relation = {
        name: String(row.name),
        from: { schema: String(row.fromSchema), table: String(row.fromTable), columns: [] },
        to: { schema: String(row.toSchema), table: String(row.toTable), columns: [] },
        onDelete: action(row.onDelete),
        onUpdate: action(row.onUpdate),
      };
      grouped.set(key, relation);
    }
    relation.from.columns.push(String(row.fromColumn));
    relation.to.columns.push(String(row.toColumn));
  }
  const relationships = [...grouped.values()];
  if (foreignRows.length > 2000) relationships.pop();
  return {
    schema,
    tables,
    relationships,
    truncated: tableRows.length > 100 || columnRows.length > 5000 || foreignRows.length > 2000,
    externalRelationships: relationships.filter(
      (r) => r.to.schema !== schema || !byName.has(r.to.table),
    ).length,
  };
}
