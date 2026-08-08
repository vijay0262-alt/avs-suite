# REAL-TIME SCAN EXPERIENCE REPORT

## AVS Shield V2.0 — Phase 11: Live Operation Stream & Real-Time Scan UI

---

## 1. Architecture Overview

The real-time scan experience is a full-stack, event-driven pipeline:

```
Backend (Python)                          Frontend (React/TypeScript)
┌─────────────────────┐                  ┌──────────────────────────────┐
│ OptimizationOrchestr│                  │ DashboardViewModel           │
│ ator (__init__.py)  │                  │  runOrchestratorFullScan()   │
│                     │                  │  polls status every 300ms    │
│ Session state:      │   RPC poll       │                              │
│  - phase            │◄────────────────│  Maps status → state         │
│  - progress         │   300ms interval │                              │
│  - currentModule    │                  │  scanCurrentOperation        │
│  - currentOperation │                  │  scanCurrentPath             │
│  - currentPath      │                  │  scanItemsProcessed          │
│  - itemsProcessed   │                  │  scanItemsRemaining          │
│  - itemsRemaining   │                  │  scanBytesRecovered          │
│  - bytesRecovered   │                  │  scanActivityLog             │
│  - activityLog[]    │                  │  healthScanModules           │
│  - counters{}       │                  │  scanLiveStats               │
│  - moduleStatuses{} │                  └──────────┬───────────────────┘
│                     │                             │
└─────────────────────┘                             ▼
                                          ┌──────────────────────────────┐
                                          │ UnifiedOptimizeFlow          │
                                          │  maps state → props          │
                                          │  currentOperation prop       │
                                          └──────────┬───────────────────┘
                                                     │
                                                     ▼
                                          ┌──────────────────────────────┐
                                          │ UnifiedScanView              │
                                          │  ┌────────────────────────┐  │
                                          │  │ ScanHeader             │  │
                                          │  │ ScanProgress           │  │
                                          │  │ ScanAnimation          │  │
                                          │  │ CurrentOperationCard   │  │
                                          │  │ ScanTree + ScanCounters│  │
                                          │  │ ActivityStream         │  │
                                          │  │ ScanFooter             │  │
                                          │  └────────────────────────┘  │
                                          └──────────────────────────────┘
```

---

## 2. Event Flow

### Backend Event Lifecycle

1. **`orchestrator.fullAsync`** — starts background thread, returns `sessionId`
2. **`orchestrator.status`** — polled every 300ms by frontend

### Phase Transitions

```
idle → scanning → scanned → optimizing → verifying → complete
                                        ↓
                                      error (if any module fails critically)
```

### Per-Module Activity Emission

Each scan/optimize function emits activities with:
- `operation` — machine-readable label (Scanning, Cleaning, Optimizing, Verifying, Skipped)
- `path` — real file/folder path when available (e.g., disk mountpoints)
- `detail` — human-readable description
- `module` — which module is running
- `action` — scanning/scanned/optimizing/optimized/verifying/error/skipped

### Module Status Updates

Each module transitions through:
- `scanning` → `complete` (success) or `error` (failure)
- `optimizing` → `complete` (success) or `error` (failure)
- `skipped` (non-fixable or no issues)

**Module failures do NOT stop the pipeline** — the orchestrator continues to the next module.

---

## 3. Backend Event Format

### `orchestrator.status` Response

```json
{
  "sessionId": "uuid",
  "phase": "scanning|optimizing|verifying|complete|error|cancelled",
  "progress": 0,
  "currentModule": "junk|null",
  "currentOperation": "Scanning|Cleaning|Optimizing|Verifying|null",
  "currentPath": "C:\\Users\\...|null",
  "itemsProcessed": 0,
  "itemsRemaining": 0,
  "bytesRecovered": 0,
  "overallScoreBefore": 0,
  "overallScoreAfter": 0,
  "issuesBefore": 0,
  "issuesAfter": 0,
  "spaceRecovered": 0,
  "completedAt": null,
  "error": null,
  "cancelled": false,
  "activityLog": [
    {
      "ts": "2025-01-15T12:00:00Z",
      "module": "junk",
      "action": "scanning",
      "detail": "Scanning temporary files...",
      "operation": "Scanning",
      "path": null
    }
  ],
  "counters": {
    "itemsScanned": 0,
    "itemsAnalyzed": 0,
    "itemsOptimized": 0,
    "itemsSkipped": 0,
    "storageRecovered": 0,
    "elapsedMs": 0,
    "itemsCleaned": 0,
    "registryFixed": 0,
    "threatsChecked": 0,
    "bytesRecovered": 0
  },
  "moduleStatuses": {
    "junk": {
      "status": "scanning|complete|error|skipped",
      "progress": 0,
      "itemsScanned": 0,
      "issuesFound": 0
    }
  }
}
```

### Activity Entry Fields

| Field       | Type   | Description                                      |
|-------------|--------|--------------------------------------------------|
| `ts`        | string | ISO 8601 timestamp                               |
| `module`    | string | Module ID (junk, privacy, registry, etc.)        |
| `action`    | string | scanning, scanned, optimizing, optimized, etc.   |
| `detail`    | string | Human-readable description                       |
| `operation` | string | Machine-readable operation label (optional)      |
| `path`      | string | Real file/folder path (optional)                 |

---

## 4. Frontend Component Updates

### New Component: `CurrentOperationCard`

**File:** `apps/pc-optimizer/src/features/unified-scan/components/CurrentOperationCard.tsx`

Displays a large, detailed card showing:
- Current module name and icon
- Current operation (Scanning, Cleaning, Optimizing, Verifying)
- Real file/folder path when available
- Items processed / items remaining
- Bytes recovered so far
- Elapsed time and estimated remaining time (ETA)
- Progress percentage

**Props:**
```typescript
interface CurrentOperationCardProps {
  currentModule: string | null;
  currentOperation: string | null;
  currentPath: string | null;
  itemsProcessed: number;
  itemsRemaining: number;
  bytesRecovered: number;
  elapsedMs: number;
  overallProgress: number;
  isOptimizing?: boolean;
}
```

### Updated: `UnifiedScanView`

- Accepts new `currentOperation?: CurrentOperationCardProps | null` prop
- Renders `CurrentOperationCard` between `ScanAnimation` and the live status details
- Card only shows during active scanning (not complete/error)

### Updated: `ActivityStream`

- `ActivityEntry` interface extended with `operation?: string` and `path?: string`
- Existing rendering, auto-scroll, and accessibility features preserved

### Updated: `UnifiedOptimizeFlow`

- **Verifying step now shows scan UI** instead of a separate spinner screen
- `verifying` and `updating_dashboard` steps map to `step: 'scanning'` (reuses scan UI)
- New `currentOperation` memo maps backend state to `CurrentOperationCardProps`
- New helper functions: `buildVerifyConfig()`, `buildVerifyLiveStatus()`, `buildVerifyCounters()`
- Passes `currentOperation` prop to `UnifiedScanView`

### Updated: `ScanProgress`

- No code changes needed — already handles `isOptimizing` flag to show "Optimizing" label
- `isActive` check includes `'scanning'` and `'preparing'` steps (verifying/optimizing map to scanning)

### Updated: `DashboardViewModel`

- New state fields: `scanCurrentOperation`, `scanCurrentPath`, `scanItemsProcessed`, `scanItemsRemaining`, `scanBytesRecovered`
- All initial state locations updated with new field defaults
- Polling loop maps new status fields to state
- `scanLiveStats` now maps `registryFixed` and `itemsCleaned` counters

### Updated: `orchestrator.service.ts`

- `OrchestratorActivityEntry` extended with `operation?` and `path?`
- `OrchestratorCounters` extended with `itemsCleaned?`, `registryFixed?`, `threatsChecked?`, `bytesRecovered?`
- `OrchestratorStatus` extended with `currentOperation`, `currentPath`, `itemsProcessed`, `itemsRemaining`, `bytesRecovered`

### Updated: `dashboard.types.ts`

- `ScanActivityEntry` extended with `operation?: string` and `path?: string`

---

## 5. Backend Updates

### `backend/src/avs_backend/orchestrator/__init__.py`

#### Session State
- New fields: `currentOperation`, `currentPath`, `itemsProcessed`, `itemsRemaining`, `bytesRecovered`
- New counters: `itemsCleaned`, `registryFixed`, `threatsChecked`, `bytesRecovered`

#### `_add_activity()`
- Now accepts `operation` and `path` optional parameters
- Entries include these fields when provided

#### `_update_counters()`
- `bytesRecovered` now treated as set-directly (not cumulative), like `elapsedMs`

#### `orchestrator_scan()`
- Sets `currentOperation: "Scanning"` per module
- Emits `operation="Scanning"` in activities
- Sets `itemsProcessed` and `itemsRemaining` on completion

#### `orchestrator_optimize()`
- Sets `currentOperation: "Optimizing"` per module
- Sets `currentOperation: "Verifying"` during verify phase
- Sets `currentOperation: None` on completion
- Updates `bytesRecovered` and `itemsProcessed` per module
- Emits `operation` field in all activities

#### Scan/Optimize Functions
- All 8 scan functions and 8 optimize functions emit `operation` field
- Disk scan emits real `path` (mountpoint) for each drive
- Security scan updates `threatsChecked` counter
- Registry optimize updates `registryFixed` counter
- Privacy optimize updates `itemsCleaned` counter
- Junk optimize updates `itemsCleaned` counter

#### `orchestrator.status` RPC
- Returns 5 new fields: `currentOperation`, `currentPath`, `itemsProcessed`, `itemsRemaining`, `bytesRecovered`

---

## 6. Performance

- **Polling interval:** 300ms — balances responsiveness with CPU usage
- **Activity log capped:** 50 entries max (backend), 30 visible (frontend)
- **State updates batched:** React's automatic batching applies; all state fields update in a single `setState` call
- **Memoized computations:** `currentOperation`, `liveStatus`, `counters`, `treeNodes` all use `useMemo`
- **CSS transitions:** Progress bar uses `transition-[width] duration-500 ease-out` for smooth animation
- **No UI freezes:** Background thread in Python; polling is async in frontend
- **60 FPS:** Shimmer/pulse animations use CSS keyframes, not JS

---

## 7. Accessibility

- `CurrentOperationCard`: `role="status"`, `aria-live="polite"`, descriptive `aria-label`
- `ActivityStream`: `role="log"`, `aria-live="polite"`, `aria-label="Scan activity log"`
- `ScanProgress`: `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-label`
- `ScanTree`: `role="tree"`, `aria-label="Scan phases"`
- `UnifiedScanView`: `role="region"`, `aria-label="System scan in progress"`
- `prefers-reduced-motion`: Disables pulse, ping, and scroll-smooth animations
- High DPI: All sizing uses CSS variables and rem/px — no hardcoded pixel positions

---

## 8. Files Modified

### Backend
| File | Changes |
|------|---------|
| `backend/src/avs_backend/orchestrator/__init__.py` | Session state, `_add_activity`, `_update_counters`, scan/optimize functions, status RPC |

### Frontend — New
| File | Purpose |
|------|---------|
| `apps/pc-optimizer/src/features/unified-scan/components/CurrentOperationCard.tsx` | New component showing detailed current operation |

### Frontend — Modified
| File | Changes |
|------|---------|
| `apps/pc-optimizer/src/features/orchestrator/orchestrator.service.ts` | Type updates for new status fields |
| `apps/pc-optimizer/src/features/dashboard/dashboard.types.ts` | `ScanActivityEntry` extended |
| `apps/pc-optimizer/src/features/dashboard/DashboardViewModel.ts` | New state fields, polling loop mapping, initial state |
| `apps/pc-optimizer/src/features/dashboard/components/UnifiedOptimizeFlow.tsx` | Verifying step, currentOperation prop, verify helpers |
| `apps/pc-optimizer/src/features/unified-scan/components/UnifiedScanView.tsx` | Import CurrentOperationCard, new prop, render card |
| `apps/pc-optimizer/src/features/unified-scan/components/ActivityStream.tsx` | ActivityEntry extended with operation/path |

---

## 9. Verification Results

| Check | Result |
|-------|--------|
| TypeScript typecheck | ✅ Pass |
| ESLint | ✅ Pass (0 errors) |
| Unit tests | ✅ 7842/7842 pass (106 test files) |
| Production build | ✅ Built in 15.90s |

---

## 10. Manual Validation Checklist

Run a full scan from Dashboard → AI Smart Optimize and verify:

- [ ] Progress bar moves smoothly with no jumps or freezes
- [ ] Activity stream shows real backend operations (not simulated)
- [ ] Real file paths appear in activity stream (e.g., disk mountpoints)
- [ ] CurrentOperationCard shows current module, operation, and path
- [ ] Counters update continuously (items scanned, cleaned, storage recovered)
- [ ] Module tree shows Pending → Running → Completed/Skipped/Failed statuses
- [ ] Checkmarks appear for completed modules
- [ ] Failed modules show error reason but scan continues
- [ ] Verifying phase shows scan UI (not a separate spinner)
- [ ] Completion screen stays visible with detailed results
- [ ] Scores update automatically after optimization
- [ ] No UI lag during scan (60 FPS maintained)
- [ ] Keyboard navigation works (Tab through controls)
- [ ] Screen reader announces progress changes
- [ ] Reduced motion preference respected

---

## 11. Remaining Issues

- **Pause/Resume:** Currently `onPause` and `onResume` are no-ops — backend supports cancellation but not pause/resume
- **Sub-progress:** `healthScanSubProgress` is always 0 — backend doesn't emit per-file sub-progress yet
- **Startup items counter:** `startupItems` in `ScanLiveStats` is always 0 — could be mapped from startup scan results
- **Memory recovery counter:** `estimatedMemoryRecovery` is always 0 — could be mapped from performance scan results
