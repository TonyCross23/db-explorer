import type { SshOptions } from '@db-explorer/shared';
import { api, ApiError } from '../../infrastructure/api/explorer.api';
import type { ConnectionInput, ConnectionUpdate } from '../../domain/database.model';
export { ApiError as ConnectionCommandError };
export const connectionCommands = {
  create: (input: ConnectionInput) => api.create(input),
  update: (id: string, input: ConnectionUpdate) => api.update(id, input),
  test: (input: ConnectionInput) => api.test(input),
  testSaved: (id: string, input: ConnectionUpdate) => api.testSaved(id, input),
  testSsh: (input: SshOptions) => api.testSsh(input),
  fingerprint: (host: string, port: number) => api.fingerprint(host, port),
};
