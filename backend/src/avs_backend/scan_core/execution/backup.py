"""
SC-8C4 Part 2 — Backup and rollback support.

The BackupManager creates immutable backup records before destructive
filesystem operations. No destructive work is performed here.
"""

from __future__ import annotations

import hashlib
import os
import shutil
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Optional

from .models import ExecutionCancelledError, ExecutionError


def _compute_sha256(path: Path) -> str:
    """Compute SHA-256 of a file without loading it entirely into memory."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def _total_size(path: Path) -> int:
    """Return total byte size of a file or directory tree."""
    if path.is_file():
        return path.stat().st_size
    if path.is_dir():
        total = 0
        for dirpath, _dirnames, filenames in os.walk(path):
            for filename in filenames:
                total += Path(dirpath, filename).stat().st_size
        return total
    return 0


@dataclass(frozen=True)
class BackupRecord:
    """Immutable record of a pre-deletion backup."""

    backup_id: str
    execution_id: str
    action_id: str
    asset_id: str
    original_path: str
    original_size: int
    original_modified_time: Optional[datetime]
    backup_location: str
    backup_hash: Optional[str]
    created_at: datetime
    is_directory: bool

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "backup_id": self.backup_id,
            "execution_id": self.execution_id,
            "action_id": self.action_id,
            "asset_id": self.asset_id,
            "original_path": self.original_path,
            "original_size": self.original_size,
            "original_modified_time": (
                self.original_modified_time.isoformat()
                if self.original_modified_time is not None
                else None
            ),
            "backup_location": self.backup_location,
            "backup_hash": self.backup_hash,
            "created_at": self.created_at.isoformat(),
            "is_directory": self.is_directory,
        }


@dataclass(frozen=True)
class RollbackResult:
    """Immutable result of a rollback attempt."""

    success: bool
    backup_id: str
    reason: str
    timestamp: datetime
    error: Optional[ExecutionError] = None

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "success": self.success,
            "backup_id": self.backup_id,
            "reason": self.reason,
            "timestamp": self.timestamp.isoformat(),
            "error": self.error.to_dict() if self.error is not None else None,
        }


@dataclass
class BackupManager:
    """Manages pre-deletion backups and rollbacks."""

    backup_root: Path
    _records: dict[str, BackupRecord] = field(default_factory=dict, repr=False)

    def __post_init__(self) -> None:
        if isinstance(self.backup_root, str):
            object.__setattr__(self, "backup_root", Path(self.backup_root))
        self.backup_root.mkdir(parents=True, exist_ok=True)

    def create_backup(
        self,
        source_path: str,
        action: Any,
        execution_id: str,
        execution_context: dict[str, Any],
        cancellation_token: Optional[Any] = None,
    ) -> BackupRecord:
        """Create a backup for a target before deletion.

        Note: a single OS shutil.copy2/copytree call may finish after a
        cancellation request is received.  Cooperative cancellation must be
        checked before and after this call, not inside it.
        """
        if cancellation_token is not None and cancellation_token.is_cancelled():
            raise ExecutionCancelledError("Backup creation was cancelled")
        source = Path(source_path).resolve()
        if not source.exists():
            raise FileNotFoundError(f"Cannot back up non-existent target: {source}")

        is_directory = source.is_dir()
        original_size = _total_size(source)
        st = source.stat()
        original_mtime = datetime.fromtimestamp(st.st_mtime, tz=UTC)

        backup_id = str(uuid.uuid4())
        backup_dir = self.backup_root / execution_id / action.action_id
        backup_dir.mkdir(parents=True, exist_ok=True)
        backup_location = backup_dir / source.name

        if is_directory:
            shutil.copytree(source, backup_location, dirs_exist_ok=False)
            backup_hash: Optional[str] = None
        else:
            shutil.copy2(source, backup_location)
            backup_hash = _compute_sha256(backup_location)

        record = BackupRecord(
            backup_id=backup_id,
            execution_id=execution_id,
            action_id=action.action_id,
            asset_id=action.asset_id,
            original_path=str(source),
            original_size=original_size,
            original_modified_time=original_mtime,
            backup_location=str(backup_location),
            backup_hash=backup_hash or execution_context.get("content_hash"),
            created_at=datetime.now(UTC),
            is_directory=is_directory,
        )
        self._records[record.backup_id] = record
        return record

    def restore(self, record: BackupRecord) -> RollbackResult:
        """Restore an original target from its backup."""
        backup_path = Path(record.backup_location)
        original_path = Path(record.original_path)

        if not backup_path.exists():
            return RollbackResult(
                success=False,
                backup_id=record.backup_id,
                reason="Backup no longer exists",
                timestamp=datetime.now(UTC),
            )

        # Verify the backup itself has not been tampered with before restoring.
        if not record.is_directory and record.backup_hash is not None:
            current_backup_hash = _compute_sha256(backup_path)
            if current_backup_hash != record.backup_hash:
                return RollbackResult(
                    success=False,
                    backup_id=record.backup_id,
                    reason="Backup hash mismatch; backup may be tampered",
                    timestamp=datetime.now(UTC),
                    error=ExecutionError(
                        code="BACKUP_HASH_MISMATCH",
                        message="Backup does not match recorded hash",
                        details={
                            "expected": record.backup_hash,
                            "actual": current_backup_hash,
                        },
                    ),
                )

        try:
            if record.is_directory:
                original_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copytree(backup_path, original_path, dirs_exist_ok=True)
            else:
                original_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(backup_path, original_path)
        except Exception as exc:
            return RollbackResult(
                success=False,
                backup_id=record.backup_id,
                reason=f"Restore failed: {exc}",
                timestamp=datetime.now(UTC),
                error=ExecutionError(
                    code="RESTORE_FAILED",
                    message=str(exc),
                    details={"original_path": str(original_path)},
                ),
            )

        # Independently verify the restored output matches the recorded hash.
        if not record.is_directory and record.backup_hash is not None:
            restored_hash = _compute_sha256(original_path)
            if restored_hash != record.backup_hash:
                return RollbackResult(
                    success=False,
                    backup_id=record.backup_id,
                    reason="Restored content hash mismatch",
                    timestamp=datetime.now(UTC),
                    error=ExecutionError(
                        code="RESTORE_HASH_MISMATCH",
                        message="Restored file does not match backup hash",
                        details={
                            "expected": record.backup_hash,
                            "actual": restored_hash,
                        },
                    ),
                )

        return RollbackResult(
            success=True,
            backup_id=record.backup_id,
            reason="Original target restored from backup",
            timestamp=datetime.now(UTC),
        )

    def get(self, backup_id: str) -> Optional[BackupRecord]:
        """Return a backup record by id."""
        return self._records.get(backup_id)

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "recorded_backups": len(self._records),
            "records": {bid: record.to_dict() for bid, record in self._records.items()},
        }
