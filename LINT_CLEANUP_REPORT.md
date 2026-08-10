# Lint Cleanup Report

## CI Build Fix — ESLint Violations & Dead Code Audit

---

## 1. Root Cause

During the IndexedDB migration and UI simplification refactor, several lint violations were introduced:

1. **`prefer-const` in `pythonBridge.ts`**: `reconnectCallbacks` was declared with `let` but never reassigned — only pushed to and iterated.
2. **Unused import in `SmartOptimizationPage.tsx`**: `Cog6ToothIcon` was imported but never used after the Settings/Configuration section was removed during UI simplification.
3. **Empty block statements in `avsWithIDB.ts`**: `catch {}` blocks without comments triggered `no-empty` lint errors.
4. **`no-explicit-any` in `avsWithIDB.ts`**: `idbGetAll<any>()` used `any` instead of a typed parameter.
5. **Unused import in `DeferredCleanupStore.ts`**: `idbCleanup` was imported but never used.
6. **Stale tests**: 10 tests across 3 files still asserted on `localStorage` keys that were migrated to IndexedDB.

---

## 2. Files Modified

### Production Code

| File | Change |
|---|---|
| `apps/pc-optimizer/electron/ipc/pythonBridge.ts` | `let reconnectCallbacks` → `const reconnectCallbacks` (line 89) |
| `apps/pc-optimizer/src/features/smart-optimization-ai/SmartOptimizationPage.tsx` | Removed unused `Cog6ToothIcon` import |
| `apps/pc-optimizer/src/features/health/DeferredCleanupStore.ts` | Removed unused `idbCleanup` import |
| `apps/pc-optimizer/src/services/avsWithIDB.ts` | Added comments to empty `catch` blocks; replaced `any` with typed `Record<string, unknown>` intersection |

### Test Code

| File | Change |
|---|---|
| `apps/pc-optimizer/src/features/maintenance-engine/__tests__/maintenanceEngine.test.ts` | Added `vi.mock` for `avsWithIDB`; updated 3 crash recovery tests to use async `init()` and mock IDB store; added `await` to 4 `ExecutionStore.init()` calls |
| `apps/pc-optimizer/src/features/maintenance-history/__tests__/maintenanceHistory.test.ts` | Added `vi.mock` for `avsWithIDB`; updated 3 tests to verify IndexedDB persistence instead of `localStorage` |
| `apps/pc-optimizer/src/features/dashboard/__tests__/SmartOptimization.test.ts` | Added `vi.mock` for `avsWithIDB`; updated 4 session persistence tests to use async `loadSession()` and mock IDB store |

---

## 3. Dead Code Removed

| Item | File | Reason |
|---|---|---|
| `Cog6ToothIcon` import | `SmartOptimizationPage.tsx` | Settings section removed during UI simplification |
| `idbCleanup` import | `DeferredCleanupStore.ts` | Not called — cleanup handled by `idbCleanupAll()` on startup |

### Audit Results (No Issues Found)

The following files were audited for unused imports, variables, functions, state, callbacks, unreachable code, and duplicate imports — all clean:

- `src/services/avsWithIDB.ts`
- `src/features/unified-results/useScanHistory.ts`
- `src/features/dashboard/ScanStatePersistence.ts`
- `src/features/dashboard/sessionPersistence.ts`
- `src/features/dashboard/DashboardViewModel.ts`
- `src/features/maintenance-engine/executionEngine.ts`
- `src/features/maintenance-engine/executionStore.ts`
- `src/features/maintenance-history/executionHistoryRepository.ts`
- `src/features/system-health-dashboard/healthTimeline.ts`
- `src/main.tsx`
- `src/features/security-dashboard/SecurityCenterPage.tsx`
- `src/features/smart-optimization-ai/SmartOptimizationPage.tsx` (after fix)

---

## 4. Validation Results

| Check | Command | Result |
|---|---|---|
| ESLint | `yarn lint` | 0 errors, 0 warnings |
| TypeScript | `yarn typecheck` | 0 errors |
| Tests | `yarn test` | 8001 passed, 0 failed (120 files) |
| Build | `yarn build:pc-optimizer` | Successful (built in 16.91s) |

---

## 5. Reconnect Logic Verification

The `reconnectCallbacks` variable in `pythonBridge.ts`:

- **Before**: `let reconnectCallbacks: ReconnectCallback[] = []`
- **After**: `const reconnectCallbacks: ReconnectCallback[] = []`
- **Usage**: Array is mutated via `.push()` (line 283) and iterated via `for...of` (line 210) — never reassigned
- **Impact**: None — `const` arrays can still be mutated via push/forEach. Reconnect logic is unchanged.
