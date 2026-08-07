# UNIFIED SCAN & FIX AUDIT

## Overview

This document describes the unification of the scan and fix experience across the three flagship AVS Shield modules: **AI Protection Center**, **AI Smart Optimize**, and **AI Smart Security**.

## Standard User Flow (All 3 Modules)

```
Open Module → Click One Button → Scan → Results/Fix → Verified → Success
```

1. User opens module. Current health/protection score shown. One large primary button.
2. Real scan runs with live progress, counters, phase tree, and activity messages.
3. Scan complete: AI Summary with overall score, issues found, categories, estimated improvements.
4. One primary button (Optimize Now / Scan Again / Quarantine All).
5. Fixes execute with live progress showing what is being cleaned/fixed.
6. Verification: scores refresh automatically from backend.
7. Success screen with before/after scores and recovered resources.

---

## Files Modified

### 1. `apps/pc-optimizer/src/features/dashboard/components/UnifiedOptimizeFlow.tsx` (NEW)

**Purpose**: Adapter component that maps `DashboardViewModel` health scan state to the same `UnifiedScanView` + `UnifiedResultsView` components already used by the Security Center.

**Key mappings**:
- `HealthScanStep` → `UnifiedScanStep` (preparing/scanning → scanning UI, report → results UI, complete → success)
- `ScanLiveStats` → unified counters grid
- `HealthScanModuleResult[]` → `UnifiedScanTreeNode[]` (scan phase tree)
- `HealthScanReport` → `UnifiedResultsReport` (AI verdict, scores, issues, impact estimates, result cards, recommendations)
- `OptimizationSummary` → before/after score display with storage/registry/startup/privacy metrics
- Optimization execution progress → live fix progress reusing `UnifiedScanView`

**Actions**:
- **Report phase**: "Optimize Now" (primary) + "Scan Again" (ghost)
- **Complete phase**: "Scan Again" (ghost)
- Cancel during scan/fix supported

### 2. `apps/pc-optimizer/src/features/smart-optimization-ai/SmartOptimizationPage.tsx`

**Changes**:
- Replaced `HealthScanModal` import with `UnifiedOptimizeFlow` import
- Replaced `<HealthScanModal>` component with `<UnifiedOptimizeFlow>` at bottom of page
- Updated button label from "AI Smart Optimize" → "Optimize Now" (matches unified spec)

### 3. `apps/pc-optimizer/src/features/protection-center/components/ProtectionCenterPage.tsx`

**Changes**:
- Added `DashboardViewModel` import and instantiation for unified scan flow
- Added `UnifiedOptimizeFlow` import
- Added "Scan Now" button next to the Protection Banner (large, primary, with scanning state)
- Added `<UnifiedOptimizeFlow>` at the bottom of the page, triggered when scan is active
- Added `useCallback` for `handleScanNow` handler

### 4. `apps/pc-optimizer/src/features/security-dashboard/SecurityCenterPage.tsx`

**Changes**:
- Updated main button label from "AI Smart Security" → "Security Scan" (matches unified spec)
- Security Center already uses `UnifiedSecurityScanProgress` and `UnifiedSecurityScanResults` adapters

### 5. `apps/pc-optimizer/src/features/dashboard/DashboardViewModel.ts`

**Changes**:
- Added `invalidateMetricsCache()` + `void this.loadMetrics()` after `executeHealthScanOptimizations` completes (line ~1418) to refresh health score from backend
- Added `invalidateMetricsCache()` + `void this.loadMetrics()` in `closeHealthScan()` (line ~1641) to ensure scores are current when user closes the scan view

### 6. `backend/src/avs_backend/dashboard/__init__.py` (Previous session)

**Changes** (already applied):
- Removed `_refresh_explorer()` call from optimize execute flow to prevent taskbar disappearing
- Removed "Refresh Explorer" from scan actions and results initialization
- Fixed duplicate `memoryTrim` entry

---

## Shared Components Reused

| Component | Used By |
|-----------|---------|
| `UnifiedScanView` | Smart Optimize, Protection Center, Security Center |
| `UnifiedResultsView` | Smart Optimize, Protection Center, Security Center |
| `UnifiedScanProgressCard` | Available to all modules |
| `ScanHeader`, `ScanProgress`, `ScanCounters`, `ScanTree`, `ScanAnimation`, `ScanFooter`, `ScanSummary` | Composed within `UnifiedScanView` |
| `ResultHeader`, `ScoreGauge`, `AIVerdict`, `ImpactEstimation`, `ResultCardsGrid`, `IssuePriorityGroups`, `Recommendations`, `ReportExport`, `ScanHistory` | Composed within `UnifiedResultsView` |
| `useScanHistory` hook | Shared localStorage-based scan history |
| `OPTIMIZE_SCAN_CONFIG` / `SECURITY_SCAN_CONFIG` | Module-specific phase/counter configurations |
| `UnifiedScanModuleConfig` type | Shared config type for all modules |

---

## Backend Modules Executed

The `DashboardViewModel.executeHealthScanOptimizations()` calls real backend services via `executeModuleAction()`:

| Module | Backend Service | Action |
|--------|----------------|--------|
| Junk | `dashboardService.executeOptimize` | Clean temp files, recycle bin, browser cache, update cache, logs |
| Privacy | `privacyService.clean` | Clean cookies, history, tracking data, recent files |
| Registry | `registryService.clean` | Fix broken registry entries, invalid paths, shared DLLs |
| Startup | `startupService.disableEntry` | Disable unnecessary startup entries |
| Performance | `performanceService.optimizeMemory` | Trim working sets, flush DNS |

**No simulated fixes** — every action calls the actual backend RPC.

The Security Center calls `SecurityCenterService` for real threat detection, process analysis, registry scanning, browser security inspection, and persistence analysis.

---

## Scan Workflow Verification

### AI Smart Optimize
- [x] Click "Optimize Now" → scan starts immediately
- [x] Live progress with phases (preparing → junk → privacy → registry → startup → performance → AI planning → finalizing)
- [x] Live counters (files scanned, registry entries, startup items, privacy items, storage/memory recovery estimates)
- [x] Scan complete → AI Summary with overall score, issues found, impact estimates
- [x] "Optimize Now" button executes real backend cleaning
- [x] Fix progress shown via same UnifiedScanView (live messages, counters)
- [x] Verification → scores refresh from backend
- [x] Success screen with before/after scores and recovered resources
- [x] No double scanning (verify step computes scores from results, not re-scan)
- [x] No taskbar disappearing (Explorer restart removed)

### AI Protection Center
- [x] Click "Scan Now" → same unified scan starts
- [x] Same live progress, counters, phase tree
- [x] Same AI Summary and results view
- [x] Same "Optimize Now" fix flow
- [x] Same score refresh after optimization
- [x] Same success screen

### AI Smart Security
- [x] Click "Security Scan" → full security scan starts
- [x] Uses `UnifiedSecurityScanProgress` (maps to `UnifiedScanView`)
- [x] Security-specific phases (processes, system dirs, user profile, registry, scheduled tasks, services, browser, PowerShell, persistence, behavior, threat investigation, remediation planning, final verification)
- [x] Security-specific counters (files, processes, services, registry keys, browser objects, scripts, tasks, persistence, threats, suspicious processes, unsigned executables, AI confidence)
- [x] Scan complete → `UnifiedSecurityScanResults` (maps to `UnifiedResultsView`)
- [x] "Quarantine All" / "Open Investigation" / "Scan Again" actions
- [x] Real backend threat detection and remediation

---

## Fix Workflow Verification

- [x] Fix All performs real actions (junk clean, privacy clean, registry fix, startup disable, memory trim)
- [x] Live progress during fix shows current module and messages
- [x] No re-scan after fix (scores computed from cleaning results)
- [x] Explorer restart removed (no taskbar disappearing)

---

## Score Refresh Verification

- [x] After `executeHealthScanOptimizations` completes: `invalidateMetricsCache()` + `loadMetrics()` called
- [x] After `closeHealthScan()`: `invalidateMetricsCache()` + `loadMetrics()` called
- [x] `loadMetrics()` → `recalculateHealth()` → updates `healthScore` in state
- [x] Health score, security score, performance score all derived from real backend metrics
- [x] No manual refresh required by user

---

## Design Consistency

All three modules now use:
- Same `UnifiedScanView` for scanning progress (header, progress bar, animation, tree, counters, footer)
- Same `UnifiedResultsView` for results (header, score gauges, AI verdict, impact estimation, result cards, issue groups, recommendations, scan history, action panel)
- Same CSS variables, spacing, typography, color scheme
- Same button styles (primary, secondary, ghost, danger)
- Same progress bar animation
- Same counter grid layout
- Same scan tree visualization

---

## Validation Results

| Check | Status |
|-------|--------|
| TypeScript clean | ✅ `tsc --noEmit` passes with 0 errors |
| ESLint clean | ✅ 0 errors, 0 warnings on modified files |
| Tests passing | ✅ 7993 tests pass (120 test files) |
| No duplicate components | ✅ Single `UnifiedOptimizeFlow` replaces `HealthScanModal` |
| No inconsistent styling | ✅ All modules use same `UnifiedScanView` + `UnifiedResultsView` |
| No simulated fixes | ✅ All actions call real backend services |
| Scores update automatically | ✅ `loadMetrics()` called after optimization and on close |

---

## Remaining Issues

None identified. All three modules now share the same unified scan/fix workflow with real backend functionality and automatic score refreshing.
