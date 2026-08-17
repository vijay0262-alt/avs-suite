# SC-8C14 Phase 1 — Specification Inspection & Product Direction Discovery

## 1. Executive Summary

A repository-wide read-only inspection was performed to determine whether an authoritative SC-8C14 specification already exists.

**Finding: No authoritative SC-8C14 specification exists.**

No file named `SC8C14_SPECIFICATION.md`, `SC8C14_PHASE_PLAN.md`, or any similar document exists in the repository. Every reference to "SC-8C14" in the repository is a **negative boundary statement** — an explicit prohibition against starting SC-8C14 — found in SC-8C13 documents (specification, phase plan, phase reports) and the SC-8C13 Phase 1 inspection report.

The SC-8C13 effort is **COMPLETE and PRODUCTION READY** (all 5 phases done). The post-SC-8C13 architecture has:
- Zero production-reachable legacy Dashboard execution paths
- Zero automatic destructive execution
- Three modules (Smart Optimization, Security Center, Dashboard) all using canonical `scan_core` remediation
- All SC-8C10 through SC-8C13 security invariants intact

Six speculative candidate directions were identified from prior product-direction analyses, but **none has been selected by a product decision** and **none should be treated as authoritative**.

**Final verdict: BLOCKED — AUTHORITATIVE SC-8C14 SPECIFICATION REQUIRED**

---

## 2. Search Methodology

### Search scope

Searched the ENTIRE repository (`C:\Users\HPBP\Documents\GitHub\avs-suite`) for:

| Pattern | Scope | Result |
|---------|-------|--------|
| `SC-8C14\|SC8C14\|sc-8c14\|sc8c14\|SC 8C14\|8C14` | Entire repository | 9 files — all negative boundary statements or inspection reports |
| `SC-8C15\|SC8C15\|sc-8c15\|sc8c15` | Entire repository | 0 matches |
| `Phase 6\|Phase 7\|next phase\|future phase` | Entire repository | 21 files — various contexts (see below) |
| `SC8C14_SPECIFICATION\|SC8C14_PHASE_PLAN\|SC8C14_SPEC` | Entire repository | 0 matches |
| File glob `**/*8C14*` | Entire repository | 0 files found |
| File glob `**/SC8C14*` | Entire repository | 0 files found |

### Documents inspected

| Document | Location | Inspected |
|----------|----------|-----------|
| PROJECT_STATUS.md | `docs/PROJECT_STATUS.md` | ✅ |
| FEATURE_MATRIX.md | `docs/FEATURE_MATRIX.md` | ✅ |
| ARCHITECTURE_REVIEW.md | `ARCHITECTURE_REVIEW.md` | ✅ (referenced) |
| ARCHITECTURE_OVERVIEW.md | `docs/ARCHITECTURE_OVERVIEW.md` | ✅ (referenced) |
| SC8C13_SPECIFICATION.md | `apps/pc-optimizer/` | ✅ |
| SC8C13_PHASE_PLAN.md | `apps/pc-optimizer/` | ✅ |
| SC8C13_PHASE5_FINAL_SECURITY_REGRESSION_AUDIT.md | `apps/pc-optimizer/` | ✅ |
| SC8C13_PHASE2_PRODUCT_DIRECTION_ANALYSIS.md | `apps/pc-optimizer/` | ✅ |
| SC8C13_PHASE1_SPECIFICATION_INSPECTION_REPORT.md | `apps/pc-optimizer/` | ✅ |
| SC8C12_SPECIFICATION.md | `apps/pc-optimizer/` | ✅ |
| SC8C12_PHASE5_FINAL_SECURITY_REGRESSION_AUDIT.md | `apps/pc-optimizer/` | ✅ |
| SC8C12_PRODUCT_DIRECTION_REPORT.md | `apps/pc-optimizer/` | ✅ |
| SC8C11_SPECIFICATION.md | `apps/pc-optimizer/` | ✅ |
| SC8C11_PHASE4_FINAL_SECURITY_REGRESSION_AUDIT.md | `apps/pc-optimizer/` | ✅ |
| SC8C10_SPECIFICATION.md | `apps/pc-optimizer/` | ✅ (referenced) |
| SC8C10_FINAL_PRODUCTION_READINESS_AUDIT.md | `apps/pc-optimizer/` | ✅ |

---

## 3. Search Results

### SC-8C14 references (9 files)

All 9 files containing "SC-8C14" or "8C14" references were inspected. **Every reference is a negative boundary statement** (prohibition against starting SC-8C14) or an inspection report documenting the absence of an SC-8C14 specification.

| File | Context | Classification |
|------|---------|---------------|
| `SC8C13_SPECIFICATION.md` | Lines 45, 61, 166, 799-802, 994, 1007 — "SC-8C14 is NOT started" / "Starting SC-8C14" (non-goal) / "D6 — SC-8C13 vs SC-8C14" (decision) / "Explicit SC-8C14 Boundary" | E. Documentation — negative boundary |
| `SC8C13_PHASE_PLAN.md` | Lines 491, 509, 566-569 — "Confirmation: SC-8C14 NOT started" / "SC-8C14 Boundary" | E. Documentation — negative boundary |
| `SC8C13_PHASE5_FINAL_SECURITY_REGRESSION_AUDIT.md` | Lines 508, 541, 543, 545 — "SC-8C14 was NOT started" / "Explicit SC-8C14 Boundary" | E. Documentation — negative boundary |
| `SC8C13_PHASE4_INTEGRATION_PERSISTENCE_RECOVERY_REPORT.md` | Line 585 — "SC-8C14 NOT started" | E. Documentation — negative boundary |
| `SC8C13_PHASE3_DASHBOARD_FRONTEND_MIGRATION_REPORT.md` | Line 555 — "SC-8C14 NOT started" | E. Documentation — negative boundary |
| `SC8C13_PHASE2_DASHBOARD_OPTIMIZATION_PLANNING_REPORT.md` | Line 483 — "SC-8C14 NOT started" | E. Documentation — negative boundary |
| `SC8C13_PHASE1_BACKGROUND_CLEANUP_SAFETY_REPORT.md` | Line 378 — "SC-8C14 NOT started" | E. Documentation — negative boundary |
| `SC8C13_PHASE2_PRODUCT_DIRECTION_ANALYSIS.md` | Lines 862, 895 — "split into SC-8C13 + SC-8C14?" / "Starting SC-8C14" (non-goal) | E. Documentation — historical decision |
| `SC8C13_PHASE1_SPECIFICATION_INSPECTION_REPORT.md` | Lines 36, 38, 39, 62, 63, 337 — "SC-8C14" search results (0 matches at the time) / "SC-8C14 was NOT started" | E. Documentation — inspection report |

### SC-8C15 references

**Zero matches.** No reference to SC-8C15 exists anywhere in the repository.

### "Phase 6" / "Phase 7" / "next phase" / "future phase" references

21 files contain these phrases. All are either:
- Documentation of deferred items in SC-8C10 through SC-8C13 specifications
- Product direction reports listing speculative candidates
- Architecture documents describing future roadmap items (V1.2, future products)
- Source code comments about future phases (e.g., `SecurityCenterViewModel.ts`, `LiveScanProgress.tsx`)

**None constitutes an authoritative SC-8C14 specification.**

---

## 4. Authoritative Specification Status

**No authoritative SC-8C14 specification exists.**

There is no:
- `SC8C14_SPECIFICATION.md`
- `SC8C14_PHASE_PLAN.md`
- `SC8C14_PRODUCT_DIRECTION_REPORT.md`
- Any document with "SC-8C14" in its filename
- Any document that declares SC-8C14's objective, scope, non-goals, architecture, affected modules, phases, or acceptance criteria

All SC-8C14 references in the repository are **negative boundary statements** — explicit prohibitions against starting SC-8C14 — found in SC-8C13 documents.

---

## 5. Documents Inspected

### SC-8C13 documents (final state)

| Document | Key content |
|----------|-------------|
| `SC8C13_SPECIFICATION.md` | Defines SC-8C13 scope (Background Cleanup + Dashboard Optimize). Section 21: "SC-8C14 is NOT started." Section D6: "Keep the core B+A migration inside SC-8C13." |
| `SC8C13_PHASE_PLAN.md` | 5-phase plan for SC-8C13. Section 11: "SC-8C14 Boundary — SC-8C14 is NOT started." |
| `SC8C13_PHASE5_FINAL_SECURITY_REGRESSION_AUDIT.md` | Final audit. Section 22: "SC-8C14 was NOT started." Section 19: 7 remaining limitations documented. |
| `SC8C13_PHASE2_PRODUCT_DIRECTION_ANALYSIS.md` | Pre-SC-8C13 product direction analysis. Identified 6 candidates (A-F). Recommended B+A combined. Stated: "NOT an authoritative specification." |
| `SC8C13_PHASE1_SPECIFICATION_INSPECTION_REPORT.md` | Pre-SC-8C13 inspection. Found no SC-8C13 spec. Verdict: "BLOCKED — AUTHORITATIVE SC-8C13 SPECIFICATION REQUIRED." Listed 6 speculative candidates. |

### SC-8C12 documents

| Document | Key content |
|----------|-------------|
| `SC8C12_SPECIFICATION.md` | Defines SC-8C12 scope (Security Center Remediation Migration). Non-goals include "SC-8C13 or any later phase." |
| `SC8C12_PHASE5_FINAL_SECURITY_REGRESSION_AUDIT.md` | Final audit. Section 20: 3 remaining limitations. Section 21: 10 retained legacy components. "SC-8C13 was NOT started." |
| `SC8C12_PRODUCT_DIRECTION_REPORT.md` | Pre-SC-8C12 product direction. Identified 5 candidates. Selected Candidate 1 (Security Center). Stated: "NOT an authoritative specification." |

### SC-8C11 documents

| Document | Key content |
|----------|-------------|
| `SC8C11_SPECIFICATION.md` | Defines SC-8C11 scope (Smart Optimization). Lines 92-97 list 6 deferred items. Line 98: "SC-8C12 or any later phase" (non-goal). |
| `SC8C11_PHASE4_FINAL_SECURITY_REGRESSION_AUDIT.md` | Final audit. Remaining limitations: `executionHandler.ts` dead code (now deleted in SC-8C13 Phase 5), pre-existing test failures. |

### SC-8C10 documents

| Document | Key content |
|----------|-------------|
| `SC8C10_FINAL_PRODUCTION_READINESS_AUDIT.md` | Final audit. Section 16: 3 remaining limitations (health scan modals, BackgroundCleanupService, securityBackendService). Verdict: READY. |

### Project-level documents

| Document | Key content |
|----------|-------------|
| `docs/PROJECT_STATUS.md` | V1.0 complete, V1.1 in progress. Known technical debt: 20 items. Future roadmap: V1.2 planned (Process Intelligence UI, Customer Portal, License Activation, Telemetry, Code Signing, MSI installer). No SC-8C14 reference. |
| `docs/FEATURE_MATRIX.md` | All features with status/edition/module. No SC-8C14 reference. |

---

## 6. Existing Architecture Baseline

### Established production-ready architecture (must not be replaced)

1. `scan_core` is the canonical remediation architecture
2. `RemediationCoordinator` is authoritative
3. `SafetyGate` remains authoritative
4. `ActionPlanRepository` owns plans
5. `ExecutionRepository` owns execution persistence
6. `ExecutionLedger` prevents duplicate execution
7. `ActionPlan` is backend-authoritative with UUID `plan_id`
8. Explicit approval is mandatory before destructive remediation
9. Stale plans are rejected
10. Rollback is explicit (no automatic rollback)
11. No automatic resume
12. No remediation state in browser storage
13. Privacy-safe RPC responses (no `canonical_path`, `asset_id`, `backup_location`, shell commands)
14. Three modules use canonical remediation: Smart Optimization, Security Center, Dashboard

### Completed major architecture migrations

| Migration | SC Phase | Status |
|-----------|----------|--------|
| Canonical `scan_core` remediation engine | SC-8C4 | ✅ Complete |
| AI Protection Center → canonical scan/remediation | SC-8C10 | ✅ Complete |
| AI Smart Optimization → canonical plan/remediation | SC-8C11 | ✅ Complete |
| Security Center → canonical plan/remediation | SC-8C12 | ✅ Complete |
| Background Cleanup → detection/notification-only | SC-8C13 Phase 1 | ✅ Complete |
| Dashboard One-Click Optimize → canonical plan/remediation | SC-8C13 Phases 2-5 | ✅ Complete |

---

## 7. SC-8C13 Completion Baseline

SC-8C13 completed all 5 phases:

| Phase | Status | Key deliverable |
|-------|--------|----------------|
| Phase 1 | ✅ Complete | BackgroundCleanupService detection/notification-only |
| Phase 2 | ✅ Complete | DashboardOptimizationAdapter + PlanBuilder + scan_core RPC |
| Phase 3 | ✅ Complete | Dashboard frontend migrated to PlanReviewView/ResultsView |
| Phase 4 | ✅ Complete | 62 tests proving persistence/recovery/cross-session guarantees |
| Phase 5 | ✅ Complete | Legacy disconnection, cleanup, production readiness audit |

### SC-8C13 final validation

| Check | Result |
|-------|--------|
| Typecheck | ✅ Pass |
| Lint (`--max-warnings=0`) | ✅ Pass |
| Build | ✅ Pass |
| Full frontend suite | ✅ 8121 passed (120 test files) |
| Full backend suite | ✅ 971 passed, 14 skipped (2 intermittent) |
| Verdict | PRODUCTION READY |

---

## 8. Remaining Production Architecture

### Post-SC-8C13 retained components

| Component | Location | Status | Reason retained |
|-----------|----------|--------|----------------|
| `orchestrator.optimize` RPC | `backend/orchestrator/__init__.py` | Legitimate unrelated feature | Part of orchestrator's general pipeline, NOT Dashboard-specific |
| `orchestrator.fullAsync` RPC | `backend/orchestrator/__init__.py` | Legitimate unrelated feature | Part of orchestrator's general pipeline |
| `ORCHESTRATOR_OPTIMIZE` / `ORCHESTRATOR_FULL_ASYNC` constants | `packages/shared/src/rpc/index.ts` | Legitimate unrelated feature | Used by orchestrator module |
| `BackgroundCleanupService` | `health/BackgroundCleanupService.ts` | Detection/notification-only | No execution paths (Phase 1) |
| `DeferredCleanupStore` | `health/DeferredCleanupStore.ts` | Deprecated, read-only | Not populated with new items |
| `OptimizeExecuteResponse` type | `dashboard.types.ts` | Legitimate type | Used by HealthScanModal, UnifiedHealthScanModal, UnifiedHealthScanResults, LastScanResults |
| `OptimizePreview` type | `dashboard.types.ts` | Legitimate type | Used by DashboardPageV2 for read-only preview |
| `OptimizationExecutionCoordinator` (smart-opt) | `smart-optimization-ai/` | Test-only compatibility | Used by SmartOptimizationEngine for plan generation/preview |
| `SmartOptimizationEngine.executePlan` | `smart-optimization-ai/` | Deprecated, test-only | Not called from production UI |
| `ThreatRemediationEngine` | `security-remediation/` | Read-only domain + tests | Plan listing, quarantine summary, reports, false positives |
| `ThreatRemediationPlanner` | `security-remediation/` | Candidate plan creation | Planning-only (frontend) |
| Legacy RPC wrappers | `securityBackendService.ts` | Dead code | No production caller, retained for safety |
| `HealthScanModal.tsx` | `dashboard/components/` | Dead code | Not imported by active code |
| `UnifiedHealthScanModal.tsx` | `dashboard/components/` | Dead code | Not imported by active code |
| `UnifiedHealthScanResults.tsx` | `dashboard/components/` | Dead code | Not imported by active code |

### Module-level cleaner modules (NOT using scan_core)

| Module | RPC | Status |
|--------|-----|--------|
| Junk Cleaner | `CLEANER_CLEAN_EXECUTE` | Active production, own scan/clean/undo |
| Registry Cleaner | (own RPCs) | Active production, own scan/clean/undo |
| Privacy Cleaner | `PRIVACY_CLEAN` | Active production, own scan/clean/undo |
| Startup Manager | `STARTUP_DISABLE` | Active production, own scan/clean/undo |
| Duplicate Finder | (own RPCs) | Active production, own scan/clean/undo |
| Performance (memory) | (own RPCs) | Active production, own scan/clean/undo |

These are legitimate V1.0 features with their own confirm/preview UX. They do NOT use `scan_core` but they are NOT security violations — they have their own safety patterns.

---

## 9. Remaining Technical Debt

### Documented in PROJECT_STATUS.md (20 items)

| # | Item | Severity |
|---|------|----------|
| 1 | TypeScript errors in security-dashboard (3 errors) | Medium |
| 2 | ESLint warnings in security-dashboard (14 warnings) | Low |
| 3 | API base URL still `localhost:8000` | Medium |
| 4 | `frontend/` directory — legacy CRA boilerplate | Low |
| 5 | Customer Portal not production-ready | Medium |
| 6 | Placeholder apps (security, driver-updater, file-recovery, vpn) | Low |
| 7 | Module Registry stubs — all 19 modules use `StubModuleAdapter` | Medium |
| 8 | Backend blocking at import time (18.7s delay) | Medium |
| 9 | Nested ThreadPoolExecutor (24 concurrent threads) | Medium |
| 10 | No centralized Job Manager | Medium |
| 11 | Duplicate RPC calls (security + dashboard both call `dashboard.metrics`) | Low |
| 12 | No React.memo (dashboard re-renders every 2s) | Medium |
| 13 | License activation — `NullLicensingService` placeholder | High |
| 14 | Telemetry not implemented | Medium |
| 15 | Code signing not configured | High |
| 16 | MSI installer not configured | Medium |
| 17 | AI Process Intelligence — no UI | Medium |
| 18 | `PRD.md` outdated | Low |
| 19 | Various outdated docs | Low |
| 20 | Missing documentation (V1.1 changelog, architecture docs) | Low |

### Documented in SC-8C13 Phase 5 (7 items)

| # | Item | Severity |
|---|------|----------|
| 1 | `orchestrator.optimize` / `orchestrator.fullAsync` retained | Informational |
| 2 | `OptimizationExecutionCoordinator` retained | Informational |
| 3 | `SmartOptimizationEngine.executePlan` retained | Informational |
| 4 | `DeferredCleanupStore` retained | Informational |
| 5 | `OptimizeExecuteResponse` type retained | Informational |
| 6 | Flush DNS / Trim Memory remain `NOT_FIXABLE` | Informational |
| 7 | `canonical_path` in persisted targets | Informational |

### Documented in SC-8C12 Phase 5 (3 items)

| # | Item | Severity |
|---|------|----------|
| 1 | Quarantine summary uses legacy `security.quarantine.list` RPC | Low |
| 2 | Candidate plan creation uses legacy `ThreatRemediationPlanner` | Informational |
| 3 | Legacy `security-remediation/` classes retained | Low |

### Documented in SC-8C10 (2 informational findings)

| # | Item | Severity |
|---|------|----------|
| INFO-1 | Legacy health scan modals exist but not imported | Informational |
| INFO-2 | BackgroundCleanupService contained `ORCHESTRATOR_OPTIMIZE` (now resolved) | Resolved by SC-8C13 |

---

## 10. Remaining Security Concerns

### Security invariants check (against SC-8C10-8C13 baseline)

| Invariant | Status | Notes |
|-----------|--------|-------|
| No automatic destructive execution | ✅ Intact | BackgroundCleanupService is detection-only |
| Explicit approval before destructive remediation | ✅ Intact | All three modules require explicit approval |
| Backend-authoritative ActionPlan | ✅ Intact | All plans generated by backend |
| Backend-generated plan_id | ✅ Intact | UUID generated by `ActionPlan.__post_init__` |
| Stale-plan rejection | ✅ Intact | `ActionPlan.is_stale()` + `RemediationCoordinator` |
| Duplicate execution protection | ✅ Intact | `ExecutionLedger` idempotency |
| Explicit rollback | ✅ Intact | No automatic rollback |
| No automatic resume | ✅ Intact | No auto-resume after restart |
| No remediation state in browser storage | ✅ Intact | Only `avs-developer-mode` UI preference |
| Privacy-safe RPC responses | ✅ Intact | `canonical_path` stripped, no sensitive data |
| No frontend destructive filesystem/registry operations | ✅ Intact | All execution via `scan_core.remediation.execute` |
| Canonical scan_core remediation workflow | ✅ Intact | All three modules use canonical flow |

### No remaining security invariant violations

The post-SC-8C13 architecture has **zero** production-reachable security invariant violations. All previously identified violations (BackgroundCleanupService automatic execution, Dashboard one-click optimize, Security Center parallel remediation) have been resolved by SC-8C10 through SC-8C13.

---

## 11. Remaining Legacy Systems

### Legacy systems still in repository (none production-reachable for remediation execution)

| System | Location | Production-reachable? | Security risk? |
|--------|----------|----------------------|----------------|
| `HealthScanModal.tsx` | `dashboard/components/` | No (not imported) | None |
| `UnifiedHealthScanModal.tsx` | `dashboard/components/` | No (not imported) | None |
| `UnifiedHealthScanResults.tsx` | `dashboard/components/` | No (not imported) | None |
| `securityBackendService.ts` legacy RPC wrappers | `security-dashboard/` | No (dead code) | None |
| `ThreatRemediationEngine` | `security-remediation/` | Read-only only | None |
| `ThreatRemediationPlanner` | `security-remediation/` | Planning-only | None |
| `OptimizationExecutionCoordinator` (smart-opt) | `smart-optimization-ai/` | Test-only | None |
| `SmartOptimizationEngine.executePlan` | `smart-optimization-ai/` | Deprecated, test-only | None |
| `DeferredCleanupStore` | `health/` | Read-only detection | None |
| `orchestrator.optimize` RPC | `backend/orchestrator/` | No frontend caller | None |
| `orchestrator.fullAsync` RPC | `backend/orchestrator/` | No frontend caller | None |
| Module-level cleaners (6+ modules) | Various | Yes (own UX, not scan_core) | None (own safety patterns) |

**None of these are reachable from the canonical remediation execution path.**

---

## 12. Candidate Future Directions

**WARNING: The following candidates are SPECULATIVE — NOT AUTHORITATIVE. They are listed because prior product-direction analyses documented them. No candidate should be chosen as the official SC-8C14 direction without an authoritative specification and product decisions.**

### Candidate A: Legacy Health Scan Modal Cleanup

**SPECULATIVE — NOT AUTHORITATIVE**

| Criterion | Assessment |
|-----------|------------|
| Evidence in repository | `HealthScanModal.tsx`, `UnifiedHealthScanModal.tsx`, `UnifiedHealthScanResults.tsx` exist in `dashboard/components/` — not imported by active code |
| Existing implementation status | Dead code (not imported by production) |
| Security value | None (dead code) |
| Architectural value | Low — removes dead code, reduces confusion |
| Complexity | LOW |
| Dependencies | None |
| Risk | None (dead code) |
| Naturally follows SC-8C13 | Weakly — SC-8C13 Phase 5 retained these as legitimate display components |
| Requires scan_core changes | No |
| Requires new RPCs | No |
| Requires new ActionTypes | No |
| Requires new executors | No |
| Affects SafetyGate | No |
| Affects RemediationCoordinator | No |
| Affects persistence/recovery | No |
| Affects frontend UX | No (dead code) |
| Explicit prior deferral | Yes — SC-8C11 spec line 94, SC-8C10 INFO-1 |
| Already out of scope | SC-8C13 classified as "OUT_OF_SCOPE, unrelated to A+B" |
| Should be separate future phase | Insufficient scope for a full SC-8C phase — cleanup task |
| Confidence | LOW — insufficient scope for a full phase |
| Status after SC-8C13 | SC-8C13 Phase 5 retained `OptimizeExecuteResponse` type because these modals use it |

### Candidate B: Security Center Legacy Backend Cleanup

**SPECULATIVE — NOT AUTHORITATIVE**

| Criterion | Assessment |
|-----------|------------|
| Evidence in repository | SC-8C12 Phase 5 documents remaining `security-remediation/` classes, legacy RPC wrappers in `securityBackendService.ts`, transitional `security.quarantine.list` RPC |
| Existing implementation status | Legacy execution paths disconnected; read-only functionality remains |
| Security value | Low — execution paths already disconnected |
| Architectural value | Medium — creates canonical `quarantine_list` RPC, migrates read-only to backend |
| Complexity | MEDIUM |
| Dependencies | SC-8C12 (completed) |
| Risk | Low — legacy execution paths already disconnected |
| Naturally follows SC-8C13 | Weakly — direct continuation of SC-8C12, not SC-8C13 |
| Requires scan_core changes | Potentially (new `quarantine_list` RPC) |
| Requires new RPCs | Yes — `scan_core.security_remediation.quarantine_list` |
| Requires new ActionTypes | No |
| Requires new executors | No |
| Affects SafetyGate | No |
| Affects RemediationCoordinator | No |
| Affects persistence/recovery | No |
| Affects frontend UX | Minimal — read-only views |
| Explicit prior deferral | Yes — SC-8C12 Phase 5 remaining limitations |
| Already out of scope | SC-8C13 classified as "OUT_OF_SCOPE, unrelated to A+B" |
| Should be separate future phase | Yes — low-risk continuation of SC-8C12 |
| Confidence | MEDIUM — clear evidence, low risk, but low urgency |

### Candidate C: Module-Level Cleaner Canonical Integration

**SPECULATIVE — NOT AUTHORITATIVE**

| Criterion | Assessment |
|-----------|------------|
| Evidence in repository | `CLEANER_CLEAN_EXECUTE`, `PRIVACY_CLEAN`, `STARTUP_DISABLE` used by 6+ independent cleaner modules; no `scan_core` references |
| Existing implementation status | Active production — core V1.0 features with own scan/clean/undo UX |
| Security value | Medium — cleaners perform destructive operations without canonical safety controls (but have own confirm/preview UX) |
| Architectural value | High — standardizes all cleaners under canonical remediation |
| Complexity | VERY HIGH — 6+ independent modules |
| Dependencies | `scan_core` architecture (available) |
| Risk | HIGH — core V1.0 features with established UX and extensive test suites |
| Naturally follows SC-8C13 | Weakly — completes canonical migration, but very large scope |
| Requires scan_core changes | Partially — existing ActionTypes cover some operations; missing for memory optimization, uninstallation, duplicate-specific |
| Requires new RPCs | No (existing `scan_core.remediation.*` sufficient for covered operations) |
| Requires new ActionTypes | Potentially — for memory optimization, uninstallation, duplicate-specific |
| Requires new executors | Potentially — for memory optimization and uninstallation |
| Affects SafetyGate | Potentially — for operations without existing ActionTypes |
| Affects RemediationCoordinator | No |
| Affects persistence/recovery | No |
| Affects frontend UX | VERY HIGH — would change UX of every cleaner page |
| Explicit prior deferral | Yes — SC-8C12 Product Direction Report Candidate 5 |
| Already out of scope | SC-8C13 classified as "future multi-release initiative" |
| Should be separate future phase | Yes — 6+ phases, should be long-term initiative |
| Confidence | LOW — too large for a single SC-8C phase |

### Candidate D: Pause/Resume Backend Contract

**SPECULATIVE — NOT AUTHORITATIVE**

| Criterion | Assessment |
|-----------|------------|
| Evidence in repository | SC-8C11 spec line 96 ("Adding pause/resume backend contract (deferred to future phase)"); `RemediationCoordinator` has `cancel()` but no `pause()`/`resume()` |
| Existing implementation status | Not implemented — cancellation exists, no pause/resume |
| Security value | HIGH RISK — introduces new execution state conflicting with explicit approval semantics |
| Architectural value | Medium — convenience feature for long-running operations |
| Complexity | HIGH — requires `scan_core` internal modifications |
| Dependencies | `scan_core` architecture |
| Risk | HIGH — modifying `RemediationCoordinator` and all executors |
| Naturally follows SC-8C13 | Weakly — explicitly deferred by SC-8C11, but requires core changes |
| Requires scan_core changes | YES — `RemediationCoordinator`, `CancellationToken`, all executors, `ExecutionRepository` |
| Requires new RPCs | Yes — `scan_core.remediation.pause` and `scan_core.remediation.resume` |
| Requires new ActionTypes | No |
| Requires new executors | No |
| Affects SafetyGate | Potentially — re-validation on resume |
| Affects RemediationCoordinator | YES — add `pause()` and `resume()` |
| Affects persistence/recovery | YES — paused state persistence |
| Affects frontend UX | Medium — pause/resume UI |
| Explicit prior deferral | Yes — SC-8C11 spec line 96 |
| Already out of scope | SC-8C13 explicitly prohibited |
| Should be separate future phase | Yes — independent project requiring own specification |
| Confidence | LOW — conflicts with established architectural baseline |

### Candidate E: Smart Optimization Legacy Dead Code Cleanup

**SPECULATIVE — NOT AUTHORITATIVE**

| Criterion | Assessment |
|-----------|------------|
| Evidence in repository | SC-8C11 Phase 4 documented `executionHandler.ts` (now deleted in SC-8C13 Phase 5) and `OptimizationExecutionCoordinator.ts` as dead code; `SmartOptimizationEngine.executePlan` deprecated |
| Existing implementation status | `executionHandler.ts` deleted in SC-8C13 Phase 5; `OptimizationExecutionCoordinator.ts` retained for test compatibility |
| Security value | None — dead code |
| Architectural value | Low — removes test-only dead code |
| Complexity | LOW |
| Dependencies | Test migration |
| Risk | Low — test compatibility |
| Naturally follows SC-8C13 | Weakly — SC-8C13 already deleted `executionHandler.ts` |
| Requires scan_core changes | No |
| Requires new RPCs | No |
| Requires new ActionTypes | No |
| Requires new executors | No |
| Affects SafetyGate | No |
| Affects RemediationCoordinator | No |
| Affects persistence/recovery | No |
| Affects frontend UX | No |
| Explicit prior deferral | Yes — SC-8C11 Phase 4 remaining limitations |
| Already out of scope | Not explicitly |
| Should be separate future phase | Insufficient scope — cleanup task |
| Confidence | LOW — insufficient scope for a full phase |

### Candidate F: V1.2 Product Roadmap Items

**SPECULATIVE — NOT AUTHORITATIVE**

| Criterion | Assessment |
|-----------|------------|
| Evidence in repository | `docs/PROJECT_STATUS.md` V1.2 section: Process Intelligence Dashboard UI, Customer Portal production release, License Activation integration, Telemetry, Code signing, MSI installer, Additional language support, Performance optimizations |
| Existing implementation status | Planned, not started |
| Security value | Varies — License Activation (high), Code signing (high), Telemetry (medium) |
| Architectural value | Varies |
| Complexity | Varies — HIGH overall |
| Dependencies | Varies |
| Risk | Varies |
| Naturally follows SC-8C13 | No — these are product features, not architecture migrations |
| Requires scan_core changes | No (mostly) |
| Requires new RPCs | Potentially |
| Requires new ActionTypes | No |
| Requires new executors | No |
| Affects SafetyGate | No |
| Affects RemediationCoordinator | No |
| Affects persistence/recovery | No |
| Affects frontend UX | Yes — new dashboards, new UI |
| Explicit prior deferral | Yes — V1.2 roadmap |
| Already out of scope | Not applicable — product roadmap |
| Should be separate future phase | Yes — multiple independent projects |
| Confidence | LOW — product roadmap, not architecture migration |

---

## 13. Candidate Comparison Matrix

| Criterion | A: Health Scan Modal | B: SC Legacy Cleanup | C: Module Cleaners | D: Pause/Resume | E: Smart Opt Dead Code | F: V1.2 Roadmap |
|-----------|---------------------|---------------------|-------------------|-----------------|----------------------|----------------|
| Security value | None | Low | Medium | HIGH RISK | None | Varies |
| Architectural value | Low | Medium | High | Medium | Low | Varies |
| Complexity | LOW | MEDIUM | VERY HIGH | HIGH | LOW | HIGH |
| Risk | None | Low | HIGH | HIGH | Low | Varies |
| Requires scan_core changes | No | Potentially | Partially | YES | No | No |
| Requires new RPCs | No | Yes | No | Yes | No | Potentially |
| Requires new ActionTypes | No | No | Potentially | No | No | No |
| Affects SafetyGate | No | No | Potentially | Potentially | No | No |
| Affects RemediationCoordinator | No | No | No | YES | No | No |
| Affects frontend UX | No | Minimal | VERY HIGH | Medium | No | Yes |
| Estimated phases | <1 | 2-3 | 6+ | 3-4 | <1 | Multiple |
| Explicit prior deferral | Yes | Yes | Yes | Yes | Yes | Yes |
| Sufficient scope for SC-8C14 | NO | YES | YES (but too large) | YES | NO | YES (but product, not arch) |
| Confidence | LOW | MEDIUM | LOW | LOW | LOW | LOW |

---

## 14. Evidence for Each Candidate

### Candidate A (Health Scan Modal Cleanup)
- `HealthScanModal.tsx`, `UnifiedHealthScanModal.tsx`, `UnifiedHealthScanResults.tsx` exist in `dashboard/components/`
- SC-8C10 INFO-1: "Legacy health scan modals exist but are not imported by active code"
- SC-8C11 spec line 94: "Removing health scan modals (deferred to future phase)"
- SC-8C13 Phase 5 retained `OptimizeExecuteResponse` type because these modals use it

### Candidate B (Security Center Legacy Cleanup)
- SC-8C12 Phase 5 Section 20: 3 remaining limitations
- SC-8C12 Phase 5 Section 21: 10 retained legacy components
- `securityBackendService.ts` contains dead RPC wrappers
- `security-remediation/` classes retained for read-only functionality + tests
- `security.quarantine.list` RPC used transitionally

### Candidate C (Module-Level Cleaners)
- `CLEANER_CLEAN_EXECUTE` used by `junkCleaner.service.ts`, `maintenance-engine/tasks/`, `storage-intelligence/`
- `PRIVACY_CLEAN` used by `browser-health/`
- `STARTUP_DISABLE` used by startup manager
- 6+ independent cleaner modules with own scan/clean/undo
- No `scan_core` references in module-level cleaners
- SC-8C12 Product Direction Report Candidate 5

### Candidate D (Pause/Resume)
- SC-8C11 spec line 96: "Adding pause/resume backend contract (deferred to future phase)"
- `RemediationCoordinator` has `cancel()` but no `pause()`/`resume()`
- `CancellationToken` is binary cancel, no pause state
- All executors check `is_cancelled()`, no `is_paused()`

### Candidate E (Smart Optimization Dead Code)
- SC-8C11 Phase 4: `OptimizationExecutionCoordinator.ts` retained for test compatibility
- `SmartOptimizationEngine.executePlan` deprecated but retained
- SC-8C13 Phase 5 deleted `executionHandler.ts` but retained `OptimizationExecutionCoordinator`

### Candidate F (V1.2 Roadmap)
- `docs/PROJECT_STATUS.md` V1.2 section lists 8 planned items
- Process Intelligence Dashboard UI (engine complete, no UI)
- Customer Portal production release
- License Activation integration (currently `NullLicensingService`)
- Telemetry implementation
- Code signing
- MSI installer

---

## 15. Speculative vs Authoritative Classification

| Candidate | Classification |
|-----------|---------------|
| A: Health Scan Modal Cleanup | SPECULATIVE — NOT AUTHORITATIVE |
| B: Security Center Legacy Cleanup | SPECULATIVE — NOT AUTHORITATIVE |
| C: Module-Level Cleaner Integration | SPECULATIVE — NOT AUTHORITATIVE |
| D: Pause/Resume Backend Contract | SPECULATIVE — NOT AUTHORITATIVE |
| E: Smart Optimization Dead Code Cleanup | SPECULATIVE — NOT AUTHORITATIVE |
| F: V1.2 Product Roadmap Items | SPECULATIVE — NOT AUTHORITATIVE |

**No candidate has been declared authoritative. No product decision has been made.**

---

## 16. Missing SC-8C14 Requirements

The repository does NOT contain any of the following for SC-8C14:

| Requirement | Status |
|-------------|--------|
| 1. Objective | ❌ Missing |
| 2. Problem statement | ❌ Missing |
| 3. Scope | ❌ Missing |
| 4. Non-goals | ❌ Missing |
| 5. Architecture decision | ❌ Missing |
| 6. Affected modules | ❌ Missing |
| 7. Backend changes | ❌ Missing |
| 8. Frontend changes | ❌ Missing |
| 9. RPC contracts | ❌ Missing |
| 10. Persistence requirements | ❌ Missing |
| 11. Security requirements | ❌ Missing |
| 12. Privacy requirements | ❌ Missing |
| 13. UX requirements | ❌ Missing |
| 14. Test requirements | ❌ Missing |
| 15. Acceptance criteria | ❌ Missing |
| 16. Definition of Done | ❌ Missing |

**All 16 critical elements are missing. SC-8C14 remains BLOCKED.**

---

## 17. Product Decisions Required

Before SC-8C14 can be specified, the following product decisions must be made:

1. **What is the objective of SC-8C14?** — Is it another architecture migration, a cleanup phase, a new capability, or a product feature?
2. **Which candidate (if any) should be selected?** — The 6 speculative candidates have different values, risks, and complexities.
3. **Should SC-8C14 be a single phase or split into multiple phases?** — Candidate C (Module Cleaners) is too large for one phase; Candidate A (Health Scan Modal) is too small.
4. **Should SC-8C14 modify `scan_core` internals?** — Candidate D (Pause/Resume) requires core changes; all others do not.
5. **Should SC-8C14 add new ActionTypes or executors?** — Candidate C may require them.
6. **What is the priority — security, architecture, or product?** — The post-SC-8C13 architecture has zero security violations, so priority is no longer security-critical.
7. **Should SC-8C14 address V1.2 product roadmap items or remain focused on architecture?** — Candidate F is product-focused, not architecture-focused.

---

## 18. Risks of Implementing Without Specification

1. **Architectural baseline violation** — Implementing any candidate without a specification risks violating the established SC-8C10-8C13 baseline (no automatic execution, explicit approval, backend-authoritative plans, etc.)
2. **Scope creep** — Without a defined scope, implementation could expand to touch unrelated modules
3. **Regression risk** — Without defined test requirements, implementation could break existing functionality
4. **Security regression** — Without security requirements, implementation could introduce new security violations
5. **Privacy regression** — Without privacy requirements, implementation could expose sensitive data
6. **UX inconsistency** — Without UX requirements, implementation could create inconsistent user experiences
7. **Wasted effort** — Without product direction, implementation could be discarded if product priorities change
8. **Core architecture damage** — Candidate D (Pause/Resume) could damage `RemediationCoordinator` and `SafetyGate` without careful specification

---

## 19. Recommended Next Step

**RECOMMENDED FOR PRODUCT REVIEW (NOT AUTHORITATIVE):**

The most evidence-backed candidate for SC-8C14 is **Candidate B (Security Center Legacy Backend Cleanup)**, because:

1. It is a direct continuation of SC-8C12's legacy disconnection work
2. It has clear evidence (SC-8C12 Phase 5 remaining limitations)
3. It has low risk (execution paths already disconnected)
4. It has low complexity (2-3 phases)
5. It does not require `scan_core` internal modifications (only a new read-only RPC)
6. It does not require new ActionTypes or executors
7. It has medium architectural value (creates canonical `quarantine_list` RPC)

However, this recommendation is **NOT an authoritative specification**. The product owner must decide:
- Whether to pursue Candidate B or another candidate
- Whether SC-8C14 should be an architecture migration, cleanup, or product feature
- Whether to split SC-8C14 into multiple smaller phases

**Required next steps:**
1. Product owner reviews this report
2. Product owner selects a direction (or defers SC-8C14)
3. An authoritative `SC8C14_SPECIFICATION.md` is created with all 16 required elements
4. An authoritative `SC8C14_PHASE_PLAN.md` is created
5. Only then can SC-8C14 implementation begin

---

## 20. Explicit SC-8C15 Boundary

**SC-8C15 was NOT started.**

No SC-8C15 specification was created. No SC-8C15 implementation was started. No reference to SC-8C15 exists anywhere in the repository (0 matches). SC-8C15 is not required, not defined, and not started.

---

## Final Verdict

### BLOCKED — AUTHORITATIVE SC-8C14 SPECIFICATION REQUIRED

**Rationale:**
- No authoritative SC-8C14 specification exists in the repository
- All SC-8C14 references are negative boundary statements (prohibitions against starting)
- 6 speculative candidate directions exist but none has been selected by a product decision
- All 16 critical specification elements are missing
- Implementing without a specification risks violating the established SC-8C10-8C13 architectural baseline

---

## Confirmation

- **Production files modified:** NONE
- **Tests modified:** NONE
- **SC-8C14 implementation was NOT started**
- **SC-8C15 was NOT started**
- **No production code, tests, or configuration were modified**
- **This phase was inspection ONLY**

---

**End of SC-8C14 Phase 1 Specification Inspection Report**
