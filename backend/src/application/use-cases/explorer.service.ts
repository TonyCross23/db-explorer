import { ResourceNotFoundError } from '../../domain/errors';
import { randomUUID } from 'node:crypto';
import type {
  ConnectionInput,
  SshOptions,
  ConnectionSummary,
  ConnectionUpdate,
  RowQuery,
} from '@db-explorer/shared';
import {
  CONNECTION_REPOSITORY,
  type ConnectionRepository,
} from '../../domain/repositories/connection.repository';
import { DATABASE_GATEWAY, type DatabaseGateway } from '../../domain/repositories/database.gateway';
import type { SavedConnection } from '../../domain/entities/connection.entity';
const summary = (c: SavedConnection): ConnectionSummary => ({
  id: c.id,
  name: c.name,
  engine: c.engine,
  host: c.host,
  port: c.port,
  database: c.database,
  username: c.username,
  color: c.color,
  environment: c.environment,
  tls: c.tls,
  createdAt: c.createdAt,
  hasPassword: !!c.password,
  ssh: c.ssh
    ? {
        host: c.ssh.host,
        port: c.ssh.port,
        username: c.ssh.username,
        auth: c.ssh.auth,
        fingerprint: c.ssh.fingerprint,
      }
    : undefined,
});
export class ExplorerService {
  constructor(
    private readonly repo: ConnectionRepository,
    private readonly gateway: DatabaseGateway,
  ) {}
  async list() {
    return (await this.repo.all()).map(summary);
  }
  async get(id: string) {
    const c = await this.repo.find(id);
    if (!c) throw new ResourceNotFoundError('Connection no longer exists.');
    return c;
  }
  async create(input: ConnectionInput) {
    const c = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
    await this.repo.save(c);
    return summary(c);
  }
  async update(id: string, input: ConnectionUpdate) {
    const old = await this.get(id);
    const c = { ...old, ...input, password: input.password ?? old.password };
    await this.repo.save(c);
    return summary(c);
  }
  async remove(id: string) {
    await this.get(id);
    await this.repo.delete(id);
    return { ok: true };
  }
  testSsh(options: SshOptions) {
    return this.gateway.testSsh(options);
  }
  sshFingerprint(host: string, port: number) {
    return this.gateway.sshFingerprint(host, port);
  }
  test(input: ConnectionInput) {
    return this.gateway.test(input);
  }
  async testSaved(id: string, input?: ConnectionUpdate) {
    const old = await this.get(id);
    return this.gateway.test(
      input ? { ...old, ...input, password: input.password ?? old.password } : old,
    );
  }
  async tables(id: string) {
    return this.gateway.tables(await this.get(id));
  }
  async columns(id: string, schema: string, table: string) {
    return this.gateway.columns(await this.get(id), schema, table);
  }
  async diagram(id: string, schema: string) {
    return this.gateway.diagram(await this.get(id), schema);
  }
  async rows(id: string, query: RowQuery) {
    return this.gateway.rows(await this.get(id), query);
  }
}
