"""
SC-8C4 Part 3 — Registry backup and rollback support.

Captures original registry value state before live removal and can restore
removed values on supported Windows systems.
"""

from __future__ import annotations

import sys
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Optional

if sys.platform == "win32":
    import winreg  # type: ignore[import]
else:
    winreg = None  # type: ignore

from .models import ExecutionError


@dataclass(frozen=True)
class RegistryBackupRecord:
    """Immutable record of a registry value or key before live removal."""

    backup_id: str
    execution_id: str
    action_id: str
    asset_id: str
    hive: str
    view: str
    key: str
    value_name: Optional[str]
    value_type: Optional[int]
    value_data: Any
    key_existed: bool
    value_existed: bool
    created_at: datetime

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary without exposing raw value contents."""
        return {
            "backup_id": self.backup_id,
            "execution_id": self.execution_id,
            "action_id": self.action_id,
            "asset_id": self.asset_id,
            "hive": self.hive,
            "view": self.view,
            "key": self.key,
            "value_name": self.value_name,
            "value_type": self.value_type,
            "value_data_length": (
                len(self.value_data) if self.value_data is not None else 0
            ),
            "key_existed": self.key_existed,
            "value_existed": self.value_existed,
            "created_at": self.created_at.isoformat(),
        }


class RegistryBackup:
    """Manages in-memory registry backup records and restores."""

    DEFAULT_MAX_VALUE_DATA_SIZE = 1024 * 1024  # 1 MiB

    def __init__(
        self,
        max_value_data_size: int = DEFAULT_MAX_VALUE_DATA_SIZE,
    ) -> None:
        if max_value_data_size < 0:
            raise ValueError("max_value_data_size must be non-negative")
        self._max_value_data_size = max_value_data_size
        self._records: dict[str, RegistryBackupRecord] = {}

    def create_record(
        self,
        hive: str,
        view: str,
        key: str,
        value_name: Optional[str],
        action: Any,
        execution_id: str,
        key_existed: bool,
        value_existed: bool,
        value_type: Optional[int] = None,
        value_data: Any = None,
    ) -> Optional[RegistryBackupRecord]:
        """Create a backup record for a registry target."""
        data_size = 0
        try:
            data_size = len(value_data) if value_data is not None else 0
        except TypeError:
            data_size = 0
        if data_size > self._max_value_data_size:
            return None

        record = RegistryBackupRecord(
            backup_id=str(uuid.uuid4()),
            execution_id=execution_id,
            action_id=action.action_id,
            asset_id=action.asset_id,
            hive=hive,
            view=view,
            key=key,
            value_name=value_name,
            value_type=value_type,
            value_data=value_data,
            key_existed=key_existed,
            value_existed=value_existed,
            created_at=datetime.now(UTC),
        )
        self._records[record.backup_id] = record
        return record

    def restore(self, record: RegistryBackupRecord) -> "RegistryRestoreResult":
        """Restore a removed registry value or key."""
        if winreg is None:
            return RegistryRestoreResult(
                success=False,
                backup_id=record.backup_id,
                reason="Windows registry not available on this platform",
            )

        if not record.value_existed and record.value_name is not None:
            return RegistryRestoreResult(
                success=False,
                backup_id=record.backup_id,
                reason="Value did not exist before deletion; nothing to restore",
            )

        sam = self._view_to_sam(record.view)
        try:
            # Ensure the parent key exists, creating the target key if needed.
            with winreg.CreateKeyEx(
                self._hive_to_const(record.hive),
                record.key,
                0,
                winreg.KEY_ALL_ACCESS | sam,
            ) as handle:
                if record.value_name is not None and record.value_type is not None:
                    winreg.SetValueEx(
                        handle,
                        record.value_name,
                        0,
                        record.value_type,
                        record.value_data,
                    )
        except OSError as exc:
            return RegistryRestoreResult(
                success=False,
                backup_id=record.backup_id,
                reason=f"Restore failed: {exc}",
                error=ExecutionError(
                    code="RESTORE_FAILED",
                    message=str(exc),
                    details={"key": record.key, "value_name": record.value_name},
                ),
            )

        return RegistryRestoreResult(
            success=True,
            backup_id=record.backup_id,
            reason="Registry value restored successfully",
        )

    def get(self, backup_id: str) -> Optional[RegistryBackupRecord]:
        """Return a backup record by id."""
        return self._records.get(backup_id)

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "recorded_backups": len(self._records),
            "records": {bid: record.to_dict() for bid, record in self._records.items()},
        }

    @staticmethod
    def _hive_to_const(hive: str) -> Any:
        """Map canonical hive name to a winreg constant."""
        if winreg is None:
            raise RuntimeError("Windows registry not available")
        mapping = {
            "HKLM": winreg.HKEY_LOCAL_MACHINE,
            "HKCU": winreg.HKEY_CURRENT_USER,
            "HKCR": winreg.HKEY_CLASSES_ROOT,
            "HKU": winreg.HKEY_USERS,
            "HKCC": winreg.HKEY_CURRENT_CONFIG,
        }
        return mapping[hive]

    @staticmethod
    def _view_to_sam(view: str) -> int:
        """Map view string to WOW64 access mask."""
        if winreg is None:
            return 0
        view_lower = view.lower()
        if view_lower in ("wow6432node", "wow32", "32"):
            return winreg.KEY_WOW64_32KEY
        if view_lower in ("wow6446node", "wow64", "64"):
            return winreg.KEY_WOW64_64KEY
        return 0


@dataclass(frozen=True)
class RegistryRestoreResult:
    """Result of a registry restore attempt."""

    success: bool
    backup_id: str
    reason: str
    error: Optional[ExecutionError] = None

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "success": self.success,
            "backup_id": self.backup_id,
            "reason": self.reason,
            "error": self.error.to_dict() if self.error is not None else None,
        }
