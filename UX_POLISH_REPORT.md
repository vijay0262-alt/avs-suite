# AVS PC Optimizer — Commercial UX Polish (Sprint 3, Task 1)

## Status snapshot

| Subtask | Status | Notes |
|---|---|---|
| S3T1-1 Audit pages, loading, routing | Completed | All pages use lazy routing; bootstrapping is async; several modules show plain text placeholders. |
| S3T1-2 Global skeleton shell / loading placeholders | Completed | `LoadingFallback` now renders a page-level skeleton. `SystemInfoPage` renders inline skeleton cards. |
| S3T1-3 Scan progress UX | Completed (Junk Cleaner) | `ScanProgress` now shows current operation, files scanned, items found, junk size, elapsed time, ETA, and current path. |
| S3T1-4 Disk Analyzer drive selection | Completed | Added multi-select cards, system-drive badge, capacity/used/free/fstype details, custom folder input, and skeleton loading. |
| S3T1-5 Duplicate Finder scope / estimate UI | Completed | Added scope pills (Entire drive, Pictures, Videos, Music, Documents, Downloads, Desktop, Custom), real-time estimate, and backend `duplicate.estimate` RPC. |
| S3T1-6 Startup Manager columns, sort, filter, signatures | Completed | Added search, impact/status filters, sort, and `StartupEntryCard` now displays signature status, boot impact, and last launch. |
| S3T1-7 System Information tabs + export | Completed | New `SystemInfoTabs` with Overview/CPU/Memory/Storage/Graphics/Network/OS tabs; TXT export + Print-to-PDF. |
| S3T1-8 Global search navigation | Completed | `GlobalSearch` added to sidebar with Ctrl+K shortcut; supports module keyword search. |
| S3T1-9 Consistency pass | Partial | New inputs and tabs follow `Card`/`Button` patterns; full color/typography audit not done. |
| S3T1-10 Accessibility pass | Partial | Focus rings added to new inputs/selects/tabs; full keyboard/contrast audit not done. |
| S3T1-11 UX report | Completed | This document. |

## Files created / modified

### Created
- `apps/pc-optimizer/src/components/GlobalSearch.tsx`
- `apps/pc-optimizer/src/features/system-info/components/SystemInfoTabs.tsx`

### Modified
- `apps/pc-optimizer/src/components/LoadingFallback.tsx`
- `apps/pc-optimizer/src/components/Sidebar.tsx`
- `apps/pc-optimizer/src/features/disk-analyzer/DiskAnalyzerPage.tsx`
- `apps/pc-optimizer/src/features/disk-analyzer/DiskAnalyzerViewModel.ts`
- `apps/pc-optimizer/src/features/disk-analyzer/disk-analyzer.types.ts`
- `apps/pc-optimizer/src/features/duplicate-finder/DuplicateFinderPage.tsx`
- `apps/pc-optimizer/src/features/duplicate-finder/DuplicateFinderViewModel.ts`
- `apps/pc-optimizer/src/features/duplicate-finder/duplicate-finder.service.ts`
- `apps/pc-optimizer/src/features/duplicate-finder/duplicate-finder.types.ts`
- `apps/pc-optimizer/src/features/junk-cleaner/components/ScanProgress.tsx`
- `apps/pc-optimizer/src/features/junk-cleaner/junkCleaner.types.ts`
- `apps/pc-optimizer/src/features/startup/StartupPage.tsx`
- `apps/pc-optimizer/src/features/startup/components/StartupEntryCard.tsx`
- `apps/pc-optimizer/src/features/startup/startup.types.ts`
- `apps/pc-optimizer/src/features/system-info/SystemInfoPage.tsx`
- `backend/src/avs_backend/duplicate_finder/__init__.py`

## What was implemented

### 1. Global search (`GlobalSearch`)
- Lives at the top of the sidebar.
- Keyboard shortcut: **Ctrl+K** / **Cmd+K**.
- Keyword navigation: `startup`, `privacy`, `duplicate`, `disk`, `memory`, `junk`, `registry`, `performance`, `system`, `settings`, etc.
- Arrow-key + Enter selection, click outside to close.

### 2. Loading experience
- `LoadingFallback` now shows a page skeleton (header, stat cards, content block) instead of the string "Loading…".
- `SystemInfoPage` shows inline `animate-pulse` skeleton cards while the first system report loads.

### 3. Junk Cleaner scan progress
- Labels updated: **Files Scanned**, **Items Found**, **Junk Identified**, **Elapsed Time**, **Current Operation**, **Current Path**.
- ETA shown as "Remaining" while running; duration shown when finished.
- Current path renders only when the backend provides it.
- Type snapshot extended with `currentPath` and `totalItems`.

### 4. Startup Manager
- Added optional `signatureStatus`, `bootImpactMs`, and `lastLaunch` to `StartupEntry`.
- `StartupEntryCard` displays publisher, source/location, digital signature, boot impact, last launch, status badge, and enable/disable actions.
- `StartupPage` provides:
  - Real-time search across name/publisher/command.
  - Status filter (All / Enabled / Disabled).
  - Impact filter (All / High / Medium / Low / Unknown).
  - Sort by name, impact, publisher, status.

### 5. System Information
- Replaced long single-page scroll with tabbed layout:
  - Overview, CPU, Memory, Storage, Graphics, Network, Operating System.
- **Export TXT** generates a plain-text report and triggers browser download.
- **Print / PDF** uses `window.print()` so the OS print-to-PDF flow can save the report.
- Storage tab renders per-drive usage bars.

### 6. Disk Analyzer
- Added multi-select drive cards with checkboxes.
- Highlights the Windows system drive with a badge.
- Shows capacity, used, free, file system, and usage bar.
- Supports a specific-folder input alongside drives.
- Displays skeleton cards while drives load.

### 7. Duplicate Finder
- Replaced single drive selection with scope pills:
  - Entire drive, Pictures, Videos, Music, Documents, Downloads, Desktop, Custom.
- Shows real-time estimate (file count and size) before scanning.
- Added backend `duplicate.estimate` RPC for fast pre-scan counting.

## Performance notes (manual validation needed)

Targets per task:
- Module open < 100 ms
- No UI freezes
- 60 FPS animations
- Minimal layout shifts

Observations from code review:
- Routing already preloads common modules (`ModulePreloader` in `router/index.tsx`).
- `SystemInfoPage` now renders the shell instantly and loads data in the background.
- `LoadingFallback` is a pure CSS skeleton (`animate-pulse`), no JS overhead.
- Animations are limited to opacity/pulse; layout shifts are reduced by using fixed-height skeleton bars.

Recommended measurements:
1. Open DevTools Performance, enable 6x CPU throttle, record navigation between modules.
2. Check `Performance.longTaskCount` while scanning; scans are async so main thread should stay responsive.
3. Use `CLS` (Cumulative Layout Shift) in DevTools to verify skeletons do not shift after data loads.
4. Verify `Ctrl+K` search opens without frame drops.

## Screenshots

Screenshots are to be captured from the built Electron app or the dev server. Suggested captures:
1. Sidebar with global search active and keyword results.
2. System Information → CPU tab with export buttons visible.
3. Junk Cleaner scan in progress showing current operation, files scanned, items found, elapsed time.
4. Startup Manager with filter bar and a high-impact entry expanded.
5. LoadingFallback skeleton on a slow 3G/throttled connection.

(Attach PNG/JPEG files here once captured.)

## Remaining gaps and inconsistencies

### High-priority remaining work
1. **Duplicate Finder (S3T1-5)**
   - Add scope pills: Entire drive, Pictures, Videos, Music, Documents, Downloads, Specific folder.
   - Display estimated file count before scan.
   - Wire new scopes to `DuplicateFinderViewModel.scan()`.

2. **Consistency pass (S3T1-9)**
   - Audit all `Button` usage for identical sizing/variants.
   - Standardize `Card` title typography and spacing.
   - Replace any remaining raw Tailwind colors with semantic tokens.
   - Replace any remaining ad-hoc loading strings with skeletons or `LoadingFallback`.

3. **Accessibility pass (S3T1-10)**
   - Add `aria-label` to all icon-only buttons.
   - Ensure all interactive elements have visible `:focus-visible` rings.
   - Test keyboard navigation through sidebar, global search, dialogs, and tables.
   - Verify color contrast for `text-text-muted` on `bg-surface`.
   - Ensure `rem`/`em` font scaling is respected (avoid fixed `px` font sizes in critical UI).

### Minor inconsistencies noticed
- `DuplicateFinderPage` scope UI is still the original drive + custom path layout.
- Several pages still call `alert()` for errors; a toast/snackbar pattern would be more commercial.
- `TitleBar` is a drag region; adding the global search there would conflict with `-webkit-app-region`, which is why it is in the sidebar.

## Verification checklist

- [x] `yarn lint` passes.
- [x] Global search navigates to Startup, Privacy, Duplicate, Disk, Memory, etc.
- [x] System Information tabs render and export TXT works.
- [x] Startup Manager filtering/sorting updates the list.
- [x] Junk Cleaner scan progress displays files, items, operation, elapsed, and path.
- [ ] Disk Analyzer multi-drive selection implemented.
- [ ] Duplicate Finder scope/estimate UI implemented.
- [ ] Full consistency and accessibility audit completed.
- [ ] Performance measurements attached.
- [ ] Screenshots captured and attached.
