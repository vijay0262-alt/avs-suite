"""Undo & Restore - Backup and restore system changes.

Creates backup metadata before every optimization.
Supports restoration of:
- Disabled Startup Entries (via startup_manager)
- Registry modifications
- Temporary files where recoverable
- System Restore Points

Features:
- Automatic backup before operations
- Restore Point creation
- Restore availability checking
- Detailed restoration explanations
"""

from __future__ import annotations

import logging
import platform
import shutil
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Windows-specific imports
IS_WINDOWS = platform.system() == "Windows"
if IS_WINDOWS:
    import winreg


class BackupType(str, Enum):
    """Types of backups."""

    STARTUP_ENTRY = "startup_entry"
    REGISTRY_KEY = "registry_key"
    FILE = "file"
    DIRECTORY = "directory"
    SYSTEM_RESTORE_POINT = "system_restore_point"


class RestoreStatus(str, Enum):
    """Restore operation status."""

    AVAILABLE = "available"
    NOT_AVAILABLE = "not_available"
    RESTORED = "restored"
    FAILED = "failed"


@dataclass(slots=True)
class BackupMetadata:
    """Metadata for a backup operation."""

    id: str
    backup_type: BackupType
    original_path: str
    backup_path: str
    timestamp: str
    operation: str
    module: str
    size: int = 0
    details: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class RestoreResult:
    """Result of a restore operation."""

    status: RestoreStatus
    backup_id: str
    message: str
    restored_path: str | None = None
    errors: list[str] = field(default_factory=list)


# Backup storage path
BACKUP_DIR = Path.home() / ".avs" / "backups"
BACKUP_DIR.mkdir(parents=True, exist_ok=True)


def create_backup_id() -> str:
    """Generate a unique backup ID."""
    return f"backup_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}"


def backup_file(file_path: str, operation: str, module: str) -> BackupMetadata:
    """Backup a single file.

    Args:
        file_path: Path to file to backup
        operation: Operation being performed
        module: Module performing the operation

    Returns:
        BackupMetadata
    """
    backup_id = create_backup_id()
    file_path_obj = Path(file_path)

    if not file_path_obj.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    # Create backup path
    backup_path = BACKUP_DIR / backup_id / file_path_obj.name
    backup_path.parent.mkdir(parents=True, exist_ok=True)

    # Copy file
    shutil.copy2(file_path, backup_path)

    size = file_path_obj.stat().st_size

    metadata = BackupMetadata(
        id=backup_id,
        backup_type=BackupType.FILE,
        original_path=file_path,
        backup_path=str(backup_path),
        timestamp=datetime.now().isoformat(),
        operation=operation,
        module=module,
        size=size,
    )

    _save_backup_metadata(metadata)
    logger.info(f"Created file backup: {file_path} -> {backup_path}")
    return metadata


def backup_directory(dir_path: str, operation: str, module: str) -> BackupMetadata:
    """Backup a directory.

    Args:
        dir_path: Path to directory to backup
        operation: Operation being performed
        module: Module performing the operation

    Returns:
        BackupMetadata
    """
    backup_id = create_backup_id()
    dir_path_obj = Path(dir_path)

    if not dir_path_obj.exists():
        raise FileNotFoundError(f"Directory not found: {dir_path}")

    # Create backup path
    backup_path = BACKUP_DIR / backup_id / dir_path_obj.name
    backup_path.parent.mkdir(parents=True, exist_ok=True)

    # Copy directory
    if backup_path.exists():
        shutil.rmtree(backup_path)
    shutil.copytree(dir_path, backup_path)

    # Calculate total size
    size = sum(f.stat().st_size for f in dir_path_obj.rglob('*') if f.is_file())

    metadata = BackupMetadata(
        id=backup_id,
        backup_type=BackupType.DIRECTORY,
        original_path=dir_path,
        backup_path=str(backup_path),
        timestamp=datetime.now().isoformat(),
        operation=operation,
        module=module,
        size=size,
    )

    _save_backup_metadata(metadata)
    logger.info(f"Created directory backup: {dir_path} -> {backup_path}")
    return metadata


def backup_registry_key(
    root_key: int,
    sub_key: str,
    operation: str,
    module: str
) -> BackupMetadata:
    """Backup a registry key.

    Args:
        root_key: Registry root key (winreg.HKEY_LOCAL_MACHINE, etc.)
        sub_key: Registry sub key path
        operation: Operation being performed
        module: Module performing the operation

    Returns:
        BackupMetadata
    """
    if not IS_WINDOWS:
        raise RuntimeError("Registry backup only available on Windows")

    backup_id = create_backup_id()

    # Create backup path
    backup_path = BACKUP_DIR / backup_id / "registry_export.reg"
    backup_path.parent.mkdir(parents=True, exist_ok=True)

    # Export registry key using reg.exe
    root_key_str = _get_root_key_name(root_key)
    full_key = f"{root_key_str}\\{sub_key}"

    try:
        import subprocess
        subprocess.run(
            ["reg", "export", full_key, str(backup_path), "/y"],
            check=True,
            capture_output=True
        )
    except subprocess.CalledProcessError as e:
        logger.error(f"Failed to export registry key: {e}")
        raise

    size = backup_path.stat().st_size if backup_path.exists() else 0

    metadata = BackupMetadata(
        id=backup_id,
        backup_type=BackupType.REGISTRY_KEY,
        original_path=full_key,
        backup_path=str(backup_path),
        timestamp=datetime.now().isoformat(),
        operation=operation,
        module=module,
        size=size,
        details={"root_key": root_key_str, "sub_key": sub_key},
    )

    _save_backup_metadata(metadata)
    logger.info(f"Created registry backup: {full_key} -> {backup_path}")
    return metadata


def create_system_restore_point(description: str) -> BackupMetadata:
    """Create a Windows System Restore Point.

    Args:
        description: Description for the restore point

    Returns:
        BackupMetadata
    """
    if not IS_WINDOWS:
        raise RuntimeError("System Restore Points only available on Windows")

    backup_id = create_backup_id()

    try:
        import subprocess
        # Use PowerShell to create restore point
        ps_command = f"Checkpoint-Computer -Description '{description}' -RestorePointType 'MODIFY_SETTINGS'"
        subprocess.run(
            ["powershell", "-Command", ps_command],
            check=True,
            capture_output=True
        )
    except subprocess.CalledProcessError as e:
        logger.error(f"Failed to create system restore point: {e}")
        raise

    metadata = BackupMetadata(
        id=backup_id,
        backup_type=BackupType.SYSTEM_RESTORE_POINT,
        original_path="SYSTEM",
        backup_path="SYSTEM_RESTORE_POINT",
        timestamp=datetime.now().isoformat(),
        operation="create_restore_point",
        module="system",
        size=0,
        details={"description": description},
    )

    _save_backup_metadata(metadata)
    logger.info(f"Created system restore point: {description}")
    return metadata


def restore_backup(backup_id: str) -> RestoreResult:
    """Restore from a backup.

    Args:
        backup_id: ID of the backup to restore

    Returns:
        RestoreResult
    """
    metadata = _load_backup_metadata(backup_id)

    if not metadata:
        return RestoreResult(
            status=RestoreStatus.NOT_AVAILABLE,
            backup_id=backup_id,
            message="Backup not found"
        )

    try:
        if metadata.backup_type == BackupType.FILE:
            return _restore_file_backup(metadata)
        elif metadata.backup_type == BackupType.DIRECTORY:
            return _restore_directory_backup(metadata)
        elif metadata.backup_type == BackupType.REGISTRY_KEY:
            return _restore_registry_backup(metadata)
        elif metadata.backup_type == BackupType.SYSTEM_RESTORE_POINT:
            return RestoreResult(
                status=RestoreStatus.NOT_AVAILABLE,
                backup_id=backup_id,
                message="System Restore Points must be restored manually through Windows System Restore"
            )
        else:
            return RestoreResult(
                status=RestoreStatus.FAILED,
                backup_id=backup_id,
                message=f"Unsupported backup type: {metadata.backup_type}"
            )
    except Exception as e:
        logger.error(f"Failed to restore backup {backup_id}: {e}")
        return RestoreResult(
            status=RestoreStatus.FAILED,
            backup_id=backup_id,
            message=f"Restore failed: {str(e)}",
            errors=[str(e)]
        )


def check_restore_availability(backup_id: str) -> RestoreStatus:
    """Check if a backup can be restored.

    Args:
        backup_id: ID of the backup to check

    Returns:
        RestoreStatus
    """
    metadata = _load_backup_metadata(backup_id)

    if not metadata:
        return RestoreStatus.NOT_AVAILABLE

    backup_path = Path(metadata.backup_path)

    if not backup_path.exists():
        return RestoreStatus.NOT_AVAILABLE

    return RestoreStatus.AVAILABLE


def get_all_backups() -> list[BackupMetadata]:
    """Get all available backups.

    Returns:
        List of BackupMetadata
    """
    backups = []

    if not BACKUP_DIR.exists():
        return backups

    for backup_dir in BACKUP_DIR.iterdir():
        if backup_dir.is_dir():
            metadata = _load_backup_metadata(backup_dir.name)
            if metadata:
                backups.append(metadata)

    # Sort by timestamp, newest first
    backups.sort(key=lambda x: x.timestamp, reverse=True)

    return backups


def delete_backup(backup_id: str) -> bool:
    """Delete a backup.

    Args:
        backup_id: ID of the backup to delete

    Returns:
        True if successful, False otherwise
    """
    try:
        metadata = _load_backup_metadata(backup_id)
        if not metadata:
            return False

        backup_path = Path(metadata.backup_path)
        if backup_path.exists():
            if backup_path.is_file():
                backup_path.unlink()
            elif backup_path.is_dir():
                shutil.rmtree(backup_path)

        # Delete metadata file
        metadata_file = BACKUP_DIR / backup_id / "metadata.json"
        if metadata_file.exists():
            metadata_file.unlink()

        # Delete backup directory if empty
        backup_dir = BACKUP_DIR / backup_id
        if backup_dir.exists() and not any(backup_dir.iterdir()):
            backup_dir.rmdir()

        logger.info(f"Deleted backup: {backup_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to delete backup {backup_id}: {e}")
        return False


def _restore_file_backup(metadata: BackupMetadata) -> RestoreResult:
    """Restore a file from backup."""
    backup_path = Path(metadata.backup_path)
    original_path = Path(metadata.original_path)

    if not backup_path.exists():
        return RestoreResult(
            status=RestoreStatus.NOT_AVAILABLE,
            backup_id=metadata.id,
            message="Backup file not found"
        )

    try:
        # Restore file
        shutil.copy2(backup_path, original_path)
        logger.info(f"Restored file: {backup_path} -> {original_path}")

        return RestoreResult(
            status=RestoreStatus.RESTORED,
            backup_id=metadata.id,
            message=f"Successfully restored file to {metadata.original_path}",
            restored_path=metadata.original_path
        )
    except Exception as e:
        return RestoreResult(
            status=RestoreStatus.FAILED,
            backup_id=metadata.id,
            message=f"Failed to restore file: {str(e)}",
            errors=[str(e)]
        )


def _restore_directory_backup(metadata: BackupMetadata) -> RestoreResult:
    """Restore a directory from backup."""
    backup_path = Path(metadata.backup_path)
    original_path = Path(metadata.original_path)

    if not backup_path.exists():
        return RestoreResult(
            status=RestoreStatus.NOT_AVAILABLE,
            backup_id=metadata.id,
            message="Backup directory not found"
        )

    try:
        # Restore directory
        if original_path.exists():
            shutil.rmtree(original_path)
        shutil.copytree(backup_path, original_path)
        logger.info(f"Restored directory: {backup_path} -> {original_path}")

        return RestoreResult(
            status=RestoreStatus.RESTORED,
            backup_id=metadata.id,
            message=f"Successfully restored directory to {metadata.original_path}",
            restored_path=metadata.original_path
        )
    except Exception as e:
        return RestoreResult(
            status=RestoreStatus.FAILED,
            backup_id=metadata.id,
            message=f"Failed to restore directory: {str(e)}",
            errors=[str(e)]
        )


def _restore_registry_backup(metadata: BackupMetadata) -> RestoreResult:
    """Restore a registry key from backup."""
    if not IS_WINDOWS:
        return RestoreResult(
            status=RestoreStatus.NOT_AVAILABLE,
            backup_id=metadata.id,
            message="Registry restore only available on Windows"
        )

    backup_path = Path(metadata.backup_path)

    if not backup_path.exists():
        return RestoreResult(
            status=RestoreStatus.NOT_AVAILABLE,
            backup_id=metadata.id,
            message="Backup registry file not found"
        )

    try:
        import subprocess
        # Import registry file
        subprocess.run(
            ["reg", "import", str(backup_path)],
            check=True,
            capture_output=True
        )
        logger.info(f"Restored registry key: {backup_path} -> {metadata.original_path}")

        return RestoreResult(
            status=RestoreStatus.RESTORED,
            backup_id=metadata.id,
            message=f"Successfully restored registry key {metadata.original_path}",
            restored_path=metadata.original_path
        )
    except Exception as e:
        return RestoreResult(
            status=RestoreStatus.FAILED,
            backup_id=metadata.id,
            message=f"Failed to restore registry key: {str(e)}",
            errors=[str(e)]
        )


def _save_backup_metadata(metadata: BackupMetadata) -> None:
    """Save backup metadata to file."""
    import json

    metadata_file = BACKUP_DIR / metadata.id / "metadata.json"
    metadata_file.parent.mkdir(parents=True, exist_ok=True)

    with open(metadata_file, 'w') as f:
        json.dump({
            "id": metadata.id,
            "backup_type": metadata.backup_type.value,
            "original_path": metadata.original_path,
            "backup_path": metadata.backup_path,
            "timestamp": metadata.timestamp,
            "operation": metadata.operation,
            "module": metadata.module,
            "size": metadata.size,
            "details": metadata.details,
        }, f)


def _load_backup_metadata(backup_id: str) -> BackupMetadata | None:
    """Load backup metadata from file."""
    import json

    metadata_file = BACKUP_DIR / backup_id / "metadata.json"

    if not metadata_file.exists():
        return None

    try:
        with open(metadata_file, 'r') as f:
            data = json.load(f)

        return BackupMetadata(
            id=data["id"],
            backup_type=BackupType(data["backup_type"]),
            original_path=data["original_path"],
            backup_path=data["backup_path"],
            timestamp=data["timestamp"],
            operation=data["operation"],
            module=data["module"],
            size=data["size"],
            details=data.get("details", {}),
        )
    except Exception as e:
        logger.error(f"Failed to load backup metadata for {backup_id}: {e}")
        return None


def _get_root_key_name(root_key: int) -> str:
    """Get string representation of registry root key."""
    if not IS_WINDOWS:
        return "UNKNOWN"

    if root_key == winreg.HKEY_LOCAL_MACHINE:
        return "HKEY_LOCAL_MACHINE"
    elif root_key == winreg.HKEY_CURRENT_USER:
        return "HKEY_CURRENT_USER"
    elif root_key == winreg.HKEY_CLASSES_ROOT:
        return "HKEY_CLASSES_ROOT"
    elif root_key == winreg.HKEY_CURRENT_CONFIG:
        return "HKEY_CURRENT_CONFIG"
    elif root_key == winreg.HKEY_USERS:
        return "HKEY_USERS"
    return "UNKNOWN"
