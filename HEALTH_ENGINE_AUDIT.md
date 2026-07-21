# Health Engine Audit Report

## Overview

This document details every dashboard metric in the AVS PC Optimizer: its calculation, measurement source, backend function, refresh frequency, and potential staleness.

---

## 1. Health Score (Overall)

| Property | Value |
|---|---|
| **Calculation** | Weighted composite of 6 category scores: Storage (20%), Performance (25%), Security (20%), Startup (15%), Privacy (10%), Windows Health (10%) |
| **Measurement** | Computed client-side from `DashboardMetrics` via `calculateHealthScore()` in `dashboard.utils.ts` |
| **Backend Source** | `dashboard.metrics` RPC → `_collect_metrics()` in `backend/src/avs_backend/dashboard/__init__.py` |
| **Refresh Frequency** | Every 2 seconds (live metrics poll), recalculated on every `loadMetrics()` call |
| **Staleness Potential** | Up to 15 seconds (backend TTL cache on `_collect_metrics`). Invalidated immediately after optimization via `dashboard.refreshCache` RPC. |
| **Fake Values Removed** | `bootImprovementSeconds`, `memoryRecovery`, `recoverableSpace` (as predictions) — all removed. Replaced with real measured values: `tempFilesSize`, `startupAppsEnabled`, `recycleBinSize`. |

---

## 2. Category Scores

### 2.1 Storage Score

| Property | Value |
|---|---|
| **Calculation** | `driveUsageScore - junkPenalty` where `driveUsageScore = average(100 - drive.usage * 1.1)` and `junkPenalty = min(30, log10(potentialRecoverable_MB + 1) * 5)` |
| **Measurement** | Drive usage from `psutil.disk_partitions()` + `psutil.disk_usage()`. Junk size from `_get_temp_files_size()`, `_get_recycle_bin_size()`, `_estimate_browser_cache_size()`. |
| **Backend Source** | `dashboard.metrics` → `_collect_metrics()` → `_get_storage_info()` |
| **Refresh Frequency** | 2 seconds (poll), 15 seconds (TTL cache) |
| **Staleness Potential** | Drive usage changes slowly. Junk sizes can change with user activity. Cache invalidated post-optimization. |

### 2.2 Startup Score

| Property | Value |
|---|---|
| **Calculation** | `100 - startupPenalty` where `startupPenalty = min(50, startupApps * 5)` |
| **Measurement** | Count of enabled startup entries from `startup.list` RPC → `startup_manager.py` scanning registry Run keys |
| **Backend Source** | `dashboard.metrics` → `_collect_metrics()` → `performance.startupApps` field |
| **Refresh Frequency** | 2 seconds (poll), 15 seconds (TTL cache). Startup list cached separately in `startup/__init__.py`. |
| **Staleness Potential** | Startup entries change rarely. Cache invalidated when user disables/enables entries. |

### 2.3 Privacy Score

| Property | Value |
|---|---|
| **Calculation** | `100 - privacyRisks * 10` where `privacyRisks` = number of browsers with detectable traces |
| **Measurement** | `privacyService.detectBrowsers()` RPC → counts browsers with cache/cookies/history |
| **Backend Source** | `privacy.detect` RPC in `backend/src/avs_backend/privacy/privacy_cleaner.py` |
| **Refresh Frequency** | Loaded once at bootstrap, reloaded after optimization. Not polled. |
| **Staleness Potential** | Can become stale if user browses the web after initial load. Recalculated after optimization. |

### 2.4 Performance Score

| Property | Value |
|---|---|
| **Calculation** | `(cpuScore + memoryScore) / 2` where each = `100 - usage * 1.1` |
| **Measurement** | `psutil.cpu_percent(interval=0.01)` and `psutil.virtual_memory()` |
| **Backend Source** | `dashboard.metrics` → `_collect_metrics()` → `_get_cpu_metrics()`, `_get_memory_metrics()` |
| **Refresh Frequency** | 2 seconds (live metrics poll) |
| **Staleness Potential** | CPU/memory change rapidly. The 0.01s interval sample is near-real-time. Live metrics poll provides continuous updates. |

### 2.5 Security Score

| Property | Value |
|---|---|
| **Calculation** | `100 - penalties` where: Defender disabled (-30), RTP off (-20), Firewall off (-25), SmartScreen off (-10), pending updates (-15) |
| **Measurement** | Windows Security Center API via `psutil` and WMI queries |
| **Backend Source** | `dashboard.metrics` → `_collect_metrics()` → `_get_security_info()` |
| **Refresh Frequency** | 2 seconds (poll), 15 seconds (TTL cache) |
| **Staleness Potential** | Security state changes rarely (user toggles). Cache is adequate. |

### 2.6 Windows Health Score

| Property | Value |
|---|---|
| **Calculation** | `100` if uptime < 30 days, `70` if uptime > 30 days |
| **Measurement** | System boot time from `psutil.boot_time()` → uptime = `time.time() - boot_time` |
| **Backend Source** | `dashboard.metrics` → `_collect_metrics()` → `windows.uptime` field |
| **Refresh Frequency** | 2 seconds (poll), 15 seconds (TTL cache) |
| **Staleness Potential** | Uptime only changes on reboot. No staleness concern. |

---

## 3. Issues List

| Property | Value |
|---|---|
| **Calculation** | Built from real `DashboardMetrics` thresholds in `buildAllIssues()` — no predictions |
| **Categories** | Storage (temp files >50MB, recycle bin >50MB, browser cache >100MB, drive >80%/90%), Startup (enabled apps count), Privacy (browsers with traces, cache >100MB), Performance (CPU >60%/80%, RAM >70%/85%), Security (Defender/Firewall/RTP disabled, pending updates), Windows (uptime >30 days) |
| **Measurement** | Each issue has `measurableValue` and `measurableUnit` (bytes, count, percent, none) |
| **Source** | `dashboard.utils.ts` → `buildStorageIssues()`, `buildStartupIssues()`, `buildPrivacyIssues()`, `buildPerformanceIssues()`, `buildSecurityIssues()`, `buildWindowsIssues()` |
| **Refresh Frequency** | Recalculated on every `loadMetrics()` and `loadPrivacyRisks()` call |
| **Staleness Potential** | Same as underlying metrics (2s poll, 15s TTL cache) |
| **Clickability** | Each issue has `actionPath` linking to the relevant tool page. `canAutoFix` indicates if the Optimize flow can address it. |

---

## 4. Recoverable Space

| Property | Value |
|---|---|
| **Calculation** | `tempFilesSize + recycleBinSize + browserCacheSize` — sum of real measured values |
| **Measurement** | `_get_temp_files_size()` walks `%TEMP%`, `_get_recycle_bin_size()` queries Recycle Bin, `_estimate_browser_cache_size()` walks browser cache directories |
| **Backend Source** | `dashboard.metrics` → `_collect_metrics()` → `performance` fields |
| **Refresh Frequency** | 2 seconds (poll), 15 seconds (TTL cache) |
| **Staleness Potential** | Files may be locked/in-use, causing actual cleaned size to differ. Post-optimization, cache is invalidated and fresh measurements are taken. |
| **Fake Values Removed** | Previously showed `potentialRecoverable` as a prediction. Now shows `measuredRecoverableSpace` = sum of actual measured component sizes. |

---

## 5. Optimization Results

| Property | Value |
|---|---|
| **Calculation** | Actual before/after measurement: `size_before = measure()`, `clean()`, `size_after = measure()`, `recovered = max(0, size_before - size_after)` |
| **Measurement** | Each optimization module measures before and after using the same measurement function |
| **Backend Source** | `dashboard.optimize.execute` RPC in `backend/src/avs_backend/dashboard/__init__.py` |
| **Refresh Frequency** | One-time per optimization run. Results are session-scoped. |
| **Staleness Potential** | Results are point-in-time. Dashboard refreshes after optimization to show new state. |
| **Fake Values Removed** | Previously showed `estimatedRecovery`, `bootImprovementSeconds`, `ramRecovery`, `tracesRemoved` as predictions. All removed. Now shows only actual measured `filesDeleted`, `bytesRecovered`, `entriesDisabled`, `itemsRemoved`, `issuesFixed`. |

---

## 6. Health Scan Flow

### Flow Steps (Simplified)

1. **Scanning** — Runs 8 module scans in parallel (junk, startup, privacy, performance, disk, registry, security, system)
2. **Report** — Shows scan results with real measured values per module. "Optimize Now" button if fixable modules exist.
3. **Optimizing** — Executes all fixable modules automatically (no manual selection needed)
4. **Verifying** — Runs a fresh health scan to measure actual changes
5. **Complete** — Shows before/after health score, actual bytes recovered, files deleted, entries disabled, items removed, issues fixed

### Removed Steps

- **Preview** (removed) — Previously showed fake predicted health score improvement
- **Selection** (removed) — Previously required user to manually select/deselect categories with fake predictions

---

## 7. Dashboard Sync

| Property | Value |
|---|---|
| **Mechanism** | After optimization: `refreshCache()` → `loadMetrics()` → `recalculateHealth()` → new `HealthSnapshot` |
| **Cache Invalidation** | `dashboard.refreshCache` RPC clears `_collect_metrics` TTL cache |
| **Guarantee** | UI is guaranteed to reflect verified, current data by the time optimization completes (both reloads are awaited) |
| **Live Polling** | `loadLiveMetrics()` runs every 2 seconds for CPU/memory/disk real-time display |

---

## 8. HealthSnapshot (Canonical Object)

```
HealthSnapshot {
  timestamp: string          // ISO timestamp of last calculation
  overallScore: number       // 0-100, weighted composite
  categoryScores: CategoryScores  // 6 category scores (storage, startup, privacy, performance, security, windows)
  status: HealthStatus       // excellent | good | fair | poor | critical
  issues: HealthIssue[]      // Every detected issue, categorized, clickable
  summary: HealthSummaryItem[]  // Human-readable summary derived from issues
  categoryDetails: HealthCategoryDetail[]  // Per-category breakdown with action paths
  measuredRecoverableSpace: number  // Sum of temp + recycle + browser cache (bytes)
  startupAppsEnabled: number  // Count of enabled startup apps
  tempFilesSize: number      // Measured temp files size (bytes)
  browserCacheSize: number   // Measured browser cache size (bytes)
  recycleBinSize: number     // Measured recycle bin size (bytes)
}
```

### HealthIssue

```
HealthIssue {
  id: string                 // Unique identifier
  category: HealthCategory   // storage | startup | privacy | performance | security | windows
  title: string              // Short title
  detail: string             // Human-readable detail with measured values
  severity: 'low' | 'medium' | 'high'
  measurableValue: number    // The actual measured value
  measurableUnit: 'bytes' | 'count' | 'percent' | 'none'
  actionPath: string         // Navigation path to the relevant tool
  canAutoFix: boolean        // Whether the Optimize flow can address this
}
```

---

## 9. Startup Manager

| Property | Value |
|---|---|
| **Default Filter** | "Enabled Only" — disabled entries hidden by default |
| **Disable Flow** | `startup.disable` RPC → backup created → registry/folder/task entry disabled → cache invalidated → list reloaded |
| **After Disable** | `loadEntries()` always called (even on failure) to ensure UI reflects current state |
| **Backend Safety** | Critical system entries and Microsoft-signed entries are protected from disabling |

---

## 10. Backend Cache Architecture

| Cache | Location | TTL | Invalidation |
|---|---|---|---|
| `_collect_metrics` | `dashboard/__init__.py` | 15 seconds | `dashboard.refreshCache` RPC, auto-invalidated after `dashboard.optimize.execute` |
| `_static_info_cache` | `system_information/__init__.py` | Permanent (until `system_refresh_cache`) | `system.refresh_cache` RPC |
| `startup_cache` | `startup/__init__.py` | 60 seconds | Invalidated on disable/enable operations |
| `live_metrics` | `dashboard/__init__.py` | Background thread, 2s refresh | Continuous background update |

---

## 11. Summary of Changes

### Removed Fake Values
- `bootImprovementSeconds` — was `Math.min(60, startupApps * 1.5)` (fake linear estimate)
- `memoryRecovery` — was `metrics.memory.cached` (not actual recoverable memory)
- `recoverableSpace` as prediction — replaced with `measuredRecoverableSpace` (sum of real measured components)
- `estimatedImprovement` — replaced with `measuredDetail` (factual description of what was found)
- `estimatedRecovery` — removed from OptimizationDetails
- `ramRecovery` — removed from OptimizationDetails
- `tracesRemoved` — removed from OptimizationDetails (was a pre-scan prediction)
- Predicted health score in selection screen — entire selection step removed
- Fake "remaining time" estimate in scanning step — removed

### Added Real Measurements
- `HealthSnapshot` canonical type as single source of truth
- `HealthIssue` type with `measurableValue` and `measurableUnit` for every issue
- Before/after measurement for every optimization module
- `IssuesList` component showing categorized, clickable issues
- Honest "no measurable improvement" message when optimization yields no results
- Honest "score remained at X" message when health score doesn't change

### Simplified Flow
- Removed "Preview" step (fake predictions)
- Removed "Selection" step (manual category selection with fake predictions)
- New flow: Scan → Report → Optimize Now → Verifying → Complete (5 steps, down from 7)
- Auto-selects all fixable modules (no manual toggling needed)
