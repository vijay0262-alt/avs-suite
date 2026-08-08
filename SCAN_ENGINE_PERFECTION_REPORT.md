# SCAN ENGINE PERFECTION REPORT

## Phase 10 — Scan Engine Perfection & Unified User Experience

### Overview

This report documents the refactoring of the AVS Shield scan engine to support
real-time streaming of progress, activity logs, and module statuses across the
Dashboard, AI Smart Optimize, and AI Protection Center modules.

---

## Architecture

### Backend: Asynchronous Orchestrator with Real-Time Streaming

**File:** `backend/src/avs_backend/orchestrator/__init__.py`

The backend orchestrator was refactored from a single blocking `orchestrator.full`
RPC call to an asynchronous pattern:

1. **`orchestrator.fullAsync`** — New RPC method that starts the full pipeline
   (scan → optimize → verify → score → history) in a background `threading.Thread`.
   Returns immediately with `{sessionId, startedAt}`.

2. **`orchestrator.status`** — Enhanced to return real-time streaming data:
   - `activityLog`: List of `{ts, module, action, detail}` entries (capped at 50)
   - `counters`: Live counters `{itemsScanned, itemsAnalyzed, itemsOptimized, itemsSkipped, storageRecovered, elapsedMs}`
   - `moduleStatuses`: Per-module `{status, progress, itemsScanned, issuesFound}`

3. **Session state** enhanced with:
   - `activityLog[]` — Real-time activity entries from scan/optimize functions
   - `counters{}` — Live counter updates during scan/optimize
   - `moduleStatuses{}` — Per-module status tracking

4. **Helper functions** (thread-safe with `_sessions_lock`):
   - `_add_activity(session_id, module, action, detail)` — Append activity entry
   - `_update_counters(session_id, counters)` — Merge counter updates
   - `_set_module_status(session_id, module_id, status, progress, items_scanned, issues_found)` — Update module status
   - `_update_elapsed(session_id, start_time)` — Update elapsed time counter

5. **All `_scan_*` and `_optimize_*` functions** modified to accept optional
   `session_id` parameter and emit real-time activities and counter updates.

6. **`orchestrator_scan`** — Updated to pass `session_id` to scan functions,
   set module statuses during scan, and log errors per module.

7. **`orchestrator_optimize`** — Updated to pass `session_id` to optimize
   functions, set module statuses (including "skipped" for non-fixable modules),
   and log errors per module. Non-fixable modules are explicitly marked as "skipped".

### Frontend: Polling-Based Real-Time UI Updates

**Files modified:**
- `packages/shared/src/rpc/index.ts` — Added `ORCHESTRATOR_FULL_ASYNC` RPC method
- `apps/pc-optimizer/src/features/orchestrator/orchestrator.service.ts` — Added `fullAsync()` method, enhanced `OrchestratorStatus` type with `activityLog`, `counters`, `moduleStatuses`
- `apps/pc-optimizer/src/features/dashboard/DashboardViewModel.ts` — Rewrote `runOrchestratorFullScan` to use `fullAsync` + status polling
- `apps/pc-optimizer/src/features/dashboard/dashboard.types.ts` — Added `ScanActivityEntry` type
- `apps/pc-optimizer/src/features/dashboard/components/UnifiedOptimizeFlow.tsx` — Pass `activityLog` prop to `UnifiedScanView`, add `reason` to tree node mappers

**New files:**
- `apps/pc-optimizer/src/features/unified-scan/components/ActivityStream.tsx` — Scrolling activity stream component

### Polling Flow

```
Frontend                          Backend
   │                                 │
   ├─ fullAsync() ──────────────────►│ (starts background thread)
   │◄──────── { sessionId } ────────┤
   │                                 │
   │  ┌─ loop ──────────────────┐    │
   │  │ status(sessionId) ─────►│    │ (thread running scan/optimize)
   │  │◄── { phase, progress, ──┤    │
   │  │     activityLog,         │   │
   │  │     counters,            │   │
   │  │     moduleStatuses }     │   │
   │  │                          │   │
   │  │ update UI state          │   │
   │  │ (progress, activity,     │   │
   │  │  counters, module tree)  │   │
   │  │                          │   │
   │  │ if phase == 'complete'   │   │
   │  │   break                  │   │
   │  │                          │   │
   │  │ wait 300ms               │   │
   │  └──────────────────────────┘   │
   │                                 │
   ├─ result(sessionId) ────────────►│
   │◄── { full results } ───────────┤
   │                                 │
   │ finalizeOrchestratorResults()   │
   │ (broadcast scores, history,     │
   │  verification report)           │
```

### Unified Scan Modal

The `UnifiedScanView` component is the single shared scan UI used by:
- **Dashboard** (via `UnifiedOptimizeFlow`)
- **AI Smart Optimize** (via `UnifiedOptimizeFlow`)
- **AI Protection Center** (via `UnifiedOptimizeFlow` in `ProtectionCenterPage`)

**Components:**
- `ScanHeader` — Module icon, name, phase label, elapsed time, overall progress
- `ScanProgress` — Animated progress bar with sub-progress, `role="progressbar"`, `prefers-reduced-motion`
- `ScanAnimation` — Cycling activity messages for current phase
- `ScanTree` — Expandable tree showing per-module status (complete/error/skipped with reasons)
- `ScanCounters` — Live counter grid (files scanned, issues found, etc.)
- `ActivityStream` — **NEW** — Scrolling real-time activity log from backend with `role="log"`, `aria-live="polite"`
- `ScanFooter` — Pause/resume/cancel with confirmation dialog (`role="alertdialog"`)
- `ScanSummary` — Results summary shown when complete

### Scoring Engine Synchronization

**Single source of truth:** Backend `_calculate_health_score()` in `dashboard/__init__.py`
with TTL cache.

**Synchronization flow:**
1. After optimization, `orchestrator_optimize` invalidates dashboard cache:
   `_collect_metrics.cache_clear()` + `_calculate_health_score.cache_clear()`
2. `DashboardViewModel.finalizeOrchestratorResults` calls `service.refreshCache()` + `loadMetrics()`
3. `LiveSyncService.broadcastScores()` pushes fresh scores to all subscribers:
   - Sidebar (via `useLiveScores()` hook)
   - Protection Center (via `ProtectionCenterViewModel` polling `dashboardService`)
4. `LiveSyncService.broadcastOptimizationComplete()` notifies optimization event bus

### Error Handling

**Backend:**
- Each module scan/optimize wrapped in try/except
- Failed modules logged with `_add_activity(session_id, module, "error", message)`
- Module status set to `"error"` with progress
- Non-fixable modules marked as `"skipped"`
- Pipeline continues on failure — does not abort

**Frontend:**
- `moduleStatuses` from backend mapped to tree node statuses (`complete`/`error`/`skipped`)
- `ScanTree` displays error icon (red exclamation) and skipped icon (gray minus)
- `reason` field on tree nodes shows error message or skip reason
- `ActivityStream` shows error entries in red (`text-semantic-danger`)
- Error state in `UnifiedScanView` shows error message with close button

### Accessibility

- **Keyboard navigation:** All buttons use semantic `<button>` elements; `ScanTree` supports `role="tree"`/`role="treeitem"` with `aria-expanded`/`aria-selected`
- **Reduced motion:** `prefers-reduced-motion` media queries in `ScanProgress` (disables pulse/ping animations) and `ActivityStream` (disables smooth scroll)
- **Screen reader support:**
  - `ScanProgress`: `role="progressbar"` with `aria-valuenow`/`aria-valuemin`/`aria-valuemax`/`aria-label`
  - `ActivityStream`: `role="log"` with `aria-live="polite"` and `aria-label`
  - `ScanFooter`: `role="alertdialog"` with `aria-label` on cancel confirmation
  - `UnifiedScanView`: `role="region"` with `aria-label`
  - `ScanTree`: `role="tree"` with `aria-label="Scan phases"`
  - Icon decorations marked `aria-hidden`
- **High DPI:** Uses CSS custom properties and relative units; no fixed pixel sizes

---

## Files Modified

### Backend
| File | Changes |
|------|---------|
| `backend/src/avs_backend/orchestrator/__init__.py` | Added `_MAX_ACTIVITIES`, `activityLog`/`counters`/`moduleStatuses` to session, helper functions, `session_id` params to all scan/optimize functions, `orchestrator.fullAsync` RPC, enhanced `orchestrator.status` RPC |

### Shared
| File | Changes |
|------|---------|
| `packages/shared/src/rpc/index.ts` | Added `ORCHESTRATOR_FULL_ASYNC` method constant |

### Frontend
| File | Changes |
|------|---------|
| `apps/pc-optimizer/src/features/orchestrator/orchestrator.service.ts` | Added `OrchestratorActivityEntry`, `OrchestratorCounters`, `OrchestratorModuleStatus` types; enhanced `OrchestratorStatus`; added `fullAsync()` method |
| `apps/pc-optimizer/src/features/dashboard/dashboard.types.ts` | Added `ScanActivityEntry` interface |
| `apps/pc-optimizer/src/features/dashboard/DashboardViewModel.ts` | Added `scanActivityLog` state field; rewrote `runOrchestratorFullScan` with async polling; extracted `finalizeOrchestratorResults`; fixed duplicate `cancelHealthScanOptimizations` |
| `apps/pc-optimizer/src/features/dashboard/components/UnifiedOptimizeFlow.tsx` | Pass `activityLog` prop; add `reason` to tree node mappers |
| `apps/pc-optimizer/src/features/unified-scan/unifiedScanTypes.ts` | Added `reason` field to `UnifiedScanTreeNode` |
| `apps/pc-optimizer/src/features/unified-scan/components/UnifiedScanView.tsx` | Added `activityLog` prop; render `ActivityStream`; `role="region"` + `aria-label` |
| `apps/pc-optimizer/src/features/unified-scan/components/ActivityStream.tsx` | **NEW** — Scrolling activity stream with auto-scroll, color-coded modules, `role="log"`, `prefers-reduced-motion` |
| `apps/pc-optimizer/src/features/unified-scan/components/ScanTree.tsx` | Display `reason` for error/skipped nodes |
| `apps/pc-optimizer/src/features/unified-scan/components/ScanFooter.tsx` | Added `role="alertdialog"` + `aria-label` to cancel confirmation |

---

## Verification Checklist

- [x] Scan progress is smooth and phase-based (no jumps — CSS transition 500ms)
- [x] Live activity stream shows real backend activity (polled from `orchestrator.status`)
- [x] Live counters update continuously with real backend data (`counters` in status response)
- [x] Verification step confirms actual backend changes (cache invalidation + fresh metrics)
- [x] Results show real backend values consistently (`orchestrator.result` after completion)
- [x] Synchronization across dashboard, protection center, sidebar (LiveSyncService broadcast)
- [x] Error handling shows completed/skipped/failed with reasons (tree node `reason` field)
- [x] No duplicate scans — single `fullAsync` call, polling reuses same session
- [x] Accessibility features (ARIA roles, reduced motion, screen reader support)
- [x] TypeScript compiles cleanly (`tsc --noEmit` passes)

---

## Remaining Notes

- The `orchestrator.full` (blocking) RPC is preserved for backward compatibility
- Polling interval is 300ms — balances responsiveness with backend load
- Activity log capped at 50 entries backend-side, 30 displayed frontend-side
- The duplicate `cancelHealthScanOptimizations` method was consolidated into a single definition
- All scan/optimize functions remain backward-compatible (`session_id` is optional)
