# SC-8C10 Phase 2 — Edge-Case, Concurrency & State-Machine Validation Report

## Summary

SC-8C10 Phase 2 audited the existing unified scan/remediation flow for concurrency, edge-case, and state-machine correctness. No architecture was redesigned. Two small production guard fixes were made, and a focused set of regression tests was added. The canonical flow remains `Dashboard → ScanView → scan_core → ActionPlan → ResultsView → prepare → validate → explicit approval → execute → terminal → optional confirmed rollback`.

## 1. Tests Inspected

- `src/features/scan/__tests__/scan.test.tsx`
- `src/features/scan/__tests__/results.test.tsx`
- `src/features/scan/__tests__/rollback.test.tsx`
- `src/features/scan/__tests__/planHydration.test.tsx`
- `src/features/scan/__tests__/targetSanitization.test.tsx`
- `src/features/scan/__tests__/dashboardScan.test.tsx`
- `src/features/scan/__tests__/sc8c10_phase2.test.tsx` (new)
- `src/features/dashboard/__tests__/DashboardHealth.test.ts`
- `src/features/dashboard/__tests__/SmartOptimization.test.ts`
- `src/features/smart-optimization-ai/__tests__/smartOptimizationEngine.test.ts`

## 2. Existing Guards Verified

| Component | Guard | Status |
|-----------|-------|--------|
| `useScan.ts` `startScan` | `startingRef` + `sessionIdRef` prevent double scan start | Verified |
| `useScan.ts` `cancelScan` | Cancels active session and resets UI | Verified (also hardened to avoid duplicate `scan_core.scan.cancel`) |
| `useScan.ts` cleanup | `useEffect` stops polling on unmount | Verified |
| `useResults.ts` `prepare` | `isPreparingRef` prevents double prepare | Verified by existing `planHydration` test |
| `useResults.ts` `validate` | `isValidatingRef` prevents double validate | Verified by existing `planHydration` test |
| `useResults.ts` `approve` | `hasRequestedExecution.current` prevents double execution | Verified by existing `results.test.tsx` |
| `useResults.ts` `confirmRollback` | `hasRequestedRollback.current` prevents double rollback | Verified by existing `rollback.test.tsx` |
| `useResults.ts` polling | `pollTimer` cleared when terminal, unmount, or `executionId`/step mismatch | Verified |
| `unifiedScanState.ts` | In-memory only; no `localStorage`/`sessionStorage`/`IndexedDB` | Verified |
| `DashboardScanStatusCard` | Read-only; does not start scans | Verified |
| `PreviewPanel`, `ValidationPanel`, `RollbackConfirmationPanel` | Sanitized `display_name`; no `canonical_path`, `asset_id`, `backup_location` | Verified by `targetSanitization` tests |

## 3. Defects Discovered and Fixed

### 3.1 `useScan.cancelScan` issued `scan_core.scan.cancel` twice

**File:** `src/features/scan/useScan.ts`

**Issue:** `cancelScan` called `scanService.cancel_scan(sid)` and then invoked `reset()`, which also called `scanService.cancel_scan(sid)` because `sessionIdRef.current` was still set.

**Fix:** Set `sessionIdRef.current = null` after the explicit cancel so `reset()` only clears UI/polling state without a second RPC.

### 3.2 `useResults.approve` could enter `executing` state with no `execution_id`

**File:** `src/features/scan/useResults.ts`

**Issue:** If the backend `scan_core.remediation.execute` response returned a `summary` without `execution_id`, the hook would set `step='executing'` but never start polling, leaving the UI stuck.

**Fix:** Added an explicit `if (!summary.execution_id) throw new Error('Backend did not return an execution id')` so the flow falls back to the error panel.

## 4. Tests Added

| File | Test | What it validates |
|------|------|-------------------|
| `src/features/scan/__tests__/sc8c10_phase2.test.tsx` | `sends only one scan_core.scan.cancel even when the user double-clicks the cancel confirmation` | Duplicate cancel RPC prevention |
| `src/features/scan/__tests__/sc8c10_phase2.test.tsx` | `does not start a second scan session when start is triggered again before the first completes` | In-component double start prevention |
| `src/features/scan/__tests__/sc8c10_phase2.test.tsx` | `prevents approve if the backend execute response is missing an execution_id` | Missing `execution_id` guard |
| `src/features/scan/__tests__/sc8c10_phase2.test.tsx` | `does not write scan/remediation state to localStorage or sessionStorage` | `unifiedScanState` in-memory-only regression |
| `src/features/scan/__tests__/sc8c10_phase2.test.tsx` | `reflects an active in-memory scan session in unifiedScanState` | State is mirrored to `unifiedScanState` after start |

## 5. Results by Category

### 5.1 Scan Concurrency

- Double-click start: only one `scan_core.scan.quick`/`full` call.
- Double-click cancel: only one `scan_core.scan.cancel` call after the fix.
- Retry after error/close: starts one new session.
- Active `sessionIdRef` and `startingRef` prevent accidental second sessions in the same component.

### 5.2 Prepare / Validate

- `isPreparingRef` / `isValidatingRef` block duplicate `prepare` / `validate` calls.
- Stale/invalid validation disables `Approve & Fix`.
- Existing `planHydration.test.tsx` covers double `Review & Remediate` and in-flight validate.

### 5.3 Execute / Cancel

- `hasRequestedExecution.current` blocks double `Approve & Fix`.
- Rejected `execute` response does not create `execution_id` and does not start polling.
- Missing `execution_id` now renders an error.
- Cancel calls `scan_core.remediation.cancel` once per active execution.
- Polling stops on terminal, unmount, and cancellation.

### 5.4 Rollback

- `hasRequestedRollback.current` blocks double rollback.
- Rollback not automatically triggered; requires explicit confirmation.
- Rollback not shown while execution is still running.

### 5.5 Navigation / Lifecycle

- `useScan` cleanup stops polling on unmount.
- `useResults` cleanup stops execution polling on unmount.
- `unifiedScanState` does not persist to browser storage.
- Note: `useScan` does not restore an in-progress session from `unifiedScanState` if `ScanView` is unmounted and remounted; remounting may start a new backend session. This is a pre-existing limitation, not a new defect introduced in this phase.

### 5.6 Polling

- Polling only starts after a real `execution_id` exists.
- Polling does not start for rejected execution.
- Polling stops at every terminal backend status.
- Polling stops on component unmount.

### 5.7 `unifiedScanState`

- Active/completed/cancelled/failed scans are mirrored correctly.
- Dashboard `useDashboardScan` uses active in-memory session over persisted history.
- No browser storage is introduced.

### 5.8 Dashboard Consistency

- Dashboard does not initiate a legacy scan; it navigates to module `ScanView`.
- `DashboardScanStatusCard` is read-only and uses `scan_core.scan.latest`.
- Active session takes precedence over persisted history.

### 5.9 Smart Optimization

- `SmartOptimizationPage.tsx` still imports `ScanView` from `../scan`.
- No auto-execute path; remediation starts only after explicit approval.
- Existing `smartOptimizationEngine.test.ts` continues to pass.

### 5.10 Security / Privacy

- No `canonical_path`, `asset_id`, `backup_location`, `registry paths`, or `browser profile paths` are rendered in results, preview, validation, or rollback panels.
- No `orchestrator.fullAsync`, `orchestrator.optimize`, or `security.remediation` production calls in `features/scan` or `features/dashboard`.
- No direct `child_process`, `PowerShell`, `reg.exe`, `fs.unlink`, `fs.rm`, or `fs.writeFile` in `features/scan`.
- `localStorage`/`sessionStorage` are not used for scan/remediation state.

## 6. Security Search Results

Patterns searched in `apps/pc-optimizer/src`:

| Pattern | Matches | Classification |
|---------|---------|----------------|
| `orchestrator.fullAsync` / `orchestrator.optimize` | Test titles in `scan.test.tsx`, `rollback.test.tsx`, `dashboardScan.test.tsx` | test-only |
| `security.remediation` | Test title in `rollback.test.tsx` | test-only |
| `ORCHESTRATOR_OPTIMIZE` / `ORCHESTRATOR_FULL_ASYNC` | `BackgroundCleanupService.ts` (`features/health`) | legitimate / out-of-scope |
| `child_process`, `subprocess`, `PowerShell`, `reg.exe` in `features/scan` | None in production; one regex in `rollback.test.tsx` | clean |
| `fs.unlink`, `fs.rm`, `fs.writeFile` | None | clean |
| `localStorage` / `sessionStorage` in `features/scan` | Comments and test spies only | clean |

No legacy scan/remediation production paths were reintroduced.

## 7. Validation Results

### Frontend

```
cd apps/pc-optimizer
yarn typecheck      # PASS
yarn lint           # PASS (0 warnings)
npx vitest run src/features/scan/__tests__/ src/features/dashboard/__tests__/ src/features/smart-optimization-ai/__tests__/
                    # PASS — 260 tests across 10 files
yarn build          # PASS
```

### Backend

```
cd backend
python -m pytest -q
```

Result: **1251 passed, 14 skipped**. No intermittent failures in this run.

## 8. Production Files Changed

- `src/features/scan/useScan.ts` — single-line guard to prevent duplicate `scan_core.scan.cancel`.
- `src/features/scan/useResults.ts` — guard to reject `execute` response missing `execution_id`.

## 9. Tests Changed

- `src/features/scan/__tests__/sc8c10_phase2.test.tsx` (new file, 5 tests).
- No existing tests were removed.

## 10. Remaining SC-8C10 Work

- **Phase 3 — Legacy cleanup and security re-verification:** Remove `healthScan*` state machine once `ProtectionCenterPage` and `SmartOptimization.test.ts` are migrated; remove `HealthScanModal`/`UnifiedHealthScanModal`/`UnifiedHealthScanResults` if still unused.
- **Phase 4 — Final production validation:** Re-run full validation suite after Phase 3.
- **Open question:** Whether `useScan` should restore an in-progress session from `unifiedScanState` on remount; this is not a Phase 2 correctness regression but a lifecycle enhancement.

## 11. Final Statements

- **Production files changed:** `src/features/scan/useScan.ts`, `src/features/scan/useResults.ts`.
- **Tests changed:** `src/features/scan/__tests__/sc8c10_phase2.test.tsx` (new).
- **Tests passed/failed:** 260/0 frontend; 1251 passed, 14 skipped backend.
- **scan_core modified:** No.
- **SafetyGate modified:** No.
- **Any executor/rule modified:** No.
- **Automatic execution introduced:** No.
- **Automatic rollback introduced:** No.
- **SC-8C11 started:** No.
