"""Startup Manager - Manage Windows startup applications."""

from __future__ import annotations

import logging
from typing import Any

from avs_backend.api.registry import register
from avs_backend.startup.startup_manager import (
    scan_startup_entries,
    disable_startup_entry,
    enable_startup_entry,
    get_backups,
    StartupEntry,
)

logger = logging.getLogger(__name__)


@register("startup.list")
def startup_list(_params: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Scan and list all startup applications."""
    try:
        entries = scan_startup_entries()
        return [
            {
                "name": entry.name,
                "publisher": entry.publisher,
                "status": entry.status.value,
                "impact": entry.impact.value,
                "source": entry.source.value,
                "location": entry.location,
                "command": entry.command,
                "enabled": entry.enabled,
            }
            for entry in entries
        ]
    except Exception as e:
        logger.error(f"Failed to list startup entries: {e}")
        raise


@register("startup.disable")
def startup_disable(params: dict[str, Any] | None) -> dict[str, Any]:
    """Disable a startup entry."""
    if not params or "entry" not in params:
        raise ValueError("Missing 'entry' parameter")

    try:
        entry_data = params["entry"]
        entry = StartupEntry(
            name=entry_data["name"],
            publisher=entry_data["publisher"],
            status=entry_data["status"],
            impact=entry_data["impact"],
            source=entry_data["source"],
            location=entry_data["location"],
            command=entry_data["command"],
            enabled=entry_data["enabled"],
        )

        result = disable_startup_entry(entry)
        return result
    except Exception as e:
        logger.error(f"Failed to disable startup entry: {e}")
        raise


@register("startup.enable")
def startup_enable(params: dict[str, Any] | None) -> dict[str, Any]:
    """Enable a startup entry."""
    if not params or "entry" not in params:
        raise ValueError("Missing 'entry' parameter")

    try:
        entry_data = params["entry"]
        entry = StartupEntry(
            name=entry_data["name"],
            publisher=entry_data["publisher"],
            status=entry_data["status"],
            impact=entry_data["impact"],
            source=entry_data["source"],
            location=entry_data["location"],
            command=entry_data["command"],
            enabled=entry_data["enabled"],
        )

        success = enable_startup_entry(entry)
        return {"success": success}
    except Exception as e:
        logger.error(f"Failed to enable startup entry: {e}")
        raise


@register("startup.backups")
def startup_backups(_params: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Get all startup backups."""
    try:
        return get_backups()
    except Exception as e:
        logger.error(f"Failed to get startup backups: {e}")
        raise


@register("startup.restore")
def startup_restore(params: dict[str, Any] | None) -> dict[str, Any]:
    """Restore a startup entry from backup."""
    if not params or "backupId" not in params:
        raise ValueError("Missing 'backupId' parameter")

    try:
        from avs_backend.startup.startup_manager import _restore_backup

        backup_id = params["backupId"]
        success = _restore_backup(backup_id)
        return {"success": success}
    except Exception as e:
        logger.error(f"Failed to restore startup backup: {e}")
        raise
