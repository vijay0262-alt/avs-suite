# AVS PC Optimizer — Architecture Review

## Current Architecture

```
┌─────────────────────────────────────────────────────┐
│  Electron Main Process                              │
│  ├── pythonBridge.ts (spawn Python, RPC over stdio) │
│  ├── ipc/handlers.ts (Electron IPC)                 │
│  └── preload.ts (contextBridge)                     │
├─────────────────────────────────────────────────────┤
│  React Renderer (Vite)                              │
│  ├── router/index.tsx (lazy routes)                 │
│  ├── features/dashboard/DashboardViewModel.ts       │
│  ├── features/dashboard/DashboardPage.tsx           │
│  ├── features/*/*Page.tsx (per-module pages)        │
│  └── window.avs.rpc.call() → IPC → Python           │
├─────────────────────────────────────────────────────┤
│  Python Backend (rpc_server.py)                     │
│  ├── stdin read loop → ThreadPoolExecutor(8)        │
│  ├── Background module loader thread                │
│  ├── dashboard/__init__.py (metrics, health)        │
│  ├── cleaner/__init__.py (scan, clean)              │
│  ├── privacy/__init__.py (browser detection, scan)  │
│  ├── performance/__init__.py (monitor, memory)      │
│  ├── startup/__init__.py (startup entries)          │
│  ├── system_information/__init__.py (static/dynamic)│
│  ├── disk_analyzer/__init__.py (file analysis)      │
│  ├── registry_cleaner/__init__.py (registry scan)   │
│  └── 7 other modules                                │
└─────────────────────────────────────────────────────┘
```

---

## Identified Issues

### 1. Blocking Code at Import Time

**Issue**: `cleaner/__init__.py` line 44 calls `all_cleaners()` at import time,
creating 9 cleaner instances and opening SQLite database. This blocks the
module loader thread for 18.7 seconds.

**Impact**: Any RPC call to `cleaner.*` methods waits up to 90s for the
module to finish loading.

**Fix**: Defer singleton creation to first RPC call.

### 2. Synchronous PowerShell Calls in Collectors

**Issue**: Dashboard collectors call `_run_powershell()` synchronously inside
`ThreadPoolExecutor` workers. Each call spawns a new `powershell.exe` process
(~400ms overhead) and blocks the worker thread for 1-3 seconds.

**Impact**: `_get_security_metrics` takes 513ms avg, 1.5s max.
`_get_windows_info` takes 255ms avg, 708ms max.

**Fix**: Replace with `winreg` reads where possible. Cache aggressively.

### 3. Repeated Filesystem Scans

**Issue**: `_get_temp_files_size` scans `%TEMP%` and `%SystemRoot%\Temp`
every 15 seconds (TTL cache on `_collect_metrics`). Each scan walks up to
10,000 files with `os.walk()` + `os.path.getsize()`.

**Impact**: 17.8 seconds per scan, blocking the performance collector thread.

**Fix**: Use `os.scandir()` with `DirEntry.stat()`. Increase cache TTL to 60s.

### 4. No Static/Dynamic Data Separation in Dashboard

**Issue**: `_collect_metrics` mixes static data (CPU model, physical processors,
Windows version, Secure Boot, TPM) with dynamic data (CPU usage, memory usage,
disk usage) under a single 15s TTL cache.

**Impact**: Static data is re-collected every 15s unnecessarily. PowerShell
calls for Secure Boot, TPM, power mode are repeated.

**Fix**: Split into `_collect_static_metrics()` (1h TTL) and
`_collect_dynamic_metrics()` (2s TTL).

### 5. Duplicate RPC Calls Across Pages

**Issue**: Security page calls `dashboard.metrics` on mount, duplicating the
dashboard's own call. System Info page calls `system.dynamic` every 2s, but
dashboard already polls `dashboard.live` every 2s with similar data.

**Impact**: 2x RPC calls for overlapping data.

**Fix**: Create a shared metrics store in the frontend that all pages subscribe to.

### 6. No Centralized Job Manager

**Issue**: Each module (cleaner, disk_analyzer, duplicate_finder, registry_cleaner)
implements its own scan/cancel/status pattern independently.

**Impact**: No way to coordinate jobs, limit concurrent scans, or show a unified
job queue. Each module's polling timer is independent.

**Fix**: Create a `JobManager` that tracks all background jobs with a unified
`job.status` RPC method.

### 7. Thread Pool Sizing

**Issue**: RPC dispatch pool has 8 workers. Dashboard `_collect_metrics` creates
a new `ThreadPoolExecutor` with 6 workers each call. Performance metrics creates
another with 6 workers. Security sub-collectors create another with 4.

**Impact**: Up to 24 concurrent threads during a dashboard refresh. GIL contention.

**Fix**: Use a shared `ThreadPoolExecutor` for dashboard collectors. Reduce
sub-collector pools.

### 8. Stale Cache Risk

**Issue**: `_get_defender_status` has 60s TTL. If Defender is toggled, the
dashboard shows stale status for up to 60s. `_get_windows_update_status` has
300s TTL — pending updates can be stale for 5 minutes.

**Impact**: User sees outdated security status.

**Fix**: Acceptable for dashboard display. Add manual refresh button.

### 9. Frontend Re-renders

**Issue**: Dashboard polls `dashboard.live` every 2s, causing the entire
DashboardPage component tree to re-render. No `React.memo` on child components.

**Impact**: Unnecessary React reconciliation every 2s.

**Fix**: Wrap `HealthScoreCard`, `LiveStatus`, `HealthBreakdown`, and other
leaf components in `React.memo`.

### 10. No Module Shell Loading

**Issue**: System Info page shows nothing until `system.comprehensive` returns
(~2s). Dashboard shows "Calculating health score..." until metrics arrive.

**Impact**: User stares at blank/loading screen for 2s on module switch.

**Fix**: Render module shell immediately with cached/placeholder data. Fill in
real data progressively.

---

## Thread Architecture (Current)

```
Main Thread: stdin read loop
  └── ThreadPoolExecutor(8) "rpc-*"
        ├── dashboard.metrics → ThreadPoolExecutor(6) "dashboard-collect"
        │     ├── cpu, memory, storage, windows, security, performance
        │     │     ├── security → ThreadPoolExecutor(4)
        │     │     ├── windows → ThreadPoolExecutor(5)
        │     │     ├── performance → ThreadPoolExecutor(6)
        │     │     └── storage → ThreadPoolExecutor(N partitions)
        │     └── (nested pools!)
        ├── cleaner.scan.start → ThreadPoolExecutor(N cleaners)
        ├── disk_analyzer.scan → ThreadPoolExecutor(N)
        └── any other RPC call

Background Threads:
  ├── module-loader (imports all 16 modules sequentially)
  ├── live-metrics (2s refresh loop)
  ├── thread-count-refresh (30s refresh)
  ├── all-disks-ssd (one-time)
  ├── periodic-thread-count (30s)
  └── startup-apps-refresh (one-time)
```

**Problem**: Nested `ThreadPoolExecutor` calls create up to 24+ threads during
a single dashboard metrics collection. This causes GIL contention and thread
scheduling overhead.

## Proposed Thread Architecture

```
Main Thread: stdin read loop
  └── Shared ThreadPoolExecutor(8) "rpc-*"
        ├── dashboard.metrics (uses shared pool, no nested pools)
        ├── cleaner.scan.start (uses shared pool)
        └── any other RPC call

Background Threads:
  ├── module-loader (lazy, on-demand)
  ├── live-metrics (2s refresh, lightweight psutil only)
  ├── static-info-warmer (one-time, on first dashboard.metrics call)
  └── job-worker-pool (for long-running scans)
```

---

## Cache Inventory

| Cache | TTL | What | Invalidation | Stale Risk |
|-------|-----|------|--------------|------------|
| `_collect_metrics` | 15s | All dashboard metrics | Time | Low |
| `_all_disks_are_ssd` | 3600s | SSD detection | Time | None (hardware) |
| `_get_power_mode` | 30s | Power plan | Time | Low |
| `_get_secure_boot_status` | 3600s | Secure Boot | Time | None (firmware) |
| `_get_tpm_status` | 3600s | TPM presence | Time | None (hardware) |
| `_get_defender_status` | 60s | Defender status | Time | Medium |
| `_get_firewall_status` | 60s | Firewall status | Time | Medium |
| `_get_windows_update_status` | 300s | Windows Update | Time | Medium |
| `_get_smartscreen_status` | 300s | SmartScreen | Time | Low |
| `_get_third_party_antivirus` | 60s | 3rd-party AV | Time | Low |
| `_static_info_cache` (sysinfo) | None | Hardware info | Manual refresh | None |
| `_startup_cache` | None | Startup entries | On modify | Low |
| `_metrics_lock` (performance) | 2s | Performance metrics | Time | Low |

**Issues**:
- No cache for `_get_temp_files_size` result — re-scanned every 15s.
- No cache for `_estimate_browser_cache_size` — re-scanned every 15s.
- `_static_info_cache` has no TTL — lives forever until manual refresh. OK.
- `_startup_cache` has no TTL — lives forever until enable/disable. OK.

---

## Recommendations Summary

| Priority | Fix | Impact |
|----------|-----|--------|
| P0 | Lazy-load cleaner module singletons | -18s import time |
| P0 | Fix `_get_temp_files_size` with `os.scandir` | -15s per scan |
| P0 | Replace PowerShell with `winreg` for security | -2s per collector |
| P1 | Split static/dynamic dashboard metrics | -50% collector time |
| P1 | Fix `_get_dynamic_info` process iteration | -2s per call |
| P1 | Create centralized Job Manager | Unified scan control |
| P1 | Add `React.memo` to leaf components | -30% re-renders |
| P2 | Shared frontend metrics store | -50% duplicate RPC calls |
| P2 | Module shell loading | Instant module switch |
| P2 | Shared thread pool for collectors | -GIL contention |
