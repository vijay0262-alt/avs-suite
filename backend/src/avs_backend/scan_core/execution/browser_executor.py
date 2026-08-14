"""
SC-8C4 Part 4 — Safe browser cache remediation executor.

Performs dry-run and live cleanup of explicitly classified browser cache
assets. Never removes user data (cookies, history, passwords, etc.).
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

from .backup import BackupManager
from .models import (
    ExecutionCancelledError,
    ExecutionError,
    ExecutionStatus,
    TargetExecutorResult,
)
from avs_backend.scan_core.rules.action import (
    ALLOWED_BROWSER_CACHE_TYPES,
    BLOCKED_BROWSER_DATA_TYPES,
)


class _BrowserExecutionError(Exception):
    """Internal exception used to report a browser operation failure."""

    def __init__(
        self,
        code: str,
        message: str,
        details: Optional[dict[str, Any]] = None,
    ) -> None:
        self.code = code
        self.message = message
        self.details = details or {}


def _check_cancelled(token: Any) -> None:
    """Raise if a cancellation token is cancelled."""
    if token is not None and token.is_cancelled():
        raise _BrowserExecutionError("CANCELLED", "Operation cancelled")


def _validate_cache_type(action: Any, canonical_path: str) -> str:
    """Validate the browser cache type from the explicit action target."""
    cache_type = action.target.cache_type

    if cache_type == "user_data" or cache_type in BLOCKED_BROWSER_DATA_TYPES:
        raise _BrowserExecutionError(
            "REJECTED",
            "Refusing to remove browser user data; only cache assets are eligible",
            {"cache_type": cache_type},
        )

    if cache_type not in ALLOWED_BROWSER_CACHE_TYPES:
        raise _BrowserExecutionError(
            "REQUIRES_REVIEW",
            f"Unrecognized or ambiguous browser cache type: {cache_type}",
            {"cache_type": cache_type},
        )

    user_data_safe = bool(getattr(action.target, "user_data_safe", True))
    cache_only = bool(getattr(action.target, "cache_only", True))
    if not user_data_safe or not cache_only:
        raise _BrowserExecutionError(
            "REJECTED",
            "Browser target must be explicitly marked as user-data-safe and cache-only",
            {
                "user_data_safe": user_data_safe,
                "cache_only": cache_only,
            },
        )

    # Defense-in-depth: the resolved path must not contain user-data components.
    path_lower = canonical_path.lower()
    for keyword in BLOCKED_BROWSER_DATA_TYPES:
        if keyword in path_lower:
            raise _BrowserExecutionError(
                "REJECTED",
                f"Target path contains user-data keyword: {keyword}",
                {"canonical_path": canonical_path},
            )

    return cache_type


def _compute_sha256(path: Path) -> str:
    """Compute SHA-256 of a file without loading it entirely into memory."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def _read_live_state(path: Path) -> dict[str, Any]:
    """Re-read the current live state of a filesystem target."""
    try:
        st = path.lstat()
    except FileNotFoundError:
        return {
            "exists": False,
            "accessible": False,
            "size": 0,
            "modified_time": None,
            "content_hash": None,
            "is_symlink": False,
            "is_junction": False,
            "is_reparse_point": False,
        }

    is_symlink = os.path.islink(path) or stat.S_ISLNK(st.st_mode)
    is_junction = os.path.isjunction(path) if hasattr(os.path, "isjunction") else False
    is_reparse = getattr(st, "st_reparse_tag", 0) != 0
    is_file = path.is_file() and not is_symlink
    is_dir = path.is_dir() and not is_symlink
    accessible = os.access(path, os.W_OK) if is_file or is_dir else False

    size: Optional[int] = None
    mtime: Optional[datetime] = None
    content_hash: Optional[str] = None
    if is_file:
        size = st.st_size
        mtime = datetime.fromtimestamp(st.st_mtime, UTC)
        try:
            content_hash = _compute_sha256(path)
        except OSError:
            content_hash = None

    return {
        "exists": True,
        "accessible": accessible,
        "size": size,
        "modified_time": mtime,
        "content_hash": content_hash,
        "is_symlink": is_symlink,
        "is_junction": is_junction,
        "is_reparse_point": is_reparse,
        "is_file": is_file,
        "is_dir": is_dir,
    }


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


@dataclass
class _ChildResult:
    """Result of cleaning a single cache child."""

    path: str
    removed: bool
    backup_id: Optional[str]
    reason: str
    error: Optional[ExecutionError] = None


class BrowserExecutor:
    """Real (live) or dry-run browser cache remediation executor."""

    supported_action_types = ("clear_browser_cache",)
    max_backup_size = 50 * 1024 * 1024  # 50 MiB
    max_cache_children = 1000  # prevent pathological enumeration
    max_cache_total_size = 50 * 1024 * 1024  # 50 MiB

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
        """Execute a browser cache cleanup action."""
        del registry_backup
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
                execution_id=execution_id,
            )
        except _BrowserExecutionError as exc:
            status = ExecutionStatus.FAILED
            if exc.code == "CANCELLED":
                status = ExecutionStatus.CANCELLED
            elif exc.code == "REJECTED":
                status = ExecutionStatus.REJECTED
            elif exc.code == "REQUIRES_REVIEW":
                status = ExecutionStatus.REQUIRES_REVIEW
            return TargetExecutorResult(
                status=status,
                reason=exc.message,
                error=ExecutionError(
                    code=exc.code,
                    message=exc.message,
                    details=exc.details,
                ),
                before_state=context,
                after_state={},
                operation=action.action_type.value,
            )
        except ExecutionCancelledError:
            raise
        except Exception as exc:
            return TargetExecutorResult(
                status=ExecutionStatus.FAILED,
                reason=f"Browser executor failure: {exc}",
                error=ExecutionError(
                    code="BROWSER_EXCEPTION",
                    message=str(exc),
                    details={"exception_type": type(exc).__name__},
                ),
                before_state=context,
                after_state={},
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
        execution_id: str,
    ) -> TargetExecutorResult:
        """Core browser cache execution logic."""
        _check_cancelled(cancellation_token)

        browser = action.target.browser
        profile = action.target.profile
        cache_type = action.target.cache_type
        actual_browser = context.get("browser", browser)
        actual_profile = context.get("profile", profile)
        display_browser = actual_browser or browser
        display_profile = actual_profile or profile
        canonical_path = context.get("canonical_path", action.target.path)

        if not canonical_path:
            raise _BrowserExecutionError(
                "MISSING_PATH",
                "No canonical path supplied",
            )

        # 1. Path safety (reuses filesystem validation).
        try:
            validate_filesystem_path(canonical_path)
        except PathValidationError as exc:
            raise _BrowserExecutionError(
                "REJECTED",
                f"Path validation failed: {exc}",
                {"canonical_path": canonical_path},
            )

        _check_cancelled(cancellation_token)

        # 2. Browser and profile identity checks.
        actual_browser = context.get("browser", browser)
        if (
            actual_browser
            and browser != "unknown"
            and actual_browser.lower() != browser.lower()
        ):
            raise _BrowserExecutionError(
                "REJECTED",
                "Browser identity does not match action target",
                {"expected": browser, "actual": actual_browser},
            )

        actual_profile = context.get("profile", profile)
        if actual_profile and actual_profile != profile:
            raise _BrowserExecutionError(
                "REJECTED",
                "Browser profile identity does not match action target",
                {"expected": profile, "actual": actual_profile},
            )

        # 3. Running browser check.
        running_browsers = context.get("running_browsers", [])
        browsers_to_check = {browser.lower(), actual_browser.lower()}
        for running in running_browsers:
            if running.lower() in browsers_to_check:
                raise _BrowserExecutionError(
                    "REQUIRES_REVIEW",
                    f"Browser {actual_browser or browser} is currently running",
                    {"browser": actual_browser or browser},
                )

        _check_cancelled(cancellation_token)

        # 4. Cache classification from the explicit target (not the rule_id).
        _validate_cache_type(action, canonical_path)

        _check_cancelled(cancellation_token)

        # 5. Live re-read and TOCTOU checks.
        live = _read_live_state(Path(canonical_path))
        before_state = {
            **context,
            "exists": live["exists"],
            "accessible": live["accessible"],
            "size": live["size"],
            "modified_time": live["modified_time"],
            "content_hash": live["content_hash"],
            "is_symlink": live["is_symlink"],
            "is_junction": live["is_junction"],
            "is_reparse_point": live["is_reparse_point"],
        }

        expected_size = context.get("size")
        if expected_size is not None and live["size"] != expected_size:
            raise _BrowserExecutionError(
                "TOCTOU_SIZE_CHANGED",
                "Cache target size changed since snapshot",
                {"expected": expected_size, "actual": live["size"]},
            )

        expected_mtime = context.get("modified_time")
        if expected_mtime is not None and live["modified_time"] != expected_mtime:
            raise _BrowserExecutionError(
                "TOCTOU_MTIME_CHANGED",
                "Cache target modified time changed since snapshot",
            )

        expected_hash = context.get("content_hash")
        if expected_hash is not None and live["content_hash"] != expected_hash:
            raise _BrowserExecutionError(
                "TOCTOU_HASH_CHANGED",
                "Cache target hash changed since snapshot",
            )

        if not live["exists"]:
            raise _BrowserExecutionError(
                "TARGET_MISSING",
                "Cache target does not exist",
                {"canonical_path": canonical_path},
            )

        if live["is_symlink"] or live["is_junction"] or live["is_reparse_point"]:
            raise _BrowserExecutionError(
                "REJECTED",
                "Cache target is a symlink, junction, or reparse point",
                {
                    "is_symlink": live["is_symlink"],
                    "is_junction": live["is_junction"],
                    "is_reparse_point": live["is_reparse_point"],
                },
            )

        _check_cancelled(cancellation_token)

        # 6. Dry-run returns a complete plan without modifying browser data.
        if mode != "live":
            would_remove, children = cls._enumerate_removable(
                Path(canonical_path),
                cancellation_token,
            )
            return TargetExecutorResult(
                status=ExecutionStatus.DRY_RUN,
                reason="Dry-run: no browser data modified",
                dry_run_info={
                    "operation": "clear_browser_cache",
                    "browser": display_browser,
                    "profile": display_profile,
                    "cache_type": cache_type,
                    "canonical_path": canonical_path,
                    "running": display_browser.lower()
                    in [b.lower() for b in running_browsers],
                    "safety_decision": "ALLOWED",
                    "would_remove": would_remove,
                    "children_count": len(children),
                    "children": [c.path for c in children],
                    "total_size": _sum_children_size(children),
                },
                before_state=before_state,
                after_state={
                    "removed_count": 0,
                    "children": [c.path for c in children],
                },
                operation="clear_browser_cache",
            )

        # 7. Live mode requires a backup manager.
        if backup_manager is None:
            raise _BrowserExecutionError(
                "NO_BACKUP_MANAGER",
                "A BackupManager is required for live browser cache cleanup",
            )

        # 8. Enumerate, back up, and remove cache children.
        allowed_location = canonical_path
        children = cls._enumerate_removable(
            Path(canonical_path),
            cancellation_token,
        )[1]

        if not children:
            raise _BrowserExecutionError(
                "TARGET_EMPTY",
                "No cache files found in target directory",
                {"canonical_path": canonical_path},
            )

        total_backup_size = _sum_children_size(children)
        if total_backup_size > cls.max_backup_size:
            raise _BrowserExecutionError(
                "REQUIRES_REVIEW",
                "Cache backup exceeds safe size limit",
                {
                    "total_size": total_backup_size,
                    "max_size": cls.max_backup_size,
                },
            )

        _check_cancelled(cancellation_token)

        removed: list[_ChildResult] = []
        created_backups: list[Any] = []
        try:
            for child in children:
                _check_cancelled(cancellation_token)
                child_path = child.path
                if not _inside_allowed_scope(child_path, allowed_location):
                    removed.append(
                        _ChildResult(
                            path=child_path,
                            removed=False,
                            backup_id=None,
                            reason="Outside approved cache scope",
                        )
                    )
                    continue

                child_live = _read_live_state(Path(child_path))
                if (
                    child_live["is_symlink"]
                    or child_live["is_junction"]
                    or child_live["is_reparse_point"]
                ):
                    removed.append(
                        _ChildResult(
                            path=child_path,
                            removed=False,
                            backup_id=None,
                            reason="Reparse point not removed",
                        )
                    )
                    continue

                record = backup_manager.create_backup(
                    child_path,
                    action,
                    execution_id,
                    child_live,
                    cancellation_token=cancellation_token,
                )
                created_backups.append(record)

                _delete_path(Path(child_path))
                removed.append(
                    _ChildResult(
                        path=child_path,
                        removed=True,
                        backup_id=record.backup_id,
                        reason="Removed",
                    )
                )
        except ExecutionCancelledError:
            raise
        except Exception as exc:
            for record in reversed(created_backups):
                backup_manager.restore(record)
            raise _BrowserExecutionError(
                "DELETE_FAILED",
                f"Cache cleanup failed and was rolled back: {exc}",
                {"error": str(exc)},
            )

        # 7. Post-execution verification.
        _check_cancelled(cancellation_token)
        for r in removed:
            if not r.removed:
                continue
            live_after = _read_live_state(Path(r.path))
            if live_after["exists"]:
                for record in reversed(created_backups):
                    try:
                        backup_manager.restore(record)
                    except Exception:
                        pass
                raise _BrowserExecutionError(
                    "POST_EXECUTION_VERIFICATION_FAILED",
                    f"Cache child still exists after deletion: {r.path}",
                    {"path": r.path},
                )

        removed_count = sum(1 for r in removed if r.removed)
        backup_ids = ",".join(r.backup_id for r in removed if r.backup_id is not None)

        return TargetExecutorResult(
            status=ExecutionStatus.COMPLETED,
            reason="Browser cache cleanup completed",
            before_state=before_state,
            after_state={
                "removed_count": removed_count,
                "children": [r.path for r in removed],
            },
            backup_identity=backup_ids or None,
            backup_location=canonical_path,
            operation="clear_browser_cache",
        )

    @classmethod
    def _enumerate_removable(
        cls,
        root: Path,
        cancellation_token: Any,
    ) -> tuple[bool, list["_Child"]]:
        """Enumerate cache children that would be removed."""
        if not root.exists():
            return False, []

        if root.is_file():
            live = _read_live_state(root)
            if not (
                live["is_symlink"] or live["is_junction"] or live["is_reparse_point"]
            ):
                return True, [_Child(path=str(root), size=live["size"] or 0)]
            return False, []

        children: list[_Child] = []
        total_size = 0
        for dirpath, _dirnames, filenames in os.walk(root):
            _check_cancelled(cancellation_token)
            for filename in filenames:
                full = Path(dirpath) / filename
                if not full.exists():
                    continue
                live = _read_live_state(full)
                if (
                    live["is_symlink"]
                    or live["is_junction"]
                    or live["is_reparse_point"]
                ):
                    continue
                if live["is_file"]:
                    children.append(_Child(path=str(full), size=live["size"] or 0))
                    total_size += live["size"] or 0
                if (
                    len(children) > cls.max_cache_children
                    or total_size > cls.max_cache_total_size
                ):
                    raise _BrowserExecutionError(
                        "REQUIRES_REVIEW",
                        "Cache tree exceeds safe enumeration limits",
                        details={
                            "children_count": len(children),
                            "total_size": total_size,
                            "max_children": cls.max_cache_children,
                            "max_size": cls.max_cache_total_size,
                        },
                    )
            # Do not recurse into subdirectories; only process files at the top
            # level. Remove empty dirs if needed after file deletion.
            break
        return bool(children), children


@dataclass
class _Child:
    """A child cache file to be removed."""

    path: str
    size: int


def _sum_children_size(children: list[_Child]) -> int:
    """Return total byte size of children."""
    return sum(c.size for c in children)


def _delete_path(path: Path) -> None:
    """Delete a single file or empty directory."""
    if path.is_file():
        os.remove(path)
    elif path.is_dir():
        try:
            os.rmdir(path)
        except OSError:
            pass
