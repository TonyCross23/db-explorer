import { z } from 'zod';
const text = (label: string) => z.string().trim().min(1, `${label} is required`).max(255);
const port = z.coerce.number().int().min(1).max(65535);
export const sshSchema = z
  .object({
    host: text('SSH host'),
    port: port.default(22),
    username: text('SSH username'),
    auth: z.enum(['password', 'key', 'agent']).default('agent'),
    password: z.string().max(4096).optional(),
    privateKey: z.string().max(65536).optional(),
    passphrase: z.string().max(4096).optional(),
    fingerprint: z
      .string()
      .regex(/^SHA256:[A-Za-z0-9+/]{43}$/, 'Use the verified SHA256 SSH host-key fingerprint'),
  })
  .superRefine((value, ctx) => {
    if (value.auth === 'password' && !value.password)
      ctx.addIssue({ code: 'custom', path: ['password'], message: 'SSH password is required' });
    if (value.auth === 'key' && !value.privateKey)
      ctx.addIssue({
        code: 'custom',
        path: ['privateKey'],
        message: 'SSH private key is required',
      });
  });
export type SshOptions = z.infer<typeof sshSchema>;
export const connectionSchema = z.object({
  name: text('Connection name').max(80),
  engine: z.enum(['postgresql', 'mysql']),
  host: text('Database host'),
  port,
  database: text('Database name'),
  username: text('Username'),
  password: z.string().max(4096),
  color: z.enum(['teal', 'blue', 'orange', 'purple']).default('teal'),
  environment: z.enum(['local', 'development', 'staging', 'production']).default('local'),
  tls: z
    .object({
      enabled: z.boolean().default(false),
      ca: z.string().max(131072).optional(),
      serverName: z.string().trim().max(255).optional(),
    })
    .default({ enabled: false }),
  ssh: sshSchema.optional(),
});
export const connectionUpdateSchema = connectionSchema.extend({
  password: z.string().max(4096).optional(),
});
export type ConnectionInput = z.infer<typeof connectionSchema>;
export type ConnectionUpdate = z.infer<typeof connectionUpdateSchema>;
export type ConnectionSummary = Pick<
  ConnectionInput,
  'name' | 'engine' | 'host' | 'port' | 'database' | 'username' | 'color' | 'environment' | 'tls'
> & {
  id: string;
  createdAt: string;
  ssh?: {
    host: string;
    port: number;
    username: string;
    auth: 'password' | 'key' | 'agent';
    fingerprint: string;
  };
  hasPassword: boolean;
};
export const rowQuerySchema = z.object({
  schema: text('Schema'),
  table: text('Table'),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  search: z.string().max(200).default(''),
  searchColumn: z.string().max(255).optional(),
  sort: z.string().max(255).optional(),
  direction: z.enum(['asc', 'desc']).default('asc'),
});
export type RowQuery = z.infer<typeof rowQuerySchema>;
export type TableInfo = {
  schema: string;
  name: string;
  type: 'table' | 'view';
  estimatedRows: string | null;
};
export type ColumnInfo = {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  defaultValue: string | null;
};
export type RowResult = {
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  page: number;
  limit: number;
  hasMore: boolean;
  elapsedMs: number;
  sql: string;
  stableOrder: boolean;
  truncated: boolean;
};
export const sshProbeSchema = z.object({ host: text('SSH host'), port: port.default(22) });
export const idSchema = z.string().uuid();
export const loginSchema = z.object({
  token: z.string().min(1, 'Enter your access token').max(512),
});

export const diagramQuerySchema = z.object({ schema: text('Schema') });
export type DiagramQuery = z.infer<typeof diagramQuerySchema>;
export type DiagramColumn = Pick<ColumnInfo, 'name' | 'type' | 'nullable' | 'primaryKey'>;
export type DiagramTable = { schema: string; name: string; columns: DiagramColumn[] };
export type DiagramRelationship = {
  name: string;
  from: { schema: string; table: string; columns: string[] };
  to: { schema: string; table: string; columns: string[] };
  onDelete: string;
  onUpdate: string;
};
export type SchemaDiagram = {
  schema: string;
  tables: DiagramTable[];
  relationships: DiagramRelationship[];
  truncated: boolean;
  externalRelationships: number;
};
