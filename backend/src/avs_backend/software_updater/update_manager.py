"""Software Updater engine — detect and apply application updates via winget.

Uses the Windows Package Manager (``winget``) which ships with modern Windows.
If winget is unavailable, the module degrades gracefully and reports that.
"""

from __future__ import annotations

import logging
import platform
import shutil
import subprocess
from dataclasses import dataclass
from typing import Any

log = logging.getLogger("avs.software-updater")

IS_WINDOWS = platform.system() == "Windows"
_NO_WINDOW = 0x08000000 if IS_WINDOWS else 0


@dataclass
class UpgradeItem:
    name: str
    package_id: str
    current_version: str
    available_version: str
    source: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "packageId": self.package_id,
            "currentVersion": self.current_version,
            "availableVersion": self.available_version,
            "source": self.source,
        }


def winget_available() -> bool:
    """Return True when the winget executable is on PATH."""
    if not IS_WINDOWS:
        return False
    return shutil.which("winget") is not None


def _run(args: list[str], timeout: float) -> str | None:
    try:
        proc = subprocess.run(
            args,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            creationflags=_NO_WINDOW,
        )
        return proc.stdout or ""
    except Exception as e:  # noqa: BLE001
        log.warning("winget command failed: %s", e)
        return None


def _find_header(lines: list[str]) -> int:
    """Locate the table header row (the one containing Name and Id)."""
    for idx, line in enumerate(lines):
        if "Name" in line and "Id" in line and "Version" in line:
            return idx
    return -1


def _parse_upgrade_table(output: str) -> list[UpgradeItem]:
    """Parse winget's column-aligned upgrade table using header offsets."""
    lines = [ln.rstrip("\n") for ln in output.splitlines()]
    # Drop spinner/progress artifacts (lines with control chars).
    lines = [ln for ln in lines if ln.strip() and "\r" not in ln]

    header_idx = _find_header(lines)
    if header_idx == -1:
        return []

    header = lines[header_idx]
    col_name = header.find("Name")
    col_id = header.find("Id")
    col_version = header.find("Version")
    col_available = header.find("Available")
    col_source = header.find("Source")
    if min(col_name, col_id, col_version, col_available) < 0:
        return []

    items: list[UpgradeItem] = []
    for line in lines[header_idx + 1 :]:
        # Stop at separator or summary lines.
        if set(line.strip()) <= {"-"}:
            continue
        if len(line) < col_available:
            continue
        if "upgrades available" in line.lower() or "package(s)" in line.lower():
            continue

        name = line[col_name:col_id].strip()
        pkg_id = line[col_id:col_version].strip()
        current = line[col_version:col_available].strip()
        if col_source > col_available:
            available = line[col_available:col_source].strip()
            source = line[col_source:].strip()
        else:
            available = line[col_available:].strip()
            source = ""

        if not name or not pkg_id:
            continue
        items.append(
            UpgradeItem(
                name=name,
                package_id=pkg_id,
                current_version=current,
                available_version=available,
                source=source,
            )
        )
    return items


def list_upgrades() -> dict[str, Any]:
    """List applications with available upgrades."""
    if not winget_available():
        return {
            "available": False,
            "reason": "Windows Package Manager (winget) is not installed",
            "upgrades": [],
        }

    output = _run(
        [
            "winget",
            "upgrade",
            "--include-unknown",
            "--accept-source-agreements",
        ],
        timeout=60.0,
    )
    if output is None:
        return {"available": True, "reason": "winget query failed", "upgrades": []}

    items = _parse_upgrade_table(output)
    return {
        "available": True,
        "reason": None,
        "upgrades": [i.to_dict() for i in items],
        "total": len(items),
    }


def upgrade_package(package_id: str) -> dict[str, Any]:
    """Launch a silent winget upgrade for a single package (detached)."""
    if not winget_available():
        return {"success": False, "message": "winget is not available"}
    if not package_id:
        return {"success": False, "message": "Missing package id"}

    try:
        subprocess.Popen(
            [
                "winget",
                "upgrade",
                "--id",
                package_id,
                "--silent",
                "--accept-source-agreements",
                "--accept-package-agreements",
            ],
            creationflags=_NO_WINDOW,
        )
        return {"success": True, "message": "Update started", "launched": True}
    except Exception as e:  # noqa: BLE001
        log.error("Failed to start upgrade for %s: %s", package_id, e)
        return {"success": False, "message": str(e)}


def upgrade_all() -> dict[str, Any]:
    """Launch a silent winget upgrade for all packages (detached)."""
    if not winget_available():
        return {"success": False, "message": "winget is not available"}
    try:
        subprocess.Popen(
            [
                "winget",
                "upgrade",
                "--all",
                "--silent",
                "--accept-source-agreements",
                "--accept-package-agreements",
            ],
            creationflags=_NO_WINDOW,
        )
        return {"success": True, "message": "Updating all packages", "launched": True}
    except Exception as e:  # noqa: BLE001
        log.error("Failed to start upgrade-all: %s", e)
        return {"success": False, "message": str(e)}


__all__ = [
    "UpgradeItem",
    "winget_available",
    "list_upgrades",
    "upgrade_package",
    "upgrade_all",
]
