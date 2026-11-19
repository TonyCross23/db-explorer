# Operations and release

## Desktop

End users install once and open the app; there is no terminal/helper configuration. Linux supports AppImage and Debian packages. macOS produces DMG and Windows produces an NSIS installer. The bundled Electron runtime supplies Node, drivers, and the frontend/backend.

The data directory is Electron's per-user `userData/workspace`. Preserve `connections.enc` together with the OS-protected `master-key.protected` file on that same user/OS profile. OS-protected secrets are not a portable credential export. For testing or a separate profile, `DB_EXPLORER_PROFILE_DIR` can select a dedicated desktop data directory. The app does not implement cross-device secret migration or unattended updates.

If the keychain is locked/unavailable, enable/unlock your OS keychain and restart. Session-only mode avoids silently writing unprotected secrets. If an existing vault cannot decrypt, recover the original profile/key instead of deleting files. Removing a connection deletes it from the logical vault; this is not secure erasure of historical filesystem snapshots/backups.

## Server / Docker

Generate unique secrets, run `docker compose up -d --build`, and unlock the web interface with the configured access token. Persist the named volume. Back up the master key separately. Do not mount production database data directories into this app; it uses native database connections.

For external hosting, terminate HTTPS at your existing reverse proxy, keep the application on a private/loopback network, and enforce access restrictions appropriate for a database administration tool. Never use example fixture credentials in a real environment. Host-container networking depends on the database listen address and firewall; `host.docker.internal` does not bypass them.

Logs intentionally contain neither target SQL parameters nor credentials. `/api/health` is liveness only; it does not connect to any saved database. Database availability is checked explicitly through the connection test operation.

## Connection diagnosis

**Test SSH sign-in** isolates network/host-identity/SSH authentication from database setup. The normal **Test connection** then tests the database through the tunnel. Failures show sanitized, stage-specific messages for agent availability, rejected SSH credentials, encrypted/invalid key files, fingerprint mismatch, denied/unreachable forwarding, database sign-in, database name, and verified TLS failures. A successful command-line SSH session may use an existing agent or configured identity; it does not prove that an isolated Docker backend has those credentials.

See the README's optional `compose.agent.yaml` instructions for Linux Docker agent access and the Docker-on-SSH-server connection example. Agent forwarding to remote servers is disabled. The application uses the local agent only to authenticate its own SSH connection. Desktop apps inherit `SSH_AUTH_SOCK` from their launch session on Linux/macOS; after starting or unlocking an agent, restart the app from that session if needed. Windows supports an available OpenSSH agent pipe; native Windows/macOS agent behavior still needs platform acceptance testing.

## CI/CD

`.github/workflows/ci.yml` verifies formatting, type checking, unit tests, real PostgreSQL/MySQL/SSH integration, browser journeys, and a container startup smoke test. It only creates/disposes synthetic test databases. Fixture ports are reserved for testing, and the scripts refuse to run integrations without an explicit test flag.

`.github/workflows/release.yml` verifies first, then builds native installers on Linux, Windows, and macOS runners and publishes the container to GHCR. It uploads installer artifacts and publishes a GitHub preview Release with checksums after native builds and startup checks pass. It does not deploy an application server. `workflow_dispatch` can create a manual candidate; `v*` tags create versioned image tags.

Before publishing a real release:

1. Set the package version consistently at the workspace root and packages, then refresh the lockfile.
2. Provision signing certificates through GitHub environment/repository secrets. `CSC_LINK` and `CSC_KEY_PASSWORD` support electron-builder's certificate import. Separate platform environment secrets are recommended if different certificates are needed.
3. For macOS, provide Apple notarization credentials (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`) and a valid Developer ID certificate. Without publisher credentials, generated packages are unsigned/internal candidates and may trigger OS warnings.
4. Exercise install, launch, save/reopen, SSH agent, password and encrypted PEM key, uninstall/reinstall, and data retention on each supported native OS before distributing signed releases.
5. Keep your GHCR package private unless you explicitly want public distribution; registry visibility is an account/repository setting.

The project does not create cloud accounts, signing certificates, or a GitHub remote automatically. Local checks and a Linux package build are reported separately from remote CI and Windows/macOS verification.
