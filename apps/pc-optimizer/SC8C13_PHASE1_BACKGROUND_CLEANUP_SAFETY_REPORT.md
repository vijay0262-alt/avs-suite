# SC-8C13 Phase 1 — Background Cleanup Safety Migration Report

## 1. Objective

Remove the unsafe automatic destructive execution behavior from `BackgroundCleanupService`. Convert the service to detection/notification-only, preserving read-only detection while eliminating all automatic destructive operations.

This phase enforces the established SC-8C10/SC-8C11/SC-8C12 security invariant: **NO AUTOMATIC DESTRUCTIVE EXECUTION.**

---

## 2. Previous Behavior

### Startup flow (BEFORE)

```
Application startup (main.tsx)
→ backgroundCleanupService.start()
→ backgroundCleanupService.runStartupCleanup()
  → reads DeferredCleanupStore items
  → filters to items whose blocking process is not running
  → calls executeCleanup(cleanable)
    → calls RPC_METHODS.ORCHESTRATOR_OPTIMIZE with deferredPaths
    → withRetry (3 attempts)
    → removes successfully cleaned items from store
    → verifyAndBroadcast()
      → invalidateMetricsCache()
      → broadcasts updated health scores
      → emits optimization events
      → records optimization history
      → sends "Background Cleanup Completed" notification
      → updates system tray
```

### Process-closed flow (BEFORE)

```
ProcessMonitorService detects browser/Explorer closed
→ BackgroundCleanupService.handleProcessClosed()
  → finds matching deferred items
  → calls executeCleanup(matching)
    → [same destructive path as above]
```

### Security violations

1. **No automatic destructive execution** — VIOLATED. Service called `ORCHESTRATOR_OPTIMIZE` at app boot and on process-closed events without user approval.
2. **No browser storage for remediation state** — VIOLATED. `DeferredCleanupStore` used IndexedDB for deferred cleanup items.
3. **No automatic approval** — VIOLATED. No explicit user approval was required before destructive operations.

---

## 3. New Behavior

### Startup flow (AFTER)

```
Application startup (main.tsx)
→ backgroundCleanupService.start()
  → subscribes to ProcessMonitorService (detection-only)
→ backgroundCleanupService.checkStartupOpportunities()
  → reads DeferredCleanupStore items (read-only)
  → if items exist, sends notification: "Cleanup Opportunities Available"
  → does NOT call any destructive RPC
  → does NOT modify filesystem/registry/cache
  → returns opportunity info (itemCount, estimatedBytes)
```

### Process-closed flow (AFTER)

```
ProcessMonitorService detects browser/Explorer closed
→ BackgroundCleanupService.handleProcessClosed()
  → finds matching deferred items (read-only check)
  → if items exist, sends notification: "Cleanup Opportunities Available"
  → does NOT call any destructive RPC
  → does NOT modify filesystem/registry/cache
```

### Security invariants enforced

1. **No automatic destructive execution** — ENFORCED. No `ORCHESTRATOR_OPTIMIZE` or `DASHBOARD_OPTIMIZE_EXECUTE` calls.
2. **No browser storage for remediation state** — ENFORCED. `DeferredCleanupStore` is deprecated, not populated with new items.
3. **No automatic approval** — ENFORCED. User must explicitly open the canonical scan/review/approve/execute flow.

---

## 4. Files Changed

| File | Change type | Description |
|------|------------|-------------|
| `apps/pc-optimizer/src/features/health/BackgroundCleanupService.ts` | **Rewritten** | Removed `runStartupCleanup()`, `executeCleanup()`, `verifyAndBroadcast()`. Removed all destructive imports. Added `checkStartupOpportunities()` and `notifyCleanupAvailable()`. Converted to detection/notification-only. |
| `apps/pc-optimizer/src/main.tsx` | **Modified** | Replaced `runStartupCleanup()` call with `checkStartupOpportunities()` (detection-only). |
| `apps/pc-optimizer/src/features/health/HealthNotificationService.ts` | **Modified** | Added public `pushNotification()` method for custom notifications from services. |
| `apps/pc-optimizer/src/features/health/DeferredCleanupStore.ts` | **Docstring updated** | Updated to reflect deprecation — no longer populated, retained for compatibility. |
| `apps/pc-optimizer/src/features/health/ProcessMonitorService.ts` | **Docstring updated** | Updated to reflect detection-only usage by BackgroundCleanupService. |
| `apps/pc-optimizer/src/features/health/index.ts` | **Modified** | Updated export type from `BackgroundCleanupResult` to `BackgroundCleanupOpportunity`. |
| `apps/pc-optimizer/src/features/health/__tests__/BackgroundCleanupSafety.test.ts` | **New file** | 18 regression tests verifying no automatic destructive execution. |

---

## 5. Automatic Execution Paths Removed

| Removed method/path | Previous behavior | Replacement |
|---------------------|-----------------|-------------|
| `runStartupCleanup()` | Called `executeCleanup()` at app boot | `checkStartupOpportunities()` — detection/notification only |
| `executeCleanup(items)` | Called `ORCHESTRATOR_OPTIMIZE` with `withRetry` | Removed entirely — no replacement (user must use canonical flow) |
| `verifyAndBroadcast(result)` | Updated scores, history, tray after cleanup | Removed entirely — no cleanup to verify |
| `handleProcessClosed()` → `executeCleanup()` | Automatic cleanup on process close | `handleProcessClosed()` → notification only |
| `ORCHESTRATOR_OPTIMIZE` RPC call | Destructive optimization | Removed — no RPC calls from BackgroundCleanupService |
| `withRetry` import | Retry mechanism for destructive RPC | Removed |
| `RPC_METHODS` import | RPC constants for destructive calls | Removed |
| `invalidateMetricsCache` import | Cache invalidation after cleanup | Removed |
| `useLiveSync` import | Score broadcasting after cleanup | Removed |
| `optimizationEventBus` import | Event emission after cleanup | Removed |
| `optimizationHistoryService` import | History recording after cleanup | Removed |

---

## 6. DeferredCleanupStore Disposition

**Status: DEPRECATED — not populated, retained for compatibility.**

### Findings

- `DeferredCleanupStore` uses IndexedDB (`idbGetAll`, `idbPut`, `idbDelete`, `idbClear`)
- The store's `addItem()` and `addItems()` methods are **never called from production code** — only defined in the store itself
- The store was only populated from previous sessions via `initDeferredCleanupStore()` at startup
- The only consumer was `BackgroundCleanupService` (now converted to read-only detection)
- No other module imports or uses `useDeferredCleanupStore` except `BackgroundCleanupService` and `index.ts` (export)

### Treatment

- The store itself is NOT deleted (retained for compatibility)
- The store is NOT populated with new items (no code calls `addItem`/`addItems`)
- `initDeferredCleanupStore()` still loads existing items from IndexedDB at startup (for detection/notification)
- `BackgroundCleanupService.checkStartupOpportunities()` reads existing items for notification purposes only
- The store is classified as deprecated dead code in the docstring

### No backend migration

The store was NOT migrated to backend persistence. There is no need — the store is no longer used for remediation execution state. Existing items are only used for read-only detection/notification.

---

## 7. Startup Behavior

### Before

```typescript
// main.tsx
deferInit(() => {
  backgroundCleanupService.start();
  void backgroundCleanupService.runStartupCleanup(); // DESTRUCTIVE
});
```

### After

```typescript
// main.tsx
deferInit(() => {
  // SC-8C13 Phase 1: Background cleanup is detection/notification-only.
  backgroundCleanupService.start();
  backgroundCleanupService.checkStartupOpportunities(); // DETECTION ONLY
});
```

### Verification

- `main.tsx` does NOT call `runStartupCleanup()` — verified by grep
- `main.tsx` does NOT call any destructive RPC — verified by grep
- `checkStartupOpportunities()` is synchronous and detection-only
- `start()` only subscribes to `ProcessMonitorService` events

---

## 8. Notification Behavior

### Mechanism

Uses the existing `HealthNotificationService.pushNotification()` method (newly added as a public API). This does NOT create a new notification subsystem — it extends the existing one with a public method.

### Notification content

```
Title: "Cleanup Opportunities Available"
Message: "{N} items ready for cleanup (~{M} MB). Open the Dashboard to review and approve."
Action: "Open Dashboard" → /dashboard
Severity: info
```

### Cooldown

Notifications are rate-limited per process name with a 5-minute cooldown to prevent spam.

### No second UI

- No new remediation UI is created
- No new approval system is created
- The notification directs users to the existing Dashboard/Scan UI
- The user must explicitly open the canonical scan/review/approve/execute flow

---

## 9. Security Audit

### Grep results

| Pattern | Scope | Matches | Classification |
|---------|-------|---------|---------------|
| `orchestrator.optimize` | `BackgroundCleanupService.ts` | 0 code matches (3 docstring references documenting what was removed) | SAFE |
| `dashboard.optimize.execute` | `BackgroundCleanupService.ts` | 0 code matches (1 docstring reference) | SAFE |
| `executeOptimize` | `BackgroundCleanupService.ts` | 0 matches | SAFE |
| `ORCHESTRATOR_OPTIMIZE` | `BackgroundCleanupService.ts` | 0 matches | SAFE |
| `DASHBOARD_OPTIMIZE_EXECUTE` | `BackgroundCleanupService.ts` | 0 matches | SAFE |
| `RPC_METHODS` | `BackgroundCleanupService.ts` | 0 matches | SAFE |
| `withRetry` | `BackgroundCleanupService.ts` | 0 matches | SAFE |
| `rpcClient` | `BackgroundCleanupService.ts` | 0 matches | SAFE |
| `invalidateMetricsCache` | `BackgroundCleanupService.ts` | 0 matches | SAFE |
| `useLiveSync` | `BackgroundCleanupService.ts` | 0 matches | SAFE |
| `optimizationEventBus` | `BackgroundCleanupService.ts` | 0 matches | SAFE |
| `optimizationHistoryService` | `BackgroundCleanupService.ts` | 0 matches | SAFE |
| `subprocess` | `BackgroundCleanupService.ts` | 0 matches | SAFE |
| `child_process` | `BackgroundCleanupService.ts` | 0 matches | SAFE |
| `PowerShell` | `BackgroundCleanupService.ts` | 0 matches | SAFE |
| `reg.exe` | `BackgroundCleanupService.ts` | 0 matches | SAFE |
| `fs.unlink` | `BackgroundCleanupService.ts` | 0 matches | SAFE |
| `fs.rm` | `BackgroundCleanupService.ts` | 0 matches | SAFE |
| `fs.writeFile` | `BackgroundCleanupService.ts` | 0 matches | SAFE |
| `shutil.rmtree` | `BackgroundCleanupService.ts` | 0 matches | SAFE |
| `process.kill` | `BackgroundCleanupService.ts` | 0 matches | SAFE |
| `runStartupCleanup` | `main.tsx` | 0 matches | SAFE |
| `executeCleanup` | `main.tsx` | 0 matches | SAFE |
| `backgroundCleanupService.(run|execute|cleanup|optimize|perform)` | All `src/` | 0 matches | SAFE |

### Security invariants verification

| Invariant | Status |
|-----------|--------|
| No automatic destructive execution | ✅ ENFORCED |
| No automatic cleanup at startup | ✅ ENFORCED |
| No automatic approval | ✅ ENFORCED |
| No automatic rollback | ✅ ENFORCED (no rollback logic in service) |
| No browser remediation persistence | ✅ ENFORCED (DeferredCleanupStore deprecated, not populated) |
| No direct destructive frontend APIs | ✅ ENFORCED (no fs/subprocess/process.kill) |
| No legacy optimization execution from BackgroundCleanupService | ✅ ENFORCED (no ORCHESTRATOR_OPTIMIZE call) |
| No SafetyGate bypass | ✅ N/A (service no longer executes remediation) |
| No RemediationCoordinator bypass | ✅ N/A (service no longer executes remediation) |

---

## 10. Tests Added

**File:** `apps/pc-optimizer/src/features/health/__tests__/BackgroundCleanupSafety.test.ts`

**Test count:** 18 tests

| # | Test | Verifies |
|---|------|----------|
| 1 | `start() does not call orchestrator.optimize` | No destructive RPC at startup |
| 2 | `start() does not call dashboard.optimize.execute` | No destructive RPC at startup |
| 3 | `start() does not make any RPC calls` | No destructive RPCs at all |
| 4 | `does not have a runStartupCleanup method` | Method removed |
| 5 | `does not have an executeCleanup method` | Method removed |
| 6 | `checkStartupOpportunities returns null when no deferred items exist` | Detection-only behavior |
| 7 | `checkStartupOpportunities does not call orchestrator.optimize` | No destructive RPC |
| 8 | `checkStartupOpportunities does not call dashboard.optimize.execute` | No destructive RPC |
| 9 | `checkStartupOpportunities returns opportunity info when items exist` | Detection returns info, not execution |
| 10 | `checkStartupOpportunities sends a notification when items exist` | Notification behavior |
| 11 | `checkStartupOpportunities does not send notification when no items exist` | No false notifications |
| 12 | `multiple start/stop cycles do not trigger destructive operations` | Repeated startup safety |
| 13 | `multiple checkStartupOpportunities calls do not trigger destructive operations` | Repeated detection safety |
| 14 | `does not have automatic approval logic` | No auto-approval |
| 15 | `does not have automatic rollback logic` | No auto-rollback |
| 16 | `subscribe listener receives opportunity info, not execution results` | Detection events, not execution |
| 17 | `the service does not add items to DeferredCleanupStore` | Store not populated |
| 18 | `BackgroundCleanupService does not import RPC_METHODS` | Source code safety |

---

## 11. Validation Results

### Typecheck

```
tsc -p apps/pc-optimizer/tsconfig.json --noEmit
Exit code: 0

tsc -p apps/pc-optimizer/electron/tsconfig.json --noEmit
Exit code: 0
```

### Lint

```
eslint (changed files) --max-warnings=0
Exit code: 0
```

### Build

```
vite build
✓ built in 15.94s
Exit code: 0
```

### Focused tests

```
BackgroundCleanupSafety.test.ts: 18 passed
Health tests (all): 100 passed
Dashboard tests (all): 112 passed
Scan tests (all): 154 passed
```

### Full frontend test suite

```
118 test files passed
8027 tests passed
Duration: 55.88s
Exit code: 0
```

### Backend suite

Not run — SC-8C13 Phase 1 only modified frontend files. No backend code was changed.

---

## 12. Remaining Limitations

1. **`DeferredCleanupStore` retained as deprecated dead code** — The store still exists with its IndexedDB persistence. It is not populated with new items but existing items from previous sessions may still be loaded. Full removal is deferred to a future cleanup phase.

2. **`initDeferredCleanupStore()` still called at startup** — This loads existing items from IndexedDB for detection/notification purposes. It does NOT perform any destructive operations.

3. **`ProcessMonitorService` still polls at startup** — The process monitor continues to poll `performance.monitor.getTopProcesses` every 5 seconds. This is read-only detection and does not perform any destructive operations. It could be optimized in a future phase if polling overhead is a concern.

4. **Legacy `orchestrator.optimize` RPC retained** — The backend RPC is not removed. It is simply disconnected from `BackgroundCleanupService`. Other callers (if any) are unaffected.

5. **Legacy `dashboard.optimize.execute` RPC retained** — The backend RPC is not removed. It will be disconnected from the Dashboard UI in SC-8C13 Phase 3.

6. **Dashboard One-Click Optimize still bypasses `scan_core`** — This is expected. Dashboard migration is SC-8C13 Phase 2/3, not Phase 1.

7. **No backend tests run** — Phase 1 only modified frontend files. Backend suite should be run in Phase 2 when backend code is modified.

---

## 13. Explicit Scope Confirmation

### What was implemented

- ✅ Background Cleanup Service converted to detection/notification-only
- ✅ Automatic destructive execution removed
- ✅ `runStartupCleanup()` removed from `main.tsx`
- ✅ `ORCHESTRATOR_OPTIMIZE` call removed from `BackgroundCleanupService`
- ✅ `DeferredCleanupStore` deprecated (not populated)
- ✅ Notification behavior added (using existing `HealthNotificationService`)
- ✅ 18 regression tests added
- ✅ All validation passes (typecheck, lint, build, 8027 tests)

### What was NOT implemented

- ❌ Dashboard Optimize migration — Phase 2/3
- ❌ `DashboardOptimizationAdapter` — Phase 2
- ❌ `DashboardOptimizationPlanBuilder` — Phase 2
- ❌ `scan_core.dashboard_optimization.plan` RPC — Phase 2
- ❌ `PlanReviewView` changes — Phase 3
- ❌ `ResultsView` changes — Phase 3
- ❌ New `ActionType` values — OUT OF SCOPE
- ❌ New executors — OUT OF SCOPE
- ❌ `SafetyGate` changes — OUT OF SCOPE
- ❌ `RemediationCoordinator` changes — OUT OF SCOPE
- ❌ `scan_core` internals — OUT OF SCOPE
- ❌ Dashboard frontend migration — Phase 3
- ❌ Rollback architecture changes — OUT OF SCOPE
- ❌ SC-8C14 — NOT STARTED

### Phase 2 was NOT started.

---

**End of SC-8C13 Phase 1 Background Cleanup Safety Migration Report**
