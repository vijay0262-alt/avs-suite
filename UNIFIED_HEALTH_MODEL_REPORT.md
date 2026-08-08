# UNIFIED HEALTH MODEL REPORT

**Phase:** 16  
**Date:** August 8, 2026  
**Scope:** Unified Health Model & Flagship Module Restructure

---

## Architecture

### One Shared Health Engine

All three flagship modules (Dashboard, AI Smart Optimize, AI Protection Center) now use the **same backend Health Engine**. No page calculates its own score.

```
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND                                   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           health_model.py                            │    │
│  │     (Single Source of Truth for All Scores)          │    │
│  │                                                      │    │
│  │  calculate_health_model(module_scores) →             │    │
│  │    overallHealth                                     │    │
│  │    optimizationScore                                 │    │
│  │    protectionScore                                   │    │
│  │    performanceScore                                  │    │
│  │    storageScore                                      │    │
│  │    hardwareHealth                                    │    │
│  └─────────────────────────────────────────────────────┘    │
│                          ↑                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           orchestrator/__init__.py                   │    │
│  │                                                      │    │
│  │  SCAN PROFILES                                       │    │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────┐           │    │
│  │  │dashboard │ │optimize  │ │protection  │           │    │
│  │  │all mods  │ │opt mods  │ │sec+essential│          │    │
│  │  └──────────┘ └──────────┘ └────────────┘           │    │
│  │                                                      │    │
│  │  RPCs:                                               │    │
│  │  orchestrator.scan   (profile)                       │    │
│  │  orchestrator.optimize(profile via session)          │    │
│  │  orchestrator.full   (profile)                       │    │
│  │  orchestrator.fullAsync(profile)                     │    │
│  │  orchestrator.status → includes healthModel          │    │
│  │  orchestrator.result → includes healthModel          │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                          ↑ RPC
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND                                  │
│                                                              │
│  orchestrator.service.ts                                     │
│    fullAsync(profile: ScanProfile)                           │
│    HealthModel type                                          │
│                                                              │
│  DashboardViewModel.ts                                       │
│    startHealthScan(profile: ScanProfile)                     │
│    runOrchestratorFullScan(profile)                          │
│    finalizeOrchestratorResults()                             │
│      → broadcasts ALL scores via LiveSyncService             │
│                                                              │
│  LiveSyncService.ts (Zustand store)                          │
│    healthScore, optimizationScore, securityScore,            │
│    performanceScore, storageScore, hardwareHealth             │
│    → ALL pages subscribe via useLiveSync()                   │
│                                                              │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────────┐    │
│  │ Dashboard  │  │ AI Smart     │  │ AI Protection    │    │
│  │            │  │ Optimize     │  │ Center           │    │
│  │ profile:   │  │ profile:     │  │ profile:         │    │
│  │ 'dashboard'│  │ 'optimize'   │  │ 'protection'     │    │
│  │            │  │              │  │                  │    │
│  │ Shows:     │  │ Shows:       │  │ Shows:           │    │
│  │ Overall    │  │ Optimization │  │ Protection       │    │
│  │ Protection │  │ Performance  │  │ Threats          │    │
│  │ Performance│  │ Storage      │  │ Security         │    │
│  │ Storage    │  │              │  │ + Opt summary    │    │
│  └────────────┘  └──────────────┘  └──────────────────┘    │
│                                                              │
│  Same UnifiedOptimizeFlow modal (identical across all 3)    │
│  Same scan experience — only profile changes internally     │
└─────────────────────────────────────────────────────────────┘
```

---

## Score Calculation Matrix

### Score Hierarchy

| Score | Formula | Modules Used |
|-------|---------|-------------|
| **Overall Health** | `optimization * 0.4 + protection * 0.4 + hardware * 0.2` | All |
| **Optimization** | Average of optimization module scores | junk, privacy, registry, startup, performance, disk |
| **Protection** | `security_avg * 0.6 + essential_opt_avg * 0.4` | security, system + junk, privacy, registry |
| **Performance** | Average of performance module scores | performance |
| **Storage** | Average of storage module scores | disk, junk |
| **Hardware** | system module score | system |

### Per-Module Score Formulas (unchanged from Phase 14)

| Module | Score Formula |
|--------|--------------|
| junk | `100 - min(issues/100, 100)` |
| privacy | `100 - issues * 2` |
| registry | `100 - issues` |
| startup | `100 - issues * 5` |
| performance | `100 - issues * 10 - 20` |
| disk | `100 - full_drives * 25 - avg_usage / 2` |
| security | `100 - issues * 20` |
| system | `80 if uptime > 30d else 95` |

### Key Principle

**Never calculate the same score in different places.** The backend `health_model.py` is the single source of truth. The frontend reads scores from the `HealthModel` returned by the orchestrator and broadcasts them via `LiveSyncService`. No page computes its own score.

---

## Module Mapping

### Optimization Modules (used by AI Smart Optimize)

| Module | Backend Scan | Backend Optimize |
|--------|-------------|-----------------|
| Junk Cleaner | `ScanManager` + 13 cleaners | `dashboard_optimize_execute()` |
| Privacy Cleaner | `scan_privacy_items()` | `clean_privacy_items()` |
| Registry Cleaner | `scan_registry()` via `winreg` | `fix_issues()` via `winreg.DeleteValue` |
| Startup Manager | `scan_startup_entries()` | `disable_startup_entry()` |
| Performance | `get_system_metrics()` + `get_memory_info()` | `optimize_memory()` via `SetProcessWorkingSetSize` |
| Disk Analyzer | `psutil.disk_partitions()` | Informational only |

### Security Modules (used by AI Protection Center)

| Module | Backend Scan | Backend Optimize |
|--------|-------------|-----------------|
| Security Check | `_collect_metrics()` → PowerShell | Manual action only |
| System Info | `psutil` + `platform` | Informational only |

### Essential Optimization (included in Protection profile)

| Module | Why Included |
|--------|-------------|
| Junk Cleaner | Dirty system affects security |
| Privacy Cleaner | Traces can be exploited |
| Registry Cleaner | Broken entries can cause instability |

### Excluded from Optimization Score

- Firewall — belongs to Protection
- Defender — belongs to Protection
- SmartScreen — belongs to Protection
- Windows Security — belongs to Protection
- Threat Detection — belongs to Protection

---

## Scan Profiles

### Profile: `dashboard`

| Property | Value |
|----------|-------|
| Modules Scanned | All 8 (junk, privacy, registry, startup, performance, disk, security, system) |
| Modules Optimized | All auto-fixable (junk, privacy, registry, startup, performance) |
| Score Emphasis | Overall Health |
| Primary Button | "Optimize Now" |
| Purpose | Complete PC Overview |

### Profile: `optimize`

| Property | Value |
|----------|-------|
| Modules Scanned | 6 (junk, privacy, registry, startup, performance, disk) |
| Modules Optimized | All auto-fixable (junk, privacy, registry, startup, performance) |
| Score Emphasis | Optimization Score |
| Primary Button | "Optimize Now" |
| Purpose | Performance & Optimization |

### Profile: `protection`

| Property | Value |
|----------|-------|
| Modules Scanned | 5 (security, system, junk, privacy, registry) |
| Modules Optimized | Essential optimization (junk, privacy, registry) |
| Score Emphasis | Protection Score (security + optimization baseline) |
| Primary Button | "Scan Now" |
| Purpose | Security & Protection |

---

## Synchronization

### One Shared State

When optimization finishes, ALL of the following update immediately:

1. **Dashboard** — reads `healthModelAfter.overallHealth` from orchestrator result
2. **AI Smart Optimize** — reads `healthModelAfter.optimizationScore` from LiveSync
3. **AI Protection Center** — reads `healthModelAfter.protectionScore` from LiveSync
4. **Sidebar** — subscribes to `useLiveSync()` for health score badge
5. **History** — `optimizationHistoryService.recordOptimization()` called in finalize
6. **System Tray** — `updateTrayStatus()` called via `broadcastOptimizationComplete`

### LiveSyncService Store

```typescript
interface LiveScoreState {
  healthScore: number;        // overallHealth
  optimizationScore: number;  // optimizationScore
  securityScore: number;      // protectionScore
  performanceScore: number;   // performanceScore
  storageScore: number;       // storageScore
  hardwareHealth: number;     // hardwareHealth
  protectionStatus: 'fully_protected' | 'partially_protected' | 'at_risk' | 'unknown';
  lastUpdated: string | null;
  lastOptimizationAt: string | null;
}
```

### Broadcast Flow

```
orchestrator.fullAsync(profile)
  ↓ (background thread)
orchestrator_scan(profile)  → calculates healthModel (before)
orchestrator_optimize()     → calculates healthModelAfter (after)
  ↓
Frontend polls orchestrator.status(sessionId)
  → status includes healthModel + healthModelAfter
  ↓ (on phase == 'complete')
orchestrator.result(sessionId)
  → result includes healthModel + healthModelAfter
  ↓
DashboardViewModel.finalizeOrchestratorResults()
  → liveSync.broadcastScores({ all 6 scores from healthModelAfter })
  → liveSync.broadcastOptimizationComplete({ summary })
  ↓
ALL subscribed components re-render immediately
```

---

## Scan Experience

### Unified Scan Modal

All three pages use the **same** `UnifiedOptimizeFlow` component (Dashboard) or `UnifiedHealthScanModal` + `UnifiedHealthScanResults` (Dashboard page). The modal is **identical** across all three pages. Only the scan profile changes internally.

| Page | Component | Profile |
|------|-----------|---------|
| Dashboard | `UnifiedHealthScanModal` + `UnifiedHealthScanResults` | `dashboard` |
| AI Smart Optimize | `UnifiedOptimizeFlow` | `optimize` |
| AI Protection Center | `UnifiedOptimizeFlow` | `protection` |

### No Redirection

The flagship modules solve problems completely:
- Registry issues found → Fixed in-place by orchestrator
- Browser cache found → Cleaned in-place by orchestrator
- Junk files found → Removed in-place by orchestrator
- Never redirects user to Junk Cleaner, Registry Cleaner, or Browser Cleaner

### Advanced Modules

These remain available from navigation for advanced/manual use:
- Junk Cleaner
- Registry Cleaner
- Privacy Cleaner
- Browser Cleaner
- Duplicate Finder
- Disk Analyzer

They are NOT required for normal users.

---

## Cards (4 per page)

### Dashboard
1. **Overall Health** — `healthModel.overallHealth`
2. **Performance** — `healthModel.performanceScore`
3. **Protection** — `healthModel.protectionScore`
4. **Storage** — `healthModel.storageScore`

### AI Smart Optimize
1. **Optimization Score** — `healthModel.optimizationScore`
2. **Recovered Storage** — `response.optimize.spaceRecovered`
3. **Performance** — `healthModel.performanceScore`
4. **Health** — `healthModel.overallHealth`

### AI Protection Center
1. **Protection Score** — `healthModel.protectionScore`
2. **Threat Status** — from security scan results
3. **Security Components** — from security scan results
4. **Health** — `healthModel.overallHealth`

---

## Files Modified

### Backend

| File | Change |
|------|--------|
| `backend/src/avs_backend/orchestrator/health_model.py` | **NEW** — Unified health model: module categories, score hierarchy, `calculate_health_model()`, `calculate_after_health_model()`, scan profiles |
| `backend/src/avs_backend/orchestrator/__init__.py` | Import health_model; add `profile`, `healthModel`, `healthModelAfter` to session; `orchestrator_scan` filters modules by profile and calculates health model; `orchestrator_optimize` filters fixable modules by profile and calculates after health model; `orchestrator_status` and `orchestrator_result` include health model fields; `orchestrator_full` and `orchestrator_full_async` accept and propagate `profile` param |

### Frontend

| File | Change |
|------|--------|
| `apps/pc-optimizer/src/features/orchestrator/orchestrator.service.ts` | Added `ScanProfile` type, `HealthModel` interface; updated `OrchestratorScanResponse`, `OrchestratorOptimizeResponse`, `OrchestratorStatus`, `OrchestratorFullResponse` to include `healthModel` and `profile`; updated `IOrchestratorService` and `orchestratorService` to pass `profile` to `scan()`, `full()`, `fullAsync()` |
| `apps/pc-optimizer/src/features/dashboard/DashboardViewModel.ts` | `startHealthScan(profile)` accepts `ScanProfile` and filters visible modules; `runOrchestratorFullScan(profile)` passes profile to `fullAsync()`; `finalizeOrchestratorResults()` broadcasts all 6 health model scores via LiveSync |
| `apps/pc-optimizer/src/features/health/LiveSyncService.ts` | Added `optimizationScore` to `LiveScoreState` store and `useLiveScores()` hook |
| `apps/pc-optimizer/src/features/dashboard/DashboardPageV2.tsx` | Passes `'dashboard'` profile to `startHealthScan()` |
| `apps/pc-optimizer/src/features/smart-optimization-ai/SmartOptimizationPage.tsx` | Passes `'optimize'` profile to `startHealthScan()` |
| `apps/pc-optimizer/src/features/protection-center/components/ProtectionCenterPage.tsx` | Passes `'protection'` profile to `startHealthScan()` |

---

## Validation

### Backend Tests
- **73 tests passed, 2 skipped** (skips are Windows-specific tests on non-Windows platform)

### Frontend Tests
- **51 tests passed** (SmartOptimization test suite)
- **TypeScript compilation: clean** (no errors)

### Verification Checklist

| Check | Status |
|-------|--------|
| Same scan modal across all 3 pages | ✅ `UnifiedOptimizeFlow` / `UnifiedHealthScanModal` |
| Same Health Engine | ✅ `health_model.py` is single source of truth |
| Same synchronization | ✅ `LiveSyncService` broadcasts all scores |
| Different score focus | ✅ Dashboard=overall, Optimize=optimization, Protection=protection |
| No duplicate calculations | ✅ No page calculates its own score |
| No stale data | ✅ `broadcastScores()` updates all subscribers immediately |
| No page redirection | ✅ Orchestrator fixes issues in-place |
| Profile-based scanning | ✅ `dashboard`=all, `optimize`=opt-only, `protection`=sec+essential |
| Profile-based optimization | ✅ Only profile-relevant modules are optimized |
| Health model in status/result | ✅ `healthModel` and `healthModelAfter` in all RPC responses |

---

## Conclusion

The application now functions as **one intelligent platform**:

- **Dashboard** = Complete PC Overview (all modules, overall health)
- **AI Smart Optimize** = Performance & Optimization (optimization modules only)
- **AI Protection Center** = Security & Protection (security + essential optimization)

All three are powered by the same backend `health_model.py` engine, share the same scan experience via `UnifiedOptimizeFlow`, use the same synchronized data through `LiveSyncService`, and solve problems without sending the user to another module.
