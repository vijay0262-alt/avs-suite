# Scan Core Path Normalization Report

**Status:** All 271 backend tests pass (198 scan_core + 73 other), 9 skipped.

## Root Cause

`pathlib.Path` uses the **current operating system** to interpret path strings. On Linux, `Path` is `PurePosixPath`, which treats backslashes as regular characters — not separators. This means:

```python
# On Linux:
Path("C:\\test\\file.txt").name  # Returns "C:\\test\\file.txt" (WRONG)

# On Windows:
Path("/var/log/syslog").parent   # Returns "\\var\\log" (WRONG)
```

Every Scan Core model that used `Path(path).name`, `Path(path).parent`, or `Path(path).suffix` produced incorrect results when the path string's style didn't match the host OS. This caused CI failures on Linux when parsing Windows paths (e.g. in serialized assets from Windows machines).

## Implementation

### New module: `scan_core/utils/path_utils.py`

Created a centralized path normalization layer with these helpers:

- **`is_windows_path(path)`** — Detects Windows-style paths by checking for drive letters (`C:`) or backslash separators.
- **`is_posix_path(path)`** — Returns True when the path is non-empty and not Windows-style.
- **`asset_name(path)`** — Returns the final path component using `PureWindowsPath` or `PurePosixPath` based on detected path style.
- **`asset_directory(path)`** — Returns the parent directory as a string.
- **`asset_extension(path)`** — Returns the file extension (lowercased, with dot).
- **`normalize_path(path)`** — Collapses redundant separators and `.` components.

**Key design rule:** Path parsing never depends on the current OS. `PureWindowsPath` is used for Windows paths, `PurePosixPath` for POSIX paths — always determined from the string itself.

### New module: `scan_core/utils/__init__.py`

Re-exports all helpers for convenient imports.

## Affected Models

### Filesystem (`scan_core/models.py`)

- **`FileEntry.asset_name`** — was `Path(self.path).name` → now `_asset_name(self.path)`
- **`FileEntry.asset_directory`** — was `str(Path(self.path).parent)` → now `_asset_directory(self.path)`
- **`FileEntry.asset_extension`** — was `Path(self.path).suffix.lower()` → now `_asset_extension(self.path)`
- **`DirectoryEntry.asset_name`** — same migration
- **`DirectoryEntry.asset_directory`** — same migration
- **`DriveEntry.asset_name`** — unchanged (uses `self.name` field, not path parsing)
- **`_make_file_entry`** — extension extraction was `Path(name).suffix.lower()` → now `_asset_extension(name)`
- Removed `from pathlib import Path` import

### Runtime (`scan_core/runtime/models.py`)

- **`ProcessAsset.asset_directory`** — was `str(Path(self.executable_path).parent)` → now `_asset_directory(self.executable_path)`
- **`ProcessAsset.asset_extension`** — was `Path(self.executable_path).suffix.lower()` → now `_asset_extension(self.executable_path)`
- **`LockedFileAsset.asset_name`** — was `Path(self.path).name` → now `_asset_name(self.path)`
- Removed `from pathlib import Path` import

### Registry (`scan_core/registry/models.py`)

- **`RegistryValueAsset.asset_name`** — added (returns `value_name` or `(Default)`)
- **`RegistryValueAsset.asset_path`** — added (returns `full_path`)
- **`RegistryKeyAsset.asset_name`** — added (returns `key_name`)
- **`RegistryKeyAsset.asset_path`** — added (returns `full_path`)
- **`RegistryKeyAsset.asset_directory`** — added (returns `parent_path`)

### Browser (`scan_core/browser/models.py`)

- **`BrowserInstallation.asset_name`** — added (returns `_asset_name(self.executable_path)`)
- **`BrowserInstallation.asset_directory`** — added (returns `_asset_directory(self.executable_path)`)

### Windows (`scan_core/windows/models.py`)

- **`ServiceAsset.asset_directory`** — added (returns `_asset_directory(self.binary_path)`)
- **`ServiceAsset.asset_extension`** — added (returns `_asset_extension(self.binary_path)`)
- **`DriverAsset.asset_directory`** — added (returns `_asset_directory(self.path)`)
- **`DriverAsset.asset_extension`** — added (returns `_asset_extension(self.path)`)
- **`InstalledProgramAsset.asset_directory`** — added (returns `_asset_directory(self.install_location)`)

## Future Benefits

1. **Cross-platform CI:** Linux CI can correctly parse Windows paths from serialized assets, and vice versa.
2. **Single source of truth:** All path parsing logic lives in `path_utils.py`. No duplicated `Path()` calls in models.
3. **Consistent API:** Every asset model now exposes `asset_name`, `asset_path`, and (where applicable) `asset_directory` and `asset_extension`.
4. **No platform conditionals in models:** Models never check `sys.platform` or `os.name` for path parsing. The helpers handle detection internally.
5. **Extensibility:** New path styles (e.g. UNC paths) can be added to `is_windows_path()` in one place.
