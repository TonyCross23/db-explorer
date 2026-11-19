export type SshFailureReason =
  | 'SSH_KEY_PASSPHRASE_REQUIRED'
  | 'SSH_KEY_DECRYPT_FAILED'
  | 'SSH_KEY_INVALID'
  | 'SSH_AGENT_UNAVAILABLE'
  | 'SSH_AGENT_EMPTY'
  | 'SSH_HOST_KEY_MISMATCH'
  | 'SSH_AUTH_FAILED'
  | 'SSH_FORWARD_DENIED'
  | 'SSH_FORWARD_FAILED'
  | 'SSH_DISCONNECTED';
export class SshConnectionError extends Error {
  constructor(public readonly reason: SshFailureReason) {
    super(reason);
  }
}
