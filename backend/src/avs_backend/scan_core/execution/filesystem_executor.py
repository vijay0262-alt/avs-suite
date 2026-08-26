"""
SC-8C4 Part 2 — Safe filesystem remediation executor.

Performs real file and empty-directory deletion in live mode with:
- SafetyGate-level path validation
- TOCTOU re-verification
- Backup and rollback
- Symlink/junction/reparse-point rejection
- Permission and lock handling
- Cooperative cancellation

No destructive work is performed in dry-run mode.
"""

from __future__ import annotations

import hashlib
import os
import stat
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Optional

from avs_backend.scan_core.rules.action_path_validation import (
    PathValidationError,
    validate_filesystem_path,
)

from .backup import BackupManager, BackupRecord
from .models import (
    ExecutionCancelledError,
    ExecutionError,
    ExecutionStatus,
    TargetExecutorResult,
)


class _FilesystemExecutionError(Exception):
    """Internal exception used to report a filesystem operation failure."""

    def __init__(
        self,
        code: str,
        message: str,
        details: Optional[dict[str, Any]] = None,
    ) -> None:
        self.code = code
        self.message = message
        self.details = details or {}


@dataclass(frozen=True)
class _LiveState:
    """Live filesystem state read immediately before an operation."""

    path: Path
    exists: bool
    is_file: bool
    is_dir: bool
    is_symlink: bool
    is_junction: bool
    is_reparse: bool
    size: int
    modified_time: datetime
    hash: Optional[str]
    writable: bool


def _check_cancelled(token: Any) -> None:
    """Raise if a cancellation token is cancelled."""
    if token is not None and token.is_cancelled():
        raise _FilesystemExecutionError(
            code="CANCELLED",
            message="Operation cancelled",
        )


def _compute_sha256(path: Path) -> str:
    """Compute SHA-256 of a file without loading it entirely into memory."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def _timestamp_from_context(value: Any) -> float:
    """Convert a stored mtime to a POSIX timestamp."""
    if value is None:
        return 0.0
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC).timestamp()
        return value.timestamp()
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        return datetime.fromisoformat(value).timestamp()
    raise _FilesystemExecutionError(
        code="INVALID_CONTEXT",
        message=f"Cannot interpret modified_time: {type(value)}",
    )


def _inside_allowed_scope(canonical_path: str, allowed_location: str) -> bool:
    """Return True if canonical_path is inside allowed_location."""
    if not allowed_location:
        return True
    canonical_lower = canonical_path.lower().rstrip("\\/")
    allowed_lower = allowed_location.lower().rstrip("\\/")
    if canonical_lower == allowed_lower:
        return True
    if canonical_lower.startswith(allowed_lower + "\\"):
        return True
    return canonical_lower.startswith(allowed_lower + "/")


class FilesystemExecutor:
    """Real (live) or dry-run filesystem remediation executor."""

    supported_action_types = (
        "delete_file",
        "delete_directory",
        "clear_cache",
    )

    @classmethod
    def can_execute(cls, action_type: str) -> bool:
        """Return True if this executor can handle the action type."""
        return action_type in cls.supported_action_types

    @classmethod
    def execute(
        cls,
        action: Any,
        context: dict[str, Any],
        *,
        mode: str = "dry_run",
        cancellation_token: Any = None,
        backup_manager: Optional[BackupManager] = None,
        registry_backup: Any = None,
        execution_id: str = "",
    ) -> TargetExecutorResult:
        """Execute a filesystem action."""
        if mode == "live" and not context.get("__safety_authorized"):
            return TargetExecutorResult(
                status=ExecutionStatus.REJECTED,
                reason="Direct target-executor live execution is not authorized",
                error=ExecutionError(
                    code="UNAUTHORIZED_DIRECT_EXECUTION",
                    message="Execution must go through the DefaultExecutor safety path",
                    details={"mode": mode},
                ),
            )
        try:
            return cls._execute(
                action,
                context,
                mode=mode,
                cancellation_token=cancellation_token,
                backup_manager=backup_manager,
                registry_backup=registry_backup,
                execution_id=execution_id,
            )
        except _FilesystemExecutionError as exc:
            status = ExecutionStatus.FAILED
            if exc.code == "CANCELLED":
                status = ExecutionStatus.CANCELLED
            elif exc.code == "REJECTED":
                status = ExecutionStatus.REJECTED
            return TargetExecutorResult(
                status=status,
                reason=exc.message,
                error=ExecutionError(
                    code=exc.code,
                    message=exc.message,
                    details=exc.details,
                ),
                before_state=context,
                after_state={"exists": True},
                operation=action.action_type.value,
            )
        except ExecutionCancelledError:
            raise
        except Exception as exc:
            return TargetExecutorResult(
                status=ExecutionStatus.FAILED,
                reason=f"Filesystem executor failure: {exc}",
                error=ExecutionError(
                    code="FILESYSTEM_EXCEPTION",
                    message=str(exc),
                    details={"exception_type": type(exc).__name__},
                ),
                before_state=context,
                after_state={"exists": True},
                operation=action.action_type.value,
            )

    @classmethod
    def _execute(
        cls,
        action: Any,
        context: dict[str, Any],
        *,
        mode: str,
        cancellation_token: Any,
        backup_manager: Optional[BackupManager],
        registry_backup: Any,
        execution_id: str,
    ) -> TargetExecutorResult:
        """Core filesystem execution logic."""
        _check_cancelled(cancellation_token)

        canonical_path = context.get("canonical_path", "")
        if not canonical_path:
            raise _FilesystemExecutionError(
                code="MISSING_CANONICAL_PATH",
                message="No canonical path supplied",
            )

        # 1. Path-shape and safety validation (cannot be bypassed).
        try:
            validate_filesystem_path(canonical_path)
        except PathValidationError as exc:
            raise _FilesystemExecutionError(
                code="REJECTED",
                message=f"Path validation failed: {exc}",
                details={"canonical_path": canonical_path},
            )

        # 2. Resolve and re-read live target state.
        operation = action.action_type.value

        # 3. Scope check.
        allowed_location = ""
        if hasattr(action.target, "allowed_location"):
            allowed_location = getattr(action.target, "allowed_location", "") or ""
        if not _inside_allowed_scope(canonical_path, allowed_location):
            raise _FilesystemExecutionError(
                code="REJECTED",
                message="Canonical path is outside the approved scope",
                details={
                    "canonical_path": canonical_path,
                    "allowed_location": allowed_location,
                },
            )

        # 4. Dry-run returns a complete plan without touching the filesystem.
        if mode != "live":
            before_state = dict(context)
            before_state["canonical_path"] = canonical_path
            return TargetExecutorResult(
                status=ExecutionStatus.DRY_RUN,
                reason="Dry-run: no destructive operation performed",
                dry_run_info={
                    "operation": operation,
                    "target": before_state,
                    "would_remove": before_state.get("exists", False),
                },
                before_state=before_state,
                after_state={
                    "exists": False,
                    "is_empty": before_state.get("is_dir", False),
                },
                operation=operation,
            )

        # 5. Resolve and re-read live target state (live only).
        path = Path(canonical_path)
        live = cls._read_live_state(path)
        before_state = {
            "exists": live.exists,
            "canonical_path": canonical_path,
            "is_file": live.is_file,
            "is_dir": live.is_dir,
            "is_symlink": live.is_symlink,
            "is_junction": live.is_junction,
            "is_reparse": live.is_reparse,
            "size": live.size,
            "modified_time": (
                live.modified_time.isoformat()
                if live.modified_time is not None
                else None
            ),
            "content_hash": live.hash,
            "writable": live.writable,
        }

        # 6. Re-verify safety invariants against live state.
        cls._verify_invariants(live, action, context, before_state)

        # 6. Live mode: require a backup manager.
        if backup_manager is None:
            raise _FilesystemExecutionError(
                code="NO_BACKUP_MANAGER",
                message="A BackupManager is required for live filesystem execution",
            )

        # 7. Re-read and re-validate the target identity immediately before
        #    backup to close the TOCTOU window between initial validation and
        #    the destructive operation.
        _check_cancelled(cancellation_token)
        pre_backup = cls._read_live_state(path)
        if pre_backup.is_symlink or pre_backup.is_junction or pre_backup.is_reparse:
            raise _FilesystemExecutionError(
                code="TOCTOU_REPARSE_POINT",
                message=(
                    "Target was replaced by a symlink/junction/reparse point"
                    " before backup"
                ),
            )
        if (
            pre_backup.exists != live.exists
            or pre_backup.is_file != live.is_file
            or pre_backup.is_dir != live.is_dir
            or pre_backup.size != live.size
            or pre_backup.modified_time != live.modified_time
        ):
            raise _FilesystemExecutionError(
                code="TOCTOU_IDENTITY_CHANGED",
                message="Target identity changed between validation and backup",
            )

        # 8. Backup before destructive work.
        _check_cancelled(cancellation_token)
        record: Optional[BackupRecord] = None
        if pre_backup.exists:
            record = backup_manager.create_backup(
                str(path),
                action,
                execution_id,
                context,
                cancellation_token=cancellation_token,
            )

        # 8. Execute the operation.
        _check_cancelled(cancellation_token)
        removed_paths: list[Path] = []
        try:
            if operation == "delete_file":
                cls._delete_file(path, cancellation_token)
            elif operation == "delete_directory":
                cls._delete_directory(path, cancellation_token)
            elif operation == "clear_cache":
                removed_paths = cls._clear_cache(path, cancellation_token)
            else:
                raise _FilesystemExecutionError(
                    code="UNSUPPORTED_OPERATION",
                    message=f"Unsupported filesystem operation: {operation}",
                )
        except _FilesystemExecutionError:
            if record is not None:
                try:
                    backup_manager.restore(record)
                except Exception:
                    pass
            raise
        except Exception:
            # Restore from backup if something failed mid-operation.
            if record is not None:
                try:
                    backup_manager.restore(record)
                except Exception:
                    pass
            raise

        # 9. Post-execution verification.
        _check_cancelled(cancellation_token)
        if operation == "clear_cache":
            for child_path in removed_paths:
                if os.path.lexists(child_path):
                    if record is not None:
                        try:
                            backup_manager.restore(record)
                        except Exception:
                            pass
                    raise _FilesystemExecutionError(
                        code="POST_EXECUTION_VERIFICATION_FAILED",
                        message="Cache child still exists after deletion",
                        details={"path": str(child_path)},
                    )
            live_after = cls._read_live_state(path)
            after_state = {
                "exists": live_after.exists,
                "is_file": live_after.is_file,
                "is_dir": live_after.is_dir,
                "removed_count": len(removed_paths),
                "removed_paths": [str(p) for p in removed_paths],
            }
        else:
            if os.path.lexists(path):
                if record is not None:
                    try:
                        backup_manager.restore(record)
                    except Exception:
                        pass
                raise _FilesystemExecutionError(
                    code="POST_EXECUTION_VERIFICATION_FAILED",
                    message="Target still exists after deletion",
                    details={"path": str(path)},
                )
            live_after = cls._read_live_state(path)
            after_state = {
                "exists": live_after.exists,
                "is_file": live_after.is_file,
                "is_dir": live_after.is_dir,
            }

        return TargetExecutorResult(
            status=ExecutionStatus.COMPLETED,
            reason="Filesystem operation completed successfully",
            before_state=before_state,
            after_state=after_state,
            backup_identity=record.backup_id if record is not None else None,
            backup_location=record.backup_location if record is not None else None,
            backup_hash=record.backup_hash if record is not None else None,
            operation=operation,
        )

    @classmethod
    def _read_live_state(cls, path: Path) -> _LiveState:
        """Read the current filesystem state of a target."""
        exists = os.path.lexists(path)
        if not exists:
            return _LiveState(
                path=path,
                exists=False,
                is_file=False,
                is_dir=False,
                is_symlink=False,
                is_junction=False,
                is_reparse=False,
                size=0,
                modified_time=datetime.now(UTC),
                hash=None,
                writable=False,
            )

        st = path.lstat()
        is_symlink = os.path.islink(path) or stat.S_ISLNK(st.st_mode)
        is_junction = (
            os.path.isjunction(path) if hasattr(os.path, "isjunction") else False
        )
        is_reparse = getattr(st, "st_reparse_tag", 0) != 0
        is_file = path.is_file() and not is_symlink
        is_dir = path.is_dir() and not is_symlink
        size = st.st_size if is_file else 0
        modified_time = datetime.fromtimestamp(st.st_mtime, tz=UTC)
        hash_value = _compute_sha256(path) if is_file else None
        writable = os.access(path, os.W_OK)

        return _LiveState(
            path=path,
            exists=True,
            is_file=is_file,
            is_dir=is_dir,
            is_symlink=is_symlink,
            is_junction=is_junction,
            is_reparse=is_reparse,
            size=size,
            modified_time=modified_time,
            hash=hash_value,
            writable=writable,
        )

    @classmethod
    def _verify_invariants(
        cls,
        live: _LiveState,
        action: Any,
        context: dict[str, Any],
        before_state: dict[str, Any],
    ) -> None:
        """Re-verify all typed preconditions against live state."""
        if not live.exists:
            raise _FilesystemExecutionError(
                code="TARGET_MISSING",
                message="Target does not exist",
            )

        if live.is_symlink or live.is_junction or live.is_reparse:
            raise _FilesystemExecutionError(
                code="REJECTED",
                message="Target is a symlink, junction, or reparse point",
                details={
                    "is_symlink": live.is_symlink,
                    "is_junction": live.is_junction,
                    "is_reparse": live.is_reparse,
                },
            )

        operation = action.action_type.value
        if operation == "delete_file" and not live.is_file:
            raise _FilesystemExecutionError(
                code="TARGET_TYPE_MISMATCH",
                message="Expected a file but found a directory",
            )

        if operation == "delete_directory" and not live.is_dir:
            raise _FilesystemExecutionError(
                code="TARGET_TYPE_MISMATCH",
                message="Expected a directory but found a file",
            )

        if not live.writable:
            raise _FilesystemExecutionError(
                code="PERMISSION_DENIED",
                message="Target is not writable; will not modify ACLs or ownership",
            )

        expected_size = context.get("size")
        if expected_size is not None and live.size != int(expected_size):
            raise _FilesystemExecutionError(
                code="TOCTOU_SIZE_CHANGED",
                message="File size changed since snapshot",
                details={
                    "expected_size": expected_size,
                    "actual_size": live.size,
                },
            )

        expected_hash = context.get("content_hash")
        if expected_hash is not None and live.hash != str(expected_hash):
            raise _FilesystemExecutionError(
                code="TOCTOU_HASH_CHANGED",
                message="File content hash changed since snapshot",
                details={
                    "expected_hash": expected_hash,
                    "actual_hash": live.hash,
                },
            )

        expected_mtime = context.get("modified_time")
        if expected_mtime is not None:
            expected_ts = _timestamp_from_context(expected_mtime)
            if abs(expected_ts - live.modified_time.timestamp()) > 1.0:
                raise _FilesystemExecutionError(
                    code="TOCTOU_MTIME_CHANGED",
                    message="File modified time changed since snapshot",
                    details={
                        "expected_mtime": expected_mtime,
                        "actual_mtime": live.modified_time.isoformat(),
                    },
                )

        expected_asset = context.get("asset_id")
        if expected_asset is not None and expected_asset != action.asset_id:
            raise _FilesystemExecutionError(
                code="IDENTITY_MISMATCH",
                message="Asset identity does not match",
                details={
                    "expected_asset": expected_asset,
                    "action_asset": action.asset_id,
                },
            )

    @classmethod
    def _delete_file(cls, path: Path, cancellation_token: Any) -> None:
        """Delete a single file with cancellation checks."""
        _check_cancelled(cancellation_token)
        try:
            os.remove(path)
        except PermissionError as exc:
            code = "PERMISSION_DENIED"
            if getattr(exc, "winerror", None) == 32:
                code = "LOCKED_TARGET"
            raise _FilesystemExecutionError(
                code=code,
                message=f"Could not delete file: {exc}",
                details={"path": str(path)},
            )
        except OSError as exc:
            raise _FilesystemExecutionError(
                code="DELETE_FAILED",
                message=f"Could not delete file: {exc}",
                details={"path": str(path)},
            )

    @classmethod
    def _delete_directory(cls, path: Path, cancellation_token: Any) -> None:
        """Delete an empty directory."""
        _check_cancelled(cancellation_token)
        if any(os.scandir(path)):
            raise _FilesystemExecutionError(
                code="DIRECTORY_NOT_EMPTY",
                message="Directory is not empty; will not recursively delete",
            )
        try:
            os.rmdir(path)
        except PermissionError as exc:
            code = "PERMISSION_DENIED"
            if getattr(exc, "winerror", None) == 32:
                code = "LOCKED_TARGET"
            raise _FilesystemExecutionError(
                code=code,
                message=f"Could not delete directory: {exc}",
                details={"path": str(path)},
            )
        except OSError as exc:
            raise _FilesystemExecutionError(
                code="DELETE_FAILED",
                message=f"Could not delete directory: {exc}",
                details={"path": str(path)},
            )

    @classmethod
    def _clear_cache(cls, path: Path, cancellation_token: Any) -> list[Path]:
        """Clear the contents of an approved cache directory.

        V1.0: Recursively deletes files and subdirectories within the
        cache directory.  This ensures that temp, prefetch, and other
        cleanup categories are fully cleared — no empty folders remain.
        """
        _check_cancelled(cancellation_token)
        if not path.is_dir():
            raise _FilesystemExecutionError(
                code="TARGET_TYPE_MISMATCH",
                message="Cache target is not a directory",
            )

        removed: list[Path] = cls._clear_dir_recursive(path, cancellation_token)
        return removed

    @classmethod
    def _clear_dir_recursive(cls, path: Path, cancellation_token: Any) -> list[Path]:
        """Recursively delete all files and subdirectories inside ``path``.

        V1.0: Walks the tree bottom-up so that directories are emptied
        before being removed.  This leaves no empty folders behind in
        temp, prefetch, or other cleanup target directories.
        """
        _check_cancelled(cancellation_token)
        removed: list[Path] = []

        children = list(os.scandir(path))
        for child in children:
            _check_cancelled(cancellation_token)
            child_path = Path(child.path)

            # Re-read and validate every child independently.
            child_live = cls._read_live_state(child_path)
            if child_live.is_symlink or child_live.is_junction or child_live.is_reparse:
                # Skip reparse points — do not follow or delete them.
                continue

            if child_live.is_file:
                try:
                    cls._delete_file(child_path, cancellation_token)
                    removed.append(child_path)
                except _FilesystemExecutionError:
                    # Permission/lock errors on individual files are
                    # non-fatal during cache clearing — skip and continue.
                    pass
            elif child_live.is_dir:
                # Recurse into subdirectory first to empty it.
                sub_removed = cls._clear_dir_recursive(child_path, cancellation_token)
                removed.extend(sub_removed)
                # Now the subdirectory should be empty — remove it.
                try:
                    _check_cancelled(cancellation_token)
                    if not any(os.scandir(child_path)):
                        os.rmdir(child_path)
                        removed.append(child_path)
                except (OSError, PermissionError):
                    # If we can't remove the empty dir (permission, etc.),
                    # skip it — the contents are already deleted.
                    pass
            else:
                # Unknown type — skip.
                pass

        return removed
