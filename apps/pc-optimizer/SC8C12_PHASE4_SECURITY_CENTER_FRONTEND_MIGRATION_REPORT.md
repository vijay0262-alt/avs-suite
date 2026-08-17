# SC-8C12 Phase 4 — Security Center Frontend Remediation Migration Report

## Summary

Phase 4 migrates the Security Center **user-facing remediation workflow** to the canonical `scan_core` remediation UI. Security Center detection, investigation, correlation, threat intelligence, false-positive tracking, configuration, reporting, and non-remediation UI remain intact. Only the remediation handoff/execution workflow is migrated.

The final production flow is:

```
Security Center detection
        ↓
Security Center remediation candidates (legacy RemediationPlan, planning-only)
        ↓
useSecurityRemediationPlan → scan_core.security_remediation.plan RPC
        ↓
backend-generated plan_id
        ↓
PlanReviewView (canonical)
        ↓
ResultsView (canonical)
        ↓
prepare → validate → explicit "Approve & Fix" → execute → progress
        ↓
completed / partial / failed / cancelled
        ↓
optional rollback (via scan_core.remediation.rollback)
```

---

## Files Inspected

### Security Center frontend
- `apps/pc-optimizer/src/features/security-dashboard/SecurityCenterPage.tsx` — main page with 7 tabs (Overview, Scan, Threats, Investigation, Remediation, Reports, Settings)
- `apps/pc-optimizer/src/features/security-dashboard/SecurityCenterViewModel.ts` — ViewModel managing all Security Center state
- `apps/pc-optimizer/src/features/security-dashboard/SecurityCenterService.ts` — facade wrapping SecurityEngine, ThreatInvestigationEngine, ThreatRemediationEngine
- `apps/pc-optimizer/src/features/security-remediation/types.ts` — RemediationAction, RemediationPlan, RemediationTarget types
- `apps/pc-optimizer/src/features/security-remediation/ThreatRemediationPlanner.ts` — legacy planner (planning-only, creates candidate plans)

### Smart Optimization reference pattern (SC-8C11)
- `apps/pc-optimizer/src/features/scan/useSmartOptimizationPlan.ts` — reference hook
- `apps/pc-optimizer/src/features/scan/scan.service.ts` — RPC bridge
- `apps/pc-optimizer/src/features/scan/PlanReviewView.tsx` — canonical plan review
- `apps/pc-optimizer/src/features/scan/ResultsView.tsx` — canonical results/execution
- `apps/pc-optimizer/src/features/scan/usePlanDetails.ts` — plan hydration
- `apps/pc-optimizer/src/features/scan/useResults.ts` — execution flow
- `apps/pc-optimizer/src/features/smart-optimization-ai/SmartOptimizationPage.tsx` — reference integration
- `apps/pc-optimizer/src/features/scan/__tests__/smartOptimizationPlan.test.ts` — reference tests

### Shared RPC constants
- `packages/shared/src/rpc/index.ts` — RPC method name registry

---

## Current Security Center Remediation Architecture (Pre-Phase 4)

The Security Center used a **legacy frontend-only remediation system**:

```
Investigation tab
    ↓ vm.createRemediationPlan(investigationId)
ThreatRemediationPlanner.createPlan() (frontend, planning-only)
    ↓ RemediationPlan (frontend object, not persisted)
RemediationTab → PlanCard
    ↓ vm.approvePlan(planId)     ← legacy ThreatApprovalManager
    ↓ vm.executePlan(planId)     ← legacy ThreatRemediationEngine.executePlan()
    ↓ vm.rollbackAction(actionId) ← legacy ThreatRollbackManager
    ↓ vm.restoreFromQuarantine() ← legacy ThreatQuarantineManager
```

**Problems:**
- Execution occurred entirely in the frontend via `ThreatRemediationEngine`
- No backend persistence, no canonical `ActionPlan`, no `plan_id`
- No `SafetyGate`, no typed preconditions, no capability contracts
- Bypassed the canonical `scan_core.remediation.*` flow
- Quarantine was a frontend-only concept

---

## Frontend Integration Point Selected

The integration follows the **SC-8C11 Smart Optimization pattern**, adapted to the Security Center domain:

1. **Investigation tab** creates a candidate `RemediationPlan` via `vm.createRemediationPlan()` (planning-only, no execution)
2. **Remediation tab** displays the candidate plan as a `PlanCard`
3. User clicks **"Review & Fix"** on the PlanCard
4. `useSecurityRemediationPlan.createPlan()` serializes the actions and calls `scan_core.security_remediation.plan`
5. Backend generates a canonical `ActionPlan` with a `plan_id`
6. `PlanReviewView` hydrates from the `plan_id` via `scan_core.scan.plan_details`
7. User proceeds through the canonical `ResultsView` flow

The `RemediationTab` also has a top-level **"Review & Fix Threats"** button that creates a canonical plan from the most recent legacy plan.

---

## Plan Creation Flow

### Hook: `useSecurityRemediationPlan`

File: `apps/pc-optimizer/src/features/scan/useSecurityRemediationPlan.ts`

```
Security Center RemediationAction[]
    ↓ securityActionToRpcPayload() (privacy-safe serialization)
    ↓ useSecurityRemediationPlan.createPlan()
    ↓ scanService.security_remediation_plan()
    ↓ RPC: scan_core.security_remediation.plan
    ↓ backend: SecurityRemediationAdapter → SecurityRemediationPlanBuilder → ActionPlanRepository
    ↓ response: { ok, plan_id, total_actions, auto_fixable, ... }
    ↓ planId state
    ↓ PlanReviewView
```

### Concurrency guard

A `useRef(false)` guard prevents duplicate plan creation from double-clicks or rapid re-submissions. The second call returns `null` while the first is pending.

### Privacy-safe payload serialization

File: `apps/pc-optimizer/src/features/security-dashboard/SecurityCenterPage.tsx` — `securityActionToRpcPayload()`

Sends only:
- `id`, `type`, `threatId`, `title`, `description`, `reason`
- `confidence`, `severity`, `category`
- `sourceModule`, `sourceFindingId`, `rollbackAvailable`
- `target.type`, `target.path`, `target.name`

Does **NOT** send:
- `canonical_path`
- `asset_id`
- `backup_location`
- `quarantine_path`
- registry keys (beyond the affected asset path required for planning)
- browser profile paths
- raw evidence
- executable commands
- PowerShell / shell commands
- internal target payloads

The `target.path` is the **affected asset path** from threat detection (e.g., `C:\Users\Public\suspicious.exe`), which the backend adapter genuinely requires to construct a canonical `FilesystemActionTarget` / `RegistryActionTarget` / `StartupActionTarget`. This is not an internal backup or quarantine location.

---

## Plan Hydration Flow

After receiving `plan_id`:

1. `securityPlan.planId` is set in `RemediationTab` or `PlanCard`
2. The component renders `PlanReviewView` with `planId={securityPlan.planId}` and `module="security"`
3. `PlanReviewView` calls `usePlanDetails(planId)` which calls `scan_core.scan.plan_details`
4. The backend returns sanitized plan metadata (findings, statistics, stale flag)
5. `ResultsView` renders with the hydrated findings
6. User proceeds through the canonical flow

No Security-specific `ResultsView` was created. The existing canonical `ResultsView` is reused.

---

## Canonical ResultsView Integration

The `ResultsView` component is the authority for remediation state. It uses:
- `useResults` hook for the prepare → validate → approve → execute → status → rollback flow
- `remediationService` for `scan_core.remediation.*` RPCs
- Existing concurrency guards for prepare/validate/execute/rollback/polling

The Security Center does **NOT**:
- Create a Security-specific ResultsView
- Duplicate finding selection, preview, validation, approval, execution, progress, terminal state, or rollback
- Call `scan_core.remediation.*` RPCs directly
- Store remediation state in localStorage/sessionStorage/IndexedDB

---

## Quarantine UX

The canonical backend mapping (Phase 2/3) is:

```
quarantine → ActionType.DELETE_FILE
             backup_required=true
             rollback_supported=true
```

The UI:
- Uses safe display names via `affected_targets.display_name` (existing sanitized behavior)
- Does **NOT** expose backup/quarantine paths to the user
- Does **NOT** build a Security-specific quarantine execution mechanism
- Uses `scan_core.remediation.rollback` through the existing canonical `ResultsView` workflow for restoration

The legacy quarantine summary display (read-only stats: active quarantined items, restored, deleted) remains in the RemediationTab for informational purposes. No quarantine execution/restore/delete buttons remain in the production UI.

---

## Approval Flow

Approval is **explicit** and occurs only through the canonical `ResultsView`:

1. User reviews findings in `ResultsView`
2. User clicks "Prepare" → `scan_core.remediation.prepare`
3. User clicks "Validate" → `scan_core.remediation.validate`
4. User explicitly clicks "Approve & Fix" → this is the only approval mechanism
5. Execution proceeds via `scan_core.remediation.execute`

No auto-approval exists. No approval occurs during:
- Page mount
- Scan completion
- Plan creation
- Plan hydration
- Navigation
- Threat detection
- Threat selection

---

## Execution Flow

Execution occurs **only** through `scan_core.remediation.execute` via the existing `ResultsView`/`useResults` workflow.

The Security Center production UI does **NOT** call:
- `security.remediation.execute`
- `security.quarantine.*`
- `ThreatRemediationEngine.executePlan()`
- `ThreatApprovalManager.approve()`
- `ThreatRollbackManager.rollback()`
- `ThreatQuarantineManager`
- `ThreatRestoreManager`
- `ThreatDeletionManager`

---

## Rollback Flow

Rollback occurs **only** through `scan_core.remediation.rollback` via the existing `ResultsView`/`useResults` workflow.

- Rollback requires explicit user confirmation
- No auto-rollback exists
- The legacy `vm.rollbackAction()` and `vm.restoreFromQuarantine()` methods are no longer called from the production UI

---

## Privacy Audit

### RPC payload (frontend → backend)

The `securityActionToRpcPayload()` function sends only the minimum fields required by the backend adapter. Verified fields NOT sent:
- `canonical_path` — not sent
- `asset_id` — not sent
- `backup_location` — not sent
- `quarantine_path` — not sent
- executable commands / PowerShell / shell commands — not sent
- raw evidence — not sent
- browser profile paths — not sent (only `target.path` which is the affected asset path)

### RPC response (backend → frontend)

The `SecurityRemediationPlanResponse` contains only:
- `ok`, `plan_id`, `total_actions`, `auto_fixable`, `review_required`, `not_fixable`
- `estimated_affected_size`
- `statistics: { converted, unsupported, errors }`
- `error`

The response does **NOT** expose:
- canonical filesystem paths
- registry keys
- browser profiles
- raw asset IDs
- backup locations
- target internals
- full plan contents

Full plan contents are available only through the existing controlled `scan_core.scan.plan_details` path.

### Test verification

Phase 4 tests verify:
- No `canonical_path` in payload
- No `asset_id` in payload
- No `backup_location` in payload
- No `quarantine_path` in payload
- No PowerShell/reg.exe/cmd.exe/subprocess in payload
- No sensitive data in response

---

## Concurrency Audit

### Plan creation
- `useSecurityRemediationPlan` uses `useRef(false)` guard (`isCreatingRef`)
- Second call during pending creation returns `null`
- `reset()` is blocked during creation

### Prepare/validate/execute/rollback/polling
- Reuses existing guards from `useResults` (not modified)
- No duplicate execution pathways introduced
- One user action results in at most one corresponding backend request

---

## Legacy Execution Search

### SecurityCenterPage.tsx (production UI)

Searched for: `vm.executePlan`, `vm.approvePlan`, `vm.rejectPlan`, `vm.rollbackAction`, `vm.restoreFromQuarantine`, `vm.deleteFromQuarantine`

**Result: 0 matches** (all removed in Phase 4)

The only remaining `vm.createRemediationPlan()` calls are in the Investigation tab — these create **candidate plans** (planning-only, no execution). The candidate plan is then converted to a canonical plan via "Review & Fix".

### SecurityCenterService.ts (service layer)

`ThreatRemediationEngine` is still instantiated (lines 37, 76, 85). This is intentional for Phase 4:
- `getAllPlans()` — read-only plan listing (used by RemediationTab)
- `getQuarantineSummary()` — read-only quarantine stats
- `generateRemediationReport()` — report generation
- `markFalsePositive()` — false-positive tracking (non-remediation)

The **production UI execution path** no longer reaches `ThreatRemediationEngine.executePlan()`, `ThreatApprovalManager.approve()`, `ThreatRollbackManager.rollback()`, `ThreatQuarantineManager`, `ThreatRestoreManager`, or `ThreatDeletionManager`.

### SecurityCenterViewModel.ts (ViewModel)

The following methods remain on the ViewModel but are **no longer called from the production UI**:
- `approvePlan()` — not called from SecurityCenterPage
- `rejectPlan()` — not called from SecurityCenterPage
- `executePlan()` — not called from SecurityCenterPage
- `rollbackAction()` — not called from SecurityCenterPage
- `restoreFromQuarantine()` — not called from SecurityCenterPage
- `deleteFromQuarantine()` — not called from SecurityCenterPage

These remain for Phase 5 final legacy disconnection and cleanup.

### Classification of remaining legacy references

| Reference | Location | Classification |
|-----------|----------|----------------|
| `ThreatRemediationEngine` import/instantiation | SecurityCenterService.ts | Production read-only/domain functionality (plan listing, quarantine summary, reports) |
| `ThreatRemediationEngine` docstring mention | SecurityCenterPage.tsx line 1654 | Documentation (comment explaining what was replaced) |
| `vm.createRemediationPlan()` | SecurityCenterPage.tsx Investigation tab | Production planning-only (creates candidate plan, no execution) |
| `vm.approvePlan/rejectPlan/executePlan/rollbackAction` | SecurityCenterViewModel.ts | Dead code from UI perspective (not called from production UI) |
| `ThreatRemediationPlanner` | security-remediation/ | Production planning-only (creates candidate plans) |

**Category 1 (production execution path): 0 occurrences** — the production remediation execution path no longer reaches any legacy Security Center execution system.

---

## Security Search

Searched Security Center frontend production code for:
- `child_process` — 0 matches
- `subprocess` — 0 matches
- `PowerShell` — 2 matches (both docstring/UI text, not execution calls)
- `reg.exe` — 0 matches
- `fs.unlink` — 0 matches
- `fs.rm` — 0 matches
- `fs.writeFile` — 0 matches
- `shutil` — 0 matches
- `os.remove` — 0 matches
- `process.kill` — 0 matches
- `process.terminate` — 0 matches

**Result: No direct destructive APIs in Security Center frontend.**

---

## Test Coverage

### Phase 4 tests

File: `apps/pc-optimizer/src/features/scan/__tests__/securityRemediationPlan.test.ts`

35 tests covering:

1. **Hook creation** — creates plan and returns `plan_id` on success
2. **Successful plan creation** — `planId` set, `error` null, `isCreating` false
3. **Missing `plan_id` handling** — returns null, sets error
4. **RPC failure** — handles `ok: false` with error message
5. **Network error** — handles thrown error
6. **Duplicate plan creation prevention** — concurrency guard returns null for second call
7. **Empty action handling** — rejects empty array, does not call RPC
8. **Privacy-safe RPC payload** — no `canonical_path`, `asset_id`, `backup_location`, `quarantine_path`, PowerShell, reg.exe, cmd.exe, subprocess
9. **`planId` handoff** — null initially, set after success, null after reset, null on failure, never fabricated
10. **RPC constant** — `SCAN_CORE_SECURITY_REMEDIATION_PLAN` defined correctly
11. **Scan service** — calls correct RPC method with actions
12. **No legacy execution calls** — does not call `security.remediation.execute`, `security.quarantine.*`, `scan_core.remediation.execute/prepare/validate/rollback`
13. **No auto-execution** — only calls plan RPC, never execution RPCs, no auto-execution after plan creation
14. **No localStorage/sessionStorage** — does not store remediation state in browser storage
15. **Error states** — null initially, set on failure, cleared on retry, cleared on reset
16. **Concurrency** — `isCreating` true during creation, reset blocked during creation
17. **Response statistics** — exposes `statistics.converted/unsupported/errors`

---

## Validation Results

### Phase 4 tests
```
35 passed in 4.86s
```

### Security Center + Smart Optimization + SC-8C10 Phase 3 tests
```
132 passed in 6.39s
```

### Backend regression (Phase 2 adapter + Phase 3 integration + SC-8C11 adapter/integration)
```
193 passed in 45.74s
```

### Typecheck
```
tsc -p tsconfig.json --noEmit && tsc -p electron/tsconfig.json --noEmit
Exit code: 0
```

### Lint
```
eslint "{src,electron}/**/*.{ts,tsx}" --max-warnings=0
Exit code: 0
```

### Production build
```
vite build
✓ built in 12.16s
Exit code: 0
```

### Full frontend test suite
```
117 test files passed
8009 tests passed
Duration: 51.72s
```

### Full backend test suite
```
1444 passed, 14 skipped in 518.36s (0:08:38)
```

---

## Remaining Legacy References

The following legacy references remain intentionally for Phase 5 final disconnection/cleanup:

1. **`SecurityCenterService`** still instantiates `ThreatRemediationEngine` for:
   - Read-only plan listing (`getAllPlans`, `getPlan`)
   - Read-only quarantine summary (`getQuarantineSummary`)
   - Report generation (`generateRemediationReport`)
   - False-positive marking (`markFalsePositive`) — non-remediation

2. **`SecurityCenterViewModel`** retains `approvePlan()`, `rejectPlan()`, `executePlan()`, `rollbackAction()`, `restoreFromQuarantine()`, `deleteFromQuarantine()` methods — these are **dead code from the UI perspective** (not called from `SecurityCenterPage`).

3. **`ThreatRemediationPlanner`** remains in use for creating candidate plans (planning-only, no execution).

4. **Legacy `security-remediation/` backend classes** (`ThreatRemediationEngine`, `ThreatApprovalManager`, `ThreatRollbackManager`, `ThreatQuarantineManager`, `ThreatRestoreManager`, `ThreatDeletionManager`, `ThreatSafetyValidator`) remain for test compatibility.

**Phase 5** is responsible for final legacy disconnection and cleanup.

---

## Architectural / Product Gaps

1. **Candidate plan creation still uses legacy planner** — The Investigation tab creates candidate plans via `ThreatRemediationPlanner` (frontend, planning-only). This is the intended Phase 4 behavior: the candidate plan is a UI artifact that gets converted to a canonical plan via "Review & Fix". A future phase could potentially skip the candidate plan and go directly from threats to `scan_core.security_remediation.plan`.

2. **Quarantine summary is read-only** — The RemediationTab displays quarantine stats (active, restored, deleted, total size) from the legacy `ThreatRemediationEngine`/backend. This is informational only. No quarantine execution/restore/delete buttons remain in the production UI. A future phase could migrate the quarantine summary to a canonical backend RPC.

3. **Legacy `SecurityCenterViewModel` methods** — `approvePlan`, `rejectPlan`, `executePlan`, `rollbackAction`, `restoreFromQuarantine`, `deleteFromQuarantine` remain on the ViewModel but are unreachable from the production UI. Phase 5 should remove them.

---

## Files Modified

### Created
1. `apps/pc-optimizer/src/features/scan/useSecurityRemediationPlan.ts` — new hook (87 lines)
2. `apps/pc-optimizer/src/features/scan/__tests__/securityRemediationPlan.test.ts` — Phase 4 tests (668 lines, 35 tests)
3. `apps/pc-optimizer/SC8C12_PHASE4_SECURITY_CENTER_FRONTEND_MIGRATION_REPORT.md` — this report

### Modified
1. `packages/shared/src/rpc/index.ts` — added `SCAN_CORE_SECURITY_REMEDIATION_PLAN` constant
2. `apps/pc-optimizer/src/features/scan/scan.service.ts` — added `SecurityRemediationPlanResponse` type and `security_remediation_plan()` method
3. `apps/pc-optimizer/src/features/scan/index.ts` — exported `useSecurityRemediationPlan` and its return type
4. `apps/pc-optimizer/src/features/security-dashboard/SecurityCenterPage.tsx` — added canonical handoff:
   - Imported `PlanReviewView`, `useSecurityRemediationPlan`, `useCallback`
   - Added `securityActionToRpcPayload()` privacy-safe serializer
   - Modified `RemediationTab` to add "Review & Fix Threats" button and `PlanReviewView` handoff
   - Modified `PlanCard` to replace legacy Approve/Reject/Execute/Undo buttons with canonical "Review & Fix" button and `PlanReviewView` handoff
   - Removed all `vm.executePlan`, `vm.approvePlan`, `vm.rejectPlan`, `vm.rollbackAction`, `vm.restoreFromQuarantine`, `vm.deleteFromQuarantine` calls

### NOT modified
- `scan_core` internals — NOT modified
- `ActionType` — NOT modified
- `SafetyGate` — NOT modified
- `RemediationCoordinator` — NOT modified
- `DefaultExecutor` — NOT modified
- Target executors — NOT modified
- `SecurityCenterViewModel.ts` — NOT modified (legacy methods remain for Phase 5)
- `SecurityCenterService.ts` — NOT modified (legacy engine remains for read-only functionality)
- `BackgroundCleanupService` — NOT modified
- Dashboard One-Click Optimize — NOT modified
- Module-level cleaners — NOT modified

---

## Confirmations

- **No new remediation engine was created.** The Phase 4 work is a frontend migration that routes the Security Center remediation workflow through the existing canonical `scan_core.remediation.*` flow. No new execution mechanism, approval engine, or rollback engine was created.
- **No `scan_core` internals were modified.** The backend changes in Phase 3 (already complete) added the `scan_core.security_remediation.plan` RPC. Phase 4 only adds frontend code that calls this existing RPC.
- **No `SafetyGate` was modified.** The `SafetyGate` remains backend-authoritative and is not bypassed.
- **No `RemediationCoordinator` was modified.** The existing coordinator handles prepare/validate/execute/rollback.
- **No target executors were modified.** `FilesystemExecutor`, `RegistryExecutor`, etc. remain unchanged.
- **No new `ActionType` was added.** Quarantine remains `DELETE_FILE` with backup and rollback metadata.
- **Phase 5 was NOT started.** Legacy backend files remain for test compatibility. Final legacy disconnection/cleanup is Phase 5's responsibility.
- **SC-8C13 was NOT started.**
- **Frontend was modified only in the Security Center remediation path.** Detection, investigation, correlation, threat intelligence, false-positive tracking, configuration, reporting, and non-remediation UI remain intact.
- **No execution path was introduced.** The new hook and integration code contain zero execution calls. All execution occurs through the existing canonical `ResultsView`/`useResults` workflow.
- **Privacy boundaries remain intact.** The RPC payload sends only the minimum fields required by the backend adapter. The response exposes only sanitized plan metadata.
- **Concurrency guards remain intact.** Plan creation uses a ref guard. Prepare/validate/execute/rollback reuse existing guards from `useResults`.
- **No localStorage/sessionStorage remediation state.** The hook uses React state only. No approval tokens, execution IDs, backup locations, or quarantine paths are stored in browser storage.
