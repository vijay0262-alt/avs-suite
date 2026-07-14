# JSON-RPC Contract

The Electron main process spawns the Python backend and speaks
JSON-RPC 2.0 over line-delimited stdio. Every request/response is a
single line of JSON terminated by `\n`.

## Request

```json
{ "jsonrpc": "2.0", "id": 42, "method": "system.info" }
```

## Response — success

```json
{ "jsonrpc": "2.0", "id": 42, "result": { "os": "Windows", "arch": "AMD64" } }
```

## Response — error

```json
{ "jsonrpc": "2.0", "id": 42, "error": { "code": -32601, "message": "Unknown method" } }
```

## Method surface

**System / metrics**

| Method | Result |
|---|---|
| `system.ping` | `{ pong: true }` |
| `system.info` | OS, arch, python version |
| `system.healthScore` | `{ score, capturedAt }` |
| `metrics.cpu` / `metrics.memory` / `metrics.disk` | live usage |

**Junk Cleaner — scan**

| Method | Result |
|---|---|
| `cleaner.list` | Metadata catalog |
| `cleaner.scan.start` | `{ taskId }` |
| `cleaner.scan.status` | Snapshot (per-cleaner + aggregate) |
| `cleaner.scan.cancel` | `{ cancelled }` |
| `cleaner.scan.results` | Paged file rows |

**Junk Cleaner — safe clean**

| Method | Result |
|---|---|
| `cleaner.clean.preview` | Per-cleaner counts + warnings |
| `cleaner.clean.execute` | `{ cleaningTaskId }` |
| `cleaner.clean.status`  | Cleaning snapshot with current file |
| `cleaner.clean.cancel`  | `{ cancelled }` |
| `cleaner.clean.logs`    | Paged history entries |

## Error codes

Standard JSON-RPC codes (`-32700`..`-32603`) plus AVS extensions
(`-32000`..`-32099`) defined in `packages/shared/src/rpc/index.ts` and
mirrored in `backend/src/avs_backend/common/errors.py`.

## Method registry

Single source of truth:
`packages/shared/src/rpc/index.ts → RPC_METHODS`.

Both sides import from this list — if you add `foo.bar` to the object,
TypeScript compiles, but Python will fail its integration test until a
handler is registered.
