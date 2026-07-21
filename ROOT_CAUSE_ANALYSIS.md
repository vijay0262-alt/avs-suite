# Root Cause Analysis — Dashboard Does Not Reflect Optimization Results

**Status:** Diagnosis only. No code has been changed as part of this investigation.

---

## TASK 1 — Complete Data Flow Trace

Every value on the Dashboard traces back through the same five-layer pipeline:

```
Python RPC handler (backend)
      ↓
dashboard.service.ts (RPC wrapper)
      ↓
DashboardViewModel.ts (state + calculation)
      ↓
React state (via useViewModel/setState)
      ↓
Dashboard components (render)
```

| Layer | File | Responsibility |
|---|---|---|
| Source RPC | `backend/src/avs_backend/dashboard/__init__.py` | `dashboard.metrics`, `dashboard.live`, `dashboard.health`, `dashboard.optimize.execute` |
| Source object | `_collect_metrics()` return dict (backend), `_live_metrics` global dict (backend) | Raw metrics snapshot |
| Cache layer | `_ttl_cache(15.0)` wrapping `_collect_metrics()` (backend, module-level, process-lifetime) | 15-second in-memory cache, one instance for the whole app |
| ViewModel property | `DashboardViewModel.state.metrics`, `state.liveMetrics`, `state.privacyRisks`, `state.healthScore`, `state.healthScanReport` | Client-side state |
| React state | `useViewModel(vm)` in `DashboardPage.tsx` (`apps/pc-optimizer/src/features/dashboard/DashboardPage.tsx:17-18`) | Triggers re-render on `setState` |
| Rendering component | `HealthScoreCard`, `HealthBreakdown`, `HealthSummary`, `LiveStatus` (`apps/pc-optimizer/src/features/dashboard/components/*.tsx`) | Final UI |

---

## TASK 2 — Per-Card Source Mapping

| Dashboard Card | Bound state | Ultimate source | Cached? |
|---|---|---|---|
| Health Score | `state.healthScore.overallScore` | `calculateHealthScore(state.metrics, state.privacyRisks)` — **frontend** util, `dashboard.utils.ts:241` | Yes — inherits `state.metrics` staleness (15s backend cache) |
| Issues Found | `state.healthScore.issuesFound` | Same `calculateHealthScore()` call, counts `summary` entries with `warning`/`danger` severity | Yes — same cache |
| Recoverable Space | `state.healthScore.recoverableSpace` | `metrics.performance.potentialRecoverable` (from `_collect_metrics()` → `_get_performance_metrics()`) | Yes — same cache |
| Storage (category card) | `state.healthScore.categoryDetails` (id `storage`) | `buildCategoryDetails()` in `dashboard.utils.ts`, driven by `metrics.storage` | Yes — same cache |
| Memory (category card) | `state.healthScore.categoryDetails` (id `memory`) | `metrics.memory.usage` | Yes — same cache |
| Startup (category card) | `state.healthScore.categoryDetails` (id `startup`) | `metrics.performance.startupApps` | Yes — same cache |
| Privacy (category card) | `state.healthScore.categoryDetails` (id `privacy`) | `state.privacyRisks` (NOT `metrics`) | **Never refreshed after bootstrap** — separate, unrelated staleness bug (see Task 4) |
| Performance (category card) | `state.healthScore.categoryDetails` (id `performance`) | `metrics.performance.*`, `metrics.cpu.usage`, `metrics.memory.usage` | Yes — same cache |
| Security (category card) | `state.healthScore.categoryDetails` (id `security`) | `metrics.security.*` | Yes — same cache |
| Live Status widgets | `state.liveMetrics` | `dashboard.live` RPC → `_live_metrics` global dict, refreshed every **1 second** by a background thread (`_live_metrics_loop`) | **No** — this is the one part of the dashboard that is NOT stale |

**Conclusion for Task 2:** Every card except Live Status and the Privacy card comes from `dashboard.metrics` → `_collect_metrics()`, which is wrapped in a 15-second TTL cache (`old cache`). None of them come from `healthScanReport` or the verification scan. The Privacy card comes from a value (`state.privacyRisks`) that is fetched once at bootstrap and never reloaded at all.

---

## TASK 3 — Why Values Differ After Optimization

Sequence observed when the user runs "Improve PC Health" and executes optimizations (`DashboardViewModel.executeHealthScanOptimizations`, lines 684-745):

1. **Before optimization**: `state.healthScanReport` (the "before" report) is captured into `state.healthScanBeforeReport`. This was built from fresh, independent scans (`junkCleanerService`, `startupService`, `privacyService`, etc.) — **not** from `state.metrics`.
2. **Real actions execute**: `executeModuleAction()` calls real RPCs (`dashboard.optimize.execute`, `privacy.clean`, `startup.disable`, `registry.clean`). These genuinely modify the system.
3. **Verification scan runs**: `runHealthScan('verify')` re-invokes the same independent scan RPCs (junk cleaner scan, `startupService.listEntries()`, `privacyService.scan()`, etc.). These RPCs are **not** covered by the `_collect_metrics` TTL cache, so they return fresh, verified data. This is why `healthScanReport` (shown inside `HealthScanModal`) correctly reflects improvement.
4. **Dashboard refresh attempt**: After verification, the code does:
   ```ts
   void this.loadMetrics();
   ```
   (`DashboardViewModel.ts:738`) — fire-and-forget, not awaited, and not followed by any UI-blocking indicator.
5. **`loadMetrics()` calls `dashboard.metrics`**, which calls backend `_collect_metrics()`. Because this function is wrapped in `_ttl_cache(15.0)` and nothing has called `.cache_clear()`, the backend returns the **exact same cached dict** it returned before optimization (the "before" snapshot) if less than 15 seconds have elapsed — which is virtually guaranteed given how fast the whole scan → optimize → verify cycle runs.
6. **`recalculateHealth()` runs `calculateHealthScore(metrics, privacyRisks)`** on this stale `metrics` object, producing the identical Health Score, Issues Found, and category numbers as before optimization.
7. **`state.privacyRisks`** is never reloaded at all after optimization (`loadPrivacyRisks()` is only called from `bootstrapData()`), so the Privacy card is stale for a second, independent reason.

**Displayed UI value vs. reality:**
- `healthScanReport` (inside the modal) = fresh, correct, improved.
- `state.healthScore` / `state.metrics` (main Dashboard cards) = stale, unchanged, because of the backend cache and the un-refreshed `privacyRisks`.

This is the exact discrepancy described in the bug report.

---

## TASK 4 — Stale Cache Inventory

| Cache | Owner | Refreshes | Expires | Why it doesn't refresh after optimization |
|---|---|---|---|---|
| `_collect_metrics()` TTL cache | `backend/src/avs_backend/dashboard/__init__.py:35-58` (`_ttl_cache` decorator applied at line 93) | On next call, only if TTL has elapsed | 15.0 seconds, process-lifetime (module-level closure, never reset on restart of scans) | Nothing in `dashboard.optimize.execute`, `privacy.clean`, `startup.disable`, `registry.clean`, or the health-scan verification flow calls `_collect_metrics.cache_clear()`. The cache has no awareness that an optimization happened. |
| `state.privacyRisks` (frontend, not a TTL cache but a "load-once" value) | `DashboardViewModel` | Only via explicit call to `loadPrivacyRisks()` | Never (no TTL — it is simply never re-fetched) | `loadPrivacyRisks()` is only invoked once, from `bootstrapData()`. `executeHealthScanOptimizations()` never calls it again, even though the Privacy Cleaner module may have just run. |
| `_all_disks_are_ssd()` TTL cache | backend, line 997 | On next call, if TTL elapsed | 3600 seconds (1 hour) | Correct behavior — hardware type does not change at runtime. Not a bug, but noted since it is a similar pattern. |
| `_get_power_mode()` TTL cache | backend, line 1066 | On next call, if TTL elapsed | 30 seconds | Not implicated in this bug (power mode is not displayed on Dashboard cards in question), but same pattern risk. |
| `dashboard.live` background snapshot (`_live_metrics`) | backend, `_live_metrics_loop` thread | Every 1 second, continuously | N/A — always fresh within 1s | Not a bug — this is the one metrics source that is not gated behind a stale TTL cache, which is why "Live Status" widgets are always current even when the rest of the Dashboard is stale. |

**Primary offender:** the `_collect_metrics()` 15-second TTL cache. It is invisible to every RPC that performs a real optimization action, so no code path exists that tells it "the underlying data just changed, throw away your cached copy."

---

## TASK 5 — Required Automatic Sequence (Current State: Missing)

The requested sequence:

```
Invalidate dashboard cache
Invalidate module caches
Reload dashboard metrics
Reload health summary
Reload category cards
Reload health score
Reload recommendations
Trigger one React render
```

**Current implementation** (`executeHealthScanOptimizations`, `DashboardViewModel.ts:684-745`) only does:

```ts
await this.runHealthScan('verify');       // refreshes healthScanReport only
this.setState({ healthScanModules, healthScanResult });
void this.loadMetrics();                  // fire-and-forget, hits stale backend cache
```

Gaps identified:
- No call to invalidate `_collect_metrics.cache_clear()` (or equivalent) on the backend — **cache is never invalidated**.
- No call to `loadPrivacyRisks()` — **privacy risk count is never reloaded**.
- `loadMetrics()` is not awaited, so there's no guarantee it finishes, or even starts, before the UI is considered "done."
- Because `calculateHealthScore()`, `buildCategoryDetails()`, and `buildSummary()` are all internally called by `recalculateHealth()` inside `loadMetrics()`, "health summary," "category cards," and "health score" are technically all recomputed together in one function — but only if `loadMetrics()` actually receives fresh data, which it does not, due to the cache.
- "Recommendations" (`healthScore.suggestions`, via `buildSuggestions(metrics)`) suffer the same staleness since they are derived from the same stale `metrics` object.
- There is exactly one `setState` call inside `loadMetrics()`/`recalculateHealth()`, so "trigger one React render" is already structurally satisfied *if* the underlying data were fresh — the render mechanics are not the problem; the data going into that render is.

---

## TASK 6 — Duplicate Health Score Calculations (Found: 3 independent sources)

| # | Location | Status | Formula characteristics |
|---|---|---|---|
| 1 | `calculateHealthScore()` — `apps/pc-optimizer/src/features/dashboard/dashboard.utils.ts:241-319` | **Active** — this is the ONLY one driving the main Dashboard (`HealthScoreCard`, `HealthBreakdown`, `HealthSummary`) | Weights: cpu 0.20, memory 0.20, storage 0.25, security 0.20, performance 0.15. Runs entirely client-side against `state.metrics` + `state.privacyRisks`. |
| 2 | `dashboard_health()` RPC — `backend/src/avs_backend/dashboard/__init__.py:262-312` (registered as `dashboard.health`, exposed via `dashboardService.getHealthScore()` in `dashboard.service.ts:23`) | **Dormant** — the service method exists but `DashboardViewModel` never calls it | Weights: cpu 0.25, memory 0.25, storage 0.20, security 0.15, performance 0.15 — **different weights** from #1. Score-band thresholds (`_calculate_cpu_score`, `_calculate_memory_score`, etc., lines 688-793) are also different curves than the frontend's `scoreFromUsage()`. If ever wired up, it would return a **different number** than #1 for the same underlying metrics. |
| 3 | `finishHealthScan()` average — `apps/pc-optimizer/src/features/dashboard/DashboardViewModel.ts:322-389` | **Active** — drives `healthScanReport.overallScore`, shown only inside `HealthScanModal` | Simple unweighted average of 8 ad-hoc per-module scores (junk, startup, privacy, performance, disk, registry, security, system), each computed inline inside `runHealthScan()` (lines 419-649) with its own bespoke formula (e.g. junk: `100 - min(issues/100, 100)`; startup: `100 - high.length*5`; disk: `100 - full.length*25 - avgPercent/2`). None of these per-module formulas match either #1's or #2's category scoring. |

**Conclusion for Task 6:** There is no single canonical Health Score. Sources #1 and #3 are both active simultaneously and shown in different parts of the UI (main Dashboard vs. Health Scan modal), using entirely different inputs, weights, and formulas. Source #2 is unused dead code that represents a third, incompatible formula and is a latent trap for future regressions (e.g., if a developer "helpfully" wires `getHealthScore()` into the UI, a fourth divergent number would appear).

---

## TASK 7 — Root Cause Analysis Summary

### Problem
After a Health Scan optimization completes and its verification scan confirms real improvements, the main Dashboard (Health Score, Issues Found, Storage, Startup, Privacy, Performance cards) continues to display pre-optimization values.

### Root Cause
Two independent defects compound to produce the symptom:

1. **Backend cache invalidation gap.** `dashboard.metrics` is served by `_collect_metrics()`, which is wrapped in a process-lifetime, 15-second `_ttl_cache`. No optimization/cleaning RPC (`dashboard.optimize.execute`, `privacy.clean`, `startup.disable`, `registry.clean`) invalidates this cache. When the frontend calls `loadMetrics()` immediately after verification (which happens well within the 15-second window), the backend returns the identical stale snapshot it served before optimization.

2. **Missing/incomplete frontend refresh.** `executeHealthScanOptimizations()` triggers `void this.loadMetrics()` as a fire-and-forget call and never calls `loadPrivacyRisks()` again. Even if the backend cache were fixed, the Privacy category would still remain stale because its source (`state.privacyRisks`) is only ever fetched once, at bootstrap.

A third, related but distinct defect (Task 6) means that even after the above two are fixed, the number that would appear on the Dashboard is computed by a completely different formula (`calculateHealthScore()`, frontend) than the one shown as "improved" inside the Health Scan modal (`finishHealthScan()`'s module average). Fixing only the caching will make the Dashboard number move, but it is not guaranteed to visually match, or move by the same amount as, the number the user just saw in the "Verification Result" screen — because they are not the same calculation.

### Files Involved
- `backend/src/avs_backend/dashboard/__init__.py` — `_ttl_cache`, `_collect_metrics`, `dashboard_metrics`, `dashboard_health`, `dashboard_optimize_execute`
- `apps/pc-optimizer/src/features/dashboard/DashboardViewModel.ts` — `loadMetrics`, `loadPrivacyRisks`, `recalculateHealth`, `runHealthScan`, `finishHealthScan`, `executeHealthScanOptimizations`
- `apps/pc-optimizer/src/features/dashboard/dashboard.utils.ts` — `calculateHealthScore`, `buildSummary`, `buildCategoryDetails`
- `apps/pc-optimizer/src/features/dashboard/dashboard.service.ts` — `getHealthScore` (unused, dead RPC path)
- `apps/pc-optimizer/src/features/dashboard/DashboardPage.tsx`, `components/HealthScoreCard.tsx`, `components/HealthBreakdown.tsx`, `components/HealthSummary.tsx`, `components/LiveStatus.tsx` — render layer, confirmed to bind exclusively to `state.healthScore` / `state.liveMetrics`

### Functions Involved
- Backend: `_ttl_cache()`, `_collect_metrics()`, `dashboard_metrics()`, `dashboard_health()`, `dashboard_optimize_execute()`
- Frontend: `DashboardViewModel.loadMetrics()`, `loadPrivacyRisks()`, `recalculateHealth()`, `runHealthScan()`, `finishHealthScan()`, `executeHealthScanOptimizations()`, `dashboard.utils.calculateHealthScore()`

### Why Verification Succeeds
The verification scan (`runHealthScan('verify')`) calls independent module RPCs (junk cleaner scan, `startupService.listEntries()`, `privacyService.scan()`, `registryService.scan()`, `performanceService.getMetrics()`, `diskAnalyzerService.listDrives()`, `systemInfoService.getComprehensiveInfo()`) that are **not** behind the `_collect_metrics` TTL cache. They query live system state directly, so they correctly reflect the just-completed optimization.

### Why the Dashboard Remains Stale
The main Dashboard exclusively derives `state.healthScore` from `state.metrics`, which comes from `dashboard.metrics` → `_collect_metrics()`. That function's 15-second TTL cache is never invalidated by any optimization action, so the post-optimization `loadMetrics()` call returns the pre-optimization snapshot. Additionally, `state.privacyRisks` (used for the Privacy category card) is never re-fetched after bootstrap at all, regardless of caching.

### Recommended Fix (diagnosis only — not implemented)
1. Add a cache-invalidation hook: expose `_collect_metrics.cache_clear()` (or a shared invalidation function) and call it from `dashboard_optimize_execute()` and from the health-scan verification completion path (or have the frontend pass a `forceRefresh` flag through to a new/adjusted RPC).
2. After `runHealthScan('verify')` completes in `executeHealthScanOptimizations()`, await (not fire-and-forget) a full refresh: `loadMetrics()` **and** `loadPrivacyRisks()`, ensuring the backend cache is bypassed for that specific call.
3. Consolidate Health Score calculation into a single canonical source. Decide whether the source of truth is the frontend `calculateHealthScore()` or the backend `dashboard_health()`, retire the other, and make `finishHealthScan()`'s module-average score either (a) purely informational/module-level and clearly labeled as distinct from the overall Health Score, or (b) feed into the same canonical calculation so the number the user sees in the verification modal and the number they see on the Dashboard are guaranteed to match.
4. Consider removing or clearly marking `dashboard_health()` / `getHealthScore()` as deprecated dead code to prevent a future accidental fourth source of truth.

---

## Notes on Tasks Not Requiring Code Changes

- **Task 3 logging**: There is currently no per-run log that captures "before optimization / verification result / dashboard state / react state / displayed UI value" side-by-side. `logVerification()` (`DashboardViewModel.ts:855-865`) only logs per-module RPC actions (action, rpcMethod, before/after counts), not the Dashboard's `state.metrics`/`state.healthScore` before and after. Adding this would materially help future debugging but is an instrumentation gap, not implemented here per the "diagnosis only" instruction.
