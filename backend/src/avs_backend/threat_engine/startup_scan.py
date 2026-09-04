"""Startup Scan — quick scan of startup items on boot.

Scans all files that Windows loads at startup (registry Run keys,
startup folder, scheduled tasks) for malware. Also optionally scans
the boot sector (MBR) for bootkits.

This runs automatically when the backend starts, catching:
  - Persistent malware that survives reboot
  - Bootkits and rootkits in the MBR
  - Malicious startup entries
  - PUPs that add themselves to startup

State is persisted to %LOCALAPPDATA%\\AVS AI Shield\\threat_engine\\startup_scan_config.json
"""
from __future__ import annotations

import json
import logging
import os
import platform
import subprocess
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger("avs.threat_engine.startup_scan")

IS_WINDOWS = platform.system() == "Windows"
_CREATE_NO_WINDOW = 0x08000000 if IS_WINDOWS else 0

_DATA_DIR = Path(
    os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))
) / "AVS AI Shield" / "threat_engine"

_CONFIG_PATH = _DATA_DIR / "startup_scan_config.json"

_scan_lock = threading.Lock()
_scan_running = False
_last_scan_result: dict[str, Any] | None = None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_config() -> dict:
    if _CONFIG_PATH.exists():
        try:
            with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            log.warning("Failed to load startup scan config: %s", e)
    return {"enabled": True, "scan_boot_sector": True, "delay_seconds": 60}


def _save_config(config: dict) -> None:
    try:
        _DATA_DIR.mkdir(parents=True, exist_ok=True)
        with open(_CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2)
    except Exception as e:
        log.error("Failed to save startup scan config: %s", e)


def _get_startup_files() -> list[str]:
    """Get all executable file paths from Windows startup locations."""
    if not IS_WINDOWS:
        return []

    files: set[str] = set()

    # Method 1: Query Win32_StartupCommand via PowerShell
    ps_script = (
        "Get-CimInstance Win32_StartupCommand | "
        "Select-Object -ExpandProperty Command | "
        "ForEach-Object { "
        "  $cmd = $_; "
        "  if (Test-Path $cmd -PathType Leaf) { $cmd } "
        "  else { "
        "    $exe = ($cmd -split '\"')[1]; "
        "    if (-not $exe) { $exe = ($cmd -split ' ')[0] } "
        "    if ($exe -and (Test-Path $exe -PathType Leaf)) { $exe } "
        "  } "
        "}"
    )

    try:
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_script],
            capture_output=True, text=True, timeout=15,
            creationflags=_CREATE_NO_WINDOW,
        )
        if proc.returncode == 0:
            for line in proc.stdout.strip().splitlines():
                path = line.strip()
                if path and os.path.isfile(path):
                    files.add(path)
    except Exception as e:
        log.debug("Win32_StartupCommand query failed: %s", e)

    # Method 2: Scan startup folders
    startup_folders = [
        os.path.join(os.environ.get("APPDATA", ""), "Microsoft", "Windows", "Start Menu", "Programs", "Startup"),
        os.path.join(os.environ.get("ProgramData", "C:\\ProgramData"), "Microsoft", "Windows", "Start Menu", "Programs", "Startup"),
    ]

    for folder in startup_folders:
        if os.path.isdir(folder):
            for item in os.listdir(folder):
                full_path = os.path.join(folder, item)
                if os.path.isfile(full_path):
                    files.add(full_path)
                elif os.path.isdir(full_path):
                    # Scan inside startup folder entries
                    for root, _dirs, fnames in os.walk(full_path):
                        for fname in fnames:
                            files.add(os.path.join(root, fname))

    # Method 3: Registry Run keys
    reg_paths = [
        (r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",),
        (r"HKLM\Software\Microsoft\Windows\CurrentVersion\Run",),
        (r"HKLM\Software\Microsoft\Windows\CurrentVersion\RunOnce",),
        (r"HKCU\Software\Microsoft\Windows\CurrentVersion\RunOnce",),
        (r"HKLM\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run",),
    ]

    for (reg_path,) in reg_paths:
        try:
            proc = subprocess.run(
                ["reg", "query", reg_path, "/s"],
                capture_output=True, text=True, timeout=10,
                creationflags=_CREATE_NO_WINDOW,
            )
            if proc.returncode == 0:
                for line in proc.stdout.splitlines():
                    line = line.strip()
                    if "REG_SZ" in line or "REG_EXPAND_SZ" in line:
                        # Extract the value (path) after REG_SZ
                        parts = line.split("REG_SZ") if "REG_SZ" in line else line.split("REG_EXPAND_SZ")
                        if len(parts) > 1:
                            val = parts[1].strip().strip('"')
                            # Extract exe path from command line
                            if val.startswith('"'):
                                exe = val.split('"')[1] if '"' in val[1:] else val
                            else:
                                exe = val.split(" ")[0]
                            if exe and os.path.isfile(exe):
                                files.add(exe)
        except Exception as e:
            log.debug("Registry query failed for %s: %s", reg_path, e)

    return list(files)


def _get_scheduled_task_executables() -> list[str]:
    """Get executable paths from Windows Scheduled Tasks.

    Malware often creates scheduled tasks for persistence. This function
    enumerates all scheduled tasks and extracts the executable paths
    from their actions.
    """
    if not IS_WINDOWS:
        return []

    files: set[str] = set()

    # Use PowerShell to enumerate scheduled tasks and their actions
    ps_script = r"""
$ErrorActionPreference='SilentlyContinue'
$tasks = Get-ScheduledTask | Where-Object { $_.State -ne 'Disabled' }
foreach ($task in $tasks) {
    $info = $task | Get-ScheduledTaskInfo
    foreach ($action in $task.Actions) {
        $exe = $action.Execute
        $args = $action.Arguments
        if ($exe) {
            # Resolve environment variables
            $exe = [Environment]::ExpandEnvironmentVariables($exe)
            Write-Output "$exe|$($task.TaskName)|$($task.TaskPath)"
        }
        # Also check arguments for embedded executables
        if ($args -match '(\w:\\[^\s"]+\.(?:exe|bat|cmd|ps1|vbs|js|hta))') {
            $matched = $Matches[1]
            $matched = [Environment]::ExpandEnvironmentVariables($matched)
            Write-Output "$matched|$($task.TaskName)|$($task.TaskPath)"
        }
    }
}
"""

    try:
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_script],
            capture_output=True, text=True, timeout=30,
            creationflags=_CREATE_NO_WINDOW,
        )
        if proc.returncode == 0:
            for line in proc.stdout.strip().splitlines():
                line = line.strip()
                if not line:
                    continue
                parts = line.split("|", 2)
                exe_path = parts[0]
                if exe_path and os.path.isfile(exe_path):
                    files.add(exe_path)
    except Exception as e:
        log.debug("Scheduled task enumeration failed: %s", e)

    return list(files)


def _run_startup_scan(scan_boot_sector: bool = True) -> dict[str, Any]:
    """Run a quick scan on all startup files + optionally boot sector."""
    global _last_scan_result

    result: dict[str, Any] = {
        "started_at": _now_iso(),
        "files_scanned": 0,
        "threats_found": 0,
        "boot_sector_scanned": False,
        "boot_sector_result": None,
        "threats": [],
        "errors": [],
    }

    # Scan startup files with the threat engine
    startup_files = _get_startup_files()
    # Also scan executables from scheduled tasks
    scheduled_task_files = _get_scheduled_task_executables()
    # Merge and deduplicate
    all_files = list(set(startup_files + scheduled_task_files))
    result["files_total"] = len(all_files)
    result["startup_files"] = len(startup_files)
    result["scheduled_task_files"] = len(scheduled_task_files)

    if all_files:
        try:
            from avs_backend.threat_engine import threat_scan, _scans, _scans_lock
            import time as _time
            for file_path in all_files:
                try:
                    scan_result = threat_scan({"path": file_path, "scan_type": "custom"})
                    if scan_result.get("success"):
                        scan_id = scan_result.get("scan_id")
                        if scan_id:
                            # Poll for scan completion (max 30s per file)
                            for _ in range(30):
                                _time.sleep(1)
                                with _scans_lock:
                                    scan = _scans.get(scan_id, {})
                                status = scan.get("status", "")
                                if status in ("complete", "cancelled", "error"):
                                    break
                            result["files_scanned"] += 1
                            threats = scan.get("threats", [])
                            if threats:
                                result["threats_found"] += len(threats)
                                result["threats"].extend(threats)
                except Exception as e:
                    result["errors"].append(f"{file_path}: {e}")
        except Exception as e:
            result["errors"].append(f"Threat engine: {e}")

    # Scan boot sector (MBR)
    if scan_boot_sector and IS_WINDOWS:
        try:
            from avs_backend.advanced_security.boot_sector import BootSectorScanner
            scanner = BootSectorScanner({})
            boot_result = scanner.scan()
            result["boot_sector_scanned"] = True
            result["boot_sector_result"] = boot_result
            if boot_result.get("threat_level") in ("suspicious", "malicious"):
                result["threats_found"] += 1
                result["threats"].append({
                    "name": "Boot sector threat",
                    "category": "bootkit",
                    "severity": "high",
                    "path": "MBR",
                    "details": boot_result.get("threats", []),
                })
        except Exception as e:
            result["errors"].append(f"Boot sector: {e}")

    result["completed_at"] = _now_iso()
    result["success"] = True

    _last_scan_result = result
    log.info(
        "Startup scan complete: %d files scanned, %d threats found, boot_sector=%s",
        result["files_scanned"], result["threats_found"], result["boot_sector_scanned"],
    )
    return result


def run_startup_scan_async(scan_boot_sector: bool = True) -> None:
    """Run the startup scan in a background thread."""
    global _scan_running

    with _scan_lock:
        if _scan_running:
            return
        _scan_running = True

    def _do_scan():
        global _scan_running
        try:
            _run_startup_scan(scan_boot_sector)
        except Exception as e:
            log.error("Startup scan failed: %s", e)
        finally:
            with _scan_lock:
                _scan_running = False

    thread = threading.Thread(target=_do_scan, daemon=True, name="startup-scan")
    thread.start()


def auto_start_on_startup() -> None:
    """Auto-run startup scan on backend startup if enabled."""
    if not IS_WINDOWS:
        return
    if os.environ.get("AVS_NO_CLAMAV_AUTO_SETUP"):
        return  # Test environment

    config = _load_config()
    if not config.get("enabled", True):
        return

    delay = config.get("delay_seconds", 60)
    scan_boot = config.get("scan_boot_sector", True)

    log.info("Startup scan scheduled in %d seconds", delay)
    timer = threading.Timer(delay, run_startup_scan_async, args=[scan_boot])
    timer.daemon = True
    timer.start()


def get_status() -> dict[str, Any]:
    """Get startup scan status and configuration."""
    config = _load_config()
    return {
        "enabled": config.get("enabled", True),
        "scan_boot_sector": config.get("scan_boot_sector", True),
        "delay_seconds": config.get("delay_seconds", 60),
        "scan_running": _scan_running,
        "last_scan": _last_scan_result,
    }


def configure(params: dict[str, Any]) -> dict[str, Any]:
    """Update startup scan configuration."""
    config = _load_config()
    if "enabled" in params:
        config["enabled"] = bool(params["enabled"])
    if "scan_boot_sector" in params:
        config["scan_boot_sector"] = bool(params["scan_boot_sector"])
    if "delay_seconds" in params:
        config["delay_seconds"] = int(params["delay_seconds"])
    _save_config(config)
    return {"success": True, "status": get_status()}


def run_now() -> dict[str, Any]:
    """Trigger an immediate startup scan."""
    config = _load_config()
    return _run_startup_scan(config.get("scan_boot_sector", True))
