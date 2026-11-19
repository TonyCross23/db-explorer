import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtemp, access, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const name = 'db-explorer-smoke-' + randomBytes(4).toString('hex');
const image = process.argv[2] ?? 'db-explorer:ci';
const token = randomBytes(32).toString('hex');
const fixtures = process.env.DB_EXPLORER_INTEGRATION === '1';
const docker = (args) =>
  execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
let agentProcess;
let agentDirectory;
try {
  const agentArgs = [];
  if (process.platform === 'linux') {
    agentDirectory = await mkdtemp(join(tmpdir(), 'db-explorer-container-agent-'));
    const socket = join(agentDirectory, 'agent.sock');
    agentProcess = spawn('ssh-agent', ['-D', '-a', socket], { stdio: 'ignore' });
    let agentError;
    agentProcess.on('error', (error) => {
      agentError = error;
    });
    for (let attempt = 0; ; attempt++) {
      if (agentError) throw agentError;
      try {
        await access(socket);
        break;
      } catch {
        if (attempt >= 50) throw new Error('Disposable SSH agent did not start');
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    await chmod(socket, 0o660);
    assert.notEqual(process.getuid(), 0, 'Run the agent smoke test as a non-root user');
    // OpenSSH checks peer UID, in addition to socket permissions. Hosted runners use UID 1001.
    agentArgs.push(
      '--user',
      `${process.getuid()}:${process.getgid()}`,
      '-e',
      'DB_EXPLORER_DATA_DIR=/tmp/workspace',
      '--mount',
      `type=bind,src=${socket},dst=/run/db-explorer-agent.sock,readonly`,
      '-e',
      'SSH_AUTH_SOCK=/run/db-explorer-agent.sock',
    );
  }
  docker([
    'run',
    '-d',
    '--name',
    name,
    ...agentArgs,
    ...(fixtures ? ['--network', 'db-explorer-tests_default'] : []),
    '--read-only',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=32m',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges:true',
    '-e',
    'DB_EXPLORER_TOKEN=' + token,
    '-e',
    'DB_EXPLORER_MASTER_KEY=' + randomBytes(32).toString('base64'),
    '-p',
    '127.0.0.1::4317',
    image,
  ]);
  assert.notEqual(
    docker(['exec', name, 'node', '-p', 'process.getuid()']).trim(),
    '0',
    'Container must remain non-root',
  );
  const port = docker(['port', name, '4317/tcp']).trim().split(':').pop();
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(ready, 'Container did not become healthy');
  const root = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(root.status, 200);
  assert.match(await root.text(), /DB Explorer/);
  const protectedApi = await fetch(`http://127.0.0.1:${port}/api/v1/connections`);
  assert.equal(protectedApi.status, 401);
  if (agentProcess) {
    const probe = await fetch(`http://127.0.0.1:${port}/api/v1/connections/ssh-test`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host: '127.0.0.1',
        port: 22,
        username: 'fixture',
        auth: 'agent',
        fingerprint: 'SHA256:' + 'a'.repeat(43),
      }),
    });
    assert.equal(probe.status, 502);
    assert.equal((await probe.json()).error.reason, 'SSH_AGENT_EMPTY');
    console.log(
      'PASS Docker non-root access to disposable SSH-agent socket; empty-agent diagnostic',
    );
  }
  if (fixtures) {
    for (const engine of ['postgresql', 'mysql']) {
      const saved = await fetch(`http://127.0.0.1:${port}/api/v1/connections`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Container fixture',
          engine,
          host: engine === 'postgresql' ? 'postgres' : 'mysql',
          port: engine === 'postgresql' ? 5432 : 3306,
          database: 'explorer_test',
          username: 'reader',
          password: 'fixture_reader_only',
        }),
      });
      assert.equal(saved.status, 201);
      const connection = await saved.json();
      const rows = await fetch(
        `http://127.0.0.1:${port}/api/v1/connections/${connection.id}/rows?schema=${engine === 'postgresql' ? 'public' : 'explorer_test'}&table=customers&limit=2`,
        { headers: { Authorization: 'Bearer ' + token } },
      );
      assert.equal(rows.status, 200);
      assert.equal((await rows.json()).rows.length, 2);
      console.log('PASS Docker ' + engine + ' real data read');
    }
  }
  console.log('PASS Docker runtime, SPA, health and authenticated API');
} finally {
  try {
    docker(['rm', '-f', '-v', name]);
  } catch {}
  agentProcess?.kill();
  if (agentDirectory) await rm(agentDirectory, { recursive: true, force: true });
}
