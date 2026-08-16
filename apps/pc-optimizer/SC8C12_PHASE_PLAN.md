# SC-8C12 Phase Plan — Security Center Remediation Integration

**Date:** 2026-08-16  
**Specification:** `SC8C12_SPECIFICATION.md`  
**Status:** AUTHORITATIVE — ready for implementation

---

## Phase Overview

| Phase | Description | Deliverables |
|-------|-------------|--------------|
| Phase 1 | Domain inspection + adapter design | Inspection report, mapping table, RPC contract design |
| Phase 2 | SecurityRemediationAdapter | Backend adapter, adapter tests |
| Phase 3 | SecurityRemediationPlanBuilder + planning RPC | Backend plan builder, RPC registration, RPC tests |
| Phase 4 | Frontend remediation handoff | `useSecurityRemediationPlan` hook, `SecurityCenterPage` changes, frontend tests |
| Phase 5 | Legacy disconnection + validation | Production caller disconnection, full test suite, security audit, validation report |

---

## Phase 1: Domain Inspection + Adapter Design

**Objective:** Document the Security Center domain model and design the adapter mapping.

**Tasks:**
1. Inspect Security Center frontend (Page, ViewModel, Service) — ✅ completed in specification
2. Inspect `ThreatRemediationEngine` and all sub-managers — ✅ completed in specification
3. Inspect `security_remediation` backend — ✅ completed in specification
4. Inspect `scan_core` architecture (ActionType, ActionTarget, executors, coordinator) — ✅ completed in specification
5. Determine quarantine architecture decision — ✅ completed (Classification B)
6. Design action type mapping table — ✅ completed in specification §9
7. Design RPC contract — ✅ completed in specification §16
8. Create `SC8C12_PHASE1_INSPECTION_REPORT.md` (if needed)

**Files Changed:** Documentation only (no production code)

**Acceptance Criteria:**
- [ ] Quarantine architecture decision documented (Classification B)
- [ ] Action type mapping table complete
- [ ] RPC contract designed
- [ ] No production code modified

---

## Phase 2: SecurityRemediationAdapter

**Objective:** Implement the backend adapter that converts Security Center threat remediation actions to canonical `RemediationAction` objects.

**Files Changed:**
- `backend/src/avs_backend/scan_core/adapters/security_remediation_adapter.py` (NEW)
- `backend/tests/test_security_remediation_adapter.py` (NEW)

**Tasks:**
1. Implement `SecurityRemediationAdapter` class
2. Implement `SecurityActionMapping` dataclass
3. Implement `SECURITY_ACTION_MAPPINGS` mapping table
4. Map `quarantine` → `DELETE_FILE` with `backup_required=True`, `rollback_supported=True`
5. Map `delete` → `DELETE_FILE` with `backup_required=False`, `rollback_supported=False`
6. Map `disable_startup_entry` → `DISABLE_STARTUP_ENTRY`
7. Map `remove_persistence` (registry) → `REMOVE_REGISTRY_VALUE`
8. Classify unsupported actions as `NOT_FIXABLE`
9. Classify non-remediation actions as `NOT_FIXABLE`
10. Add adapter tests

**Acceptance Criteria:**
- [ ] Adapter converts all supported security action types to canonical actions
- [ ] Unsupported actions classified as `NOT_FIXABLE`
- [ ] Adapter never executes remediation
- [ ] Adapter never bypasses `SafetyGate`
- [ ] Adapter tests pass

---

## Phase 3: SecurityRemediationPlanBuilder + Planning RPC

**Objective:** Implement the backend plan builder and register the planning RPC.

**Files Changed:**
- `backend/src/avs_backend/scan_core/adapters/security_remediation_plan_builder.py` (NEW)
- `backend/src/avs_backend/scan_core_rpc/__init__.py` (MODIFIED — add `scan_core.security_remediation.plan` RPC)
- `backend/tests/test_security_remediation_plan_builder.py` (NEW)
- `backend/tests/test_sc8c12_rpc_bridge.py` (NEW)

**Tasks:**
1. Implement `SecurityRemediationPlanBuilder` class
2. Implement `_build_action_summary()` function
3. Implement `build_plan()` method — creates `ActionPlan` from adapter output
4. Register `scan_core.security_remediation.plan` RPC in `scan_core_rpc/__init__.py`
5. RPC receives sanitized actions, calls adapter + plan builder, persists via `ActionPlanRepository`
6. RPC returns `plan_id` and statistics
7. Add plan builder tests
8. Add RPC bridge tests

**Acceptance Criteria:**
- [ ] Plan builder creates canonical `ActionPlan` with correct statistics
- [ ] Plan builder persists via `ActionPlanRepository`
- [ ] `scan_core.security_remediation.plan` RPC registered and functional
- [ ] RPC returns backend-generated `plan_id`
- [ ] RPC does NOT execute remediation
- [ ] RPC response is privacy-safe (no raw paths, no asset IDs)
- [ ] Plan builder tests pass
- [ ] RPC bridge tests pass

---

## Phase 4: Frontend Remediation Handoff

**Objective:** Wire the Security Center remediation tab to the canonical `PlanReviewView` → `ResultsView` flow.

**Files Changed:**
- `apps/pc-optimizer/src/features/scan/useSecurityRemediationPlan.ts` (NEW)
- `apps/pc-optimizer/src/features/security-dashboard/SecurityCenterPage.tsx` (MODIFIED — RemediationTab)
- `apps/pc-optimizer/src/features/security-dashboard/SecurityCenterViewModel.ts` (MODIFIED — remediation methods)
- `apps/pc-optimizer/src/features/security-dashboard/SecurityCenterService.ts` (MODIFIED — remediation methods)
- `apps/pc-optimizer/src/features/scan/__tests__/securityRemediationPlan.test.ts` (NEW)
- `apps/pc-optimizer/src/features/security-dashboard/__tests__/SecurityCenterPage.remediation.test.tsx` (NEW or MODIFIED)

**Tasks:**
1. Implement `useSecurityRemediationPlan` hook
   - Accept sanitized Security Center remediation actions
   - Call `scan_core.security_remediation.plan` RPC
   - Manage plan creation state (idle, creating, created, error)
   - Concurrency guard (`isCreatingRef`)
   - Error handling
2. Modify `SecurityCenterPage.tsx` RemediationTab
   - Replace `PlanCard` list with `PlanReviewView`
   - Add `ResultsView` for canonical remediation flow
   - Use `useSecurityRemediationPlan` for plan creation
   - Use `usePlanDetails` for plan hydration
   - Use `useResults` for prepare/validate/approve/execute/rollback
   - Preserve quarantine summary display
3. Modify `SecurityCenterViewModel.ts`
   - `createRemediationPlan()` — return sanitized actions for `useSecurityRemediationPlan`
   - Remove `approvePlan()`, `rejectPlan()`, `executePlan()`, `rollbackAction()` (replaced by `useResults`)
4. Modify `SecurityCenterService.ts`
   - Remove production calls to `ThreatRemediationEngine.createPlan/approvePlan/rejectPlan/executePlan/rollbackAction`
   - Remove production calls to `securityBackendService.generateRemediationPlan/executeRemediationPlan/rollbackRemediation`
   - Retain `securityBackendService.listQuarantined` as transitional measure
5. Add frontend tests

**Acceptance Criteria:**
- [ ] `useSecurityRemediationPlan` hook implemented with concurrency guard
- [ ] `SecurityCenterPage` RemediationTab uses `PlanReviewView` → `ResultsView`
- [ ] `SecurityCenterViewModel` no longer calls `ThreatRemediationEngine` for remediation
- [ ] `SecurityCenterService` no longer calls `ThreatRemediationEngine` for remediation
- [ ] Threat detection/investigation/correlation UI unchanged
- [ ] Frontend tests pass

---

## Phase 5: Legacy Disconnection + Regression/Security Validation

**Objective:** Disconnect all legacy production callers, run full validation, and audit security.

**Files Changed:**
- `apps/pc-optimizer/SC8C12_PHASE5_VALIDATION_REPORT.md` (NEW)

**Tasks:**
1. Verify no production code path calls `ThreatRemediationEngine`
2. Verify no production code path calls `security.remediation.execute` or `security.quarantine`
3. Run full backend suite: `python -m pytest -q`
4. Run full frontend suite: `yarn test`
5. Run typecheck: `yarn typecheck`
6. Run lint: `yarn lint`
7. Run build: `yarn build`
8. Security grep audit:
   - `security.remediation.execute` in production frontend → must be 0
   - `security.quarantine` in production frontend → must be 0 (except transitional list)
   - `ThreatRemediationEngine` in production frontend → must be 0 outside `security-remediation/`
   - `shutil.move` in security remediation backend canonical path → must be 0
   - `os.remove` in security remediation backend canonical path → must be 0
9. Create validation report

**Acceptance Criteria:**
- [ ] No production code path calls `ThreatRemediationEngine`
- [ ] No production code path calls `security.remediation.execute` or `security.quarantine`
- [ ] Full backend suite passes
- [ ] Full frontend suite passes
- [ ] Typecheck passes
- [ ] Lint passes (0 warnings)
- [ ] Build passes
- [ ] Security grep audit clean
- [ ] Validation report created
- [ ] SC-8C13 not started

---

## Phase Dependencies

```
Phase 1 (inspection + design)
  ↓
Phase 2 (adapter)
  ↓
Phase 3 (plan builder + RPC)
  ↓
Phase 4 (frontend handoff)
  ↓
Phase 5 (legacy disconnection + validation)
```

Each phase depends on the previous phase. No phases may be skipped or run in parallel.

---

## Unresolved Architectural Decisions

| Decision | Status | Impact |
|----------|--------|--------|
| Quarantine list query method | **PRODUCT DECISION REQUIRED** — Should it be (a) new RPC `scan_core.security_remediation.quarantine_list`, (b) filter on existing RPC, or (c) keep legacy `security.quarantine.list` as transitional? | Affects Phase 3/4. Recommendation: (a) new dedicated RPC. Transitional (c) is acceptable for initial implementation. |
| `remove_persistence` non-registry cases | **ARCHITECTURAL GAP** — `remove_persistence` may target scheduled tasks, services, or other non-registry persistence. Adapter classifies non-registry cases as `NOT_FIXABLE`. | No blocking impact. User sees "Review Required" for non-registry persistence. |
| Quarantine metadata encryption | **FUTURE ENHANCEMENT** — Current backend doesn't implement encryption. Canonical backup doesn't support encryption. | No blocking impact. Encryption is a future enhancement for both. |

---

**End of SC-8C12 Phase Plan**
