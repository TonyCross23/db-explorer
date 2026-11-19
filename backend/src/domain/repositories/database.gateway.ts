import type {
  ConnectionInput,
  SshOptions,
  TableInfo,
  ColumnInfo,
  RowQuery,
  RowResult,
  SchemaDiagram,
} from '@db-explorer/shared';
export interface DatabaseGateway {
  testSsh(options: SshOptions): Promise<{ ok: true }>;
  sshFingerprint(host: string, port: number): Promise<{ fingerprint: string }>;
  test(connection: ConnectionInput): Promise<{ version: string }>;
  tables(connection: ConnectionInput): Promise<TableInfo[]>;
  columns(connection: ConnectionInput, schema: string, table: string): Promise<ColumnInfo[]>;
  diagram(connection: ConnectionInput, schema: string): Promise<SchemaDiagram>;
  rows(connection: ConnectionInput, query: RowQuery): Promise<RowResult>;
}
export const DATABASE_GATEWAY = Symbol('DatabaseGateway');
