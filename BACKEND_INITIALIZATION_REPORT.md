# BACKEND INITIALIZATION REPORT

## AVS PC Optimizer — Backend Module Loading Analysis

**Generated:** 2026-07-22  
**Python:** 3.14  
**Platform:** Windows 10.0.26200  

---

## 1. Initialization Order

The RPC server (`rpc_server.py`) starts all feature module imports in a single background daemon thread (`module-loader`). The main thread immediately enters the stdin read loop, allowing the Electron bridge to send `system.ping` without waiting for all modules to finish loading.

### Module Loading Sequence

| # | Module | Status | Time (s) | Methods Registered |
|---|--------|--------|----------|-------------------|
| 1 | `avs_backend.common.job_rpc` | OK | 0.03 | 3 |
| 2 | `avs_backend.cleaner` | OK | 0.00 | 12 |
| 3 | `avs_backend.dashboard` | OK | 0.54 | 6 |
| 4 | `avs_backend.disk_analyzer` | OK | 1.46 | 3 |
| 5 | `avs_backend.drive_wiper` | OK | 4.59 | 3 |
| 6 | `avs_backend.duplicate_finder` | OK | 5.76 | 4 |
| 7 | `avs_backend.performance` | OK | 4.22 | 9 |
| 8 | `avs_backend.privacy` | OK | 2.02 | 3 |
| 9 | `avs_backend.registry_cleaner` | OK | 6.93 | 5 |
| 10 | `avs_backend.software_updater` | OK | 0.81 | 4 |
| 11 | `avs_backend.startup` | OK | 0.00 | 0 |
| 12 | `avs_backend.system_information` | OK | 0.00 | 14 |
| 13 | `avs_backend.uninstaller` | OK | 0.00 | 3 |
| 14 | `avs_backend.history` | OK | 0.01 | 7 |
| 15 | `avs_backend.notifications` | OK | 0.00 | 6 |
| 16 | `avs_backend.reporting` | OK | 0.01 | 3 |
| 17 | `avs_backend.settings` | OK | 0.00 | 6 |
| 18 | `avs_backend.undo` | OK | 0.01 | 8 |

**Total registered methods:** 105  
**Failed modules:** 0  
**Circular imports:** 0  

### Initialization Flow

```
rpc_server.py starts
  ↓
configure_logging()
  ↓
_build_method_to_module_map()
  ↓
Background thread "module-loader" starts
  ↓
For each module in _FEATURE_MODULES:
  importlib.import_module(module)
    → Module __init__.py executes
    → @register decorators run
    → Methods added to registry
  ↓
Main thread enters stdin read loop
  ↓
_dispatch() polls registry.get(method) until handler appears
  ↓
If module finished loading and handler still missing → error
```

---

## 2. Dashboard Module Registration

### Registration Chain

```
avs_backend.dashboard.__init__ imported
  ↓
@register("dashboard.metrics") decorator runs → handler added to registry
@register("dashboard.health") decorator runs → handler added to registry
@register("dashboard.live") decorator runs → handler added to registry
@register("dashboard.optimize.preview") decorator runs → handler added to registry
@register("dashboard.optimize.execute") decorator runs → handler added to registry
@register("dashboard.refreshCache") decorator runs → handler added to registry
  ↓
__all__ defined with 6 handler names
  ↓
Live metrics thread NOT started at import time (lazy start on first dashboard.live call)
```

### Registered Dashboard Methods

| Method | Handler Function |
|--------|-----------------|
| `dashboard.metrics` | `dashboard_metrics` |
| `dashboard.health` | `dashboard_health` |
| `dashboard.live` | `dashboard_live` |
| `dashboard.optimize.preview` | `dashboard_optimize_preview` |
| `dashboard.optimize.execute` | `dashboard_optimize_execute` |
| `dashboard.refreshCache` | `dashboard_refresh_cache` |

---

## 3. Root Cause of Previous "Module Failed to Load" Error

### Historical Issues (Now Fixed)

**Issue 1: Import Lock Deadlock**

The dashboard module previously started a background daemon thread (`_live_metrics_loop`) at import time. Python's import lock serializes module imports — if the background thread tried to import anything while the main thread was still importing modules, it could deadlock, causing the dashboard module to appear to fail to load.

**Fix:** Replaced import-time thread start with `_ensure_live_metrics_thread()` called lazily on the first `dashboard.live` RPC request.

**Issue 2: ThreadPoolExecutor Blocking on Shutdown**

Five `with ThreadPoolExecutor(...)` context managers throughout the dashboard used the context manager pattern, which calls `pool.shutdown(wait=True)` on exit. This **blocks until all threads finish**, even if `as_completed` already timed out. A single slow collector (e.g. browser cache scanning) would block the entire `dashboard.metrics` response for 30+ seconds, causing the RPC dispatch to time out and report "module failed to load".

**Fix:** Replaced all 5 context managers with manual `pool.shutdown(wait=False)` in:
- `_collect_metrics`
- `_get_security_metrics`
- `_get_performance_metrics`
- `_get_storage_metrics`
- `_get_windows_info`

**Issue 3: _ttl_cache Lock Contention**

The `@_ttl_cache` decorator used a `threading.Lock()` with no timeout. If a cached function was running in a background thread, calling it from another thread would block indefinitely on the lock.

**Fix:** Added 5-second timeout on lock acquisition; returns stale value or `None` if lock can't be acquired.

**Issue 4: Route Mismatch (Windows Health View Button)**

The dashboard's `buildCategoryDetails` function set the Windows Health card's path to `/system-info`, but the actual router route is `/system-information`. The wildcard route `*` redirected to `/dashboard`, making the View button appear to do nothing.

**Fix:** Changed `/system-info` → `/system-information` in `dashboard.utils.ts`.

---

## 4. Dependencies

### Module Dependencies

```
avs_backend.dashboard
  ├── psutil (system metrics)
  ├── subprocess (PowerShell calls)
  ├── winreg (Windows registry queries)
  ├── concurrent.futures.ThreadPoolExecutor (parallel collectors)
  ├── avs_backend.api.registry (RPC registration)
  ├── avs_backend.common.logging_setup
  └── avs_backend.cleaner (for optimize.execute)
```

### No Circular Imports Detected

All 18 modules load successfully without circular dependency errors.

---

## 5. RPC Method-to-Module Mapping

The `_build_method_to_module_map()` function maps RPC method prefixes to feature modules:

| Method Prefix | Module | Explicit? |
|--------------|--------|-----------|
| `cleaner` | `avs_backend.cleaner` | No (auto) |
| `dashboard` | `avs_backend.dashboard` | No (auto) |
| `disk` | `avs_backend.disk_analyzer` | **Yes** |
| `duplicate` | `avs_backend.duplicate_finder` | **Yes** |
| `job` | `avs_backend.common.job_rpc` | **Yes** |
| `updater` | `avs_backend.software_updater` | **Yes** |
| `wiper` | `avs_backend.drive_wiper` | **Yes** |
| `registry` | `avs_backend.registry_cleaner` | **Yes** |
| `system` | `avs_backend.system_information` | No (auto) |
| `metrics` | `avs_backend.performance` | No (auto) |
| `privacy` | `avs_backend.privacy` | No (auto) |
| `startup` | `avs_backend.startup` | No (auto) |
| `uninstaller` | `avs_backend.uninstaller` | No (auto) |
| `history` | `avs_backend.history` | No (auto) |
| `notifications` | `avs_backend.notifications` | No (auto) |
| `reporting` | `avs_backend.reporting` | No (auto) |
| `settings` | `avs_backend.settings` | No (auto) |
| `undo` | `avs_backend.undo` | No (auto) |

---

## 6. Startup Timing

| Phase | Duration |
|-------|----------|
| Logging setup | <1ms |
| Method-to-module map | <1ms |
| Module imports (total) | ~25-35s |
| First module ready (job_rpc) | 0.03s |
| Dashboard ready | 0.54s |
| All modules ready | ~25-35s |
| `system.ping` available | Immediately (registered in main thread) |

The slowest modules are `registry_cleaner` (~7s), `duplicate_finder` (~6s), `drive_wiper` (~5s), and `performance` (~5s) due to PowerShell calls and WMI queries during import.

---

## 7. Security Module Redesign

### Previous Approach (Flawed)

- Checked Windows Defender registry keys directly
- Used `_get_third_party_antivirus()` as a separate PowerShell call
- Reported "Windows Defender disabled" even when a third-party AV was active
- Firewall detection relied on Windows Firewall registry only
- Windows Updates only checked pending count, not service status

### New Approach (WSC-Based)

**Primary Source:** Windows Security Center (`root/SecurityCenter2` WMI namespace)

```
Windows Security Center (WSC)
  ↓
_query_wsc_products()
  → AntivirusProduct: all registered AV products
  → FirewallProduct: all registered firewall products
  ↓
_get_defender_status()
  → Checks if ANY AV product is active (including third-party)
  → If Trend Micro, Norton, Bitdefender, etc. is active → Protected ✅
  → Only reports issue if NO AV product is active
  ↓
_get_firewall_status()
  → Checks WSC for third-party firewall products
  → Falls back to Windows Firewall registry
  → Only reports disabled if NO firewall is active
  ↓
_get_windows_update_status()
  → Checks wuauserv service StartType (Automatic vs Disabled)
  → Queries pending updates via COM API
  → Reports "disabled" only if service is actually disabled
  → Reports "pending" if updates are waiting (warning, not issue)
```

### Key Principles

1. **No false alarms:** If a third-party AV is active, Windows Defender being disabled is EXPECTED — not an issue.
2. **Real verification:** Uses Windows Security Center API, not just registry checks.
3. **Accurate update status:** Distinguishes between "service disabled" (real issue) and "updates pending" (user action needed).
4. **SmartScreen:** Checks 3 registry locations (HKLM Explorer, HKLM Policies, HKCU Explorer).

---

## 8. Verification Results

### Backend Tests
- 12 pytest tests pass (dashboard + scan manager)
- Release audit: 0 issues, RELEASE READY
- All 105 RPC methods registered correctly
- All 18 modules load without errors

### Security Detection (Live System)
- **Antivirus:** Trend Micro Maximum Security detected via WSC → Protected ✅
- **Firewall:** Windows Firewall enabled via registry → Active ✅
- **Windows Updates:** wuauserv StartType=Automatic → Service enabled ✅
- **SmartScreen:** Not detected in any registry location → Real finding ⚠️

### Frontend Tests
- 10 vitest tests pass
- Route fix: `/system-info` → `/system-information` (Windows Health View button now works)
