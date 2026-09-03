"""Registry Cleaner engine — scan, back up, fix, and restore invalid entries.

Safety model:
  * Only well-understood, low-risk categories are scanned.
  * Every value removed is first serialised to a JSON backup so it can be
    restored verbatim (name, type, and data).
  * All Windows API access is guarded so the module imports cleanly on
    non-Windows platforms (where every scan simply returns empty).
"""

from __future__ import annotations

import json
import logging
import os
import platform
import time
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any, Iterable

log = logging.getLogger("avs.registry-cleaner")

IS_WINDOWS = platform.system() == "Windows"

if IS_WINDOWS:
    import winreg
else:  # pragma: no cover - non-Windows stub
    winreg = None  # type: ignore[assignment]


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

CATEGORIES: dict[str, str] = {
    "startup": "Obsolete startup entries",
    "app_paths": "Invalid application paths",
    "shared_dlls": "Missing shared DLLs",
    "uninstall": "Leftover uninstall entries",
    "muicache": "Invalid MUICache entries",
    "file_extensions": "Unused file extensions",
    "installer_cache": "Installer cache leftovers",
    "com_clsid": "Missing COM/CLSID entries",
}


@dataclass
class RegistryIssue:
    id: str
    category: str
    description: str
    hive: str            # e.g. "HKCU" / "HKLM"
    subkey: str          # path under the hive
    value_name: str      # "" means the (Default) value
    value_data: str
    severity: str        # "low" | "medium"

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "category": self.category,
            "description": self.description,
            "hive": self.hive,
            "subkey": self.subkey,
            "valueName": self.value_name,
            "valueData": self.value_data,
            "severity": self.severity,
        }

    @staticmethod
    def from_dict(d: dict[str, Any]) -> "RegistryIssue":
        return RegistryIssue(
            id=d.get("id", str(uuid.uuid4())),
            category=d.get("category", ""),
            description=d.get("description", ""),
            hive=d["hive"],
            subkey=d["subkey"],
            value_name=d.get("valueName", ""),
            value_data=d.get("valueData", ""),
            severity=d.get("severity", "low"),
        )


@dataclass
class ScanResult:
    issues: list[RegistryIssue] = field(default_factory=list)

    @property
    def total(self) -> int:
        return len(self.issues)

    def breakdown(self) -> dict[str, int]:
        out: dict[str, int] = {}
        for issue in self.issues:
            out[issue.category] = out.get(issue.category, 0) + 1
        return out


# ---------------------------------------------------------------------------
# Backup storage
# ---------------------------------------------------------------------------


def _backups_dir() -> str:
    base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    path = os.path.join(base, "AVSPCOptimizer", "registry_backups")
    os.makedirs(path, exist_ok=True)
    return path


# ---------------------------------------------------------------------------
# winreg helpers
# ---------------------------------------------------------------------------

_HIVE_MAP: dict[str, Any] = {}
if IS_WINDOWS:
    _HIVE_MAP = {
        "HKCU": winreg.HKEY_CURRENT_USER,
        "HKLM": winreg.HKEY_LOCAL_MACHINE,
        "HKCR": winreg.HKEY_CLASSES_ROOT,
    }


def _open_key(hive: str, subkey: str, access: int):
    root = _HIVE_MAP[hive]
    return winreg.OpenKey(root, subkey, 0, access)


def _iter_values(hive: str, subkey: str) -> Iterable[tuple[str, Any, int]]:
    """Yield (name, data, type) for each value in a key. Best-effort."""
    try:
        with _open_key(hive, subkey, winreg.KEY_READ) as key:
            i = 0
            while True:
                try:
                    name, data, vtype = winreg.EnumValue(key, i)
                except OSError:
                    break
                yield name, data, vtype
                i += 1
    except OSError:
        return


def _iter_subkeys(hive: str, subkey: str) -> Iterable[str]:
    try:
        with _open_key(hive, subkey, winreg.KEY_READ) as key:
            i = 0
            while True:
                try:
                    name = winreg.EnumKey(key, i)
                except OSError:
                    break
                yield name
                i += 1
    except OSError:
        return


def _read_value(hive: str, subkey: str, name: str) -> tuple[Any, int] | None:
    try:
        with _open_key(hive, subkey, winreg.KEY_READ) as key:
            data, vtype = winreg.QueryValueEx(key, name)
            return data, vtype
    except OSError:
        return None


def _extract_exe_path(command: str) -> str | None:
    """Best-effort extraction of the executable path from a command string."""
    if not command:
        return None
    command = os.path.expandvars(command).strip()
    if command.startswith('"'):
        end = command.find('"', 1)
        if end != -1:
            return command[1:end]
    # No quotes: take up to the first .exe token, else the first whitespace.
    lower = command.lower()
    idx = lower.find(".exe")
    if idx != -1:
        return command[: idx + 4]
    return command.split(" ")[0]


def _path_exists(path: str | None) -> bool:
    if not path:
        return False
    return os.path.exists(os.path.expandvars(path.strip().strip('"')))


# ---------------------------------------------------------------------------
# Scanners (each yields RegistryIssue)
# ---------------------------------------------------------------------------

_RUN_LOCATIONS = [
    ("HKCU", r"Software\Microsoft\Windows\CurrentVersion\Run"),
    ("HKLM", r"Software\Microsoft\Windows\CurrentVersion\Run"),
    ("HKLM", r"Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Run"),
]


def _scan_startup() -> list[RegistryIssue]:
    issues: list[RegistryIssue] = []
    for hive, subkey in _RUN_LOCATIONS:
        for name, data, _ in _iter_values(hive, subkey):
            if not isinstance(data, str):
                continue
            exe = _extract_exe_path(data)
            if exe and not _path_exists(exe):
                issues.append(
                    RegistryIssue(
                        id=str(uuid.uuid4()),
                        category="startup",
                        description=f"Startup '{name}' points to a missing file",
                        hive=hive,
                        subkey=subkey,
                        value_name=name,
                        value_data=str(data),
                        severity="low",
                    )
                )
    return issues


_APP_PATHS = [
    ("HKLM", r"Software\Microsoft\Windows\CurrentVersion\App Paths"),
    ("HKCU", r"Software\Microsoft\Windows\CurrentVersion\App Paths"),
]


def _scan_app_paths() -> list[RegistryIssue]:
    issues: list[RegistryIssue] = []
    for hive, base in _APP_PATHS:
        for app in _iter_subkeys(hive, base):
            sub = base + "\\" + app
            res = _read_value(hive, sub, "")  # default value = exe path
            if not res:
                continue
            data, _ = res
            if isinstance(data, str) and data and not _path_exists(data):
                issues.append(
                    RegistryIssue(
                        id=str(uuid.uuid4()),
                        category="app_paths",
                        description=f"App path '{app}' references a missing file",
                        hive=hive,
                        subkey=sub,
                        value_name="",
                        value_data=str(data),
                        severity="low",
                    )
                )
    return issues


def _scan_shared_dlls() -> list[RegistryIssue]:
    issues: list[RegistryIssue] = []
    hive, subkey = "HKLM", r"Software\Microsoft\Windows\CurrentVersion\SharedDLLs"
    for name, _data, _ in _iter_values(hive, subkey):
        # For SharedDLLs the value NAME is the DLL path.
        if name and not _path_exists(name):
            issues.append(
                RegistryIssue(
                    id=str(uuid.uuid4()),
                    category="shared_dlls",
                    description="Shared DLL reference no longer exists",
                    hive=hive,
                    subkey=subkey,
                    value_name=name,
                    value_data=name,
                    severity="low",
                )
            )
    return issues


_UNINSTALL = [
    ("HKLM", r"Software\Microsoft\Windows\CurrentVersion\Uninstall"),
    ("HKLM", r"Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
    ("HKCU", r"Software\Microsoft\Windows\CurrentVersion\Uninstall"),
]


def _scan_uninstall() -> list[RegistryIssue]:
    issues: list[RegistryIssue] = []
    for hive, base in _UNINSTALL:
        for app in _iter_subkeys(hive, base):
            sub = base + "\\" + app
            install_loc = _read_value(hive, sub, "InstallLocation")
            uninstall = _read_value(hive, sub, "UninstallString")
            display = _read_value(hive, sub, "DisplayName")
            name = display[0] if display and isinstance(display[0], str) else app
            loc = install_loc[0] if install_loc else None
            unins = uninstall[0] if uninstall else None
            # Only flag when there IS an install location that no longer exists
            # AND the uninstaller is also missing — a strong signal of leftovers.
            if loc and isinstance(loc, str) and loc.strip() and not _path_exists(loc):
                unins_exe = _extract_exe_path(unins) if isinstance(unins, str) else None
                if not unins_exe or not _path_exists(unins_exe):
                    issues.append(
                        RegistryIssue(
                            id=str(uuid.uuid4()),
                            category="uninstall",
                            description=f"Leftover uninstall entry for '{name}'",
                            hive=hive,
                            subkey=sub,
                            value_name="InstallLocation",
                            value_data=str(loc),
                            severity="medium",
                        )
                    )
    return issues


def _scan_muicache() -> list[RegistryIssue]:
    issues: list[RegistryIssue] = []
    hive = "HKCU"
    subkey = r"Software\Classes\Local Settings\Software\Microsoft\Windows\Shell\MuiCache"
    for name, _data, _ in _iter_values(hive, subkey):
        if not name or "." not in name:
            continue
        # MUICache names are usually full exe paths (optionally with a suffix).
        candidate = name.split(".ApplicationCompany")[0].split(".FriendlyAppName")[0]
        if candidate.lower().endswith(".exe") and not _path_exists(candidate):
            issues.append(
                RegistryIssue(
                    id=str(uuid.uuid4()),
                    category="muicache",
                    description="MUICache entry for a missing program",
                    hive=hive,
                    subkey=subkey,
                    value_name=name,
                    value_data=str(name),
                    severity="low",
                )
            )
    return issues


def _scan_file_extensions() -> list[RegistryIssue]:
    """Scan HKCR\\.ext keys that map to programs no longer on disk.

    For each file extension key under HKCR (e.g. ``.pdf``, ``.docx``),
    check the default value — it typically references a ProgID (e.g.
    ``AcroExch.Document``). Then check if that ProgID's shell open command
    points to an executable that still exists. If not, the extension
    mapping is obsolete.
    """
    issues: list[RegistryIssue] = []
    hive = "HKCR"
    # Enumerate all subkeys starting with a dot
    try:
        with _open_key(hive, "", winreg.KEY_READ) as key:
            i = 0
            while True:
                try:
                    name = winreg.EnumKey(key, i)
                except OSError:
                    break
                i += 1
                if not name.startswith("."):
                    continue
                # Read the default value — it's the ProgID
                prog_id_res = _read_value(hive, name, "")
                if not prog_id_res:
                    continue
                prog_id, _ = prog_id_res
                if not isinstance(prog_id, str) or not prog_id:
                    continue
                # Check the ProgID's shell\\open\\command
                cmd_subkey = f"{prog_id}\\shell\\open\\command"
                cmd_res = _read_value(hive, cmd_subkey, "")
                if not cmd_res:
                    continue
                cmd, _ = cmd_res
                if not isinstance(cmd, str) or not cmd:
                    continue
                exe = _extract_exe_path(cmd)
                if exe and not _path_exists(exe):
                    issues.append(
                        RegistryIssue(
                            id=str(uuid.uuid4()),
                            category="file_extensions",
                            description=f"File extension '{name}' maps to missing program '{prog_id}'",
                            hive=hive,
                            subkey=name,
                            value_name="",
                            value_data=str(prog_id),
                            severity="low",
                        )
                    )
    except OSError:
        pass
    return issues


def _scan_installer_cache() -> list[RegistryIssue]:
    """Check HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Installer\\UserData.

    Each subkey under UserData represents a user/security context.
    Under each, ``Components`` and ``Products`` contain component/product
    entries. We check if the component's install path (KeyPath) still
    exists on disk. Missing paths indicate leftover installer cache.
    """
    issues: list[RegistryIssue] = []
    hive = "HKLM"
    base = r"Software\Microsoft\Windows\CurrentVersion\Installer\UserData"
    for user_sid in _iter_subkeys(hive, base):
        components_base = f"{base}\\{user_sid}\\Components"
        for component_guid in _iter_subkeys(hive, components_base):
            comp_subkey = f"{components_base}\\{component_guid}"
            for name, data, _ in _iter_values(hive, comp_subkey):
                # In the Components key, value names are product GUIDs
                # and the data is the file path (KeyPath).
                if isinstance(data, str) and data and not _path_exists(data):
                    issues.append(
                        RegistryIssue(
                            id=str(uuid.uuid4()),
                            category="installer_cache",
                            description=f"Installer component '{component_guid}' references missing file",
                            hive=hive,
                            subkey=comp_subkey,
                            value_name=name,
                            value_data=str(data),
                            severity="low",
                        )
                    )
    return issues


def _scan_com_clsid() -> list[RegistryIssue]:
    """Scan HKCR\\CLSID for COM objects whose InprocServer32/LocalServer32 points to a missing file.

    Each CLSID GUID key under HKCR\\CLSID may have an ``InprocServer32`` or
    ``LocalServer32`` subkey whose default value is the path to the DLL or EXE
    that implements the COM object. If that file no longer exists, the CLSID
    entry is a leftover from an uninstalled application.

    We only flag entries where the server path is a real filesystem path
    (not a system placeholder like ``mscoree.dll`` or ``oleaut32.dll``).
    """
    issues: list[RegistryIssue] = []
    hive = "HKCR"
    base = r"CLSID"
    # System DLLs that are always present — never flag these
    _SYSTEM_SERVERS = {
        "mscoree.dll", "oleaut32.dll", "ole32.dll", "actxprxy.dll",
        "shdocvw.dll", "shell32.dll", "urlmon.dll", "mshtml.dll",
        "jscript.dll", "vbscript.dll", "scrrun.dll",
    }
    for clsid in _iter_subkeys(hive, base):
        clsid_sub = f"{base}\\{clsid}"
        for server_type in ("InprocServer32", "LocalServer32", "InprocHandler32"):
            server_sub = f"{clsid_sub}\\{server_type}"
            res = _read_value(hive, server_sub, "")
            if not res:
                continue
            server_path, _ = res
            if not isinstance(server_path, str) or not server_path:
                continue
            # Skip system DLLs
            server_lower = server_path.strip('"').lower()
            if any(sys_dll in server_lower for sys_dll in _SYSTEM_SERVERS):
                continue
            exe = _extract_exe_path(server_path)
            if exe and not _path_exists(exe):
                issues.append(
                    RegistryIssue(
                        id=str(uuid.uuid4()),
                        category="com_clsid",
                        description=f"COM CLSID '{clsid}' {server_type} references missing file",
                        hive=hive,
                        subkey=server_sub,
                        value_name="",
                        value_data=str(server_path),
                        severity="low",
                    )
                )
    return issues


_SCANNERS = {
    "startup": _scan_startup,
    "app_paths": _scan_app_paths,
    "shared_dlls": _scan_shared_dlls,
    "uninstall": _scan_uninstall,
    "muicache": _scan_muicache,
    "file_extensions": _scan_file_extensions,
    "installer_cache": _scan_installer_cache,
    "com_clsid": _scan_com_clsid,
}


def scan_registry(categories: Iterable[str] | None = None) -> ScanResult:
    """Scan the selected categories (or all) for invalid registry entries."""
    result = ScanResult()
    if not IS_WINDOWS:
        return result
    selected = list(categories) if categories else list(_SCANNERS.keys())
    for cat in selected:
        scanner = _SCANNERS.get(cat)
        if not scanner:
            continue
        try:
            result.issues.extend(scanner())
        except Exception as e:  # noqa: BLE001
            log.warning("Registry scan for %s failed: %s", cat, e)
    return result


# ---------------------------------------------------------------------------
# Fix / backup / restore
# ---------------------------------------------------------------------------


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _write_backup(issues: list[RegistryIssue]) -> str:
    """Serialise the pre-delete state of each issue to a JSON backup file."""
    backup_id = time.strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:8]
    entries: list[dict[str, Any]] = []
    for issue in issues:
        res = _read_value(issue.hive, issue.subkey, issue.value_name)
        if res is None:
            continue
        data, vtype = res
        entries.append(
            {
                "hive": issue.hive,
                "subkey": issue.subkey,
                "valueName": issue.value_name,
                "valueType": vtype,
                "valueData": data,
                "category": issue.category,
            }
        )
    payload = {
        "backupId": backup_id,
        "createdAt": _now_iso(),
        "count": len(entries),
        "entries": entries,
    }
    path = os.path.join(_backups_dir(), backup_id + ".json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2, default=str)
    return backup_id


def _delete_value(hive: str, subkey: str, value_name: str) -> None:
    with _open_key(hive, subkey, winreg.KEY_SET_VALUE) as key:
        winreg.DeleteValue(key, value_name)


def fix_issues(issues: list[RegistryIssue]) -> dict[str, Any]:
    """Back up, then delete, the registry values behind each issue.

    A System Restore Point is created before any registry values are
    deleted so the user can revert if something goes wrong. This is
    best-effort — if System Protection is disabled or the process lacks
    admin privileges, the fix proceeds anyway with a logged warning.
    """
    if not IS_WINDOWS:
        return {
            "fixed": 0,
            "failed": len(issues),
            "backupId": None,
            "errors": ["Registry cleaning is only available on Windows"],
        }

    # Best-effort System Restore Point before registry changes.
    try:
        from avs_backend.system_restore import create_restore_point
        rp_result = create_restore_point("AVS AI Shield — Pre-registry-fix checkpoint")
        if rp_result.success:
            log.info("Restore point created (seq=%s) before registry fix", rp_result.sequence_number)
        else:
            log.warning("Restore point creation failed (non-blocking): %s", rp_result.error)
    except Exception as e:  # noqa: BLE001
        log.warning("Restore point creation error (non-blocking): %s", e)

    backup_id = _write_backup(issues)
    fixed = 0
    errors: list[str] = []
    for issue in issues:
        try:
            _delete_value(issue.hive, issue.subkey, issue.value_name)
            fixed += 1
        except OSError as e:
            errors.append(f"{issue.hive}\\{issue.subkey}:{issue.value_name} — {e}")

    return {
        "fixed": fixed,
        "failed": len(issues) - fixed,
        "backupId": backup_id,
        "errors": errors,
    }


def list_backups() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    try:
        for fname in sorted(os.listdir(_backups_dir()), reverse=True):
            if not fname.endswith(".json"):
                continue
            path = os.path.join(_backups_dir(), fname)
            try:
                with open(path, encoding="utf-8") as fh:
                    payload = json.load(fh)
                out.append(
                    {
                        "backupId": payload.get("backupId", fname[:-5]),
                        "createdAt": payload.get("createdAt"),
                        "count": payload.get("count", 0),
                    }
                )
            except (OSError, json.JSONDecodeError):
                continue
    except OSError:
        pass
    return out


def restore_backup(backup_id: str) -> dict[str, Any]:
    """Re-write every value captured in a backup file."""
    if not IS_WINDOWS:
        return {"success": False, "restored": 0, "errors": ["Windows only"]}

    path = os.path.join(_backups_dir(), backup_id + ".json")
    if not os.path.exists(path):
        return {"success": False, "restored": 0, "errors": ["Backup not found"]}

    with open(path, encoding="utf-8") as fh:
        payload = json.load(fh)

    restored = 0
    errors: list[str] = []
    for entry in payload.get("entries", []):
        try:
            root = _HIVE_MAP[entry["hive"]]
            # Create the key if it no longer exists, then set the value.
            key = winreg.CreateKey(root, entry["subkey"])
            try:
                winreg.SetValueEx(
                    key,
                    entry["valueName"],
                    0,
                    int(entry["valueType"]),
                    entry["valueData"],
                )
                restored += 1
            finally:
                winreg.CloseKey(key)
        except (OSError, KeyError, ValueError) as e:
            errors.append(str(e))

    return {"success": len(errors) == 0, "restored": restored, "errors": errors}


__all__ = [
    "CATEGORIES",
    "RegistryIssue",
    "ScanResult",
    "scan_registry",
    "fix_issues",
    "list_backups",
    "restore_backup",
]
