# SC-8C9 Phase 3 — Authoritative Dashboard Metrics + Safe Plan Hydration

## 1. Objective

This phase completes two goals:

A. Make dashboard health/security/optimization metrics authoritative from the existing `scan_core` scan result and remediation state.

B. Safely support navigation from persisted dashboard history to the corresponding `ResultsView` review state when a valid `plan_id` exists.

No new scan engine, remediation engine, automatic remediation, resume, or rollback was introduced. No SC-8C10 work was started.

## 2. Authoritative dashboard metrics

### 2.1 Legacy metric sources replaced

`DashboardPageV2.tsx` previously derived its scan-relevant surfaces from `DashboardViewModel`:

- `state.healthScanHistory` (legacy health-scan history)
- `generateRecommendations(...)` (legacy, independently computed recommendations)
- `state.healthScanStep` (legacy health-scan state machine)

These have been replaced by the existing `useDashboardScan()` hook, which surfaces the canonical `scan_core` session or persisted history via `DashboardScanSnapshot`.

### 2.2 What is now scan_core authoritative

The following dashboard surfaces now reflect `scan_core` data:

- `isScanning` and the **Improve Health** button label from `snapshot.scanStatus`
- **Last Scan** card from `snapshot.hasActiveSession`, `snapshot.scanStatus`, `snapshot.completedAt`, and `snapshot.issuesFound`
- **Top Recommendation** card from `snapshot.canReview` and `snapshot.actionableCount`
- **Recent Activity** timeline from `snapshot.moduleName`, `snapshot.issuesFound`, `snapshot.actionableCount`, and `snapshot.scanStatus`
- `DashboardScanStatusCard` (existing from Phase 1) from `snapshot` and `useDashboardScan`

### 2.3 What was not replaced

The **Health Score** gauge on `DashboardPageV2` continues to use `DashboardViewModel.state.healthScore`. This score is not scan-derived; it is calculated from real-time system metrics (CPU, memory, storage, security state, privacy risk count, Windows update/Defender state) by `calculateHealthScore`. The phase objective was to make **scan-derived** metrics authoritative, so the legacy health score remains the appropriate source for system health.

### 2.4 No frontend scoring engine

No new formula such as `100 - findings * X` was added. Counts displayed are exactly the `matches`, `actionable`, `blocked`, `review`, and `not_fixable` values supplied by the backend through `dashboardAdapter.ts`. The frontend remains a presentation layer.

### 2.5 Files changed for metrics

- `apps/pc-optimizer/src/features/dashboard/DashboardPageV2.tsx`
  - Removed `useIsPro`, `useEditionLimits`, `RecommendationCard`, and `generateRecommendations` usage
  - Added `useDashboardScan` and `snapshot`
  - Replaced `Last Scan`, `Top Recommendation`, `Recent Activity`, and button state with `snapshot` data

## 3. Safe plan hydration

### 3.1 Architecture

```text
DashboardScanStatusCard
        ↓  canReview + planId
navigate to /ai-smart-optimize?planId=<id>
        ↓
ScanView detects planId query param
        ↓
PlanReviewView
        ↓
usePlanDetails -> scan_core.scan.plan_details
        ↓
ResultsView + useResults (prepare/validate/approve/execute/rollback)
```

### 3.2 Backend RPC added

- `backend/src/avs_backend/scan_core/orchestration/orchestrator.py`
  - `ScanOrchestrator.get_plan_details(plan_id)`
  - Loads the persisted `ActionPlan` from `ActionPlanRepository`
  - Returns `plan_id`, `generated_at`, `is_stale`, `statistics`, and `findings`
  - Maps `RemediationAction` fields to `ScanFinding` fields without exposing `canonical_path`, `asset_id`, `target`, or `backup_location`
  - Returns `{ok: False, error: 'Plan not found'}` for missing/deleted plans

- `backend/src/avs_backend/scan_core_rpc/__init__.py`
  - `scan_core.scan.plan_details` registered RPC

- `packages/shared/src/rpc/index.ts`
  - `SCAN_CORE_SCAN_PLAN_DETAILS`

### 3.3 Frontend plan hydration

- `apps/pc-optimizer/src/features/scan/scan.service.ts`
  - Added `plan_details(planId)` method

- `apps/pc-optimizer/src/features/scan/usePlanDetails.ts`
  - Read-only hook that calls `scan_core.scan.plan_details`
  - Maps backend response to `ScanFinding[]` and `ScanStatistics`
  - Returns `loading`, `error`, `findings`, `statistics`, `isStale`

- `apps/pc-optimizer/src/features/scan/PlanReviewView.tsx`
  - New component that renders `ResultsView` from a persisted `plan_id`
  - Shows safe "Results no longer available" state for invalid/missing plans
  - Does not start scans or execute remediation

- `apps/pc-optimizer/src/features/scan/ScanView.tsx`
  - Detects `?planId=` query param with `useSearchParams`
  - Renders `PlanReviewView` when a plan ID is present
  - `onClose` clears the query param and falls back to the scan start UI

- `apps/pc-optimizer/src/features/scan/components/DashboardScanStatusCard.tsx`
  - `Review Findings`/`Approve & Fix`/`View Rollback` navigation now appends `?planId=<id>`

### 3.4 Safety guarantees

- No `ActionPlan` is fabricated in React.
- No actionability is recomputed in React.
- No plan/finding data is stored in `localStorage`/`sessionStorage`.
- Raw target paths, `asset_id`, and `backup_location` are not exposed in the plan details response.
- `ResultsView` still uses `useResults`, which calls `scan_core.remediation.prepare` only when the user clicks `Review & Remediate`, then `validate`, then `approve` before `execute`.
- Stale plans are flagged with `is_stale`; the existing `RemediationCoordinator` validation remains the authoritative stale/reject gate.
- Missing or invalid plans produce a safe error UI.
- Navigation does not automatically call `prepare`, `execute`, or `rollback`.

## 4. Active vs persisted precedence

`useDashboardScan` continues to prefer:

1. Active in-memory `unifiedScanState` session
2. Persisted `scan_core` latest history
3. Idle state

`ScanView` only renders `PlanReviewView` when the URL explicitly contains `planId`; it does not start a new scan merely because history is unavailable.

## 5. Tests

### New tests

- `backend/tests/test_sc8c9_phase3_plan_hydration.py`
  - `test_plan_details_hydrates_findings_and_statistics`
  - `test_plan_details_no_raw_path_data`
  - `test_plan_details_missing_plan_returns_safe_error`
  - `test_plan_details_is_read_only`

- `apps/pc-optimizer/src/features/scan/__tests__/planHydration.test.tsx`
  - `hydrates findings from a valid persisted plan_id`
  - `does not expose canonical_path or target data in hydrated findings`
  - `prepares the plan before remediation without automatic execution`
  - `shows a safe unavailable state for a missing plan`

### Updated tests

- `apps/pc-optimizer/src/features/scan/__tests__/scan.test.tsx`
  - Wrapped `ScanView` renders in `MemoryRouter` to support the new `useSearchParams` usage.

### Validation results

- `yarn typecheck` — pass
- `yarn lint` — pass (max-warnings=0)
- `npx vitest run src/features/scan/__tests__/ src/features/dashboard/__tests__/` — **188 passed**
- `yarn build` — pass
- `python -m pytest -q` (backend full suite) — **1244 passed, 14 skipped**

### Security search

Searched affected production code for:
- `orchestrator.fullAsync` / `orchestrator.optimize`
- `security.remediation`
- `localStorage` / `sessionStorage`
- `child_process` / `PowerShell` / `reg.exe` / `fs.` / `writeFile` / `unlink` / `rmtree`

No new unsafe production usage. Remaining `localStorage` references are the legacy `avs-developer-mode` flag and `ScanStatePersistence.ts` cleanup, which do not store remediation or plan data.

## 6. Changed files

### Frontend

- `apps/pc-optimizer/src/features/dashboard/DashboardPageV2.tsx`
- `apps/pc-optimizer/src/features/scan/ScanView.tsx`
- `apps/pc-optimizer/src/features/scan/scan.service.ts`
- `apps/pc-optimizer/src/features/scan/usePlanDetails.ts` (new)
- `apps/pc-optimizer/src/features/scan/PlanReviewView.tsx` (new)
- `apps/pc-optimizer/src/features/scan/components/DashboardScanStatusCard.tsx`
- `apps/pc-optimizer/src/features/scan/__tests__/scan.test.tsx`
- `apps/pc-optimizer/src/features/scan/__tests__/planHydration.test.tsx` (new)

### Backend

- `backend/src/avs_backend/scan_core/orchestration/orchestrator.py`
- `backend/src/avs_backend/scan_core_rpc/__init__.py`

### Shared

- `packages/shared/src/rpc/index.ts`

### Report

- `apps/pc-optimizer/SC8C9_PHASE3_METRICS_AND_PLAN_HYDRATION_REPORT.md` (this file)

## 7. Limitations

- `DashboardViewModel` still contains the legacy `healthScore` calculation, which is a real-time system-health score and not scan-derived. It was intentionally kept because it is the canonical source for that non-scan metric.
- `UnifiedOptimizeFlow.tsx` remains as a deprecated no-op component and is no longer rendered.
- `ScanStatePersistence.ts` still exists; it is only used for defensive `clearScanState` cleanup and not for active scan persistence.
- `PlanReviewView` displays sanitized findings derived from `RemediationAction` metadata. If richer `ScanFinding` fields (e.g., `rule_category`, `severity`) are later required, they must come from additional backend `RuleResult` persistence rather than heuristics.

## 8. Explicit non-goals

- No new scan engine.
- No new remediation engine.
- No automatic remediation.
- No automatic resume.
- No automatic rollback.
- No SC-8C10 work.
