"""Defender Scanner — Windows Defender integration for the AVS Shield threat engine.

This module leverages the built-in Windows Defender engine to scan files
without requiring a third-party AV engine. It uses:

  - MpCmdRun.exe — the Windows Defender command-line tool — to perform
    on-demand custom scans of individual files (ScanType 3).
  - PowerShell cmdlets (Get-MpComputerStatus, Get-MpThreatDetection,
    Get-MpThreat) to inspect Defender health and threat history.

On non-Windows platforms every method degrades gracefully and returns
``None`` / empty results so the rest of the threat engine can continue
to operate with the other scanners.
"""

from __future__ import annotations

import hashlib
import logging
import os
import platform
import subprocess
from typing import Any

log = logging.getLogger("avs.threat_engine.defender_scanner")

IS_WINDOWS = platform.system() == "Windows"

# Default location of the Windows Defender command-line tool.
_MPCMDRUN_PATH = r"C:\Program Files\Windows Defender\MpCmdRun.exe"

# Creation flag to avoid popping up a console window on Windows.
_CREATE_NO_WINDOW = 0x08000000


def _compute_sha256(file_path: str) -> str | None:
    """Compute the SHA-256 hash of a file."""
    try:
        h = hashlib.sha256()
        with open(file_path, "rb") as f:
            while True:
                chunk = f.read(65536)
                if not chunk:
                    break
                h.update(chunk)
        return h.hexdigest()
    except Exception:
        return None


def _run_command(args: list[str], timeout: int = 120) -> str | None:
    """Run a subprocess command without a console window and return its stdout.

    Returns ``None`` if the command could not be executed or timed out.
    """
    if not IS_WINDOWS:
        return None
    try:
        creationflags = _CREATE_NO_WINDOW if os.name == "nt" else 0
        result = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=timeout,
            creationflags=creationflags,
            check=False,
        )
        return result.stdout or ""
    except subprocess.TimeoutExpired:
        log.warning("Command timed out: %s", " ".join(args))
        return None
    except Exception as e:
        log.debug("Command failed (%s): %s", " ".join(args), e)
        return None


def _run_powershell(script: str, timeout: int = 60) -> str | None:
    """Run a PowerShell snippet and return its stdout."""
    if not IS_WINDOWS:
        return None
    return _run_command(
        ["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
        timeout=timeout,
    )


def _classify_threat_type(threat_name: str) -> str:
    """Classify a Defender threat name into a coarse threat type."""
    sig = (threat_name or "").lower()
    if any(t in sig for t in ("trojan", "agent", "generic")):
        return "trojan"
    if any(t in sig for t in ("worm", "autoit")):
        return "worm"
    if any(t in sig for t in ("ransom", "crypt", "locker")):
        return "ransomware"
    if any(t in sig for t in ("spy", "keylog", "banker")):
        return "spyware"
    if any(t in sig for t in ("adware", "pup")):
        return "adware"
    if any(t in sig for t in ("rootkit", "bootkit")):
        return "rootkit"
    if any(t in sig for t in ("backdoor", "rat")):
        return "backdoor"
    if any(t in sig for t in ("miner", "cryptomin", "xmr")):
        return "cryptominer"
    return "malware"


def _severity_from_threat(threat_name: str) -> str:
    """Estimate a severity level from the Defender threat name."""
    sig = (threat_name or "").lower()
    if any(t in sig for t in ("ransom", "backdoor", "rootkit", "bootkit")):
        return "critical"
    if any(t in sig for t in ("trojan", "worm", "spy", "keylog", "banker")):
        return "high"
    if any(t in sig for t in ("adware", "pup")):
        return "medium"
    return "high"


def is_defender_available() -> bool:
    """Return ``True`` if Windows Defender is installed and running."""
    if not IS_WINDOWS:
        return False
    if not os.path.exists(_MPCMDRUN_PATH):
        log.debug("MpCmdRun.exe not found at %s", _MPCMDRUN_PATH)
        return False
    status = get_defender_status()
    if not status:
        return False
    # AntiSpywareEnabled / AntivirusEnabled indicate an active Defender service.
    return bool(status.get("antivirus_enabled") or status.get("real_time_protection"))


def get_defender_status() -> dict[str, Any]:
    """Query Defender health status via ``Get-MpComputerStatus``."""
    if not IS_WINDOWS:
        return {}
    script = (
        "Get-MpComputerStatus | "
        "Select-Object AMServiceEnabled,AntispywareEnabled,AntivirusEnabled,"
        "BehaviorMonitorEnabled,IsTamperProtected,NISEnabled,"
        "OnAccessProtectionEnabled,RealTimeProtectionEnabled,QuickScanEndTime,"
        "FullScanEndTime,AntivirusSignatureLastUpdated,AntivirusSignatureVersion | "
        "ConvertTo-Json"
    )
    out = _run_powershell(script)
    if not out:
        return {}
    try:
        import json
        data = json.loads(out)
    except Exception as e:
        log.debug("Failed to parse Get-MpComputerStatus output: %s", e)
        return {}
    if not isinstance(data, dict):
        return {}
    return {
        "am_service_enabled": bool(data.get("AMServiceEnabled")),
        "antispyware_enabled": bool(data.get("AntispywareEnabled")),
        "antivirus_enabled": bool(data.get("AntivirusEnabled")),
        "behavior_monitor_enabled": bool(data.get("BehaviorMonitorEnabled")),
        "tamper_protected": bool(data.get("IsTamperProtected")),
        "nis_enabled": bool(data.get("NISEnabled")),
        "on_access_protection": bool(data.get("OnAccessProtectionEnabled")),
        "real_time_protection": bool(data.get("RealTimeProtectionEnabled")),
        "quick_scan_end_time": data.get("QuickScanEndTime"),
        "full_scan_end_time": data.get("FullScanEndTime"),
        "signature_last_updated": data.get("AntivirusSignatureLastUpdated"),
        "signature_version": data.get("AntivirusSignatureVersion"),
    }


def get_threat_history() -> list[dict[str, Any]]:
    """Return past Defender detections via ``Get-MpThreatDetection`` / ``Get-MpThreat``."""
    if not IS_WINDOWS:
        return []
    detections = _run_powershell(
        "Get-MpThreatDetection | Select-Object ThreatID,ActionSuccess,InitialDetectionTime,"
        "ProcessName,Resources | ConvertTo-Json"
    )
    threats = _run_powershell(
        "Get-MpThreat | Select-Object ThreatID,SeverityID,SeverityName,CategoryID,"
        "ThreatName,IsActive | ConvertTo-Json"
    )

    import json

    def _loads(raw: str | None):
        if not raw:
            return []
        try:
            data = json.loads(raw)
        except Exception as e:
            log.debug("Failed to parse threat JSON: %s", e)
            return []
        if isinstance(data, dict):
            return [data]
        if isinstance(data, list):
            return data
        return []

    threat_map: dict[int, dict[str, Any]] = {}
    for t in _loads(threats):
        try:
            tid = int(t.get("ThreatID", 0))
        except (TypeError, ValueError):
            continue
        threat_map[tid] = {
            "threat_id": tid,
            "threat_name": t.get("ThreatName", ""),
            "severity_id": t.get("SeverityID"),
            "severity_name": t.get("SeverityName"),
            "category_id": t.get("CategoryID"),
            "is_active": bool(t.get("IsActive")),
        }

    history: list[dict[str, Any]] = []
    for d in _loads(detections):
        try:
            tid = int(d.get("ThreatID", 0))
        except (TypeError, ValueError):
            tid = 0
        info = threat_map.get(tid, {})
        history.append({
            "threat_id": tid,
            "threat_name": info.get("threat_name", ""),
            "severity": info.get("severity_name", ""),
            "initial_detection_time": d.get("InitialDetectionTime"),
            "action_success": bool(d.get("ActionSuccess")),
            "process_name": d.get("ProcessName"),
            "resources": d.get("Resources"),
            "is_active": info.get("is_active"),
        })

    return history


class DefenderScanner:
    """Windows Defender-backed scanner for the AVS Shield threat engine."""

    name = "defender"

    def __init__(self, config: dict[str, Any]):
        self.config = config
        self.mpcmdrun_path: str = config.get("mpcmdrun_path", _MPCMDRUN_PATH)
        self.scan_timeout: int = int(config.get("scan_timeout", 120))

        if not IS_WINDOWS:
            log.info("DefenderScanner initialized on non-Windows platform — disabled")
            return

        if not os.path.exists(self.mpcmdrun_path):
            log.warning("MpCmdRun.exe not found at %s — Defender scanner disabled", self.mpcmdrun_path)
            return

        if not is_defender_available():
            log.warning("Windows Defender is not active — Defender scanner disabled")
            return

        log.info("DefenderScanner initialized: MpCmdRun=%s", self.mpcmdrun_path)

    def scan_file(self, file_path: str) -> dict[str, Any] | None:
        """Scan a single file using Windows Defender (MpCmdRun custom scan)."""
        if not IS_WINDOWS:
            return None

        if not os.path.exists(self.mpcmdrun_path) or not os.path.isfile(self.mpcmdrun_path):
            log.debug("MpCmdRun.exe unavailable, skipping Defender scan")
            return None

        if not os.path.exists(file_path) or not os.path.isfile(file_path):
            return None

        sha256 = _compute_sha256(file_path)

        # ScanType 3 = custom scan targeting a specific file.
        args = [self.mpcmdrun_path, "-Scan", "-ScanType", "3", "-File", file_path]
        output = _run_command(args, timeout=self.scan_timeout)
        if output is None:
            log.debug("Defender scan produced no output for %s", file_path)
            return None

        # MpCmdRun prints a summary when threats are found, e.g.:
        #   "Threat   : Trojan:Win32/Eicar ..."
        #   "Start time: ..."
        #   "CmdLine: ..."
        # On a clean scan it typically reports no threat lines.
        threat_name = self._extract_threat_name(output)
        if threat_name:
            return {
                "detected": True,
                "threat_name": threat_name,
                "threat_type": _classify_threat_type(threat_name),
                "severity": _severity_from_threat(threat_name),
                "confidence": 0.9,
                "sha256": sha256,
                "details": {
                    "source": "defender",
                    "raw_output": output.strip(),
                },
            }

        # Fall back to checking Defender threat history for this file path,
        # in case MpCmdRun did not surface a name but Defender recorded it.
        history_match = self._match_threat_history(file_path)
        if history_match:
            threat_name = history_match.get("threat_name", "Unknown")
            return {
                "detected": True,
                "threat_name": threat_name,
                "threat_type": _classify_threat_type(threat_name),
                "severity": _severity_from_threat(threat_name),
                "confidence": 0.85,
                "sha256": sha256,
                "details": {
                    "source": "defender",
                    "detection_time": history_match.get("initial_detection_time"),
                    "from_history": True,
                },
            }

        return {"detected": False, "sha256": sha256}

    @staticmethod
    def _extract_threat_name(output: str) -> str | None:
        """Parse MpCmdRun output for a threat name."""
        if not output:
            return None
        for line in output.splitlines():
            stripped = line.strip()
            # MpCmdRun prints lines like "Threat   : <name>"
            if stripped.lower().startswith("threat") and ":" in stripped:
                name = stripped.split(":", 1)[1].strip()
                if name:
                    return name
        # Some builds print "found threats" without a name; treat as generic.
        if "threat" in output.lower() and "no threats" not in output.lower():
            return "Defender.Threat.Generic"
        return None

    @staticmethod
    def _match_threat_history(file_path: str) -> dict[str, Any] | None:
        """Check Defender threat history for a detection referencing file_path."""
        history = get_threat_history()
        if not history:
            return None
        target = os.path.abspath(file_path).lower()
        for entry in history:
            resources = entry.get("resources")
            if not resources:
                continue
            if isinstance(resources, str):
                resources = [resources]
            for res in resources:
                try:
                    if target in str(res).lower():
                        return entry
                except Exception:
                    continue
        return None
