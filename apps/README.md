# apps/

Each product ships as its own application. This folder groups
them so they can share source (via `packages/*`) without leaking build
graphs.

| Folder | Package | Description | Status |
|---|---|---|---|
| `pc-optimizer/` | `@avs/pc-optimizer` | Primary product — PC health, cleanup, AI, security. | **Active (v1.0.0)** |
| `customer-portal/` | `@avs/customer-portal` | Customer portal — account, licenses, devices, downloads. | **In Development (v0.1.0, Next.js)** |
| `security/` | `@avs/security` | Standalone anti-malware + hardening. | Placeholder |
| `driver-updater/` | `@avs/driver-updater` | Detect & install newer drivers. | Placeholder |
| `file-recovery/` | `@avs/file-recovery` | Recover deleted files. | Placeholder |
| `vpn/` | `@avs/vpn` | AVS VPN client. | Placeholder |

Every app must:

1. Depend on `@avs/ui`, `@avs/core`, and `@avs/shared`.
2. Own its own Electron main + preload folder (desktop apps).
3. Package via `electron-builder` and publish via update framework.
