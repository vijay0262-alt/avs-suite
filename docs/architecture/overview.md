# Architecture Overview

**See [../ARCHITECTURE_OVERVIEW.md](../ARCHITECTURE_OVERVIEW.md) for the full, up-to-date subsystem connection diagram.**

## Layers

```
┌──────────────────────────────────────────────────────────────────────┐
│                    Presentation (React)                              │
│         apps/pc-optimizer/src/{pages,components,features}           │
│  Dashboard │ Security Dashboard │ Hardware Center │ AI Workspace   │
└───────────────┬──────────────────────────────────────────────────────┘
                │ binds via useViewModel
┌───────────────▼──────────────────────────────────────────────────────┐
│              Application  (ViewModels — @avs/core)                   │
│    Feature-owned viewmodels. Pure TS; no UI imports.                 │
│  AI Engines │ Security Engines │ Hardware │ Smart Optimize           │
└───────────────┬──────────────────────────────────────────────────────┘
                │ resolve(TOKENS.RpcClient) via @avs/core/di
┌───────────────▼──────────────────────────────────────────────────────┐
│           Infrastructure (Electron main process)                     │
│  Preload bridge → IPC → JSON-RPC stdio → Python child                │
│  License SDK bridge → AVS License Server                             │
└───────────────┬──────────────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────────────┐
│                Domain / Windows APIs (Python)                        │
│  backend/src/avs_backend/{cleaner, startup, privacy, undo, …}       │
│    psutil, pywin32, WMI, SQLite, AVS License SDK                     │
└──────────────────────────────────────────────────────────────────────┘
```

## Platforms

### AI Platform
- AI Context Engine (provenance, evidence, confidence)
- AI Insights, Recommendations, Predictions engines
- AI Process Intelligence, AI Health Engine, AI Workspace
- Core principle: AI must never invent information — all traceable with confidence scores

### Security Platform
- Real-Time Protection Engine (10 monitors)
- Security Center (20+ detection providers)
- Security Investigation (correlation, explanation, severity)
- Security Remediation (quarantine, rollback, restore)

### Hardware Platform
- Hardware Center dashboard
- AI Hardware Health Engine (analyze, explain, recommend — no modification)
- Hardware scanner, monitor, manager, diagnostics

### Optimization Platform
- Smart Optimize (planner, adaptive, automation, maintenance, profiles, goals)
- Execution Pipeline (task execution, progress, results)
- Undo/Restore (backup, rollback, recovery)

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
