# SC-8C11 Specification — Smart Optimization Remediation Integration

## 1. SC-8C11 Objective

**Integrate Smart Optimization remediation into the canonical `scan_core.remediation.*` workflow while preserving the existing Smart Optimization AI planning engine.**

### Why This Is the Logical Next Phase

SC-8C10 established a production-ready canonical scan/remediation architecture:

```
Dashboard → ScanView → scan_core → ActionPlan → ResultsView → prepare → validate → approve → execute → rollback
```

**Current State:**
- ✅ Protection Center uses canonical flow
- ✅ Security Center uses canonical flow  
- ⚠️ **Smart Optimization uses ScanView for scanning but bypasses `scan_core.remediation.*` for execution**

**Gap Identified:**
`SmartOptimizationPage.tsx` imports `ScanView` for scanning (line 22, 214-220) but uses a separate `executionHandler.ts` that calls:
- `dashboardService.executeOptimize()`
- `junkCleanerService.clean()`
- `privacyService.clean()`
- `registryService.clean()`
- `startupService.disableEntry()`
- `performanceService.optimizeMemory()`

This creates a **parallel execution system** that:
- ❌ Bypasses `SafetyGate` validation
- ❌ Bypasses `RemediationCoordinator` approval workflow
- ❌ Bypasses `ExecutionLedger` duplicate prevention
- ❌ Bypasses `ActionPlanRepository` persistence
- ❌ Bypasses `ExecutionRepository` audit trail
- ❌ Does not integrate with canonical rollback system
- ❌ Does not benefit from stale-plan rejection
- ❌ Does not benefit from restart/recovery safety

**SC-8C11 Objective:**
Migrate Smart Optimization execution to use `scan_core.remediation.*` RPCs while preserving the existing Smart Optimization AI engine for plan generation, simulation, and insights.

**Success Criteria:**
1. Smart Optimization remediation flows through `RemediationCoordinator`
2. Smart Optimization actions are validated by `SafetyGate`
3. Smart Optimization execution is persisted to `ExecutionRepository`
4. Smart Optimization rollback uses canonical `scan_core.remediation.rollback`
5. Smart Optimization AI engine remains unchanged (plan generation, simulation, insights)
6. Smart Optimization UI preserves existing dashboard, preview, and insights panels
7. All three modules (Protection, Security, Smart Optimization) use identical safety model

---

## 2. Scope

### 2.1 Included

**Backend:**
- ✅ Create Smart Optimization rule adapters for `scan_core` rule registry
- ✅ Map Smart Optimization action types to `scan_core` remediation actions
- ✅ Integrate Smart Optimization findings into `scan_core` ActionPlan
- ✅ Route Smart Optimization execution through `RemediationCoordinator`

**Frontend:**
- ✅ Migrate `SmartOptimizationPage` execution from `executionHandler.ts` to `useResults` hook
- ✅ Preserve Smart Optimization AI dashboard, preview, simulation, and insights UI
- ✅ Use `ResultsView` for remediation workflow (prepare → validate → approve → execute)
- ✅ Remove `executionHandler.ts` and `OptimizationExecutionCoordinator` (parallel execution system)

**RPC:**
- ✅ Smart Optimization findings → `scan_core.scan.result`
- ✅ Smart Optimization remediation → `scan_core.remediation.*` (existing RPCs, no new methods)

**Tests:**
- ✅ Smart Optimization rule adapter tests
- ✅ Smart Optimization remediation integration tests
- ✅ Smart Optimization UI tests updated for canonical flow
- ✅ Verify Smart Optimization AI engine remains functional

### 2.2 Explicitly Excluded

**Out of Scope:**
- ❌ Modifying Smart Optimization AI engine (`SmartOptimizationEngine`)
- ❌ Modifying Smart Optimization plan generation logic
- ❌ Modifying Smart Optimization simulation logic
- ❌ Modifying Smart Optimization insights generation
- ❌ Modifying Smart Optimization dashboard summary cards
- ❌ Creating new `scan_core` executors (reuse existing executors)
- ❌ Creating new `SafetyGate` rules (reuse existing rules)
- ❌ Modifying `ScanOrchestrator` scanning logic
- ❌ Modifying `RemediationCoordinator` approval logic
- ❌ Creating new RPC methods (reuse `scan_core.remediation.*`)
- ❌ Migrating `DashboardViewModel.healthScan*` state (deferred to future phase)
- ❌ Migrating `BackgroundCleanupService` (deferred to future phase)
- ❌ Removing health scan modals (deferred to future phase)
- ❌ Migrating Security Dashboard `securityBackendService` (deferred to future phase)
- ❌ Adding pause/resume backend contract (deferred to future phase)
- ❌ Performance optimization (deferred to future phase)
- ❌ SC-8C12 or any later phase

### 2.3 Affected Modules

**Frontend:**
- `apps/pc-optimizer/src/features/smart-optimization-ai/SmartOptimizationPage.tsx` — use `ResultsView` for remediation
- `apps/pc-optimizer/src/features/smart-optimization-ai/executionHandler.ts` — **DELETE** (parallel execution system)
- `apps/pc-optimizer/src/features/smart-optimization-ai/OptimizationExecutionCoordinator.ts` — **DELETE** (parallel execution coordinator)
- `apps/pc-optimizer/src/features/smart-optimization-ai/SmartOptimizationEngine.ts` — **NO CHANGES** (preserve AI engine)
- `apps/pc-optimizer/src/features/scan/ResultsView.tsx` — **NO CHANGES** (already supports all modules)
- `apps/pc-optimizer/src/features/scan/useResults.ts` — **NO CHANGES** (already supports all modules)

**Backend:**
- `backend/src/avs_backend/scan_core/rules/` — add Smart Optimization rule adapters
- `backend/src/avs_backend/scan_core/rules/registry.py` — register Smart Optimization rules
- `backend/src/avs_backend/scan_core/execution/` — **NO CHANGES** (reuse existing executors)
- `backend/src/avs_backend/scan_core/orchestration/remediation.py` — **NO CHANGES** (already supports all action types)

**Shared/RPC:**
- `packages/shared/src/rpc/index.ts` — **NO CHANGES** (reuse existing `scan_core.remediation.*`)

---

## 3. Current-State Gap Analysis

### 3.1 Implemented But Disconnected

| Feature | Current State | Gap | Impact |
|---------|--------------|-----|--------|
| Smart Optimization AI Engine | ✅ Complete | Not integrated with `scan_core` ActionPlan | Smart Optimization plans are not persisted, not auditable, not protected by SafetyGate |
| Smart Optimization Execution | ✅ Functional via `executionHandler.ts` | Bypasses `RemediationCoordinator` | No approval workflow, no SafetyGate, no execution ledger, no audit trail |
| Smart Optimization Rollback | ✅ Functional via `executionHandler.rollbackAction` | Bypasses canonical rollback system | No persistence, no confirmation dialog, no audit trail |
| Smart Optimization UI | ✅ Complete dashboard, preview, simulation, insights | Uses parallel execution system | Inconsistent with Protection/Security safety model |
| `ScanView` Integration | ✅ Smart Optimization Page uses `ScanView` for scanning | Execution does not use `ResultsView` | Inconsistent UX across modules |

### 3.2 Partially Implemented

| Feature | What Exists | What's Missing | Required Action |
|---------|-------------|----------------|-----------------|
| Smart Optimization Rules | Action types defined in `SmartOptimizationEngine` | Not registered in `scan_core` rule registry | Create rule adapters |
| Smart Optimization Findings | Generated by `SmartOptimizationEngine.generatePlan()` | Not converted to `scan_core` findings format | Create finding adapters |
| Smart Optimization Actions | Defined in `OptimizationAction` type | Not converted to `scan_core` remediation actions | Map action types to rule categories |

### 3.3 Duplicated

| Functionality | Canonical Implementation | Duplicate Implementation | Resolution |
|---------------|-------------------------|-------------------------|------------|
| Execution Coordination | `RemediationCoordinator` | `OptimizationExecutionCoordinator` | **DELETE** duplicate, use canonical |
| Execution Handler | `DefaultExecutor` + target executors | `executionHandler.ts` | **DELETE** duplicate, use canonical executors |
| Rollback | `RemediationCoordinator.rollback()` | `executionHandler.rollbackAction()` | **DELETE** duplicate, use canonical rollback |
| Approval Workflow | `useResults.approve()` → `scan_core.remediation.execute` | Direct execution via `executionHandler` | **DELETE** direct execution, use canonical approval |

### 3.4 Legacy

| Component | Status | Reason | Action |
|-----------|--------|--------|--------|
| `executionHandler.ts` | Legacy | Parallel execution system created before `scan_core` | **DELETE** in SC-8C11 |
| `OptimizationExecutionCoordinator.ts` | Legacy | Parallel coordinator created before `RemediationCoordinator` | **DELETE** in SC-8C11 |
| `DashboardViewModel.healthScan*` | Legacy | Pre-`scan_core` health scan state machine | **DEFER** to future phase (out of scope) |
| `BackgroundCleanupService` | Legacy | Contains `ORCHESTRATOR_OPTIMIZE` call | **DEFER** to future phase (out of scope) |

### 3.5 Missing from Canonical Workflow

| Missing Capability | Impact | Required for SC-8C11 |
|--------------------|--------|---------------------|
| Smart Optimization rule adapters | Smart Optimization actions not registered in `scan_core` | ✅ YES |
| Smart Optimization finding adapters | Smart Optimization findings not compatible with `scan_core` | ✅ YES |
| Smart Optimization action mapping | Smart Optimization action types not mapped to rule categories | ✅ YES |

### 3.6 Technically Ready for Integration

| Feature | Readiness | Evidence |
|---------|-----------|----------|
| `scan_core` supports multiple modules | ✅ Ready | Protection, Security already integrated |
| `ResultsView` supports all modules | ✅ Ready | `moduleName` prop, module-agnostic UI |
| `useResults` supports all modules | ✅ Ready | Module-agnostic hooks |
| `RemediationCoordinator` supports all action types | ✅ Ready | Extensible action type system |
| `SafetyGate` supports all action types | ✅ Ready | Rule-based validation |
| `DefaultExecutor` supports all action types | ✅ Ready | Delegates to target executors |
| Smart Optimization AI engine | ✅ Ready | Self-contained, no dependencies on execution system |

**Conclusion:** Smart Optimization integration is technically ready. No architectural changes required. Only adapters and routing changes needed.

---

## 4. Architecture Decision

### 4.1 Preserve Canonical Model

**Decision:** Reuse existing canonical architecture. Do NOT create a parallel Smart Optimization remediation system.

```
Dashboard
→ ScanView (already used by Smart Optimization)
→ scan_core.ScanOrchestrator (already supports optimize module)
→ ActionPlan (NEW: Smart Optimization findings → ActionPlan)
→ ResultsView (NEW: Smart Optimization uses ResultsView)
→ RemediationCoordinator (NEW: Smart Optimization execution routed here)
→ DefaultExecutor (reuse existing)
→ target executors (reuse existing: junk cleaner, privacy, registry, startup, performance)
→ verification (reuse existing)
→ persistence (reuse existing)
→ rollback (reuse existing)
```

### 4.2 Smart Optimization AI Engine Position

**Preserve existing Smart Optimization AI engine as a planning/simulation layer:**

```
User → Smart Optimization Page
  ↓
SmartOptimizationEngine.generatePlan(findings, healthScore)
  ↓
OptimizationPlan (actions, risk, benefits, evidence)
  ↓
[NEW] Convert to scan_core findings format
  ↓
scan_core.scan.result (findings, statistics, plan_id)
  ↓
ResultsView (prepare → validate → approve → execute)
  ↓
scan_core.remediation.* (canonical flow)
```

**Smart Optimization AI engine responsibilities (UNCHANGED):**
- ✅ Plan generation (`generatePlan`)
- ✅ Preview generation (`preview`)
- ✅ Simulation (`simulate`)
- ✅ Insights generation (`generateInsights`)
- ✅ Dashboard summary (`buildDashboard`)
- ✅ Configuration management (`getConfiguration`, `updateConfiguration`)

**Smart Optimization AI engine does NOT:**
- ❌ Execute actions (delegated to `scan_core.remediation.*`)
- ❌ Coordinate execution (delegated to `RemediationCoordinator`)
- ❌ Persist execution state (delegated to `ExecutionRepository`)
- ❌ Perform rollback (delegated to `scan_core.remediation.rollback`)

### 4.3 Integration Points

| Integration Point | Implementation |
|-------------------|----------------|
| Findings → ActionPlan | Create adapter: `OptimizationAction[]` → `ScanFinding[]` |
| Action Types → Rule Categories | Map: `clean_temp_files` → `delete_file`, `disable_startup_entry` → `disable_startup`, etc. |
| Execution → RemediationCoordinator | Replace `executionHandler.executeAction()` with `useResults.approve()` |
| Rollback → RemediationCoordinator | Replace `executionHandler.rollbackAction()` with `useResults.confirmRollback()` |
| UI → ResultsView | Use `ResultsView` for remediation workflow instead of custom execution UI |

### 4.4 Where SC-8C11 Fits

**Before SC-8C11:**
```
Smart Optimization Page
  ├─ ScanView (scan only)
  ├─ SmartOptimizationEngine (plan generation)
  ├─ Custom preview/simulation/insights UI
  └─ executionHandler.ts (PARALLEL EXECUTION SYSTEM) ❌
```

**After SC-8C11:**
```
Smart Optimization Page
  ├─ ScanView (scan)
  ├─ SmartOptimizationEngine (plan generation) ✅ PRESERVED
  ├─ Custom preview/simulation/insights UI ✅ PRESERVED
  └─ ResultsView (canonical remediation) ✅ NEW
        ↓
      scan_core.remediation.* (canonical flow) ✅
```

---

## 5. Feature Definition

### 5.1 Smart Optimization Scanning (NO CHANGES)

**User Intent:** Scan PC for optimization opportunities

**UI Entry Point:** Smart Optimization Page → "Scan & Optimize" button (existing `ScanView`)

**Backend Responsibility:** `scan_core.ScanOrchestrator` (already supports `optimize` module)

**RPC:** `scan_core.scan.quick({ module: 'optimize', mode: 'quick' })` (existing)

**Persistence:** `ScanHistoryRepository`, `ActionPlanRepository` (existing)

**Safety:** Read-only scan, no destructive operations

**Success/Failure:**
- Success: Findings returned, ActionPlan persisted
- Failure: Error displayed, no plan generated

**Status:** ✅ Already implemented, no changes required

### 5.2 Smart Optimization Plan Generation (NO CHANGES)

**User Intent:** Generate AI-optimized remediation plan

**UI Entry Point:** Automatic after scan completes (existing behavior)

**Backend Responsibility:** `SmartOptimizationEngine.generatePlan()` (existing, frontend-only)

**RPC:** None (frontend-only AI engine)

**Persistence:** None (transient plan)

**Safety:** Read-only plan generation, no destructive operations

**Success/Failure:**
- Success: Optimization plan displayed with actions, risk, benefits, evidence
- Failure: Error displayed, fallback to scan results

**Status:** ✅ Already implemented, no changes required

### 5.3 Smart Optimization Preview (NO CHANGES)

**User Intent:** Preview optimization actions before execution

**UI Entry Point:** Smart Optimization Page → Preview panel (existing UI)

**Backend Responsibility:** `SmartOptimizationEngine.preview()` (existing, frontend-only)

**RPC:** None (frontend-only preview)

**Persistence:** None (transient preview)

**Safety:** Read-only preview, no destructive operations

**Success/Failure:**
- Success: Preview displayed with estimated impact
- Failure: Error displayed

**Status:** ✅ Already implemented, no changes required

### 5.4 Smart Optimization Simulation (NO CHANGES)

**User Intent:** Simulate optimization impact on system metrics

**UI Entry Point:** Smart Optimization Page → "Run Simulation" button (existing UI)

**Backend Responsibility:** `SmartOptimizationEngine.simulate()` (existing, frontend-only)

**RPC:** None (frontend-only simulation)

**Persistence:** None (transient simulation)

**Safety:** Read-only simulation, no destructive operations

**Success/Failure:**
- Success: Simulation results displayed with before/after metrics
- Failure: Error displayed

**Status:** ✅ Already implemented, no changes required

### 5.5 Smart Optimization Insights (NO CHANGES)

**User Intent:** View AI-generated insights for each optimization action

**UI Entry Point:** Smart Optimization Page → Insights panel (existing UI)

**Backend Responsibility:** `SmartOptimizationEngine.generateInsights()` (existing, frontend-only)

**RPC:** None (frontend-only insights)

**Persistence:** None (transient insights)

**Safety:** Read-only insights, no destructive operations

**Success/Failure:**
- Success: Insights displayed for each action
- Failure: Error displayed

**Status:** ✅ Already implemented, no changes required

### 5.6 Smart Optimization Remediation (NEW - SC-8C11 SCOPE)

**User Intent:** Execute approved optimization actions safely

**UI Entry Point:** `ResultsView` → "Approve & Fix" button (canonical flow)

**Backend Responsibility:** `RemediationCoordinator.execute()` → `DefaultExecutor` → target executors

**RPC:** `scan_core.remediation.execute({ plan_id, approval_token, mode: 'live' })` (existing)

**Persistence:** `ExecutionRepository` (existing)

**Safety:**
- ✅ Explicit approval required
- ✅ `SafetyGate` validation
- ✅ Stale plan rejection
- ✅ Duplicate execution prevention via `ExecutionLedger`
- ✅ Backup before mutation
- ✅ Audit trail

**Success/Failure:**
- Success: Actions executed, results persisted, summary displayed
- Partial: Some actions succeeded, some failed, rollback available
- Failed: All actions failed, error displayed, rollback available
- Rejected: Stale plan or invalid approval token, error displayed

**Status:** ⚠️ NEW in SC-8C11 (migrate from `executionHandler.ts`)

### 5.7 Smart Optimization Rollback (NEW - SC-8C11 SCOPE)

**User Intent:** Rollback executed optimization actions

**UI Entry Point:** `ResultsView` → "Rollback" button (canonical flow)

**Backend Responsibility:** `RemediationCoordinator.rollback()` → restore from backups

**RPC:** `scan_core.remediation.rollback({ execution_id })` (existing)

**Persistence:** `ExecutionRepository` (existing)

**Safety:**
- ✅ Explicit confirmation required
- ✅ Uses persisted backup locations
- ✅ Audit trail

**Success/Failure:**
- Success: Actions rolled back, summary displayed
- Partial: Some actions rolled back, some failed, summary displayed
- Failed: Rollback failed, error displayed

**Status:** ⚠️ NEW in SC-8C11 (migrate from `executionHandler.rollbackAction`)

---

## 6. Security Requirements

### 6.1 Preserve SC-8C10 Invariants

**All SC-8C10 security invariants MUST be preserved:**

- ✅ Explicit approval for destructive actions
- ✅ Backend-authoritative actionability
- ✅ SafetyGate remains authoritative
- ✅ Fresh execution context
- ✅ Post-execution verification
- ✅ Stale-plan rejection
- ✅ Duplicate execution protection
- ✅ Rollback through RemediationCoordinator only
- ✅ No direct destructive APIs from React
- ✅ No automatic remediation
- ✅ No automatic resume
- ✅ No automatic rollback
- ✅ Privacy-safe RPC responses
- ✅ No browser storage for remediation state

### 6.2 Smart Optimization Specific Requirements

**Additional requirements for Smart Optimization integration:**

| Requirement | Implementation |
|-------------|----------------|
| Smart Optimization actions MUST be validated by SafetyGate | Map action types to rule categories, register rules in `RuleRegistry` |
| Smart Optimization execution MUST require explicit approval | Use `RemediationCoordinator.execute()` with approval token |
| Smart Optimization rollback MUST require explicit confirmation | Use `RemediationCoordinator.rollback()` with confirmation dialog |
| Smart Optimization execution MUST be persisted | Use `ExecutionRepository` |
| Smart Optimization execution MUST prevent duplicates | Use `ExecutionLedger` |
| Smart Optimization execution MUST reject stale plans | Use `ActionPlan.is_stale()` check in `DefaultExecutor` |
| Smart Optimization execution MUST create backups | Use existing executor backup logic |
| Smart Optimization execution MUST have audit trail | Use `ExecutionRepository.save_execution_summary()` |

### 6.3 No Architectural Changes

**SC-8C11 MUST NOT:**
- ❌ Weaken SafetyGate validation
- ❌ Bypass RemediationCoordinator approval
- ❌ Bypass ExecutionLedger duplicate prevention
- ❌ Bypass ActionPlan stale-plan rejection
- ❌ Bypass ExecutionRepository persistence
- ❌ Create a parallel execution system
- ❌ Create automatic remediation
- ❌ Create automatic resume
- ❌ Create automatic rollback
- ❌ Expose `canonical_path`, `asset_id`, `backup_location` to frontend
- ❌ Persist remediation state to browser storage

---

## 7. RPC Contracts

### 7.1 Existing RPCs (Reuse)

**No new RPC methods required.** Smart Optimization will reuse existing `scan_core` RPCs:

| RPC Method | Usage | Changes Required |
|------------|-------|------------------|
| `scan_core.scan.quick` | Smart Optimization scanning | ✅ Already used |
| `scan_core.scan.status` | Poll scan progress | ✅ Already used |
| `scan_core.scan.result` | Fetch scan findings | ✅ Already used |
| `scan_core.remediation.prepare` | Generate preview | ✅ NEW usage |
| `scan_core.remediation.validate` | Dry-run validation | ✅ NEW usage |
| `scan_core.remediation.execute` | Live execution | ✅ NEW usage |
| `scan_core.remediation.status` | Poll execution progress | ✅ NEW usage |
| `scan_core.remediation.rollback` | Rollback execution | ✅ NEW usage |

### 7.2 RPC Request/Response (No Changes)

**All existing RPC contracts remain unchanged.** Smart Optimization findings will be converted to `scan_core` finding format on the backend.

**Example: Smart Optimization Action → scan_core Finding**

```typescript
// Smart Optimization Action (frontend)
{
  id: "action-1",
  type: "clean_temp_files",
  title: "Clean Temporary Files",
  description: "Remove 2.5 GB of temporary files",
  impact: "high",
  risk: "low",
  estimatedRecoveryMB: 2500,
  rollbackAvailable: true
}

// Converted to scan_core Finding (backend)
{
  finding_id: "action-1",
  display_name: "Clean Temporary Files",
  rule_id: "smart_opt_clean_temp",
  rule_category: "delete_file",
  severity: "low",
  confidence: 1.0,
  safety: "safe",
  reason: "Remove 2.5 GB of temporary files",
  recommended_action: "delete file",
  estimated_size: 2621440000, // 2.5 GB in bytes
  is_blocked: false,
  requires_review: false,
  is_actionable: true,
  canonical_path: "" // redacted
}
```

### 7.3 Error/Rejection Behavior (No Changes)

**Reuse existing error handling:**
- Missing plan: `{ ok: false, error: "Plan not found" }`
- Stale plan: `{ ok: false, error: "Plan is stale" }`
- Invalid approval token: `{ ok: false, error: "Invalid approval token" }`
- Execution rejected: `{ ok: true, execution_id, status: "rejected", reason: "..." }`

### 7.4 Privacy Constraints (No Changes)

**Reuse existing privacy constraints:**
- ✅ No `canonical_path` in frontend responses
- ✅ No `asset_id` in frontend responses
- ✅ No `backup_location` in frontend responses
- ✅ Only `display_name` exposed to frontend

### 7.5 Idempotency Requirements (No Changes)

**Reuse existing idempotency:**
- ✅ `ExecutionLedger` prevents duplicate action execution
- ✅ Approval tokens are single-use
- ✅ Execution IDs are unique

---

## 8. Data / Persistence

### 8.1 What Needs Persistence

| Data | Persistence Layer | Schema Changes Required |
|------|------------------|------------------------|
| Smart Optimization scan results | `ScanHistoryRepository` | ❌ No (already supports `optimize` module) |
| Smart Optimization ActionPlan | `ActionPlanRepository` | ❌ No (already supports all action types) |
| Smart Optimization execution requests | `ExecutionRepository` | ❌ No (already supports all action types) |
| Smart Optimization execution results | `ExecutionRepository` | ❌ No (already supports all action types) |
| Smart Optimization execution summaries | `ExecutionRepository` | ❌ No (already supports all action types) |
| Smart Optimization completed action IDs | `ExecutionLedger` (in-memory, seeded from `ExecutionRepository`) | ❌ No |

### 8.2 What Must Remain Transient

| Data | Reason |
|------|--------|
| Smart Optimization AI plan (frontend) | Frontend-only AI engine, not persisted to backend |
| Smart Optimization preview (frontend) | Frontend-only preview, not persisted |
| Smart Optimization simulation (frontend) | Frontend-only simulation, not persisted |
| Smart Optimization insights (frontend) | Frontend-only insights, not persisted |
| Smart Optimization dashboard summary (frontend) | Frontend-only summary, not persisted |

### 8.3 Schema Changes

**None required.** Existing `scan_core` schema supports all Smart Optimization data.

### 8.4 Restart Behavior

**Reuse existing restart behavior:**
- ✅ Persisted scan history survives restart
- ✅ Persisted ActionPlan survives restart
- ✅ Persisted execution requests survive restart
- ✅ Completed action IDs seed `ExecutionLedger` after restart
- ✅ Interrupted execution does not auto-resume
- ✅ Stale plans are rejected after restart

### 8.5 Duplicate/Recovery Behavior

**Reuse existing duplicate/recovery behavior:**
- ✅ `ExecutionLedger` prevents duplicate action execution
- ✅ Completed actions are skipped with `status=SKIPPED`
- ✅ Incomplete executions are detectable via `get_incomplete_requests()`
- ✅ No automatic recovery

### 8.6 Privacy Constraints

**Reuse existing privacy constraints:**
- ✅ `ScanHistoryRepository` stores privacy-safe metadata only
- ✅ No raw findings, paths, credentials, or browser data persisted
- ✅ `ActionPlanRepository` stores `plan_data` JSON (backend-controlled exposure)
- ✅ `ExecutionRepository` stores `backup_identity`, `backup_location` (backend-controlled exposure)

---

## 9. UI/UX Flow

### 9.1 Complete User Workflow

```
idle
  ↓ (user clicks "Scan & Optimize")
preparing
  ↓
scanning (ScanView - already implemented)
  ↓
complete
  ↓ (Smart Optimization AI engine generates plan - already implemented)
results (Smart Optimization dashboard, preview, simulation, insights - already implemented)
  ↓ (user clicks "Approve & Fix" in ResultsView - NEW)
review (ResultsView displays findings - NEW)
  ↓ (user clicks "Preview Changes" - NEW)
preview (ResultsView displays sanitized preview - NEW)
  ↓ (user clicks "Validate" - NEW)
validating (dry-run execution - NEW)
  ↓
validation_complete (ResultsView displays validation summary - NEW)
  ↓ (user clicks "Approve & Fix" - NEW)
approval (RemediationCoordinator validates approval token - NEW)
  ↓
execution (DefaultExecutor executes actions - NEW)
  ↓
progress (ResultsView displays execution progress - NEW)
  ↓
terminal (completed / partial / failed / cancelled / rejected - NEW)
  ↓ [optional] (user clicks "Rollback" - NEW)
rollback_confirmation (ResultsView displays confirmation dialog - NEW)
  ↓ (user confirms - NEW)
rollback (RemediationCoordinator performs rollback - NEW)
  ↓
rollback_result (ResultsView displays rollback summary - NEW)
```

### 9.2 New UI States

**No new states required.** Reuse existing `ResultsView` states:

| State | User-Visible Information | Available Actions | Disabled Actions | Error Handling | Cancellation |
|-------|-------------------------|-------------------|------------------|----------------|--------------|
| `review` | Findings list, statistics | "Preview Changes" | "Approve & Fix" (until validated) | Error displayed, retry available | N/A |
| `preview` | Sanitized preview, estimated impact | "Validate" | "Approve & Fix" (until validated) | Error displayed, retry available | N/A |
| `validating` | "Validating..." progress | "Cancel" | "Approve & Fix" | Error displayed, retry available | Stops validation |
| `validation_complete` | Validation summary | "Approve & Fix" | N/A | Error displayed, retry available | N/A |
| `executing` | Progress bar, action status | "Cancel" | All other actions | Error displayed, continues with remaining actions | Sets cancellation token |
| `completed` | Summary, actions succeeded | "Rollback" (if available) | "Approve & Fix" | N/A | N/A |
| `partial` | Summary, some succeeded, some failed | "Rollback" (if available) | "Approve & Fix" | Error displayed | N/A |
| `failed` | Error, all actions failed | "Rollback" (if available) | "Approve & Fix" | Error displayed | N/A |
| `cancelled` | "Cancelled" message | N/A | "Approve & Fix" | N/A | N/A |
| `rejected` | "Rejected" reason | N/A | "Approve & Fix" | Error displayed | N/A |
| `rollback_confirmation` | Confirmation dialog, actions to rollback | "Confirm Rollback", "Cancel" | "Approve & Fix" | N/A | Closes dialog |
| `rollback_result` | Rollback summary | N/A | "Approve & Fix" | Error displayed | N/A |

**All states already implemented in `ResultsView`.** No UI changes required.

### 9.3 Smart Optimization Specific UI

**Preserve existing Smart Optimization UI:**
- ✅ Dashboard summary cards (current vs potential health score, storage recovered, items fixed, last optimization)
- ✅ Optimization plan panel (actions, risk, benefits, evidence)
- ✅ Preview panel (estimated impact)
- ✅ Simulation panel (before/after metrics)
- ✅ Insights panel (AI-generated insights for each action)
- ✅ Configuration panel (risk tolerance, automation preferences)

**Add canonical remediation UI:**
- ✅ `ResultsView` for remediation workflow (prepare → validate → approve → execute → rollback)

**Layout:**
```
Smart Optimization Page
  ├─ PageHeader with "Scan & Optimize" button (ScanView)
  ├─ Dashboard summary cards (4 cards)
  ├─ Optimization plan panel (if plan exists)
  ├─ Preview panel (if preview exists)
  ├─ Simulation panel (if simulation exists)
  ├─ Insights panel (if insights exist)
  └─ ResultsView (if scan complete) ← NEW
```

---

## 10. Performance Requirements

### 10.1 Acceptance Thresholds

**Reuse existing SC-8C10 baseline:**

| Operation | Threshold | Measurement |
|-----------|-----------|-------------|
| Smart Optimization scan | < 30s | Time from scan start to scan complete |
| Smart Optimization plan generation | < 2s | Time from scan complete to plan displayed |
| Smart Optimization preview generation | < 500ms | Time from plan generated to preview displayed |
| Smart Optimization simulation | < 1s | Time from "Run Simulation" click to simulation displayed |
| Smart Optimization insights generation | < 1s | Time from plan generated to insights displayed |
| Smart Optimization result rendering | < 1s | Time from scan complete to findings displayed |
| Smart Optimization plan loading | < 500ms | Time from `plan_details` RPC to plan displayed |
| Smart Optimization remediation | < 60s | Time from execute start to terminal state (for typical 5-10 actions) |
| Smart Optimization dashboard loading | < 2s | Time from page load to dashboard displayed |

**No new thresholds required.** Reuse existing performance tests.

### 10.2 No Stress-Test Modifications

**Do NOT modify existing stress-test thresholds.** If Smart Optimization integration causes performance regressions, optimize the integration, not the thresholds.

---

## 11. Test Strategy

### 11.1 Backend Unit Tests

**New tests required:**

| Test File | Tests | Purpose |
|-----------|-------|---------|
| `test_smart_optimization_rules.py` | 10-15 tests | Verify Smart Optimization rule adapters |
| `test_smart_optimization_integration.py` | 5-10 tests | Verify Smart Optimization findings → ActionPlan conversion |

**Test coverage:**
- ✅ Smart Optimization action types → rule categories mapping
- ✅ Smart Optimization findings → `scan_core` findings conversion
- ✅ Smart Optimization actions registered in `RuleRegistry`
- ✅ Smart Optimization actions validated by `SafetyGate`
- ✅ Smart Optimization execution routed through `RemediationCoordinator`
- ✅ Smart Optimization rollback routed through `RemediationCoordinator`

### 11.2 Backend Integration Tests

**Existing tests reused:**
- ✅ `test_sc8c4_phase_b_persistence_recovery.py` — persistence/recovery
- ✅ `test_sc8c4_part1_execution_engine.py` — execution engine
- ✅ `test_sc8c9_phase2_scan_history.py` — scan history

**New tests required:**
- ✅ Smart Optimization end-to-end scan → remediation → rollback

### 11.3 Frontend Tests

**Existing tests updated:**

| Test File | Changes | Purpose |
|-----------|---------|---------|
| `SmartOptimization.test.ts` | Update to use `ResultsView` instead of `executionHandler` | Verify Smart Optimization UI integration |

**New tests required:**

| Test File | Tests | Purpose |
|-----------|-------|---------|
| `smartOptimizationRemediation.test.tsx` | 5-10 tests | Verify Smart Optimization remediation flow |

**Test coverage:**
- ✅ Smart Optimization scan → results → remediation
- ✅ Smart Optimization prepare → validate → approve → execute
- ✅ Smart Optimization execution progress
- ✅ Smart Optimization terminal states
- ✅ Smart Optimization rollback
- ✅ Smart Optimization AI engine remains functional (plan, preview, simulation, insights)

### 11.4 RPC Contract Tests

**No new RPC contract tests required.** Reuse existing `scan_core.remediation.*` tests.

### 11.5 Security/Privacy Tests

**Existing tests reused:**
- ✅ `targetSanitization.test.tsx` — privacy-safe RPC responses
- ✅ `sc8c10_phase2.test.tsx` — concurrency/edge-case
- ✅ `sc8c10_phase3.test.tsx` — persistence/recovery

**New tests required:**
- ✅ Verify Smart Optimization actions validated by `SafetyGate`
- ✅ Verify Smart Optimization execution requires explicit approval
- ✅ Verify Smart Optimization rollback requires explicit confirmation

### 11.6 Concurrency Tests

**Existing tests reused:**
- ✅ `sc8c10_phase2.test.tsx` — duplicate operation prevention

**New tests required:**
- ✅ Verify Smart Optimization execution cannot be triggered twice

### 11.7 Persistence/Restart Tests

**Existing tests reused:**
- ✅ `sc8c10_phase3.test.tsx` — restart/recovery

**New tests required:**
- ✅ Verify Smart Optimization execution survives restart
- ✅ Verify Smart Optimization completed actions seed `ExecutionLedger` after restart

### 11.8 Failure/Recovery Tests

**Existing tests reused:**
- ✅ `results.test.tsx` — execution failure handling
- ✅ `rollback.test.tsx` — rollback failure handling

**New tests required:**
- ✅ Verify Smart Optimization partial execution (some actions succeed, some fail)
- ✅ Verify Smart Optimization rollback partial (some actions rollback, some fail)

### 11.9 Performance Tests

**No new performance tests required.** Reuse existing performance baseline.

---

## 12. Validation Commands

### 12.1 Backend Validation

```bash
cd backend

# Smart Optimization rule adapter tests
python -m pytest -q tests/test_smart_optimization_rules.py

# Smart Optimization integration tests
python -m pytest -q tests/test_smart_optimization_integration.py

# Full backend suite (must match SC-8C10 baseline: 1251 passed, 14 skipped)
python -m pytest -q
```

### 12.2 Frontend Validation

```bash
cd apps/pc-optimizer

# Typecheck (must pass)
yarn typecheck

# Lint (must pass with 0 warnings)
yarn lint

# Smart Optimization tests
npx vitest run src/features/smart-optimization-ai/__tests__/

# Scan/dashboard tests (must match SC-8C10 baseline: 274 passed)
npx vitest run src/features/scan/__tests__/ src/features/dashboard/__tests__/ src/features/smart-optimization-ai/__tests__/

# Production build (must pass)
yarn build
```

### 12.3 Baseline Requirements

**Must match or exceed SC-8C10 baseline:**
- ✅ Backend: 1251 passed, 14 skipped (or more passed)
- ✅ Frontend: 274 passed (or more passed)
- ✅ Typecheck: PASS
- ✅ Lint: PASS (0 warnings)
- ✅ Build: PASS

**Do NOT weaken validation requirements.**

---

## 13. Implementation Phases

### Phase 1: Backend Rule Adapters (1-2 days)

**Objective:** Create Smart Optimization rule adapters for `scan_core` rule registry

**Files Changed:**
- `backend/src/avs_backend/scan_core/rules/smart_optimization_rules.py` (NEW)
- `backend/src/avs_backend/scan_core/rules/registry.py` (register Smart Optimization rules)
- `backend/tests/test_smart_optimization_rules.py` (NEW)

**Acceptance Criteria:**
- [ ] Smart Optimization action types mapped to rule categories
- [ ] Smart Optimization rules registered in `RuleRegistry`
- [ ] 10-15 backend unit tests pass
- [ ] `python -m pytest -q tests/test_smart_optimization_rules.py` passes

**Risks:** Low (isolated backend changes)

### Phase 2: Backend Integration (1-2 days)

**Objective:** Integrate Smart Optimization findings into `scan_core` ActionPlan

**Files Changed:**
- `backend/src/avs_backend/scan_core/adapters/smart_optimization_adapter.py` (NEW)
- `backend/src/avs_backend/scan_core_rpc/__init__.py` (add Smart Optimization finding conversion)
- `backend/tests/test_smart_optimization_integration.py` (NEW)

**Acceptance Criteria:**
- [ ] Smart Optimization findings converted to `scan_core` findings format
- [ ] Smart Optimization ActionPlan persisted to `ActionPlanRepository`
- [ ] 5-10 backend integration tests pass
- [ ] `python -m pytest -q tests/test_smart_optimization_integration.py` passes

**Risks:** Low (isolated adapter changes)

### Phase 3: Frontend Remediation Integration (2-3 days)

**Objective:** Migrate Smart Optimization execution from `executionHandler.ts` to `useResults` hook

**Files Changed:**
- `apps/pc-optimizer/src/features/smart-optimization-ai/SmartOptimizationPage.tsx` (use `ResultsView`)
- `apps/pc-optimizer/src/features/smart-optimization-ai/executionHandler.ts` (DELETE)
- `apps/pc-optimizer/src/features/smart-optimization-ai/OptimizationExecutionCoordinator.ts` (DELETE)
- `apps/pc-optimizer/src/features/smart-optimization-ai/__tests__/SmartOptimization.test.ts` (update)
- `apps/pc-optimizer/src/features/smart-optimization-ai/__tests__/smartOptimizationRemediation.test.tsx` (NEW)

**Acceptance Criteria:**
- [ ] Smart Optimization uses `ResultsView` for remediation
- [ ] Smart Optimization execution routed through `scan_core.remediation.execute`
- [ ] Smart Optimization rollback routed through `scan_core.remediation.rollback`
- [ ] `executionHandler.ts` deleted
- [ ] `OptimizationExecutionCoordinator.ts` deleted
- [ ] 5-10 frontend tests pass
- [ ] `npx vitest run src/features/smart-optimization-ai/__tests__/` passes

**Risks:** Medium (UI changes, user-facing)

### Phase 4: Validation & Testing (1-2 days)

**Objective:** Run full validation suite and verify SC-8C10 baseline maintained

**Files Changed:**
- None (validation only)

**Acceptance Criteria:**
- [ ] `yarn typecheck` passes
- [ ] `yarn lint` passes (0 warnings)
- [ ] Frontend tests: 274+ passed
- [ ] Backend tests: 1251+ passed, 14 skipped
- [ ] `yarn build` passes
- [ ] Smart Optimization AI engine functional (plan, preview, simulation, insights)
- [ ] Smart Optimization remediation functional (prepare, validate, approve, execute, rollback)

**Risks:** Low (validation only)

### Phase 5: Documentation & Cleanup (1 day)

**Objective:** Document SC-8C11 completion and cleanup

**Files Changed:**
- `apps/pc-optimizer/SC8C11_COMPLETION_REPORT.md` (NEW)

**Acceptance Criteria:**
- [ ] SC-8C11 completion report created
- [ ] All implementation phases documented
- [ ] Validation results documented
- [ ] Known limitations documented
- [ ] SC-8C12 not started

**Risks:** None

---

## 14. Definition of Done

SC-8C11 is complete when:

- [ ] Smart Optimization rule adapters created and registered
- [ ] Smart Optimization findings converted to `scan_core` findings format
- [ ] Smart Optimization execution routed through `RemediationCoordinator`
- [ ] Smart Optimization rollback routed through `RemediationCoordinator`
- [ ] `executionHandler.ts` deleted
- [ ] `OptimizationExecutionCoordinator.ts` deleted
- [ ] Smart Optimization AI engine remains functional (plan, preview, simulation, insights)
- [ ] Smart Optimization UI preserves existing dashboard, preview, simulation, insights panels
- [ ] Smart Optimization uses `ResultsView` for remediation workflow
- [ ] All three modules (Protection, Security, Smart Optimization) use identical safety model
- [ ] Backend tests: 1251+ passed, 14 skipped
- [ ] Frontend tests: 274+ passed
- [ ] `yarn typecheck` passes
- [ ] `yarn lint` passes (0 warnings)
- [ ] `yarn build` passes
- [ ] No SC-8C10 security invariants violated
- [ ] No automatic remediation introduced
- [ ] No automatic resume introduced
- [ ] No automatic rollback introduced
- [ ] No new RPC methods created
- [ ] No `SafetyGate` weakening
- [ ] No `RemediationCoordinator` bypassing
- [ ] No `ExecutionLedger` bypassing
- [ ] No parallel execution system remaining
- [ ] SC-8C12 not started

---

## 15. Risks

### 15.1 Critical Risks

**None identified.**

### 15.2 High Risks

| Risk | Mitigation |
|------|-----------|
| Smart Optimization AI engine breaks during integration | Preserve AI engine as-is, only change execution routing. Add regression tests for plan generation, preview, simulation, insights. |
| Smart Optimization UI regresses during migration | Preserve existing dashboard, preview, simulation, insights panels. Only add `ResultsView` for remediation. Add visual regression tests. |

### 15.3 Medium Risks

| Risk | Mitigation |
|------|-----------|
| Smart Optimization action types incompatible with `scan_core` rule categories | Create adapter layer to map action types to rule categories. Add comprehensive mapping tests. |
| Smart Optimization execution performance degrades | Reuse existing executors (no new execution logic). Measure performance before/after. Optimize adapters if needed. |
| Smart Optimization tests break during migration | Update tests incrementally. Run tests after each file change. Preserve test coverage. |

### 15.4 Low Risks

| Risk | Mitigation |
|------|-----------|
| Smart Optimization findings format incompatible with `scan_core` | Create finding adapter. Add conversion tests. |
| Smart Optimization rollback incompatible with canonical rollback | Reuse existing rollback system. Add rollback tests. |

---

## 16. Final Recommendation

**READY_TO_IMPLEMENT**

### 16.1 Why Ready

**Sufficient Evidence:**
1. ✅ Smart Optimization already uses `ScanView` for scanning (line 214-220 of `SmartOptimizationPage.tsx`)
2. ✅ Smart Optimization has a parallel execution system (`executionHandler.ts`, `OptimizationExecutionCoordinator.ts`)
3. ✅ Canonical `scan_core.remediation.*` flow is production-ready (SC-8C10 verdict: READY)
4. ✅ `ResultsView` already supports all modules (Protection, Security)
5. ✅ `RemediationCoordinator` already supports all action types
6. ✅ `SafetyGate` already supports all action types
7. ✅ `DefaultExecutor` already supports all action types
8. ✅ Smart Optimization AI engine is self-contained (no dependencies on execution system)
9. ✅ Clear gap identified: parallel execution system bypasses canonical safety model
10. ✅ Clear integration path: create adapters, route execution through `RemediationCoordinator`, delete parallel system

**No Missing Decisions:**
- ✅ Objective is clear: integrate Smart Optimization remediation into canonical flow
- ✅ Scope is clear: adapters + routing changes, preserve AI engine
- ✅ Architecture is clear: reuse canonical flow, delete parallel system
- ✅ RPC contracts are clear: reuse existing `scan_core.remediation.*`
- ✅ Security requirements are clear: preserve SC-8C10 invariants
- ✅ Test strategy is clear: backend adapters + frontend integration + validation
- ✅ Implementation phases are clear: 5 phases, 6-10 days total

**Low Risk:**
- ✅ No architectural changes required
- ✅ No new RPC methods required
- ✅ No `SafetyGate` changes required
- ✅ No `RemediationCoordinator` changes required
- ✅ No `ScanOrchestrator` changes required
- ✅ Isolated changes (adapters, routing, UI)
- ✅ Incremental implementation (5 small phases)
- ✅ Comprehensive test coverage

**High Value:**
- ✅ Eliminates parallel execution system
- ✅ Unifies safety model across all three modules
- ✅ Adds SafetyGate validation to Smart Optimization
- ✅ Adds execution audit trail to Smart Optimization
- ✅ Adds duplicate prevention to Smart Optimization
- ✅ Adds rollback safety to Smart Optimization
- ✅ Preserves Smart Optimization AI engine
- ✅ Preserves Smart Optimization UI

### 16.2 Readiness Checklist

- [x] Objective defined
- [x] Scope defined (included/excluded)
- [x] Gap analysis complete
- [x] Architecture decision made
- [x] Feature definition complete
- [x] Security requirements defined
- [x] RPC contracts defined
- [x] Data/persistence requirements defined
- [x] UI/UX flow defined
- [x] Performance requirements defined
- [x] Test strategy defined
- [x] Validation commands defined
- [x] Implementation phases defined
- [x] Definition of Done defined
- [x] Risks identified and mitigated
- [x] No blocking decisions required
- [x] No architectural changes required
- [x] No new RPC methods required
- [x] Reuses existing canonical flow
- [x] Preserves SC-8C10 security invariants

**Verdict: READY_TO_IMPLEMENT**

---

**End of Specification**
