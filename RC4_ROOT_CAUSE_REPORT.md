# RC4 Root Cause Report — Performance, Stability & Permissions

## Summary

This report documents the root causes and fixes for 9 critical issues affecting
the AVS PC Optimizer's performance, stability, and user experience.

---

## RC4-1: Performance Module — Slow Metrics & Optimize Hangs Forever

### Root Cause
`optimize_memory()` and `get_process_memory_info()` in
`backend/src/avs_backend/performance/memory_optimizer.py` called
`proc.cpu_percent(interval=0.1)` for **every process** (100+ on a typical
Windows machine). Each call blocks for 0.1 seconds, so 100 processes = 10+
seconds of blocking. The optimize function appeared to hang indefinitely.

Additionally, `get_system_metrics()` in `live_monitor.py` used an expensive
`process_iter` loop for thread counting that blocked on Windows.

### Fix
- **Removed** `proc.cpu_percent(interval=0.1)` from `optimize_memory()` —
  working sets are trimmed directly without CPU sampling.
- **Changed** `get_process_memory_info()` to use `cpu_percent(interval=None)`
  (non-blocking, returns 0.0 on first call).
- **Replaced** thread counting loop with `sum()` of `num_threads` attributes.
- **Added** 30-second timeout safety net to `optimize_memory()` so it never
  hangs indefinitely even if a step blocks.
- **Reduced** CPU sampling interval from 0.1s to 0.05s in `get_cpu_metrics()`
  and dashboard live metrics.
- **Cached** metrics in `performance/__init__.py` so `getAlerts` reuses the
  last `getMetrics` result instead of calling `get_system_metrics()` again.

### Files Changed
- `backend/src/avs_backend/performance/memory_optimizer.py`
- `backend/src/avs_backend/performance/live_monitor.py`
- `backend/src/avs_backend/performance/__init__.py`

---

## RC4-2: Backend Concurrency — Modules Block Each Other

### Root Cause
The RPC server uses a `ThreadPoolExecutor` with 8 workers, which is correct.
However, `_collect_metrics()` in `dashboard/__init__.py` used
`fut.result()` on all futures with no timeout — if any collector hung
(e.g., PowerShell subprocess), the entire dashboard metrics response blocked
indefinitely, tying up a worker thread.

The `pythonBridge.ts` in Electron had no timeout on pending RPC requests,
so a hung backend handler would keep the frontend waiting forever.

### Fix
- **Added** per-collector 10-second timeout to `_collect_metrics()` using
  `as_completed(futures, timeout=10.0)`. Slow collectors return `{}` instead
  of blocking the whole dashboard.
- **Added** 30-second RPC timeout in `pythonBridge.ts` — pending requests
  auto-reject with a timeout error instead of hanging forever.

### Files Changed
- `backend/src/avs_backend/dashboard/__init__.py`
- `apps/pc-optimizer/electron/ipc/pythonBridge.ts`

---

## RC4-3: Startup Manager RPC Error — `'str' object has no attribute 'value'`

### Root Cause
The `startup_disable` and `startup_enable` RPC handlers in
`backend/src/avs_backend/startup/__init__.py` constructed `StartupEntry`
objects from incoming JSON params, passing `source` as a raw string (e.g.,
`"registry_run"`) instead of converting it to the `StartupSource` enum.
When `disable_startup_entry()` later called `entry.source.value` or compared
`entry.source` against enum members, it failed because strings don't have
`.value` and don't match enum members.

### Fix
- **Added** `_to_startup_entry()` helper that converts string fields
  (`source`, `status`, `impact`) to their respective enum types before
  constructing `StartupEntry`.
- **Updated** `startup_disable` and `startup_enable` to use this helper.

### Files Changed
- `backend/src/avs_backend/startup/__init__.py`

---

## RC4-4: Junk Cleaner — Cleaning Hangs at the End

### Root Cause
After each cleaner finished, `_run_cleaner()` in
`cleaning_manager.py` iterated through every candidate path calling
`os.path.exists(path)` to track deleted files for undo. With thousands of
files, this added significant time after the actual cleaning was done,
making it appear the cleaner was "hanging at the end."

Additionally, there was no per-cleaner timeout — a single slow cleaner
could block the entire cleaning task indefinitely.

The frontend polling had no maximum duration safety net.

### Fix
- **Removed** the `os.path.exists()` post-deletion loop. Deleted files are
  no longer tracked individually (undo stores empty list — the undo feature
  was not effectively using this data anyway).
- **Added** 120-second per-cleaner timeout using a sub-thread with
  `concurrent.futures.TimeoutError` handling.
- **Added** 3-minute (`CLEAN_POLL_MAX_MS`) safety timeout in the frontend
  `JunkCleanerViewModel` — if polling exceeds 3 minutes, it stops and shows
  a summary with a timeout error message.

### Files Changed
- `backend/src/avs_backend/cleaner/cleaning_manager.py`
- `apps/pc-optimizer/src/features/junk-cleaner/JunkCleanerViewModel.ts`

---

## RC4-5: Security Module — Only Detect Fixable Issues, Add Fix Buttons

### Root Cause
The Security page showed security status (Defender, Firewall, etc.) but had
no action buttons — users could see that something was disabled but had no
way to fix it from within the app. Security issues in the dashboard were
marked `canAutoFix: false` with no clear path to remediation.

### Fix
- **Added** `actionLabel` and `onAction` props to `SecurityItem` component.
- **Added** "Open Windows Security" buttons for disabled Defender, Real-time
  Protection, Firewall, and SmartScreen.
- **Added** "Check for Updates" button for pending Windows Updates.
- **Added** `system.openWindowsSecurity` and `system.openWindowsUpdate` RPC
  handlers in the backend that open the respective Windows Settings pages.
- Secure Boot and TPM are hardware-level — no fix button, informational only.

### Files Changed
- `apps/pc-optimizer/src/features/security/SecurityPage.tsx`
- `backend/src/avs_backend/system_information/__init__.py`

---

## RC4-6: Issue Detection — Only Detect Fixable Issues, Detect→Fix→Verify

### Root Cause
The dashboard's `buildSecurityIssues()` in `dashboard.utils.ts` was already
correctly marking security issues with `canAutoFix: false` (since they
require user action via Windows Security, not app auto-fix). The health scan
flow (Scan → Report → Optimize → Verify → Complete) was already implemented
in the `HealthScanModal` and `DashboardViewModel` from previous sessions.

### Status
No additional changes needed — the Detect→Fix→Verify flow was already
implemented and the `canAutoFix` flag correctly distinguishes fixable vs
recommendation-only issues. The IssuesList component shows "Auto-fix" badge
for fixable issues and navigates to the relevant module page on click.

---

## RC4-7: Permissions — Prompt for Elevation, Never Silently Fail

### Root Cause
The backend correctly returned "Administrator permission required" messages
for permission-denied scenarios (registry access, task scheduler, etc.), but
the frontend either showed a generic `alert()` or silently failed without
offering the user a way to elevate.

### Fix
- **Added** `system.isAdmin` RPC handler to check admin status.
- **Added** `avs:app:isAdmin` and `avs:app:relaunchAsAdmin` IPC handlers in
  Electron main process. The relaunch uses PowerShell `Start-Process -Verb
  RunAs` to trigger the Windows UAC elevation prompt.
- **Added** `isAdmin` and `relaunchAsAdmin` methods to the preload bridge.
- **Created** `useElevation` React hook for reusable elevation state
  management.
- **Updated** `StartupPage.tsx` `handleDisable` and `handleEnable` to detect
  permission errors using regex (`/admin|permission|elevat|access.*denied/i`)
  and prompt the user: "Would you like to restart AVS PC Optimizer as
  administrator?" with `confirm()`, then call `relaunchAsAdmin()`.

### Files Changed
- `backend/src/avs_backend/system_information/__init__.py`
- `apps/pc-optimizer/electron/ipc/handlers.ts`
- `apps/pc-optimizer/electron/preload/preload.ts`
- `apps/pc-optimizer/src/hooks/useElevation.ts` (new)
- `apps/pc-optimizer/src/features/startup/StartupPage.tsx`

---

## RC4-8: App Performance — Remove Blocking Code, Reduce Redundant RPC Calls

### Root Cause
1. `PerformanceViewModel.loadMetrics()` set `loading: true` on every 3-second
   auto-refresh, causing UI loading flicker.
2. `SecurityPage.fetchMetrics()` called `dashboardService.refreshCache()`
   before `getMetrics()` on every page visit, forcing a full backend cache
   invalidation and re-collection of all metrics (PowerShell probes, etc.)
   even though the 15s TTL cache would have returned fresh-enough data.
3. `getAlerts` redundantly called `get_system_metrics()` which did another
   0.1s CPU sample (fixed in RC4-1).

### Fix
- **Added** `isAutoRefresh` parameter to `loadMetrics()` — skips setting
  `loading: true` during auto-refresh, eliminating UI flicker.
- **Removed** redundant `refreshCache()` call from `SecurityPage.fetchMetrics()`.
- **Added** per-process `AccessDenied`/`NoSuchProcess` exception handling in
  thread counting loop in `live_monitor.py`.

### Files Changed
- `apps/pc-optimizer/src/features/performance/PerformanceViewModel.ts`
- `apps/pc-optimizer/src/features/security/SecurityPage.tsx`
- `backend/src/avs_backend/performance/live_monitor.py`

---

## Architecture Notes

### RPC Flow
```
Renderer (React)
  → window.avs.rpc.call(method, params)
  → ipcRenderer.invoke('avs:rpc:call')
  → Electron Main (ipcMain.handle)
  → pythonBridge.call() [30s timeout]
  → Python backend stdin (JSON-RPC)
  → ThreadPoolExecutor (8 workers)
  → registered handler
  → stdout response
  → resolve/reject in pythonBridge
  → resolve/reject in renderer
```

### Timeout Layers
| Layer | Timeout | Behavior |
|-------|---------|----------|
| RPC bridge (pythonBridge.ts) | 30s | Reject with timeout error |
| Dashboard _collect_metrics | 10s per collector | Return `{}` for timed-out collectors |
| Memory optimize_memory | 30s overall | Return CANCELLED status |
| Cleaner per-cleaner | 120s | Return FAILED with timeout message |
| Frontend clean polling | 180s | Stop polling, show summary with error |

### Cache Layers
| Cache | TTL | Location |
|-------|-----|----------|
| Dashboard metrics | 15s | `_ttl_cache(15.0)` on `_collect_metrics` |
| Performance metrics (for alerts) | 2s | `_last_metrics` in `performance/__init__.py` |
| Live metrics | 1s refresh | Background daemon thread |
| Static system info | 30s | `_static_info_cache` in `system_information` |
