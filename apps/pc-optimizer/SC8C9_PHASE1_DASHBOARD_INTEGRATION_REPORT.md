# SC-8C9 Phase 1 — Dashboard Integration Foundation Report

## Objective

Establish the production integration foundation that makes the hardened SC-8C8 unified `scan_core` scan/remediation workflow available to the main dashboard and other application-level views as a single, coherent, read-only security/health status. This phase does not add new scan engines, remediation engines, or automatic execution; it only exposes and adapts the existing authoritative pipeline.

## Architecture Inspected

The following existing SC-8C8 components were inspected before any changes:

- `apps/pc-optimizer/src/features/scan/scan.service.ts` — `scan_core.scan.*` RPC bridge.
- `apps/pc-optimizer/src/features/scan/remediation.service.ts` — `scan_core.remediation.*` RPC bridge.
- `apps/pc-optimizer/src/features/scan/useScan.ts` — `scan_core` polling and result handling.
- `apps/pc-optimizer/src/features/scan/useResults.ts` — remediation preview, validation, approval, execution, and rollback state.
- `apps/pc-optimizer/src/features/scan/ScanView.tsx` and `ResultsView.tsx` — shared scan/review UI.
- `apps/pc-optimizer/src/features/scan/types.ts` and `unified-scan` types.
- `apps/pc-optimizer/src/features/dashboard/DashboardPageV2.tsx` — existing dashboard layout and cards.
- `apps/pc-optimizer/src/features/dashboard/DashboardViewModel.ts` — existing health/scan history state (legacy orchestrator-based path unchanged).
- Page re-exports: `DashboardPage`, `ProtectionCenterPage`, `SecurityCenterPage`, `SmartOptimizationPage`.

## Files Changed

### New files

| File | Purpose |
|------|---------|
| `apps/pc-optimizer/src/features/scan/unifiedScanState.ts` | In-memory, transient canonical scan session state. No browser storage. |
| `apps/pc-optimizer/src/features/scan/dashboardAdapter.ts` | Read-only adapter from `AppScanSession` to `DashboardScanSnapshot`. |
| `apps/pc-optimizer/src/features/scan/useDashboardScan.ts` | Hook that returns the latest snapshot without calling any backend RPC. |
| `apps/pc-optimizer/src/features/scan/components/DashboardScanStatusCard.tsx` | Dashboard card using `useDashboardScan`; only action is navigation. |
| `apps/pc-optimizer/src/features/scan/__tests__/dashboardScan.test.tsx` | Phase 1 regression and integration tests. |

### Modified files

| File | Change |
|------|--------|
| `apps/pc-optimizer/src/features/scan/useScan.ts` | Publishes scan starts, progress, completions, cancellations, and errors to `unifiedScanState`. |
| `apps/pc-optimizer/src/features/scan/useResults.ts` | Publishes preview, validation, execution, rejection, and rollback state to `unifiedScanState`. |
| `apps/pc-optimizer/src/features/scan/index.ts` | Exports the new public adapter/hook/card. |
| `apps/pc-optimizer/src/features/dashboard/DashboardPageV2.tsx` | Renders `<DashboardScanStatusCard />` on the dashboard. |

No backend files were modified.

## New/Updated Data Contracts

### `AppScanSession` (`unifiedScanState.ts`)

A canonical in-memory session object that mirrors the backend-driven scan lifecycle:

- `sessionId`, `module`, `mode`, `status`
- `startedAt`, `completedAt`
- `result`, `statistics` (from `scan_core.scan.result`)
- `planId`, `preview`, `validation`, `rollbackSupported`
- `executionId`, `execution`, `remediationStatus`
- `rollbackSummary`, `error`

### `DashboardScanSnapshot` (`dashboardAdapter.ts`)

A read-only dashboard-facing view model:

- `hasActiveSession`
- `module`, `moduleName`, `moduleRoute`
- `scanStatus`, `remediationStatus`
- `issuesFound`, `actionableCount`, `blockedCount`, `reviewCount`, `notFixableCount`
- `planId`, `executionId`, `rollbackAvailable`
- `canReview`, `canApprove`, `canRollback`, `error`

All counts are derived from `ScanStatistics` returned by the backend. No count or score is invented in React.

### `unifiedScanState` service

- `getLatest()`, `setLatest()`, `updateLatest()`, `clear()`, `subscribe()`
- Synchronous, in-memory, single-source-of-truth for the latest session.
- No persistence to `localStorage`, `sessionStorage`, IndexedDB, or any browser storage.

## Dashboard Integration

`DashboardPageV2` now renders `<DashboardScanStatusCard />` below the existing `Last Scan` and `Recommendation` cards. The card:

- Shows the latest unified module, scan status, issue counts, and any error.
- Displays a primary action label: `Start a Scan`, `Review Findings`, `Approve & Fix`, or `View Rollback`.
- Clicking the action uses `useNavigate` to route to the appropriate module page (`/protection-center`, `/ai-smart-optimize`, `/ai-smart-security`).
- Does not start scans, execute remediation, or perform rollback automatically.

## Scan-Session Behavior

- `useScan` calls `unifiedScanState.setLatest(...)` when a scan starts.
- `useScan` calls `unifiedScanState.updateLatest(...)` on every `scan_core.scan.status` poll while scanning.
- `useScan` calls `unifiedScanState.updateLatest(... status: 'complete' ...)` after `scan_core.scan.result`, storing the backend `action_plan_id`, `statistics`, and `scan_id`.
- Cancelling or erroring a scan updates `unifiedScanState` to `cancelled` or `error`.
- `DashboardScanStatusCard` never calls `scan_core.scan.quick`, `scan_core.scan.full`, or any scan start method on mount or re-render.

## Result / History Integration

- Results from `scan_core.scan.result` are mirrored into `unifiedScanState` only when a real scan completes.
- No separate persistence layer was introduced.
- The dashboard consumes the same backend values (issue counts, actionable counts, etc.) that `ResultsView` uses, ensuring a single data contract.

## Remediation-State Handling

`useResults` now publishes each remediation step into `unifiedScanState`:

- `prepare` success: `remediationStatus: 'preparing'`, stores `preview` and `rollbackSupported`.
- `validate` success: `remediationStatus: 'awaiting_approval'`, stores `validation`.
- `approve` success: `remediationStatus: 'executing'`, stores `executionId` and `execution`.
- `approve` rejected: `remediationStatus: 'rejected'`, stores the reason.
- execution-polling terminal: `remediationStatus` becomes `completed`, `partial`, `failed`, `cancelled`, etc., with the latest `execution`.
- `confirmRollback` success/partial/failure: `remediationStatus` becomes `rollback_success`, `rollback_partial`, or `rollback_failed`, storing `rollbackSummary`.
- `initiateRollback` when rollback is unavailable: `remediationStatus: 'rollback_unavailable'`.

The adapter then derives `rollbackAvailable`, `canReview`, `canApprove`, and `canRollback` from these backend-provided values.

## Security Boundaries

- The dashboard card remains pure presentation/orchestration.
- It does not call `orchestrator.fullAsync`, `orchestrator.optimize`, `security.remediation.*`, `child_process`, `PowerShell`, `reg.exe`, or any filesystem API.
- It does not construct `ActionPlans`, compute actionability, or bypass `SafetyGate`.
- It does not approve, execute, or roll back remediation automatically.
- The only permitted remediation paths are the unchanged `scan_core.remediation.*` RPCs in `remediation.service.ts`.
- `unifiedScanState` is in-memory only; durable scan/remediation state remains backend-owned.

## Tests Added

`apps/pc-optimizer/src/features/scan/__tests__/dashboardScan.test.tsx` covers:

1. Idle snapshot when no session exists.
2. Adapter preserves backend counts from `ScanStatistics`.
3. Rejected execution is represented without fabricated values.
4. Completed execution with rollback available maps correctly.
5. `DashboardScanStatusCard` does not call `scan_core.scan.quick/full` on mount or re-render.
6. `DashboardScanStatusCard` does not call `scan_core.remediation.execute`.
7. Completed scan with issues offers `Review Findings`.
8. No legacy `orchestrator.optimize`, `orchestrator.fullAsync`, `security.remediation.*` RPCs are introduced.

## Validation Results

| Command | Result |
|---------|--------|
| `yarn typecheck` (apps/pc-optimizer) | **Passed** |
| `yarn lint` (apps/pc-optimizer) | **Passed** |
| `npx vitest run src/features/scan/__tests__/` | **69 passed** |
| `npx vitest run src/features/dashboard/__tests__/` | **112 passed** |
| `yarn build` (apps/pc-optimizer) | **Passed** |
| `python -m pytest -q` (backend) | **1237 passed, 14 skipped, 1 failed** |

### Backend test failure

- `tests/test_cleaning_engine.py::test_clean_stress_ten_thousand_files[10000]` exceeded its `count/1000.0` second threshold (`22.6s` vs `10.0s`).
- This is an unrelated pre-existing performance-threshold test. It was not introduced or modified by Phase 1 work and is outside the scope of this phase.

### Security search

A grep of `apps/pc-optimizer/src/features/scan` and the modified `DashboardPageV2.tsx` found no new production usage of `orchestrator.*`, `security.remediation.*`, `localStorage`, `sessionStorage`, `child_process`, `PowerShell`, `reg.exe`, or direct filesystem APIs. The only remaining `orchestrator.fullAsync` and `localStorage` references in `DashboardViewModel.ts` are pre-existing legacy code that was intentionally not touched in this phase.

## Remaining Limitations

- `DashboardViewModel.ts` still contains the legacy orchestrator-based health-scan path (`orchestrator.fullAsync`, `localStorage` persistence). Removal/replacement is deferred to a later SC-8C9 phase.
- Cross-page continuity is limited to navigation; opening a module page from the dashboard still starts `ScanView` in its idle state. Carrying an active `planId` directly into `ResultsView` is deferred.
- The `unifiedScanState` is not persisted to backend storage; on app restart the dashboard shows no recent unified scan until a new one is run. Backend history/list APIs can be added later without changing this adapter.
- Health/security/optimization scores from `scan_core` are not aggregated in this phase; the dashboard still uses the existing health score card from `DashboardViewModel`.

## Items Intentionally Deferred to Later SC-8C9 Phases

- Replacement of the legacy `DashboardViewModel` orchestrator path with `scan_core`.
- Backend `scan_core` history/list RPC for persistent cross-session dashboard state.
- Aggregation of `scan_core` findings into a single health/security score.
- Cross-page state hydration (auto-open `ResultsView` from dashboard).
- SC-8C10 and beyond.

## Conclusion

SC-8C9 Phase 1 delivers a read-only, scan_core-backed dashboard foundation. The dashboard now exposes the latest unified scan and remediation state without starting scans automatically, without duplicating scan or remediation engines, and without introducing unsafe production patterns. All Phase 1 validation passes, and work on SC-8C10 was not started.
