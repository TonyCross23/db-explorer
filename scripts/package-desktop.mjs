import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { desktopBuildOptions } from './desktop-build-options.mjs';

const require = createRequire(import.meta.url);
const options = desktopBuildOptions(process.platform, process.env, process.argv.slice(2));
if (options.preview) {
  console.log('Building an ad-hoc signed macOS preview; publisher signing is not configured.');
}
const result = spawnSync(
  process.execPath,
  [require.resolve('electron-builder/cli.js'), ...options.args],
  { stdio: 'inherit', env: options.env },
);
if (result.error) {
  console.error('Could not start the desktop packager:', result.error.message);
}
process.exit(result.status ?? 1);
