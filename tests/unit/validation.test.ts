import { describe, it, expect } from 'vitest';
import { connectionSchema, rowQuerySchema } from '@db-explorer/shared';
const connection = {
  name: 'Local',
  engine: 'postgresql',
  host: '127.0.0.1',
  port: 5432,
  database: 'fixture',
  username: 'reader',
  password: '',
};
describe('connection contracts', () => {
  it('accepts either engine, coerces ports and supplies safe defaults', () => {
    expect(connectionSchema.parse({ ...connection, port: '5432' }).tls.enabled).toBe(false);
    expect(connectionSchema.parse({ ...connection, engine: 'mysql', port: 3306 }).engine).toBe(
      'mysql',
    );
  });
  it('requires the matching SSH credential and pinned host identity', () => {
    const ssh = {
      host: 'bastion',
      port: 22,
      username: 'fixture',
      fingerprint: 'SHA256:' + 'a'.repeat(43),
    };
    expect(
      connectionSchema.parse({ ...connection, ssh: { ...ssh, auth: 'agent' } }).ssh?.auth,
    ).toBe('agent');
    expect(connectionSchema.parse({ ...connection, ssh }).ssh?.auth).toBe('agent');
    expect(
      connectionSchema.safeParse({ ...connection, ssh: { ...ssh, auth: 'password' } }).success,
    ).toBe(false);
    expect(
      connectionSchema.safeParse({
        ...connection,
        ssh: { ...ssh, auth: 'password', password: 'secret' },
      }).success,
    ).toBe(true);
    expect(
      connectionSchema.safeParse({
        ...connection,
        ssh: { ...ssh, auth: 'key', privateKey: 'pem', passphrase: 'unlock' },
      }).success,
    ).toBe(true);
    expect(
      connectionSchema.safeParse({
        ...connection,
        ssh: { ...ssh, fingerprint: '', auth: 'key', privateKey: 'pem' },
      }).success,
    ).toBe(false);
  });
  it('rejects invalid ports and empty targets', () => {
    expect(connectionSchema.safeParse({ ...connection, port: 0 }).success).toBe(false);
    expect(connectionSchema.safeParse({ ...connection, host: '' }).success).toBe(false);
  });
  it('bounds pagination and search input', () => {
    expect(rowQuerySchema.parse({ schema: 'public', table: 'customers' }).limit).toBe(100);
    for (const query of [{ limit: 1001 }, { page: 0 }, { search: 'a'.repeat(201) }])
      expect(
        rowQuerySchema.safeParse({ schema: 'public', table: 'customers', ...query }).success,
      ).toBe(false);
  });
});
