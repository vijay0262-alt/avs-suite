# services/

Optional server-side companions.

| Service | Purpose |
|---|---|
| `update-server/` | Static host that serves `latest.yml` and update artefacts to `electron-updater`. |
| `license-server/` | Endpoint that validates activation keys, issues signed license files. |

Both services are declared as workspaces so they can share types with the
desktop apps (they will consume `@avs/shared` when implemented).
