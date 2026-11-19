# API v1

The UI and API share an origin. All `/api/v1/*` routes require `Authorization: Bearer <workspace token>`. The workspace is single-user. Responses never return a database password, SSH password, private key, or key passphrase.

- `GET /api/health`: liveness, `{status:"ok"}`.
- `GET /api/config`: runtime mode, persistence availability, read-only flag, app version.
- `POST /api/session`: verify `{token}`. The frontend keeps the supplied token for subsequent bearer requests; this endpoint does not create a cookie session.
- `GET /api/v1/connections`: saved connection summaries, secrets redacted.
- `POST /api/v1/connections`: validate and save a connection. Returns its redacted summary, HTTP 201.
- `PATCH /api/v1/connections/:id`: replace editable configuration. An omitted database password preserves the saved one; `""` explicitly sets an empty database password. Re-enter SSH secrets when editing a tunneled connection.
- `DELETE /api/v1/connections/:id`: remove the saved profile/credentials; target database is untouched.
- `POST /api/v1/connections/test`: test an unsaved connection, returning database version on success.
- `POST /api/v1/connections/:id/test`: test saved configuration, or an edited full configuration. An omitted database password uses the saved one. Does not persist edits.
- `POST /api/v1/connections/ssh-fingerprint`: accepts SSH `{host,port}` and returns `{fingerprint}` before authentication. Requires the workspace bearer token. Users must verify the returned identity through a trusted channel.
- `POST /api/v1/connections/ssh-test`: validates SSH options and tests SSH authentication only, without database fields or a database connection. Returns `{ok:true}`, HTTP 201. Supports `auth: "agent" | "password" | "key"`; agent mode uses the backend machine's SSH agent and never forwards it to the SSH server.
- `GET /api/v1/connections/:id/tables`: visible tables/views and approximate row counts, not exact totals.
- `GET /api/v1/connections/:id/diagram?schema=...`: read-only schema metadata, with tables/columns/primary keys, ordered composite foreign-key columns, referential actions, truncation and external-target counts. Bounded to 100 tables, 5,000 columns and 2,000 foreign-key columns. Views are excluded.
- `GET /api/v1/connections/:id/rows`: accepts `schema`, `table`, `page`, `limit`, `search`, `searchColumn`, `sort`, and `direction`. Returns column metadata, bounded rows, pagination, query duration, parameterized query text, stable-order flag, and truncation flag.

Connection input: `name`, `engine` (`postgresql` or `mysql`), `host`, `port`, `database`, `username`, `password`; optional `color`, `environment`, `tls` (`enabled`, optional PEM `ca` and `serverName`), and `ssh` (`host`, `port`, `username`, `auth` set to `agent`, `password`, or `key`, matching `password` or `privateKey` plus optional `passphrase` for credential modes, and pinned `fingerprint`). Exact constraints/types live in `shared/src/index.ts`.

Row pages default to 100, maximum 1,000. Search is literal substring matching, case-insensitive in PostgreSQL; MySQL case behavior follows the column/database collation. Sort identifiers are validated. JSON numbers and big integers follow native-driver precision rules: int8 and DECIMAL are strings. Binary values and oversized text are previews. CSV exports contain only the visible page/preview values and protect against common formula prefixes.

Errors use `{error:{message,fields?,reason?}}`, with validation errors keyed by field paths. Expected statuses include 400 (input), 401 (unlock required), 404 (missing resource), 429 (rate limit), and 502 (database/SSH/TLS connection or timeout failure). Connection failures include a stable, sanitized `reason` such as `SSH_AUTH_FAILED`, `SSH_AGENT_UNAVAILABLE`, `SSH_AGENT_EMPTY`, `SSH_FORWARD_FAILED`, `DATABASE_AUTH_FAILED` or `TLS_HOSTNAME_MISMATCH`. Upstream messages and credentials are never echoed. Unknown errors are sanitized. Requests are not logged with bodies or credentials.
