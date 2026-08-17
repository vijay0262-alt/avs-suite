# SC-8C14 Specification — Security Center Legacy Backend Cleanup

## 1. Executive Summary

SC-8C14 is an architecture/security cleanup continuation of SC-8C12. The Product Owner has authoritatively selected **Candidate B — Security Center Legacy Backend Cleanup** as the SC-8C14 direction.

The purpose is to permanently remove obsolete Security Center remediation infrastructure that became unnecessary after Security Center was migrated to the canonical `scan_core` remediation workflow in SC-8C12.

SC-8C12 Phase 5 disconnected all legacy execution paths and documented the remaining dead code as known limitations. SC-8C14 completes this work by removing the dead infrastructure while preserving all legitimate read-only Security Center functionality.

**Key constraint:** `scan_core` internals remain FROZEN. No changes to `RemediationCoordinator`, `SafetyGate`, executors, `ActionType`, or persistence/recovery.

**Phase count:** 3 implementation phases.

---

## 2. Authoritative Product Decision

The Product Owner has explicitly decided:

| Decision | Value |
|----------|-------|
| D1: Primary objective | Security Center Legacy Backend Cleanup |
| D2: License Activation | OUT OF SCOPE — not part of SC-8C14 |
| D3: Health Scan Modal Cleanup | Only if isolated, obviously dead, low-risk — otherwise out of scope |
| D4: Smart Optimization dead code | Same rule as D3 — only if directly related, demonstrably dead, low-risk |
| D5: scan_core | KEEP FROZEN — no internal modifications |
| D6: ActionTypes | Do NOT add ActionTypes |
| D7: Executors | Do NOT add executors |
| D8: SafetyGate | DO NOT modify |
| D9: RemediationCoordinator | DO NOT modify |
| D10: RPCs | Read-only RPCs permitted to replace legitimate production-reachable legacy functionality. Destructive legacy RPCs must NOT be recreated. |
| D11: Definition of Done | Obsolete Security Center remediation infrastructure removed or safely disconnected, all legitimate Security Center functionality remains intact, canonical scan_core remediation remains the ONLY production remediation execution path, security/privacy invariants remain intact, all validation passes. |

---

## 3. Objective

Permanently remove obsolete Security Center remediation execution infrastructure that became dead code after SC-8C12 migrated Security Center remediation to the canonical `scan_core` workflow.

Specific objectives:

1. Remove dead backend RPC handlers for legacy destructive operations
2. Remove dead frontend RPC wrapper methods for legacy destructive operations
3. Remove dead RPC constants for legacy destructive operations
4. Remove dead frontend execution classes that are not reachable from any production code path
5. Refactor `ThreatRemediationEngine` to remove dead execution methods while preserving read-only domain functionality
6. Create a canonical `scan_core.security_remediation.quarantine_list` read-only RPC to replace the transitional `security.quarantine.list` RPC
7. Migrate all production callers of `security.quarantine.list` to the canonical replacement
8. Update tests that depend on removed components
9. Validate that all security invariants remain intact

---

## 4. Problem Statement

After SC-8C12 Phase 5, the Security Center remediation flow was migrated to the canonical `scan_core` workflow. All legacy execution paths were disconnected from production UI. However, the dead infrastructure remains in the codebase:

**Backend dead RPCs** (in `backend/src/avs_backend/security_remediation/__init__.py`):
- `security.quarantine` — quarantine a file (destructive)
- `security.quarantine.restore` — restore from quarantine (destructive)
- `security.quarantine.delete` — permanently delete quarantined file (destructive)
- `security.remediation.plan` — generate legacy remediation plan (replaced by `scan_core.security_remediation.plan`)
- `security.remediation.execute` — execute legacy remediation plan (destructive)
- `security.remediation.rollback` — rollback legacy remediation (destructive)

**Frontend dead RPC wrapper methods** (in `securityBackendService.ts`):
- `quarantineFile()` — wraps `security.quarantine`
- `restoreQuarantined()` — wraps `security.quarantine.restore`
- `deleteQuarantined()` — wraps `security.quarantine.delete`
- `generateRemediationPlan()` — wraps `security.remediation.plan`
- `executeRemediationPlan()` — wraps `security.remediation.execute`
- `rollbackRemediation()` — wraps `security.remediation.rollback`

**Frontend dead execution classes** (in `security-remediation/`):
- `ThreatRestoreManager` — only used by dead `ThreatRemediationEngine` methods
- `ThreatDeletionManager` — only used by dead `ThreatRemediationEngine` methods

**Frontend dead execution methods on `ThreatRemediationEngine`:**
- `executePlan()` — legacy execution (replaced by `scan_core.remediation.execute`)
- `executeAction()` — legacy action execution
- `performAction()` — legacy action dispatch
- `performQuarantine()` — legacy quarantine execution
- `performRestore()` — legacy restore execution
- `performDelete()` — legacy delete execution
- `performDisableStartup()` — legacy startup disable
- `performDisableTask()` — legacy task disable
- `performDisableExtension()` — legacy extension disable
- `performResetBrowser()` — legacy browser reset
- `performRemovePersistence()` — legacy persistence removal
- `rollbackAction()` — legacy rollback (replaced by `scan_core.remediation.rollback`)
- `restoreFromQuarantine()` — legacy quarantine restore
- `deleteFromQuarantine()` — legacy quarantine delete
- `approvePlan()` — legacy approval (replaced by canonical PlanReviewView)
- `rejectPlan()` — legacy rejection (replaced by canonical PlanReviewView)
- `getApprovalRequest()` — legacy approval lookup

**Transitional RPC** (production-reachable, needs migration):
- `security.quarantine.list` — called by `SecurityCenterService.getQuarantineSummary()` via `securityBackendService.listQuarantined()`

**Evidence from SC-8C12 Phase 5 report** (lines 546-558):
> 1. Legacy RPC wrappers remain in `securityBackendService.ts` — `security.quarantine.*`, `security.remediation.*` RPC wrappers are dead code (no production caller). They are retained to avoid breaking unknown consumers. Future cleanup should remove them after verifying no other consumer exists.
> 2. Legacy `ThreatRemediationEngine` remains instantiated — Used for read-only domain functionality (plan listing, quarantine summary, reports, false positives). Future cleanup should migrate these to canonical backend RPCs.
> 3. Quarantine summary uses legacy RPC — `getQuarantineSummary()` calls `securityBackendService.listQuarantined()` (legacy `security.quarantine.list` RPC). This is a transitional measure per the phase plan. A future phase should create a canonical `scan_core.security_remediation.quarantine_list` RPC.

This dead infrastructure creates confusion, increases maintenance burden, and poses a theoretical risk of accidental re-connection to production UI.

---

## 5. Current Architecture

### Security Center remediation flow (post-SC-8C12, current)

```
Security Center detection (SecurityEngine)
        ↓
Security Investigation (ThreatInvestigationEngine)
        ↓
ThreatRemediationEngine.createPlan()  ← frontend domain planning (candidate plan)
        ↓
SecurityCenterPage.tsx → securityActionToRpcPayload()
        ↓
useSecurityRemediationPlan → scan_core.security_remediation.plan RPC
        ↓
SecurityRemediationAdapter → SecurityRemediationPlanBuilder
        ↓
canonical ActionPlan (backend-authoritative)
        ↓
PlanReviewView → ResultsView
        ↓
scan_core.remediation.prepare
        ↓
scan_core.remediation.validate
        ↓
EXPLICIT USER APPROVAL
        ↓
scan_core.remediation.execute
        ↓
status polling (useResults)
        ↓
terminal state
        ↓
optional scan_core.remediation.rollback
```

### What remains active (production-reachable)

`ThreatRemediationEngine` is still instantiated by `SecurityCenterService` and used for:

| Method | Called by | Purpose |
|--------|----------|---------|
| `createPlan()` | `SecurityCenterService.createRemediationPlan()` → `SecurityCenterViewModel.createRemediationPlan()` | Creates candidate plan (planning-only, not execution) |
| `getPlan()` | `SecurityCenterService.getPlan()` | Read-only plan lookup |
| `getAllPlans()` | `SecurityCenterService.getAllPlans()` → `SecurityCenterViewModel.refresh()` | Read-only plan listing for UI state |
| `getQuarantineEntry()` | `SecurityCenterService.getQuarantineEntry()` | Read-only quarantine lookup |
| `getQuarantineSummary()` | `SecurityCenterService.getQuarantineSummary()` (fallback only) | Read-only quarantine stats (fallback when backend unavailable) |
| `markFalsePositive()` | `SecurityCenterService.markFalsePositive()` → `SecurityCenterViewModel.markFalsePositive()` | False-positive tracking (non-remediation) |
| `isFalsePositive()` | `SecurityCenterService.isFalsePositive()` | False-positive check |
| `generateReport()` | `SecurityCenterService.generateRemediationReport()` → `SecurityCenterViewModel.generateRemediationReport()` → `SecurityCenterPage.tsx` | Report generation (read-only) |
| `getHistory()` | `SecurityCenterService.getRemediationHistory()` → `SecurityCenterViewModel.refresh()` | Read-only history for UI state |
| `getDashboard()` | `SecurityCenterService.getRemediationDashboard()` → `SecurityCenterViewModel.refresh()` | Read-only dashboard for UI state |
| `getConfiguration()` | `SecurityCenterService.getRemediationConfiguration()` | Read-only config |
| `updatePolicy()` | `SecurityCenterService.updateRemediationPolicy()` | Policy update |
| `clear()` | `SecurityCenterService.dispose()` | Lifecycle cleanup |

### What is dead (no production caller)

`ThreatRemediationEngine` methods with ZERO production callers:

| Method | Status |
|--------|--------|
| `executePlan()` | Dead — replaced by `scan_core.remediation.execute` |
| `executeAction()` | Dead — only called by `executePlan()` |
| `performAction()` | Dead — only called by `executeAction()` |
| `performQuarantine()` | Dead — only called by `performAction()` |
| `performRestore()` | Dead — only called by `performAction()` |
| `performDelete()` | Dead — only called by `performAction()` |
| `performDisableStartup()` | Dead — only called by `performAction()` |
| `performDisableTask()` | Dead — only called by `performAction()` |
| `performDisableExtension()` | Dead — only called by `performAction()` |
| `performResetBrowser()` | Dead — only called by `performAction()` |
| `performRemovePersistence()` | Dead — only called by `performAction()` |
| `rollbackAction()` | Dead — replaced by `scan_core.remediation.rollback` |
| `restoreFromQuarantine()` | Dead — removed from `SecurityCenterService` in SC-8C12 Phase 5 |
| `deleteFromQuarantine()` | Dead — removed from `SecurityCenterService` in SC-8C12 Phase 5 |
| `approvePlan()` | Dead — replaced by canonical PlanReviewView |
| `rejectPlan()` | Dead — replaced by canonical PlanReviewView |
| `getApprovalRequest()` | Dead — not called from production |
| `getReport()` | Dead — only used internally by `executePlan()` |
| `setTier()` | Dead — not called from production |
| `getRecoveryStatus()` | Dead — not called from `SecurityCenterService` |
| `getRecoveryProviders()` | Dead — not called from `SecurityCenterService` |
| `getRecoveryOptions()` | Dead — not called from `SecurityCenterService` |
| `buildApprovalExplanation()` | Dead — only called by `createPlan()` for approval requests (approval is dead) |

---

## 6. SC-8C12 Starting State

SC-8C12 Phase 5 completed the Security Center frontend migration to canonical `scan_core` remediation. The following was accomplished:

- All legacy execution methods removed from `SecurityCenterService` and `SecurityCenterViewModel`
- All legacy execution methods removed from `SecurityCenterPage.tsx` UI
- `PlanCard` component now uses `useSecurityRemediationPlan` hook to create canonical ActionPlans
- Canonical `scan_core.security_remediation.plan` RPC created and wired
- `SecurityRemediationAdapter` and `SecurityRemediationPlanBuilder` created
- `securityActionToRpcPayload()` function created to convert domain actions to RPC payloads
- Full security regression audit passed
- All security invariants verified

**Remaining limitations documented in SC-8C12 Phase 5 report:**
1. Legacy RPC wrappers remain in `securityBackendService.ts` (dead code)
2. Legacy `ThreatRemediationEngine` remains instantiated (read-only domain functionality)
3. Quarantine summary uses legacy `security.quarantine.list` RPC (transitional)

SC-8C14 addresses these remaining limitations.

---

## 7. Evidence From Source Code

### Frontend dead RPC wrapper methods

**Evidence:** grep across `apps/pc-optimizer/src/` for `securityBackendService.(quarantineFile|restoreQuarantined|deleteQuarantined|generateRemediationPlan|executeRemediationPlan|rollbackRemediation)` returns ZERO matches outside `securityBackendService.ts` itself.

Only `listQuarantined()` is called from production code:
- `SecurityCenterService.ts:514` — `const backendList = await securityBackendService.listQuarantined();`

### Backend dead RPC handlers

**Evidence:** grep across `backend/tests/` for direct calls to `quarantine_file()`, `restore_quarantined()`, `delete_quarantined()`, `generate_remediation_plan()`, `execute_remediation_plan()`, `rollback_remediation()` returns ZERO matches (only negative assertions in tests verifying the canonical builder does NOT call them).

### Frontend dead execution classes

**`ThreatRestoreManager`:**
- Used only by `ThreatRemediationEngine` (for dead `performRestore()` and `restoreFromQuarantine()`)
- Used only by tests (`threatRemediation.test.ts`)
- NOT used by `SecurityCenterService`, `SecurityCenterViewModel`, or any UI component
- The `RestoreResult` type exported from `index.ts` is a DIFFERENT type from `RestoreResult` in `undo/undoService.ts`

**`ThreatDeletionManager`:**
- Used only by `ThreatRemediationEngine` (for dead `performDelete()` and `deleteFromQuarantine()`)
- Used only by tests (`threatRemediation.test.ts`)
- NOT used by `SecurityCenterService`, `SecurityCenterViewModel`, or any UI component
- The `DeleteResult` type exported from `index.ts` is a DIFFERENT type from `DuplicateDeleteResult` in `duplicate-finder/`

### Production-reachable classes that MUST be preserved

**`ThreatRollbackManager`:**
- Used by `ThreatDashboardProvider` (for dashboard summary) — PRODUCTION-REACHABLE via `getDashboard()`
- Used by `ThreatRemediationReportGenerator` (for report generation) — PRODUCTION-REACHABLE via `generateReport()`
- Used by `ThreatRecoveryProvider` (for recovery status) — NOT production-reachable from security-dashboard
- Used by `ThreatRemediationEngine` (for dead `rollbackAction()` and `executeAction()`)

**`ThreatQuarantineManager`:**
- Used by `ThreatDashboardProvider` (for dashboard summary) — PRODUCTION-REACHABLE via `getDashboard()`
- Used by `ThreatRemediationEngine.getQuarantineSummary()` (fallback) — PRODUCTION-REACHABLE
- Used by `ThreatRemediationEngine.getQuarantineEntry()` — PRODUCTION-REACHABLE
- Used by `ThreatRestoreManager` (dead) and `ThreatDeletionManager` (dead)
- Used by `ThreatRecoveryProvider` (NOT production-reachable from security-dashboard)

**`ThreatApprovalManager`:**
- Used by `ThreatRemediationEngine.createPlan()` (creates approval requests) — PRODUCTION-REACHABLE
- Used by `ThreatDashboardProvider` (for dashboard summary) — PRODUCTION-REACHABLE via `getDashboard()`
- Used by `ThreatRemediationEngine.approvePlan/rejectPlan` (dead)

**`ThreatFalsePositiveTracker`:**
- Used by `ThreatRemediationEngine.markFalsePositive/isFalsePositive` — PRODUCTION-REACHABLE
- Used by `ThreatDashboardProvider` (for dashboard summary) — PRODUCTION-REACHABLE via `getDashboard()`

**`ThreatRemediationPlanner`:**
- Used by `ThreatRemediationEngine.createPlan()` — PRODUCTION-REACHABLE

**`ThreatSafetyValidator`:**
- Used by `ThreatRemediationPlanner` — PRODUCTION-REACHABLE (transitive)

**`ThreatRemediationPolicyManager`:**
- Used by `ThreatRemediationPlanner` — PRODUCTION-REACHABLE (transitive)
- Used by `ThreatRemediationEngine.updatePolicy()` — PRODUCTION-REACHABLE

**`ThreatConfigurationManager`:**
- Used by `ThreatRemediationEngine` constructor — PRODUCTION-REACHABLE (transitive)

**`ThreatRemediationHistory`:**
- Used by `ThreatRemediationEngine.getHistory()` — PRODUCTION-REACHABLE via `getRemediationHistory()`

**`ThreatRemediationReportGenerator`:**
- Used by `ThreatRemediationEngine.generateReport()` — PRODUCTION-REACHABLE via `generateRemediationReport()`

**`ThreatDashboardProvider`:**
- Used by `ThreatRemediationEngine.getDashboard()` — PRODUCTION-REACHABLE via `getRemediationDashboard()`

**`ThreatRecoveryProvider`:**
- Used by `ThreatRemediationEngine.getRecoveryStatus/Providers/Options` — NOT production-reachable from security-dashboard
- BUT is part of the `ThreatRemediationEngine` constructor and `clear()` method

**`remediationEventBus`:**
- Used by `SecurityCenterService.onRemediationEvent()` — PRODUCTION-REACHABLE
- Used by `ThreatRemediationEngine` for emitting events

### Production-reachable RPCs that MUST be preserved

**`security.enableSmartScreen`:**
- Called by `dashboard.service.ts:46` → `RPC_METHODS.SECURITY_ENABLE_SMARTSCREEN`
- Called by `ProtectionCenterPage.tsx:69-70`
- Called by `ProtectionCenterViewModel.ts:806`

**`security.enableDefender`:**
- Called by `dashboard.service.ts:47` → `RPC_METHODS.SECURITY_ENABLE_DEFENDER`
- Called by `ProtectionCenterPage.tsx:71-72`
- Called by `ProtectionCenterViewModel.ts:773,784`

**`security.enableFirewall`:**
- Called by `dashboard.service.ts:48` → `RPC_METHODS.SECURITY_ENABLE_FIREWALL`
- Called by `ProtectionCenterPage.tsx:73-74`
- Called by `ProtectionCenterViewModel.ts:795`

**`security.quarantine.list`:**
- Called by `securityBackendService.listQuarantined()` → `SecurityCenterService.getQuarantineSummary()`
- User-facing: quarantine summary display
- TRANSITIONAL — must be migrated to canonical replacement before removal

---

## 8. Scope

### In scope

1. Remove 6 dead backend RPC handlers (`security.quarantine`, `security.quarantine.restore`, `security.quarantine.delete`, `security.remediation.plan`, `security.remediation.execute`, `security.remediation.rollback`)
2. Remove 6 dead frontend RPC wrapper methods from `securityBackendService.ts`
3. Remove 6 dead RPC constants from `packages/shared/src/rpc/index.ts`
4. Remove dead frontend classes: `ThreatRestoreManager`, `ThreatDeletionManager`
5. Refactor `ThreatRemediationEngine` to remove dead execution methods
6. Refactor `ThreatRecoveryProvider` (remove or retain based on dependency analysis — see §10)
7. Create canonical `scan_core.security_remediation.quarantine_list` read-only RPC
8. Migrate `SecurityCenterService.getQuarantineSummary()` to use canonical RPC
9. Remove transitional `security.quarantine.list` RPC after migration
10. Remove `securityBackendService.listQuarantined()` after migration
11. Update `threatRemediation.test.ts` to remove tests for deleted components/methods
12. Update `index.ts` barrel exports to remove deleted classes
13. Update `types.ts` to remove types only used by deleted components
14. Full regression validation

### Optional in scope (per D3/D4)

15. Health Scan Modal cleanup (Candidate A) — only if isolated, obviously dead, low-risk
16. Smart Optimization dead code cleanup (Candidate E) — only if directly related, demonstrably dead, low-risk

These are evaluated in §10 and may be included as a small maintenance item in the final phase.

---

## 9. Non-Goals

1. **License Activation** — OUT OF SCOPE per Product Owner decision D2
2. **SC-8C15** — NOT STARTED. No SC-8C15 requirements may be invented.
3. **Module-level cleaner migration** (Candidate C) — OUT OF SCOPE, too large
4. **Pause/resume** (Candidate D) — OUT OF SCOPE, high risk, no user demand
5. **scan_core internal modifications** — FORBIDDEN per D5
6. **New ActionTypes** — FORBIDDEN per D6
7. **New executors** — FORBIDDEN per D7
8. **SafetyGate modifications** — FORBIDDEN per D8
9. **RemediationCoordinator modifications** — FORBIDDEN per D9
10. **Recreating destructive legacy RPCs** — FORBIDDEN per D10
11. **Modifying canonical remediation flow** — the prepare → validate → approve → execute → rollback flow is authoritative and must not change
12. **Removing production-reachable read-only functionality** — all read-only domain functionality must remain intact
13. **Removing `security.enableSmartScreen/Defender/Firewall`** — these are ACTIVE production RPCs
14. **Broad repository cleanup** — SC-8C14 is focused on Security Center legacy cleanup only

---

## 10. Component Inventory

### Frontend `security-remediation/` directory

| File | Class/Export | Production-reachable? | Production callers | Test-only? | Read-only? | Destructive? | Already replaced by scan_core? | Transitional? | Safe to delete? | Required migration? | Tests that depend on it? |
|------|-------------|----------------------|-------------------|-----------|-----------|-------------|-------------------------------|---------------|----------------|-------------------|------------------------|
| `ThreatRemediationEngine.ts` | `ThreatRemediationEngine` | YES (read-only methods) | `SecurityCenterService` | Partially | Partially | NO (dead methods) | Partially (execution) | No | NO — must be refactored | Remove dead methods | `threatRemediation.test.ts` |
| `ThreatRemediationPlanner.ts` | `ThreatRemediationPlanner` | YES | `ThreatRemediationEngine.createPlan()` | No | Yes (planning) | No | No | No | NO | None | `threatRemediation.test.ts` |
| `ThreatSafetyValidator.ts` | `ThreatSafetyValidator` | YES (transitive) | `ThreatRemediationPlanner` | No | Yes | No | No | No | NO | None | `threatRemediation.test.ts` |
| `ThreatRemediationPolicy.ts` | `ThreatRemediationPolicyManager` | YES (transitive) | `ThreatRemediationPlanner`, `ThreatRemediationEngine.updatePolicy()` | No | Yes | No | No | No | NO | None | `threatRemediation.test.ts` |
| `ThreatConfiguration.ts` | `ThreatConfigurationManager` | YES (transitive) | `ThreatRemediationEngine` constructor | No | Yes | No | No | No | NO | None | `threatRemediation.test.ts` |
| `ThreatRemediationHistory.ts` | `ThreatRemediationHistory` | YES | `ThreatRemediationEngine.getHistory()` | No | Yes | No | No | No | NO | None | `threatRemediation.test.ts` |
| `ThreatRemediationReport.ts` | `ThreatRemediationReportGenerator` | YES | `ThreatRemediationEngine.generateReport()` | No | Yes | No | No | No | NO | None | `threatRemediation.test.ts` |
| `ThreatDashboardProvider.ts` | `ThreatDashboardProvider` | YES | `ThreatRemediationEngine.getDashboard()` | No | Yes | No | No | No | NO | None | `threatRemediation.test.ts` |
| `ThreatFalsePositiveTracker.ts` | `ThreatFalsePositiveTracker` | YES | `ThreatRemediationEngine.markFalsePositive/isFalsePositive` | No | Yes | No | No | No | NO | None | `threatRemediation.test.ts` |
| `ThreatApprovalManager.ts` | `ThreatApprovalManager` | YES | `ThreatRemediationEngine.createPlan()`, `ThreatDashboardProvider` | Partially | Yes | No | Partially (approve/reject) | No | NO | None | `threatRemediation.test.ts` |
| `ThreatQuarantineManager.ts` | `ThreatQuarantineManager` | YES | `ThreatRemediationEngine.getQuarantineSummary/Entry()`, `ThreatDashboardProvider` | Partially | Yes | No (dead methods) | Partially (quarantine exec) | No | NO | None | `threatRemediation.test.ts` |
| `ThreatRollbackManager.ts` | `ThreatRollbackManager` | YES | `ThreatDashboardProvider`, `ThreatRemediationReportGenerator` | Partially | Yes | No (dead methods) | Partially (rollback exec) | No | NO | None | `threatRemediation.test.ts` |
| `ThreatRestoreManager.ts` | `ThreatRestoreManager` | NO | NONE | Yes | No | YES (dead) | YES | No | YES | None | `threatRemediation.test.ts` |
| `ThreatDeletionManager.ts` | `ThreatDeletionManager` | NO | NONE | Yes | No | YES (dead) | YES | No | YES | None | `threatRemediation.test.ts` |
| `ThreatRecoveryProvider.ts` | `ThreatRecoveryProvider` | NO (from security-dashboard) | NONE (from security-dashboard) | Yes | Yes | No | No | No | YES (if dead methods removed) | None | `threatRemediation.test.ts` |
| `ThreatRemediationEvents.ts` | `remediationEventBus` | YES | `SecurityCenterService.onRemediationEvent()` | No | Yes | No | No | No | NO | None | `threatRemediation.test.ts` |
| `types.ts` | Types | YES | Multiple | No | N/A | N/A | N/A | No | NO (partially) | Remove types for deleted components | `threatRemediation.test.ts` |
| `index.ts` | Barrel exports | YES | Multiple | No | N/A | N/A | N/A | No | NO (partially) | Remove exports for deleted components | `threatRemediation.test.ts` |

### Frontend `security-dashboard/` directory

| File | Component | Production-reachable? | Status |
|------|-----------|---------------------|--------|
| `securityBackendService.ts` | RPC wrapper | YES (partially) | 6 dead methods to remove, 1 transitional to migrate |
| `SecurityCenterService.ts` | Service facade | YES | Read-only methods to preserve, quarantine migration needed |
| `SecurityCenterViewModel.ts` | ViewModel | YES | Read-only methods to preserve |
| `SecurityCenterPage.tsx` | Page component | YES | Uses canonical `useSecurityRemediationPlan` hook |
| `securityDataAdapter.ts` | Data adapter | YES | Active |
| `securityScanTypes.ts` | Types | YES | Active |

### Backend `security_remediation/__init__.py`

| RPC | Production-reachable? | Status |
|-----|----------------------|--------|
| `security.quarantine` | NO | Dead — safe to remove |
| `security.quarantine.restore` | NO | Dead — safe to remove |
| `security.quarantine.list` | YES (transitional) | Migrate to canonical, then remove |
| `security.quarantine.delete` | NO | Dead — safe to remove |
| `security.remediation.plan` | NO | Dead — safe to remove (replaced by `scan_core.security_remediation.plan`) |
| `security.remediation.execute` | NO | Dead — safe to remove |
| `security.remediation.rollback` | NO | Dead — safe to remove |
| `security.enableSmartScreen` | YES | ACTIVE — MUST NOT remove |
| `security.enableDefender` | YES | ACTIVE — MUST NOT remove |
| `security.enableFirewall` | YES | ACTIVE — MUST NOT remove |

### Backend `scan_core/security_remediation_adapter.py`

| Component | Status |
|-----------|--------|
| `SecurityRemediationAdapter` | ACTIVE — canonical adapter, MUST NOT modify |
| `SecurityActionMapping` | ACTIVE — canonical mapping |
| `SECURITY_ACTION_MAPPINGS` | ACTIVE — canonical mappings |
| `REMOVE_PERSISTENCE_TARGET_MAPPINGS` | ACTIVE — canonical mappings |

### Backend `scan_core_rpc/__init__.py`

| RPC | Status |
|-----|--------|
| `scan_core.security_remediation.plan` | ACTIVE — canonical planning RPC, MUST NOT modify |
| `scan_core.remediation.prepare` | ACTIVE — canonical, MUST NOT modify |
| `scan_core.remediation.validate` | ACTIVE — canonical, MUST NOT modify |
| `scan_core.remediation.execute` | ACTIVE — canonical, MUST NOT modify |
| `scan_core.remediation.cancel` | ACTIVE — canonical, MUST NOT modify |
| `scan_core.remediation.status` | ACTIVE — canonical, MUST NOT modify |
| `scan_core.remediation.rollback` | ACTIVE — canonical, MUST NOT modify |

---

## 11. Production-Reachable Components

The following components are production-reachable and MUST be preserved:

### Frontend

| Component | Location | Production callers |
|-----------|----------|-------------------|
| `ThreatRemediationEngine` (read-only methods) | `security-remediation/ThreatRemediationEngine.ts` | `SecurityCenterService` |
| `ThreatRemediationPlanner` | `security-remediation/ThreatRemediationPlanner.ts` | `ThreatRemediationEngine.createPlan()` |
| `ThreatSafetyValidator` | `security-remediation/ThreatSafetyValidator.ts` | `ThreatRemediationPlanner` |
| `ThreatRemediationPolicyManager` | `security-remediation/ThreatRemediationPolicy.ts` | `ThreatRemediationPlanner`, `ThreatRemediationEngine.updatePolicy()` |
| `ThreatConfigurationManager` | `security-remediation/ThreatConfiguration.ts` | `ThreatRemediationEngine` constructor |
| `ThreatRemediationHistory` | `security-remediation/ThreatRemediationHistory.ts` | `ThreatRemediationEngine.getHistory()` |
| `ThreatRemediationReportGenerator` | `security-remediation/ThreatRemediationReport.ts` | `ThreatRemediationEngine.generateReport()` |
| `ThreatDashboardProvider` | `security-remediation/ThreatDashboardProvider.ts` | `ThreatRemediationEngine.getDashboard()` |
| `ThreatFalsePositiveTracker` | `security-remediation/ThreatFalsePositiveTracker.ts` | `ThreatRemediationEngine.markFalsePositive/isFalsePositive` |
| `ThreatApprovalManager` | `security-remediation/ThreatApprovalManager.ts` | `ThreatRemediationEngine.createPlan()`, `ThreatDashboardProvider` |
| `ThreatQuarantineManager` | `security-remediation/ThreatQuarantineManager.ts` | `ThreatRemediationEngine.getQuarantineSummary/Entry()`, `ThreatDashboardProvider` |
| `ThreatRollbackManager` | `security-remediation/ThreatRollbackManager.ts` | `ThreatDashboardProvider`, `ThreatRemediationReportGenerator` |
| `remediationEventBus` | `security-remediation/ThreatRemediationEvents.ts` | `SecurityCenterService.onRemediationEvent()` |
| `SecurityCenterService` | `security-dashboard/SecurityCenterService.ts` | `SecurityCenterViewModel` |
| `SecurityCenterViewModel` | `security-dashboard/SecurityCenterViewModel.ts` | `SecurityCenterPage.tsx` |
| `SecurityCenterPage` | `security-dashboard/SecurityCenterPage.tsx` | Route |
| `securityBackendService` (active methods) | `security-dashboard/securityBackendService.ts` | `SecurityCenterService` |
| `securityDataAdapter` | `security-dashboard/securityDataAdapter.ts` | `SecurityCenterService` |

### Backend

| Component | Location | Production callers |
|-----------|----------|-------------------|
| `security.enableSmartScreen` | `security_remediation/__init__.py` | `dashboard.service.ts`, `ProtectionCenterPage.tsx`, `ProtectionCenterViewModel.ts` |
| `security.enableDefender` | `security_remediation/__init__.py` | `dashboard.service.ts`, `ProtectionCenterPage.tsx`, `ProtectionCenterViewModel.ts` |
| `security.enableFirewall` | `security_remediation/__init__.py` | `dashboard.service.ts`, `ProtectionCenterPage.tsx`, `ProtectionCenterViewModel.ts` |
| `security.quarantine.list` | `security_remediation/__init__.py` | `securityBackendService.listQuarantined()` → `SecurityCenterService.getQuarantineSummary()` (TRANSITIONAL) |
| `scan_core.security_remediation.plan` | `scan_core_rpc/__init__.py` | `useSecurityRemediationPlan` hook |
| `SecurityRemediationAdapter` | `scan_core/adapters/security_remediation_adapter.py` | `SecurityRemediationPlanBuilder` |
| `SecurityRemediationPlanBuilder` | `scan_core/adapters/security_remediation_plan_builder.py` | `scan_core.security_remediation.plan` RPC |

---

## 12. Dead Components

The following components have ZERO production callers and are safe to remove:

### Frontend dead classes

| Component | Location | Evidence |
|-----------|----------|---------|
| `ThreatRestoreManager` | `security-remediation/ThreatRestoreManager.ts` | Only used by dead `ThreatRemediationEngine` methods and tests |
| `ThreatDeletionManager` | `security-remediation/ThreatDeletionManager.ts` | Only used by dead `ThreatRemediationEngine` methods and tests |

### Frontend dead methods on `ThreatRemediationEngine`

| Method | Evidence |
|--------|---------|
| `executePlan()` | Not called from `SecurityCenterService` or any UI |
| `executeAction()` | Only called by `executePlan()` |
| `performAction()` | Only called by `executeAction()` |
| `performQuarantine()` | Only called by `performAction()` |
| `performRestore()` | Only called by `performAction()` |
| `performDelete()` | Only called by `performAction()` |
| `performDisableStartup()` | Only called by `performAction()` |
| `performDisableTask()` | Only called by `performAction()` |
| `performDisableExtension()` | Only called by `performAction()` |
| `performResetBrowser()` | Only called by `performAction()` |
| `performRemovePersistence()` | Only called by `performAction()` |
| `rollbackAction()` | Not called from `SecurityCenterService` or any UI |
| `restoreFromQuarantine()` | Removed from `SecurityCenterService` in SC-8C12 Phase 5 |
| `deleteFromQuarantine()` | Removed from `SecurityCenterService` in SC-8C12 Phase 5 |
| `approvePlan()` | Not called from `SecurityCenterService` or any UI |
| `rejectPlan()` | Not called from `SecurityCenterService` or any UI |
| `getApprovalRequest()` | Not called from `SecurityCenterService` or any UI |
| `getReport()` | Only used internally by `executePlan()` |
| `setTier()` | Not called from `SecurityCenterService` or any UI |
| `getRecoveryStatus()` | Not called from `SecurityCenterService` |
| `getRecoveryProviders()` | Not called from `SecurityCenterService` |
| `getRecoveryOptions()` | Not called from `SecurityCenterService` |
| `buildApprovalExplanation()` | Only called by `createPlan()` for dead approval requests |

### Frontend dead RPC wrapper methods

| Method | Location | Evidence |
|--------|----------|---------|
| `quarantineFile()` | `securityBackendService.ts` | Zero callers outside the file itself |
| `restoreQuarantined()` | `securityBackendService.ts` | Zero callers outside the file itself |
| `deleteQuarantined()` | `securityBackendService.ts` | Zero callers outside the file itself |
| `generateRemediationPlan()` | `securityBackendService.ts` | Zero callers outside the file itself |
| `executeRemediationPlan()` | `securityBackendService.ts` | Zero callers outside the file itself |
| `rollbackRemediation()` | `securityBackendService.ts` | Zero callers outside the file itself |

### Backend dead RPC handlers

| RPC | Location | Evidence |
|-----|----------|---------|
| `security.quarantine` | `security_remediation/__init__.py` | Zero production callers |
| `security.quarantine.restore` | `security_remediation/__init__.py` | Zero production callers |
| `security.quarantine.delete` | `security_remediation/__init__.py` | Zero production callers |
| `security.remediation.plan` | `security_remediation/__init__.py` | Zero production callers (replaced by `scan_core.security_remediation.plan`) |
| `security.remediation.execute` | `security_remediation/__init__.py` | Zero production callers |
| `security.remediation.rollback` | `security_remediation/__init__.py` | Zero production callers |

### Dead RPC constants

| Constant | Location | Evidence |
|----------|----------|---------|
| `SECURITY_QUARANTINE` | `packages/shared/src/rpc/index.ts` | Only used by dead `quarantineFile()` |
| `SECURITY_QUARANTINE_RESTORE` | `packages/shared/src/rpc/index.ts` | Only used by dead `restoreQuarantined()` |
| `SECURITY_QUARANTINE_DELETE` | `packages/shared/src/rpc/index.ts` | Only used by dead `deleteQuarantined()` |
| `SECURITY_REMEDIATION_PLAN` | `packages/shared/src/rpc/index.ts` | Only used by dead `generateRemediationPlan()` |
| `SECURITY_REMEDIATION_EXECUTE` | `packages/shared/src/rpc/index.ts` | Only used by dead `executeRemediationPlan()` |
| `SECURITY_REMEDIATION_ROLLBACK` | `packages/shared/src/rpc/index.ts` | Only used by dead `rollbackRemediation()` |

---

## 13. Transitional Components

| Component | Location | Status | Migration plan |
|-----------|----------|--------|----------------|
| `security.quarantine.list` RPC | `security_remediation/__init__.py` | Production-reachable, transitional | Migrate to `scan_core.security_remediation.quarantine_list`, then remove |
| `SECURITY_QUARANTINE_LIST` constant | `packages/shared/src/rpc/index.ts` | Production-reachable, transitional | Migrate to new canonical constant, then remove |
| `securityBackendService.listQuarantined()` | `securityBackendService.ts` | Production-reachable, transitional | Migrate to canonical method, then remove |
| `SecurityCenterService.getQuarantineSummary()` | `SecurityCenterService.ts` | Production-reachable | Update to use canonical RPC, retain fallback to frontend `ThreatQuarantineManager.getSummary()` |

---

## 14. Components to Preserve

### MUST preserve (production-reachable, active)

**Frontend `security-remediation/`:**
- `ThreatRemediationEngine` (refactored — read-only methods only)
- `ThreatRemediationPlanner`
- `ThreatSafetyValidator`
- `ThreatRemediationPolicyManager`
- `ThreatConfigurationManager`
- `ThreatRemediationHistory`
- `ThreatRemediationReportGenerator`
- `ThreatDashboardProvider`
- `ThreatFalsePositiveTracker`
- `ThreatApprovalManager`
- `ThreatQuarantineManager`
- `ThreatRollbackManager`
- `remediationEventBus`
- `types.ts` (refactored — remove types for deleted components)
- `index.ts` (refactored — remove exports for deleted components)

**Frontend `security-dashboard/`:**
- `SecurityCenterService` (refactored — update quarantine summary)
- `SecurityCenterViewModel`
- `SecurityCenterPage`
- `securityBackendService` (refactored — remove dead methods, update listQuarantined)
- `securityDataAdapter`
- `securityScanTypes.ts`

**Frontend `security-center/`:**
- All detection providers, `SecurityEngine`, `SecurityEvents`, etc. — UNCHANGED

**Frontend `security-investigation/`:**
- `ThreatInvestigationEngine`, `ThreatKnowledgeBase`, etc. — UNCHANGED

**Backend:**
- `security.enableSmartScreen` — ACTIVE
- `security.enableDefender` — ACTIVE
- `security.enableFirewall` — ACTIVE
- `scan_core.security_remediation.plan` — ACTIVE (canonical)
- `SecurityRemediationAdapter` — ACTIVE (canonical)
- `SecurityRemediationPlanBuilder` — ACTIVE (canonical)
- All `scan_core.remediation.*` RPCs — ACTIVE (canonical)
- All `scan_core` internals — FROZEN

---

## 15. Components to Remove

### Frontend

| Component | File | Action |
|-----------|------|--------|
| `ThreatRestoreManager` class | `security-remediation/ThreatRestoreManager.ts` | DELETE file |
| `ThreatDeletionManager` class | `security-remediation/ThreatDeletionManager.ts` | DELETE file |
| `RestoreResult` type export | `security-remediation/index.ts` | REMOVE export |
| `DeleteResult` type export | `security-remediation/index.ts` | REMOVE export |
| `ThreatRestoreManager` export | `security-remediation/index.ts` | REMOVE export |
| `ThreatDeletionManager` export | `security-remediation/index.ts` | REMOVE export |
| `ThreatRecoveryProvider` class | `security-remediation/ThreatRecoveryProvider.ts` | DELETE file (if dead methods removed from Engine) |
| `RecoveryOption` type export | `security-remediation/index.ts` | REMOVE export |
| `ThreatRecoveryProvider` export | `security-remediation/index.ts` | REMOVE export |
| Dead execution methods | `security-remediation/ThreatRemediationEngine.ts` | REMOVE methods |
| `quarantineFile()` | `securityBackendService.ts` | REMOVE method |
| `restoreQuarantined()` | `securityBackendService.ts` | REMOVE method |
| `deleteQuarantined()` | `securityBackendService.ts` | REMOVE method |
| `generateRemediationPlan()` | `securityBackendService.ts` | REMOVE method |
| `executeRemediationPlan()` | `securityBackendService.ts` | REMOVE method |
| `rollbackRemediation()` | `securityBackendService.ts` | REMOVE method |
| `QuarantineEntry` interface (backend type) | `securityBackendService.ts` | REMOVE if only used by dead methods |

### Backend

| Component | File | Action |
|-----------|------|--------|
| `quarantine_file()` function | `security_remediation/__init__.py` | REMOVE function + `@register` decorator |
| `restore_quarantined()` function | `security_remediation/__init__.py` | REMOVE function + `@register` decorator |
| `delete_quarantined()` function | `security_remediation/__init__.py` | REMOVE function + `@register` decorator |
| `generate_remediation_plan()` function | `security_remediation/__init__.py` | REMOVE function + `@register` decorator |
| `execute_remediation_plan()` function | `security_remediation/__init__.py` | REMOVE function + `@register` decorator |
| `rollback_remediation()` function | `security_remediation/__init__.py` | REMOVE function + `@register` decorator |
| `list_quarantined()` function | `security_remediation/__init__.py` | REMOVE AFTER canonical replacement is created and migrated |
| `_generate_quarantine_id()` helper | `security_remediation/__init__.py` | REMOVE if only used by deleted functions |

### RPC constants

| Constant | File | Action |
|----------|------|--------|
| `SECURITY_QUARANTINE` | `packages/shared/src/rpc/index.ts` | REMOVE |
| `SECURITY_QUARANTINE_RESTORE` | `packages/shared/src/rpc/index.ts` | REMOVE |
| `SECURITY_QUARANTINE_DELETE` | `packages/shared/src/rpc/index.ts` | REMOVE |
| `SECURITY_REMEDIATION_PLAN` | `packages/shared/src/rpc/index.ts` | REMOVE |
| `SECURITY_REMEDIATION_EXECUTE` | `packages/shared/src/rpc/index.ts` | REMOVE |
| `SECURITY_REMEDIATION_ROLLBACK` | `packages/shared/src/rpc/index.ts` | REMOVE |
| `SECURITY_QUARANTINE_LIST` | `packages/shared/src/rpc/index.ts` | REMOVE AFTER canonical replacement is created and migrated |

### Feature flags

| Flag | File | Action |
|------|------|--------|
| `SECURITY_QUARANTINE` | `packages/shared/src/featureFlags/index.ts` | EVALUATE — may need to remain for feature gating of canonical quarantine |

---

## 16. Components to Migrate

| Component | Current | Target | Migration step |
|-----------|---------|--------|----------------|
| `SecurityCenterService.getQuarantineSummary()` | Calls `securityBackendService.listQuarantined()` (legacy `security.quarantine.list`) | Call canonical `scan_core.security_remediation.quarantine_list` RPC | Create canonical RPC, update service method, retain frontend fallback |
| `securityBackendService.listQuarantined()` | Wraps `SECURITY_QUARANTINE_LIST` | Wrap new canonical constant | Update method, then remove after migration |

---

## 17. RPC Inventory

### RPCs to REMOVE (dead)

| RPC | Constant | Production callers | Safe to remove? |
|-----|----------|-------------------|-----------------|
| `security.quarantine` | `SECURITY_QUARANTINE` | NONE | YES |
| `security.quarantine.restore` | `SECURITY_QUARANTINE_RESTORE` | NONE | YES |
| `security.quarantine.delete` | `SECURITY_QUARANTINE_DELETE` | NONE | YES |
| `security.remediation.plan` | `SECURITY_REMEDIATION_PLAN` | NONE | YES |
| `security.remediation.execute` | `SECURITY_REMEDIATION_EXECUTE` | NONE | YES |
| `security.remediation.rollback` | `SECURITY_REMEDIATION_ROLLBACK` | NONE | YES |

### RPCs to MIGRATE (transitional)

| RPC | Constant | Production callers | Migration |
|-----|----------|-------------------|-----------|
| `security.quarantine.list` | `SECURITY_QUARANTINE_LIST` | `SecurityCenterService.getQuarantineSummary()` | Create `scan_core.security_remediation.quarantine_list`, migrate callers, then remove |

### RPCs to CREATE (canonical replacement)

| RPC | Constant | Purpose |
|-----|----------|---------|
| `scan_core.security_remediation.quarantine_list` | `SCAN_CORE_SECURITY_REMEDIATION_QUARANTINE_LIST` | Read-only quarantine list (replaces transitional `security.quarantine.list`) |

### RPCs to PRESERVE (active)

| RPC | Constant | Status |
|-----|----------|--------|
| `security.enableSmartScreen` | `SECURITY_ENABLE_SMARTSCREEN` | ACTIVE — MUST NOT remove |
| `security.enableDefender` | `SECURITY_ENABLE_DEFENDER` | ACTIVE — MUST NOT remove |
| `security.enableFirewall` | `SECURITY_ENABLE_FIREWALL` | ACTIVE — MUST NOT remove |
| `scan_core.security_remediation.plan` | `SCAN_CORE_SECURITY_REMEDIATION_PLAN` | ACTIVE — canonical |
| `scan_core.remediation.prepare` | `SCAN_CORE_REMEDIATION_PREPARE` | ACTIVE — canonical |
| `scan_core.remediation.validate` | `SCAN_CORE_REMEDIATION_VALIDATE` | ACTIVE — canonical |
| `scan_core.remediation.execute` | `SCAN_CORE_REMEDIATION_EXECUTE` | ACTIVE — canonical |
| `scan_core.remediation.cancel` | `SCAN_CORE_REMEDIATION_CANCEL` | ACTIVE — canonical |
| `scan_core.remediation.status` | `SCAN_CORE_REMEDIATION_STATUS` | ACTIVE — canonical |
| `scan_core.remediation.rollback` | `SCAN_CORE_REMEDIATION_ROLLBACK` | ACTIVE — canonical |

---

## 18. Quarantine Architecture

### Canonical quarantine model (SC-8C12, preserved)

```
quarantine action
→ ActionType.DELETE_FILE
→ backup_required = true
→ rollback_supported = true
→ BackupManager backup IS the quarantined copy
→ Canonical rollback (restore from backup) IS quarantine restore
```

This model is authoritative and MUST NOT change. SC-8C14 does NOT modify the quarantine architecture — it only cleans up the dead legacy quarantine execution infrastructure.

### Quarantine listing

Quarantine listing is READ-ONLY and must remain functional. The current implementation uses the transitional `security.quarantine.list` RPC, which reads from a manifest file at `_QUARANTINE_MANIFEST` (`%LOCALAPPDATA%\AVS Shield\Quarantine\manifest.json`).

**Migration plan:**
1. Create `scan_core.security_remediation.quarantine_list` RPC in `scan_core_rpc/__init__.py`
2. The new RPC reads from the same manifest file (preserving backward compatibility with existing quarantined items)
3. Add `SCAN_CORE_SECURITY_REMEDIATION_QUARANTINE_LIST` constant to `packages/shared/src/rpc/index.ts`
4. Update `securityBackendService.listQuarantined()` to use the new constant
5. Update `SecurityCenterService.getQuarantineSummary()` to use the updated method
6. Add regression tests for the new RPC
7. Verify the old RPC has zero production callers
8. Remove the old `security.quarantine.list` RPC handler
9. Remove the old `SECURITY_QUARANTINE_LIST` constant

### Quarantine persistence

The quarantine manifest at `%LOCALAPPDATA%\AVS Shield\Quarantine\manifest.json` is the authoritative quarantine persistence. This does NOT change in SC-8C14. The new canonical RPC reads from the same manifest.

---

## 19. False Positive Architecture

`ThreatFalsePositiveTracker` is a frontend-only in-memory false-positive tracking system. It is production-reachable through:
- `SecurityCenterService.markFalsePositive()` → `SecurityCenterViewModel.markFalsePositive()`
- `SecurityCenterService.isFalsePositive()`
- `ThreatDashboardProvider` (for dashboard summary)

**SC-8C14 impact:** NONE. `ThreatFalsePositiveTracker` is preserved unchanged.

---

## 20. Investigation Architecture

`ThreatInvestigationEngine` and all investigation components are in `security-investigation/` — a completely separate directory from `security-remediation/`.

**SC-8C14 impact:** NONE. Investigation architecture is preserved unchanged.

---

## 21. Reporting Architecture

`ThreatRemediationReportGenerator` generates remediation reports. It depends on `ThreatRollbackManager` for rollback data in reports.

Production path: `SecurityCenterPage.tsx` → `vm.generateRemediationReport()` → `SecurityCenterService.generateRemediationReport()` → `ThreatRemediationEngine.generateReport()` → `ThreatRemediationReportGenerator.generate()`

**SC-8C14 impact:** NONE. `ThreatRemediationReportGenerator` and `ThreatRollbackManager` are preserved unchanged.

---

## 22. Configuration Architecture

`ThreatConfigurationManager` manages remediation engine configuration. `ThreatRemediationPolicyManager` manages remediation policy.

Production path: `SecurityCenterService.getRemediationConfiguration()` → `ThreatRemediationEngine.getConfiguration()` → `ThreatConfigurationManager.get()`

**SC-8C14 impact:** NONE. Configuration architecture is preserved unchanged.

---

## 23. Target Architecture

### After SC-8C14

```
Security Center detection (SecurityEngine)
        ↓
Security Investigation (ThreatInvestigationEngine)
        ↓
ThreatRemediationEngine.createPlan()  ← frontend domain planning (candidate plan, READ-ONLY)
        ↓
SecurityCenterPage.tsx → securityActionToRpcPayload()
        ↓
useSecurityRemediationPlan → scan_core.security_remediation.plan RPC
        ↓
SecurityRemediationAdapter → SecurityRemediationPlanBuilder
        ↓
canonical ActionPlan (backend-authoritative)
        ↓
PlanReviewView → ResultsView
        ↓
scan_core.remediation.prepare
        ↓
scan_core.remediation.validate
        ↓
EXPLICIT USER APPROVAL
        ↓
scan_core.remediation.execute
        ↓
status polling (useResults)
        ↓
terminal state
        ↓
optional scan_core.remediation.rollback
```

**Quarantine listing:**
```
SecurityCenterService.getQuarantineSummary()
        ↓
securityBackendService.listQuarantined()
        ↓
scan_core.security_remediation.quarantine_list RPC  ← NEW canonical RPC
        ↓
read from quarantine manifest
        ↓
return summary
```

**What is removed:**
- All legacy destructive RPC handlers (`security.quarantine`, `security.quarantine.restore`, `security.quarantine.delete`, `security.remediation.plan`, `security.remediation.execute`, `security.remediation.rollback`)
- All legacy destructive frontend RPC wrapper methods
- All legacy execution methods on `ThreatRemediationEngine`
- Dead classes (`ThreatRestoreManager`, `ThreatDeletionManager`, `ThreatRecoveryProvider`)
- Transitional `security.quarantine.list` RPC (replaced by canonical)

**What remains:**
- `ThreatRemediationEngine` (refactored — read-only methods only)
- All read-only domain classes (`ThreatRemediationPlanner`, `ThreatSafetyValidator`, `ThreatRemediationPolicyManager`, `ThreatConfigurationManager`, `ThreatRemediationHistory`, `ThreatRemediationReportGenerator`, `ThreatDashboardProvider`, `ThreatFalsePositiveTracker`, `ThreatApprovalManager`, `ThreatQuarantineManager`, `ThreatRollbackManager`)
- `remediationEventBus`
- All active RPCs (`security.enableSmartScreen/Defender/Firewall`, all `scan_core.*` RPCs)
- New canonical `scan_core.security_remediation.quarantine_list` RPC

---

## 24. Security Invariants

The following invariants MUST remain true after SC-8C14:

1. **No automatic destructive execution** — no code path automatically performs destructive operations
2. **No automatic execution on mount/navigation** — no remediation executes on component mount or route change
3. **No automatic resume** — no execution resumes automatically after restart
4. **No automatic rollback** — rollback requires explicit user action
5. **Explicit approval required** — all destructive remediation requires explicit user approval via PlanReviewView
6. **Backend-generated ActionPlan IDs** — plan IDs are generated by the backend, not the frontend
7. **Backend-authoritative actionability** — actionability is determined by the backend, not the frontend
8. **SafetyGate enforcement** — `SafetyGate` validates all actions before execution
9. **RemediationCoordinator enforcement** — all execution goes through `RemediationCoordinator`
10. **Stale-plan rejection** — stale plans are rejected by the backend
11. **ExecutionLedger duplicate protection** — duplicate execution is prevented
12. **Backend persistence** — all remediation state persists through backend repositories
13. **No remediation state in localStorage** — no remediation state in browser localStorage
14. **No remediation state in sessionStorage** — no remediation state in browser sessionStorage
15. **No remediation state in IndexedDB** — no remediation state in browser IndexedDB
16. **Privacy-safe RPC responses** — RPC responses never expose canonical_path, asset_id, backup_location, quarantine_path, registry keys, browser profile paths, raw evidence, or internal target payloads
17. **No direct destructive frontend APIs** — frontend cannot directly perform destructive system operations
18. **No legacy production remediation execution path** — the legacy `ThreatRemediationEngine` execution path must NOT be reachable from production

**scan_core remains FROZEN** — no changes to `RemediationCoordinator`, `SafetyGate`, executors, `ActionType`, or persistence/recovery.

---

## 25. Privacy Requirements

1. The new `scan_core.security_remediation.quarantine_list` RPC must NOT expose:
   - `canonical_path`
   - `asset_id`
   - `backup_location`
   - `quarantine_path` (internal storage path)
   - Registry keys
   - Browser profile paths
   - Raw evidence
   - Internal target payloads

2. The RPC response should expose only:
   - `quarantineId` — public identifier
   - `originalPath` — user-visible original file path (for display)
   - `threatId` — threat reference
   - `reason` — quarantine reason
   - `quarantinedAt` — timestamp
   - `fileSize` — file size
   - `restored` — restoration status

3. No new data collection is introduced.

4. No telemetry is added.

---

## 26. Persistence Requirements

1. The quarantine manifest at `%LOCALAPPDATA%\AVS Shield\Quarantine\manifest.json` remains the authoritative quarantine persistence.

2. The new `scan_core.security_remediation.quarantine_list` RPC reads from the same manifest — no new persistence is created.

3. No new database tables, no new repositories, no new state files.

4. `scan_core` persistence (ActionPlanRepository, ExecutionRepository, ExecutionLedger, BackupRecord) remains FROZEN.

---

## 27. Concurrency Requirements

1. The new `scan_core.security_remediation.quarantine_list` RPC must use the existing `_quarantine_lock` threading lock for manifest access.

2. No new concurrency primitives are introduced.

3. `scan_core` concurrency (RemediationCoordinator locking, ExecutionLedger atomicity) remains FROZEN.

---

## 28. Backward Compatibility

1. **Existing quarantined items:** The new `scan_core.security_remediation.quarantine_list` RPC reads from the same manifest file, so existing quarantined items remain visible.

2. **Existing ActionPlans:** Canonical ActionPlans created by `scan_core.security_remediation.plan` are unaffected.

3. **Existing execution state:** `ExecutionRepository` and `ExecutionLedger` state is unaffected.

4. **Feature flags:** `SECURITY_QUARANTINE` and `SECURITY_REMEDIATE` feature flags remain unchanged — they gate the canonical remediation flow, not the legacy one.

5. **API contracts:** No active RPC contract changes. Dead RPCs are removed. One transitional RPC is replaced by a canonical equivalent with the same response shape.

6. **Frontend types:** `RemediationPlan`, `RemediationAction`, `QuarantineEntry`, `QuarantineSummary` types remain unchanged (they are used by active code).

---

## 29. Migration Strategy

### Phase 1: Legacy dependency inventory + safe migration planning

**Objective:** Verify all dead-code classifications, identify all test dependencies, plan the exact removal order.

**No production changes in Phase 1** — inspection and documentation only.

### Phase 2: Remove dead Security Center remediation execution infrastructure

**Objective:** Remove all dead backend RPCs, dead frontend methods, dead classes, dead RPC constants. Refactor `ThreatRemediationEngine` to remove dead methods. Update tests.

### Phase 3: Quarantine transitional migration + final audit

**Objective:** Create canonical `quarantine_list` RPC, migrate `SecurityCenterService.getQuarantineSummary()`, remove transitional `security.quarantine.list` RPC, run full regression validation, perform final security audit.

**See `SC8C14_PHASE_PLAN.md` for detailed phase breakdown.**

---

## 30. Testing Strategy

### Tests to update

| Test file | Changes |
|-----------|---------|
| `threatRemediation.test.ts` | Remove tests for `ThreatRestoreManager`, `ThreatDeletionManager`, `ThreatRecoveryProvider`, dead `ThreatRemediationEngine` methods (`executePlan`, `rollbackAction`, `approvePlan`, `rejectPlan`, `restoreFromQuarantine`, `deleteFromQuarantine`, etc.) |
| `securityDashboard.test.tsx` | No changes expected (does not reference legacy execution) |
| `securityRemediationPlan.test.ts` | No changes expected (tests canonical flow) |
| `test_security_remediation_integration.py` | No changes expected (tests canonical flow, negative assertions remain valid) |
| `test_security_remediation_adapter.py` | No changes expected (tests canonical adapter) |

### New tests to create

| Test file | Purpose |
|-----------|---------|
| `test_quarantine_list_rpc.py` (backend) | Test new `scan_core.security_remediation.quarantine_list` RPC |
| Update `securityRemediationPlan.test.ts` or new test | Test updated `SecurityCenterService.getQuarantineSummary()` with canonical RPC |

### Regression tests

- Full frontend test suite must pass (8,121+ tests across 120+ files)
- Full backend test suite must pass (971+ tests)
- No new test failures
- No flaky tests introduced

---

## 31. Validation Strategy

### Validation commands

**Frontend:**
```bash
cd apps/pc-optimizer && npm test
```

**Backend:**
```bash
cd backend && python -m pytest
```

**Type checking:**
```bash
cd apps/pc-optimizer && npm run typecheck
```

**Linting:**
```bash
cd apps/pc-optimizer && npm run lint
```

### Security validation

1. Grep for any remaining references to deleted RPCs — must return ZERO
2. Grep for any remaining references to deleted classes — must return ZERO
3. Grep for any remaining references to deleted methods — must return ZERO
4. Verify `security.enableSmartScreen/Defender/Firewall` are still registered and callable
5. Verify `scan_core.security_remediation.plan` is still registered and callable
6. Verify `scan_core.security_remediation.quarantine_list` is registered and callable
7. Verify `SecurityCenterService.getQuarantineSummary()` works with canonical RPC
8. Verify no remediation state in localStorage/sessionStorage/IndexedDB
9. Verify no automatic destructive execution
10. Verify no legacy execution path reachable from production UI

---

## 32. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Test breakage from removed classes | HIGH | LOW | Update `threatRemediation.test.ts` to remove tests for deleted components |
| `ThreatDashboardProvider` breaks if dependencies are incorrectly removed | MEDIUM | HIGH | Preserve `ThreatApprovalManager`, `ThreatQuarantineManager`, `ThreatRollbackManager`, `ThreatFalsePositiveTracker` |
| `ThreatRemediationReportGenerator` breaks if `ThreatRollbackManager` is removed | MEDIUM | HIGH | Preserve `ThreatRollbackManager` |
| Quarantine list migration breaks existing quarantine visibility | LOW | HIGH | New RPC reads from same manifest; test with existing quarantined items |
| `security.quarantine.list` removed before migration is complete | LOW | HIGH | Remove ONLY after canonical replacement is verified and all callers migrated |
| Accidental removal of `security.enableSmartScreen/Defender/Firewall` | LOW | HIGH | Explicit preservation list in specification; verify with grep after changes |
| `ThreatRecoveryProvider` removal breaks `ThreatRemediationEngine` constructor | MEDIUM | MEDIUM | Refactor constructor to remove `recoveryProvider` initialization |
| Dead `RollbackData` type removal breaks `types.ts` | LOW | LOW | Only remove types that are exclusively used by deleted components |

---

## 33. Rollback Strategy

### Per-phase rollback

Each phase is independently rollbackable via git revert.

### Full rollback

If SC-8C14 causes unacceptable regression:
1. `git revert` the SC-8C14 commits
2. Run full test suite to verify restoration
3. The dead code returns — no data loss, no persistence impact

### Quarantine list migration rollback

If the canonical `quarantine_list` RPC fails:
1. Revert `SecurityCenterService.getQuarantineSummary()` to use `securityBackendService.listQuarantined()` with the old constant
2. Re-add `security.quarantine.list` RPC handler
3. Re-add `SECURITY_QUARANTINE_LIST` constant

The new RPC reads from the same manifest, so no data migration is needed for rollback.

---

## 34. Definition of Done

SC-8C14 is complete when ALL of the following are true:

1. **Obsolete infrastructure removed:**
   - 6 dead backend RPC handlers removed
   - 6 dead frontend RPC wrapper methods removed
   - 6 dead RPC constants removed
   - Dead classes removed (`ThreatRestoreManager`, `ThreatDeletionManager`, `ThreatRecoveryProvider`)
   - Dead execution methods removed from `ThreatRemediationEngine`
   - Barrel exports updated
   - Types cleaned up

2. **Transitional quarantine migrated:**
   - Canonical `scan_core.security_remediation.quarantine_list` RPC created
   - `SecurityCenterService.getQuarantineSummary()` migrated to canonical RPC
   - Transitional `security.quarantine.list` RPC removed
   - Transitional `SECURITY_QUARANTINE_LIST` constant removed
   - Regression tests added for new RPC

3. **Legitimate functionality intact:**
   - All read-only Security Center functionality works (plans, quarantine summary, reports, history, dashboard, false positives, configuration)
   - `security.enableSmartScreen/Defender/Firewall` remain active and callable
   - Canonical `scan_core.security_remediation.plan` RPC works
   - Canonical `scan_core.remediation.*` flow works
   - `PlanReviewView` → `ResultsView` workflow works
   - Quarantine summary displays correctly

4. **Canonical scan_core is the ONLY production remediation execution path:**
   - No legacy execution path reachable from production UI
   - No dead execution methods remain on `ThreatRemediationEngine`

5. **Security/privacy invariants intact:**
   - All 18 invariants in §24 verified
   - `scan_core` internals unchanged
   - No new security violations introduced

6. **All validation passes:**
   - Full frontend test suite passes
   - Full backend test suite passes
   - Type checking passes
   - Linting passes
   - Security grep validation passes (zero references to deleted components)

---

## 35. SC-8C15 Boundary

**SC-8C15 is NOT started.**

No SC-8C15 specification is created. No SC-8C15 requirements are invented. No SC-8C15 implementation is started.

License Activation is NOT part of SC-8C14 and is NOT part of SC-8C15. License Activation may be considered as a future independent project, but no work is started on it.

If the Product Owner wishes to pursue License Activation or any other direction after SC-8C14, a separate product decision and specification process is required.

---

**End of SC-8C14 Specification**
