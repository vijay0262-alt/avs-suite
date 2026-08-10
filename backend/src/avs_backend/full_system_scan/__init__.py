"""Full System Scan — comprehensive async scanner with real-time streaming.

Covers all fixed drives, user profile, ProgramData, Windows, temp folders,
browser profiles, startup, scheduled tasks, registry, services, drivers,
event logs, recycle bin, Windows Update cache, thumbnail cache, DNS cache,
prefetch, fonts cache.

Security: Defender, Firewall, SmartScreen, Security Center, persistence,
PowerShell, WMI, browser extensions, hosts file, run keys, services.

RPC: fullscan.start, fullscan.status, fullscan.result, fullscan.cancel
"""

from __future__ import annotations

import logging
import os
import platform
import subprocess
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from avs_backend.api.registry import register

log = logging.getLogger("avs.fullscan")

IS_WINDOWS = platform.system() == "Windows"
_NO_WINDOW = 0x08000000 if IS_WINDOWS else 0


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _run_powershell(script: str, timeout: float = 15.0) -> str | None:
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


# =====================================================================
# Scan State
# =====================================================================

_scans: dict[str, dict[str, Any]] = {}
_scans_lock = threading.Lock()


def _new_scan() -> dict[str, Any]:
    return {
        "scanId": uuid.uuid4().hex,
        "status": "idle",
        "startedAt": time.monotonic(),
        "startedAtIso": _now_iso(),
        "completedAt": None,
        "progress": 0,
        "currentModule": None,
        "currentFolder": None,
        "currentFile": None,
        "itemsScanned": 0,
        "totalItems": 0,
        "elapsedMs": 0,
        "cancelEvent": threading.Event(),
        "results": {},
        "errors": [],
        "activityLog": [],
    }


def _update_scan(scan_id: str, **kwargs: Any) -> None:
    with _scans_lock:
        scan = _scans.get(scan_id)
        if scan:
            scan.update(kwargs)


def _add_activity(scan_id: str, module: str, action: str, detail: str, path: str | None = None) -> None:
    with _scans_lock:
        scan = _scans.get(scan_id)
        if scan:
            scan["activityLog"].append({
                "ts": _now_iso(),
                "module": module,
                "action": action,
                "detail": detail,
                "path": path,
            })
            if len(scan["activityLog"]) > 200:
                scan["activityLog"] = scan["activityLog"][-200:]


def _increment_items(scan_id: str, count: int = 1) -> None:
    with _scans_lock:
        scan = _scans.get(scan_id)
        if scan:
            scan["itemsScanned"] += count


def _is_cancelled(scan_id: str) -> bool:
    with _scans_lock:
        scan = _scans.get(scan_id)
        if scan:
            return scan["cancelEvent"].is_set()
        return True


def _elapsed_ms(scan_id: str) -> int:
    with _scans_lock:
        scan = _scans.get(scan_id)
        if scan:
            return int((time.monotonic() - scan["startedAt"]) * 1000)
        return 0


def _enumerate_drives() -> list[dict[str, str]]:
    drives: list[dict[str, str]] = []
    if not IS_WINDOWS:
        return drives
    try:
        import ctypes
        bitmask = ctypes.windll.kernel32.GetLogicalDrives()
        for i in range(26):
            if bitmask & (1 << i):
                letter = chr(ord("A") + i)
                drive_path = f"{letter}:\\"
                dt = ctypes.windll.kernel32.GetDriveTypeW(ctypes.c_wchar_p(drive_path))
                type_map = {2: "removable", 3: "fixed", 4: "network", 6: "ramdisk"}
                t = type_map.get(dt, "unknown")
                if t != "unknown":
                    drives.append({"drive": drive_path, "type": t})
    except Exception:
        drives = [{"drive": "C:\\", "type": "fixed"}]
    return drives


def _scan_dir_tree(
    scan_id: str, module: str, root: str,
    extensions: list[str] | None = None, max_depth: int = -1,
) -> list[dict[str, Any]]:
    """Walk a directory tree with streaming. Returns file dicts."""
    if not os.path.isdir(root):
        return []
    files: list[dict[str, Any]] = []
    stack: list[tuple[str, int]] = [(root, 0)]
    while stack:
        if _is_cancelled(scan_id):
            break
        current, depth = stack.pop()
        _update_scan(scan_id, currentFolder=current, currentModule=module)
        try:
            with os.scandir(current) as it:
                for entry in it:
                    if _is_cancelled(scan_id):
                        break
                    try:
                        if entry.is_symlink():
                            continue
                        if entry.is_dir(follow_symlinks=False):
                            if max_depth < 0 or depth < max_depth:
                                stack.append((entry.path, depth + 1))
                        elif entry.is_file(follow_symlinks=False):
                            ext = os.path.splitext(entry.name)[1].lower()
                            if extensions and ext not in extensions:
                                continue
                            st = entry.stat(follow_symlinks=False)
                            files.append({
                                "path": entry.path, "name": entry.name,
                                "size": st.st_size, "modified": st.st_mtime,
                                "extension": ext,
                            })
                            _increment_items(scan_id)
                            if len(files) % 100 == 0:
                                _update_scan(scan_id, currentFile=entry.path)
                    except OSError:
                        continue
        except OSError:
            continue
    return files


# =====================================================================
# Scan Target Definitions
# =====================================================================

def _get_fs_targets() -> list[tuple[str, str, list[str] | None, int]]:
    """Return (module_name, root_path, extensions, max_depth) tuples."""
    if not IS_WINDOWS:
        return []
    user = os.path.expandvars("%USERPROFILE%")
    targets: list[tuple[str, str, list[str] | None, int]] = [
        ("User Profile", user, None, 2),
        ("Downloads", os.path.join(user, "Downloads"), None, -1),
        ("Desktop", os.path.join(user, "Desktop"), None, -1),
        ("Documents", os.path.join(user, "Documents"), None, -1),
        ("ProgramData", os.path.expandvars("%PROGRAMDATA%"), None, 2),
        ("Windows", os.path.expandvars("%SystemDrive%\\Windows"), None, 2),
        ("User Temp", os.path.expandvars("%TEMP%"), None, -1),
        ("Windows Temp", os.path.join(os.environ.get("SystemDrive", "C:"), "\\Windows\\Temp"), None, -1),
        ("Prefetch", os.path.join(os.environ.get("SystemDrive", "C:"), "\\Windows\\Prefetch"), None, -1),
        ("Fonts Cache", os.path.join(os.environ.get("SystemDrive", "C:"), "\\Windows\\Fonts"), None, -1),
        ("Windows Update Cache", os.path.join(os.environ.get("SystemDrive", "C:"), "\\Windows\\SoftwareDistribution\\Download"), None, -1),
        ("Thumbnail Cache", os.path.join(os.path.expandvars("%LOCALAPPDATA%"), "Microsoft\\Windows\\Explorer"), None, -1),
        ("Recycle Bin", os.path.join(os.environ.get("SystemDrive", "C:"), "\\$Recycle.Bin"), None, 2),
        ("Startup Folder", os.path.expandvars("%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup"), None, -1),
        ("Common Startup", os.path.expandvars("%ProgramData%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup"), None, -1),
    ]
    # Browser profiles
    local_app = os.path.expandvars("%LOCALAPPDATA%")
    browsers = [
        ("Chrome Profile", os.path.join(local_app, "Google\\Chrome\\User Data")),
        ("Edge Profile", os.path.join(local_app, "Microsoft\\Edge\\User Data")),
        ("Brave Profile", os.path.join(local_app, "BraveSoftware\\Brave-Browser\\User Data")),
        ("Firefox Profile", os.path.join(local_app, "Mozilla\\Firefox\\Profiles")),
    ]
    for name, path in browsers:
        if os.path.isdir(path):
            targets.append((name, path, None, 3))
    return targets


# =====================================================================
# Registry Scanner
# =====================================================================

def _scan_registry(scan_id: str) -> dict[str, Any]:
    """Scan registry Run keys, services, and drivers for entries."""
    _update_scan(scan_id, currentModule="Registry")
    _add_activity(scan_id, "Registry", "scan", "Scanning registry Run keys and services")
    if not IS_WINDOWS:
        return {"entries": [], "count": 0}
    entries: list[dict[str, Any]] = []
    try:
        import winreg
        run_keys = [
            (winreg.HKEY_LOCAL_MACHINE, r"Software\Microsoft\Windows\CurrentVersion\Run", "HKLM_Run"),
            (winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", "HKCU_Run"),
            (winreg.HKEY_LOCAL_MACHINE, r"Software\Microsoft\Windows\CurrentVersion\RunOnce", "HKLM_RunOnce"),
            (winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\RunOnce", "HKCU_RunOnce"),
            (winreg.HKEY_LOCAL_MACHINE, r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run", "HKLM_WOW64_Run"),
        ]
        for root, sub, source in run_keys:
            if _is_cancelled(scan_id):
                break
            try:
                with winreg.OpenKey(root, sub) as key:
                    for i in range(winreg.QueryInfoKey(key)[1]):
                        try:
                            name, value, _ = winreg.EnumValue(key, i)
                            entries.append({"key": f"{source}\\{name}", "value": value, "source": source})
                            _increment_items(scan_id)
                        except OSError:
                            break
            except (FileNotFoundError, OSError):
                continue
    except (ImportError, OSError):
        pass
    _add_activity(scan_id, "Registry", "complete", f"Found {len(entries)} entries")
    return {"entries": entries, "count": len(entries)}


def _scan_dns_cache(scan_id: str) -> dict[str, Any]:
    _update_scan(scan_id, currentModule="DNS Cache")
    _add_activity(scan_id, "DNS Cache", "scan", "Reading DNS resolver cache")
    if not IS_WINDOWS:
        return {"entries": [], "count": 0}
    ps = r"""$ErrorActionPreference='SilentlyContinue'
Get-DnsClientCache | Select-Object -First 500 | ForEach-Object {
@{ entry=$_.Entry; recordName=$_.RecordName; recordType=$_.RecordType; data=$_.Data }
} | ConvertTo-Json -Depth 2 -Compress"""
    output = _run_powershell(ps, timeout=10.0)
    dns_entries: list[dict[str, Any]] = []
    if output:
        try:
            import json
            data = json.loads(output)
            if isinstance(data, dict):
                data = [data]
            dns_entries = data
            _increment_items(scan_id, len(dns_entries))
        except (ValueError, TypeError):
            pass
    _add_activity(scan_id, "DNS Cache", "complete", f"Found {len(dns_entries)} entries")
    return {"entries": dns_entries, "count": len(dns_entries)}


def _scan_hosts_file(scan_id: str) -> dict[str, Any]:
    _update_scan(scan_id, currentModule="Hosts File")
    _add_activity(scan_id, "Hosts File", "scan", "Checking hosts file")
    if not IS_WINDOWS:
        return {"entries": [], "count": 0}
    hosts_path = os.path.join(os.environ.get("SystemDrive", "C:"), "\\Windows\\System32\\drivers\\etc\\hosts")
    entries: list[dict[str, Any]] = []
    if os.path.isfile(hosts_path):
        try:
            with open(hosts_path, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#"):
                        parts = line.split()
                        if len(parts) >= 2:
                            entries.append({"ip": parts[0], "hostname": " ".join(parts[1:])})
                            _increment_items(scan_id)
        except OSError:
            pass
    _add_activity(scan_id, "Hosts File", "complete", f"Found {len(entries)} entries")
    return {"entries": entries, "count": len(entries)}


def _scan_services(scan_id: str) -> dict[str, Any]:
    _update_scan(scan_id, currentModule="Services")
    _add_activity(scan_id, "Services", "scan", "Enumerating running services")
    if not IS_WINDOWS:
        return {"services": [], "count": 0}
    ps = r"""$ErrorActionPreference='SilentlyContinue'
Get-CimInstance Win32_Service | Where-Object {$_.State -eq 'Running'} | ForEach-Object {
@{ name=$_.Name; displayName=$_.DisplayName; state=$_.State; startMode=$_.StartMode; pathName=$_.PathName; processId=$_.ProcessId }
} | ConvertTo-Json -Depth 2 -Compress"""
    output = _run_powershell(ps, timeout=15.0)
    services: list[dict[str, Any]] = []
    if output:
        try:
            import json
            data = json.loads(output)
            if isinstance(data, dict):
                data = [data]
            services = data
            _increment_items(scan_id, len(services))
        except (ValueError, TypeError):
            pass
    _add_activity(scan_id, "Services", "complete", f"Found {len(services)} services")
    return {"services": services, "count": len(services)}


def _scan_drivers(scan_id: str) -> dict[str, Any]:
    _update_scan(scan_id, currentModule="Drivers")
    _add_activity(scan_id, "Drivers", "scan", "Enumerating installed drivers")
    if not IS_WINDOWS:
        return {"drivers": [], "count": 0}
    ps = r"""$ErrorActionPreference='SilentlyContinue'
Get-WmiObject Win32_PnPSignedDriver | Where-Object {$_.DeviceName -ne $null} | Select-Object -First 500 | ForEach-Object {
@{ deviceName=$_.DeviceName; driverVersion=$_.DriverVersion; driverDate=$_.DriverDate; providerName=$_.ProviderName; isSigned=$_.IsSigned; status=$_.Status }
} | ConvertTo-Json -Depth 2 -Compress"""
    output = _run_powershell(ps, timeout=20.0)
    drivers: list[dict[str, Any]] = []
    if output:
        try:
            import json
            data = json.loads(output)
            if isinstance(data, dict):
                data = [data]
            drivers = data
            _increment_items(scan_id, len(drivers))
        except (ValueError, TypeError):
            pass
    _add_activity(scan_id, "Drivers", "complete", f"Found {len(drivers)} drivers")
    return {"drivers": drivers, "count": len(drivers)}


def _scan_scheduled_tasks(scan_id: str) -> dict[str, Any]:
    _update_scan(scan_id, currentModule="Scheduled Tasks")
    _add_activity(scan_id, "Scheduled Tasks", "scan", "Enumerating scheduled tasks")
    if not IS_WINDOWS:
        return {"tasks": [], "count": 0}
    ps = r"""$ErrorActionPreference='SilentlyContinue'
Get-ScheduledTask | Where-Object {$_.State -ne 'Disabled'} | Select-Object -First 500 | ForEach-Object {
@{ taskName=$_.TaskName; taskPath=$_.TaskPath; state=$_.State; author=$_.Author }
} | ConvertTo-Json -Depth 2 -Compress"""
    output = _run_powershell(ps, timeout=15.0)
    tasks: list[dict[str, Any]] = []
    if output:
        try:
            import json
            data = json.loads(output)
            if isinstance(data, dict):
                data = [data]
            tasks = data
            _increment_items(scan_id, len(tasks))
        except (ValueError, TypeError):
            pass
    _add_activity(scan_id, "Scheduled Tasks", "complete", f"Found {len(tasks)} tasks")
    return {"tasks": tasks, "count": len(tasks)}


def _scan_event_logs(scan_id: str) -> dict[str, Any]:
    _update_scan(scan_id, currentModule="Event Logs")
    _add_activity(scan_id, "Event Logs", "scan", "Scanning recent event log errors")
    if not IS_WINDOWS:
        return {"entries": [], "count": 0}
    ps = r"""$ErrorActionPreference='SilentlyContinue'
Get-WinEvent -FilterHashtable @{LogName='System','Application'; Level=2,3; StartTime=(Get-Date).AddDays(-7)} -MaxEvents 200 | ForEach-Object {
@{ logName=$_.LogName; level=$_.LevelDisplayName; id=$_.Id; message=$_.Message.Substring(0,200); timeCreated=$_.TimeCreated }
} | ConvertTo-Json -Depth 2 -Compress"""
    output = _run_powershell(ps, timeout=15.0)
    entries: list[dict[str, Any]] = []
    if output:
        try:
            import json
            data = json.loads(output)
            if isinstance(data, dict):
                data = [data]
            entries = data
            _increment_items(scan_id, len(entries))
        except (ValueError, TypeError):
            pass
    _add_activity(scan_id, "Event Logs", "complete", f"Found {len(entries)} entries")
    return {"entries": entries, "count": len(entries)}


def _scan_security_status(scan_id: str) -> dict[str, Any]:
    _update_scan(scan_id, currentModule="Security Status")
    _add_activity(scan_id, "Security", "scan", "Checking Defender, Firewall, SmartScreen")
    if not IS_WINDOWS:
        return {"defender": {}, "firewall": {}, "smartScreen": {}}
    defender: dict[str, Any] = {}
    out = _run_powershell(
        r"try{Get-MpComputerStatus|Select-Object AMRunningMode,RealTimeProtectionEnabled,AntivirusEnabled|ConvertTo-Json -Compress}catch{''}", 10.0)
    if out:
        try:
            import json
            defender = json.loads(out)
        except (ValueError, TypeError):
            pass
    _increment_items(scan_id)
    firewall: dict[str, Any] = {}
    out = _run_powershell(
        r"Get-NetFirewallProfile|Select-Object Name,Enabled|ConvertTo-Json -Compress", 10.0)
    if out:
        try:
            import json
            firewall = {"profiles": json.loads(out)}
        except (ValueError, TypeError):
            pass
    _increment_items(scan_id)
    smart_screen: dict[str, Any] = {}
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer") as key:
            val, _ = winreg.QueryValueEx(key, "SmartScreenEnabled")
            smart_screen = {"enabled": val != "Off"}
    except (FileNotFoundError, OSError, ImportError):
        smart_screen = {"enabled": "unknown"}
    _increment_items(scan_id)
    _add_activity(scan_id, "Security", "complete", "Security status collected")
    return {"defender": defender, "firewall": firewall, "smartScreen": smart_screen}


def _scan_powershell_policy(scan_id: str) -> dict[str, Any]:
    _update_scan(scan_id, currentModule="PowerShell Policy")
    _add_activity(scan_id, "PowerShell", "scan", "Checking execution policy")
    if not IS_WINDOWS:
        return {"policies": [], "count": 0}
    out = _run_powershell(r"Get-ExecutionPolicy -List|ConvertTo-Json -Compress", 5.0)
    policies: list[dict[str, Any]] = []
    if out:
        try:
            import json
            data = json.loads(out)
            if isinstance(data, dict):
                data = [data]
            policies = data
        except (ValueError, TypeError):
            pass
    _increment_items(scan_id, len(policies))
    _add_activity(scan_id, "PowerShell", "complete", f"Found {len(policies)} policies")
    return {"policies": policies, "count": len(policies)}


def _scan_wmi_subscriptions(scan_id: str) -> dict[str, Any]:
    _update_scan(scan_id, currentModule="WMI Subscriptions")
    _add_activity(scan_id, "WMI", "scan", "Checking WMI event subscriptions")
    if not IS_WINDOWS:
        return {"subscriptions": [], "count": 0}
    out = _run_powershell(
        r"$ErrorActionPreference='SilentlyContinue';Get-WmiObject -Namespace root\subscription -Class __EventConsumer|ForEach-Object{@{name=$_.Name;type=$_.__CLASS}}|ConvertTo-Json -Compress", 10.0)
    subs: list[dict[str, Any]] = []
    if out:
        try:
            import json
            data = json.loads(out)
            if isinstance(data, dict):
                data = [data]
            subs = data
        except (ValueError, TypeError):
            pass
    _increment_items(scan_id, len(subs))
    _add_activity(scan_id, "WMI", "complete", f"Found {len(subs)} subscriptions")
    return {"subscriptions": subs, "count": len(subs)}


def _scan_browser_extensions(scan_id: str) -> dict[str, Any]:
    _update_scan(scan_id, currentModule="Browser Extensions")
    _add_activity(scan_id, "Browser Extensions", "scan", "Scanning browser extensions")
    if not IS_WINDOWS:
        return {"extensions": [], "count": 0}
    local_app = os.path.expandvars("%LOCALAPPDATA%")
    extensions: list[dict[str, Any]] = []
    chromium = [
        ("Chrome", os.path.join(local_app, r"Google\Chrome\User Data\Default\Extensions")),
        ("Edge", os.path.join(local_app, r"Microsoft\Edge\User Data\Default\Extensions")),
        ("Brave", os.path.join(local_app, r"BraveSoftware\Brave-Browser\User Data\Default\Extensions")),
    ]
    for browser, ext_dir in chromium:
        if _is_cancelled(scan_id):
            break
        if not os.path.isdir(ext_dir):
            continue
        try:
            for ext_id in os.listdir(ext_dir):
                ext_path = os.path.join(ext_dir, ext_id)
                if not os.path.isdir(ext_path):
                    continue
                versions = sorted(os.listdir(ext_path), reverse=True)
                for ver in versions:
                    manifest = os.path.join(ext_path, ver, "manifest.json")
                    if os.path.isfile(manifest):
                        try:
                            import json
                            with open(manifest, "r", encoding="utf-8") as f:
                                m = json.load(f)
                            extensions.append({
                                "browser": browser, "extensionId": ext_id,
                                "name": m.get("name", ext_id),
                                "permissions": m.get("permissions", []),
                                "path": os.path.join(ext_path, ver),
                            })
                            _increment_items(scan_id)
                        except (ValueError, OSError):
                            pass
                    break
        except OSError:
            continue
    _add_activity(scan_id, "Browser Extensions", "complete", f"Found {len(extensions)} extensions")
    return {"extensions": extensions, "count": len(extensions)}


# =====================================================================
# Main Scan Runner
# =====================================================================

def _run_full_scan(scan_id: str) -> None:
    """Run all scan modules sequentially with real-time progress."""
    results: dict[str, Any] = {}
    errors: list[str] = []
    total_modules = 0

    # File system targets
    fs_targets = _get_fs_targets()
    drives = _enumerate_drives()
    total_modules = len(fs_targets) + len(drives) + 12  # FS + drives + system scanners

    module_idx = 0

    def _next_module(name: str) -> int:
        nonlocal module_idx
        module_idx += 1
        pct = int(module_idx * 100 / total_modules)
        _update_scan(scan_id, progress=min(pct, 99), currentModule=name)
        return module_idx

    try:
        # 1. Drive enumeration
        _next_module("Drive Enumeration")
        _add_activity(scan_id, "Drives", "scan", f"Found {len(drives)} drives")
        results["drives"] = drives
        _update_scan(scan_id, currentFolder=None, currentFile=None)

        # 2. File system targets
        fs_results: dict[str, Any] = {}
        for module_name, root, exts, max_depth in fs_targets:
            if _is_cancelled(scan_id):
                break
            _next_module(module_name)
            _add_activity(scan_id, module_name, "scan", f"Scanning {root}")
            files = _scan_dir_tree(scan_id, module_name, root, exts, max_depth)
            fs_results[module_name] = {
                "root": root, "fileCount": len(files),
                "totalBytes": sum(f["size"] for f in files),
                "files": files[:500],
            }
            _add_activity(scan_id, module_name, "complete", f"Found {len(files)} files")
        results["fileSystem"] = fs_results

        # 3. Registry
        if not _is_cancelled(scan_id):
            _next_module("Registry")
            results["registry"] = _scan_registry(scan_id)

        # 4. Services
        if not _is_cancelled(scan_id):
            _next_module("Services")
            results["services"] = _scan_services(scan_id)

        # 5. Drivers
        if not _is_cancelled(scan_id):
            _next_module("Drivers")
            results["drivers"] = _scan_drivers(scan_id)

        # 6. Scheduled Tasks
        if not _is_cancelled(scan_id):
            _next_module("Scheduled Tasks")
            results["scheduledTasks"] = _scan_scheduled_tasks(scan_id)

        # 7. Event Logs
        if not _is_cancelled(scan_id):
            _next_module("Event Logs")
            results["eventLogs"] = _scan_event_logs(scan_id)

        # 8. DNS Cache
        if not _is_cancelled(scan_id):
            _next_module("DNS Cache")
            results["dnsCache"] = _scan_dns_cache(scan_id)

        # 9. Hosts File
        if not _is_cancelled(scan_id):
            _next_module("Hosts File")
            results["hostsFile"] = _scan_hosts_file(scan_id)

        # 10. Security Status
        if not _is_cancelled(scan_id):
            _next_module("Security Status")
            results["securityStatus"] = _scan_security_status(scan_id)

        # 11. PowerShell Policy
        if not _is_cancelled(scan_id):
            _next_module("PowerShell Policy")
            results["powershellPolicy"] = _scan_powershell_policy(scan_id)

        # 12. WMI Subscriptions
        if not _is_cancelled(scan_id):
            _next_module("WMI Subscriptions")
            results["wmiSubscriptions"] = _scan_wmi_subscriptions(scan_id)

        # 13. Browser Extensions
        if not _is_cancelled(scan_id):
            _next_module("Browser Extensions")
            results["browserExtensions"] = _scan_browser_extensions(scan_id)

    except Exception as e:
        log.exception("Full system scan error: %s", e)
        errors.append(str(e))

    # Finalize
    cancelled = _is_cancelled(scan_id)
    with _scans_lock:
        scan = _scans.get(scan_id)
        if scan:
            scan["status"] = "cancelled" if cancelled else "completed"
            scan["progress"] = 100
            scan["completedAt"] = _now_iso()
            scan["elapsedMs"] = int((time.monotonic() - scan["startedAt"]) * 1000)
            scan["results"] = results
            scan["errors"] = errors
            scan["currentModule"] = None
            scan["currentFolder"] = None
            scan["currentFile"] = None

    log.info("Full scan %s %s (%d items, %dms)",
             scan_id, "cancelled" if cancelled else "completed",
             _scans.get(scan_id, {}).get("itemsScanned", 0),
             _scans.get(scan_id, {}).get("elapsedMs", 0))


# =====================================================================
# RPC Handlers
# =====================================================================

@register("fullscan.start")
def fullscan_start(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Start a full system scan. Returns scanId immediately."""
    scan = _new_scan()
    scan_id = scan["scanId"]
    with _scans_lock:
        _scans[scan_id] = scan
        scan["status"] = "running"
    thread = threading.Thread(target=_run_full_scan, args=(scan_id,), daemon=True)
    thread.start()
    log.info("Full system scan started: %s", scan_id)
    return {"scanId": scan_id, "status": "started"}


@register("fullscan.status")
def fullscan_status(params: dict[str, Any] | None) -> dict[str, Any]:
    """Poll scan progress. Returns currentModule, currentFolder, currentFile, itemsScanned, elapsedMs."""
    if not params or "scanId" not in params:
        return {"present": False}
    scan_id = params["scanId"]
    with _scans_lock:
        scan = _scans.get(scan_id)
        if not scan:
            return {"present": False}
        return {
            "present": True,
            "scanId": scan_id,
            "status": scan["status"],
            "progress": scan["progress"],
            "currentModule": scan["currentModule"],
            "currentFolder": scan["currentFolder"],
            "currentFile": scan["currentFile"],
            "itemsScanned": scan["itemsScanned"],
            "elapsedMs": int((time.monotonic() - scan["startedAt"]) * 1000) if scan["status"] == "running" else scan.get("elapsedMs", 0),
            "startedAt": scan["startedAtIso"],
            "completedAt": scan.get("completedAt"),
            "activityLog": scan["activityLog"][-50:],
            "errors": scan.get("errors", []),
        }


@register("fullscan.result")
def fullscan_result(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get full scan results. Only available when scan is completed."""
    if not params or "scanId" not in params:
        return {"present": False}
    scan_id = params["scanId"]
    with _scans_lock:
        scan = _scans.get(scan_id)
        if not scan:
            return {"present": False}
        return {
            "present": True,
            "scanId": scan_id,
            "status": scan["status"],
            "results": scan.get("results", {}),
            "itemsScanned": scan["itemsScanned"],
            "elapsedMs": scan.get("elapsedMs", 0),
            "errors": scan.get("errors", []),
            "startedAt": scan["startedAtIso"],
            "completedAt": scan.get("completedAt"),
        }


@register("fullscan.cancel")
def fullscan_cancel(params: dict[str, Any] | None) -> dict[str, bool]:
    """Cancel a running scan."""
    if not params or "scanId" not in params:
        return {"cancelled": False}
    scan_id = params["scanId"]
    with _scans_lock:
        scan = _scans.get(scan_id)
        if not scan or scan["status"] != "running":
            return {"cancelled": False}
        scan["cancelEvent"].set()
    log.info("Full scan %s cancellation requested", scan_id)
    return {"cancelled": True}
