# Architecture Overview

## Layers

```
┌──────────────────────────────────────────────────────────┐
│                    Presentation (React)                  │
│         apps/pc-optimizer/src/{pages,components}         │
└───────────────┬──────────────────────────────────────────┘
                │ binds via useViewModel
┌───────────────▼──────────────────────────────────────────┐
│              Application  (ViewModels — @avs/core)       │
│    Feature-owned viewmodels. Pure TS; no UI imports.     │
└───────────────┬──────────────────────────────────────────┘
                │ resolve(TOKENS.RpcClient) via @avs/core/di
┌───────────────▼──────────────────────────────────────────┐
│           Infrastructure (Electron main process)         │
│  Preload bridge → IPC → JSON-RPC stdio → Python child    │
└───────────────┬──────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────┐
│                Domain / Windows APIs (Python)            │
│  backend/src/avs_backend/{cleaner, startup, privacy,…}   │
│    psutil, pywin32, WMI, SQLite                           │
└──────────────────────────────────────────────────────────┘
```

## SOLID application

* **S**ingle-responsibility — each feature module is one folder in the
  backend and one folder in `apps/*/src/features/*` in the future.
* **O**pen/closed — new products and features register through
  `ModuleRegistry` in `@avs/core`; the shell never edits.
* **L**iskov / **I**nterface segregation — every service is behind an
  interface in `@avs/core/di/tokens.ts` (`ILogger`, `IRpcClient`, ...).
* **D**ependency inversion — the shell wires concrete implementations
  into the DI container at bootstrap; ViewModels only resolve interfaces.

## Clean Architecture

The React renderer is the outermost ring. Business rules never depend
on React. This lets ViewModels move to a web variant (browser-runnable
"Lite" edition) later without rewriting logic.

## MVVM

Every screen has a ViewModel. Views subscribe via `useViewModel`; they
do not own state. This keeps components tiny (< 50 lines) and makes
snapshot / behaviour tests trivial.

## Monorepo shape

See [monorepo.md](./monorepo.md).
