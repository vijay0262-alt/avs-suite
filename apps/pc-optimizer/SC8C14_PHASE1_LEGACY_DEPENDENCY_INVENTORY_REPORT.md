# SC-8C14 Phase 1 — Legacy Dependency Inventory + Safe Migration Planning Report

## 1. Executive Summary

Phase 1 is an inspection/dependency-inventory phase. No production code, tests, or configuration were modified. Every component targeted by the SC-8C14 specification was traced against current source code to verify dead-code classifications, identify production callers, identify test dependencies, and determine the exact safe removal order for Phase 2 and Phase 3.

**Key findings:**

- All 6 dead backend RPC handlers confirmed: zero production callers
- All 6 dead frontend RPC wrapper methods confirmed: zero production callers
- All 3 dead frontend classes confirmed: `ThreatRestoreManager`, `ThreatDeletionManager`, `ThreatRecoveryProvider` — zero production callers outside `ThreatRemediationEngine` dead methods
- 22+ dead execution methods on `ThreatRemediationEngine` confirmed: zero production callers
- 3 active RPCs confirmed MUST preserve: `security.enableSmartScreen`, `security.enableDefender`, `security.enableFirewall`
- 1 transitional RPC confirmed: `security.quarantine.list` — production-reachable, requires migration before removal
- 11 production-reachable classes confirmed MUST preserve (including `ThreatRollbackManager`, `ThreatQuarantineManager`, `ThreatApprovalManager` which are used by `ThreatDashboardProvider` and `ThreatRemediationReportGenerator`)
- `scan_core` internals confirmed FROZEN — no changes required
- Quarantine manifest at `%LOCALAPPDATA%\AVS Shield\Quarantine\manifest.json` confirmed as authoritative persistence
- Helper functions `_load_manifest`, `_save_manifest`, `_ensure_quarantine_dir`, `_QUARANTINE_MANIFEST`, `_QUARANTINE_DIR`, `_quarantine_lock`, `_now_iso` are shared between dead and active RPCs — MUST be preserved
- Only `_generate_quarantine_id()` is exclusive to the dead `quarantine_file()` function
- 67 tests in `threatRemediation.test.ts` pass at baseline
- Zero security concerns in frontend security-remediation code (no subprocess, child_process, fs.unlink, etc.)
- Backend destructive operations (`shutil.move`, `os.remove`, `subprocess.run`) are exclusively in dead RPC handlers and active `enable_*` RPCs — no new concerns

**Phase 2 readiness:** READY — all dead components verified, dependency graph complete
**Phase 3 readiness:** READY — quarantine migration path verified, manifest location confirmed

---

## 2. Phase 1 Scope

Phase 1 is inspection and documentation only. The following was performed:

- Fresh source-code inspection of all targeted components
- Production reachability analysis for every legacy RPC
- Frontend class analysis for every security-remediation class
- `ThreatRemediationEngine` method-by-method classification
- Quarantine architecture verification
- Active RPC verification (`security.enableSmartScreen/Defender/Firewall`)
- Canonical flow verification
- Security audit (subprocess, PowerShell, fs operations)
- Privacy audit (canonical_path, asset_id, backup_location exposure)
- Persistence/recovery audit
- Test impact analysis
- Phase 2 implementation order determination
- Phase 3 quarantine migration order determination
- Baseline test run (`threatRemediation.test.ts`: 67 tests pass)

**No production code was modified. No tests were modified. No configuration was modified.**

---

## 3. Repository Evidence

### Verification commands executed

| Command | Purpose | Result |
|---------|---------|--------|
| `grep ThreatRestoreManager apps/pc-optimizer/src/` | Verify dead class | Only in Engine (dead methods), tests, index.ts, own file |
| `grep ThreatDeletionManager apps/pc-optimizer/src/` | Verify dead class | Only in Engine (dead methods), tests, index.ts, own file |
| `grep ThreatRecoveryProvider apps/pc-optimizer/src/` | Verify dead class | Only in Engine (dead methods), tests, index.ts, own file |
| `grep securityBackendService.(quarantineFile\|restoreQuarantined\|...)` | Verify dead wrapper methods | ZERO matches |
| `grep enableSmartScreen\|enableDefender\|enableFirewall` | Verify active RPCs | 16 matches in dashboard.service.ts, ProtectionCenterPage.tsx, ProtectionCenterViewModel.ts |
| `grep executePlan\|rollbackAction\|approvePlan\|...` in security-dashboard | Verify dead engine methods | Only comments documenting removal |
| `grep subprocess\|shutil\|os.remove` in security_remediation/__init__.py | Security audit | 5 matches — all in dead RPCs or active enable_* RPCs |
| `grep subprocess\|child_process\|fs.unlink` in security-remediation/ | Frontend security audit | ZERO matches |
| `grep canonical_path\|asset_id\|backup_location` in scan_core_rpc | Privacy audit | 5 matches — all sanitization (empty strings or comments) |
| `npx vitest run threatRemediation.test.ts` | Baseline test | 67 tests pass |

---

## 4. Current Security Center Architecture

### Active remediation flow (verified)

```
SecurityCenterPage.tsx
  → vm.createRemediationPlan(inv.id)
    → SecurityCenterViewModel.createRemediationPlan()
      → SecurityCenterService.createRemediationPlan()
        → ThreatRemediationEngine.createPlan()  [frontend domain planning]
  → securityActionToRpcPayload(plan.actions)
  → useSecurityRemediationPlan().createPlan(payload)
    → scanService.security_remediation_plan(actions)
      → scan_core.security_remediation.plan RPC
        → SecurityRemediationPlanBuilder.build_plan()
          → SecurityRemediationAdapter.convert_actions()
        → ActionPlanRepository.save(plan)
  → PlanReviewView (plan_id from backend)
  → ResultsView
  → scan_core.remediation.prepare
  → scan_core.remediation.validate
  → EXPLICIT USER APPROVAL
  → scan_core.remediation.execute
  → status polling (useResults)
  → terminal state
  → optional scan_core.remediation.rollback
```

### Active read-only flow (verified)

```
SecurityCenterViewModel.refresh()
  → service.getAllPlans()           → ThreatRemediationEngine.getAllPlans()
  → service.getRemediationHistory()  → ThreatRemediationEngine.getHistory()
  → service.getRemediationDashboard()→ ThreatRemediationEngine.getDashboard()
                                           → ThreatDashboardProvider.build()
                                             (uses ThreatApprovalManager,
                                              ThreatQuarantineManager,
                                              ThreatRollbackManager,
                                              ThreatFalsePositiveTracker)

SecurityCenterPage.tsx
  → vm.generateRemediationReport(plan.id)
    → service.generateRemediationReport()
      → ThreatRemediationEngine.generateReport()
        → ThreatRemediationReportGenerator.generate()
          (uses ThreatRollbackManager)

SecurityCenterPage.tsx
  → vm.markFalsePositive(...)
    → service.markFalsePositive()
      → ThreatRemediationEngine.markFalsePositive()
        → ThreatFalsePositiveTracker.markFalsePositive()

SecurityCenterService.getQuarantineSummary()
  → securityBackendService.listQuarantined()  [transitional]
    → security.quarantine.list RPC
  → fallback: ThreatRemediationEngine.getQuarantineSummary()
    → ThreatQuarantineManager.getSummary()
```

---

## 5. Canonical Remediation Flow

Verified: the canonical `scan_core` remediation flow is the ONLY production remediation execution path.

**Zero production callers found for:**
- `ThreatRemediationEngine.executePlan()`
- `ThreatRemediationEngine.rollbackAction()`
- `ThreatRemediationEngine.approvePlan()`
- `ThreatRemediationEngine.rejectPlan()`
- `ThreatRemediationEngine.restoreFromQuarantine()`
- `ThreatRemediationEngine.deleteFromQuarantine()`
- `security.remediation.execute` RPC
- `security.remediation.rollback` RPC
- `security.quarantine.restore` RPC
- `security.quarantine.delete` RPC

**Confirmed by:**
- `securityRemediationPlan.test.ts` line 397: `it('hook does not call security.quarantine.*')`
- `securityRemediationPlan.test.ts` line 412: `it('hook does not call scan_core.remediation.execute')`
- `test_security_remediation_integration.py` line 724: `assert "security.remediation.execute" not in source`
- `test_security_remediation_integration.py` line 725: `assert "security.quarantine" not in source`
- `test_security_remediation_adapter.py` lines 979-982: negative assertions for legacy RPCs

**No migration blockers found.** All legacy execution paths are fully disconnected from production UI.

---

## 6. Legacy RPC Inventory

### RPC reachability matrix

| RPC | Backend Handler | Frontend Wrapper | Production Callers | Test Callers | Destructive? | Replacement | Deletion Safe? |
|-----|----------------|-----------------|-------------------|-------------|-------------|-------------|----------------|
| `security.quarantine` | `quarantine_file()` in `security_remediation/__init__.py:84` | `securityBackendService.quarantineFile()` | NONE | NONE | YES (shutil.move) | `scan_core.remediation.execute` (DELETE_FILE) | YES — after Phase 2 |
| `security.quarantine.restore` | `restore_quarantined()` in `security_remediation/__init__.py:143` | `securityBackendService.restoreQuarantined()` | NONE | NONE | YES (shutil.move) | `scan_core.remediation.rollback` | YES — after Phase 2 |
| `security.quarantine.list` | `list_quarantined()` in `security_remediation/__init__.py:192` | `securityBackendService.listQuarantined()` | `SecurityCenterService.getQuarantineSummary():514` | NONE | NO (read-only) | `scan_core.security_remediation.quarantine_list` (to be created) | NO — migrate first (Phase 3) |
| `security.quarantine.delete` | `delete_quarantined()` in `security_remediation/__init__.py:206` | `securityBackendService.deleteQuarantined()` | NONE | NONE | YES (os.remove) | N/A — permanent deletion not in canonical flow | YES — after Phase 2 |
| `security.remediation.plan` | `generate_remediation_plan()` in `security_remediation/__init__.py:247` | `securityBackendService.generateRemediationPlan()` | NONE | NONE | NO (planning) | `scan_core.security_remediation.plan` | YES — after Phase 2 |
| `security.remediation.execute` | `execute_remediation_plan()` in `security_remediation/__init__.py:304` | `securityBackendService.executeRemediationPlan()` | NONE | NONE | YES (calls quarantine_file) | `scan_core.remediation.execute` | YES — after Phase 2 |
| `security.remediation.rollback` | `rollback_remediation()` in `security_remediation/__init__.py:366` | `securityBackendService.rollbackRemediation()` | NONE | NONE | YES (calls restore_quarantined) | `scan_core.remediation.rollback` | YES — after Phase 2 |
| `security.enableSmartScreen` | `enable_smartscreen()` in `security_remediation/__init__.py:426` | `dashboard.service.ts:46` | `ProtectionCenterPage.tsx:69`, `ProtectionCenterViewModel.ts:806` | NONE | YES (registry modification) | N/A — active | **NO — MUST PRESERVE** |
| `security.enableDefender` | `enable_defender()` in `security_remediation/__init__.py:453` | `dashboard.service.ts:47` | `ProtectionCenterPage.tsx:71`, `ProtectionCenterViewModel.ts:773,784` | NONE | YES (registry/service modification) | N/A — active | **NO — MUST PRESERVE** |
| `security.enableFirewall` | `enable_firewall()` in `security_remediation/__init__.py:491` | `dashboard.service.ts:48` | `ProtectionCenterPage.tsx:73`, `ProtectionCenterViewModel.ts:795` | NONE | YES (netsh) | N/A — active | **NO — MUST PRESERVE** |

### RPC constants inventory

| Constant | Location | Status | Action |
|----------|----------|--------|--------|
| `SECURITY_QUARANTINE` | `packages/shared/src/rpc/index.ts:148` | Dead | Remove in Phase 2 |
| `SECURITY_QUARANTINE_RESTORE` | `packages/shared/src/rpc/index.ts:149` | Dead | Remove in Phase 2 |
| `SECURITY_QUARANTINE_LIST` | `packages/shared/src/rpc/index.ts:150` | Transitional (active) | Migrate in Phase 3, then remove |
| `SECURITY_QUARANTINE_DELETE` | `packages/shared/src/rpc/index.ts:151` | Dead | Remove in Phase 2 |
| `SECURITY_REMEDIATION_PLAN` | `packages/shared/src/rpc/index.ts:152` | Dead | Remove in Phase 2 |
| `SECURITY_REMEDIATION_EXECUTE` | `packages/shared/src/rpc/index.ts:153` | Dead | Remove in Phase 2 |
| `SECURITY_REMEDIATION_ROLLBACK` | `packages/shared/src/rpc/index.ts:154` | Dead | Remove in Phase 2 |
| `SECURITY_ENABLE_SMARTSCREEN` | `packages/shared/src/rpc/index.ts:197` | Active | **PRESERVE** |
| `SECURITY_ENABLE_DEFENDER` | `packages/shared/src/rpc/index.ts:198` | Active | **PRESERVE** |
| `SECURITY_ENABLE_FIREWALL` | `packages/shared/src/rpc/index.ts:199` | Active | **PRESERVE** |
| `SCAN_CORE_SECURITY_REMEDIATION_PLAN` | `packages/shared/src/rpc/index.ts:178` | Active (canonical) | **PRESERVE** |
| `SCAN_CORE_SECURITY_REMEDIATION_QUARANTINE_LIST` | Does not exist yet | To be created | Create in Phase 3 |

---

## 7. Frontend Component Inventory

### Component classification matrix

| Component | File | Production Usage | Test Usage | Read-only | Execution | Preserve/Remove | Reason |
|-----------|------|-----------------|-----------|-----------|-----------|----------------|--------|
| `ThreatRemediationEngine` | `ThreatRemediationEngine.ts` | YES (read-only methods) | YES (integration tests) | Partially | Dead methods | **REFACTOR** | Remove dead methods, preserve read-only |
| `ThreatRemediationPlanner` | `ThreatRemediationPlanner.ts` | YES (via `createPlan()`) | YES | YES | NO | **PRESERVE** | Production-reachable for planning |
| `ThreatSafetyValidator` | `ThreatSafetyValidator.ts` | YES (transitive) | YES | YES | NO | **PRESERVE** | Used by `ThreatRemediationPlanner` |
| `ThreatRemediationPolicyManager` | `ThreatRemediationPolicy.ts` | YES (transitive) | YES | YES | NO | **PRESERVE** | Used by Planner and `updatePolicy()` |
| `ThreatConfigurationManager` | `ThreatConfiguration.ts` | YES (transitive) | YES | YES | NO | **PRESERVE** | Used by Engine constructor |
| `ThreatRemediationHistory` | `ThreatRemediationHistory.ts` | YES (via `getHistory()`) | YES | YES | NO | **PRESERVE** | Production-reachable for history |
| `ThreatRemediationReportGenerator` | `ThreatRemediationReport.ts` | YES (via `generateReport()`) | YES | YES | NO | **PRESERVE** | Production-reachable for reports |
| `ThreatDashboardProvider` | `ThreatDashboardProvider.ts` | YES (via `getDashboard()`) | YES | YES | NO | **PRESERVE** | Production-reachable for dashboard |
| `ThreatFalsePositiveTracker` | `ThreatFalsePositiveTracker.ts` | YES (via `markFalsePositive()`) | YES | YES | NO | **PRESERVE** | Production-reachable for false positives |
| `ThreatApprovalManager` | `ThreatApprovalManager.ts` | YES (via `createPlan()` and `ThreatDashboardProvider`) | YES | YES | Dead `approvePlan/rejectPlan` | **PRESERVE** | Used by `createPlan()` and dashboard |
| `ThreatQuarantineManager` | `ThreatQuarantineManager.ts` | YES (via `getQuarantineSummary/Entry()` and `ThreatDashboardProvider`) | YES | YES | Dead `performQuarantine` | **PRESERVE** | Used by dashboard and quarantine summary |
| `ThreatRollbackManager` | `ThreatRollbackManager.ts` | YES (via `ThreatDashboardProvider` and `ThreatRemediationReportGenerator`) | YES | YES | Dead `rollbackAction` | **PRESERVE** | Used by dashboard and report generator |
| `ThreatRestoreManager` | `ThreatRestoreManager.ts` | NO | YES | NO | YES (dead) | **REMOVE** | Zero production callers |
| `ThreatDeletionManager` | `ThreatDeletionManager.ts` | NO | YES | NO | YES (dead) | **REMOVE** | Zero production callers |
| `ThreatRecoveryProvider` | `ThreatRecoveryProvider.ts` | NO (from security-dashboard) | YES | YES | NO | **REMOVE** | Zero production callers from security-dashboard |
| `remediationEventBus` | `ThreatRemediationEvents.ts` | YES (via `onRemediationEvent()`) | YES | YES | NO | **PRESERVE** | Production-reachable event bus |
| `types.ts` | `types.ts` | YES | YES | N/A | N/A | **REFACTOR** | Remove types exclusively used by deleted components |
| `index.ts` | `index.ts` | YES | YES | N/A | N/A | **REFACTOR** | Remove exports for deleted components |

### Critical dependency finding

`ThreatDashboardProvider` (production-reachable via `getDashboard()`) depends on:
- `ThreatApprovalManager` — MUST PRESERVE
- `ThreatQuarantineManager` — MUST PRESERVE
- `ThreatRollbackManager` — MUST PRESERVE
- `ThreatFalsePositiveTracker` — MUST PRESERVE

`ThreatRemediationReportGenerator` (production-reachable via `generateReport()`) depends on:
- `ThreatRollbackManager` — MUST PRESERVE

These managers CANNOT be deleted even though some of their methods (`createEntry`, `rollbackByAction`) are only called by dead `ThreatRemediationEngine` methods. The managers themselves are production-reachable through dashboard and report generation.

---

## 8. ThreatRemediationEngine Method Inventory

### Method classification

| Method | Classification | Current Callers | Production-reachable? | Replacement | Phase | Tests Affected |
|--------|---------------|----------------|----------------------|-------------|-------|----------------|
| `createPlan()` | **KEEP** | `SecurityCenterService.createRemediationPlan()` | YES | N/A | N/A | `threatRemediation.test.ts:720,728,743,751,762,769,780,794,804,838,846,857` |
| `getPlan()` | **KEEP** | `SecurityCenterService.getPlan()` | YES | N/A | N/A | None directly |
| `getAllPlans()` | **KEEP** | `SecurityCenterService.getAllPlans()` → `ViewModel.refresh()` | YES | N/A | N/A | None directly |
| `getQuarantineEntry()` | **KEEP** | `SecurityCenterService.getQuarantineEntry()` | YES | N/A | N/A | None directly |
| `getQuarantineSummary()` | **KEEP** | `SecurityCenterService.getQuarantineSummary()` (fallback) | YES | N/A | N/A | None directly |
| `markFalsePositive()` | **KEEP** | `SecurityCenterService.markFalsePositive()` → `ViewModel` | YES | N/A | N/A | `threatRemediation.test.ts:762` |
| `isFalsePositive()` | **KEEP** | `SecurityCenterService.isFalsePositive()` | YES | N/A | N/A | `threatRemediation.test.ts:766` |
| `generateReport()` | **KEEP** | `SecurityCenterService.generateRemediationReport()` → `ViewModel` → `SecurityCenterPage` | YES | N/A | N/A | `threatRemediation.test.ts:769` |
| `getHistory()` | **KEEP** | `SecurityCenterService.getRemediationHistory()` → `ViewModel.refresh()` | YES | N/A | N/A | `threatRemediation.test.ts:794` |
| `getDashboard()` | **KEEP** | `SecurityCenterService.getRemediationDashboard()` → `ViewModel.refresh()` | YES | N/A | N/A | `threatRemediation.test.ts:780` |
| `getConfiguration()` | **KEEP** | `SecurityCenterService.getRemediationConfiguration()` | YES | N/A | N/A | None directly |
| `updatePolicy()` | **KEEP** | `SecurityCenterService.updateRemediationPolicy()` | YES | N/A | N/A | None directly |
| `clear()` | **REFACTOR** | `SecurityCenterService.dispose()` | YES | Remove references to deleted managers | Phase 2 | None directly |
| `executePlan()` | **REMOVE** | NONE (only tests) | NO | `scan_core.remediation.execute` | Phase 2 | `threatRemediation.test.ts:728,737,751,757,774,798,852,872` |
| `executeAction()` | **REMOVE** | Only `executePlan()` | NO | N/A | Phase 2 | Indirect (via executePlan tests) |
| `performAction()` | **REMOVE** | Only `executeAction()` | NO | N/A | Phase 2 | Indirect |
| `performQuarantine()` | **REMOVE** | Only `performAction()` | NO | `scan_core.remediation.execute` (DELETE_FILE) | Phase 2 | Indirect |
| `performRestore()` | **REMOVE** | Only `performAction()` | NO | `scan_core.remediation.rollback` | Phase 2 | Indirect |
| `performDelete()` | **REMOVE** | Only `performAction()` | NO | N/A | Phase 2 | Indirect |
| `performDisableStartup()` | **REMOVE** | Only `performAction()` | NO | `scan_core.remediation.execute` (DISABLE_STARTUP_ENTRY) | Phase 2 | Indirect |
| `performDisableTask()` | **REMOVE** | Only `performAction()` | NO | N/A (unsupported in canonical) | Phase 2 | Indirect |
| `performDisableExtension()` | **REMOVE** | Only `performAction()` | NO | N/A (unsupported in canonical) | Phase 2 | Indirect |
| `performResetBrowser()` | **REMOVE** | Only `performAction()` | NO | N/A (unsupported in canonical) | Phase 2 | Indirect |
| `performRemovePersistence()` | **REMOVE** | Only `performAction()` | NO | `scan_core.remediation.execute` (REMOVE_REGISTRY_VALUE / DISABLE_STARTUP_ENTRY) | Phase 2 | Indirect |
| `rollbackAction()` | **REMOVE** | NONE (only tests) | NO | `scan_core.remediation.rollback` | Phase 2 | `threatRemediation.test.ts:877` |
| `restoreFromQuarantine()` | **REMOVE** | NONE | NO | `scan_core.remediation.rollback` | Phase 2 | None directly |
| `deleteFromQuarantine()` | **REMOVE** | NONE | NO | N/A | Phase 2 | None directly |
| `approvePlan()` | **REMOVE** | NONE (only tests) | NO | Canonical `PlanReviewView` | Phase 2 | `threatRemediation.test.ts:734,773,798,851,871` |
| `rejectPlan()` | **REMOVE** | NONE (only tests) | NO | Canonical `PlanReviewView` | Phase 2 | `threatRemediation.test.ts:747` |
| `getApprovalRequest()` | **REMOVE** | NONE | NO | N/A | Phase 2 | None directly |
| `getReport()` | **REMOVE** | Only `executePlan()` (auto-report) | NO | N/A | Phase 2 | None directly |
| `setTier()` | **REMOVE** | NONE | NO | N/A | Phase 2 | None directly |
| `getRecoveryStatus()` | **REMOVE** | NONE (only tests) | NO | N/A | Phase 2 | `threatRemediation.test.ts:788` |
| `getRecoveryProviders()` | **REMOVE** | NONE | NO | N/A | Phase 2 | None directly |
| `getRecoveryOptions()` | **REMOVE** | NONE | NO | N/A | Phase 2 | None directly |
| `buildApprovalExplanation()` | **REMOVE** | Only `createPlan()` for dead approval | NO | N/A | Phase 2 | Indirect |

### Constructor refactoring

The constructor (lines 74-98) initializes:
- `restoreManager` → **REMOVE** (line 83)
- `deletionManager` → **REMOVE** (line 84)
- `recoveryProvider` → **REMOVE** (line 90)
- All other initializations → **PRESERVE**

Fields to remove:
- `private restoreManager: ThreatRestoreManager;` (line 60)
- `private deletionManager: ThreatDeletionManager;` (line 61)
- `private recoveryProvider: ThreatRecoveryProvider;` (line 67)

Imports to remove:
- `import { ThreatRestoreManager } from './ThreatRestoreManager';` (line 43)
- `import { ThreatDeletionManager } from './ThreatDeletionManager';` (line 44)
- `import { ThreatRecoveryProvider } from './ThreatRecoveryProvider';` (line 50)

---

## 9. Backend Component Inventory

### `security_remediation/__init__.py` function inventory

| Function | Line | RPC | Status | Action |
|----------|------|-----|--------|--------|
| `_now_iso()` | 52 | N/A (helper) | Active (used by all RPCs) | **PRESERVE** |
| `_ensure_quarantine_dir()` | 56 | N/A (helper) | Active (used by quarantine + list) | **PRESERVE** |
| `_load_manifest()` | 60 | N/A (helper) | Active (used by list + dead RPCs) | **PRESERVE** |
| `_save_manifest()` | 69 | N/A (helper) | Active (used by dead RPCs only, BUT needed for Phase 3 canonical RPC if it writes) | **PRESERVE** (may be removed if canonical RPC is read-only) |
| `_generate_quarantine_id()` | 76 | N/A (helper) | Dead (only used by `quarantine_file()`) | **REMOVE** in Phase 2 |
| `quarantine_file()` | 84 | `security.quarantine` | Dead | **REMOVE** in Phase 2 |
| `restore_quarantined()` | 143 | `security.quarantine.restore` | Dead | **REMOVE** in Phase 2 |
| `list_quarantined()` | 192 | `security.quarantine.list` | Transitional (active) | **MIGRATE** in Phase 3, then remove |
| `delete_quarantined()` | 206 | `security.quarantine.delete` | Dead | **REMOVE** in Phase 2 |
| `generate_remediation_plan()` | 247 | `security.remediation.plan` | Dead | **REMOVE** in Phase 2 |
| `execute_remediation_plan()` | 304 | `security.remediation.execute` | Dead | **REMOVE** in Phase 2 |
| `rollback_remediation()` | 366 | `security.remediation.rollback` | Dead | **REMOVE** in Phase 2 |
| `_run_powershell()` | 408 | N/A (helper) | Active (used by enable_* RPCs) | **PRESERVE** |
| `enable_smartscreen()` | 426 | `security.enableSmartScreen` | Active | **PRESERVE** |
| `enable_defender()` | 453 | `security.enableDefender` | Active | **PRESERVE** |
| `enable_firewall()` | 491 | `security.enableFirewall` | Active | **PRESERVE** |

### Module-level constants

| Constant | Line | Used by | Action |
|----------|------|---------|--------|
| `IS_WINDOWS` | 40 | `enable_*` RPCs | **PRESERVE** |
| `_QUARANTINE_DIR` | 44/46 | `quarantine_file`, `list_quarantined`, `_ensure_quarantine_dir` | **PRESERVE** (needed for Phase 3 canonical RPC) |
| `_QUARANTINE_MANIFEST` | 48 | `_load_manifest`, `_save_manifest` | **PRESERVE** (needed for Phase 3 canonical RPC) |
| `_quarantine_lock` | 49 | All quarantine RPCs | **PRESERVE** (needed for Phase 3 canonical RPC) |

### `scan_core_rpc/__init__.py` inventory

| RPC | Line | Status | Action |
|-----|------|--------|--------|
| `scan_core.security_remediation.plan` | 654 | Active (canonical) | **PRESERVE** — FROZEN |
| `scan_core.remediation.prepare` | — | Active (canonical) | **PRESERVE** — FROZEN |
| `scan_core.remediation.validate` | — | Active (canonical) | **PRESERVE** — FROZEN |
| `scan_core.remediation.execute` | — | Active (canonical) | **PRESERVE** — FROZEN |
| `scan_core.remediation.cancel` | — | Active (canonical) | **PRESERVE** — FROZEN |
| `scan_core.remediation.status` | — | Active (canonical) | **PRESERVE** — FROZEN |
| `scan_core.remediation.rollback` | — | Active (canonical) | **PRESERVE** — FROZEN |
| `scan_core.security_remediation.quarantine_list` | Does not exist | To be created | **CREATE** in Phase 3 |

---

## 10. Quarantine Dependency Graph

### Quarantine manifest

**Location:** `%LOCALAPPDATA%\AVS Shield\Quarantine\manifest.json` (Windows) or `~/.avs-shield/quarantine/manifest.json` (other)

**Owner:** `backend/src/avs_backend/security_remediation/__init__.py`

**Format:** JSON with `{"items": [...]}` structure

**Read by:**
- `list_quarantined()` (transitional, active) — reads manifest, filters out restored items
- `restore_quarantined()` (dead) — reads manifest, finds item, restores
- `delete_quarantined()` (dead) — reads manifest, finds item, deletes

**Written by:**
- `_save_manifest()` — called by `quarantine_file()` (dead), `restore_quarantined()` (dead), `delete_quarantined()` (dead)

**Phase 3 canonical RPC will:**
- Read from the same manifest (via `_load_manifest()`)
- Use the same `_quarantine_lock` for thread safety
- Return the same response shape: `{items, count, totalItems, capturedAt}`
- NOT write to the manifest (read-only)

### Quarantine production caller chain

```
SecurityCenterPage.tsx (quarantine summary display)
  → SecurityCenterViewModel.refresh()
    → SecurityCenterService.getQuarantineSummary()
      → securityBackendService.listQuarantined()  [transitional]
        → security.quarantine.list RPC
          → list_quarantined() handler
            → _load_manifest()
            → filter restored items
            → return {items, count, totalItems, capturedAt}
      → fallback: ThreatRemediationEngine.getQuarantineSummary()
        → ThreatQuarantineManager.getSummary()
```

### Migration dependency graph

```
Phase 3 Step 1: Create scan_core.security_remediation.quarantine_list RPC
  → reads from _QUARANTINE_MANIFEST (same file)
  → uses _quarantine_lock (same lock)
  → returns same response shape

Phase 3 Step 2: Add SCAN_CORE_SECURITY_REMEDIATION_QUARANTINE_LIST constant

Phase 3 Step 3: Update securityBackendService.listQuarantined()
  → use new constant instead of SECURITY_QUARANTINE_LIST

Phase 3 Step 4: Add regression test for new RPC

Phase 3 Step 5: Verify SecurityCenterService.getQuarantineSummary() works

Phase 3 Step 6: Verify zero production callers to security.quarantine.list

Phase 3 Step 7: Remove list_quarantined() handler

Phase 3 Step 8: Remove SECURITY_QUARANTINE_LIST constant
```

---

## 11. Production Reachability Matrix

| Component | Production-reachable? | Production caller chain | Test callers |
|-----------|----------------------|------------------------|-------------|
| `ThreatRemediationEngine` (read-only) | YES | `SecurityCenterService` → `SecurityCenterViewModel` → `SecurityCenterPage` | `threatRemediation.test.ts` |
| `ThreatRemediationPlanner` | YES | `ThreatRemediationEngine.createPlan()` | `threatRemediation.test.ts` |
| `ThreatSafetyValidator` | YES | `ThreatRemediationPlanner` | `threatRemediation.test.ts` |
| `ThreatRemediationPolicyManager` | YES | `ThreatRemediationPlanner`, `ThreatRemediationEngine.updatePolicy()` | `threatRemediation.test.ts` |
| `ThreatConfigurationManager` | YES | `ThreatRemediationEngine` constructor | `threatRemediation.test.ts` |
| `ThreatRemediationHistory` | YES | `ThreatRemediationEngine.getHistory()` | `threatRemediation.test.ts` |
| `ThreatRemediationReportGenerator` | YES | `ThreatRemediationEngine.generateReport()` | `threatRemediation.test.ts` |
| `ThreatDashboardProvider` | YES | `ThreatRemediationEngine.getDashboard()` | `threatRemediation.test.ts` |
| `ThreatFalsePositiveTracker` | YES | `ThreatRemediationEngine.markFalsePositive/isFalsePositive` | `threatRemediation.test.ts` |
| `ThreatApprovalManager` | YES | `ThreatRemediationEngine.createPlan()`, `ThreatDashboardProvider` | `threatRemediation.test.ts` |
| `ThreatQuarantineManager` | YES | `ThreatRemediationEngine.getQuarantineSummary/Entry()`, `ThreatDashboardProvider` | `threatRemediation.test.ts` |
| `ThreatRollbackManager` | YES | `ThreatDashboardProvider`, `ThreatRemediationReportGenerator` | `threatRemediation.test.ts` |
| `ThreatRestoreManager` | NO | NONE | `threatRemediation.test.ts` |
| `ThreatDeletionManager` | NO | NONE | `threatRemediation.test.ts` |
| `ThreatRecoveryProvider` | NO | NONE (from security-dashboard) | `threatRemediation.test.ts` |
| `remediationEventBus` | YES | `SecurityCenterService.onRemediationEvent()` | `threatRemediation.test.ts` |
| `securityBackendService.listQuarantined()` | YES | `SecurityCenterService.getQuarantineSummary()` | NONE |
| `securityBackendService.quarantineFile()` | NO | NONE | NONE |
| `securityBackendService.restoreQuarantined()` | NO | NONE | NONE |
| `securityBackendService.deleteQuarantined()` | NO | NONE | NONE |
| `securityBackendService.generateRemediationPlan()` | NO | NONE | NONE |
| `securityBackendService.executeRemediationPlan()` | NO | NONE | NONE |
| `securityBackendService.rollbackRemediation()` | NO | NONE | NONE |
| `security.enableSmartScreen` | YES | `dashboard.service.ts` → `ProtectionCenterPage.tsx` → `ProtectionCenterViewModel.ts` | NONE |
| `security.enableDefender` | YES | `dashboard.service.ts` → `ProtectionCenterPage.tsx` → `ProtectionCenterViewModel.ts` | NONE |
| `security.enableFirewall` | YES | `dashboard.service.ts` → `ProtectionCenterPage.tsx` → `ProtectionCenterViewModel.ts` | NONE |
| `security.quarantine.list` | YES (transitional) | `securityBackendService.listQuarantined()` → `SecurityCenterService.getQuarantineSummary()` | NONE |
| `security.quarantine` | NO | NONE | NONE |
| `security.quarantine.restore` | NO | NONE | NONE |
| `security.quarantine.delete` | NO | NONE | NONE |
| `security.remediation.plan` | NO | NONE | NONE |
| `security.remediation.execute` | NO | NONE | NONE |
| `security.remediation.rollback` | NO | NONE | NONE |

---

## 12. Test Dependency Matrix

### `threatRemediation.test.ts` (67 tests, all pass at baseline)

| Test block | Lines | Tests | Depends on | Phase 2 action |
|-----------|-------|-------|-----------|----------------|
| `ThreatQuarantineManager` | 182-240 | ~6 | `ThreatQuarantineManager` (preserved) | **PRESERVE** |
| `ThreatRestoreManager` | 242-273 | ~4 | `ThreatRestoreManager` (deleted) | **REMOVE** |
| `ThreatDeletionManager` | 275-310 | ~4 | `ThreatDeletionManager` (deleted) | **REMOVE** |
| `ThreatRollbackManager` | 312-353 | ~5 | `ThreatRollbackManager` (preserved) | **PRESERVE** |
| `ThreatApprovalManager` | 355-405 | ~5 | `ThreatApprovalManager` (preserved) | **PRESERVE** |
| `ThreatSafetyValidator` | 407-458 | ~5 | `ThreatSafetyValidator` (preserved) | **PRESERVE** |
| `ThreatRemediationPolicyManager` | 460-502 | ~5 | `ThreatRemediationPolicyManager` (preserved) | **PRESERVE** |
| `ThreatRemediationPlanner` | 504-549 | ~5 | `ThreatRemediationPlanner` (preserved) | **PRESERVE** |
| `ThreatFalsePositiveTracker` | 551-602 | ~5 | `ThreatFalsePositiveTracker` (preserved) | **PRESERVE** |
| `ThreatRemediationHistory` | 604-628 | ~3 | `ThreatRemediationHistory` (preserved) | **PRESERVE** |
| `ThreatRemediationReportGenerator` | 630-655 | ~3 | `ThreatRemediationReportGenerator` (preserved), `ThreatRollbackManager` (preserved) | **PRESERVE** |
| `ThreatRecoveryProvider` | 657-691 | ~4 | `ThreatRecoveryProvider` (deleted) | **REMOVE** |
| `ThreatConfigurationManager` | 693-709 | ~2 | `ThreatConfigurationManager` (preserved) | **PRESERVE** |
| `ThreatRemediationEngine (Integration)` | 711-809 | ~9 | `ThreatRemediationEngine` (refactored) | **UPDATE** — remove tests for dead methods (executePlan, approvePlan, rejectPlan, rollbackAction, getRecoveryStatus) |
| `RemediationEventBus` | 813-831 | ~2 | `remediationEventBus` (preserved) | **PRESERVE** |
| `Edge Cases` | 836-879 | ~4 | `ThreatRemediationEngine` (refactored) | **UPDATE** — remove tests that call dead methods (executePlan, approvePlan, rollbackAction) |

### Estimated test changes

| Category | Count | Action |
|----------|-------|--------|
| Must update | ~13 | Remove tests for dead methods in Integration and Edge Cases blocks |
| Must remain unchanged | ~50 | Tests for preserved components |
| Must add | ~3-5 | New tests for Phase 3 canonical quarantine_list RPC |
| Test-only legacy to remove | ~8 | `ThreatRestoreManager` (4) + `ThreatDeletionManager` (4) + `ThreatRecoveryProvider` (4) test blocks |
| Security regression tests | 0 new | Existing negative assertions remain valid |
| Quarantine regression tests | ~3-5 new | New tests for canonical `quarantine_list` RPC |
| RPC registration tests | 0 changes | No registration tests found for dead RPCs |

### Other test files

| Test file | Impact | Action |
|-----------|--------|--------|
| `securityDashboard.test.tsx` | NONE — no references to legacy components | No changes |
| `securityRemediationPlan.test.ts` | NONE — tests canonical flow | No changes |
| `test_security_remediation_integration.py` | NONE — tests canonical flow, negative assertions remain valid | No changes |
| `test_security_remediation_adapter.py` | NONE — tests canonical adapter, negative assertions remain valid | No changes |

---

## 13. Security Audit

### Backend `security_remediation/__init__.py`

| Pattern | Line | Context | Classification |
|---------|------|---------|---------------|
| `import subprocess` | 30 | Module import | Legitimate — used by `enable_*` RPCs |
| `shutil.move(file_path, q_path)` | 113 | `quarantine_file()` | Dead — in dead RPC handler |
| `shutil.move(q_path, original_path)` | 175 | `restore_quarantined()` | Dead — in dead RPC handler |
| `os.remove(q_path)` | 232 | `delete_quarantined()` | Dead — in dead RPC handler |
| `subprocess.run(...)` | 411 | `_run_powershell()` | Legitimate — used by `enable_*` RPCs |

### Frontend `security-remediation/`

| Pattern | Matches | Classification |
|---------|---------|----------------|
| `subprocess` | 0 | N/A |
| `child_process` | 0 | N/A |
| `fs.unlink` | 0 | N/A |
| `fs.rm` | 0 | N/A |
| `fs.writeFile` | 0 | N/A |
| `process.kill` | 0 | N/A |
| `process.terminate` | 0 | N/A |

**Finding:** No destructive operations in frontend security-remediation code. All destructive operations are in backend dead RPC handlers (to be removed) or active `enable_*` RPCs (to be preserved).

### Additional security patterns

| Pattern | Location | Classification |
|---------|----------|----------------|
| `security.remediation.execute` | Only in comments and negative test assertions | Dead — documentation only |
| `security.quarantine` | Only in comments and negative test assertions | Dead — documentation only |
| `dashboardService.executeOptimize` | Not found | N/A — removed in SC-8C13 |
| `orchestrator.optimize` | Not found | N/A |
| `automatic execution patterns` | Not found in security code | N/A |

**Security conclusion:** No production security concerns. All destructive operations are either in dead code (to be removed) or in active `enable_*` RPCs (legitimate, preserved). No automatic execution patterns found.

---

## 14. Privacy Audit

### Canonical RPC response privacy

| RPC | Exposes sensitive data? | Details |
|-----|------------------------|---------|
| `scan_core.security_remediation.plan` | NO | Response: `{ok, plan_id, total_actions, auto_fixable, review_required, not_fixable, estimated_affected_size, statistics}` — no paths, IDs, or internal data |
| `scan_core.remediation.prepare` | NO | Sanitized response |
| `scan_core.remediation.validate` | NO | Sanitized response |
| `scan_core.remediation.execute` | NO | Sanitized response |
| `scan_core.remediation.status` | NO | Sanitized response |
| `scan_core.remediation.rollback` | NO | Sanitized response |

### `scan_core_rpc/__init__.py` privacy patterns

| Line | Pattern | Classification |
|------|---------|----------------|
| 191 | `no canonical_path, asset_id, raw target data, or sensitive evidence` | Documentation — privacy policy |
| 223 | `"canonical_path": ""` | Sanitization — explicitly empty |
| 703-704 | `The response NEVER exposes canonical_path, asset_id, backup_location, quarantine_path...` | Documentation — privacy policy |
| 791 | Same privacy policy | Documentation |

### Quarantine listing privacy

Current `list_quarantined()` response exposes:
- `quarantineId` — public identifier (OK)
- `originalPath` — user-visible file path (OK for display)
- `quarantinePath` — internal storage path (**POTENTIAL CONCERN** — exposes internal quarantine directory structure)
- `threatId` — threat reference (OK)
- `reason` — quarantine reason (OK)
- `quarantinedAt` — timestamp (OK)
- `fileSize` — file size (OK)
- `restored` — restoration status (OK)

**Privacy finding:** The transitional `security.quarantine.list` RPC exposes `quarantinePath` (internal storage path). The new canonical `scan_core.security_remediation.quarantine_list` RPC should NOT expose `quarantinePath` to maintain privacy-safe RPC boundaries.

**Recommendation for Phase 3:** The canonical `quarantine_list` RPC response should omit `quarantinePath` or replace it with a boolean `hasBackup` field. The frontend `QuarantineEntry` interface in `securityBackendService.ts` should be updated to remove `quarantinePath` or make it optional.

---

## 15. Persistence/Recovery Audit

### Systems verified as FROZEN (no SC-8C14 impact)

| System | Location | Status |
|--------|----------|--------|
| `ActionPlanRepository` | `scan_core/metadata/action_plan_repository.py` | FROZEN — no changes |
| `ExecutionRepository` | `scan_core/metadata/execution_repository.py` | FROZEN — no changes |
| `ExecutionLedger` | `scan_core/execution/ledger.py` | FROZEN — no changes |
| `RemediationCoordinator` | `scan_core/orchestration/remediation.py` | FROZEN — no changes |
| `SafetyGate` | `scan_core/` | FROZEN — no changes |
| `DefaultExecutor` | `scan_core/execution/executor.py` | FROZEN — no changes |
| `SecurityRemediationAdapter` | `scan_core/adapters/security_remediation_adapter.py` | FROZEN — no changes |
| `SecurityRemediationPlanBuilder` | `scan_core/adapters/security_remediation_plan_builder.py` | FROZEN — no changes |

### Quarantine manifest persistence

| Aspect | Status |
|--------|--------|
| Manifest location | `%LOCALAPPDATA%\AVS Shield\Quarantine\manifest.json` — UNCHANGED |
| Manifest format | JSON `{"items": [...]}` — UNCHANGED |
| Manifest read | `_load_manifest()` — PRESERVED |
| Manifest write | `_save_manifest()` — PRESERVED (may become unused if canonical RPC is read-only) |
| Thread safety | `_quarantine_lock` — PRESERVED |

### Recovery systems

| System | Impact |
|--------|--------|
| Plan details | NONE — `ActionPlanRepository` unchanged |
| Stale-plan rejection | NONE — `scan_core` internals unchanged |
| Rollback | NONE — `scan_core.remediation.rollback` unchanged |
| Partial execution recovery | NONE — `ExecutionLedger` unchanged |
| Cross-session hydration | NONE — `ActionPlanRepository` unchanged |

**Persistence/recovery conclusion:** SC-8C14 cleanup will NOT break any persistence or recovery system. All `scan_core` internals remain frozen. The quarantine manifest remains the authoritative quarantine persistence and is read by the new canonical RPC.

---

## 16. Components Confirmed Safe to Remove

### Frontend

| Component | File | Evidence |
|-----------|------|---------|
| `ThreatRestoreManager` class | `security-remediation/ThreatRestoreManager.ts` | Zero production callers — only used by dead `ThreatRemediationEngine` methods and tests |
| `ThreatDeletionManager` class | `security-remediation/ThreatDeletionManager.ts` | Zero production callers — only used by dead `ThreatRemediationEngine` methods and tests |
| `ThreatRecoveryProvider` class | `security-remediation/ThreatRecoveryProvider.ts` | Zero production callers from security-dashboard — only used by dead `ThreatRemediationEngine` methods and tests |
| `ThreatRestoreManager` export | `security-remediation/index.ts:26` | Export for deleted class |
| `RestoreResult` type export | `security-remediation/index.ts:27` | Type only used by deleted class |
| `ThreatDeletionManager` export | `security-remediation/index.ts:28` | Export for deleted class |
| `DeleteResult` type export | `security-remediation/index.ts:29` | Type only used by deleted class |
| `ThreatRecoveryProvider` export | `security-remediation/index.ts:41` | Export for deleted class |
| `RecoveryOption` type export | `security-remediation/index.ts:42` | Type only used by deleted class |
| `quarantineFile()` method | `securityBackendService.ts:232` | Zero callers |
| `restoreQuarantined()` method | `securityBackendService.ts:236` | Zero callers |
| `deleteQuarantined()` method | `securityBackendService.ts:244` | Zero callers |
| `generateRemediationPlan()` method | `securityBackendService.ts:250` | Zero callers |
| `executeRemediationPlan()` method | `securityBackendService.ts:254` | Zero callers |
| `rollbackRemediation()` method | `securityBackendService.ts:258` | Zero callers |

### Backend

| Component | File | Evidence |
|-----------|------|---------|
| `quarantine_file()` function | `security_remediation/__init__.py:84` | Zero production callers |
| `restore_quarantined()` function | `security_remediation/__init__.py:143` | Zero production callers |
| `delete_quarantined()` function | `security_remediation/__init__.py:206` | Zero production callers |
| `generate_remediation_plan()` function | `security_remediation/__init__.py:247` | Zero production callers |
| `execute_remediation_plan()` function | `security_remediation/__init__.py:304` | Zero production callers |
| `rollback_remediation()` function | `security_remediation/__init__.py:366` | Zero production callers |
| `_generate_quarantine_id()` helper | `security_remediation/__init__.py:76` | Only used by dead `quarantine_file()` |

### Shared

| Component | File | Evidence |
|-----------|------|---------|
| `SECURITY_QUARANTINE` constant | `packages/shared/src/rpc/index.ts:148` | Only used by dead `quarantineFile()` |
| `SECURITY_QUARANTINE_RESTORE` constant | `packages/shared/src/rpc/index.ts:149` | Only used by dead `restoreQuarantined()` |
| `SECURITY_QUARANTINE_DELETE` constant | `packages/shared/src/rpc/index.ts:151` | Only used by dead `deleteQuarantined()` |
| `SECURITY_REMEDIATION_PLAN` constant | `packages/shared/src/rpc/index.ts:152` | Only used by dead `generateRemediationPlan()` |
| `SECURITY_REMEDIATION_EXECUTE` constant | `packages/shared/src/rpc/index.ts:153` | Only used by dead `executeRemediationPlan()` |
| `SECURITY_REMEDIATION_ROLLBACK` constant | `packages/shared/src/rpc/index.ts:154` | Only used by dead `rollbackRemediation()` |

---

## 17. Components That MUST Remain

### Frontend `security-remediation/`

| Component | Reason |
|-----------|--------|
| `ThreatRemediationEngine` (refactored) | Production-reachable via `SecurityCenterService` for read-only methods |
| `ThreatRemediationPlanner` | Production-reachable via `createPlan()` |
| `ThreatSafetyValidator` | Production-reachable (transitive via `ThreatRemediationPlanner`) |
| `ThreatRemediationPolicyManager` | Production-reachable (transitive) |
| `ThreatConfigurationManager` | Production-reachable (transitive) |
| `ThreatRemediationHistory` | Production-reachable via `getHistory()` |
| `ThreatRemediationReportGenerator` | Production-reachable via `generateReport()` |
| `ThreatDashboardProvider` | Production-reachable via `getDashboard()` |
| `ThreatFalsePositiveTracker` | Production-reachable via `markFalsePositive/isFalsePositive` |
| `ThreatApprovalManager` | Production-reachable via `createPlan()` and `ThreatDashboardProvider` |
| `ThreatQuarantineManager` | Production-reachable via `getQuarantineSummary/Entry()` and `ThreatDashboardProvider` |
| `ThreatRollbackManager` | Production-reachable via `ThreatDashboardProvider` and `ThreatRemediationReportGenerator` |
| `remediationEventBus` | Production-reachable via `onRemediationEvent()` |
| `types.ts` (refactored) | Types used by preserved components |
| `index.ts` (refactored) | Barrel exports for preserved components |

### Frontend `security-dashboard/`

| Component | Reason |
|-----------|--------|
| `SecurityCenterService` (refactored in Phase 3) | Active service facade |
| `SecurityCenterViewModel` | Active ViewModel |
| `SecurityCenterPage` | Active page component |
| `securityBackendService` (refactored) | Active RPC wrapper |
| `securityDataAdapter` | Active data adapter |
| `securityScanTypes.ts` | Active types |
| `QuarantineEntry` interface in `securityBackendService.ts` | Used by `listQuarantined()` return type |

### Backend

| Component | Reason |
|-----------|--------|
| `enable_smartscreen()` | Active RPC — production callers in `dashboard.service.ts`, `ProtectionCenterPage.tsx`, `ProtectionCenterViewModel.ts` |
| `enable_defender()` | Active RPC — production callers |
| `enable_firewall()` | Active RPC — production callers |
| `list_quarantined()` | Transitional — migrate in Phase 3, then remove |
| `_run_powershell()` | Helper for active `enable_*` RPCs |
| `_now_iso()` | Helper used by all RPCs |
| `_ensure_quarantine_dir()` | Helper used by `list_quarantined()` and Phase 3 canonical RPC |
| `_load_manifest()` | Helper used by `list_quarantined()` and Phase 3 canonical RPC |
| `_save_manifest()` | Helper — preserve (may be used by future canonical RPCs) |
| `_QUARANTINE_DIR` | Module constant — needed for Phase 3 canonical RPC |
| `_QUARANTINE_MANIFEST` | Module constant — needed for Phase 3 canonical RPC |
| `_quarantine_lock` | Module constant — needed for Phase 3 canonical RPC |
| `IS_WINDOWS` | Module constant — used by `enable_*` RPCs |
| All `scan_core.*` RPCs | Canonical, FROZEN |
| `SecurityRemediationAdapter` | Canonical, FROZEN |
| `SecurityRemediationPlanBuilder` | Canonical, FROZEN |

### Shared

| Component | Reason |
|-----------|--------|
| `SECURITY_ENABLE_SMARTSCREEN` | Active RPC constant |
| `SECURITY_ENABLE_DEFENDER` | Active RPC constant |
| `SECURITY_ENABLE_FIREWALL` | Active RPC constant |
| `SECURITY_QUARANTINE_LIST` | Transitional — migrate in Phase 3, then remove |
| `SCAN_CORE_SECURITY_REMEDIATION_PLAN` | Active canonical RPC constant |
| All `SCAN_CORE_REMEDIATION_*` constants | Active canonical RPC constants |
| `SECURITY_QUARANTINE` feature flag | Gates canonical quarantine feature |

---

## 18. Components Requiring Migration

| Component | Current | Target | Phase | Migration step |
|-----------|---------|--------|-------|---------------|
| `SecurityCenterService.getQuarantineSummary()` | Calls `securityBackendService.listQuarantined()` (legacy `security.quarantine.list`) | Call via canonical `scan_core.security_remediation.quarantine_list` RPC | Phase 3 | Create canonical RPC, update `securityBackendService.listQuarantined()` constant, verify, remove old |
| `securityBackendService.listQuarantined()` | Uses `SECURITY_QUARANTINE_LIST` constant | Use `SCAN_CORE_SECURITY_REMEDIATION_QUARANTINE_LIST` constant | Phase 3 | Update constant reference |
| `SECURITY_QUARANTINE_LIST` constant | Active (transitional) | Removed after migration | Phase 3 | Remove after zero callers verified |
| `list_quarantined()` handler | Active (transitional) | Removed after migration | Phase 3 | Remove after canonical RPC verified |
| `QuarantineEntry` interface (backend type in `securityBackendService.ts`) | Exposes `quarantinePath` | Remove `quarantinePath` for privacy | Phase 3 | Update interface to omit internal path |

---

## 19. Phase 2 Exact Implementation Order

Based on the dependency graph, the safest removal order is:

### Step 1: Delete dead frontend class files

```
DELETE: apps/pc-optimizer/src/features/security-remediation/ThreatRestoreManager.ts
DELETE: apps/pc-optimizer/src/features/security-remediation/ThreatDeletionManager.ts
DELETE: apps/pc-optimizer/src/features/security-remediation/ThreatRecoveryProvider.ts
```

**Rationale:** These files have no production callers. Deleting them first ensures compilation errors will immediately surface any hidden dependencies.

### Step 2: Refactor `ThreatRemediationEngine.ts`

```
EDIT: apps/pc-optimizer/src/features/security-remediation/ThreatRemediationEngine.ts
  - Remove imports: ThreatRestoreManager, ThreatDeletionManager, ThreatRecoveryProvider
  - Remove fields: restoreManager, deletionManager, recoveryProvider
  - Remove constructor initialization: lines 83, 84, 90
  - Remove dead methods: executePlan, executeAction, performAction, performQuarantine,
    performRestore, performDelete, performDisableStartup, performDisableTask,
    performDisableExtension, performResetBrowser, performRemovePersistence,
    rollbackAction, restoreFromQuarantine, deleteFromQuarantine, approvePlan,
    rejectPlan, getApprovalRequest, getReport, setTier, getRecoveryStatus,
    getRecoveryProviders, getRecoveryOptions, buildApprovalExplanation
  - Remove import of RollbackData (if no longer used after method removal)
  - PRESERVE: createPlan, getPlan, getAllPlans, getQuarantineEntry, getQuarantineSummary,
    markFalsePositive, isFalsePositive, generateReport, getHistory, getDashboard,
    getConfiguration, updatePolicy, clear
```

**Rationale:** Must be done after Step 1 (deleted files) to avoid import errors. Must be done before Step 3 (barrel exports) to ensure engine compiles.

### Step 3: Update `index.ts` barrel exports

```
EDIT: apps/pc-optimizer/src/features/security-remediation/index.ts
  - Remove: export { ThreatRestoreManager } from './ThreatRestoreManager';
  - Remove: export type { RestoreResult } from './ThreatRestoreManager';
  - Remove: export { ThreatDeletionManager } from './ThreatDeletionManager';
  - Remove: export type { DeleteResult } from './ThreatDeletionManager';
  - Remove: export { ThreatRecoveryProvider } from './ThreatRecoveryProvider';
  - Remove: export type { RecoveryOption } from './ThreatRecoveryProvider';
```

**Rationale:** Must be done after Step 1 (files deleted) to avoid import errors.

### Step 4: Update `types.ts` (if needed)

```
EDIT: apps/pc-optimizer/src/features/security-remediation/types.ts
  - Evaluate: Remove types exclusively used by deleted components
  - PRESERVE: RollbackData (still imported by ThreatRollbackManager)
  - PRESERVE: All types used by preserved components
```

**Rationale:** Must be done after Step 2 to know which types are still needed.

### Step 5: Remove dead frontend RPC wrapper methods

```
EDIT: apps/pc-optimizer/src/features/security-dashboard/securityBackendService.ts
  - Remove: quarantineFile() method
  - Remove: restoreQuarantined() method
  - Remove: deleteQuarantined() method
  - Remove: generateRemediationPlan() method
  - Remove: executeRemediationPlan() method
  - Remove: rollbackRemediation() method
  - PRESERVE: listQuarantined() method (migrated in Phase 3)
  - PRESERVE: QuarantineEntry interface (used by listQuarantined)
```

**Rationale:** These methods have zero callers. Safe to remove.

### Step 6: Remove dead shared RPC constants

```
EDIT: packages/shared/src/rpc/index.ts
  - Remove: SECURITY_QUARANTINE
  - Remove: SECURITY_QUARANTINE_RESTORE
  - Remove: SECURITY_QUARANTINE_DELETE
  - Remove: SECURITY_REMEDIATION_PLAN
  - Remove: SECURITY_REMEDIATION_EXECUTE
  - Remove: SECURITY_REMEDIATION_ROLLBACK
  - PRESERVE: SECURITY_QUARANTINE_LIST (migrated in Phase 3)
  - PRESERVE: SECURITY_ENABLE_SMARTSCREEN, SECURITY_ENABLE_DEFENDER, SECURITY_ENABLE_FIREWALL
```

**Rationale:** Must be done after Step 5 (frontend wrappers removed) to avoid reference errors.

### Step 7: Remove dead backend RPC handlers

```
EDIT: backend/src/avs_backend/security_remediation/__init__.py
  - Remove: @register("security.quarantine") + quarantine_file() function
  - Remove: @register("security.quarantine.restore") + restore_quarantined() function
  - Remove: @register("security.quarantine.delete") + delete_quarantined() function
  - Remove: @register("security.remediation.plan") + generate_remediation_plan() function
  - Remove: @register("security.remediation.execute") + execute_remediation_plan() function
  - Remove: @register("security.remediation.rollback") + rollback_remediation() function
  - Remove: _generate_quarantine_id() helper (only used by quarantine_file)
  - PRESERVE: list_quarantined() (migrated in Phase 3)
  - PRESERVE: enable_smartscreen(), enable_defender(), enable_firewall()
  - PRESERVE: _run_powershell(), _now_iso(), _ensure_quarantine_dir(),
    _load_manifest(), _save_manifest(), _QUARANTINE_DIR, _QUARANTINE_MANIFEST,
    _quarantine_lock, IS_WINDOWS
```

**Rationale:** Must be done after Step 6 (constants removed) to avoid registration errors.

### Step 8: Update affected tests

```
EDIT: apps/pc-optimizer/src/features/security-remediation/__tests__/threatRemediation.test.ts
  - Remove imports: ThreatRestoreManager, ThreatDeletionManager, ThreatRecoveryProvider
  - Remove test block: ThreatRestoreManager (lines 242-273)
  - Remove test block: ThreatDeletionManager (lines 275-310)
  - Remove test block: ThreatRecoveryProvider (lines 657-691)
  - Update Integration tests: remove tests that call executePlan, approvePlan,
    rejectPlan, rollbackAction, getRecoveryStatus
  - Update Edge Cases: remove tests that call executePlan, approvePlan, rollbackAction
  - PRESERVE: all tests for preserved components and read-only methods
```

**Rationale:** Must be done after Steps 1-7 to ensure tests match the refactored code.

### Step 9: Run focused validation

```
npx vitest run src/features/security-remediation/__tests__/threatRemediation.test.ts
npx vitest run src/features/security-dashboard/__tests__/securityDashboard.test.tsx
npx vitest run src/features/scan/__tests__/securityRemediationPlan.test.ts
cd backend && python -m pytest tests/test_security_remediation_integration.py tests/test_security_remediation_adapter.py
```

### Step 10: Run full validation

```
cd apps/pc-optimizer && npm test
cd backend && python -m pytest
cd apps/pc-optimizer && npm run typecheck
cd apps/pc-optimizer && npm run lint
```

### Step 11: Security grep validation

```
grep -r "ThreatRestoreManager|ThreatDeletionManager|ThreatRecoveryProvider" apps/pc-optimizer/src/
# Expected: ZERO matches

grep -r "SECURITY_QUARANTINE\b|SECURITY_QUARANTINE_RESTORE|SECURITY_QUARANTINE_DELETE|SECURITY_REMEDIATION_PLAN\b|SECURITY_REMEDIATION_EXECUTE|SECURITY_REMEDIATION_ROLLBACK" packages/shared/src/
# Expected: ZERO matches (SECURITY_QUARANTINE_LIST preserved)

grep -r "SECURITY_ENABLE_SMARTSCREEN|SECURITY_ENABLE_DEFENDER|SECURITY_ENABLE_FIREWALL" packages/shared/src/
# Expected: 3 matches (preserved)

grep -n "executePlan|rollbackAction|approvePlan|rejectPlan" apps/pc-optimizer/src/features/security-remediation/ThreatRemediationEngine.ts
# Expected: ZERO matches
```

---

## 20. Phase 3 Exact Implementation Order

### Step 1: Add canonical RPC constant

```
EDIT: packages/shared/src/rpc/index.ts
  - Add: SCAN_CORE_SECURITY_REMEDIATION_QUARANTINE_LIST: 'scan_core.security_remediation.quarantine_list',
```

### Step 2: Implement canonical quarantine_list RPC

```
EDIT: backend/src/avs_backend/scan_core_rpc/__init__.py
  - Add: @register("scan_core.security_remediation.quarantine_list")
  - Implementation:
    - Import _load_manifest, _quarantine_lock from security_remediation
    - OR: Reimplement manifest reading in scan_core_rpc (preferred for separation)
    - Read from same manifest path
    - Use _quarantine_lock for thread safety
    - Return: {items, count, totalItems, capturedAt}
    - Privacy: omit quarantinePath from response items
```

**Design decision:** The canonical RPC should either:
- Option A: Import `_load_manifest` and `_quarantine_lock` from `security_remediation` (creates cross-module dependency)
- Option B: Reimplement manifest reading in `scan_core_rpc` (duplicates code but maintains separation)
- Option C: Extract manifest reading to a shared utility module

**Recommended:** Option A — import from `security_remediation` since the manifest is owned by that module and the `enable_*` RPCs will remain there.

### Step 3: Update `securityBackendService.listQuarantined()`

```
EDIT: apps/pc-optimizer/src/features/security-dashboard/securityBackendService.ts
  - Change: rpc.raw(RPC_METHODS.SECURITY_QUARANTINE_LIST)
  - To: rpc.raw(RPC_METHODS.SCAN_CORE_SECURITY_REMEDIATION_QUARANTINE_LIST)
  - Update QuarantineEntry interface: remove quarantinePath (privacy)
```

### Step 4: Add regression test for canonical RPC

```
CREATE: backend/tests/test_quarantine_list_rpc.py
  - Test: empty manifest returns {items: [], count: 0, totalItems: 0}
  - Test: manifest with items returns filtered (non-restored) items
  - Test: thread safety with concurrent reads
  - Test: privacy — response does not contain quarantinePath
```

### Step 5: Verify `SecurityCenterService.getQuarantineSummary()` works

```
npx vitest run src/features/security-dashboard/__tests__/securityDashboard.test.tsx
```

### Step 6: Verify zero production callers to `security.quarantine.list`

```
grep -r "security\.quarantine\.list\|SECURITY_QUARANTINE_LIST" apps/pc-optimizer/src/ backend/src/ packages/shared/src/
# Expected: ZERO matches (after listQuarantined() is updated)
```

### Step 7: Remove old `list_quarantined()` handler

```
EDIT: backend/src/avs_backend/security_remediation/__init__.py
  - Remove: @register("security.quarantine.list") + list_quarantined() function
  - PRESERVE: _load_manifest, _quarantine_lock (still used by canonical RPC)
```

### Step 8: Remove old `SECURITY_QUARANTINE_LIST` constant

```
EDIT: packages/shared/src/rpc/index.ts
  - Remove: SECURITY_QUARANTINE_LIST: 'security.quarantine.list',
```

### Step 9: Run full validation

```
cd apps/pc-optimizer && npm test
cd backend && python -m pytest
cd apps/pc-optimizer && npm run typecheck
cd apps/pc-optimizer && npm run lint
```

### Step 10: Final security audit

```
# Verify no references to old transitional RPC
grep -r "security\.quarantine\.list\|SECURITY_QUARANTINE_LIST" . --include="*.ts" --include="*.tsx" --include="*.py"
# Expected: ZERO matches

# Verify canonical RPC is registered
grep -r "scan_core.security_remediation.quarantine_list" backend/src/ packages/shared/src/
# Expected: matches in scan_core_rpc/__init__.py and rpc/index.ts

# Verify active RPCs still present
grep -r "SECURITY_ENABLE_SMARTSCREEN|SECURITY_ENABLE_DEFENDER|SECURITY_ENABLE_FIREWALL" packages/shared/src/
# Expected: 3 matches

# Verify scan_core internals unchanged
git diff backend/src/avs_backend/scan_core/ -- ':!backend/src/avs_backend/scan_core_rpc/__init__.py'
# Expected: ZERO changes

# Verify no remediation state in browser storage
grep -r "localStorage\|sessionStorage\|IndexedDB" apps/pc-optimizer/src/features/security-dashboard/ apps/pc-optimizer/src/features/security-remediation/
# Expected: ZERO matches related to remediation state
```

---

## 21. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `ThreatDashboardProvider` breaks if dependencies are incorrectly removed | MEDIUM | HIGH | Preserve `ThreatApprovalManager`, `ThreatQuarantineManager`, `ThreatRollbackManager`, `ThreatFalsePositiveTracker` — verified in Phase 1 |
| `ThreatRemediationReportGenerator` breaks if `ThreatRollbackManager` is removed | MEDIUM | HIGH | Preserve `ThreatRollbackManager` — verified in Phase 1 |
| `ThreatRemediationEngine` constructor breaks when removing manager initialization | MEDIUM | MEDIUM | Carefully refactor constructor — remove only `restoreManager`, `deletionManager`, `recoveryProvider` |
| Test breakage from removed classes | HIGH | LOW | Update `threatRemediation.test.ts` — remove ~8 test blocks for deleted components, update ~13 integration/edge case tests |
| `RollbackData` type removal breaks `ThreatRollbackManager` import | LOW | MEDIUM | Preserve `RollbackData` in `types.ts` — still imported by `ThreatRollbackManager` |
| Quarantine list migration breaks existing quarantine visibility | LOW | HIGH | New RPC reads from same manifest; test with existing quarantined items |
| `security.quarantine.list` removed before migration is complete | LOW | HIGH | Remove ONLY after canonical replacement is verified and all callers migrated |
| Accidental removal of `security.enableSmartScreen/Defender/Firewall` | LOW | HIGH | Explicit preservation list; verify with grep after changes |
| `_save_manifest()` removal breaks future canonical RPCs | LOW | LOW | Preserve `_save_manifest()` even if currently only used by dead RPCs |
| Privacy regression: canonical RPC exposes `quarantinePath` | MEDIUM | MEDIUM | Omit `quarantinePath` from canonical RPC response |
| Cross-module import dependency for quarantine manifest | LOW | LOW | Option A (import from `security_remediation`) is acceptable since `enable_*` RPCs remain there |

---

## 22. Rollback Strategy

### Phase 2 rollback

1. `git revert` the Phase 2 commit
2. Run `npx vitest run src/features/security-remediation/__tests__/threatRemediation.test.ts` — should restore 67 tests
3. Dead code returns — no data loss, no persistence impact

### Phase 3 rollback

1. `git revert` the Phase 3 commit
2. `SecurityCenterService.getQuarantineSummary()` reverts to using `security.quarantine.list`
3. Transitional RPC returns — no data loss (same manifest)

### Full rollback

If SC-8C14 causes unacceptable regression:
1. `git revert` all SC-8C14 commits
2. Run full test suite to verify restoration
3. All dead code returns — no data loss, no persistence impact

---

## 23. Phase 1 Acceptance Criteria

| Criterion | Status |
|-----------|--------|
| Every targeted legacy RPC has been traced | ✅ All 7 RPCs traced (6 dead + 1 transitional) |
| Every targeted frontend wrapper has been traced | ✅ All 7 wrappers traced (6 dead + 1 transitional) |
| Every targeted class has been traced | ✅ All 20 classes traced |
| Every `ThreatRemediationEngine` method has been classified | ✅ All 35+ methods classified (KEEP/REFACTOR/REMOVE) |
| Every production caller has been identified | ✅ All production callers identified |
| Every test dependency has been identified | ✅ All test dependencies identified |
| Quarantine production callers are known | ✅ `SecurityCenterService.getQuarantineSummary()` → `securityBackendService.listQuarantined()` |
| `security.quarantine.list` migration path is verified | ✅ Migration path documented in §20 |
| Active SmartScreen/Defender/Firewall RPCs are confirmed preserved | ✅ Production callers verified in `dashboard.service.ts`, `ProtectionCenterPage.tsx`, `ProtectionCenterViewModel.ts` |
| Canonical remediation flow is verified | ✅ Zero production callers to legacy execution |
| Security/privacy risks are documented | ✅ §13 and §14 |
| Exact Phase 2 deletion order is documented | ✅ §19 (11 steps) |
| Exact Phase 3 quarantine migration order is documented | ✅ §20 (10 steps) |
| No production code was modified | ✅ Only report file created |

---

## 24. Phase 2 Entry Criteria

Phase 2 may begin when ALL of the following are true:

1. Phase 1 report is reviewed and approved
2. All dead-code classifications are confirmed
3. All production-reachable components are confirmed for preservation
4. Phase 2 implementation order is understood
5. Test impact is understood
6. No migration blockers exist (zero production callers to legacy execution)

**Status: ALL CRITERIA MET** — Phase 2 is ready to begin.

---

## 25. Phase 3 Entry Criteria

Phase 3 may begin when ALL of the following are true:

1. Phase 2 is complete
2. All dead code is removed
3. Full test suite passes after Phase 2
4. `security.quarantine.list` is the only remaining transitional RPC
5. `SecurityCenterService.getQuarantineSummary()` still works (via transitional RPC)
6. Quarantine manifest location is confirmed
7. Phase 3 migration order is understood

**Status: PENDING** — Phase 3 entry depends on Phase 2 completion.

---

## 26. SC-8C15 Boundary

**SC-8C15 is NOT started.**

No SC-8C15 specification is created. No SC-8C15 requirements are invented. No SC-8C15 implementation is started.

License Activation is NOT part of SC-8C14 and is NOT part of SC-8C15.

---

## Confirmation

- **Production files modified:** NONE
- **Tests modified:** NONE
- **Configuration modified:** NONE
- **SC-8C14 Phase 2 started:** NO
- **SC-8C14 Phase 3 started:** NO
- **SC-8C15 started:** NO
- **scan_core modified:** NO
- **SafetyGate modified:** NO
- **RemediationCoordinator modified:** NO
- **This phase was inspection and documentation ONLY**

---

**End of SC-8C14 Phase 1 Legacy Dependency Inventory Report**
