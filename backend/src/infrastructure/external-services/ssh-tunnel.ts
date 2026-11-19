import { Client, createAgent, utils } from 'ssh2';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, type Socket } from 'node:net';
import type { ConnectionInput, SshOptions } from '@db-explorer/shared';
import { SshConnectionError } from './ssh-errors';

export async function connectSsh(config: SshOptions): Promise<Client> {
  let agent: string | undefined;
  if (config.auth === 'agent') {
    agent =
      process.env.SSH_AUTH_SOCK ||
      (process.platform === 'win32' ? String.raw`\\.\pipe\openssh-ssh-agent` : undefined);
    if (!agent) throw new SshConnectionError('SSH_AGENT_UNAVAILABLE');
    const available = createAgent(agent);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new SshConnectionError('SSH_AGENT_UNAVAILABLE')), 5000);
      available.getIdentities((error, keys) => {
        clearTimeout(timer);
        if (error) reject(new SshConnectionError('SSH_AGENT_UNAVAILABLE'));
        else if (!keys?.length) reject(new SshConnectionError('SSH_AGENT_EMPTY'));
        else resolve();
      });
    });
  }
  if (config.auth === 'key') {
    const parsed = utils.parseKey(config.privateKey ?? '', config.passphrase);
    if (parsed instanceof Error) {
      const encrypted = /encrypted|passphrase|decrypt/i.test(parsed.message);
      throw new SshConnectionError(
        encrypted
          ? config.passphrase
            ? 'SSH_KEY_DECRYPT_FAILED'
            : 'SSH_KEY_PASSPHRASE_REQUIRED'
          : 'SSH_KEY_INVALID',
      );
    }
  }
  const client = new Client();
  let mismatch = false;
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        client.destroy();
        reject(new Error('SSH connection timed out'));
      }, 12000);
      client.once('ready', () => {
        clearTimeout(timer);
        resolve();
      });
      client.on('error', (error: unknown) => {
        clearTimeout(timer);
        reject(mismatch ? new SshConnectionError('SSH_HOST_KEY_MISMATCH') : error);
      });
      client.once('close', () => {
        clearTimeout(timer);
        reject(new SshConnectionError('SSH_DISCONNECTED'));
      });
      client.connect({
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.auth === 'password' ? config.password : undefined,
        privateKey: config.auth === 'key' ? config.privateKey : undefined,
        passphrase: config.passphrase,
        agent: config.auth === 'agent' ? agent : undefined,
        agentForward: false,
        readyTimeout: 12000,
        keepaliveInterval: 10000,
        hostVerifier: (key: Buffer) => {
          const actual = Buffer.from(
              'SHA256:' + createHash('sha256').update(key).digest('base64').replace(/=+$/, ''),
            ),
            expected = Buffer.from(config.fingerprint);
          mismatch = actual.length !== expected.length || !timingSafeEqual(actual, expected);
          return !mismatch;
        },
      });
    });
    return client;
  } catch (error) {
    client.destroy();
    throw error;
  }
}

/** Use real loopback sockets so native driver/TLS behavior stays unchanged. */
export async function openTunnel(
  c: ConnectionInput,
): Promise<{ host: string; port: number; close: () => void; failure: () => unknown }> {
  if (!c.ssh) return { host: c.host, port: c.port, close: () => {}, failure: () => undefined };
  const client = await connectSsh(c.ssh);
  let failure: unknown;
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('error', () => socket.destroy());
    socket.on('close', () => sockets.delete(socket));
    const timer = setTimeout(() => {
      failure ??= new SshConnectionError('SSH_FORWARD_FAILED');
      socket.destroy();
    }, 10000);
    client.forwardOut('127.0.0.1', 0, c.host, c.port, (error, channel) => {
      clearTimeout(timer);
      if (error)
        failure = new SshConnectionError(
          (error as Error & { reason?: number }).reason === 1
            ? 'SSH_FORWARD_DENIED'
            : 'SSH_FORWARD_FAILED',
        );
      if (error || socket.destroyed) {
        channel?.destroy();
        socket.destroy();
        return;
      }
      channel.on('error', () => socket.destroy());
      socket.on('close', () => channel.destroy());
      channel.pipe(socket).pipe(channel);
    });
  });
  const close = () => {
    for (const socket of sockets) socket.destroy();
    server.close();
    client.destroy();
  };
  client.on('error', (error) => {
    failure ??= error;
    for (const socket of sockets) socket.destroy();
  });
  client.on('close', () => {
    if (sockets.size) failure ??= new SshConnectionError('SSH_DISCONNECTED');
    for (const socket of sockets) socket.destroy();
  });
  server.on('error', () => {
    for (const socket of sockets) socket.destroy();
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Tunnel could not listen');
    return { host: '127.0.0.1', port: address.port, close, failure: () => failure };
  } catch (error) {
    close();
    throw error;
  }
}

export async function inspectSshFingerprint(host: string, port: number): Promise<string> {
  const client = new Client();
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        client.destroy();
        reject(new Error('SSH handshake timed out'));
      }
    }, 10000);
    client.on('error', (error: unknown) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    });
    client.connect({
      host,
      port,
      username: 'db-explorer-host-check',
      readyTimeout: 10000,
      hostVerifier: (key: Buffer) => {
        const fingerprint =
          'SHA256:' + createHash('sha256').update(key).digest('base64').replace(/=+$/, '');
        settled = true;
        clearTimeout(timer);
        resolve(fingerprint);
        setImmediate(() => client.destroy());
        return false;
      },
    });
  });
}
