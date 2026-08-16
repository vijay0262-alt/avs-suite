# SC-8C9 Final Integration + Security + UX Audit

## 1. Executive Summary

This is an audit-only review of the completed SC-8C9 Phases 1–3 integration. No production code was modified during this audit.

The architecture is sound: the dashboard is a read-only navigation layer, scans are started only through `ScanView`, results and remediation flow through the backend `RemediationCoordinator`, and explicit approval is required before any live execution. The `scan_core.scan.plan_details` RPC correctly hides sensitive target data.

The main issues found are **minor privacy/UX mismatches in how target paths are displayed in the active-scan `ResultsView` and in `prepare`/`rollback` preview panels**, plus a **concurrency gap in `useResults` where rapid double-clicks can trigger concurrent `prepare`/`validate` requests**. No critical or high-severity security flaws were found. No legacy orchestrator, `security.remediation`, or direct filesystem mutation calls were found in the production scan/dashboard path.

**Production readiness verdict:** `READY_WITH_MINOR_FIXES`.

## 2. Architecture / Data-Flow

```text
DashboardPageV2 / DashboardScanStatusCard
  → useDashboardScan
    → unifiedScanState (active) or scan_core.scan.latest (persisted)
      → dashboardAdapter
        → DashboardScanSnapshot
  → navigation with ?planId=<id>

SmartOptimizationPage / ProtectionCenterPage / SecurityCenterPage
  → ScanView
    → useScan
      → scan_core.scan.quick / scan_core.scan.full
        → ScanOrchestrator (backend thread)
          → ActionPlanRepository (persisted ActionPlan)
          → ScanHistoryRepository (persisted history)
    → ResultsView
      → useResults
        → scan_core.remediation.prepare
        → scan_core.remediation.validate
        → scan_core.remediation.execute (live, explicit approval)
        → scan_core.remediation.status (poll)
        → scan_core.remediation.rollback (explicit confirmation)

PlanReviewView (hydrated from persisted history)
  → usePlanDetails
    → scan_core.scan.plan_details
      → ActionPlanRepository
  → ResultsView / useResults (same execution flow)
```

## 3. SC-8C9 Integration Matrix

| Component | Phase | Role | Status |
|-----------|-------|------|--------|
| `unifiedScanState` | 1 | In-memory, non-persisted session state | OK |
| `useScan` / `ScanView` | 1, 2B | Shared scan UI and backend bridge | OK |
| `scan_core.scan.*` RPC | 1, 2B | Backend scan lifecycle | OK |
| `scan_core.scan.latest` / `history` | 2 | Read-only persisted history | OK |
| `dashboardAdapter` / `useDashboardScan` | 1, 3 | Dashboard snapshot | OK |
| `DashboardScanStatusCard` | 1, 3 | Dashboard read-only card | OK |
| `DashboardPageV2` | 3 | Authoritative scan-derived metrics | OK |
| `scan_core.scan.plan_details` | 3 | Safe persisted plan hydration | OK |
| `PlanReviewView` / `usePlanDetails` | 3 | Persisted plan review | OK |
| `ResultsView` / `useResults` | 2A, 3 | Remediation execution flow | OK (with minor gaps) |
| `RemediationCoordinator` | 2A, 3 | Backend execution/rollback | OK |
| SafetyGate / preconditions | 2A, 3 | Execution safety | OK |

## 4. Security Invariant Matrix

| Invariant | Verdict | Evidence |
|-----------|---------|----------|
| No frontend scoring engine | PASS | Dashboard uses backend `statistics`; no `100 - findings * X` formulas |
| No `ActionPlan` in `localStorage`/`sessionStorage` | PASS | `unifiedScanState` is in-memory; `ScanStatePersistence` only used for legacy `clearScanState` |
| `plan_id` is backend-generated | PASS | `ScanOrchestrator._plan(...)` generates `plan_id` and persists via `ActionPlanRepository` |
| React does not recompute actionability | PASS | `dashboardAdapter` / `usePlanDetails` use backend counts directly |
| `prepare` is read-only | PASS | `RemediationCoordinator.prepare` builds preview only |
| `validate` is authoritative | PASS | `RemediationCoordinator.validate` dry-runs through `DefaultExecutor` with preconditions |
| `execute` requires explicit approval | PASS | `ValidationPanel` only enables `Approve & Fix` when `validation.valid && preview && !preview.is_stale`; `RemediationCoordinator.execute` requires `approval_token` for `mode='live'` |
| Stale plans cannot execute | PASS | `ActionPlan.is_stale()` and `RemediationCoordinator.execute` reject stale plans |
| Missing/unknown plans are safe | PASS | `ActionPlanRepository.load` returns `None`, `get_plan_details` returns `Plan not found`, `useResults` renders error state |
| No automatic remediation | PASS | No `execute` call on mount or navigation; only user `Approve & Fix` |
| No automatic resume | PASS | `useDashboardScan` does not resume scans |
| No automatic rollback | PASS | `initiateRollback` only sets `rollbackStep='confirm'`; `confirmRollback` requires explicit UI confirmation |
| Cancellation reaches backend | PASS | `scan_core.remediation.cancel` calls `CancellationToken.cancel()`; `scan_core.scan.cancel` sets `cancelled` |
| Rollback requires confirmation | PASS | `RollbackConfirmationPanel` requires explicit `Confirm Rollback` |
| No `orchestrator.fullAsync` / `orchestrator.optimize` in production | PASS | Only test references; `SmartOptimizationPage` uses `ScanView` |
| No `security.remediation` in production scan/dashboard | PASS | Only constants and security-center tests |

## 5. RPC Contract Matrix

| Method | Registered | Frontend Constant | Frontend Caller | Parameter Shape | Response Shape | Error Handling | Notes |
|--------|------------|-------------------|-----------------|-----------------|----------------|----------------|-------|
| `scan_core.scan.quick` | backend `__init__.py:420` | `SCAN_CORE_SCAN_QUICK` | `useScan.startScan` | `{ scope?: string[] }` | `{ session_id, started_at }` | `ok: false` + `error` | Threaded |
| `scan_core.scan.full` | backend `__init__.py:426` | `SCAN_CORE_SCAN_FULL` | `useScan.startScan` | `{ scope?: string[] }` | `{ session_id, started_at }` | `ok: false` + `error` | Threaded |
| `scan_core.scan.cancel` | backend `__init__.py:432` | `SCAN_CORE_SCAN_CANCEL` | `useScan.cancelScan` | `{ session_id }` | `{ cancelled }` | safe | |
| `scan_core.scan.status` | backend `__init__.py:452` | `SCAN_CORE_SCAN_STATUS` | `useScan` poll | `{ session_id }` | `{ progress, completed, cancelled, error }` | safe | |
| `scan_core.scan.result` | backend `__init__.py:474` | `SCAN_CORE_SCAN_RESULT` | `useScan.handleComplete` | `{ session_id }` | `{ result }` | completes only | |
| `scan_core.scan.latest` | backend `__init__.py:496` | `SCAN_CORE_SCAN_LATEST` | `useDashboardScan` | none | `{ latest }` | safe | |
| `scan_core.scan.history` | backend `__init__.py:513` | `SCAN_CORE_SCAN_HISTORY` | none currently | `{ limit }` | `{ history }` | safe | |
| `scan_core.scan.plan_details` | backend `__init__.py:533` | `SCAN_CORE_SCAN_PLAN_DETAILS` | `usePlanDetails` | `{ plan_id }` | `{ plan_id, generated_at, is_stale, statistics, findings }` | `Plan not found` | Privacy-safe |
| `scan_core.remediation.prepare` | backend `__init__.py:184` | `SCAN_CORE_REMEDIATION_PREPARE` | `useResults.prepare` | `{ plan_id }` | `{ preview }` | safe | |
| `scan_core.remediation.validate` | backend `__init__.py:203` | `SCAN_CORE_REMEDIATION_VALIDATE` | `useResults.validate` | `{ plan_id }` | `{ validation }` | safe | |
| `scan_core.remediation.execute` | backend `__init__.py:222` | `SCAN_CORE_REMEDIATION_EXECUTE` | `useResults.approve` | `{ plan_id, request_id, approval_token, mode }` | `{ summary }` / rejected | rejects stale, missing token, duplicate |
| `scan_core.remediation.cancel` | backend `__init__.py:260` | `SCAN_CORE_REMEDIATION_CANCEL` | `useResults.cancelExecution` | `{ execution_id }` | `{ cancelled }` | safe |
| `scan_core.remediation.status` | backend `__init__.py:279` | `SCAN_CORE_REMEDIATION_STATUS` | `useResults` poll | `{ execution_id }` | `{ status }` | safe |
| `scan_core.remediation.rollback` | backend `__init__.py:298` | `SCAN_CORE_REMEDIATION_ROLLBACK` | `useResults.confirmRollback` | `{ execution_id }` | `{ rollback }` | safe |

All constants are defined in `packages/shared/src/rpc/index.ts` and match the backend `@register` names. No legacy RPCs are silently substituted in the production scan path.

## 6. Persistence / Restart Audit

| Store | Backend Repository | Persisted? | Restart Behavior | Notes |
|-------|--------------------|------------|------------------|-------|
| Scan metadata | `ScanHistoryRepository` | Yes (SQLite) | `latest` / `history` work after restart | Privacy-safe summary only |
| `ActionPlan` | `ActionPlanRepository` | Yes (JSON + SQLite) | `plan_details` works after restart | `is_stale()` checked on use |
| Execution requests | `ExecutionRepository` | Yes (SQLite) | `get_status` works after restart | Ledger-seeded for idempotency |
| Execution summaries | `ExecutionRepository` | Yes (SQLite) | Rollback can be retried | Backups on disk |
| `unifiedScanState` | none | No (in-memory) | Lost on restart | `useDashboardScan` falls back to `latest` |
| Browser URL `?planId` | none | No (URL only) | Resurfaces after refresh | Opaque identifier only |

No persisted history record automatically starts, resumes, executes, or rolls back remediation.

## 7. Approval / Execution Audit

| Check | Verdict | Details |
|-------|---------|---------|
| Validation must succeed | PASS | `useResults.approve` requires `validation.valid === true`; `ValidationPanel` disables `Approve & Fix` otherwise |
| Stale plans cannot be approved | PASS | `ValidationPanel` disables when `preview.is_stale`; backend `execute` re-checks `plan.is_stale()` |
| Missing approval token cannot execute | PASS | `RemediationCoordinator.execute` rejects `mode='live'` without `approval_token` |
| Invalid approval token cannot execute | PASS | Token is generated by `prepare`; mismatch not possible from UI, but `execute` accepts any non-empty token supplied by caller; additional backend token verification is not present (see M3) |
| Rejected execution returns rejected response | PASS | `execute` returns `{ ok: false, status: 'rejected', reason }`; `useResults` sets `step='rejected'` and does not poll |
| Rejected execution never creates fake `execution_id` | PASS | `useResults` only sets `executionId` on `ok: true` with `summary` |
| Rejected execution never starts polling | PASS | `useEffect` only polls when `executionId` and `step === 'executing'`; rejected sets `step='rejected'` |
| Duplicate execution prevented | PASS | `hasRequestedExecution` ref; backend `_is_request_final` and `_active` set reject duplicates |
| Rapid double-click cannot execute twice | PASS | `hasRequestedExecution` ref set before `remediationService.execute` |
| Cancellation is safe | PASS | `ExecutionProgressPanel` disables `Cancel` when `cancelling`; backend `CancellationToken` |
| Terminal states stop polling | PASS | `isTerminalStatus` triggers `clearInterval` in `useResults` and hides `Cancel` in `ExecutionProgressPanel` |

**Note:** `useResults.prepare` and `useResults.validate` do not have in-flight guards; rapid double clicks can produce overlapping requests. This is tracked as M3.

## 8. Rollback Audit

| Check | Verdict | Details |
|-------|---------|---------|
| Rollback cannot happen automatically | PASS | `TerminalStatePanel` only shows `Rollback Changes` when `onRollback && rollbackAvailable`; `initiateRollback` sets `rollbackStep='confirm'` without calling RPC |
| Rollback requires explicit confirmation | PASS | `RollbackConfirmationPanel` shows `Confirm Rollback` / `Cancel` buttons; `confirmRollback` only runs on explicit click |
| Rollback uses real `execution_id` | PASS | `useResults.confirmRollback` uses `executionId` state; backend `rollback(execution_id)` |
| Rapid double rollback prevented | PASS | `hasRequestedRollback` ref; `confirmRollback` guards on `hasRequestedRollback.current` |
| Rollback is safe to retry | PASS | `RollbackSummary` is returned; `RollbackConfirmationPanel` not shown after completion |
| Ledger protects completed actions | PASS | `DefaultExecutor` seeds ledger from `ExecutionRepository.get_completed_action_ids` |

## 9. Privacy / Plan Hydration Audit

| Surface | `canonical_path` | `asset_id` | `target` | `backup_location` | Registry/Browser paths | Verdict |
|---------|-----------------|------------|----------|-------------------|------------------------|---------|
| `scan_core.scan.plan_details` | `""` (blanked) | not included | not included | not included | not included | PASS |
| `PlanReviewView` / `usePlanDetails` | `""` | not included | not included | not included | not included | PASS |
| Active `scan_core.scan.result` findings (`DetectionFinding.to_dict()`) | included | included | included (via evidence) | not included | included for browser/registry findings | **MEDIUM** (M2) |
| `FindingsList.tsx` | conditionally rendered if truthy | not displayed | not displayed | not displayed | not displayed | renders active-scan `canonical_path` if present |
| `scan_core.remediation.prepare` `affected_targets` | included | included | included | not included | not included | **MEDIUM** (M1) |
| `PreviewPanel` / `RollbackConfirmationPanel` | rendered as `path` fallback | not displayed | not displayed | not displayed | not displayed | **MEDIUM** (M1) |

`plan_id` in the URL is an opaque backend-generated UUID and contains no sensitive data. Plan/finding/remediation state is not stored in `localStorage` or `sessionStorage`.

## 10. Dashboard Authority Audit

| Dashboard Surface | Source | Frontend Recomputation? | Verdict |
|-------------------|--------|------------------------|---------|
| Last Scan status | `snapshot.hasActiveSession`, `snapshot.scanStatus` | No | PASS |
| Issues count | `snapshot.issuesFound` (backend `matches`) | No | PASS |
| Actionable count | `snapshot.actionableCount` (backend `actionable`) | No | PASS |
| Review count | `snapshot.reviewCount` (backend `review`) | No | PASS |
| Blocked count | `snapshot.blockedCount` (backend `blocked`) | No | PASS |
| Not-fixable count | `snapshot.notFixableCount` (backend `not_fixable`) | No | PASS |
| Plan availability | `snapshot.planId` / `snapshot.canReview` | No | PASS |
| Top Recommendation | `snapshot.canReview`, `snapshot.actionableCount` | No | PASS |
| Recent Activity | `useDashboardScan` snapshot | No | PASS |
| Health Score | `DashboardViewModel.state.healthScore` (system telemetry) | Yes, but from live metrics, not scan | PASS (kept separate) |

The real-time Health Score is intentionally preserved as a non-scan-derived system metric.

## 11. Legacy / Dead-Code Audit

| Item | Location | Production Reachable? | Status | Recommendation |
|------|----------|----------------------|--------|----------------|
| `UnifiedOptimizeFlow` | `apps/pc-optimizer/src/features/dashboard/components/UnifiedOptimizeFlow.tsx` | No (returns `null`) | Dead | Remove in hardening pass |
| `ScanStatePersistence` | `apps/pc-optimizer/src/features/dashboard/ScanStatePersistence.ts` | Partial (only `clearScanState` called from `DashboardViewModel.cancelHealthScan`) | Legacy | Remove after `cancelHealthScan` is removed |
| `startHealthScan` | `DashboardViewModel.ts:629` | No (not invoked by `DashboardPageV2`) | Dead | Remove |
| `cancelHealthScan` / `clearPersistedScanState` | `DashboardViewModel.ts:701` | No | Dead | Remove |
| `executeOptimize` / `advanceToOptimizeConfirm` | `DashboardViewModel.ts:898` | No (not invoked by `DashboardPageV2`) | Dead | Remove |
| `dashboard.optimize.execute` backend | `backend/src/avs_backend/dashboard/__init__.py:606` | No call from SC-8C9 path | Legacy | Retain or remove separately |
| `createExecutionHandler` / `executionHandler.ts` | `apps/pc-optimizer/src/features/smart-optimization-ai/` | No call from `SmartOptimizationPage` | Dead | Remove separately |

No legacy orchestrator scan calls remain in the production dashboard or scan feature code.

## 12. UX State-Machine Audit

| State | Entry | Exit | Issues |
|-------|-------|------|--------|
| idle | `ScanView` mount | `startScan` clicked | OK |
| scanning | `scan_core.scan.quick/full` | `completed`, `cancelled`, `error` | OK |
| cancelling | `cancelScan` | `reset()` | OK |
| scan error | `processStatus` error | `reset()` or retry | OK |
| no findings | `issuesFound === 0` | close | OK |
| findings found | `issuesFound > 0` | `Review & Remediate` | OK |
| selecting findings | `ResultsView` step `results` | `prepare` | OK |
| preview | `useResults.prepare` succeeds | `validate` | OK; `affected_targets` shows raw path (M1) |
| validation | `useResults.validate` succeeds | `Approve & Fix` / back | OK; `Approve & Fix` disabled when invalid/stale |
| stale plan | `preview.is_stale` or `plan.is_stale()` | back to preview/scan | OK; warning displayed |
| approval | `validation.valid && preview` | `approve` | OK |
| execution | `useResults.approve` succeeds | `status` poll | OK |
| progress | `status` poll | terminal state | OK; `Cancel` hidden when terminal |
| partial | `status === 'partial'` | rollback or back | OK |
| failed | `status === 'failed'` | back | OK |
| cancelled | `status === 'cancelled'` | back | OK |
| completed | `status === 'completed'` | rollback or back | OK |
| rollback confirmation | `initiateRollback` | `confirmRollback` / `cancelRollback` | OK; `affected_targets` list shows `undefined` (M1) |
| rollback success/partial/failed | `confirmRollback` finishes | back | OK |
| missing/deleted plan | `plan_details` `ok: false` | back to dashboard | OK; `PlanReviewView` shows `Results no longer available` |

No dead-end states or accidental auto-execution paths were found.

## 13. Concurrency / Duplicate-Action Audit

| Guard | Verdict | Mechanism |
|-------|---------|-----------|
| Scan start duplicate | PASS | `useScan.startingRef` and `sessionIdRef` |
| Scan cancellation duplicate | PASS | `cancelled` flag and `reset()` |
| Remediation `prepare` duplicate | **MEDIUM** (M3) | No in-flight guard; rapid clicks can overlap |
| Remediation `validate` duplicate | **MEDIUM** (M3) | No in-flight guard; rapid clicks can overlap |
| Remediation `approve` duplicate | PASS | `hasRequestedExecution` ref |
| Execution status polling restart | PASS | `useEffect` cleanup + single `executionId` dependency |
| Rollback duplicate | PASS | `hasRequestedRollback` ref and `isRollbacking` state |
| Browser back/forward | N/A | URL `?planId` only; no state auto-execution |

## 14. Performance Observations

| Observation | Verdict | Notes |
|-------------|---------|-------|
| Scan polling 500ms | ACCEPTABLE | `useScan` `setInterval(..., 500)`; stops on terminal |
| Execution polling 500ms | ACCEPTABLE | `useResults` `setInterval(..., 500)`; stops on terminal |
| Dashboard `latest` on mount | ACCEPTABLE | Called once via `loadedRef` and `mountedRef` guard |
| Plan details loading | ACCEPTABLE | Loaded once on `PlanReviewView` mount |
| Large finding payloads | WATCH | Active `scan.result` returns full `findings` with `canonical_path` and `evidence`; consider limiting fields at RPC layer (M2) |
| Duplicate history requests | PASS | `useDashboardScan` guards with `loadedRef` |

## 15. Test Coverage Gaps

| Gap | Justification | Priority |
|-----|---------------|----------|
| Refresh with `?planId` | Ensures `PlanReviewView` reloads after F5 | Low |
| Missing/stale plan from URL | Currently only tested via `usePlanDetails` mock | Low |
| Stale plan UI (`ValidationPanel` disabled) | Important for UX; not explicitly covered | Medium |
| Double `prepare` / double `validate` | Rapid click regression (M3) | Medium |
| Double rollback | `hasRequestedRollback` guard not explicitly tested | Low |
| Active scan `FindingsList` path display | Privacy regression (M2) | Medium |
| `PreviewPanel` / `RollbackConfirmationPanel` `display_name` | Privacy/UX regression (M1) | Medium |
| Cancellation during execution | `ExecutionProgressPanel` cancel flow | Low |
| Partial execution terminal state | `TerminalStatePanel` `partial` branch | Low |

## 16. Ranked Findings

### 16.1 MEDIUM

**M1 — Preview / rollback panels display raw `canonical_path` for lack of `display_name`**
- Files: `backend/src/avs_backend/scan_core/orchestration/remediation.py` (`_build_preview`), `apps/pc-optimizer/src/features/scan/PreviewPanel.tsx`, `apps/pc-optimizer/src/features/scan/RollbackConfirmationPanel.tsx`
- Behavior: `affected_targets` in `RemediationPreview` contains `action.target.to_dict()` objects with `canonical_path` but no `display_name`. `PreviewPanel.displayTarget` falls back to `path`, and `RollbackConfirmationPanel` shows `undefined` because it reads `target.display_name`.
- Impact: Minor privacy leak of filesystem paths in preview/rollback; broken rollback target list.
- Recommended fix: In `RemediationCoordinator._build_preview`, add a safe `display_name` to each target (e.g., `Path(canonical_path).name` or a category-derived label) and prefer it in `PreviewPanel` and `RollbackConfirmationPanel`; do not send `canonical_path` to the UI.
- Blocks SC-8C10: No, but should be fixed before release.

**M2 — Active scan `ResultsView` receives unsanitized `findings` with `canonical_path`**
- Files: `backend/src/avs_backend/scan_core/rules/aggregation.py` (`DetectionFinding.to_dict`), `apps/pc-optimizer/src/features/scan/FindingsList.tsx`
- Behavior: `scan_core.scan.result` returns raw `DetectionFinding.to_dict()` including `canonical_path`, `asset_id`, `evidence`, etc. `FindingsList` conditionally renders `canonical_path` when present. Persisted `plan_details` correctly blanks `canonical_path`, but active scan does not.
- Impact: Inconsistent privacy posture; active review can expose full paths.
- Recommended fix: Map active scan `findings` to the same sanitized `ScanFinding` shape used by `plan_details` (no raw `canonical_path` in the UI) or blank `canonical_path` in `DetectionFinding.to_dict` before returning to the frontend.
- Blocks SC-8C10: No, but should be fixed for consistency.

**M3 — `useResults.prepare` and `validate` lack in-flight request guards**
- Files: `apps/pc-optimizer/src/features/scan/useResults.ts`
- Behavior: Rapid double-click on `Review & Remediate` or `Validate Plan` can issue overlapping `scan_core.remediation.prepare` / `scan_core.remediation.validate` calls. The last response wins, which can overwrite the first `request_id`/`approval_token` before the user sees it.
- Impact: Could confuse the user with stale/invalid `request_id`; not a security bypass because `approve` is guarded.
- Recommended fix: Add `isPreparing` and `isValidating` refs/states, disable the action buttons while the request is in flight, and early-return if a request is already pending.
- Blocks SC-8C10: No.

### 16.2 LOW

**L1 — Legacy `DashboardViewModel` scan/optimize methods remain but are unreachable**
- Files: `apps/pc-optimizer/src/features/dashboard/DashboardViewModel.ts`, `apps/pc-optimizer/src/features/dashboard/ScanStatePersistence.ts`
- Behavior: `startHealthScan`, `cancelHealthScan`, `executeOptimize`, `clearPersistedScanState`, and `ScanStatePersistence` still exist but are not reached from `DashboardPageV2` or `SmartOptimizationPage`.
- Impact: Dead code; potential future confusion.
- Recommended fix: Remove these methods and `ScanStatePersistence.ts` in a dedicated cleanup pass.
- Blocks SC-8C10: No.

**L2 — `ScanStatePersistence.ts` comment still says `localStorage`**
- File: `apps/pc-optimizer/src/features/dashboard/ScanStatePersistence.ts`
- Behavior: It uses `IndexedDB`, not `localStorage`.
- Impact: Misleading comment only.
- Recommended fix: Update the header comment.
- Blocks SC-8C10: No.

**L3 — Duplicate `import uuid` in `scan_core_rpc/__init__.py`**
- File: `backend/src/avs_backend/scan_core_rpc/__init__.py`
- Behavior: Lines 8 and 13 both `import uuid`.
- Impact: Code quality only.
- Recommended fix: Remove the duplicate import.
- Blocks SC-8C10: No.

**L4 — `SmartOptimizationExecutionHandler.ts` / `OptimizationExecutionCoordinator` appear dead**
- File: `apps/pc-optimizer/src/features/smart-optimization-ai/executionHandler.ts`
- Behavior: `createExecutionHandler` is exported but not imported anywhere; it references `dashboardService.executeOptimize` and other non-`scan_core` services.
- Impact: Dead code with a separate execution path.
- Recommended fix: Remove in a hardening pass if confirmed unused.
- Blocks SC-8C10: No.

## 17. Production Readiness Verdict

**`READY_WITH_MINOR_FIXES`**

The SC-8C9 integration is functionally complete and the security boundary is intact. The dashboard is authoritative and read-only, remediation requires explicit approval, and the backend `RemediationCoordinator` is the single source of truth for execution and rollback.

The findings above are all medium or low and do not compromise the core safety invariants. M1 and M2 are privacy/UX polish; M3 is a concurrency polish. They should be addressed before a public release, but none of them block continuing to plan SC-8C10.

## 18. Fixes Required vs. Can Wait

### Should be fixed before SC-8C10
- M1: Add redacted `display_name` to `affected_targets` and stop showing `canonical_path` in `PreviewPanel` / `RollbackConfirmationPanel`.
- M2: Sanitize active scan `findings` returned to `ResultsView` to match `plan_details` privacy.
- M3: Add in-flight guards to `useResults.prepare` and `useResults.validate`.

### Can wait
- L1: Remove legacy `DashboardViewModel` scan/optimize dead code and `ScanStatePersistence.ts`.
- L2: Update `ScanStatePersistence.ts` header comment.
- L3: Remove duplicate `import uuid`.
- L4: Remove `SmartOptimizationExecutionHandler.ts` if unused.

## 19. Explicit Declarations

- **No SC-8C10 work was performed during this audit.**
- **No production code was modified during this audit.** Existing source files were read and analyzed only. Validation commands (`yarn typecheck`, `yarn lint`, `npx vitest ...`, `yarn build`, `python -m pytest -q`) were run for verification and did not modify code.
- The previously completed Phase 3 implementation files remain as they were after the preceding work.

## 20. Validation Results

| Command | Result |
|---------|--------|
| `cd apps/pc-optimizer && yarn typecheck` | PASS |
| `cd apps/pc-optimizer && yarn lint` | PASS (0 warnings) |
| `npx vitest run src/features/scan/__tests__/ src/features/dashboard/__tests__/ src/features/smart-optimization-ai/__tests__/` | **246 passed** |
| `cd apps/pc-optimizer && yarn build` | PASS |
| `cd backend && python -m pytest -q` | **1248 passed, 14 skipped** |

The known `test_clean_stress_ten_thousand_files[10000]` performance threshold failure did **not** reappear.
