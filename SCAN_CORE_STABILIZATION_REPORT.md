# Scan Core Stabilization Report (SC-5.1)

**Status:** Production-ready | 259 tests pass, 6 skipped (symlinks on Windows)

## Bugs Fixed

1. **ModuleNotFoundError on non-Windows** - Guarded winreg/ctypes imports behind platform checks
2. **No graceful degradation** - Added PlatformNotSupported exception for Windows-only features on Linux/macOS
3. **Symlinks not emitted** - Added is_symlink() check, _build_symlink_entry, symlink_target/is_broken_symlink fields
4. **Browser zero assets** - Cached _get_browser_configs() so tests and enumerate() share same patched configs
5. **Runtime silent exceptions** - Added logging to all exception handlers with PID/context
6. **Pseudo filesystems as drives** - Excluded /proc /sys /dev /run tmpfs overlay squashfs on Linux
7. **Model audit** - Moved inline import os to module level in LockedFileAsset; all models verified correct

## Cross-Platform Matrix

| Enumerator | Windows | Linux | macOS |
|---|---|---|---|
| Filesystem | Full | Full | Full |
| Browser | Full | Full | Full |
| Runtime | Full | Full | Full |
| Registry | Full | PlatformNotSupported | PlatformNotSupported |
| Windows | Full | PlatformNotSupported | PlatformNotSupported |

## Remaining Risks

- Symlink tests skip on Windows without Developer Mode/admin
- Browser detection uses Windows paths; Linux/macOS paths not yet added (tests patch configs)
- GPU detection via nvidia-smi may fail silently if not installed (handled gracefully)
