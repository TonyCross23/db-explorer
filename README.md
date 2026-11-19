# DB Explorer

A focused, TablePlus-inspired **read-only** workspace for PostgreSQL and MySQL. Built with Vue 3, NestJS, shared Zod schemas, and Electron. Available as an install-and-use desktop app and a Docker-hosted web/PWA app.

## For end users

Install the package for your operating system and open **DB Explorer**. No Node.js, Docker, database drivers, helper installation, access token, or terminal commands are required on desktop.

1. Choose **Add a connection** and select PostgreSQL or MySQL.
2. Enter your database host, port, database, username, and password. Use an account granted SELECT access only.
3. If required, enable **SSH tunnel**. Choose **Use SSH agent** to use your already unlocked system keys without entering a password or copying a key file into the app. Password and private key (`.pem` / OpenSSH) modes are also available; encrypted keys support a passphrase. Use **Test SSH sign-in** to check server access separately from database sign-in. Fetch the host fingerprint and compare it with your server administrator’s verified fingerprint before connecting.
4. Enable **TLS / SSL** if your database requires it. Certificate verification is always on; private CAs can be supplied as PEM text.
5. Test the connection, then save and browse tables. Search, sort, inspect structure, and export the visible page as CSV. Double-click a cell to inspect/copy its value.

The desktop app starts its local backend automatically and unlocks your workspace. Secrets are encrypted; the encryption key is protected by your operating system keychain. If a secure keychain is unavailable, the app offers session-only use and tells you that connections will not persist.

**Localhost on desktop means your own computer.** Remote databases require network access, VPN, or SSH. Local databases can be used without internet. The app does not copy entire databases into browser storage.

## Schema diagrams and appearance

After connecting, choose **Schema diagram** in the sidebar or top tab. Select a schema to generate an ER diagram from the database's declared primary and foreign keys. Composite and self-referencing keys are preserved. Select a table for all columns and relationship details; double-click it to browse data. Drag tables to arrange them, drag the background to pan, or use zoom/fit controls. Search by table name to focus the diagram. Cross-schema targets are listed in table details.

Diagrams read metadata only, with limits of 100 tables, 5,000 columns and 2,000 foreign-key columns per schema. Omitted metadata is marked. Views are excluded. Column names alone do not establish relationships, so schemas without declared foreign keys have no relationship lines.

Use the visible **Light mode / Dark mode** button in the top right. Under **Workspace settings → Text size**, choose Comfortable, Large or Extra large. Preferences persist on this device/browser. The default interface text is larger than the first release.

## Developer quick start

Node.js 24 and npm are needed only for development/building. Use the lockfile.

```sh
npm ci --ignore-scripts
npm run setup
npm run dev
```

Open `http://127.0.0.1:5173`. Read your web access token from `.env` to unlock the workspace. Keep `.env` private. The developer server uses the same API via its proxy.

For the built web app:

```sh
npm run build
npm start
```

Open `http://127.0.0.1:4317`.

For desktop development:

```sh
node node_modules/electron/install.js
npm run desktop
```

## Run with Docker

With Node available, `npm run setup` generates the two secrets. On a server without Node, use `openssl rand -hex 32` for `DB_EXPLORER_TOKEN` and `openssl rand -base64 32` for `DB_EXPLORER_MASTER_KEY`, then put them in a private `.env` based on `.env.example`.

```sh
docker compose up -d --build
```

Open `http://127.0.0.1:4317`, then enter `DB_EXPLORER_TOKEN` from `.env`. Docker serves the frontend and API together. Connection settings persist in the `workspace` volume. The image runs as a non-root user with a read-only root filesystem.

- `localhost` in this version means **the backend/container**, not the browser user's computer. To reach the Docker host, use `host.docker.internal`; the database must listen on an interface reachable from Docker. A database bound exclusively to the host's `127.0.0.1` will not automatically become reachable.
- For a database in another Compose stack, use a shared Docker network and the database's service name, or its network-reachable host/port.
- A remote database or SSH host must be reachable from the Docker server.
- The default port binding is loopback. For network hosting, configure `DB_EXPLORER_BIND_ADDRESS`, a firewall, and an HTTPS reverse proxy. PWA installation on remote domains requires HTTPS.
- This is a **single-user workspace**. Everyone with its token can view all saved connections; do not use it as a multi-tenant service.
- Back up the volume and keep a secure, separate backup of the original master key. Changing the master key does not rotate an existing vault. Losing it makes stored credentials unrecoverable.
- `docker compose down` preserves data. Do not use `down --volumes` unless you intend to delete the saved workspace.

### SSH from the Docker web app

SSH authentication runs on the backend machine. A browser cannot read its user's SSH agent. Password/private-key modes work without an agent socket. For a Linux Docker backend on your own computer, the optional overlay makes your existing agent available:

```sh
docker compose -f compose.yaml -f compose.agent.yaml up -d --build
```

Open/unlock your system agent first (`ssh-add -l` lists its keys), then choose **Use SSH agent** in the connection dialog. The container's `node` user (UID 1000) must have permission to access the socket. Do not make the socket world-accessible or run the app as root to bypass permissions. Socket access allows the backend to request signatures using unlocked agent keys, even with a read-only mount; use a dedicated agent for a shared server. This overlay is opt-in and Linux-specific. Docker Desktop on macOS/Windows needs its platform's agent integration or password/private-key mode. Recreate the app container when your host agent socket path changes.

### Database inside Docker on an SSH server

Enable the SSH tunnel and enter the SSH server host, port 22 and SSH username. Under **General**, enter the database address **reachable from that SSH server**, its container port (PostgreSQL 5432 / MySQL 3306), database name and database credentials. A database container with no host port mapping cannot be reached at the SSH server's `127.0.0.1:5432`.

A private container IP can work from the SSH host, but can change when the container is recreated. For a stable configuration, the server operator can publish a database port on the server's **loopback interface only**, for example `127.0.0.1:15432:5432`, and use General host `127.0.0.1`, port `15432` through SSH. Changing server publishing is a separate deployment operation; DB Explorer never does it automatically. If DB Explorer and the database run in the same Docker network instead, disable SSH and use the database service name and container port.

SSH agent authentication still uses an authorized SSH key; it does not bypass server authentication. Database credentials are independent. An empty database password is accepted by the form only when the database server permits that account to authenticate without one.

## Desktop installers

```sh
npm run desktop:dist
```

Artifacts appear in `release/`. On the corresponding native OS, this creates Windows NSIS `.exe`, macOS `.dmg`, or Linux `.AppImage` and `.deb` packages. macOS also produces a ZIP containing the app, with separate Apple Silicon and Intel builds. The backend and frontend are bundled inside the application. Build Windows/macOS installers on their respective runners; do not claim native verification from a Linux build.

Release CI builds all three operating systems after checks pass. For a friction-free public distribution, configure platform signing certificates; macOS also requires Apple notarization credentials. Without signing, platform trust warnings may appear. The project cannot supply publisher certificates on your behalf. There is no automatic update installation in v1; users install a newer release normally.

## Verification

```sh
npm run format:check
npm run check
# Synthetic disposable databases, fixed test ports 55432 and 53306:
node scripts/test-certificates.mjs
docker compose -f compose.test.yaml up -d --wait --wait-timeout 180
DB_EXPLORER_INTEGRATION=1 npm run test:integration
npx playwright install --with-deps chromium
npm run test:e2e
# If Google Chrome is already installed, use DB_EXPLORER_CHROME=1 npm run test:e2e
# Clean up only this project's synthetic fixtures:
docker compose -f compose.test.yaml down --volumes
```

Integration checks cover actual PostgreSQL/MySQL browsing, parameterized search, identifier escaping, large integer precision, credential redaction, encrypted persistence, SSH agent and password authentication, encrypted PEM key authentication, safe connection-failure diagnostics, and host-key mismatch rejection. Browser checks exercise the end-user workflow against real PostgreSQL data.

CI checks formatting, types, unit tests, real database integration, browser flows, and a running Docker image. Tagged releases additionally package desktop installers on native Windows/macOS/Linux runners, check packaged startup, publish the image to GHCR and attach installers/checksums to a GitHub preview Release. Private repository downloads require repository access. Local validation does not imply a successful remote Actions run.

## Project structure

- `backend/`: domain contracts → application use cases → infrastructure adapters → NestJS HTTP presentation.
- `frontend/`: domain types → application state/use cases → API infrastructure → Vue presentation.
- `shared/`: Zod schemas and inferred API contracts used by both applications.
- `desktop/`: application lifecycle, OS key protection, and installer shell.
- `docs/`: architecture, API, deployment, and security decisions.

See [Architecture](docs/ARCHITECTURE.md), [API](docs/API.md), and [Operations](docs/OPERATIONS.md). The supplied `skill.md` is preserved as the project architecture/validation reference.

## v1 boundaries

PostgreSQL and MySQL live connections, one named database per connection, read-only browsing, SSH agent/password/PEM keys, and verified TLS are supported. SQL editing/execution, row mutations, backup import/restore, multi-user authorization, and database-wide exports are not included. MySQL 8+ and PostgreSQL 14+ are the intended target versions; integration CI currently verifies MySQL 8.4 and PostgreSQL 17. Mobile helpers and Safari/Firefox PWA installation are not part of the v1 desktop-focused acceptance matrix.
