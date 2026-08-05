"""Security Center backend module — collects real system data for security analysis.

Provides structured data that the frontend SecurityEngine providers consume:
  - Running processes with paths, PIDs, parent PIDs
  - Startup entries with commands and locations
  - Scheduled tasks with actions and triggers
  - Running services with binary paths and startup type
  - Browser extensions with paths
  - Unsigned executables in common locations
  - Windows Defender / Firewall / SmartScreen status (re-exported from dashboard)

All data is collected via real Windows APIs: psutil, WMI/PowerShell, winreg.
No mock data. If a sensor or query is unavailable, the response indicates
'unsupported' rather than returning fake values.

RPC methods:
    security.scan                — full security data collection (all categories)
    security.processes           — running process list with security-relevant fields
    security.startupAnalysis     — startup entries structured for persistence analysis
    security.scheduledTasks      — scheduled tasks with actions
    security.services            — running services with binary paths
    security.browserExtensions   — browser extensions from all installed browsers
    security.unsignedExecutables — unsigned executables in common locations
    security.snapshot            — combined snapshot for SecuritySnapshotBuilder
"""

from __future__ import annotations

import logging
import os
import platform
import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Any

import psutil

from avs_backend.api.registry import register

log = logging.getLogger("avs.security")

IS_WINDOWS = platform.system() == "Windows"
_NO_WINDOW = 0x08000000 if IS_WINDOWS else 0

# Cache for the combined snapshot
_snapshot_cache: dict[str, Any] | None = None
_snapshot_lock = threading.Lock()
_snapshot_ts: float = 0.0
_SNAPSHOT_TTL = 30.0  # 30 seconds


def _run_powershell(script: str, timeout: float = 10.0) -> str | None:
    """Run a PowerShell script and return trimmed stdout, or None on failure."""
    if not IS_WINDOWS:
        return None
    try:
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy",
             "Bypass", "-Command", script],
            capture_output=True, text=True, timeout=timeout,
            creationflags=_NO_WINDOW,
        )
        if proc.returncode != 0:
            return None
        return proc.stdout.strip()
    except Exception as e:
        log.debug("PowerShell query failed: %s", e)
        return None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# =====================================================================
# Process Collection
# =====================================================================

@register("security.processes")
def get_processes(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Collect running processes with security-relevant fields.

    Returns a list of process dicts with: pid, ppid, name, exe, cmdline,
    username, createTime, status.
    """
    try:
        processes: list[dict[str, Any]] = []
        for proc in psutil.process_iter(["pid", "ppid", "name", "exe", "cmdline",
                                          "username", "create_time", "status"]):
            try:
                info = proc.info
                processes.append({
                    "pid": info["pid"],
                    "ppid": info["ppid"],
                    "name": info["name"] or "",
                    "exe": info["exe"] or "",
                    "cmdline": " ".join(info["cmdline"] or []),
                    "username": info["username"] or "",
                    "createTime": info["create_time"],
                    "status": info["status"] or "",
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

        return {
            "processes": processes,
            "count": len(processes),
            "capturedAt": _now_iso(),
        }
    except Exception as e:
        log.warning("Failed to collect processes: %s", e)
        return {"processes": [], "count": 0, "error": str(e), "capturedAt": _now_iso()}


# =====================================================================
# Startup Analysis
# =====================================================================

@register("security.startupAnalysis")
def get_startup_analysis(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Collect startup entries structured for persistence analysis.

    Returns entries from: Registry Run keys, Startup folders, and
    provides command, location, source for each entry.
    """
    if not IS_WINDOWS:
        return {"entries": [], "supported": False, "capturedAt": _now_iso()}

    entries: list[dict[str, Any]] = []

    # Registry Run keys
    run_keys = [
        ("HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "HKCU_Run"),
        ("HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "HKLM_Run"),
        ("HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce", "HKCU_RunOnce"),
        ("HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce", "HKLM_RunOnce"),
        ("HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run", "HKLM_WOW64_Run"),
    ]

    try:
        import winreg
        for key_path, source in run_keys:
            try:
                root = winreg.HKEY_LOCAL_MACHINE if "HKLM" in key_path else winreg.HKEY_CURRENT_USER
                sub = key_path.split("\\", 1)[1]
                with winreg.OpenKey(root, sub) as key:
                    for i in range(winreg.QueryInfoKey(key)[1]):
                        try:
                            name, value, _ = winreg.EnumValue(key, i)
                            entries.append({
                                "name": name,
                                "command": value,
                                "source": source,
                                "location": key_path,
                                "type": "registry",
                            })
                        except OSError:
                            break
            except (FileNotFoundError, OSError):
                continue
    except ImportError:
        pass

    # Startup folders
    startup_folders = [
        os.path.expandvars(r"%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"),
        os.path.expandvars(r"%ProgramData%\Microsoft\Windows\Start Menu\Programs\Startup"),
    ]
    for folder in startup_folders:
        if os.path.isdir(folder):
            for item in os.listdir(folder):
                full_path = os.path.join(folder, item)
                if os.path.isfile(full_path):
                    entries.append({
                        "name": item,
                        "command": full_path,
                        "source": "StartupFolder",
                        "location": folder,
                        "type": "folder",
                    })

    return {
        "entries": entries,
        "count": len(entries),
        "capturedAt": _now_iso(),
    }


# =====================================================================
# Scheduled Tasks
# =====================================================================

@register("security.scheduledTasks")
def get_scheduled_tasks(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Collect scheduled tasks with actions and triggers.

    Uses PowerShell Get-ScheduledTask to enumerate all tasks.
    """
    if not IS_WINDOWS:
        return {"tasks": [], "supported": False, "capturedAt": _now_iso()}

    ps_script = r"""
$ErrorActionPreference = 'SilentlyContinue'
$tasks = Get-ScheduledTask | Where-Object { $_.State -ne 'Disabled' }
$results = @()
foreach ($t in $tasks) {
    $actions = @()
    foreach ($a in $t.Actions) {
        $actions += @{ execute = $a.Execute; arguments = $a.Arguments; workingDir = $a.WorkingDirectory }
    }
    $triggers = @()
    foreach ($tr in $t.Triggers) {
        $triggers += @{ type = $tr.GetType().Name; enabled = $tr.Enabled }
    }
    $info = Get-ScheduledTaskInfo -TaskName $t.TaskName -TaskPath $t.TaskPath
    $results += @{
        taskName = $t.TaskName
        taskPath = $t.TaskPath
        state = $t.State
        author = $t.Author
        description = $t.Description
        actions = $actions
        triggers = $triggers
        lastRunTime = $info.LastRunTime
        nextRunTime = $info.NextRunTime
        lastResult = $info.LastTaskResult
    }
}
$results | ConvertTo-Json -Depth 4 -Compress
"""
    output = _run_powershell(ps_script, timeout=15.0)
    if not output:
        return {"tasks": [], "error": "PowerShell query failed", "capturedAt": _now_iso()}

    try:
        import json
        data = json.loads(output)
        if isinstance(data, dict):
            data = [data]
        return {
            "tasks": data,
            "count": len(data),
            "capturedAt": _now_iso(),
        }
    except (ValueError, TypeError) as e:
        return {"tasks": [], "error": str(e), "capturedAt": _now_iso()}


# =====================================================================
# Services
# =====================================================================

@register("security.services")
def get_services(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Collect running Windows services with binary paths.

    Uses WMI Win32_Service query via PowerShell for binary path info
    that psutil doesn't provide.
    """
    if not IS_WINDOWS:
        return {"services": [], "supported": False, "capturedAt": _now_iso()}

    ps_script = r"""
$ErrorActionPreference = 'SilentlyContinue'
$services = Get-CimInstance -ClassName Win32_Service | Where-Object { $_.State -eq 'Running' }
$results = @()
foreach ($s in $services) {
    $results += @{
        name = $s.Name
        displayName = $s.DisplayName
        state = $s.State
        startMode = $s.StartMode
        pathName = $s.PathName
        processId = $s.ProcessId
        serviceType = $s.ServiceType
        startName = $s.StartName
    }
}
$results | ConvertTo-Json -Depth 3 -Compress
"""
    output = _run_powershell(ps_script, timeout=15.0)
    if not output:
        # Fallback to psutil
        services = []
        for svc in psutil.win_service_iter() if hasattr(psutil, "win_service_iter") else []:
            try:
                info = svc.info
                if info["status"] == "running":
                    services.append({
                        "name": info["name"],
                        "displayName": info.get("display_name", ""),
                        "state": info["status"],
                        "startMode": info.get("start_type", ""),
                        "pathName": "",
                        "processId": info.get("pid", 0),
                        "serviceType": "",
                        "startName": "",
                    })
            except Exception:
                continue
        return {"services": services, "count": len(services), "capturedAt": _now_iso()}

    try:
        import json
        data = json.loads(output)
        if isinstance(data, dict):
            data = [data]
        return {
            "services": data,
            "count": len(data),
            "capturedAt": _now_iso(),
        }
    except (ValueError, TypeError) as e:
        return {"services": [], "error": str(e), "capturedAt": _now_iso()}


# =====================================================================
# Browser Extensions
# =====================================================================

@register("security.browserExtensions")
def get_browser_extensions(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Collect browser extensions from Chrome, Edge, Firefox, Brave.

    Scans browser profile directories for extension manifests.
    """
    if not IS_WINDOWS:
        return {"extensions": [], "supported": False, "capturedAt": _now_iso()}

    extensions: list[dict[str, Any]] = []
    local_app = os.path.expandvars("%LOCALAPPDATA%")

    # Chromium-based browsers: extensions live in <profile>/Extensions/<id>/<version>/
    chromium_browsers = [
        ("Chrome", os.path.join(local_app, r"Google\Chrome\User Data\Default\Extensions")),
        ("Edge", os.path.join(local_app, r"Microsoft\Edge\User Data\Default\Extensions")),
        ("Brave", os.path.join(local_app, r"BraveSoftware\Brave-Browser\User Data\Default\Extensions")),
    ]

    for browser_name, ext_dir in chromium_browsers:
        if not os.path.isdir(ext_dir):
            continue
        try:
            for ext_id in os.listdir(ext_dir):
                ext_path = os.path.join(ext_dir, ext_id)
                if not os.path.isdir(ext_path):
                    continue
                # Find the latest version directory
                versions = sorted(os.listdir(ext_path), reverse=True)
                for ver in versions:
                    manifest_path = os.path.join(ext_path, ver, "manifest.json")
                    if os.path.isfile(manifest_path):
                        try:
                            import json
                            with open(manifest_path, "r", encoding="utf-8") as f:
                                manifest = json.load(f)
                            extensions.append({
                                "browser": browser_name,
                                "extensionId": ext_id,
                                "version": ver,
                                "name": manifest.get("name", ext_id),
                                "description": manifest.get("description", ""),
                                "permissions": manifest.get("permissions", []),
                                "hostPermissions": manifest.get("host_permissions", manifest.get("content_scripts", [])),
                                "manifestVersion": manifest.get("manifest_version", 2),
                                "path": os.path.join(ext_path, ver),
                            })
                        except (ValueError, OSError):
                            continue
                    break  # Only process the latest version
        except OSError:
            continue

    # Firefox: extensions live in profile dirs
    firefox_profiles = os.path.join(local_app, r"Mozilla\Firefox\Profiles")
    if os.path.isdir(firefox_profiles):
        for profile in os.listdir(firefox_profiles):
            ext_file = os.path.join(firefox_profiles, profile, "extensions.json")
            if os.path.isfile(ext_file):
                try:
                    import json
                    with open(ext_file, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    for addon in data.get("addons", []):
                        extensions.append({
                            "browser": "Firefox",
                            "extensionId": addon.get("id", ""),
                            "version": addon.get("version", ""),
                            "name": addon.get("defaultLocale", {}).get("name", addon.get("id", "")),
                            "description": addon.get("defaultLocale", {}).get("description", ""),
                            "permissions": addon.get("permissions", []),
                            "hostPermissions": [],
                            "manifestVersion": 2,
                            "path": addon.get("path", ""),
                            "enabled": addon.get("active", False),
                        })
                except (ValueError, OSError):
                    continue

    return {
        "extensions": extensions,
        "count": len(extensions),
        "capturedAt": _now_iso(),
    }


# =====================================================================
# Unsigned Executables
# =====================================================================

def _enumerate_all_drives() -> list[str]:
    """Enumerate all available drive letters (fixed, removable, network)."""
    drives: list[str] = []
    if not IS_WINDOWS:
        return drives
    try:
        import ctypes
        bitmask = ctypes.windll.kernel32.GetLogicalDrives()
        for i in range(26):
            if bitmask & (1 << i):
                letter = chr(ord('A') + i)
                # Check drive type — include fixed, removable, and network
                drive_path = f"{letter}:\\"
                drive_type = ctypes.windll.kernel32.GetDriveTypeW(ctypes.c_wchar_p(drive_path))
                # 0=unknown, 1=no root, 2=removable, 3=fixed, 4=network, 5=cdrom, 6=ramdisk
                if drive_type in (2, 3, 4, 6):
                    drives.append(drive_path)
    except Exception as e:
        log.debug("Drive enumeration failed: %s", e)
        # Fallback: at least include C:
        drives = ["C:\\"]
    return drives


def _get_user_folders() -> list[str]:
    """Get user-specific folders for scanning."""
    folders: list[str] = []
    if not IS_WINDOWS:
        return folders
    user_profile = os.path.expandvars("%USERPROFILE%")
    user_dirs = [
        os.path.join(user_profile, "Downloads"),
        os.path.join(user_profile, "Documents"),
        os.path.join(user_profile, "Desktop"),
        os.path.join(user_profile, "Pictures"),
        os.path.join(user_profile, "Videos"),
        os.path.join(user_profile, "Music"),
    ]
    for d in user_dirs:
        if os.path.isdir(d):
            folders.append(d)
    # Also add public user folders
    public = os.path.expandvars(r"%PUBLIC%")
    if os.path.isdir(public):
        folders.append(public)
    return folders


@register("security.unsignedExecutables")
def get_unsigned_executables(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Scan all drives and common locations for unsigned executables.

    Checks: all fixed/removable drives, Temp, AppData, ProgramData, Downloads,
    Documents, Desktop, Program Files, Windows directories for .exe/.dll files
    that are not digitally signed.
    """
    if not IS_WINDOWS:
        return {"executables": [], "supported": False, "capturedAt": _now_iso()}

    # Build comprehensive scan directory list
    scan_dirs = [
        os.path.expandvars("%TEMP%"),
        os.path.expandvars("%APPDATA%"),
        os.path.expandvars("%LOCALAPPDATA%"),
        os.path.expandvars("%PROGRAMDATA%"),
        os.path.join(os.environ.get("SystemDrive", "C:"), "\\Windows\\System32"),
        os.path.join(os.environ.get("SystemDrive", "C:"), "\\Windows\\SysWOW64"),
        os.path.expandvars(r"%ProgramFiles%"),
        os.path.expandvars(r"%ProgramFiles(x86)%"),
    ]

    # Add all user folders
    scan_dirs.extend(_get_user_folders())

    # Add root of all drives (for full scan, the PowerShell will recurse)
    all_drives = _enumerate_all_drives()
    for drive in all_drives:
        if drive not in scan_dirs:
            scan_dirs.append(drive)

    # Remove duplicates and non-existent dirs
    scan_dirs = list(dict.fromkeys(d for d in scan_dirs if os.path.isdir(d)))

    ps_script = r"""
param([string[]]$ScanDirs)
$ErrorActionPreference = 'SilentlyContinue'
$results = @()
foreach ($dir in $ScanDirs) {
    if (-not (Test-Path $dir)) { continue }
    $exeFiles = Get-ChildItem -Path $dir -Include *.exe,*.dll,*.sys,*.scr,*.ocx -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 500
    foreach ($file in $exeFiles) {
        $sig = Get-AuthenticodeSignature -FilePath $file.FullName -ErrorAction SilentlyContinue
        if ($sig -and $sig.Status -ne 'Valid') {
            $results += @{
                path = $file.FullName
                name = $file.Name
                size = $file.Length
                signatureStatus = $sig.Status.ToString()
                signer = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { '' }
                lastModified = $file.LastWriteTime
            }
        }
    }
}
$results | ConvertTo-Json -Depth 3 -Compress
"""
    # Pass directories as PowerShell array
    dirs_arg = ",".join(f"'{d}'" for d in scan_dirs)
    full_script = f"$ScanDirs = @({dirs_arg})\n{ps_script}"
    output = _run_powershell(full_script, timeout=60.0)

    if not output:
        return {"executables": [], "error": "PowerShell scan failed", "capturedAt": _now_iso()}

    try:
        import json
        data = json.loads(output)
        if isinstance(data, dict):
            data = [data]
        return {
            "executables": data,
            "count": len(data),
            "capturedAt": _now_iso(),
        }
    except (ValueError, TypeError) as e:
        return {"executables": [], "error": str(e), "capturedAt": _now_iso()}


# =====================================================================
# Network Connections
# =====================================================================

@register("security.networkConnections")
def get_network_connections(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Collect active network connections with process info.

    Returns connections with: processName, pid, localAddress, remoteAddress,
    remotePort, protocol, state. Also returns listening ports.

    Used by the frontend NetworkBehaviorProvider for beacon detection,
    suspicious port analysis, and C2 communication detection.
    """
    try:
        connections: list[dict[str, Any]] = []
        listening_ports: list[dict[str, Any]] = []

        for conn in psutil.net_connections(kind="inet"):
            try:
                proc_name = ""
                proc_pid = conn.pid or 0
                if conn.pid:
                    try:
                        p = psutil.Process(conn.pid)
                        proc_name = p.name()
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        pass

                laddr = f"{conn.laddr.ip}:{conn.laddr.port}" if conn.laddr else ""
                raddr = f"{conn.raddr.ip}:{conn.raddr.port}" if conn.raddr else ""

                connections.append({
                    "processName": proc_name,
                    "pid": proc_pid,
                    "localAddress": laddr,
                    "remoteAddress": raddr,
                    "remotePort": conn.raddr.port if conn.raddr else 0,
                    "protocol": "tcp" if conn.type == 1 else "udp",
                    "state": conn.status,
                    "timestamp": time.time(),
                })

                # Collect listening ports
                if conn.status == "LISTEN" and conn.laddr:
                    listening_ports.append({
                        "processName": proc_name,
                        "pid": proc_pid,
                        "port": conn.laddr.port,
                        "protocol": "tcp" if conn.type == 1 else "udp",
                        "address": conn.laddr.ip,
                    })
            except Exception:
                continue

        return {
            "connections": connections,
            "listeningPorts": listening_ports,
            "connectionCount": len(connections),
            "listeningPortCount": len(listening_ports),
            "capturedAt": _now_iso(),
        }
    except Exception as e:
        log.warning("Failed to collect network connections: %s", e)
        return {
            "connections": [],
            "listeningPorts": [],
            "connectionCount": 0,
            "listeningPortCount": 0,
            "error": str(e),
            "capturedAt": _now_iso(),
        }


# =====================================================================
# Full System File Scan
# =====================================================================

@register("security.fullSystemScan")
def full_system_scan(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Comprehensive full system file scan across all drives.

    Enumerates all fixed, removable, and network drives, then scans
    every directory for executables, scripts, and suspicious files.
    Also scans registry Run keys for persistence entries.

    Returns:
        - files: list of all scanned files with paths
        - fileCount: total number of files scanned
        - drivesScanned: list of drives that were scanned
        - registryEntries: suspicious registry entries found
        - unsignedExecutables: unsigned exe/dll files found
        - capturedAt: timestamp
    """
    if not IS_WINDOWS:
        return {"files": [], "fileCount": 0, "supported": False, "capturedAt": _now_iso()}

    all_drives = _enumerate_all_drives()
    user_folders = _get_user_folders()

    # Build comprehensive directory list for file enumeration
    scan_dirs: list[str] = []
    for drive in all_drives:
        scan_dirs.append(drive)
    scan_dirs.extend(user_folders)
    scan_dirs.extend([
        os.path.expandvars("%TEMP%"),
        os.path.expandvars("%APPDATA%"),
        os.path.expandvars("%LOCALAPPDATA%"),
        os.path.expandvars("%PROGRAMDATA%"),
    ])
    scan_dirs = list(dict.fromkeys(d for d in scan_dirs if os.path.isdir(d)))

    # Use PowerShell to enumerate all files across all drives
    ps_script = r"""
$ErrorActionPreference = 'SilentlyContinue'
$allFiles = @()
$extensions = '*.exe','*.dll','*.sys','*.scr','*.ocx','*.js','*.vbs','*.ps1','*.bat','*.cmd','*.hta','*.msi','*.com','*.pif'
foreach ($drive in $drives) {
    if (Test-Path $drive) {
        $files = Get-ChildItem -Path $drive -Include $extensions -Recurse -File -ErrorAction SilentlyContinue
        foreach ($f in $files) {
            $allFiles += $f.FullName
        }
    }
}
$allFiles | ConvertTo-Json -Compress
"""
    dirs_arg = ",".join(f"'{d}'" for d in scan_dirs)
    full_script = f"$drives = @({dirs_arg})\n{ps_script}"
    output = _run_powershell(full_script, timeout=120.0)

    files: list[str] = []
    if output:
        try:
            import json
            data = json.loads(output)
            if isinstance(data, str):
                files = [data]
            elif isinstance(data, list):
                files = [str(f) for f in data if f]
        except (ValueError, TypeError):
            pass

    # Collect registry Run key entries for persistence analysis
    registry_entries: list[dict[str, Any]] = []
    try:
        import winreg
        run_keys = [
            (winreg.HKEY_LOCAL_MACHINE, r"Software\Microsoft\Windows\CurrentVersion\Run", "HKLM_Run"),
            (winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", "HKCU_Run"),
            (winreg.HKEY_LOCAL_MACHINE, r"Software\Microsoft\Windows\CurrentVersion\RunOnce", "HKLM_RunOnce"),
            (winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\RunOnce", "HKCU_RunOnce"),
            (winreg.HKEY_LOCAL_MACHINE, r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run", "HKLM_WOW64_Run"),
        ]
        for root, sub_path, source in run_keys:
            try:
                with winreg.OpenKey(root, sub_path) as key:
                    for i in range(winreg.QueryInfoKey(key)[1]):
                        try:
                            name, value, _ = winreg.EnumValue(key, i)
                            registry_entries.append({
                                "key": f"{source}\\{name}",
                                "value": value,
                                "source": source,
                            })
                        except OSError:
                            break
            except (FileNotFoundError, OSError):
                continue
    except (ImportError, OSError):
        pass

    # Get unsigned executables (reuse the existing function)
    unsigned_result = get_unsigned_executables()
    unsigned_execs = unsigned_result.get("executables", [])

    return {
        "files": files,
        "fileCount": len(files),
        "drivesScanned": all_drives,
        "registryEntries": registry_entries,
        "registryEntryCount": len(registry_entries),
        "unsignedExecutables": unsigned_execs,
        "unsignedExecutableCount": len(unsigned_execs),
        "capturedAt": _now_iso(),
        "supported": True,
    }


# =====================================================================
# Combined Snapshot
# =====================================================================

@register("security.snapshot")
def get_security_snapshot(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Collect all security data in parallel for a combined snapshot.

    Runs all collectors concurrently and returns a unified snapshot
    suitable for the frontend SecuritySnapshotBuilder.
    """
    global _snapshot_cache, _snapshot_ts

    with _snapshot_lock:
        if _snapshot_cache and (time.time() - _snapshot_ts) < _SNAPSHOT_TTL:
            return _snapshot_cache

    collectors = [
        ("processes", get_processes),
        ("startupAnalysis", get_startup_analysis),
        ("scheduledTasks", get_scheduled_tasks),
        ("services", get_services),
        ("browserExtensions", get_browser_extensions),
        ("unsignedExecutables", get_unsigned_executables),
        ("networkConnections", get_network_connections),
    ]

    results: dict[str, Any] = {}
    pool = ThreadPoolExecutor(max_workers=len(collectors))
    futures = {pool.submit(fn): name for name, fn in collectors}
    try:
        for fut in as_completed(futures, timeout=45.0):
            name = futures[fut]
            try:
                results[name] = fut.result()
            except Exception as e:
                log.warning("Security collector %s failed: %s", name, e)
                results[name] = {"error": str(e)}
    except Exception:
        log.warning("Some security collectors timed out")
    finally:
        pool.shutdown(wait=False)

    results["capturedAt"] = _now_iso()
    results["supported"] = IS_WINDOWS

    with _snapshot_lock:
        _snapshot_cache = results
        _snapshot_ts = time.time()

    return results


# =====================================================================
# Scan Lifecycle (async scan with status polling)
# =====================================================================

_scan_state: dict[str, Any] = {
    "status": "idle",
    "scanId": None,
    "startedAt": None,
    "progress": 0,
    "error": None,
}
_scan_lock = threading.Lock()


@register("security.scan")
def start_security_scan(params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Start a security scan. Returns immediately with a scanId.

    The scan runs in a background thread. Poll security.scan.status for progress.
    """
    with _scan_lock:
        if _scan_state["status"] == "running":
            return {"scanId": _scan_state["scanId"], "status": "already_running"}

        scan_id = f"security-scan-{int(time.time())}"
        _scan_state.update({
            "status": "running",
            "scanId": scan_id,
            "startedAt": _now_iso(),
            "progress": 0,
            "error": None,
        })

    def _run_scan() -> None:
        try:
            snapshot = get_security_snapshot()
            with _scan_lock:
                _scan_state["status"] = "completed"
                _scan_state["progress"] = 100
                _scan_state["snapshot"] = snapshot
        except Exception as e:
            with _scan_lock:
                _scan_state["status"] = "failed"
                _scan_state["error"] = str(e)

    thread = threading.Thread(target=_run_scan, daemon=True)
    thread.start()

    return {"scanId": scan_id, "status": "started"}


@register("security.scan.status")
def get_scan_status(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Get the current security scan status."""
    with _scan_lock:
        return {
            "scanId": _scan_state["scanId"],
            "status": _scan_state["status"],
            "progress": _scan_state["progress"],
            "startedAt": _scan_state["startedAt"],
            "error": _scan_state["error"],
        }


@register("security.scan.cancel")
def cancel_security_scan(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Cancel the current security scan."""
    with _scan_lock:
        if _scan_state["status"] == "running":
            _scan_state["status"] = "cancelled"
            return {"cancelled": True}
        return {"cancelled": False, "reason": "no_scan_running"}
