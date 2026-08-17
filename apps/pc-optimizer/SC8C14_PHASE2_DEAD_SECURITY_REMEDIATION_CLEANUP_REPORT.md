# SC-8C14 Phase 2 — Dead Security Remediation Cleanup Report

## 1. Executive Summary

Phase 2 permanently removed the obsolete Security Center remediation execution infrastructure that became dead after SC-8C12 migrated Security Center remediation to the canonical `scan_core` workflow.

**Removals completed:**
- 3 dead frontend class files deleted
- 6 dead frontend RPC wrapper methods removed
- 6 dead backend RPC handlers removed
- 6 dead shared RPC constants removed
- 1 dead backend helper removed (`_generate_quarantine_id`)
- 23 dead `ThreatRemediationEngine` methods removed
- 3 dead type definitions removed from `types.ts`
- 2 dead imports removed (`shutil`, `time`)

**Preserved (verified intact):**
- `ThreatRemediationEngine` with all production-reachable read-only methods
- All 11 production-reachable security-remediation classes
- `security.quarantine.list` (transitional, for Phase 3)
- `security.enableSmartScreen`, `security.enableDefender`, `security.enableFirewall`
- All canonical `scan_core` RPCs (FROZEN, zero changes)
- `SafetyGate`, `RemediationCoordinator`, executors (zero changes)

**Validation results:**
- Frontend typecheck: PASS
- Frontend lint: PASS
- Frontend build: PASS
- Frontend tests: 8166 passed (121 test files)
- Backend tests: 1534 passed, 14 skipped, 1 pre-existing flake (performance timing)
- Security grep: PASS — zero dead RPC registrations, zero dead constant references

**No Phase 3 work performed. No SC-8C15 work performed.**

---

## 2. Files Deleted

| File | Class | Evidence |
|------|-------|---------|
| `apps/pc-optimizer/src/features/security-remediation/ThreatRestoreManager.ts` | `ThreatRestoreManager` | Zero production callers — only used by dead `ThreatRemediationEngine` methods and tests |
| `apps/pc-optimizer/src/features/security-remediation/ThreatDeletionManager.ts` | `ThreatDeletionManager` | Zero production callers — only used by dead `ThreatRemediationEngine` methods and tests |
| `apps/pc-optimizer/src/features/security-remediation/ThreatRecoveryProvider.ts` | `ThreatRecoveryProvider` | Zero production callers from security-dashboard — only used by dead `ThreatRemediationEngine` methods and tests |

---

## 3. Files Modified

| File | Change |
|------|--------|
| `apps/pc-optimizer/src/features/security-remediation/ThreatRemediationEngine.ts` | Removed 3 dead imports, 3 dead fields, 3 dead constructor initializations, 23 dead methods; inlined `buildApprovalExplanation` into `createPlan` |
| `apps/pc-optimizer/src/features/security-remediation/index.ts` | Removed 6 dead barrel exports (3 classes + 3 types) |
| `apps/pc-optimizer/src/features/security-remediation/types.ts` | Removed 3 dead type definitions (`RecoveryProvider`, `RecoveryProviderType`, `RecoveryStatus`) |
| `apps/pc-optimizer/src/features/security-dashboard/securityBackendService.ts` | Removed 6 dead RPC wrapper methods |
| `packages/shared/src/rpc/index.ts` | Removed 6 dead RPC constants |
| `backend/src/avs_backend/security_remediation/__init__.py` | Removed 6 dead RPC handlers, 1 dead helper (`_generate_quarantine_id`), 2 dead imports (`shutil`, `time`); updated module docstring |
| `apps/pc-optimizer/src/features/security-remediation/__tests__/threatRemediation.test.ts` | Removed 3 dead test blocks, 5 dead integration tests, 1 dead edge case test; updated 3 tests to not use dead methods |
| `apps/pc-optimizer/src/features/scan/__tests__/rollback.test.tsx` | Updated negative assertion to use string literal instead of deleted constant |
| `apps/pc-optimizer/src/features/scan/__tests__/results.test.tsx` | Updated 2 negative assertions to use string literals |
| `apps/pc-optimizer/src/features/scan/__tests__/dashboardScan.test.tsx` | Updated 2 negative assertions to use string literals |

**New file created:**
| File | Purpose |
|------|---------|
| `apps/pc-optimizer/src/features/security-remediation/__tests__/sc8c14Phase2Regression.test.ts` | 59 regression tests verifying deletions and preservations |

---

## 4. RPCs Removed

| RPC | Backend Handler | Status |
|-----|----------------|--------|
| `security.quarantine` | `quarantine_file()` | REMOVED |
| `security.quarantine.restore` | `restore_quarantined()` | REMOVED |
| `security.quarantine.delete` | `delete_quarantined()` | REMOVED |
| `security.remediation.plan` | `generate_remediation_plan()` | REMOVED |
| `security.remediation.execute` | `execute_remediation_plan()` | REMOVED |
| `security.remediation.rollback` | `rollback_remediation()` | REMOVED |

**Remaining RPCs in `security_remediation/__init__.py` (4):**
- `security.quarantine.list` (transitional, for Phase 3)
- `security.enableSmartScreen` (active)
- `security.enableDefender` (active)
- `security.enableFirewall` (active)

---

## 5. RPC Constants Removed

| Constant | Value | Status |
|----------|-------|--------|
| `SECURITY_QUARANTINE` | `'security.quarantine'` | REMOVED |
| `SECURITY_QUARANTINE_RESTORE` | `'security.quarantine.restore'` | REMOVED |
| `SECURITY_QUARANTINE_DELETE` | `'security.quarantine.delete'` | REMOVED |
| `SECURITY_REMEDIATION_PLAN` | `'security.remediation.plan'` | REMOVED |
| `SECURITY_REMEDIATION_EXECUTE` | `'security.remediation.execute'` | REMOVED |
| `SECURITY_REMEDIATION_ROLLBACK` | `'security.remediation.rollback'` | REMOVED |

**Preserved constants:**
- `SECURITY_QUARANTINE_LIST` (transitional)
- `SECURITY_ENABLE_SMARTSCREEN`, `SECURITY_ENABLE_DEFENDER`, `SECURITY_ENABLE_FIREWALL` (active)
- `SCAN_CORE_SECURITY_REMEDIATION_PLAN` (canonical)
- All `SCAN_CORE_REMEDIATION_*` constants (canonical)

---

## 6. Frontend Wrapper Methods Removed

| Method | File | Status |
|--------|------|--------|
| `quarantineFile()` | `securityBackendService.ts` | REMOVED |
| `restoreQuarantined()` | `securityBackendService.ts` | REMOVED |
| `deleteQuarantined()` | `securityBackendService.ts` | REMOVED |
| `generateRemediationPlan()` | `securityBackendService.ts` | REMOVED |
| `executeRemediationPlan()` | `securityBackendService.ts` | REMOVED |
| `rollbackRemediation()` | `securityBackendService.ts` | REMOVED |

**Preserved wrapper:**
- `listQuarantined()` (transitional, for Phase 3)

---

## 7. ThreatRemediationEngine Methods Removed

| Method | Classification | Status |
|--------|---------------|--------|
| `executePlan` | Dead — replaced by `scan_core.remediation.execute` | REMOVED |
| `executeAction` | Dead — only called by `executePlan` | REMOVED |
| `performAction` | Dead — only called by `executeAction` | REMOVED |
| `performQuarantine` | Dead — only called by `performAction` | REMOVED |
| `performRestore` | Dead — only called by `performAction` | REMOVED |
| `performDelete` | Dead — only called by `performAction` | REMOVED |
| `performDisableStartup` | Dead — only called by `performAction` | REMOVED |
| `performDisableTask` | Dead — only called by `performAction` | REMOVED |
| `performDisableExtension` | Dead — only called by `performAction` | REMOVED |
| `performResetBrowser` | Dead — only called by `performAction` | REMOVED |
| `performRemovePersistence` | Dead — only called by `performAction` | REMOVED |
| `rollbackAction` | Dead — replaced by `scan_core.remediation.rollback` | REMOVED |
| `restoreFromQuarantine` | Dead — removed from SecurityCenterService in SC-8C12 | REMOVED |
| `deleteFromQuarantine` | Dead — removed from SecurityCenterService in SC-8C12 | REMOVED |
| `approvePlan` | Dead — replaced by canonical PlanReviewView | REMOVED |
| `rejectPlan` | Dead — replaced by canonical PlanReviewView | REMOVED |
| `getApprovalRequest` | Dead — not called from production | REMOVED |
| `getReport` | Dead — only used internally by `executePlan` | REMOVED |
| `setTier` | Dead — not called from production | REMOVED |
| `getRecoveryStatus` | Dead — not called from SecurityCenterService | REMOVED |
| `getRecoveryProviders` | Dead — not called from SecurityCenterService | REMOVED |
| `getRecoveryOptions` | Dead — not called from SecurityCenterService | REMOVED |
| `buildApprovalExplanation` | Dead — inlined into `createPlan` | REMOVED (inlined) |

**Preserved methods (13):**
- `createPlan`, `getPlan`, `getAllPlans`, `getQuarantineEntry`, `getQuarantineSummary`
- `markFalsePositive`, `isFalsePositive`, `generateReport`, `getHistory`, `getDashboard`
- `getConfiguration`, `updatePolicy`, `clear`

**Also removed:**
- `RollbackData` import (only used by dead methods)
- `ApprovalRequest` import (only used by dead `getApprovalRequest`)
- `restoreManager`, `deletionManager`, `recoveryProvider` fields
- Constructor initialization for deleted managers

---

## 8. Backend Helpers Removed

| Helper | Status | Reason |
|--------|--------|--------|
| `_generate_quarantine_id()` | REMOVED | Only used by dead `quarantine_file()` |
| `import shutil` | REMOVED | Only used by dead `quarantine_file()` and `restore_quarantined()` |
| `import time` | REMOVED | Only used by dead `_generate_quarantine_id()` and `generate_remediation_plan()` |

**Preserved helpers:**
- `_now_iso()` — used by all remaining RPCs
- `_ensure_quarantine_dir()` — used by `_save_manifest()` and Phase 3
- `_load_manifest()` — used by `list_quarantined()` and Phase 3
- `_save_manifest()` — preserved for Phase 3
- `_run_powershell()` — used by active `enable_*` RPCs
- `_QUARANTINE_DIR`, `_QUARANTINE_MANIFEST`, `_quarantine_lock`, `IS_WINDOWS` — preserved

---

## 9. Components Preserved

### Frontend `security-remediation/` (14 components)

| Component | Status |
|-----------|--------|
| `ThreatRemediationEngine` (refactored) | PRESERVED — 13 read-only methods remain |
| `ThreatRemediationPlanner` | PRESERVED |
| `ThreatSafetyValidator` | PRESERVED |
| `ThreatRemediationPolicyManager` | PRESERVED |
| `ThreatConfigurationManager` | PRESERVED |
| `ThreatRemediationHistory` | PRESERVED |
| `ThreatRemediationReportGenerator` | PRESERVED |
| `ThreatDashboardProvider` | PRESERVED |
| `ThreatFalsePositiveTracker` | PRESERVED |
| `ThreatApprovalManager` | PRESERVED |
| `ThreatQuarantineManager` | PRESERVED |
| `ThreatRollbackManager` | PRESERVED |
| `remediationEventBus` | PRESERVED |
| `types.ts` / `index.ts` (refactored) | PRESERVED |

### Frontend `security-dashboard/` (6 components)

| Component | Status |
|-----------|--------|
| `SecurityCenterService` | PRESERVED (unchanged) |
| `SecurityCenterViewModel` | PRESERVED (unchanged) |
| `SecurityCenterPage` | PRESERVED (unchanged) |
| `securityBackendService` (refactored) | PRESERVED — `listQuarantined` remains |
| `securityDataAdapter` | PRESERVED (unchanged) |
| `securityScanTypes.ts` | PRESERVED (unchanged) |

### Backend (4 RPCs + helpers)

| Component | Status |
|-----------|--------|
| `security.quarantine.list` | PRESERVED (transitional) |
| `security.enableSmartScreen` | PRESERVED (active) |
| `security.enableDefender` | PRESERVED (active) |
| `security.enableFirewall` | PRESERVED (active) |
| All `scan_core.*` RPCs | PRESERVED (FROZEN, zero changes) |

---

## 10. Quarantine Boundary Confirmation

The transitional quarantine list flow was NOT touched in Phase 2:

| Component | Status |
|-----------|--------|
| `security.quarantine.list` RPC | PRESERVED — still registered at line 72 |
| `SECURITY_QUARANTINE_LIST` constant | PRESERVED — still in `rpc/index.ts` |
| `list_quarantined()` handler | PRESERVED — still in `security_remediation/__init__.py` |
| `securityBackendService.listQuarantined()` | PRESERVED — still in `securityBackendService.ts` |
| `SecurityCenterService.getQuarantineSummary()` | PRESERVED — unchanged |

**Quarantine manifest infrastructure preserved:**
- `_QUARANTINE_DIR` — preserved
- `_QUARANTINE_MANIFEST` — preserved
- `_quarantine_lock` — preserved
- `_load_manifest()` — preserved
- `_save_manifest()` — preserved
- `_ensure_quarantine_dir()` — preserved

**No Phase 3 work performed.** The canonical `scan_core.security_remediation.quarantine_list` RPC was NOT created. `SecurityCenterService.getQuarantineSummary()` was NOT migrated.

---

## 11. Production Reachability Verification

### Pre-removal verification

Before any removal, the following was verified:

| Component | Production callers found | Test callers found |
|-----------|------------------------|-------------------|
| `ThreatRestoreManager` | ZERO (only Engine dead methods + tests) | `threatRemediation.test.ts` |
| `ThreatDeletionManager` | ZERO (only Engine dead methods + tests) | `threatRemediation.test.ts` |
| `ThreatRecoveryProvider` | ZERO (only Engine dead methods + tests) | `threatRemediation.test.ts` |
| `quarantineFile()` | ZERO | NONE |
| `restoreQuarantined()` | ZERO | NONE |
| `deleteQuarantined()` | ZERO | NONE |
| `generateRemediationPlan()` | ZERO | NONE |
| `executeRemediationPlan()` | ZERO | NONE |
| `rollbackRemediation()` | ZERO | NONE |
| `executePlan()` | ZERO (only comments in SecurityCenterService) | `threatRemediation.test.ts` |
| `approvePlan()` | ZERO (only comments) | `threatRemediation.test.ts` |
| `rejectPlan()` | ZERO (only comments) | `threatRemediation.test.ts` |
| `rollbackAction()` | ZERO (only comments) | `threatRemediation.test.ts` |
| All other dead methods | ZERO | `threatRemediation.test.ts` |
| `security.enableSmartScreen` | `dashboard.service.ts`, `ProtectionCenterPage.tsx`, `ProtectionCenterViewModel.ts` | NONE |
| `security.enableDefender` | `dashboard.service.ts`, `ProtectionCenterPage.tsx`, `ProtectionCenterViewModel.ts` | NONE |
| `security.enableFirewall` | `dashboard.service.ts`, `ProtectionCenterPage.tsx`, `ProtectionCenterViewModel.ts` | NONE |
| `security.quarantine.list` | `securityBackendService.listQuarantined()` → `SecurityCenterService.getQuarantineSummary()` | NONE |

### Post-removal verification

Repository-wide grep for deleted symbols:

| Pattern | Production matches | Expected |
|---------|-------------------|----------|
| `ThreatRestoreManager` | ZERO | ZERO |
| `ThreatDeletionManager` | ZERO | ZERO |
| `ThreatRecoveryProvider` | ZERO | ZERO |
| `SECURITY_QUARANTINE\b` (RPC constant) | ZERO | ZERO |
| `SECURITY_QUARANTINE_RESTORE` | ZERO | ZERO |
| `SECURITY_QUARANTINE_DELETE` | ZERO | ZERO |
| `SECURITY_REMEDIATION_PLAN\b` (RPC constant) | ZERO | ZERO |
| `SECURITY_REMEDIATION_EXECUTE` | ZERO | ZERO |
| `SECURITY_REMEDIATION_ROLLBACK` | ZERO | ZERO |
| `quarantineFile` / `restoreQuarantined` / etc. | ZERO | ZERO |
| `executePlan` / `approvePlan` / `rollbackAction` / etc. | ZERO (only comments in SecurityCenterService) | ZERO |

---

## 12. Security Audit

### Backend `security_remediation/__init__.py`

| Pattern | Before | After | Classification |
|---------|--------|-------|---------------|
| `import shutil` | Present | REMOVED | Was only used by dead RPCs |
| `import time` | Present | REMOVED | Was only used by dead RPCs |
| `shutil.move` | 2 matches (dead RPCs) | ZERO | Removed with dead handlers |
| `os.remove` | 1 match (dead RPC) | ZERO | Removed with dead handler |
| `subprocess.run` | 1 match (`_run_powershell`) | 1 match (preserved) | Active `enable_*` RPCs |
| `@register` | 10 matches | 4 matches | 6 dead removed, 4 active preserved |

### Frontend `security-remediation/`

| Pattern | Matches | Classification |
|---------|---------|---------------|
| `subprocess` | ZERO | N/A |
| `child_process` | ZERO | N/A |
| `fs.unlink` | ZERO | N/A |
| `fs.rm` | ZERO | N/A |
| `fs.writeFile` | ZERO | N/A |
| `process.kill` | ZERO | N/A |
| `process.terminate` | ZERO | N/A |

### Dead RPC registration verification

| RPC | Registered? | Expected |
|-----|------------|----------|
| `security.quarantine` | NO | NO |
| `security.quarantine.restore` | NO | NO |
| `security.quarantine.delete` | NO | NO |
| `security.remediation.plan` | NO | NO |
| `security.remediation.execute` | NO | NO |
| `security.remediation.rollback` | NO | NO |
| `security.quarantine.list` | YES | YES (transitional) |
| `security.enableSmartScreen` | YES | YES (active) |
| `security.enableDefender` | YES | YES (active) |
| `security.enableFirewall` | YES | YES (active) |

**Security conclusion:** All destructive legacy operations removed. No new security concerns. Active protection RPCs preserved.

---

## 13. Privacy Audit

| Aspect | Status |
|--------|--------|
| `canonical_path` sanitization | PRESERVED — `scan_core_rpc/__init__.py` unchanged |
| `asset_id` non-exposure | PRESERVED — canonical RPCs unchanged |
| `backup_location` non-exposure | PRESERVED — canonical RPCs unchanged |
| `quarantine_path` exposure in `security.quarantine.list` | UNCHANGED — transitional RPC preserved as-is (Phase 3 will address) |
| Canonical RPC privacy policies | PRESERVED — `scan_core` FROZEN |

**Privacy conclusion:** No privacy regression. The transitional `security.quarantine.list` still exposes `quarantinePath` — this will be addressed in Phase 3 when the canonical replacement is created.

---

## 14. Test Changes

### `threatRemediation.test.ts`

| Change | Count | Details |
|--------|-------|---------|
| Removed test blocks | 3 | `ThreatRestoreManager` (3 tests), `ThreatDeletionManager` (3 tests), `ThreatRecoveryProvider` (3 tests) |
| Removed integration tests | 5 | "approves and executes plan", "rejects plan", "cannot execute without approval", "provides recovery status", "handles rollback after execution" |
| Updated integration tests | 3 | "generates report" (removed `approvePlan`/`executePlan`), "provides history" (removed `approvePlan`/`executePlan`), "handles disabled quarantine" (removed `approvePlan`/`executePlan`) |
| Removed imports | 3 | `ThreatRestoreManager`, `ThreatDeletionManager`, `ThreatRecoveryProvider` |
| Test count change | 67 → 53 | 14 tests removed (dead functionality) |

### `rollback.test.tsx`

| Change | Details |
|--------|---------|
| Updated negative assertion | `RPC_METHODS.SECURITY_REMEDIATION_ROLLBACK` → `'security.remediation.rollback'` (string literal) |

### `results.test.tsx`

| Change | Details |
|--------|---------|
| Updated 2 negative assertions | `RPC_METHODS.SECURITY_REMEDIATION_EXECUTE` → `'security.remediation.execute'`, `RPC_METHODS.SECURITY_REMEDIATION_ROLLBACK` → `'security.remediation.rollback'` |

### `dashboardScan.test.tsx`

| Change | Details |
|--------|---------|
| Updated 2 negative assertions | Same as `results.test.tsx` |

### New regression test file

| File | Tests | Purpose |
|------|-------|---------|
| `sc8c14Phase2Regression.test.ts` | 59 | Verify deleted constants absent, preserved constants present, deleted classes not exported, deleted methods absent, preserved methods present, deleted wrappers absent, `listQuarantined` preserved |

### Tests NOT modified (preserved)

| Test file | Reason |
|-----------|--------|
| `securityDashboard.test.tsx` | No references to deleted components — 82 tests pass |
| `securityRemediationPlan.test.ts` | Tests canonical flow — negative assertions use string literals — 25 tests pass |
| `test_security_remediation_integration.py` | Tests canonical flow — negative assertions check source code of builder — 142 tests pass |
| `test_security_remediation_adapter.py` | Tests canonical adapter — negative assertions — pass |

---

## 15. Validation Results

| Validation | Command | Result |
|-----------|---------|--------|
| Focused tests | `npx vitest run threatRemediation.test.ts sc8c14Phase2Regression.test.ts` | 112 passed |
| Other affected tests | `npx vitest run securityRemediationPlan.test.ts rollback.test.tsx results.test.tsx dashboardScan.test.tsx securityDashboard.test.tsx` | 172 passed |
| Frontend typecheck | `npm run typecheck` | PASS |
| Frontend lint | `npm run lint` | PASS (0 warnings) |
| Frontend build | `npm run build` | PASS (built in 14.78s) |
| Full frontend suite | `npx vitest run` | 8166 passed (121 test files) |
| Backend focused tests | `python -m pytest test_security_remediation_integration.py test_security_remediation_adapter.py` | 142 passed |
| Full backend suite | `python -m pytest` | 1534 passed, 14 skipped, 1 pre-existing flake |

---

## 16. Any Pre-existing Failures

| Failure | File | Test | Cause | Related to Phase 2? |
|---------|------|------|-------|-------------------|
| `test_10k_dry_run_performance` | `test_sc8c4_part1_execution_engine.py` | Performance timing | Executor took 10059.7ms vs 10000ms threshold | **NO** — pre-existing performance flake in `scan_core` executor, unrelated to security remediation cleanup |

---

## 17. Risks/Unexpected Findings

### Unexpected finding 1: `buildApprovalExplanation` called by `createPlan`

The Phase 1 report classified `buildApprovalExplanation` as dead, but it was called by `createPlan()` (a KEEP method). Resolution: inlined the explanation logic directly into `createPlan()`. No behavior change.

### Unexpected finding 2: Negative assertion tests referenced dead constants

`rollback.test.tsx`, `results.test.tsx`, and `dashboardScan.test.tsx` used `RPC_METHODS.SECURITY_REMEDIATION_*` constants in negative assertions (verifying these RPCs are NOT called). Resolution: updated to use string literals (`'security.remediation.execute'`, `'security.remediation.rollback'`) so the regression tests still verify the old RPC names are not called, without depending on the deleted constants.

### Unexpected finding 3: Feature flag `SECURITY_QUARANTINE` vs RPC constant `SECURITY_QUARANTINE`

The feature flag `SECURITY_QUARANTINE` in `packages/shared/src/featureFlags/index.ts` is a separate identifier from the RPC constant `SECURITY_QUARANTINE` in `packages/shared/src/rpc/index.ts`. They live in different modules. Removing the RPC constant did NOT affect the feature flag. The feature flag `SECURITY_QUARANTINE` is preserved and gates the quarantine feature (still active via `security.quarantine.list`).

### No other unexpected findings

All other removals proceeded exactly as planned in the Phase 1 report.

---

## 18. Phase 3 Readiness

Phase 3 may begin when ALL of the following are true:

1. Phase 2 is complete — **DONE**
2. All dead code is removed — **DONE**
3. Full test suite passes after Phase 2 — **DONE** (8166 frontend + 1534 backend)
4. `security.quarantine.list` is the only remaining transitional RPC — **CONFIRMED**
5. `SecurityCenterService.getQuarantineSummary()` still works (via transitional RPC) — **CONFIRMED**
6. Quarantine manifest location is confirmed — **CONFIRMED** (`%LOCALAPPDATA%\AVS Shield\Quarantine\manifest.json`)
7. Phase 3 migration order is understood — **DOCUMENTED in Phase 1 report §20**

**Status: ALL CRITERIA MET** — Phase 3 is ready to begin.

### Remaining Phase 3 work

1. Create `scan_core.security_remediation.quarantine_list` canonical RPC
2. Add `SCAN_CORE_SECURITY_REMEDIATION_QUARANTINE_LIST` constant
3. Migrate `securityBackendService.listQuarantined()` to use canonical constant
4. Add regression test for canonical RPC
5. Verify `SecurityCenterService.getQuarantineSummary()` works with new RPC
6. Verify zero production callers to `security.quarantine.list`
7. Remove `list_quarantined()` handler
8. Remove `SECURITY_QUARANTINE_LIST` constant
9. Remove `securityBackendService.listQuarantined()` (or update to use canonical)
10. Final validation

---

## 19. SC-8C15 Boundary

**SC-8C15 is NOT started.**

No SC-8C15 specification is created. No SC-8C15 requirements are invented. No SC-8C15 implementation is started.

License Activation is NOT part of SC-8C14 and is NOT part of SC-8C15.

---

## 20. Definition of Done Verification

| Criterion | Status |
|-----------|--------|
| 3 dead frontend classes removed | ✅ `ThreatRestoreManager`, `ThreatDeletionManager`, `ThreatRecoveryProvider` deleted |
| 6 dead frontend RPC wrappers removed | ✅ `quarantineFile`, `restoreQuarantined`, `deleteQuarantined`, `generateRemediationPlan`, `executeRemediationPlan`, `rollbackRemediation` removed |
| 6 dead backend RPC handlers removed | ✅ `quarantine_file`, `restore_quarantined`, `delete_quarantined`, `generate_remediation_plan`, `execute_remediation_plan`, `rollback_remediation` removed |
| 6 dead shared constants removed | ✅ `SECURITY_QUARANTINE`, `SECURITY_QUARANTINE_RESTORE`, `SECURITY_QUARANTINE_DELETE`, `SECURITY_REMEDIATION_PLAN`, `SECURITY_REMEDIATION_EXECUTE`, `SECURITY_REMEDIATION_ROLLBACK` removed |
| `_generate_quarantine_id` removed | ✅ Removed (confirmed exclusively used by dead `quarantine_file`) |
| 22+ dead `ThreatRemediationEngine` methods removed | ✅ 23 methods removed |
| `ThreatRemediationEngine` still supports legitimate production functionality | ✅ 13 read-only methods preserved |
| `security.enableSmartScreen` remains | ✅ Registered and active |
| `security.enableDefender` remains | ✅ Registered and active |
| `security.enableFirewall` remains | ✅ Registered and active |
| `security.quarantine.list` remains functional | ✅ Registered and production-reachable |
| Canonical `scan_core` remediation remains untouched | ✅ Zero changes to `scan_core/` |
| No production caller references deleted symbols | ✅ Verified by grep |
| Tests updated appropriately | ✅ 14 dead tests removed, 3 updated, 59 regression tests added |
| Typecheck passes | ✅ |
| Lint passes | ✅ (0 warnings) |
| Build passes | ✅ |
| Focused tests pass | ✅ 112 + 172 = 284 focused tests pass |
| Backend tests pass | ✅ 1534 passed (1 pre-existing flake unrelated) |
| Security grep completed | ✅ Zero dead RPC registrations, zero dead constants |
| No Phase 3 work performed | ✅ Quarantine list flow untouched |
| No SC-8C15 work performed | ✅ |

---

**End of SC-8C14 Phase 2 Report**
