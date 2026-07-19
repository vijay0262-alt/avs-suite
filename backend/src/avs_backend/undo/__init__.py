"""Undo & Restore — Backup and restore system changes."""

from __future__ import annotations

import logging
from typing import Any

from avs_backend.api.registry import register
from avs_backend.undo.undo_manager import (
    BackupType,
    RestoreStatus,
    BackupMetadata,
    RestoreResult,
    backup_file,
    backup_directory,
    backup_registry_key,
    create_system_restore_point,
    restore_backup,
    check_restore_availability,
    get_all_backups,
    delete_backup,
)

logger = logging.getLogger(__name__)


@register("undo.backup.file")
def undo_backup_file(params: dict[str, Any] | None) -> dict[str, Any]:
    """Backup a single file."""
    try:
        if not params or "path" not in params:
            raise ValueError("Missing required parameter: path")

        file_path = params["path"]
        operation = params.get("operation", "manual_backup")
        module = params.get("module", "user")

        metadata = backup_file(file_path, operation, module)

        return {
            "id": metadata.id,
            "backupType": metadata.backup_type.value,
            "originalPath": metadata.original_path,
            "backupPath": metadata.backup_path,
            "timestamp": metadata.timestamp,
            "operation": metadata.operation,
            "module": metadata.module,
            "size": metadata.size,
        }
    except Exception as e:
        logger.error(f"Failed to backup file: {e}")
        raise


@register("undo.backup.directory")
def undo_backup_directory(params: dict[str, Any] | None) -> dict[str, Any]:
    """Backup a directory."""
    try:
        if not params or "path" not in params:
            raise ValueError("Missing required parameter: path")

        dir_path = params["path"]
        operation = params.get("operation", "manual_backup")
        module = params.get("module", "user")

        metadata = backup_directory(dir_path, operation, module)

        return {
            "id": metadata.id,
            "backupType": metadata.backup_type.value,
            "originalPath": metadata.original_path,
            "backupPath": metadata.backup_path,
            "timestamp": metadata.timestamp,
            "operation": metadata.operation,
            "module": metadata.module,
            "size": metadata.size,
        }
    except Exception as e:
        logger.error(f"Failed to backup directory: {e}")
        raise


@register("undo.backup.registry")
def undo_backup_registry(params: dict[str, Any] | None) -> dict[str, Any]:
    """Backup a registry key."""
    try:
        if not params or "subKey" not in params:
            raise ValueError("Missing required parameter: subKey")

        if not IS_WINDOWS:
            raise RuntimeError("Registry backup only available on Windows")

        import winreg

        root_key_str = params.get("rootKey", "HKEY_CURRENT_USER")
        root_key_map = {
            "HKEY_LOCAL_MACHINE": winreg.HKEY_LOCAL_MACHINE,
            "HKEY_CURRENT_USER": winreg.HKEY_CURRENT_USER,
        }

        root_key = root_key_map.get(root_key_str, winreg.HKEY_CURRENT_USER)
        sub_key = params["subKey"]
        operation = params.get("operation", "manual_backup")
        module = params.get("module", "user")

        metadata = backup_registry_key(root_key, sub_key, operation, module)

        return {
            "id": metadata.id,
            "backupType": metadata.backup_type.value,
            "originalPath": metadata.original_path,
            "backupPath": metadata.backup_path,
            "timestamp": metadata.timestamp,
            "operation": metadata.operation,
            "module": metadata.module,
            "size": metadata.size,
            "details": metadata.details,
        }
    except Exception as e:
        logger.error(f"Failed to backup registry key: {e}")
        raise


@register("undo.backup.restorePoint")
def undo_backup_restore_point(params: dict[str, Any] | None) -> dict[str, Any]:
    """Create a Windows System Restore Point."""
    try:
        if not params or "description" not in params:
            raise ValueError("Missing required parameter: description")

        description = params["description"]

        metadata = create_system_restore_point(description)

        return {
            "id": metadata.id,
            "backupType": metadata.backup_type.value,
            "timestamp": metadata.timestamp,
            "operation": metadata.operation,
            "module": metadata.module,
            "details": metadata.details,
        }
    except Exception as e:
        logger.error(f"Failed to create system restore point: {e}")
        raise


@register("undo.restore")
def undo_restore(params: dict[str, Any] | None) -> dict[str, Any]:
    """Restore from a backup."""
    try:
        if not params or "id" not in params:
            raise ValueError("Missing required parameter: id")

        backup_id = params["id"]
        result = restore_backup(backup_id)

        return {
            "status": result.status.value,
            "backupId": result.backup_id,
            "message": result.message,
            "restoredPath": result.restored_path,
            "errors": result.errors,
        }
    except Exception as e:
        logger.error(f"Failed to restore backup: {e}")
        raise


@register("undo.check")
def undo_check(params: dict[str, Any] | None) -> dict[str, Any]:
    """Check if a backup can be restored."""
    try:
        if not params or "id" not in params:
            raise ValueError("Missing required parameter: id")

        backup_id = params["id"]
        status = check_restore_availability(backup_id)

        return {
            "status": status.value,
            "backupId": backup_id,
        }
    except Exception as e:
        logger.error(f"Failed to check restore availability: {e}")
        raise


@register("undo.list")
def undo_list(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get all available backups."""
    try:
        backups = get_all_backups()

        return {
            "backups": [
                {
                    "id": backup.id,
                    "backupType": backup.backup_type.value,
                    "originalPath": backup.original_path,
                    "backupPath": backup.backup_path,
                    "timestamp": backup.timestamp,
                    "operation": backup.operation,
                    "module": backup.module,
                    "size": backup.size,
                    "details": backup.details,
                }
                for backup in backups
            ],
            "count": len(backups),
        }
    except Exception as e:
        logger.error(f"Failed to get backups: {e}")
        raise


@register("undo.delete")
def undo_delete(params: dict[str, Any] | None) -> dict[str, Any]:
    """Delete a backup."""
    try:
        if not params or "id" not in params:
            raise ValueError("Missing required parameter: id")

        backup_id = params["id"]
        success = delete_backup(backup_id)

        return {"success": success}
    except Exception as e:
        logger.error(f"Failed to delete backup: {e}")
        raise


# Import IS_WINDOWS at module level
import platform
IS_WINDOWS = platform.system() == "Windows"
