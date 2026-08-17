# SC-8C14 Phase 2 — Product Direction Analysis

## 1. Executive Summary

A comprehensive product direction analysis was performed for SC-8C14. All 6 speculative candidates (A–F) were investigated against actual source code, not just prior reports. Every claim about dead code, production reachability, and implementation state was verified.

**Key findings:**

- **No candidate is a clear winner.** The post-SC-8C13 architecture has zero security invariant violations, so no candidate addresses an active security emergency.
- **Candidates A and E are too small** for a full SC-8C phase — they are maintenance cleanup tasks.
- **Candidate C is too large** (7+ phases) — it is a multi-release initiative, not a single SC-8C phase.
- **Candidate D is high-risk** — it requires `scan_core` internal modifications and conflicts with the "no automatic resume" invariant. No user demand evidence exists.
- **Candidate B is the strongest architecture candidate** — it is a direct continuation of SC-8C12, has clear evidence, low risk, and reduces architectural complexity by ~70% in the security-remediation codebase. However, it is cleanup, not a security fix.
- **Candidate F (V1.2 Roadmap) contains the strongest product-value candidates** — License Activation and Customer Portal have high customer value and are partially implemented, but they are product features, not architecture migrations.

**RECOMMENDED DIRECTION — NOT AUTHORITATIVE:**

The repository evidence supports two possible directions, depending on whether the Product Owner wants SC-8C14 to remain architecture-focused or become product-focused:

1. **If architecture-focused:** Candidate B (Security Center Legacy Backend Cleanup) — 2–3 phases, low risk, clear evidence
2. **If product-focused:** License Activation Integration (from Candidate F) — high customer value, infrastructure already exists, enables revenue

**No candidate has been declared authoritative. Product Owner decision required.**

---

## 2. SC-8C13 Baseline

SC-8C13 is COMPLETE and PRODUCTION READY. All 5 phases done.

| Achievement | Status |
|-------------|--------|
| BackgroundCleanupService detection/notification-only | ✅ |
| Dashboard One-Click Optimize → canonical scan_core | ✅ |
| Legacy dashboard.optimize.execute deleted | ✅ |
| DASHBOARD_OPTIMIZE_EXECUTE deleted | ✅ |
| dashboardService.executeOptimize deleted | ✅ |
| DashboardViewModel legacy optimize methods deleted | ✅ |
| OneClickOptimize.tsx deleted | ✅ |
| executionHandler.ts deleted | ✅ |
| Three modules use canonical scan_core | ✅ |
| Full frontend: 8121 passed | ✅ |
| Full backend: 971 passed, 14 skipped | ✅ |
| Zero production-reachable legacy Dashboard execution | ✅ |
| Zero security invariant violations | ✅ |

### Post-SC-8C13 architecture state

- `scan_core` is the canonical remediation architecture
- `RemediationCoordinator`, `SafetyGate`, `ActionPlanRepository`, `ExecutionRepository`, `ExecutionLedger` are authoritative
- Three modules (Smart Optimization, Security Center, Dashboard) all use canonical remediation
- No automatic destructive execution anywhere
- No parallel remediation execution paths reachable from production UI
- No remediation state in browser storage

---

## 3. Repository Evidence

### Verification methodology

Every claim from prior reports was verified against current source code:

| Claim | Verification method | Result |
|-------|---------------------|--------|
| Health Scan Modals are dead | grep for imports across `src/` | ✅ Confirmed — zero imports |
| Security Center legacy execution is disconnected | grep for execution method calls | ✅ Confirmed |
| `security.enableSmartScreen/Defender/Firewall` are dead | grep across `src/` | ❌ **CORRECTION** — these are ACTIVE, called by `dashboard.service.ts` and `ProtectionCenterPage.tsx` |
| `OptimizationExecutionCoordinator` (smart-opt) is dead | grep for imports | ✅ Confirmed — not exported from barrel, only used by deprecated methods |
| Module-level cleaners don't use scan_core | grep for scan_core references | ✅ Confirmed |
| Pause/resume does not exist | grep for pause/resume in scan_core | ✅ Confirmed |
| Process Intelligence UI is incomplete | check route + page component | ❌ **CORRECTION** — UI is COMPLETE, route registered at `/process-intelligence` |

### Important corrections to prior reports

1. **`security.enableSmartScreen/Defender/Firewall` RPCs are NOT dead** — they are actively called by `dashboard.service.ts` (lines 46-48) and `ProtectionCenterPage.tsx`. The SC-8C12 Phase 5 subagent incorrectly classified them as dead. They must NOT be deleted.

2. **Process Intelligence Dashboard UI is COMPLETE** — `PROJECT_STATUS.md` says "Engine Complete, No UI" but the UI exists at `apps/pc-optimizer/src/features/process-ai/ui/ProcessIntelligencePage.tsx` (338 lines) with route `/process-intelligence` registered. This is no longer a V1.2 roadmap item.

3. **`security.quarantine.list` is transitional but production-reachable** — called by `SecurityCenterService.getQuarantineSummary()` via `securityBackendService.listQuarantined()`.

---

## 4. Candidate A Analysis — Health Scan Modal Cleanup

### Repository evidence

| File | Location | Lines | Status |
|------|----------|-------|--------|
| `HealthScanModal.tsx` | `dashboard/components/` | ~550 | Dead — zero imports |
| `UnifiedHealthScanModal.tsx` | `dashboard/components/` | ~200 | Dead — zero imports |
| `UnifiedHealthScanResults.tsx` | `dashboard/components/` | ~50 | Dead — zero imports |

### Verification results

- **Production imports:** ZERO (grep across `apps/pc-optimizer/src/` confirms no file imports any of these components)
- **Test imports:** ZERO (no test file imports them)
- **Route references:** ZERO (no route references them)
- **Dynamic imports:** ZERO (no `lazy()` or dynamic import references)
- **Type exports:** `HealthScanModalProps` interface exported but not imported anywhere

### Related state in DashboardViewModel

The health scan state machine (`healthScanStep`, `healthScanReport`, `healthScanModules`, `healthScanResult`, `healthScanExecution`, etc.) exists in `DashboardViewModel.ts` but is only referenced by:
- `DashboardViewModel.ts` itself (state management)
- `SmartOptimization.test.ts` (test assertions)

No production component reads or displays this state. The entire health scan flow is dead.

### `OptimizeExecuteResponse` type dependency

`OptimizeExecuteResponse` is used by:
- `DashboardViewModel.ts` (for `healthScanResult` state field — dead)
- `HealthScanModal.tsx` (dead)
- `UnifiedHealthScanModal.tsx` (dead)
- `UnifiedHealthScanResults.tsx` (dead)
- `LastScanResults.tsx` (also dead — not imported by any production code)

If all dead components are removed, `OptimizeExecuteResponse` type can also be removed from `DashboardViewModel` and `dashboard.types.ts`.

### Assessment

| Criterion | Assessment |
|-----------|------------|
| Truly dead? | ✅ Yes — zero imports anywhere |
| Still reachable? | ❌ No |
| Used by legitimate features? | ❌ No |
| Compatibility components? | ❌ No |
| Deletion provides meaningful architectural value? | Minimal — removes ~800 lines of dead code |
| Deletion provides meaningful security value? | None |
| Could this be completed as small cleanup? | ✅ Yes — <1 hour task |
| Should this be SC-8C14? | ❌ No — insufficient scope |

### Verdict: NOT RECOMMENDED for SC-8C14 — maintenance cleanup task

---

## 5. Candidate B Analysis — Security Center Legacy Backend Cleanup

### Repository evidence

#### Frontend classes in `security-remediation/`

| Class | Production-reachable? | Used by | Status |
|-------|----------------------|---------|--------|
| `ThreatRemediationEngine` | YES (read-only only) | `SecurityCenterService.ts:37` | Active — read-only domain methods |
| `ThreatRemediationPlanner` | Indirect (via Engine) | `ThreatRemediationEngine` | Internal — candidate plan creation |
| `ThreatApprovalManager` | NO | `ThreatRemediationEngine` (dead methods) | Dead |
| `ThreatRollbackManager` | NO | `ThreatRemediationEngine` (dead methods) | Dead |
| `ThreatQuarantineManager` | NO | `ThreatRemediationEngine` (dead methods) | Dead |
| `ThreatRestoreManager` | NO | `ThreatRemediationEngine` (dead methods) | Dead |
| `ThreatDeletionManager` | NO | `ThreatRemediationEngine` (dead methods) | Dead |
| `ThreatSafetyValidator` | Indirect (via Planner) | `ThreatRemediationPlanner` | Internal — candidate plan validation |
| `ThreatRemediationHistory` | Indirect (via Engine) | `ThreatRemediationEngine` | Active — read-only history |
| `ThreatRemediationReportGenerator` | Indirect (via Engine) | `ThreatRemediationEngine` | Active — report generation |
| `ThreatFalsePositiveTracker` | Indirect (via Engine) | `ThreatRemediationEngine` | Active — false-positive tracking |
| `ThreatRecoveryProvider` | Indirect (via Engine) | `ThreatRemediationEngine` | Active — recovery data |

#### `ThreatRemediationEngine` method classification

| Method | Production caller | Purpose | Status |
|--------|------------------|---------|--------|
| `createRemediationPlan()` | `SecurityCenterService` | Planning-only (candidate plan) | ✅ Active |
| `getPlan()` | `SecurityCenterService` | Read-only plan lookup | ✅ Active |
| `getAllPlans()` | `SecurityCenterService` | Read-only plan listing | ✅ Active |
| `getQuarantineEntry()` | `SecurityCenterService` | Read-only quarantine lookup | ✅ Active |
| `getQuarantineSummary()` | `SecurityCenterService` | Read-only quarantine stats | ✅ Active (transitional RPC) |
| `markFalsePositive()` | `SecurityCenterService` | False-positive tracking | ✅ Active |
| `isFalsePositive()` | `SecurityCenterService` | False-positive check | ✅ Active |
| `generateReport()` | `SecurityCenterService` | Report generation | ✅ Active |
| `getHistory()` | `SecurityCenterService` | Read-only history | ✅ Active |
| `getDashboard()` | `SecurityCenterService` | Read-only dashboard | ✅ Active |
| `getConfiguration()` | `SecurityCenterService` | Read-only config | ✅ Active |
| `updatePolicy()` | `SecurityCenterService` | Policy update | ✅ Active |
| `executePlan()` | NONE | Legacy execution | ❌ Dead |
| `approvePlan()` | NONE | Legacy approval | ❌ Dead |
| `rejectPlan()` | NONE | Legacy rejection | ❌ Dead |
| `rollbackAction()` | NONE | Legacy rollback | ❌ Dead |

#### Backend RPCs in `security_remediation/__init__.py`

| RPC | Production caller | Status |
|-----|-------------------|--------|
| `security.quarantine.list` | `SecurityCenterService.getQuarantineSummary()` | ✅ Active (transitional) |
| `security.quarantine` | NONE | ❌ Dead |
| `security.quarantine.restore` | NONE | ❌ Dead |
| `security.quarantine.delete` | NONE | ❌ Dead |
| `security.remediation.plan` | NONE | ❌ Dead |
| `security.remediation.execute` | NONE | ❌ Dead |
| `security.remediation.rollback` | NONE | ❌ Dead |
| `security.enableSmartScreen` | `dashboard.service.ts`, `ProtectionCenterPage.tsx` | ✅ **ACTIVE — NOT DEAD** |
| `security.enableDefender` | `dashboard.service.ts`, `ProtectionCenterPage.tsx` | ✅ **ACTIVE — NOT DEAD** |
| `security.enableFirewall` | `dashboard.service.ts`, `ProtectionCenterPage.tsx` | ✅ **ACTIVE — NOT DEAD** |

#### Frontend `securityBackendService.ts` methods

| Method | Production caller | Status |
|--------|-------------------|--------|
| `getSnapshot()` | `SecurityCenterService` | ✅ Active (read-only) |
| `fullSystemScan()` | `SecurityCenterService` | ✅ Active (read-only) |
| `listQuarantined()` | `SecurityCenterService` | ✅ Active (transitional) |
| `quarantineFile()` | NONE | ❌ Dead |
| `restoreQuarantined()` | NONE | ❌ Dead |
| `deleteQuarantined()` | NONE | ❌ Dead |
| `generateRemediationPlan()` | NONE | ❌ Dead |
| `executeRemediationPlan()` | NONE | ❌ Dead |
| `rollbackRemediation()` | NONE | ❌ Dead |

### Legacy destructive execution reachability

**ZERO legacy destructive execution is reachable.** All execution methods removed from `SecurityCenterService` and `SecurityCenterViewModel` in SC-8C12 Phase 5. All remediation execution uses canonical `scan_core.remediation.*` flow.

### What cleanup would involve

1. Delete 6 dead backend RPC handlers (`security.quarantine`, `security.quarantine.restore`, `security.quarantine.delete`, `security.remediation.plan`, `security.remediation.execute`, `security.remediation.rollback`)
2. Delete 6 dead frontend RPC wrapper methods in `securityBackendService.ts`
3. Delete 6 dead RPC constants from `packages/shared/src/rpc/index.ts`
4. Delete dead classes: `ThreatApprovalManager`, `ThreatRollbackManager`, `ThreatQuarantineManager`, `ThreatRestoreManager`, `ThreatDeletionManager`
5. Refactor `ThreatRemediationEngine` to remove dead execution methods
6. Create canonical `scan_core.security_remediation.quarantine_list` RPC to replace transitional `security.quarantine.list`
7. Update tests that depend on deleted classes
8. **DO NOT delete** `security.enableSmartScreen/Defender/Firewall` — they are ACTIVE

### Assessment

| Criterion | Assessment |
|-----------|------------|
| Security value | Low — execution paths already disconnected |
| Architectural value | Medium — ~70% reduction in security-remediation codebase complexity |
| Complexity | MEDIUM |
| Risk | Low — legacy execution already disconnected |
| Requires scan_core changes | Potentially (new `quarantine_list` RPC) |
| Requires new RPCs | Yes — `scan_core.security_remediation.quarantine_list` |
| Requires new ActionTypes | No |
| Requires new executors | No |
| Affects SafetyGate | No |
| Affects RemediationCoordinator | No |
| Affects persistence/recovery | No |
| Affects frontend UX | Minimal — read-only views unchanged |
| Estimated phases | 2–3 |
| Confidence | MEDIUM |

### Verdict: RECOMMENDED FOR PRODUCT REVIEW (if architecture-focused)

---

## 6. Candidate C Analysis — Module-Level Cleaner Integration

### Repository evidence

12 independent cleaner modules were identified, none using `scan_core`:

| Module | RPC | Safety model | Rollback | scan_core? |
|--------|-----|-------------|----------|------------|
| Junk Cleaner | `CLEANER_CLEAN_EXECUTE` | Preview→confirm→execute, undo, 500MB limit | Yes | No |
| Registry Cleaner | `registry.clean` | Manual review, backup, 20 issue limit | Yes | No |
| Privacy Cleaner | `privacy.clean` | Category selection | No | No |
| Startup Manager | `startup.disable` | Manual selection, 3 disable limit | Yes | No |
| Duplicate Finder | `duplicate.delete` | Manual selection, keeps original | No | No |
| Performance Monitor | `performance.memory.optimize` | Thresholds, manual trigger | No | No |
| Browser Health | `PRIVACY_CLEAN` | Confirm for history/cookies | Yes | No |
| Storage Intelligence | `CLEANER_CLEAN_EXECUTE` | Large files review-only | Yes | No |
| JunkCleanerTask | `CLEANER_*` | MaintenanceTask interface | No | No |
| BrowserCleanerTask | `CLEANER_*` | MaintenanceTask interface | No | No |
| RecycleBinCleanerTask | `CLEANER_*` | MaintenanceTask interface | No | No |
| TempFilesCleanerTask | `CLEANER_*` | MaintenanceTask interface | No | No |

### Key findings

- These are **intentionally independent** from `scan_core` — they are core V1.0 features with established UX
- They have their own safety models (confirmation dialogs, preview, undo, edition limits)
- Migration would require **new ActionTypes** for memory optimization, uninstallation, duplicate-specific operations
- Migration would require **new executors** for memory optimization and uninstallation
- Migration would **change the UX of every cleaner page** — very high regression risk
- Junk Cleaner is the most similar to `scan_core` (has preview→confirm→execute with undo)

### Assessment

| Criterion | Assessment |
|-----------|------------|
| Security value | Medium — cleaners have own safety but not canonical controls |
| Architectural value | High — standardizes all cleaners under canonical remediation |
| Complexity | VERY HIGH — 6+ independent modules |
| Risk | HIGH — core V1.0 features with established UX and extensive tests |
| Requires scan_core changes | Partially — existing ActionTypes cover some operations |
| Requires new RPCs | No (existing scan_core.remediation.* sufficient for covered ops) |
| Requires new ActionTypes | Potentially — memory optimization, uninstallation, duplicate-specific |
| Requires new executors | Potentially — memory optimization, uninstallation |
| Affects SafetyGate | Potentially |
| Affects RemediationCoordinator | No |
| Affects persistence/recovery | No |
| Affects frontend UX | VERY HIGH — would change UX of every cleaner page |
| Estimated phases | 7+ (one per cleaner module) |
| Confidence | LOW — too large for a single SC-8C phase |

### Verdict: NOT RECOMMENDED for SC-8C14 — too large, should be a long-term multi-release initiative

---

## 7. Candidate D Analysis — Pause/Resume Backend Contract

### Repository evidence

**Pause/resume does NOT exist** in the `scan_core` architecture:

- `RemediationCoordinator` has `cancel()` but NO `pause()` or `resume()` methods
- `CancellationToken` supports binary cancellation only — no pause state
- `ExecutionStatus` enum has NO PAUSED state
- `ExecutionState` state machine has NO PAUSED state
- `ExecutionRepository` has no PAUSED state support
- No `scan_core.remediation.pause` or `scan_core.remediation.resume` RPC methods exist
- Frontend `moduleConfigs.ts` explicitly states `supportsPause: false`

### What exists instead

- **Cancellation** via `CancellationToken` and `scan_core.remediation.cancel` RPC
- **Restart recovery** via `ExecutionRepository.get_completed_action_ids()` seeding `ExecutionLedger`
- **Status polling** every 500ms for progress updates

### What would need to change

| Component | Change required |
|-----------|----------------|
| `RemediationCoordinator` | Add `pause()` and `resume()` methods, pause state tracking |
| `CancellationToken` | Add pause state or new `PauseResumeToken` type |
| All executors (6+) | Add `is_paused()` checks at action boundaries |
| `ExecutionState` | Add PAUSED state, new transitions (RUNNING→PAUSED, PAUSED→RUNNING, PAUSED→CANCELLED) |
| `ExecutionRepository` | Persist PAUSED state, handle restart-while-paused |
| New RPCs | `scan_core.remediation.pause`, `scan_core.remediation.resume` |
| Frontend | New pause/resume UI controls, new service methods |
| `SafetyGate` | Potentially — re-validation on resume |

### Security conflict

**Pause/resume conflicts with the "no automatic resume" invariant:**
- If execution is paused and app restarts, should it auto-resume? (violates invariant)
- If paused, should approval token remain valid? (security risk)
- Resume could be mistaken for automatic execution

### Product demand

**No evidence of user demand.** No user feedback, tickets, or feature requests mention pause/resume for remediation. SC-8C11 deferred it without user demand justification. The unified scan UI has pause/resume buttons but they are stubs.

### Assessment

| Criterion | Assessment |
|-----------|------------|
| Security value | HIGH RISK — introduces new execution state conflicting with approval semantics |
| Architectural value | Medium — convenience feature for long-running operations |
| Complexity | HIGH — changes across 10+ files |
| Risk | HIGH — modifying RemediationCoordinator and all executors |
| Requires scan_core changes | YES — RemediationCoordinator, CancellationToken, all executors, ExecutionRepository |
| Requires new RPCs | Yes — pause and resume |
| Requires new ActionTypes | No |
| Requires new executors | No |
| Affects SafetyGate | Potentially — re-validation on resume |
| Affects RemediationCoordinator | YES — add pause() and resume() |
| Affects persistence/recovery | YES — paused state persistence |
| Affects frontend UX | Medium — pause/resume UI |
| Estimated phases | 3–4 |
| Confidence | LOW — no user demand, conflicts with established baseline |
| Is this a new capability or migration? | NEW CAPABILITY — not a migration |

### Verdict: NOT RECOMMENDED for SC-8C14 — should be an independent project with its own specification

---

## 8. Candidate E Analysis — Smart Optimization Dead Code Cleanup

### Repository evidence

**Remaining dead code after SC-8C13 Phase 5:**

| Component | Location | Lines | Status |
|-----------|----------|-------|--------|
| `OptimizationExecutionCoordinator.ts` | `smart-optimization-ai/` | 235 | Dead — not exported from barrel, only used by deprecated methods |
| `SmartOptimizationEngine.executePlan()` | `smart-optimization-ai/` | ~20 | Deprecated — only called from tests |
| `SmartOptimizationEngine.rollbackAction()` | `smart-optimization-ai/` | ~3 | Deprecated — only called from tests |
| `SmartOptimizationEngine.setExecutionHandler()` | `smart-optimization-ai/` | ~3 | Deprecated — only called from tests |
| `SmartOptimizationEngine.getApprovalManager()` | `smart-optimization-ai/` | ~3 | Deprecated — only called from tests |

### `SmartOptimizationEngine` active vs deprecated

**Active (called by `SmartOptimizationPage.tsx`):**
- `generatePlan()`, `preview()`, `simulate()`, `generateInsights()`, `buildDashboard()`, `getConfiguration()`, `updateConfiguration()`, `getHistory()`, `getLearning()`, `getLastPlan()`, `dispose()`

**Deprecated (only called from `smartOptimizationEngine.test.ts`):**
- `executePlan()`, `rollbackAction()`, `setExecutionHandler()`, `getApprovalManager()`

### Two different `OptimizationExecutionCoordinator` files

| File | Purpose | Status |
|------|---------|--------|
| `smart-optimization-ai/OptimizationExecutionCoordinator.ts` | Legacy AI execution coordinator | Dead — not exported, only used by deprecated methods |
| `optimization-execution/optimizationExecutionCoordinator.ts` | Maintenance engine coordinator | Active — exported, used by production code |

These are completely different, unrelated files with an unfortunate naming collision.

### Assessment

| Criterion | Assessment |
|-----------|------------|
| Security value | None |
| Architectural value | Low — removes 1 dead file + 4 deprecated methods |
| Complexity | LOW — <1 hour task |
| Risk | Very low — no production code changes |
| Requires scan_core changes | No |
| Requires new RPCs | No |
| Requires new ActionTypes | No |
| Requires new executors | No |
| Affects SafetyGate | No |
| Affects RemediationCoordinator | No |
| Affects persistence/recovery | No |
| Affects frontend UX | No |
| Estimated phases | <1 (cleanup task) |
| Confidence | HIGH that it's too small |

### Verdict: NOT RECOMMENDED for SC-8C14 — maintenance cleanup task

---

## 9. Candidate F Analysis — V1.2 Product Roadmap

### Repository evidence

| Item | Implementation state | Customer value | Complexity |
|------|---------------------|----------------|------------|
| Process Intelligence Dashboard UI | ✅ **COMPLETE** (UI exists at `/process-intelligence`) | High | — |
| Customer Portal production release | Partial (~40%) — UI scaffold complete, API stubbed | High | High |
| License Activation integration | Partial (~60%) — infrastructure complete, SDK code exists, not wired to real backend | High | High |
| Telemetry implementation | Partial (~30%) — local telemetry exists, cloud not implemented | Medium | Medium |
| Code signing | Not started — external dependency (certificate purchase) | High | Low (config) |
| MSI installer | Not started — config change only | Medium | Low |
| Performance optimizations | Partial (~60%) — lazy loading complete, React.memo partial, shared metrics store not implemented | Medium | Medium |
| Additional language support | Scaffold (~10%) — infrastructure complete, only English complete | Medium | High |

### Placeholder apps

| App | Contents | Status |
|-----|----------|--------|
| `apps/security` | package.json + empty index.ts | Empty placeholder |
| `apps/driver-updater` | package.json + empty index.ts | Empty placeholder |
| `apps/file-recovery` | package.json + empty index.ts | Empty placeholder |
| `apps/vpn` | package.json + empty index.ts | Empty placeholder |

### Key findings

1. **Process Intelligence Dashboard UI is already COMPLETE** — `PROJECT_STATUS.md` is outdated. The UI exists, route is registered, sidebar navigation configured. This is no longer a roadmap item.

2. **License Activation is the highest-value product candidate** — infrastructure exists (`@avs/licensing` package, `SdkActivationService`, `ActivationPage.tsx`), but `NullLicensingService` is still the fallback. Enabling real activation would unlock Professional edition revenue.

3. **Customer Portal is a separate application** — it's a Next.js app at `apps/customer-portal/`, not part of the pc-optimizer. It would be a separate project, not an SC-8C phase.

4. **Code signing is an external dependency** — requires purchasing an EV certificate. Not a development task.

5. **MSI installer is a configuration change** — too small for SC-8C14.

6. **Performance optimizations are partially done** — lazy loading complete, React.memo partial. Remaining work (shared metrics store) is medium complexity.

### Assessment

| Sub-candidate | Security value | Architecture value | Complexity | Risk | SC-8C14 suitable? |
|---------------|----------------|-------------------|------------|------|-------------------|
| License Activation | High | Medium | High | Medium | Yes — if product-focused |
| Customer Portal | High | Medium | High | Medium | No — separate app |
| Telemetry | Medium | Low | Medium | Low | Possible |
| Performance optimizations | None | Medium | Medium | Low | Possible |
| Additional languages | None | Low | High | Low | No — translation work |
| Code signing | Critical | Low | Low | Low | No — external dependency |
| MSI installer | Low | Low | Low | Low | No — too small |

### Verdict: License Activation RECOMMENDED FOR PRODUCT REVIEW (if product-focused); others NOT RECOMMENDED for SC-8C14

---

## 10. Security Comparison

| Candidate | Addresses active security violation? | Security value |
|-----------|--------------------------------------|----------------|
| A: Health Scan Modal | No — dead code | None |
| B: Security Center Legacy | No — execution already disconnected | Low (cleanup) |
| C: Module Cleaners | No — cleaners have own safety models | Medium (theoretical) |
| D: Pause/Resume | No — introduces NEW security risk | HIGH RISK (negative) |
| E: Smart Opt Dead Code | No — dead code | None |
| F: License Activation | Yes — enables edition enforcement | High |
| F: Telemetry | Potentially — privacy compliance | Medium |

**No candidate addresses an active security invariant violation.** The post-SC-8C13 architecture has zero violations. All candidates are either cleanup, new features, or new capabilities.

---

## 11. Architecture Comparison

| Candidate | Moves toward canonical scan_core? | Removes parallel architecture? | Requires scan_core changes? | Requires new ActionTypes? | Requires new executors? | Affects SafetyGate? | Affects RemediationCoordinator? | Requires new RPCs? | Requires new persistence? | Requires new frontend workflow? | Risks SC-8C10-13 baseline? |
|-----------|----------------------------------|------------------------------|---------------------------|-------------------------|------------------------|---------------------|-------------------------------|-------------------|--------------------------|-------------------------------|---------------------------|
| A | No | No | No | No | No | No | No | No | No | No | No |
| B | Partially (new quarantine_list RPC) | Yes — removes dead parallel paths | Potentially (new read-only RPC) | No | No | No | No | Yes (1 new read-only RPC) | No | No | No |
| C | Yes — all cleaners would use scan_core | Yes — removes 12 independent paths | Partially | Potentially | Potentially | Potentially | No | No | No | YES — all cleaner pages | YES — high regression risk |
| D | No — new capability, not migration | No | YES — core changes | No | No | Potentially | YES | Yes (2 new RPCs) | YES | Yes | YES — conflicts with baseline |
| E | No | No | No | No | No | No | No | No | No | No | No |
| F: License | No | No | No | No | No | No | No | No | No | Minimal | No |
| F: Telemetry | No | No | No | No | No | No | No | No | No | Minimal | No |

---

## 12. Product Value Comparison

| Candidate | Security value | User value | Reliability value | Architectural value | Maintainability | Visible UX impact | Long-term benefit |
|-----------|----------------|------------|-------------------|--------------------|-----------------|-------------------|-------------------|
| A | None | None | None | Low | Low improvement | None | Low |
| B | Low | None | None | Medium | Medium improvement | None | Medium |
| C | Medium | Low (UX change risk) | Medium | High | High improvement | HIGH (risk) | High |
| D | HIGH RISK | Medium (convenience) | Low | Medium | Low | Medium | Low |
| E | None | None | None | Low | Low improvement | None | Low |
| F: License | High | High (enables Pro edition) | Medium | Medium | Medium | Yes (activation UI) | High (revenue) |
| F: Telemetry | Medium | Low | Medium | Low | Low | Minimal | Medium |
| F: Performance | None | Medium | Low | Medium | Low | Yes (smoother UI) | Medium |

---

## 13. Complexity Comparison

| Candidate | Complexity | Major components | Frontend impact | Backend impact | Persistence impact | RPC impact | Test impact | Migration risk |
|-----------|------------|-----------------|-----------------|----------------|-------------------|------------|-------------|----------------|
| A | LOW | 3 dead files | Delete 3 files | None | None | None | Minimal | None |
| B | MEDIUM | ~15 files | Delete 6 methods, refactor 1 class | Delete 6 RPC handlers, add 1 RPC | None | Delete 6 constants, add 1 RPC | Medium (test updates) | Low |
| C | VERY HIGH | 12+ modules | VERY HIGH (all cleaner pages) | HIGH (new executors) | HIGH (new persistence) | HIGH (new RPCs) | VERY HIGH | HIGH |
| D | HIGH | 10+ files | Medium (new UI controls) | HIGH (coordinator + executors) | HIGH (paused state) | HIGH (2 new RPCs) | HIGH | HIGH |
| E | LOW | 2 files | Delete 1 file, remove 4 methods | None | None | None | Low (1 test file) | None |
| F: License | HIGH | License server + SDK + UI | Medium (activation flow) | HIGH (license server) | Medium (license storage) | Medium (license APIs) | HIGH | Medium |
| F: Telemetry | MEDIUM | Telemetry backend + privacy controls | Low (toggle UI) | Medium (analytics pipeline) | Medium (telemetry storage) | Medium (telemetry APIs) | Medium | Low |
| F: Performance | MEDIUM | Shared metrics store + component optimization | Medium (component refactoring) | None | None | None | Medium | Low |

---

## 14. Risk Comparison

| Candidate | Risk level | Primary risks |
|-----------|------------|---------------|
| A | None | Dead code removal — no risk |
| B | Low | Test compatibility — some tests depend on deleted classes |
| C | HIGH | Breaking core V1.0 UX, extensive test suite regression |
| D | HIGH | Conflicts with "no automatic resume" invariant, core architecture damage |
| E | None | Dead code removal — no risk |
| F: License | Medium | License server deployment, cryptographic operations, offline mode |
| F: Telemetry | Low | Privacy compliance, GDPR |
| F: Performance | Low | Component refactoring — existing tests may need updates |

---

## 15. Dependency Analysis

| Candidate | Dependencies | Status |
|-----------|--------------|--------|
| A | None | ✅ Ready |
| B | SC-8C12 completed | ✅ Ready |
| C | scan_core architecture (available), new ActionTypes (not created) | ⚠️ Partially ready |
| D | scan_core internal modifications | ❌ Conflicts with baseline |
| E | None | ✅ Ready |
| F: License | License server (not built), EV code signing certificate (not obtained) | ❌ External dependencies |
| F: Telemetry | Analytics backend (not built), privacy policy review | ❌ External dependencies |
| F: Performance | None | ✅ Ready |

---

## 16. Decision Matrix

| Criterion | A: Health Scan Modal | B: SC Legacy Cleanup | C: Module Cleaners | D: Pause/Resume | E: Smart Opt Dead Code | F: License Activation | F: Telemetry | F: Performance |
|-----------|---------------------|---------------------|-------------------|-----------------|----------------------|----------------------|-------------|----------------|
| **Objective** | Delete dead UI | Remove dead SC backend | Migrate cleaners to scan_core | Add pause/resume | Delete dead smart-opt code | Enable license activation | Implement telemetry | Optimize performance |
| **Repository evidence** | Strong (zero imports) | Strong (SC-8C12 Phase 5) | Strong (12 modules) | Strong (no pause exists) | Strong (not exported) | Strong (NullLicensingService) | Medium (local only) | Medium (partial) |
| **Current state** | Dead code | Dead code + read-only | Active production | Not implemented | Dead code | Partial (60%) | Partial (30%) | Partial (60%) |
| **Security value** | None | Low | Medium | HIGH RISK | None | High | Medium | None |
| **Product value** | None | None | Low | Medium | None | High | Medium | Medium |
| **Architecture value** | Low | Medium | High | Medium | Low | Medium | Low | Medium |
| **Complexity** | LOW | MEDIUM | VERY HIGH | HIGH | LOW | HIGH | MEDIUM | MEDIUM |
| **Risk** | None | Low | HIGH | HIGH | None | Medium | Low | Low |
| **Dependencies** | None | SC-8C12 ✅ | scan_core + new types | scan_core changes | None | License server ❌ | Analytics backend ❌ | None ✅ |
| **scan_core impact** | None | Low (1 new RPC) | Partial | HIGH (core changes) | None | None | None | None |
| **Frontend impact** | Delete 3 files | Delete 6 methods | VERY HIGH | Medium | Delete 1 file | Medium | Low | Medium |
| **Backend impact** | None | Delete 6 RPCs, add 1 | HIGH | HIGH | None | HIGH | Medium | None |
| **Persistence impact** | None | None | HIGH | HIGH | None | Medium | Medium | None |
| **Likely phase count** | <1 | 2-3 | 7+ | 3-4 | <1 | 3-4 | 2-3 | 2 |
| **Confidence** | HIGH (too small) | MEDIUM | LOW (too large) | LOW (conflicts) | HIGH (too small) | MEDIUM | LOW | MEDIUM |
| **Recommendation** | NOT RECOMMENDED | RECOMMENDED (arch) | NOT RECOMMENDED | NOT RECOMMENDED | NOT RECOMMENDED | RECOMMENDED (product) | NOT RECOMMENDED | POSSIBLE |

---

## 17. Recommended Direction

**RECOMMENDED DIRECTION — NOT AUTHORITATIVE**

The repository evidence does not support a single clear winner. The recommendation depends on whether the Product Owner wants SC-8C14 to remain architecture-focused or become product-focused.

### If architecture-focused: Candidate B (Security Center Legacy Backend Cleanup)

**Rationale:**
1. Direct continuation of SC-8C12's legacy disconnection work
2. Clear evidence — SC-8C12 Phase 5 documented all remaining items
3. Low risk — execution paths already disconnected
4. Medium complexity — 2–3 phases
5. No scan_core internal modifications (only 1 new read-only RPC)
6. No new ActionTypes or executors
7. ~70% reduction in security-remediation codebase complexity
8. Does not risk the SC-8C10-13 baseline

**Why not the others (architecture):**
- A and E are too small (maintenance cleanup)
- C is too large (7+ phases, high regression risk)
- D conflicts with the established baseline

### If product-focused: License Activation Integration (from Candidate F)

**Rationale:**
1. Highest customer value — enables Professional edition and revenue
2. Infrastructure already exists (`@avs/licensing` package, `SdkActivationService`, `ActivationPage.tsx`)
3. High security value — enables edition enforcement
4. Clear product requirements (documented in `COMMERCIAL_CHECKLIST.md`)
5. 60% already implemented — infrastructure, SDK integration code, UI all exist
6. Main gap: license server backend and real SDK wiring

**Why not the others (product):**
- Customer Portal is a separate application, not an SC-8C phase
- Telemetry requires external analytics backend
- Code signing is an external dependency (certificate purchase)
- MSI installer is too small (configuration change)
- Performance optimizations are partially done and medium value
- Additional languages are translation work, not engineering

---

## 18. Alternatives

### Alternative 1: Combined cleanup phase (A + B + E)

Combine Candidates A, B, and E into a single "Legacy Dead Code Cleanup" phase:
- Delete 3 dead health scan modal components (A)
- Remove dead Security Center legacy backend (B)
- Delete dead Smart Optimization code (E)
- Create canonical `quarantine_list` RPC (from B)

**Pros:** Comprehensive cleanup, low risk, clears technical debt
**Cons:** No user-visible value, no security improvement, may be too much cleanup for one phase

### Alternative 2: Split SC-8C14 into two phases

- **SC-8C14:** Architecture cleanup (Candidate B + A + E)
- **SC-8C15:** Product feature (License Activation)

**Pros:** Separates concerns, allows cleanup before new features
**Cons:** Two phases instead of one, delays product features

### Alternative 3: Defer SC-8C14, start V1.2 product roadmap

Skip architecture cleanup entirely and begin product-focused work:
- License Activation as a product project (not SC-8C)
- Architecture cleanup as maintenance tasks

**Pros:** Focuses on customer value and revenue
**Cons:** Technical debt continues to accumulate

### Alternative 4: No SC-8C14

The post-SC-8C13 architecture is production-ready with zero security violations. SC-8C14 may not be necessary at all. The Product Owner may choose to:
- Handle A, B, E as maintenance cleanup tasks
- Handle C as a long-term multi-release initiative
- Handle D as an independent project if user demand emerges
- Handle F as V1.2 product roadmap work

**Pros:** Avoids unnecessary phase overhead
**Cons:** No structured approach to remaining technical debt

---

## 19. Required Product Decisions

The Product Owner must answer the following questions before an authoritative SC-8C14 specification can be created:

### Critical decisions

1. **What is the primary objective of SC-8C14?**
   - Architecture cleanup?
   - Product feature delivery?
   - Security improvement?
   - Technical debt reduction?

2. **Should SC-8C14 remain architecture-focused or become product-focused?**
   - Architecture-focused → Candidate B
   - Product-focused → License Activation
   - Both → Split into two phases

3. **Which candidate is selected?**
   - Candidate B (Security Center Legacy Cleanup)?
   - License Activation (from Candidate F)?
   - Combined cleanup (A + B + E)?
   - None — defer SC-8C14?

4. **Should cleanup-only work (A, B, E) be included?**
   - As part of SC-8C14?
   - As maintenance tasks outside SC-8C14?

5. **Should module-level cleaner migration (Candidate C) be started?**
   - As SC-8C14? (too large)
   - As a separate multi-release initiative?
   - Deferred indefinitely?

6. **Should scan_core internals remain frozen?**
   - Yes → Candidates B, F (License) are safe
   - No → Candidate D becomes possible (but high risk)

7. **Should new ActionTypes/executors be allowed?**
   - No → Candidate C is blocked
   - Yes → Candidate C becomes possible (but still too large for one phase)

8. **Should SC-8C14 be one project or split into multiple phases?**
   - One phase → Candidate B or License Activation alone
   - Multiple phases → Combined cleanup + product feature

9. **Should V1.2 roadmap work begin as SC-8C14 or as separate product projects?**
   - SC-8C14 → License Activation
   - Separate projects → V1.2 roadmap outside SC-8C framework

10. **What is the Definition of Done?**
    - Must be defined in the authoritative specification

### Non-critical decisions

11. Should Candidate A (Health Scan Modal) and Candidate E (Smart Opt Dead Code) be handled as maintenance cleanup before SC-8C14?

12. Should the transitional `security.quarantine.list` RPC be replaced with a canonical RPC as part of SC-8C14, or deferred?

13. Should `ThreatRemediationEngine` be refactored to remove dead execution methods, or retained as-is?

14. Should `ThreatFalsePositiveTracker` be migrated to a canonical backend RPC, or retained as frontend domain functionality?

---

## 20. Risks of Proceeding Without Decision

1. **Wasted effort** — Implementing a candidate without product direction could be discarded if priorities change
2. **Architecture baseline violation** — Implementing Candidate D without careful specification could damage `RemediationCoordinator` and `SafetyGate`
3. **Scope creep** — Without defined scope, implementation could expand to touch unrelated modules
4. **Regression risk** — Candidate C without specification could break core V1.0 features
5. **Security regression** — Any candidate without security requirements could introduce new violations
6. **Delayed product value** — Spending time on architecture cleanup when product features are higher priority delays revenue
7. **Lost momentum** — Extended deliberation without decision could lose the SC-8C13 completion momentum

---

## 21. Recommended Next Step

1. **Product Owner reviews this report**
2. **Product Owner selects a direction:**
   - Architecture-focused → Candidate B
   - Product-focused → License Activation
   - Combined → Split into SC-8C14 (cleanup) + SC-8C15 (product)
   - Deferred → Handle A/B/E as maintenance, no SC-8C14
3. **An authoritative `SC8C14_SPECIFICATION.md` is created** with all 16 required elements:
   - Objective, Problem statement, Scope, Non-goals, Architecture decision, Affected modules, Backend changes, Frontend changes, RPC contracts, Persistence requirements, Security requirements, Privacy requirements, UX requirements, Test requirements, Acceptance criteria, Definition of Done
4. **An authoritative `SC8C14_PHASE_PLAN.md` is created**
5. **Only then can SC-8C14 implementation begin**

---

## 22. Explicit SC-8C15 Boundary

**SC-8C15 was NOT started.**

No SC-8C15 specification was created. No SC-8C15 implementation was started. No reference to SC-8C15 exists anywhere in the repository (0 matches).

If SC-8C14 is split into two phases (cleanup + product), the second phase could be designated SC-8C15 — but this requires explicit Product Owner decision and an authoritative specification.

---

## Confirmation

- **Production files modified:** NONE
- **Tests modified:** NONE
- **SC-8C14 implementation was NOT started**
- **SC-8C15 was NOT started**
- **No production code, tests, or configuration were modified**
- **This phase was analysis ONLY**

---

**End of SC-8C14 Phase 2 Product Direction Analysis Report**
