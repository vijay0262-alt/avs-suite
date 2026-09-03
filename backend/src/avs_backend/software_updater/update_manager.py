"""Software Updater engine — detect and apply application updates via winget.

Uses the Windows Package Manager (``winget``) which ships with modern Windows.
If winget is unavailable, the module degrades gracefully and reports that.
"""

from __future__ import annotations

import logging
import platform
import re
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
    upgrades = [i.to_dict() for i in items]

    # Add vulnerability assessment to each upgrade
    for upgrade in upgrades:
        vuln = _assess_vulnerability(upgrade["name"], upgrade["currentVersion"], upgrade["availableVersion"])
        upgrade["vulnerability"] = vuln

    # Count vulnerable apps
    vulnerable_count = sum(1 for u in upgrades if u.get("vulnerability", {}).get("is_vulnerable"))

    return {
        "available": True,
        "reason": None,
        "upgrades": upgrades,
        "total": len(upgrades),
        "vulnerable_count": vulnerable_count,
    }


# Known-vulnerable software patterns — apps where outdated versions
# have known CVEs and should be treated as security risks.
_VULNERABLE_APPS = {
    "chrome": {"min_safe": "120.0", "reason": "Outdated Chrome has known critical vulnerabilities"},
    "firefox": {"min_safe": "120.0", "reason": "Outdated Firefox has known security vulnerabilities"},
    "adobe acrobat": {"min_safe": "23.0", "reason": "Outdated Adobe Acrobat has known RCE vulnerabilities"},
    "adobe reader": {"min_safe": "23.0", "reason": "Outdated Adobe Reader has known RCE vulnerabilities"},
    "java": {"min_safe": "17.0", "reason": "Outdated Java has known security vulnerabilities"},
    "flash player": {"min_safe": "999.0", "reason": "Flash Player is end-of-life and should be removed"},
    "7-zip": {"min_safe": "23.01", "reason": "Outdated 7-Zip has known vulnerabilities"},
    "vlc": {"min_safe": "3.0.18", "reason": "Outdated VLC has known vulnerabilities"},
    "zoom": {"min_safe": "5.16", "reason": "Outdated Zoom has known security vulnerabilities"},
    "skype": {"min_safe": "8.100", "reason": "Outdated Skype has known vulnerabilities"},
    "notepad++": {"min_safe": "8.6", "reason": "Outdated Notepad++ has known vulnerabilities"},
    "winrar": {"min_safe": "6.23", "reason": "Outdated WinRAR has known RCE vulnerabilities"},
    "ccleaner": {"min_safe": "6.15", "reason": "Outdated CCleaner has known vulnerabilities"},
    "opera": {"min_safe": "120.0", "reason": "Outdated Opera has known vulnerabilities"},
    "edge": {"min_safe": "120.0", "reason": "Outdated Edge has known vulnerabilities"},
    "brave": {"min_safe": "120.0", "reason": "Outdated Brave has known vulnerabilities"},
    "libreoffice": {"min_safe": "7.6", "reason": "Outdated LibreOffice has known vulnerabilities"},
    "itunes": {"min_safe": "12.13", "reason": "Outdated iTunes has known vulnerabilities"},
    "python": {"min_safe": "3.11", "reason": "Outdated Python has known security vulnerabilities"},
    "node": {"min_safe": "20.0", "reason": "Outdated Node.js has known vulnerabilities"},
}


def _parse_version(version: str) -> list[int]:
    """Parse a version string into a list of integers.

    Handles formats like '1.2.3', '1.2.3-beta', '1.2.3.4', 'v1.2'.
    Returns an empty list if no numeric segments are found.
    """
    if not version or not version.strip():
        return []
    # Extract all numeric segments from the version string
    segments = re.findall(r'\d+', version)
    return [int(s) for s in segments]


def _assess_vulnerability(name: str, current_version: str, available_version: str) -> dict[str, Any]:
    """Assess whether an outdated app is a known security vulnerability.

    Returns a dict with:
        is_vulnerable: bool
        severity: "high" | "medium" | "low"
        reason: str
    """
    name_lower = name.lower().strip()

    for app_key, vuln_info in _VULNERABLE_APPS.items():
        if app_key in name_lower:
            # Check if current version is below the safe minimum
            try:
                current_parts = _parse_version(current_version)
                safe_parts = _parse_version(vuln_info["min_safe"])
                # If we couldn't parse the current version, don't claim vulnerable
                if not current_parts:
                    break
                # Pad to same length
                while len(current_parts) < len(safe_parts):
                    current_parts.append(0)
                while len(safe_parts) < len(current_parts):
                    safe_parts.append(0)

                is_outdated = current_parts < safe_parts

                if is_outdated:
                    # Determine severity
                    if app_key in ("flash player", "java", "adobe acrobat", "adobe reader", "winrar"):
                        severity = "high"
                    elif app_key in ("chrome", "firefox", "edge", "brave", "opera"):
                        severity = "high"
                    else:
                        severity = "medium"

                    return {
                        "is_vulnerable": True,
                        "severity": severity,
                        "reason": vuln_info["reason"],
                        "recommended_version": available_version,
                    }
            except Exception:
                pass
            break

    # Not in the known-vulnerable list — still outdated but not a known CVE
    return {
        "is_vulnerable": False,
        "severity": "low",
        "reason": "Update available",
        "recommended_version": available_version,
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
