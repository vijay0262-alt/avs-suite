# Phase 24 — Performance Optimization Report

**Validation:** TypeScript 0 errors | ESLint 0 errors | Tests 7855/7855 passed (107 files)

## Summary

Phase 24 focused on making AVS Shield lightweight, responsive, and efficient. All optimizations are behavioral — no new modules, UI, or features were added.

## Files Modified

| File | Optimization |
|------|---------------|
| `main.tsx` | Deferred background service startup to after first paint via `requestIdleCallback` |
| `DashboardPageV2.tsx` | Extracted `LiveMetricsMonitor` into memoized component; memoized derived values; hoisted `QUICK_ACTIONS` to module-level constant |
| `dashboard.service.ts` | Integrated `RpcCache` for `getMetrics` (15s TTL) and `getHardwareSensors` (30s TTL); cache invalidation on `refreshCache` |
| `ProcessMonitorService.ts` | Replaced `setInterval` with adaptive `setTimeout` chain; added visibility-based interval (5s visible, 30s hidden) |
| `LiveSyncService.ts` | Added `shallow` equality to `useLiveScores` selector to prevent unnecessary re-renders |
| `DeferredCleanupStore.ts` | Added 7-day stale item TTL — old deferred items auto-cleaned on load |
| `DashboardViewModel.ts` | Debounced verification log localStorage writes (500ms batch); cleanup timer in dispose |
| `useViewModel.ts` | Memoized `subscribe` and `getSnapshot` with `useCallback` |

## Optimizations by Category

### Startup
- **Before:** Background services (`processMonitor`, `backgroundCleanup`) started synchronously before React render
- **After:** Background services deferred to `requestIdleCallback` after first paint
- **Lazy loading:** All 24+ pages already use `React.lazy()` + `Suspense` (verified, no changes needed)
- **Module preloader:** Already uses `requestIdleCallback` to preload frequently accessed pages (verified)

### UI Re-renders
- **Before:** Entire `DashboardPageV2` re-rendered every 2s when live metrics updated (sparklines, static cards, recommendations, AI modules all re-rendered)
- **After:** `LiveMetricsMonitor` extracted as `memo()` component — only sparkline section re-renders on live metrics change
- **Before:** `getSecurityTone`, `getSecurityLabel`, `getPerformanceValue`, `getStorageValue`, `generateRecommendations`, `getAIModules` all called on every render
- **After:** All wrapped in `useMemo` with proper dependencies
- **Before:** `QUICK_ACTIONS` array (9 items) recreated on every render
- **After:** Hoisted to module-level constant
- **Before:** `useLiveScores()` returned new object every store change, causing Sidebar re-renders
- **After:** Added `shallow` equality comparator — Sidebar only re-renders when actual score values change
- **Before:** `useViewModel` recreated `subscribe` and `getSnapshot` functions every render
- **After:** Memoized with `useCallback`

### CPU / Polling
- **ProcessMonitorService:** Replaced `setInterval(5s)` with adaptive `setTimeout` chain
  - Visible: 5s interval (unchanged)
  - Hidden/minimized: 30s interval (6x reduction)
  - `visibilitychange` listener triggers immediate reschedule on focus
- **DashboardViewModel live metrics:** Already used adaptive `setTimeout` chain (2s visible, 30s hidden) — verified, no changes needed
- **BackgroundCleanupService:** Event-driven (no polling) — verified, no changes needed

### RPC
- **Before:** `getMetrics()` and `getHardwareSensors()` made raw RPC calls on every invocation
- **After:** Wrapped with `RpcCache`:
  - `dashboard.metrics`: 15s TTL (matches backend cache)
  - `dashboard.hardware`: 30s TTL (sensors change slowly)
  - `refreshCache()` invalidates both caches
  - Concurrent calls deduplicated via pending promise sharing

### Disk / localStorage
- **Before:** `logVerification()` wrote to `localStorage` on every log entry (potentially dozens per second during scans)
- **After:** Debounced to 500ms — multiple log entries batched into a single write
- **Before:** `DeferredCleanupStore` items accumulated indefinitely
- **After:** Items older than 7 days auto-cleaned on load

### Memory
- **ViewModel base class:** Already uses microtask batching for `setState` — verified
- **LogService:** 500-entry ring buffer, no unbounded growth — verified
- **RpcCache:** In-memory `Map` with TTL expiry — verified
- **Timer cleanup:** All timers cleaned up in `dispose()` — verified, added `verificationLogFlushTimer` cleanup

### Laptop / Tray Mode
- **ProcessMonitorService:** Adaptive polling — 30s when hidden (6x reduction from 5s)
- **DashboardViewModel:** Adaptive polling — 30s when hidden (15x reduction from 2s)
- **Background services:** Deferred to `requestIdleCallback` — don't compete with first paint
- **Module preloader:** Uses `requestIdleCallback` — doesn't compete with user interactions

## Benchmarks

| Metric | Before | After |
|--------|--------|-------|
| Dashboard re-renders (idle, visible) | Every 2s (full component) | Every 2s (LiveMetricsMonitor only) |
| Dashboard re-renders (hidden) | Every 30s (full component) | Every 30s (LiveMetricsMonitor only) |
| Sidebar re-renders (score broadcast) | Every broadcast | Only when scores change |
| ProcessMonitor polls (hidden) | 5s fixed | 30s adaptive |
| RPC calls for metrics | Every call hits backend | Cached 15s, deduplicated |
| RPC calls for hardware sensors | Every call hits backend | Cached 30s, deduplicated |
| localStorage writes during scan | Per verification log entry | Batched every 500ms |
| Background service startup | Before first paint | After first paint (idle callback) |

## Remaining Bottlenecks

1. **Backend scan throughput:** Directory traversal, registry enumeration, and browser scanning are Python backend operations — not in renderer scope
2. **Bundle size:** Vite code-splitting already configured; further optimization requires manual chunk analysis
3. **24-hour stability test:** Requires manual or CI run to verify memory/CPU stability over extended period
4. **Web Workers:** No web workers currently used; CPU-intensive operations (if any) could be offloaded in future
