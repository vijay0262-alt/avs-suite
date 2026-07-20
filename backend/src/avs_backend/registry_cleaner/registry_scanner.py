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


_SCANNERS = {
    "startup": _scan_startup,
    "app_paths": _scan_app_paths,
    "shared_dlls": _scan_shared_dlls,
    "uninstall": _scan_uninstall,
    "muicache": _scan_muicache,
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
    """Back up, then delete, the registry values behind each issue."""
    if not IS_WINDOWS:
        return {
            "fixed": 0,
            "failed": len(issues),
            "backupId": None,
            "errors": ["Registry cleaning is only available on Windows"],
        }

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
