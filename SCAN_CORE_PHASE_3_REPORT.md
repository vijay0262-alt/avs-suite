# Scan Core — Phase SC-3: Browser Enumerator

## Architecture

The Browser Enumerator is a new, isolated package at `backend/src/avs_backend/scan_core/browser/`.
It is completely decoupled from Browser Cleaner, Privacy Cleaner, Security Engine, Orchestrator, and all other modules.

```
backend/src/avs_backend/scan_core/browser/
    __init__.py      — Public API exports
    models.py        — Dataclasses: BrowserType, BrowserInstallation, BrowserProfile, BrowserAsset, BrowserStatistics
    filters.py       — Composable filters: Browser, Profile, AssetType, Path, Regex + BrowserFilterChain
    enumerator.py    — Streaming generator, browser detection, profile discovery, asset discovery, progress, cancellation, statistics
```

## Classes

### Models (`models.py`)

| Class | Description |
|-------|-------------|
| `BrowserType` | Enum — Chrome, Edge, Firefox, Brave, Opera, Opera GX, Vivaldi, Chromium with display_name and is_chromium_based |
| `ProfileStatus` | Enum — ACTIVE, INACTIVE, LOCKED, UNKNOWN |
| `BrowserAssetType` | Enum — 21 asset types: Cache, GPU Cache, Code Cache, Service Worker, Cache Storage, Cookies, History, Downloads, Favicons, Bookmarks, Sessions, Preferences, Extensions, Local Storage, IndexedDB, Web Data, Login Data, Crash Reports, Shader Cache, Extension Settings, Unknown |
| `BrowserInstallation` | Frozen slots — browser_type, executable_path, version, install_dir, is_portable, user_data_dir |
| `BrowserProfile` | Frozen slots — browser_type, profile_name, profile_path, display_name, is_default, is_guest, profile_size, last_used_time, status |
| `BrowserAsset` | Frozen slots — browser_type, profile_name, asset_type, asset_path, asset_name, is_directory, size, exists |
| `BrowserStatistics` | Mutable — browsers_found, profiles_found, assets_found, skipped, permission_errors, elapsed_seconds, profiles_per_second, assets_per_second |

### Filters (`filters.py`)

| Class | Description |
|-------|-------------|
| `BrowserFilter` | Restrict to specified browser types |
| `ProfileFilter` | Filter by name, default_only, exclude_guest, status |
| `AssetTypeFilter` | Include only specified asset types |
| `PathFilter` | Match assets by path substring (case-insensitive) |
| `RegexFilter` | Match assets by regex pattern (applies to assets only) |
| `BrowserFilterChain` | Compose multiple filters — entry must pass ALL |

### Enumerator (`enumerator.py`)

| Class | Description |
|-------|-------------|
| `BrowserEnumerator` | Main class — `enumerate()`, `get_statistics()` |
| `BrowserEnumerateOptions` | include_installations, include_profiles, include_assets, compute_profile_sizes, progress_interval, filter, cancel_event |
| `BrowserProgressEvent` | current_browser, current_profile, current_asset, profiles/assets enumerated, elapsed, rates, cancelled |
| `BrowserCancelEvent` | Cooperative cancellation |

## Supported Browsers

8 browsers with automatic detection:

| Browser | Detection Method | Profile Discovery |
|---------|-----------------|-------------------|
| Google Chrome | exe path + User Data dir | Local State JSON |
| Microsoft Edge | exe path + User Data dir | Local State JSON |
| Mozilla Firefox | exe path + Firefox dir | profiles.ini |
| Brave | exe path + User Data dir | Local State JSON |
| Opera | exe path + Opera Stable dir | Direct scan |
| Opera GX | exe path + Opera GX Stable dir | Direct scan |
| Vivaldi | exe path + User Data dir | Local State JSON |
| Chromium | exe path + User Data dir | Local State JSON |

Additional browsers can be added by extending `_get_browser_configs()`.

## Discovered Assets (21 types)

For each profile, the enumerator checks existence and metadata of:

- **Cache**: Cache, GPU Cache, Code Cache, Shader Cache, Cache Storage
- **Databases**: Cookies, History, Downloads, Favicons, Bookmarks, Web Data, Login Data
- **State**: Sessions, Preferences, Secure Preferences
- **Storage**: Local Storage, IndexedDB
- **Extensions**: Extensions directory, Extension State, Local/Sync/Managed Extension Settings
- **Other**: Service Worker, Crash Reports

No file contents are read. No SQLite databases are opened. Only existence and size are checked.

## Interfaces

### Basic Enumeration
```python
from avs_backend.scan_core.browser import BrowserEnumerator

enumerator = BrowserEnumerator()
for entry in enumerator.enumerate():
    if isinstance(entry, BrowserInstallation):
        print(f"Browser: {entry.browser_type.display_name} v{entry.version}")
    elif isinstance(entry, BrowserProfile):
        print(f"  Profile: {entry.profile_name} ({entry.profile_size} bytes)")
    elif isinstance(entry, BrowserAsset):
        print(f"    Asset: {entry.asset_name} ({entry.asset_type.value})")
```

### With Progress
```python
def on_progress(event):
    print(f"Browsers: {event.current_browser}, Profiles: {event.profiles_enumerated}")

for entry in enumerator.enumerate(on_progress=on_progress):
    process(entry)
```

### With Filters
```python
from avs_backend.scan_core.browser import BrowserFilterChain, BrowserFilter, AssetTypeFilter

filters = BrowserFilterChain(
    BrowserFilter(browser_types={BrowserType.CHROME}),
    AssetTypeFilter(asset_types={BrowserAssetType.CACHE, BrowserAssetType.COOKIES}),
)
opts = BrowserEnumerateOptions(filter=filters)
```

### With Cancellation
```python
cancel = BrowserCancelEvent()
opts = BrowserEnumerateOptions(cancel_event=cancel)
for entry in enumerator.enumerate(options=opts):
    if should_stop():
        cancel.cancel()
        break
```

## Performance Considerations

1. **No file reading** — Only checks existence (`os.path.exists`) and size (`os.path.getsize`). Never opens SQLite databases, parses JSON, or reads file contents.

2. **Streaming generator** — Yields entries one at a time. Never builds one huge list. Constant memory regardless of how many browsers/profiles/assets exist.

3. **Frozen slots dataclasses** — `BrowserInstallation`, `BrowserProfile`, and `BrowserAsset` use `frozen=True, slots=True` for lower memory and faster access.

4. **Local State parsing** — Chromium-based browsers' `Local State` JSON is parsed once to discover all profiles. Falls back to checking for `Default` directory if Local State is missing.

5. **profiles.ini parsing** — Firefox's `profiles.ini` is parsed via `configparser` to find all profiles with their paths and default status.

6. **Version detection** — Uses Win32 `GetFileVersionInfoW` API for accurate version extraction. Falls back to checking for version directories in the install path.

7. **Directory size computation** — `os.walk()` used for directory sizes. Can be disabled via `compute_profile_sizes=False` for faster enumeration when sizes aren't needed.

8. **Cooperative cancellation** — `BrowserCancelEvent` checked at each browser, profile, and asset boundary.

9. **Progress throttling** — Events emitted every `progress_interval` entries (default 200).

## Statistics

`BrowserStatistics` tracks:
- `browsers_found` — number of browser installations discovered
- `profiles_found` — total profiles across all browsers
- `assets_found` — total assets across all profiles
- `skipped` — entries skipped due to errors
- `permission_errors` — permission-related errors
- `elapsed_seconds` — total enumeration time
- `profiles_per_second` — average profile discovery rate
- `assets_per_second` — average asset discovery rate

## Tests

**File:** `backend/tests/test_scan_core_browser.py`
**Results:** 35 passed

| Test Class | Tests | Description |
|-----------|-------|-------------|
| `TestNoBrowsers` | 1 | Empty environment doesn't crash |
| `TestBrowserDetection` | 2 | Chrome detected, missing browser returns None |
| `TestProfileDiscovery` | 4 | Chromium profiles, guest profile, Firefox profiles, size computed |
| `TestAssetDiscovery` | 4 | Chromium assets, Firefox assets, exists flag, file size |
| `TestMissingFolders` | 2 | Missing profile dir, missing Local State fallback |
| `TestCancellation` | 2 | Mid-scan and pre-start cancellation |
| `TestFilters` | 7 | Browser type, default-only, exclude-guest, asset type, path, regex, combined chain |
| `TestStatistics` | 2 | Browsers tracked, finalize computes rates |
| `TestProgressEvents` | 2 | Events emitted, current browser included |
| `TestOptions` | 3 | include_installations/profiles/assets false |
| `TestModels` | 5 | Display names, chromium-based, is_installed, datetime conversion |
| `TestConvenienceFunction` | 1 | enumerate_browsers() works |

## Future Integration Points

The Browser Enumerator is designed as reusable infrastructure:

1. **Browser Cleaner** — Can enumerate cache/cookie/history assets and apply cleaning heuristics
2. **Privacy Cleaner** — Can enumerate cookies, login data, history, sessions for privacy analysis
3. **Security Engine** — Can enumerate extensions, profiles for browser-based threat detection
4. **Protection Engine** — Can monitor browser profiles for unauthorized changes
5. **Malware Engine** — Can enumerate extensions, service workers, local storage for persistence detection
6. **Orchestrator** — Can use `enumerate()` for system-wide browser asset discovery

The enumerator does NOT clean, read, parse, or classify — it only discovers. Higher-level modules consume the stream and apply their own logic.

## Files Created

| File | Purpose |
|------|---------|
| `scan_core/browser/__init__.py` | Public API exports |
| `scan_core/browser/models.py` | BrowserType, BrowserAssetType, ProfileStatus, BrowserInstallation, BrowserProfile, BrowserAsset, BrowserStatistics |
| `scan_core/browser/filters.py` | 5 filter types + BrowserFilterChain |
| `scan_core/browser/enumerator.py` | BrowserEnumerator, detection configs for 8 browsers, Chromium/Firefox profile discovery, 21 asset types, progress, cancellation, statistics |
| `tests/test_scan_core_browser.py` | 35 test cases across 12 test classes |
