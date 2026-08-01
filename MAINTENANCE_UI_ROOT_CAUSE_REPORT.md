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

## Investigation Steps

### Step 1: `yarn why react` / `yarn why react-dom`

**Before fix:**
```
=> Found "react@19.0.0"
   Hoisted from "_project_#@avs#customer-portal#react"
=> Found "@avs/pc-optimizer#react@18.3.1"
   This module exists because "_project_#@avs#pc-optimizer" depends on it.
```

**Two React versions existed in the workspace:**
- `react@19.0.0` — from `apps/customer-portal` (hoisted to root on CI)
- `react@18.3.1` — from `apps/pc-optimizer` (nested on CI, hoisted on dev machine)

### Step 2: Workspace package.json audit

| Package | react | react-dom | Section |
|---|---|---|---|
| `apps/pc-optimizer` | `^18.2.0` | `^18.2.0` | dependencies |
| `apps/customer-portal` | `19.0.0` → **FIXED to `^18.2.0`** | `19.0.0` → **FIXED to `^18.2.0`** | dependencies |
| `frontend` | `19.0.0` | `19.0.0` | dependencies (NOT in workspace) |
| `packages/ui` | `^18.2.0` | `^18.2.0` | peerDependencies ✓ |

**`apps/customer-portal` declared `react@19.0.0` — the only workspace package
with React 19. This is the source of the duplicate.**

### Step 3: Vite config inspection

- `apps/pc-optimizer/vite.config.ts` — has `plugins: [react()]`, no `dedupe`
- Root `vitest.config.ts` — was missing `plugins: [react()]` and
  `react/jsx-runtime` in `dedupe`

Without `@vitejs/plugin-react`, JSX in `.tsx` components was transformed by
esbuild's default transform, which imports `react/jsx-runtime`. With two React
versions installed, `react/jsx-runtime` could resolve to React 19 while
`react-dom` resolved to React 18.

### Step 4: tsconfig inspection

- `jsx: "react-jsx"` (automatic runtime) ✓
- No `jsxImportSource` (defaults to `react`) ✓
- `moduleResolution: "Bundler"` ✓
- Paths alias `@avs/*` to source ✓

No issues found.

### Step 5: maintenance-ui import tracing

Dynamically imported components (all local `.tsx`):
- `../components/AnalyticsCards.tsx` — imports `@heroicons/react`, `@avs/ui`
- `../components/HistoryTable.tsx` — imports `@heroicons/react`, `@avs/ui`
- `../components/ExecutionDetailDialog.tsx` — imports `@heroicons/react`, `@avs/ui`, `../../undo`
- `../components/ReportsView.tsx`
- `../components/EmptyState.tsx`, `ErrorState.tsx`, `StatusBadge.tsx`, `SourceBadge.tsx`

None import from another workspace, prebuilt dist, or compiled output.
All are source `.tsx` files within `apps/pc-optimizer/src/`.

### Step 6: Shared UI package inspection

`packages/ui/package.json`:
- React is `peerDependencies: "^18.2.0"` ✓
- Not bundled, not in `dependencies` ✓
- Exports point to `src/index.ts` (source) ✓

No issue found.

### Step 7: Build output inspection

- `apps/pc-optimizer/dist/` exists but is not imported by tests
- `packages/ui/dist/` does not exist
- No compiled JSX or old dist folders are imported

No issue found.

### Step 8: Comparison with passing Dashboard test

`DashboardHealth.test.ts` (passes) vs `maintenanceUi.test.tsx` (fails):

| Aspect | DashboardHealth.test.ts | maintenanceUi.test.tsx |
|---|---|---|
| File extension | `.ts` (no JSX) | `.tsx` (JSX in test) |
| Component rendering | Inline `React.createElement` only | Dynamic `import()` of `.tsx` components |
| JSX transform needed | No (uses `React.createElement`) | Yes (components use JSX) |
| External `.tsx` imports | None | `AnalyticsCards.tsx`, `HistoryTable.tsx`, etc. |

**The key difference:** `maintenanceUi.test.tsx` dynamically imports `.tsx`
components that require JSX transformation. When `@vitejs/plugin-react` was
missing from the root vitest config, the JSX transform produced elements via
`react/jsx-runtime` that could resolve to a different React version than
`react-dom`, causing the "older version of React" error.

The Dashboard test never triggered this because it uses `React.createElement`
directly (no JSX transform needed) and only renders inline components.

---

## Root Cause

**`apps/customer-portal/package.json` declared `react@19.0.0` and
`react-dom@19.0.0` as dependencies, creating a second, incompatible React
version in the yarn workspace.**

Yarn 1's hoisting is non-deterministic across environments. On the developer's
machine, `react@18.3.1` (from `pc-optimizer`) was hoisted to root
`node_modules/react`. In CI, `react@19.0.0` (from `customer-portal`) could be
hoisted to root instead.

When React 19 is hoisted to root:
1. `react/jsx-runtime` at root = React 19's jsx-runtime
2. `react-dom` in `apps/pc-optimizer/node_modules` = React 18's react-dom
3. `@vitejs/plugin-react` transforms `.tsx` JSX → `react/jsx-runtime` (React 19)
   creates elements
4. `react-dom/client`'s `createRoot` (React 18) tries to render them
5. → **"A React Element from an older version of React was rendered"**

This was compounded by the root `vitest.config.ts` missing
`@vitejs/plugin-react` (no proper JSX transform) and missing
`react/jsx-runtime` in `dedupe`.

---

## Changes Made

### 1. `apps/customer-portal/package.json` — Aligned React to ^18.2.0

```diff
-    "react": "19.0.0",
-    "react-dom": "19.0.0",
+    "react": "^18.2.0",
+    "react-dom": "^18.2.0",
```

```diff
-    "@types/react": "19.0.0",
-    "@types/react-dom": "19.0.0",
+    "@types/react": "^18.2.66",
+    "@types/react-dom": "^18.2.22",
```

**This is the root cause fix.** Next.js 15 supports React 18.3+, so this is
a safe alignment. This eliminates the duplicate React version.

### 2. `package.json` (root) — Added `resolutions` to enforce single React

```diff
+  "resolutions": {
+    "react": "18.3.1",
+    "react-dom": "18.3.1"
+  },
```

This prevents any future dependency from accidentally introducing a different
React version. Yarn `resolutions` overrides all nested dependency resolutions
to the specified version.

### 3. `vitest.config.ts` — Added `@vitejs/plugin-react` and `react/jsx-runtime` dedupe

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

Ensures proper JSX transform and deduplication of `react/jsx-runtime` as a
defense-in-depth measure.

### 4. `vitest.setup.ts` — New file for `IS_REACT_ACT_ENVIRONMENT`

```ts
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
```

### 5. `maintenanceUi.test.tsx` — Fixed deprecated `act` import

```diff
-import React from 'react';
-import { createRoot } from 'react-dom/client';
-import { act } from 'react-dom/test-utils';
+import React, { act } from 'react';
+import { createRoot } from 'react-dom/client';
```

### 6. `package.json` (root) — Added `@vitejs/plugin-react` to devDependencies

```diff
+    "@vitejs/plugin-react": "^4.2.1",
```

---

## Verification

**After fix:**
```
yarn why react
=> Found "react@18.3.1"
   Hoisted from "_project_#@avs#customer-portal#react"
   Hoisted from "_project_#@avs#pc-optimizer#react"
```

**Exactly ONE React version.** No nested copies in `apps/customer-portal/node_modules`.

| Check | Result |
|---|---|
| `yarn why react` | Single version: 18.3.1 |
| `yarn why react-dom` | Single version: 18.3.1 |
| `maintenanceUi.test.tsx` | 41/41 passed |
| `yarn test` (full suite) | 106 files, 7199 tests, all passed |
| `yarn lint` | Clean, 0 errors, 0 warnings |
| `tsc -b --noEmit` | Clean, 0 errors |

---

## Why This Was Not Caught Locally

On the developer's Windows machine, yarn hoisted `react@18.3.1` (from
`pc-optimizer`) to root `node_modules/react`. The nested
`react@19.0.0` in `apps/customer-portal/node_modules/react` existed but Vite's
`dedupe` config was sufficient to avoid resolving from it.

In CI (GitHub Actions on Linux), yarn's hoisting order differed —
`react@19.0.0` (from `customer-portal`) was hoisted to root
`node_modules/react`, and `react@18.3.1` was nested in
`apps/pc-optimizer/node_modules/react`. This caused `react/jsx-runtime` to
resolve to React 19 while `react-dom` resolved to React 18, producing the
"A React Element from an older version of React was rendered" error.
