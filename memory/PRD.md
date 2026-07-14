# AVS Suite — Product Requirements & Progress

## Original problem statement

Build **AVS PC Optimizer**, a commercial Windows desktop application
(scaffold only, no features yet), and organise it as **`avs-suite`** —
a scalable monorepo that will host sibling products (Security, Driver
Updater, File Recovery, VPN). Everything must follow Clean Architecture,
SOLID, MVVM, be plugin-ready, edition-aware (Free / Pro / Enterprise /
Trial), i18n-ready, and production-grade.

## User choices (verbatim)

* Environment: build the complete scaffold; user runs on Windows.
* Design: Windows 11 Fluent-inspired (Mica / Acrylic / rounded).
* Brand accent: Blue `#0078D4` (with the supplied Fluent palette).
* Python ↔ Electron: JSON-RPC over stdio (child process).
* Extra scope: i18n, plugin architecture, feature flags, licensing
  interfaces, auto-update framework, structured logging, crash handler,
  environment configs, shared UI, design tokens, a11y, unit + e2e tests,
  CI/CD, docs, monorepo shape.
* Root: `avs-suite/` with `apps/*`, `packages/*`, `backend/`, `services/`.

## Architecture

* **Monorepo**: Yarn workspaces; TypeScript project references.
* **Apps** (`apps/`): `pc-optimizer` (fully scaffolded), plus placeholder
  stubs for `security`, `driver-updater`, `file-recovery`, `vpn`.
* **Packages** (`packages/`): `ui`, `core` (MVVM/DI/EventBus/Plugin),
  `licensing`, `updater`, `analytics`, `shared` (tokens/i18n/flags/env/rpc).
* **Backend** (`backend/`): Python 3.12; JSON-RPC 2.0 over stdio;
  handler registry; feature module stubs; working `system.*` and
  `metrics.*` handlers.
* **Services** (`services/`): `update-server`, `license-server` (empty).
* **Docs** (`docs/`): overview, module architecture, RPC contract,
  editions, theming, monorepo, coding standards, a11y, module template,
  ADRs 0001 & 0002.
* **CI/CD** (`.github/workflows/ci.yml`): lint, typecheck, Vitest,
  Pytest, Windows installer build on tag.

## What is implemented (scaffold-only, 2026-01)

* Full monorepo layout with README in every folder.
* Design tokens (light / dark / high-contrast / reduced-motion).
* Theme provider, sidebar, title-bar, all 10 routes lazy-loaded.
* Dashboard page with real widgets (placeholder values).
* Settings page with working theme switcher.
* About page.
* Electron main + preload + IPC + Python spawn + updater + logger +
  crash reporter.
* Python backend with working `system.ping`, `system.info`,
  `system.healthScore`, `metrics.cpu`, `metrics.memory`, `metrics.disk`.
* JSON-RPC stdio round-trip verified end-to-end (all methods respond).
* Vitest scaffold passing (7 tests green).
* Pytest scaffold passing (2 tests green).
* ESLint, Prettier, EditorConfig, .gitignore.
* i18n wired via react-i18next (English canonical tree).
* Feature-flag / edition-gating registry.
* Plugin-ready module registry.
* Structured rotating logs (electron-log + Python logging).
* Global crash handler writing JSON crash files.

## What is NOT implemented (intentionally deferred)

* No feature business logic (cleaner, startup, privacy, duplicates,
  disk analyzer, performance, scheduler).
* No licensing implementation (interfaces only; `NullLicensingService`).
* No analytics transport (interfaces only; `NullAnalyticsService`).
* No update server hosted; `electron-updater` wired but feed URL is a
  placeholder.
* No signed installer; `electron-builder` configured but not run.
* Non-English locales are placeholder files only.

## Prioritised backlog

* **P0** — Live metrics loop in Dashboard (`useEffect` polling
  `rpc.metrics.*`).
* **P0** — Junk Cleaner feature (module + Python handler + ViewModel).
* **P1** — Startup Manager (registry + WMI enumeration).
* **P1** — Privacy Cleaner (browser + Windows trace registry).
* **P1** — Settings persistence (`ISettingsStore` implementation).
* **P2** — Duplicate Finder (SHA-256 hashing + progress events).
* **P2** — Disk Analyzer (treemap with Recharts / D3).
* **P2** — Performance presets.
* **P2** — Licensing implementation + activation UI.
* **P2** — Update-server publishing pipeline.
* **P3** — Additional locale translations.

## Test credentials

Not applicable — no authentication in this build.
