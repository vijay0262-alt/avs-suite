# SC-8C8 Part 1 Remediation — Duplicate Scan Flow Elimination

## Summary
Removed all page-level, legacy scan-entry buttons from the three AI module pages and made `features/scan/ScanView/useScan` the single, UI-owned scan entry point. Added guard/reset/cancel protections to `useScan`, an optional `buttonLabel` prop to `ScanView`, and regression tests for the duplicate-start and scan-only contracts.

## Files Changed

1. `apps/pc-optimizer/src/features/scan/ScanView.tsx`
   - Added `buttonLabel?: string` prop; idle start button now uses `buttonLabel` or falls back to `Start {mode} Scan`.
   - `data-testid="scan-start-btn"` is preserved.
   - `UnifiedScanView.onClose` now invokes `scan.reset()` before the parent `onClose`, so the idle card reappears for retry without unmounting.

2. `apps/pc-optimizer/src/features/scan/useScan.ts`
   - Added `startingRef` and `sessionIdRef` guards: `startScan` returns early if a start is in-flight or a session is already active.
   - Added `reset()` that cancels any active session via `scanService.cancel_scan(sessionIdRef.current)`, stops the poll, and clears all state/refs.
   - Exposed `reset` and `sessionId` in the hook return.
   - `cancelScan()` now delegates to `reset()`.
   - Cancelled backend status now triggers `reset()` instead of the old `hookCancelScan()`.

3. `apps/pc-optimizer/src/features/protection-center/components/ProtectionCenterPage.tsx`
   - Removed the page's `Scan Now` button and `handleScanNow` / `dashVm.startHealthScan` path.
   - Replaced with `<ScanView module="protection" mode="full" buttonLabel="Scan Now" onClose={() => {}} />`.
   - Removed the conditional `dashState.healthScanStep !== 'idle'` scan view and the now-unused `isScanning` flag.
   - Kept `dashState.healthScanHistory` for the last-scan summary card and other `dashVm`/`vm` uses.

4. `apps/pc-optimizer/src/features/smart-optimization-ai/SmartOptimizationPage.tsx`
   - Removed the `handleSmartOptimize` button and `dashVm.startHealthScan` path.
   - Removed the dashboard ViewModel wiring that only served the legacy scan.
   - Replaced with `<ScanView module="optimize" mode="quick" buttonLabel="Scan & Optimize" onClose={() => {}} />`.
   - Smart Optimize remains scan-only (backed by `scanService.fullAsync(..., true)`); no optimize execution is triggered by the scan.

5. `apps/pc-optimizer/src/features/security-dashboard/SecurityCenterPage.tsx`
   - Replaced the primary top-right `Scan Now` button with `<ScanView module="security" mode="full" buttonLabel="Run Security Scan" onClose={() => {}} />`.
   - Removed all JSX calls to `vm.startScan()` and `vm.setScanMode()`:
     - Top header `Scan Now`
     - Scan tab sidebar `Start Scan` / `Cancel Scan`
     - `ScanIdleView` start button
     - Summary `Scan Again`
     - Threats empty-state `Run Quick Scan`
     - Investigations empty-state `Run Full Scan`
     - Navigation-state `setScanMode` side effect
   - Removed `PlayIcon` / `StopIcon` imports.

6. `apps/pc-optimizer/src/features/scan/__tests__/scan.test.tsx`
   - Added spy on `orchestratorService.optimize`.
   - Added regression tests:
     - Double-click creates only one `fullAsync` call.
     - Cancel invokes `orchestratorService.cancel` with the returned `sessionId` and never calls `optimize`.
     - Retry after close/error creates exactly one additional session (total 2 `fullAsync` calls).
     - All three modules expose the same `scan-start-btn`.
     - Every `fullAsync` call uses `scanOnly: true` and `optimize` is never called.

## How the Single Entry Point is Guaranteed

- **UI layer:** All three module pages now render a single `ScanView` instance as the user-facing start/scan UI.
- **Hook layer:** `useScan` owns the active `sessionId` and refuses to start a second session while `startingRef` or `sessionIdRef` is set.
- **Service layer:** `scan.service.ts` calls `orchestratorService.fullAsync(profile, true)`; `optimize` is never invoked by any scan code path.
- **Reset/cancel:** `onClose` (complete/error) and the footer `Cancel` both call `reset()`, which cancels the backend session and clears the UI state so the same `ScanView` can be reused.

## Validation Results

| Command | Result |
|---|---|
| `cd apps/pc-optimizer && yarn typecheck` | **Pass** — exit code 0, completed in 27.31s. |
| `cd apps/pc-optimizer && yarn lint` | **Pass** — exit code 0, completed in 35.43s. |
| `npx vitest run apps/pc-optimizer/src/features/scan/__tests__/scan.test.tsx` | **Pass** — 14/14 tests passed. |
| `cd apps/pc-optimizer && yarn build` | **Pass** — exit code 0, completed in 55.75s. |
| `cd backend && python -m pytest -q` | **Pass** — 1222 passed, 14 skipped in 547.26s. |

## Notes

- `apps/pc-optimizer/src/features/scan/` and `SC8C8_PART1_UNIFIED_SCAN_UI_REPORT.md` were already present as untracked Part-1 artifacts and were not modified.
- `SecurityCenterViewModel.startScan()` / `setScanMode()` methods remain intact; only their JSX triggers were removed, preserving any other page or backend tests that depend on the ViewModel shape.
