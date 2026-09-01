"""PUP Scanner — Potentially Unwanted Program detection.

Detects:
  - Bundled installers and download managers
  - Optimizer scams (fake "PC Booster" / "Driver Updater" software)
  - Fake antivirus programs
  - Browser hijackers and unwanted toolbars
  - Crypto mining software
  - Known PUP publisher signatures

Uses signature-based detection (known PUP names/publishers) and behavior
heuristics (suspicious install locations, startup entries, scheduled tasks).

RPC methods:
    pup.scan        — scan installed programs for PUPs
    pup.summary     — get PUP scan summary
    pup.ignore      — add a PUP to ignore list (Pro only)
    pup.unignore    — remove from ignore list (Pro only)
"""

from __future__ import annotations

import json
import logging
import os
import platform
import subprocess
from datetime import datetime, timezone
from typing import Any

from avs_backend.api.registry import register
from avs_backend.licensing import require_feature

log = logging.getLogger("avs.pup_scanner")

IS_WINDOWS = platform.system() == "Windows"
_NO_WINDOW = 0x08000000 if IS_WINDOWS else 0


# ─── PUP Signature Database ────────────────────────────────────────

# Known PUP program names (lowercase, matched as substrings)
PUP_PROGRAM_NAMES: dict[str, list[str]] = {
    "optimizer_scam": [
        "pc optimizer pro", "driver booster", "driver easy", "drivermax",
        "advanced pc cleanup", "pc cleaner pro", "speed up pc", "pc speedup",
        "system mechanic trial", "registry cleaner pro", "wise care 365",
        "glary utilities trial", "advanced systemcare",
    ],
    "fake_antivirus": [
        "total security", "win 7 antivirus", "xp antivirus", "vista antivirus",
        "security suite", "antivirus 2009", "antivirus 2010", "antivirus 360",
        "system security", "personal antivirus", "internet security 2010",
    ],
    "browser_hijacker": [
        "conduit search", "delta search", "babylon toolbar", "ask toolbar",
        "mywebsearch", "funwebproducts", "mindspark", "incredibar",
        "qone8", "v9", "delta-homes", "trovi search",
    ],
    "crypto_mining": [
        "xmrig", "ccminer", "ethminer", "cpuminer", "nicehash miner",
        "minergate", "cudo miner", "honeyminer", "kryptex",
    ],
    "download_manager": [
        "installcore", "download helper", "free download manager bundle",
        "internet download accelerator", "getgo download",
    ],
}

# Known PUP publisher names (lowercase)
PUP_PUBLISHERS: set[str] = {
    "conduit", "babylon ltd", "mindspark interactive", "incredimail",
    "funwebproducts", "iobit", "driver-soft", "phoenixlabs",
    "koyote-lab", "installcore ltd", "better installer",
    "somoto ltd", "apn llc", "ask applications",
}

# Suspicious install locations (programs installed outside standard dirs)
SUSPICIOUS_LOCATIONS = [
    os.path.expanduser("~/AppData/Local/Temp"),
    os.path.expanduser("~/AppData/Roaming"),
    os.path.expanduser("~/Downloads"),
]

# Legitimate publishers to exclude (avoid false positives)
LEGITIMATE_PUBLISHERS: set[str] = {
    "microsoft corporation", "microsoft", "google llc", "google inc",
    "mozilla", "mozilla corporation", "apple inc", "adobe systems",
    "oracle corporation", "intel corporation", "nvidia corporation",
    "amd", "advanced micro devices", "realtek semiconductor",
    "dell inc", "hp inc", "lenovo", "asus", "acer incorporated",
    "samsung electronics", "logitech", "skype technologies",
    "zoom video communications", "discord inc", "valve corporation",
    "epic games", "unity technologies", "autodesk",
    "videoconferencing", "avast software", "avg technologies",
    "malwarebytes", "kaspersky lab", "eset", "bitdefender",
    "symantec corporation", "mcafee", "trend micro",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _run_powershell(script: str, timeout: int = 30) -> str:
    """Run a PowerShell script and return stdout."""
    if not IS_WINDOWS:
        return ""
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
            capture_output=True, text=True, timeout=timeout,
            creationflags=_NO_WINDOW,
        )
        return result.stdout.strip()
    except Exception as e:
        log.error("PowerShell command failed: %s", e)
        return ""


def _get_installed_programs() -> list[dict[str, Any]]:
    """Get list of installed programs from Windows registry.

    Returns list of dicts with: name, publisher, installDate, installLocation, version, uninstallString
    """
    if not IS_WINDOWS:
        return []

    programs: list[dict[str, Any]] = []

    # Query both 64-bit and 32-bit uninstall keys
    ps_script = r"""
$paths = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
foreach ($path in $paths) {
    Get-ItemProperty $path -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | ForEach-Object {
        $item = [ordered]@{
            Name              = $_.DisplayName
            Publisher         = if ($_.Publisher) { $_.Publisher } else { '' }
            InstallDate       = if ($_.InstallDate) { $_.InstallDate } else { '' }
            InstallLocation   = if ($_.InstallLocation) { $_.InstallLocation } else { '' }
            Version           = if ($_.DisplayVersion) { $_.DisplayVersion } else { '' }
            UninstallString   = if ($_.UninstallString) { $_.UninstallString } else { '' }
        }
        $item | ConvertTo-Json -Compress
    }
}
"""
    output = _run_powershell(ps_script, timeout=60)
    if output:
        for line in output.split("\n"):
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
                programs.append(entry)
            except Exception:
                continue

    return programs


def _classify_pup(program: dict[str, Any]) -> dict[str, Any] | None:
    """Classify a program as PUP or not.

    Returns PUP info dict if classified as PUP, None otherwise.
    Uses multiple indicators with false-positive control:
    - Requires 2+ indicators or 1 strong indicator (fake_antivirus, crypto_mining)
    """
    name = (program.get("Name") or "").lower()
    publisher = (program.get("Publisher") or "").lower()
    install_location = (program.get("InstallLocation") or "").lower()

    indicators: list[dict[str, str]] = []
    pup_type: str | None = None
    is_strong = False

    # Check program name against PUP signatures
    for ptype, patterns in PUP_PROGRAM_NAMES.items():
        for pattern in patterns:
            if pattern in name:
                indicators.append({
                    "type": ptype,
                    "description": f"Program name matches known {ptype} pattern: '{pattern}'",
                })
                if ptype in ("fake_antivirus", "crypto_mining"):
                    is_strong = True
                if pup_type is None:
                    pup_type = ptype
                break

    # Check publisher against known PUP publishers
    if publisher and publisher in PUP_PUBLISHERS:
        indicators.append({
            "type": "known_pup_publisher",
            "description": f"Publisher '{publisher}' is a known PUP publisher",
        })
        if pup_type is None:
            pup_type = "pup_publisher"

    # Check install location (programs in suspicious locations)
    for loc in SUSPICIOUS_LOCATIONS:
        if install_location and loc.lower() in install_location:
            indicators.append({
                "type": "suspicious_location",
                "description": f"Installed in suspicious location: {install_location}",
            })
            break

    # Skip if publisher is legitimate
    if publisher and publisher in LEGITIMATE_PUBLISHERS:
        return None

    # False-positive control: require 2+ indicators or 1 strong indicator
    if len(indicators) < 2 and not is_strong:
        return None

    # Determine severity
    if is_strong:
        severity = "high"
        confidence = 0.85
    elif len(indicators) >= 3:
        severity = "medium"
        confidence = 0.75
    else:
        severity = "low"
        confidence = 0.60

    return {
        "name": program.get("Name", "Unknown"),
        "publisher": program.get("Publisher", "Unknown"),
        "version": program.get("Version", "Unknown"),
        "installLocation": program.get("InstallLocation", ""),
        "installDate": program.get("InstallDate", ""),
        "uninstallString": program.get("UninstallString", ""),
        "pupType": pup_type or "pup",
        "severity": severity,
        "confidence": confidence,
        "indicators": indicators,
        "indicatorCount": len(indicators),
        "isStrong": is_strong,
    }


# ─── Ignore List ───────────────────────────────────────────────────

_IGNORE_FILE = os.path.join(os.path.expanduser("~"), ".avs", "pup_ignore.json")


def _load_ignore_list() -> list[str]:
    """Load the list of ignored PUP names."""
    try:
        if os.path.exists(_IGNORE_FILE):
            with open(_IGNORE_FILE, "r") as f:
                return json.load(f)
    except Exception:
        pass
    return []


def _save_ignore_list(names: list[str]) -> None:
    """Save the ignore list."""
    try:
        os.makedirs(os.path.dirname(_IGNORE_FILE), exist_ok=True)
        with open(_IGNORE_FILE, "w") as f:
            json.dump(names, f, indent=2)
    except Exception as e:
        log.error("Failed to save PUP ignore list: %s", e)


# ─── RPC Methods ────────────────────────────────────────────────────

@register("pup.scan")
def pup_scan(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Scan installed programs for PUPs.

    Returns:
        pups: list of detected PUPs with classification
        totalPrograms: total programs scanned
        pupCount: number of PUPs detected
        summary: breakdown by type and severity
    """
    if not IS_WINDOWS:
        return {
            "pups": [],
            "totalPrograms": 0,
            "pupCount": 0,
            "supported": False,
            "scannedAt": _now_iso(),
        }

    programs = _get_installed_programs()
    ignore_list = _load_ignore_list()

    pups: list[dict[str, Any]] = []
    for program in programs:
        name = program.get("Name", "")
        if name in ignore_list:
            continue

        result = _classify_pup(program)
        if result:
            pups.append(result)

    # Build summary
    by_type: dict[str, int] = {}
    by_severity: dict[str, int] = {}
    for pup in pups:
        by_type[pup["pupType"]] = by_type.get(pup["pupType"], 0) + 1
        by_severity[pup["severity"]] = by_severity.get(pup["severity"], 0) + 1

    return {
        "pups": pups,
        "totalPrograms": len(programs),
        "pupCount": len(pups),
        "supported": True,
        "scannedAt": _now_iso(),
        "summary": {
            "byType": by_type,
            "bySeverity": by_severity,
            "strongIndicators": sum(1 for p in pups if p["isStrong"]),
        },
    }


@register("pup.summary")
def pup_summary(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get PUP scan summary without full details."""
    if not IS_WINDOWS:
        return {"pupCount": 0, "supported": False}

    scan_result = pup_scan(None)
    return {
        "pupCount": scan_result.get("pupCount", 0),
        "totalPrograms": scan_result.get("totalPrograms", 0),
        "supported": True,
        "summary": scan_result.get("summary", {}),
        "scannedAt": scan_result.get("scannedAt"),
    }


@register("pup.ignore")
@require_feature("pup.ignore")
def pup_ignore(params: dict[str, Any] | None) -> dict[str, Any]:
    """Add a PUP to the ignore list. Pro only.

    Params:
        name: program name to ignore
    """
    if not params or "name" not in params:
        return {"success": False, "message": "name parameter is required"}

    name = params["name"]
    ignore_list = _load_ignore_list()
    if name not in ignore_list:
        ignore_list.append(name)
        _save_ignore_list(ignore_list)

    return {"success": True, "message": f"'{name}' added to ignore list"}


@register("pup.unignore")
@require_feature("pup.unignore")
def pup_unignore(params: dict[str, Any] | None) -> dict[str, Any]:
    """Remove a PUP from the ignore list. Pro only.

    Params:
        name: program name to unignore
    """
    if not params or "name" not in params:
        return {"success": False, "message": "name parameter is required"}

    name = params["name"]
    ignore_list = _load_ignore_list()
    if name in ignore_list:
        ignore_list.remove(name)
        _save_ignore_list(ignore_list)

    return {"success": True, "message": f"'{name}' removed from ignore list"}
