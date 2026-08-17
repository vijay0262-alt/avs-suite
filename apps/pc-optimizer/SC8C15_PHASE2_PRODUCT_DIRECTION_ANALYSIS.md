# SC-8C15 Phase 2 — Product Direction Analysis

## 1. Executive Summary

This report presents a source-verified analysis of six candidate directions for SC-8C15. Each candidate was inspected against the **current** repository state, not against `docs/PROJECT_STATUS.md` (which was found to be significantly outdated — 7 of 20 technical debt items are already resolved).

**Key findings:**

- **PROJECT_STATUS.md is outdated.** 7 of 20 documented debt items are already fixed (TypeScript errors, backend import blocking, centralized Job Manager, React.memo, license activation service, AI Process Intelligence UI, support email/URLs).
- **Candidate A (License Activation)** is far more complete than documented (~85-95% across all layers). The primary blocker is external: the AVS License SDK is not installed and the license server is not deployed. This is an infrastructure/deployment task, not a code-writing task.
- **Candidate B (AI Process Intelligence Dashboard UI)** is also far more complete than documented. The UI is **100% complete** (not 0% as PROJECT_STATUS.md claims). The engine is 100% complete. The only gap is backend integration — the frontend uses a mock provider. Estimated 5 days to complete.
- **Candidate C (Module-Level Cleaner Migration)** is a large rewiring exercise (81-120 days). The Module Registry exists but is completely disconnected from real implementations. All 19 modules use `StubModuleAdapter`.
- **Candidate D (Pause/Resume)** is technically possible but **blocked by the scan_core freeze**. It requires changes to RemediationCoordinator, executors, state machine, and SafetyGate. Explicitly prohibited by current architecture decisions.
- **Candidate E (Performance Optimizations)** has mixed status. Some items are already fixed (lazy loading, React.memo, backend import). Remaining items are medium-to-high complexity (thread pool consolidation, shared metrics store, Job Manager adoption).
- **Candidate F (Technical Debt Cleanup)** is low-risk but includes production blockers (API URL, code signing) that may warrant a dedicated phase rather than maintenance.

**No candidate is authorized.** This report is NON-AUTHORITATIVE and intended for Product Owner review only.

---

## 2. Methodology

Each candidate was inspected by a dedicated subagent that:

1. Searched the current source code (not documentation)
2. Verified PROJECT_STATUS.md claims against actual implementation
3. Reported exact file paths, line numbers, and completeness levels
4. Identified external dependencies, risks, and architecture conflicts
5. Estimated complexity and phase count

All inspection was read-only. Zero production files, tests, or configuration were modified.

---

## 3. Candidate A: License Activation Integration

### 3.1 Current State (Source-Verified)

| Component | Location | Completeness | Status |
|-----------|----------|-------------|--------|
| `packages/licensing/` | Licensing foundation package | 80% | Real — LicenseManager, FeatureManager, storage, events, offline, trial all implemented. `IActivationService` is interface-only. |
| `apps/pc-optimizer/src/features/license/` | Desktop license service | 90% | Real — Full service with server communication, caching, grace period, offline validation. Signature verification is placeholder. |
| `apps/pc-optimizer/src/features/licensing/` | Activation UI + SDK service | 85% | Real — `ActivationPage.tsx` (452 lines), `SdkActivationService.ts` (191 lines), `LicenseBootstrap.tsx`, `FeatureGate.ts`, `UpgradePage.tsx`, `DiagnosticsPage.tsx`. |
| Backend license bridge | `backend/src/avs_backend/licensing/__init__.py` | 95% | Real — 13 RPC handlers, SDK bridge, edition guards, auto-registration. |
| Electron IPC bridge | `apps/pc-optimizer/electron/licensing/` | 100% | Real — 12 IPC handlers, auto-update scheduling, startup sequence. |
| Customer Portal | `apps/customer-portal/` | 40% | Scaffold — Next.js app with auth, license list page, but not production-ready. |
| Feature flags | `packages/shared/src/featureFlags/` | 100% | Real — 30+ feature flags with edition mappings. |
| `services/license-server/` | Placeholder | 5% | Placeholder — only `package.json`. |

### 3.2 What's Missing (Blockers)

1. **AVS License SDK** — `avs_license_sdk` package is commented out in `backend/requirements.txt` (line 31). Not installed.
2. **License Server** — External repository (`../Avs-license-server`) not deployed. `LICENSE_SERVER_URL` defaults to `localhost:8000`.
3. **Real signature verification** — `licenseValidator.ts` lines 45-52 use placeholder verification.
4. **Payment processor** — Not implemented.
5. **Two parallel implementations** — `features/license/` (sync API) and `features/licensing/` (SDK via IPC) both exist. Decision needed on which to standardize.

### 3.3 Assessment

| Aspect | Value |
|--------|-------|
| Evidence | `SC8C14_PRODUCT_DECISION_REQUIRED.md` option C; `PROJECT_STATUS.md` V1.2 roadmap, EPIC 10 |
| Completeness | ~85% code-complete, ~0% deployment-ready |
| Complexity | 3-4 phases if starting from scratch; 1-2 phases if infrastructure is deployed |
| Security impact | HIGH — payment/credential handling, signature verification |
| Architecture impact | MEDIUM — new backend service, but existing code is well-structured |
| External dependencies | License server, AVS License SDK, payment processor |
| scan_core conflict | NO |
| Ready to implement? | **NO** — blocked by external dependencies (SDK + server) |
| What's needed first | Deploy license server, install SDK, then wire + test |

### 3.4 Key Insight

The code is mostly written. The primary work is **infrastructure deployment** (license server, SDK installation) and **security hardening** (real signature verification), not greenfield development. If the license server already exists externally, this could be 1-2 phases of integration + testing. If it doesn't exist, it's 3-4 phases including server development.

---

## 4. Candidate B: AI Process Intelligence Dashboard UI

### 4.1 Current State (Source-Verified)

| Component | Location | Completeness | Status |
|-----------|----------|-------------|--------|
| Engine (14 files) | `apps/pc-optimizer/src/features/process-ai/` | 100% | Real — ProcessAIEngine, 8 impact analyzers, risk assessment, recommendation engine, trend analyzer, explanation engine, dashboard provider, event bus, repository, history. |
| Types | `process-ai/types.ts` | 100% | 653 lines of comprehensive type definitions |
| UI Page | `process-ai/ui/ProcessIntelligencePage.tsx` | 100% | 338 lines — summary bar, top consumers, alerts, insights, recommendations, risk assessment, scan button |
| ViewModel | `process-ai/ui/ProcessIntelligenceViewModel.ts` | 100% | 159 lines — MVVM with mock provider |
| Route | `/process-intelligence` | 100% | Registered, lazy-loaded, preloaded, in sidebar navigation |
| Tests | `process-ai/__tests__/processAIEngine.test.ts` | 80% | 547+ lines — comprehensive engine tests; no UI tests |
| Backend RPC module | Does not exist | 0% | **MISSING** — no `process_intelligence` backend module |
| Real data provider | Mock only | 0% | Frontend uses `MockProcessProvider` with hardcoded data |

### 4.2 PROJECT_STATUS.md Correction

PROJECT_STATUS.md states "Engine 100%, UI 0%" — **this is wrong**. The UI is 100% complete. The SC8C14 Phase 2 report already corrected this at line 78. EPIC 7 should be "Engine 100%, UI 100%, Backend Integration 0%".

### 4.3 What's Missing

1. **Backend RPC module** — Create `backend/src/avs_backend/process_intelligence/__init__.py` with:
   - `process_intelligence.scan` — enumerate processes with sensor data
   - `process_intelligence.analyze` — run AI analysis
   - `process_intelligence.get_history` — historical trends
   - `process_intelligence.get_report` — last analysis report
2. **Replace mock provider** — Update `ProcessIntelligenceViewModel.ts` to call real RPCs
3. **UI tests** — Tests for page rendering and ViewModel state management
4. **Integration tests** — End-to-end with real backend

### 4.4 Assessment

| Aspect | Value |
|--------|-------|
| Evidence | `PROJECT_STATUS.md` V1.2 roadmap, EPIC 7; `process-ai/` directory inspection |
| Completeness | ~90% (engine + UI complete, backend integration missing) |
| Complexity | 1-2 phases (backend module + integration) |
| Security impact | LOW — read-only analysis, no destructive operations |
| Architecture impact | LOW — new backend module, no changes to existing architecture |
| External dependencies | None |
| scan_core conflict | NO |
| Ready to implement? | **YES** — no blockers, clear scope, stable engine API |
| Estimated effort | ~5 days (2-3 days backend, 0.5 day provider swap, 1 day UI tests, 1 day integration) |
| Engine API stability | STABLE — 653 lines of types, clean barrel export, provider abstraction, comprehensive tests |

### 4.5 Key Insight

This is the **lowest-risk, highest-completeness** candidate. The UI already exists and works with mock data. The engine is fully tested. The only work is creating a backend RPC module that enumerates processes and returns sensor data in the format the frontend already expects. The `ProcessProvider` interface is clearly defined, making the backend contract straightforward.

---

## 5. Candidate C: Module-Level Cleaner Migration

### 5.1 Current State (Source-Verified)

| Component | Location | Completeness | Status |
|-----------|----------|-------------|--------|
| ModuleRegistry | `apps/pc-optimizer/src/features/module-registry/ModuleRegistry.ts` | 100% | Real — 382 lines, fully implemented |
| BaseModuleAdapter | `module-registry/BaseModuleAdapter.ts` | 100% | Real — 197 lines, abstract base class |
| StubModuleAdapter | `module-registry/registerModules.ts` | 100% | All 19 modules use this stub |
| Module definitions | `module-registry/moduleDefinitions.ts` | 100% | 9 existing (v1.0.0) + 10 future (v0.0.0) |
| Real feature implementations | `features/junk-cleaner/`, `registry/`, etc. | 100% | 8 of 9 existing modules have complete frontend + backend |
| Backend cleaners | `backend/src/avs_backend/cleaner/` | 100% | 18 concrete cleaners, ScanManager, CleaningManager |
| Centralized Job Manager | `backend/src/avs_backend/common/job_manager.py` | 100% | Exists but **unused by most modules** |
| Real adapters | None | 0% | Zero modules have real adapters |

### 5.2 What "Migration" Actually Means

The Module Registry is a **well-designed abstraction layer that was never wired to the actual implementations**. The application works because each feature has its own direct RPC-to-ViewModel connection, bypassing the registry entirely.

A "module-level cleaner migration" would be a **rewiring exercise**:

1. **Phase 1**: Create real adapters for 9 existing modules (2-3 days each = 18-27 days)
2. **Phase 2**: Migrate backend modules to Job Manager (1-2 days each = 8-16 days)
3. **Phase 3**: Unify RPC patterns (5-7 days)
4. **Phase 4**: Implement 10 future modules (5-7 days each = 50-70 days)

### 5.3 Assessment

| Aspect | Value |
|--------|-------|
| Evidence | `SC8C14_SPECIFICATION.md` §9 Non-Goals (Candidate C — OUT OF SCOPE, too large) |
| Completeness | 0% (no real adapters) |
| Complexity | 4-6 phases, 81-120 days |
| Security impact | MEDIUM — changes execution paths for all modules |
| Architecture impact | HIGH — replaces StubModuleAdapter for all modules, unifies job management |
| External dependencies | None |
| scan_core conflict | NO (but touches all backend modules) |
| Ready to implement? | **NO** — explicitly deferred as "too large" in SC-8C14 specification |
| Risk | HIGH — breaking changes to working features, massive test surface |

### 5.4 Key Insight

This is the **largest and riskiest** candidate. It's essentially a platform refactoring effort that would touch every module. The SC-8C14 specification explicitly deferred it as "too large." While the abstraction layer is well-designed, the migration would provide no immediate user-facing value — it's purely architectural. This should only be undertaken if there's a compelling product reason to unify module lifecycle management.

---

## 6. Candidate D: Pause/Resume

### 6.1 Current State (Source-Verified)

| Component | Status | Details |
|-----------|--------|---------|
| RemediationCoordinator | Cancel only | `cancel()` exists; no `pause()` or `resume()` |
| CancellationToken | Binary flag | `is_cancelled()` only; no `is_paused()` |
| ExecutionState enum | No PAUSED | States: PLANNED, RUNNING, COMPLETED, FAILED, CANCELLED, ROLLED_BACK, DRY_RUN, APPROVED, REJECTED, SKIPPED, REQUIRES_REVIEW |
| State machine | No PAUSED transitions | Only PLANNED→RUNNING and RUNNING→FINAL_STATES |
| ExecutionRepository | No PAUSED persistence | Cannot store or recover paused state |
| Executors (6+ files) | No pause checks | Only `is_cancelled()` checks at action boundaries |
| SafetyGate | No resume logic | Would need re-validation on resume (stale plan risk) |
| RPC bridge | No pause/resume RPCs | Only execute, cancel, status, rollback |
| Frontend (useResults) | No pause/resume UI | ResultsStep has no 'paused' state; no pause/resume buttons |

### 6.2 What Would Be Required

1. Add `PAUSED` to `ExecutionState` and `ExecutionStatus` enums
2. Add state machine transitions: RUNNING→PAUSED, PAUSED→RUNNING, PAUSED→CANCELLED
3. Add `pause()` and `resume()` methods to `RemediationCoordinator`
4. Add `is_paused()` checks to all 6+ target executors
5. Persist PAUSED state in `ExecutionRepository`
6. Add `scan_core.remediation.pause` and `scan_core.remediation.resume` RPCs
7. Add pause/resume UI to `ResultsView` and `useResults` hook
8. Handle stale plan re-validation on resume (SafetyGate)
9. Handle approval token expiry on resume

### 6.3 Assessment

| Aspect | Value |
|--------|-------|
| Evidence | `SC8C14_SPECIFICATION.md` §9 Non-Goals (Candidate D — OUT OF SCOPE, high risk) |
| Completeness | 0% |
| Complexity | 3-4 phases, 10+ files |
| Security impact | MEDIUM-HIGH — approval token validity, stale plan re-validation, no-auto-resume invariant |
| Architecture impact | **HIGH — conflicts with scan_core freeze** |
| External dependencies | None |
| scan_core conflict | **YES — BLOCKER** — requires changes to RemediationCoordinator, executors, state machine, SafetyGate |
| Ready to implement? | **NO** — blocked by scan_core freeze |
| Risk | HIGH — execution state management, recovery complexity, concurrency concerns |

### 6.4 Key Insight

This candidate is **architecturally blocked**. The scan_core freeze was an explicit Product Owner decision (SC-8C14 Decision 3). Pause/Resume cannot be implemented without lifting this freeze. Even if the freeze were lifted, the security implications are significant: paused executions could be resumed with stale plans, expired approval tokens, or changed system state. This candidate should remain deferred unless there is explicit user demand and a Product Owner decision to unfreeze scan_core.

---

## 7. Candidate E: Performance Optimizations

### 7.1 Current State (Source-Verified)

| Item | PROJECT_STATUS.md | Actual Status | Complexity |
|------|-------------------|---------------|------------|
| Backend import time (18.7s) | Debt item #10 | **FIXED** — lazy singleton pattern | None |
| React.memo (none) | Debt item #14 | **PARTIALLY FIXED** — 37 instances, 14 in dashboard | Low (add to main pages) |
| Lazy loading | Not mentioned | **ALREADY IMPLEMENTED** — all 19+ pages lazy-loaded | None |
| Dashboard polling (2s) | Implied by #14 | **EXISTS** — 2s when visible, 30s when hidden | Low (increase interval) |
| ThreadPoolExecutor nesting | Debt item #11 | **EXISTS** — up to 35 potential threads, 8-16 actual | High (consolidation) |
| Centralized Job Manager | Debt item #12 | **EXISTS but unused** by most modules | Very High (migration) |
| Duplicate RPC calls | Debt item #13 | **PARTIALLY EXISTS** — old Security page duplicates; new Security Dashboard does not | Low (deprecate old page) |
| Shared metrics store | Not mentioned | **MISSING** — no shared Zustand store for metrics | Medium |

### 7.2 Remaining Work

1. **Shared metrics store** (Medium) — Create Zustand store for dashboard metrics, eliminate duplicate polling
2. **ThreadPoolExecutor consolidation** (High) — Reduce thread pool sizes, consider shared pool
3. **React.memo on main pages** (Low) — Add memo to DashboardPageV2 and other page components
4. **Increase polling interval** (Low) — Change from 2s to 5-10s
5. **Deprecate old Security page** (Low) — Remove `/security` route
6. **Job Manager adoption** (Very High) — Migrate modules to use centralized Job Manager

### 7.3 Assessment

| Aspect | Value |
|--------|-------|
| Evidence | `PROJECT_STATUS.md` V1.2 roadmap, debt items #10-14 |
| Completeness | ~50% already done; remaining 50% is mixed complexity |
| Complexity | 2-3 phases (split low/medium items from high/very-high items) |
| Security impact | LOW — no security boundary changes |
| Architecture impact | MEDIUM — thread pool changes, shared state, Job Manager adoption |
| External dependencies | None |
| scan_core conflict | NO |
| Ready to implement? | **PARTIALLY** — low/medium items are ready; high items need careful planning |
| Risk | Low for low items; Medium for thread pool; High for Job Manager migration |

### 7.4 Key Insight

This candidate has the **most misleading PROJECT_STATUS.md** — 3 of 5 items are already fixed. The remaining work splits into two tiers: quick wins (polling interval, React.memo, deprecate old page) that could be maintenance, and deep work (thread pool consolidation, Job Manager adoption) that would need a dedicated phase. The quick wins don't justify a full SC phase by themselves.

---

## 8. Candidate F: Technical Debt Cleanup

### 8.1 Current State (Source-Verified)

| Item | PROJECT_STATUS.md | Actual Status | Severity | Classification |
|------|-------------------|---------------|----------|---------------|
| TS errors in security-dashboard | Debt #1 | **FIXED** | N/A | Already resolved |
| ESLint warnings (14) | Debt #2 | **PARTIALLY FIXED** — 2 eslint-disable remain | Low | Maintenance |
| API base URL (localhost:8000) | Debt #3 | **STILL EXISTS** — 20 references | **HIGH** | Production blocker |
| Support email | Debt #4 | **FIXED** | N/A | Already resolved |
| Release notes URL | Debt #5 | **FIXED** | N/A | Already resolved |
| Legacy `frontend/` directory | Debt #6 | **STILL EXISTS** — full CRA boilerplate | Medium | Maintenance |
| Customer Portal | Debt #7 | **IN DEVELOPMENT** — v0.1.0 scaffold | Medium | Dedicated phase |
| Placeholder apps | Debt #8 | **STILL EMPTY** — intentional | Low | No action |
| Module Registry stubs | Debt #9 | **STILL STUBS** | Low | See Candidate C |
| Backend import blocking | Debt #10 | **FIXED** — lazy singletons | N/A | Already resolved |
| Nested ThreadPoolExecutor | Debt #11 | **STILL EXISTS** | Medium | See Candidate E |
| No centralized Job Manager | Debt #12 | **EXISTS but unused** | Medium | See Candidate E |
| Duplicate RPC calls | Debt #13 | **PARTIALLY EXISTS** | Low | See Candidate E |
| No React.memo | Debt #14 | **FIXED** — 37 instances | N/A | Already resolved |
| License activation | Debt #15 | **MOSTLY FIXED** — SdkActivationService exists | N/A | See Candidate A |
| Telemetry | Debt #16 | **PARTIALLY IMPLEMENTED** — engine exists, UI disabled | Medium | Dedicated phase |
| Code signing | Debt #17 | **NOT CONFIGURED** | **HIGH** | Production blocker |
| MSI installer | Debt #18 | **NOT CONFIGURED** — NSIS only | Medium | Enterprise requirement |
| AI Process Intelligence UI | Debt #19 | **COMPLETE** — UI exists at `/process-intelligence` | N/A | See Candidate B |
| PRD.md outdated | Debt #20 | **CONFIRMED** — intentionally marked outdated | Low | Maintenance |

### 8.2 Remaining Work

**Production blockers (must fix before release):**
1. API base URL — update from `localhost:8000` to `https://api.avsshield.com` (20 references)
2. Code signing — purchase EV certificate, configure electron-builder

**Medium priority:**
3. Legacy `frontend/` directory — migrate or remove
4. Telemetry UI toggle — enable in settings
5. MSI installer — add electron-builder target

**Low priority (maintenance):**
6. 2 remaining eslint-disable comments
7. PRD.md update or archive
8. Update PROJECT_STATUS.md to reflect actual state

### 8.3 Assessment

| Aspect | Value |
|--------|-------|
| Evidence | `PROJECT_STATUS.md` "Known Technical Debt" section |
| Completeness | 7 of 20 items already fixed; 2 are production blockers |
| Complexity | 1-2 phases (production blockers + medium items) |
| Security impact | MEDIUM — API URL change affects all network calls; code signing affects trust |
| Architecture impact | LOW — mostly configuration and cleanup |
| External dependencies | EV code signing certificate (external purchase) |
| scan_core conflict | NO |
| Ready to implement? | **PARTIALLY** — API URL fix is ready; code signing requires certificate purchase |
| Risk | Low for cleanup items; Medium for API URL change (must test all endpoints) |

### 8.4 Key Insight

This candidate revealed that **PROJECT_STATUS.md is significantly outdated** — 7 of 20 debt items are already resolved. The remaining items split into production blockers (API URL, code signing) that need urgent attention, and maintenance items that could be handled incrementally. The API URL fix is straightforward but critical. Code signing requires an external certificate purchase and may not be code-writable.

---

## 9. Candidate Comparison Matrix

| Criterion | A: License | B: Process AI | C: Module Migration | D: Pause/Resume | E: Performance | F: Tech Debt |
|-----------|-----------|--------------|--------------------|--------------------|----------------|-------------| 
| Code completeness | 85% | 90% | 0% | 0% | 50% | 65% |
| Phases needed | 1-4 (depends on server) | 1-2 | 4-6 | 3-4 | 2-3 | 1-2 |
| Estimated days | 15-60 | 5 | 81-120 | 20-40 | 15-40 | 5-15 |
| External dependencies | License server, SDK, payment | None | None | None | None | EV certificate |
| scan_core conflict | NO | NO | NO | **YES (BLOCKER)** | NO | NO |
| Security risk | HIGH | LOW | MEDIUM | MEDIUM-HIGH | LOW | MEDIUM |
| Architecture risk | MEDIUM | LOW | HIGH | HIGH | MEDIUM | LOW |
| User-facing value | Revenue enablement | New dashboard feature | None (internal) | UX improvement | Performance | Stability |
| Ready to implement? | **NO** (external deps) | **YES** | **NO** (too large) | **NO** (frozen) | **PARTIALLY** | **PARTIALLY** |
| PROJECT_STATUS accuracy | Misleading (mostly done) | **Wrong** (UI=0%, actually 100%) | Accurate | Accurate | **Wrong** (3/5 fixed) | **Wrong** (7/20 fixed) |

---

## 10. PROJECT_STATUS.md Accuracy Audit

| Debt Item | PROJECT_STATUS Claims | Actual State | Accuracy |
|-----------|----------------------|--------------|----------|
| #1 TS errors | 3 errors to fix | Fixed | **WRONG** |
| #2 ESLint warnings | 14 warnings | 2 remain | **WRONG** |
| #3 API URL | localhost:8000 | Still localhost:8000 | Correct |
| #4 Support email | Fixed | Fixed | Correct |
| #5 Release notes URL | Fixed | Fixed | Correct |
| #6 Legacy frontend/ | Should migrate/remove | Still exists | Correct |
| #7 Customer Portal | Not production-ready | v0.1.0 scaffold | Correct |
| #8 Placeholder apps | Empty | Empty | Correct |
| #9 Module Registry stubs | All stubs | All stubs | Correct |
| #10 Backend import blocking | 18.7s delay | Fixed (lazy) | **WRONG** |
| #11 Nested ThreadPool | 24 threads | Up to 35 potential | Correct |
| #12 No Job Manager | Each module own pattern | Exists but unused | **PARTIALLY WRONG** |
| #13 Duplicate RPCs | Security + dashboard | Old security page only | **PARTIALLY WRONG** |
| #14 No React.memo | Re-renders every 2s | 37 memo instances | **WRONG** |
| #15 License activation | NullLicensingService placeholder | SdkActivationService exists | **WRONG** |
| #16 Telemetry | Not implemented | Engine exists, UI disabled | **PARTIALLY WRONG** |
| #17 Code signing | Not configured | Not configured | Correct |
| #18 MSI installer | Not configured | NSIS only | Correct |
| #19 Process AI UI | Engine complete, no UI | UI 100% complete | **WRONG** |
| #20 PRD.md outdated | Outdated | Outdated (marked) | Correct |

**Summary: 7 of 20 items are wrong, 3 are partially wrong, 10 are correct.**

**Recommendation:** PROJECT_STATUS.md should be updated as part of any next phase, regardless of which candidate is selected.

---

## 11. Security Considerations

| Candidate | Security Impact | Key Concerns |
|-----------|----------------|--------------|
| A: License Activation | HIGH | Payment credentials, signature verification, token expiry, offline grace period abuse |
| B: Process AI | LOW | Read-only analysis; no destructive operations; process enumeration is safe |
| C: Module Migration | MEDIUM | Changes execution paths for all modules; must preserve safety gates and validation |
| D: Pause/Resume | MEDIUM-HIGH | Stale plan re-validation, approval token expiry, no-auto-resume invariant, concurrency |
| E: Performance | LOW | No security boundary changes; thread pool changes could introduce deadlocks |
| F: Tech Debt | MEDIUM | API URL change affects all network security; code signing affects trust chain |

**No candidate introduces remediation execution risk.** The scan_core security boundary (SafetyGate, explicit approval, immutable planning) remains untouched by all candidates except D.

---

## 12. Architecture Considerations

| Candidate | Architecture Impact | scan_core Impact |
|-----------|--------------------|--------------------|
| A: License Activation | MEDIUM — new backend service, but existing code is well-structured | NONE |
| B: Process AI | LOW — new backend module, no changes to existing architecture | NONE |
| C: Module Migration | HIGH — rewiring all modules, unifying job management | NONE (but touches all backend modules) |
| D: Pause/Resume | **HIGH — requires scan_core internal changes** | **BLOCKED by freeze** |
| E: Performance | MEDIUM — thread pool consolidation, shared state | NONE |
| F: Tech Debt | LOW — mostly configuration and cleanup | NONE |

**Only Candidate D conflicts with the established architecture.** All other candidates can proceed without modifying scan_core, SafetyGate, RemediationCoordinator, or executors.

---

## 13. Product Considerations

| Candidate | User-Facing Value | Revenue Impact | Strategic Value |
|-----------|------------------|----------------|-----------------|
| A: License Activation | Enables paid editions | **DIRECT** — unlocks revenue | High — commercial foundation |
| B: Process AI | New dashboard feature | Indirect — professional edition feature | Medium — completes V1.1 AI platform |
| C: Module Migration | None (internal) | None | Low — purely architectural |
| D: Pause/Resume | UX improvement for long operations | None | Low — nice-to-have |
| E: Performance | Smoother dashboard | None | Medium — user experience |
| F: Tech Debt | Stability, production readiness | Indirect — enables release | High — production blocker removal |

**Strategic perspective:**
- If the priority is **revenue**, Candidate A is the right choice (but requires external infrastructure)
- If the priority is **completing the product**, Candidate B finishes EPIC 7
- If the priority is **shipping**, Candidate F removes production blockers
- If the priority is **quality**, Candidate E improves performance

---

## 14. Recommended Product-Review Candidates

**NON-AUTHORITATIVE — for Product Owner review only.**

### Tier 1: Ready to implement, no blockers

| Rank | Candidate | Rationale |
|------|-----------|-----------|
| 1 | **B: Process Intelligence Backend Integration** | 90% complete, 5-day effort, no dependencies, no architecture conflicts, low risk, completes EPIC 7, stable engine API |
| 2 | **F: Technical Debt Cleanup (API URL + docs)** | API URL fix is critical and straightforward; PROJECT_STATUS.md update is needed regardless |

### Tier 2: Ready with conditions

| Rank | Candidate | Rationale |
|------|-----------|-----------|
| 3 | **E: Performance (quick wins only)** | Polling interval, React.memo on main pages, deprecate old Security page — all low-risk, low-effort |
| 4 | **A: License Activation** | 85% code-complete, but requires license server deployment and SDK installation first |

### Tier 3: Not recommended for SC-8C15

| Rank | Candidate | Rationale |
|------|-----------|-----------|
| 5 | **C: Module-Level Cleaner Migration** | 81-120 days, no user-facing value, explicitly deferred as "too large" |
| 6 | **D: Pause/Resume** | Blocked by scan_core freeze, high security risk, no user demand documented |

---

## 15. Required Product Owner Decisions

Before SC-8C15 can begin, the Product Owner must answer:

1. **Primary objective:** Which candidate (if any) is SC-8C15?
2. **Scope:** Is SC-8C15 a single candidate or a combination (e.g., B + F)?
3. **External dependencies:** For Candidate A — does the license server exist? Is the SDK available?
4. **scan_core freeze:** For Candidate D — should the freeze be lifted? (Requires explicit justification)
5. **PROJECT_STATUS.md:** Should updating PROJECT_STATUS.md be included in SC-8C15 scope?
6. **Priority:** Is the goal revenue (A), product completion (B), shipping (F), or quality (E)?
7. **Specification authorization:** Who creates the authoritative `SC8C15_SPECIFICATION.md`?

---

## 16. SC-8C16 Status

**SC-8C16 has not been defined.**

- Zero references to SC-8C16 exist in the repository
- Zero files matching `**/SC8C16*` exist
- Zero matches in git history
- Zero matches in any project-level planning document

**SC-8C16 is NOT started.**

---

## 17. Production Change Audit

| Change type | Count |
|------------|-------|
| Production files modified | 0 |
| Test files modified | 0 |
| Configuration modified | 0 |
| Architecture changes | 0 |
| New RPCs | 0 |
| Deleted files | 0 |
| New files (production) | 0 |

**This analysis produced ZERO production changes.** The only file created is this analysis report.

---

## 18. Post-SC-8C14 Baseline Confirmation

The post-SC-8C14 architecture baseline remains intact:

| Aspect | Status |
|--------|--------|
| Canonical scan_core remediation as only execution path | ✅ CONFIRMED |
| No legacy Security Center remediation execution | ✅ CONFIRMED |
| Canonical quarantine_list RPC (read-only, privacy-safe) | ✅ CONFIRMED |
| No remediation state in browser storage | ✅ CONFIRMED |
| Explicit approval for destructive operations | ✅ CONFIRMED |
| Backend-authoritative ActionPlans | ✅ CONFIRMED |
| SafetyGate, RemediationCoordinator, executors intact | ✅ CONFIRMED (scan_core frozen) |
| Active SmartScreen/Defender/Firewall RPCs | ✅ CONFIRMED |
| 18/18 security invariants | ✅ CONFIRMED |

**No modifications were made to this baseline.**

---

## 19. Final Verdict

**BLOCKED — AUTHORITATIVE SC-8C15 SPECIFICATION REQUIRED**

No candidate has been authorized by the Product Owner. This analysis provides source-verified data to inform the Product Owner's decision, but does not authorize implementation of any candidate.

---

## 20. Definition of Next Step

1. **Product Owner reviews this analysis**
2. **Product Owner selects a direction** (or defines a new one)
3. **An authoritative `SC8C15_SPECIFICATION.md` is created** with all 16 required elements:
   - Objective, Problem statement, Scope, Non-goals, Architecture decision, Affected modules, Backend changes, Frontend changes, RPC contracts, Persistence requirements, Security requirements, Privacy requirements, UX requirements, Test requirements, Acceptance criteria, Definition of Done
4. **An authoritative `SC8C15_PHASE_PLAN.md` is created** defining phases and migration order
5. **Only then may SC-8C15 implementation begin** — starting with its own Phase 1 inspection

Until step 2 is completed, **no SC-8C15 work is authorized.**

---

**End of SC-8C15 Phase 2 Product Direction Analysis**
