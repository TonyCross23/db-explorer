import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const directory = await mkdtemp(join(tmpdir(), 'db-explorer-desktop-check-'));
let instance;
const executable =
  process.platform === 'darwin'
    ? `release/${process.arch === 'arm64' ? 'mac-arm64' : 'mac'}/DB Explorer.app/Contents/MacOS/DB Explorer`
    : process.platform === 'win32'
      ? 'release/win-unpacked/DB Explorer.exe'
      : 'release/linux-unpacked/db-explorer';
try {
  instance = await electron.launch({
    executablePath: resolve(process.argv[2] ?? executable),
    args: [
      ...(process.platform === 'linux' ? ['--password-store=basic'] : []),
      ...(process.env.DB_EXPLORER_TEST_NO_SANDBOX === '1' ? ['--no-sandbox'] : []),
    ],
    env: { ...process.env, DB_EXPLORER_PROFILE_DIR: directory },
    timeout: 20000,
  });
  const page = await instance.firstWindow({ timeout: 20000 });
  await expect(page.getByRole('heading', { name: 'Your databases.' })).toBeVisible({
    timeout: 20000,
  });
  await expect(page.getByRole('button', { name: 'Add a connection' })).toBeVisible();
  if (process.platform === 'linux')
    await expect(
      page.getByText('Your system keychain is unavailable.', { exact: false }),
    ).toBeVisible();
  const config = await page.evaluate(async () => fetch('/api/config').then((r) => r.json()));
  expect(config.mode).toBe('desktop');
  expect(typeof config.persistent).toBe('boolean');
  if (process.platform === 'linux') expect(config.persistent).toBe(false);
  const noToken = await page.evaluate(async () =>
    fetch('/api/v1/connections').then((r) => r.status),
  );
  expect(noToken).toBe(401);
  const preferences = await instance.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    return w.webContents.getLastWebPreferences();
  });
  expect(preferences.nodeIntegration).toBe(false);
  expect(preferences.contextIsolation).toBe(true);
  expect(preferences.sandbox).toBe(true);
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/desktop-startup.png' });
  console.log(
    'PASS packaged desktop: automatic backend, automatic unlock, isolated renderer and protected API',
  );
} finally {
  if (instance) await instance.close();
  await rm(directory, { recursive: true, force: true });
}
