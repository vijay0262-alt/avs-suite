# AI Protection Center — Architecture & Implementation Report

## Phase 6: AI Protection Center & Live Protection Dashboard

**Version:** AVS Shield V2.0  
**Date:** 2025  
**Status:** ✅ Complete — Build & Lint Pass

---

## 1. Overview

The AI Protection Center is a real-time, always-on operational dashboard that serves as the heart of AVS Shield. It provides users with an immediate, at-a-glance understanding of their PC's protection state, live activity, system health, and actionable alerts — all derived from real backend data with zero fabricated statistics.

### Design Principles

- **No fabricated data:** Every metric, event, and alert is derived from real backend services (`DashboardService`, `OptimizationEventBus`, `HealthNotificationService`, `OptimizationHistoryService`).
- **Reuse existing design system:** All UI components use `@avs/ui` primitives (`DashboardSection`, `LoadingState`, `EmptyState`) and AVS CSS design tokens (`--avs-*` custom properties).
- **Performance-first:** Polling intervals adapt to page visibility (3s visible, 15s hidden). Full refresh every 30s. Microtask-batched state updates via `ViewModel` base class.
- **Accessibility:** ARIA roles, `aria-live` regions, keyboard-navigable buttons, semantic HTML, `role="status"` for dynamic content.

---

## 2. Architecture

```
src/features/protection-center/
├── protectionCenter.types.ts          # All TypeScript types
├── ProtectionCenterViewModel.ts       # MVVM state machine
├── index.ts                           # Barrel exports
└── components/
    ├── ProtectionCenterPage.tsx       # Page composition
    ├── ProtectionBanner.tsx           # Top status bar
    ├── ProtectionCards.tsx            # Live protection cards grid
    ├── LiveActivityTimeline.tsx       # Real-time activity feed
    ├── BackgroundMonitors.tsx         # Monitor status grid
    ├── ProtectionHealth.tsx           # Coverage matrix
    ├── SystemHealthSnapshot.tsx       # Visual health summary
    ├── WhatChanged.tsx                # Changes since last scan
    ├── UpcomingAutomation.tsx         # Scheduled tasks
    ├── QuickActions.tsx               # Action buttons
    ├── ProtectionStatus.tsx           # Natural language explanation
    └── AlertsPanel.tsx                # Meaningful alerts
```

### Data Flow

```
DashboardService (RPC)
  ├── getMetrics()         → DashboardMetrics (security, performance, windows, storage, memory, cpu)
  ├── getLiveMetrics()     → LiveMetrics (fast-refreshing CPU, memory, storage, network)
  ├── getHealthScore()     → HealthScore (overall + category scores)
  └── getHardwareSensors() → HardwareSensors (temperature, fans, battery, clocks)

OptimizationEventBus
  └── subscribe()          → Real-time optimization events → Activity feed

HealthNotificationService
  └── subscribe()          → Health change notifications → Alerts

OptimizationHistoryService
  └── getRecentHistory()   → Past optimizations → "What Changed" + Activity feed

HealthTimelineService
  └── getTimeline()        → Past health readings → "Last Scan" card

ProtectionCenterViewModel
  ├── Derives ProtectionState from security metrics
  ├── Derives ProtectionCards from all metrics
  ├── Derives MonitorStatus from live metrics
  ├── Derives CoverageItems from security config
  ├── Derives SystemHealthSnapshot from all sources
  ├── Derives ChangeEntries from optimization history
  ├── Manages ScheduledTasks (free vs pro)
  ├── Manages QuickActions
  └── Derives Alerts from security metrics + notifications

ProtectionCenterPage (React)
  └── Composes all components with DashboardSection wrappers
```

---

## 3. Component Details

### 3.1 ProtectionBanner

**Purpose:** Full-width top status bar showing the current protection level.

- **Four states:** `fully_protected` (green), `partially_protected` (yellow), `at_risk` (red, pulsing), `unknown` (grey).
- **Data source:** `DashboardMetrics.security` — checks real-time protection, firewall, pending updates, Smart Screen.
- **Features:** Refresh button, last-updated timestamp, `role="status"` with `aria-live="polite"`.
- **File:** `components/ProtectionBanner.tsx`

### 3.2 ProtectionCards

**Purpose:** Grid of live protection status cards for key system aspects.

- **Cards:** Realtime Protection, Firewall, Last Scan, System Updates, Hardware Health (CPU temp), Memory Usage, Storage, Battery (if present), PC Health Score.
- **Each card shows:** Status dot (active/warning/inactive/pending), primary value, secondary value, status label, click-to-navigate.
- **Data source:** `DashboardMetrics`, `LiveMetrics`, `HardwareSensors`, `HealthScore`.
- **File:** `components/ProtectionCards.tsx`

### 3.3 LiveActivityTimeline

**Purpose:** Continuously updating timeline of real optimization and system events.

- **Event types:** optimization, security, system, scan, health — each with distinct icon and color.
- **Data source:** `OptimizationEventBus` (real-time) + `OptimizationHistoryService` (historical).
- **Features:** Scrollable list (max 30 entries), relative timestamps, metric summaries.
- **No fabrication:** Only real events from the event bus and history service are shown.
- **File:** `components/LiveActivityTimeline.tsx`

### 3.4 BackgroundMonitors

**Purpose:** Grid showing which background monitors are active and their last heartbeat.

- **Monitors:** CPU, Memory, Storage, Security, Network, Health Engine.
- **Each monitor shows:** Active/inactive status (pulsing dot), status label, detail text, last heartbeat time.
- **Data source:** `LiveMetrics` and `DashboardMetrics` presence + security flags.
- **File:** `components/BackgroundMonitors.tsx`

### 3.5 ProtectionHealth (Coverage Matrix)

**Purpose:** Visual checklist of all protection layers.

- **Coverage items:** Real-time Protection, Antivirus (Defender), Firewall, Smart Screen, System Updates, Secure Boot, TPM, Health Score ≥ 80.
- **Features:** Progress bar showing % covered, green check / red X icons, explanatory text for uncovered items.
- **Data source:** `DashboardMetrics.security` + `DashboardMetrics.windows` + `HealthScore`.
- **File:** `components/ProtectionHealth.tsx`

### 3.6 SystemHealthSnapshot

**Purpose:** Compact visual summary of all system health metrics.

- **Metrics:** Overall health score + zone, CPU usage, Memory, Storage, CPU temp, Security score, Performance score, Privacy score, Battery (if present), Uptime.
- **Features:** Color-coded progress bars (green/yellow/red) with thresholds, icon per metric.
- **Data source:** `DashboardMetrics`, `LiveMetrics`, `HardwareSensors`, `HealthScore`.
- **File:** `components/SystemHealthSnapshot.tsx`

### 3.7 WhatChanged

**Purpose:** Shows real changes since the last optimization scan.

- **Change types:** Health Score delta, Storage Recovered, Registry Issues Fixed, Privacy Items Cleaned.
- **Features:** Direction indicators (↑ improved / ↓ degraded / — neutral), formatted deltas, relative timestamps.
- **Data source:** `OptimizationHistoryService.getRecentHistory()` — real optimization records only.
- **No fabrication:** If no optimizations have been run, shows "No changes detected."
- **File:** `components/WhatChanged.tsx`

### 3.8 UpcomingAutomation

**Purpose:** Shows scheduled automation tasks with free/pro differentiation.

- **Free tasks:** Quick Security Scan (manual), Junk Cleanup (manual).
- **Pro tasks:** Quick Security Scan (daily), Full System Scan (weekly), Auto-Optimize (daily), Driver Update Check (weekly).
- **Features:** Pro-only badge (star icon), enabled/disabled status, recurrence description, upgrade prompt for free users.
- **File:** `components/UpcomingAutomation.tsx`

### 3.9 QuickActions

**Purpose:** Quick navigation buttons for common actions.

- **Actions:** Smart Optimize, Smart Security, Clean Junk, Manage Startup, Hardware Center, View Reports (pro).
- **Features:** Color-coded icon backgrounds, pro-only locking, description text.
- **File:** `components/QuickActions.tsx`

### 3.10 ProtectionStatus

**Purpose:** Natural language explanation of the current protection state.

- **Generates:** A plain-English paragraph explaining what the protection level means, which layers are covered, and what needs attention.
- **Data source:** `ProtectionState` + `CoverageItem[]`.
- **File:** `components/ProtectionStatus.tsx`

### 3.11 AlertsPanel

**Purpose:** Shows only meaningful, actionable alerts.

- **Alert sources:**
  - Real-time security checks (RTP off, firewall off, pending updates, secure boot off).
  - Resource alerts (high memory, storage almost full).
  - `HealthNotificationService` subscriptions (score drops, junk accumulation, new startup apps).
- **Severity levels:** Critical (red, `aria-live="assertive"`), Warning (yellow), Info (blue).
- **Features:** Dismiss button, action links with navigation, `role="alert"`.
- **No noise:** Only fires when there is a real, significant issue.
- **File:** `components/AlertsPanel.tsx`

---

## 4. Backend Integration & Data Sources

### 4.1 RPC Calls (via DashboardService)

| Method | RPC | Refresh Rate | Purpose |
|--------|-----|-------------|---------|
| `getMetrics()` | `DASHBOARD_METRICS` | 30s full / on event | Security, performance, windows info, storage, memory, CPU |
| `getLiveMetrics()` | `DASHBOARD_LIVE` | 3s visible / 15s hidden | Fast CPU, memory, storage, network |
| `getHealthScore()` | `DASHBOARD_HEALTH` | 30s | Overall + category health scores |
| `getHardwareSensors()` | `HARDWARE_SENSORS` | 30s | Temperature, fans, battery, clocks |

### 4.2 Event Bus Subscriptions

| Source | Event | Handling |
|--------|-------|----------|
| `OptimizationEventBus` | `CleaningCompleted`, `RegistryOptimized`, `PrivacyCleaned`, `StartupOptimized`, `DuplicateRemoved`, `PerformanceOptimized`, `ScanCompleted` | Adds to activity feed, triggers metrics refresh |
| `HealthNotificationService` | Score drop, junk accumulation, new startup apps | Adds to alerts panel |

### 4.3 History Services

| Service | Method | Purpose |
|---------|--------|---------|
| `OptimizationHistoryService` | `getRecentHistory(n)` | Activity feed + "What Changed" |
| `HealthTimelineService` | `getTimeline()` | "Last Scan" card |

---

## 5. Performance

### 5.1 Polling Strategy

- **Live metrics:** 3s when tab visible, 15s when hidden (adapts via `visibilitychange` event).
- **Full refresh:** 30s interval for all data sources.
- **Event-driven:** Optimization events trigger immediate metrics refresh (no waiting for next poll).

### 5.2 State Management

- **MVVM pattern:** `ProtectionCenterViewModel` extends `ViewModel<T>` with microtask-batched `setState()`.
- **Single source of truth:** All derived data (cards, monitors, coverage, etc.) computed in the ViewModel, not in components.
- **Minimal re-renders:** `useSyncExternalStore` (via `useViewModel`) ensures React only re-renders when state actually changes.

### 5.3 Memory

- Activity feed capped at 30 entries.
- Alerts capped at 10 entries.
- No unbounded arrays or memory leaks.

---

## 6. Accessibility

| Feature | Implementation |
|---------|---------------|
| ARIA roles | `role="main"`, `role="status"`, `role="alert"`, `role="region"`, `role="list"` |
| Live regions | `aria-live="polite"` for status banner, `aria-live="assertive"` for critical alerts |
| Labels | `aria-label` on all interactive elements (buttons, regions, cards) |
| Keyboard | All cards and actions are `<button>` elements (native keyboard focus + Enter/Space) |
| Semantic HTML | `<section>`, `<h1>`, `<h2>`, `<h3>`, `<h4>`, `<ul>`, `<li>` hierarchy |
| Reduced motion | CSS animations use `animate-pulse` (Tailwind) which respects `prefers-reduced-motion` via AVS design tokens |
| High contrast | All colors use CSS custom properties (`--avs-*`) that adapt to theme |

---

## 7. Edition Differentiation (Free vs Pro)

| Feature | Free | Professional |
|---------|------|-------------|
| Scheduled tasks | 2 manual-only tasks | 4 automated tasks (daily/weekly) |
| Quick actions | 5 actions (Reports locked) | 6 actions (all unlocked) |
| Upgrade prompt | Shown in UpcomingAutomation | Hidden |

---

## 8. Routing & Navigation

- **Route:** `/protection-center` (added to `src/router/index.tsx`)
- **Sidebar:** Added under HOME section, after Dashboard, with `ShieldExclamationIcon`
- **NavItemId:** `'protection-center'` added to `@avs/shared/types`
- **i18n:** `nav.protectionCenter: 'AI Protection Center'` added to English locale
- **Page wrapper:** `src/pages/ProtectionCenterPage.tsx` re-exports from features

---

## 9. Verification

### 9.1 TypeScript

```
npx tsc --noEmit --project apps/pc-optimizer/tsconfig.json
→ Exit code: 0 (no errors)
```

### 9.2 ESLint

```
npx eslint apps/pc-optimizer/src/features/protection-center/
→ Exit code: 0 (no errors, no warnings)
```

### 9.3 Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `protectionCenter.types.ts` | ~200 | All TypeScript types |
| `ProtectionCenterViewModel.ts` | ~600 | MVVM state machine |
| `index.ts` | 3 | Barrel exports |
| `components/ProtectionCenterPage.tsx` | ~170 | Page composition |
| `components/ProtectionBanner.tsx` | ~100 | Top status bar |
| `components/ProtectionCards.tsx` | ~80 | Live protection cards |
| `components/LiveActivityTimeline.tsx` | ~90 | Activity timeline |
| `components/BackgroundMonitors.tsx` | ~70 | Monitor status grid |
| `components/ProtectionHealth.tsx` | ~100 | Coverage matrix |
| `components/SystemHealthSnapshot.tsx` | ~160 | Health snapshot |
| `components/WhatChanged.tsx` | ~75 | Changes display |
| `components/UpcomingAutomation.tsx` | ~90 | Scheduled tasks |
| `components/QuickActions.tsx` | ~80 | Quick action buttons |
| `components/ProtectionStatus.tsx` | ~50 | Status explanation |
| `components/AlertsPanel.tsx` | ~110 | Alerts panel |
| `pages/ProtectionCenterPage.tsx` | 1 | Page wrapper |

### 9.4 Files Modified

| File | Change |
|------|--------|
| `packages/shared/src/types/index.ts` | Added `'protection-center'` to `NavItemId` |
| `packages/shared/src/i18n/index.ts` | Added `nav.protectionCenter` translation |
| `apps/pc-optimizer/src/router/index.tsx` | Added lazy import + route |
| `apps/pc-optimizer/src/components/Sidebar.tsx` | Added nav entry + icon import |

---

## 10. Design System Reuse

All components use the existing AVS Shield design system:

- **CSS tokens:** `--avs-radius-lg`, `--avs-radius-md`, `--avs-border`, `--avs-text-primary`, `--avs-text-secondary`, `--avs-text-muted`, `--avs-success`, `--avs-warning`, `--avs-danger`, `--avs-info`, `--avs-brand-primary`, `--avs-surface`, `--avs-surface-muted`, `--avs-shadow-sm`, `--avs-shadow-md`, `--avs-duration-normal`, `--avs-duration-slow`, `--avs-easing`
- **UI components:** `DashboardSection`, `LoadingState`, `EmptyState` from `@avs/ui`
- **Icons:** `@heroicons/react/24/outline`
- **Patterns:** `bg-gradient-surface`, `color-mix` for tinted backgrounds, `tabular-nums` for numeric alignment

---

## 11. No-Fabrication Guarantee

Every piece of data displayed in the AI Protection Center is traceable to a real backend source:

- **Protection state** ← `DashboardMetrics.security` (real Windows Defender / firewall status)
- **Cards** ← `DashboardMetrics`, `LiveMetrics`, `HardwareSensors`, `HealthScore` (real RPC calls)
- **Activities** ← `OptimizationEventBus` events + `OptimizationHistoryService` records (real user actions)
- **Monitors** ← Presence of `LiveMetrics` and security flags (real data availability)
- **Coverage** ← `DashboardMetrics.security` + `DashboardMetrics.windows` (real system config)
- **System health** ← `LiveMetrics` + `HardwareSensors` + `HealthScore` (real sensor data)
- **Changes** ← `OptimizationHistoryService.getRecentHistory()` (real optimization records)
- **Alerts** ← Security metric checks + `HealthNotificationService` (real threshold-based alerts)

No random data, no mock events, no fabricated statistics.
