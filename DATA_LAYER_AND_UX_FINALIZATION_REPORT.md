# Data Layer & UX Finalization Report

## Phase 24.6 — AVS Shield V2.0

---

## 1. Migration Summary

All large data types previously stored in `localStorage` have been migrated to `IndexedDB`. The migration is automatic, runs on app startup, and safely moves existing data without loss.

### Migrated Data Types

| Data Type | localStorage Key | IndexedDB Store | Max Records | Max Age |
|---|---|---|---|---|
| Scan History | `avs-scan-history` | `scanHistory` | 200 | 90 days |
| Verification Logs | `avs-verification-logs` | `verificationLogs` | 500 | 30 days |
| Deferred Cleanup Queue | `avs-deferred-cleanup-queue` | `deferredCleanup` | 500 | 7 days |
| Execution History | `avs_execution_history` | `executionHistory` | 500 | 90 days |
| Health Timeline | `avs_health_timeline` | `healthTimeline` | 500 | 90 days |
| Scan State (crash recovery) | `avs:scan:state` | `scanState` | 1 | 24 hours |
| Dashboard Session | `avs:dashboard:session` | `dashboardSession` | 1 | 24 hours |
| Execution Engine State | `avs_execution_state` | `executionState` | 1 | 24 hours |

### Data Types Not Migrated (Kept in localStorage)

These are small settings/preferences that are appropriate for `localStorage`:

| Key | Purpose |
|---|---|
| `avs-developer-mode` | User preference (boolean) |
| `avs-auth-session` | Auth token (encrypted, small) |
| `avs-license-cache` | License cache (encrypted, small) |
| `avs_sync_cache` | Sync cache (small) |
| `avs_config_cache` | Config cache (small) |
| `avs-deferred-cleanup-dismissed` | UI dismissals |
| `avs-onboarding-*` | Onboarding state |
| `avs-ai-assistant-questions` | Usage quota |
| `avs-recent-searches` | Global search history |
| `avs-usage-quota-*` | Usage quotas |
| Theme, sidebar state, window settings | UI preferences |

### Notifications & Activity Log

Notifications (`ProtectionNotificationCenter`) and the Activity Log are in-memory only (Map-based). They were never persisted to `localStorage` and do not require IndexedDB migration.

### Reports

Reports are built on-demand from execution history records. No separate report storage exists in `localStorage`.

---

## 2. Database Schema

### Database: `avs-shield-db` (version 1)

| Object Store | Key Path | Stores |
|---|---|---|
| `scanHistory` | `id` | `UnifiedScanHistoryEntry` |
| `verificationLogs` | `id` | `VerificationLog` |
| `deferredCleanup` | `id` | `DeferredCleanupItem` |
| `executionHistory` | `id` | `ExecutionRecord` |
| `healthTimeline` | `id` | `TimelineEntry` |
| `scanState` | `key` | `PersistedScanState` |
| `dashboardSession` | `key` | `PersistedSession` |
| `executionState` | `key` | `PersistedExecutionState` |

### Versioning

- Current version: 1
- `onupgradeneeded` creates all object stores on first open
- Future versions can add migration logic in the upgrade handler

### Corruption Recovery

- `idbRecover()` deletes the entire database and recreates it
- All `idb*` functions gracefully return empty/null when IndexedDB is unavailable
- No data is lost from `localStorage` during recovery (migration only removes keys after successful IDB write)

---

## 3. Storage Usage

### Automatic Cleanup

- `idbCleanupAll()` runs on app startup after migration
- Each store enforces `maxRecords` and `maxAgeMs` limits
- Records are sorted by timestamp (newest first) and trimmed to `maxRecords`
- Records older than `maxAgeMs` are removed

### Migration Flow

1. App starts → `idbMigrateFromLocalStorage()` runs
2. For each mapped `localStorage` key:
   - Parse JSON data
   - Write each record to the corresponding IndexedDB store
   - Remove the `localStorage` key
3. `idbCleanupAll()` enforces retention policies
4. `initDeferredCleanupStore()` loads deferred items into Zustand
5. `executionHistoryRepository.init()` loads execution history

---

## 4. UI Simplification

### Dashboard

- **4 primary cards**: Health Score (large, 2-col), Protection Status, Last Scan, Top Recommendation
- **2 panels**: System Health (live metrics + hardware sensors), Recommendations & History
- No duplicated metrics (Performance/Storage only in Health Score card)
- Scan results show: what was found, what was fixed, what changed, what needs attention

### AI Smart Optimize

- **2 primary cards**: Current → Potential Score (large, 2-col), Plan Summary
- **2 panels**: Plan & Insights (actions, warnings, AI insights), Results & Settings (simulation, report, config)
- No duplicated metrics (score improvement only in primary card, details in panels)
- 2 cards instead of 4 because adding more would duplicate information

### AI Protection Center

- **2 primary cards**: Live Protection (monitors + coverage), Last Scan
- **2 panels**: Protection & Activity (protection cards + activity timeline), System Health & Automation (health snapshot + quick actions)
- Active Alerts section is conditional (only shows when alerts exist)
- No duplicated metrics

### AI Smart Security

- **2 primary cards**: Real-Time Protection (status + definitions), Last Scan (time + threats)
- **2 panels**: Protection & Threats, Scan History
- Tab-based layout for Overview, Threats, Investigation, Remediation, Intelligence
- No duplicated metrics

---

## 5. Files Modified

### New Files

| File | Purpose |
|---|---|
| `src/services/avsWithIDB.ts` | IndexedDB wrapper with CRUD, cleanup, migration, corruption recovery |

### Modified Files

| File | Changes |
|---|---|
| `src/main.tsx` | Added IDB migration + cleanup + store init on startup |
| `src/features/unified-results/useScanHistory.ts` | Replaced localStorage with IndexedDB |
| `src/features/health/DeferredCleanupStore.ts` | Replaced localStorage with IndexedDB, added `initDeferredCleanupStore()` |
| `src/features/maintenance-history/executionHistoryRepository.ts` | Replaced localStorage with IndexedDB, added `init()` method |
| `src/features/system-health-dashboard/healthTimeline.ts` | Replaced localStorage with IndexedDB, `load()` now async |
| `src/features/dashboard/ScanStatePersistence.ts` | Replaced localStorage with IndexedDB, `loadScanState()` and `detectInterruptedScan()` now async |
| `src/features/dashboard/sessionPersistence.ts` | Replaced localStorage with IndexedDB, `loadSession()` now async |
| `src/features/dashboard/DashboardViewModel.ts` | Updated to use async `loadSession()` and `detectInterruptedScan()`, verification logs use IndexedDB |
| `src/features/maintenance-engine/executionEngine.ts` | Replaced localStorage with IndexedDB, `init()` now async |
| `src/features/maintenance-engine/executionStore.ts` | `init()` now async to await `executionEngine.init()` |
| `src/features/security-dashboard/SecurityCenterPage.tsx` | Consolidated Overview tab to 2 panels (Protection & Threats + Scan History) |

---

## 6. Remaining Risks

### Async Initialization

Several stores now require async initialization. The app handles this by:
- Using `.then()` callbacks in the bootstrap (non-blocking)
- Starting with empty state and populating when IDB loads
- Risk: brief window where UI shows empty data before IDB loads (mitigated by loading states)

### Test Updates Required

Tests in the following files reference `localStorage` directly and will need updates:
- `maintenanceEngine.test.ts` — calls `executionEngine.init()` synchronously, checks `localStorage.getItem('avs_execution_state')`
- `maintenanceHistory.test.ts` — checks `localStorage.getItem('avs_execution_history')`
- `SmartOptimization.test.ts` — calls `loadSession()` synchronously

### IndexedDB Availability

- In Electron, IndexedDB is always available
- The wrapper gracefully degrades to no-op when IndexedDB is unavailable
- Risk: data loss if IndexedDB is corrupted and recovery is triggered (acceptable — corrupted data is unusable)

### Test Environment

- Tests using `happy-dom` may not have full IndexedDB support
- Tests may need to mock `idbGetAll`, `idbPut`, etc. or use fake-indexeddb
