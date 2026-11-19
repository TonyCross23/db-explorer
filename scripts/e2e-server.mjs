import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
const require = createRequire(import.meta.url);
const { bootstrap } = require('../backend/dist/main.js');
const directory = await mkdtemp(join(tmpdir(), 'explorer-browser-'));
const app = await bootstrap({
  token: 'browser-test-token-never-for-production',
  vaultKey: randomBytes(32),
  dataDir: directory,
  staticDir: resolve('frontend/dist'),
  port: 4318,
  host: '127.0.0.1',
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
    process.exit(0);
  });
