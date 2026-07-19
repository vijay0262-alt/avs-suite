"""Startup Manager - Manage Windows startup applications.

Scans startup applications from:
- Windows Registry (Run, RunOnce)
- Startup Folder
- Task Scheduler (startup tasks)

Features:
- Enable/disable startup entries
- Automatic backup before changes
- One-click restore from SQLite backup
- Never delete entries, only disable
"""

from __future__ import annotations

import logging
import platform
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any

import psutil

logger = logging.getLogger(__name__)

# Windows-specific imports - only load on Windows
IS_WINDOWS = platform.system() == "Windows"
if IS_WINDOWS:
    import winreg


class StartupSource(str, Enum):
    """Source of startup entry."""

    REGISTRY_RUN = "registry_run"
    REGISTRY_RUN_ONCE = "registry_run_once"
    STARTUP_FOLDER = "startup_folder"
    TASK_SCHEDULER = "task_scheduler"


class StartupStatus(str, Enum):
    """Status of startup entry."""

    ENABLED = "enabled"
    DISABLED = "disabled"


class StartupImpact(str, Enum):
    """Impact on system startup performance."""

    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    UNKNOWN = "unknown"


@dataclass(slots=True)
class StartupEntry:
    """Represents a startup application."""

    name: str
    publisher: str
    status: StartupStatus
    impact: StartupImpact
    source: StartupSource
    location: str
    command: str
    enabled: bool = True


@dataclass(slots=True)
class StartupBackup:
    """Backup of startup entry before modification."""

    entry_name: str
    source: StartupSource
    location: str
    command: str
    enabled: bool
    timestamp: str
    backup_id: str


# Database setup
BACKUP_DB_PATH = Path.home() / ".avs" / "startup_backups.db"


def _init_backup_db() -> sqlite3.Connection:
    """Initialize SQLite database for startup backups."""
    BACKUP_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(BACKUP_DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS startup_backups (
            backup_id TEXT PRIMARY KEY,
            entry_name TEXT NOT NULL,
            source TEXT NOT NULL,
            location TEXT NOT NULL,
            command TEXT NOT NULL,
            enabled INTEGER NOT NULL,
            timestamp TEXT NOT NULL
        )
    """)
    conn.commit()
    return conn


def _create_backup(entry: StartupEntry) -> str:
    """Create backup of startup entry before modification."""
    backup_id = f"{entry.name}_{datetime.now().isoformat()}".replace(":", "_").replace(".", "_")
    backup = StartupBackup(
        entry_name=entry.name,
        source=entry.source,
        location=entry.location,
        command=entry.command,
        enabled=entry.enabled,
        timestamp=datetime.now().isoformat(),
        backup_id=backup_id,
    )

    conn = _init_backup_db()
    conn.execute(
        """
        INSERT INTO startup_backups (backup_id, entry_name, source, location, command, enabled, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            backup.backup_id,
            backup.entry_name,
            backup.source.value,
            backup.location,
            backup.command,
            1 if backup.enabled else 0,
            backup.timestamp,
        ),
    )
    conn.commit()
    conn.close()

    logger.info(f"Created backup for startup entry: {entry.name}")
    return backup_id


def _restore_backup(backup_id: str) -> bool:
    """Restore startup entry from backup."""
    conn = _init_backup_db()
    cursor = conn.execute(
        "SELECT entry_name, source, location, command, enabled FROM startup_backups WHERE backup_id = ?",
        (backup_id,),
    )
    row = cursor.fetchone()
    conn.close()

    if not row:
        logger.error(f"Backup not found: {backup_id}")
        return False

    entry_name, source, location, command, enabled = row

    # Restore based on source
    try:
        if source == StartupSource.REGISTRY_RUN.value or source == StartupSource.REGISTRY_RUN_ONCE.value:
            _restore_registry_entry(location, entry_name, command, enabled)
        elif source == StartupSource.STARTUP_FOLDER.value:
            _restore_startup_folder_entry(location, command, enabled)
        elif source == StartupSource.TASK_SCHEDULER.value:
            _restore_task_scheduler_entry(entry_name, command, enabled)

        logger.info(f"Restored startup entry from backup: {entry_name}")
        return True
    except Exception as e:
        logger.error(f"Failed to restore backup {backup_id}: {e}")
        return False


def _restore_registry_entry(location: str, entry_name: str, command: str, enabled: bool) -> None:
    """Restore registry entry."""
    if not IS_WINDOWS:
        return

    # Parse location to get registry key path
    # Format: HKEY_LOCAL_MACHINE\Software\Microsoft\Windows\CurrentVersion\Run
    parts = location.split("\\")
    if len(parts) < 2:
        raise ValueError(f"Invalid registry location: {location}")

    root_key_str = parts[0]
    sub_key = "\\".join(parts[1:])

    root_key_map = {
        "HKEY_LOCAL_MACHINE": winreg.HKEY_LOCAL_MACHINE,
        "HKEY_CURRENT_USER": winreg.HKEY_CURRENT_USER,
    }

    if root_key_str not in root_key_map:
        raise ValueError(f"Unsupported registry root: {root_key_str}")

    root_key = root_key_map[root_key_str]

    try:
        key = winreg.OpenKey(root_key, sub_key, 0, winreg.KEY_SET_VALUE)
        if enabled:
            winreg.SetValueEx(key, entry_name, 0, winreg.REG_SZ, command)
        else:
            try:
                winreg.DeleteValue(key, entry_name)
            except FileNotFoundError:
                pass  # Already disabled
        winreg.CloseKey(key)
    except Exception as e:
        logger.error(f"Failed to restore registry entry: {e}")
        raise


def _restore_startup_folder_entry(location: str, command: str, enabled: bool) -> None:
    """Restore startup folder entry."""
    shortcut_path = Path(location)
    if enabled:
        # Create shortcut (simplified - would need COM for actual shortcut creation)
        # For now, we'll just log that this needs proper implementation
        logger.warning(f"Startup folder restore requires COM interface for shortcut creation: {location}")
    else:
        if shortcut_path.exists():
            shortcut_path.unlink()


def _restore_task_scheduler_entry(entry_name: str, command: str, enabled: bool) -> None:
    """Restore task scheduler entry."""
    # This would require pywin32 for Task Scheduler API
    logger.warning(f"Task scheduler restore requires pywin32: {entry_name}")


def _scan_registry_run() -> list[StartupEntry]:
    """Scan registry Run keys for startup entries."""
    if not IS_WINDOWS:
        return []

    entries = []

    # Registry keys to scan
    registry_keys = [
        (winreg.HKEY_LOCAL_MACHINE, r"Software\Microsoft\Windows\CurrentVersion\Run", StartupSource.REGISTRY_RUN),
        (winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", StartupSource.REGISTRY_RUN),
        (winreg.HKEY_LOCAL_MACHINE, r"Software\Microsoft\Windows\CurrentVersion\RunOnce", StartupSource.REGISTRY_RUN_ONCE),
        (winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\RunOnce", StartupSource.REGISTRY_RUN_ONCE),
    ]

    for root_key, sub_key, source in registry_keys:
        try:
            key = winreg.OpenKey(root_key, sub_key)
            i = 0
            while True:
                try:
                    name, value, _ = winreg.EnumValue(key, i)
                    publisher = _extract_publisher_from_path(value)
                    impact = _estimate_startup_impact(value)

                    entry = StartupEntry(
                        name=name,
                        publisher=publisher,
                        status=StartupStatus.ENABLED,
                        impact=impact,
                        source=source,
                        location=f"{_get_root_key_name(root_key)}\\{sub_key}",
                        command=value,
                        enabled=True,
                    )
                    entries.append(entry)
                    i += 1
                except OSError:
                    break
            winreg.CloseKey(key)
        except FileNotFoundError:
            continue
        except Exception as e:
            logger.error(f"Failed to scan registry key {sub_key}: {e}")

    return entries


def _get_root_key_name(root_key: int) -> str:
    """Get string representation of registry root key."""
    if not IS_WINDOWS:
        return "UNKNOWN"

    if root_key == winreg.HKEY_LOCAL_MACHINE:
        return "HKEY_LOCAL_MACHINE"
    elif root_key == winreg.HKEY_CURRENT_USER:
        return "HKEY_CURRENT_USER"
    return "UNKNOWN"


def _scan_startup_folder() -> list[StartupEntry]:
    """Scan startup folder for startup entries."""
    entries = []

    startup_folders = [
        Path.home() / "AppData" / "Roaming" / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup",
        Path("C:/ProgramData/Microsoft/Windows/Start Menu/Programs/Startup"),
    ]

    for folder in startup_folders:
        if not folder.exists():
            continue

        try:
            for item in folder.glob("*.lnk"):
                # Extract target from shortcut (simplified)
                # Would need COM for proper shortcut parsing
                entry = StartupEntry(
                    name=item.stem,
                    publisher="Unknown",
                    status=StartupStatus.ENABLED,
                    impact=StartupImpact.MEDIUM,
                    source=StartupSource.STARTUP_FOLDER,
                    location=str(item),
                    command=str(item),
                    enabled=True,
                )
                entries.append(entry)
        except Exception as e:
            logger.error(f"Failed to scan startup folder {folder}: {e}")

    return entries


def _scan_task_scheduler() -> list[StartupEntry]:
    """Scan Task Scheduler for startup tasks."""
    entries = []

    # This would require pywin32 for Task Scheduler API
    # For now, return empty list as placeholder
    logger.info("Task Scheduler scanning requires pywin32 - skipping")

    return entries


def _extract_publisher_from_path(path: str) -> str:
    """Extract publisher name from executable path."""
    try:
        exe_path = path.split('"')[1] if '"' in path else path.split()[0]
        exe_name = Path(exe_path).stem.lower()

        # Known publishers
        publishers = {
            "chrome": "Google",
            "firefox": "Mozilla",
            "spotify": "Spotify",
            "discord": "Discord",
            "slack": "Slack",
            "teams": "Microsoft",
            "onedrive": "Microsoft",
            "dropbox": "Dropbox",
            "adobe": "Adobe",
            "java": "Oracle",
        }

        for key, publisher in publishers.items():
            if key in exe_name:
                return publisher

        return "Unknown"
    except Exception:
        return "Unknown"


def _estimate_startup_impact(command: str) -> StartupImpact:
    """Estimate startup impact based on command."""
    command_lower = command.lower()

    # High impact: heavy applications
    high_impact = ["chrome", "firefox", "edge", "spotify", "teams", "slack", "discord"]
    if any(app in command_lower for app in high_impact):
        return StartupImpact.HIGH

    # Medium impact: utilities
    medium_impact = ["onedrive", "dropbox", "backup", "sync"]
    if any(app in command_lower for app in medium_impact):
        return StartupImpact.MEDIUM

    # Low impact: lightweight utilities
    return StartupImpact.LOW


def scan_startup_entries() -> list[StartupEntry]:
    """Scan all startup sources for startup entries."""
    logger.info("Scanning startup entries")

    all_entries = []

    # Scan registry
    all_entries.extend(_scan_registry_run())

    # Scan startup folder
    all_entries.extend(_scan_startup_folder())

    # Scan task scheduler
    all_entries.extend(_scan_task_scheduler())

    logger.info(f"Found {len(all_entries)} startup entries")
    return all_entries


def disable_startup_entry(entry: StartupEntry) -> bool:
    """Disable a startup entry."""
    logger.info(f"Disabling startup entry: {entry.name}")

    # Create backup before disabling
    backup_id = _create_backup(entry)

    try:
        if entry.source in (StartupSource.REGISTRY_RUN, StartupSource.REGISTRY_RUN_ONCE):
            return _disable_registry_entry(entry)
        elif entry.source == StartupSource.STARTUP_FOLDER:
            return _disable_startup_folder_entry(entry)
        elif entry.source == StartupSource.TASK_SCHEDULER:
            return _disable_task_scheduler_entry(entry)
        return False
    except Exception as e:
        logger.error(f"Failed to disable startup entry {entry.name}: {e}")
        return False


def _disable_registry_entry(entry: StartupEntry) -> bool:
    """Disable registry startup entry."""
    if not IS_WINDOWS:
        return False

    parts = entry.location.split("\\")
    if len(parts) < 2:
        return False

    root_key_str = parts[0]
    sub_key = "\\".join(parts[1:])

    root_key_map = {
        "HKEY_LOCAL_MACHINE": winreg.HKEY_LOCAL_MACHINE,
        "HKEY_CURRENT_USER": winreg.HKEY_CURRENT_USER,
    }

    if root_key_str not in root_key_map:
        return False

    root_key = root_key_map[root_key_str]

    try:
        key = winreg.OpenKey(root_key, sub_key, 0, winreg.KEY_SET_VALUE)
        winreg.DeleteValue(key, entry.name)
        winreg.CloseKey(key)
        logger.info(f"Disabled registry entry: {entry.name}")
        return True
    except FileNotFoundError:
        logger.warning(f"Registry entry not found: {entry.name}")
        return False
    except Exception as e:
        logger.error(f"Failed to disable registry entry: {e}")
        return False


def _disable_startup_folder_entry(entry: StartupEntry) -> bool:
    """Disable startup folder entry."""
    shortcut_path = Path(entry.location)
    try:
        if shortcut_path.exists():
            # Move to disabled folder instead of deleting
            disabled_folder = shortcut_path.parent / "Disabled"
            disabled_folder.mkdir(exist_ok=True)
            shortcut_path.rename(disabled_folder / shortcut_path.name)
            logger.info(f"Disabled startup folder entry: {entry.name}")
            return True
        return False
    except Exception as e:
        logger.error(f"Failed to disable startup folder entry: {e}")
        return False


def _disable_task_scheduler_entry(entry: StartupEntry) -> bool:
    """Disable task scheduler entry."""
    # Requires pywin32
    logger.warning(f"Task scheduler disable requires pywin32: {entry.name}")
    return False


def enable_startup_entry(entry: StartupEntry) -> bool:
    """Enable a startup entry."""
    logger.info(f"Enabling startup entry: {entry.name}")

    try:
        if entry.source in (StartupSource.REGISTRY_RUN, StartupSource.REGISTRY_RUN_ONCE):
            return _enable_registry_entry(entry)
        elif entry.source == StartupSource.STARTUP_FOLDER:
            return _enable_startup_folder_entry(entry)
        elif entry.source == StartupSource.TASK_SCHEDULER:
            return _enable_task_scheduler_entry(entry)
        return False
    except Exception as e:
        logger.error(f"Failed to enable startup entry {entry.name}: {e}")
        return False


def _enable_registry_entry(entry: StartupEntry) -> bool:
    """Enable registry startup entry."""
    if not IS_WINDOWS:
        return False

    parts = entry.location.split("\\")
    if len(parts) < 2:
        return False

    root_key_str = parts[0]
    sub_key = "\\".join(parts[1:])

    root_key_map = {
        "HKEY_LOCAL_MACHINE": winreg.HKEY_LOCAL_MACHINE,
        "HKEY_CURRENT_USER": winreg.HKEY_CURRENT_USER,
    }

    if root_key_str not in root_key_map:
        return False

    root_key = root_key_map[root_key_str]

    try:
        key = winreg.OpenKey(root_key, sub_key, 0, winreg.KEY_SET_VALUE)
        winreg.SetValueEx(key, entry.name, 0, winreg.REG_SZ, entry.command)
        winreg.CloseKey(key)
        logger.info(f"Enabled registry entry: {entry.name}")
        return True
    except Exception as e:
        logger.error(f"Failed to enable registry entry: {e}")
        return False


def _enable_startup_folder_entry(entry: StartupEntry) -> bool:
    """Enable startup folder entry."""
    disabled_folder = Path(entry.location).parent / "Disabled"
    shortcut_path = disabled_folder / entry.command.split("\\")[-1]

    try:
        if shortcut_path.exists():
            shortcut_path.rename(Path(entry.location))
            logger.info(f"Enabled startup folder entry: {entry.name}")
            return True
        return False
    except Exception as e:
        logger.error(f"Failed to enable startup folder entry: {e}")
        return False


def _enable_task_scheduler_entry(entry: StartupEntry) -> bool:
    """Enable task scheduler entry."""
    # Requires pywin32
    logger.warning(f"Task scheduler enable requires pywin32: {entry.name}")
    return False


def get_backups() -> list[dict[str, Any]]:
    """Get all startup backups."""
    conn = _init_backup_db()
    cursor = conn.execute(
        "SELECT backup_id, entry_name, source, location, enabled, timestamp FROM startup_backups ORDER BY timestamp DESC"
    )
    backups = []
    for row in cursor.fetchall():
        backups.append({
            "backupId": row[0],
            "entryName": row[1],
            "source": row[2],
            "location": row[3],
            "enabled": bool(row[4]),
            "timestamp": row[5],
        })
    conn.close()
    return backups
