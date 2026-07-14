# backend/

Python 3.12 backend spawned by the Electron main process as a child
speaking JSON-RPC 2.0 over line-delimited stdio.

## Layout

```
backend/
├── src/avs_backend/
│   ├── api/                     JSON-RPC dispatcher & handler registry
│   ├── common/                  Logging, errors, DI helpers
│   ├── models/                  Shared dataclasses
│   ├── cleaner/                 Junk cleaner  (stubs)
│   ├── startup/                 Startup manager (stubs)
│   ├── privacy/                 Privacy cleaner (stubs)
│   ├── duplicate_finder/        Duplicate finder (stubs)
│   ├── disk_analyzer/           Disk analyzer (stubs)
│   ├── performance/             Performance tuning (stubs)
│   ├── system_information/      Working: ping, sysinfo, health, metrics
│   ├── scheduler/               Scheduled maintenance (stubs)
│   ├── settings/                Persisted settings (stubs)
│   ├── logs/                    Rotating file-log configuration
│   └── utilities/               Windows helpers (registry, WMI)
├── tests/                       pytest suite
├── pyproject.toml
└── requirements.txt
```

## Running

```bash
# Interactive JSON-RPC over stdio (Ctrl+D to exit):
PYTHONPATH=src python -m avs_backend.api.rpc_server

# Tests
PYTHONPATH=src python -m pytest -q
```

## RPC contract

The list of method names lives in
`packages/shared/src/rpc/index.ts` — the same file the renderer imports.
Adding a new method:

1. Add the name to `RPC_METHODS` in `packages/shared`.
2. Import the shared name in the appropriate Python module.
3. Decorate the handler with `@register(RPC_METHODS.XXX)`.

Both sides are then wired.

## Windows-only calls

`pywin32` and `WMI` are listed under `platform_system=="Windows"` in
`requirements.txt`, so they are skipped on macOS/Linux dev machines.
Handlers that need them must fail gracefully with
`RpcError(NOT_SUPPORTED_ON_PLATFORM, ...)` on other platforms.
