# apps/

Each product ships as its own Electron application. This folder groups
them so they can share source (via `packages/*`) without leaking build
graphs.

| Folder | Package | Description |
|---|---|---|
| `pc-optimizer/` | `@avs/pc-optimizer` | Primary product — junk, startup, privacy, disk, performance. |
| `security/` | `@avs/security` | Anti-malware + hardening (placeholder). |
| `driver-updater/` | `@avs/driver-updater` | Detect & install newer drivers (placeholder). |
| `file-recovery/` | `@avs/file-recovery` | Recover deleted files (placeholder). |
| `vpn/` | `@avs/vpn` | AVS VPN client (placeholder). |

Every app must:

1. Depend on `@avs/ui`, `@avs/core`, and `@avs/shared`.
2. Own its own Electron main + preload folder.
3. Package via `electron-builder` and publish via `electron-updater`.
