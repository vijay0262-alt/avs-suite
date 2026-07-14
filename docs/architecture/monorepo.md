# Monorepo Layout

Yarn workspaces (`packageManager: yarn@1.22.22`). TypeScript project
references keep the build graph consistent.

## Dependency direction

```
apps/*    →  packages/{ui,core,shared,licensing,updater,analytics}
packages  →  packages/shared  (leaf)
```

**No** app imports from another app. **No** package imports from any app.
CI enforces this by running `tsc -b` from the root.

## Adding a new app

1. `mkdir apps/<name>` with `package.json` `"@avs/<name>"`, `src/`,
   `electron/`, `tsconfig.json`, `vite.config.ts`.
2. Declare dependencies on `@avs/ui`, `@avs/core`, `@avs/shared`.
3. Register the app in the root `package.json` scripts (dev / build /
   package).
4. Add a CI matrix entry in `.github/workflows/ci.yml`.

## Adding a new package

1. `mkdir packages/<name>` with `package.json` `"@avs/<name>"` and
   `src/index.ts`.
2. Extend `tsconfig.base.json` in `packages/<name>/tsconfig.json`.
3. Add path aliases to `tsconfig.base.json` and every Vite config that
   consumes it.
