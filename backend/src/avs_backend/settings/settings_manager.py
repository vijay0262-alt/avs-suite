"""Settings Manager - Application configuration and preferences.

Supports:
- Automatic updates
- Startup with Windows
- Scan exclusions
- Theme
- Language-ready architecture
- Default optimization options
- Logging level
- Notification preferences
- Reset to defaults
"""

from __future__ import annotations

import json
import logging
import os
import platform
from dataclasses import dataclass, field, asdict
from enum import Enum
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Windows-specific imports
IS_WINDOWS = platform.system() == "Windows"


class Theme(str, Enum):
    """Application themes."""

    LIGHT = "light"
    DARK = "dark"
    SYSTEM = "system"


class LogLevel(str, Enum):
    """Logging levels."""

    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


class NotificationPriority(str, Enum):
    """Notification priority levels."""

    ALL = "all"
    NORMAL_AND_HIGH = "normal_and_high"
    HIGH_ONLY = "high_only"
    NONE = "none"


@dataclass(slots=True)
class Settings:
    """Application settings."""

    # General
    auto_updates: bool = True
    startup_with_windows: bool = False
    language: str = "en"

    # Appearance
    theme: Theme = Theme.SYSTEM

    # Optimization
    auto_optimize_on_startup: bool = False
    default_optimization_options: dict[str, Any] = field(default_factory=lambda: {
        "cleanJunk": True,
        "optimizeMemory": True,
        "cleanPrivacy": False,
        "manageStartup": False,
    })

    # Scan exclusions
    scan_exclusions: list[str] = field(default_factory=list)

    # Logging
    logging_level: LogLevel = LogLevel.INFO
    enable_debug_logging: bool = False

    # Notifications
    notification_enabled: bool = True
    notification_priority: NotificationPriority = NotificationPriority.NORMAL_AND_HIGH
    notification_sound: bool = True

    # Advanced
    create_restore_points: bool = True
    backup_before_changes: bool = True
    max_history_entries: int = 1000


# Settings file path
SETTINGS_DIR = Path.home() / ".avs"
SETTINGS_FILE = SETTINGS_DIR / "settings.json"


def load_settings() -> Settings:
    """Load settings from file.

    Returns:
        Settings object with loaded or default values
    """
    SETTINGS_DIR.mkdir(parents=True, exist_ok=True)

    if not SETTINGS_FILE.exists():
        logger.info("Settings file not found, using defaults")
        return Settings()

    try:
        with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)

        # Convert enum strings back to enums
        if "theme" in data:
            data["theme"] = Theme(data["theme"])
        if "loggingLevel" in data:
            data["loggingLevel"] = LogLevel(data["loggingLevel"])
        if "notificationPriority" in data:
            data["notificationPriority"] = NotificationPriority(data["notificationPriority"])

        return Settings(**data)
    except Exception as e:
        logger.error(f"Failed to load settings: {e}")
        return Settings()


def save_settings(settings: Settings) -> bool:
    """Save settings to file.

    Args:
        settings: Settings object to save

    Returns:
        True if successful, False otherwise
    """
    SETTINGS_DIR.mkdir(parents=True, exist_ok=True)

    try:
        # Convert to dict and handle enums
        data = asdict(settings)
        data["theme"] = settings.theme.value
        data["loggingLevel"] = settings.logging_level.value
        data["notificationPriority"] = settings.notification_priority.value

        with open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)

        logger.info("Settings saved successfully")
        return True
    except Exception as e:
        logger.error(f"Failed to save settings: {e}")
        return False


def reset_to_defaults() -> Settings:
    """Reset settings to default values.

    Returns:
        Settings object with default values
    """
    logger.info("Resetting settings to defaults")
    return Settings()


def set_startup_with_windows(enabled: bool) -> bool:
    """Enable or disable startup with Windows.

    Args:
        enabled: Whether to enable startup with Windows

    Returns:
        True if successful, False otherwise
    """
    if not IS_WINDOWS:
        logger.warning("Startup with Windows only available on Windows")
        return False

    try:
        import winreg

        key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
        app_name = "AVS PC Optimizer"

        # Get the application path (this would need to be set properly)
        app_path = os.path.abspath(__file__)

        if enabled:
            # Add to startup
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE) as key:
                winreg.SetValueEx(key, app_name, 0, winreg.REG_SZ, app_path)
            logger.info("Added to Windows startup")
        else:
            # Remove from startup
            try:
                with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE) as key:
                    winreg.DeleteValue(key, app_name)
                logger.info("Removed from Windows startup")
            except FileNotFoundError:
                # Already not in startup
                pass

        return True
    except Exception as e:
        logger.error(f"Failed to set startup with Windows: {e}")
        return False


def is_startup_with_windows() -> bool:
    """Check if application is set to start with Windows.

    Returns:
        True if in startup, False otherwise
    """
    if not IS_WINDOWS:
        return False

    try:
        import winreg

        key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
        app_name = "AVS PC Optimizer"

        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_READ) as key:
            try:
                winreg.QueryValueEx(key, app_name)
                return True
            except FileNotFoundError:
                return False
    except Exception as e:
        logger.error(f"Failed to check startup status: {e}")
        return False


def add_scan_exclusion(path: str) -> bool:
    """Add a path to scan exclusions.

    Args:
        path: Path to exclude

    Returns:
        True if successful, False otherwise
    """
    settings = load_settings()

    if path not in settings.scan_exclusions:
        settings.scan_exclusions.append(path)
        return save_settings(settings)

    return True


def remove_scan_exclusion(path: str) -> bool:
    """Remove a path from scan exclusions.

    Args:
        path: Path to remove from exclusions

    Returns:
        True if successful, False otherwise
    """
    settings = load_settings()

    if path in settings.scan_exclusions:
        settings.scan_exclusions.remove(path)
        return save_settings(settings)

    return False


def get_available_languages() -> list[dict[str, str]]:
    """Get available languages.

    Returns:
        List of language dictionaries with code and name
    """
    return [
        {"code": "en", "name": "English"},
        {"code": "es", "name": "Español"},
        {"code": "fr", "name": "Français"},
        {"code": "de", "name": "Deutsch"},
        {"code": "zh", "name": "中文"},
        {"code": "ja", "name": "日本語"},
        {"code": "ko", "name": "한국어"},
        {"code": "pt", "name": "Português"},
        {"code": "ru", "name": "Русский"},
    ]


def validate_settings(settings: Settings) -> list[str]:
    """Validate settings values.

    Args:
        settings: Settings object to validate

    Returns:
        List of validation errors (empty if valid)
    """
    errors = []

    if settings.max_history_entries < 0:
        errors.append("max_history_entries must be non-negative")

    if settings.max_history_entries > 10000:
        errors.append("max_history_entries must not exceed 10000")

    if settings.language not in [lang["code"] for lang in get_available_languages()]:
        errors.append(f"Invalid language code: {settings.language}")

    return errors
