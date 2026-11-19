import { it, expect } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { EncryptedConnectionRepository } from '../../backend/src/infrastructure/database/repositories/encrypted-connection.repository';
const connection = () => ({
  id: randomUUID(),
  createdAt: new Date().toISOString(),
  name: 'Fixture',
  engine: 'postgresql' as const,
  host: 'localhost',
  port: 5432,
  database: 'fixture',
  username: 'reader',
  password: 'do-not-leak',
  color: 'teal' as const,
  environment: 'local' as const,
  tls: { enabled: false },
});
it('encrypts credentials, serializes concurrent writes and unlocks only with the original key', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'explorer-vault-'));
  const key = randomBytes(32);
  try {
    const repo = new EncryptedConnectionRepository(directory, key);
    await repo.initialize();
    const values = Array.from({ length: 10 }, connection);
    await Promise.all(values.map((v) => repo.save(v)));
    expect((await repo.all()).length).toBe(10);
    const file = await readFile(join(directory, 'connections.enc'));
    expect(file.includes(Buffer.from('do-not-leak'))).toBe(false);
    expect(file.includes(Buffer.from('Fixture'))).toBe(false);
    const reopened = new EncryptedConnectionRepository(directory, key);
    await reopened.initialize();
    expect(await reopened.find(values[0].id)).toEqual(values[0]);
    await expect(
      new EncryptedConnectionRepository(directory, randomBytes(32)).initialize(),
    ).rejects.toThrow('has not been overwritten');
    expect(await readFile(join(directory, 'connections.enc'))).toEqual(file);
    await repo.delete(values[0].id);
    expect(await repo.find(values[0].id)).toBeUndefined();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
it('does not create vault files when secure persistence is unavailable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'explorer-session-'));
  try {
    const repo = new EncryptedConnectionRepository(directory, randomBytes(32), false);
    await repo.initialize();
    await repo.save(connection());
    expect(await readdir(directory)).toEqual([]);
    expect((await repo.all()).length).toBe(1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
