# SC-8C13 Phase 3 — Dashboard Frontend Canonical Remediation Migration Report

## 1. Objective

Migrate the Dashboard One-Click Optimize frontend from its existing parallel execution path to the canonical SC-8C8/SC-8C9 remediation workflow.

Target architecture:

```
Dashboard
    ↓
"Review & Optimize" button
    ↓
dashboard.optimize.preview (read-only analysis)
    ↓
dashboardPreviewToRpcPayload (privacy-safe serializer)
    ↓
scan_core.dashboard_optimization.plan
    ↓
backend-generated plan_id
    ↓
PlanReviewView
    ↓
ResultsView
    ↓
prepare
    ↓
validate
    ↓
explicit "Approve & Fix"
    ↓
scan_core.remediation.execute
    ↓
progress
    ↓
terminal
    ↓
optional rollback
```

The frontend MUST NOT execute optimization operations directly.

---

## 2. Previous Dashboard Execution Flow

### Before SC-8C13 Phase 3

```
DashboardPageV2
→ "Optimize Now" button
→ navigate('/ai-smart-optimize')  (Smart Optimization page — already canonical via SC-8C11)
```

Parallel legacy path (disconnected from DashboardPageV2 but still present):

```
DashboardViewModel.openOptimizePreview()
→ dashboardService.getOptimizePreview()
→ DashboardViewModel.advanceToOptimizeConfirm()
→ DashboardViewModel.executeOptimize()
→ dashboardService.executeOptimize()
→ dashboard.optimize.execute RPC (DESTRUCTIVE)
  → _clean_temp_files()
  → empty_recycle_bin()
  → _clean_browser_cache()
  → _clean_thumbnail_cache()
  → _clean_prefetch()
  → _clean_windows_update_cache()
  → _flush_dns() (subprocess: ipconfig /flushdns)
  → _trim_memory() (optimize_memory)
```

### Security concerns

- `DashboardViewModel.executeOptimize()` called `dashboardService.executeOptimize()` which invoked the destructive `dashboard.optimize.execute` RPC
- `DashboardViewModel.advanceToOptimizeConfirm()` triggered `executeOptimize()` directly
- `OneClickOptimize.tsx` component offered a "Optimize Now" button that implied automatic execution
- No `ActionPlan` creation, no `plan_id`, no `SafetyGate`, no `RemediationCoordinator`
- No canonical rollback, no `ExecutionLedger`, no `ExecutionRepository`

---

## 3. New Canonical Flow

### After SC-8C13 Phase 3

```
DashboardPageV2
→ "Review & Optimize" button (data-testid="dashboard-review-optimize-btn")
→ handleReviewOptimize()
→ dashboardService.getOptimizePreview() (read-only)
→ dashboardPreviewToRpcPayload(preview.actions) (privacy-safe serializer)
→ useDashboardOptimizationPlan.createPlan(payload)
→ scan_core.dashboard_optimization.plan RPC
→ backend-generated plan_id
→ PlanReviewView (planId, module="optimize")
→ ResultsView (canonical prepare → validate → approve → execute → rollback)
```

The "Optimize Now" button (navigating to `/ai-smart-optimize`) is retained as a secondary action with `variant="secondary"`, providing access to the AI Smart Optimization page (already canonical via SC-8C11).

### What the frontend does NOT do

- NEVER calls `dashboard.optimize.execute`
- NEVER calls `orchestrator.optimize`
- NEVER calls `dashboardService.executeOptimize()`
- NEVER constructs an `ActionPlan`
- NEVER calculates actionability/safety classification
- NEVER executes remediation directly
- NEVER stores `planId` in localStorage/sessionStorage/IndexedDB

---

## 4. Hook Implementation

### File: `src/features/scan/useDashboardOptimizationPlan.ts`

Follows the exact pattern of `useSmartOptimizationPlan.ts` (SC-8C11) and `useSecurityRemediationPlan.ts` (SC-8C12).

### API

```typescript
interface UseDashboardOptimizationPlanReturn {
  planId: string | null;
  isCreating: boolean;
  error: string | null;
  response: DashboardOptimizationPlanResponse | null;
  createPlan: (actions: Record<string, unknown>[]) => Promise<string | null>;
  reset: () => void;
}
```

### Behavior

- Calls `scanService.dashboard_optimization_plan(actions)` which invokes `scan_core.dashboard_optimization.plan` RPC
- Uses the existing shared RPC constant `RPC_METHODS.SCAN_CORE_DASHBOARD_OPTIMIZATION_PLAN`
- Returns `planId` on success
- Exposes `isCreating` loading state
- Exposes `error` state
- Includes `isCreatingRef` ref-based concurrency protection
- Prevents duplicate plan creation on rapid clicks
- `reset()` cleanly clears state after leaving PlanReviewView
- Never executes remediation
- If response is `ok: false` or missing `plan_id`: does not fabricate `planId`, remains in safe error state, does not navigate to ResultsView

---

## 5. Payload/Privacy Contract

### File: `src/features/dashboard/dashboardOptimizationSerializer.ts`

### Serializer: `dashboardPreviewActionToRpcPayload(action, index)`

Converts Dashboard Optimize preview actions (with human-readable `name` field) into the backend format (with `type` field).

### Name → Type mapping

| Preview `name` | Backend `type` | Supported |
|---|---|---|
| "Temporary Files" | `clean_temp_files` | YES |
| "Recycle Bin" | `empty_recycle_bin` | YES |
| "Browser Cache" | `clean_browser_cache` | YES |
| "Thumbnail Cache" | `clean_thumbnail_cache` | YES |
| "Prefetch Files" | `clean_prefetch` | YES |
| "Windows Update Cache" | `clean_windows_update_cache` | YES |
| "Flush DNS" | `flush_dns` | NO (NOT_FIXABLE) |
| "Memory Trim" | `trim_memory` | NO (NOT_FIXABLE) |
| Unknown | `unknown` | NO (NOT_FIXABLE) |

### Fields sent to RPC

```json
{
  "id": "dashboard_opt_clean_temp_files_0",
  "type": "clean_temp_files",
  "title": "Temporary Files",
  "description": "Windows and user temporary files",
  "size": 123456789,
  "rollbackAvailable": false
}
```

### Fields NEVER sent

- `canonical_path`
- `asset_id`
- `backup_location`
- `registry_key` / registry keys
- `browser_profile` / browser profile paths
- `quarantine_path`
- `executable` / executable commands
- `command` / shell commands
- `PowerShell` / `reg.exe` / `cmd.exe` / `subprocess`
- raw evidence
- internal target payloads
- sensitive machine information

### Privacy regression tests

The test suite includes explicit assertions proving:
- `canonical_path` is not in payload
- `asset_id` is not in payload
- `backup_location` is not in payload
- Registry keys (`HKCU`, `HKLM`, `registry_key`) are not in payload
- Browser profile paths are not in payload
- `PowerShell`, `reg.exe`, `cmd.exe`, `subprocess` are not in payload
- Response does not expose sensitive data

---

## 6. Dashboard UX Changes

### DashboardPageV2 above-the-fold section

**Before:**
- Single "Optimize Now" button → navigates to `/ai-smart-optimize`

**After:**
- Primary "Review & Optimize" button (`data-testid="dashboard-review-optimize-btn"`) → creates canonical plan → PlanReviewView
- Secondary "Optimize Now" button (`variant="secondary"`) → navigates to `/ai-smart-optimize` (Smart Optimization page, already canonical)

### Button states

| State | Label | Icon |
|---|---|---|
| Idle | "Review & Optimize" | SparklesIcon |
| Analyzing | "Analyzing..." | ArrowPathIcon (spinning) |
| Creating plan | "Creating Plan..." | ArrowPathIcon (spinning) |
| Disabled (scanning) | "Review & Optimize" | SparklesIcon |

### Error display

Plan creation errors and preview errors are shown in a danger-toned banner (`data-testid="dashboard-opt-plan-error"`).

### PlanReviewView handoff

When `dashPlan.planId` is set, the entire Dashboard page is replaced with:

```tsx
<PlanReviewView planId={dashPlan.planId} module="optimize" onClose={handlePlanClose} />
```

The user reviews the plan, proceeds through prepare → validate → approve → execute → rollback, and returns to the Dashboard via `handlePlanClose` which calls `dashPlan.reset()`.

---

## 7. PlanReviewView Integration

### Usage

```tsx
import { PlanReviewView, useDashboardOptimizationPlan } from '../scan';

const dashPlan = useDashboardOptimizationPlan();

if (dashPlan.planId) {
  return <PlanReviewView planId={dashPlan.planId} module="optimize" onClose={handlePlanClose} />;
}
```

### What PlanReviewView does (existing, unchanged)

- Loads plan details read-only from `scan_core` via `usePlanDetails`
- Shows plan summary, actions, findings
- Provides "Prepare" → "Validate" → "Approve & Fix" → "Execute" → "Progress" → "Terminal" → "Rollback" flow
- Uses `ResultsView` for the remediation execution UI
- Uses `remediationService` for all RPC calls
- Backend-authoritative throughout

### What was NOT created

- No Dashboard-specific Results UI
- No Dashboard-specific approval system
- No Dashboard-specific execution handler
- No Dashboard-specific rollback system
- No duplicate remediation logic

---

## 8. ResultsView Integration

ResultsView is the canonical remediation UI, used unchanged. The Dashboard hands off to PlanReviewView which internally uses ResultsView for the prepare → validate → approve → execute → progress → terminal → rollback flow.

No ResultsView modifications were made.

---

## 9. Legacy Execution Disconnection

### DashboardViewModel changes

| Method | Before | After |
|---|---|---|
| `openOptimizePreview()` | Fetches preview, sets state | **Unchanged** (still fetches preview — read-only) |
| `advanceToOptimizeConfirm()` | Calls `executeOptimize()` | **No-op** (deprecated, returns immediately) |
| `executeOptimize()` | Calls `dashboardService.executeOptimize()` (DESTRUCTIVE) | **No-op** (deprecated, returns immediately) |
| `cancelOptimizeFlow()` | Resets state | **Unchanged** |
| `closeOptimizeResult()` | Resets state | **Unchanged** |

### OneClickOptimize.tsx changes

| Element | Before | After |
|---|---|---|
| Card title | "One Click Optimize" | "One Click Optimize" (retained) |
| Button label (idle) | "Optimize Now" | "Review & Optimize" |
| Button aria-label | "Start system optimization" | "Review system optimization opportunities" |
| Modal title (preview) | "One Click Optimize" | "Review Optimization" |
| Confirm button label | "Optimize Now" | "Review & Optimize" |
| Confirm button aria-label | "Confirm and start optimization" | "Review and create optimization plan" |
| Actions section label | "Actions to perform" | "Actions to review" |
| Description text | "Optimize your system with a single click..." | "Review optimization opportunities..." |

### dashboard.service.ts

- `executeOptimize` method **retained** in the service interface and implementation for backward compatibility
- Phase 5 owns final removal of the legacy `dashboard.optimize.execute` RPC
- The method is no longer called from production UI (DashboardViewModel.executeOptimize is a no-op)

### What was NOT deleted

- `dashboard.optimize.execute` backend RPC (retained, Phase 5 owns deletion)
- `dashboardService.executeOptimize` service method (retained, disconnected from production UI)
- `DashboardViewModel.executeOptimize` method (retained as no-op, deprecated)
- `OneClickOptimize.tsx` component (retained, labels changed to non-destructive)

---

## 10. Unsupported Operation Handling

### Flush DNS and Trim Memory

Phase 2 classified these as `OUT_OF_SCOPE` / `NOT_FIXABLE`:

| Operation | ActionType | Executor | Classification |
|---|---|---|---|
| `flush_dns` | `NONE` | NONE | `NOT_FIXABLE` |
| `trim_memory` | `NONE` | NONE | `NOT_FIXABLE` |

### Frontend behavior

- The serializer maps "Flush DNS" → `flush_dns` type and "Memory Trim" → `trim_memory` type
- These are included in the RPC payload so the backend can classify them as `NOT_FIXABLE`
- The backend adapter marks them as `ActionState.NOT_FIXABLE`, `is_actionable=False`, `is_fixable=False`
- They appear in PlanReviewView as non-executable review items
- They are NOT presented as executable remediation actions
- The user cannot approve/execute them through the canonical flow
- No frontend workaround was invented — backend-authoritative classification is respected

---

## 11. Concurrency Protection

### useDashboardOptimizationPlan

- `isCreatingRef` (useRef) prevents duplicate plan creation from double-clicks
- If `createPlan` is called while `isCreatingRef.current === true`, it returns `null` immediately
- The ref is cleared in the `finally` block

### DashboardPageV2

- The "Review & Optimize" button is disabled when `dashPlan.isCreating || optimizePreviewLoading`
- `handleReviewOptimize` checks `dashPlan.isCreating` before proceeding

### Existing canonical guards (unchanged)

- `prepare`, `validate`, `execute`, `rollback`, `polling` guards remain authoritative in PlanReviewView/ResultsView
- No second execution guard system was created

---

## 12. Storage/Persistence Behavior

### What is NOT stored

- `planId` — NOT stored in localStorage, sessionStorage, or IndexedDB
- Approval token — NOT stored in browser storage
- Execution ID — NOT stored in browser storage
- Remediation state — NOT stored in browser storage

### What IS used

- React state (`useState`) for `optimizePreviewLoading`, `optimizePreviewError`
- `useDashboardOptimizationPlan` hook state (`planId`, `isCreating`, `error`, `response`)
- Backend persistence through `ActionPlanRepository` (backend-authoritative)

### Existing localStorage usage (unchanged, NOT remediation state)

- `DashboardViewModel` uses `localStorage.getItem('avs-developer-mode')` for developer mode toggle
- This is NOT remediation state — it's a UI preference
- No new persistence was introduced

---

## 13. Tests

### Focused Phase 3 tests

**File:** `src/features/scan/__tests__/dashboardOptimizationPlan.test.ts`
**Test count:** 55 tests

| Category | Tests | Count |
|---|---|---|
| Hook: plan creation | creates plan, calls correct RPC, handles missing plan_id, handles RPC failure, handles network error, rejects empty actions | 6 |
| Hook: concurrency | prevents duplicate plan creation | 1 |
| Hook: reset | clears planId and error | 1 |
| Hook: response | exposes response with statistics | 1 |
| Scan service | calls correct RPC method | 1 |
| RPC constant | is defined correctly | 1 |
| Serializer: name → type mapping | 7 supported + 1 unsupported + 1 unknown | 9 |
| Serializer: fields | stable ID, title/description/size, rollbackAvailable=false | 3 |
| Serializer: batch | converts all, preserves order | 2 |
| Privacy | no canonical_path, no asset_id, no backup_location, no registry keys, no browser profiles, no PowerShell/commands, serializer no sensitive fields, response no sensitive data | 8 |
| No legacy execution | no dashboard.optimize.execute, no orchestrator.optimize, no scan_core.remediation.execute | 3 |
| No auto-execution | only calls plan RPC, no auto-execute after creation | 2 |
| No browser storage | no localStorage, no sessionStorage | 2 |
| PlanId handoff | null initially, set on success, null after reset, null on failure, never fabricates | 5 |
| Error states | null initially, set on failure, cleared on retry, cleared on reset | 4 |
| Unsupported actions | flush_dns in payload, response reports not_fixable, serializer maps Flush DNS, getDashboardActionType | 5 |
| Return from PlanReviewView | reset restores idle, can create new plan after reset | 2 |

### Test results

| Suite | Result |
|---|---|
| `dashboardOptimizationPlan.test.ts` (Phase 3 focused) | ✅ 55 passed |
| `smartOptimizationPlan.test.ts` (SC-8C11 regression) | ✅ 15 passed |
| `securityRemediationPlan.test.ts` (SC-8C12 regression) | ✅ 35 passed |
| `DashboardHealth.test.ts` (dashboard regression) | ✅ 53 passed |
| `SmartOptimization.test.ts` (dashboard regression) | ✅ 59 passed |
| **Combined focused suites** | ✅ **217 passed** |

---

## 14. Validation

### Frontend

| Check | Result |
|---|---|
| Typecheck (`tsc -p tsconfig.json --noEmit`) | ✅ Pass |
| Lint (eslint, `--max-warnings=0`) | ✅ Pass (0 errors, 0 warnings) |
| Build (`vite build`) | ✅ Pass (16.58s) |
| Full frontend test suite | ✅ 8081 passed, 1 pre-existing failure |

### Pre-existing failure (NOT introduced by Phase 3)

- `src/features/scan/__tests__/results.test.tsx` line 514: `execution-completed-count` textContent assertion
- This test fails in isolation (without any Phase 3 changes)
- The test is about the `ResultsView` execution progress panel, which was NOT modified in Phase 3
- This is a pre-existing intermittent failure, documented separately

### Backend

| Check | Result |
|---|---|
| Full backend suite (`pytest tests -q`) | ✅ 951 passed, 14 skipped |

---

## 15. Security Audit

### Dashboard feature (`src/features/dashboard`)

| Pattern | Matches | Classification |
|---|---|---|
| `dashboard.optimize.execute` | 3 (comments in deprecation notices) | SAFE — documentation |
| `executeOptimize` | 5 (deprecated no-op method, service interface, test mocks) | SAFE — no-op, not called from production UI |
| `orchestrator.optimize` | 0 | SAFE |
| `orchestrator.fullAsync` | 0 | SAFE |
| `child_process` | 0 | SAFE |
| `subprocess` | 0 | SAFE |
| `PowerShell` | 2 (comments in privacy documentation) | SAFE — documentation |
| `reg.exe` | 0 | SAFE |
| `fs.unlink` | 0 | SAFE |
| `fs.rm` | 0 | SAFE |
| `fs.writeFile` | 0 | SAFE |
| `localStorage` | 4 (developer mode toggle, NOT remediation state) | SAFE — UI preference |
| `sessionStorage` | 0 | SAFE |
| `indexedDB` | 0 | SAFE |

### Scan feature (`src/features/scan`)

| Pattern | Matches | Classification |
|---|---|---|
| `dashboard.optimize.execute` | 2 (test assertions verifying NOT called) | SAFE — negative test |
| `executeOptimize` | 0 | SAFE |
| `orchestrator.optimize` | 3 (test assertions verifying NOT called) | SAFE — negative test |
| `orchestrator.fullAsync` | 2 (test assertions verifying NOT called) | SAFE — negative test |
| `PowerShell` | 4 (test assertions + comments) | SAFE — negative test/documentation |
| `reg.exe` | 2 (test assertions) | SAFE — negative test |
| `subprocess` | 2 (test assertions) | SAFE — negative test |
| `localStorage` | 14 (test assertions verifying NOT used + comments) | SAFE — negative test |
| `sessionStorage` | 8 (test assertions verifying NOT used) | SAFE — negative test |
| `indexedDB` | 1 (comment in unifiedScanState.ts) | SAFE — documentation |

### Summary

**Zero production-reachable destructive execution paths from Dashboard UI.**

All matches are either:
- Comments/documentation describing what NOT to do
- Deprecated no-op methods
- Test assertions verifying legacy paths are NOT called
- Developer mode localStorage (UI preference, NOT remediation state)
- Legacy service methods retained but disconnected from production UI

---

## 16. Remaining Limitations

1. **Legacy `dashboard.optimize.execute` RPC retained** — The backend RPC is not deleted. Phase 5 owns final legacy disconnection/dead-code cleanup. The production UI no longer invokes it.

2. **`dashboardService.executeOptimize` retained** — The service method is retained for backward compatibility but is not called from production UI (DashboardViewModel.executeOptimize is a no-op).

3. **`DashboardViewModel.executeOptimize` retained as no-op** — The method exists but returns immediately without calling any RPC. Phase 5 owns final removal.

4. **`OneClickOptimize.tsx` retained** — The component is retained with non-destructive labels. It is not imported by DashboardPageV2. Phase 5 owns final removal.

5. **Flush DNS and Trim Memory not in canonical flow** — These operations are classified as `OUT_OF_SCOPE` / `NOT_FIXABLE` by the backend. They appear in PlanReviewView as non-executable review items but cannot be remediated through `scan_core`.

6. **Pre-existing test failure** — `results.test.tsx` line 514 has a pre-existing failure unrelated to Phase 3 (ResultsView execution progress panel assertion). This failure exists in isolation without any Phase 3 changes.

7. **Smart Optimization execution handler** — `executionHandler.ts` in the smart-optimization-ai feature still contains `dashboardService.executeOptimize()` calls. This is part of the legacy Smart Optimization engine which is deprecated (SC-8C11 migrated Smart Optimization to the canonical flow). The handler is not reachable from the production SmartOptimizationPage UI. Phase 5 owns final cleanup.

---

## 17. Explicit Phase 4 Boundary

### What was implemented in Phase 3

- ✅ `useDashboardOptimizationPlan` hook (planning-only)
- ✅ `dashboardPreviewActionToRpcPayload` / `dashboardPreviewToRpcPayload` serializer (privacy-safe)
- ✅ `DashboardOptimizationPlanResponse` type + `dashboard_optimization_plan` method in scan.service.ts
- ✅ Export from scan/index.ts
- ✅ DashboardPageV2 "Review & Optimize" button with canonical PlanReviewView handoff
- ✅ DashboardViewModel legacy execution methods disconnected (no-op)
- ✅ OneClickOptimize component labels changed to non-destructive
- ✅ 55 new focused tests
- ✅ All validation passes (typecheck, lint, build, 8081 frontend tests, 951 backend tests)

### What was NOT implemented (Phase 4+)

- ❌ Phase 4 persistence/recovery changes — NOT STARTED
- ❌ Phase 5 final legacy cleanup — NOT STARTED
- ❌ Broad legacy backend RPC deletion — NOT STARTED
- ❌ `scan_core` internals modification — OUT OF SCOPE
- ❌ `ActionType` modification — OUT OF SCOPE
- ❌ Executor modification — OUT OF SCOPE
- ❌ `SafetyGate` modification — OUT OF SCOPE
- ❌ `RemediationCoordinator` modification — OUT OF SCOPE
- ❌ New remediation engine — OUT OF SCOPE
- ❌ New approval system — OUT OF SCOPE
- ❌ New rollback system — OUT OF SCOPE
- ❌ SC-8C14 — NOT STARTED

### Phase 4 was NOT started.

---

## 18. Files Changed

### New files

| File | Purpose | Lines |
|---|---|---|
| `src/features/scan/useDashboardOptimizationPlan.ts` | Dashboard Optimization plan creation hook | 88 |
| `src/features/dashboard/dashboardOptimizationSerializer.ts` | Privacy-safe preview → RPC payload serializer | 103 |
| `src/features/scan/__tests__/dashboardOptimizationPlan.test.ts` | 55 focused Phase 3 tests | 884 |

### Modified files

| File | Change |
|---|---|
| `src/features/scan/scan.service.ts` | Added `DashboardOptimizationPlanResponse` type + `dashboard_optimization_plan` method |
| `src/features/scan/index.ts` | Exported `useDashboardOptimizationPlan` + type |
| `src/features/dashboard/DashboardPageV2.tsx` | Added "Review & Optimize" button, canonical PlanReviewView handoff, preview loading/error state |
| `src/features/dashboard/DashboardViewModel.ts` | Deprecated `advanceToOptimizeConfirm` and `executeOptimize` as no-ops, removed unused `optimizationHistoryService` import |
| `src/features/dashboard/components/OneClickOptimize.tsx` | Renamed labels to non-destructive ("Review & Optimize"), updated aria-labels and descriptions |

### Files NOT modified (explicitly preserved)

- `PlanReviewView` — unchanged
- `ResultsView` — unchanged
- `useResults` — unchanged
- `usePlanDetails` — unchanged
- `remediationService` — unchanged
- `unifiedScanState` — unchanged
- `scan_core` internals — unchanged
- `SafetyGate` — unchanged
- `RemediationCoordinator` — unchanged
- Backend adapter/builder/RPC (Phase 2) — unchanged

---

**End of SC-8C13 Phase 3 Dashboard Frontend Canonical Remediation Migration Report**
