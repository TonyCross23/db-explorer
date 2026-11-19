import type {
  ConnectionInput,
  SshOptions,
  ConnectionUpdate,
  ConnectionSummary,
  TableInfo,
  RowResult,
  RowQuery,
  SchemaDiagram,
} from '@db-explorer/shared';
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}
let token = sessionStorage.getItem('db-explorer-session') ?? '';
export function setToken(value: string) {
  token = value;
  if (value) sessionStorage.setItem('db-explorer-session', value);
  else sessionStorage.removeItem('db-explorer-session');
}
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api' + path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...options.headers,
      },
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('The workspace is unavailable. Make sure DB Explorer is running.', 0);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      body.error?.message ?? 'The request could not be completed.',
      response.status,
      body.error?.fields,
    );
  return body as T;
}
export const api = {
  testSsh: (options: SshOptions) =>
    request<{ ok: true }>('/v1/connections/ssh-test', {
      method: 'POST',
      body: JSON.stringify(options),
    }),
  fingerprint: (host: string, port: number) =>
    request<{ fingerprint: string }>('/v1/connections/ssh-fingerprint', {
      method: 'POST',
      body: JSON.stringify({ host, port }),
    }),
  config: () =>
    request<{ mode: 'desktop' | 'web'; persistent: boolean; readOnly: boolean; version: string }>(
      '/config',
    ),
  unlock: async (value: string) => {
    await request('/session', { method: 'POST', body: JSON.stringify({ token: value }) });
    setToken(value);
  },
  list: () => request<ConnectionSummary[]>('/v1/connections'),
  create: (value: ConnectionInput) =>
    request<ConnectionSummary>('/v1/connections', { method: 'POST', body: JSON.stringify(value) }),
  update: (id: string, value: ConnectionUpdate) =>
    request<ConnectionSummary>('/v1/connections/' + id, {
      method: 'PATCH',
      body: JSON.stringify(value),
    }),
  remove: (id: string) => request('/v1/connections/' + id, { method: 'DELETE' }),
  test: (value: ConnectionInput) =>
    request<{ version: string }>('/v1/connections/test', {
      method: 'POST',
      body: JSON.stringify(value),
    }),
  testSaved: (id: string, value?: ConnectionUpdate) =>
    request<{ version: string }>('/v1/connections/' + id + '/test', {
      method: 'POST',
      body: value ? JSON.stringify(value) : undefined,
    }),
  tables: (id: string) => request<TableInfo[]>('/v1/connections/' + id + '/tables'),
  diagram: (id: string, schema: string) =>
    request<SchemaDiagram>('/v1/connections/' + id + '/diagram?' + new URLSearchParams({ schema })),
  rows: (id: string, query: RowQuery) => {
    const params = new URLSearchParams(
      Object.entries(query)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)]),
    );
    return request<RowResult>('/v1/connections/' + id + '/rows?' + params);
  },
};
