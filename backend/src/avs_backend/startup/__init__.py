"""Startup Manager - Manage Windows startup applications.

Optimized with caching and parallel scanning for performance.
"""

from __future__ import annotations

import logging
from typing import Any
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

from avs_backend.api.registry import register
from avs_backend.startup.startup_manager import (
    scan_startup_entries,
    disable_startup_entry,
    enable_startup_entry,
    get_backups,
    StartupEntry,
    StartupSource,
    StartupStatus,
    StartupImpact,
)

logger = logging.getLogger(__name__)

import time

# Cache for startup entries to avoid rescanning
_startup_cache: list[dict[str, Any]] | None = None
_cache_lock = threading.Lock()
_cache_timestamp: float = 0
CACHE_TTL_SECONDS = 60  # Cache for 60 seconds


def _is_cache_valid() -> bool:
    """Check if the cache is still valid."""
    with _cache_lock:
        return _startup_cache is not None and (time.time() - _cache_timestamp) < CACHE_TTL_SECONDS


def _refresh_cache() -> list[dict[str, Any]]:
    """Refresh the startup entries cache."""
    global _startup_cache, _cache_timestamp
    
    with _cache_lock:
        entries = scan_startup_entries()
        _startup_cache = [
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
        _cache_timestamp = time.time()
        return _startup_cache


@register("startup.list")
def startup_list(_params: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Scan and list all startup applications (with caching)."""
    try:
        if _is_cache_valid():
            with _cache_lock:
                if _startup_cache is not None:
                    logger.debug("Returning cached startup entries")
                    return _startup_cache
        
        logger.debug("Refreshing startup entries cache")
        return _refresh_cache()
    except Exception as e:
        logger.error(f"Failed to list startup entries: {e}")
        raise


@register("startup.refreshCache")
def startup_refresh_cache(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Force refresh the startup entries cache."""
    try:
        entries = _refresh_cache()
        return {"success": True, "count": len(entries)}
    except Exception as e:
        logger.error(f"Failed to refresh startup cache: {e}")
        raise


def _to_startup_entry(entry_data: dict[str, Any]) -> StartupEntry:
    """Construct StartupEntry from dict, converting string fields to enums."""
    def _to_enum(enum_cls: type, value: str):
        if isinstance(value, enum_cls):
            return value
        try:
            return enum_cls(value)
        except ValueError:
            return enum_cls(list(enum_cls)[0])

    return StartupEntry(
        name=entry_data["name"],
        publisher=entry_data.get("publisher", ""),
        status=_to_enum(StartupStatus, entry_data.get("status", "enabled")),
        impact=_to_enum(StartupImpact, entry_data.get("impact", "unknown")),
        source=_to_enum(StartupSource, entry_data.get("source", "registry_run")),
        location=entry_data.get("location", ""),
        command=entry_data.get("command", ""),
        enabled=entry_data.get("enabled", True),
    )


@register("startup.disable")
def startup_disable(params: dict[str, Any] | None) -> dict[str, Any]:
    """Disable a startup entry."""
    if not params or "entry" not in params:
        raise ValueError("Missing 'entry' parameter")

    try:
        entry_data = params["entry"]
        entry = _to_startup_entry(entry_data)

        result = disable_startup_entry(entry)
        
        # Invalidate cache after modification
        global _startup_cache, _cache_timestamp
        with _cache_lock:
            _startup_cache = None
            _cache_timestamp = 0
        
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
        entry = _to_startup_entry(entry_data)

        success = enable_startup_entry(entry)
        
        # Invalidate cache after modification
        global _startup_cache, _cache_timestamp
        with _cache_lock:
            _startup_cache = None
            _cache_timestamp = 0
        
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
