"""
Recycle Bin executor — uses the Windows SHEmptyRecycleBin API.

Direct file deletion (os.remove) fails for Recycle Bin files because:
1. Files in $Recycle.Bin are owned by user SIDs and may not be
   accessible to the current user (WinError 5).
2. The Recycle Bin has internal metadata ($I, $R files) that must
   be cleaned atomically.

SHEmptyRecycleBin is the correct Windows API for emptying the Recycle
Bin. It handles all SIDs and internal metadata correctly.

This executor is routed to when the action target is inside a
$Recycle.Bin directory. It empties the entire Recycle Bin for the
drive containing the target, then verifies the target file is gone.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any, Optional

from .filesystem_executor import FilesystemExecutor, _FilesystemExecutionError
from .models import ExecutionError, ExecutionStatus, TargetExecutorResult

_is_windows = sys.platform == "win32"

# SHEmptyRecycleBin flags
# SHERB_NOCONFIRMATION = 0x00000001 — don't ask for confirmation
# SHERB_NOPROGRESSUI   = 0x00000002 — don't show progress UI
# SHERB_NOSOUND        = 0x00000004 — don't play sound
_SHERB_NOCONFIRMATION = 0x00000001
_SHERB_NOPROGRESSUI = 0x00000002
_SHERB_NOSOUND = 0x00000004


def _is_recycle_bin_path(canonical_path: str) -> bool:
    """Check if a path is inside a $Recycle.Bin directory."""
    parts = Path(canonical_path).parts
    for part in parts:
        if part.lower() == "$recycle.bin":
            return True
    return False


def _get_drive_root(canonical_path: str) -> str:
    """Get the drive root for a Recycle Bin path (e.g. 'C:\\')."""
    p = Path(canonical_path)
    if p.anchor:
        return p.anchor
    return "C:\\"


class RecycleBinExecutor:
    """Executor for Recycle Bin cleanup using SHEmptyRecycleBin API.

    This executor handles delete_file actions for files inside
    $Recycle.Bin. Instead of deleting individual files (which fails
    for files owned by other user SIDs), it empties the entire
    Recycle Bin for the relevant drive using the Windows API.

    The executor falls back to FilesystemExecutor for non-Recycle-Bin
    paths or if the Windows API is unavailable.
    """

    supported_action_types = ("delete_file", "delete_directory")

    @classmethod
    def can_execute(cls, action_type: str) -> bool:
        return action_type in cls.supported_action_types

    @classmethod
    def execute(
        cls,
        action: Any,
        context: dict[str, Any],
        **kwargs: Any,
    ) -> TargetExecutorResult:
        mode = kwargs.get("mode", "dry_run")
        cancellation_token = kwargs.get("cancellation_token")
        canonical_path = context.get("canonical_path", "")

        # If not a Recycle Bin path, fall back to FilesystemExecutor
        if not _is_recycle_bin_path(canonical_path):
            return FilesystemExecutor.execute(
                action, context, **kwargs
            )

        # Dry-run: report what would happen
        if mode != "live":
            before_state = dict(context)
            return TargetExecutorResult(
                status=ExecutionStatus.DRY_RUN,
                reason="Dry-run: would empty Recycle Bin via SHEmptyRecycleBin",
                dry_run_info={
                    "operation": "empty_recycle_bin",
                    "target": before_state,
                    "drive": _get_drive_root(canonical_path),
                },
                before_state=before_state,
                after_state={"exists": False},
                operation="empty_recycle_bin",
            )

        # Live execution: use SHEmptyRecycleBin
        if not _is_windows:
            # Non-Windows: fall back to FilesystemExecutor
            return FilesystemExecutor.execute(
                action, context, **kwargs
            )

        drive = _get_drive_root(canonical_path)

        # Check if the file exists before
        existed_before = os.path.lexists(canonical_path)

        try:
            result = cls._empty_recycle_bin(drive)
            if result != 0:
                # SHEmptyRecycleBin failed
                # Try direct deletion as fallback
                if existed_before and os.path.isfile(canonical_path):
                    try:
                        os.remove(canonical_path)
                    except OSError:
                        pass
        except Exception as exc:
            # Try direct deletion as fallback
            if existed_before and os.path.isfile(canonical_path):
                try:
                    os.remove(canonical_path)
                except OSError:
                    pass

        # Verify the target file is gone
        exists_after = os.path.lexists(canonical_path)

        if exists_after:
            # File still exists — try direct deletion one more time
            if os.path.isfile(canonical_path):
                try:
                    os.remove(canonical_path)
                    exists_after = os.path.lexists(canonical_path)
                except OSError as exc:
                    return TargetExecutorResult(
                        status=ExecutionStatus.FAILED,
                        reason=f"Recycle Bin file could not be deleted: {exc}",
                        error=ExecutionError(
                            code="RECYCLE_BIN_DELETE_FAILED",
                            message=str(exc),
                            details={"path": canonical_path, "drive": drive},
                        ),
                        before_state=context,
                        after_state={"exists": True},
                        operation="empty_recycle_bin",
                    )

        if exists_after:
            return TargetExecutorResult(
                status=ExecutionStatus.FAILED,
                reason="Recycle Bin file still exists after cleanup attempt",
                error=ExecutionError(
                    code="POST_EXECUTION_VERIFICATION_FAILED",
                    message="Target still exists after deletion",
                    details={"path": canonical_path, "drive": drive},
                ),
                before_state=context,
                after_state={"exists": True},
                operation="empty_recycle_bin",
            )

        return TargetExecutorResult(
            status=ExecutionStatus.COMPLETED,
            reason="Recycle Bin file removed successfully",
            before_state=context,
            after_state={"exists": False},
            operation="empty_recycle_bin",
        )

    @classmethod
    def _empty_recycle_bin(cls, drive_root: str) -> int:
        """Call SHEmptyRecycleBin for the given drive.

        Returns 0 on success, non-zero on failure (Win32 error code).
        """
        try:
            import ctypes

            # Load shell32.dll and get SHEmptyRecycleBinW
            shell32 = ctypes.windll.shell32
            SHEmptyRecycleBinW = shell32.SHEmptyRecycleBinW

            # Flags: no confirmation, no progress UI, no sound
            flags = (
                _SHERB_NOCONFIRMATION
                | _SHERB_NOPROGRESSUI
                | _SHERB_NOSOUND
            )

            # Call: SHEmptyRecycleBin(hwnd, pszRootPath, dwFlags)
            # hwnd = None, pszRootPath = drive root (e.g. "C:\\")
            result = SHEmptyRecycleBinW(
                None,
                drive_root,
                flags,
            )

            return result
        except Exception:
            return -1
