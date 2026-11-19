import { describe, it, expect } from 'vitest';
import {
  connectionFailure,
  type FailureContext,
} from '../../backend/src/infrastructure/database/connection-errors';
import { SshConnectionError } from '../../backend/src/infrastructure/external-services/ssh-errors';
const context: FailureContext = {
  stage: 'database-connect',
  ssh: false,
  container: false,
  host: 'localhost',
};
describe('safe connection diagnostics', () => {
  it.each([
    [{ code: '28P01' }, 'DATABASE_AUTH_FAILED'],
    [{ code: 'ER_ACCESS_DENIED_ERROR' }, 'DATABASE_AUTH_FAILED'],
    [{ code: '3D000' }, 'DATABASE_NOT_FOUND'],
    [{ code: 'ER_BAD_DB_ERROR' }, 'DATABASE_NOT_FOUND'],
    [{ code: 'ERR_TLS_CERT_ALTNAME_INVALID' }, 'TLS_HOSTNAME_MISMATCH'],
    [{ code: 'SELF_SIGNED_CERT_IN_CHAIN' }, 'TLS_CA_UNTRUSTED'],
    [{ code: 'CERT_HAS_EXPIRED' }, 'TLS_CERTIFICATE_DATE'],
    [{ code: 'ECONNREFUSED' }, 'DATABASE_CONNECTION_REFUSED'],
    [{ code: 'EAI_AGAIN' }, 'DATABASE_HOST_NOT_FOUND'],
    [{ code: '42501' }, 'DATABASE_PERMISSION_DENIED'],
    [{ code: '57014' }, 'QUERY_TIMEOUT'],
  ])('classifies driver failure %j without echoing its message', (input, reason) => {
    const error = connectionFailure(
      { ...input, message: 'password=never-expose privateKey=never-expose' },
      context,
    );
    expect(error.reason).toBe(reason);
    expect(error.message).not.toContain('never-expose');
  });
  it('distinguishes SSH sign-in from database sign-in', () => {
    const ssh = connectionFailure(
      { level: 'client-authentication', message: 'All configured authentication methods failed' },
      { ...context, ssh: true, stage: 'ssh-connect' },
    );
    expect(ssh.reason).toBe('SSH_AUTH_FAILED');
    expect(ssh.message).toContain('SSH username');
  });
  it('explains which localhost Docker can reach without mislabeling an SSH target', () => {
    expect(
      connectionFailure({ code: 'ECONNREFUSED' }, { ...context, container: true }).reason,
    ).toBe('DOCKER_LOOPBACK');
    expect(
      connectionFailure({ code: 'ECONNREFUSED' }, { ...context, container: true, ssh: true })
        .reason,
    ).toBe('DATABASE_CONNECTION_REFUSED');
  });
  it('preserves the actual SSH forwarding failure rather than a secondary socket reset', () => {
    const error = connectionFailure(new SshConnectionError('SSH_FORWARD_FAILED'), {
      ...context,
      ssh: true,
    });
    expect(error.reason).toBe('SSH_FORWARD_FAILED');
    expect(error.message).toContain('as seen from the SSH server');
  });
  it('differentiates a missing passphrase, wrong passphrase, invalid key and host identity mismatch', () => {
    for (const reason of [
      'SSH_KEY_PASSPHRASE_REQUIRED',
      'SSH_KEY_DECRYPT_FAILED',
      'SSH_KEY_INVALID',
      'SSH_HOST_KEY_MISMATCH',
    ] as const)
      expect(connectionFailure(new SshConnectionError(reason), context).reason).toBe(reason);
  });
  it('handles aggregate network errors and never sends unknown upstream text to the client', () => {
    expect(connectionFailure(new AggregateError([{ code: 'ECONNREFUSED' }]), context).reason).toBe(
      'DATABASE_CONNECTION_REFUSED',
    );
    const error = connectionFailure(new Error('SELECT secret; password=sensitive'), {
      ...context,
      stage: 'read-query',
    });
    expect(error.reason).toBe('DATABASE_READ_FAILED');
    expect(error.message).not.toContain('sensitive');
    expect(error.message).not.toContain('SELECT secret');
  });
});
