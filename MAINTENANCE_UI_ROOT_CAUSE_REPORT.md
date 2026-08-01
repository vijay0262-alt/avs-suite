# Root Cause Report: maintenance-ui Test Suite Regression

## Date: 2025-08-01

## Summary

The `maintenanceUi.test.tsx` test suite (41 tests) failed in CI with:

```
Error: A React Element from an older version of React was rendered. This is not supported.
```

All 20 component-rendering tests failed. The 21 hook-only tests passed because
they don't render JSX from external `.tsx` components.

---

## Root Cause

**Three compounding issues in the root Vitest configuration:**

### 1. Missing `@vitejs/plugin-react` in root `vitest.config.ts`

The root `vitest.config.ts` had no Vite plugins configured. The
`apps/pc-optimizer/vite.config.ts` includes `plugins: [react()]` for
development builds, but Vitest uses the **root** config, not the app-level
config.

Without `@vitejs/plugin-react`, Vite could not properly transform JSX in
`.tsx` files imported by tests. When the test dynamically imported
`../components/AnalyticsCards.tsx` (which uses JSX), the transform fell back
to a generic esbuild path that produced incompatible React element types.

This is the **primary cause** of the "older version of React" error.

### 2. Missing `react/jsx-runtime` in `resolve.dedupe`

The `dedupe: ['react', 'react-dom']` array (added in a prior session) ensured
`react` and `react-dom` resolved to a single copy. However, `react/jsx-runtime`
— the module that `@vitejs/plugin-react` imports for the automatic JSX runtime
(`jsx: "react-jsx"` in `tsconfig.base.json`) — was not deduplicated.

In a yarn workspace with `apps/customer-portal` depending on `react@19.0.0`
and `apps/pc-optimizer` depending on `react@^18.2.0`, the `react/jsx-runtime`
subpath could resolve to the React 19 copy from `customer-portal`'s nested
`node_modules`, while the test code used React 18 from the root
`node_modules`. This version mismatch produced React elements created by
React 19's `jsx-runtime` being rendered by React 18's `react-dom`, triggering
the "older version of React" error.

### 3. Missing `IS_REACT_ACT_ENVIRONMENT` and deprecated `act` import

The test file imported `act` from `react-dom/test-utils` (deprecated since
React 18). Additionally, `IS_REACT_ACT_ENVIRONMENT` was never set, causing
React to emit warnings on every `act()` call:

```
Warning: The current testing environment is not configured to support act(...)
```

While these were warnings (not failures), they indicate a misconfigured test
environment that could mask real issues.

---

## Monorepo Dependency Landscape

| Location | react version | react-dom version | Notes |
|---|---|---|---|
| Root `node_modules/` | 18.3.1 | 18.3.1 | Hoisted from `pc-optimizer` |
| `apps/pc-optimizer/` | `^18.2.0` (declared) | `^18.2.0` (declared) | No nested copy — uses root |
| `apps/customer-portal/` | `19.0.0` (declared) | `19.0.0` (declared) | Has nested `node_modules/react@19.0.0` |
| `frontend/` | `19.0.0` (declared) | `19.0.0` (declared) | No nested copy — uses root |
| `packages/ui/` | peerDep `^18.2.0` | peerDep `^18.2.0` | No own React |

The `customer-portal` nested `react@19.0.0` is the source of the
`react/jsx-runtime` version mismatch.

---

## Changes Made

### 1. `vitest.config.ts` — Added `@vitejs/plugin-react` plugin

```diff
+import react from '@vitejs/plugin-react';
 ...
 export default defineConfig({
+  plugins: [react()],
   resolve: {
     ...
-    dedupe: ['react', 'react-dom'],
+    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
   },
   test: {
     ...
+    setupFiles: ['./vitest.setup.ts'],
   },
 });
```

### 2. `vitest.setup.ts` — New file

```ts
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
```

Sets the global flag React 18 checks to confirm `act()` is supported.

### 3. `apps/pc-optimizer/src/features/maintenance-ui/__tests__/maintenanceUi.test.tsx` — Fixed `act` import

```diff
-import React from 'react';
-import { createRoot } from 'react-dom/client';
-import { act } from 'react-dom/test-utils';
+import React, { act } from 'react';
+import { createRoot } from 'react-dom/client';
```

### 4. `package.json` — Added `@vitejs/plugin-react` to root devDependencies

```diff
     "@types/node": "^22.0.0",
+    "@vitejs/plugin-react": "^4.2.1",
```

The package was already hoisted to root `node_modules` from
`apps/pc-optimizer/devDependencies`, but it was not declared as a root
devDependency. Adding it makes the dependency explicit.

---

## Verification

| Check | Result |
|---|---|
| `maintenanceUi.test.tsx` | 41/41 passed, 0 warnings |
| `yarn test` (full suite) | 106 files, 7199 tests, all passed |
| `yarn lint` | Clean, 0 errors, 0 warnings |
| `tsc -b --noEmit` | Clean, 0 errors |

---

## Why This Was Not Caught Locally

On the developer's machine, `yarn install` hoisted `react@18.3.1` to root
`node_modules`, and the `dedupe` config was sufficient to make tests pass
locally. The CI environment (GitHub Actions on Linux) may resolve
dependencies differently, causing `react/jsx-runtime` to resolve from the
`customer-portal` nested `node_modules/react@19.0.0`. The missing
`@vitejs/plugin-react` plugin was masked because esbuild's built-in JSX
transform happened to work for simple cases but produced incompatible
elements for component tests.
