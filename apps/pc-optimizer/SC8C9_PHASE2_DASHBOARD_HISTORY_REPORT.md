# SC-8C9 Phase 2 — Remove Legacy Dashboard Scan Path + Persistent Scan History

## 1. Objective

This phase removes the legacy `DashboardViewModel` scan/history path and adds a thin, read-only persistent `scan_core` history API so the dashboard can display the latest scan after application restart. No new scan engine, remediation engine, or automatic remediation was introduced.

## 2. What changed

### 2.1 Legacy dashboard scan path removed

Production dashboard code can no longer initiate or render a full health scan:

- `apps/pc-optimizer/src/features/dashboard/DashboardPageV2.tsx`
  - Removed the `useLocation`/`UnifiedOptimizeFlow` wiring.
  - Removed the mount `useEffect` that called `vm.startHealthScan('dashboard', isPro)`.
  - Changed the primary **Improve Health** button to navigate to `/ai-smart-optimize` instead of starting a scan.
  - Removed the `<UnifiedOptimizeFlow ... />` render block.

- `apps/pc-optimizer/src/features/dashboard/DashboardViewModel.ts`
  - `startHealthScan` no longer calls the orchestrator pipeline.
  - Removed `runOrchestratorFullScan`, `runFullSystemScan`, `cancelFullSystemScan`, `finishHealthScan`, `runHealthScan`, `finalizeOrchestratorResults`, `resumeInterruptedScan`, `discardInterruptedScan`, `persistScanState`, and the `interruptedScan` persistence logic.
  - Removed `orchestratorService`, `fullSystemScanService`, `buildVerificationReport`, `saveSession`, and related simulation data.
  - Removed the `Full System Scan` section and its state.

- `apps/pc-optimizer/src/features/dashboard/components/UnifiedOptimizeFlow.tsx`
  - Deprecated; now a no-op component. The dashboard no longer renders it.

- `apps/pc-optimizer/src/features/dashboard/DashboardViewModel.ts` bootstrap
  - Removed `detectInterruptedScan` and the `ScanStatePersistence` resume path.
  - Dashboard no longer reads/writes in-progress scan state on startup.

### 2.2 Persistent scan history

A thin, read-only history layer was added over the existing `scan_core` metadata database:

- `backend/src/avs_backend/scan_core/metadata/scan_history_repository.py` (new)
  - `ScanHistoryRepository` using `MetadataDatabase`.
  - `get_latest()` and `list_recent(limit)` returning minimal persisted scan metadata.
  - No raw findings, paths, registry keys, or target payloads are returned.

- `backend/src/avs_backend/scan_core/metadata/database.py`
  - Schema/index support for scan history metadata.

- `backend/src/avs_backend/scan_core/orchestration/orchestrator.py`
  - Persists scan metadata on completion/cancellation/error.

- `backend/src/avs_backend/scan_core_rpc/__init__.py`
  - `scan_core.scan.latest`
  - `scan_core.scan.history`

- `packages/shared/src/rpc/index.ts`
  - `SCAN_CORE_SCAN_LATEST`
  - `SCAN_CORE_SCAN_HISTORY`

- `apps/pc-optimizer/src/features/scan/scan.service.ts`
  - `latest()` and `history()` methods using the new RPC constants.

- `apps/pc-optimizer/src/features/scan/dashboardAdapter.ts`
  - Maps both active `AppScanSession` and persisted `PersistedScanRecord` to `DashboardScanSnapshot`.
  - Does not recompute actionability, scores, or findings.

- `apps/pc-optimizer/src/features/scan/useDashboardScan.ts`
  - Active `unifiedScanState` session takes precedence.
  - Falls back to `scan_core.scan.latest` when no active in-memory session exists.
  - Loads read-only; does not start scans, execute remediation, resume, or rollback.

## 3. Architecture

```text
scan_core.ScanOrchestrator
        ↓
persistent ActionPlan / scan result metadata
        ↓
scan_core.scan.latest / history RPC
        ↓
frontend scan.service.ts
        ↓
dashboardAdapter.ts
        ↓
DashboardScanStatusCard / dashboard history UI
```

## 4. History response contract (minimal)

- `scan_id`
- `scan_type` (`quick` | `full`)
- `started_at`, `completed_at`, `duration_ms`
- `completed`, `cancelled`, `error_count`
- `findings_count`, `actionable_count`, `review_count`, `blocked_count`, `not_fixable_count`
- `action_plan_id` (when available)
- No raw findings, target payloads, file paths, registry keys, browser data, or command lines.

## 5. Privacy / data minimization

- History returns only persisted metadata from `MetadataDatabase`.
- Raw target data, user/machine identifiers, filesystem paths, and remediation payloads are never exposed.
- The dashboard adapter does not interpret raw findings or derive new scores.

## 6. Precedence and safety rules

1. Active in-memory `unifiedScanState` wins.
2. If no active session, persisted `latest` is shown.
3. Empty history renders idle state.
4. Persisted incomplete remediation is never auto-executed.
5. Dashboard does not resume interrupted execution or auto-rollback.
6. `unifiedScanState` remains transient in-memory state.

## 7. Restart behavior

- Fresh application state loads the latest persisted scan from `scan_core` history.
- Dashboard mount does not call `scan_core.scan.quick`, `scan_core.scan.full`, or any remediation method.
- The **Improve Health** button navigates to `ScanView`; the scan only starts when the user explicitly triggers it there.

## 8. Tests

### Backend

- `backend/tests/test_sc8c9_phase2_scan_history.py`
  - Latest history, recent ordered history, empty history, cancelled, failed, completed with `plan_id`, privacy/no raw data, read-only behavior, repository reuse, and invalid records.
  - Result: **6 passed**.

- Full backend suite: `python -m pytest -q`
  - **1243 passed, 14 skipped, 1 failed**
  - The one failure is `test_clean_stress_ten_thousand_files[10000]` in `tests/test_cleaning_engine.py`, an unrelated performance-threshold failure not addressed in this phase.

### Frontend

- `npx vitest run apps/pc-optimizer/src/features/scan/__tests__/ apps/pc-optimizer/src/features/dashboard/__tests__/`
  - **6 test files, 184 tests passed**
- `yarn typecheck` — passed
- `yarn lint` — passed (max-warnings=0)
- `yarn build` — passed

## 9. Security search

Affected production code was searched for:
- `orchestrator.fullAsync` / `orchestratorService.fullAsync` / `orchestrator.optimize`
- `localStorage` / `sessionStorage` for scan state
- `child_process`, `PowerShell`, `reg.exe`, `fs.`, `writeFile`, `unlink`, `rmtree`

No new unsafe usage was introduced in the dashboard. Legacy `orchestrator.fullAsync` calls have been removed from `DashboardViewModel` and `DashboardPageV2`. Dashboard mount no longer persists or recovers scan state.

## 10. Limitations

- `ScanStatePersistence.ts` still exists as a file, but the `DashboardViewModel` no longer writes to it (only `clearScanState` is invoked on cancel/close for defensive cleanup).
- `UnifiedOptimizeFlow.tsx` remains as a deprecated no-op to avoid deleting a tracked file; it is not rendered by `DashboardPageV2`.
- Review navigation for persisted history with a `plan_id` is not yet safe because the frontend does not hydrate `ResultsView` from a persisted plan. The UI shows the persisted status but the user must start a new scan from `ScanView` to review and remediate.
- No new health score aggregation from `scan_core` findings was added.

## 11. Explicit non-goals

- No new scan engine.
- No new remediation engine.
- No automatic remediation.
- No automatic resume.
- No automatic rollback.
- No SC-8C10 work.
