# SC-8C11 Phase Plan — Smart Optimization Remediation Integration

## Overview

**Objective:** Integrate Smart Optimization remediation into canonical `scan_core.remediation.*` workflow

**Total Phases:** 5

**Estimated Duration:** 6-10 days

**Approach:** Incremental integration with validation after each phase

---

## Phase 1: Backend Rule Adapters

### Objective

Create Smart Optimization rule adapters for `scan_core` rule registry

### Duration

1-2 days

### Files Changed

**New Files:**
- `backend/src/avs_backend/scan_core/rules/smart_optimization_rules.py`
- `backend/tests/test_smart_optimization_rules.py`

**Modified Files:**
- `backend/src/avs_backend/scan_core/rules/registry.py`

### Implementation Steps

1. **Create `smart_optimization_rules.py`**
   - Define Smart Optimization action types
   - Map action types to rule categories:
     - `clean_temp_files` → `delete_file`
     - `clean_browser_cache` → `delete_file`
     - `empty_recycle_bin` → `delete_file`
     - `clear_browser_privacy` → `delete_file`
     - `clear_privacy_traces` → `delete_file`
     - `disable_startup_entry` → `disable_startup`
     - `clean_registry` → `modify_registry`
     - `close_background_process` → `terminate_process`
     - `run_windows_update` → `informational`
     - `optimize_disk` → `informational`
   - Create rule definitions with:
     - `rule_id`
     - `rule_category`
     - `severity`
     - `confidence`
     - `safety`
     - `reason`
     - `recommended_action`

2. **Register rules in `registry.py`**
   - Import `smart_optimization_rules`
   - Register Smart Optimization rules in `RuleRegistry`

3. **Create `test_smart_optimization_rules.py`**
   - Test action type → rule category mapping
   - Test rule registration
   - Test rule validation
   - Test SafetyGate validation for each action type

### Acceptance Criteria

- [ ] Smart Optimization action types mapped to rule categories
- [ ] Smart Optimization rules registered in `RuleRegistry`
- [ ] 10-15 backend unit tests created
- [ ] All tests pass: `python -m pytest -q tests/test_smart_optimization_rules.py`
- [ ] Backend full suite passes: `python -m pytest -q` (1251+ passed, 14 skipped)

### Validation Commands

```bash
cd backend

# Smart Optimization rule adapter tests
python -m pytest -q tests/test_smart_optimization_rules.py

# Full backend suite
python -m pytest -q
```

### Risks

**Low** — Isolated backend changes, no production impact

### Rollback Plan

Delete new files, revert `registry.py` changes

---

## Phase 2: Backend Integration

### Objective

Integrate Smart Optimization findings into `scan_core` ActionPlan

### Duration

1-2 days

### Files Changed

**New Files:**
- `backend/src/avs_backend/scan_core/adapters/smart_optimization_adapter.py`
- `backend/tests/test_smart_optimization_integration.py`

**Modified Files:**
- `backend/src/avs_backend/scan_core_rpc/__init__.py`

### Implementation Steps

1. **Create `smart_optimization_adapter.py`**
   - Define `SmartOptimizationFindingAdapter`
   - Convert Smart Optimization action to `scan_core` finding:
     ```python
     def convert_action_to_finding(action: OptimizationAction) -> ScanFinding:
         return ScanFinding(
             finding_id=action.id,
             display_name=action.title,
             rule_id=f"smart_opt_{action.type}",
             rule_category=ACTION_TYPE_TO_CATEGORY[action.type],
             severity=IMPACT_TO_SEVERITY[action.impact],
             confidence=1.0,
             safety=RISK_TO_SAFETY[action.risk],
             reason=action.description,
             recommended_action=CATEGORY_TO_ACTION[ACTION_TYPE_TO_CATEGORY[action.type]],
             estimated_size=action.estimatedRecoveryMB * 1024 * 1024,
             is_blocked=False,
             requires_review=action.risk in ['high', 'severe'],
             is_actionable=True,
             canonical_path=""  # redacted
         )
     ```

2. **Modify `scan_core_rpc/__init__.py`**
   - Add Smart Optimization finding conversion in `scan.result` RPC handler
   - Convert Smart Optimization actions to `scan_core` findings
   - Persist ActionPlan to `ActionPlanRepository`

3. **Create `test_smart_optimization_integration.py`**
   - Test Smart Optimization action → finding conversion
   - Test ActionPlan persistence
   - Test finding sanitization (no `canonical_path`, `asset_id`, `backup_location`)
   - Test end-to-end scan → ActionPlan flow

### Acceptance Criteria

- [ ] Smart Optimization findings converted to `scan_core` findings format
- [ ] Smart Optimization ActionPlan persisted to `ActionPlanRepository`
- [ ] Finding sanitization verified (privacy-safe)
- [ ] 5-10 backend integration tests created
- [ ] All tests pass: `python -m pytest -q tests/test_smart_optimization_integration.py`
- [ ] Backend full suite passes: `python -m pytest -q` (1251+ passed, 14 skipped)

### Validation Commands

```bash
cd backend

# Smart Optimization integration tests
python -m pytest -q tests/test_smart_optimization_integration.py

# Full backend suite
python -m pytest -q
```

### Risks

**Low** — Isolated adapter changes, no production impact

### Rollback Plan

Delete new files, revert `scan_core_rpc/__init__.py` changes

---

## Phase 3: Frontend Remediation Integration

### Objective

Migrate Smart Optimization execution from `executionHandler.ts` to `useResults` hook

### Duration

2-3 days

### Files Changed

**Deleted Files:**
- `apps/pc-optimizer/src/features/smart-optimization-ai/executionHandler.ts`
- `apps/pc-optimizer/src/features/smart-optimization-ai/OptimizationExecutionCoordinator.ts`

**Modified Files:**
- `apps/pc-optimizer/src/features/smart-optimization-ai/SmartOptimizationPage.tsx`

**New Files:**
- `apps/pc-optimizer/src/features/smart-optimization-ai/__tests__/smartOptimizationRemediation.test.tsx`

**Updated Files:**
- `apps/pc-optimizer/src/features/smart-optimization-ai/__tests__/SmartOptimization.test.ts`

### Implementation Steps

1. **Modify `SmartOptimizationPage.tsx`**
   - Remove `executionHandler` imports
   - Remove `OptimizationExecutionCoordinator` imports
   - Add `ResultsView` import
   - Add `ResultsView` component after Smart Optimization dashboard panels:
     ```tsx
     {/* Smart Optimization Dashboard (existing) */}
     <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
       {/* Summary cards */}
     </div>
     
     {/* Optimization Plan Panel (existing) */}
     {plan && <OptimizationPlanPanel plan={plan} />}
     
     {/* Preview Panel (existing) */}
     {preview && <PreviewPanel preview={preview} />}
     
     {/* Simulation Panel (existing) */}
     {simulation && <SimulationPanel simulation={simulation} />}
     
     {/* Insights Panel (existing) */}
     {insights && <InsightsPanel insights={insights} />}
     
     {/* Remediation (NEW) */}
     <ResultsView
       module="optimize"
       moduleName="AI Smart Optimization"
       onClose={() => {}}
     />
     ```

2. **Delete `executionHandler.ts`**
   - Remove file
   - Remove all imports

3. **Delete `OptimizationExecutionCoordinator.ts`**
   - Remove file
   - Remove all imports

4. **Update `SmartOptimization.test.ts`**
   - Remove `executionHandler` test assertions
   - Remove `OptimizationExecutionCoordinator` test assertions
   - Add `ResultsView` test assertions

5. **Create `smartOptimizationRemediation.test.tsx`**
   - Test Smart Optimization scan → results → remediation
   - Test Smart Optimization prepare → validate → approve → execute
   - Test Smart Optimization execution progress
   - Test Smart Optimization terminal states
   - Test Smart Optimization rollback
   - Test Smart Optimization AI engine remains functional

### Acceptance Criteria

- [ ] Smart Optimization uses `ResultsView` for remediation
- [ ] Smart Optimization execution routed through `scan_core.remediation.execute`
- [ ] Smart Optimization rollback routed through `scan_core.remediation.rollback`
- [ ] `executionHandler.ts` deleted
- [ ] `OptimizationExecutionCoordinator.ts` deleted
- [ ] Smart Optimization AI engine functional (plan, preview, simulation, insights)
- [ ] 5-10 frontend tests created
- [ ] All tests pass: `npx vitest run src/features/smart-optimization-ai/__tests__/`
- [ ] Frontend full suite passes: `npx vitest run src/features/scan/__tests__/ src/features/dashboard/__tests__/ src/features/smart-optimization-ai/__tests__/` (274+ passed)

### Validation Commands

```bash
cd apps/pc-optimizer

# Typecheck
yarn typecheck

# Lint
yarn lint

# Smart Optimization tests
npx vitest run src/features/smart-optimization-ai/__tests__/

# Full frontend suite
npx vitest run src/features/scan/__tests__/ src/features/dashboard/__tests__/ src/features/smart-optimization-ai/__tests__/
```

### Risks

**Medium** — UI changes, user-facing

**Mitigation:**
- Preserve existing Smart Optimization dashboard, preview, simulation, insights panels
- Only add `ResultsView` for remediation
- Add comprehensive tests
- Manual testing before merge

### Rollback Plan

Restore `executionHandler.ts` and `OptimizationExecutionCoordinator.ts`, revert `SmartOptimizationPage.tsx` changes

---

## Phase 4: Validation & Testing

### Objective

Run full validation suite and verify SC-8C10 baseline maintained

### Duration

1-2 days

### Files Changed

**None** — Validation only

### Implementation Steps

1. **Backend Validation**
   - Run full backend test suite
   - Verify 1251+ passed, 14 skipped
   - Verify no new failures

2. **Frontend Validation**
   - Run typecheck
   - Run lint (0 warnings)
   - Run full frontend test suite
   - Verify 274+ passed
   - Verify no new failures

3. **Production Build**
   - Run production build
   - Verify build passes
   - Verify no new warnings

4. **Manual Testing**
   - Test Smart Optimization scan
   - Test Smart Optimization plan generation
   - Test Smart Optimization preview
   - Test Smart Optimization simulation
   - Test Smart Optimization insights
   - Test Smart Optimization remediation (prepare → validate → approve → execute)
   - Test Smart Optimization rollback
   - Test Smart Optimization dashboard summary

5. **Security Validation**
   - Verify Smart Optimization actions validated by SafetyGate
   - Verify Smart Optimization execution requires explicit approval
   - Verify Smart Optimization rollback requires explicit confirmation
   - Verify Smart Optimization execution persisted to ExecutionRepository
   - Verify Smart Optimization execution prevents duplicates via ExecutionLedger
   - Verify Smart Optimization execution rejects stale plans
   - Verify Smart Optimization RPC responses privacy-safe (no `canonical_path`, `asset_id`, `backup_location`)

### Acceptance Criteria

- [ ] Backend tests: 1251+ passed, 14 skipped
- [ ] Frontend tests: 274+ passed
- [ ] `yarn typecheck` passes
- [ ] `yarn lint` passes (0 warnings)
- [ ] `yarn build` passes
- [ ] Smart Optimization AI engine functional (plan, preview, simulation, insights)
- [ ] Smart Optimization remediation functional (prepare, validate, approve, execute, rollback)
- [ ] Smart Optimization actions validated by SafetyGate
- [ ] Smart Optimization execution requires explicit approval
- [ ] Smart Optimization rollback requires explicit confirmation
- [ ] Smart Optimization execution persisted
- [ ] Smart Optimization execution prevents duplicates
- [ ] Smart Optimization execution rejects stale plans
- [ ] Smart Optimization RPC responses privacy-safe

### Validation Commands

```bash
# Backend
cd backend
python -m pytest -q

# Frontend
cd apps/pc-optimizer
yarn typecheck
yarn lint
npx vitest run src/features/scan/__tests__/ src/features/dashboard/__tests__/ src/features/smart-optimization-ai/__tests__/
yarn build
```

### Risks

**Low** — Validation only

### Rollback Plan

N/A — Validation only, no code changes

---

## Phase 5: Documentation & Cleanup

### Objective

Document SC-8C11 completion and cleanup

### Duration

1 day

### Files Changed

**New Files:**
- `apps/pc-optimizer/SC8C11_COMPLETION_REPORT.md`

### Implementation Steps

1. **Create `SC8C11_COMPLETION_REPORT.md`**
   - Executive summary
   - Implementation phases completed
   - Files changed
   - Tests added
   - Validation results
   - Known limitations
   - Remaining work (deferred to future phases)
   - Production readiness verdict

2. **Update `PROJECT_STATUS.md`**
   - Mark SC-8C11 as complete
   - Update feature matrix

3. **Update `FEATURE_MATRIX.md`**
   - Mark Smart Optimization remediation as complete

### Acceptance Criteria

- [ ] SC-8C11 completion report created
- [ ] All implementation phases documented
- [ ] Validation results documented
- [ ] Known limitations documented
- [ ] SC-8C12 not started
- [ ] `PROJECT_STATUS.md` updated
- [ ] `FEATURE_MATRIX.md` updated

### Validation Commands

```bash
# Verify documentation exists
ls apps/pc-optimizer/SC8C11_COMPLETION_REPORT.md
```

### Risks

**None** — Documentation only

### Rollback Plan

N/A — Documentation only

---

## Summary

### Total Effort

| Phase | Duration | Risk | Dependencies |
|-------|----------|------|--------------|
| Phase 1: Backend Rule Adapters | 1-2 days | Low | None |
| Phase 2: Backend Integration | 1-2 days | Low | Phase 1 |
| Phase 3: Frontend Remediation Integration | 2-3 days | Medium | Phase 2 |
| Phase 4: Validation & Testing | 1-2 days | Low | Phase 3 |
| Phase 5: Documentation & Cleanup | 1 day | None | Phase 4 |
| **Total** | **6-10 days** | **Low-Medium** | **Sequential** |

### Critical Path

```
Phase 1 (Backend Rules)
  ↓
Phase 2 (Backend Integration)
  ↓
Phase 3 (Frontend Integration)
  ↓
Phase 4 (Validation)
  ↓
Phase 5 (Documentation)
```

### Validation Baseline

**Must match or exceed SC-8C10 baseline:**
- ✅ Backend: 1251 passed, 14 skipped (or more passed)
- ✅ Frontend: 274 passed (or more passed)
- ✅ Typecheck: PASS
- ✅ Lint: PASS (0 warnings)
- ✅ Build: PASS

### Success Criteria

- [ ] Smart Optimization remediation integrated into canonical `scan_core.remediation.*` flow
- [ ] Smart Optimization AI engine preserved (plan, preview, simulation, insights)
- [ ] Smart Optimization UI preserved (dashboard, preview, simulation, insights panels)
- [ ] Parallel execution system deleted (`executionHandler.ts`, `OptimizationExecutionCoordinator.ts`)
- [ ] All three modules (Protection, Security, Smart Optimization) use identical safety model
- [ ] SC-8C10 security invariants preserved
- [ ] SC-8C10 validation baseline maintained
- [ ] No new RPC methods created
- [ ] No SafetyGate weakening
- [ ] No RemediationCoordinator bypassing
- [ ] No ExecutionLedger bypassing
- [ ] No automatic remediation introduced
- [ ] No automatic resume introduced
- [ ] No automatic rollback introduced
- [ ] SC-8C12 not started

---

**End of Phase Plan**
