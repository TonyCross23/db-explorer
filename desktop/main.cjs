const { app, BrowserWindow, Menu, safeStorage, dialog, session, shell } = require('electron');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
let backend,
  window,
  baseUrl,
  sessionToken,
  closing = false;
if (process.env.DB_EXPLORER_PROFILE_DIR)
  app.setPath('userData', path.resolve(process.env.DB_EXPLORER_PROFILE_DIR));
const single = app.requestSingleInstanceLock();
if (!single) app.quit();
else {
  app.on('second-instance', () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    }
  });
  app
    .whenReady()
    .then(start)
    .catch(() => {
      dialog.showErrorBox(
        'DB Explorer could not open',
        'The workspace could not start. Check that your system keychain is unlocked and your app data is accessible. Your saved connections have not been overwritten.',
      );
      app.quit();
    });
}
async function protectKey(directory) {
  let available =
    typeof safeStorage.isAsyncEncryptionAvailable === 'function'
      ? await safeStorage.isAsyncEncryptionAvailable()
      : safeStorage.isEncryptionAvailable();
  if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')
    available = false;
  if (!available) return { key: randomBytes(32), persistent: false };
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const keyfile = path.join(directory, 'master-key.protected');
  const decrypt = async (bytes) =>
    typeof safeStorage.decryptStringAsync === 'function'
      ? (await safeStorage.decryptStringAsync(bytes)).result
      : safeStorage.decryptString(bytes);
  const encrypt = async (text) =>
    typeof safeStorage.encryptStringAsync === 'function'
      ? safeStorage.encryptStringAsync(text)
      : safeStorage.encryptString(text);
  try {
    const key = Buffer.from(await decrypt(await fs.readFile(keyfile)), 'base64');
    if (key.length !== 32) throw new Error('Invalid key');
    return { key, persistent: true };
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    const key = randomBytes(32);
    await fs.writeFile(keyfile, await encrypt(key.toString('base64')), { mode: 0o600, flag: 'wx' });
    return { key, persistent: true };
  }
}
async function start() {
  const directory = path.join(app.getPath('userData'), 'workspace');
  const vault = await protectKey(directory);
  sessionToken = randomBytes(32).toString('hex');
  const { bootstrap } = require('../dist/server.cjs');
  backend = await bootstrap({
    token: sessionToken,
    vaultKey: vault.key,
    persistent: vault.persistent,
    dataDir: directory,
    staticDir: path.join(__dirname, '../frontend/dist'),
    host: '127.0.0.1',
    port: 0,
    mode: 'desktop',
  });
  const address = backend.getHttpServer().address();
  baseUrl = `http://127.0.0.1:${address.port}`;
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(false),
  );
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    {
      label: 'Workspace',
      submenu: [
        {
          label: 'Open in browser',
          click: () => shell.openExternal(baseUrl + '/#session=' + sessionToken),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}
function createWindow() {
  window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 850,
    minHeight: 640,
    title: 'DB Explorer',
    backgroundColor: '#111820',
    icon: path.join(__dirname, '../frontend/public/icons/icon-512.png'),
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== baseUrl) event.preventDefault();
  });
  window.once('ready-to-show', () => window.show());
  void window.loadURL(baseUrl + '/#session=' + sessionToken);
}
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', (event) => {
  if (backend && !closing) {
    event.preventDefault();
    closing = true;
    Promise.race([backend.close(), new Promise((resolve) => setTimeout(resolve, 3000))]).finally(
      () => app.exit(0),
    );
  }
});
