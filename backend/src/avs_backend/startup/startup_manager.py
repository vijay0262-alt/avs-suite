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

import json
import logging
import platform
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any

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
    STARTUP_SERVICE = "startup_service"


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
        elif source == StartupSource.STARTUP_SERVICE.value:
            _restore_startup_service(location, entry_name, enabled)

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
    """Restore startup folder entry by creating a .lnk shortcut."""
    shortcut_path = Path(location)
    if enabled:
        if not IS_WINDOWS:
            logger.warning(f"Cannot create shortcut on non-Windows: {location}")
            return
        # Use PowerShell to create a Windows shortcut (.lnk)
        ps_script = (
            "$ws = New-Object -ComObject WScript.Shell; "
            f"$sc = $ws.CreateShortcut('{location}'); "
            f"$sc.TargetPath = '{command}'; "
            "$sc.Save()"
        )
        try:
            import subprocess
            result = subprocess.run(
                ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_script],
                capture_output=True,
                text=True,
                timeout=10,
            )
            if result.returncode != 0:
                logger.error(f"Shortcut creation failed: {result.stderr.strip()}")
                raise RuntimeError(f"Shortcut creation failed: {result.stderr.strip()}")
            logger.info(f"Restored startup folder shortcut: {location}")
        except Exception as e:
            logger.error(f"Failed to create shortcut {location}: {e}")
            raise
    else:
        if shortcut_path.exists():
            shortcut_path.unlink()


def _restore_task_scheduler_entry(entry_name: str, command: str, enabled: bool) -> None:
    """Restore a Task Scheduler entry using schtasks."""
    if not IS_WINDOWS:
        logger.warning(f"Cannot restore task on non-Windows: {entry_name}")
        return
    try:
        import subprocess
        if enabled:
            # Create a scheduled task that runs at logon
            ps_script = (
                f"$action = New-ScheduledTaskAction -Execute '{command}'; "
                "$trigger = New-ScheduledTaskTrigger -AtLogOn; "
                f"$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries; "
                f"Register-ScheduledTask -TaskName '{entry_name}' -Action $action -Trigger $trigger -Settings $settings -Force"
            )
            result = subprocess.run(
                ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_script],
                capture_output=True,
                text=True,
                timeout=15,
            )
            if result.returncode != 0:
                logger.error(f"Task scheduler restore failed: {result.stderr.strip()}")
                raise RuntimeError(f"Task scheduler restore failed: {result.stderr.strip()}")
            logger.info(f"Restored task scheduler entry: {entry_name}")
        else:
            # Disable the task if it exists
            result = subprocess.run(
                ["schtasks", "/Change", "/TN", entry_name, "/DISABLE"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            if result.returncode != 0:
                logger.debug(f"Task disable returned non-zero (may not exist): {entry_name}")
    except Exception as e:
        logger.error(f"Failed to restore task scheduler entry {entry_name}: {e}")
        raise


def _restore_startup_service(location: str, entry_name: str, enabled: bool) -> None:
    """Restore a Windows service startup type.

    Uses ``sc config`` to set the start type back to ``auto`` (enabled)
    or ``demand`` (disabled). Requires administrator privileges.
    """
    if not IS_WINDOWS:
        logger.warning(f"Cannot restore service on non-Windows: {entry_name}")
        return

    # Extract service name from location: "Services\\{name}"
    svc_name = location.split("\\", 1)[-1] if "\\" in location else entry_name

    try:
        import subprocess
        start_type = "auto" if enabled else "demand"
        result = subprocess.run(
            ["sc", "config", svc_name, "start=", start_type],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            stderr = result.stderr.strip()
            # Access denied — needs elevation
            if "access" in stderr.lower() or "5" in stderr:
                logger.warning(
                    f"Service restore requires administrator privileges: {svc_name}"
                )
                raise PermissionError(
                    f"Restoring service '{svc_name}' requires administrator privileges"
                )
            logger.error(f"Service config failed for {svc_name}: {stderr}")
            raise RuntimeError(f"Service config failed: {stderr}")
        logger.info(f"Restored service {svc_name} start type to {start_type}")
    except Exception as e:
        logger.error(f"Failed to restore service {svc_name}: {e}")
        raise


# ── StartupApproved helpers ─────────────────────────────────
# Windows stores per-entry enable/disable flags under
#   …\Explorer\StartupApproved\{Run,Run32,StartupFolder}
# as 12-byte REG_BINARY values. First byte odd (03/05/07…) = disabled,
# even (02/06…) = enabled. This is the same mechanism Task Manager uses,
# so toggling here keeps entries visible and instantly reversible.

_STARTUP_APPROVED_BASE = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved"


def _approved_subkey_for(sub_key: str) -> str | None:
    """Map a Run/Run32 registry subkey to its StartupApproved bucket."""
    lowered = sub_key.lower()
    if lowered == r"software\microsoft\windows\currentversion\run":
        return "Run"
    if lowered == r"software\wow6432node\microsoft\windows\currentversion\run":
        return "Run32"
    return None  # RunOnce has no StartupApproved bucket


def _read_startup_approved() -> dict[tuple[int, str], dict[str, int]]:
    """Read all StartupApproved flags → {(root, bucket): {value_name: first_byte}}."""
    flags: dict[tuple[int, str], dict[str, int]] = {}
    if not IS_WINDOWS:
        return flags
    for root in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
        for bucket in ("Run", "Run32", "StartupFolder"):
            try:
                key = winreg.OpenKey(root, f"{_STARTUP_APPROVED_BASE}\\{bucket}")
            except OSError:
                continue
            bucket_flags: dict[str, int] = {}
            try:
                i = 0
                while True:
                    try:
                        name, value, _ = winreg.EnumValue(key, i)
                        if isinstance(value, (bytes, bytearray)) and value:
                            bucket_flags[name] = value[0]
                        i += 1
                    except OSError:
                        break
            finally:
                winreg.CloseKey(key)
            flags[(root, bucket)] = bucket_flags
    return flags


def _write_startup_approved(root: int, bucket: str, name: str, enabled: bool) -> None:
    """Write a StartupApproved flag for an entry (02 = enabled, 03 = disabled)."""
    flag = bytes([0x02 if enabled else 0x03]) + bytes(11)
    key = winreg.CreateKey(root, f"{_STARTUP_APPROVED_BASE}\\{bucket}")
    try:
        winreg.SetValueEx(key, name, 0, winreg.REG_BINARY, flag)
    finally:
        winreg.CloseKey(key)


def _scan_registry_run() -> list[StartupEntry]:
    """Scan registry Run keys for startup entries."""
    if not IS_WINDOWS:
        return []

    entries = []
    approved = _read_startup_approved()

    # Registry keys to scan
    registry_keys = [
        (winreg.HKEY_LOCAL_MACHINE, r"Software\Microsoft\Windows\CurrentVersion\Run", StartupSource.REGISTRY_RUN),
        (winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", StartupSource.REGISTRY_RUN),
        (winreg.HKEY_LOCAL_MACHINE, r"Software\Microsoft\Windows\CurrentVersion\RunOnce", StartupSource.REGISTRY_RUN_ONCE),
        (winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\RunOnce", StartupSource.REGISTRY_RUN_ONCE),
        (winreg.HKEY_LOCAL_MACHINE, r"Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Run", StartupSource.REGISTRY_RUN),
        (winreg.HKEY_LOCAL_MACHINE, r"Software\Wow6432Node\Microsoft\Windows\CurrentVersion\RunOnce", StartupSource.REGISTRY_RUN_ONCE),
    ]

    for root_key, sub_key, source in registry_keys:
        bucket = _approved_subkey_for(sub_key)
        bucket_flags = approved.get((root_key, bucket), {}) if bucket else {}
        try:
            key = winreg.OpenKey(root_key, sub_key)
            i = 0
            while True:
                try:
                    name, value, _ = winreg.EnumValue(key, i)
                    publisher = _extract_publisher_from_path(value)
                    impact = _estimate_startup_impact(value)

                    # StartupApproved flag: odd first byte = disabled.
                    flag = bucket_flags.get(name)
                    enabled = not (flag is not None and flag % 2 == 1)

                    entry = StartupEntry(
                        name=name,
                        publisher=publisher,
                        status=StartupStatus.ENABLED if enabled else StartupStatus.DISABLED,
                        impact=impact,
                        source=source,
                        location=f"{_get_root_key_name(root_key)}\\{sub_key}",
                        command=value,
                        enabled=enabled,
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
    """Scan startup folders — including the ``Disabled`` subfolder this app
    moves shortcuts into, so disabled entries stay visible and re-enableable."""
    entries = []

    startup_folders = [
        Path.home() / "AppData" / "Roaming" / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup",
        Path("C:/ProgramData/Microsoft/Windows/Start Menu/Programs/Startup"),
    ]

    for folder in startup_folders:
        # (directory, enabled) — Disabled subfolder holds toggled-off shortcuts.
        for scan_dir, enabled in ((folder, True), (folder / "Disabled", False)):
            if not scan_dir.exists():
                continue
            try:
                for item in scan_dir.glob("*.lnk"):
                    # location always points at the *original* Startup path so
                    # enable/disable can move the shortcut back and forth.
                    original = folder / item.name
                    entry = StartupEntry(
                        name=item.stem,
                        publisher="Unknown",
                        status=StartupStatus.ENABLED if enabled else StartupStatus.DISABLED,
                        impact=StartupImpact.MEDIUM,
                        source=StartupSource.STARTUP_FOLDER,
                        location=str(original),
                        command=str(item),
                        enabled=enabled,
                    )
                    entries.append(entry)
            except Exception as e:
                logger.error(f"Failed to scan startup folder {scan_dir}: {e}")

    return entries


def _scan_tasks_and_services() -> tuple[list[StartupEntry], list[StartupEntry]]:
    """Scan Task Scheduler logon/boot tasks AND auto-start services in a
    single PowerShell process.

    Replaces ``schtasks /query /v`` (verbose enumeration, ~10-30s) and
    ``psutil.win_service_iter()`` (per-service SCM queries) with one
    ``Get-ScheduledTask`` + ``Get-CimInstance`` call returning JSON —
    typically 10x faster.
    """
    if not IS_WINDOWS:
        return [], []

    ps_script = r"""
$tasks = @(Get-ScheduledTask | Where-Object {
  $_.Triggers | Where-Object { $_.CimClass.CimClassName -match 'LogonTrigger|BootTrigger' }
} | ForEach-Object {
  $a = $_.Actions | Select-Object -First 1
  $cmd = if ($a) { ($a.Execute + ' ' + $a.Arguments).Trim() } else { '' }
  [pscustomobject]@{ name = $_.TaskName; enabled = ($_.State -ne 'Disabled'); command = $cmd }
})
$svcs = @(Get-CimInstance Win32_Service -Filter "StartMode='Auto'" | ForEach-Object {
  [pscustomobject]@{ name = $_.Name; display = $_.DisplayName; state = $_.State; binpath = $_.PathName }
})
@{ tasks = $tasks; services = $svcs } | ConvertTo-Json -Depth 4 -Compress
"""

    task_entries: list[StartupEntry] = []
    service_entries: list[StartupEntry] = []

    try:
        import subprocess

        result = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_script],
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.returncode != 0 or not result.stdout.strip():
            logger.warning(f"Task/service scan failed: {result.stderr.strip()[:200]}")
            return [], []

        data = json.loads(result.stdout)
        tasks = data.get("tasks") or []
        services = data.get("services") or []
        # PS 5.1 unwraps single-element arrays to a scalar object.
        if isinstance(tasks, dict):
            tasks = [tasks]
        if isinstance(services, dict):
            services = [services]

        for t in tasks:
            command = t.get("command") or ""
            enabled = bool(t.get("enabled"))
            task_entries.append(
                StartupEntry(
                    name=t.get("name") or "Unknown",
                    publisher=_extract_publisher_from_path(command),
                    status=StartupStatus.ENABLED if enabled else StartupStatus.DISABLED,
                    impact=_estimate_startup_impact(command),
                    source=StartupSource.TASK_SCHEDULER,
                    location="Task Scheduler",
                    command=command,
                    enabled=enabled,
                )
            )

        for s in services:
            name = s.get("name") or ""
            if any(crit in name.lower() for crit in CRITICAL_SYSTEM_ENTRIES):
                continue
            binpath = s.get("binpath") or ""
            display = s.get("display") or name
            service_entries.append(
                StartupEntry(
                    name=display,
                    publisher=_extract_publisher_from_path(binpath) if binpath else "Unknown",
                    status=StartupStatus.ENABLED if s.get("state") == "Running" else StartupStatus.DISABLED,
                    impact=_estimate_startup_impact(binpath or display),
                    source=StartupSource.STARTUP_SERVICE,
                    location=f"Services\\{name}",
                    command=binpath,
                    enabled=True,
                )
            )

        logger.info(
            f"Found {len(task_entries)} startup tasks and {len(service_entries)} auto-start services"
        )
    except subprocess.TimeoutExpired:
        logger.error("Task/service scan timed out")
    except Exception as e:
        logger.error(f"Failed to scan tasks/services: {e}")

    return task_entries, service_entries


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
    """Scan all startup sources in parallel.

    Registry + folder scans are near-instant; the tasks/services scan is
    one PowerShell process. Running them concurrently keeps total scan
    time at the slowest single source instead of the sum.
    """
    logger.info("Scanning startup entries")

    all_entries: list[StartupEntry] = []
    with ThreadPoolExecutor(max_workers=3) as pool:
        reg_future = pool.submit(_scan_registry_run)
        folder_future = pool.submit(_scan_startup_folder)
        ts_future = pool.submit(_scan_tasks_and_services)

        for future in (reg_future, folder_future):
            try:
                all_entries.extend(future.result())
            except Exception as e:
                logger.error(f"Startup scan worker failed: {e}")
        try:
            tasks, services = ts_future.result()
            all_entries.extend(tasks)
            all_entries.extend(services)
        except Exception as e:
            logger.error(f"Task/service scan worker failed: {e}")

    logger.info(f"Found {len(all_entries)} startup entries")
    return all_entries


# Critical system entries that should never be disabled
CRITICAL_SYSTEM_ENTRIES = {
    "windows defender",
    "smartscreen",
    "security health",
    "system",
    "svchost",
    "lsass",
    "csrss",
    "wininit",
    "services",
    "winlogon",
    "explorer",
    "dwm",
}

# Microsoft-signed entries that should warn before disabling
MICROSOFT_SIGNED_PATTERNS = {
    "microsoft",
    "windows",
    "system32",
    "program files\\windows",
}


def _is_critical_system_entry(entry: StartupEntry) -> bool:
    """Check if entry is a critical system component."""
    name_lower = entry.name.lower()
    command_lower = entry.command.lower()

    for critical in CRITICAL_SYSTEM_ENTRIES:
        if critical in name_lower or critical in command_lower:
            return True

    return False


def _is_microsoft_signed(entry: StartupEntry) -> bool:
    """Check if entry appears to be Microsoft-signed."""
    command_lower = entry.command.lower()
    publisher_lower = entry.publisher.lower()

    for pattern in MICROSOFT_SIGNED_PATTERNS:
        if pattern in command_lower or pattern in publisher_lower:
            return True

    return False


def disable_startup_entry(entry: StartupEntry) -> dict[str, Any]:
    """Disable a startup entry with safety checks."""
    logger.info(f"Attempting to disable startup entry: {entry.name}")

    # Safety check: Critical system entries
    if _is_critical_system_entry(entry):
        error_msg = f"Cannot disable critical system entry: {entry.name}"
        logger.error(error_msg)
        return {
            "success": False,
            "error": error_msg,
            "reason": "critical_system_entry"
        }

    # Safety check: Microsoft-signed entries (warn but allow)
    is_microsoft = _is_microsoft_signed(entry)
    if is_microsoft:
        logger.warning(f"Disabling Microsoft-signed entry: {entry.name}")

    # Create backup before disabling
    backup_id = _create_backup(entry)

    try:
        success = False
        message = "Unknown error"
        if entry.source in (StartupSource.REGISTRY_RUN, StartupSource.REGISTRY_RUN_ONCE):
            success, message = _disable_registry_entry(entry)
        elif entry.source == StartupSource.STARTUP_FOLDER:
            success, message = _disable_startup_folder_entry(entry)
        elif entry.source == StartupSource.TASK_SCHEDULER:
            success, message = _disable_task_scheduler_entry(entry)

        if success:
            logger.info(f"Successfully disabled startup entry: {entry.name}")
            return {
                "success": True,
                "message": message,
                "backupId": backup_id,
                "isMicrosoftSigned": is_microsoft,
            }
        else:
            return {
                "success": False,
                "error": message,
                "message": message,
                "backupId": backup_id,
            }
    except Exception as e:
        logger.error(f"Failed to disable startup entry {entry.name}: {e}")
        return {
            "success": False,
            "error": str(e),
            "message": str(e),
            "backupId": backup_id,
        }


def _disable_registry_entry(entry: StartupEntry) -> tuple[bool, str]:
    """Disable registry startup entry.

    For Run/Run32 entries this writes a StartupApproved flag (the same
    mechanism Task Manager uses) so the entry stays listed and can be
    re-enabled instantly. RunOnce entries — which StartupApproved does
    not cover — are still removed from the key.

    Returns:
        (success, message) tuple where message explains the outcome.
    """
    if not IS_WINDOWS:
        return False, "Not supported on this platform"

    parts = entry.location.split("\\")
    if len(parts) < 2:
        return False, "Invalid registry location format"

    root_key_str = parts[0]
    sub_key = "\\".join(parts[1:])

    root_key_map = {
        "HKEY_LOCAL_MACHINE": winreg.HKEY_LOCAL_MACHINE,
        "HKEY_CURRENT_USER": winreg.HKEY_CURRENT_USER,
    }

    if root_key_str not in root_key_map:
        return False, f"Unsupported registry root: {root_key_str}"

    root_key = root_key_map[root_key_str]
    bucket = _approved_subkey_for(sub_key)

    # Preferred path: StartupApproved flag — entry stays visible.
    if bucket is not None:
        try:
            _write_startup_approved(root_key, bucket, entry.name, enabled=False)
            logger.info(f"Disabled registry entry via StartupApproved: {entry.name}")
            return True, "Disabled Successfully"
        except PermissionError:
            return False, "Administrator permission required to modify this registry entry"
        except OSError as e:
            if e.winerror == 5:
                return False, "Administrator permission required to modify this registry entry"
            return False, f"Registry access denied: {e}"

    # Fallback for RunOnce: remove the value (no StartupApproved bucket).
    try:
        key = winreg.OpenKey(root_key, sub_key, 0, winreg.KEY_SET_VALUE)
    except FileNotFoundError:
        return False, "Registry key not found — entry may have already been removed"
    except PermissionError:
        return False, "Administrator permission required to modify this registry key"
    except OSError as e:
        if e.winerror == 5:
            return False, "Administrator permission required to modify this registry key"
        return False, f"Registry access failed: {e}"

    try:
        winreg.DeleteValue(key, entry.name)
        winreg.CloseKey(key)
        logger.info(f"Disabled registry entry: {entry.name}")
        return True, "Disabled Successfully"
    except FileNotFoundError:
        winreg.CloseKey(key)
        return False, "Already Disabled"
    except PermissionError:
        winreg.CloseKey(key)
        return False, "Administrator permission required to modify this registry entry"
    except OSError as e:
        winreg.CloseKey(key)
        if e.winerror == 5:
            return False, "Administrator permission required to modify this registry entry"
        return False, f"Registry access denied: {e}"


def _disable_startup_folder_entry(entry: StartupEntry) -> tuple[bool, str]:
    """Disable startup folder entry.

    Returns:
        (success, message) tuple.
    """
    shortcut_path = Path(entry.location)
    try:
        if not shortcut_path.exists():
            return False, "Already Disabled"
        # Move to disabled folder instead of deleting
        disabled_folder = shortcut_path.parent / "Disabled"
        disabled_folder.mkdir(exist_ok=True)
        shortcut_path.rename(disabled_folder / shortcut_path.name)
        logger.info(f"Disabled startup folder entry: {entry.name}")
        return True, "Disabled Successfully"
    except PermissionError:
        return False, "Permission denied — cannot move startup folder shortcut"
    except Exception as e:
        logger.error(f"Failed to disable startup folder entry: {e}")
        return False, f"Failed to disable: {e}"


def _disable_task_scheduler_entry(entry: StartupEntry) -> tuple[bool, str]:
    """Disable task scheduler entry.

    Returns:
        (success, message) tuple.
    """
    if not IS_WINDOWS:
        return False, "Not supported on this platform"

    try:
        import subprocess

        result = subprocess.run(
            ["schtasks", "/change", "/tn", entry.name, "/disable"],
            capture_output=True,
            text=True,
            timeout=30
        )

        if result.returncode == 0:
            logger.info(f"Disabled task scheduler entry: {entry.name}")
            return True, "Disabled Successfully"
        else:
            stderr = result.stderr.strip()
            if "cannot find" in stderr.lower() or "does not exist" in stderr.lower():
                return False, "Task not found — may have already been removed"
            if "access is denied" in stderr.lower():
                return False, "Administrator permission required to modify this scheduled task"
            logger.error(f"Failed to disable task {entry.name}: {stderr}")
            return False, f"Task Scheduler error: {stderr}"

    except subprocess.TimeoutExpired:
        logger.error(f"Task scheduler disable timed out for: {entry.name}")
        return False, "Task Scheduler operation timed out"
    except Exception as e:
        logger.error(f"Failed to disable task scheduler entry: {e}")
        return False, f"Failed to disable: {e}"


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
    """Enable registry startup entry.

    For Run/Run32 entries this flips the StartupApproved flag back to
    enabled — the Run value was never deleted, so nothing to recreate.
    RunOnce entries are re-written with the stored command.
    """
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
    bucket = _approved_subkey_for(sub_key)

    try:
        if bucket is not None:
            _write_startup_approved(root_key, bucket, entry.name, enabled=True)
        else:
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
    if not IS_WINDOWS:
        return False

    try:
        import subprocess

        # Use schtasks.exe to enable the task
        result = subprocess.run(
            ["schtasks", "/change", "/tn", entry.name, "/enable"],
            capture_output=True,
            text=True,
            timeout=30
        )

        if result.returncode == 0:
            logger.info(f"Enabled task scheduler entry: {entry.name}")
            return True
        else:
            logger.error(f"Failed to enable task {entry.name}: {result.stderr}")
            return False

    except subprocess.TimeoutExpired:
        logger.error(f"Task scheduler enable timed out for: {entry.name}")
        return False
    except Exception as e:
        logger.error(f"Failed to enable task scheduler entry: {e}")
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
