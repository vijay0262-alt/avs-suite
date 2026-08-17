# SC-8C13 Phase 2 — Dashboard Optimization Canonical Planning Report

## 1. Objective

Migrate the backend planning path for Dashboard One-Click Optimize into the canonical `scan_core` `ActionPlan` architecture. Create a safe backend planning boundary that converts Dashboard Optimize preview actions into canonical `RemediationAction`s, builds an immutable `ActionPlan` with a backend-generated `plan_id`, persists it via `ActionPlanRepository`, and returns a privacy-safe RPC response.

The plan creation layer is **planning-only**. It does NOT execute remediation.

---

## 2. Existing Dashboard Optimize Architecture

### Current flow (before SC-8C13)

```
Dashboard UI
→ dashboard.optimize.preview (read-only, returns action list with name/size/description)
→ user clicks "Optimize Now" confirm
→ dashboard.optimize.execute (DESTRUCTIVE — bypasses scan_core entirely)
  → _clean_temp_files()
  → empty_recycle_bin()
  → _clean_browser_cache()
  → _clean_thumbnail_cache()
  → _clean_prefetch()
  → _clean_windows_update_cache()
  → _flush_dns() (subprocess: ipconfig /flushdns)
  → _trim_memory() (optimize_memory)
```

### Security concerns

- `dashboard.optimize.execute` performs 8 categories of destructive operations directly
- No `ActionPlan` creation, no `plan_id`, no `SafetyGate`, no `RemediationCoordinator`
- No canonical rollback, no `ExecutionLedger`, no `ExecutionRepository`
- Flush DNS and Trim Memory have no canonical `ActionType` or executor

### SC-8C13 Phase 2 target

```
Dashboard Optimize preview actions
→ DashboardOptimizationAdapter (NEW)
→ DashboardOptimizationPlanBuilder (NEW)
→ canonical ActionPlan
→ ActionPlanRepository (existing)
→ backend-generated plan_id
→ sanitized RPC response
```

---

## 3. Supported Operation Mappings

| # | Dashboard Optimize operation | Canonical ActionType | Existing executor | RuleCategory | Supported |
|---|------------------------------|---------------------|-------------------|--------------|-----------|
| 1 | `clean_temp_files` | `DELETE_FILE` | `FilesystemExecutor` | `TEMPORARY` | YES |
| 2 | `empty_recycle_bin` | `DELETE_DIRECTORY` | `FilesystemExecutor` | `JUNK` | YES |
| 3 | `clean_browser_cache` | `CLEAR_BROWSER_CACHE` | `BrowserExecutor` | `BROWSER` | YES |
| 4 | `clean_thumbnail_cache` | `CLEAR_CACHE` | `BrowserExecutor` (cache) | `CACHE` | YES |
| 5 | `clean_prefetch` | `DELETE_FILE` | `FilesystemExecutor` | `TEMPORARY` | YES |
| 6 | `clean_windows_update_cache` | `DELETE_FILE` | `FilesystemExecutor` | `TEMPORARY` | YES |

All 6 supported operations map to existing `ActionType` values and existing executors. No new `ActionType` values were created. No new executors were created.

---

## 4. Unsupported Operation Handling

| # | Dashboard Optimize operation | ActionType | Executor | Classification | Reason |
|---|------------------------------|-----------|---------|----------------|--------|
| 7 | `flush_dns` | `NONE` | NONE | `OUT_OF_SCOPE` / `NOT_FIXABLE` | Flush DNS has no scan_core ActionType or executor |
| 8 | `trim_memory` | `NONE` | NONE | `OUT_OF_SCOPE` / `NOT_FIXABLE` | Memory trim has no scan_core ActionType or executor |

### Safety guarantees for unsupported operations

- `action_type = ActionType.NONE`
- `state = ActionState.NOT_FIXABLE`
- `is_actionable = False`
- `is_fixable = False`
- `is_auto_fixable = False`
- `fixability = Fixability.NOT_FIXABLE`
- `rule_capability = RuleCapability.NO_REMEDIATION`
- `target = _NoTarget()`
- `requires_review = True`
- `backup_required = False`
- `rollback_supported = False`
- No preconditions (empty `frozenset()`)

Unsupported operations **cannot become executable** even if `rollbackAvailable=True` is set — the adapter enforces this invariant.

---

## 5. Adapter Architecture

**File:** `backend/src/avs_backend/scan_core/adapters/dashboard_optimization_adapter.py`

### Pattern

Follows the SC-8C11 `SmartOptimizationAdapter` and SC-8C12 `SecurityRemediationAdapter` pattern exactly.

### Components

- `DashboardOptimizationActionMapping` (frozen dataclass) — maps Dashboard Optimize action type to canonical `ActionType`
- `DASHBOARD_OPT_ACTION_MAPPINGS` — dict with 8 entries (6 supported + 2 unsupported)
- `DashboardOptimizationAdapter` class — converts actions to `RemediationAction`s
- `is_dashboard_optimization_action_supported()` — helper function
- `get_dashboard_optimization_action_mapping()` — helper function

### What the adapter does

- Accepts Dashboard Optimize action data (type, title, description, size, rollbackAvailable)
- Maps supported operations to existing `ActionType` values
- Creates `FilesystemActionTarget` with empty `canonical_path` (backend resolves during execution)
- Creates `PreconditionSet` with safety preconditions (`TargetExists`, `TargetAccessible`, `PathWithinAllowedScope`, `NotReparsePoint`, `NotSymlink`, `TargetNotLocked`)
- Computes statistics (`converted`, `unsupported`, `errors`)
- Marks unsupported operations as `NOT_FIXABLE`

### What the adapter does NOT do

- NEVER executes remediation
- NEVER calls legacy optimization services (`dashboard.optimize.execute`, `orchestrator.optimize`)
- NEVER calls target executors
- NEVER invokes `SafetyGate` directly
- NEVER invokes `RemediationCoordinator.execute`
- NEVER mutates filesystem/registry/browser state
- NEVER bypasses `CapabilityContract`

---

## 6. Plan Builder Architecture

**File:** `backend/src/avs_backend/scan_core/adapters/dashboard_optimization_plan_builder.py`

### Pattern

Follows the SC-8C11 `SmartOptimizationPlanBuilder` pattern exactly.

### Components

- `_build_action_summary()` — computes `ActionSummary` statistics from actions tuple
- `DashboardOptimizationPlanBuilder` class — builds canonical `ActionPlan`

### What the plan builder does

- Converts Dashboard Optimize actions via `DashboardOptimizationAdapter`
- Computes `ActionSummary` statistics (total, auto_fixable, review_required, not_fixable, blocked, estimated_size, actions_by_type, highest_priority, largest_affected)
- Generates backend-owned `plan_id` (`uuid.uuid4()`)
- Creates canonical `ActionPlan` with:
  - `snapshot_version = "dashboard_optimization_1.0.0"`
  - `snapshot_ttl_seconds = 3600` (1 hour)
- Returns the plan (persistence is handled by the RPC layer)

### What the plan builder does NOT do

- Does NOT persist the plan (persistence is handled by the RPC layer via `ActionPlanRepository`)
- Does NOT execute remediation
- Does NOT call legacy optimization services

---

## 7. RPC Contract

### RPC method

`scan_core.dashboard_optimization.plan`

### Registration

`backend/src/avs_backend/scan_core_rpc/__init__.py`

### Request

```json
{
    "actions": [
        {
            "id": "action-1",
            "type": "clean_temp_files",
            "title": "Temporary Files",
            "description": "Windows and user temporary files",
            "size": 12345,
            "rollbackAvailable": true
        },
        ...
    ]
}
```

Only `type` is required. `id`, `title`, `description`, `size`, and `rollbackAvailable` are optional.

### Success response

```json
{
    "ok": true,
    "plan_id": "uuid",
    "total_actions": 8,
    "auto_fixable": 6,
    "review_required": 0,
    "not_fixable": 2,
    "estimated_affected_size": 4280,
    "statistics": {
        "converted": 6,
        "unsupported": 2,
        "errors": 0
    }
}
```

### Failure response

```json
{
    "ok": false,
    "error": "Missing or invalid parameter: actions"
}
```

### Privacy guarantees

The response NEVER exposes:
- `canonical_path`
- `asset_id`
- `backup_location`
- `registry_key`
- `browser_profile`
- raw evidence
- internal executor payloads

### Behavioral guarantees

- Planning-only — does NOT execute remediation
- Does NOT call legacy `dashboard.optimize.execute`
- Does NOT call legacy `orchestrator.optimize`
- Does NOT call `RemediationCoordinator.execute`
- `plan_id` is returned ONLY when persistence succeeds
- Uses `DashboardOptimizationPlanBuilder` to create canonical `ActionPlan`
- Persists via existing `ActionPlanRepository`

---

## 8. Persistence Behavior

### Repository

Uses the existing `ActionPlanRepository` (no new database, no new persistence layer).

### Verified behaviors

| Behavior | Test | Result |
|----------|------|--------|
| Plan survives repository reload | `test_plan_persistence_round_trip` | ✅ Pass |
| Plan survives new repository instance | `test_plan_survives_new_repository_instance` | ✅ Pass |
| Duplicate save is safe (updates) | `test_plan_duplicate_save` | ✅ Pass |
| Unsupported actions remain NOT_FIXABLE after reload | `test_persisted_plan_unsupported_actions_remain_not_fixable` | ✅ Pass |
| No raw sensitive data in persisted plan | `test_persisted_plan_no_raw_sensitive_data` | ✅ Pass |
| `plan_id` remains stable across reloads | `test_plan_persistence_round_trip` | ✅ Pass |

### What was NOT created

- No new database
- No new `ActionPlan` persistence
- No new execution repository
- No new approval store
- No new rollback store

---

## 9. Privacy/Security Analysis

### Privacy

- `canonical_path` is always empty in the adapter output (backend resolves during execution)
- `asset_id` is the action ID (non-sensitive, no path separators or registry keys)
- `backup_location` and `backup_identity` are `None` (assigned during execution)
- RPC response contains only safe metadata (`plan_id`, counts, statistics)
- No browser profile paths, registry keys, or raw evidence in responses
- Metadata contains only `source`, `dashboard_opt_type`, and `title`

### Security

- Zero destructive execution in the adapter, plan builder, or RPC
- No `subprocess`, `child_process`, `PowerShell`, `reg.exe`, `os.remove`, `shutil.rmtree` calls
- No calls to `dashboard.optimize.execute` or `orchestrator.optimize`
- No calls to `RemediationCoordinator.execute`
- No calls to target executors
- No `SafetyGate` bypass (adapter does not invoke `SafetyGate` directly)
- No `RemediationCoordinator` bypass (adapter does not invoke `RemediationCoordinator`)
- Unsupported operations are classified as `NOT_FIXABLE` and cannot become executable

### Security invariants preserved

- No automatic execution
- No automatic approval
- No automatic rollback
- Backend owns `plan_id` generation
- Backend owns actionability classification
- Backend owns safety classification
- `ActionPlan` is immutable
- `ActionPlanRepository` persistence is backend-authoritative

---

## 10. Tests Added

### Adapter tests

**File:** `backend/tests/test_dashboard_optimization_adapter.py`
**Test count:** 37 tests

| Category | Tests | Count |
|----------|-------|-------|
| Supported operation mappings | `test_clean_temp_files_maps_to_delete_file`, `test_empty_recycle_bin_maps_to_delete_directory`, `test_clean_browser_cache_maps_to_clear_browser_cache`, `test_clean_thumbnail_cache_maps_to_clear_cache`, `test_clean_prefetch_maps_to_delete_file`, `test_clean_windows_update_cache_maps_to_delete_file` | 6 |
| Unsupported operation handling | `test_flush_dns_is_unsupported`, `test_trim_memory_is_unsupported`, `test_unsupported_action_cannot_become_executable` | 3 |
| ActionTarget | `test_supported_action_has_filesystem_target`, `test_unsupported_action_has_no_target` | 2 |
| Preconditions | `test_supported_action_has_preconditions`, `test_unsupported_action_has_no_preconditions` | 2 |
| Rollback capability | `test_rollback_available_supported`, `test_rollback_not_available_unsupported`, `test_rollback_false_when_not_available` | 3 |
| Statistics | `test_statistics_all_supported`, `test_statistics_all_unsupported`, `test_statistics_mixed` | 3 |
| Edge cases | `test_empty_input`, `test_missing_type_raises_value_error`, `test_unknown_action_type_is_unsupported`, `test_missing_id_generates_id`, `test_estimated_size_set_correctly`, `test_estimated_size_none_when_zero`, `test_estimated_size_none_when_missing` | 7 |
| No execution | `test_adapter_performs_no_execution` | 1 |
| Helper functions | `test_is_dashboard_optimization_action_supported_supported`, `test_is_dashboard_optimization_action_supported_unsupported`, `test_is_dashboard_optimization_action_supported_unknown`, `test_get_dashboard_optimization_action_mapping_exists`, `test_get_dashboard_optimization_action_mapping_not_found` | 5 |
| Mapping table | `test_mapping_table_has_8_entries`, `test_mapping_table_supported_count`, `test_mapping_table_unsupported_count` | 3 |
| Privacy | `test_no_canonical_path_in_target`, `test_no_sensitive_data_in_metadata` | 2 |

### Integration tests

**File:** `backend/tests/test_dashboard_optimization_integration.py`
**Test count:** 32 tests

| Category | Tests | Count |
|----------|-------|-------|
| Plan builder | `test_build_plan_creates_action_plan`, `test_build_plan_action_mapping`, `test_build_plan_supported_action_state`, `test_build_plan_summary_statistics`, `test_build_plan_empty_actions`, `test_build_plan_stable_action_ids`, `test_build_plan_unique_plan_ids`, `test_build_plan_no_execution`, `test_build_plan_privacy_safe`, `test_build_plan_snapshot_version`, `test_build_plan_snapshot_ttl` | 11 |
| Action summary | `test_build_action_summary_empty`, `test_build_action_summary_single_action` | 2 |
| Persistence | `test_plan_persistence_round_trip`, `test_plan_survives_new_repository_instance`, `test_plan_duplicate_save`, `test_persisted_plan_unsupported_actions_remain_not_fixable`, `test_persisted_plan_no_raw_sensitive_data` | 5 |
| RPC | `test_dashboard_optimization_plan_rpc_registered`, `test_dashboard_optimization_plan_rpc_returns_plan_id`, `test_dashboard_optimization_plan_rpc_statistics`, `test_dashboard_optimization_plan_rpc_sanitized`, `test_dashboard_optimization_plan_rpc_missing_actions`, `test_dashboard_optimization_plan_rpc_invalid_actions`, `test_dashboard_optimization_plan_rpc_empty_actions`, `test_dashboard_optimization_plan_rpc_supported_only`, `test_dashboard_optimization_plan_rpc_unsupported_only`, `test_dashboard_optimization_plan_rpc_unsupported_not_executable`, `test_dashboard_optimization_plan_rpc_plan_id_only_when_persisted`, `test_dashboard_optimization_plan_rpc_no_execution`, `test_dashboard_optimization_plan_rpc_does_not_call_legacy_execute`, `test_dashboard_optimization_plan_rpc_unknown_action_type` | 14 |

### Total new tests: 69

---

## 11. Validation Results

### Backend tests

| Suite | Result |
|-------|--------|
| `test_dashboard_optimization_adapter.py` | ✅ 37 passed |
| `test_dashboard_optimization_integration.py` | ✅ 32 passed |
| `test_smart_optimization_adapter.py` + `test_smart_optimization_integration.py` (SC-8C11 regression) | ✅ 51 passed |
| Full backend suite (`pytest backend/tests -q`) | ✅ 951 passed, 14 skipped |

### Frontend validation

| Check | Result |
|-------|--------|
| Typecheck (`tsc -p apps/pc-optimizer/tsconfig.json --noEmit`) | ✅ Pass |
| Lint (`eslint packages/shared/src/rpc/index.ts --max-warnings=0`) | ✅ Pass |
| Build (`vite build`) | ✅ Pass (15.34s) |

### Pre-existing issues (not caused by Phase 2)

- `packages/shared/src/productRegistry/productRegistry.test.ts` has 4 pre-existing type errors related to `Edition` type (`'ultimate'` and `'trial'` not assignable). These are unrelated to the SC-8C13 Phase 2 change (which only added one RPC constant to `packages/shared/src/rpc/index.ts`). The frontend typecheck, which consumes the shared package, passes cleanly.

---

## 12. Security Grep Results

### Adapter (`dashboard_optimization_adapter.py`)

| Pattern | Matches | Classification |
|---------|---------|---------------|
| `subprocess` | 0 | SAFE |
| `child_process` | 0 | SAFE |
| `PowerShell` | 0 | SAFE |
| `reg.exe` | 0 | SAFE |
| `os.remove` | 0 | SAFE |
| `os.unlink` | 0 | SAFE |
| `shutil.rmtree` | 0 | SAFE |
| `executeOptimize` | 0 | SAFE |
| `dashboardService` | 0 | SAFE |
| `junkCleanerService` | 0 | SAFE |
| `privacyService` | 0 | SAFE |
| `registryService` | 0 | SAFE |
| `startupService` | 0 | SAFE |
| `performanceService` | 0 | SAFE |
| `RemediationCoordinator` | 0 | SAFE |
| `executor.execute` | 0 | SAFE |
| `.execute(` | 0 | SAFE |

### Plan builder (`dashboard_optimization_plan_builder.py`)

| Pattern | Matches | Classification |
|---------|---------|---------------|
| All destructive patterns | 0 | SAFE |

### RPC (`scan_core_rpc/__init__.py` — new handler only)

| Pattern | Matches | Classification |
|---------|---------|---------------|
| `dashboard_optimize_execute` | 0 | SAFE |
| `orchestrator_optimize` | 0 | SAFE |
| `dashboard.optimize.execute` | 0 | SAFE |
| `orchestrator.optimize` | 1 (docstring: "It does NOT call orchestrator.optimize") | SAFE — documentation of what the RPC does NOT do |

### Summary

**Zero production-reachable destructive paths introduced by Phase 2.**

---

## 13. Files Changed

### New files

| File | Purpose | Lines |
|------|---------|-------|
| `backend/src/avs_backend/scan_core/adapters/dashboard_optimization_adapter.py` | Dashboard Optimization adapter | 435 |
| `backend/src/avs_backend/scan_core/adapters/dashboard_optimization_plan_builder.py` | Dashboard Optimization plan builder | 182 |
| `backend/tests/test_dashboard_optimization_adapter.py` | Adapter tests | 537 |
| `backend/tests/test_dashboard_optimization_integration.py` | Integration/RPC tests | 632 |

### Modified files

| File | Change |
|------|--------|
| `backend/src/avs_backend/scan_core_rpc/__init__.py` | Added `DashboardOptimizationPlanBuilder` import + `scan_core.dashboard_optimization.plan` RPC handler |
| `packages/shared/src/rpc/index.ts` | Added `SCAN_CORE_DASHBOARD_OPTIMIZATION_PLAN: 'scan_core.dashboard_optimization.plan'` constant |

### Files NOT modified (explicitly preserved)

- `scan_core` internals (ActionType enum, SafetyGate, RemediationCoordinator, executors, BackupManager, ExecutionLedger, ExecutionRepository)
- Dashboard frontend (DashboardPageV2, DashboardViewModel, OneClickOptimize, PlanReviewView, ResultsView)
- Legacy `dashboard.optimize.execute` RPC (retained, disconnected)
- Legacy `orchestrator.optimize` RPC (retained, disconnected)

---

## 14. Remaining Limitations

1. **Dashboard frontend not migrated** — The frontend still calls `dashboard.optimize.execute` directly. This is Phase 3 (Dashboard Frontend Migration).

2. **Legacy `dashboard.optimize.execute` retained** — The legacy destructive RPC is not removed. It will be disconnected from the production UI in Phase 3.

3. **Flush DNS and Trim Memory not in canonical flow** — These operations are classified as `OUT_OF_SCOPE` and remain available only as standalone legacy utilities. They are NOT executable through `scan_core`.

4. **No frontend hook yet** — `useDashboardOptimizationPlan` hook is Phase 3. The RPC is ready but no frontend code calls it yet.

5. **Pre-existing shared package test type errors** — `packages/shared/src/productRegistry/productRegistry.test.ts` has 4 pre-existing type errors unrelated to Phase 2.

---

## 15. Explicit Phase 3 Boundary

### What was implemented in Phase 2

- ✅ `DashboardOptimizationAdapter` (backend, planning-only)
- ✅ `DashboardOptimizationPlanBuilder` (backend, planning-only)
- ✅ `scan_core.dashboard_optimization.plan` RPC (backend, planning-only)
- ✅ `SCAN_CORE_DASHBOARD_OPTIMIZATION_PLAN` shared RPC constant
- ✅ 69 new tests (37 adapter + 32 integration)
- ✅ All validation passes (951 backend tests, frontend typecheck/lint/build)

### What was NOT implemented (Phase 3+)

- ❌ Dashboard frontend migration — Phase 3
- ❌ `useDashboardOptimizationPlan` frontend hook — Phase 3
- ❌ `scan.service.ts` `dashboard_optimization_plan()` method — Phase 3
- ❌ `OneClickOptimize.tsx` migration to `PlanReviewView` → `ResultsView` — Phase 3
- ❌ `DashboardViewModel.ts` migration — Phase 3
- ❌ `PlanReviewView` changes — Phase 3
- ❌ `ResultsView` changes — Phase 3
- ❌ Dashboard Optimize button changes — Phase 3
- ❌ Approval UI — Phase 3
- ❌ Rollback UI — Phase 3
- ❌ Legacy `dashboard.optimize.execute` deletion — NOT DELETED (retained, disconnected in Phase 3)
- ❌ `scan_core` internals modification — OUT OF SCOPE
- ❌ `SafetyGate` modification — OUT OF SCOPE
- ❌ `RemediationCoordinator` modification — OUT OF SCOPE
- ❌ Executor modification — OUT OF SCOPE
- ❌ New `ActionType` values — OUT OF SCOPE
- ❌ New executors — OUT OF SCOPE
- ❌ Phase 4 — NOT STARTED
- ❌ Phase 5 — NOT STARTED
- ❌ SC-8C14 — NOT STARTED

### Phase 3 was NOT started.

---

**End of SC-8C13 Phase 2 Dashboard Optimization Canonical Planning Report**
