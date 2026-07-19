"""Persisted settings (JSON on disk)."""

from __future__ import annotations

import logging
from typing import Any

from avs_backend.api.registry import register
from avs_backend.settings.settings_manager import (
    Settings,
    Theme,
    LogLevel,
    NotificationPriority,
    load_settings,
    save_settings,
    reset_to_defaults,
    set_startup_with_windows,
    is_startup_with_windows,
    add_scan_exclusion,
    remove_scan_exclusion,
    get_available_languages,
    validate_settings,
)

logger = logging.getLogger(__name__)


@register("settings.get")
def settings_get(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get current settings."""
    try:
        settings = load_settings()

        return {
            "autoUpdates": settings.auto_updates,
            "startupWithWindows": settings.startup_with_windows,
            "language": settings.language,
            "theme": settings.theme.value,
            "autoOptimizeOnStartup": settings.auto_optimize_on_startup,
            "defaultOptimizationOptions": settings.default_optimization_options,
            "scanExclusions": settings.scan_exclusions,
            "loggingLevel": settings.logging_level.value,
            "enableDebugLogging": settings.enable_debug_logging,
            "notificationEnabled": settings.notification_enabled,
            "notificationPriority": settings.notification_priority.value,
            "notificationSound": settings.notification_sound,
            "createRestorePoints": settings.create_restore_points,
            "backupBeforeChanges": settings.backup_before_changes,
            "maxHistoryEntries": settings.max_history_entries,
        }
    except Exception as e:
        logger.error(f"Failed to get settings: {e}")
        raise


@register("settings.update")
def settings_update(params: dict[str, Any] | None) -> dict[str, Any]:
    """Update settings."""
    try:
        if not params:
            raise ValueError("Missing required parameters")

        settings = load_settings()

        if "autoUpdates" in params:
            settings.auto_updates = params["autoUpdates"]
        if "startupWithWindows" in params:
            settings.startup_with_windows = params["startupWithWindows"]
            # Also update Windows registry
            set_startup_with_windows(params["startupWithWindows"])
        if "language" in params:
            settings.language = params["language"]
        if "theme" in params:
            settings.theme = Theme(params["theme"])
        if "autoOptimizeOnStartup" in params:
            settings.auto_optimize_on_startup = params["autoOptimizeOnStartup"]
        if "defaultOptimizationOptions" in params:
            settings.default_optimization_options = params["defaultOptimizationOptions"]
        if "scanExclusions" in params:
            settings.scan_exclusions = params["scanExclusions"]
        if "loggingLevel" in params:
            settings.logging_level = LogLevel(params["loggingLevel"])
        if "enableDebugLogging" in params:
            settings.enable_debug_logging = params["enableDebugLogging"]
        if "notificationEnabled" in params:
            settings.notification_enabled = params["notificationEnabled"]
        if "notificationPriority" in params:
            settings.notification_priority = NotificationPriority(params["notificationPriority"])
        if "notificationSound" in params:
            settings.notification_sound = params["notificationSound"]
        if "createRestorePoints" in params:
            settings.create_restore_points = params["createRestorePoints"]
        if "backupBeforeChanges" in params:
            settings.backup_before_changes = params["backupBeforeChanges"]
        if "maxHistoryEntries" in params:
            settings.max_history_entries = params["maxHistoryEntries"]

        # Validate settings
        errors = validate_settings(settings)
        if errors:
            return {"success": False, "errors": errors}

        success = save_settings(settings)

        return {"success": success}
    except Exception as e:
        logger.error(f"Failed to update settings: {e}")
        raise


@register("settings.reset")
def settings_reset(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Reset settings to defaults."""
    try:
        settings = reset_to_defaults()
        success = save_settings(settings)

        return {"success": success}
    except Exception as e:
        logger.error(f"Failed to reset settings: {e}")
        raise


@register("settings.addExclusion")
def settings_add_exclusion(params: dict[str, Any] | None) -> dict[str, Any]:
    """Add a path to scan exclusions."""
    try:
        if not params or "path" not in params:
            raise ValueError("Missing required parameter: path")

        path = params["path"]
        success = add_scan_exclusion(path)

        return {"success": success}
    except Exception as e:
        logger.error(f"Failed to add scan exclusion: {e}")
        raise


@register("settings.removeExclusion")
def settings_remove_exclusion(params: dict[str, Any] | None) -> dict[str, Any]:
    """Remove a path from scan exclusions."""
    try:
        if not params or "path" not in params:
            raise ValueError("Missing required parameter: path")

        path = params["path"]
        success = remove_scan_exclusion(path)

        return {"success": success}
    except Exception as e:
        logger.error(f"Failed to remove scan exclusion: {e}")
        raise


@register("settings.languages")
def settings_languages(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get available languages."""
    try:
        languages = get_available_languages()

        return {"languages": languages}
    except Exception as e:
        logger.error(f"Failed to get available languages: {e}")
        raise
