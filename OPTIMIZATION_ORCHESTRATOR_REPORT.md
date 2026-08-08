# Optimization Orchestrator — Architecture & Implementation Report

## Overview

The `OptimizationOrchestrator` is a unified backend service that consolidates all optimization logic into a single pipeline. It replaces the fragmented approach where the Dashboard, AI Smart Optimize, and AI Protection Center each independently triggered scans and optimizations via separate frontend RPC calls.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                         │
│                                                              │
│  Dashboard     AI Smart Optimize    Protection Center        │
│      │               │                   │                   │
│      └───────────────┼───────────────────┘                   │
│                      ▼                                       │
│           DashboardViewModel.startHealthScan()               │
│                      │                                       │
│                      ▼                                       │
│           runOrchestratorFullScan()                          │
│                      │                                       │
│                      ▼                                       │
│           orchestratorService.full()                         │
│                      │ (JSON-RPC)                            │
└──────────────────────┼──────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend (Python)                          │
│                                                              │
│           orchestrator.full (RPC handler)                    │
│                      │                                       │
│         ┌────────────┼────────────────┐                      │
│         ▼            ▼                ▼                      │
│    orchestrator   orchestrator   orchestrator                │
│      .start         .scan         .optimize                  │
│                      │                │                      │
│         ┌────────────┼────────────────┘                      │
│         ▼            ▼                ▼                      │
│    _scan_junk   _scan_privacy   _scan_registry               │
│    _scan_startup _scan_performance                          │
│    _scan_disk    _scan_security   _scan_system               │
│         │            │                │                      │
│         ▼            ▼                ▼                      │
│    _optimize_junk  _optimize_privacy  _optimize_registry     │
│    _optimize_startup  _optimize_performance                 │
│         │            │                │                      │
│         ▼            ▼                ▼                      │
│    Score Calculation → History Recording → Response          │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Session Start
- `orchestrator.start` creates a new session with a UUID
- Session state tracked in `_sessions` dict with thread-safe locking

### 2. Scan Phase
- `orchestrator.scan` runs all 8 module scans sequentially:
  - **Junk Cleaner** — uses `cleaner._scan_manager.start()` + polling
  - **Privacy Cleaner** — uses `scan_privacy_items()` from `privacy_cleaner.py`
  - **Registry Cleaner** — uses `scan_registry()` from `registry_scanner.py`
  - **Startup Manager** — uses `scan_startup_entries()` from `startup_manager.py`
  - **Performance** — uses `get_system_metrics()` + `generate_alerts()` from `live_monitor.py`
  - **Disk Analyzer** — uses `psutil.disk_partitions()` + `psutil.disk_usage()`
  - **Security Check** — uses `dashboard._collect_metrics()` for security status
  - **System Info** — uses `psutil.boot_time()` + `platform` for system info

### 3. Optimize Phase
- `orchestrator.optimize` runs only fixable modules with issues:
  - **Junk** — calls `dashboard_optimize_execute()` (temp files, recycle bin, browser cache, etc.)
  - **Privacy** — calls `clean_privacy_items()` with scanned items
  - **Registry** — calls `fix_issues()` with scanned RegistryIssue objects
  - **Startup** — calls `disable_startup_entry()` for high-impact enabled entries
  - **Performance** — calls `optimize_memory()` for memory optimization
  - **Disk/Security/System** — informational only, no auto-fix

### 4. Score Calculation
- Before scores calculated from scan results (issues count, size)
- After scores calculated from optimization results (items fixed, bytes recovered)
- Overall score = average of all module scores

### 5. History Recording
- Backend: `HistoryEntry` saved to SQLite via `add_history_entry()`
- Frontend: `optimizationHistoryService.recordOptimization()` for UI history
- Session persistence: `saveSession()` for restart recovery

### 6. Broadcasting
- `LiveSyncService.broadcastScores()` — updates global health scores
- `LiveSyncService.broadcastOptimizationComplete()` — notifies all UI components
- Dashboard cache invalidated via `_collect_metrics.cache_clear()`

## RPC Methods

| Method | Description |
|--------|-------------|
| `orchestrator.start` | Create new session, returns sessionId |
| `orchestrator.scan` | Run all module scans, returns results |
| `orchestrator.optimize` | Run all module optimizations, returns results |
| `orchestrator.status` | Poll session status/progress |
| `orchestrator.result` | Get full session result |
| `orchestrator.cancel` | Cancel running session |
| `orchestrator.full` | One-click: start → scan → optimize → verify → score → history |

## Files Modified

### Backend
- **`backend/src/avs_backend/orchestrator/__init__.py`** (NEW) — Full orchestrator service with session management, scan/optimize functions, score calculation, history recording
- **`backend/src/avs_backend/api/rpc_server.py`** — Added `avs_backend.orchestrator` to feature module import list

### Shared
- **`packages/shared/src/rpc/index.ts`** — Added 7 orchestrator RPC method constants

### Frontend
- **`apps/pc-optimizer/src/features/orchestrator/orchestrator.service.ts`** (NEW) — RPC wrapper service with TypeScript types
- **`apps/pc-optimizer/src/features/orchestrator/index.ts`** (NEW) — Feature barrel export
- **`apps/pc-optimizer/src/features/dashboard/DashboardViewModel.ts`** — Added `runOrchestratorFullScan()` method, changed `startHealthScan()` to call orchestrator instead of `runHealthScan('scan')`

## Unified Entry Point

All three optimization surfaces now use the same code path:

1. **Dashboard** → `dashVm.startHealthScan()` → `runOrchestratorFullScan()` → `orchestratorService.full()`
2. **AI Smart Optimize** → `dashVm.startHealthScan()` → same path
3. **Protection Center** → `dashVm.startHealthScan()` → same path

No UI changes were made. The `UnifiedOptimizeFlow` component reads from `vm.state` which is populated by the orchestrator response, so the existing scan/progress/results/verification UI continues to work.

## Key Design Decisions

1. **Real backend execution** — All scans and optimizations call actual backend module functions, no simulated progress
2. **Single RPC call for full pipeline** — `orchestrator.full` does scan + optimize + verify + score + history in one call
3. **Session-based** — Each optimization run gets a sessionId for tracking, cancellation, and result polling
4. **Thread-safe** — Session state protected by `_sessions_lock`
5. **Backward compatible** — Old `runHealthScan()` and `executeHealthScanOptimizations()` methods remain as fallback
6. **No UI changes** — Same `UnifiedOptimizeFlow` component, same state shape, same user experience

## Verification

The orchestrator ensures:
- ✅ Real module execution (not simulated)
- ✅ Progress tracking via session status polling
- ✅ Score calculation before and after optimization
- ✅ History recording in both backend SQLite and frontend service
- ✅ Dashboard cache invalidation for fresh metrics
- ✅ Live broadcast to all UI components via LiveSyncService
- ✅ Session persistence for restart recovery
- ✅ Cancellation support via session flag
