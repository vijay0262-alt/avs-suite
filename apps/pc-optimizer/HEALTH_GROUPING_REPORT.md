# Health Scan Category Grouping Report

## Overview

The Health Scan model has been refactored from exposing **backend implementation modules** (junk, registry, startup, privacy, performance, disk, security, system, browser) to **5 user-centric grouped categories**. The UI now never exposes internal implementation details.

---

## Old Model vs New Model

### Old Model (Backend Implementation Modules)

| Module ID    | Display Name      | Description                        |
|--------------|-------------------|------------------------------------|
| junk         | Junk Cleaner      | Temporary files, browser cache     |
| registry     | Registry Cleaner  | Invalid registry entries           |
| startup      | Startup Manager   | Startup applications               |
| privacy      | Privacy Cleaner   | Browsing traces, cookies           |
| performance  | Performance       | Memory and CPU usage               |
| disk         | Disk Analyzer     | Disk usage analysis                |
| security     | Security Check    | Firewall, defender status          |
| system       | System Information| OS version, uptime                 |
| browser      | Browser Cleaner   | Browser-specific cleanup           |

**Problem**: Tests expected 8 modules. UI exposed internal implementation details. Users saw technical module names instead of meaningful health categories.

### New Model (User-Facing Categories)

| Category ID    | Display Name    | Description                                    | Backend Modules Mapped          |
|----------------|-----------------|------------------------------------------------|---------------------------------|
| system_health  | System Health   | Registry integrity and system configuration    | registry, system                |
| storage        | Storage         | Junk files, temporary data, and disk usage     | junk, disk                      |
| performance    | Performance     | Startup apps, memory, and CPU optimization     | startup, performance            |
| privacy        | Privacy         | Browser traces, cookies, and activity history  | privacy, browser                |
| protection     | Protection      | Security status, firewall, and threat protection| security                        |

---

## Files Modified

### 1. `healthCategoryMapping.ts` (NEW)
- Defines `HealthCategoryId` type (5 category IDs)
- Defines `HealthCategoryConfig` interface with category metadata
- Exports `HEALTH_CATEGORIES` array with all 5 category configs
- Exports `getCategoryIdForModule()` — maps backend module ID to category ID
- Exports `getCategoryConfig()` — retrieves category config by ID
- Exports `groupModulesToCategories()` — aggregates backend `HealthScanModuleResult[]` into grouped category results with:
  - Aggregated status (scanning if any scanning, error if any error, complete if all complete)
  - Summed issues, recoverable space
  - Averaged score across completed modules
  - Aggregated actual results (bytesRecovered, itemsRemoved, entriesDisabled, issuesFixed)
  - Aggregated verification data (before/after scores, issues, recoverable space)

### 2. `dashboard.types.ts`
- **`ScanPhase`** type updated: replaced `'junk' | 'privacy' | 'registry' | 'startup' | 'performance'` with `'system_health' | 'storage' | 'performance' | 'privacy' | 'protection'`
- **`SCAN_PHASES`** array updated: 7 phases (preparing, system_health, storage, performance, privacy, ai_planning, finalizing) with adjusted percentage ranges

### 3. `moduleConfigs.ts`
- **`OPTIMIZE_SCAN_CONFIG`** phases updated to use 5 category IDs instead of implementation module IDs
- Phase labels and descriptions updated to reflect user-facing categories
- Activity items updated per category

### 4. `DashboardViewModel.ts`
- **`startHealthScan()`**: Creates 5 category modules from `HEALTH_CATEGORIES` instead of filtering backend modules by profile
- **`runOrchestratorFullScan()`**:
  - Creates 5 category modules
  - Polling loop: aggregates backend `moduleStatuses` into category-level statuses (scanning/complete/error)
  - `scanPhase` mapped via `getCategoryIdForModule(currentBackendModule)`
  - Free-version scan-only path: builds backend module results from orchestrator data, then groups via `groupModulesToCategories()`
- **`finalizeOrchestratorResults()`**: Builds backend module results from orchestrator scan + optimize data, then groups via `groupModulesToCategories()`. `actualMap` now keyed by category ID.
- **`modulePhaseMap`** (legacy scan path): Updated to map backend module IDs to category scan phases
- Removed unused `modules` parameter from `finalizeOrchestratorResults()`

### 5. `UnifiedHealthScanModal.tsx`
- `buildReport()`: Updated `startup` reference to `performance` category (startup is now part of performance category)

### 6. `SmartOptimization.test.ts`
- Updated test: `healthScanModules.length` expects 5 (not 8)
- Updated test: validates category IDs are `['system_health', 'storage', 'performance', 'privacy', 'protection']`
- Replaced tests for non-existent `getLiveMessageForModule`/`getDoneMessageForModule` with:
  - Test validating all 5 categories have status, score, issuesFound, severity, canAutoFix, measuredDetail, details
  - Test validating categories do not expose backend-only module IDs
- Added new `Health Category Grouping Model` test suite (8 tests):
  - Validates `HEALTH_CATEGORIES` has exactly 5 categories
  - Validates each category has name, description, icon, modules array
  - Validates `getCategoryIdForModule` mappings for all 9 backend modules
  - Validates `getCategoryIdForModule` returns undefined for unknown modules
  - Validates `groupModulesToCategories` aggregation (issues, space, status, actual results)
  - Validates status aggregation (scanning if any scanning, error if any error)
  - Validates verification before/after data aggregation

---

## Mapping: Backend Modules → User-Facing Categories

```
junk         → storage
disk         → storage
registry     → system_health
system       → system_health
startup      → performance
performance  → performance
privacy      → privacy
browser      → privacy
security     → protection
```

---

## Aggregation Logic

### Status Aggregation
- **scanning**: if any backend module in the category is scanning
- **error**: if any backend module in the category has an error (takes precedence over complete)
- **complete**: if all backend modules in the category are complete or skipped
- **pending**: if all backend modules in the category are pending

### Score Aggregation
- Average of scores from completed backend modules in the category (rounded)

### Issues Aggregation
- Sum of `issuesFound` across all backend modules in the category

### Recoverable Space Aggregation
- Sum of `recoverableSpace` across all backend modules in the category

### Actual Results Aggregation
- `success`: true only if all backend module actuals succeeded
- `bytesRecovered`, `itemsRemoved`, `entriesDisabled`, `issuesFixed`: summed across modules
- `errors`: concatenated from all modules

### Verification Aggregation
- `beforeScore`: average of before scores across verified modules
- `beforeIssues`, `beforeRecoverable`: summed across verified modules
- `afterScore`: average of after scores across verified modules
- `afterIssues`, `afterRecoverable`: summed across verified modules

---

## No Duplicated Calculations

- **Single grouping function**: `groupModulesToCategories()` is the only function that aggregates backend module results into categories
- **Single source of truth**: `HEALTH_CATEGORIES` is the only definition of category configs and module mappings
- **Dashboard, AI Smart Optimize, and Protection Center** all use the same `DashboardViewModel` state which now contains grouped category modules
- The polling loop in `runOrchestratorFullScan` aggregates statuses inline for real-time updates, but final results always go through `groupModulesToCategories()`

---

## Validation Results

| Check               | Status |
|---------------------|--------|
| Tests (7855)        | ✅ All passed |
| Typecheck           | ✅ No errors |
| Lint (max-warnings=0) | ✅ No warnings |
| Build               | ✅ Success |
