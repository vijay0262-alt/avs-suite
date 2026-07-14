# AVS Suite — Product Requirements & Progress

## Original problem statement

Build **AVS PC Optimizer**, a commercial Windows desktop application
organised as **`avs-suite`** — a scalable monorepo that will host sibling
products (Security, Driver Updater, File Recovery, VPN). Everything must
follow Clean Architecture, SOLID, MVVM, be plugin-ready, edition-aware
(Free / Pro / Enterprise / Trial), i18n-ready, and production-grade.

## User choices (verbatim)

* Environment: build the complete scaffold; user runs on Windows.
* Design: Windows 11 Fluent-inspired (Mica / Acrylic / rounded).
* Brand accent: Blue `#0078D4` (Fluent palette).
* Python ↔ Electron: JSON-RPC over stdio (child process).
* Extra scope: i18n, plugin architecture, feature flags, licensing
  interfaces, auto-update framework, structured logging, crash handler,
  environment configs, shared UI, design tokens, a11y, unit + e2e tests,
  CI/CD, docs, monorepo shape.
* Milestone 2: **Junk Cleaner MVP — scan only, no deletion**.

## Architecture (unchanged)

* Yarn workspaces monorepo. TS project references keep the graph clean.
* Apps: `pc-optimizer` (active), `security`, `driver-updater`,
  `file-recovery`, `vpn` (placeholders).
* Packages: `ui`, `core` (MVVM/DI/EventBus/Plugin), `licensing`,
  `updater`, `analytics`, `shared` (tokens/i18n/flags/env/rpc).
* Backend: Python 3.12; JSON-RPC 2.0 over stdio; handler registry;
  feature module folders.

## What is implemented

### Scaffold milestone (Jan 2026)

* Full monorepo layout with README in every folder.
* Design tokens (light / dark / high-contrast / reduced-motion).
* Theme provider, sidebar, title-bar, 10 lazy-loaded routes.
* Electron main + preload + IPC + Python spawn + updater + logger + crash reporter.
* Python backend: `system.*` and `metrics.*` handlers live.
* Vitest + Pytest test scaffolding.
* Docs: overview, module architecture, RPC contract, editions,
  theming, monorepo, coding standards, a11y, module template, 2 ADRs.

### Junk Cleaner MVP (Jan 2026)

**Backend engine (`backend/src/avs_backend/cleaner/`)**

* `interfaces.py` — `ICleaner`, `ScanStatus`, `ScanItem`, `CleanerResult`.
* `safe_paths.py` — forbidden-root guard, symlink / junction detection.
* `scanner_base.py` — `BaseCleaner` with `os.scandir` BFS walker,
  cancellation, permission-error capture, extension + age filters,
  progress ticks.
* `scan_manager.py` — `ScanManager`: parallel execution via
  `ThreadPoolExecutor`, per-cleaner + aggregate progress, ETA,
  co-operative cancellation, snapshot API, paged results.
* `cleaners/` — 9 concrete cleaners:
  `WindowsTemp`, `UserTemp`, `RecycleBin`, `ThumbnailCache`, `Prefetch`,
  `WindowsUpdateCache`, `BrowserCache` (Chrome / Edge / Brave / Opera /
  Vivaldi / Firefox), `CrashDump`, `LogFile`.
* RPC methods live: `cleaner.list`, `cleaner.scan.start`,
  `cleaner.scan.status`, `cleaner.scan.cancel`, `cleaner.scan.results`.
* **Scan-only** — no deletion. Deletion is the next milestone.

**Frontend feature module (`apps/pc-optimizer/src/features/junk-cleaner/`)**

* `JunkCleanerViewModel.ts` — MVVM, extends `@avs/core` `ViewModel`.
* `junkCleaner.service.ts` — typed RPC wrapper (DI-friendly).
* `JunkCleanerPage.tsx` — full page: header, scan/stop/rescan buttons,
  select-all, per-category rows, progress panel, details table.
* Components: `CategoryRow` (checkbox / icon / status pill /
  per-cleaner progress / file count / bytes / View details),
  `ScanProgress` (Total Junk / Total Files / Current Scanner / ETA),
  `DetailsTable` (virtualised via `react-window`; columns: Path,
  File name, Extension, Size, Modified).

**Tests**

* Backend: 14 tests (registry, engine, scan manager, end-to-end RPC).
  Covers cancellation, permission errors, symlink skip, ext filter,
  age filter, paged results, only-filter.
* Frontend: 7 Vitest tests on the ViewModel (bootstrap, select,
  refuse-empty-scan, poll-to-completion, cancel, details paging,
  service-error surfacing).
* Vite production build: 430 modules, JunkCleanerPage code-split at
  30 KB (9.5 KB gzip).

## What is NOT implemented (deferred)

* **Deletion / cleaning** — reserved for the next milestone (safe
  cleaning: preview → delete selected → undo where practical →
  empty Recycle Bin via Shell API → recovered-bytes summary).
* Licensing implementation (interfaces only).
* Analytics transport (opt-in only).
* Real update-server / signed installer.
* Non-English locale translations.
* Startup Manager, Privacy Cleaner, Duplicate Finder, Disk Analyzer,
  Performance modules (Python stubs raise "not implemented").

## Prioritised backlog

* **P0** — Safe Cleaning module (delete selected, undo, Recycle Bin
  emptying via SHFileOperation, recovered-bytes summary, cleaning
  logs).
* **P0** — Dashboard live metrics polling (`rpc.metrics.*`).
* **P1** — Startup Manager (registry + WMI enumeration).
* **P1** — Privacy Cleaner (browser + Windows trace registry).
* **P1** — Settings persistence (`ISettingsStore`).
* **P2** — Duplicate Finder (SHA-256 hashing + progress events).
* **P2** — Disk Analyzer (Recharts treemap).
* **P2** — Performance presets.
* **P2** — Licensing implementation + activation UI.
* **P3** — Additional locale translations.

## Free vs. Pro edition map (planning)

| Feature | Free | Pro |
|---|---|---|
| Junk Scan | ✅ | ✅ |
| Junk Clean (safe delete) | ✅ | ✅ |
| Scheduled Cleaning | ❌ | ✅ |
| Automatic Cleaning | ❌ | ✅ |
| Startup Manager | Basic (list/enable/disable) | Full (impact scoring, delayed-start) |
| Duplicate Finder | ❌ | ✅ |
| Disk Analyzer | ❌ | ✅ |
| Privacy Cleaner | Basic (browsers only) | Full (Windows components) |
| Performance Optimizer | ❌ | ✅ |

Gating already lives declaratively in
`packages/shared/src/featureFlags/index.ts`; no code paths need paywall
retrofit.

## Test credentials

Not applicable — no authentication in this build.
