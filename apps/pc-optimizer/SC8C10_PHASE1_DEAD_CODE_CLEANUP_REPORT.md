# SC-8C10 Phase 1 — Dead Code Cleanup Report

## Summary

SC-8C10 Phase 1 removed the dead and deprecated scan/remediation artifacts that were identified in the Phase 1 inspection and the SC-8C10 specification. The canonical `scan_core` architecture remains untouched. No new engines, executors, or RPC contracts were added.

## Files Deleted

| File | Why it was deleted |
|------|-------------------|
| `apps/pc-optimizer/src/features/dashboard/components/UnifiedOptimizeFlow.tsx` | Deprecated in SC-8C9 Phase 2; always returned `null` and was not imported anywhere in `src`. |
| `apps/pc-optimizer/src/features/dashboard/ScanStatePersistence.ts` | Legacy IndexedDB scan-state persistence for the old dashboard scan flow. No longer reached from `DashboardPageV2` or the unified `ScanView`. |
| `apps/pc-optimizer/src/features/orchestrator/orchestrator.service.ts` | Legacy `OptimizationOrchestrator` frontend wrapper. No production imports in `src`; only negative-assertion tests imported it. |
| `apps/pc-optimizer/src/features/orchestrator/index.ts` | Barrel file for the removed `orchestrator.service.ts`; the directory became empty and was removed. |

## Files Changed (not deleted)

| File | What changed |
|------|-------------|
| `apps/pc-optimizer/src/features/dashboard/DashboardViewModel.ts` | Removed `ScanStatePersistence` and `PersistedScanState` imports; removed the `clearPersistedScanState` method and its call in `cancelHealthScan`; removed the dead `interruptedScan` and `showInterruptedScanPrompt` state; replaced the `ScanProfile` type import from `orchestrator.service.ts` with a local `type ScanProfile = 'dashboard' | 'optimize' | 'protection'`. |
| `apps/pc-optimizer/src/features/scan/__tests__/scan.test.tsx` | Removed `orchestratorService` import, `vi.spyOn` calls, and `expect(...orchestratorService...).not.toHaveBeenCalled()` assertions. The test still asserts that the view calls `scan_core` RPCs, not the legacy orchestrator. |
| `apps/pc-optimizer/src/features/scan/__tests__/results.test.tsx` | Same as above. |
| `apps/pc-optimizer/src/features/scan/__tests__/rollback.test.tsx` | Same as above. |

## Files Retained (with reason)

| File/State | Why it was kept |
|------------|-----------------|
| `apps/pc-optimizer/src/features/dashboard/DashboardViewModel.ts` `healthScan*` state machine and methods | `ProtectionCenterPage.tsx` still reads `dashState.healthScanHistory[0]` to display the last security scan summary. `SmartOptimization.test.ts` still exercises `startHealthScan`, `cancelHealthScan`, `closeHealthScan`, and `healthScanStep`. Removing this state would break real UI and existing tests without a dedicated migration. |
| `apps/pc-optimizer/src/features/health/BackgroundCleanupService.ts` | It contains a call to `RPC_METHODS.ORCHESTRATOR_OPTIMIZE`, but it is part of the `health` feature, not the scan/remediation flow, and was not in the SC-8C10 Phase 1 target list. It is classified as a pre-existing, out-of-scope legacy call. |
| `apps/pc-optimizer/src/features/dashboard/components/HealthScanModal.tsx`, `UnifiedHealthScanModal.tsx`, `UnifiedHealthScanResults.tsx` | Not in the Phase 1 target list and not imported by active `ScanView`/`DashboardPageV2` code. Left for a later, dedicated cleanup phase. |

## References Found Before Deletion

### `UnifiedOptimizeFlow.tsx`
- Only references were the file itself and SC-8C9/SC-8C8 historical reports.
- No import in `src` tree other than the file itself.

### `ScanStatePersistence.ts`
- Imported by `DashboardViewModel.ts` only for `clearScanState` and `PersistedScanState`.
- `loadScanState` and `saveScanState` were not called anywhere in `src`.

### `orchestrator.service.ts`
- Imported only by:
  - `DashboardViewModel.ts` for the `ScanProfile` type.
  - `scan/__tests__/scan.test.tsx`.
  - `scan/__tests__/results.test.tsx`.
  - `scan/__tests__/rollback.test.tsx`.
- No production source file imported `orchestratorService` or called `orchestratorService.fullAsync` / `orchestratorService.optimize`.

### `DashboardViewModel.ts` `interruptedScan` / `showInterruptedScanPrompt`
- Only set to default values and never read or updated by any method in `src` after the `ScanStatePersistence` resume path was removed in SC-8C9 Phase 2.

## Canonical Flow Verification

After cleanup, the only production scan/remediation entry points remain:

| Module | Evidence |
|--------|----------|
| Protection Center | `ProtectionCenterPage.tsx` imports `ScanView` from `../../scan` at line 15. |
| Smart Optimization | `SmartOptimizationPage.tsx` imports `ScanView` from `../scan` at line 22. |
| Security Center | `SecurityCenterPage.tsx` imports `ScanView` from `../scan` at line 63. |
| Dashboard | `DashboardPageV2.tsx` does not start a legacy scan; it displays the `DashboardScanStatusCard` and navigates to module `ScanView`. |

The end-to-end flow `ScanView → scan_core.ScanOrchestrator → ActionPlan → ResultsView → RemediationCoordinator.prepare → validate → approve → execute → terminal state → confirmed rollback` was not modified.

## Security Search Results

Patterns searched in `apps/pc-optimizer/src`:

| Pattern | Result | Classification |
|---------|--------|----------------|
| `orchestratorService` | No matches in `src` (after deletion). | dead/removed |
| `orchestrator.fullAsync` / `orchestrator.optimize` | Found only in test `it()` descriptions in `scan/__tests__/*.test.tsx`. The assertions now use `mockCall` with `SCAN_CORE` RPCs. | test-only |
| `security.remediation` | Found only in `rollback.test.tsx` test description. | test-only |
| `orchestratorService` import | None. | dead/removed |
| `ORCHESTRATOR_OPTIMIZE` / `ORCHESTRATOR_FULL_ASYNC` | Found in `BackgroundCleanupService.ts` (`features/health`, out of scope) and in `scan/__tests__/*` negative assertions. | legitimate/out-of-scope and test-only |
| `localStorage` / `sessionStorage` for scan/remediation | Only in `unifiedScanState.ts` comment stating it is **not** persisted. `DashboardViewModel` still uses `localStorage` only for `avs-developer-mode`. | clean |
| `child_process`, `PowerShell`, `reg.exe` in `features/scan` | No matches in `features/scan` production code. Security modules contain `PowerShell` references for detection, not scan/remediation execution. | not applicable |
| Direct filesystem/registry/browser mutation from `features/scan` | No production code found. `scan.service.ts` uses `window.avs.rpc.call` to `scan_core.scan.*` and `scan_core.remediation.*`. | clean |

No legacy `orchestrator.fullAsync` / `orchestrator.optimize` production path was reintroduced.

## Validation Results

### Frontend

```
cd apps/pc-optimizer
yarn typecheck      # PASS
yarn lint           # PASS (0 warnings)
npx vitest run src/features/scan/__tests__/ src/features/dashboard/__tests__/ src/features/smart-optimization-ai/__tests__/
                    # PASS — 255 tests across 9 files
yarn build          # PASS
```

### Backend

```
cd backend
python -m pytest -q
```

Result:
- 1250 passed
- 14 skipped
- 1 failed

The single failure was `tests/test_sc8c4_part1_execution_engine.py::TestEdgeCases::test_10k_dry_run_performance`:

```
AssertionError: Executor took 26728.5ms
assert 26728.47259999253 < 10000.0
```

This is an unrelated performance threshold test. Re-running it in isolation:

```
python -m pytest -q tests/test_sc8c4_part1_execution_engine.py::TestEdgeCases::test_10k_dry_run_performance
```

Result: **1 passed in 133.83s**. It is an intermittent environmental slowdown; the threshold was not modified.

## Tests Changed

- `src/features/scan/__tests__/scan.test.tsx`
- `src/features/scan/__tests__/results.test.tsx`
- `src/features/scan/__tests__/rollback.test.tsx`

No new tests were added. The negative-assertion `orchestratorService` spies and expectations were removed because the legacy service itself was deleted.

## Remaining SC-8C10 Work

- **Phase 2 — Edge cases and concurrency validation:** Add/extend tests for rapid navigation, stale/missing plan, and in-flight guards. Not started.
- **Phase 3 — Legacy cleanup and security re-verification:** Remove the `healthScan*` state machine once `ProtectionCenterPage` and `SmartOptimization.test.ts` are migrated, and remove `HealthScanModal`/`UnifiedHealthScanModal`/`UnifiedHealthScanResults` if they remain unused. Not started.
- **Phase 4 — Final production validation:** Re-run full validation suite after Phases 2 and 3. Not started.

## Unresolved Open Questions

1. **Smart Optimization integration:** `SmartOptimizationPage` still uses a separate `executionHandler.ts` that dispatches to legacy module services. The spec leaves this for a later phase; it was not touched in Phase 1.
2. **Pause/resume:** `useUnifiedScan.ts` pause/resume remains UI-only. No backend `scan_core.scan.pause` contract exists. Left unchanged per Phase 1 instructions.
3. **`healthScan*` state machine:** Partially retained because `ProtectionCenterPage` and `SmartOptimization.test.ts` still depend on `healthScanHistory` and the related methods. Full removal is deferred to a later phase.
4. **`BackgroundCleanupService.ts` `ORCHESTRATOR_OPTIMIZE` call:** Pre-existing call in the `health` feature, outside the scan/remediation flow. Left as a known out-of-scope item.

## Final Statements

- **Production files changed:** `DashboardViewModel.ts`, `UnifiedOptimizeFlow.tsx` (deleted), `ScanStatePersistence.ts` (deleted), `orchestrator.service.ts` (deleted), `orchestrator/index.ts` (deleted).
- **Files deleted:** `UnifiedOptimizeFlow.tsx`, `ScanStatePersistence.ts`, `orchestrator.service.ts`, `orchestrator/index.ts`, empty `features/orchestrator` directory.
- **Tests changed:** `scan.test.tsx`, `results.test.tsx`, `rollback.test.tsx`.
- **Tests passed/failed:** 255/0 frontend; 1250 passed, 14 skipped, 1 unrelated intermittent backend failure (passes in isolation).
- **Existing architecture redesigned:** No. The canonical `scan_core` flow was preserved.
- **SC-8C11 started:** No.
