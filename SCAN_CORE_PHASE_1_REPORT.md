# Scan Core — Phase SC-1: Filesystem Enumerator

## Architecture

The Scan Core is a new, isolated package at `backend/src/avs_backend/scan_core/`.
It is completely decoupled from all existing modules (cleaner, security, privacy, orchestrator, health engine).

```
backend/src/avs_backend/scan_core/
    __init__.py      — Public API exports
    models.py        — Dataclasses: FileEntry, DirectoryEntry, DriveEntry
    filters.py       — Composable filters: extension, directory exclusion, hidden, depth, size, date
    enumerator.py    — Streaming generator using os.scandir(), progress events, cancellation, drive enumeration
```

## Classes

### Models (`models.py`)

| Class | Description |
|-------|-------------|
| `FileEntry` | Frozen dataclass (slots) — path, name, size, extension, created/modified time, hidden, system, read-only, archive, temporary, symlink, locked, parent_dir, depth |
| `DirectoryEntry` | Frozen dataclass (slots) — path, name, created/modified time, hidden, system, read-only, symlink, parent_dir, depth, file_count, subdirectory_count |
| `DriveEntry` | Frozen dataclass (slots) — path, name, drive_type, total_size, free_space, is_removable, is_network, file_system |
| `EntryType` | Enum — FILE, DIRECTORY, DRIVE |

All models use `frozen=True, slots=True` for memory efficiency and immutability.

### Filters (`filters.py`)

| Class | Description |
|-------|-------------|
| `EnumerateFilter` | Protocol — `matches(entry)` and `should_descend(dir_entry)` |
| `ExtensionFilter` | Include only files with specified extensions |
| `DirectoryExclusionFilter` | Exclude directories by path or name; prevents descent |
| `HiddenFileFilter` | Include or exclude hidden files/directories |
| `MaxDepthFilter` | Limit enumeration depth (0=root, 1=immediate children, etc.) |
| `MaxSizeFilter` | Exclude files larger than max_size bytes |
| `DateRangeFilter` | Filter by modification date range (after/before, optional bounds) |
| `FilterChain` | Compose multiple filters — entry must pass ALL to be included |

### Enumerator (`enumerator.py`)

| Class | Description |
|-------|-------------|
| `FilesystemEnumerator` | Main class — `enumerate()`, `enumerate_locations()`, `enumerate_drives()` |
| `EnumerateOptions` | Options — include_files, include_directories, include_drives, follow_symlinks, check_locked, progress_interval, filter, cancel_event |
| `ProgressEvent` | Progress dataclass — current_drive, current_folder, files/folders/drives enumerated, elapsed_seconds, bytes_discovered, cancelled |
| `CancelEvent` | Cooperative cancellation — `cancel()` and `is_cancelled` property |
| `ScanLocation` | Root location — path, label, enabled |
| `ProgressCallback` | Type alias — `Callable[[ProgressEvent], None]` |

## Interfaces

### Basic Enumeration
```python
from avs_backend.scan_core import FilesystemEnumerator

enumerator = FilesystemEnumerator()
for entry in enumerator.enumerate("/path/to/scan"):
    if isinstance(entry, FileEntry):
        print(f"{entry.path} ({entry.size} bytes)")
```

### With Progress
```python
def on_progress(event: ProgressEvent):
    print(f"Files: {event.files_enumerated}, Elapsed: {event.elapsed_seconds:.1f}s")

for entry in enumerator.enumerate("/path", on_progress=on_progress):
    process(entry)
```

### With Filters
```python
from avs_backend.scan_core import FilterChain, ExtensionFilter, MaxDepthFilter

filters = FilterChain(
    ExtensionFilter(extensions={".txt", ".log"}),
    MaxDepthFilter(max_depth=2),
)
opts = EnumerateOptions(filter=filters)
for entry in enumerator.enumerate("/path", options=opts):
    process(entry)
```

### With Cancellation
```python
cancel = CancelEvent()
opts = EnumerateOptions(cancel_event=cancel)

for entry in enumerator.enumerate("/path", options=opts):
    if should_stop():
        cancel.cancel()
        break
```

### Multiple Scan Locations
```python
from avs_backend.scan_core import ScanLocation, get_default_scan_locations

locations = get_default_scan_locations()
for entry in enumerator.enumerate_locations(locations):
    process(entry)
```

### Drive Enumeration
```python
drives = enumerator.enumerate_drives()
for drive in drives:
    print(f"{drive.name}: {drive.total_size // (1024**3)} GB total, {drive.free_space // (1024**3)} GB free")
```

## Performance Considerations

1. **os.scandir()** — Uses `os.scandir()` exclusively, never `os.listdir()` or recursive glob. `scandir()` is 2-10x faster on Windows because it returns `DirEntry` objects with cached stat data.

2. **Streaming generator** — The enumerator is a Python generator, yielding entries one at a time. It never loads the entire filesystem into memory. Consumers can process millions of files with constant memory.

3. **Frozen slots dataclasses** — `FileEntry` and `DirectoryEntry` use `frozen=True, slots=True` for:
   - Lower memory footprint (no `__dict__`)
   - Faster attribute access
   - Immutability (safe to share between threads)

4. **Windows attributes via GetFileAttributesW** — File attributes (hidden, system, read-only, archive, temporary) are retrieved via the Win32 API `GetFileAttributesW` rather than parsing `stat` results, which is faster and more reliable on Windows.

5. **Cooperative cancellation** — `CancelEvent` is checked at each entry and directory boundary. Cancellation is immediate (within 1 entry of calling `cancel()`).

6. **Progress throttling** — Progress events are emitted every `progress_interval` entries (default 500), not on every entry, to avoid overwhelming the callback.

7. **Locked file detection** — Optional (`check_locked=True`), disabled by default because it requires an `os.open()` syscall per file. Only enable when lock status is needed.

8. **Symlink handling** — `follow_symlinks=False` by default to prevent infinite loops. Can be enabled via `EnumerateOptions(follow_symlinks=True)`.

## Scan Locations

Default scan locations (`get_default_scan_locations()`):
- User Profile
- ProgramData
- Program Files
- Program Files (x86)
- Windows
- Users
- Downloads
- Desktop
- Documents
- AppData (Roaming)
- LocalAppData
- Temp
- Recycle Bin
- Browser profile roots (Chrome, Edge, Firefox, Brave)

Additional locations can be added by creating `ScanLocation` objects and passing them to `enumerate_locations()`.

## Tests

**File:** `backend/tests/test_scan_core_enumerator.py`
**Results:** 31 passed, 3 skipped (symlinks require admin on Windows)

| Test Class | Tests | Description |
|-----------|-------|-------------|
| `TestSmallDirectory` | 4 | File/dir enumeration, attributes, depth, convenience function |
| `TestEmptyDirectory` | 2 | Empty dir yields only itself, no-files option |
| `TestLargeDirectory` | 2 | 1000 files + 10 subdirs, streaming verification |
| `TestPermissionDenied` | 1 | Graceful handling of restricted directories |
| `TestSymlinks` | 3 | Symlink detection, follow/not-follow behavior |
| `TestHiddenFiles` | 2 | Windows hidden attribute detection, hidden filter |
| `TestCancellation` | 2 | Mid-scan cancellation, pre-start cancellation |
| `TestFilters` | 8 | Extension, depth, size, directory exclusion (path+name), date range, combined chain |
| `TestProgressEvents` | 2 | Progress emitted with correct counts, current folder |
| `TestDriveEnumeration` | 1 | Drive list non-empty, correct types |
| `TestScanLocations` | 3 | Default locations, multiple locations, disabled location skipped |
| `TestOptions` | 3 | include_files=false, include_directories=false, include_drives=false |

## Future Integration Points

The Filesystem Enumerator is designed as reusable infrastructure for future Scan Core phases:

1. **Junk Scanner** — Can use `ExtensionFilter` + `DirectoryExclusionFilter` to find junk file types, then apply junk heuristics to `FileEntry` objects
2. **Security Scanner** — Can enumerate executables (`ExtensionFilter({".exe", ".dll", ".sys"})`) and feed them to threat analysis
3. **Privacy Scanner** — Can enumerate browser profile directories and find cache/cookie files
4. **Duplicate Finder** — Can enumerate files by size, then hash matching sizes
5. **Disk Analyzer** — Can use `DriveEntry` + full enumeration for space breakdown
6. **Orchestrator** — Can use `enumerate_locations()` with `get_default_scan_locations()` for system-wide scans
7. **Health Engine** — Can use progress events for real-time UI updates during scans

The enumerator does NOT make any decisions about what files mean — it only discovers them. Higher-level scanners consume the stream and apply their own logic.

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `scan_core/__init__.py` | 54 | Public API exports |
| `scan_core/models.py` | 155 | FileEntry, DirectoryEntry, DriveEntry dataclasses |
| `scan_core/filters.py` | 145 | 6 filter types + FilterChain |
| `scan_core/enumerator.py` | 599 | FilesystemEnumerator, options, progress, cancellation, drives |
| `tests/test_scan_core_enumerator.py` | 350 | 34 test cases across 11 test classes |
