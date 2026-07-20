"""Uninstaller engine — enumerate installed programs and run their uninstallers.

Reads the standard Windows "Uninstall" registry locations (per-machine 64-bit,
per-machine 32-bit, and per-user), deduplicates, and exposes a launch helper
that runs the program's uninstall command.
"""

from __future__ import annotations

import logging
import os
import platform
import subprocess
from dataclasses import dataclass
from typing import Any, Iterable

log = logging.getLogger("avs.uninstaller")

IS_WINDOWS = platform.system() == "Windows"

if IS_WINDOWS:
    import winreg
else:  # pragma: no cover
    winreg = None  # type: ignore[assignment]

_NO_WINDOW = 0x08000000 if IS_WINDOWS else 0


@dataclass
class Program:
    id: str
    name: str
    publisher: str
    version: str
    install_date: str
    size_bytes: int
    install_location: str
    uninstall_string: str
    quiet_uninstall_string: str
    source: str          # "HKLM" | "HKLM32" | "HKCU"
    system_component: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "publisher": self.publisher,
            "version": self.version,
            "installDate": self.install_date,
            "sizeBytes": self.size_bytes,
            "installLocation": self.install_location,
            "uninstallString": self.uninstall_string,
            "quietUninstallString": self.quiet_uninstall_string,
            "source": self.source,
            "systemComponent": self.system_component,
        }


_UNINSTALL_LOCATIONS = [
    ("HKLM", r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
    ("HKLM32", r"SOFTWARE\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
    ("HKCU", r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
]


def _root_for(source: str):
    if source == "HKCU":
        return winreg.HKEY_CURRENT_USER
    return winreg.HKEY_LOCAL_MACHINE


def _reg_value(key, name: str) -> Any:
    try:
        value, _ = winreg.QueryValueEx(key, name)
        return value
    except OSError:
        return None


def _format_install_date(raw: Any) -> str:
    if not raw:
        return ""
    s = str(raw)
    # Common format: YYYYMMDD
    if len(s) == 8 and s.isdigit():
        return f"{s[0:4]}-{s[4:6]}-{s[6:8]}"
    return s


def _iter_subkeys(key) -> Iterable[str]:
    i = 0
    while True:
        try:
            yield winreg.EnumKey(key, i)
        except OSError:
            break
        i += 1


def list_programs(include_system: bool = False) -> list[Program]:
    """Enumerate installed programs from all uninstall registry locations."""
    if not IS_WINDOWS:
        return []

    programs: dict[str, Program] = {}

    for source, base in _UNINSTALL_LOCATIONS:
        root = _root_for(source)
        access = winreg.KEY_READ
        if source == "HKLM32":
            access |= winreg.KEY_WOW64_32KEY
        try:
            base_key = winreg.OpenKey(root, base, 0, access)
        except OSError:
            continue

        with base_key:
            for sub in _iter_subkeys(base_key):
                try:
                    with winreg.OpenKey(base_key, sub, 0, access) as k:
                        name = _reg_value(k, "DisplayName")
                        if not name:
                            continue
                        uninstall = _reg_value(k, "UninstallString") or ""
                        quiet = _reg_value(k, "QuietUninstallString") or ""
                        system_comp = bool(_reg_value(k, "SystemComponent"))
                        release_type = _reg_value(k, "ReleaseType") or ""
                        parent = _reg_value(k, "ParentKeyName") or ""

                        # Skip updates/hotfixes and system components by default.
                        if not include_system:
                            if system_comp:
                                continue
                            if release_type in ("Security Update", "Update", "Hotfix"):
                                continue
                            if parent:
                                continue
                            if not uninstall and not quiet:
                                continue

                        size = _reg_value(k, "EstimatedSize") or 0
                        try:
                            size_bytes = int(size) * 1024  # EstimatedSize is in KB
                        except (TypeError, ValueError):
                            size_bytes = 0

                        prog = Program(
                            id=f"{source}:{sub}",
                            name=str(name),
                            publisher=str(_reg_value(k, "Publisher") or ""),
                            version=str(_reg_value(k, "DisplayVersion") or ""),
                            install_date=_format_install_date(_reg_value(k, "InstallDate")),
                            size_bytes=size_bytes,
                            install_location=str(_reg_value(k, "InstallLocation") or ""),
                            uninstall_string=str(uninstall),
                            quiet_uninstall_string=str(quiet),
                            source=source,
                            system_component=system_comp,
                        )
                        # Deduplicate by name+version (32/64-bit views can overlap).
                        dedup_key = f"{prog.name}\u0000{prog.version}"
                        programs.setdefault(dedup_key, prog)
                except OSError:
                    continue

    return sorted(programs.values(), key=lambda p: p.name.lower())


def uninstall_program(program: dict[str, Any], quiet: bool = False) -> dict[str, Any]:
    """Launch a program's uninstaller.

    The uninstaller runs detached; most Windows uninstallers present their own
    UI, so we launch and return immediately rather than block the RPC loop.
    """
    if not IS_WINDOWS:
        return {"success": False, "message": "Uninstalling is only available on Windows"}

    quiet_cmd = program.get("quietUninstallString") or ""
    normal_cmd = program.get("uninstallString") or ""
    command = quiet_cmd if (quiet and quiet_cmd) else normal_cmd

    if not command:
        return {"success": False, "message": "No uninstall command is available for this program"}

    try:
        # Launch through the shell so registry commands with arguments work.
        subprocess.Popen(command, shell=True, creationflags=_NO_WINDOW)
        return {"success": True, "message": "Uninstaller launched", "launched": True}
    except Exception as e:  # noqa: BLE001
        log.error("Failed to launch uninstaller: %s", e)
        return {"success": False, "message": str(e)}


def scan_leftovers(program: dict[str, Any]) -> dict[str, Any]:
    """Report leftover folders for a program (best-effort, read-only)."""
    leftovers: list[str] = []
    if not IS_WINDOWS:
        return {"leftovers": leftovers}

    candidates: list[str] = []
    install_loc = program.get("installLocation") or ""
    if install_loc:
        candidates.append(install_loc)

    name = program.get("name") or ""
    publisher = program.get("publisher") or ""
    for base_env in ("APPDATA", "LOCALAPPDATA", "PROGRAMDATA"):
        base = os.environ.get(base_env)
        if not base:
            continue
        for token in (name, publisher):
            token = token.strip()
            if token:
                candidates.append(os.path.join(base, token))

    seen: set[str] = set()
    for path in candidates:
        norm = os.path.normpath(os.path.expandvars(path))
        if norm in seen:
            continue
        seen.add(norm)
        if norm and os.path.isdir(norm):
            leftovers.append(norm)

    return {"leftovers": leftovers}


__all__ = ["Program", "list_programs", "uninstall_program", "scan_leftovers"]
