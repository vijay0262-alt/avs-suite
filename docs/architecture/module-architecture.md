# Module Architecture

Every feature is a **plugin** described by a `ModuleDescriptor`
(`@avs/core/plugin/ModuleDescriptor`).

```ts
export const JunkCleanerModule: ModuleDescriptor = {
  id: 'junk-cleaner',
  labelKey: 'nav.junkCleaner',
  routePath: '/junk-cleaner',
  icon: TrashIcon,
  page: () => import('./JunkCleanerPage'),
  requires: 'JUNK_CLEANER_BASIC',
  order: 20,
};
```

At bootstrap the shell asks `moduleRegistry.list()` and produces the
sidebar, the router table, and the command palette. Adding a "Driver
Updater" module = one `moduleRegistry.register()` call plus a Python
handler.

## Feature folder shape

Recommended layout for a new feature (created lazily when needed):

```
apps/pc-optimizer/src/features/junk-cleaner/
├── JunkCleanerPage.tsx          # the View
├── JunkCleanerViewModel.ts      # the ViewModel (business rules)
├── junkCleaner.service.ts       # thin RPC wrapper
├── junkCleaner.types.ts         # DTOs shared with Python via @avs/shared/rpc
├── components/                  # feature-local sub-components
└── __tests__/                   # Vitest suites
```

Cross-cutting: never import from another feature's folder. If two
features share code, promote it to `packages/ui` or `packages/core`.
