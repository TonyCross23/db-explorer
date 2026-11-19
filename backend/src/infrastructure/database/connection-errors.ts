import { DatabaseUnavailableError } from '../../domain/errors';
import { SshConnectionError } from '../external-services/ssh-errors';
export type ConnectionStage = 'ssh-connect' | 'database-connect' | 'session-setup' | 'read-query';
export type FailureContext = {
  stage: ConnectionStage;
  ssh: boolean;
  container: boolean;
  host: string;
};
const sshMessages = {
  SSH_KEY_PASSPHRASE_REQUIRED:
    'This SSH key is encrypted. Enter its passphrase in SSH tunnel settings.',
  SSH_KEY_DECRYPT_FAILED:
    'The SSH key could not be unlocked. Check the key passphrase, or choose the matching private key file.',
  SSH_AGENT_UNAVAILABLE:
    'The SSH agent is unavailable to DB Explorer. Open or unlock your system SSH agent, or choose Password / Private key. In Docker, an agent socket must be explicitly connected to the backend.',
  SSH_AGENT_EMPTY:
    'Your SSH agent has no unlocked keys. Add or unlock your usual SSH key in the system agent, then try again. You can also choose Password / Private key.',
  SSH_KEY_INVALID:
    'This file could not be read as an SSH private key. Choose the private key (.pem or OpenSSH), not a public key or certificate.',
  SSH_HOST_KEY_MISMATCH:
    'The SSH server fingerprint does not match the saved fingerprint. Verify the server identity with your administrator before updating it.',
  SSH_AUTH_FAILED:
    'SSH sign-in failed. Check the SSH username and its password or private key. SSH credentials are separate from database credentials.',
  SSH_FORWARD_DENIED:
    'SSH sign-in succeeded, but the server does not allow TCP forwarding. Ask your server administrator to enable forwarding for this account.',
  SSH_FORWARD_FAILED:
    'SSH sign-in succeeded, but the SSH server could not reach the database host and port. Use the database address as seen from the SSH server; use 127.0.0.1 only if the database runs on that server.',
  SSH_DISCONNECTED:
    'The SSH connection closed before the database request completed. Check the SSH server and network, then try again.',
} satisfies Record<SshConnectionError['reason'], string>;
/** Curated messages only. Never return an upstream message containing credentials or SQL. */
export function connectionFailure(
  error: unknown,
  context: FailureContext,
): DatabaseUnavailableError {
  if (error instanceof SshConnectionError)
    return new DatabaseUnavailableError(sshMessages[error.reason], error.reason);
  const source =
    error && typeof error === 'object'
      ? (error as {
          code?: unknown;
          errno?: unknown;
          message?: unknown;
          level?: unknown;
          cause?: unknown;
          errors?: unknown[];
        })
      : {};
  if (source.cause) return connectionFailure(source.cause, context);
  if (Array.isArray(source.errors) && source.errors.length)
    return connectionFailure(source.errors[0], context);
  const code = typeof source.code === 'string' ? source.code : String(source.errno ?? '');
  const message = typeof source.message === 'string' ? source.message : '';
  const fail = (reason: string, text: string) => new DatabaseUnavailableError(text, reason);
  if (
    ['57014', 'PROTOCOL_SEQUENCE_TIMEOUT', 'ER_QUERY_TIMEOUT', 'ER_QUERY_INTERRUPTED'].includes(
      code,
    )
  )
    return fail(
      'QUERY_TIMEOUT',
      'The query exceeded its time limit. Narrow your filter and try again.',
    );
  if (code === 'ERR_TLS_CERT_ALTNAME_INVALID')
    return fail(
      'TLS_HOSTNAME_MISMATCH',
      'The database certificate does not match its hostname. Enter the certificate hostname under TLS / SSL → Server name. Certificate verification stays enabled.',
    );
  if (code === 'CERT_HAS_EXPIRED' || code === 'CERT_NOT_YET_VALID')
    return fail(
      'TLS_CERTIFICATE_DATE',
      'The database TLS certificate is expired or not valid yet. Check the system clock and ask your administrator for a valid certificate.',
    );
  if (
    [
      'DEPTH_ZERO_SELF_SIGNED_CERT',
      'SELF_SIGNED_CERT_IN_CHAIN',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      'UNABLE_TO_GET_ISSUER_CERT',
      'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
      'CERT_UNTRUSTED',
    ].includes(code)
  )
    return fail(
      'TLS_CA_UNTRUSTED',
      'The database TLS certificate is not trusted. Add your administrator’s CA certificate under TLS / SSL.',
    );
  if (/server does not support ssl/i.test(message))
    return fail(
      'TLS_NOT_SUPPORTED',
      'TLS is enabled, but this database endpoint does not support it. Confirm the correct database port and TLS settings with your administrator.',
    );
  if (
    code === 'ER_SECURE_TRANSPORT_REQUIRED' ||
    /no pg_hba.conf entry.*(?:no encryption|SSL off)/i.test(message)
  )
    return fail(
      'TLS_REQUIRED',
      'This database requires an encrypted connection. Enable TLS / SSL and configure its trusted certificate.',
    );
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN')
    return fail(
      context.stage === 'ssh-connect' ? 'SSH_HOST_NOT_FOUND' : 'DATABASE_HOST_NOT_FOUND',
      context.stage === 'ssh-connect'
        ? 'The SSH hostname could not be resolved. Check the SSH host and your DNS or VPN connection.'
        : 'The database hostname could not be resolved. Check the database host and the network available to DB Explorer.',
    );
  if (code === 'ECONNREFUSED') {
    if (context.stage === 'ssh-connect')
      return fail(
        'SSH_CONNECTION_REFUSED',
        'The SSH server refused the connection. Check the SSH host and SSH port (usually 22), and confirm the SSH service is running.',
      );
    if (
      context.container &&
      !context.ssh &&
      ['localhost', '127.0.0.1', '::1'].includes(context.host.toLowerCase())
    )
      return fail(
        'DOCKER_LOOPBACK',
        'The database refused the connection. In Docker, localhost is the app container. To reach a database on the Docker host, use host.docker.internal and a host interface reachable from Docker.',
      );
    return fail(
      'DATABASE_CONNECTION_REFUSED',
      'The database refused the connection. Check its host and database port (usually 5432 for PostgreSQL or 3306 for MySQL), and confirm the database is listening.',
    );
  }
  if (
    ['ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code) ||
    /timed out|timeout expired|connection timeout/i.test(message)
  )
    return fail(
      context.stage === 'ssh-connect' ? 'SSH_TIMEOUT' : 'DATABASE_TIMEOUT',
      context.stage === 'ssh-connect'
        ? 'The SSH server did not respond in time. Check its host, port, firewall and VPN connection.'
        : 'The database did not respond in time. Check its host, port, firewall and network access.',
    );
  if (context.stage === 'ssh-connect') {
    if (
      source.level === 'client-authentication' ||
      /authentication methods failed|authentication failed/i.test(message)
    )
      return new DatabaseUnavailableError(sshMessages.SSH_AUTH_FAILED, 'SSH_AUTH_FAILED');
    if (source.level === 'client-handshake' || /handshake failed|no matching/i.test(message))
      return fail(
        'SSH_HANDSHAKE_FAILED',
        'The SSH handshake failed. Check the SSH port and supported server algorithms with your administrator.',
      );
    return new DatabaseUnavailableError(sshMessages.SSH_DISCONNECTED, 'SSH_DISCONNECTED');
  }
  if (['28P01', '28000', 'ER_ACCESS_DENIED_ERROR'].includes(code) || source.errno === 1045)
    return fail(
      'DATABASE_AUTH_FAILED',
      'Database sign-in failed. Check the database username and password under General. These are separate from your SSH credentials.',
    );
  if (code === '3D000' || code === 'ER_BAD_DB_ERROR' || source.errno === 1049)
    return fail(
      'DATABASE_NOT_FOUND',
      'The selected database does not exist. Check the Database name under General.',
    );
  if (
    [
      '42501',
      'ER_TABLEACCESS_DENIED_ERROR',
      'ER_COLUMNACCESS_DENIED_ERROR',
      'ER_DBACCESS_DENIED_ERROR',
    ].includes(code)
  )
    return fail(
      'DATABASE_PERMISSION_DENIED',
      'The database account does not have permission to read this database or table. Ask your administrator for SELECT access.',
    );
  if (code === 'ER_UNKNOWN_SYSTEM_VARIABLE' && context.stage === 'session-setup')
    return fail(
      'DATABASE_VERSION_UNSUPPORTED',
      'This server does not support the required read-only session settings. Confirm the selected engine and server version; this version supports MySQL 8+ and PostgreSQL 14+.',
    );
  if (['ECONNRESET', 'EPIPE', 'PROTOCOL_CONNECTION_LOST', '08P01'].includes(code))
    return fail(
      'DATABASE_CONNECTION_CLOSED',
      'The database connection closed unexpectedly. Check the selected database engine, its port, TLS settings and network.',
    );
  if (context.stage === 'read-query')
    return fail(
      'DATABASE_READ_FAILED',
      'Connected to the database, but could not read this table. Check the account’s SELECT permissions and the table definition.',
    );
  if (context.stage === 'session-setup')
    return fail(
      'DATABASE_SESSION_FAILED',
      'Database sign-in succeeded, but the read-only session could not start. Check the server version and account restrictions with your administrator.',
    );
  return fail(
    'DATABASE_CONNECT_FAILED',
    'The database connection could not be established. Confirm the selected engine, database host, port and TLS settings.',
  );
}
