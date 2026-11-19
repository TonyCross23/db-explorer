# Verification — 2026-11-19

Version **0.2.0** validated on Linux x64 with Node.js 24, Electron 45.3.4, Google Chrome, MySQL 8.4, and PostgreSQL 17. All database records used during validation were disposable synthetic fixtures.

## Passed

- Frontend and backend strict TypeScript checking; production Vue/PWA build and standalone NestJS bundle.
- Formatting checks and GitHub workflow YAML syntax.
- 27 unit tests: graph layout with cyclic/self/disconnected relationships and text scaling, sanitized stage-specific connection errors, shared input contracts, SSH credential requirements, SQL identifier escaping, result bounds, integer preservation, encrypted vault reopening, wrong-key rejection without overwrite, concurrent writes, and session-only storage.
- 22 integration scenarios: PostgreSQL/MySQL ERD metadata including composite, self and quoted foreign keys, SSH-only sign-in, unavailable/empty-agent diagnostics, SSH agent authentication against a disposable agent, safe authentication/key/forwarding errors, both native database drivers; real table/view metadata; paging; literal search and injection payloads; large integers; secret redaction; saved-password preservation; edited-configuration test behavior; verified TLS; wrong hostname and untrusted CA rejection; SSH password and encrypted PEM/private-key authentication with TLS; changed SSH host-key rejection; deletion and missing-resource behavior.
- 2 browser journeys against real PostgreSQL: unlock/error recovery, create/test/connect, browse, paging, search, structure, query preview, remove; plus agent/password/key selection, independent SSH-only testing (mocked response in browser; real SSH in integration), PEM upload, passphrase entry, recovery from an actual rejected database password, explicit missing-field summaries, optional TLS defaults, persistent dark/light and text-size preferences, and ERD inspection/filter/zoom/table navigation.
- Final production Docker image built and ran as non-root with a read-only root filesystem. Health, SPA delivery, bearer authorization, and actual PostgreSQL/MySQL reads through bundled drivers passed. Non-root access to an explicitly mounted disposable agent socket and the empty-agent diagnostic also passed.
- Linux AppImage and Debian installers generated, with SHA-256 checksums.
- The packaged Linux desktop executable launched with a disposable profile: backend startup and token handoff were automatic; the workspace opened without a login/setup step; renderer Node access was disabled; sandbox/context isolation were enabled; unauthenticated API requests were denied. The test deliberately selected an unavailable keychain backend to verify the session-only warning, without touching the user's real credential store.

Screenshots are in `docs/screenshots/`. They show synthetic fixtures, not production data.

## User-reported SSH issue

The user-provided SSH server was reachable from this machine using the existing system agent without entering a password or loading a PEM into the app. The updated native gateway authenticated successfully with agent mode, while matching its host fingerprint against the existing trusted local `known_hosts` entries. Through that tunnel, PostgreSQL protocol-only SSL requests reached both remote database containers. No database username/password was obtained, no database authentication or SQL was attempted, and no production records or remote settings were changed.

The remote databases had no published host ports. A localhost database target could therefore fail even after SSH authentication succeeded. The optional `compose.agent.yaml` was validated, but the user's real SSH agent was not mounted into the long-running web app automatically; the Docker socket test used a separate empty disposable agent.

## Verification limits

- Windows/macOS packaging is configured in release CI; native builds, installers, signing, notarization, and user-keychain behavior on those platforms have not been run from this Linux environment.
- Private repository: https://github.com/TonyCross23/db-explorer. Native installer CI and release publication are configured; their remote run status is reported separately from local checks.
- Public signing certificates and Apple credentials must be provisioned by the publisher. Linux packages are internal/unsigned candidates; Linux package generation plus executable startup does not replace a clean-machine installer acceptance test.
- No authenticated production database session or production migration was performed. The UI is read-only and requires read-only database grants for production use.
