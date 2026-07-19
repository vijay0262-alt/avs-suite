# AVS PC Optimizer - Diagnostics Report

Generated: 2024-07-19

## BUG 1: Dashboard Quick Scan does nothing

### Execution Path Analysis

**Component**: `DashboardPage.tsx` (line 88)
```typescript
<button
  onClick={() => vm.startQuickScan(navigate)}
  data-testid="quick-scan-button"
>
  Start Quick Scan
</button>
```

**ViewModel**: `DashboardViewModel.ts` (lines 220-225)
```typescript
async startQuickScan(navigate: NavigateFunction): Promise<void> {
  console.log('[DashboardViewModel] startQuickScan called');
  // Navigate to junk cleaner with auto-scan flag
  // This will be handled by the router and Junk Cleaner page
  navigate('/junk-cleaner?autoScan=true');
}
```

**Navigation**: React Router navigates to `/junk-cleaner?autoScan=true`

**Junk Cleaner Page**: `JunkCleanerPage.tsx` (lines 45-51)
```typescript
useEffect(() => {
  if (autoScan && !scanIssuedOnce && state.bootstrap === 'ready') {
    console.log('[JunkCleanerPage] Auto-starting scan');
    void vm.startScan();
    setScanIssuedOnce(true);
  }
}, [autoScan, scanIssuedOnce, state.bootstrap, vm]);
```

**ViewModel Scan Start**: `JunkCleanerViewModel.ts` (lines 145-165)
```typescript
async startScan(): Promise<void> {
  if (this.isScanRunning()) return;
  const only = Array.from(this.state.selected);
  if (only.length === 0) {
    this.setState({ lastScanError: 'Select at least one category to scan.' });
    return;
  }
  // ... starts scan via service
}
```

### Root Cause

**File**: `JunkCleanerPage.tsx`
**Function**: `startScan` in `JunkCleanerViewModel.ts`
**Line**: 148-150

**Reason**: When Quick Scan is clicked from Dashboard, it navigates to Junk Cleaner with `autoScan=true`. However, the `JunkCleanerViewModel.startScan()` method checks if any categories are selected:

```typescript
const only = Array.from(this.state.selected);
if (only.length === 0) {
  this.setState({ lastScanError: 'Select at least one category to scan.' });
  return;
}
```

The `selected` Set is initialized in `bootstrap()` (line 113) with all catalog items:
```typescript
selected: new Set(catalog.map((c) => c.id)),
```

**Timing Issue**: The auto-scan effect runs when `state.bootstrap === 'ready'`, but there's a race condition:
1. User clicks Quick Scan → navigation happens
2. Junk Cleaner page mounts → bootstrap starts
3. Auto-scan effect checks `state.bootstrap === 'ready'`
4. If bootstrap isn't ready yet, auto-scan is skipped
5. Once bootstrap is ready, the effect doesn't re-run because `scanIssuedOnce` is still false but the dependency array includes `state.bootstrap`

**Actual Issue**: The dependency array in the auto-scan effect includes `state.bootstrap`, so it SHOULD re-run when bootstrap becomes ready. However, the condition requires ALL three to be true simultaneously. If bootstrap takes time to load, the auto-scan may never trigger.

### Proposed Fix

**Option 1**: Add a flag to track if auto-scan was requested and execute it after bootstrap completes
**Option 2**: Change the auto-scan logic to wait for bootstrap before checking the flag
**Option 3**: Select all categories by default in the ViewModel constructor instead of waiting for bootstrap

**Estimated Effort**: 15 minutes

---

## BUG 2: Junk Cleaner scan is slow

### Current Implementation

**File**: `backend/src/avs_backend/cleaner/scan_manager.py`
**Function**: `_run_cleaner` (lines 154-205)
**Architecture**: ThreadPoolExecutor with max 4 workers

**File**: `backend/src/avs_backend/cleaner/scanner_base.py`
**Function**: `_walk` (lines 200-280)
**Method**: Uses `os.scandir()` for directory traversal

### Performance Measurements Needed

**Required Metrics**:
- Start time
- End time
- Folders scanned
- Files scanned
- Average files/sec
- Largest bottleneck

**Measurement Points**:
1. Scan start timestamp
2. Per-cleaner start/end times
3. Files discovered per cleaner
4. Total scan time

**Current Bottleneck Candidates**:
1. Directory enumeration (os.scandir)
2. File stat calls for size calculation
3. Forbidden path checks
4. Symlink detection
5. Network drives (if present)

### Proposed Fix

**Cannot determine without actual measurements.** Need to add performance logging to identify the actual bottleneck.

**Estimated Effort**: 30 minutes (to add logging) + unknown (for actual optimization)

---

## BUG 3: Clean validation takes 3-4 minutes

### Current Implementation

**File**: `backend/src/avs_backend/cleaner/cleaning_manager.py`
**Function**: `preview` (lines 118-157)

**Previous Fix Applied**: The `validate()` call was removed from `execute()` method to avoid double validation.

**File**: `backend/src/avs_backend/cleaner/scanner_base.py`
**Function**: `validate` (lines 287-361)

**Current Fast Path**:
```python
def validate(self, candidate_paths: list[str]) -> CleaningPreview:
    # Pre-compute the allowed target roots as normalised strings.
    allowed_roots: list[str] = []
    for t in self.targets():
        if not t:
            continue
        try:
            rp = str(Path(t).resolve(strict=False))
        except (OSError, RuntimeError):
            continue
        allowed_roots.append(rp)

    # Fast path validation - only check existence and scope
    for raw in candidate_paths:
        try:
            path = Path(raw)
            resolved = str(path.resolve(strict=False))
        except (OSError, RuntimeError, ValueError):
            continue

        # 1. Scope check (fast string comparison)
        if allowed_roots and not any(
            resolved == root or resolved.startswith(root + os.sep) for root in allowed_roots
        ):
            continue

        # 2. Forbidden roots (fast string comparison)
        if is_forbidden(resolved):
            continue

        # 3. Exists as regular file (single stat call)
        try:
            if not path.is_file():
                continue
        except (FileNotFoundError, OSError):
            continue

        # File passed all checks - add to preview
        preview.candidate_paths.append(raw)
        preview.total_files += 1
        try:
            preview.total_bytes += path.stat().st_size
        except OSError:
            pass
```

### Root Cause Analysis

**Function**: `cleaning_manager.py` → `preview()` → calls `_collect_scan_paths()` (lines 467-500)

**Bottleneck**: `_collect_scan_paths()` calls `scan_manager.items_page()` in a loop to collect ALL scan results:

```python
def _collect_scan_paths(self, scan_task_id: str, cleaner_id: str) -> list[str]:
    paths: list[str] = []
    offset = 0
    page_size = 5000
    page_count = 0
    
    while True:
        page = self._scan_manager.items_page(
            scan_task_id, cleaner_id, offset, page_size
        )
        if not page or not page.get('items'):
            break
        paths.extend(page['items'])
        log.debug("[CleaningManager] Page %d: got %d items, total paths=%d", 
                  page_count, len(page), len(paths))
        
        if len(page) < page_size:
            break
        offset += len(page)
        page_count += 1
    
    return paths
```

**Issue**: This iterates through ALL scan results for each cleaner, which can be tens of thousands of files. The `items_page()` call may involve disk I/O or database access for each page.

### Proposed Fix

**Option 1**: Cache scan results in memory after scan completes
**Option 2**: Pass scan results directly to preview instead of re-fetching
**Option 3**: Optimize the items_page implementation to use in-memory storage
**Option 4**: Validate in batches with progress updates

**Estimated Effort**: 1-2 hours

---

## BUG 4: Cleaning file statistics

### Required Statistics

**Files Requested**: Total files in `candidate_paths` passed to `clean()`
**Files Cleaned**: `result.files_removed` from `CleaningResult`
**Files Skipped**: `result.files_skipped` from `CleaningResult`
**Files Failed**: `result.files_failed` from `CleaningResult`

### Skip Reasons

**Current Implementation**: `scanner_base.py` → `_delete_one_fast()` (lines 452-496)

**Skip Reasons Currently Tracked**:
1. **Out of scope**: Path not in allowed roots (line 473) - NOT logged
2. **Forbidden**: Path in forbidden roots (line 475) - NOT logged
3. **Not a file**: Path is not a regular file (line 480) - NOT logged
4. **Missing**: FileNotFoundError (line 482) - NOT logged
5. **Permission denied**: PermissionError (line 494) - logged as error
6. **Locked**: OSError (line 494) - logged as error
7. **Unknown**: Other exceptions (line 494) - logged as error

**Issue**: Most skip reasons are NOT logged to `result.errors`. They are silently skipped.

### Proposed Fix

Add detailed skip reason tracking to `_delete_one_fast()`:
- Log each skip reason to `result.errors` with specific reason code
- Count skip reasons by category
- Display in CleaningSummary component

**Estimated Effort**: 30 minutes

---

## BUG 5: Installer does not generate Setup.exe

### Electron Builder Configuration

**File**: `apps/pc-optimizer/package.json`
**Build Configuration** (lines 60-117):

```json
"build": {
  "appId": "com.avs.pcoptimizer",
  "productName": "AVS PC Optimizer",
  "directories": {
    "output": "release",
    "buildResources": "build"
  },
  "files": [
    "dist/**/*",
    "dist-electron/**/*",
    "package.json"
  ],
  "extraResources": [
    {
      "from": "../../backend/dist/backend-py",
      "to": "backend",
      "filter": ["**/*"]
    }
  ],
  "win": {
    "target": [
      {
        "target": "nsis",
        "arch": ["x64"]
      },
      {
        "target": "portable",
        "arch": ["x64"]
      }
    ],
    "artifactName": "${productName}-Setup-${version}.${ext}",
    "publisherName": "Advanced Vision Software LLC"
  },
  "nsis": {
    "oneClick": false,
    "perMachine": false,
    "allowToChangeInstallationDirectory": true,
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true
  }
}
```

### Build Scripts

**Line 19**: `"package:installer": "yarn build && yarn build:backend && electron-builder --win --x64 --config.nsis.oneClick=false"`

**Line 20**: `"package:portable": "yarn build && yarn build:backend && electron-builder --win portable --x64"`

**Line 21**: `"package:all": "yarn build && yarn build:backend && electron-builder --win --x64"`

### Root Cause Analysis

**Issue 1**: The `release` directory does not exist, meaning no builds have been run yet.

**Issue 2**: The NSIS configuration has `oneClick: false` which should generate a proper installer, but:
- No icon file specified (previously removed due to missing files)
- No banner/header images specified (previously removed due to missing files)
- This may cause NSIS to fail or generate a basic installer

**Issue 3**: The `artifactName` is set to `${productName}-Setup-${version}.${ext}` which should produce `AVS-PC-Optimizer-Setup-0.1.0.exe`

**Issue 4**: The build requires:
1. Frontend build (`yarn build`)
2. Backend build (`yarn build:backend`)
3. Electron Builder packaging

If any of these fail, the installer won't be generated.

### Proposed Fix

**Step 1**: Run `yarn package:installer` to see actual error output
**Step 2**: Check if backend build succeeds
**Step 3**: Check if frontend build succeeds
**Step 4**: Add proper icon and banner files to `build/` directory
**Step 5**: Verify NSIS is installed on the build machine

**Estimated Effort**: 1 hour (depending on actual errors)

---

## Summary

| Bug | Root Cause | File | Function | Effort |
|-----|------------|------|----------|--------|
| 1 | Race condition in auto-scan effect | JunkCleanerPage.tsx | auto-scan useEffect | 15 min |
| 2 | Unknown - needs measurements | scan_manager.py | _run_cleaner | 30 min + unknown |
| 3 | Re-fetching all scan results from disk/DB | cleaning_manager.py | _collect_scan_paths | 1-2 hours |
| 4 | Skip reasons not logged | scanner_base.py | _delete_one_fast | 30 min |
| 5 | Build not run, missing assets | package.json | build config | 1 hour |

### Next Steps

1. **BUG 1**: Fix auto-scan race condition
2. **BUG 5**: Run build and fix installer generation
3. **BUG 2**: Add performance logging to scan
4. **BUG 3**: Optimize _collect_scan_paths
5. **BUG 4**: Add skip reason tracking
