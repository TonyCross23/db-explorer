import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const files = (await readdir('release'))
  .filter((name) => /\.(AppImage|deb|exe|dmg|zip)$/.test(name))
  .sort();
if (!files.length) throw new Error('No installers found. Package the application first.');
const lines = await Promise.all(
  files.map(
    async (file) =>
      createHash('sha256')
        .update(await readFile('release/' + file))
        .digest('hex') +
      '  ' +
      file,
  ),
);
await writeFile('release/SHA256SUMS.txt', lines.join('\n') + '\n');
console.log('Installer checksums generated.');
