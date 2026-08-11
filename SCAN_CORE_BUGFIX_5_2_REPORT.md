# Scan Core Bug Fix Report — Phase SC-5.2

**Status:** All 271 backend tests pass (198 scan_core + 73 other), 7 skipped (symlinks on Windows without Developer Mode).

## Bugs Fixed

### BUG 1: Registry Enumerator — empty target key not yielded

- **Root cause:** `enumerate_targets()` passed `include_keys` from caller options to `enumerate_key()`. When `include_keys=False`, the target key itself was never yielded, even though the caller explicitly requested it.
- **Fix:** Force `include_keys=True` in `enumerate_targets()` for both recursive and non-recursive paths. An empty registry key is still a discovered asset.
- **File:** `registry/enumerator.py:367-398`
- **Regression prevention:** Test `test_target_key_always_yielded_even_if_include_keys_false` creates an empty key and verifies it's yielded with `include_keys=False`.

### BUG 2: Runtime Enumerator — num_handles aborts on Linux

- **Root cause:** `psutil.process_iter(attrs=["num_handles", ...])` requests `num_handles` in bulk. On Linux, psutil doesn't support `num_handles`, causing the entire `process_iter` call to fail and abort all process enumeration.
- **Fix:** Removed `num_handles` from the bulk attrs list. Instead, query `proc.num_handles()` per-process only when `self.capabilities.supports_handles` is True (Windows only). On Linux, `handle_count` defaults to 0.
- **File:** `runtime/enumerator.py:269-348`
- **Regression prevention:** Capability test `test_does_not_support_handles_on_linux` verifies `supports_handles=False` on non-Windows.

### BUG 3: Process enumeration — one failure aborts generator

- **Root cause:** The entire `for proc in psutil.process_iter(...)` loop was wrapped in a single `try/except`. If `process_iter` itself failed (e.g. due to BUG 2), the outer except caught it and aborted the entire generator. Even after fixing BUG 2, a single process exception could theoretically abort iteration.
- **Fix:** Separated `process_iter` initialization from iteration. The outer try/except only wraps the iterator creation; the per-process loop has its own try/except with `continue` on error. One failing process never stops discovery.
- **File:** `runtime/enumerator.py:286-348`
- **Regression prevention:** Existing process enumeration tests verify multiple processes are yielded. Logging at DEBUG/WARNING ensures skipped processes are visible.

### BUG 4: LockedFileAsset.asset_name — use pathlib

- **Root cause:** `asset_name` used `os.path.basename(self.path)` which works but is inconsistent with the pathlib-based approach requested for all models.
- **Fix:** Replaced with `Path(self.path).name`. Removed unused `import os` from `runtime/models.py`.
- **File:** `runtime/models.py:9-12, 128-130`
- **Regression prevention:** Tests `test_locked_file_asset_name_unix_path` and `test_locked_file_asset_name_windows_path` verify correct basename extraction for both path styles.

### BUG 5: Cross-platform pathlib consistency

- **Root cause:** Filesystem models (`FileEntry`, `DirectoryEntry`, `DriveEntry`) lacked `asset_name`, `asset_directory`, `asset_extension` properties. Extension extraction in `_make_file_entry` used `os.path.splitext` instead of pathlib.
- **Fix:** Added `pathlib.Path` import to `models.py`. Added `asset_name`, `asset_directory`, `asset_extension` properties to `FileEntry` and `DirectoryEntry`. Added `asset_name` to `DriveEntry`. Replaced `os.path.splitext` with `Path(name).suffix.lower()` in `_make_file_entry`. Added `asset_directory` and `asset_extension` to `ProcessAsset` using pathlib.
- **Files:** `scan_core/models.py:16, 53-63, 95-101, 129-131, 156`, `runtime/models.py:54-64`
- **Regression prevention:** `TestModelProperties` class with 4 tests verifying pathlib properties for `FileEntry` (Windows + Unix paths), `DirectoryEntry`, and `DriveEntry`.

### BUG 6: Platform capability flags

- **Root cause:** Platform checks were scattered as `if not _is_windows:` throughout the runtime enumerator. No centralized capability detection existed. Unsupported features either crashed or silently incremented error counters.
- **Fix:** Introduced `RuntimeCapabilities` class with flags: `supports_handles`, `supports_gpu`, `supports_locked_files`, `supports_sessions`. Initialized in `RuntimeEnumerator.__init__`. Locked files enumeration now checks `self.capabilities.supports_locked_files` instead of `_is_windows`. Exported from `runtime/__init__.py`.
- **File:** `runtime/enumerator.py:39-64, 137, 501`, `runtime/__init__.py:30, 56`
- **Regression prevention:** `TestCapabilities` class with 4 tests verifying flags on Windows and non-Windows.

## Cross-Platform Compatibility Improvements

| Feature | Before | After |
|---|---|---|
| `num_handles` | Bulk request aborts on Linux | Per-process query with capability check |
| Process isolation | One failure aborts generator | Per-process try/except with continue |
| Locked files | `if not _is_windows: errors += 1` | `if not capabilities.supports_locked_files: return` |
| Model paths | `os.path.basename` / `os.path.splitext` | `pathlib.Path.name` / `Path.suffix` |
| Registry targets | Empty keys not yielded with `include_keys=False` | Always yielded regardless of `include_keys` |

## Remaining Platform Differences

- `supports_handles`: True on Windows, False on Linux/macOS (psutil limitation)
- `supports_locked_files`: True on Windows (Restart Manager API), False on Linux/macOS
- `supports_gpu`: True on all platforms (nvidia-smi may be available anywhere)
- `supports_sessions`: True on all platforms (`who` / `query user` works everywhere)
- Registry Enumerator: Windows-only, raises `PlatformNotSupported` on non-Windows
- Windows Enumerator: Windows-only, raises `PlatformNotSupported` on non-Windows
