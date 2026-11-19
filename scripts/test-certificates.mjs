import { mkdir, access, chmod } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
await mkdir('.test-tls', { recursive: true });
try {
  await access('.test-tls/server.crt');
} catch {
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      '.test-tls/server.key',
      '-out',
      '.test-tls/server.crt',
      '-days',
      '3',
      '-subj',
      '/CN=database.fixture',
      '-addext',
      'subjectAltName=DNS:database.fixture,DNS:localhost,IP:127.0.0.1',
    ],
    { stdio: 'ignore' },
  );
}
// Synthetic short-lived test credentials, readable by isolated fixture containers.
await chmod('.test-tls/server.key', 0o644);
console.log('Disposable TLS fixtures ready. Never use these certificates outside tests.');
