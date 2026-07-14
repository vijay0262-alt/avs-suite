# apps/pc-optimizer

The AVS PC Optimizer desktop application.

## Layout

```
apps/pc-optimizer/
├── electron/              Electron main + preload (TypeScript, compiled to CJS)
│   ├── main/              Window creation, lifecycle
│   ├── preload/           Context-bridge (renderer <-> main)
│   ├── ipc/               IPC handlers + Python JSON-RPC bridge
│   ├── updater/           electron-updater wrapper
│   ├── logger/            electron-log configuration
│   └── crash/             Global exception & crash writer
├── src/                   Vite + React renderer
│   ├── components/        Reusable renderer-local components (Sidebar, TitleBar, ...)
│   ├── layouts/           AppLayout — the persistent shell
│   ├── pages/             Route-level views (lazy-loaded)
│   ├── router/            React Router configuration
│   ├── hooks/             Renderer-local hooks
│   ├── services/          RPC client, browser-side wrappers
│   ├── stores/            Zustand stores (UI-only state)
│   ├── contexts/          React contexts
│   ├── i18n/              react-i18next wiring
│   ├── styles/            Global CSS (imports @avs/ui tokens)
│   ├── types/             Global d.ts (e.g. `window.avs`)
│   ├── utils/             Renderer-local helpers
│   ├── constants/         Renderer-local constants
│   ├── assets/            Static images imported at build time
│   └── features/          Feature modules (own components + viewmodels)
├── public/                Static, not imported (favicon, etc.)
├── resources/icons/       .ico / .png shipped with the installer
├── build/                 Icon set consumed by electron-builder
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json          Renderer TS config
├── electron/tsconfig.json Main-process TS config
├── package.json           Includes electron-builder configuration
└── .env.example
```

## Development

```bash
# terminal 1
yarn workspace @avs/pc-optimizer dev

# terminal 2 (after Vite is ready on :5173)
VITE_DEV_SERVER_URL=http://localhost:5173 yarn workspace @avs/pc-optimizer dev:electron
```

Or use the cross-platform launcher:

```bash
python scripts/dev.py
```

## Packaging

```bash
yarn package:pc-optimizer   # produces apps/pc-optimizer/release/*.exe
```
