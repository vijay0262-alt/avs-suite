"""Windows Defender threat information integration.

Queries Windows Defender via PowerShell cmdlets (Get-MpComputerStatus,
Get-MpThreatDetection) to obtain authoritative threat verdicts.

This module NEVER fabricates Defender results. If Defender is unavailable,
disabled, or the API cannot provide reliable data, it returns a clear
capability state — never "no threats" when the source is unavailable.

Performance:
    Defender is queried ONCE per scan via get_defender_threat_info().
    No per-file Defender queries are performed.
"""

from __future__ import annotations

import json
import logging
import os
import platform
import subprocess
from dataclasses import dataclass, field
from datetime import datetime, UTC
from enum import Enum
from typing import Any, Optional

logger = logging.getLogger(__name__)

_IS_WINDOWS = platform.system() == "Windows"


class DefenderStatus(str, Enum):
    """Availability state of Windows Defender threat information."""

    AVAILABLE = "available"
    UNAVAILABLE = "unavailable"
    DISABLED = "disabled"
    NOT_WINDOWS = "not_windows"
    QUERY_FAILED = "query_failed"


@dataclass(frozen=True)
class DefenderThreat:
    """A single confirmed threat from Windows Defender.

    Only threats with authoritative Defender evidence are represented.
    Each threat corresponds to a Get-MpThreatDetection / Get-MpThreat record.
    """

    threat_id: str
    threat_name: str
    severity: str  # e.g. "Severe", "High", "Moderate", "Low", "Informational"
    category: str  # e.g. "Trojan", "Spyware", "Ransomware", etc.
    detection_id: str
    file_path: str  # affected file path
    detection_time: Optional[str] = None  # ISO timestamp
    action_taken: str = ""  # e.g. "Quarantine", "Remove", "NoAction"
    remediation_state: str = ""  # e.g. "Quarantined", "Removed", "Active"
    is_active: bool = False  # True if the threat is still present

    def to_dict(self) -> dict[str, Any]:
        return {
            "threat_id": self.threat_id,
            "threat_name": self.threat_name,
            "severity": self.severity,
            "category": self.category,
            "detection_id": self.detection_id,
            "file_path": self.file_path,
            "detection_time": self.detection_time,
            "action_taken": self.action_taken,
            "remediation_state": self.remediation_state,
            "is_active": self.is_active,
        }


@dataclass(frozen=True)
class DefenderProtectionState:
    """Real-time protection posture from Get-MpComputerStatus."""

    defender_available: bool = False
    real_time_protection_enabled: bool = False
    antivirus_enabled: bool = False
    antispyware_enabled: bool = False
    behavior_monitor_enabled: bool = False
    on_access_protection_enabled: bool = False
    ioav_protection_enabled: bool = False
    is_tamper_protected: bool = False
    ni_enabled: bool = False
    signatures_out_of_date: bool = False
    am_running_mode: str = ""
    am_service_enabled: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "defender_available": self.defender_available,
            "real_time_protection_enabled": self.real_time_protection_enabled,
            "antivirus_enabled": self.antivirus_enabled,
            "antispyware_enabled": self.antispyware_enabled,
            "behavior_monitor_enabled": self.behavior_monitor_enabled,
            "on_access_protection_enabled": self.on_access_protection_enabled,
            "ioav_protection_enabled": self.ioav_protection_enabled,
            "is_tamper_protected": self.is_tamper_protected,
            "ni_enabled": self.ni_enabled,
            "signatures_out_of_date": self.signatures_out_of_date,
            "am_running_mode": self.am_running_mode,
            "am_service_enabled": self.am_service_enabled,
        }


@dataclass(frozen=True)
class DefenderThreatInfo:
    """Complete Defender threat information result.

    Contains:
    - status: availability state (AVAILABLE / UNAVAILABLE / etc.)
    - reason: human-readable explanation when unavailable
    - threats: list of confirmed threats (empty when available with no threats)
    - protection_state: real-time protection posture
    - queried_at: ISO timestamp of the query
    """

    status: DefenderStatus
    reason: str = ""
    threats: tuple[DefenderThreat, ...] = field(default_factory=tuple)
    protection_state: Optional[DefenderProtectionState] = None
    queried_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())

    @property
    def is_available(self) -> bool:
        """True when Defender threat information is available."""
        return self.status == DefenderStatus.AVAILABLE

    @property
    def active_threats(self) -> tuple[DefenderThreat, ...]:
        """Threats that are still present on the system."""
        return tuple(t for t in self.threats if t.is_active)

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status.value,
            "reason": self.reason,
            "is_available": self.is_available,
            "threats": [t.to_dict() for t in self.threats],
            "active_threat_count": len(self.active_threats),
            "total_threat_count": len(self.threats),
            "protection_state": (
                self.protection_state.to_dict()
                if self.protection_state is not None
                else None
            ),
            "queried_at": self.queried_at,
        }


# ── PowerShell query scripts ──────────────────────────────────────────

_COMPUTER_STATUS_SCRIPT = r"""
$ErrorActionPreference = 'SilentlyContinue'
$status = Get-MpComputerStatus
if ($null -eq $status) {
    Write-Output '{"available": false, "reason": "Get-MpComputerStatus returned null"}'
    exit
}
$obj = @{
    available = $true
    am_running_mode = [string]$status.AMRunningMode
    am_service_enabled = [bool]$status.AMServiceEnabled
    antispyware_enabled = [bool]$status.AntispywareEnabled
    antivirus_enabled = [bool]$status.AntivirusEnabled
    behavior_monitor_enabled = [bool]$status.BehaviorMonitorEnabled
    real_time_protection_enabled = [bool]$status.RealTimeProtectionEnabled
    on_access_protection_enabled = [bool]$status.OnAccessProtectionEnabled
    ioav_protection_enabled = [bool]$status.IoavProtectionEnabled
    is_tamper_protected = [bool]$status.IsTamperProtected
    ni_enabled = [bool]$status.NISEnabled
    signatures_out_of_date = [bool]$status.DefenderSignaturesOutOfDate
}
Write-Output ($obj | ConvertTo-Json -Compress)
"""

_THREAT_DETECTION_SCRIPT = r"""
$ErrorActionPreference = 'SilentlyContinue'
$detections = Get-MpThreatDetection
$threats = Get-MpThreat
if ($null -eq $detections -and $null -eq $threats) {
    Write-Output '{"threats": []}'
    return
}
$threatMap = @{}
if ($threats) {
    foreach ($t in $threats) {
        $threatMap[[string]$t.ThreatID] = $t
    }
}
$items = @()
if ($detections) {
    foreach ($d in $detections) {
        $tid = [string]$d.ThreatID
        $t = $threatMap[$tid]
        $items += @{
            threat_id = $tid
            threat_name = if ($t) { [string]$t.ThreatName } else { [string]$d.ThreatName }
            severity = if ($t) { [string]$t.SeverityID } else { "" }
            category = if ($t) { [string]$t.CategoryID } else { "" }
            detection_id = [string]$d.DetectionID
            file_path = [string]$d.Resources
            detection_time = if ($d.InitialDetectionTime) { [string]$d.InitialDetectionTime } else { "" }
            action_taken = [string]$d.ActionSuccess
            remediation_state = [string]$d.RemediationState
            is_active = [bool]($d.RemediationState -ne 1 -and $d.RemediationState -ne 8)
        }
    }
}
Write-Output (@{threats = $items} | ConvertTo-Json -Compress -Depth 3)
"""


def _run_powershell(script: str, timeout: int = 30) -> tuple[bool, str]:
    """Run a PowerShell script and return (success, output)."""
    try:
        result = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                script,
            ],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        output = (result.stdout or "").strip()
        if result.returncode != 0:
            err = (result.stderr or "").strip()
            if err and not output:
                return False, err
        return result.returncode == 0, output
    except subprocess.TimeoutExpired:
        return False, "PowerShell query timed out"
    except FileNotFoundError:
        return False, "PowerShell not found"
    except Exception as exc:
        return False, str(exc)


def _parse_computer_status(output: str) -> Optional[DefenderProtectionState]:
    """Parse Get-MpComputerStatus JSON output."""
    if not output:
        return None
    try:
        data = json.loads(output)
    except (json.JSONDecodeError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    if not data.get("available", False):
        return None
    return DefenderProtectionState(
        defender_available=True,
        real_time_protection_enabled=bool(data.get("real_time_protection_enabled", False)),
        antivirus_enabled=bool(data.get("antivirus_enabled", False)),
        antispyware_enabled=bool(data.get("antispyware_enabled", False)),
        behavior_monitor_enabled=bool(data.get("behavior_monitor_enabled", False)),
        on_access_protection_enabled=bool(data.get("on_access_protection_enabled", False)),
        ioav_protection_enabled=bool(data.get("ioav_protection_enabled", False)),
        is_tamper_protected=bool(data.get("is_tamper_protected", False)),
        ni_enabled=bool(data.get("ni_enabled", False)),
        signatures_out_of_date=bool(data.get("signatures_out_of_date", False)),
        am_running_mode=str(data.get("am_running_mode", "")),
        am_service_enabled=bool(data.get("am_service_enabled", False)),
    )


def _parse_threats(output: str) -> list[DefenderThreat]:
    """Parse Get-MpThreatDetection JSON output into DefenderThreat objects."""
    if not output:
        return []
    try:
        data = json.loads(output)
    except (json.JSONDecodeError, ValueError):
        return []
    if not isinstance(data, dict):
        return []
    raw_threats = data.get("threats", [])
    if not isinstance(raw_threats, list):
        return []

    # Severity ID mapping (Defender uses numeric severity IDs)
    severity_map = {
        "5": "Severe",
        "4": "High",
        "3": "Moderate",
        "2": "Low",
        "1": "Informational",
        "0": "Unknown",
    }
    category_map = {
        "1": "Adware",
        "2": "Spyware",
        "3": "Password Stealer",
        "4": "Trojan Downloader",
        "5": "Worm",
        "6": "Backdoor",
        "8": "Trojan",
        "9": "Email Flooder",
        "11": "Joke Program",
        "13": "Trojan Proxy",
        "14": "Software Bundler",
        "15": "Trojan Spammer",
        "16": "Trojan Spy",
        "17": "Trojan Notification",
        "21": "Trojan Dropper",
        "27": "Ransomware",
        "33": "Browser Modifier",
        "36": "Cookie",
        "38": "Virus",
        "39": "Unknown",
        "42": "PUA",
        "44": "Fileless Malware",
    }

    threats: list[DefenderThreat] = []
    for raw in raw_threats:
        if not isinstance(raw, dict):
            continue
        threat_id = str(raw.get("threat_id", ""))
        if not threat_id:
            continue

        severity_id = str(raw.get("severity", ""))
        severity = severity_map.get(severity_id, "Unknown")
        category_id = str(raw.get("category", ""))
        category = category_map.get(category_id, "Unknown")

        # Resources can be a single string or array
        file_path = raw.get("file_path", "")
        if isinstance(file_path, list):
            file_path = file_path[0] if file_path else ""
        file_path = str(file_path or "")

        threats.append(
            DefenderThreat(
                threat_id=threat_id,
                threat_name=str(raw.get("threat_name", "")),
                severity=severity,
                category=category,
                detection_id=str(raw.get("detection_id", "")),
                file_path=file_path,
                detection_time=str(raw.get("detection_time", "")) or None,
                action_taken=str(raw.get("action_taken", "")),
                remediation_state=str(raw.get("remediation_state", "")),
                is_active=bool(raw.get("is_active", False)),
            )
        )
    return threats


def get_defender_threat_info(
    *, force_query: bool = False
) -> DefenderThreatInfo:
    """Query Windows Defender for threat information.

    Returns a DefenderThreatInfo with:
    - status=AVAILABLE when Defender is running and queryable
    - status=UNAVAILABLE/DISABLED when Defender is not running
    - status=NOT_WINDOWS on non-Windows platforms
    - status=QUERY_FAILED when the PowerShell query fails

    NEVER fabricates results. When unavailable, threats is empty and
    reason explains why.

    Args:
        force_query: If True, skip the platform/service check and attempt
            the query anyway (used in tests with mocked PowerShell).
    """
    if not _IS_WINDOWS and not force_query:
        return DefenderThreatInfo(
            status=DefenderStatus.NOT_WINDOWS,
            reason="Windows Defender is only available on Windows",
        )

    # Query computer status first to determine availability.
    ok, output = _run_powershell(_COMPUTER_STATUS_SCRIPT, timeout=15)
    if not ok or not output:
        return DefenderThreatInfo(
            status=DefenderStatus.QUERY_FAILED,
            reason=f"Get-MpComputerStatus query failed: {output or 'no output'}",
        )

    protection_state = _parse_computer_status(output)
    if protection_state is None:
        # Get-MpComputerStatus returned null or unavailable
        return DefenderThreatInfo(
            status=DefenderStatus.UNAVAILABLE,
            reason="Windows Defender status unavailable (service not running or disabled by third-party AV)",
        )

    # Check if Defender service is actually running.
    # AMRunningMode = "Not running" or AMServiceEnabled = False means
    # Defender is not the active AV — threat data may be stale/empty.
    if (
        protection_state.am_running_mode.lower() == "not running"
        or not protection_state.am_service_enabled
    ):
        return DefenderThreatInfo(
            status=DefenderStatus.DISABLED,
            reason=(
                "Windows Defender service is not running "
                "(AMRunningMode='Not running', AMServiceEnabled=False). "
                "A third-party antivirus may be active instead."
            ),
            protection_state=protection_state,
        )

    # Defender is available — query threat detections.
    ok, output = _run_powershell(_THREAT_DETECTION_SCRIPT, timeout=30)
    if not ok:
        return DefenderThreatInfo(
            status=DefenderStatus.QUERY_FAILED,
            reason=f"Get-MpThreatDetection query failed: {output}",
            protection_state=protection_state,
        )

    threats = _parse_threats(output)
    return DefenderThreatInfo(
        status=DefenderStatus.AVAILABLE,
        reason="Windows Defender threat information available",
        threats=tuple(threats),
        protection_state=protection_state,
    )
