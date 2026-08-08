# SMART OPTIMIZATION STATE MACHINE REPORT

## V2.0 Hotfix — Progress-Driven State Machine

---

## Root Cause

The `runOrchestratorFullScan` method in `DashboardViewModel.ts` called
`orchestratorService.fullAsync()` which invokes `client().call()` on the
RPC bridge. When the backend is unavailable (e.g. test environment,
non-Electron context), `client()` throws **synchronously**:

```
Error: AVS RPC bridge is unavailable (outside Electron?)
```

The `catch` block in `runOrchestratorFullScan` immediately set
`healthScanStep: 'complete'`, overriding the `'scanning'` state that was
set moments earlier by the `startHealthScan` setTimeout callback.

This caused the state machine to transition:

```
Preparing → Complete   (skipping Scanning, Analyzing, Optimizing, Verification)
```

instead of the required:

```
Preparing → Scanning → Analyzing → Optimizing → Verification → Complete
```

### Why the test caught it

The test `transitions from preparing to scanning after 600ms` advances
fake timers by 600ms and expects `healthScanStep === 'scanning'`. The
synchronous throw + catch block overwrote `'scanning'` to `'complete'`
within the same microtask, so the test saw `'complete'` instead.

---

## Files Modified

| File | Change |
|------|--------|
| `apps/pc-optimizer/src/features/dashboard/DashboardViewModel.ts` | Fixed catch block to not jump to `'complete'` on orchestrator failure; fixed phase mapping to use proper `HealthScanStep` values (`scanning`/`optimizing`/`verifying`); fixed `status.error` handling to preserve current step |

---

## Changes Made

### 1. Catch block — no false completion

**Before:**
```typescript
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  this.setState({
    healthScanStep: 'complete',
    healthScanError: msg,
  });
}
```

**After:**
```typescript
} catch (err) {
  // Orchestrator failed (e.g. backend unavailable). Record the error
  // but do NOT transition to 'complete' — the state machine stays in
  // its current step until the user retries or cancels.
  const msg = err instanceof Error ? err.message : String(err);
  this.setState({
    healthScanError: msg,
  });
}
```

The state machine no longer claims completion when the orchestrator fails.
It records the error and stays in the current step (`'scanning'`), allowing
the UI to display the error and offer retry/cancel.

### 2. Status error handling — preserve current step

**Before:**
```typescript
if (status.error) {
  this.setState({
    healthScanStep: 'complete',
    healthScanError: status.error,
  });
  return;
}
```

**After:**
```typescript
if (status.error) {
  this.setState({
    healthScanError: status.error,
  });
  return;
}
```

Backend errors during polling no longer cause a false transition to
`'complete'`. The state machine preserves the current step.

### 3. Phase mapping — proper HealthScanStep transitions

**Before:**
```typescript
let scanPhase: ScanPhase = 'preparing';
if (phase === 'scanning' || phase === 'scanned') scanPhase = 'junk';
else if (phase === 'optimizing') scanPhase = 'ai_planning';
else if (phase === 'verifying' || phase === 'complete') scanPhase = 'finalizing';

const isOptimizing = phase === 'optimizing' || phase === 'verifying';
this.setState({
  healthScanStep: isOptimizing ? 'optimizing' : 'scanning',
  ...
});
```

**After:**
```typescript
let scanPhase: ScanPhase = 'preparing';
let step: HealthScanStep = 'scanning';
if (phase === 'scanning' || phase === 'scanned') {
  scanPhase = 'junk';
  step = 'scanning';
} else if (phase === 'optimizing') {
  scanPhase = 'ai_planning';
  step = 'optimizing';
} else if (phase === 'verifying') {
  scanPhase = 'finalizing';
  step = 'verifying';
} else if (phase === 'complete') {
  scanPhase = 'finalizing';
  step = 'verifying';
}

this.setState({
  healthScanStep: step,
  healthScanExecution: (isOptimizing || isVerifying) ? { ... } : null,
  ...
});
```

The `'verifying'` phase now maps to `healthScanStep: 'verifying'` instead
of being lumped with `'optimizing'`. This gives the UI a distinct
verification state.

---

## New Event Flow

```
User clicks "Scan Now"
        │
        ▼
startHealthScan()
        │
        ├─ healthScanStep = 'preparing'
        ├─ healthScanModules = [8 modules, all 'pending']
        │
        ▼  (600ms UX delay)
        │
        ├─ healthScanStep = 'scanning'
        ├─ void runOrchestratorFullScan()
        │
        ▼
runOrchestratorFullScan()
        │
        ├─ healthScanStep = 'scanning'  (reaffirm)
        ├─ orchestratorService.fullAsync()
        │
        ▼  (backend starts background thread)
        │
        ┌─ poll loop (every 300ms) ─────────────────┐
        │                                            │
        │  orchestratorService.status(sessionId)     │
        │                                            │
        │  ├─ status.phase = 'scanning'              │
        │  │  → healthScanStep = 'scanning'          │
        │  │  → modules update (pending→scanning)    │
        │  │  → counters update                      │
        │  │  → activity log streams                 │
        │  │                                         │
        │  ├─ status.phase = 'optimizing'            │
        │  │  → healthScanStep = 'optimizing'        │
        │  │  → modules update (scanning→complete)   │
        │  │  → healthScanExecution populated        │
        │  │                                         │
        │  ├─ status.phase = 'verifying'             │
        │  │  → healthScanStep = 'verifying'         │
        │  │  → healthScanExecution shows "Verifying"│
        │  │                                         │
        │  ├─ status.phase = 'complete'              │
        │  │  → break loop                           │
        │  │                                         │
        │  ├─ status.error                           │
        │  │  → healthScanError = msg (stay in step) │
        │  │  → return                               │
        │  │                                         │
        │  └─ healthScanCancelled                    │
        │     → orchestratorService.cancel()         │
        │     → resetHealthScan()                    │
        │     → return                               │
        └────────────────────────────────────────────┘
        │
        ▼
orchestratorService.result(sessionId)
        │
        ▼
finalizeOrchestratorResults()
        │
        ├─ Map backend results to HealthScanModuleResult[]
        ├─ Build verification report
        ├─ Record optimization history
        ├─ Broadcast scores via LiveSyncService
        ├─ Refresh dashboard metrics
        │
        ▼
healthScanStep = 'complete'
healthScanReport = verifiedReport
```

---

## State Transition Diagram

```
                    ┌──────────┐
                    │  idle    │
                    └────┬─────┘
                         │ startHealthScan()
                         ▼
                    ┌──────────┐
                    │ preparing │◄──── 600ms UX delay
                    └────┬─────┘
                         │
                         ▼
                    ┌──────────┐
              ┌─────│ scanning  │
              │     └────┬─────┘
              │          │ backend phase = 'optimizing'
              │          ▼
              │     ┌──────────┐
              │     │optimizing │
              │     └────┬─────┘
              │          │ backend phase = 'verifying'
              │          ▼
              │     ┌──────────┐
              │     │ verifying │
              │     └────┬─────┘
              │          │ backend phase = 'complete'
              │          ▼
              │     ┌──────────┐
              │     │ complete  │
              │     └──────────┘
              │
              │ error (any phase)
              │ → healthScanError set
              │   step stays current
              │
              │ cancel (any phase)
              │ → resetHealthScan()
              │   step = 'idle'
              │
              └─ closeHealthScan()
                  step = 'idle'
```

---

## Progress Event Structure

Each poll response from `orchestrator.status` contains:

```typescript
interface OrchestratorStatus {
  sessionId: string;
  phase: string;              // 'preparing'|'scanning'|'scanned'|'optimizing'|'verifying'|'complete'
  progress: number;           // 0-100, driven by backend work
  currentModule: string | null;
  overallScoreBefore: number;
  overallScoreAfter: number;
  issuesBefore: number;
  issuesAfter: number;
  spaceRecovered: number;
  completedAt: string | null;
  error: string | null;
  cancelled: boolean;

  // Real-time streaming data
  activityLog: OrchestratorActivityEntry[];    // [{ts, module, action, detail}]
  counters: OrchestratorCounters;              // {itemsScanned, itemsAnalyzed, itemsOptimized, itemsSkipped, storageRecovered, elapsedMs}
  moduleStatuses: Record<string, OrchestratorModuleStatus>;  // per-module {status, progress, itemsScanned, issuesFound}
}
```

The frontend maps these to:

| Backend field | Frontend state |
|---------------|----------------|
| `phase` | `healthScanStep` (`scanning`/`optimizing`/`verifying`) |
| `phase` | `scanPhase` (`junk`/`ai_planning`/`finalizing`) |
| `progress` | `scanOverallProgress` |
| `activityLog` | `scanActivityLog` (last 30 entries) |
| `counters` | `scanLiveStats` |
| `moduleStatuses` | `healthScanModules` (per-module status) |
| `currentModule` | `healthScanExecution.currentModule` |
| `activityLog[-1].detail` | `healthScanCurrentFile` |
| `counters.elapsedMs` | `healthScanExecution.elapsedMs` |

---

## Completion Criteria

The state machine only transitions to `'complete'` when **all** of the
following have occurred:

1. ✅ All backend modules finish (scan + optimize)
2. ✅ Verification succeeds (backend `orchestrator_optimize` runs verify step)
3. ✅ Scores refresh (`finalizeOrchestratorResults` calls `refreshCache` + `loadMetrics`)
4. ✅ History saved (`optimizationHistoryService.recordOptimization`)
5. ✅ Synchronization broadcast (`LiveSyncService.broadcastScores`)

If any step fails, `healthScanError` is set but `healthScanStep` remains
at the current phase — no false completion.

---

## Verification

### TypeScript

```
$ tsc --noEmit --project apps/pc-optimizer/tsconfig.json
0 errors
```

### ESLint

```
$ eslint src/features/dashboard/DashboardViewModel.ts --max-warnings 0
0 warnings
```

### Tests

```
$ vitest run src/features/dashboard/__tests__/SmartOptimization.test.ts
✓ 51 tests passed (51)

$ vitest run
✓ 107 test files passed
✓ 7847 tests passed
```

### Production Build

```
$ vite build
✓ built in 11.46s
```

---

## Test Results

The previously failing test now passes:

```
✓ Smart Optimization Flow > transitions from preparing to scanning after 600ms
  Expected: healthScanStep === 'scanning'
  Actual:   healthScanStep === 'scanning'
```

The test passes because the architecture now correctly exposes the
`'scanning'` state transition — the catch block no longer overwrites it
with `'complete'` when the backend is unavailable.
