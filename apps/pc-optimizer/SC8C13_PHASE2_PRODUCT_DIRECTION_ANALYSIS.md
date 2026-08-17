# SC-8C13 Phase 2 — Product Direction & Authoritative Specification Analysis

## 1. Executive Summary

A deep product/architecture analysis of candidates A–F was performed through repository-wide read-only inspection. Each candidate was evaluated against the established `scan_core` architecture, security invariants, and the existing codebase.

**Key findings:**

- **Candidate B (Background Cleanup Service)** is the only candidate that **directly violates** an established security invariant ("no automatic execution"). It performs destructive system operations at app boot without user approval, bypassing `scan_core`, `SafetyGate`, and `RemediationCoordinator` entirely.
- **Candidate A (Dashboard One-Click Optimize)** has a preview → confirm → execute flow (NOT true automatic remediation), but bypasses `scan_core` entirely. It performs 7 categories of destructive operations directly in the backend.
- **Candidate B and Candidate A are related** — Background Cleanup calls `orchestrator.optimize`, which is the same family of operations as Dashboard Optimize. They should be analyzed together.
- **Candidate E (Security Center Legacy Backend Cleanup)** is the lowest-risk continuation of SC-8C12 but has the lowest urgency since execution paths are already disconnected.
- **Candidate D (Module-Level Cleaners)** is too large for a single SC-8C phase (6+ independent cleaner modules).
- **Candidate C (Health Scan Modal Cleanup)** is dead code removal — insufficient scope for a full phase.
- **Candidate F (Pause/Resume)** requires `scan_core` internal modifications, conflicting with the established baseline.

**Recommended direction: Candidate B (Background Cleanup Service) — with Candidate A as a combined effort**

**Final verdict: PRODUCT_DECISION_REQUIRED**

---

## 2. Current SC-8C13 Status

- **Phase 1:** COMPLETE — confirmed no authoritative specification exists
- **Phase 2:** This report — product direction analysis (read-only)
- **Implementation:** NOT STARTED
- **Authoritative specification:** DOES NOT EXIST

---

## 3. Repository Architecture Baseline

### Established production-ready architecture

```
Protection Center → ScanView → ResultsView → RemediationCoordinator
Smart Optimization → AI planning → scan_core → PlanReviewView → ResultsView → RemediationCoordinator
Security Center → detection/investigation → scan_core → PlanReviewView → ResultsView → RemediationCoordinator
```

### Security invariants (must not be violated)

1. Explicit approval is required
2. Backend-generated `plan_id`
3. Backend-authoritative actionability
4. Stale-plan rejection
5. Duplicate execution protection
6. `ExecutionLedger` prevents duplicate completed actions
7. Persistent `ActionPlan`
8. Persistent `ExecutionRepository`
9. Canonical rollback
10. **No automatic execution**
11. No automatic resume
12. No automatic rollback
13. No browser storage for remediation state

### Existing ActionType enum

```python
NONE = "none"
DELETE_FILE = "delete_file"
DELETE_DIRECTORY = "delete_directory"
CLEAR_CACHE = "clear_cache"
REMOVE_REGISTRY_VALUE = "remove_registry_value"
REMOVE_REGISTRY_KEY = "remove_registry_key"
DISABLE_STARTUP_ENTRY = "disable_startup_entry"
CLEAR_BROWSER_CACHE = "clear_browser_cache"
```

### Existing executors

- `FilesystemExecutor` — DELETE_FILE, DELETE_DIRECTORY
- `RegistryExecutor` — REMOVE_REGISTRY_VALUE, REMOVE_REGISTRY_KEY
- `StartupExecutor` — DISABLE_STARTUP_ENTRY
- `BrowserExecutor` — CLEAR_BROWSER_CACHE, CLEAR_CACHE

### Existing RPCs

- `scan_core.remediation.prepare`
- `scan_core.remediation.validate`
- `scan_core.remediation.execute`
- `scan_core.remediation.cancel`
- `scan_core.remediation.status`
- `scan_core.remediation.rollback`
- `scan_core.security_remediation.plan`
- `scan_core.smart_optimization.plan`
- `scan_core.scan.plan_details`

---

## 4. Candidate A Analysis — Dashboard One-Click Optimize

### 1. Exact repository evidence

- `apps/pc-optimizer/src/features/dashboard/dashboard.service.ts:47` — `executeOptimize: () => client().call(RPC_METHODS.DASHBOARD_OPTIMIZE_EXECUTE)`
- `backend/src/avs_backend/dashboard/__init__.py:606` — `dashboard_optimize_execute()` directly performs 7 categories of destructive operations
- `apps/pc-optimizer/src/features/dashboard/components/OneClickOptimize.tsx` — UI component with preview → confirm → execute flow
- `apps/pc-optimizer/src/features/dashboard/DashboardViewModel.ts:884-886` — `advanceToOptimizeConfirm()` calls `executeOptimize()`
- `SC8C11_SPECIFICATION.md:92` — "Migrating `DashboardViewModel.healthScan*` state (deferred to future phase)"

### 2. Current implementation status

**Active production code.** The Dashboard has a "One Click Optimize" feature with:
1. **Preview step** — calls `dashboard.optimize.preview` RPC, shows recoverable space and actions
2. **Confirm step** — user clicks "Optimize Now" button
3. **Execute step** — calls `dashboard.optimize.execute` RPC, which directly performs:
   - Clean temporary files (`_clean_temp_files()`)
   - Empty Recycle Bin (`empty_recycle_bin()`)
   - Clean browser cache (`_clean_browser_cache()`)
   - Clean thumbnail cache (`_clean_thumbnail_cache()`)
   - Clean prefetch files (`_clean_prefetch()`)
   - Clean Windows Update cache (`_clean_windows_update_cache()`)
   - Flush DNS (`_flush_dns()`)
   - Trim memory (`_trim_memory()`)

### 3. Existing architecture involved

- Frontend: `DashboardViewModel`, `dashboard.service.ts`, `OneClickOptimize.tsx`
- Backend: `dashboard/__init__.py` — directly calls cleaner functions, no `scan_core` involvement
- No `ActionPlan`, no `SafetyGate`, no `RemediationCoordinator`, no `ActionPlanRepository`, no `ExecutionRepository`

### 4. Existing technical gaps

- No `ActionPlan` persistence — operations are fire-and-forget
- No `SafetyGate` validation — operations execute without safety checks
- No rollback support — once cleaned, data is gone
- No `ExecutionRepository` — no audit trail
- No `ExecutionLedger` — no duplicate prevention
- No stale-plan rejection — no plan concept at all

### 5. Security implications

**MEDIUM.** The feature has a confirm step (not true automatic execution), but it bypasses all canonical safety controls. The 7 categories of operations are destructive (file deletion, recycle bin emptying, cache clearing) and have no rollback.

### 6. Privacy implications

**LOW.** Operations clean cache/temp files — no sensitive data exposure. Browser cache cleaning may remove browsing history artifacts.

### 7. UX implications

**HIGH.** The current "One Click Optimize" is a core V1.0 feature with established UX. Migrating to `scan_core` would change the flow to: scan → plan → review → prepare → validate → approve → execute → status → terminal. This is a significantly different UX.

### 8. Persistence/recovery implications

No persistence currently. Migration would add `ActionPlan` and `ExecutionRepository` persistence.

### 9. Concurrency implications

No concurrency guards currently. Migration would add ref-based guards via `useResults`.

### 10. Whether scan_core can support it without modification

**YES.** The existing `ActionType` enum has `DELETE_FILE`, `CLEAR_CACHE`, `CLEAR_BROWSER_CACHE` which cover most operations. `DELETE_DIRECTORY` covers Recycle Bin. However:
- Flush DNS — no existing `ActionType`
- Trim memory — no existing `ActionType`
- These would need to be classified as `NOT_FIXABLE` or require new `ActionType`s

### 11. Whether SafetyGate would need modification

**NO** — if DNS flush and memory trim are excluded or handled as non-`scan_core` operations.

### 12. Whether new ActionTypes would be required

**POTENTIALLY.** `FLUSH_DNS` and `TRIM_MEMORY` have no existing `ActionType`. These could be:
- Excluded from `scan_core` migration (remain as separate utility operations)
- Added as new `ActionType`s (requires specification)
- Classified as `NOT_FIXABLE` (user must use alternative UI)

### 13. Whether new executors would be required

**NO** — existing executors cover the file/cache operations. DNS flush and memory trim would need a decision.

### 14. Whether new RPCs would be required

**NO** — existing `scan_core.remediation.*` RPCs are sufficient. A new `scan_core.dashboard_optimization.plan` RPC (similar to `scan_core.smart_optimization.plan`) would be needed for plan creation.

### 15. Estimated implementation complexity

**MEDIUM.** Requires:
- New plan builder + adapter (similar to SC-8C11/SC-8C12 pattern)
- Frontend hook (similar to `useSmartOptimizationPlan`)
- UI migration from `OneClickOptimize` to `PlanReviewView` → `ResultsView`
- Backend `dashboard_optimize_execute` disconnection

### 16. Estimated number of implementation phases

**3–4 phases** (similar to SC-8C12):
1. Adapter + plan builder + RPC
2. Frontend hook + UI migration
3. Legacy disconnection + validation

### 17. Regression risk

**MEDIUM.** Dashboard optimize is a core V1.0 feature with established UX and tests. Changing the flow risks breaking user expectations.

### 18. Whether it logically follows SC-8C12

**YES.** It was explicitly deferred by SC-8C11. It eliminates another parallel execution path. It continues the canonical remediation migration pattern.

### 19. Whether it should be considered a continuation of the canonical remediation migration

**YES.** It follows the same pattern as SC-8C11 (Smart Optimization) and SC-8C12 (Security Center).

### 20. Whether it should instead be treated as an independent future project

**NO** — it's a direct continuation of the canonical remediation migration.

---

## 5. Candidate B Analysis — Background Cleanup Service

### 1. Exact repository evidence

- `apps/pc-optimizer/src/features/health/BackgroundCleanupService.ts:157` — calls `RPC_METHODS.ORCHESTRATOR_OPTIMIZE`
- `apps/pc-optimizer/src/features/health/BackgroundCleanupService.ts:13` — "This service starts at app boot and runs continuously in the background. No user interaction required."
- `apps/pc-optimizer/src/main.tsx:49-50` — `backgroundCleanupService.start()` and `backgroundCleanupService.runStartupCleanup()` called at app boot
- `backend/src/avs_backend/orchestrator/__init__.py:1068` — `orchestrator_optimize()` performs module optimizations sequentially
- `SC8C10_FINAL_PRODUCTION_READINESS_AUDIT.md:742` — INFO-2: "Consider migration to `scan_core` in future phase"
- `SC8C11_SPECIFICATION.md:93` — "Migrating `BackgroundCleanupService` (deferred to future phase)"

### 2. Current implementation status

**Active production code. CRITICAL: This is the only feature in the product that performs automatic destructive execution without user approval.**

The service:
1. Starts at app boot (`main.tsx:49`)
2. Runs `runStartupCleanup()` immediately at boot (`main.tsx:50`)
3. Subscribes to `ProcessMonitorService` for process-closed events
4. When a browser/Explorer process closes, automatically calls `ORCHESTRATOR_OPTIMIZE` with deferred cleanup items
5. No user approval, no preview, no confirmation
6. Uses `withRetry` with 3 attempts — automatically retries on failure

### 3. Existing architecture involved

- Frontend: `BackgroundCleanupService.ts`, `ProcessMonitorService`, `DeferredCleanupStore` (Zustand/IndexedDB)
- Backend: `orchestrator/__init__.py` — `orchestrator_optimize()` calls module-specific optimize functions
- No `scan_core`, no `SafetyGate`, no `RemediationCoordinator`, no `ActionPlan`

### 4. Existing technical gaps

- **VIOLATES "no automatic execution" invariant** — executes at boot and on process-close events without user approval
- No `ActionPlan` persistence
- No `SafetyGate` validation
- No rollback support
- No `ExecutionRepository` audit trail
- No explicit approval
- Uses `IndexedDB` for deferred cleanup state (`DeferredCleanupStore`) — **VIOLATES "no browser storage for remediation state" invariant**

### 5. Security implications

**HIGH.** This is the most security-critical candidate. It directly violates two established invariants:
1. "No automatic execution"
2. "No browser storage for remediation state"

The service performs destructive operations (file deletion, cache clearing) automatically at app boot and when processes close, with no user approval whatsoever.

### 6. Privacy implications

**LOW.** Operations clean cache/temp files — no sensitive data exposure.

### 7. UX implications

**MEDIUM.** Users currently get a notification "Background Cleanup Completed" after the fact. Migration would change this to either:
- A notification-based "items ready for cleanup" UX (user approves)
- Integration into the canonical `ResultsView` flow
- Complete disabling of automatic background cleanup

### 8. Persistence/recovery implications

Currently uses `IndexedDB` (`DeferredCleanupStore`) for deferred cleanup state. Migration would move this to backend `ActionPlanRepository`.

### 9. Concurrency implications

The service has a `cleaning` flag to prevent overlapping cleanups, but no ref-based guards for RPC calls.

### 10. Whether scan_core can support it without modification

**YES** — if the service is converted from automatic execution to notification-based "items ready for cleanup" UX. The existing `scan_core.remediation.*` flow supports this.

### 11. Whether SafetyGate would need modification

**NO** — if the service is converted to use the canonical flow.

### 12. Whether new ActionTypes would be required

**POTENTIALLY** — same as Candidate A, since the underlying operations are the same (temp files, cache, etc.)

### 13. Whether new executors would be required

**NO** — existing executors cover the operations.

### 14. Whether new RPCs would be required

**NO** — existing `scan_core.remediation.*` RPCs are sufficient.

### 15. Estimated implementation complexity

**MEDIUM.** Requires:
- Converting automatic execution to notification-based or explicit-approval UX
- Migrating `DeferredCleanupStore` from `IndexedDB` to backend persistence
- Disconnecting `ORCHESTRATOR_OPTIMIZE` calls
- May be combined with Candidate A since they share the same underlying operations

### 16. Estimated number of implementation phases

**2–3 phases** (if combined with Candidate A) or **2 phases** (standalone)

### 17. Regression risk

**MEDIUM.** Users may notice that background cleanup no longer happens automatically. This is a behavior change, but it aligns with the security invariants.

### 18. Whether it logically follows SC-8C12

**YES.** It was explicitly deferred by SC-8C11 and SC-8C10. It's the only feature that directly violates the "no automatic execution" invariant.

### 19. Whether it should be considered a continuation of the canonical remediation migration

**YES.** It eliminates the last automatic execution path in the product.

### 20. Whether it should instead be treated as an independent future project

**NO** — it's a direct violation of established security invariants and should be addressed as part of the canonical remediation migration.

---

## 6. Candidate C Analysis — Legacy Health Scan Modal Cleanup

### 1. Exact repository evidence

- `apps/pc-optimizer/src/features/dashboard/components/HealthScanModal.tsx`
- `apps/pc-optimizer/src/features/dashboard/components/UnifiedHealthScanModal.tsx`
- `apps/pc-optimizer/src/features/dashboard/components/UnifiedHealthScanResults.tsx`
- `SC8C10_FINAL_PRODUCTION_READINESS_AUDIT.md:741` — INFO-1: "Legacy health scan modals exist but are not imported by active code"
- `SC8C11_SPECIFICATION.md:94` — "Removing health scan modals (deferred to future phase)"

### 2. Current implementation status

**Dead code.** No imports of these files exist anywhere in the codebase:
```
import.*HealthScanModal|import.*UnifiedHealthScan → 0 matches
```

### 3. Existing architecture involved

None — these are orphaned components from the pre-`scan_core` era.

### 4. Existing technical gaps

None — dead code has no gaps.

### 5. Security implications

**NONE.** Dead code has no security impact.

### 6. Privacy implications

**NONE.**

### 7. UX implications

**NONE.** Components are not rendered.

### 8–9. Persistence/recovery/concurrency implications

**NONE.**

### 10–14. scan_core/SafetyGate/ActionTypes/executors/RPCs

**NOT APPLICABLE.** Dead code removal does not involve these.

### 15. Estimated implementation complexity

**LOW.** Delete 3 files and verify no references.

### 16. Estimated number of implementation phases

**1 phase** (or sub-task within another phase)

### 17. Regression risk

**NONE.** Dead code removal cannot cause regressions.

### 18. Whether it logically follows SC-8C12

**WEAK.** Explicitly deferred by SC-8C11, but it's a cleanup task, not a capability.

### 19. Whether it should be considered a continuation of the canonical remediation migration

**NO.** It's dead code cleanup, not remediation migration.

### 20. Whether it should instead be treated as an independent future project

**YES** — or included as a sub-task within another phase.

---

## 7. Candidate D Analysis — Module-Level Cleaner Integration

### 1. Exact repository evidence

- `apps/pc-optimizer/src/features/junk-cleaner/junkCleaner.service.ts:61` — `CLEANER_CLEAN_EXECUTE`
- `apps/pc-optimizer/src/features/maintenance-engine/tasks/TempFilesCleanerTask.ts:91` — `CLEANER_CLEAN_EXECUTE`
- `apps/pc-optimizer/src/features/maintenance-engine/tasks/RecycleBinCleanerTask.ts:91` — `CLEANER_CLEAN_EXECUTE`
- `apps/pc-optimizer/src/features/maintenance-engine/tasks/BrowserCleanerTask.ts:95` — `CLEANER_CLEAN_EXECUTE`
- `apps/pc-optimizer/src/features/maintenance-engine/tasks/JunkCleanerTask.ts:103` — `CLEANER_CLEAN_EXECUTE`
- `apps/pc-optimizer/src/features/browser-health/browserExecutionTask.ts:169` — `PRIVACY_CLEAN`
- `apps/pc-optimizer/src/features/storage-intelligence/storageExecutionTask.ts:164` — `CLEANER_CLEAN_EXECUTE`
- `SC8C12_PRODUCT_DIRECTION_REPORT.md:275-301` — Candidate 5 analysis

### 2. Current implementation status

**Active production code.** 6+ independent cleaner modules each with their own scan/clean/undo lifecycle:
- Junk Cleaner
- Registry Cleaner
- Privacy Cleaner
- Startup Manager
- Performance (memory optimize)
- Duplicate Finder

### 3. Existing architecture involved

Each cleaner has:
- Its own frontend service (e.g., `junkCleaner.service.ts`)
- Its own backend module (e.g., `cleaner/__init__.py`)
- Its own RPC methods (e.g., `CLEANER_CLEAN_EXECUTE`, `PRIVACY_CLEAN`, `STARTUP_DISABLE`)
- Its own scan/clean/undo UX
- No `scan_core` references

### 4. Existing technical gaps

- No `ActionPlan` persistence for any cleaner
- No `SafetyGate` validation
- No `RemediationCoordinator` involvement
- No `ExecutionRepository` audit trail
- Each has its own non-canonical undo/rollback mechanism

### 5. Security implications

**MEDIUM.** Cleaners perform destructive operations without canonical safety controls. However, they have their own confirm/preview UX.

### 6. Privacy implications

**LOW.** Privacy Cleaner cleans browsing traces — no sensitive data exposure.

### 7. UX implications

**VERY HIGH.** These are core V1.0 features with established UX, extensive test suites, and user expectations. Migration would change the UX of every cleaner page.

### 8–9. Persistence/recovery/concurrency implications

Each cleaner has its own patterns. Migration would standardize all of them.

### 10. Whether scan_core can support it without modification

**PARTIALLY.** Existing `ActionType`s cover some operations:
- `DELETE_FILE` — junk files, duplicate files
- `CLEAR_CACHE` — cache cleaning
- `CLEAR_BROWSER_CACHE` — browser cache/privacy
- `DISABLE_STARTUP_ENTRY` — startup management
- `REMOVE_REGISTRY_VALUE` / `REMOVE_REGISTRY_KEY` — registry cleaning

Missing:
- No `ActionType` for memory optimization
- No `ActionType` for duplicate file deletion with dedup-specific safety
- No `ActionType` for software uninstallation

### 11. Whether SafetyGate would need modification

**NO** — for covered operations. **YES** — for operations without existing `ActionType`s.

### 12. Whether new ActionTypes would be required

**POTENTIALLY** — for memory optimization, uninstallation, and duplicate-specific operations.

### 13. Whether new executors would be required

**POTENTIALLY** — for memory optimization and uninstallation.

### 14. Whether new RPCs would be required

**NO** — existing `scan_core.remediation.*` RPCs are sufficient for covered operations.

### 15. Estimated implementation complexity

**VERY HIGH.** 6+ independent modules, each with its own UX, tests, and established patterns.

### 16. Estimated number of implementation phases

**6+ phases** (one per cleaner module)

### 17. Regression risk

**HIGH.** Core V1.0 features with extensive test suites and established UX.

### 18. Whether it logically follows SC-8C12

**MODERATE.** Continues canonical remediation migration, but scope is too large for a single phase.

### 19. Whether it should be considered a continuation of the canonical remediation migration

**YES, but as a multi-release initiative, not a single SC-8C phase.**

### 20. Whether it should instead be treated as an independent future project

**YES.** This is a long-term initiative, not a single SC-8C phase.

---

## 8. Candidate E Analysis — Security Center Legacy Backend Cleanup

### 1. Exact repository evidence

- `backend/src/avs_backend/security_remediation/__init__.py` — legacy backend module with `shutil.move`, `subprocess.run` (PowerShell), and 7 RPC handlers
- `apps/pc-optimizer/src/features/security-remediation/` — 10+ legacy frontend classes
- `apps/pc-optimizer/src/features/security-dashboard/securityBackendService.ts` — legacy RPC wrappers (dead code)
- `SC8C12_PHASE5_FINAL_SECURITY_REGRESSION_AUDIT.md:546-562` — remaining legacy references

### 2. Current implementation status

**Mixed:**
- Legacy backend `security_remediation/__init__.py` — **ACTIVE** (RPC handlers registered, `security.quarantine.list` still called for read-only quarantine summary)
- Legacy frontend `security-remediation/` classes — **RETAINED** (used by `SecurityCenterService` for read-only domain functionality + tests)
- Legacy RPC wrappers in `securityBackendService.ts` — **DEAD CODE** (no production caller for execution methods)

### 3. Existing architecture involved

- Backend: `security_remediation/__init__.py` — uses `shutil.move` for quarantine, `subprocess.run` for PowerShell
- Frontend: `ThreatRemediationEngine` and sub-managers — used for read-only plan listing, quarantine summary, reports, false positives
- `securityBackendService.ts` — legacy RPC wrappers

### 4. Existing technical gaps

- `security.quarantine.list` is still called as transitional measure for quarantine summary
- Legacy `ThreatRemediationEngine` is still instantiated for read-only functionality
- Legacy RPC wrappers are dead code but retained

### 5. Security implications

**LOW.** Execution paths are already disconnected (SC-8C12 Phase 4/5). Remaining references are read-only or dead code.

### 6. Privacy implications

**LOW.** Legacy `security.quarantine.list` returns quarantine entries — may include file paths. Should be replaced with canonical query.

### 7. UX implications

**LOW.** Read-only functionality (plan listing, quarantine summary, reports) would need to be migrated to canonical RPCs.

### 8–9. Persistence/recovery/concurrency implications

**LOW.** Legacy classes use in-memory state only. Migration would move to backend persistence.

### 10. Whether scan_core can support it without modification

**YES.** A new `scan_core.security_remediation.quarantine_list` RPC can be added without modifying `scan_core` internals.

### 11. Whether SafetyGate would need modification

**NO.**

### 12. Whether new ActionTypes would be required

**NO.**

### 13. Whether new executors would be required

**NO.**

### 14. Whether new RPCs would be required

**YES** — `scan_core.security_remediation.quarantine_list` (per SC-8C12 phase plan unresolved decision)

### 15. Estimated implementation complexity

**LOW.** Requires:
- New `quarantine_list` RPC
- Migrate read-only functionality to canonical RPCs
- Remove dead legacy code
- Remove dead RPC wrappers

### 16. Estimated number of implementation phases

**1–2 phases**

### 17. Regression risk

**LOW.** Execution paths are already disconnected. Risk is in migrating read-only functionality.

### 18. Whether it logically follows SC-8C12

**YES.** Direct continuation of SC-8C12 Phase 5 remaining limitations.

### 19. Whether it should be considered a continuation of the canonical remediation migration

**YES.** It completes the Security Center migration.

### 20. Whether it should instead be treated as an independent future project

**NO** — it's a direct continuation of SC-8C12.

---

## 9. Candidate F Analysis — Pause/Resume Backend Contract

### 1. Exact repository evidence

- `SC8C11_SPECIFICATION.md:96` — "Adding pause/resume backend contract (deferred to future phase)"
- `backend/src/avs_backend/scan_core/orchestration/remediation.py` — `RemediationCoordinator` has `cancel()` but no `pause()` or `resume()`
- `backend/src/avs_backend/scan_core/execution/` — all executors have `_check_cancelled()` but no pause/resume

### 2. Current implementation status

**Not implemented.** The canonical remediation architecture supports:
- **Cancellation** — `CancellationToken`, `scan_core.remediation.cancel` RPC, `_check_cancelled()` in all executors
- **Restart recovery** — `ExecutionRepository` seeds `ExecutionLedger` after restart to prevent duplicate completed actions
- **Status polling** — `scan_core.remediation.status` RPC

No pause or resume capability exists.

### 3. Existing architecture involved

- `RemediationCoordinator` — has `cancel()` but no `pause()`/`resume()`
- `CancellationToken` — binary cancel, no pause state
- `ExecutionRepository` — persists execution state, but no "paused" state
- All executors — check `is_cancelled()`, no `is_paused()` check

### 4. Existing technical gaps

- No `pause()` method on `RemediationCoordinator`
- No `resume()` method on `RemediationCoordinator`
- No "paused" state in `ExecutionRepository`
- No `is_paused()` check in executors
- No `scan_core.remediation.pause` or `scan_core.remediation.resume` RPC

### 5. Security implications

**HIGH RISK.** Pause/resume introduces a new execution state that conflicts with explicit approval semantics:
- If execution is paused, should approval still be valid on resume?
- If the app restarts while paused, should execution auto-resume?
- Does pause/resume weaken the "no automatic resume" invariant?

### 6. Privacy implications

**NONE.**

### 7. UX implications

**MEDIUM.** Users could pause long-running remediation operations. This is a convenience feature, not a safety feature.

### 8. Persistence/recovery implications

**COMPLEX.** Paused state would need to be persisted. Restart behavior for paused executions needs definition.

### 9. Concurrency implications

**COMPLEX.** Pause/resume introduces additional state transitions that need guarding.

### 10. Whether scan_core can support it without modification

**NO.** Pause/resume requires modifications to:
- `RemediationCoordinator` — add `pause()` and `resume()` methods
- `CancellationToken` — add paused state or new token type
- All executors — add `is_paused()` checks
- `ExecutionRepository` — add "paused" state

### 11. Whether SafetyGate would need modification

**POTENTIALLY.** If paused executions need re-validation on resume.

### 12. Whether new ActionTypes would be required

**NO.**

### 13. Whether new executors would be required

**NO.**

### 14. Whether new RPCs would be required

**YES** — `scan_core.remediation.pause` and `scan_core.remediation.resume`

### 15. Estimated implementation complexity

**HIGH.** Requires `scan_core` internal modifications across multiple components.

### 16. Estimated number of implementation phases

**3–4 phases** (coordinator changes, executor changes, persistence, frontend)

### 17. Regression risk

**HIGH.** Modifying `RemediationCoordinator` and all executors risks breaking existing remediation flows.

### 18. Whether it logically follows SC-8C12

**WEAK.** Explicitly deferred by SC-8C11, but it requires core architecture changes that conflict with the established baseline.

### 19. Whether it should be considered a continuation of the canonical remediation migration

**NO.** It's a new capability, not a migration.

### 20. Whether it should instead be treated as an independent future project

**YES.** It requires `scan_core` modifications and introduces security risks. Should be treated as an independent project requiring its own specification.

---

## 10. Candidate Comparison Matrix

| Criterion | A: Dashboard Optimize | B: Background Cleanup | C: Health Scan Modal | D: Module Cleaners | E: SC Legacy Cleanup | F: Pause/Resume |
|-----------|----------------------|----------------------|---------------------|-------------------|---------------------|-----------------|
| Repository evidence | HIGH | HIGH | MEDIUM | HIGH | HIGH | LOW |
| Security value | MEDIUM | **HIGH** | NONE | MEDIUM | LOW | HIGH RISK |
| Architectural value | MEDIUM | HIGH | NONE | HIGH | LOW | MEDIUM |
| User value | MEDIUM | MEDIUM | LOW | MEDIUM | LOW | MEDIUM |
| Alignment with architecture | HIGH | HIGH | N/A | HIGH | HIGH | **LOW** (requires core changes) |
| Complexity | MEDIUM | MEDIUM | LOW | VERY HIGH | LOW | HIGH |
| Regression risk | MEDIUM | MEDIUM | NONE | HIGH | LOW | HIGH |
| Need for core changes | NO | NO | N/A | POTENTIALLY | NO | **YES** |
| Need for new executors | NO | NO | N/A | POTENTIALLY | NO | NO |
| Need for new ActionTypes | POTENTIALLY | POTENTIALLY | N/A | POTENTIALLY | NO | NO |
| Need for product decisions | YES | YES | NO | YES | YES | YES |
| Violates security invariant | NO (has confirm) | **YES** (auto-execution) | NO | NO | NO | **YES** (auto-resume risk) |
| Logically follows SC-8C12 | YES | YES | WEAK | MODERATE | YES | WEAK |
| Estimated phases | 3–4 | 2–3 | 1 | 6+ | 1–2 | 3–4 |

---

## 11. Security Comparison

| Candidate | Violates invariants | Security risk | Safety-critical |
|-----------|-------------------|--------------|-----------------|
| A: Dashboard Optimize | NO (has confirm step) | MEDIUM (bypasses scan_core) | NO |
| B: Background Cleanup | **YES** (no automatic execution, browser storage) | **HIGH** (auto-execution at boot) | **YES** |
| C: Health Scan Modal | NO | NONE | NO |
| D: Module Cleaners | NO (has confirm) | MEDIUM (bypasses scan_core) | NO |
| E: SC Legacy Cleanup | NO | LOW (read-only remnants) | NO |
| F: Pause/Resume | **YES** (auto-resume risk) | HIGH (core changes) | YES |

**Candidate B is the only candidate that actively violates established security invariants in production.**

---

## 12. Architecture Comparison

| Candidate | Reuses scan_core | Requires core changes | Follows SC-8C11/12 pattern |
|-----------|-----------------|---------------------|--------------------------|
| A: Dashboard Optimize | YES | NO | YES (adapter → plan builder → RPC → PlanReviewView → ResultsView) |
| B: Background Cleanup | YES (if converted) | NO | YES (if combined with A) |
| C: Health Scan Modal | N/A | NO | NO |
| D: Module Cleaners | PARTIALLY | POTENTIALLY | YES (per module) |
| E: SC Legacy Cleanup | YES | NO | YES (completes SC-8C12) |
| F: Pause/Resume | NO | **YES** (coordinator, executors, persistence) | NO |

---

## 13. Complexity Comparison

| Candidate | Complexity | Phases | Regression risk |
|-----------|-----------|--------|-----------------|
| A: Dashboard Optimize | MEDIUM | 3–4 | MEDIUM |
| B: Background Cleanup | MEDIUM | 2–3 | MEDIUM |
| C: Health Scan Modal | LOW | 1 | NONE |
| D: Module Cleaners | VERY HIGH | 6+ | HIGH |
| E: SC Legacy Cleanup | LOW | 1–2 | LOW |
| F: Pause/Resume | HIGH | 3–4 | HIGH |

---

## 14. Regression-Risk Comparison

| Candidate | Risk level | Affected features |
|-----------|-----------|------------------|
| A: Dashboard Optimize | MEDIUM | Dashboard One-Click Optimize (core V1.0) |
| B: Background Cleanup | MEDIUM | Background cleanup behavior change |
| C: Health Scan Modal | NONE | Dead code only |
| D: Module Cleaners | HIGH | All cleaner modules (core V1.0) |
| E: SC Legacy Cleanup | LOW | Read-only Security Center functionality |
| F: Pause/Resume | HIGH | All remediation flows |

---

## 15. Recommended Direction

### **Candidate B (Background Cleanup Service) — with Candidate A as a combined effort**

### Rationale

1. **Security urgency:** Candidate B is the **only feature in the product that actively violates the "no automatic execution" invariant**. It performs destructive operations at app boot without user approval. This is the highest-priority security gap in the post-SC-8C12 architecture.

2. **Invariant violations:** Candidate B violates TWO established invariants:
   - "No automatic execution" — runs at boot and on process-close events
   - "No browser storage for remediation state" — uses `IndexedDB` (`DeferredCleanupStore`)

3. **Combined with Candidate A:** Background Cleanup calls `ORCHESTRATOR_OPTIMIZE`, which performs the same operations as Dashboard One-Click Optimize (`dashboard.optimize.execute`). Combining both candidates:
   - Eliminates both parallel execution paths
   - Shares the same adapter/plan builder
   - Shares the same frontend hook pattern
   - Shares the same `PlanReviewView` → `ResultsView` flow

4. **Architectural alignment:** The combined effort follows the exact same pattern as SC-8C11 (Smart Optimization) and SC-8C12 (Security Center):
   - Adapter → Plan Builder → RPC → `PlanReviewView` → `ResultsView` → `RemediationCoordinator`

5. **No core changes required:** The existing `scan_core` architecture can support both candidates without modifying `SafetyGate`, `RemediationCoordinator`, executors, or `scan_core` internals.

6. **Candidate E can be included:** Security Center legacy backend cleanup is low-risk and can be included as a sub-phase or parallel track.

### Why not the other candidates

- **Candidate C:** Insufficient scope for a full phase. Can be included as a sub-task.
- **Candidate D:** Too large (6+ phases). Should be a long-term initiative.
- **Candidate F:** Requires `scan_core` core changes and introduces security risks. Should be an independent project.

---

## 16. Evidence Supporting Recommendation

| Evidence | Source | Strength |
|----------|--------|----------|
| Background Cleanup starts at app boot | `main.tsx:49-50` | Direct code evidence |
| Background Cleanup calls ORCHESTRATOR_OPTIMIZE automatically | `BackgroundCleanupService.ts:157` | Direct code evidence |
| "No user interaction required" | `BackgroundCleanupService.ts:13` | Direct code evidence |
| Uses IndexedDB for deferred state | `DeferredCleanupStore` (Zustand) | Direct code evidence |
| SC-8C11 explicitly deferred this | `SC8C11_SPECIFICATION.md:93` | Authoritative |
| SC-8C10 audit identified this | `SC8C10_FINAL_PRODUCTION_READINESS_AUDIT.md:742` | Audit finding |
| Dashboard Optimize bypasses scan_core | `dashboard/__init__.py:606` | Direct code evidence |
| SC-8C11 explicitly deferred Dashboard migration | `SC8C11_SPECIFICATION.md:92` | Authoritative |
| Existing ActionType covers most operations | `scan_core/rules/action.py:183` | Architecture evidence |
| SC-8C11/SC-8C12 pattern is proven | SC-8C11 and SC-8C12 reports | Implementation evidence |

---

## 17. Required Product Decisions

Before an authoritative specification can be created, the following product decisions are required:

### Critical decisions

1. **Should Background Cleanup Service be:**
   - (a) Converted to notification-based "items ready for cleanup" UX (user approves)
   - (b) Integrated into the canonical `ResultsView` flow
   - (c) Completely disabled
   - (d) Retained as-is (accept the invariant violation)

2. **Should Dashboard One-Click Optimize be:**
   - (a) Migrated to canonical `scan_core` flow (changes UX)
   - (b) Retained as-is (accept the bypass)
   - (c) Migrated with a simplified flow (not full PlanReviewView)

3. **Should Flush DNS and Trim Memory be:**
   - (a) Excluded from `scan_core` migration (remain as utility operations)
   - (b) Added as new `ActionType`s
   - (c) Classified as `NOT_FIXABLE`

4. **Should Candidate E (Security Center Legacy Backend Cleanup) be included?**

5. **Should Candidate C (Health Scan Modal Cleanup) be included as a sub-task?**

### Non-critical decisions

6. **Should the combined effort be one SC-8C13 or split into SC-8C13 (Background Cleanup) + SC-8C14 (Dashboard Optimize)?**
7. **What should happen to the `DeferredCleanupStore` (IndexedDB) state?**
8. **Should `orchestrator.optimize` RPC be deprecated?**

---

## 18. Proposed Specification Requirements

If the product decision is to proceed with the recommended direction, the authoritative specification should include:

1. **Objective:** Eliminate automatic execution by migrating Background Cleanup Service and Dashboard One-Click Optimize to the canonical `scan_core` remediation flow
2. **Scope:** BackgroundCleanupService, DashboardViewModel, dashboard.service.ts, backend dashboard/__init__.py, orchestrator optimize
3. **Non-goals:** Module-level cleaners (Candidate D), pause/resume (Candidate F), scan_core internal modifications
4. **Architecture:** Adapter → Plan Builder → RPC → PlanReviewView → ResultsView → RemediationCoordinator (same as SC-8C11/SC-8C12)
5. **RPC contracts:** New `scan_core.dashboard_optimization.plan` RPC, existing `scan_core.remediation.*` RPCs
6. **Security requirements:** No automatic execution, explicit approval, no browser storage for remediation state
7. **Privacy requirements:** No sensitive path exposure in RPC responses
8. **UX requirements:** Notification-based cleanup proposal, explicit approval, progress, rollback
9. **Testing requirements:** Concurrency guards, no auto-execution, no browser storage, privacy-safe payload
10. **Acceptance criteria:** Zero automatic execution paths, zero browser storage for remediation state, all validation passes

---

## 19. Explicit Non-Goals

- Modifying `scan_core` internals
- Modifying `SafetyGate`
- Modifying `RemediationCoordinator`
- Modifying existing target executors
- Creating new `ActionType`s (unless product decision requires)
- Creating new executors
- Migrating module-level cleaners (Candidate D)
- Implementing pause/resume (Candidate F)
- Starting SC-8C14

---

## 20. Final Verdict

### PRODUCT_DECISION_REQUIRED

**Rationale:**

The repository evidence strongly supports Candidate B (Background Cleanup Service) as the highest-priority direction, potentially combined with Candidate A (Dashboard One-Click Optimize). Candidate B is the only feature that actively violates established security invariants in production.

However, the recommended direction is **NOT an authoritative specification**. It requires product decisions before implementation can begin:

1. The product owner must decide whether to convert, disable, or retain Background Cleanup Service
2. The product owner must decide whether to migrate Dashboard One-Click Optimize
3. The product owner must decide how to handle Flush DNS and Trim Memory operations
4. The product owner must decide whether to include Candidate E and C

**No candidate has been declared authoritative.**
**No implementation has been started.**
**No production code, tests, or documentation were modified.**

---

**End of SC-8C13 Phase 2 Product Direction Analysis**
