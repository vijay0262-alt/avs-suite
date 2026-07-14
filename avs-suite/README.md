# AVS Suite

A modular monorepo hosting the family of **AVS** desktop utilities:

| App | Package | Status |
|---|---|---|
| AVS PC Optimizer | `@avs/pc-optimizer` | Active scaffold |
| AVS Security | `@avs/security` | Placeholder |
| AVS Driver Updater | `@avs/driver-updater` | Placeholder |
| AVS File Recovery | `@avs/file-recovery` | Placeholder |
| AVS VPN | `@avs/vpn` | Placeholder |

All apps share code through the `packages/*` workspace and a common
Python backend that runs as an out-of-process child (JSON-RPC over stdio).

---

## Repository layout

```
avs-suite/
├── apps/                Product-specific Electron applications
│   ├── pc-optimizer/    Primary product (fully scaffolded)
│   ├── security/
│   ├── driver-updater/
│   ├── file-recovery/
│   └── vpn/
├── packages/            Shared libraries
│   ├── ui/              Design system & shared React components
│   ├── core/            MVVM base classes, DI, event bus, Result type
│   ├── licensing/       Licensing interfaces (implementation deferred)
│   ├── updater/         electron-updater wrapper interfaces
│   ├── analytics/       Analytics interfaces (opt-in, deferred)
│   └── shared/          Types, constants, i18n, design tokens, RPC schema
├── backend/             Python 3.12 backend (psutil, pywin32, WMI)
├── services/            Optional server-side companions
│   ├── update-server/   Static host for auto-update artefacts
│   └── license-server/  License activation endpoint (deferred)
├── database/            Local SQLite files (runtime, git-ignored)
├── logs/                Rotating log files (runtime, git-ignored)
├── build/               Build assets (icons, notarization, etc.)
├── installer/           NSIS / MSI configuration
├── docs/                Architecture, ADRs, module docs, coding standards
├── scripts/             Cross-platform maintenance scripts
├── tests/               Root-level Playwright e2e specs
└── .github/workflows/   CI/CD pipelines (build, lint, test, release)
```

---

## Tech stack

- **Desktop**: Electron 30 + electron-builder + electron-updater + electron-log
- **Frontend**: React 18, TypeScript 5, Vite 5, TailwindCSS 3, Zustand, React Router 6, Recharts, Heroicons
- **Backend**: Python 3.12, psutil, pywin32, WMI, SQLite
- **Communication**: JSON-RPC 2.0 over stdio (Python spawned as child of Electron main process)
- **Testing**: Vitest (unit), Playwright (e2e), pytest (backend)
- **Tooling**: ESLint, Prettier, Yarn workspaces

---

## Getting started

```bash
# 1. Install JS dependencies (all workspaces)
yarn install

# 2. Install Python backend dependencies
yarn backend:install

# 3. Run the PC Optimizer app in dev mode (Vite + Electron + Python child)
yarn dev:pc-optimizer

# 4. Package a Windows installer
yarn package:pc-optimizer
```

> The desktop apps target **Windows 10/11 (x64)**. Development on macOS/Linux
> is supported for UI work; Windows-specific backend calls are stubbed.

---

## Architecture principles

1. **Clean Architecture** — UI / Application / Domain / Infrastructure layers.
2. **SOLID** — enforced by module boundaries and DI.
3. **MVVM** — every page has a ViewModel (`@avs/core/mvvm`) that owns state
   and exposes actions to the View (React component).
4. **Feature isolation** — every product feature lives in `src/features/*`
   with its own components, viewmodels, services, and types.
5. **No Windows logic in React** — all OS interaction crosses the JSON-RPC
   boundary and is implemented in `backend/`.
6. **Plugin-ready** — new modules register through `@avs/core` module
   descriptors; adding a Driver Updater or VPN is additive, never invasive.
7. **Edition-aware** — Free / Pro / Enterprise / Trial gating is centralised
   in `@avs/shared/featureFlags` and consulted by every feature.

See [`docs/architecture/overview.md`](./docs/architecture/overview.md).

---

## License

Proprietary — © AVS Software. All rights reserved.
