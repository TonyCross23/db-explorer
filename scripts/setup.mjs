import { randomBytes } from 'node:crypto';
import { writeFile, readFile } from 'node:fs/promises';
try {
  await readFile('.env');
  console.log('Configuration already exists. It has not been changed.');
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
  await writeFile(
    '.env',
    `# Keep this file private. Back up the master key separately from data/.\nDB_EXPLORER_TOKEN=${randomBytes(32).toString('hex')}\nDB_EXPLORER_MASTER_KEY=${randomBytes(32).toString('base64')}\nHOST=127.0.0.1\nPORT=4317\nDB_EXPLORER_ORIGINS=http://127.0.0.1:5173\n`,
    { mode: 0o600, flag: 'wx' },
  );
  console.log(
    'Created .env with a unique access token and vault key. Read DB_EXPLORER_TOKEN from .env to unlock the web workspace.',
  );
}
