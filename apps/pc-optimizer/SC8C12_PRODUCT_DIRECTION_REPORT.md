# SC-8C12 — Product / Architecture Direction Report

**Date:** 2026-08-16  
**Author:** Devin (automated discovery)  
**Status:** DISCOVERY AND DEFINITION — no production code modified  
**Purpose:** Identify the most valuable and logically correct next capability for SC-8C12 based on repository evidence

---

## 1. Executive Summary

After a comprehensive inspection of the AVS Suite repository, I identified **five serious candidate directions** for SC-8C12. The most compelling candidate is **Security Center Remediation Migration to Canonical `scan_core` Workflow** — migrating the Security Center's parallel `ThreatRemediationEngine` to the canonical `scan_core.remediation.*` workflow, exactly as SC-8C11 did for Smart Optimization.

This candidate has the strongest repository evidence, the highest security value, the most direct logical continuation of SC-8C11, and the maximum reuse of existing architecture. It eliminates the largest remaining parallel remediation path in the product.

**However, this recommendation is NOT sufficiently supported to become an authoritative specification without product decisions from the user.** The Security Center's remediation has domain-specific concepts (quarantine, threat investigation, false positive tracking) that may not map cleanly to `scan_core`'s action model. A product decision is required on whether to fully migrate, partially integrate, or keep the Security Center's remediation separate.

---

## 2. Current Architecture Baseline

### Canonical `scan_core` Remediation Workflow (SC-8C8 → SC-8C11)

```
ScanView
  → scan_core.scan.quick | scan_core.scan.full
    → ActionPlan (backend-generated, persisted via ActionPlanRepository)
      → PlanReviewView (usePlanDetails — read-only hydration)
        → ResultsView (useResults — canonical remediation UI)
          → remediationService.prepare()
          → remediationService.validate()
          → ValidationPanel (explicit user approval)
          → remediationService.execute()
          → ExecutionProgressPanel (status polling)
          → TerminalStatePanel (completed | partial | failed | cancelled | rejected)
          → RollbackConfirmationPanel → remediationService.rollback()
```

### Modules Using Canonical Flow

| Module | Scan | Remediation | Status |
|--------|------|-------------|--------|
| Protection Center | `ScanView` (module=protection) | `ResultsView` → `RemediationCoordinator` | ✅ Canonical |
| Smart Optimization | `SmartOptimizationEngine` → `scan_core.smart_optimization.plan` | `PlanReviewView` → `ResultsView` → `RemediationCoordinator` | ✅ Canonical (SC-8C11) |
| Smart Security | `ScanView` (module=security) | **`ThreatRemediationEngine` (parallel path)** | ⚠️ Parallel |

### Modules with Parallel Execution Paths (NOT Canonical)

| Module/Feature | Execution Path | RPC Methods | Bypasses |
|----------------|----------------|-------------|----------|
| **Security Center Remediation** | `ThreatRemediationEngine` | `security.remediation.execute`, `security.quarantine`, `security.quarantine.delete` | `SafetyGate`, `RemediationCoordinator`, `ActionPlanRepository`, `ExecutionLedger` |
| **Dashboard One-Click Optimize** | `dashboardService.executeOptimize()` | `dashboard.optimize.execute` | `SafetyGate`, `RemediationCoordinator`, `ActionPlanRepository`, `ExecutionLedger` |
| **Background Cleanup Service** | `BackgroundCleanupService` → `orchestrator.optimize` | `orchestrator.optimize` | `SafetyGate`, `RemediationCoordinator`, `ActionPlanRepository`, `ExecutionLedger`, **explicit approval** |
| **Junk Cleaner** | `junkCleanerService` → `cleaner.clean.execute` | `cleaner.clean.execute`, `cleaner.clean.undo` | `SafetyGate`, `RemediationCoordinator`, `ActionPlanRepository`, `ExecutionLedger` |
| **Maintenance Engine** | `executionEngine.executeJob()` | `cleaner.clean.execute`, `startup.disable`, etc. | `SafetyGate`, `RemediationCoordinator`, `ActionPlanRepository`, `ExecutionLedger` |
| **Optimization Execution** | `OptimizationExecutionCoordinator` | `maintenance-engine` tasks | `SafetyGate`, `RemediationCoordinator`, `ActionPlanRepository`, `ExecutionLedger` |

---

## 3. Completed SC-8C8 → SC-8C11 Capabilities

| Phase | Capability | Status |
|-------|-----------|--------|
| SC-8C8 | Canonical scan → results → remediation → rollback workflow | ✅ Complete |
| SC-8C8 | `ScanView`, `ResultsView`, `FindingsList`, `PreviewPanel`, `ValidationPanel`, `ExecutionProgressPanel`, `TerminalStatePanel`, `RollbackConfirmationPanel` | ✅ Complete |
| SC-8C9 | Dashboard integration, persisted scan history, authoritative scan metrics | ✅ Complete |
| SC-8C9 | Safe plan hydration (`usePlanDetails`), privacy hardening, `PlanReviewView` | ✅ Complete |
| SC-8C10 | Concurrency guards, persistence/recovery, cross-session consistency | ✅ Complete |
| SC-8C10 | Production-readiness audit, dead code cleanup, edge case handling | ✅ Complete |
| SC-8C11 | `SmartOptimizationAdapter` — AI findings → canonical `RemediationAction` | ✅ Complete |
| SC-8C11 | `SmartOptimizationPlanBuilder` — persisted `ActionPlan` via `scan_core.smart_optimization.plan` | ✅ Complete |
| SC-8C11 | `SmartOptimizationPage` → `PlanReviewView` → `ResultsView` → `RemediationCoordinator` | ✅ Complete |
| SC-8C11 | Legacy Smart Optimization execution disconnected from production | ✅ Complete |
| SC-8C11 | AI analysis/planning engine preserved | ✅ Complete |

---

## 4. Remaining Product/Architecture Gaps

### Gap 1: Security Center Parallel Remediation Path

**Evidence:**
- `SecurityCenterPage.tsx` calls `vm.executePlan()`, `vm.rollbackAction()`, `vm.approvePlan()`, `vm.rejectPlan()`, `vm.createRemediationPlan()` (lines 1567, 1574, 1601, 1612, 1625, 1629)
- `SecurityCenterService.ts` delegates to `ThreatRemediationEngine` (lines 472–596)
- `ThreatRemediationEngine` has its own plans, approval, execution, rollback, quarantine, deletion
- Backend `security_remediation/__init__.py` uses `shutil` and `subprocess` directly (line 29–30)
- No `scan_core`, `RemediationCoordinator`, `SafetyGate`, or `ActionPlanRepository` references in `security-dashboard/` or `security-remediation/`
- SC-8C11 specification explicitly deferred: "Migrating Security Dashboard `securityBackendService` (deferred to future phase)" (line 95)

**Impact:** The Security Center is the only AI module with a full parallel remediation system. It bypasses all canonical safety controls.

### Gap 2: Dashboard One-Click Optimize Parallel Path

**Evidence:**
- `DashboardViewModel.ts` has `executeOptimize()` method (line 899) calling `this.service.executeOptimize()` (line 904)
- `dashboard.service.ts` calls `DASHBOARD_OPTIMIZE_EXECUTE` RPC (line 47)
- Backend `dashboard/__init__.py` `dashboard_optimize_execute()` directly cleans temp files, empties recycle bin, cleans browser cache, flushes DNS, trims memory (lines 606–680+)
- No `scan_core`, `RemediationCoordinator`, `SafetyGate`, or `ActionPlanRepository` references
- SC-8C11 specification explicitly deferred: "Migrating `DashboardViewModel.healthScan*` state (deferred to future phase)" (line 92)

**Impact:** Dashboard "One-Click Optimize" performs destructive operations without explicit approval, SafetyGate validation, or ActionPlan persistence.

### Gap 3: Background Cleanup Service — Automatic Execution

**Evidence:**
- `BackgroundCleanupService.ts` calls `RPC_METHODS.ORCHESTRATOR_OPTIMIZE` (line 157)
- Service starts at app boot and runs continuously (line 13: "This service starts at app boot and runs continuously in the background. No user interaction required.")
- SC-8C10 audit identified: "INFO-2: `BackgroundCleanupService.ts` contains `RPC_METHODS.ORCHESTRATOR_OPTIMIZE`" with recommendation "Consider migration to `scan_core` in future phase"
- SC-8C11 specification explicitly deferred: "Migrating `BackgroundCleanupService` (deferred to future phase)" (line 93)

**Impact:** **Automatic execution without user approval** — directly violates SC-8C11 invariant "no automatic execution."

### Gap 4: Legacy Health Scan Modals

**Evidence:**
- `HealthScanModal.tsx`, `UnifiedHealthScanModal.tsx`, `UnifiedHealthScanResults.tsx` exist in `dashboard/components/`
- SC-8C10 audit identified: "INFO-1: Legacy health scan modals exist but are not imported by active `ScanView`/`DashboardPageV2` code"
- SC-8C11 specification explicitly deferred: "Removing health scan modals (deferred to future phase)" (line 94)

**Impact:** Dead code; potential confusion. No active production impact.

### Gap 5: Module-Level Cleaner Parallel Paths (Junk Cleaner, Registry, Privacy, Startup, Performance)

**Evidence:**
- `CLEANER_CLEAN_EXECUTE` RPC used by `junkCleaner.service.ts`, `maintenance-engine/tasks/`, `storage-intelligence/`
- `PRIVACY_CLEAN`, `STARTUP_DISABLE`, `PERFORMANCE_MEMORY_OPTIMIZE` RPCs exist
- Maintenance engine tasks (`TempFilesCleanerTask`, `RecycleBinCleanerTask`, `BrowserCleanerTask`, `JunkCleanerTask`) all use `cleaner.clean.execute`
- No `scan_core` references in any of these modules
- `optimization-execution/optimizationExecutionCoordinator.ts` uses `maintenance-engine/executionEngine` — separate from `scan_core`

**Impact:** All module-level cleaners have their own scan/clean/undo lifecycle that bypasses canonical remediation. These are the original V1.0 cleaning features with their own established UX.

### Gap 6: AI Process Intelligence / Predictive Health — No Remediation Integration

**Evidence:**
- `PROJECT_STATUS.md` lines 298–299: "EPIC 7: AI Process Intelligence — Engine 100%, UI 0%" and "EPIC 8: AI Predictive Health — Engine 100%, UI 0%"
- `ProcessIntelligencePage.tsx` and `PredictiveHealthPage.tsx` DO exist and ARE routed (router lines 143–144)
- `PROJECT_STATUS.md` is outdated on this point
- Neither page has any remediation or scan_core integration

**Impact:** These are read-only dashboards. No remediation gap — they're analysis-only by design.

---

## 5. Candidate SC-8C12 Directions

### Candidate 1: Security Center Remediation Migration to Canonical `scan_core` Workflow

**1. Candidate name:** Security Center Canonical Remediation Migration

**2. Exact existing repository evidence:**
- `SecurityCenterPage.tsx` lines 1567, 1574, 1601, 1612, 1625, 1629 — calls `vm.executePlan()`, `vm.rollbackAction()`, `vm.approvePlan()`, `vm.rejectPlan()`
- `SecurityCenterService.ts` lines 472–596 — delegates to `ThreatRemediationEngine`
- `security-remediation/ThreatRemediationEngine.ts` — complete parallel remediation system
- Backend `security_remediation/__init__.py` — `security.remediation.execute`, `security.quarantine`, `security.quarantine.delete` using `shutil`/`subprocess`
- SC-8C11_SPECIFICATION.md line 95: "Migrating Security Dashboard `securityBackendService` (deferred to future phase)"

**3. User value:** High — Security Center threats would get the same safety guarantees as Protection Center and Smart Optimization: explicit approval, SafetyGate validation, persisted ActionPlans, rollback support, stale-plan rejection, duplicate execution prevention.

**4. Business/product value:** High — completes the three-module consistency goal. All three AI modules would share the same safety model. Eliminates the largest remaining parallel remediation path.

**5. Technical complexity:** High — Security Center has domain-specific concepts (quarantine, threat investigation, false positive tracking, threat knowledge base) that don't map directly to `scan_core`'s action model. Requires adapter design similar to SC-8C11's `SmartOptimizationAdapter`.

**6. Security risk:** Medium — migration must not weaken existing security remediation capabilities (quarantine is a unique security concept). Must preserve `ThreatRemediationEngine`'s domain logic while routing execution through `RemediationCoordinator`.

**7. Privacy risk:** Low — `scan_core` already has privacy-safe sanitization. Migration would improve privacy by applying canonical sanitization to security remediation responses.

**8. Regression risk:** Medium — Security Center has 82+ tests. Migration must preserve all existing security investigation, detection, and remediation UX.

**9. Reuse of existing architecture:** High — directly reuses `scan_core.remediation.*`, `RemediationCoordinator`, `SafetyGate`, `ActionPlanRepository`, `ResultsView`, `useResults`, `PlanReviewView`, `usePlanDetails`. Pattern is established by SC-8C11.

**10. Estimated implementation phases:** 4 phases (adapter, plan builder, UI migration, validation/audit) — same structure as SC-8C11.

**11. Why it should be SC-8C12:** It's the most direct logical continuation of SC-8C11. SC-8C11 migrated Smart Optimization; SC-8C12 would migrate Security Center. This completes the three-module consistency goal. It has the strongest repository evidence (explicit deferral in SC-8C11 spec, largest parallel path, most safety-critical module).

**Why it might not be SC-8C12:** Security Center remediation has unique domain concepts (quarantine, threat investigation) that may require `scan_core` extensions. If the product decision is that security remediation should remain domain-specific, this candidate would need a different approach (integration rather than full migration).

---

### Candidate 2: Dashboard One-Click Optimize Canonical Migration

**1. Candidate name:** Dashboard Optimize Canonical Migration

**2. Exact existing repository evidence:**
- `DashboardViewModel.ts` line 899: `executeOptimize()` method
- `dashboard.service.ts` line 47: `DASHBOARD_OPTIMIZE_EXECUTE` RPC
- Backend `dashboard/__init__.py` line 606: `dashboard_optimize_execute()` directly performs destructive operations
- SC-8C11_SPECIFICATION.md line 92: "Migrating `DashboardViewModel.healthScan*` state (deferred to future phase)"

**3. User value:** Medium — Dashboard optimize would get explicit approval and safety validation instead of one-click execution.

**4. Business/product value:** Medium — eliminates a parallel execution path, but Dashboard optimize is a convenience feature.

**5. Technical complexity:** Medium — Dashboard optimize actions (temp files, recycle bin, browser cache, DNS flush, memory trim) map reasonably well to `scan_core` action types.

**6. Security risk:** Low — migration improves safety by adding explicit approval.

**7. Privacy risk:** Low.

**8. Regression risk:** Medium — Dashboard optimize is a user-facing feature with established UX expectations.

**9. Reuse of existing architecture:** High — reuses canonical `scan_core` workflow.

**10. Estimated implementation phases:** 3 phases.

**11. Why it should be SC-8C12:** Eliminates a parallel execution path with explicit deferral. However, it's less safety-critical than Security Center (no quarantine/deletion of user files) and less architecturally significant.

**Why it might not be SC-8C12:** Lower security value than Candidate 1. Dashboard optimize is a convenience feature, not a safety-critical remediation path.

---

### Candidate 3: Background Cleanup Service — Eliminate Automatic Execution

**1. Candidate name:** Background Cleanup Safety Compliance

**2. Exact existing repository evidence:**
- `BackgroundCleanupService.ts` line 157: calls `RPC_METHODS.ORCHESTRATOR_OPTIMIZE`
- Line 13: "This service starts at app boot and runs continuously in the background. No user interaction required."
- SC-8C10 audit INFO-2: "Consider migration to `scan_core` in future phase"
- SC-8C11_SPECIFICATION.md line 93: "Migrating `BackgroundCleanupService` (deferred to future phase)"

**3. User value:** Medium — eliminates automatic background execution that violates the "no automatic execution" invariant.

**4. Business/product value:** High (security compliance) — this is the only feature in the product that performs automatic destructive execution without user approval.

**5. Technical complexity:** Medium — requires either migrating to `scan_core` with deferred/explicit approval, or converting to a notification-based "items ready for cleanup" UX.

**6. Security risk:** High if not addressed — automatic execution without approval is a direct violation of SC-8C11 invariants.

**7. Privacy risk:** Low.

**8. Regression risk:** Medium — users may expect background cleanup to "just work." Changing to explicit approval changes UX behavior.

**9. Reuse of existing architecture:** Medium — could reuse `scan_core` for the cleanup execution, but the background/automatic nature requires a different trigger model.

**10. Estimated implementation phases:** 2–3 phases.

**11. Why it should be SC-8C12:** It's the only feature that directly violates the "no automatic execution" invariant. However, it's a smaller scope than Candidate 1 and could be addressed as part of a broader effort.

**Why it might not be SC-8C12:** Narrower scope than Candidate 1. Could be addressed within Candidate 2 (Dashboard migration) since Background Cleanup uses `orchestrator.optimize` which is related to Dashboard optimize.

---

### Candidate 4: Legacy Health Scan Modal Cleanup

**1. Candidate name:** Legacy Health Scan Modal Removal

**2. Exact existing repository evidence:**
- `HealthScanModal.tsx`, `UnifiedHealthScanModal.tsx`, `UnifiedHealthScanResults.tsx` in `dashboard/components/`
- SC-8C10 audit INFO-1: "Legacy health scan modals exist but are not imported by active code"
- SC-8C11_SPECIFICATION.md line 94: "Removing health scan modals (deferred to future phase)"

**3. User value:** Low — dead code, no user impact.

**4. Business/product value:** Low — cleanup only.

**5. Technical complexity:** Low — delete dead code and verify no imports.

**6. Security risk:** None.

**7. Privacy risk:** None.

**8. Regression risk:** Low — dead code.

**9. Reuse of existing architecture:** N/A — deletion only.

**10. Estimated implementation phases:** 1 phase.

**11. Why it should be SC-8C12:** Too small for a full SC-8C phase. Should be done as part of another phase or as a standalone cleanup.

**Why it should not be SC-8C12:** Insufficient scope for a full phase. This is a cleanup task, not a capability.

---

### Candidate 5: Module-Level Cleaner Canonical Integration

**1. Candidate name:** Module-Level Cleaner Canonical Integration

**2. Exact existing repository evidence:**
- `CLEANER_CLEAN_EXECUTE` used by `junkCleaner.service.ts`, `maintenance-engine/tasks/`, `storage-intelligence/`
- `PRIVACY_CLEAN`, `STARTUP_DISABLE`, `PERFORMANCE_MEMORY_OPTIMIZE` RPCs
- `optimization-execution/optimizationExecutionCoordinator.ts` uses `maintenance-engine/executionEngine`
- No `scan_core` references in any module-level cleaner

**3. User value:** Medium — module-level cleaners would get canonical safety controls.

**4. Business/product value:** Medium — but these are established V1.0 features with their own UX patterns and user expectations.

**5. Technical complexity:** Very High — would require migrating 6+ independent cleaner modules, each with its own scan/clean/undo lifecycle, to `scan_core`. This is a massive scope.

**6. Security risk:** Low — migration improves safety.

**7. Privacy risk:** Low.

**8. Regression risk:** High — these are the core V1.0 features with extensive test suites and established UX. Migration would change the UX of every cleaner page.

**9. Reuse of existing architecture:** High in theory, but the scale makes it impractical as a single phase.

**10. Estimated implementation phases:** 6+ phases (one per cleaner module).

**11. Why it should not be SC-8C12:** Too large in scope. Would require multiple phases. Better suited as a long-term initiative rather than a single SC-8C phase. The module-level cleaners have their own established UX that users expect.

---

## 6. Candidate Comparison Matrix

| Criterion | C1: Security Center | C2: Dashboard Optimize | C3: Background Cleanup | C4: Health Scan Modal | C5: Module Cleaners |
|-----------|---------------------|------------------------|------------------------|----------------------|---------------------|
| Repository evidence | Strong (explicit deferral) | Strong (explicit deferral) | Strong (explicit deferral + audit) | Moderate (audit only) | Strong (multiple modules) |
| User value | High | Medium | Medium | Low | Medium |
| Business value | High | Medium | High (compliance) | Low | Medium |
| Security value | High | Medium | High | None | Medium |
| Technical complexity | High | Medium | Medium | Low | Very High |
| Regression risk | Medium | Medium | Medium | Low | High |
| Architecture reuse | High | High | Medium | N/A | High |
| Logical continuation of SC-8C11 | **Strongest** | Moderate | Moderate | Weak | Moderate |
| Phase count | 4 | 3 | 2–3 | 1 | 6+ |
| Three-module consistency | **Completes it** | No | No | No | No |

---

## 7. Recommended Direction

### **Candidate 1: Security Center Remediation Migration to Canonical `scan_core` Workflow**

**Rationale:**
- **Strongest repository evidence:** Explicitly deferred in SC-8C11 specification (line 95). Largest remaining parallel remediation path. Complete separate remediation engine with backend `shutil`/`subprocess` usage.
- **Highest security value:** Security Center handles threats (malware, spyware, PUPs) — the most safety-critical remediation in the product. Currently bypasses `SafetyGate`, `RemediationCoordinator`, and `ActionPlanRepository`.
- **Most direct logical continuation:** SC-8C11 migrated Smart Optimization. SC-8C12 would migrate Security Center. This completes the three-module consistency goal stated in SC-8C11's success criteria.
- **Maximum architecture reuse:** Directly reuses the SC-8C11 pattern (`Adapter` → `PlanBuilder` → `PlanReviewView` → `ResultsView` → `RemediationCoordinator`).
- **Minimum architectural risk:** Does not modify `SafetyGate`, `RemediationCoordinator`, executors, or `scan_core` internals. Adds adapter and plan builder, same as SC-8C11.

---

## 8. Evidence Supporting Recommendation

| Evidence | Source | Strength |
|----------|--------|----------|
| SC-8C11 spec explicitly defers Security Center migration | `SC8C11_SPECIFICATION.md:95` | Authoritative |
| Security Center uses `ThreatRemediationEngine` (parallel path) | `SecurityCenterService.ts:37,76,85,472–596` | Direct code evidence |
| Security Center Page calls `vm.executePlan()`, `vm.rollbackAction()` | `SecurityCenterPage.tsx:1567,1574,1601,1612,1625,1629` | Direct code evidence |
| Backend uses `shutil`/`subprocess` directly | `security_remediation/__init__.py:29–30` | Direct code evidence |
| No `scan_core` references in security-dashboard or security-remediation | grep results | Negative evidence |
| SC-8C11 success criteria: "All three modules use identical safety model" | `SC8C11_SPECIFICATION.md:50` | Authoritative |
| SC-8C11 Phase 4 audit: Security Center classified as "legitimate unrelated feature" | `SC8C11_PHASE4_FINAL_SECURITY_REGRESSION_AUDIT.md` | Audit finding |

---

## 9. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Security Center quarantine concept doesn't map to `scan_core` action types | High | INFERENCE — NOT CURRENTLY SPECIFIED. May require new action types or adapter mapping. Product decision needed. |
| `ThreatRemediationEngine` has domain-specific approval/rollback that differs from canonical | Medium | Adapter pattern (like `SmartOptimizationAdapter`) can map domain concepts to canonical actions |
| Security Center has 82+ tests that directly test `ThreatRemediationEngine` | Medium | Retain `ThreatRemediationEngine` for test compatibility, disconnect from production UI (same pattern as SC-8C11) |
| Backend `security_remediation` uses `shutil`/`subprocess` directly | Medium | Migration would route through `RemediationCoordinator` → `DefaultExecutor` → target executors, which have safe execution patterns |
| False positive tracking and threat investigation may not fit `ActionPlan` model | Medium | INFERENCE — NOT CURRENTLY SPECIFIED. These may remain separate from the remediation flow. Product decision needed. |

---

## 10. Dependencies

| Dependency | Status |
|------------|--------|
| `scan_core.remediation.*` RPC methods | ✅ Available (SC-8C8) |
| `RemediationCoordinator` | ✅ Available (SC-8C8) |
| `SafetyGate` | ✅ Available (SC-8C8) |
| `ActionPlanRepository` | ✅ Available (SC-8C8) |
| `ResultsView` / `useResults` | ✅ Available (SC-8C8, supports module="security") |
| `PlanReviewView` / `usePlanDetails` | ✅ Available (SC-8C9) |
| `SmartOptimizationAdapter` pattern | ✅ Available as reference (SC-8C11) |
| `SmartOptimizationPlanBuilder` pattern | ✅ Available as reference (SC-8C11) |
| Security Center scan via `ScanView` (module=security) | ✅ Already integrated |
| `scan_core.smart_optimization.plan` RPC pattern | ✅ Available as reference for new `scan_core.security_remediation.plan` RPC |

---

## 11. Required Product Decisions

Before SC-8C12 can be specified authoritatively, the following product decisions are required from the user:

| Decision | Question | Impact |
|----------|----------|--------|
| **D1: Full migration vs. partial integration** | Should the Security Center's remediation be fully migrated to `scan_core` (like SC-8C11 did for Smart Optimization), or should only the execution path be integrated while keeping quarantine/threat investigation separate? | Determines scope and architecture |
| **D2: Quarantine concept** | Should quarantine be modeled as a `scan_core` action type (e.g., `quarantine_file`), or should it remain a Security Center-specific operation outside `scan_core`? | Determines whether new action types are needed |
| **D3: Threat investigation** | Should threat investigation, correlation, and knowledge base remain separate from `scan_core`, or should they be integrated into the canonical scan flow? | Determines scope of migration |
| **D4: False positive tracking** | Should false positive tracking remain in `security-remediation/`, or should it be integrated into `scan_core`'s execution audit trail? | Determines persistence model |
| **D5: Security Center UX** | Should the Security Center's remediation UI be replaced with `PlanReviewView` → `ResultsView` (like SC-8C11), or should the existing Security Center remediation panels be preserved with canonical backend integration? | Determines frontend scope |
| **D6: Background Cleanup Service** | Should `BackgroundCleanupService` (Candidate 3) be included in SC-8C12 scope, or deferred to a separate phase? | Determines whether SC-8C12 also addresses automatic execution |

---

## 12. Proposed SC-8C12 Objective

**INFERENCE — NOT AUTHORITATIVE (pending product decisions):**

> Migrate Security Center remediation execution to the canonical `scan_core.remediation.*` workflow while preserving the existing Security Center threat detection, investigation, quarantine management, and false positive tracking capabilities.

This mirrors the SC-8C11 objective structure:
- SC-8C11: "Integrate Smart Optimization remediation into the canonical `scan_core.remediation.*` workflow while preserving the existing Smart Optimization AI planning engine."
- SC-8C12: "Integrate Security Center remediation into the canonical `scan_core.remediation.*` workflow while preserving the existing Security Center threat detection and investigation engine."

---

## 13. Proposed Non-Goals

**INFERENCE — NOT AUTHORITATIVE:**

- ❌ Modifying `SafetyGate` rules (reuse existing rules)
- ❌ Modifying `RemediationCoordinator` internals
- ❌ Modifying `DefaultExecutor` or target executors
- ❌ Creating new executors (reuse existing executors)
- ❌ Modifying `ScanOrchestrator` scanning logic
- ❌ Removing `ThreatRemediationEngine` (retain for test compatibility, disconnect from production)
- ❌ Migrating threat detection providers
- ❌ Migrating threat investigation/correlation/knowledge base
- ❌ Migrating Dashboard One-Click Optimize (separate phase)
- ❌ Migrating Background Cleanup Service (separate phase, unless D6 decides otherwise)
- ❌ Migrating module-level cleaners (separate initiative)
- ❌ Removing legacy health scan modals (separate cleanup)
- ❌ SC-8C13 or any later phase

---

## 14. Proposed Success Criteria

**INFERENCE — NOT AUTHORITATIVE:**

1. Security Center remediation flows through `RemediationCoordinator`
2. Security Center actions are validated by `SafetyGate`
3. Security Center execution is persisted to `ExecutionRepository`
4. Security Center rollback uses canonical `scan_core.remediation.rollback`
5. Security Center threat detection and investigation engine remains unchanged
6. Security Center UI preserves existing dashboard, threat timeline, and investigation panels
7. All three modules (Protection, Security, Smart Optimization) use identical safety model
8. No automatic execution, resume, or rollback introduced
9. No browser storage for remediation state
10. No direct destructive frontend APIs

---

## 15. Proposed High-Level Architecture

**INFERENCE — NOT AUTHORITATIVE:**

```
SecurityCenterPage
  → SecurityCenterEngine (threat detection — preserved)
  → SecurityInvestigation (threat correlation — preserved)
  → SecurityRemediationAdapter (NEW — converts threats to canonical RemediationActions)
  → scan_core.security_remediation.plan RPC (NEW — backend planning)
  → SecurityRemediationPlanBuilder (NEW — builds canonical ActionPlan)
  → ActionPlanRepository.save() (existing)
  → backend-generated plan_id
  → PlanReviewView (existing — read-only hydration)
  → ResultsView (existing — canonical remediation UI)
  → RemediationCoordinator (existing — prepare → validate → approve → execute → rollback)
```

**Backend additions (mirroring SC-8C11):**
- `backend/src/avs_backend/scan_core/adapters/security_remediation_adapter.py` (NEW)
- `backend/src/avs_backend/scan_core/adapters/security_remediation_plan_builder.py` (NEW)
- `scan_core.security_remediation.plan` RPC (NEW — planning only, no execution)

**Frontend additions (mirroring SC-8C11):**
- `apps/pc-optimizer/src/features/scan/useSecurityRemediationPlan.ts` (NEW)
- `SecurityCenterPage.tsx` modified to use `PlanReviewView` → `ResultsView`

**Preserved:**
- `SecurityCenterEngine` — threat detection
- `SecurityInvestigation` — threat correlation, knowledge base
- `ThreatRemediationEngine` — retained for test compatibility, disconnected from production
- `securityBackendService` — scan/snapshot services preserved

---

## 16. Proposed Implementation Phases

**INFERENCE — NOT AUTHORITATIVE:**

| Phase | Description |
|-------|-------------|
| Phase 1 | Specification inspection (verify current Security Center architecture) |
| Phase 2 | `SecurityRemediationAdapter` — convert threats to canonical `RemediationAction` objects |
| Phase 3 | `SecurityRemediationPlanBuilder` + `scan_core.security_remediation.plan` RPC — create persisted `ActionPlan` objects |
| Phase 4 | `SecurityCenterPage` UI migration — use `PlanReviewView` → `ResultsView` |
| Phase 5 | Final validation, security audit, regression audit |

---

## 17. Security/Privacy Invariants

Regardless of the final SC-8C12 scope, these SC-8C11 invariants must be preserved:

- `scan_core` remains authoritative for scan/remediation state
- ActionPlans remain backend-generated
- Frontend never fabricates ActionPlans
- Frontend never performs destructive system operations
- `SafetyGate` remains authoritative
- Explicit approval remains required for destructive remediation
- Stale plans remain rejected
- Duplicate execution remains prevented
- Execution IDs remain backend-authoritative
- Rollback remains explicit
- No automatic execution
- No automatic resume
- No automatic rollback
- No remediation state in `localStorage`/`sessionStorage`
- RPC responses remain privacy-safe
- Raw filesystem paths/registry keys/browser profiles must not cross unsafe UI boundaries

---

## 18. Acceptance Criteria

**INFERENCE — NOT AUTHORITATIVE:**

- [ ] Security Center remediation uses `scan_core.remediation.*` RPCs
- [ ] Security Center actions are validated by `SafetyGate`
- [ ] Security Center execution is persisted to `ActionPlanRepository`
- [ ] Security Center rollback uses `scan_core.remediation.rollback`
- [ ] Threat detection and investigation engine remains unchanged
- [ ] All existing Security Center tests pass
- [ ] `yarn typecheck` passes
- [ ] `yarn lint` passes (0 warnings)
- [ ] `yarn build` passes
- [ ] Backend tests pass
- [ ] No `SafetyGate` weakening
- [ ] No `RemediationCoordinator` bypassing
- [ ] No automatic execution introduced
- [ ] No automatic resume introduced
- [ ] No automatic rollback introduced
- [ ] SC-8C13 not started

---

## 19. Definition of Done

**INFERENCE — NOT AUTHORITATIVE:**

SC-8C12 is complete when:
- [ ] Security Center remediation flows through `RemediationCoordinator`
- [ ] `SecurityRemediationAdapter` created and tested
- [ ] `SecurityRemediationPlanBuilder` created and tested
- [ ] `scan_core.security_remediation.plan` RPC registered and tested
- [ ] `SecurityCenterPage` uses `PlanReviewView` → `ResultsView`
- [ ] `ThreatRemediationEngine` disconnected from production UI
- [ ] Threat detection/investigation preserved
- [ ] All validation passes (typecheck, lint, build, tests)
- [ ] Security audit complete
- [ ] Regression audit complete
- [ ] SC-8C13 not started

---

## 20. Explicit Scope Boundary

**This report is a DISCOVERY AND DEFINITION document only.**

- No production code was modified.
- No tests were modified.
- No RPC contracts were changed.
- No new executors were created.
- No `SafetyGate`, `RemediationCoordinator`, or `scan_core` modifications were made.
- No legacy code was deleted.
- No candidate was implemented.
- SC-8C13 was NOT started.

**The recommended direction is NOT an authoritative specification.** It requires product decisions (Section 11) before implementation can begin.

---

## Summary

### Candidates identified

1. Security Center Remediation Migration to Canonical `scan_core` Workflow (RECOMMENDED)
2. Dashboard One-Click Optimize Canonical Migration
3. Background Cleanup Safety Compliance
4. Legacy Health Scan Modal Cleanup
5. Module-Level Cleaner Canonical Integration

### Recommended direction

**Candidate 1: Security Center Remediation Migration to Canonical `scan_core` Workflow**

### Whether the recommendation is sufficiently supported to become an authoritative specification

**NO — not yet.** The recommendation is strongly supported by repository evidence, but requires product decisions (Section 11, items D1–D6) before it can become an authoritative specification. Specifically:
- D1: Full migration vs. partial integration
- D2: Quarantine concept mapping
- D3: Threat investigation scope
- D4: False positive tracking
- D5: Security Center UX approach
- D6: Background Cleanup Service inclusion

### Production files modified

**NONE.** This was a read-only discovery exercise.

### SC-8C13 started

**NO.** SC-8C13 was not started. No work beyond this report was performed.

---

**End of SC-8C12 Product Direction Report**
