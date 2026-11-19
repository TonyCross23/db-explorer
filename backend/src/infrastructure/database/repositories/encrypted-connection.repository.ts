import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import type { ConnectionRepository } from '../../../domain/repositories/connection.repository';
import type { SavedConnection } from '../../../domain/entities/connection.entity';
export class EncryptedConnectionRepository implements ConnectionRepository {
  private values: SavedConnection[] = [];
  private queue: Promise<void> = Promise.resolve();
  constructor(
    private readonly directory: string,
    private readonly key: Buffer,
    private readonly persistent = true,
  ) {}
  async initialize() {
    if (!this.persistent) return;
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    try {
      const payload = await readFile(join(this.directory, 'connections.enc'));
      if (payload.length < 32 || payload.subarray(0, 4).toString() !== 'DBE1')
        throw new Error('Invalid vault header');
      const cipher = createDecipheriv('aes-256-gcm', this.key, payload.subarray(4, 16));
      cipher.setAuthTag(payload.subarray(16, 32));
      const value = JSON.parse(
        Buffer.concat([cipher.update(payload.subarray(32)), cipher.final()]).toString('utf8'),
      );
      if (!Array.isArray(value)) throw new Error('Invalid vault');
      this.values = value;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error(
          'Could not unlock connection vault. Restore the original master key; your vault has not been overwritten.',
        );
    }
  }
  async all() {
    await this.queue;
    return structuredClone(this.values);
  }
  async find(id: string) {
    return (await this.all()).find((c) => c.id === id);
  }
  private mutate(change: (values: SavedConnection[]) => SavedConnection[]) {
    const operation = this.queue.then(async () => {
      const next = change(structuredClone(this.values));
      if (this.persistent) {
        const iv = randomBytes(12),
          cipher = createCipheriv('aes-256-gcm', this.key, iv);
        const encrypted = Buffer.concat([
          cipher.update(JSON.stringify(next), 'utf8'),
          cipher.final(),
        ]);
        const payload = Buffer.concat([Buffer.from('DBE1'), iv, cipher.getAuthTag(), encrypted]);
        const temp = join(this.directory, 'connections.enc.tmp');
        await writeFile(temp, payload, { mode: 0o600 });
        await rename(temp, join(this.directory, 'connections.enc'));
      }
      this.values = next;
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
  save(value: SavedConnection) {
    return this.mutate((values) => [...values.filter((c) => c.id !== value.id), value]);
  }
  delete(id: string) {
    return this.mutate((values) => values.filter((c) => c.id !== id));
  }
}
