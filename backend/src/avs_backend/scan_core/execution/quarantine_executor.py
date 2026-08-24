"""Quarantine executor — safe file isolation for confirmed threats.

Implements the ``quarantine_file`` action type. Moves confirmed threat
files into AVS quarantine storage with:

- Path validation (no AVS files, no Windows system files)
- TOCTOU re-verification before action
- Atomic move with backup
- Quarantine manifest persistence (survives restart)
- Post-action verification (original path no longer active)
- Restoration support

This executor is registered in target_executors.py and called by
DefaultExecutor through the canonical RemediationCoordinator pipeline.
It does NOT bypass SafetyGate, CapabilityContract, or path validation.

Quarantine storage location:
    Windows: %LOCALAPPDATA%\\AVS Shield\\Quarantine
    Other:   ~/.avs-shield/quarantine

Manifest format (manifest.json):
    {
        "items": [
            {
                "quarantineId": "q-...",
                "originalPath": "C:\\...\\threat.exe",
                "quarantinePath": "C:\\...\\Quarantine\\q-...\\threat.exe",
                "threatName": "Trojan:Win32/...",
                "threatId": "...",
                "detectionSource": "WINDOWS_DEFENDER",
                "detectionId": "...",
                "quarantinedAt": "2024-...",
                "fileHash": "sha256:...",
                "fileSize": 12345,
                "remediationState": "quarantined",
                "restored": false,
                "deleted": false
            }
        ]
    }
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import shutil
import stat
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Optional

from ..rules.action_path_validation import (
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

logger = logging.getLogger(__name__)


# ── Quarantine storage paths ──────────────────────────────────────────

if os.name == "nt":
    _QUARANTINE_DIR = os.path.expandvars(r"%LOCALAPPDATA%\AVS Shield\Quarantine")
else:
    _QUARANTINE_DIR = os.path.expanduser("~/.avs-shield/quarantine")

_QUARANTINE_MANIFEST = os.path.join(_QUARANTINE_DIR, "manifest.json")
_quarantine_lock = threading.Lock()


# ── AVS self-protection paths ─────────────────────────────────────────

def _get_avs_paths() -> list[str]:
    """Return AVS installation/application paths that must never be quarantined."""
    paths: list[str] = []
    if os.name == "nt":
        local_app_data = os.environ.get("LOCALAPPDATA", "")
        app_data = os.environ.get("APPDATA", "")
        if local_app_data:
            paths.append(os.path.join(local_app_data, "AVS Shield"))
            paths.append(os.path.join(local_app_data, "Programs", "Devin"))
        if app_data:
            paths.append(os.path.join(app_data, "devin"))
    else:
        paths.append(os.path.expanduser("~/.avs-shield"))
        paths.append(os.path.expanduser("~/.config/devin"))
    return paths


def _is_avs_path(canonical_path: str) -> bool:
    """Check if a path is inside the AVS installation/application directory."""
    avs_paths = _get_avs_paths()
    normalized = canonical_path.replace("\\", "/").lower().rstrip("/")
    for avs_path in avs_paths:
        norm_avs = avs_path.replace("\\", "/").lower().rstrip("/")
        if normalized == norm_avs or normalized.startswith(norm_avs + "/"):
            return True
    # Also check if the path contains "AVS Shield" or "avs-backend"
    lower_path = canonical_path.lower()
    if "avs shield" in lower_path or "avs-backend" in lower_path:
        return True
    if "avs shield optimizer" in lower_path:
        return True
    return False


def _compute_sha256(path: Path) -> str:
    """Compute SHA-256 of a file."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def _check_cancelled(token: Any) -> None:
    """Raise if a cancellation token is cancelled."""
    if token is not None and token.is_cancelled():
        raise ExecutionCancelledError("Operation cancelled")


def _ensure_quarantine_dir() -> None:
    """Ensure the quarantine directory exists."""
    os.makedirs(_QUARANTINE_DIR, exist_ok=True)


def _load_manifest() -> dict[str, Any]:
    """Load the quarantine manifest."""
    try:
        with open(_QUARANTINE_MANIFEST, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict) or not isinstance(data.get("items"), list):
            return {"items": []}
        return data
    except (FileNotFoundError, ValueError, OSError):
        return {"items": []}


def _save_manifest(manifest: dict[str, Any]) -> None:
    """Save the quarantine manifest atomically."""
    _ensure_quarantine_dir()
    tmp_path = _QUARANTINE_MANIFEST + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    # Atomic rename on Windows (os.replace handles cross-device on same volume)
    os.replace(tmp_path, _QUARANTINE_MANIFEST)


def _add_to_manifest(entry: dict[str, Any]) -> None:
    """Add a quarantine entry to the manifest."""
    with _quarantine_lock:
        manifest = _load_manifest()
        manifest["items"].append(entry)
        _save_manifest(manifest)


def _find_in_manifest(original_path: str) -> Optional[dict[str, Any]]:
    """Find an existing manifest entry for the same original path."""
    with _quarantine_lock:
        manifest = _load_manifest()
        for item in manifest.get("items", []):
            if (
                isinstance(item, dict)
                and item.get("originalPath") == original_path
                and not item.get("deleted", False)
                and not item.get("restored", False)
            ):
                return item
    return None


class QuarantineExecutor:
    """Executor for the quarantine_file action type.

    Moves confirmed threat files into AVS quarantine storage with full
    safety validation, atomic operation, manifest persistence, and
    post-action verification.
    """

    supported_action_types = ("quarantine_file",)

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
        """Execute a quarantine action."""
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
        except ExecutionCancelledError:
            raise
        except _QuarantineError as exc:
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
                operation="quarantine_file",
            )
        except Exception as exc:
            return TargetExecutorResult(
                status=ExecutionStatus.FAILED,
                reason=f"Quarantine executor failure: {exc}",
                error=ExecutionError(
                    code="QUARANTINE_EXCEPTION",
                    message=str(exc),
                    details={"exception_type": type(exc).__name__},
                ),
                before_state=context,
                after_state={"exists": True},
                operation="quarantine_file",
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
        """Core quarantine execution logic."""
        _check_cancelled(cancellation_token)

        canonical_path = context.get("canonical_path", "")
        if not canonical_path:
            raise _QuarantineError(
                code="MISSING_CANONICAL_PATH",
                message="No canonical path supplied",
            )

        # 1. Path-shape and safety validation.
        try:
            validate_filesystem_path(canonical_path)
        except PathValidationError as exc:
            raise _QuarantineError(
                code="REJECTED",
                message=f"Path validation failed: {exc}",
                details={"canonical_path": canonical_path},
            )

        # 2. AVS self-protection — never quarantine AVS files.
        if _is_avs_path(canonical_path):
            raise _QuarantineError(
                code="AVS_SELF_PROTECTION",
                message=(
                    "Refusing to quarantine AVS application file — "
                    "AVS self-protection policy"
                ),
                details={"canonical_path": canonical_path},
            )

        # 3. Duplicate quarantine prevention.
        existing = _find_in_manifest(canonical_path)
        if existing is not None:
            raise _QuarantineError(
                code="ALREADY_QUARANTINED",
                message=(
                    "File is already quarantined — duplicate prevention"
                ),
                details={
                    "canonical_path": canonical_path,
                    "existing_quarantine_id": existing.get("quarantineId"),
                },
            )

        # 4. Dry-run returns a complete plan without touching the filesystem.
        if mode != "live":
            before_state = dict(context)
            before_state["canonical_path"] = canonical_path
            return TargetExecutorResult(
                status=ExecutionStatus.DRY_RUN,
                reason="Dry-run: no quarantine operation performed",
                dry_run_info={
                    "operation": "quarantine_file",
                    "target": before_state,
                    "would_quarantine": before_state.get("exists", False),
                },
                before_state=before_state,
                after_state={
                    "exists": False,
                    "quarantined": True,
                },
                operation="quarantine_file",
            )

        # 5. Live mode: resolve and re-read live target state.
        path = Path(canonical_path)
        if not path.is_file():
            raise _QuarantineError(
                code="TARGET_MISSING",
                message="Target file does not exist",
                details={"canonical_path": canonical_path},
            )

        if path.is_symlink():
            raise _QuarantineError(
                code="REJECTED",
                message="Target is a symlink — will not quarantine",
            )

        # Re-validate AVS protection against the resolved path.
        resolved = str(path.resolve())
        if _is_avs_path(resolved):
            raise _QuarantineError(
                code="AVS_SELF_PROTECTION",
                message=(
                    "Refusing to quarantine AVS application file "
                    "(resolved path check)"
                ),
                details={"resolved_path": resolved},
            )

        # Re-validate forbidden roots against the resolved path.
        try:
            validate_filesystem_path(resolved)
        except PathValidationError as exc:
            raise _QuarantineError(
                code="REJECTED",
                message=f"Resolved path validation failed: {exc}",
                details={"resolved_path": resolved},
            )

        # 6. TOCTOU re-verification: check file still exists and is accessible.
        _check_cancelled(cancellation_token)
        if not os.path.isfile(canonical_path):
            raise _QuarantineError(
                code="TOCTOU_TARGET_GONE",
                message="Target file disappeared before quarantine",
            )

        # 7. Compute file hash and size for manifest.
        _check_cancelled(cancellation_token)
        try:
            file_hash = _compute_sha256(path)
            file_size = os.path.getsize(canonical_path)
        except OSError as exc:
            raise _QuarantineError(
                code="FILE_READ_FAILED",
                message=f"Could not read file for hashing: {exc}",
            )

        # 8. Extract threat metadata from context.
        threat_name = str(context.get("threat_name", "Unknown Threat"))
        threat_id = str(context.get("threat_id", ""))
        detection_source = str(
            context.get("detection_source", "WINDOWS_DEFENDER")
        )
        detection_id = str(context.get("detection_id", ""))

        # 9. Create quarantine entry with unique ID.
        quarantine_id = f"q-{uuid.uuid4()}"
        quarantined_at = datetime.now(UTC).isoformat()

        # Each quarantined item gets its own subdirectory to prevent
        # accidental overwrites.
        item_dir = Path(_QUARANTINE_DIR) / quarantine_id
        item_dir.mkdir(parents=True, exist_ok=True)
        quarantine_path = item_dir / path.name

        # 10. Atomic move: copy then delete (cross-volume safe).
        _check_cancelled(cancellation_token)
        try:
            # Copy to quarantine first (preserves original if copy fails).
            shutil.copy2(canonical_path, quarantine_path)

            # Verify the copy succeeded by comparing hashes.
            quarantined_hash = _compute_sha256(quarantine_path)
            if quarantined_hash != file_hash:
                # Hash mismatch — remove the bad copy and fail.
                try:
                    os.remove(quarantine_path)
                except OSError:
                    pass
                raise _QuarantineError(
                    code="COPY_HASH_MISMATCH",
                    message="Quarantined copy hash does not match original",
                    details={
                        "original_hash": file_hash,
                        "quarantined_hash": quarantined_hash,
                    },
                )

            # Delete the original.
            _check_cancelled(cancellation_token)
            try:
                os.remove(canonical_path)
            except PermissionError as exc:
                # Original is locked — remove the quarantine copy and fail.
                try:
                    os.remove(quarantine_path)
                except OSError:
                    pass
                code = "LOCKED_TARGET"
                if getattr(exc, "winerror", None) != 32:
                    code = "PERMISSION_DENIED"
                raise _QuarantineError(
                    code=code,
                    message=f"Could not remove original file: {exc}",
                    details={"canonical_path": canonical_path},
                )
            except OSError as exc:
                try:
                    os.remove(quarantine_path)
                except OSError:
                    pass
                raise _QuarantineError(
                    code="DELETE_FAILED",
                    message=f"Could not remove original file: {exc}",
                    details={"canonical_path": canonical_path},
                )
        except _QuarantineError:
            raise
        except Exception as exc:
            # Clean up partial quarantine copy.
            try:
                if quarantine_path.exists():
                    os.remove(quarantine_path)
            except OSError:
                pass
            raise _QuarantineError(
                code="QUARANTINE_MOVE_FAILED",
                message=f"Failed to move file to quarantine: {exc}",
            )

        # 11. Post-action verification: original path should no longer exist.
        _check_cancelled(cancellation_token)
        if os.path.lexists(canonical_path):
            # Original still exists — try to restore by copying back.
            try:
                shutil.copy2(quarantine_path, canonical_path)
                os.remove(quarantine_path)
                item_dir.rmdir()
            except OSError:
                pass
            raise _QuarantineError(
                code="POST_EXECUTION_VERIFICATION_FAILED",
                message="Original file still exists after quarantine",
                details={"canonical_path": canonical_path},
            )

        # Verify quarantine copy exists.
        if not quarantine_path.is_file():
            raise _QuarantineError(
                code="QUARANTINE_COPY_MISSING",
                message="Quarantined copy does not exist after move",
                details={"quarantine_path": str(quarantine_path)},
            )

        # 12. Record in manifest.
        manifest_entry = {
            "quarantineId": quarantine_id,
            "originalPath": canonical_path,
            "quarantinePath": str(quarantine_path),
            "threatName": threat_name,
            "threatId": threat_id,
            "detectionSource": detection_source,
            "detectionId": detection_id,
            "quarantinedAt": quarantined_at,
            "fileHash": f"sha256:{file_hash}",
            "fileSize": file_size,
            "remediationState": "quarantined",
            "restored": False,
            "deleted": False,
            "reason": f"Quarantined by AVS: {threat_name}",
        }
        try:
            _add_to_manifest(manifest_entry)
        except Exception as exc:
            logger.warning("Failed to update quarantine manifest: %s", exc)
            # Non-fatal — file is quarantined even if manifest update fails.

        # 13. Return success with before/after state.
        before_state = {
            "exists": True,
            "canonical_path": canonical_path,
            "is_file": True,
            "size": file_size,
            "content_hash": file_hash,
        }
        after_state = {
            "exists": False,
            "quarantined": True,
            "quarantine_id": quarantine_id,
            "quarantine_path": str(quarantine_path),
        }

        return TargetExecutorResult(
            status=ExecutionStatus.COMPLETED,
            reason="File quarantined successfully",
            before_state=before_state,
            after_state=after_state,
            backup_identity=quarantine_id,
            backup_location=str(quarantine_path),
            backup_hash=f"sha256:{file_hash}",
            operation="quarantine_file",
        )


class _QuarantineError(Exception):
    """Internal exception for quarantine operation failures."""

    def __init__(
        self,
        code: str,
        message: str,
        details: Optional[dict[str, Any]] = None,
    ) -> None:
        self.code = code
        self.message = message
        self.details = details or {}
