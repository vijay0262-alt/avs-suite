# Explainable Optimization Center — Sprint 2 Task 2 Implementation Report

## Objective

Increase user trust by making every optimization transparent. Before any action, the user now sees exactly what was found, why it matters, what will happen, what will NOT happen, and the expected benefit. After optimization, the UI displays exactly what changed and whether each operation is reversible.

---

## What Was Implemented

### 1. Rich Optimization Summary (Before Optimization)

`HealthScanModal` was extended to show an **Optimization Summary** instead of a plain checkbox list. It now displays:

- **Current Health** → **Predicted Health**
- **Storage Recovery** (recovered bytes)
- **Boot Improvement** (estimated seconds)
- **RAM Available After** (estimated bytes)
- **Traces Removed** count
- **Category count**

Each category is presented in an expandable card with:

- **Summary** sentence
- **Impact** badge (Low / Medium / High)
- **Safe to remove**: Yes/No
- **Estimated recovery** / boot improvement / RAM / traces where applicable
- **Why this matters** explanation
- **What will NOT be changed** list (per category)
- **Details** groups with items, sizes, and reasons

### 2. Global Reassurance

A clearly visible "What will NOT be changed" banner reassures the user that:

- Personal files, documents, photos, and videos will not be deleted
- Passwords, bookmarks, and saved logins will not be removed
- Installed software and Windows system files will not be modified

### 3. Per-Module Explainable Details

`DashboardViewModel.runHealthScan()` now populates `OptimizationDetails` for every module:

- **Junk Cleaner**: temporary files and caches per cleaner, total recoverable space
- **Startup Manager**: high-impact startup applications that can be disabled, boot-time estimate
- **Privacy Cleaner**: traces by category (browser cache, cookies, recent files, DNS cache), explicit "NOT removed" list
- **Performance**: alerts, estimated RAM recovery
- **Disk Analyzer**: per-drive usage and free space
- **Registry Cleaner**: invalid entries grouped by category, backup reassurance
- **Security Check**: pending updates and disabled protections
- **System Information**: restart recommendation when uptime is high

### 4. Completion Transparency

The completion screen now shows:

- Health before → after
- Recovered space, modules used, time taken
- **Exactly what changed** — a row for every optimization action with cleaned status and size
- **Undo availability** — per selected module, clearly indicating `Yes` or `No`

### 5. Undo Support Indicators

Undo availability is mapped per module:

| Module | Undo Available |
|--------|----------------|
| Junk Cleaner | Yes (via Undo Clean) |
| Startup Manager | Yes (via Restore Backup) |
| Registry Cleaner | Yes (via Restore Backup) |
| Privacy Cleaner | No |
| Performance | No |
| Disk Analyzer | No |
| Security Check | No |
| System Information | No |

### 6. Performance

All UI calculations are derived from already-loaded scan results; no additional RPCs or heavy computations are performed. Detail aggregation runs inside the existing scan tasks, well under the 50 ms UI-calculation target.

---

## Files Modified

- `apps/pc-optimizer/src/features/dashboard/dashboard.types.ts`
- `apps/pc-optimizer/src/features/dashboard/DashboardViewModel.ts`
- `apps/pc-optimizer/src/features/dashboard/components/HealthScanModal.tsx`
- `EXPLAINABLE_OPTIMIZATION_REPORT.md` (new)

---

## Verification

- `yarn lint` passes with no warnings or errors.
- `npm run build` in `apps/pc-optimizer` completes successfully.

---

## Known Limitations

1. **Undo is informational only.** The UI shows whether undo is supported for a category, but there is no single "Undo" button in the completion screen. Users must use the existing per-module restore/backup flows.
2. **Junk-cleaner detail items are not itemized.** Only per-cleaner totals are shown; individual file lists would require fetching result pages.
3. **Startup undo implies backup creation.** The display says `Yes`, but the actual restore depends on whether a backup was created during the disable step.
4. **Screenshots** were not captured in this session; they should be taken from a live UI preview before release.

---

## Next Recommended Steps

1. Add a single-click **Undo** button on the completion screen wired to `junkCleanerService.undoClean`, `startupService.restoreBackup`, and `registryService.restore`.
2. Fetch and paginate individual junk-cleaner result items for richer detail lists.
3. Capture UI screenshots showing the expanded details, reassurance banner, and undo-availability table.
4. Add user-tested copy refinements to ensure descriptions feel trustworthy and non-technical.
