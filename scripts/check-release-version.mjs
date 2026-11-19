import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root = JSON.parse(await readFile('package.json', 'utf8'));
for (const name of ['backend', 'frontend', 'shared'])
  assert.equal(
    JSON.parse(await readFile(name + '/package.json', 'utf8')).version,
    root.version,
    `${name} version must match the root`,
  );
if (process.env.GITHUB_REF_TYPE === 'tag')
  assert.equal(
    process.env.GITHUB_REF_NAME,
    'v' + root.version,
    'Release tag must match package version',
  );
console.log('Release versions match.');
