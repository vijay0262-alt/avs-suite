# AVS PC Optimizer — Performance Profile

## Methodology

All measurements taken with `backend/profile_backend.py` on Windows 11,
Python 3.14.6, using `time.monotonic()` for wall-clock timing.

---

## 1. Module Import Times (Total: 24.65s)

| Module | Time (ms) | Severity |
|--------|-----------|----------|
| `avs_backend.cleaner` | 18,670 | **CRITICAL** |
| `avs_backend.privacy` | 1,697 | HIGH |
| `avs_backend.performance` | 1,682 | HIGH |
| `avs_backend.dashboard` | 776 | MEDIUM |
| `avs_backend.disk_analyzer` | 331 | LOW |
| `avs_backend.common.logging_setup` | 20 | OK |
| `avs_backend.api.registry` | 8 | OK |
| All other modules | <10 each | OK |

**Root cause**: `cleaner` module calls `all_cleaners()` at import time (line 44),
which instantiates 9 cleaner classes. The `HistoryStore` constructor opens a
SQLite database and runs schema creation. Sub-module imports chain-load
`scanner_base.py` which imports `psutil`, `pathlib`, and other heavy modules.

**Recommendation**: Lazy-load `all_cleaners()`, `ScanManager`, `CleaningManager`,
and `HistoryStore` on first RPC call, not at import time.
**Estimated improvement**: 18s → <0.5s import time.

---

## 2. Dashboard Metric Collectors

| Function | Avg (ms) | Max (ms) | Severity |
|----------|----------|----------|----------|
| `_get_performance_metrics` | 9,598 | 28,413 | **CRITICAL** |
| `_get_security_metrics` | 513 | 1,536 | HIGH |
| `_get_windows_info` | 255 | 708 | MEDIUM |
| `_get_cpu_metrics` | 11 | 11 | OK |
| `_get_memory_metrics` | 0.7 | 1.2 | OK |
| `_get_storage_metrics` | 2.4 | 2.8 | OK |
| `_collect_metrics` (cached) | 112 | 337 | OK |
| `_collect_metrics` (fresh) | 201 | 201 | OK |

### 2a. `_get_performance_metrics` — 9.6s avg, 28.4s max

**Sub-collectors** (run in parallel, max 10s timeout each):

| Sub-collector | Problem |
|---------------|---------|
| `_get_temp_files_size` | 17,822ms — scans up to 10,000 files via `os.walk` |
| `_estimate_browser_cache_size` | 201ms — scans up to 10,000 files |
| `_get_startup_apps_count` | Background-warmed, returns 0 if not ready |
| `_get_recycle_bin_size` | 0.1ms — OK |
| `_get_background_processes_count` | OK |
| `_get_memory_pressure` | OK |

**Root cause**: `_get_temp_files_size` walks `%TEMP%` and `%SystemRoot%\Temp`
calling `os.path.getsize()` on every file. With 10,000 file limit, this is
~17.8s of filesystem I/O.

**Recommendation**:
- Use `os.scandir()` instead of `os.walk()` — `DirEntry.stat()` is cached.
- Reduce `max_files` from 10,000 to 2,000.
- Cache result with 60s TTL instead of re-scanning every 15s.
- **Estimated improvement**: 17.8s → <2s.

### 2b. `_get_security_metrics` — 513ms avg, 1.5s max

**Sub-collectors**: defender status, firewall status, Windows updates,
SmartScreen. Each shells out to PowerShell.

| PowerShell call | Time (ms) | Cached? |
|-----------------|-----------|---------|
| `Get-MpComputerStatus` | 1,905 | 60s TTL |
| `Get-NetFirewallProfile` | 2,415 | 60s TTL |
| `Get-CimInstance SecurityCenter2` | ~2,000 | 60s TTL |
| Windows Update COM API | ~8,000 | 300s TTL |

**Root cause**: Each PowerShell call spawns a new `powershell.exe` process
(~400ms overhead) plus the query time.

**Recommendation**:
- Use Windows Registry reads (`winreg`) instead of PowerShell for
  Defender/SmartScreen status — <1ms vs 1900ms.
- Cache third-party AV detection for process lifetime (hardware doesn't change).
- **Estimated improvement**: 513ms → <50ms (after cache warm).

---

## 3. System Information

| Function | Avg (ms) | Severity |
|----------|----------|----------|
| `_get_dynamic_info` | 2,056 | **HIGH** |
| `system.comprehensive` | 1,888 | HIGH |
| `system.dynamic` | 1,933 | HIGH |
| `system.healthScore` | 51 | OK |
| `_get_static_info` (cached) | 0 | OK |
| `_get_static_info` (first) | 22 | OK |

**Root cause**: `_get_dynamic_info` calls `psutil.process_iter(['status'])`
which iterates all processes (~200-400) and queries each one's status.
This takes ~2s on Windows.

**Recommendation**:
- Replace `process_iter(['status'])` with `len(psutil.pids())` for process count.
- Skip "running" count — it requires per-process inspection.
- Poll dynamic info every 5s instead of 2s (static info is already cached).
- **Estimated improvement**: 2s → <50ms.

---

## 4. Startup Manager

| Function | Avg (ms) | Severity |
|----------|----------|----------|
| `startup.list` (first call) | 2,671 | HIGH |
| `startup.list` (cached) | 0 | OK |

**Root cause**: `scan_startup_entries()` reads registry keys and Task Scheduler.
No TTL — cache is only invalidated on enable/disable.

**Recommendation**: Add 60s TTL cache. Already background-warmed by dashboard.
**Estimated improvement**: Already cached after first call.

---

## 5. PowerShell Call Latency

| Call | Time (ms) | Cached? |
|------|-----------|---------|
| Process spawn overhead | 400 | N/A |
| `Get-PhysicalDisk` count | 2,687 | 3600s TTL |
| `Get-NetFirewallProfile` | 2,415 | 60s TTL |
| `Get-MpComputerStatus` | 1,905 | 60s TTL |
| `powercfg /getactivescheme` | 297 | 30s TTL |
| `Confirm-SecureBootUEFI` | ~400 | 3600s TTL |
| `(Get-Tpm).TpmPresent` | ~400 | 3600s TTL |

**Root cause**: Each PowerShell call spawns a new process. Windows PowerShell
startup alone takes ~400ms. WMI/CIM queries add 1-2s on top.

**Recommendation**:
- Replace PowerShell calls with `winreg` (registry reads) where possible.
- Batch multiple PowerShell queries into a single script.
- Use `powershell -Command` with combined queries.
- **Estimated improvement**: 2.7s → <10ms for registry-based queries.

---

## 6. Filesystem Scan Speed

| Function | Time (ms) | Severity |
|----------|-----------|----------|
| `_get_temp_files_size` | 17,822 | **CRITICAL** |
| `_estimate_browser_cache_size` | 201 | OK |
| `_get_recycle_bin_size` | 0.1 | OK |

**Root cause**: `os.walk()` + `os.path.getsize()` does two stat calls per file
(one from walk, one from getsize). With 10,000 files, that's 20,000 syscalls.

**Recommendation**: Use `os.scandir()` with `DirEntry.stat()` — single stat
call per file, and entries are cached by the OS.
**Estimated improvement**: 17.8s → <3s.

---

## 7. RPC & IPC Latency

| Layer | Latency |
|-------|---------|
| Electron → Python (stdin/stdout) | <1ms |
| Python dispatch (ThreadPoolExecutor) | <1ms |
| Handler wait for module load | up to 90s |
| Frontend polling interval (dashboard.live) | 2000ms |
| Frontend polling interval (junk scan) | 250ms |
| Frontend polling interval (junk clean) | 300ms |
| Frontend polling interval (sysinfo dynamic) | 2000ms |

**Issues**:
- Dashboard polls `dashboard.live` every 2s — OK for live metrics.
- Dashboard calls `dashboard.metrics` once on load — OK.
- System Info polls `system.dynamic` every 2s — too frequent for 2s operation.
- Security page calls `dashboard.metrics` on mount — duplicates dashboard load.

**Recommendation**:
- Increase system.dynamic poll to 5s.
- Share dashboard metrics across pages (singleton store).
- **Estimated improvement**: 50% reduction in RPC calls.

---

## 8. Frontend Performance

### Already optimized:
- ✅ All pages lazy-loaded with `React.lazy()` + `Suspense`
- ✅ Module preloader preloads frequently used pages after 1s
- ✅ `useMemo` for ViewModel instances
- ✅ `useMemo` for filtered/sorted lists
- ✅ `useCallback` for event handlers in SecurityPage
- ✅ Virtual scrolling in DetailsTable (`react-window`)
- ✅ Error boundaries on every route

### Missing:
- ❌ No `React.memo` on any component — all child components re-render on parent state change
- ❌ `HealthScoreCard` not memoized — re-renders on every dashboard poll
- ❌ `HealthBreakdown` not memoized
- ❌ `LiveStatus` not memoized
- ❌ `StartupEntryCard` not memoized
- ❌ `SecurityItem` not memoized
- ❌ No shared state between Security page and Dashboard — duplicate RPC calls

**Recommendation**: Wrap all leaf components in `React.memo`.
**Estimated improvement**: 30-50% reduction in unnecessary re-renders.

---

## Summary of Critical Bottlenecks

| # | Bottleneck | Time | Fix | After |
|---|-----------|------|-----|-------|
| 1 | `_get_temp_files_size` | 17.8s | `os.scandir()` + reduce max_files | <2s |
| 2 | Cleaner module import | 18.7s | Lazy-load singletons | <0.5s |
| 3 | `_get_dynamic_info` | 2.1s | Remove `process_iter` | <50ms |
| 4 | PowerShell calls | 2.7s each | Use `winreg` | <10ms |
| 5 | `_get_security_metrics` | 513ms | Registry-based queries | <50ms |
| 6 | No React.memo | varies | Wrap components | 30-50% fewer renders |
| 7 | Duplicate RPC calls | varies | Shared metrics store | 50% fewer calls |
