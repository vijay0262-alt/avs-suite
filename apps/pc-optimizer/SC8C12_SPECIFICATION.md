# SC-8C12 Specification — Security Center Remediation Integration

## 1. Executive Summary

**Objective:** Integrate Security Center remediation into the canonical `scan_core.remediation.*` workflow while preserving Security Center's existing threat detection, investigation, correlation, threat intelligence, quarantine management, and false-positive capabilities.

This specification eliminates the Security Center's parallel remediation execution path (`ThreatRemediationEngine` → `security.remediation.execute` / `security.quarantine`) and makes `scan_core` authoritative for remediation safety, approval, execution, persistence, idempotency, and rollback.

**Quarantine Architecture Decision:** Classification **B** — quarantine can be safely represented using the existing canonical `delete_file` action type with `backup_required=True` and `rollback_supported=True`. The `BackupManager`'s backup serves as the quarantined copy; canonical rollback serves as restore. No new `ActionType`, executor, or core architecture change is required. See §10 for full analysis.

**Status:** AUTHORITATIVE SPECIFICATION — ready for implementation.

---

## 2. Problem Statement

The Security Center has a complete parallel remediation system that bypasses all canonical safety controls:

```
SecurityCenterPage
  → SecurityCenterViewModel
    → SecurityCenterService
      → ThreatRemediationEngine (frontend, in-memory)
        → createPlan / approvePlan / rejectPlan / executePlan / rollbackAction
      → securityBackendService (backend RPC)
        → security.quarantine (shutil.move)
        → security.quarantine.restore (shutil.move)
        → security.quarantine.delete (os.remove)
        → security.remediation.execute (calls quarantine_file)
        → security.remediation.rollback (calls restore_quarantined)
```

This parallel path:
- ❌ Bypasses `SafetyGate` validation
- ❌ Bypasses `RemediationCoordinator` approval workflow
- ❌ Bypasses `ExecutionLedger` duplicate prevention
- ❌ Bypasses `ActionPlanRepository` persistence
- ❌ Bypasses `ExecutionRepository` audit trail
- ❌ Uses ad-hoc JSON manifest instead of canonical persistence
- ❌ Uses `shutil.move` / `os.remove` directly without TOCTOU protection
- ❌ Has no stale-plan rejection
- ❌ Has no restart/recovery safety
- ❌ Has frontend in-memory plan state that does not survive restart

**Evidence:**
- `SecurityCenterPage.tsx` lines 1567, 1574, 1601, 1612, 1625, 1629 — calls `vm.executePlan()`, `vm.rollbackAction()`, `vm.approvePlan()`, `vm.rejectPlan()`
- `SecurityCenterService.ts` lines 472–496 — delegates to `ThreatRemediationEngine`
- `security_remediation/__init__.py` lines 29–30 — uses `shutil` and `subprocess` directly
- `security_remediation/__init__.py` lines 48, 60–73 — ad-hoc JSON manifest
- SC-8C11_SPECIFICATION.md line 95 — explicitly deferred to future phase

---

## 3. Objective

Migrate Security Center remediation execution to the canonical `scan_core.remediation.*` workflow:

```
SecurityCenterPage
  → SecurityCenterEngine (threat detection — preserved)
  → SecurityInvestigation (threat correlation — preserved)
  → SecurityRemediationAdapter (NEW — converts threats to canonical RemediationActions)
  → scan_core.security_remediation.plan RPC (NEW — backend planning)
  → SecurityRemediationPlanBuilder (NEW — builds canonical ActionPlan)
  → ActionPlanRepository (existing — persistence)
  → backend-generated plan_id
  → PlanReviewView (existing — read-only hydration)
  → ResultsView (existing — canonical remediation UI)
  → RemediationCoordinator (existing — prepare → validate → approve → execute → rollback)
```

**Success Criteria:**
1. Security Center remediation flows through `RemediationCoordinator`
2. Security Center actions are validated by `SafetyGate`
3. Security Center execution is persisted to `ExecutionRepository`
4. Security Center rollback uses canonical `scan_core.remediation.rollback`
5. Security Center threat detection and investigation engine remains unchanged
6. Security Center UI preserves existing dashboard, threat timeline, and investigation panels
7. All three modules (Protection, Security, Smart Optimization) use identical safety model
8. No automatic execution, resume, or rollback introduced
9. No browser storage for remediation state
10. No direct destructive frontend APIs

---

## 4. Scope

### In Scope

- `SecurityRemediationAdapter` — converts Security Center threat remediation actions to canonical `RemediationAction` objects
- `SecurityRemediationPlanBuilder` — builds persisted canonical `ActionPlan` objects
- `scan_core.security_remediation.plan` RPC — backend planning (no execution)
- `SecurityCenterPage` remediation tab — use `PlanReviewView` → `ResultsView`
- `SecurityCenterViewModel` remediation methods — delegate to canonical flow
- Legacy `ThreatRemediationEngine` disconnection from production UI
- Legacy `security.remediation.*` and `security.quarantine.*` backend RPC disconnection from production

### Out of Scope

- See §5 (Explicit Non-Goals)

---

## 5. Explicit Non-Goals

- ❌ Modifying `SafetyGate` rules (reuse existing rules)
- ❌ Modifying `RemediationCoordinator` internals
- ❌ Modifying `DefaultExecutor` or target executors
- ❌ Creating new executors (reuse existing `FilesystemExecutor`, `StartupExecutor`, etc.)
- ❌ Modifying `ScanOrchestrator` scanning logic
- ❌ Creating new `ActionType` in `rules/action.py` (quarantine maps to `DELETE_FILE`)
- ❌ Removing `ThreatRemediationEngine` (retain for test compatibility, disconnect from production)
- ❌ Migrating threat detection providers
- ❌ Migrating threat investigation/correlation/knowledge base
- ❌ Migrating false positive tracking (stays in security domain per D4)
- ❌ Migrating Dashboard One-Click Optimize (separate future phase)
- ❌ Migrating Background Cleanup Service (out of scope per D6)
- ❌ Migrating module-level cleaners (separate future initiative)
- ❌ Removing legacy health scan modals (separate cleanup)
- ❌ SC-8C13 or any later phase

---

## 6. Current Security Center Architecture

### Frontend

```
SecurityCenterPage (tabs: overview, scan, threats, investigation, remediation, reports, settings)
  ├─ OverviewTab — protection status, health
  ├─ ScanTab — ScanView (module=security, mode=full) ← ALREADY CANONICAL
  ├─ ThreatsTab — threat list, filtering
  ├─ InvestigationTab — threat investigation, correlation
  ├─ RemediationTab — ⚠️ PARALLEL PATH
  │    ├─ QuarantineSummary display
  │    ├─ PlanCard list (RemediationPlan[])
  │    │    ├─ Approve / Reject buttons → vm.approvePlan / vm.rejectPlan
  │    │    ├─ Execute button → vm.executePlan
  │    │    └─ Undo button → vm.rollbackAction
  │    └─ Empty state
  ├─ ReportsTab — remediation reports
  └─ SettingsTab — remediation configuration
```

### Frontend Remediation Flow (CURRENT — PARALLEL)

```
SecurityCenterPage.RemediationTab
  → SecurityCenterViewModel.createRemediationPlan(investigationId)
    → SecurityCenterService.createRemediationPlan(investigation, threats)
      → ThreatRemediationEngine.createPlan(investigation, threats, tier)
        → ThreatRemediationPlanner.createPlan()
          → ThreatSafetyValidator.validate()
          → ThreatRemediationPolicyManager.requiresApproval()
          → Returns RemediationPlan (in-memory, NOT persisted)

  → SecurityCenterViewModel.approvePlan(planId)
    → SecurityCenterService.approvePlan(planId)
      → ThreatRemediationEngine.approvePlan(planId)
        → ThreatApprovalManager.approve(planId)

  → SecurityCenterViewModel.executePlan(planId)
    → SecurityCenterService.executePlan(planId)
      → ThreatRemediationEngine.executePlan(planId)
        → ThreatQuarantineManager.quarantine() (frontend in-memory)
        → ThreatRollbackManager.record() (frontend in-memory)

  → SecurityCenterViewModel.rollbackAction(actionId)
    → SecurityCenterService.rollbackAction(actionId)
      → ThreatRemediationEngine.rollbackAction(actionId)
        → ThreatRollbackManager.rollback(actionId)
        → ThreatRestoreManager.restore()
```

### Backend Remediation Flow (CURRENT — PARALLEL)

```
securityBackendService
  ├─ security.quarantine          → shutil.move(file, quarantine_dir)
  ├─ security.quarantine.restore  → shutil.move(quarantine_dir, original)
  ├─ security.quarantine.delete   → os.remove(quarantine_file)
  ├─ security.quarantine.list     → read manifest.json
  ├─ security.remediation.plan    → generate plan dict (planId, actions[])
  ├─ security.remediation.execute → call quarantine_file() for each action
  └─ security.remediation.rollback → call restore_quarantined() for each ID
```

### Quarantine Implementation (CURRENT)

| Property | Value |
|----------|-------|
| Operation | `shutil.move()` (atomic move where possible) |
| Quarantine directory | `%LOCALAPPDATA%\AVS Shield\Quarantine` (Windows) / `~/.avs-shield/quarantine` (Linux) |
| Manifest | `manifest.json` in quarantine directory |
| Manifest fields | `quarantineId`, `originalPath`, `quarantinePath`, `threatId`, `reason`, `quarantinedAt`, `fileSize`, `restored` |
| Restore | `shutil.move(quarantinePath, originalPath)` |
| Delete | `os.remove(quarantinePath)` |
| Persistence | JSON file (NOT in `MetadataDatabase`) |
| Restart safety | Manifest survives restart; frontend in-memory plans do NOT |
| Encryption | Configured but not implemented in backend |

### Security Center Remediation Action Types

```typescript
type RemediationActionType =
  | 'review'                    // → ActionState.REVIEW_REQUIRED (not an action)
  | 'ignore'                    // → not an action (state)
  | 'mark_false_positive'       // → security domain state (per D4, stays in security)
  | 'quarantine'                // → DELETE_FILE with backup (see §10)
  | 'restore'                   // → rollback (canonical scan_core.remediation.rollback)
  | 'delete'                    // → DELETE_FILE without backup (permanent deletion)
  | 'disable_startup_entry'     // → DISABLE_STARTUP_ENTRY (canonical)
  | 'disable_scheduled_task'    // → NOT_SUPPORTED (no canonical executor)
  | 'disable_browser_extension' // → NOT_SUPPORTED (no canonical executor)
  | 'reset_browser_setting'     // → NOT_SUPPORTED (no canonical executor)
  | 'remove_persistence'        // → REMOVE_REGISTRY_VALUE (if registry-based)
  | 'export_investigation'      // → not a remediation action
```

---

## 7. Current scan_core Architecture

### Canonical Remediation Workflow

```
ActionPlan (backend-generated, persisted)
  → ActionPlanRepository.save()
  → scan_core.remediation.prepare → RemediationPreview (approval_token)
  → scan_core.remediation.validate → RemediationValidation (dry-run)
  → explicit user approval
  → scan_core.remediation.execute → ExecutionSummary
  → scan_core.remediation.status → RemediationExecutionStatus
  → scan_core.remediation.rollback → RollbackSummary
```

### ActionType (rules/action.py — the execution enum)

```python
class ActionType(str, Enum):
    NONE = "none"
    DELETE_FILE = "delete_file"
    DELETE_DIRECTORY = "delete_directory"
    CLEAR_CACHE = "clear_cache"
    REMOVE_REGISTRY_VALUE = "remove_registry_value"
    REMOVE_REGISTRY_KEY = "remove_registry_key"
    DISABLE_STARTUP_ENTRY = "disable_startup_entry"
    CLEAR_BROWSER_CACHE = "clear_browser_cache"
```

**Note:** `rules/enums.py` has a separate `ActionType` with `QUARANTINE = "quarantine"`, but that is the "description only" enum used by the Rule Engine for recommendations. The execution enum in `rules/action.py` does NOT have `QUARANTINE`. This specification maps quarantine to `DELETE_FILE` with backup (see §10).

### ActionTargetType

```python
class ActionTargetType(str, Enum):
    FILESYSTEM = "filesystem"
    REGISTRY = "registry"
    BROWSER = "browser"
    STARTUP = "startup"
```

### ActionTarget Union

- `FilesystemActionTarget` — `asset_id`, `canonical_path`, `allowed_location`, `scope`, `backup_required`, `rollback_supported`
- `RegistryActionTarget` — `asset_id`, `hive`, `key_path`, `value_name`, `backup_required`, `rollback_supported`
- `BrowserActionTarget` — `asset_id`, `browser`, `profile`, `cache_type`, `path`
- `StartupActionTarget` — `asset_id`, `entry_id`, `scope`, `backup_required`, `rollback_supported`
- `_NoTarget` — placeholder

### Target Executors

| Executor | Supported Action Types |
|----------|----------------------|
| `FilesystemExecutor` | `delete_file`, `delete_directory`, `clear_cache` |
| `RegistryExecutor` | `remove_registry_value`, `remove_registry_key` |
| `BrowserExecutor` | `clear_browser_cache` |
| `StartupExecutor` | `disable_startup_entry`, `remove_startup_entry` |

### BackupManager

- `create_backup(path, action, execution_id, context)` → `BackupRecord`
- `restore(record)` → restores file from backup to original location
- Backup is a COPY (not move); original is deleted by executor after backup

### RemediationCoordinator

- `prepare(plan_id)` → `RemediationPreview` (approval_token, affected_targets, safety_state_counts)
- `validate(plan_id)` → `RemediationValidation` (dry-run execution)
- `execute(plan_id, request_id, approval_token, mode)` → `ExecutionSummary`
- `status(execution_id)` → `RemediationExecutionStatus`
- `cancel(execution_id)` → cancellation
- `rollback(execution_id)` → `RollbackSummary`

### RPC Methods (scan_core_rpc/__init__.py)

| Method | Purpose |
|--------|---------|
| `scan_core.scan.quick` | Quick scan |
| `scan_core.scan.full` | Full scan |
| `scan_core.scan.plan_details` | Hydrate persisted ActionPlan |
| `scan_core.smart_optimization.plan` | SC-8C11 — create ActionPlan from Smart Optimization |
| `scan_core.remediation.prepare` | Generate preview + approval token |
| `scan_core.remediation.validate` | Validate plan (dry-run) |
| `scan_core.remediation.execute` | Execute (requires approval token) |
| `scan_core.remediation.status` | Poll execution status |
| `scan_core.remediation.cancel` | Cancel execution |
| `scan_core.remediation.rollback` | Rollback executed actions |

---

## 8. Gap Analysis

| Gap | Description | Impact |
|-----|-------------|--------|
| Parallel remediation engine | `ThreatRemediationEngine` has its own plans, approval, execution, rollback | Bypasses all canonical safety controls |
| Parallel backend execution | `security.remediation.execute` / `security.quarantine` use `shutil`/`os.remove` directly | No TOCTOU protection, no backup, no audit trail |
| Ad-hoc persistence | JSON manifest file instead of `MetadataDatabase` | No transactional safety, no query support |
| In-memory plan state | Frontend `ThreatRemediationEngine.plans` Map | Does not survive restart |
| No stale-plan rejection | Plans have no timestamp-based staleness check | Stale plans could be executed after threat changes |
| No duplicate prevention | No `ExecutionLedger` equivalent | Same threat could be remediated multiple times |
| Unsupported action types | `disable_scheduled_task`, `disable_browser_extension`, `reset_browser_setting` have no canonical executor | These actions cannot be migrated |

---

## 9. Domain-to-Canonical Mapping

### Action Type Mapping

| Security Center Action | Canonical ActionType | Canonical ActionTargetType | Supported | Notes |
|------------------------|---------------------|---------------------------|-----------|-------|
| `quarantine` | `DELETE_FILE` | `FILESYSTEM` | ✅ | `backup_required=True`, `rollback_supported=True`. Backup IS the quarantine copy. See §10. |
| `restore` | (rollback) | N/A | ✅ | Maps to `scan_core.remediation.rollback` |
| `delete` (quarantined file) | `DELETE_FILE` | `FILESYSTEM` | ✅ | `backup_required=False`, `rollback_supported=False`. Targets the backup location. |
| `disable_startup_entry` | `DISABLE_STARTUP_ENTRY` | `STARTUP` | ✅ | Direct mapping |
| `remove_persistence` (registry) | `REMOVE_REGISTRY_VALUE` | `REGISTRY` | ✅ | When persistence is registry-based |
| `remove_persistence` (scheduled task) | N/A | N/A | ❌ | No canonical executor for scheduled tasks |
| `disable_scheduled_task` | N/A | N/A | ❌ | No canonical executor. Classified as `NOT_FIXABLE` |
| `disable_browser_extension` | N/A | N/A | ❌ | No canonical executor. Classified as `NOT_FIXABLE` |
| `reset_browser_setting` | N/A | N/A | ❌ | No canonical executor. Classified as `NOT_FIXABLE` |
| `review` | N/A | N/A | N/A | Maps to `ActionState.REVIEW_REQUIRED` (not an action) |
| `ignore` | N/A | N/A | N/A | Not an action (state decision) |
| `mark_false_positive` | N/A | N/A | N/A | Security domain state (per D4, stays in security domain) |
| `export_investigation` | N/A | N/A | N/A | Not a remediation action |

### Target Mapping

| Security Center Target | Canonical ActionTarget | Notes |
|------------------------|----------------------|-------|
| `file` (threat file) | `FilesystemActionTarget` | `canonical_path` = threat file path, `allowed_location` = parent directory, `backup_required=True` for quarantine |
| `startup_entry` | `StartupActionTarget` | `entry_id` = startup entry ID, `scope` = registry scope |
| `registry` | `RegistryActionTarget` | `hive`, `key_path`, `value_name` from threat asset |
| `scheduled_task` | _NoTarget | NOT_SUPPORTED → `NOT_FIXABLE` |
| `browser_extension` | _NoTarget | NOT_SUPPORTED → `NOT_FIXABLE` |
| `browser_setting` | _NoTarget | NOT_SUPPORTED → `NOT_FIXABLE` |
| `process` | _NoTarget | NOT_SUPPORTED → `NOT_FIXABLE` (processes are not filesystem targets) |
| `network` | _NoTarget | NOT_SUPPORTED → `NOT_FIXABLE` |

### Plan Mapping

| Security Center Plan Concept | Canonical Concept |
|------------------------------|-------------------|
| `RemediationPlan.id` | `ActionPlan.plan_id` (backend-generated) |
| `RemediationPlan.investigationId` | Stored in action `reason` / metadata |
| `RemediationPlan.actions[]` | `ActionPlan.actions[]` |
| `RemediationPlan.requiresApproval` | `ActionPlan.summary.review_required_actions > 0` |
| `RemediationPlan.status` | Replaced by canonical `prepare → validate → execute → status` lifecycle |
| `RemediationPlan.createdAt` | `ActionPlan.created_at` |

### Approval Mapping

| Security Center Approval | Canonical Approval |
|--------------------------|-------------------|
| `ThreatApprovalManager.approve()` | `scan_core.remediation.prepare` → approval_token → `scan_core.remediation.execute` |
| `ThreatApprovalManager.reject()` | User dismisses `ResultsView` without executing |
| `ApprovalRequest.riskLevel` | `RemediationPreview.safety_state_counts` |
| `ApprovalRequest.summary` | `RemediationPreview.affected_targets` |

### Rollback Mapping

| Security Center Rollback | Canonical Rollback |
|--------------------------|-------------------|
| `ThreatRollbackManager.rollback(actionId)` | `scan_core.remediation.rollback(execution_id)` |
| `ThreatRestoreManager.restore()` | `BackupManager.restore(record)` |
| `RollbackData.backupPath` | `BackupRecord.backup_location` |
| `RollbackData.originalPath` | `BackupRecord.original_path` |

---

## 10. Quarantine Architecture Decision

### Quarantine Decision Gate Analysis

**Q1: What exactly does "quarantine" currently do?**
Moves a suspicious file from its original location to a secure quarantine directory using `shutil.move()`.

**Q2: Does it move/copy a file?**
Moves (not copies). `shutil.move(file_path, q_path)` at `security_remediation/__init__.py:113`.

**Q3: Where is the quarantine location?**
`%LOCALAPPDATA%\AVS Shield\Quarantine` (Windows) / `~/.avs-shield/quarantine` (Linux). Line 44–46.

**Q4: How is the original location recorded?**
In `manifest.json`: `item["originalPath"] = file_path`. Line 119.

**Q5: How is restore performed?**
`shutil.move(q_path, original_path)`. Line 175.

**Q6: What happens if quarantine partially succeeds?**
If `shutil.move` fails, returns `{"error": str(e), "quarantined": False}`. No partial state cleanup. The file may or may not be at the original location.

**Q7: What happens after application restart?**
Manifest persists to disk. Frontend `ThreatRemediationEngine` in-memory plans are lost. Backend quarantine items survive via manifest.

**Q8: How is quarantine state persisted?**
JSON file (`manifest.json`) in the quarantine directory. NOT in `MetadataDatabase`.

**Q9: How is rollback currently implemented?**
Backend: `security.quarantine.restore` calls `shutil.move(q_path, original_path)`. Frontend: `ThreatRollbackManager` → `ThreatRestoreManager` → `ThreatQuarantineManager.restore()`.

**Q10: Does the canonical executor model safely support this?**
YES — via `DELETE_FILE` with `backup_required=True`. See analysis below.

### Classification: **B — Existing canonical model can represent it with an adapter/precondition without modifying core.**

### Quarantine-as-Delete-with-Backup Mapping

The canonical `FilesystemExecutor` for `DELETE_FILE` performs:
1. Validate path shape and safety
2. Read live state (exists, is_file, size, hash, mtime, writable)
3. Verify invariants (not symlink, not junction, hash matches, size matches, mtime matches)
4. **Create backup** via `BackupManager.create_backup()` — COPIES file to backup location
5. **Delete original** — `os.remove(path)`
6. Post-execution verification — confirm file no longer exists

This is semantically equivalent to quarantine:
- **Quarantine:** MOVE file to secure location (file removed from original, stored safely)
- **Canonical:** COPY file to backup location + DELETE original (file removed from original, stored safely)

**End state is identical:** file is not at original location, safe copy exists in backup/quarantine location.

### Rollback (Restore) Mapping

- **Quarantine restore:** `shutil.move(quarantine_path, original_path)` — moves file back
- **Canonical rollback:** `BackupManager.restore(record)` — copies from backup back to original

Both restore the file to its original location from the safe copy.

### Differences and Acceptance

| Difference | Impact | Acceptable? |
|------------|--------|-------------|
| Copy vs. move | Canonical copies then deletes (temporary 2x disk usage). Quarantine moves (1x disk usage). | ✅ Yes — temporary disk usage is not a safety issue. The end state is identical. |
| Backup directory vs. quarantine directory | Canonical uses `backup_root`. Quarantine uses dedicated directory. | ✅ Yes — `backup_root` can be configured. The backup location IS the quarantine location. |
| JSON manifest vs. ExecutionRepository | Canonical uses `MetadataDatabase`. Quarantine uses `manifest.json`. | ✅ Yes — canonical persistence is BETTER (transactional, queryable, auditable). |
| Quarantine metadata (threatId, reason) | Canonical `BackupRecord` doesn't have these fields. | ✅ Yes — stored in `RemediationAction.reason` and execution context. `ExecutionRepository` records the full audit trail. |
| Encryption | Quarantine config has encryption (not implemented in backend). Canonical backup has no encryption. | ✅ Yes — encryption is not implemented in the current backend anyway. Future enhancement for both. |

### Quarantine List Operation

The current `security.quarantine.list` reads `manifest.json`. In the canonical model, quarantined items are:
- `ExecutionRepository` records with `action_type = "delete_file"` and `backup_identity != None`
- `BackupRecord` entries with `backup_location` pointing to the backup/quarantine location

A new query method on `ExecutionRepository` (or `ActionPlanRepository`) can list all executions where `action_type = "delete_file"` and `backup_required = True` and the action came from a security remediation plan. This is a new query, not a core architecture change.

### Quarantine Delete Operation

The current `security.quarantine.delete` permanently deletes a quarantined file (`os.remove(q_path)`). In the canonical model, this is a `DELETE_FILE` action targeting the backup location, with `backup_required=False` and `rollback_supported=False`. This is a standard canonical deletion of a file.

### Conclusion

**Quarantine does NOT require a new ActionType.** It maps cleanly to `DELETE_FILE` with `backup_required=True` and `rollback_supported=True`. The `BackupManager`'s backup serves as the quarantined copy. Canonical rollback serves as restore. No core architecture changes are needed.

---

## 11. Threat Investigation Boundary

Per product decision D3:

- Threat investigation, threat correlation, threat intelligence, and knowledge-base functionality remain OUTSIDE `scan_core`
- `scan_core` owns remediation planning/execution safety, not the security intelligence engine
- The `SecurityInvestigation` engine, `ThreatKnowledgeBase`, `ThreatCorrelationEngine`, `ThreatExplanationEngine`, `ThreatConfidenceEngine`, `ThreatSeverityEngine`, `ThreatTimelineBuilder`, `ThreatRecommendationEngine`, `ThreatReportGenerator`, `ThreatRelationshipGraph`, `ThreatEvidenceCollector`, `ThreatContextBuilder`, `ThreatSummaryBuilder`, and `ThreatHistory` remain unchanged
- The `SecurityCenterPage` investigation tab, threats tab, overview tab, reports tab, and settings tab remain unchanged
- Only the remediation tab changes (replaced with `PlanReviewView` → `ResultsView`)

---

## 12. False Positive Boundary

Per product decision D4:

- Security Center false-positive tracking and threat intelligence state remain in the existing security domain
- `ThreatFalsePositiveTracker` remains unchanged
- False positive entries are NOT migrated to `scan_core`
- Canonical execution/audit state (execution records, backup records, action plans) remains in `scan_core`
- The `mark_false_positive` action type does NOT map to a canonical action — it is a security domain state operation
- The adapter classifies `mark_false_positive` as `NOT_FIXABLE` (not a canonical remediation action)

---

## 13. Proposed Architecture

### Frontend (After SC-8C12)

```
SecurityCenterPage (tabs: overview, scan, threats, investigation, remediation, reports, settings)
  ├─ OverviewTab — UNCHANGED
  ├─ ScanTab — UNCHANGED (already canonical)
  ├─ ThreatsTab — UNCHANGED
  ├─ InvestigationTab — UNCHANGED
  ├─ RemediationTab — CHANGED
  │    └─ useSecurityRemediationPlan() (NEW)
  │        → actionToRpcPayload() (sanitized serialization)
  │        → scan_core.security_remediation.plan RPC
  │        → backend-generated plan_id
  │        → PlanReviewView (existing)
  │        → ResultsView (existing)
  │        → useResults (existing — canonical remediation)
  │        → prepare → validate → approve → execute → status → rollback
  ├─ ReportsTab — UNCHANGED (reads from security domain history)
  └─ SettingsTab — UNCHANGED
```

### Backend (After SC-8C12)

```
scan_core.security_remediation.plan RPC (NEW — planning only)
  → SecurityRemediationAdapter (NEW — converts threats to RemediationActions)
  → SecurityRemediationPlanBuilder (NEW — builds canonical ActionPlan)
  → ActionPlanRepository.save() (existing)
  → Returns plan_id

scan_core.remediation.prepare / validate / execute / status / rollback (EXISTING — unchanged)
  → RemediationCoordinator (existing)
  → SafetyGate (existing)
  → DefaultExecutor (existing)
  → FilesystemExecutor (existing — handles quarantine as DELETE_FILE with backup)
  → StartupExecutor (existing — handles disable_startup_entry)
  → RegistryExecutor (existing — handles remove_persistence)
  → BackupManager (existing — backup IS quarantine copy)
  → ExecutionRepository (existing — audit trail)
  → ExecutionLedger (existing — duplicate prevention)
```

---

## 14. Backend Changes

### NEW: `backend/src/avs_backend/scan_core/adapters/security_remediation_adapter.py`

Mirrors `smart_optimization_adapter.py` pattern.

**Responsibilities:**
- Convert Security Center threat remediation actions to canonical `RemediationAction` objects
- Map `quarantine` → `ActionType.DELETE_FILE` with `FilesystemActionTarget(backup_required=True, rollback_supported=True)`
- Map `disable_startup_entry` → `ActionType.DISABLE_STARTUP_ENTRY` with `StartupActionTarget`
- Map `remove_persistence` (registry) → `ActionType.REMOVE_REGISTRY_VALUE` with `RegistryActionTarget`
- Map `delete` (quarantined file) → `ActionType.DELETE_FILE` with `FilesystemActionTarget(backup_required=False, rollback_supported=False)`
- Classify unsupported actions (`disable_scheduled_task`, `disable_browser_extension`, `reset_browser_setting`) as `NOT_FIXABLE`
- Classify non-remediation actions (`review`, `ignore`, `mark_false_positive`, `export_investigation`) as `NOT_FIXABLE`
- NEVER execute remediation
- NEVER bypass `SafetyGate`
- NEVER bypass `CapabilityContract`

**Key mapping table:**

```python
SECURITY_ACTION_MAPPINGS = {
    "quarantine": SecurityActionMapping(
        security_type="quarantine",
        action_type=ActionType.DELETE_FILE,
        target_type="filesystem",
        backup_required=True,
        rollback_supported=True,
        is_supported=True,
        reason="Quarantine maps to delete_file with backup (backup IS quarantine copy)",
    ),
    "delete": SecurityActionMapping(
        security_type="delete",
        action_type=ActionType.DELETE_FILE,
        target_type="filesystem",
        backup_required=False,
        rollback_supported=False,
        is_supported=True,
        reason="Permanent deletion of quarantined file (targets backup location)",
    ),
    "disable_startup_entry": SecurityActionMapping(
        security_type="disable_startup_entry",
        action_type=ActionType.DISABLE_STARTUP_ENTRY,
        target_type="startup",
        backup_required=True,
        rollback_supported=True,
        is_supported=True,
        reason="Direct mapping to canonical startup executor",
    ),
    "remove_persistence": SecurityActionMapping(
        security_type="remove_persistence",
        action_type=ActionType.REMOVE_REGISTRY_VALUE,
        target_type="registry",
        backup_required=True,
        rollback_supported=True,
        is_supported=True,
        reason="Maps to registry value removal (when persistence is registry-based)",
    ),
    # Unsupported actions
    "disable_scheduled_task": NOT_SUPPORTED,
    "disable_browser_extension": NOT_SUPPORTED,
    "reset_browser_setting": NOT_SUPPORTED,
    # Non-remediation actions
    "review": NOT_FIXABLE,
    "ignore": NOT_FIXABLE,
    "mark_false_positive": NOT_FIXABLE,
    "export_investigation": NOT_FIXABLE,
}
```

### NEW: `backend/src/avs_backend/scan_core/adapters/security_remediation_plan_builder.py`

Mirrors `smart_optimization_plan_builder.py` pattern.

**Responsibilities:**
- Build canonical `ActionPlan` from `SecurityRemediationAdapter` output
- Compute `ActionSummary` statistics
- Persist via `ActionPlanRepository`
- NEVER execute remediation
- Return `ActionPlan` with backend-generated `plan_id`

### NEW: `scan_core.security_remediation.plan` RPC

Registered in `backend/src/avs_backend/scan_core_rpc/__init__.py`.

**Request:**
```json
{
  "actions": [
    {
      "id": "act-1",
      "type": "quarantine",
      "threatId": "threat-123",
      "target": {
        "type": "file",
        "path": "C:\\Users\\...\\suspicious.exe",
        "name": "suspicious.exe"
      },
      "reason": "Quarantine spyware threat: suspicious.exe",
      "confidence": 0.95,
      "severity": "high",
      "category": "spyware",
      "sourceModule": "security-center",
      "sourceFindingId": "finding-456",
      "rollbackAvailable": true
    }
  ]
}
```

**Response:**
```json
{
  "ok": true,
  "plan_id": "550e8400-e29b-41d4-a716-446655440000",
  "total_actions": 1,
  "auto_fixable": 0,
  "review_required": 1,
  "not_fixable": 0,
  "estimated_affected_size": 1024000,
  "statistics": {
    "converted": 1,
    "unsupported": 0,
    "errors": 0
  }
}
```

**Privacy:** The request payload must NOT contain `canonical_path`, `asset_id`, registry keys, or browser profile paths. The adapter resolves these from the threat target path using safe internal resolution. The response contains only safe fields (no paths, no asset IDs).

### UNCHANGED Backend Components

- `SafetyGate` — no changes
- `RemediationCoordinator` — no changes
- `DefaultExecutor` — no changes
- `FilesystemExecutor` — no changes (handles quarantine as `DELETE_FILE` with backup)
- `StartupExecutor` — no changes
- `RegistryExecutor` — no changes
- `BackupManager` — no changes (backup IS quarantine copy)
- `ActionPlanRepository` — no changes
- `ExecutionRepository` — no changes
- `ExecutionLedger` — no changes
- `scan_core.remediation.*` RPCs — no changes

### Legacy Backend Disconnection

- `security.quarantine` RPC — retained for backward compatibility, disconnected from production UI
- `security.quarantine.restore` RPC — retained for backward compatibility, disconnected from production UI
- `security.quarantine.delete` RPC — retained for backward compatibility, disconnected from production UI
- `security.quarantine.list` RPC — retained for backward compatibility, disconnected from production UI
- `security.remediation.plan` RPC — retained for backward compatibility, disconnected from production UI
- `security.remediation.execute` RPC — retained for backward compatibility, disconnected from production UI
- `security.remediation.rollback` RPC — retained for backward compatibility, disconnected from production UI

**Legacy RPCs are NOT deleted.** They are retained for test compatibility and potential non-production tools. Only the production UI (`SecurityCenterPage` remediation tab) is disconnected from them.

---

## 15. Frontend Changes

### NEW: `apps/pc-optimizer/src/features/scan/useSecurityRemediationPlan.ts`

Mirrors `useSmartOptimizationPlan.ts` pattern.

**Responsibilities:**
- Accept sanitized Security Center remediation actions
- Call `scan_core.security_remediation.plan` RPC
- Receive backend-generated `plan_id`
- Provide plan creation state (idle, creating, created, error)
- Concurrency guard (`isCreatingRef`)
- Error handling (RPC failure, malformed response, missing plan_id, empty actions)

### MODIFIED: `apps/pc-optimizer/src/features/security-dashboard/SecurityCenterPage.tsx`

**Changes:**
- `RemediationTab` — replace `PlanCard` list and `vm.executePlan/approvePlan/rejectPlan/rollbackAction` calls with `PlanReviewView` → `ResultsView`
- Add `useSecurityRemediationPlan` hook for plan creation
- Add `usePlanDetails` for plan hydration
- Add `useResults` for canonical remediation flow
- Preserve quarantine summary display (reads from canonical execution records, not legacy manifest)

**Unchanged:**
- `OverviewTab`, `ScanTab`, `ThreatsTab`, `InvestigationTab`, `ReportsTab`, `SettingsTab`
- Threat detection, investigation, correlation UI
- Security dashboard, threat timeline, intelligence UI

### MODIFIED: `apps/pc-optimizer/src/features/security-dashboard/SecurityCenterViewModel.ts`

**Changes:**
- `createRemediationPlan()` — no longer calls `ThreatRemediationEngine.createPlan()`. Instead, returns sanitized actions for `useSecurityRemediationPlan` to send to backend.
- `approvePlan()`, `rejectPlan()`, `executePlan()`, `rollbackAction()` — removed or deprecated. These are replaced by `useResults` canonical flow.
- `loadQuarantineSummary()` — updated to read from canonical execution records (or kept as legacy fallback during transition).

### MODIFIED: `apps/pc-optimizer/src/features/security-dashboard/SecurityCenterService.ts`

**Changes:**
- Remove production calls to `ThreatRemediationEngine.createPlan/approvePlan/rejectPlan/executePlan/rollbackAction`
- Remove production calls to `securityBackendService.generateRemediationPlan/executeRemediationPlan/rollbackRemediation`
- Retain `securityBackendService.listQuarantined/restoreQuarantined/deleteQuarantined` for quarantine management UI (transitional, until canonical quarantine list query is available)

**ARCHITECTURAL GAP — REQUIRES DESIGN DECISION:** The quarantine management UI (list, restore, delete quarantined items) currently reads from the legacy `manifest.json` via `security.quarantine.list`. In the canonical model, quarantined items are stored as `BackupRecord` entries in `MetadataDatabase`. A new query method is needed to list quarantined items from canonical persistence. This query method is a new read-only method on `ExecutionRepository` or `ActionPlanRepository`, not a core architecture change. Until this query is implemented, the quarantine management UI may continue to read from the legacy manifest as a transitional measure.

### UNCHANGED Frontend Components

- `PlanReviewView` — no changes (already supports all modules)
- `ResultsView` — no changes (already supports all modules)
- `useResults` — no changes (already supports all modules)
- `usePlanDetails` — no changes (already supports all modules)
- `remediationService` — no changes (already supports `scan_core.remediation.*`)
- `unifiedScanState` — no changes (UI-only, not persisted)

### Legacy Frontend Disconnection

- `ThreatRemediationEngine` — retained for test compatibility, disconnected from production UI
- `ThreatRemediationPlanner` — retained for test compatibility, disconnected from production UI
- `ThreatApprovalManager` — retained for test compatibility, disconnected from production UI
- `ThreatRollbackManager` — retained for test compatibility, disconnected from production UI
- `ThreatQuarantineManager` — retained for test compatibility, disconnected from production UI
- `ThreatRestoreManager` — retained for test compatibility, disconnected from production UI
- `ThreatDeletionManager` — retained for test compatibility, disconnected from production UI
- `ThreatSafetyValidator` — retained for test compatibility, disconnected from production UI
- `ThreatRemediationEvents` — retained for test compatibility, disconnected from production UI
- `ThreatRemediationHistory` — retained for test compatibility, disconnected from production UI
- `ThreatRemediationReport` — retained for test compatibility, disconnected from production UI
- `ThreatRecoveryProvider` — retained for test compatibility, disconnected from production UI
- `ThreatDashboardProvider` — retained for test compatibility, disconnected from production UI
- `ThreatFalsePositiveTracker` — retained (per D4, stays in security domain)
- `ThreatConfigurationManager` — retained (configuration, not remediation execution)
- `ThreatRemediationPolicyManager` — retained for test compatibility, disconnected from production UI

**Legacy components are NOT deleted.** They are retained for test compatibility. Only production UI calls are removed.

---

## 16. RPC Contracts

### NEW RPC: `scan_core.security_remediation.plan`

**Purpose:** Convert Security Center threat remediation actions into a canonical `ActionPlan`.

**Request:**
```typescript
interface SecurityRemediationPlanRequest {
  actions: SecurityRemediationActionPayload[];
}

interface SecurityRemediationActionPayload {
  id: string;                    // Action ID (frontend-generated, for dedup)
  type: string;                  // Security action type ("quarantine", "disable_startup_entry", etc.)
  threatId: string;              // Threat ID (for audit trail)
  title: string;                 // Human-readable action title
  description: string;           // Human-readable action description
  reason: string;                // Why this action is recommended
  confidence: number;            // 0.0–1.0
  severity: string;              // "low" | "medium" | "high" | "critical"
  category: string;              // Threat category ("spyware", "adware", etc.)
  sourceModule: string;          // Always "security-center"
  sourceFindingId: string;       // Investigation/threat finding ID
  rollbackAvailable: boolean;    // Whether rollback is available
  target: {
    type: string;                // "file" | "startup_entry" | "registry" | etc.
    name: string;                // Display name (safe, no raw paths)
    path: string;                // ⚠️ Raw path — used by adapter ONLY, never returned to frontend
  };
}
```

**Response:**
```typescript
interface SecurityRemediationPlanResponse {
  ok: boolean;
  plan_id?: string;              // Backend-generated ActionPlan ID
  total_actions?: number;
  auto_fixable?: number;
  review_required?: number;
  not_fixable?: number;
  estimated_affected_size?: number;
  statistics?: {
    converted: number;
    unsupported: number;
    errors: number;
  };
  error?: string;
}
```

**Privacy:** The request payload contains `target.path` (raw filesystem path) which is used by the adapter to resolve `canonical_path` and `asset_id` internally. This path is NEVER returned in any response. The response contains only safe aggregate fields. This mirrors the SC-8C11 pattern where `SmartOptimizationPage` sends action payloads with target information that the adapter resolves internally.

### EXISTING RPCs (unchanged)

- `scan_core.scan.plan_details` — hydrate persisted ActionPlan (read-only)
- `scan_core.remediation.prepare` — generate preview + approval token
- `scan_core.remediation.validate` — validate plan (dry-run)
- `scan_core.remediation.execute` — execute (requires approval token)
- `scan_core.remediation.status` — poll execution status
- `scan_core.remediation.cancel` — cancel execution
- `scan_core.remediation.rollback` — rollback executed actions

### Legacy RPCs (retained, disconnected from production)

- `security.quarantine` — retained for test compatibility
- `security.quarantine.restore` — retained for test compatibility
- `security.quarantine.delete` — retained for test compatibility
- `security.quarantine.list` — retained for test compatibility and transitional quarantine UI
- `security.remediation.plan` — retained for test compatibility
- `security.remediation.execute` — retained for test compatibility
- `security.remediation.rollback` — retained for test compatibility

---

## 17. ActionPlan Mapping

### ActionPlan Structure (canonical, unchanged)

```python
@dataclass(frozen=True)
class ActionPlan:
    plan_id: str          # Backend-generated UUID
    actions: tuple[RemediationAction, ...]
    summary: ActionSummary
    created_at: datetime
    source: str           # "security_center" for SC-8C12
```

### Security Center ActionPlan Source

The `ActionPlan.source` field is set to `"security_center"` to distinguish security remediation plans from other modules. This allows the quarantine list query to filter by source.

### Action Mapping Example

**Input (Security Center quarantine action):**
```json
{
  "type": "quarantine",
  "threatId": "threat-123",
  "target": {
    "type": "file",
    "path": "C:\\Users\\Public\\suspicious.exe",
    "name": "suspicious.exe"
  },
  "reason": "Quarantine spyware threat",
  "severity": "high",
  "category": "spyware"
}
```

**Output (canonical RemediationAction):**
```python
RemediationAction(
    action_id="act-550e8400-...",
    action_type=ActionType.DELETE_FILE,
    state=ActionState.PLANNED,
    target=FilesystemActionTarget(
        asset_id="<computed from path>",
        canonical_path="C:\\Users\\Public\\suspicious.exe",
        allowed_location="C:\\Users\\Public",
        scope="user",
        backup_required=True,
        rollback_supported=True,
    ),
    finding_id="threat-123",
    rule_id="security.spyware.quarantine",
    rule_version="1.0.0",
    ...
    reason="Quarantine spyware threat: suspicious.exe",
)
```

---

## 18. SafetyGate / CapabilityContract Requirements

### SafetyGate (unchanged)

The existing `SafetyGate` evaluates:
- `SafetyLevel` (SAFE, LOW_RISK, REVIEW_REQUIRED, HIGH_RISK, BLOCKED)
- `SafetyBlocker` (SYSTEM_CRITICAL, ACTIVE, LOCKED, PROTECTED, etc.)
- Path validation (no system directories, no symlinks, no junctions)
- Registry validation (no critical hives, no system keys)

Security Center quarantine actions are classified as:
- `quarantine` of high-severity threat → `HIGH_RISK` (requires explicit approval)
- `quarantine` of medium-severity threat → `LOW_RISK` (requires explicit approval per policy)
- `delete` of quarantined file → `HIGH_RISK` (irreversible, requires explicit approval)
- `disable_startup_entry` → `LOW_RISK` (requires explicit approval per policy)
- `remove_persistence` → `MEDIUM_RISK` (requires explicit approval)

### CapabilityContract (unchanged)

The existing `CapabilityContract` evaluates:
- `Fixability` (FIXABLE, NOT_FIXABLE, REQUIRES_REVIEW)
- `RuleCapability` (what the rule can do)
- `Actionability` (is the action executable now?)

Unsupported security actions (`disable_scheduled_task`, `disable_browser_extension`, `reset_browser_setting`) are classified as `NOT_FIXABLE` by the adapter.

---

## 19. Persistence Requirements

### Canonical Persistence (unchanged)

- `ActionPlanRepository` — persists `ActionPlan` in `MetadataDatabase`
- `ExecutionRepository` — persists `ExecutionSummary` and `ExecutionResult` in `MetadataDatabase`
- `BackupRecord` — persists backup metadata (backup_location, backup_hash, original_path) in `MetadataDatabase`

### Quarantine Persistence (NEW — canonical)

Quarantined items are persisted as:
- `ExecutionResult` with `action_type = "delete_file"`, `backup_identity != None`, `backup_location != None`
- `BackupRecord` with `original_path`, `backup_location`, `backup_hash`

This replaces the legacy `manifest.json` file. The canonical persistence is transactional, queryable, and auditable.

### Legacy Persistence (transitional)

- `manifest.json` — retained for backward compatibility and transitional quarantine UI
- Not written to by the canonical flow
- May be read by the transitional quarantine UI until canonical quarantine list query is implemented

### ARCHITECTURAL GAP — REQUIRES DESIGN DECISION

A new read-only query method is needed on `ExecutionRepository` (or `ActionPlanRepository`) to list quarantined items:
- Filter: `action_type = "delete_file"` AND `backup_required = True` AND `plan.source = "security_center"`
- Return: `quarantineId` (execution_id), `originalPath` (from BackupRecord), `quarantinePath` (backup_location), `fileSize`, `quarantinedAt` (timestamp)

This is a new query method, not a core architecture change. It can be implemented as a method on `ExecutionRepository` or as a new RPC `scan_core.security_remediation.quarantine_list`.

**PRODUCT DECISION REQUIRED:** Should the quarantine list query be:
- (a) A new method on `ExecutionRepository` exposed via a new RPC `scan_core.security_remediation.quarantine_list`?
- (b) A filter on the existing `scan_core.scan.history` or `scan_core.scan.plan_details`?
- (c) Keep the legacy `security.quarantine.list` RPC as a transitional measure?

**Recommendation:** (a) — a new dedicated RPC is cleanest and most consistent with the canonical model.

---

## 20. Rollback Requirements

### Canonical Rollback (unchanged)

`scan_core.remediation.rollback(execution_id)`:
1. Loads `ExecutionSummary` from `ExecutionRepository`
2. For each `ExecutionResult` with `backup_identity`:
   - Loads `BackupRecord` from `MetadataDatabase`
   - Calls `BackupManager.restore(record)` — copies from backup to original location
3. Returns `RollbackSummary`

### Quarantine Restore Mapping

- **Quarantine restore** = canonical rollback
- `BackupManager.restore(record)` copies the quarantined file from backup location back to original location
- This is semantically identical to `shutil.move(quarantinePath, originalPath)`

### Quarantine Delete (Permanent)

- **Quarantine delete** = `DELETE_FILE` action targeting the backup location
- `backup_required=False`, `rollback_supported=False`
- This is a standard canonical deletion of a file
- Requires explicit approval (irreversible)

---

## 21. Privacy Requirements

### Payload Sanitization

The `SecurityCenterPage` must serialize only safe fields through the plan creation payload:

**Safe fields (included):**
- `id`, `type`, `threatId`, `title`, `description`, `reason`
- `confidence`, `severity`, `category`
- `sourceModule`, `sourceFindingId`, `rollbackAvailable`
- `target.type`, `target.name` (display name, not raw path)

**Unsafe fields (excluded from frontend-visible responses, but `target.path` IS sent in the request for adapter resolution):**
- `canonical_path` (computed by adapter, never returned)
- `asset_id` (computed by adapter, never returned)
- Registry keys (computed by adapter from target, never returned)
- Browser profile paths (not applicable to security remediation)
- `backup_location` (backend-only, never returned to frontend)
- Raw evidence (stays in security domain)
- Internal target payloads (stays in security domain)
- Machine identifiers (not sent)

### RPC Response Privacy

All `scan_core.remediation.*` responses are already privacy-safe (per SC-8C9 hardening):
- `prepare` response: `affected_targets` contains only `{"display_name": ...}`
- `plan_details` response: `canonical_path` hardcoded to `""`
- No raw paths, registry keys, or backup locations in any response

### Frontend Display

- `PlanReviewView` displays safe display names (from `display_name` field)
- `ResultsView` displays safe action descriptions
- No raw filesystem paths shown to user
- Threat names and descriptions are safe (from security domain, already sanitized)

---

## 22. Concurrency Requirements

### Plan Creation Concurrency

- `useSecurityRemediationPlan` uses `isCreatingRef` to prevent duplicate plan creation
- Same pattern as `useSmartOptimizationPlan` (SC-8C11)

### Remediation Execution Concurrency

- `useResults` already has concurrency guards (SC-8C10):
  - `isPreparingRef` — prevents concurrent prepare
  - `isValidatingRef` — prevents concurrent validate
  - `hasRequestedExecution` — prevents duplicate execution
  - `hasRequestedRollback` — prevents duplicate rollback

### Backend Concurrency

- `RemediationCoordinator` has `_lock` and `_active` set (SC-8C6):
  - Prevents duplicate execution of the same plan
  - `ExecutionLedger` prevents duplicate execution across requests

---

## 23. UX Requirements

### Remediation Tab UX (After SC-8C12)

```
RemediationTab
  ├─ Quarantine Summary (preserved — shows count of quarantined items)
  ├─ "Create Remediation Plan" button
  │    → useSecurityRemediationPlan.createPlan(actions)
  │    → scan_core.security_remediation.plan RPC
  │    → plan_id received
  ├─ PlanReviewView (canonical — shows plan details, findings, statistics)
  ├─ ResultsView (canonical — shows prepare/validate/approve/execute/rollback)
  └─ Empty State (when no plan exists)
```

### Preserved UX

- Threat dashboard, threat timeline, investigation UI, intelligence UI, detection UI
- Quarantine summary display (count of quarantined items)
- Reports tab (reads from security domain history)
- Settings tab (remediation configuration)

### Changed UX

- Plan approval: replaced `vm.approvePlan(planId)` with `ResultsView` approval flow
- Plan execution: replaced `vm.executePlan(planId)` with `ResultsView` execution flow
- Action rollback: replaced `vm.rollbackAction(actionId)` with `ResultsView` rollback flow
- Plan creation: replaced `vm.createRemediationPlan(investigationId)` with `useSecurityRemediationPlan`

---

## 24. Legacy Path Disconnection Strategy

### Strategy: Disconnect production callers, retain legacy code

**Step 1:** Identify all production callers of `ThreatRemediationEngine`:
- `SecurityCenterService.ts` — lines 472–496 (createPlan, approvePlan, rejectPlan, executePlan, rollbackAction)
- `SecurityCenterViewModel.ts` — lines 718–751 (delegates to service)
- `SecurityCenterPage.tsx` — lines 1567, 1574, 1601, 1612, 1625, 1629 (vm.executePlan, vm.rollbackAction, vm.approvePlan, vm.rejectPlan)

**Step 2:** Replace production callers with canonical flow:
- `SecurityCenterPage.tsx` RemediationTab → `PlanReviewView` → `ResultsView`
- `SecurityCenterViewModel.ts` remediation methods → delegate to `useSecurityRemediationPlan` / `useResults`
- `SecurityCenterService.ts` remediation methods → remove production calls to `ThreatRemediationEngine`

**Step 3:** Identify all production callers of `securityBackendService` remediation RPCs:
- `SecurityCenterService.ts` — lines 508, 527, 541 (listQuarantined, restoreQuarantined, deleteQuarantined)
- `securityBackendService.ts` — lines 250–260 (generateRemediationPlan, executeRemediationPlan, rollbackRemediation)

**Step 4:** Replace production callers with canonical flow:
- `generateRemediationPlan` → replaced by `scan_core.security_remediation.plan`
- `executeRemediationPlan` → replaced by `scan_core.remediation.execute`
- `rollbackRemediation` → replaced by `scan_core.remediation.rollback`
- `listQuarantined` → transitional (keep legacy until canonical quarantine list query is implemented)
- `restoreQuarantined` → replaced by `scan_core.remediation.rollback`
- `deleteQuarantined` → replaced by `scan_core.remediation.execute` with `DELETE_FILE` targeting backup location

**Step 5:** Retain legacy code:
- `ThreatRemediationEngine` and all sub-managers — retained for test compatibility
- `security-remediation/` barrel exports — retained
- `security.remediation.*` and `security.quarantine.*` backend RPCs — retained
- Legacy tests — retained (test the legacy engine, not the production flow)

**Step 6:** Add new tests for canonical flow:
- `SecurityRemediationAdapter` tests
- `SecurityRemediationPlanBuilder` tests
- `scan_core.security_remediation.plan` RPC tests
- `useSecurityRemediationPlan` hook tests
- `SecurityCenterPage` remediation tab integration tests

---

## 25. Test Strategy

### Backend Tests

| Test | Purpose |
|------|---------|
| `test_security_remediation_adapter.py` | Test threat-to-canonical action mapping |
| `test_security_remediation_plan_builder.py` | Test ActionPlan creation from security actions |
| `test_sc8c12_rpc_bridge.py` | Test `scan_core.security_remediation.plan` RPC |
| `test_sc8c12_quarantine_mapping.py` | Test quarantine-as-delete-with-backup mapping |
| `test_sc8c12_integration.py` | End-to-end: plan → prepare → validate → execute → rollback |

### Frontend Tests

| Test | Purpose |
|------|---------|
| `useSecurityRemediationPlan.test.ts` | Test plan creation hook |
| `SecurityCenterPage.remediation.test.tsx` | Test remediation tab uses canonical flow |
| `securityRemediationPlan.test.ts` | Test action payload serialization |

### Test Invariants

- Legacy `ThreatRemediationEngine` tests must still pass (legacy code retained)
- Legacy `security.remediation.*` backend tests must still pass (legacy RPCs retained)
- New canonical flow tests must pass
- No production code path calls `ThreatRemediationEngine` after disconnection

---

## 26. Security Audit Requirements

### Pre-Implementation Audit

- Verify no `shutil.move` or `os.remove` in production security remediation path
- Verify no `subprocess` in production security remediation path
- Verify no `security.remediation.execute` or `security.quarantine` calls from production UI
- Verify no `ThreatRemediationEngine` calls from production UI

### Post-Implementation Audit

- Verify `scan_core.remediation.*` is the only production remediation path for Security Center
- Verify `SafetyGate` validates all security remediation actions
- Verify `RemediationCoordinator` handles all security remediation execution
- Verify `ActionPlanRepository` persists all security remediation plans
- Verify `ExecutionRepository` records all security remediation executions
- Verify `ExecutionLedger` prevents duplicate security remediation executions
- Verify no automatic execution, resume, or rollback
- Verify no browser storage for remediation state
- Verify no raw filesystem paths in RPC responses
- Verify no direct destructive frontend APIs

### Grep Audit

Search for:
- `security.remediation.execute` in production frontend (must be 0)
- `security.quarantine` in production frontend (must be 0, except transitional list query)
- `ThreatRemediationEngine` in production frontend (must be 0 outside `security-remediation/` and tests)
- `shutil.move` in security remediation backend (must be 0 in canonical path)
- `os.remove` in security remediation backend (must be 0 in canonical path)

---

## 27. Validation Commands

```bash
# Frontend
cd apps/pc-optimizer
yarn typecheck
yarn lint
yarn build
yarn test -- --grep "securityRemediation\|SecurityCenter.*remediation\|sc8c12"

# Backend
cd backend
python -m pytest -q tests/test_security_remediation_adapter.py
python -m pytest -q tests/test_security_remediation_plan_builder.py
python -m pytest -q tests/test_sc8c12_rpc_bridge.py
python -m pytest -q tests/test_sc8c12_quarantine_mapping.py
python -m pytest -q tests/test_sc8c12_integration.py
python -m pytest -q  # Full backend suite

# Full validation
cd apps/pc-optimizer && yarn typecheck && yarn lint && yarn build && yarn test
cd ../../backend && python -m pytest -q
```

---

## 28. Implementation Phases

### Phase 1: Security Remediation Domain Inspection + Adapter Design

- Inspect Security Center domain model (completed in this specification)
- Design `SecurityRemediationAdapter` mapping table
- Design `SecurityRemediationPlanBuilder` structure
- Design `scan_core.security_remediation.plan` RPC contract
- Design `useSecurityRemediationPlan` hook
- Document quarantine architecture decision (completed in §10)

### Phase 2: SecurityRemediationAdapter

- Implement `backend/src/avs_backend/scan_core/adapters/security_remediation_adapter.py`
- Map all security action types to canonical action types
- Classify unsupported actions as `NOT_FIXABLE`
- Add adapter tests

### Phase 3: SecurityRemediationPlanBuilder + Planning RPC

- Implement `backend/src/avs_backend/scan_core/adapters/security_remediation_plan_builder.py`
- Register `scan_core.security_remediation.plan` RPC in `scan_core_rpc/__init__.py`
- Add plan builder tests
- Add RPC bridge tests

### Phase 4: Security Center Frontend Remediation Handoff

- Implement `apps/pc-optimizer/src/features/scan/useSecurityRemediationPlan.ts`
- Modify `SecurityCenterPage.tsx` RemediationTab to use `PlanReviewView` → `ResultsView`
- Modify `SecurityCenterViewModel.ts` remediation methods
- Modify `SecurityCenterService.ts` remediation methods
- Add frontend tests

### Phase 5: Legacy Disconnection + Regression/Security Validation

- Disconnect `ThreatRemediationEngine` from production UI
- Disconnect `securityBackendService` remediation RPCs from production UI
- Run full backend suite
- Run full frontend suite
- Run typecheck, lint, build
- Run security grep audit
- Create Phase 5 validation report

---

## 29. Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Quarantine-as-delete-with-backup has different disk behavior (copy vs. move) | Low | End state is identical. Temporary disk usage is acceptable. |
| Quarantine list query not yet implemented | Medium | Keep legacy `security.quarantine.list` as transitional measure. Implement canonical query in Phase 3 or as a follow-up. |
| Unsupported security actions (`disable_scheduled_task`, etc.) cannot be migrated | Medium | Classify as `NOT_FIXABLE` in adapter. User sees "Review Required" for these actions. Future executor addition can enable them. |
| `remove_persistence` may not always be registry-based | Medium | Adapter checks target type. If not registry, classify as `NOT_FIXABLE`. |
| Legacy tests may break if `ThreatRemediationEngine` imports change | Low | Legacy code is retained, not deleted. Only production UI calls are removed. |
| Security Center has 82+ tests that test remediation UI | Medium | Tests that directly test `vm.executePlan` etc. need to be updated to test canonical flow. Legacy engine tests remain unchanged. |
| Quarantine metadata (threatId, reason) not in `BackupRecord` | Low | Stored in `RemediationAction.reason` and execution context. `ExecutionRepository` records full audit trail. |

---

## 30. Acceptance Criteria

- [ ] `SecurityRemediationAdapter` created and tested
- [ ] `SecurityRemediationPlanBuilder` created and tested
- [ ] `scan_core.security_remediation.plan` RPC registered and tested
- [ ] `useSecurityRemediationPlan` hook created and tested
- [ ] `SecurityCenterPage` RemediationTab uses `PlanReviewView` → `ResultsView`
- [ ] `SecurityCenterViewModel` remediation methods delegate to canonical flow
- [ ] `SecurityCenterService` remediation methods disconnected from `ThreatRemediationEngine`
- [ ] `ThreatRemediationEngine` disconnected from production UI
- [ ] `securityBackendService` remediation RPCs disconnected from production UI
- [ ] Threat detection and investigation engine remains unchanged
- [ ] All existing Security Center tests pass (legacy + new)
- [ ] `yarn typecheck` passes
- [ ] `yarn lint` passes (0 warnings)
- [ ] `yarn build` passes
- [ ] Backend tests pass
- [ ] No `SafetyGate` weakening
- [ ] No `RemediationCoordinator` bypassing
- [ ] No `ExecutionLedger` bypassing
- [ ] No automatic execution introduced
- [ ] No automatic resume introduced
- [ ] No automatic rollback introduced
- [ ] No browser storage for remediation state
- [ ] No raw filesystem paths in RPC responses
- [ ] No direct destructive frontend APIs
- [ ] No parallel production remediation path
- [ ] SC-8C13 not started

---

## 31. Definition of Done

SC-8C12 is complete when:

- [ ] Security Center remediation flows through `RemediationCoordinator`
- [ ] Security Center actions are validated by `SafetyGate`
- [ ] Security Center execution is persisted to `ActionPlanRepository`
- [ ] Security Center execution audit trail is in `ExecutionRepository`
- [ ] Security Center rollback uses `scan_core.remediation.rollback`
- [ ] Quarantine is modeled as `DELETE_FILE` with backup (backup IS quarantine copy)
- [ ] `SecurityRemediationAdapter` created and tested
- [ ] `SecurityRemediationPlanBuilder` created and tested
- [ ] `scan_core.security_remediation.plan` RPC registered and tested
- [ ] `SecurityCenterPage` uses `PlanReviewView` → `ResultsView`
- [ ] `ThreatRemediationEngine` disconnected from production UI
- [ ] Threat detection/investigation/correlation preserved
- [ ] False positive tracking preserved in security domain
- [ ] All validation passes (typecheck, lint, build, tests)
- [ ] Security audit complete
- [ ] Regression audit complete
- [ ] SC-8C13 not started

---

## 32. Explicit SC-8C13 Boundary

**SC-8C13 is NOT started.** This specification explicitly prohibits:
- Starting SC-8C13 or any later phase
- Implementing features beyond the scope defined in this specification
- Modifying `SafetyGate`, `RemediationCoordinator`, executors, or `scan_core` internals

---

## Security Invariants (Preserved from SC-8C8 → SC-8C11)

- `scan_core` remains authoritative for scan/remediation state
- ActionPlans remain backend-generated
- Frontend never fabricates ActionPlans
- Frontend never performs destructive system operations
- `SafetyGate` remains authoritative
- Explicit approval remains required for destructive remediation
- Stale plans remain rejected
- Duplicate execution remains prevented
- Execution IDs remain backend-authoritative
- Rollback remains explicit
- No automatic execution
- No automatic resume
- No automatic rollback
- No remediation state in `localStorage`/`sessionStorage`
- RPC responses remain privacy-safe
- Raw filesystem paths/registry keys/browser profiles must not cross unsafe UI boundaries

---

**End of SC-8C12 Specification**
