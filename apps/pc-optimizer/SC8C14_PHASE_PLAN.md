# SC-8C14 Phase Plan — Security Center Legacy Backend Cleanup

## Overview

SC-8C14 is implemented in **3 phases**. The minimum safe phase count is 3 because:

1. Phase 1 (inventory) ensures all dead-code classifications are verified before any removal
2. Phase 2 (dead code removal) is the bulk of the cleanup work
3. Phase 3 (quarantine migration + audit) handles the transitional RPC replacement and final validation

A 2-phase plan would combine dead code removal with quarantine migration, increasing risk. A 4-phase plan would add unnecessary overhead. 3 phases is the minimum safe count.

**No implementation is started in this document.** This is a specification-only phase plan.

---

## Phase 1 — Legacy Dependency Inventory + Safe Migration Planning

### Objective

Verify all dead-code classifications from the SC-8C14 specification against the current repository state. Identify all test dependencies. Document the exact removal order. No production changes.

### Files/components inspected

| File | Purpose |
|------|---------|
| `apps/pc-optimizer/src/features/security-remediation/ThreatRemediationEngine.ts` | Verify dead methods list |
| `apps/pc-optimizer/src/features/security-remediation/ThreatRestoreManager.ts` | Verify zero production callers |
| `apps/pc-optimizer/src/features/security-remediation/ThreatDeletionManager.ts` | Verify zero production callers |
| `apps/pc-optimizer/src/features/security-remediation/ThreatRecoveryProvider.ts` | Verify zero production callers from security-dashboard |
| `apps/pc-optimizer/src/features/security-remediation/index.ts` | Verify barrel exports |
| `apps/pc-optimizer/src/features/security-remediation/types.ts` | Identify types only used by dead components |
| `apps/pc-optimizer/src/features/security-remediation/__tests__/threatRemediation.test.ts` | Identify all tests for dead components |
| `apps/pc-optimizer/src/features/security-dashboard/securityBackendService.ts` | Verify dead methods list |
| `apps/pc-optimizer/src/features/security-dashboard/SecurityCenterService.ts` | Verify active methods list |
| `apps/pc-optimizer/src/features/security-dashboard/SecurityCenterViewModel.ts` | Verify active methods list |
| `apps/pc-optimizer/src/features/security-dashboard/SecurityCenterPage.tsx` | Verify no legacy execution references |
| `backend/src/avs_backend/security_remediation/__init__.py` | Verify dead RPCs and active RPCs |
| `backend/src/avs_backend/scan_core_rpc/__init__.py` | Verify canonical RPCs |
| `backend/src/avs_backend/scan_core/adapters/security_remediation_adapter.py` | Verify canonical adapter (FROZEN) |
| `backend/tests/test_security_remediation_integration.py` | Verify negative assertions |
| `backend/tests/test_security_remediation_adapter.py` | Verify negative assertions |
| `packages/shared/src/rpc/index.ts` | Verify dead constants list |
| `packages/shared/src/featureFlags/index.ts` | Verify feature flags |

### Files expected to change

**NONE in Phase 1.** This is inspection and documentation only.

### Backend work

NONE

### Frontend work

NONE

### RPC work

NONE

### Persistence work

NONE

### Tests

NONE — no test changes in Phase 1

### Security checks

1. Verify `security.enableSmartScreen/Defender/Firewall` are still registered and have production callers
2. Verify `scan_core.security_remediation.plan` is still registered
3. Verify no legacy execution path is reachable from production UI
4. Verify all 18 security invariants from §24 of the specification

### Acceptance criteria

1. All dead-code classifications verified against current source code
2. All test dependencies identified and documented
3. Removal order documented
4. No false positives (no active code classified as dead)
5. No false negatives (no dead code classified as active)
6. Inventory report created (optional — may be a phase 1 report or inline in phase 2)

### Validation commands

```bash
# Verify no production callers for dead methods
grep -r "securityBackendService\.\(quarantineFile\|restoreQuarantined\|deleteQuarantined\|generateRemediationPlan\|executeRemediationPlan\|rollbackRemediation\)" apps/pc-optimizer/src/
# Expected: ZERO matches outside securityBackendService.ts

# Verify active RPCs still have callers
grep -r "enableSmartScreen\|enableDefender\|enableFirewall" apps/pc-optimizer/src/
# Expected: matches in dashboard.service.ts, ProtectionCenterPage.tsx, ProtectionCenterViewModel.ts

# Verify ThreatRestoreManager has no production callers
grep -r "ThreatRestoreManager" apps/pc-optimizer/src/ --include="*.ts" --include="*.tsx" | grep -v "__tests__" | grep -v "ThreatRemediationEngine.ts" | grep -v "index.ts" | grep -v "ThreatRestoreManager.ts"
# Expected: ZERO matches

# Verify ThreatDeletionManager has no production callers
grep -r "ThreatDeletionManager" apps/pc-optimizer/src/ --include="*.ts" --include="*.tsx" | grep -v "__tests__" | grep -v "ThreatRemediationEngine.ts" | grep -v "index.ts" | grep -v "ThreatDeletionManager.ts"
# Expected: ZERO matches
```

### Risks

| Risk | Mitigation |
|------|------------|
| Dead-code classification is wrong | Comprehensive grep verification in Phase 1 before any removal |
| Hidden dynamic imports | Search for `lazy()`, `import()`, and string-based references |
| Test-only code is classified as production | Separate test imports from production imports in analysis |

### Rollback strategy

No rollback needed — Phase 1 makes no changes.

### Explicit boundary for Phase 2

Phase 1 does NOT remove any code. Phase 2 begins the actual removal of dead backend RPCs, dead frontend methods, dead classes, and dead RPC constants, plus refactoring `ThreatRemediationEngine`.

---

## Phase 2 — Remove Dead Security Center Remediation Execution Infrastructure

### Objective

Remove all dead backend RPC handlers, dead frontend RPC wrapper methods, dead frontend classes, dead RPC constants, and dead execution methods on `ThreatRemediationEngine`. Update barrel exports, types, and tests.

### Files/components inspected

All files from Phase 1 inventory.

### Files expected to change

#### Backend

| File | Change |
|------|--------|
| `backend/src/avs_backend/security_remediation/__init__.py` | Remove `quarantine_file()`, `restore_quarantined()`, `delete_quarantined()`, `generate_remediation_plan()`, `execute_remediation_plan()`, `rollback_remediation()` functions and their `@register` decorators. Remove `_generate_quarantine_id()` if only used by deleted functions. **DO NOT remove** `list_quarantined()`, `enable_smartscreen()`, `enable_defender()`, `enable_firewall()`. |

#### Frontend

| File | Change |
|------|--------|
| `apps/pc-optimizer/src/features/security-remediation/ThreatRemediationEngine.ts` | Remove dead execution methods: `executePlan()`, `executeAction()`, `performAction()`, `performQuarantine()`, `performRestore()`, `performDelete()`, `performDisableStartup()`, `performDisableTask()`, `performDisableExtension()`, `performResetBrowser()`, `performRemovePersistence()`, `rollbackAction()`, `restoreFromQuarantine()`, `deleteFromQuarantine()`, `approvePlan()`, `rejectPlan()`, `getApprovalRequest()`, `getReport()`, `setTier()`, `getRecoveryStatus()`, `getRecoveryProviders()`, `getRecoveryOptions()`, `buildApprovalExplanation()`. Remove imports of `ThreatRestoreManager`, `ThreatDeletionManager`, `ThreatRecoveryProvider`. Remove `restoreManager`, `deletionManager`, `recoveryProvider` fields and constructor initialization. **PRESERVE** all read-only methods: `createPlan()`, `getPlan()`, `getAllPlans()`, `getQuarantineEntry()`, `getQuarantineSummary()`, `markFalsePositive()`, `isFalsePositive()`, `generateReport()`, `getHistory()`, `getDashboard()`, `getConfiguration()`, `updatePolicy()`, `clear()`. |
| `apps/pc-optimizer/src/features/security-remediation/ThreatRestoreManager.ts` | DELETE file |
| `apps/pc-optimizer/src/features/security-remediation/ThreatDeletionManager.ts` | DELETE file |
| `apps/pc-optimizer/src/features/security-remediation/ThreatRecoveryProvider.ts` | DELETE file |
| `apps/pc-optimizer/src/features/security-remediation/index.ts` | Remove exports: `ThreatRestoreManager`, `RestoreResult`, `ThreatDeletionManager`, `DeleteResult`, `ThreatRecoveryProvider`, `RecoveryOption` |
| `apps/pc-optimizer/src/features/security-remediation/types.ts` | Remove types exclusively used by deleted components: `RollbackData` (if only used by dead `performAction` methods), `RecoveryOption` (if defined here). **PRESERVE** types used by active code: `RemediationPlan`, `RemediationAction`, `RemediationReport`, `RemediationConfiguration`, `RemediationPolicy`, `RemediationTier`, `FalsePositiveExclusionType`, `QuarantineEntry`, `QuarantineSummary`, `ApprovalRequest`, `RemediationDashboardData`, `RemediationHistoryData` |
| `apps/pc-optimizer/src/features/security-dashboard/securityBackendService.ts` | Remove methods: `quarantineFile()`, `restoreQuarantined()`, `deleteQuarantined()`, `generateRemediationPlan()`, `executeRemediationPlan()`, `rollbackRemediation()`. Remove `QuarantineEntry` interface if only used by dead methods. **PRESERVE** `listQuarantined()` (migrated in Phase 3). |

#### Shared

| File | Change |
|------|--------|
| `packages/shared/src/rpc/index.ts` | Remove constants: `SECURITY_QUARANTINE`, `SECURITY_QUARANTINE_RESTORE`, `SECURITY_QUARANTINE_DELETE`, `SECURITY_REMEDIATION_PLAN`, `SECURITY_REMEDIATION_EXECUTE`, `SECURITY_REMEDIATION_ROLLBACK`. **DO NOT remove** `SECURITY_QUARANTINE_LIST` (migrated in Phase 3). **DO NOT remove** `SECURITY_ENABLE_SMARTSCREEN`, `SECURITY_ENABLE_DEFENDER`, `SECURITY_ENABLE_FIREWALL`. |

### Files to delete

| File | Reason |
|------|--------|
| `apps/pc-optimizer/src/features/security-remediation/ThreatRestoreManager.ts` | Dead — zero production callers |
| `apps/pc-optimizer/src/features/security-remediation/ThreatDeletionManager.ts` | Dead — zero production callers |
| `apps/pc-optimizer/src/features/security-remediation/ThreatRecoveryProvider.ts` | Dead — zero production callers from security-dashboard |

### Files that MUST remain

| File | Reason |
|------|--------|
| `apps/pc-optimizer/src/features/security-remediation/ThreatRemediationEngine.ts` | Active (read-only methods) — refactored, not deleted |
| `apps/pc-optimizer/src/features/security-remediation/ThreatRemediationPlanner.ts` | Active — production-reachable |
| `apps/pc-optimizer/src/features/security-remediation/ThreatSafetyValidator.ts` | Active — production-reachable (transitive) |
| `apps/pc-optimizer/src/features/security-remediation/ThreatRemediationPolicy.ts` | Active — production-reachable (transitive) |
| `apps/pc-optimizer/src/features/security-remediation/ThreatConfiguration.ts` | Active — production-reachable (transitive) |
| `apps/pc-optimizer/src/features/security-remediation/ThreatRemediationHistory.ts` | Active — production-reachable |
| `apps/pc-optimizer/src/features/security-remediation/ThreatRemediationReport.ts` | Active — production-reachable |
| `apps/pc-optimizer/src/features/security-remediation/ThreatDashboardProvider.ts` | Active — production-reachable |
| `apps/pc-optimizer/src/features/security-remediation/ThreatFalsePositiveTracker.ts` | Active — production-reachable |
| `apps/pc-optimizer/src/features/security-remediation/ThreatApprovalManager.ts` | Active — production-reachable |
| `apps/pc-optimizer/src/features/security-remediation/ThreatQuarantineManager.ts` | Active — production-reachable |
| `apps/pc-optimizer/src/features/security-remediation/ThreatRollbackManager.ts` | Active — production-reachable |
| `apps/pc-optimizer/src/features/security-remediation/ThreatRemediationEvents.ts` | Active — production-reachable |
| `apps/pc-optimizer/src/features/security-remediation/types.ts` | Active — refactored, not deleted |
| `apps/pc-optimizer/src/features/security-remediation/index.ts` | Active — refactored, not deleted |
| `apps/pc-optimizer/src/features/security-dashboard/SecurityCenterService.ts` | Active — refactored in Phase 3 |
| `apps/pc-optimizer/src/features/security-dashboard/SecurityCenterViewModel.ts` | Active — unchanged |
| `apps/pc-optimizer/src/features/security-dashboard/SecurityCenterPage.tsx` | Active — unchanged |
| `apps/pc-optimizer/src/features/security-dashboard/securityBackendService.ts` | Active — refactored |
| `backend/src/avs_backend/security_remediation/__init__.py` | Active — refactored (dead RPCs removed, active RPCs preserved) |
| `backend/src/avs_backend/scan_core_rpc/__init__.py` | Active — FROZEN (no changes) |
| `backend/src/avs_backend/scan_core/adapters/security_remediation_adapter.py` | Active — FROZEN (no changes) |

### Dependencies

- Phase 1 inventory completed
- All dead-code classifications verified

### Migration steps

1. Delete `ThreatRestoreManager.ts`, `ThreatDeletionManager.ts`, `ThreatRecoveryProvider.ts`
2. Refactor `ThreatRemediationEngine.ts`:
   - Remove imports of deleted classes
   - Remove `restoreManager`, `deletionManager`, `recoveryProvider` fields
   - Remove constructor initialization of deleted managers
   - Remove all dead execution methods
   - Remove `buildApprovalExplanation()` (only used by dead approval flow)
   - Update `clear()` to remove references to deleted managers
   - Preserve all read-only methods
3. Update `index.ts` barrel exports
4. Update `types.ts` to remove types only used by deleted components
5. Remove dead methods from `securityBackendService.ts`
6. Remove dead RPC constants from `packages/shared/src/rpc/index.ts`
7. Remove dead RPC handlers from `backend/src/avs_backend/security_remediation/__init__.py`
8. Update `threatRemediation.test.ts`:
   - Remove `ThreatRestoreManager` test block
   - Remove `ThreatDeletionManager` test block
   - Remove `ThreatRollbackManager` test block (if testing dead methods only — PRESERVE if testing active functionality)
   - Remove `ThreatApprovalManager` test block (if testing dead methods only — PRESERVE if testing active functionality)
   - Remove dead `ThreatRemediationEngine` execution method tests
   - PRESERVE tests for active read-only methods
9. Run full test suite
10. Fix any compilation errors from missing imports

### Tests

| Test file | Changes |
|-----------|---------|
| `threatRemediation.test.ts` | Remove tests for deleted classes and dead methods. Preserve tests for active read-only functionality. |
| `securityDashboard.test.tsx` | No changes expected |
| `securityRemediationPlan.test.ts` | No changes expected |
| `test_security_remediation_integration.py` | No changes expected |
| `test_security_remediation_adapter.py` | No changes expected |

### Security checks

1. Verify `security.enableSmartScreen/Defender/Firewall` are still registered and callable
2. Verify `scan_core.security_remediation.plan` is still registered and callable
3. Verify no legacy execution path is reachable from production UI
4. Verify `ThreatRemediationEngine` read-only methods still work
5. Verify `ThreatDashboardProvider` still works (depends on preserved managers)
6. Verify `ThreatRemediationReportGenerator` still works (depends on `ThreatRollbackManager`)
7. Verify all 18 security invariants from §24 of the specification

### Acceptance criteria

1. All dead backend RPC handlers removed
2. All dead frontend RPC wrapper methods removed
3. All dead RPC constants removed
4. Dead classes deleted (`ThreatRestoreManager`, `ThreatDeletionManager`, `ThreatRecoveryProvider`)
5. `ThreatRemediationEngine` refactored — dead methods removed, read-only methods preserved
6. Barrel exports updated
7. Types cleaned up
8. Tests updated — tests for deleted components removed, tests for active components preserved
9. Full frontend test suite passes
10. Full backend test suite passes
11. Type checking passes
12. Linting passes
13. `security.enableSmartScreen/Defender/Firewall` remain active and callable
14. `scan_core.security_remediation.plan` remains active and callable
15. `security.quarantine.list` remains active (migrated in Phase 3)
16. All read-only Security Center functionality works

### Validation commands

```bash
# Frontend tests
cd apps/pc-optimizer && npm test

# Backend tests
cd backend && python -m pytest

# Type checking
cd apps/pc-optimizer && npm run typecheck

# Linting
cd apps/pc-optimizer && npm run lint

# Verify no references to deleted classes
grep -r "ThreatRestoreManager\|ThreatDeletionManager\|ThreatRecoveryProvider" apps/pc-optimizer/src/
# Expected: ZERO matches

# Verify no references to deleted RPC constants
grep -r "SECURITY_QUARANTINE\b\|SECURITY_QUARANTINE_RESTORE\|SECURITY_QUARANTINE_DELETE\|SECURITY_REMEDIATION_PLAN\b\|SECURITY_REMEDIATION_EXECUTE\|SECURITY_REMEDIATION_ROLLBACK" packages/shared/src/ apps/pc-optimizer/src/ backend/src/
# Expected: ZERO matches (SECURITY_QUARANTINE_LIST is preserved for Phase 3)

# Verify active RPCs still present
grep -r "SECURITY_ENABLE_SMARTSCREEN\|SECURITY_ENABLE_DEFENDER\|SECURITY_ENABLE_FIREWALL" packages/shared/src/
# Expected: 3 matches

# Verify active RPCs still have callers
grep -r "enableSmartScreen\|enableDefender\|enableFirewall" apps/pc-optimizer/src/
# Expected: matches in dashboard.service.ts, ProtectionCenterPage.tsx, ProtectionCenterViewModel.ts

# Verify dead methods removed from ThreatRemediationEngine
grep -n "executePlan\|rollbackAction\|approvePlan\|rejectPlan\|restoreFromQuarantine\|deleteFromQuarantine" apps/pc-optimizer/src/features/security-remediation/ThreatRemediationEngine.ts
# Expected: ZERO matches
```

### Risks

| Risk | Mitigation |
|------|------------|
| `ThreatDashboardProvider` breaks if dependencies are incorrectly removed | Preserve `ThreatApprovalManager`, `ThreatQuarantineManager`, `ThreatRollbackManager`, `ThreatFalsePositiveTracker` |
| `ThreatRemediationReportGenerator` breaks if `ThreatRollbackManager` is removed | Preserve `ThreatRollbackManager` |
| `ThreatRemediationEngine` constructor breaks when removing manager initialization | Carefully refactor constructor — remove only `restoreManager`, `deletionManager`, `recoveryProvider` |
| Test breakage from removed classes | Update `threatRemediation.test.ts` — remove tests for deleted components, preserve tests for active components |
| `RollbackData` type removal breaks active code | Only remove if exclusively used by dead `performAction` methods — verify before removing |
| Missing import errors after deletion | Run type checking and fix all import errors |

### Rollback strategy

1. `git revert` the Phase 2 commit
2. Run full test suite to verify restoration
3. Dead code returns — no data loss, no persistence impact

### Explicit boundary for Phase 3

Phase 2 does NOT touch the transitional `security.quarantine.list` RPC or `SecurityCenterService.getQuarantineSummary()`. Phase 3 handles the quarantine list migration and final audit.

---

## Phase 3 — Quarantine Transitional Migration + Final Audit

### Objective

Create the canonical `scan_core.security_remediation.quarantine_list` RPC, migrate `SecurityCenterService.getQuarantineSummary()` to use it, remove the transitional `security.quarantine.list` RPC, and perform a final security/architecture audit.

### Files/components inspected

| File | Purpose |
|------|---------|
| `backend/src/avs_backend/security_remediation/__init__.py` | Inspect `list_quarantined()` for reuse |
| `backend/src/avs_backend/scan_core_rpc/__init__.py` | Inspect canonical RPC registration pattern |
| `apps/pc-optimizer/src/features/security-dashboard/SecurityCenterService.ts` | Inspect `getQuarantineSummary()` |
| `apps/pc-optimizer/src/features/security-dashboard/securityBackendService.ts` | Inspect `listQuarantined()` |
| `packages/shared/src/rpc/index.ts` | Inspect canonical RPC constant pattern |

### Files expected to change

#### Backend

| File | Change |
|------|--------|
| `backend/src/avs_backend/scan_core_rpc/__init__.py` | Add `scan_core.security_remediation.quarantine_list` RPC handler. The handler reads from the same quarantine manifest as the legacy `list_quarantined()`. Privacy-safe response (no internal paths exposed beyond what is needed for display). |
| `backend/src/avs_backend/security_remediation/__init__.py` | Remove `list_quarantined()` function and `@register("security.quarantine.list")` decorator AFTER canonical replacement is verified. **DO NOT remove** `enable_smartscreen()`, `enable_defender()`, `enable_firewall()`. |

#### Frontend

| File | Change |
|------|--------|
| `packages/shared/src/rpc/index.ts` | Add `SCAN_CORE_SECURITY_REMEDIATION_QUARANTINE_LIST: 'scan_core.security_remediation.quarantine_list'` constant. Remove `SECURITY_QUARANTINE_LIST` AFTER migration is verified. |
| `apps/pc-optimizer/src/features/security-dashboard/securityBackendService.ts` | Update `listQuarantined()` to use `SCAN_CORE_SECURITY_REMEDIATION_QUARANTINE_LIST` constant. |
| `apps/pc-optimizer/src/features/security-dashboard/SecurityCenterService.ts` | `getQuarantineSummary()` continues to call `securityBackendService.listQuarantined()` — no change needed (the service method wraps the RPC, and the RPC constant change is transparent). |

#### Shared

| File | Change |
|------|--------|
| `packages/shared/src/rpc/index.ts` | Add new canonical constant, remove old transitional constant after migration |

### Files to delete

NONE — no files are deleted in Phase 3. The `list_quarantined()` function is removed from `security_remediation/__init__.py` but the file itself remains (it still contains `enable_smartscreen()`, `enable_defender()`, `enable_firewall()`).

### Files that MUST remain

| File | Reason |
|------|--------|
| `backend/src/avs_backend/security_remediation/__init__.py` | Still contains active `enable_smartscreen()`, `enable_defender()`, `enable_firewall()` |
| `apps/pc-optimizer/src/features/security-dashboard/SecurityCenterService.ts` | Active — `getQuarantineSummary()` preserved |
| `apps/pc-optimizer/src/features/security-dashboard/securityBackendService.ts` | Active — `listQuarantined()` updated, not deleted |

### Dependencies

- Phase 2 completed (dead code removed)
- Full test suite passing after Phase 2

### Migration steps

1. Add `SCAN_CORE_SECURITY_REMEDIATION_QUARANTINE_LIST` constant to `packages/shared/src/rpc/index.ts`
2. Implement `scan_core.security_remediation.quarantine_list` RPC handler in `scan_core_rpc/__init__.py`:
   - Read from the same quarantine manifest (`_QUARANTINE_MANIFEST`)
   - Use the same `_quarantine_lock` threading lock
   - Return privacy-safe response: `items`, `count`, `totalItems`, `capturedAt`
   - Filter out restored items (same as legacy `list_quarantined()`)
3. Update `securityBackendService.listQuarantined()` to use `SCAN_CORE_SECURITY_REMEDIATION_QUARANTINE_LIST` constant
4. Add backend test for new `scan_core.security_remediation.quarantine_list` RPC
5. Run full test suite — verify `SecurityCenterService.getQuarantineSummary()` works with canonical RPC
6. Verify the old `security.quarantine.list` RPC has zero production callers (after `listQuarantined()` is updated)
7. Remove `list_quarantined()` function and `@register("security.quarantine.list")` decorator from `security_remediation/__init__.py`
8. Remove `SECURITY_QUARANTINE_LIST` constant from `packages/shared/src/rpc/index.ts`
9. Run full test suite again
10. Perform final security audit

### Tests

| Test file | Changes |
|-----------|---------|
| `test_quarantine_list_rpc.py` (NEW backend test) | Test new `scan_core.security_remediation.quarantine_list` RPC: empty manifest, items present, restored items filtered, thread safety |
| `test_security_remediation_integration.py` | Update negative assertions if needed (the test asserts `security.quarantine` not in source — update to also assert `security.quarantine.list` not in source after removal) |
| `securityRemediationPlan.test.ts` | No changes expected |
| `securityDashboard.test.tsx` | No changes expected |

### Security checks

1. Verify `scan_core.security_remediation.quarantine_list` RPC is registered and callable
2. Verify `SecurityCenterService.getQuarantineSummary()` works with canonical RPC
3. Verify `security.quarantine.list` RPC is removed and has zero callers
4. Verify `security.enableSmartScreen/Defender/Firewall` are still registered and callable
5. Verify `scan_core.security_remediation.plan` is still registered and callable
6. Verify no remediation state in localStorage/sessionStorage/IndexedDB
7. Verify no automatic destructive execution
8. Verify no legacy execution path reachable from production UI
9. Verify all 18 security invariants from §24 of the specification
10. Verify privacy-safe RPC response (no internal paths exposed)
11. Verify `scan_core` internals are unchanged (FROZEN)

### Acceptance criteria

1. `scan_core.security_remediation.quarantine_list` RPC created and registered
2. `SecurityCenterService.getQuarantineSummary()` uses canonical RPC
3. Transitional `security.quarantine.list` RPC removed
4. Transitional `SECURITY_QUARANTINE_LIST` constant removed
5. Backend test for new RPC created and passing
6. Full frontend test suite passes
7. Full backend test suite passes
8. Type checking passes
9. Linting passes
10. Security grep validation passes:
    - Zero references to `security.quarantine.list`
    - Zero references to `SECURITY_QUARANTINE_LIST`
    - Active RPCs still present and callable
11. All 18 security invariants verified
12. `scan_core` internals unchanged
13. Final security audit report created

### Validation commands

```bash
# Frontend tests
cd apps/pc-optimizer && npm test

# Backend tests
cd backend && python -m pytest

# Type checking
cd apps/pc-optimizer && npm run typecheck

# Linting
cd apps/pc-optimizer && npm run lint

# Verify new canonical RPC is registered
grep -r "scan_core.security_remediation.quarantine_list" backend/src/ packages/shared/src/
# Expected: matches in scan_core_rpc/__init__.py and rpc/index.ts

# Verify old transitional RPC is removed
grep -r "security\.quarantine\.list\|SECURITY_QUARANTINE_LIST" backend/src/ packages/shared/src/ apps/pc-optimizer/src/
# Expected: ZERO matches

# Verify active RPCs still present
grep -r "SECURITY_ENABLE_SMARTSCREEN\|SECURITY_ENABLE_DEFENDER\|SECURITY_ENABLE_FIREWALL" packages/shared/src/
# Expected: 3 matches

# Verify scan_core internals unchanged
git diff backend/src/avs_backend/scan_core/ -- ':!backend/src/avs_backend/scan_core_rpc/__init__.py'
# Expected: ZERO changes to scan_core internals (only scan_core_rpc/__init__.py changed for new RPC)

# Verify no remediation state in browser storage
grep -r "localStorage\|sessionStorage\|IndexedDB" apps/pc-optimizer/src/features/security-dashboard/ apps/pc-optimizer/src/features/security-remediation/
# Expected: ZERO matches related to remediation state
```

### Risks

| Risk | Mitigation |
|------|------------|
| Quarantine list migration breaks existing quarantine visibility | New RPC reads from same manifest; test with existing quarantined items |
| `security.quarantine.list` removed before migration is complete | Remove ONLY after canonical replacement is verified and all callers migrated |
| Privacy violation in new RPC response | Follow privacy requirements in §25 — only expose `quarantineId`, `originalPath`, `threatId`, `reason`, `quarantinedAt`, `fileSize`, `restored` |
| Thread safety issue in new RPC | Use existing `_quarantine_lock` for manifest access |
| `scan_core` internals accidentally modified | Verify with `git diff` — only `scan_core_rpc/__init__.py` should change |

### Rollback strategy

1. `git revert` the Phase 3 commit
2. Run full test suite to verify restoration
3. Transitional `security.quarantine.list` RPC returns — no data loss (same manifest)

### Explicit boundary for post-SC-8C14

Phase 3 is the FINAL phase of SC-8C14. After Phase 3 is complete:
- SC-8C14 is COMPLETE
- SC-8C15 is NOT started
- License Activation is NOT started
- No further work is authorized without a new product decision

---

## Phase Summary

| Phase | Objective | Production changes | New tests | Phase count |
|-------|-----------|-------------------|-----------|-------------|
| Phase 1 | Legacy dependency inventory + safe migration planning | NONE | NONE | 1 |
| Phase 2 | Remove dead Security Center remediation execution infrastructure | Remove dead RPCs, methods, classes, constants; refactor `ThreatRemediationEngine` | Update `threatRemediation.test.ts` | 2 |
| Phase 3 | Quarantine transitional migration + final audit | Create canonical `quarantine_list` RPC, migrate callers, remove transitional RPC | New `test_quarantine_list_rpc.py` | 3 |

**Total: 3 phases**

---

## SC-8C15 Boundary

**SC-8C15 is NOT started.**

No SC-8C15 specification is created. No SC-8C15 requirements are invented. No SC-8C15 implementation is started.

License Activation is NOT part of SC-8C14 and is NOT part of SC-8C15.

---

**End of SC-8C14 Phase Plan**
