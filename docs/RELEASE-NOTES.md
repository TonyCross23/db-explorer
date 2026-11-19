# DB Explorer 0.2.2 preview

Read-only PostgreSQL/MySQL explorer for desktop and Docker. The desktop app includes its backend and drivers; install it and open a connection without installing Node or a helper service.

- Automatic schema diagrams with columns, primary/foreign keys, composite/self relationships, table details, zoom, panning and draggable tables. Relationships come from declared database constraints; they are not guessed from column names.
- Larger text, persistent text-size settings and visible dark/light controls.
- SSH agent authentication without copying a PEM into the app, plus password and encrypted private-key modes. Independent SSH sign-in testing and specific, sanitized network/authentication/TLS errors.
- Clear missing-field errors and optional, verified TLS settings.
- Encrypted connection storage, read-only sessions, bounded table browsing and CSV export of the current page.

## Downloads

- Apple Silicon Macs: `mac-arm64.dmg` or `mac-arm64.zip`.
- Intel Macs: `mac-x64.dmg` or `mac-x64.zip`.
- Windows x64: `win-x64.exe` installer.
- Linux x64: `.AppImage` or `.deb`.

For a Mac DMG, open the disk image and drag DB Explorer into Applications. The ZIP contains the same `.app`. Mac previews use ad-hoc signatures. These are preview builds: publisher signing/notarization certificates are not configured, so macOS Gatekeeper or Windows SmartScreen may block or warn. Native CI checks app startup; this is not a full clean-machine installation acceptance test. Do not treat an unsigned preview as a signed public release.

## Docker

`docker compose up -d --build`, then open http://127.0.0.1:4317. Generate the workspace token/master key first as described in the README. For Linux host SSH-agent access, opt in to `compose.agent.yaml`; the backend uses the agent on its own host, not the browser user's computer.

ERDs are limited to 100 tables per schema and bounded metadata. SQL editing, row mutations, dump import/restore and multi-user authorization are not included. Retain your encrypted workspace and its original encryption key when upgrading. See README and docs for configuration and verification limits.
