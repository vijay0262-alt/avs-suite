# BACKGROUND DEFERRED CLEANUP REPORT

## Phase 21 — Automatic Cleanup Engine & Background Deferred Cleanup

### Overview

AVS Shield now continues improving the PC even after the main scan has finished.
When items cannot be cleaned because a browser or application is running,
they are moved to a Deferred Cleanup Queue. A background service monitors
for application closures and automatically retries cleanup — no user
interaction required.

---

## Queue Architecture

```
Optimize Now
    ↓
Preparing → Scanning → Cleaning → Verification → Score Update → History → Done
    ↓
(If item cannot be cleaned)
    ↓
Detect blocking process (Chrome, Edge, Firefox, Brave, Explorer)
    ↓
Add to DeferredCleanupStore (localStorage persistent)
    ↓
ProcessMonitorService polls every 5s
    ↓
Browser closes → BackgroundCleanupService triggers
    ↓
Retry cleaning → Verify → Update scores → Save history → Broadcast → Notify
```

### Components

1. **ProcessMonitorService** (`ProcessMonitorService.ts`)
   - Polls `performance.monitor.getTopProcesses` RPC every 5 seconds
   - Tracks Chrome, Edge, Firefox, Brave, Explorer process names
   - Emits `processClosed` event when a tracked process transitions running → not running

2. **DeferredCleanupStore** (`DeferredCleanupStore.ts`)
   - Zustand store with localStorage persistence (`avs-deferred-cleanup-queue`)
   - Survives app restarts — items are loaded on startup
   - API: `addItem`, `addItems`, `removeItem`, `removeItems`, `getItemsForProcess`, `getItemsForModule`, `clearAll`
   - Max 500 items

3. **BackgroundCleanupService** (`BackgroundCleanupService.ts`)
   - Subscribes to ProcessMonitorService events
   - When a process closes, collects matching deferred items
   - Groups items by module, calls `orchestrator.optimize` RPC to retry
   - Removes successfully cleaned items from store
   - Verifies results, updates scores, saves history, broadcasts, notifies
   - Prevents overlapping cleanups (mutex via `cleaning` flag)
   - `runStartupCleanup()` — on app boot, retries items whose blocking processes are not running

---

## Files Modified

### New Files

1. **`apps/pc-optimizer/src/features/health/ProcessMonitorService.ts`**
   - Process monitor service — polls for running browser/Explorer processes
   - Emits `ProcessClosedEvent` when a target process closes
   - Targets: chrome, msedge, firefox, brave, explorer

2. **`apps/pc-optimizer/src/features/health/DeferredCleanupStore.ts`**
   - Zustand store with localStorage persistence
   - Stores `DeferredCleanupItem` objects with `blockingProcess` field
   - Survives app restarts

3. **`apps/pc-optimizer/src/features/health/BackgroundCleanupService.ts`**
   - Orchestrates background cleanup
   - Listens to process monitor, executes cleanup, verifies, broadcasts
   - Sends "Background Cleanup Completed" notification with recovered MB and score change
   - Updates system tray status

### Modified Files

4. **`apps/pc-optimizer/src/features/health/index.ts`**
   - Added exports for ProcessMonitorService, DeferredCleanupStore, BackgroundCleanupService

5. **`apps/pc-optimizer/src/main.tsx`**
   - Start `backgroundCleanupService` at app boot
   - Call `runStartupCleanup()` to retry deferred items on startup

6. **`apps/pc-optimizer/src/features/dashboard/DashboardViewModel.ts`**
   - Detect blocking process from error keywords (chrome, edge, firefox, brave, explorer)
   - Add `blockingProcess` field to deferred items
   - Persist deferred items to `useDeferredCleanupStore` (localStorage)
   - Exclude deferred modules from overall score calculation

7. **`apps/pc-optimizer/src/features/dashboard/dashboard.types.ts`**
   - Added `blockingProcess?: string` to `DeferredCleanupItem` interface

---

## Background Monitoring

### Target Processes

| Process Name | Application |
|---|---|
| chrome | Google Chrome |
| msedge | Microsoft Edge |
| firefox | Mozilla Firefox |
| brave | Brave Browser |
| explorer | Windows Explorer |

### Polling

- Interval: 5 seconds
- RPC: `performance.monitor.getTopProcesses` (limit: 200)
- Process names matched case-insensitively, `.exe` stripped
- Only emits event on running → not-running transition (not on startup)

### Cleanup Execution

- Items grouped by `moduleId` for batch cleaning
- Calls `orchestrator.optimize` RPC with `deferredPaths` parameter
- Prevents overlapping cleanups via mutex flag
- Successfully cleaned items removed from store
- Failed items remain in store for next retry

---

## Verification

Every background cleanup:

1. **Invalidates metrics cache** — `invalidateMetricsCache()`
2. **Reloads dashboard metrics** — `dashboard.metrics` RPC for fresh scores
3. **Broadcasts scores** — `useLiveSync.broadcastScores()` updates all subscribers
4. **Emits optimization events** — `optimizationEventBus.emit(CleaningCompleted)` per module
5. **Records history** — `optimizationHistoryService.recordOptimization()`
6. **Sends notification** — "Background Cleanup Completed, Recovered X MB, Score A → B"
7. **Updates system tray** — Status and tooltip reflect new score

### Health Score Calculation

Deferred items do NOT significantly reduce the health score:
- Overall score is calculated as the average of non-deferred modules only
- Deferred modules are excluded from the score denominator
- Only automatically fixable items determine the optimization score
- When background cleanup completes, scores are recalculated from fresh metrics

---

## Manual Testing

### Test 1: Optimize with Chrome open

1. Open Google Chrome
2. Click "Optimize Now" on Dashboard
3. Verify: Scan completes, some items show "Deferred — will be applied on next restart"
4. Verify: Deferred items appear in localStorage (`avs-deferred-cleanup-queue`)
5. Verify: Health score is NOT significantly reduced by deferred items

### Test 2: Close Chrome — automatic cleanup

1. After Test 1, close Google Chrome
2. Wait up to 5 seconds (poll interval)
3. Verify: Background cleanup executes automatically
4. Verify: Notification appears: "Background Cleanup Completed, Recovered X MB"
5. Verify: Health score updates (e.g., 96 → 98)
6. Verify: System tray tooltip updates
7. Verify: Optimization history records the background cleanup
8. Verify: Deferred items removed from store

### Test 3: App restart with deferred items

1. After Test 1, close AVS Shield
2. Reopen AVS Shield
3. Verify: `runStartupCleanup()` executes
4. Verify: If Chrome is still running, items remain deferred
5. Verify: If Chrome was closed before restart, items are cleaned immediately

---

## Validation

- **Lint**: 0 warnings, 0 errors
- **Typecheck**: 0 errors
- **Tests**: 8001 passed (120 test files)
- **Build**: Successful production build (16.46s)

---

## Remaining Issues

- The `orchestrator.optimize` RPC call for deferred cleanup uses a synthetic
  session ID. If the backend requires a pre-existing session, this may need
  adjustment. Currently the backend orchestrator creates a new session if
  one doesn't exist.
- Process monitoring relies on `performance.monitor.getTopProcesses` which
  returns top processes by CPU/memory. If a browser is idle with very low
  resource usage, it may not appear in the top 200. This is unlikely but
  possible.
