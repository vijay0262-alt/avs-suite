# SC-8C13 Phase Plan — Implementation Roadmap

**Status:** AUTHORITATIVE
**Specification:** `SC8C13_SPECIFICATION.md`
**Verdict:** READY_TO_IMPLEMENT

---

## 1. Phase Overview

SC-8C13 is implemented in 5 phases. Each phase depends on the previous phase. No phases may be skipped or run in parallel.

```
Phase 1 (Background Cleanup Safety Migration)
  ↓
Phase 2 (Dashboard Optimize Canonical Planning)
  ↓
Phase 3 (Dashboard Frontend Migration)
  ↓
Phase 4 (Integration / Persistence / Recovery)
  ↓
Phase 5 (Legacy Disconnection + Final Audit)
```

---

## 2. Phase 1 — Background Cleanup Safety Migration

### Objective

Remove automatic destructive execution from Background Cleanup Service. Convert to detection/notification-only.

### Rationale

This phase addresses the most critical security violation: automatic destructive execution at application startup. It must be done first because it eliminates the unsafe behavior before any new functionality is added.

### Tasks

#### 1.1 Remove automatic startup cleanup

**File:** `apps/pc-optimizer/src/main.tsx`

- Remove `void backgroundCleanupService.runStartupCleanup();` (line 50)
- Retain `backgroundCleanupService.start();` (line 49) for detection/notification only

**Acceptance:**
- `main.tsx` does not call `runStartupCleanup()`
- Grep: `runStartupCleanup` in `main.tsx` → 0 matches

#### 1.2 Remove destructive execution from BackgroundCleanupService

**File:** `apps/pc-optimizer/src/features/health/BackgroundCleanupService.ts`

- Remove or convert `runStartupCleanup()` method to notification-only
- Remove or convert `executeCleanup()` method to notification-only
- Remove `ORCHESTRATOR_OPTIMIZE` RPC call (line 157)
- Remove `withRetry` import for `ORCHESTRATOR_OPTIMIZE`
- Retain `ProcessMonitorService` subscription for detection
- Retain `start()` and `stop()` methods
- Add notification behavior: "Cleanup opportunities available" (no destructive action)
- `handleProcessClosed()` becomes notification-only (no `executeCleanup()` call)

**Acceptance:**
- Grep: `ORCHESTRATOR_OPTIMIZE` in `BackgroundCleanupService.ts` → 0 matches
- Grep: `executeCleanup` in `BackgroundCleanupService.ts` → 0 matches (or method is notification-only)
- No destructive operations on process-closed events

#### 1.3 Stop populating DeferredCleanupStore

**File:** `apps/pc-optimizer/src/features/health/DeferredCleanupStore.ts`

- No code changes to the store itself (retained for compatibility)
- Identify and disconnect any code that populates the store with new items
- The store becomes read-only (existing items may be shown as notifications, but no new items are added)

**Acceptance:**
- No new items are added to `DeferredCleanupStore` after SC-8C13 Phase 1
- Grep: `addItems|addItem` calls in production code (excluding the store itself) → 0 matches or notification-only

#### 1.4 Tests

**New test files:**
- `apps/pc-optimizer/src/features/health/__tests__/BackgroundCleanupSafety.test.ts`

**Test cases:**
- Application startup never performs destructive cleanup
- No `ORCHESTRATOR_OPTIMIZE` RPC call during startup
- No filesystem mutation during startup
- No registry mutation during startup
- Notification/detection behavior is non-destructive
- Repeated startup is safe (no cumulative side effects)
- `BackgroundCleanupService.start()` does not trigger cleanup
- `ProcessMonitorService` subscription continues (detection-only)
- `handleProcessClosed()` is notification-only

### Phase 1 Exit Criteria

- [ ] `main.tsx` does not call `runStartupCleanup()`
- [ ] `BackgroundCleanupService.ts` does not call `ORCHESTRATOR_OPTIMIZE`
- [ ] No destructive operations on process-closed events
- [ ] `DeferredCleanupStore` is not populated with new items
- [ ] All Phase 1 tests pass
- [ ] Typecheck pass
- [ ] Lint pass
- [ ] Build pass

---

## 3. Phase 2 — Dashboard Optimize Canonical Planning

### Objective

Create the backend adapter, plan builder, and RPC for Dashboard Optimization canonical planning.

### Rationale

This phase creates the planning infrastructure before touching the frontend. It follows the exact SC-8C11 (Smart Optimization) pattern.

### Tasks

#### 2.1 Create DashboardOptimizationAdapter

**File:** `backend/src/avs_backend/scan_core/adapters/dashboard_optimization_adapter.py`

**Pattern:** Identical to `smart_optimization_adapter.py` (SC-8C11)

**Contents:**
- `DashboardOptimizationActionMapping` dataclass
- `DASHBOARD_OPT_ACTION_MAPPINGS` dict with 8 entries:
  - 6 supported: `clean_temp_files`, `empty_recycle_bin`, `clean_browser_cache`, `clean_thumbnail_cache`, `clean_prefetch`, `clean_windows_update_cache`
  - 2 unsupported: `flush_dns`, `trim_memory` (classified as `is_supported=False`, `ActionType.NONE`)
- `DashboardOptimizationAdapter` class with:
  - `convert_actions()` method
  - `get_statistics()` method
  - Uses `CapabilityContract` for actionability
  - Uses `PreconditionSet` for safety preconditions
  - NEVER executes remediation
  - NEVER calls legacy optimization services

**Acceptance:**
- Adapter converts all 6 supported operations to correct `ActionType`
- Adapter classifies Flush DNS and Trim Memory as `is_supported=False`
- Adapter respects `CapabilityContract`
- Adapter respects `SafetyGate`

#### 2.2 Create DashboardOptimizationPlanBuilder

**File:** `backend/src/avs_backend/scan_core/adapters/dashboard_optimization_plan_builder.py`

**Pattern:** Identical to `smart_optimization_plan_builder.py` (SC-8C11)

**Contents:**
- `_build_action_summary()` function (same as SC-8C11)
- `DashboardOptimizationPlanBuilder` class with:
  - `build_plan()` method
  - `get_adapter_statistics()` method
  - Generates backend `plan_id` (`uuid.uuid4()`)
  - Creates canonical `ActionPlan`
  - Does NOT persist the plan
  - Does NOT execute remediation

**Acceptance:**
- Plan builder generates valid `ActionPlan`
- Plan builder generates backend `plan_id`
- Plan builder computes correct `ActionSummary`

#### 2.3 Register RPC: `scan_core.dashboard_optimization.plan`

**File:** `backend/src/avs_backend/scan_core_rpc/__init__.py`

**Pattern:** Identical to `scan_core.smart_optimization.plan` (SC-8C11)

**Contents:**
- `@register("scan_core.dashboard_optimization.plan")` handler
- Accepts `actions` parameter
- Uses `DashboardOptimizationPlanBuilder` to create plan
- Returns `plan_id`, `total_actions`, `auto_fixable`, `review_required`, `not_fixable`, `estimated_affected_size`, `statistics`
- Planning-only — does NOT execute remediation
- Does NOT call legacy `dashboard.optimize.execute`

**Acceptance:**
- RPC returns `ok: true` with `plan_id` for valid actions
- RPC returns `ok: false` for empty actions
- RPC does NOT execute remediation

#### 2.4 Add RPC constant

**File:** `packages/shared/src/rpc/index.ts`

**Change:**
- Add `SCAN_CORE_DASHBOARD_OPTIMIZATION_PLAN: 'scan_core.dashboard_optimization.plan'`

**Acceptance:**
- Constant is exported and usable by frontend

#### 2.5 Tests

**New test files:**
- `backend/tests/test_dashboard_optimization_adapter.py`
- `backend/tests/test_dashboard_optimization_plan_builder.py`
- `backend/tests/test_dashboard_optimization_rpc.py`

**Test cases:**
- Adapter converts all 6 supported operations correctly
- Adapter classifies Flush DNS and Trim Memory as unsupported
- Adapter respects `CapabilityContract`
- Plan builder generates valid `ActionPlan`
- Plan builder generates backend `plan_id`
- RPC returns `plan_id` for valid actions
- RPC returns error for empty actions
- RPC does NOT execute remediation
- RPC does NOT call legacy `dashboard.optimize.execute`

### Phase 2 Exit Criteria

- [ ] `DashboardOptimizationAdapter` created with 8 action mappings
- [ ] `DashboardOptimizationPlanBuilder` created
- [ ] `scan_core.dashboard_optimization.plan` RPC registered
- [ ] `SCAN_CORE_DASHBOARD_OPTIMIZATION_PLAN` constant added
- [ ] All Phase 2 tests pass
- [ ] Typecheck pass
- [ ] Lint pass
- [ ] Backend suite pass

---

## 4. Phase 3 — Dashboard Frontend Migration

### Objective

Migrate Dashboard One-Click Optimize frontend to use the canonical `scan_core` planning/execution flow.

### Rationale

This phase connects the frontend to the backend planning infrastructure created in Phase 2. It follows the exact SC-8C11 frontend pattern.

### Tasks

#### 3.1 Add scan.service.ts method

**File:** `apps/pc-optimizer/src/features/scan/scan.service.ts`

**Changes:**
- Add `DashboardOptimizationPlanResponse` interface (same shape as `SmartOptimizationPlanResponse`)
- Add `dashboard_optimization_plan(actions)` method
- Reference `SCAN_CORE_DASHBOARD_OPTIMIZATION_PLAN` RPC constant

#### 3.2 Create useDashboardOptimizationPlan hook

**File:** `apps/pc-optimizer/src/features/scan/useDashboardOptimizationPlan.ts`

**Pattern:** Identical to `useSmartOptimizationPlan.ts` (SC-8C11)

**Contents:**
- `useDashboardOptimizationPlan()` hook
- `createPlan(actions)` method
- `reset()` method
- `isCreatingRef` guard prevents duplicate plan creation
- Returns `planId`, `isCreating`, `error`, `response`, `createPlan`, `reset`

#### 3.3 Export hook

**File:** `apps/pc-optimizer/src/features/scan/index.ts`

**Change:**
- Export `useDashboardOptimizationPlan`

#### 3.4 Migrate OneClickOptimize.tsx

**File:** `apps/pc-optimizer/src/features/dashboard/components/OneClickOptimize.tsx`

**Changes:**
- Replace `onConfirm` (which called `advanceToOptimizeConfirm` → `executeOptimize`) with plan creation
- After preview, call `useDashboardOptimizationPlan.createPlan(actions)`
- Render `PlanReviewView` after plan creation (hydrate `plan_id`)
- Render `ResultsView` for the canonical remediation flow
- Remove direct `executeOptimize` call from the confirm step
- Preserve the preview step (existing `dashboard.optimize.preview` RPC is non-destructive)

**New flow:**
```
idle → preview (dashboard.optimize.preview)
→ createPlan (scan_core.dashboard_optimization.plan)
→ PlanReviewView (hydrate plan_id)
→ ResultsView (prepare → validate → approve → execute → progress → terminal → rollback)
```

#### 3.5 Migrate DashboardViewModel.ts

**File:** `apps/pc-optimizer/src/features/dashboard/DashboardViewModel.ts`

**Changes:**
- `advanceToOptimizeConfirm()` → calls plan creation instead of `executeOptimize()`
- `executeOptimize()` → disconnected from production UI (retained for compatibility)
- Add plan creation state (`optimizePlanId`, `optimizePlanError`, etc.)
- `openOptimizePreview()` → unchanged (preview is non-destructive)

#### 3.6 Tests

**New test files:**
- `apps/pc-optimizer/src/features/scan/__tests__/useDashboardOptimizationPlan.test.ts`
- `apps/pc-optimizer/src/features/dashboard/__tests__/OneClickOptimizeMigration.test.ts`

**Test cases:**
- `useDashboardOptimizationPlan` creates plan successfully
- `useDashboardOptimizationPlan` guards against duplicate creation
- `useDashboardOptimizationPlan` handles errors
- `OneClickOptimize` renders preview
- `OneClickOptimize` creates plan on confirm
- `OneClickOptimize` renders `PlanReviewView` after plan creation
- `OneClickOptimize` renders `ResultsView` for canonical flow
- `OneClickOptimize` does NOT call `executeOptimize` directly
- `prepare` is required before `validate`
- `validate` is required before `approve`
- Explicit approval is required before `execute`
- Duplicate clicks are guarded
- Stale plans are rejected
- Progress polling is correct
- Terminal states are correct
- Rollback is optional and explicit

### Phase 3 Exit Criteria

- [ ] `useDashboardOptimizationPlan` hook created
- [ ] `scan.service.ts` updated with `dashboard_optimization_plan` method
- [ ] `OneClickOptimize.tsx` migrated to `PlanReviewView` → `ResultsView`
- [ ] `DashboardViewModel.ts` migrated to plan creation
- [ ] No `executeOptimize` call in production UI path
- [ ] All Phase 3 tests pass
- [ ] Typecheck pass
- [ ] Lint pass
- [ ] Build pass
- [ ] Frontend suite pass

---

## 5. Phase 4 — Integration / Persistence / Recovery

### Objective

Verify and harden integration, persistence, recovery, and concurrency behavior.

### Rationale

This phase ensures the migrated flow is robust against interruptions, restarts, and concurrent operations.

### Tasks

#### 4.1 Interrupted state handling

- Verify that interrupted executions are handled correctly
- Verify that `ExecutionRepository` records interrupted executions
- Verify that `ExecutionLedger` prevents duplicate completed actions after restart
- Verify that stale plans are rejected after restart

#### 4.2 Restart behavior

- Verify that no automatic resume occurs after restart
- Verify that `ExecutionRepository` seeds `ExecutionLedger` after restart
- Verify that user must explicitly re-approve after restart

#### 4.3 Duplicate prevention

- Verify `hasRequestedExecution` ref prevents duplicate execute calls
- Verify `isCreatingRef` prevents duplicate plan creation
- Verify `isPreparingRef` prevents duplicate prepare calls
- Verify `isValidatingRef` prevents duplicate validate calls
- Verify `ExecutionLedger` prevents duplicate completed actions

#### 4.4 History

- Verify that execution history is recorded in `ExecutionRepository`
- Verify that plan history is recorded in `ActionPlanRepository`
- Verify that dashboard state is consistent after execution

#### 4.5 Dashboard state consistency

- Verify that `dashboard.metrics` cache is invalidated after execution
- Verify that health score is updated after execution
- Verify that `refreshCache()` is called after execution

#### 4.6 Tests

**New test files:**
- `backend/tests/test_dashboard_optimization_integration.py`
- `apps/pc-optimizer/src/features/dashboard/__tests__/DashboardOptimizationIntegration.test.ts`

**Test cases:**
- Full flow: preview → plan → prepare → validate → approve → execute → terminal
- Rollback flow: terminal → rollback → success
- Stale plan rejection
- Duplicate execution prevention
- Restart recovery (no auto-resume)
- Interrupted execution handling
- Dashboard state consistency after execution
- Metrics cache invalidation after execution

### Phase 4 Exit Criteria

- [ ] Integration tests pass
- [ ] Persistence/recovery audit pass
- [ ] Concurrency audit pass
- [ ] No browser storage for remediation state
- [ ] Restart recovery works (no auto-resume)
- [ ] All Phase 4 tests pass
- [ ] Typecheck pass
- [ ] Lint pass
- [ ] Build pass
- [ ] Backend suite pass
- [ ] Frontend suite pass

---

## 6. Phase 5 — Legacy Disconnection + Final Audit

### Objective

Disconnect legacy execution paths, classify dead code, and perform final security/privacy/UX audit.

### Rationale

This phase ensures that legacy paths are fully disconnected and the migration is complete and auditable.

### Tasks

#### 5.1 Disconnect legacy execution paths

- Verify `dashboard.optimize.execute` is NOT called from production UI
- Verify `orchestrator.optimize` is NOT called from `BackgroundCleanupService`
- Verify `BackgroundCleanupService.executeCleanup()` is removed or notification-only
- Verify `BackgroundCleanupService.runStartupCleanup()` is removed
- Verify `DeferredCleanupStore` is not populated

#### 5.2 Dead code classification

| Component | Classification |
|-----------|---------------|
| `dashboard_optimize_execute()` | Disconnected (retained for compatibility) |
| `orchestrator_optimize()` | Disconnected (retained for compatibility) |
| `DeferredCleanupStore` | Dead code (no consumers) |
| `BackgroundCleanupService.executeCleanup()` | Removed or notification-only |
| `BackgroundCleanupService.runStartupCleanup()` | Removed |
| `DashboardViewModel.executeOptimize()` | Disconnected (retained for compatibility) |

#### 5.3 Security grep

- Grep: `ORCHESTRATOR_OPTIMIZE` in `BackgroundCleanupService.ts` → 0 matches
- Grep: `runStartupCleanup` in `main.tsx` → 0 matches
- Grep: `executeOptimize` in production UI path → 0 matches
- Grep: `dashboard.optimize.execute` in production UI path → 0 matches
- Grep: `subprocess` in frontend → 0 matches
- Grep: `shutil` in frontend → 0 matches
- Grep: `reg.exe` in frontend → 0 matches
- Grep: `IndexedDB` for remediation state → 0 matches (DeferredCleanupStore not populated)

#### 5.4 Privacy audit

- Verify no sensitive paths in RPC responses
- Verify `DashboardOptimizationAdapter` uses privacy-safe serialization
- Verify `PlanReviewView` receives canonical, privacy-safe plan details

#### 5.5 UX audit

- Verify Dashboard Optimize follows canonical flow
- Verify Background Cleanup is notification-only
- Verify explicit approval is required
- Verify rollback is optional and explicit

#### 5.6 Full validation

- Typecheck: `tsc -p tsconfig.json --noEmit && tsc -p electron/tsconfig.json --noEmit`
- Lint: `eslint "{src,electron}/**/*.{ts,tsx}" --max-warnings=0`
- Build: `vite build`
- Backend suite: `pytest backend/tests`
- Frontend suite: `vitest run`

#### 5.7 Final security regression report

**File:** `apps/pc-optimizer/SC8C13_PHASE5_FINAL_SECURITY_REGRESSION_AUDIT.md`

**Contents:**
- Executive summary
- Security findings by severity
- Privacy audit results
- Concurrency audit results
- UX audit results
- Persistence/recovery audit results
- Legacy code classification
- Test results
- Validation results
- Confirmation: SC-8C14 NOT started
- Final verdict

### Phase 5 Exit Criteria

- [ ] Legacy execution paths disconnected
- [ ] Dead code classified
- [ ] Security grep pass
- [ ] Privacy audit pass
- [ ] UX audit pass
- [ ] Concurrency audit pass
- [ ] Persistence/recovery audit pass
- [ ] Typecheck pass
- [ ] Lint pass
- [ ] Build pass
- [ ] Backend suite pass
- [ ] Frontend suite pass
- [ ] `SC8C13_PHASE5_FINAL_SECURITY_REGRESSION_AUDIT.md` created
- [ ] SC-8C14 NOT started

---

## 7. Phase Dependencies

```
Phase 1 (Background Cleanup Safety Migration)
  ↓
Phase 2 (Dashboard Optimize Canonical Planning)
  ↓
Phase 3 (Dashboard Frontend Migration)
  ↓
Phase 4 (Integration / Persistence / Recovery)
  ↓
Phase 5 (Legacy Disconnection + Final Audit)
```

Each phase depends on the previous phase. No phases may be skipped or run in parallel.

---

## 8. Unresolved Architectural Decisions

| Decision | Status | Impact |
|----------|--------|--------|
| None | ✅ All decisions resolved | N/A |

All product decisions (D1–D6) are resolved in `SC8C13_SPECIFICATION.md`.

---

## 9. Validation Commands

| Check | Command |
|-------|---------|
| Typecheck | `tsc -p tsconfig.json --noEmit && tsc -p electron/tsconfig.json --noEmit` |
| Lint | `eslint "{src,electron}/**/*.{ts,tsx}" --max-warnings=0` |
| Build | `vite build` |
| Backend suite | `pytest backend/tests` |
| Frontend suite | `vitest run` |
| Security grep | See Phase 5.3 |

---

## 10. Intermittent Failure Handling

Any intermittent/pre-existing failures must be:
1. Isolated and run independently
2. Verified as pre-existing (not caused by SC-8C13 changes)
3. Documented in the final audit report
4. NOT modified (per spec: "Do NOT modify unrelated tests")

Same approach as SC-8C12 Phase 5.

---

## 11. SC-8C14 Boundary

SC-8C14 is NOT started. This phase plan explicitly prohibits:
- Starting SC-8C14 or any later phase
- Implementing module-level cleaner migration (Candidate D)
- Implementing pause/resume (Candidate F)
- Creating new `ActionType` values
- Creating new target executors
- Modifying `SafetyGate`
- Modifying `RemediationCoordinator`
- Modifying `scan_core` internals

---

## 12. Acceptance Criteria (Cross-Phase)

| # | Criterion | Phase | Verification |
|---|-----------|-------|-------------|
| AC1 | Background Cleanup cannot perform destructive operations automatically | Phase 1 | Grep for `ORCHESTRATOR_OPTIMIZE` in `BackgroundCleanupService.ts` → 0 matches |
| AC2 | `main.tsx` does not call `runStartupCleanup()` | Phase 1 | Grep for `runStartupCleanup` in `main.tsx` → 0 matches |
| AC3 | Dashboard Optimize cannot execute destructive operations directly | Phase 3 | Grep for `executeOptimize` in production UI path → 0 matches |
| AC4 | All supported optimization actions use `scan_core` | Phase 2 | Adapter maps 6 operations to existing `ActionType` values |
| AC5 | All destructive actions require explicit approval | Phase 3 | `useResults` `approve()` requires `hasRequestedExecution` ref |
| AC6 | Unsupported actions cannot accidentally execute | Phase 2 | Adapter classifies Flush DNS and Trim Memory as `is_supported=False` |
| AC7 | Backend owns plan identity and safety classification | Phase 2 | `plan_id` generated by `DashboardOptimizationPlanBuilder` |
| AC8 | `ResultsView` is the sole remediation UI | Phase 3 | Dashboard uses `PlanReviewView` → `ResultsView` |
| AC9 | Rollback uses canonical `scan_core.remediation.rollback` | Phase 4 | No custom rollback in Dashboard |
| AC10 | Existing SC-8C10/11/12 invariants remain intact | Phase 5 | Security regression audit |
| AC11 | No new remediation engine is introduced | Phase 5 | No new coordinator/executor/approval system |
| AC12 | No new parallel execution architecture is introduced | Phase 5 | All execution via `RemediationCoordinator` |
| AC13 | No browser storage for remediation state | Phase 1 | `DeferredCleanupStore` not populated |
| AC14 | No new `ActionType` values | Phase 2 | `ActionType` enum unchanged |
| AC15 | No new target executors | Phase 2 | Executor files unchanged |

---

**End of SC-8C13 Phase Plan**
