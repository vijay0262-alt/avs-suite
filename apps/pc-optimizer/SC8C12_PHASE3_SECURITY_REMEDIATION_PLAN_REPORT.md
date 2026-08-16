# SC-8C12 Phase 3 — Security Remediation Plan Builder + RPC Report

**Date:** 2026-08-16  
**Phase:** Phase 3 — SecurityRemediationPlanBuilder + scan_core.security_remediation.plan RPC  
**Specification:** `SC8C12_SPECIFICATION.md`  
**Phase Plan:** `SC8C12_PHASE_PLAN.md`  
**Phase 2 Report:** `SC8C12_PHASE2_SECURITY_REMEDIATION_ADAPTER_REPORT.md`

---

## 1. Files Inspected

### SC-8C11 Reference Pattern
- `backend/src/avs_backend/scan_core/adapters/smart_optimization_plan_builder.py` — SmartOptimizationPlanBuilder, `_build_action_summary()`
- `backend/src/avs_backend/scan_core_rpc/__init__.py` — `scan_core.smart_optimization.plan` RPC, `scan_core.scan.plan_details` RPC, `get_coordinator()`, `_safe_params()`, `_require_str()`, `_coordinator_error()`
- `backend/tests/test_smart_optimization_integration.py` — SC-8C11 integration test pattern

### Canonical scan_core
- `backend/src/avs_backend/scan_core/rules/action.py` — ActionPlan, ActionSummary, RemediationAction, `to_dict()`/`from_dict()`
- `backend/src/avs_backend/scan_core/metadata/action_plan_repository.py` — ActionPlanRepository (`save`, `load`, `list_actions`, `update_status`, `list_plans`)
- `backend/src/avs_backend/scan_core/metadata/database.py` — MetadataDatabase, DatabaseConfig
- `backend/src/avs_backend/scan_core/rules/actionability.py` — CapabilityContract
- `backend/src/avs_backend/scan_core/rules/priority.py` — RuleCapability, Fixability

### Phase 2 Adapter
- `backend/src/avs_backend/scan_core/adapters/security_remediation_adapter.py` — SecurityRemediationAdapter, `convert_action()`, `convert_actions()`, `get_statistics()`, `reset_statistics()`

---

## 2. Builder Architecture

### File Created
`backend/src/avs_backend/scan_core/adapters/security_remediation_plan_builder.py`

### Design
The `SecurityRemediationPlanBuilder` follows the exact SC-8C11 `SmartOptimizationPlanBuilder` pattern:

```
Security Center remediation actions
    ↓
SecurityRemediationAdapter (Phase 2 — only mapping layer)
    ↓
SecurityRemediationPlanBuilder (Phase 3)
    ↓
canonical ActionPlan (with backend-generated plan_id)
    ↓
ActionPlanRepository.save() (called by RPC layer)
```

### Key Properties
- The adapter remains the ONLY place responsible for Security action → canonical action conversion
- The builder does NOT duplicate action-mapping logic
- The builder generates a backend-owned `plan_id` via `uuid.uuid4()`
- The builder computes `ActionSummary` statistics from the canonical converted actions
- The builder does NOT persist the plan (persistence is handled by the RPC layer)
- The builder does NOT execute remediation
- The builder resets adapter statistics before each `build_plan()` call for clean conversion tracking

### `_build_action_summary()` Function
Computes `ActionSummary` from a tuple of `RemediationAction` objects:
- Counts actions by type (`actions_by_type`)
- Classifies fixability: `auto_fixable`, `review_required`, `blocked`, `not_fixable`, `unknown_fixability`
- Tracks highest priority action
- Tracks largest affected size
- Computes `estimated_affected_size` (None for security actions since they don't estimate storage recovery)

### Snapshot Metadata
- `snapshot_version`: `"security_remediation_1.0.0"`
- `snapshot_ttl_seconds`: `3600` (1 hour)
- Plans older than TTL are considered stale and must be regenerated

---

## 3. Adapter Integration

The builder delegates all action conversion to `SecurityRemediationAdapter`:

```python
class SecurityRemediationPlanBuilder:
    def __init__(self, adapter=None, capability_contract=None):
        self.adapter = adapter or SecurityRemediationAdapter(
            capability_contract=capability_contract
        )

    def build_plan(self, security_actions, snapshot_timestamp=None):
        self.adapter.reset_statistics()
        actions = self.adapter.convert_actions(security_actions, snapshot_timestamp)
        action_tuple = tuple(actions)
        summary = _build_action_summary(action_tuple)
        plan_id = str(uuid.uuid4())
        return ActionPlan(
            actions=action_tuple,
            summary=summary,
            generated_at=datetime.now(UTC),
            snapshot_timestamp=snapshot_timestamp,
            snapshot_version="security_remediation_1.0.0",
            snapshot_ttl_seconds=3600,
            plan_id=plan_id,
        )
```

The builder does NOT:
- Map action types (adapter's job)
- Construct targets (adapter's job)
- Generate preconditions (adapter's job)
- Derive asset IDs (adapter's job)
- Compute priority scores (adapter's job)
- Classify unsupported actions (adapter's job)

---

## 4. ActionPlan Structure

The generated `ActionPlan` contains:

| Field | Value |
|-------|-------|
| `actions` | Tuple of canonical `RemediationAction` objects |
| `summary` | `ActionSummary` with statistics derived from actions |
| `generated_at` | UTC datetime |
| `snapshot_timestamp` | Optional, provided by caller or None |
| `snapshot_version` | `"security_remediation_1.0.0"` |
| `snapshot_ttl_seconds` | `3600` |
| `plan_id` | Backend-generated UUID |

### ActionPlan Compatibility
The generated plan is fully compatible with the existing `scan_core.remediation.prepare` → `validate` → `execute` → `rollback` flow because it uses the same `ActionPlan` dataclass, the same `RemediationAction` objects, the same `ActionSummary` structure, and the same `ActionPlanRepository` persistence.

---

## 5. Quarantine Mapping

The Phase 2 decision remains authoritative:

| Security Action | Canonical ActionType | Backup Required | Rollback Supported |
|----------------|---------------------|-----------------|-------------------|
| `quarantine` | `DELETE_FILE` | `True` | `True` |

The builder preserves the canonical backup/rollback metadata required by `RemediationCoordinator`:
- `backup_required=True` on both `RemediationAction` and `FilesystemActionTarget`
- `rollback_supported=True` on both `RemediationAction` and `FilesystemActionTarget`
- `backup_location=None` (backend assigns during execution)
- `backup_identity=None` (backend assigns during execution)

No new `ActionType` was created. No `QUARANTINE` action type exists. No `QuarantineExecutor` exists. No `QuarantineTargetType` exists. No custom quarantine execution path exists.

---

## 6. Statistics

### ActionSummary (from canonical actions)
- `total_findings`: Total number of actions
- `actions_planned`: Same as total_findings
- `auto_fixable_actions`: Actions with `is_auto_fixable=True` and `is_fixable=True`
- `review_required_actions`: Actions with `requires_review=True` and `is_fixable=True`
- `blocked_actions`: Actions with `is_blocked=True`
- `not_fixable_actions`: Actions with `is_fixable=False`
- `unknown_fixability_actions`: Actions that don't fit any above category
- `actions_by_type`: Dict mapping action type value to count
- `estimated_affected_size`: None for security actions (no storage recovery estimate)
- `highest_priority_action_id`: Action with highest `priority_score`
- `highest_severity_action_id`: Same as highest priority
- `largest_affected_action_id`: Action with largest `estimated_size`

### Adapter Statistics (from conversion process)
- `converted`: Number of successfully converted supported actions
- `unsupported`: Number of unsupported remediation actions
- `non_remediation`: Number of non-remediation actions (review, ignore, etc.)
- `errors`: Number of conversion errors

### No Fabricated Statistics
- No statistics are fabricated
- No second classification system is used
- All statistics are derived from the canonical converted actions
- Actionability is determined by canonical `ActionState` / `Fixability` / `RuleCapability` semantics

---

## 7. Persistence Behavior

### Repository
The builder uses the existing `ActionPlanRepository` (no new database created):

```python
plan_repo = ActionPlanRepository(coordinator.database)
plan_repo.save(plan)
```

### Save Semantics
- `ActionPlanRepository.save()` uses `INSERT ... ON CONFLICT DO UPDATE` (upsert)
- Saving the same plan twice updates it (does not fail)
- The plan is persisted as JSON in the `action_plans` table
- Individual actions are persisted in the `remediation_actions` table

### Load Semantics
- `ActionPlanRepository.load(plan_id)` returns the full `ActionPlan` with all actions
- A new repository instance pointing to the same database can load the plan
- `plan_id` remains stable across save/load cycles

### Schema Version
- `_SCHEMA_VERSION = 2` (existing, unchanged)
- The builder does not modify the database schema

---

## 8. RPC Contract

### RPC Name
`scan_core.security_remediation.plan`

### Request
```json
{
    "actions": [
        {
            "id": "action-1",
            "type": "quarantine",
            "title": "Quarantine Threat",
            "description": "...",
            "confidence": 0.95,
            "severity": "high",
            "category": "spyware",
            "sourceModule": "security-center",
            "sourceFindingId": "finding-1",
            "rollbackAvailable": true,
            "target": {"type": "file", "path": "...", "name": "..."}
        }
    ]
}
```

### Response (success)
```json
{
    "ok": true,
    "plan_id": "uuid-string",
    "total_actions": 5,
    "auto_fixable": 3,
    "review_required": 0,
    "not_fixable": 2,
    "estimated_affected_size": null,
    "statistics": {
        "converted": 3,
        "unsupported": 1,
        "errors": 0
    }
}
```

### Response (failure)
```json
{"ok": false, "error": "error message"}
```

### Validation
- Missing `actions` parameter → `{"ok": false, "error": "Missing or invalid parameter: actions"}`
- Empty `actions` list → `{"ok": false, "error": "No Security Center actions provided"}`
- Non-list `actions` → `{"ok": false, "error": "Missing or invalid parameter: actions"}`
- Null params → `{"ok": false, "error": "Missing or invalid parameter: actions"}`
- Adapter conversion errors → Invalid actions skipped, valid actions converted, errors counted
- Persistence failure → `{"ok": false, "error": "..."}` (no fake plan_id)

### Request Rejection
The RPC does NOT accept:
- Raw evidence (not required by adapter)
- Canonical paths (adapter derives from target.path)
- Arbitrary backup locations (backend assigns during execution)
- Arbitrary quarantine locations (no quarantine-specific location)
- Executable commands
- PowerShell
- Registry commands
- Shell commands

---

## 9. Privacy Boundary

### Response NEVER Exposes
- `canonical_path`
- `asset_id`
- `backup_location`
- `quarantine_path`
- Registry keys (`hive`, `key_path`, `value_name`)
- Browser profile paths
- Raw evidence
- Internal target payloads
- Action details (only summary counts are returned)

### Response Only Contains
- `ok`: boolean
- `plan_id`: backend-generated UUID
- `total_actions`: integer
- `auto_fixable`: integer
- `review_required`: integer
- `not_fixable`: integer
- `estimated_affected_size`: integer or null
- `statistics`: `{converted, unsupported, errors}`

### Recursive Privacy Check
The integration test `test_no_sensitive_target_data_in_rpc_response` recursively checks all values in the RPC response for sensitive fields and raw paths (C:\, HKEY, HKCU).

---

## 10. Security Audit

### Grep Audit Results

**File:** `security_remediation_plan_builder.py`

| Pattern | Matches | Location |
|---------|---------|----------|
| `subprocess` | 0 | — |
| `child_process` | 0 | — |
| `PowerShell` | 0 | — |
| `reg.exe` | 0 | — |
| `os.remove` | 0 | — |
| `os.unlink` | 0 | — |
| `shutil.rmtree` | 0 | — |
| `shutil.move` | 0 | — |
| `shutil.copy` | 0 | — |
| `process.kill` | 0 | — |
| `process.terminate` | 0 | — |
| `security.remediation.execute` | 0 | — |
| `security.quarantine` | 0 | — |
| `ThreatRemediationEngine` | 1 | Docstring (states "Does NOT call") |
| `ThreatRollbackManager` | 0 | — |
| `ThreatQuarantineManager` | 0 | — |
| `FilesystemExecutor` | 1 | Docstring (states "Does NOT call") |
| `RegistryExecutor` | 1 | Docstring (states "Does NOT call") |
| `StartupExecutor` | 1 | Docstring (states "Does NOT call") |
| `BrowserExecutor` | 1 | Docstring (states "Does NOT call") |
| `DefaultExecutor` | 0 | — |
| `RemediationCoordinator` | 1 | Docstring (states "Does NOT call") |
| `SafetyGate` | 1 | Docstring (states "Does NOT call") |
| `import subprocess` | 0 | — |
| `import shutil` | 0 | — |
| `import os` | 0 | — |

**Conclusion:** All matches are in docstrings explicitly stating what the builder does NOT call. Zero actual execution code.

**File:** `scan_core_rpc/__init__.py` (new RPC handler section)

The RPC handler only calls:
- `SecurityRemediationPlanBuilder()` — constructor
- `builder.build_plan(actions)` — plan construction
- `ActionPlanRepository(coordinator.database)` — repository constructor
- `plan_repo.save(plan)` — persistence
- `builder.get_adapter_statistics()` — statistics retrieval

No execution calls. No legacy calls. No subprocess. No mutation.

---

## 11. Tests

### File Created
`backend/tests/test_security_remediation_integration.py`

### Total Tests: 66

### Test Categories

| Category | Tests | Count |
|----------|-------|-------|
| Plan creation (1-14) | builder initializes, valid actions create ActionPlan, backend generates plan_id, plan contains canonical RemediationActions, quarantine becomes DELETE_FILE, quarantine has backup_required, quarantine has rollback_supported, delete action mapping, startup persistence mapping, registry persistence mapping, unsupported actions become NOT_FIXABLE, mixed supported/unsupported, accurate statistics, estimated affected size | 14+ |
| Persistence (15-19) | ActionPlan saved successfully, saved plan loaded by new repository, plan_id stable, persistence failure returns error, no success on save failure | 5 |
| RPC (20-28) | RPC registered, valid request returns plan_id, missing actions rejected, empty actions rejected, malformed actions rejected, null params rejected, adapter errors handled, response privacy-safe, no raw target info, no fake plan_id on failure | 10+ |
| Security (29-38) | no legacy execution, no quarantine execution, no executor invocation, no filesystem mutation, no registry mutation, no subprocess, no SafetyGate bypass, no RemediationCoordinator.execute, no automatic approval, no automatic execution, RPC does not execute | 11+ |
| Contract (39-43) | plan compatible with prepare(), plan loadable through plan_details, unsupported actions remain classified, rollback metadata preserved for quarantine, no sensitive target data in RPC response | 5 |
| Additional | snapshot version, snapshot TTL, generated_at UTC, actions tuple, RPC statistics match adapter, RPC persists plan, single quarantine, all unsupported, no destructive imports, no legacy imports, action IDs preserved, snapshot timestamp, all required fields | 13+ |

---

## 12. Validation Results

### Phase 3 Integration Tests
```
66 passed in 58.79s
```

### Phase 2 Adapter Tests + SC-8C11 Adapter/Integration Tests
```
127 passed in 68.40s
```

### Full Backend Test Suite
```
882 passed, 14 skipped in 783.33s (0:13:03)
```

### Security Grep Audit
- `subprocess` in builder source: **0** (only in docstring)
- `shutil` in builder source: **0**
- `os.remove` in builder source: **0**
- `import subprocess` in builder source: **0**
- `import shutil` in builder source: **0**
- `ThreatRemediationEngine` in builder source: **1** (docstring only)
- `FilesystemExecutor` in builder source: **1** (docstring only)
- `RemediationCoordinator` in builder source: **1** (docstring only)
- `SafetyGate` in builder source: **1** (docstring only)
- Legacy security imports in RPC module: **0**

**Conclusion:** The builder and RPC contain ZERO destructive execution code.

---

## 13. Architectural Gaps Discovered

### Gap 1: None
No architectural gaps were discovered during Phase 3. The existing `ActionPlanRepository`, `ActionPlan`, `ActionSummary`, and `RemediationAction` structures are fully compatible with Security Center remediation actions.

### Gap 2: Quarantine list query
**Status:** Documented in Phase 2 report, not blocking Phase 3.

The canonical quarantine list query (listing quarantined items from `ExecutionRepository`) is a Phase 4/5 concern. The plan builder does not need this query.

---

## 14. Unresolved Product Decisions

### Decision 1: Quarantine list query method
**Status:** PRODUCT DECISION REQUIRED (from Phase 2 report)

Should the quarantine list query be:
- (a) A new RPC `scan_core.security_remediation.quarantine_list`?
- (b) A filter on existing RPCs?
- (c) Keep legacy `security.quarantine.list` as transitional?

**Impact:** Phase 4/5. Not blocking Phase 3.

### Decision 2: Frontend integration
**Status:** PRODUCT DECISION REQUIRED (Phase 4)

How should the frontend call `scan_core.security_remediation.plan`?
- (a) New `SecurityRemediationService.ts` that calls the RPC?
- (b) Modify `SecurityCenterService.ts` to call the RPC?
- (c) Modify `SecurityCenterViewModel.ts` to use the new plan?

**Impact:** Phase 4. Not blocking Phase 3.

---

## 15. Files Modified

### New Files Created
1. `backend/src/avs_backend/scan_core/adapters/security_remediation_plan_builder.py` — SecurityRemediationPlanBuilder (234 lines)
2. `backend/tests/test_security_remediation_integration.py` — Integration tests (1173 lines, 66 tests)
3. `apps/pc-optimizer/SC8C12_PHASE3_SECURITY_REMEDIATION_PLAN_REPORT.md` — This report

### Existing Files Modified
1. `backend/src/avs_backend/scan_core_rpc/__init__.py` — Added import of `SecurityRemediationPlanBuilder` and registered `scan_core.security_remediation.plan` RPC handler

### Files NOT Modified
- `backend/src/avs_backend/scan_core/adapters/security_remediation_adapter.py` — NOT modified (Phase 2 adapter unchanged)
- `backend/src/avs_backend/scan_core/rules/action.py` — NOT modified
- `backend/src/avs_backend/scan_core/rules/actionability.py` — NOT modified
- `backend/src/avs_backend/scan_core/rules/action_preconditions.py` — NOT modified
- `backend/src/avs_backend/scan_core/rules/safety_gate.py` — NOT modified
- `backend/src/avs_backend/scan_core/orchestration/remediation.py` — NOT modified
- `backend/src/avs_backend/scan_core/execution/` — NOT modified
- `backend/src/avs_backend/scan_core/metadata/action_plan_repository.py` — NOT modified
- `backend/src/avs_backend/security_remediation/__init__.py` — NOT modified (legacy preserved)
- No frontend files modified
- No existing tests modified

---

## 16. Confirmation That No Execution Path Was Introduced

**CONFIRMED.** The `SecurityRemediationPlanBuilder` and `scan_core.security_remediation.plan` RPC are planning and persistence layers only.

The builder:
- Converts Security Center actions to canonical `RemediationAction` objects (via adapter)
- Computes `ActionSummary` statistics
- Generates a backend-owned `plan_id`
- Creates a canonical `ActionPlan`
- Does NOT execute remediation
- Does NOT call target executors
- Does NOT call `RemediationCoordinator`
- Does NOT call `SafetyGate`
- Does NOT call legacy Security Center execution paths
- Does NOT perform filesystem/registry/process mutation
- Does NOT call subprocess or PowerShell

The RPC:
- Validates the request
- Calls `builder.build_plan()`
- Calls `plan_repo.save()`
- Returns sanitized plan metadata
- Does NOT execute remediation
- Does NOT call any execution RPCs

---

## 17. Confirmation That Frontend Was NOT Modified

**CONFIRMED.** No frontend files were modified in Phase 3:
- `SecurityCenterPage.tsx` — NOT modified
- `SecurityCenterViewModel.ts` — NOT modified
- `SecurityCenterService.ts` — NOT modified
- `securityBackendService.ts` — NOT modified
- `ThreatRemediationEngine.ts` — NOT modified
- `ThreatRemediationPlanner.ts` — NOT modified
- `ThreatSafetyValidator.ts` — NOT modified
- No other frontend files modified

---

## 18. Confirmation That Phase 4 Was NOT Started

**CONFIRMED.** Phase 4 was NOT started. The following were NOT created:
- Frontend `SecurityRemediationService.ts` — NOT created
- Frontend `useSecurityRemediationPlan` hook — NOT created
- `SecurityCenterPage` modifications — NOT made
- `SecurityCenterViewModel` modifications — NOT made
- `SecurityCenterService` modifications — NOT made
- Legacy disconnection — NOT performed

---

## 19. Confirmation That SC-8C13 Was NOT Started

**CONFIRMED.** SC-8C13 was NOT started. No work beyond SC-8C12 Phase 3 was performed.

---

## 20. Legacy System Safety

Phase 3 did NOT disconnect or remove any legacy Security Center code:
- `ThreatRemediationEngine` — NOT removed
- `ThreatRemediationPlanner` — NOT removed
- `ThreatApprovalManager` — NOT removed
- `ThreatRollbackManager` — NOT removed
- `ThreatQuarantineManager` — NOT removed
- `ThreatRestoreManager` — NOT removed
- `ThreatDeletionManager` — NOT removed
- `ThreatSafetyValidator` — NOT removed
- `security.remediation.*` RPCs — NOT removed
- `security.quarantine.*` RPCs — NOT removed
- `SecurityCenterPage` — NOT modified
- `SecurityCenterViewModel` — NOT modified

Phase 5 will handle legacy production-path disconnection.

The new Phase 3 code does NOT call any legacy execution system.

---

## Summary

SC-8C12 Phase 3 is complete. The `SecurityRemediationPlanBuilder` and `scan_core.security_remediation.plan` RPC are safe, tested, planning-only layers that:

1. **Connect the Phase 2 adapter to canonical ActionPlan persistence** — builder uses adapter, RPC uses builder
2. **Generate backend-owned plan_ids** — frontend never constructs ActionPlans or generates plan_ids
3. **Persist plans through ActionPlanRepository** — no new database, no new repository
4. **Return sanitized plan metadata** — no raw paths, registry keys, asset IDs, or target data
5. **Preserve quarantine mapping** — DELETE_FILE + backup_required + rollback_supported
6. **Compute accurate statistics** — derived from canonical actions, no fabrication
7. **Contain zero destructive execution** — verified by tests and grep audit
8. **Pass 66 integration tests** + 127 Phase 2/SC-8C11 tests + full backend suite
9. **Modify only the RPC registration file** — no core scan_core modifications
10. **Do not start Phase 4, Phase 5, or SC-8C13**

**End of SC-8C12 Phase 3 Report**
