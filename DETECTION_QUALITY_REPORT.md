# Detection Quality Audit Report — Phase 25

**Date:** 2026-08-11 | **Scope:** All optimization modules | **Objective:** Maximize useful detections, eliminate false positives, verify cleanup

---

## 1. Junk Cleaner

### 1.1 Coverage Matrix

| Target | Cleaner | Status | Notes |
|--------|---------|--------|-------|
| User Temp (`%LOCALAPPDATA%\Temp`, `%TEMP%`, `%TMP%`) | `UserTempCleaner` | ✅ | Deduplicates overlapping env vars |
| Windows Temp (`%SystemRoot%\Temp`) | `WindowsTempCleaner` | ✅ | |
| Prefetch (`%SystemRoot%\Prefetch`) | `PrefetchCleaner` | ✅ | `.pf` extension filter |
| Windows Update Cache (`%SystemRoot%\SoftwareDistribution\Download`) | `WindowsUpdateCacheCleaner` | ✅ | |
| Thumbnail Cache (`%LOCALAPPDATA%\Microsoft\Windows\Explorer`) | `ThumbnailCacheCleaner` | ✅ | `thumbcache_*` and `iconcache_*` prefix filter |
| Icon Cache (`%LOCALAPPDATA%\IconCache.db` + Explorer dir) | `IconCacheCleaner` | ✅ | Manual single-file check + dir scan |
| DirectX Shader Cache (`%LOCALAPPDATA%\D3DSCache`) | `ShaderCacheCleaner` | ✅ NEW | |
| NVIDIA Shader Cache (DXCache, GLCache, ComputeCache) | `ShaderCacheCleaner` | ✅ NEW | |
| AMD Shader Cache (DxCache, GLCache, DxcCache) | `ShaderCacheCleaner` | ✅ NEW | |
| Crash Dumps (`%SystemRoot%\Minidump`, `%LOCALAPPDATA%\CrashDumps`, WER) | `CrashDumpCleaner` | ✅ | `.dmp`, `.mdmp`, `.hdmp` + `MEMORY.DMP` |
| Chkdsk Fragments (`FOUND.000`–`FOUND.009` on all drives) | `ChkdskFragmentsCleaner` | ✅ | `.chk` extension filter |
| Log Files (`%SystemRoot%\Logs`, `%SystemRoot%\System32\LogFiles`, WebCache, `%TEMP%`) | `LogFileCleaner` | ✅ | `.log`, `.log1`, `.log2`, `.etl`; 14-day age gate |
| Event Logs (`%SystemRoot%\System32\Winevt\Logs`) | `EventLogCleaner` | ✅ | `.evtx` extension; 7-day age gate |
| Recent Items (`%APPDATA%\Microsoft\Windows\Recent`) | `RecentItemsCleaner` | ✅ | Includes AutomaticDestinations, CustomDestinations |
| Recycle Bin (all fixed drives) | `RecycleBinCleaner` | ✅ | Uses `SHEmptyRecycleBinW` Shell API |
| Installer Patch Cache (`%SystemRoot%\Installer\$PatchCache$`) | `InstallerCacheCleaner` | ✅ NEW | Only `$PatchCache$` subdir, never parent `Installer` |
| Browser Cache (Chrome, Edge, Brave, Opera, Opera GX, Vivaldi, Firefox) | `BrowserCacheCleaner` | ✅ UPDATED | Now includes Code Cache, GPU Cache, Service Worker CacheStorage for all Chromium browsers |
| Browser History & Cookies | `BrowserHistoryCleaner` | ✅ | History, Top Sites, Cookies, places.sqlite |
| Office Cache | `OfficeCacheCleaner` | ✅ NEW | UnsavedFiles, OfficeFileCache (15.0/16.0), Temp, DocumentCache |

### 1.2 False Positive Prevention

- **Forbidden roots:** 24 system paths hardcoded in `safe_paths.py` (System32, WinSxS, Program Files, Windows Defender, etc.)
- **Symlink/junction detection:** `is_symlink_like()` checks both `is_symlink()` and `FILE_ATTRIBUTE_REPARSE_POINT` (0x400)
- **Age gates:** Log files (14 days), Event logs (7 days) — recent files always kept
- **Extension filters:** Prefetch (`.pf`), Crash dumps (`.dmp/.mdmp/.hdmp`), Logs (`.log/.log1/.log2/.etl`), Event logs (`.evtx`), Thumbnails (`.db` with prefix filter)
- **Scope validation:** Every file is re-checked against cleaner's declared targets before deletion
- **Installer cache:** Only scans `$PatchCache$` subfolder; parent `C:\Windows\Installer` is in forbidden roots

### 1.3 Locked File Handling

- **Retry policy:** 3 attempts with backoff (50ms, 150ms, 300ms)
- **Error classification:** `PermissionError` and "being used by another process" → retry; other `OSError` → fail
- **Skip tracking:** `files_skipped` with reason breakdown (`permission-denied`, `missing`, `symlink`, `out-of-scope`, `forbidden`, `not-a-file`, `cancelled`)
- **Failure tracking:** `files_failed` with reason breakdown (`permission-denied`, `locked`, `unknown`)
- **Parallel deletion:** 16 worker threads for >50 files; serial for small counts
- **Re-validation:** Every file is re-checked (scope, forbidden, symlink, file type) immediately before `os.remove()`

---

## 2. Registry Cleaner

### 2.1 Scanner Coverage

| Category | Scanner | Status | Safety |
|----------|---------|--------|--------|
| Startup leftovers | `_scan_startup` | ✅ | Checks Run keys (HKCU, HKLM, Wow6432Node); flags entries pointing to missing executables |
| Invalid app paths | `_scan_app_paths` | ✅ | Checks App Paths (HKLM, HKCU); flags default value pointing to missing file |
| Missing shared DLLs | `_scan_shared_dlls` | ✅ | Checks SharedDLLs value names (file paths) against filesystem |
| Broken uninstall entries | `_scan_uninstall` | ✅ | Requires BOTH InstallLocation AND uninstaller missing — strong signal |
| MUICache | `_scan_muicache` | ✅ | Checks MUICache entries for `.exe` paths that no longer exist |
| Unused file extensions | `_scan_file_extensions` | ✅ | Traces `.ext` → ProgID → `shell\open\command` → exe path |
| Installer cache leftovers | `_scan_installer_cache` | ✅ | Checks MSI component KeyPaths under UserData |
| Missing COM/CLSID | `_scan_com_clsid` | ✅ NEW | Scans HKCR\CLSID for InprocServer32/LocalServer32/InprocHandler32 pointing to missing files; whitelists system DLLs |

### 2.2 False Positive Prevention

- **Path existence check:** `_path_exists()` uses `os.path.exists()` with env var expansion
- **Uninstall entries:** Only flagged when BOTH install location AND uninstaller are missing (avoids false positives from entries with custom uninstallers)
- **COM/CLSID:** System DLL whitelist (`mscoree.dll`, `oleaut32.dll`, `ole32.dll`, `shell32.dll`, etc.) — never flags system COM registrations
- **All severities are "low" or "medium":** No high-severity automatic deletion
- **Backup before fix:** Every deleted value is serialized to JSON backup with full type and data
- **System Restore Point:** Created before any registry values are deleted

---

## 3. Browser Cleaner

### 3.1 Browser Coverage

| Browser | Cache | Code Cache | GPU Cache | SW CacheStorage | History | Cookies | Downloads |
|---------|-------|-----------|-----------|-----------------|---------|---------|-----------|
| Chrome | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edge | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Brave | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Opera | ✅ | ✅ | ✅ | — | ✅ | ✅ | ✅ |
| Opera GX | ✅ | ✅ | ✅ | — | ✅ | ✅ | ✅ |
| Vivaldi | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Firefox | ✅ (cache2) | — | — | — | ✅ (places.sqlite) | ✅ (cookies.sqlite) | ✅ |

### 3.2 Changes Made

- **Added GPU Cache paths** for Chrome, Edge, Brave, Opera, Opera GX, Vivaldi
- **Added Code Cache paths** for Brave, Opera, Opera GX, Vivaldi (were missing)
- **Added Service Worker CacheStorage** for Brave, Vivaldi (were missing)

### 3.3 False Positive Prevention

- Cache cleaner only touches `Cache`, `Code Cache`, `GPUCache`, `Service Worker\CacheStorage` subfolders
- History cleaner targets specific SQLite database files (`History`, `Cookies`, `places.sqlite`)
- Never touches `Bookmarks`, `Login Data`, `Preferences`, `Web Data`
- Firefox: Only scans `cache2` subdirectory within profile folders

---

## 4. Startup Manager

### 4.1 Source Coverage

| Source | Status | Notes |
|--------|--------|-------|
| Registry Run (HKCU, HKLM) | ✅ | |
| Registry RunOnce (HKCU, HKLM) | ✅ | |
| Registry Run (Wow6432Node) | ✅ NEW | 32-bit startup entries on 64-bit Windows |
| Registry RunOnce (Wow6432Node) | ✅ NEW | |
| Startup Folder (user) | ✅ | `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup` |
| Startup Folder (all users) | ✅ | `C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Startup` |
| Task Scheduler | ✅ | Filters for AtLogon/AtStartup triggers |
| Startup Services | ✅ NEW | Auto and auto_delayed start types via `psutil.win_service_iter` |

### 4.2 Impact Calculation

- **High:** Chrome, Firefox, Edge, Spotify, Teams, Slack, Discord
- **Medium:** OneDrive, Dropbox, backup, sync utilities
- **Low:** Everything else
- **Critical system entries protected:** Windows Defender, SmartScreen, SecurityHealth, svchost, lsass, csrss, wininit, services, winlogon, explorer, dwm

### 4.3 Safety

- Never deletes entries — only disables
- SQLite backup before every modification
- Critical system entries set prevents disabling essential services
- Microsoft-signed patterns trigger warnings

---

## 5. Performance Module

### 5.1 Memory Optimization Steps

| Step | Progress | Safety |
|------|----------|--------|
| Get initial memory state | 10% | Read-only via `psutil.virtual_memory()` |
| Trim working sets (top 50 processes) | 30% | Only inactive processes; top 50 by RSS |
| Refresh Explorer memory | 60% | Targets `explorer.exe` only |
| Release cached memory | 70% | Uses `SetSystemFileCacheSize` API |
| Refresh standby memory | 80% | Uses `EmptyStandbyList` via NtSetSystemInformation |
| Get final memory state | 90% | Read-only |
| Complete | 100% | |

### 5.2 Safety Measures

- 20-second timeout prevents hanging
- Cancellation check after each step
- Only trims top 50 processes by memory (avoids spending too long)
- All operations wrapped in try/except — errors logged, not fatal
- Memory freed calculated as `max(0, before - after)` — never reports negative

---

## 6. Verification Phase

### 6.1 Before/After Measurement

The orchestrator's verification phase re-scans modules after optimization:

| Module | Verification Method |
|--------|-------------------|
| Junk | Re-scan via ScanManager, compare total files/bytes |
| Privacy | Re-scan via `scan_privacy_items`, compare item count |
| Registry | Re-scan via `scan_registry`, compare issue count |
| Startup | Re-scan via `scan_startup_entries`, compare entry count |
| Performance | Re-measure memory via `get_memory_info()`, compare used RAM |

### 6.2 Dashboard Optimize Execute

`dashboard_optimize_execute` measures `bytesBefore` and `bytesAfter` for each category:
- Temporary files, Recycle Bin, Browser Cache, Thumbnail Cache, Prefetch, Windows Update Cache
- Each category reports `executionTimeMs`, `filesFound`, `filesRemoved`, `filesSkipped`, `skipReasons`

---

## 7. Benchmark Comparison (Detection Coverage)

| Feature | AVS Shield | Disk Cleanup | Storage Sense | CCleaner |
|---------|-----------|-------------|---------------|----------|
| User Temp | ✅ | ✅ | ✅ | ✅ |
| Windows Temp | ✅ | ✅ | ✅ | ✅ |
| Prefetch | ✅ | ✅ | — | ✅ |
| Windows Update Cache | ✅ | ✅ | ✅ | ✅ |
| Thumbnail Cache | ✅ | ✅ | — | ✅ |
| Icon Cache | ✅ | — | — | ✅ |
| Shader Cache (DX/NVIDIA/AMD) | ✅ NEW | — | — | ✅ |
| Crash Dumps | ✅ | ✅ | — | ✅ |
| Minidumps | ✅ | ✅ | — | ✅ |
| Log Files | ✅ | ✅ | — | ✅ |
| Event Logs | ✅ | — | — | ✅ |
| Recent Items | ✅ | ✅ | — | ✅ |
| Recycle Bin | ✅ | ✅ | ✅ | ✅ |
| Installer Patch Cache | ✅ NEW | — | — | ✅ |
| Office Cache | ✅ NEW | — | — | ✅ |
| Chkdsk Fragments | ✅ | — | — | ✅ |
| Browser Cache (6 browsers) | ✅ | ✅ (Edge only) | ✅ (Edge only) | ✅ |
| Browser Code Cache | ✅ | — | — | ✅ |
| Browser GPU Cache | ✅ | — | — | — |
| Browser SW CacheStorage | ✅ | — | — | — |
| Browser History | ✅ | — | — | ✅ |
| Browser Cookies | ✅ | — | — | ✅ |
| Registry: COM/CLSID | ✅ NEW | — | — | ✅ |
| Registry: Startup leftovers | ✅ | — | — | ✅ |
| Registry: Shared DLLs | ✅ | — | — | ✅ |
| Registry: Uninstall entries | ✅ | — | — | ✅ |
| Registry: File extensions | ✅ | — | — | ✅ |
| Registry: Installer cache | ✅ | — | — | ✅ |
| Registry: MUICache | ✅ | — | — | ✅ |
| Registry: App Paths | ✅ | — | — | ✅ |
| Startup: Services | ✅ NEW | — | — | — |
| Startup: Task Scheduler | ✅ | — | — | — |
| Startup: Wow6432Node | ✅ NEW | — | — | ✅ |
| Memory optimization | ✅ | — | — | ✅ |
| Locked file retry | ✅ (3x) | — | — | ✅ |
| Before/after verification | ✅ | — | — | — |
| System Restore Point | ✅ | — | — | ✅ |
| Backup before registry fix | ✅ | — | — | ✅ |

### Gaps Identified and Fixed

1. **Shader cache** — was missing entirely → Added `ShaderCacheCleaner`
2. **Office cache** — was missing → Added `OfficeCacheCleaner`
3. **Installer patch cache** — was missing → Added `InstallerCacheCleaner`
4. **Browser GPU Cache** — missing for all browsers → Added to `BrowserCacheCleaner`
5. **Browser Code Cache** — missing for Brave, Opera, Opera GX, Vivaldi → Added
6. **Browser Service Worker CacheStorage** — missing for Brave, Vivaldi → Added
7. **COM/CLSID scanner** — was listed in CATEGORIES but had no scanner → Implemented `_scan_com_clsid`
8. **Wow6432Node Run keys** — missing from startup scanner → Added
9. **Startup services** — not scanned → Added `_scan_startup_services` using `psutil.win_service_iter`

---

## 8. Remaining Limitations

1. **Firefox GPU/Code Cache:** Firefox doesn't use separate GPU/Code Cache directories (uses `cache2` for all) — no action needed
2. **Opera/Vivaldi Service Worker CacheStorage:** Opera uses `%APPDATA%` instead of `%LOCALAPPDATA%`; Vivaldi already covered. Opera's SW cache may be under a different path — low priority
3. **Startup folder shortcut parsing:** `.lnk` files are detected but target path extraction is simplified (would need COM `IShellLink` for full parsing)
4. **Task scheduler restore:** Requires pywin32 for proper Task Scheduler API restore
5. **Service restore:** Disabling services uses `sc config` or registry; restore would need to re-enable via same mechanism
6. **Locked files deferred queue:** Current retry (3 attempts with 50/150/300ms backoff) handles transient locks. A persistent deferred queue for post-reboot deletion is not implemented — would require a scheduled task or registry RunOnce entry

---

## 9. Summary

**Cleaners before audit:** 14 | **Cleaners after audit:** 17 (+3 new)

**Registry scanners before:** 7 | **After:** 8 (+COM/CLSID)

**Startup sources before:** 3 (4 enum values) | **After:** 4 (5 enum values, +services, +Wow6432Node)

**Browser cache paths before:** 8 | **After:** 22 (+14 paths for GPU Cache, Code Cache, SW CacheStorage)

All changes are purely additive — no existing detection logic was modified or weakened. False positive prevention mechanisms (forbidden roots, symlink detection, age gates, scope validation, system DLL whitelists) remain intact.
