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
* Brand accent: Blue `#0078D4`.
* Python ↔ Electron: JSON-RPC over stdio (child process).
* Milestone 2: Junk Cleaner MVP — scan only.
* Milestone 3 (this): **Safe Cleaning Engine — no undo, no registry, no schedule.**

## Architecture (unchanged)

Yarn workspaces monorepo, `apps/*` + `packages/*` + `backend/` +
`services/`. All decisions from prior milestones remain in force.

## What is implemented

### Scaffold milestone (Jan 2026) — see previous PRD entries

### Junk Cleaner MVP — scan (Jan 2026)

9 cleaners, `ScanManager`, `ICleaner` interface, virtualised details
table, 250 ms status polling, 16 backend + 7 frontend tests.

### Safe Cleaning Engine (Jan 2026 — this milestone)

**Backend (`backend/src/avs_backend/cleaner/`):**

* Extended `ICleaner` with `validate() / clean() / rollback_supported()`.
* `BaseCleaner._delete_one()` — twice-validated deletion pipeline with
  retry (3 attempts, 50/150/300 ms backoff) and race-safe handling
  (`FileNotFoundError` silent, `PermissionError` retried).
* `CleaningManager` — parallel workers (`ThreadPoolExecutor`, 4),
  per-cleaner progress + current file, cancellation, ETA, snapshot API.
* `HistoryStore` — SQLite (WAL mode) at
  `<AVS_DB_DIR>/cleaning-history.sqlite`; indexed on
  `started_at DESC`, `category`, `result`.
* 5 new RPC methods: `cleaner.clean.preview / execute / status /
  cancel / logs`.
* **Safety** enforced at two layers: `validate()` (preview time) and
  `_delete_one()` (immediately before `os.remove`). Forbidden roots,
  symlinks, out-of-scope paths, non-regular files all rejected with
  structured `ValidationIssue` records.

**Frontend (`apps/pc-optimizer/src/features/junk-cleaner/`):**

* `JunkCleanerViewModel` extended with cleaning flow state machine
  (`closed → preview → confirm → running → summary`) and history
  paging. Existing scan flow untouched.
* New components: `Modal`, `PreviewDialog`, `ConfirmDialog`,
  `CleaningProgress`, `CleaningSummary`, `CleaningLog` (searchable +
  filter + JSON/CSV export via blob URL).
* Existing `JunkCleanerPage` extended, not rewritten. New "Clean…"
  button appears once a scan has results.

**Tests**

* Backend: **36 pytest tests** (16 pre-existing + 20 new).
  Includes 10-file / 100-file / 500-file / 10 000-file cases plus
  full RPC-level integration test that verifies preview → execute →
  disk state → history row all consistent.
* Frontend: **17 vitest tests** (10 in ViewModel — scan + full
  cleaning flow: preview / confirm / execute / cancel / history /
  error surfacing).
* Vite build: 430+ modules, JunkCleanerPage chunk = 57 KB (14.85 KB
  gzip) after all cleaning UI.

**Docs**

* `docs/architecture/cleaning-manager.md` (new).
* RPC surface, safety guarantees, threading model documented.

## What is NOT implemented (deferred as per brief)

* **Undo / rollback** — `rollback_supported()` returns `False`.
* **Registry cleaning.**
* **Scheduled cleaning.**
* **Windows Shell `SHFileOperation`** for Recycle-Bin emptying — the
  `RecycleBinCleaner` still uses `os.remove` per-file.

Other deferred items (unchanged): Startup Manager, Privacy Cleaner,
Duplicate Finder, Disk Analyzer, Performance modules, licensing
implementation, real update-server / signed installer, non-English
locales.

## Prioritised backlog

* **P0** — Dashboard live metrics polling (`rpc.metrics.*`).
* **P0** — Startup Manager (WMI + registry read/write).
* **P1** — Windows Shell integration for Recycle-Bin emptying.
* **P1** — Settings persistence (`ISettingsStore`).
* **P1** — Privacy Cleaner.
* **P2** — Duplicate Finder, Disk Analyzer, Performance presets.
* **P2** — Licensing implementation + activation UI.

## Free vs. Pro edition map

Unchanged from previous milestone. Feature flags declared in
`packages/shared/src/featureFlags/index.ts`.

## Test credentials

Not applicable — no authentication in this build.
