import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  randomBytes,
  generateKeyPairSync,
  createHash,
  createPrivateKey,
  timingSafeEqual,
} from 'node:crypto';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
const require = createRequire(import.meta.url);
const { Server, utils } = require('ssh2');
const { bootstrap } = require('../backend/dist/main.js');
if (process.env.DB_EXPLORER_INTEGRATION !== '1')
  throw new Error(
    'Start the disposable compose.test.yaml fixtures and set DB_EXPLORER_INTEGRATION=1. No production database is used.',
  );
const directory = await mkdtemp(join(tmpdir(), 'explorer-integration-'));
const token = randomBytes(32).toString('hex');
const rsa = () =>
  generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
  }).privateKey;
const hostKey = rsa(),
  clientKey = rsa(),
  clientParsed = utils.parseKey(clientKey),
  hostParsed = utils.parseKey(hostKey);
const fingerprint =
  'SHA256:' +
  createHash('sha256').update(hostParsed.getPublicSSH()).digest('base64').replace(/=+$/, '');
const sshClients = new Set();
const ssh = new Server({ hostKeys: [hostKey] }, (client) => {
  sshClients.add(client);
  client.on('close', () => sshClients.delete(client));
  client.on('error', () => {});
  client.on('authentication', (ctx) => {
    if (ctx.username !== 'fixture') return ctx.reject();
    if (ctx.method === 'password' && ctx.password === 'ssh_fixture_password') return ctx.accept();
    if (
      ctx.method === 'publickey' &&
      ctx.key.data.equals(clientParsed.getPublicSSH()) &&
      (!ctx.signature || clientParsed.verify(ctx.blob, ctx.signature, ctx.hashAlgo) === true)
    )
      return ctx.accept();
    ctx.reject();
  });
  client.on('ready', () =>
    client.on('tcpip', (accept, reject, info) => {
      if (info.destIP !== '127.0.0.1' || ![55432, 53306].includes(info.destPort)) return reject();
      const upstream = net.connect(info.destPort, '127.0.0.1', () => {
        const channel = accept();
        channel.pipe(upstream).pipe(channel);
        channel.on('error', () => upstream.destroy());
      });
      upstream.on('error', () => reject());
    }),
  );
});
await new Promise((resolve, reject) => {
  ssh.once('error', reject);
  ssh.listen(0, '127.0.0.1', resolve);
});
const sshPort = ssh.address().port;
const app = await bootstrap({
  token,
  vaultKey: randomBytes(32),
  dataDir: directory,
  staticDir: resolve('frontend/dist'),
  port: 0,
  host: '127.0.0.1',
});
const base = 'http://127.0.0.1:' + app.getHttpServer().address().port;
let passed = 0;
let agentProcess;
const originalAgent = process.env.SSH_AUTH_SOCK;
const agentSocket = join(directory, 'agent.sock');
async function api(path, { method = 'GET', body, auth = true, status = 200, reason } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  assert.equal(response.status, status, path + ' status');
  const result = await response.json();
  if (reason) assert.equal(result.error?.reason, reason, path + ' safe reason');
  return result;
}
async function check(name, run) {
  await run();
  passed++;
  console.log('PASS ' + name);
}
const input = (engine) => ({
  name: 'Integration ' + engine,
  engine,
  host: '127.0.0.1',
  port: engine === 'mysql' ? 53306 : 55432,
  database: 'explorer_test',
  username: 'reader',
  password: 'fixture_reader_only',
});
try {
  agentProcess = spawn('ssh-agent', ['-D', '-a', agentSocket], { stdio: 'ignore' });
  let agentError;
  agentProcess.on('error', (error) => {
    agentError = error;
  });
  for (let attempt = 0; ; attempt++) {
    if (agentError) throw agentError;
    try {
      await access(agentSocket);
      break;
    } catch {
      if (attempt >= 50) throw new Error('Disposable SSH agent did not start');
      await delay(100);
    }
  }
  process.env.SSH_AUTH_SOCK = agentSocket;
  await check('SSH-only diagnostics distinguish unavailable and empty agents', async () => {
    const body = {
      host: '127.0.0.1',
      port: sshPort,
      username: 'fixture',
      auth: 'agent',
      fingerprint,
    };
    await api('/api/v1/connections/ssh-test', {
      method: 'POST',
      body,
      status: 502,
      reason: 'SSH_AGENT_EMPTY',
    });
    process.env.SSH_AUTH_SOCK = join(directory, 'missing.sock');
    try {
      await api('/api/v1/connections/ssh-test', {
        method: 'POST',
        body,
        status: 502,
        reason: 'SSH_AGENT_UNAVAILABLE',
      });
    } finally {
      process.env.SSH_AUTH_SOCK = agentSocket;
    }
    execFileSync('ssh-add', ['-'], {
      input: clientKey,
      env: { ...process.env, SSH_AUTH_SOCK: agentSocket },
      stdio: ['pipe', 'ignore', 'ignore'],
    });
    const result = await api('/api/v1/connections/ssh-test', { method: 'POST', body, status: 201 });
    assert.equal(result.ok, true);
    await api('/api/v1/connections/ssh-test', { method: 'POST', body, auth: false, status: 401 });
  });
  await check('authentication, health, invalid contracts and SPA isolation', async () => {
    const probe = await api('/api/v1/connections/ssh-fingerprint', {
      method: 'POST',
      body: { host: '127.0.0.1', port: sshPort },
      status: 201,
    });
    assert.equal(probe.fingerprint, fingerprint);
    await api('/api/v1/connections', { auth: false, status: 401 });
    await api('/api/health', { auth: false });
    await api('/api/session', {
      method: 'POST',
      body: { token: 'wrong' },
      auth: false,
      status: 401,
    });
    await api('/api/session', { method: 'POST', body: { token }, auth: false });
    await api('/api/v1/connections', { method: 'POST', body: { name: 'invalid' }, status: 400 });
    await api('/api/v1/missing', { status: 404 });
  });
  const certificate = await readFile('.test-tls/server.crt', 'utf8');
  for (const engine of ['postgresql', 'mysql']) {
    await check(engine + ' verified TLS and hostname mismatch rejection', async () => {
      await api('/api/v1/connections/test', {
        method: 'POST',
        body: {
          ...input(engine),
          tls: { enabled: true, ca: certificate, serverName: 'database.fixture' },
        },
        status: 201,
      });
      await api('/api/v1/connections/test', {
        method: 'POST',
        body: {
          ...input(engine),
          tls: { enabled: true, ca: certificate, serverName: 'wrong.fixture' },
        },
        status: 502,
      });
      await api('/api/v1/connections/test', {
        method: 'POST',
        body: { ...input(engine), tls: { enabled: true, serverName: 'database.fixture' } },
        status: 502,
      });
    });
    await check(
      engine + ' distinguishes SSH sign-in, key passphrase and database forwarding failures',
      async () => {
        const sshOptions = {
          host: '127.0.0.1',
          port: sshPort,
          username: 'fixture',
          auth: 'password',
          password: 'ssh_fixture_password',
          fingerprint,
        };
        await api('/api/v1/connections/test', {
          method: 'POST',
          body: { ...input(engine), password: 'wrong_database_password' },
          status: 502,
          reason: 'DATABASE_AUTH_FAILED',
        });
        await api('/api/v1/connections/test', {
          method: 'POST',
          body: { ...input(engine), ssh: { ...sshOptions, password: 'wrong_ssh_password' } },
          status: 502,
          reason: 'SSH_AUTH_FAILED',
        });
        const encryptedKey = createPrivateKey(clientKey)
          .export({
            type: 'pkcs1',
            format: 'pem',
            cipher: 'aes-256-cbc',
            passphrase: 'fixture_passphrase',
          })
          .toString();
        for (const [passphrase, reason] of [
          [undefined, 'SSH_KEY_PASSPHRASE_REQUIRED'],
          ['wrong', 'SSH_KEY_DECRYPT_FAILED'],
        ])
          await api('/api/v1/connections/test', {
            method: 'POST',
            body: {
              ...input(engine),
              ssh: { ...sshOptions, auth: 'key', privateKey: encryptedKey, passphrase },
            },
            status: 502,
            reason,
          });
        await api('/api/v1/connections/test', {
          method: 'POST',
          body: {
            ...input(engine),
            ssh: { ...sshOptions, auth: 'key', privateKey: 'not a private key' },
          },
          status: 502,
          reason: 'SSH_KEY_INVALID',
        });
        await api('/api/v1/connections/test', {
          method: 'POST',
          body: { ...input(engine), port: 1, ssh: sshOptions },
          status: 502,
          reason: 'SSH_FORWARD_FAILED',
        });
      },
    );
    let id;
    await check(engine + ' connection, metadata and secret redaction', async () => {
      const tested = await api('/api/v1/connections/test', {
        method: 'POST',
        body: input(engine),
        status: 201,
      });
      assert.ok(tested.version);
      const saved = await api('/api/v1/connections', {
        method: 'POST',
        body: input(engine),
        status: 201,
      });
      id = saved.id;
      assert.equal(saved.password, undefined);
      assert.equal(saved.hasPassword, true);
      const tables = await api(`/api/v1/connections/${id}/tables`);
      assert.ok(tables.some((t) => t.name === 'customers'));
      assert.ok(tables.some((t) => t.type === 'view'));
    });
    const schema = engine === 'postgresql' ? 'public' : 'explorer_test';
    await check(
      engine + ' automatic ERD preserves composite, self and quoted foreign keys',
      async () => {
        const diagram = await api(`/api/v1/connections/${id}/diagram?schema=${schema}`);
        assert.equal(diagram.truncated, false);
        assert.equal(diagram.externalRelationships, 0);
        assert.ok(
          diagram.tables.find((t) => t.name === 'customers').columns.find((c) => c.name === 'id')
            .primaryKey,
        );
        assert.ok(
          !diagram.tables.some((t) => t.name === 'active_customers' || t.name === 'customer_names'),
        );
        assert.equal(
          diagram.relationships.find((r) => r.name === 'lines_order_fk').onDelete,
          'CASCADE',
        );
        const composite = diagram.relationships.find((r) => r.name === 'notes_line_fk');
        assert.deepEqual(composite.from.columns, ['order_id', 'line_no']);
        assert.deepEqual(composite.to.columns, ['order_id', 'line_no']);
        assert.equal(composite.to.table, 'order_lines');
        const self = diagram.relationships.find((r) => r.name === 'orders_parent_fk');
        assert.equal(self.from.table, self.to.table);
        assert.ok(
          diagram.relationships.some(
            (r) => r.from.table === 'order links' && r.to.table === 'customers',
          ),
        );
        await api(`/api/v1/connections/${id}/diagram`, { status: 400 });
        if (engine === 'mysql')
          await api(`/api/v1/connections/${id}/diagram?schema=another_database`, { status: 400 });
        else
          assert.equal(
            (
              await api(
                `/api/v1/connections/${id}/diagram?schema=` +
                  encodeURIComponent("public' OR 1=1 --"),
              )
            ).tables.length,
            0,
          );
      },
    );
    await check(engine + ' pagination, exact integers, nulls and bound search', async () => {
      const path = `/api/v1/connections/${id}/rows?schema=${schema}&table=customers&limit=2`;
      const first = await api(path);
      assert.equal(first.rows.length, 2);
      assert.equal(first.hasMore, true);
      assert.equal(first.stableOrder, true);
      assert.ok(first.columns.find((c) => c.name === 'id').primaryKey);
      const second = await api(path + '&page=2');
      assert.notEqual(first.rows[0].id, second.rows[0].id);
      const large = await api(path + '&search=9007199254740993&searchColumn=id');
      assert.equal(large.rows[0].id, '9007199254740993');
      const quoted = await api(
        `/api/v1/connections/${id}/rows?schema=${schema}&table=odd%20table&search=100%25_literal`,
      );
      assert.equal(quoted.rows.length, 1);
      assert.equal(quoted.stableOrder, false);
      const attack = await api(
        path + '&search=' + encodeURIComponent("' OR 1=1; DROP TABLE customers; --"),
      );
      assert.equal(attack.rows.length, 0);
      await api(path + '&sort=missing', { status: 400 });
      await api(path + '&limit=1001', { status: 400 });
    });
    await check(engine + ' save without exposing or replacing a saved password', async () => {
      await api('/api/v1/connections/' + id, {
        method: 'PATCH',
        body: { ...input(engine), name: 'Renamed', password: undefined },
      });
      await api('/api/v1/connections/' + id + '/test', { method: 'POST', status: 201 });
      await api('/api/v1/connections/' + id + '/test', {
        method: 'POST',
        body: { ...input(engine), password: undefined, port: 1 },
        status: 502,
      });
    });
    for (const auth of ['password', 'key', 'agent'])
      await check(engine + ' SSH ' + auth + ' authentication', async () => {
        const privateKey = createPrivateKey(clientKey)
          .export({
            type: 'pkcs1',
            format: 'pem',
            cipher: 'aes-256-cbc',
            passphrase: 'key_fixture_passphrase',
          })
          .toString();
        await api('/api/v1/connections/test', {
          method: 'POST',
          body: {
            ...input(engine),
            tls: { enabled: true, ca: certificate, serverName: 'database.fixture' },
            ssh: {
              host: '127.0.0.1',
              port: sshPort,
              username: 'fixture',
              auth,
              password: auth === 'password' ? 'ssh_fixture_password' : undefined,
              privateKey: auth === 'key' ? privateKey : undefined,
              passphrase: 'key_fixture_passphrase',
              fingerprint,
            },
          },
          status: 201,
        });
      });
    await check(
      engine + ' rejects changed SSH identity and removes saved credentials',
      async () => {
        await api('/api/v1/connections/test', {
          method: 'POST',
          body: {
            ...input(engine),
            tls: { enabled: true, ca: certificate, serverName: 'database.fixture' },
            ssh: {
              host: '127.0.0.1',
              port: sshPort,
              username: 'fixture',
              auth: 'password',
              password: 'ssh_fixture_password',
              fingerprint: 'SHA256:' + 'x'.repeat(43),
            },
          },
          status: 502,
        });
        await api('/api/v1/connections/' + id, { method: 'DELETE' });
        await api('/api/v1/connections/' + id + '/tables', { status: 404 });
      },
    );
  }
  console.log(`${passed} integration scenarios passed.`);
} finally {
  if (originalAgent === undefined) delete process.env.SSH_AUTH_SOCK;
  else process.env.SSH_AUTH_SOCK = originalAgent;
  agentProcess?.kill();
  await app.close();
  for (const client of sshClients) client.end();
  await new Promise((resolve) => ssh.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
