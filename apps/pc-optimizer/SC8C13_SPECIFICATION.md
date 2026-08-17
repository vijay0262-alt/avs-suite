# SC-8C13 Specification — Dashboard Optimization & Background Cleanup Canonical Migration

**Status:** AUTHORITATIVE
**Phase:** Specification
**Verdict:** READY_TO_IMPLEMENT (pending product decision confirmation — see §33)

---

## 1. Objective

Eliminate unsafe parallel automatic optimization/remediation paths by migrating applicable Dashboard Optimization and Background Cleanup functionality to the canonical `scan_core` workflow while preserving safe/non-remediation system utilities.

SC-8C13 completes the canonical remediation migration by addressing the last two features that bypass `scan_core`:

1. **Background Cleanup Service** — performs automatic destructive execution at application startup, violating the "no automatic execution" invariant.
2. **Dashboard One-Click Optimize** — performs destructive operations directly in the backend, bypassing `scan_core`, `SafetyGate`, `RemediationCoordinator`, `ActionPlanRepository`, and `ExecutionRepository`.

---

## 2. Scope

### In scope

- Background Cleanup Service: remove automatic destructive execution, convert to detection/notification
- Dashboard One-Click Optimize: migrate to canonical `scan_core` planning/execution flow
- New `scan_core.dashboard_optimization.plan` RPC (planning-only, backend-authoritative)
- New `DashboardOptimizationAdapter` (backend, planning-only)
- New `DashboardOptimizationPlanBuilder` (backend, planning-only)
- New `useDashboardOptimizationPlan` frontend hook (planning-only)
- Frontend migration to `PlanReviewView` → `ResultsView`
- Legacy execution path disconnection
- Classification of unsupported operations (Flush DNS, Trim Memory) as `OUT_OF_SCOPE`

### Out of scope

- Module-level cleaner migration (Candidate D — future multi-release initiative)
- Pause/resume backend contract (Candidate F — requires `scan_core` core changes)
- Legacy Health Scan Modal cleanup (Candidate C — dead code, unrelated)
- Security Center legacy backend cleanup (Candidate E — unrelated to A+B)
- New `ActionType` values
- New target executors
- `SafetyGate` modification
- `RemediationCoordinator` modification
- `scan_core` internal modification
- SC-8C14

---

## 3. Non-Goals

- Modifying `scan_core` internals
- Modifying `SafetyGate`
- Modifying `RemediationCoordinator`
- Modifying existing target executors (`FilesystemExecutor`, `RegistryExecutor`, `StartupExecutor`, `BrowserExecutor`)
- Creating new `ActionType` values
- Creating new target executors
- Migrating module-level cleaners (junk, registry, privacy, startup, performance, duplicate)
- Implementing pause/resume
- Removing legacy `orchestrator.optimize` RPC (may be deprecated but not removed)
- Removing legacy `dashboard.optimize.execute` RPC (disconnected from production UI, retained for compatibility)
- Starting SC-8C14

---

## 4. Product Decisions

### D1 — Background Cleanup

**Decision:** Background Cleanup Service will be converted from automatic destructive execution to detection/notification only.

- NO automatic destructive cleanup at application startup.
- NO automatic remediation without explicit user approval.
- Background service MAY detect deferred cleanup opportunities.
- Background service MAY notify the user that cleanup opportunities exist.
- Any destructive cleanup MUST enter the canonical scan → results → preview → validate → approve → execute flow.

**Repository evidence supporting this decision:**
- `BackgroundCleanupService.ts:13` — "No user interaction required" — this violates the "no automatic execution" invariant
- `BackgroundCleanupService.ts:157` — calls `ORCHESTRATOR_OPTIMIZE` automatically
- `main.tsx:49-50` — starts at app boot and runs `runStartupCleanup()` immediately
- `SC8C11_SPECIFICATION.md:93` — explicitly deferred to future phase
- `SC8C10_FINAL_PRODUCTION_READINESS_AUDIT.md:742` — INFO-2: "Consider migration to `scan_core` in future phase"

### D2 — Dashboard One-Click Optimize

**Decision:** Dashboard Optimize will be migrated to the canonical `scan_core` workflow.

"One-click" MUST NOT mean silent automatic remediation. The intended UX:

```
Dashboard
→ Scan / Analyze (existing dashboard.optimize.preview)
→ Plan creation (new scan_core.dashboard_optimization.plan RPC)
→ PlanReviewView (hydrate backend-generated plan)
→ ResultsView
→ prepare
→ validate
→ explicit Approve & Fix
→ execute
→ progress
→ terminal
→ optional Rollback
```

A single dashboard button MAY start the analysis/scan, but it MUST NOT bypass explicit approval.

**Repository evidence supporting this decision:**
- `dashboard/__init__.py:606` — `dashboard_optimize_execute()` directly performs 7 categories of destructive operations
- `dashboard.service.ts:47` — `executeOptimize` calls `DASHBOARD_OPTIMIZE_EXECUTE` directly
- `DashboardViewModel.ts:884-886` — `advanceToOptimizeConfirm()` calls `executeOptimize()` (has confirm step but bypasses scan_core)
- `SC8C11_SPECIFICATION.md:92` — "Migrating `DashboardViewModel.healthScan*` state (deferred to future phase)"
- SC-8C11 and SC-8C12 established the proven pattern: Adapter → PlanBuilder → RPC → PlanReviewView → ResultsView

### D3 — Unsupported Actions

**Decision:** Operations without an existing safe `scan_core` `ActionType`/executor are classified as `OUT_OF_SCOPE`.

| Operation | Current implementation | Existing ActionType? | Existing executor? | Classification |
|-----------|----------------------|---------------------|-------------------|----------------|
| Clean temp files | `_clean_temp_files()` | `DELETE_FILE` | `FilesystemExecutor` | **IN SCOPE** |
| Empty Recycle Bin | `empty_recycle_bin()` | `DELETE_DIRECTORY` | `FilesystemExecutor` | **IN SCOPE** |
| Clean browser cache | `_clean_browser_cache()` | `CLEAR_BROWSER_CACHE` | `BrowserExecutor` | **IN SCOPE** |
| Clean thumbnail cache | `_clean_thumbnail_cache()` | `CLEAR_CACHE` | `BrowserExecutor` (cache) | **IN SCOPE** |
| Clean prefetch files | `_clean_prefetch()` | `DELETE_FILE` | `FilesystemExecutor` | **IN SCOPE** |
| Clean Windows Update cache | `_clean_windows_update_cache()` | `DELETE_FILE` | `FilesystemExecutor` | **IN SCOPE** |
| Flush DNS | `_flush_dns()` → `subprocess.run(["ipconfig", "/flushdns"])` | **NONE** | **NONE** | **OUT_OF_SCOPE** |
| Trim Memory | `_trim_memory()` → `optimize_memory()` | **NONE** | **NONE** | **OUT_OF_SCOPE** |

**Rationale:** Flush DNS and Trim Memory have no existing `ActionType` or executor. SC-8C13 does NOT invent new `ActionType`s or executors (per D6). These operations remain available as standalone utilities outside the remediation flow.

**Repository evidence:**
- `scan_core/rules/action.py:183-198` — `ActionType` enum has 8 values; no `FLUSH_DNS` or `TRIM_MEMORY`
- `scan_core/rules/actionability.py:33-77` — `DEFAULT_CAPABILITY_MATRIX` has no DNS or memory entries
- `smart_optimization_adapter.py:135-158` — SC-8C11 already classifies unsupported operations as `is_supported=False` with `ActionType.NONE`

### D4 — DeferredCleanupStore

**Decision:** DeferredCleanupStore is **unnecessary after removal of automatic remediation** and will be deprecated.

**Rationale:**
- `DeferredCleanupStore` exists solely to feed `BackgroundCleanupService.executeCleanup()` which calls `ORCHESTRATOR_OPTIMIZE` automatically.
- Once automatic execution is removed, there is no consumer of deferred cleanup items.
- The canonical `scan_core` flow uses backend `ActionPlanRepository` for plan persistence, not browser storage.
- The store uses `IndexedDB` (`DeferredCleanupStore.ts:13` — `idbGetAll`, `idbPut`, `idbDelete`, `idbClear`), which violates the "no browser storage for remediation state" invariant.

**Treatment:**
- Phase 1: Stop populating the store (no new items added)
- Phase 5: Classify as dead code (no consumers)
- The store itself is NOT deleted in SC-8C13 (retained for compatibility, classified as dead code)

**Repository evidence:**
- `DeferredCleanupStore.ts:1-9` — "Items that could not be cleaned during the main optimization pass are stored here. The BackgroundCleanupService retries them automatically."
- `DeferredCleanupStore.ts:13` — uses `idbGetAll`, `idbPut`, `idbDelete`, `idbClear` (IndexedDB)
- `BackgroundCleanupService.ts:97-108` — `runStartupCleanup()` reads from store and calls `executeCleanup()`
- `BackgroundCleanupService.ts:137-193` — `executeCleanup()` calls `ORCHESTRATOR_OPTIMIZE`

### D5 — Scope of Candidate C and E

**Decision:** Candidate C (Legacy Health Scan Modal Cleanup) and Candidate E (Security Center Legacy Backend Cleanup) are **OUT_OF_SCOPE** for SC-8C13.

**Rationale:**
- Candidate C is dead code removal (`HealthScanModal.tsx`, `UnifiedHealthScanModal.tsx`, `UnifiedHealthScanResults.tsx` — no imports). Unrelated to Dashboard/Background Cleanup migration.
- Candidate E is Security Center legacy backend cleanup. SC-8C12 Phase 5 already disconnected execution paths. Remaining items are read-only functionality and dead RPC wrappers. Unrelated to Dashboard/Background Cleanup migration.
- Neither is necessary to safely complete A+B.

### D6 — SC-8C13 vs SC-8C14

**Decision:** Keep the core B+A migration inside SC-8C13. No requirement needs new `ActionType`, new executor, `SafetyGate` modification, or major `scan_core` redesign.

**Rationale:**
- All 6 supported operations map to existing `ActionType` values (`DELETE_FILE`, `DELETE_DIRECTORY`, `CLEAR_CACHE`, `CLEAR_BROWSER_CACHE`)
- All 6 supported operations have existing executors (`FilesystemExecutor`, `BrowserExecutor`)
- The adapter/plan builder pattern is proven by SC-8C11 and SC-8C12
- No `scan_core` internal modification is required

---

## 5. Architecture

### Target architecture

```
Dashboard / Background Detection
        ↓
scan_core scan / analysis (dashboard.optimize.preview)
        ↓
DashboardOptimizationAdapter (new, backend, planning-only)
        ↓
DashboardOptimizationPlanBuilder (new, backend, planning-only)
        ↓
canonical ActionPlan (backend-generated plan_id)
        ↓
scan_core.dashboard_optimization.plan RPC (new, planning-only)
        ↓
PlanReviewView (hydrate backend-generated plan)
        ↓
ResultsView (canonical remediation UI)
        ↓
scan_core.remediation.prepare
        ↓
scan_core.remediation.validate
        ↓
explicit user approval
        ↓
scan_core.remediation.execute
        ↓
progress polling (scan_core.remediation.status)
        ↓
terminal state (completed / partial / failed / cancelled)
        ↓
optional rollback (scan_core.remediation.rollback)
```

### Background Cleanup target architecture

```
Application startup
→ NO automatic destructive execution
→ NO ORCHESTRATOR_OPTIMIZE call
→ ProcessMonitorService MAY continue (detection-only)
→ If deferred items exist, notify user: "Cleanup opportunities available"
→ User opens canonical scan/review flow
→ explicit approval
→ canonical execution
```

### What is NOT created

- No new remediation engine
- No new approval system
- No new rollback system
- No new execution coordinator
- No new `ActionType` values
- No new target executors

---

## 6. Affected Modules

### Backend (new files)

| File | Purpose |
|------|---------|
| `backend/src/avs_backend/scan_core/adapters/dashboard_optimization_adapter.py` | Converts Dashboard Optimization preview to canonical `RemediationAction`s |
| `backend/src/avs_backend/scan_core/adapters/dashboard_optimization_plan_builder.py` | Builds canonical `ActionPlan` from adapter output, generates `plan_id` |

### Backend (modified files — RPC registration only)

| File | Change |
|------|--------|
| `backend/src/avs_backend/scan_core_rpc/__init__.py` | Register `scan_core.dashboard_optimization.plan` RPC |

### Shared (modified files — RPC constant only)

| File | Change |
|------|--------|
| `packages/shared/src/rpc/index.ts` | Add `SCAN_CORE_DASHBOARD_OPTIMIZATION_PLAN: 'scan_core.dashboard_optimization.plan'` |

### Frontend (new files)

| File | Purpose |
|------|---------|
| `apps/pc-optimizer/src/features/scan/useDashboardOptimizationPlan.ts` | Hook to call `scan_core.dashboard_optimization.plan` RPC (planning-only) |

### Frontend (modified files)

| File | Change |
|------|--------|
| `apps/pc-optimizer/src/features/scan/scan.service.ts` | Add `dashboard_optimization_plan()` method + response type |
| `apps/pc-optimizer/src/features/scan/index.ts` | Export `useDashboardOptimizationPlan` |
| `apps/pc-optimizer/src/features/dashboard/components/OneClickOptimize.tsx` | Replace direct `executeOptimize` with `PlanReviewView` → `ResultsView` flow |
| `apps/pc-optimizer/src/features/dashboard/DashboardViewModel.ts` | Replace `executeOptimize()` with plan creation + canonical flow |
| `apps/pc-optimizer/src/features/health/BackgroundCleanupService.ts` | Remove automatic execution, convert to notification-only |
| `apps/pc-optimizer/src/main.tsx` | Remove `backgroundCleanupService.runStartupCleanup()` call |

### Backend (disconnected, NOT deleted)

| File | Status after SC-8C13 |
|------|---------------------|
| `backend/src/avs_backend/dashboard/__init__.py` | `dashboard_optimize_execute()` retained but disconnected from production UI |
| `backend/src/avs_backend/orchestrator/__init__.py` | `orchestrator_optimize()` retained but disconnected from BackgroundCleanupService |

---

## 7. Backend Requirements

### DashboardOptimizationAdapter

**File:** `backend/src/avs_backend/scan_core/adapters/dashboard_optimization_adapter.py`

**Pattern:** Identical to `SmartOptimizationAdapter` (SC-8C11) and `SecurityRemediationAdapter` (SC-8C12).

**Responsibilities:**
- Convert Dashboard Optimization preview actions to canonical `RemediationAction` objects
- Map each supported operation to its `ActionType`:
  - `clean_temp_files` → `DELETE_FILE`
  - `empty_recycle_bin` → `DELETE_DIRECTORY`
  - `clean_browser_cache` → `CLEAR_BROWSER_CACHE`
  - `clean_thumbnail_cache` → `CLEAR_CACHE`
  - `clean_prefetch` → `DELETE_FILE`
  - `clean_windows_update_cache` → `DELETE_FILE`
- Classify unsupported operations as `is_supported=False` with `ActionType.NONE`:
  - `flush_dns` → `OUT_OF_SCOPE`
  - `trim_memory` → `OUT_OF_SCOPE`
- NEVER execute remediation
- NEVER call legacy optimization services
- NEVER bypass `SafetyGate`
- NEVER bypass `CapabilityContract`
- Use `CapabilityContract` for actionability evaluation
- Use `PreconditionSet` for safety preconditions

**Action mappings (following SC-8C11 pattern):**

```python
DASHBOARD_OPT_ACTION_MAPPINGS = {
    "clean_temp_files": DashboardOptimizationActionMapping(
        smart_opt_type="clean_temp_files",  # reuse Smart Optimization mapping pattern
        action_type=ActionType.DELETE_FILE,
        rule_category=RuleCategory.TEMPORARY,
        target_type="filesystem",
        is_supported=True,
        reason="Maps to existing temp file cleanup executor",
    ),
    "empty_recycle_bin": ...,
    "clean_browser_cache": ...,
    "clean_thumbnail_cache": ...,
    "clean_prefetch": ...,
    "clean_windows_update_cache": ...,
    "flush_dns": DashboardOptimizationActionMapping(
        ...
        action_type=ActionType.NONE,
        is_supported=False,
        reason="Flush DNS has no scan_core ActionType or executor — OUT_OF_SCOPE",
    ),
    "trim_memory": DashboardOptimizationActionMapping(
        ...
        action_type=ActionType.NONE,
        is_supported=False,
        reason="Memory trim has no scan_core ActionType or executor — OUT_OF_SCOPE",
    ),
}
```

### DashboardOptimizationPlanBuilder

**File:** `backend/src/avs_backend/scan_core/adapters/dashboard_optimization_plan_builder.py`

**Pattern:** Identical to `SmartOptimizationPlanBuilder` (SC-8C11).

**Responsibilities:**
- Convert Dashboard Optimization actions via `DashboardOptimizationAdapter`
- Compute `ActionSummary` statistics
- Generate backend `plan_id` (`uuid.uuid4()`)
- Create canonical `ActionPlan`
- Does NOT persist the plan (persistence is handled by `scan_core.remediation.prepare`)
- Does NOT execute remediation

### RPC: `scan_core.dashboard_optimization.plan`

**Registration:** `backend/src/avs_backend/scan_core_rpc/__init__.py`

**Pattern:** Identical to `scan_core.smart_optimization.plan` (SC-8C11) and `scan_core.security_remediation.plan` (SC-8C12).

**Request:**
```json
{
    "actions": [
        {"type": "clean_temp_files", "path": "...", "size": 12345},
        {"type": "empty_recycle_bin", ...},
        ...
    ]
}
```

**Response:**
```json
{
    "ok": true,
    "plan_id": "uuid",
    "total_actions": 6,
    "auto_fixable": 6,
    "review_required": 0,
    "not_fixable": 0,
    "estimated_affected_size": 123456789,
    "statistics": {
        "converted": 6,
        "unsupported": 2,
        "errors": 0
    }
}
```

**Behavior:**
- Planning-only — does NOT execute remediation
- Does NOT call legacy `dashboard.optimize.execute`
- Does NOT call legacy `orchestrator.optimize`
- Uses `DashboardOptimizationPlanBuilder` to create canonical `ActionPlan`
- Returns backend-generated `plan_id`

---

## 8. Frontend Requirements

### useDashboardOptimizationPlan hook

**File:** `apps/pc-optimizer/src/features/scan/useDashboardOptimizationPlan.ts`

**Pattern:** Identical to `useSmartOptimizationPlan` (SC-8C11).

**Responsibilities:**
- Call `scanService.dashboard_optimization_plan(actions)` to create canonical plan
- Return `planId`, `isCreating`, `error`, `response`, `createPlan`, `reset`
- Ref guard (`isCreatingRef`) prevents duplicate plan creation
- Planning-only — never executes remediation

### scan.service.ts

**File:** `apps/pc-optimizer/src/features/scan/scan.service.ts`

**Changes:**
- Add `DashboardOptimizationPlanResponse` interface (same shape as `SmartOptimizationPlanResponse`)
- Add `dashboard_optimization_plan(actions)` method
- Add `SCAN_CORE_DASHBOARD_OPTIMIZATION_PLAN` RPC constant reference

### OneClickOptimize.tsx migration

**File:** `apps/pc-optimizer/src/features/dashboard/components/OneClickOptimize.tsx`

**Current flow:**
```
idle → preview (dashboard.optimize.preview) → confirm → optimizing (dashboard.optimize.execute) → complete
```

**Target flow:**
```
idle → preview (dashboard.optimize.preview)
→ createPlan (scan_core.dashboard_optimization.plan)
→ PlanReviewView (hydrate plan_id)
→ ResultsView
→ prepare → validate → approve → execute → progress → terminal → rollback
```

**Key changes:**
- Replace `onConfirm` (which called `advanceToOptimizeConfirm` → `executeOptimize`) with plan creation
- Render `PlanReviewView` after plan creation
- Render `ResultsView` for the canonical remediation flow
- Remove direct `executeOptimize` call from the confirm step

### DashboardViewModel.ts migration

**File:** `apps/pc-optimizer/src/features/dashboard/DashboardViewModel.ts`

**Changes:**
- `advanceToOptimizeConfirm()` → calls `useDashboardOptimizationPlan.createPlan()` instead of `executeOptimize()`
- `executeOptimize()` → removed from production UI path (retained for compatibility)
- Add plan creation state (`optimizePlanId`, `optimizePlanError`, etc.)

### BackgroundCleanupService.ts migration

**File:** `apps/pc-optimizer/src/features/health/BackgroundCleanupService.ts`

**Changes:**
- Remove `runStartupCleanup()` method (or make it notification-only)
- Remove `executeCleanup()` method (or convert to notification-only)
- Remove `ORCHESTRATOR_OPTIMIZE` call
- Retain `ProcessMonitorService` subscription for detection
- Add notification: "Cleanup opportunities available" (no destructive action)
- `start()` continues to subscribe to process monitor (detection-only)
- No destructive operations on process-closed events

### main.tsx migration

**File:** `apps/pc-optimizer/src/main.tsx`

**Changes:**
- Remove `void backgroundCleanupService.runStartupCleanup();` (line 50)
- Retain `backgroundCleanupService.start();` (line 49) for detection/notification only

---

## 9. RPC Contracts

### New RPC

| RPC | Direction | Purpose |
|-----|-----------|---------|
| `scan_core.dashboard_optimization.plan` | Frontend → Backend | Create canonical ActionPlan from Dashboard Optimization preview (planning-only) |

### Existing RPCs (reused, no modification)

| RPC | Purpose |
|-----|---------|
| `scan_core.remediation.prepare` | Prepare remediation preview |
| `scan_core.remediation.validate` | Validate remediation plan |
| `scan_core.remediation.execute` | Execute remediation (requires approval) |
| `scan_core.remediation.cancel` | Cancel running execution |
| `scan_core.remediation.status` | Poll execution status |
| `scan_core.remediation.rollback` | Rollback completed execution |
| `scan_core.scan.plan_details` | Hydrate plan for PlanReviewView |
| `dashboard.optimize.preview` | Get optimization preview (retained, non-destructive) |

### Legacy RPCs (disconnected, NOT removed)

| RPC | Status after SC-8C13 |
|-----|---------------------|
| `dashboard.optimize.execute` | Disconnected from production UI, retained for compatibility |
| `orchestrator.optimize` | Disconnected from BackgroundCleanupService, retained for compatibility |

---

## 10. Persistence Requirements

### What is persisted (backend-authoritative)

- `ActionPlan` — persisted by `ActionPlanRepository` (existing)
- `ExecutionRepository` — execution audit trail (existing)
- `ExecutionLedger` — duplicate execution prevention (existing)

### What is NOT persisted (browser storage prohibition)

- No `IndexedDB` for remediation state
- No `localStorage` for remediation state
- `DeferredCleanupStore` is deprecated and no longer populated

### Restart recovery

- `ExecutionRepository` seeds `ExecutionLedger` after restart (existing)
- No automatic resume (existing invariant)
- Stale plans are rejected (existing invariant)

---

## 11. Security Requirements

### Non-negotiable invariants (preserved from SC-8C10/11/12)

1. No automatic destructive execution
2. No automatic remediation at application startup
3. No automatic resume
4. No automatic rollback
5. Explicit user approval required
6. Backend-generated `plan_id`
7. Backend-authoritative actionability
8. Backend-authoritative safety classification
9. Stale-plan rejection
10. Duplicate execution prevention
11. `ExecutionLedger` protection
12. `ActionPlanRepository` persistence
13. `ExecutionRepository` audit trail
14. Canonical rollback
15. No frontend direct filesystem/registry/process mutation
16. No direct subprocess/PowerShell/reg.exe execution from frontend
17. No browser storage for remediation state
18. Privacy-safe RPC boundaries
19. No fabricated `execution_id`
20. `ResultsView` remains the canonical remediation UI

### SC-8C13-specific security requirements

- Background Cleanup Service MUST NOT call `ORCHESTRATOR_OPTIMIZE` automatically
- Background Cleanup Service MUST NOT perform any destructive operation
- `main.tsx` MUST NOT call `runStartupCleanup()` (or any destructive startup cleanup)
- Dashboard Optimize MUST NOT call `dashboard.optimize.execute` from production UI
- Dashboard Optimize MUST use `scan_core.dashboard_optimization.plan` → `scan_core.remediation.*` flow
- Unsupported operations (Flush DNS, Trim Memory) MUST NOT be executable through `scan_core`

---

## 12. Privacy Requirements

- RPC responses MUST NOT include sensitive file paths in plaintext
- `DashboardOptimizationAdapter` MUST use privacy-safe path serialization (same as `SecurityRemediationAdapter`)
- Plan details returned to frontend MUST use canonical, privacy-safe format
- No browsing history, cookies, or credentials in RPC responses

---

## 13. UX Requirements

### Dashboard One-Click Optimize

- User clicks "Optimize Now" → preview is shown (existing)
- User clicks "Confirm" → plan is created (new)
- `PlanReviewView` hydrates and displays the plan (new)
- User clicks "Prepare" → `scan_core.remediation.prepare` (new)
- User clicks "Validate" → `scan_core.remediation.validate` (new)
- User clicks "Approve & Fix" → `scan_core.remediation.execute` (new)
- Progress is shown via `ResultsView` (new)
- Terminal state is shown (completed/partial/failed/cancelled) (new)
- Optional rollback is available (new)

### Background Cleanup

- At startup: NO automatic cleanup
- If deferred items exist: notification "Cleanup opportunities available"
- User clicks notification → opens Dashboard or Scan page
- User follows canonical scan/review/approve/execute flow

---

## 14. Testing Requirements

### Background Cleanup tests

- Application startup never performs destructive cleanup
- No `ORCHESTRATOR_OPTIMIZE` RPC call during startup
- No filesystem mutation during startup
- No registry mutation during startup
- Notification/detection behavior is non-destructive
- Repeated startup is safe (no cumulative side effects)
- `ProcessMonitorService` subscription continues (detection-only)
- `BackgroundCleanupService.start()` does not trigger cleanup

### Dashboard Optimize tests

- Scan/analysis (preview) works
- Plan creation via `scan_core.dashboard_optimization.plan` works
- Backend generates `plan_id`
- Unsupported operations (Flush DNS, Trim Memory) are NOT executable
- `PlanReviewView` hydrates safely
- `prepare` is required before `validate`
- `validate` is required before `approve`
- Explicit approval is required before `execute`
- Execution requires approval token (`request_id`)
- Duplicate clicks are guarded (`hasRequestedExecution` ref)
- Stale plans are rejected
- Missing `execution_id` is handled gracefully
- Progress polling is correct
- Terminal states are correct (completed/partial/failed/cancelled)
- Rollback is optional and explicit

### Security tests

- No legacy automatic execution path in `BackgroundCleanupService`
- No direct filesystem/process mutation in frontend
- No browser remediation persistence (`DeferredCleanupStore` not populated)
- No bypass of `SafetyGate`
- No bypass of `RemediationCoordinator`
- No legacy `orchestrator.optimize` call from `BackgroundCleanupService`
- No legacy `dashboard.optimize.execute` call from production UI

### Adapter tests

- `DashboardOptimizationAdapter` converts all 6 supported operations correctly
- `DashboardOptimizationAdapter` classifies Flush DNS and Trim Memory as unsupported
- `DashboardOptimizationPlanBuilder` generates valid `ActionPlan`
- `DashboardOptimizationPlanBuilder` generates backend `plan_id`
- `CapabilityContract` is respected
- `SafetyGate` is respected

### Integration tests

- Full flow: preview → plan → prepare → validate → approve → execute → terminal
- Rollback flow: terminal → rollback → success
- Stale plan rejection
- Duplicate execution prevention
- Restart recovery (no auto-resume)

---

## 15. Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| AC1 | Background Cleanup cannot perform destructive operations automatically | Grep for `ORCHESTRATOR_OPTIMIZE` in `BackgroundCleanupService.ts` → 0 matches |
| AC2 | `main.tsx` does not call `runStartupCleanup()` | Grep for `runStartupCleanup` in `main.tsx` → 0 matches |
| AC3 | Dashboard Optimize cannot execute destructive operations directly | Grep for `executeOptimize` in production UI path → 0 matches |
| AC4 | All supported optimization actions use `scan_core` | Adapter maps 6 operations to existing `ActionType` values |
| AC5 | All destructive actions require explicit approval | `useResults` `approve()` requires `hasRequestedExecution` ref |
| AC6 | Unsupported actions cannot accidentally execute | Adapter classifies Flush DNS and Trim Memory as `is_supported=False` |
| AC7 | Backend owns plan identity and safety classification | `plan_id` generated by `DashboardOptimizationPlanBuilder` |
| AC8 | `ResultsView` is the sole remediation UI | Dashboard uses `PlanReviewView` → `ResultsView` |
| AC9 | Rollback uses canonical `scan_core.remediation.rollback` | No custom rollback in Dashboard |
| AC10 | Existing SC-8C10/11/12 invariants remain intact | Security regression audit |
| AC11 | No new remediation engine is introduced | No new coordinator/executor/approval system |
| AC12 | No new parallel execution architecture is introduced | All execution via `RemediationCoordinator` |
| AC13 | No browser storage for remediation state | `DeferredCleanupStore` not populated |
| AC14 | No new `ActionType` values | `ActionType` enum unchanged |
| AC15 | No new target executors | Executor files unchanged |

---

## 16. Definition of Done

- [ ] Implementation complete (all phases)
- [ ] Legacy execution disconnected (`dashboard.optimize.execute` and `orchestrator.optimize` not called from production UI)
- [ ] `BackgroundCleanupService` no longer performs destructive operations
- [ ] `main.tsx` no longer calls `runStartupCleanup()`
- [ ] Dashboard Optimize uses canonical `scan_core` flow
- [ ] All tests complete and passing
- [ ] Typecheck pass (`tsc -p tsconfig.json --noEmit && tsc -p electron/tsconfig.json --noEmit`)
- [ ] Lint pass (`eslint "{src,electron}/**/*.{ts,tsx}" --max-warnings=0`)
- [ ] Build pass (`vite build`)
- [ ] Backend suite pass (`pytest backend/tests`)
- [ ] Frontend suite pass (`vitest run`)
- [ ] Security grep pass (no `ORCHESTRATOR_OPTIMIZE` in `BackgroundCleanupService.ts`, no `executeOptimize` in production UI path)
- [ ] Privacy audit pass (no sensitive paths in RPC responses)
- [ ] Concurrency audit pass (ref guards in place)
- [ ] UX audit pass (canonical flow followed)
- [ ] Persistence/recovery audit pass (no browser storage, restart recovery works)
- [ ] Final `SC8C13_FINAL_SECURITY_REGRESSION_AUDIT.md` created

**Intermittent/pre-existing failures:** Must be explicitly isolated and verified independently (same as SC-8C12 Phase 5).

---

## 17. Dependencies on SC-8C12

| Dependency | Status |
|------------|--------|
| Canonical `scan_core` architecture | ✅ Production-ready (SC-8C8) |
| `RemediationCoordinator` | ✅ Available (SC-8C8) |
| `SafetyGate` | ✅ Available (SC-8C8) |
| `ActionPlanRepository` | ✅ Available (SC-8C8) |
| `ExecutionRepository` | ✅ Available (SC-8C8) |
| `ExecutionLedger` | ✅ Available (SC-8C8) |
| `ResultsView` / `useResults` | ✅ Available (SC-8C8) |
| `PlanReviewView` | ✅ Available (SC-8C9) |
| Adapter/PlanBuilder pattern | ✅ Proven (SC-8C11, SC-8C12) |
| `scan_core.remediation.*` RPCs | ✅ Available (SC-8C8) |
| `scan_core.scan.plan_details` | ✅ Available (SC-8C8) |

---

## 18. Unresolved Decisions

None. All product decisions (D1–D6) are resolved from repository evidence and the approved Phase 2 direction.

---

## 19. Background Cleanup Operation Mapping

### Current implementation

| Operation | Current implementation | Current mutation | Current service/RPC | Automatic? |
|-----------|----------------------|-----------------|-------------------|-----------|
| Deferred cleanup | `BackgroundCleanupService.executeCleanup()` | File deletion, cache clearing | `ORCHESTRATOR_OPTIMIZE` | **YES** (at boot + on process close) |

### Proposed SC-8C13 treatment

| Operation | Can scan_core represent? | Existing ActionType? | Existing executor? | Rollback? | Privacy | Proposed treatment |
|-----------|------------------------|---------------------|-------------------|----------|---------|-------------------|
| Deferred cleanup items | YES (same as Dashboard Optimize operations) | `DELETE_FILE`, `DELETE_DIRECTORY`, `CLEAR_CACHE`, `CLEAR_BROWSER_CACHE` | `FilesystemExecutor`, `BrowserExecutor` | YES (canonical) | LOW | Convert to notification → user opens canonical flow |

### Acceptance test

- Given: Application starts with deferred items in `DeferredCleanupStore`
- When: `main.tsx` initializes
- Then: NO `ORCHESTRATOR_OPTIMIZE` RPC is called
- And: NO filesystem mutation occurs
- And: User receives notification "Cleanup opportunities available"
- And: User can open canonical scan/review/approve/execute flow

---

## 20. Dashboard Optimize Operation Mapping

### Current implementation

| Operation | Current execution path | Current approval | Bypasses scan_core? | Mutates system? | Rollback? |
|-----------|----------------------|-----------------|---------------------|----------------|----------|
| Clean temp files | `_clean_temp_files()` | Confirm button | YES | YES | NO |
| Empty Recycle Bin | `empty_recycle_bin()` | Confirm button | YES | YES | NO |
| Clean browser cache | `_clean_browser_cache()` | Confirm button | YES | YES | NO |
| Clean thumbnail cache | `_clean_thumbnail_cache()` | Confirm button | YES | YES | NO |
| Clean prefetch | `_clean_prefetch()` | Confirm button | YES | YES | NO |
| Clean Windows Update cache | `_clean_windows_update_cache()` | Confirm button | YES | YES | NO |
| Flush DNS | `_flush_dns()` → `subprocess.run(["ipconfig", "/flushdns"])` | Confirm button | YES | YES | NO |
| Trim Memory | `_trim_memory()` → `optimize_memory()` | Confirm button | YES | YES | NO |

### Canonical ActionType compatibility

| Operation | Canonical ActionType | Canonical executor | Classification |
|-----------|---------------------|-------------------|----------------|
| Clean temp files | `DELETE_FILE` | `FilesystemExecutor` | **IN SCOPE** |
| Empty Recycle Bin | `DELETE_DIRECTORY` | `FilesystemExecutor` | **IN SCOPE** |
| Clean browser cache | `CLEAR_BROWSER_CACHE` | `BrowserExecutor` | **IN SCOPE** |
| Clean thumbnail cache | `CLEAR_CACHE` | `BrowserExecutor` | **IN SCOPE** |
| Clean prefetch | `DELETE_FILE` | `FilesystemExecutor` | **IN SCOPE** |
| Clean Windows Update cache | `DELETE_FILE` | `FilesystemExecutor` | **IN SCOPE** |
| Flush DNS | **NONE** | **NONE** | **OUT_OF_SCOPE** |
| Trim Memory | **NONE** | **NONE** | **OUT_OF_SCOPE** |

### Proposed migration

| Operation | Proposed migration |
|-----------|------------------|
| Clean temp files | `DashboardOptimizationAdapter` → `DELETE_FILE` → `FilesystemExecutor` |
| Empty Recycle Bin | `DashboardOptimizationAdapter` → `DELETE_DIRECTORY` → `FilesystemExecutor` |
| Clean browser cache | `DashboardOptimizationAdapter` → `CLEAR_BROWSER_CACHE` → `BrowserExecutor` |
| Clean thumbnail cache | `DashboardOptimizationAdapter` → `CLEAR_CACHE` → `BrowserExecutor` |
| Clean prefetch | `DashboardOptimizationAdapter` → `DELETE_FILE` → `FilesystemExecutor` |
| Clean Windows Update cache | `DashboardOptimizationAdapter` → `DELETE_FILE` → `FilesystemExecutor` |
| Flush DNS | **OUT_OF_SCOPE** — remains as standalone utility, NOT in `scan_core` |
| Trim Memory | **OUT_OF_SCOPE** — remains as standalone utility, NOT in `scan_core` |

---

## 21. Explicit SC-8C14 Boundary

SC-8C14 is NOT started. This specification explicitly prohibits:
- Starting SC-8C14 or any later phase
- Implementing module-level cleaner migration (Candidate D)
- Implementing pause/resume (Candidate F)
- Creating new `ActionType` values
- Creating new target executors
- Modifying `SafetyGate`
- Modifying `RemediationCoordinator`
- Modifying `scan_core` internals

---

## 22. Three-Module Consistency (Post-SC-8C13)

After SC-8C13, all modules that perform remediation use the canonical `scan_core` flow:

| Module | Planning | Review | Execution | Status |
|--------|---------|--------|-----------|--------|
| Protection Center | `scan_core.scan.*` | `PlanReviewView` | `ResultsView` → `RemediationCoordinator` | ✅ SC-8C8 |
| Smart Optimization | `scan_core.smart_optimization.plan` | `PlanReviewView` | `ResultsView` → `RemediationCoordinator` | ✅ SC-8C11 |
| Security Center | `scan_core.security_remediation.plan` | `PlanReviewView` | `ResultsView` → `RemediationCoordinator` | ✅ SC-8C12 |
| Dashboard Optimize | `scan_core.dashboard_optimization.plan` | `PlanReviewView` | `ResultsView` → `RemediationCoordinator` | 🔄 SC-8C13 |
| Background Cleanup | N/A (notification-only) | N/A | N/A (no automatic execution) | 🔄 SC-8C13 |

---

## 23. Legacy Code Retention

| Component | Location | Status after SC-8C13 | Reason retained |
|-----------|----------|---------------------|-----------------|
| `dashboard_optimize_execute()` | `dashboard/__init__.py` | Disconnected from production UI | Compatibility, retained for tests |
| `orchestrator_optimize()` | `orchestrator/__init__.py` | Disconnected from BackgroundCleanupService | Compatibility, retained for tests |
| `BackgroundCleanupService.executeCleanup()` | `BackgroundCleanupService.ts` | Removed or converted to notification | N/A — removed or converted |
| `BackgroundCleanupService.runStartupCleanup()` | `BackgroundCleanupService.ts` | Removed | N/A — removed |
| `DeferredCleanupStore` | `DeferredCleanupStore.ts` | Deprecated, not populated | Compatibility, classified as dead code |
| `OneClickOptimize.tsx` (old flow) | `dashboard/components/` | Migrated to PlanReviewView/ResultsView | N/A — migrated |
| `DashboardViewModel.executeOptimize()` | `DashboardViewModel.ts` | Disconnected from production UI | Compatibility, retained for tests |

**None of the retained legacy code is reachable from the production remediation execution path.**

---

## 24. Concurrency Controls

| Guard | Location | Purpose |
|-------|----------|---------|
| `isCreatingRef` | `useDashboardOptimizationPlan` | Prevents duplicate plan creation |
| `isPreparingRef` | `useResults` | Prevents duplicate prepare calls |
| `isValidatingRef` | `useResults` | Prevents duplicate validate calls |
| `hasRequestedExecution` | `useResults` | Prevents duplicate execute calls |
| `hasRequestedRollback` | `useResults` | Prevents duplicate rollback calls |
| `pollTimer` cleanup | `useResults` | Cleans up polling on terminal/error/cleanup |

---

## 25. Privacy-Safe Serialization

`DashboardOptimizationAdapter` MUST use privacy-safe path serialization, identical to `SecurityRemediationAdapter`:

- Paths are canonicalized but not truncated in the backend (backend is trusted)
- RPC responses to frontend MUST NOT include raw sensitive paths
- `PlanReviewView` receives canonical, privacy-safe plan details from `scan_core.scan.plan_details`

---

## 26. Stale-Plan Validation

- Plans have `snapshot_ttl_seconds` (3600 = 1 hour, same as SC-8C11)
- `scan_core.remediation.prepare` validates plan freshness
- Stale plans are rejected with explicit error
- Frontend displays "Plan is stale, please re-scan" message

---

## 27. Duplicate Execution Prevention

- `ExecutionLedger` prevents duplicate completed actions (existing)
- `ExecutionRepository` seeds `ExecutionLedger` after restart (existing)
- `hasRequestedExecution` ref prevents duplicate execute calls (existing in `useResults`)

---

## 28. Rollback

- Rollback uses canonical `scan_core.remediation.rollback` (existing)
- Rollback is optional and explicit (existing invariant)
- No automatic rollback (existing invariant)
- `FilesystemExecutor` requires `BackupManager` for live execution (existing)
- `BrowserExecutor` supports rollback for cache clearing (existing)

---

## 29. Frontend/Backend Authority Boundaries

| Responsibility | Authority |
|---------------|-----------|
| Plan creation | Backend (`DashboardOptimizationPlanBuilder`) |
| `plan_id` generation | Backend (`uuid.uuid4()`) |
| Actionability classification | Backend (`CapabilityContract`) |
| Safety classification | Backend (`SafetyGate`) |
| Execution coordination | Backend (`RemediationCoordinator`) |
| `execution_id` generation | Backend (`RemediationCoordinator`) |
| Stale-plan validation | Backend |
| Duplicate execution prevention | Backend (`ExecutionLedger`) |
| Plan persistence | Backend (`ActionPlanRepository`) |
| Execution persistence | Backend (`ExecutionRepository`) |
| UI rendering | Frontend (`PlanReviewView`, `ResultsView`) |
| User approval | Frontend (explicit button click) |

**Frontend MUST NEVER:**
- Fabricate `ActionPlan` or `plan_id`
- Fabricate `execution_id`
- Perform destructive system operations
- Call `dashboard.optimize.execute` from production UI
- Call `orchestrator.optimize` from production UI
- Store remediation state in browser storage

---

## 30. Existing Architecture Reuse

| Component | Reused from | Modification? |
|-----------|------------|--------------|
| `ActionType` enum | SC-8C3 | NO |
| `FilesystemExecutor` | SC-8C6 | NO |
| `BrowserExecutor` | SC-8C6 | NO |
| `RemediationCoordinator` | SC-8C8 | NO |
| `SafetyGate` | SC-8C4 | NO |
| `CapabilityContract` | SC-8C4 | NO |
| `ActionPlanRepository` | SC-8C8 | NO |
| `ExecutionRepository` | SC-8C8 | NO |
| `ExecutionLedger` | SC-8C8 | NO |
| `PlanReviewView` | SC-8C9 | NO |
| `ResultsView` | SC-8C8 | NO |
| `useResults` | SC-8C8 | NO |
| `scan_core.remediation.*` RPCs | SC-8C8 | NO |
| `scan_core.scan.plan_details` | SC-8C8 | NO |
| Adapter pattern | SC-8C11 | New instance, same pattern |
| Plan builder pattern | SC-8C11 | New instance, same pattern |
| Frontend hook pattern | SC-8C11 | New instance, same pattern |

---

## 31. Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Background cleanup behavior change | MEDIUM | Convert to notification-only; users still get cleanup via canonical flow |
| Dashboard UX change | MEDIUM | Follow proven SC-8C11/SC-8C12 pattern; preview step preserved |
| Flush DNS / Trim Memory no longer in One-Click Optimize | LOW | Remains available as standalone utility; classified as OUT_OF_SCOPE |
| `DeferredCleanupStore` deprecation | LOW | No consumers after Background Cleanup migration; classified as dead code |
| `orchestrator.optimize` disconnection | LOW | Retained for compatibility; no production caller after migration |
| `dashboard.optimize.execute` disconnection | LOW | Retained for compatibility; no production caller after migration |

---

## 32. Evidence Summary

| Evidence | Source | Strength |
|----------|--------|----------|
| Background Cleanup starts at boot | `main.tsx:49-50` | Direct code evidence |
| Background Cleanup calls ORCHESTRATOR_OPTIMIZE | `BackgroundCleanupService.ts:157` | Direct code evidence |
| "No user interaction required" | `BackgroundCleanupService.ts:13` | Direct code evidence |
| DeferredCleanupStore uses IndexedDB | `DeferredCleanupStore.ts:13` | Direct code evidence |
| Dashboard Optimize bypasses scan_core | `dashboard/__init__.py:606` | Direct code evidence |
| Dashboard Optimize has 7 destructive operations | `dashboard/__init__.py:645-812` | Direct code evidence |
| Flush DNS uses subprocess | `dashboard/__init__.py:2079` | Direct code evidence |
| Trim Memory uses optimize_memory | `dashboard/__init__.py:2233` | Direct code evidence |
| ActionType enum has 8 values (no DNS/memory) | `scan_core/rules/action.py:183-198` | Architecture evidence |
| CapabilityMatrix has no DNS/memory | `scan_core/rules/actionability.py:33-77` | Architecture evidence |
| SC-8C11 adapter pattern is proven | `smart_optimization_adapter.py` | Implementation evidence |
| SC-8C11 plan builder pattern is proven | `smart_optimization_plan_builder.py` | Implementation evidence |
| SC-8C11 frontend hook pattern is proven | `useSmartOptimizationPlan.ts` | Implementation evidence |
| SC-8C12 adapter pattern is proven | `security_remediation_adapter.py` | Implementation evidence |
| SC-8C11 explicitly deferred Background Cleanup | `SC8C11_SPECIFICATION.md:93` | Authoritative |
| SC-8C11 explicitly deferred Dashboard migration | `SC8C11_SPECIFICATION.md:92` | Authoritative |
| SC-8C10 audit identified Background Cleanup | `SC8C10_FINAL_PRODUCTION_READINESS_AUDIT.md:742` | Audit finding |

---

## 33. Final Verdict

### READY_TO_IMPLEMENT

**Rationale:**

All required product decisions (D1–D6) are resolved from repository evidence and the approved Phase 2 direction:

- D1 (Background Cleanup): Resolved — convert to notification-only, no automatic execution
- D2 (Dashboard Optimize): Resolved — migrate to canonical `scan_core` flow
- D3 (Unsupported Actions): Resolved — Flush DNS and Trim Memory classified as OUT_OF_SCOPE
- D4 (DeferredCleanupStore): Resolved — deprecated, no longer populated
- D5 (Candidate C and E): Resolved — OUT_OF_SCOPE, unrelated to A+B
- D6 (SC-8C13 vs SC-8C14): Resolved — no core changes required, all operations map to existing ActionType/executor

No requirement needs:
- New `ActionType` values
- New target executors
- `SafetyGate` modification
- `RemediationCoordinator` modification
- `scan_core` internal modification
- New persistence architecture

The implementation follows the proven SC-8C11/SC-8C12 pattern exactly.

**SC-8C13 was NOT implemented during this specification phase.**
**SC-8C14 was NOT started.**
**No production code, tests, or documentation were modified.**

---

**End of SC-8C13 Specification**
