# SC-8C10 Specification — Unified Scan/Remediation Production Finalization

## 1. Objective

SC-8C10 finalizes the unified scan and remediation experience that was built across SC-8C8 and SC-8C9. The goal is to remove the remaining deprecated UI, dead state, and legacy optimization paths from the unified flow, then run a final production-readiness validation. No new scan engine, remediation engine, or executor is created.

Based on repository inspection, the user-visible functionality is complete. SC-8C10 is therefore primarily **integration cleanup, deprecated-code removal, and final validation** rather than new feature development.

---

## 2. Scope

This phase covers:

- Removal of the deprecated `UnifiedOptimizeFlow` component.
- Removal/cleanup of the deprecated dashboard health-scan state machine in `DashboardViewModel`.
- Removal of `ScanStatePersistence` and its `localStorage`/IDB usage for a legacy scan flow.
- Removal or deprecation of the legacy `orchestrator.service.ts` wrapper once tests no longer need it.
- Resolution of the `useUnifiedScan` pause/resume buttons (currently local-only with no backend contract).
- Final cross-module UX consistency checks for `ScanView` in Protection Center, Smart Optimization, and Security Center.
- Final end-to-end validation of the state machine and edge cases.
- Static security/privacy re-verification of the scan/remediation flow.

---

## 3. Out of Scope

The following are **explicitly out of scope** unless the open questions below are resolved:

- Creating a new scan engine.
- Creating a new remediation engine.
- Creating new executors or modifying `SafetyGate`.
- Adding backend `scan.pause` / `scan.resume` RPCs (unless required).
- Automatic remediation, automatic resume, or automatic rollback.
- Integrating the legacy `orchestrator.optimize` / `orchestrator.fullAsync` pipeline.
- Integrating `security.remediation.*` as an alternate path.
- Refactoring unrelated modules (health, hardware, security dashboard, real-time protection, AI workspace).
- SC-8C11 or any later phase.

---

## 4. Existing Capabilities (from SC-8C8 / SC-8C9)

The following capabilities are already in place and must be reused, not rebuilt:

| Capability | Location | Status |
|------------|----------|--------|
| Unified scan UI | `features/scan/ScanView.tsx` | Complete |
| Unified scan hook (scan_core) | `features/scan/useScan.ts` | Complete |
| Results/remediation hook | `features/scan/useResults.ts` | Complete |
| Results UI | `features/scan/ResultsView.tsx` | Complete |
| Plan review / hydration | `features/scan/PlanReviewView.tsx` | Complete |
| Dashboard scan status card | `features/scan/DashboardScanStatusCard.tsx` | Complete |
| Dashboard scan hook | `features/scan/useDashboardScan.ts` | Complete |
| In-memory transient state | `features/scan/unifiedScanState.ts` | Complete |
| scan_core RPC bridge | `backend/src/avs_backend/scan_core_rpc/__init__.py` | Complete |
| Scan orchestrator | `backend/src/avs_backend/scan_core/orchestration/orchestrator.py` | Complete |
| Remediation coordinator | `backend/src/avs_backend/scan_core/orchestration/remediation.py` | Complete |
| Default executor / SafetyGate | `backend/src/avs_backend/scan_core/execution/executor.py` | Complete |
| Action plan and execution repositories | `backend/src/avs_backend/scan_core/metadata/` | Complete |
| Sanitized frontend findings/targets | `PreviewPanel.tsx`, `RollbackConfirmationPanel.tsx`, `scan_core_rpc/__init__.py` | Complete |
| In-flight guards | `useResults.ts` | Complete |
| Backend regression tests | `backend/tests/test_sc8c9_final_hardening.py` | Complete |
| Frontend regression tests | `src/features/scan/__tests__/*.test.tsx` | Complete |

---

## 5. Focus-Area Classification

| # | Focus Area | Classification | Rationale |
|---|------------|----------------|-----------|
| 1 | Final user-facing UX consistency across Protection Center, Smart Optimization, Security Center, and Dashboard | **MOSTLY COMPLETE**; `UnifiedOptimizeFlow.tsx` dead code needs **REMOVAL** | `ScanView` is already shared and used by all three modules. Dashboard navigates to `ScanView`. The only remaining inconsistency is the deprecated `UnifiedOptimizeFlow` component that is no longer rendered. |
| 2 | End-to-end scan/remediation state handling | **ALREADY COMPLETE** | `useScan` and `useResults` cover the full idle → scanning → results → preview → validating → awaiting_approval → executing → terminal → rollback flow. |
| 3 | Edge cases | **REQUIRED** — some need validation and a decision on pause/resume | Duplicate and in-flight guards are in place. Stale/missing plan handling is in place. The only unresolved edge case is `pause/resume` in `useUnifiedScan`, which toggles local UI state but does not call the backend. |
| 4 | Remaining legacy/dead code | **REQUIRED** — removal of identified dead code | `UnifiedOptimizeFlow.tsx`, the `healthScan*` state in `DashboardViewModel.ts`, `ScanStatePersistence.ts`, and `orchestrator.service.ts` are no longer used by the production scan_core path. |
| 5 | Final security/privacy verification | **REQUIRED** as final validation step | M1/M2/M3 hardening is complete. A final static check that no new paths expose `canonical_path`, `asset_id`, `evidence`, `target`, or `backup_location` is needed after any cleanup. |
| 6 | Final production-readiness validation | **REQUIRED** | Full TypeScript, lint, frontend tests, backend tests, and production build must pass. |

---

## 6. Required Changes

### 6.1 Remove `UnifiedOptimizeFlow.tsx`

| Field | Value |
|-------|-------|
| File | `apps/pc-optimizer/src/features/dashboard/components/UnifiedOptimizeFlow.tsx` |
| Current behavior | Exports a component that always returns `null` and is marked as deprecated in SC-8C9 Phase 2. No other file imports it. |
| Required behavior | Delete the file and remove its barrel export from `apps/pc-optimizer/src/features/dashboard/components/index.ts` if present. |
| Why required | It is dead code that was superseded by `ScanView`. Leaving it in the tree is a navigation/integration risk. |
| Dependencies | None in production. Tests may not reference it. |
| Security implications | None. Deletion removes a potential future re-introduction of the old flow. |
| Tests required | `yarn typecheck`, `yarn lint`, `npx vitest run src/features/dashboard/__tests__/` |

### 6.2 Remove legacy `healthScan*` state from `DashboardViewModel.ts`

| Field | Value |
|-------|-------|
| File | `apps/pc-optimizer/src/features/dashboard/DashboardViewModel.ts` |
| Current behavior | Contains `healthScanStep`, `healthScanModules`, `healthScanReport`, `startHealthScan`, `cancelHealthScan`, `cancelHealthScanOptimizations`, and `clearPersistedScanState`. These methods set fake `preparing`/`scanning` UI states and are no longer called from production components. They are still covered by `SmartOptimization.test.ts`. |
| Required behavior | Remove the `healthScan*` fields/methods and their imports (`ScanStatePersistence`, `PersistedScanState`). Keep the dashboard metrics/health score/one-click optimize flows. |
| Why required | The dashboard now navigates to `ScanView` for scans. The old dashboard health-scan state machine is deprecated and misleading. |
| Dependencies | `SmartOptimization.test.ts` must be updated or the obsolete tests removed. `DashboardViewModel.ts` still uses `clearScanState` from `ScanStatePersistence.ts`. |
| Security implications | Prevents accidental re-introduction of an in-dashboard scan/optimization path that could bypass `scan_core`. |
| Tests required | `npx vitest run src/features/dashboard/__tests__/`; dashboard component tests. |

### 6.3 Remove `ScanStatePersistence.ts`

| Field | Value |
|-------|-------|
| File | `apps/pc-optimizer/src/features/dashboard/ScanStatePersistence.ts` |
| Current behavior | Saves/loads scan state to IndexedDB for a legacy dashboard scan flow. After 6.2, the only remaining consumer (`clearScanState` import) is also dead. `unifiedScanState.ts` explicitly does **not** persist to browser storage. |
| Required behavior | Delete the file and remove all imports. The `scan_core` backend is the source of truth for scan history. |
| Why required | It is a legacy persistence layer that conflicts with the backend-authoritative scan/history design. It also uses browser storage for scan state, which is a privacy/UX risk. |
| Dependencies | 6.2 must be done first. |
| Security implications | Removes browser storage of scan progress and path/module data. Aligns with privacy-safe design. |
| Tests required | `npx vitest run src/features/dashboard/__tests__/`; `npx vitest run src/features/scan/__tests__/` |

### 6.4 Deprecate or remove `orchestrator.service.ts`

| Field | Value |
|-------|-------|
| File | `apps/pc-optimizer/src/features/orchestrator/orchestrator.service.ts` |
| Current behavior | Defines `orchestratorService` with `fullAsync`, `optimize`, etc. It is no longer imported by production code, but three `__tests__` files import it to assert that it is **not** called. |
| Required behavior | Option A: Delete the file and remove the negative assertions from the three test files (since the service no longer exists, the assertions are meaningless). Option B: Keep the file with a prominent JSDoc `@deprecated` marker and no exports changes. **Recommendation: Option A.** |
| Why required | It is a legacy service that was superseded by `scan.service.ts` and `remediation.service.ts`. Keeping it is confusing and a regression risk. |
| Dependencies | `features/scan/__tests__/scan.test.tsx`, `results.test.tsx`, `rollback.test.tsx` need import/line removal. |
| Security implications | Removes a legacy remediation/optimization service that could be mistakenly used. |
| Tests required | The three scan test files, `yarn typecheck`, `yarn lint`. |

### 6.5 Resolve `useUnifiedScan` pause/resume

| Field | Value |
|-------|-------|
| File | `apps/pc-optimizer/src/features/unified-scan/useUnifiedScan.ts` and `apps/pc-optimizer/src/features/unified-scan/components/UnifiedScanView.tsx` |
| Current behavior | `pauseScan`/`resumeScan` only set a local `pausedRef` and change `step`. They do **not** call `scan_core.scan.cancel` or a backend pause. `ScanView.tsx` passes `onPause`/`onResume` to `UnifiedScanView`. |
| Required behavior | Either (A) remove the pause/resume buttons and callbacks until a backend pause/resume contract exists, or (B) document the current pause/resume as a UI-only, non-functional placeholder. **Decision is OPEN — see Section 11.** |
| Why required | Presenting a pause button that does not pause the backend scan is misleading. |
| Dependencies | No backend `scan_core.scan.pause` method exists. Adding one is out of scope. |
| Security implications | Low. UI-only pause does not affect safety. |
| Tests required | Component tests for `UnifiedScanView` if buttons are removed. |

### 6.6 Final security/privacy static re-verification

| Field | Value |
|-------|-------|
| Command | `npx eslint "{src,electron}/**/*.{ts,tsx}" --max-warnings=0` plus grep checks |
| Current behavior | M1/M2/M3 in SC-8C9 already sanitized active scan findings, preview/rollback targets, and added in-flight guards. |
| Required behavior | Re-run the same security regression search after cleanup: ensure no `canonical_path`, `asset_id`, `evidence`, `target`, `backup_location` is rendered directly in `features/scan`; ensure no `orchestrator.optimize`/`orchestrator.fullAsync`/`security.remediation.*` calls in `features/scan` or `features/dashboard` production code. |
| Why required | Dead-code removal could accidentally reintroduce imports or expose raw data. |
| Dependencies | 6.1–6.4 should be done first. |
| Security implications | Critical. Verifies the SC-8C3 → SC-8C6 safety boundary remains intact. |
| Tests required | Manual grep review documented in `SC8C10_SECURITY_REGRESSION_CHECKLIST.md` (optional) or appended to this spec. |

### 6.7 Production-readiness validation run

| Field | Value |
|-------|-------|
| Command | See Section 9. |
| Current behavior | Baseline from SC-8C9 final hardening is green. |
| Required behavior | Re-run the full validation suite after all changes. |
| Why required | Final proof that SC-8C8/SC-8C9/SC-8C10 are stable together. |
| Dependencies | All prior phases. |
| Security implications | Catches regressions before any release. |
| Tests required | Full suite. |

---

## 7. Phase Breakdown

### Phase 1 — UX/state consistency and dead-code removal

- 6.1 Remove `UnifiedOptimizeFlow.tsx`.
- 6.2 Remove `healthScan*` state from `DashboardViewModel.ts`.
- 6.3 Remove `ScanStatePersistence.ts`.
- 6.4 Remove `orchestrator.service.ts` and update test imports.
- 6.5 Decide and apply pause/resume resolution (or open question).

### Phase 2 — Edge-case and concurrency validation

- Add or extend tests for rapid navigation, stale/missing plan, cancelled scan, cancelled execution, and unavailable rollback.
- Verify `useResults` in-flight guards and `useScan` duplicate-start guard still hold after Phase 1 cleanup.
- Validate `ScanView` with `?planId=` query param.

### Phase 3 — Legacy/dead-code cleanup and security re-verification

- 6.6 Re-run security/privacy grep checks.
- Remove any remaining unused `healthScan` types from `dashboard.types.ts` if orphaned.
- Ensure no `localStorage`/IDB scan state remains.

### Phase 4 — Final production validation

- 6.7 Run all validation commands.
- Update `SC8C10_SPECIFICATION.md` with actual results and any deviations.
- Mark `SC-8C10` complete.

---

## 8. Acceptance Criteria

### Phase 1

- [ ] `UnifiedOptimizeFlow.tsx` is deleted and not referenced.
- [ ] `DashboardViewModel.ts` no longer contains `healthScan*` fields or methods.
- [ ] `ScanStatePersistence.ts` is deleted.
- [ ] `orchestrator.service.ts` is deleted and the three scan test files no longer import it.
- [ ] `yarn typecheck` passes.
- [ ] `yarn lint` passes with 0 warnings.
- [ ] `npx vitest run src/features/dashboard/__tests__/` passes (after test updates).
- [ ] `npx vitest run src/features/scan/__tests__/` passes.

### Phase 2

- [ ] All edge-case tests in `scan.test.tsx`, `results.test.tsx`, `rollback.test.tsx`, `planHydration.test.tsx` pass.
- [ ] No `prepare`/`validate`/`execute`/`rollback` request can be triggered twice by rapid user interaction.
- [ ] `ScanView` with `?planId=` renders `PlanReviewView` for valid plans and a safe error for missing plans.

### Phase 3

- [ ] Security grep finds **0** `orchestrator.fullAsync` / `orchestrator.optimize` / `security.remediation.*` calls in `features/scan` or `features/dashboard` production code.
- [ ] Security grep finds **0** direct rendering of `canonical_path`, `asset_id`, `evidence`, `target`, or `backup_location` in `features/scan`.
- [ ] No `localStorage`/IDB is used for active scan session state in `features/scan` or `features/dashboard`.

### Phase 4

- [ ] `yarn build` passes.
- [ ] `python -m pytest -q tests/test_sc8c9_final_hardening.py` passes.
- [ ] `python -m pytest -q` passes or has no new failures vs. the SC-8C9 baseline.
- [ ] `npx vitest run src/features/scan/__tests__/ src/features/dashboard/__tests__/ src/features/smart-optimization-ai/__tests__/` passes.

---

## 9. Validation Commands

```bash
# Frontend typecheck
cd apps/pc-optimizer
yarn typecheck

# Frontend lint
yarn lint

# Frontend unit tests
npx vitest run src/features/scan/__tests__/
npx vitest run src/features/dashboard/__tests__/
npx vitest run src/features/smart-optimization-ai/__tests__/

# Frontend production build
yarn build

# Backend focused regression tests
cd ../../backend
python -m pytest -q tests/test_sc8c9_final_hardening.py

# Backend full suite
python -m pytest -q
```

Additional manual check:

```bash
cd apps/pc-optimizer
# No legacy orchestrator/security remediation calls in the scan/dashboard production code
grep -R "orchestrator\.\(fullAsync\|optimize\)" src/features/scan src/features/dashboard | grep -v __tests__ | grep -v node_modules
grep -R "security\.remediation\." src/features/scan src/features/dashboard | grep -v __tests__ | grep -v node_modules
```

---

## 10. Risks

| Risk | Level | Mitigation |
|------|-------|------------|
| Removing `orchestrator.service.ts` breaks negative-assertion tests that still import it. | **HIGH** (test-only, not production) | Update or remove the now-obsolete `not.toHaveBeenCalled` assertions in the same PR. |
| Removing `healthScan*` state from `DashboardViewModel` breaks `SmartOptimization.test.ts`. | **HIGH** (test-only) | Either delete the obsolete tests or update them to test the new `ScanView` integration. |
| `DashboardViewModel` has downstream consumers for `healthScan*` state that are not immediately visible. | **MEDIUM** | Search the full `src` tree before deletion; run `yarn typecheck` after every file change. |
| `SmartOptimizationPage` uses a separate `executionHandler.ts` that bypasses `scan_core` entirely. | **MEDIUM** | Treat as out of scope for SC-8C10 unless the open question below is resolved. |
| Pause/resume buttons are non-functional; removing them may change user expectations. | **LOW** | Disable or document; do not add backend RPCs. |
| Dead-code cleanup could accidentally remove a still-used export. | **MEDIUM** | Do one deletion per commit; run tests after each. |
| Full backend suite has one pre-existing intermittent timeout. | **LOW** | Document the intermittent failure; do not raise it as a new SC-8C10 failure. |

---

## 11. Open Questions

1. **Smart Optimization integration.** `SmartOptimizationPage.tsx` and `executionHandler.ts` run optimization actions through `dashboardService.executeOptimize`, `junkCleanerService.clean`, `privacyService.clean`, etc. They do **not** use `scan_core` or the `useResults` remediation flow. Is SC-8C10 required to migrate the Smart Optimization UI to `ScanView` + `scan_core.remediation.*`? If yes, this is a much larger change and should be a separate sub-phase. If no, `SmartOptimizationPage` remains a separate, out-of-scope legacy path.

2. **Pause/resume.** `useUnifiedScan.ts` pause/resume only affects local UI. Should the pause/resume buttons be removed, or should they remain as visual-only placeholders until a backend pause contract is added?

3. **Health score dashboard.** `DashboardViewModel` still runs the real-time metrics/health score. Is any part of the `healthScan` state still needed for the "Health Scan" quick action, or has it been fully replaced by the module-specific `ScanView`?

4. **Test modernization.** Should the obsolete `SmartOptimization.test.ts` assertions on `healthScanStep` be deleted or rewritten to validate the new unified flow?

---

## 12. Definition of Done

SC-8C10 is complete when:

- [ ] This specification is approved and unchanged by the time implementation starts.
- [ ] All four phases are implemented and all acceptance criteria pass.
- [ ] No `orchestrator.optimize`, `orchestrator.fullAsync`, or `security.remediation.*` calls exist in the unified scan/dashboard production path.
- [ ] No active scan session state is persisted to `localStorage`, IndexedDB, or any browser storage.
- [ ] `ScanView` is the only entry point for Protection Center, Smart Optimization, and Security Center scans.
- [ ] Full validation suite from Section 9 passes with no new failures.
- [ ] Open questions 1–4 are answered and documented.
- [ ] No SC-8C11 work has been started.
