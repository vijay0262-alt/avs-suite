"""Windows Recycle Bin integration for safe file deletion.

Uses IFileOperation (Windows Vista+) with fallback to SHFileOperation
for older Windows versions. All deletions go through the Recycle Bin
unless explicitly bypassed.
"""

from __future__ import annotations

import ctypes
import os
import platform
import time
from pathlib import Path
from typing import Callable

log = __import__("logging").getLogger("avs.cleaner.recycle-bin")

# Platform detection
IS_WINDOWS = platform.system() == "Windows"

# Windows-specific imports
if IS_WINDOWS:
    from ctypes import wintypes
else:
    # Stub for non-Windows platforms
    class wintypes:
        HWND = None
        UINT = None
        LPCWSTR = None
        BOOL = None
        LPVOID = None
        FILEOP_FLAGS = None

# =====================================================================
# IFileOperation interface (Windows Vista+)
# =====================================================================


if IS_WINDOWS:
    class IFileOperation(ctypes.c_void_p):
        """IFileOperation COM interface for Vista+."""

    # GUIDs
    IID_IFileOperation = ctypes.GUID("{947ABA5F-0A5C-4C14-B4E7-6F7CBDD94B4C}")
    CLSID_FileOperation = ctypes.GUID("{3AD05575-8857-4850-9277-11B85BDB8E09}")
else:
    # On non-Windows platforms, provide stub implementations
    IID_IFileOperation = None
    CLSID_FileOperation = None

# Flags
FOF_ALLOWUNDO = 0x0040
FOF_NOCONFIRMATION = 0x0010
FOF_SILENT = 0x0004
FOF_NOERRORUI = 0x0400
FOF_NOCONFIRMMKDIR = 0x0200

# FileOperationFlags
FO_DELETE = 0x0003


def _init_com() -> bool:
    """Initialize COM for the current thread (Windows only)."""
    if not IS_WINDOWS:
        return False
    try:
        ole32 = ctypes.windll.ole32
        ole32.CoInitializeEx(None, 0)  # COINIT_MULTITHREADED
        return True
    except Exception as e:
        log.warning("COM initialization failed: %s", e)
        return False


def _delete_via_file_operation(paths: list[str]) -> tuple[int, int]:
    """Delete files using IFileOperation (Vista+).

    Returns (success_count, failure_count).
    """
    if not IS_WINDOWS:
        return 0, len(paths)
    
    if not _init_com():
        return 0, len(paths)

    try:
        # Create IFileOperation instance
        file_op = ctypes.POINTER(IFileOperation)()
        ctypes.oledll.ole32.CoCreateInstance(
            CLSID_FileOperation,
            None,
            1,  # CLSCTX_ALL
            IID_IFileOperation,
            ctypes.byref(file_op),
        )

        # Set operation flags
        flags = FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT | FOF_NOERRORUI
        file_op.SetOperationFlags(flags)

        # Add items to delete
        for path in paths:
            if not os.path.exists(path):
                continue
            try:
                item = ctypes.c_wchar_p(path)
                file_op.DeleteItem(item)
            except Exception as e:
                log.warning("Failed to queue %s for deletion: %s", path, e)

        # Execute operation
        file_op.PerformOperations()

        # Get results
        success = 0
        failed = 0
        # Note: Getting detailed results would require implementing
        # IFileOperationProgressSink, which is complex.
        # For now, we assume success if no exception was raised.
        success = len([p for p in paths if os.path.exists(p)])
        failed = len(paths) - success

        return success, failed

    except Exception as e:
        log.warning("IFileOperation failed: %s", e)
        return 0, len(paths)


# =====================================================================
# SHFileOperation fallback (Windows XP)
# =====================================================================


if IS_WINDOWS:
    class SHFILEOPSTRUCTW(ctypes.Structure):
        _fields_ = [
            ("hwnd", wintypes.HWND),
            ("wFunc", wintypes.UINT),
            ("pFrom", wintypes.LPCWSTR),
            ("pTo", wintypes.LPCWSTR),
            ("fFlags", wintypes.FILEOP_FLAGS),
            ("fAnyOperationsAborted", wintypes.BOOL),
            ("hNameMappings", wintypes.LPVOID),
            ("lpszProgressTitle", wintypes.LPCWSTR),
        ]
else:
    # Stub for non-Windows platforms
    class SHFILEOPSTRUCTW:
        pass


FO_DELETE = 0x0003


def _delete_via_shfileoperation(paths: list[str]) -> tuple[int, int]:
    """Delete files using SHFileOperation (XP fallback).

    Returns (success_count, failure_count).
    """
    if not IS_WINDOWS:
        return 0, len(paths)
    
    if not paths:
        return 0, 0

    # Build null-terminated double-null-terminated string list
    # Each path is followed by null, entire list ends with double null
    path_string = "\0".join(paths) + "\0\0"

    sh = SHFILEOPSTRUCTW()
    sh.hwnd = None
    sh.wFunc = FO_DELETE
    sh.pFrom = path_string
    sh.pTo = None
    sh.fFlags = FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT | FOF_NOERRORUI
    sh.fAnyOperationsAborted = False
    sh.hNameMappings = None
    sh.lpszProgressTitle = None

    try:
        result = ctypes.windll.shell32.SHFileOperationW(ctypes.byref(sh))
        if result == 0:
            # Success - check if any operations were aborted
            if sh.fAnyOperationsAborted:
                return 0, len(paths)
            return len(paths), 0
        else:
            log.warning("SHFileOperation failed with code %d", result)
            return 0, len(paths)
    except Exception as e:
        log.warning("SHFileOperation exception: %s", e)
        return 0, len(paths)


# =====================================================================
# Public API
# =====================================================================


def delete_to_recycle_bin(paths: list[str]) -> tuple[int, int]:
    """Delete files to Windows Recycle Bin.

    Args:
        paths: List of file paths to delete

    Returns:
        Tuple of (success_count, failure_count)

    Tries IFileOperation first (Vista+), falls back to SHFileOperation (XP).
    """
    if not paths:
        return 0, 0

    # Filter to only existing files
    existing = [p for p in paths if os.path.exists(p)]
    if not existing:
        return 0, len(paths)

    # Try IFileOperation first (Vista+)
    try:
        success, failed = _delete_via_file_operation(existing)
        if success > 0 or failed == 0:
            return success, failed
    except Exception as e:
        log.debug("IFileOperation not available, trying SHFileOperation: %s", e)

    # Fallback to SHFileOperation
    return _delete_via_shfileoperation(existing)


def delete_to_recycle_bin_single(
    path: str, on_progress: Callable[[int], None] | None = None
) -> bool:
    """Delete a single file to Recycle Bin with retry.

    Args:
        path: File path to delete
        on_progress: Optional progress callback

    Returns:
        True if successful, False otherwise
    """
    if not os.path.exists(path):
        return False

    # Retry with backoff for transient failures
    for attempt in range(3):
        success, failed = delete_to_recycle_bin([path])
        if success > 0:
            return True
        if failed == 0:
            return False

        if attempt < 2:
            delay_ms = [50, 150, 300][attempt]
            time.sleep(delay_ms / 1000.0)

    return False


def get_recycle_bin_size() -> int:
    """Get total size of Recycle Bin in bytes.

    Uses the Windows Shell API SHQueryRecycleBinW to get accurate size
    across all drives. Falls back to walking $Recycle.Bin folders if
    the API call fails.

    Returns:
        Total size in bytes, or 0 if unavailable
    """
    if not IS_WINDOWS:
        return 0
    try:
        # Try SHQueryRecycleBinW API first
        class SHQUERYRBINFO(ctypes.Structure):
            _fields_ = [
                ("cbSize", ctypes.c_uint32),
                ("i64Size", ctypes.c_int64),
                ("i64NumItems", ctypes.c_int64),
            ]

        info = SHQUERYRBINFO()
        info.cbSize = ctypes.sizeof(SHQUERYRBINFO)
        result = ctypes.windll.shell32.SHQueryRecycleBinW(None, ctypes.byref(info))
        if result == 0:
            return int(info.i64Size)

        # Fallback: walk $Recycle.Bin folders
        import os
        total_size = 0
        system_drive = os.environ.get("SystemDrive", "C:")
        recycle_bin = os.path.join(system_drive, "$Recycle.Bin")
        if os.path.exists(recycle_bin):
            for root, _, files in os.walk(recycle_bin):
                for file in files:
                    try:
                        total_size += os.path.getsize(os.path.join(root, file))
                    except (OSError, PermissionError):
                        continue
        return total_size
    except Exception:
        return 0


def empty_recycle_bin() -> bool:
    """Empty the Recycle Bin (Windows only).

    Uses SHERB_NOCONFIRMATION | SHERB_NOPROGRESSUI | SHERB_NOSOUND
    to silently empty the bin without user prompts.

    Returns:
        True if successful, False otherwise
    """
    if not IS_WINDOWS:
        return False
    try:
        # SHERB_NOCONFIRMATION = 0x0001, SHERB_NOPROGRESSUI = 0x0002, SHERB_NOSOUND = 0x0004
        flags = 0x0001 | 0x0002 | 0x0004
        result = ctypes.windll.shell32.SHEmptyRecycleBinW(None, None, flags)
        return result == 0
    except Exception as e:
        log.warning("Failed to empty Recycle Bin: %s", e)
        return False


def restore_from_recycle_bin(original_path: str) -> bool:
    """Restore a file from Recycle Bin to its original location.

    Args:
        original_path: The original path of the file before deletion

    Returns:
        True if successful, False otherwise

    Note: Windows Recycle Bin doesn't provide direct restore by original path.
    This is a simplified implementation that attempts to restore the most recently
    deleted file matching the original path pattern.
    """
    try:
        # This is a simplified approach. A full implementation would:
        # 1. Query the Recycle Bin for items matching the original path
        # 2. Use IFileOperation with FO_MOVE to restore to original location
        # 3. Handle cases where the original directory no longer exists

        # For now, we'll use a basic approach:
        # Check if the file already exists (it may have been restored already)
        if os.path.exists(original_path):
            return True

        # Try to use IFileOperation to restore
        # Since Windows doesn't provide a direct "restore by path" API,
        # we'll need to implement a more sophisticated approach
        # For the MVP, we'll return False to indicate that full undo
        # requires more complex Recycle Bin querying

        log.warning("Full restore from Recycle Bin requires Recycle Bin query API (not yet implemented)")
        return False

    except Exception as e:
        log.warning("Failed to restore from Recycle Bin: %s", e)
        return False


__all__ = [
    "delete_to_recycle_bin",
    "delete_to_recycle_bin_single",
    "get_recycle_bin_size",
    "empty_recycle_bin",
    "restore_from_recycle_bin",
]
