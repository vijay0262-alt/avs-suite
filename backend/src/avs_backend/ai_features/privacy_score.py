"""Privacy Score module for AVS AI Shield.

Assesses the user's privacy posture by inspecting Windows telemetry,
camera / microphone / location permissions, advertising ID, Cortana /
online search, browser tracking protection, installed tracking software,
DNS settings, background apps, clipboard history and activity history.

Each check is independent and fails gracefully.  The aggregate score is
a weighted average of the individual check statuses, mapped to a letter
grade (A-F).  Results are persisted to
``%LOCALAPPDATA%\\AVS AI Shield\\threat_engine\\privacy_score_history.json``.
"""

from __future__ import annotations

import json
import logging
import os
import platform
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger("avs.ai_features.privacy_score")

IS_WINDOWS = platform.system() == "Windows"

# Suppress the console window that PowerShell would otherwise pop up.
_CREATE_NO_WINDOW = 0x08000000

_HISTORY_PATH = Path(
    os.path.expandvars(r"%LOCALAPPDATA%\AVS AI Shield\threat_engine\privacy_score_history.json")
)

_MAX_HISTORY = 50

# Known adware / tracking software process names and install directory hints.
_TRACKING_SOFTWARE: dict[str, str] = {
    "Adware.WebCompanion": "webcompanion",
    "Adware.Conduit": "conduit",
    "Adware.Babylon": "babylon",
    "Adware.MyWebSearch": "mywebsearch",
    "Adware.FunWebProducts": "funwebproducts",
    "PUP.Optional.OpenCandy": "opencandy",
    "PUP.Optional.Crossrider": "crossrider",
    "PUP.Optional.MindSpark": "mindspark",
}

_TRACKING_PROCESS_NAMES: set[str] = {
    "webcompanion.exe",
    "conduit.exe",
    "babylon.exe",
    "mywebsearch.exe",
    "opencandy.exe",
    "crossrider.exe",
    "mindspark.exe",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# =====================================================================
# Registry helpers
# =====================================================================

def _run_powershell(command: str, timeout: int = 10) -> str:
    """Run a PowerShell command and return its stdout (stripped).

    Returns an empty string on any failure so callers can treat missing
    values uniformly.
    """
    if not IS_WINDOWS:
        return ""
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", command],
            capture_output=True,
            text=True,
            timeout=timeout,
            creationflags=_CREATE_NO_WINDOW,
        )
        return (result.stdout or "").strip()
    except subprocess.TimeoutExpired:
        log.debug("PowerShell command timed out: %s", command)
        return ""
    except Exception as e:
        log.debug("PowerShell command failed (%s): %s", command, e)
        return ""


def _reg_value(path: str, value: str, hive: str = "HKLM:") -> str:
    """Return a single registry value via PowerShell Get-ItemPropertyValue."""
    cmd = (
        f"Get-ItemPropertyValue -Path '{hive}\\{path}' "
        f"-Name '{value}' -ErrorAction SilentlyContinue"
    )
    return _run_powershell(cmd)


def _reg_exists(path: str, hive: str = "HKLM:") -> bool:
    """Return True if the given registry path exists."""
    cmd = f"Test-Path '{hive}\\{path}'"
    return _run_powershell(cmd).lower() == "true"


# =====================================================================
# PrivacyScorer
# =====================================================================

class PrivacyScorer:
    """Assess the user's privacy posture across Windows settings.

    Each check returns a dict with ``id``, ``name``, ``status``
    (``good`` / ``warning`` / ``bad`` / ``unknown``), ``message``,
    ``weight`` (1-10) and ``recommendation``.  The aggregate score is a
    weighted percentage of "good" checks mapped to a letter grade.
    """

    name = "privacy_score"

    def __init__(self, config: dict[str, Any]) -> None:
        self._config = config or {}
        self._history: list[dict[str, Any]] = []
        self._load_history()

    # -----------------------------------------------------------------
    # History persistence
    # -----------------------------------------------------------------

    def _load_history(self) -> None:
        try:
            if _HISTORY_PATH.exists():
                with open(_HISTORY_PATH, "r", encoding="utf-8") as fh:
                    data = json.load(fh)
                if isinstance(data, list):
                    self._history = data[-_MAX_HISTORY:]
                    log.info("Loaded %d privacy score history entries", len(self._history))
        except Exception as e:
            log.debug("Could not load privacy score history: %s", e)
            self._history = []

    def _save_history(self, entry: dict[str, Any]) -> None:
        try:
            _HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
            self._history.append(entry)
            self._history = self._history[-_MAX_HISTORY:]
            with open(_HISTORY_PATH, "w", encoding="utf-8") as fh:
                json.dump(self._history, fh, indent=2)
            log.info("Saved privacy score history to %s", _HISTORY_PATH)
        except Exception as e:
            log.warning("Failed to save privacy score history: %s", e)

    # -----------------------------------------------------------------
    # Individual checks
    # -----------------------------------------------------------------

    def _check_telemetry(self) -> dict[str, Any]:
        """Windows telemetry level (AllowTelemetry registry value)."""
        check: dict[str, Any] = {
            "id": "telemetry",
            "name": "Windows Telemetry",
            "status": "unknown",
            "message": "",
            "weight": 10,
            "recommendation": "",
        }
        try:
            value = _reg_value(
                r"SOFTWARE\Policies\Microsoft\Windows\DataCollection",
                "AllowTelemetry",
                "HKLM:",
            )
            if value == "":
                # Fall back to the non-policy key used by some builds.
                value = _reg_value(
                    r"SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\DataCollection",
                    "AllowTelemetry",
                    "HKLM:",
                )
            if value == "":
                check["status"] = "warning"
                check["message"] = "Telemetry policy not configured; default level applies."
                check["recommendation"] = (
                    "Set AllowTelemetry to 0 (Security) or 1 (Required) via Group Policy."
                )
            else:
                level = int(value)
                if level == 0:
                    check["status"] = "good"
                    check["message"] = "Telemetry set to Security level (0)."
                elif level == 1:
                    check["status"] = "good"
                    check["message"] = "Telemetry set to Required level (1)."
                elif level == 2:
                    check["status"] = "warning"
                    check["message"] = "Telemetry set to Enhanced level (2)."
                    check["recommendation"] = "Reduce telemetry to Required (1) or Security (0)."
                elif level == 3:
                    check["status"] = "bad"
                    check["message"] = "Telemetry set to Full level (3)."
                    check["recommendation"] = "Reduce telemetry to Required (1) or Security (0)."
                else:
                    check["status"] = "unknown"
                    check["message"] = f"Unknown telemetry level: {value}."
        except Exception as e:
            check["message"] = f"Could not read telemetry setting: {e}"
        return check

    def _check_camera_access(self) -> dict[str, Any]:
        """Camera access permission via CapabilityAccessManager."""
        return self._check_capability_access(
            check_id="camera_access",
            name="Camera Access",
            capability="Camera",
            weight=8,
            good_msg="Camera access is denied for apps.",
            warn_msg="Camera access is allowed for apps.",
            bad_msg="Camera access is enabled and may expose sensitive data.",
        )

    def _check_microphone_access(self) -> dict[str, Any]:
        """Microphone access permission via CapabilityAccessManager."""
        return self._check_capability_access(
            check_id="microphone_access",
            name="Microphone Access",
            capability="Microphone",
            weight=7,
            good_msg="Microphone access is denied for apps.",
            warn_msg="Microphone access is allowed for apps.",
            bad_msg="Microphone access is enabled and may expose sensitive data.",
        )

    def _check_capability_access(
        self,
        check_id: str,
        name: str,
        capability: str,
        weight: int,
        good_msg: str,
        warn_msg: str,
        bad_msg: str,
    ) -> dict[str, Any]:
        check: dict[str, Any] = {
            "id": check_id,
            "name": name,
            "status": "unknown",
            "message": "",
            "weight": weight,
            "recommendation": "",
        }
        try:
            path = (
                r"SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager"
                rf"\ConsentStore\{capability}"
            )
            value = _reg_value(path, "Value", "HKCU:")
            if value == "":
                value = _reg_value(path, "Value", "HKLM:")
            if value == "":
                check["status"] = "warning"
                check["message"] = f"{capability} consent setting not found."
                check["recommendation"] = (
                    f"Review {capability} access in Settings > Privacy & Security."
                )
            elif value.lower() == "deny":
                check["status"] = "good"
                check["message"] = good_msg
            elif value.lower() == "allow":
                check["status"] = "warning"
                check["message"] = warn_msg
                check["recommendation"] = (
                    f"Deny {capability} access for apps that do not need it."
                )
            else:
                check["status"] = "unknown"
                check["message"] = f"Unknown {capability} consent value: {value}."
        except Exception as e:
            check["message"] = f"Could not read {capability} setting: {e}"
        return check

    def _check_location_services(self) -> dict[str, Any]:
        """Location services status."""
        check: dict[str, Any] = {
            "id": "location_services",
            "name": "Location Services",
            "status": "unknown",
            "message": "",
            "weight": 8,
            "recommendation": "",
        }
        try:
            value = _reg_value(
                r"SOFTWARE\Microsoft\Windows\CurrentVersion"
                r"\CapabilityAccessManager\ConsentStore\location",
                "Value",
                "HKLM:",
            )
            if value == "":
                check["status"] = "warning"
                check["message"] = "Location consent setting not found."
                check["recommendation"] = "Disable Location in Settings > Privacy & Security."
            elif value.lower() == "deny":
                check["status"] = "good"
                check["message"] = "Location services are disabled."
            elif value.lower() == "allow":
                check["status"] = "bad"
                check["message"] = "Location services are enabled."
                check["recommendation"] = "Disable Location unless explicitly required."
            else:
                check["status"] = "unknown"
                check["message"] = f"Unknown location value: {value}."
        except Exception as e:
            check["message"] = f"Could not read location setting: {e}"
        return check

    def _check_advertising_id(self) -> dict[str, Any]:
        """Advertising ID enabled state."""
        check: dict[str, Any] = {
            "id": "advertising_id",
            "name": "Advertising ID",
            "status": "unknown",
            "message": "",
            "weight": 6,
            "recommendation": "",
        }
        try:
            value = _reg_value(
                r"SOFTWARE\Microsoft\Windows\CurrentVersion\AdvertisingInfo",
                "Enabled",
                "HKCU:",
            )
            if value == "":
                check["status"] = "warning"
                check["message"] = "Advertising ID setting not found."
                check["recommendation"] = "Disable the advertising ID in Privacy settings."
            elif value == "0":
                check["status"] = "good"
                check["message"] = "Advertising ID is disabled."
            elif value == "1":
                check["status"] = "bad"
                check["message"] = "Advertising ID is enabled."
                check["recommendation"] = "Disable the advertising ID in Privacy settings."
            else:
                check["status"] = "unknown"
                check["message"] = f"Unknown advertising ID value: {value}."
        except Exception as e:
            check["message"] = f"Could not read advertising ID setting: {e}"
        return check

    def _check_cortana_search(self) -> dict[str, Any]:
        """Cortana / Bing online search enabled state."""
        check: dict[str, Any] = {
            "id": "cortana_search",
            "name": "Cortana / Online Search",
            "status": "unknown",
            "message": "",
            "weight": 5,
            "recommendation": "",
        }
        try:
            bing = _reg_value(
                r"SOFTWARE\Policies\Microsoft\Windows\Explorer",
                "DisableSearchBoxSuggestions",
                "HKCU:",
            )
            cortana = _reg_value(
                r"SOFTWARE\Microsoft\Windows\CurrentVersion\Search",
                "CortanaEnabled",
                "HKCU:",
            )
            if bing == "1" and (cortana == "" or cortana == "0"):
                check["status"] = "good"
                check["message"] = "Online search suggestions and Cortana are disabled."
            elif bing == "1":
                check["status"] = "good"
                check["message"] = "Online search suggestions are disabled."
            elif bing == "0" or cortana == "1":
                check["status"] = "bad"
                check["message"] = "Online search suggestions / Cortana are enabled."
                check["recommendation"] = (
                    "Disable search box suggestions and Cortana in Search settings."
                )
            else:
                check["status"] = "warning"
                check["message"] = "Cortana / search settings not explicitly configured."
                check["recommendation"] = (
                    "Disable search box suggestions and Cortana in Search settings."
                )
        except Exception as e:
            check["message"] = f"Could not read Cortana / search settings: {e}"
        return check

    def _check_browser_tracking(self) -> dict[str, Any]:
        """Browser tracking protection (Do Not Track / tracking prevention)."""
        check: dict[str, Any] = {
            "id": "browser_tracking",
            "name": "Browser Tracking Protection",
            "status": "unknown",
            "message": "",
            "weight": 6,
            "recommendation": "",
        }
        try:
            # Edge tracking prevention level (0=off,1=basic,2=balanced,3=strict).
            edge = _reg_value(
                r"SOFTWARE\Microsoft\Edge\Preferences",
                "tracking_protection",
                "HKCU:",
            )
            # Chrome Do Not Track flag.
            chrome_dnt = _run_powershell(
                "Select-String -Path "
                r"\"$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Preferences\" "
                "-Pattern '\"enable_do_not_track\":true' -SimpleMatch -Quiet"
            ).lower() == "true"

            score_signals: list[str] = []
            if edge == "3":
                score_signals.append("Edge tracking prevention set to Strict")
            elif edge == "2":
                score_signals.append("Edge tracking prevention set to Balanced")
            elif edge == "1":
                score_signals.append("Edge tracking prevention set to Basic")
            elif edge != "":
                score_signals.append("Edge tracking prevention disabled")

            if chrome_dnt:
                score_signals.append("Chrome Do Not Track enabled")

            if not score_signals:
                check["status"] = "warning"
                check["message"] = "No browser tracking-protection settings detected."
                check["recommendation"] = (
                    "Enable tracking prevention in Edge and Do Not Track in Chrome."
                )
            elif "Strict" in " ".join(score_signals) or chrome_dnt:
                check["status"] = "good"
                check["message"] = "; ".join(score_signals) + "."
            else:
                check["status"] = "warning"
                check["message"] = "; ".join(score_signals) + "."
                check["recommendation"] = (
                    "Increase tracking prevention to Strict and enable Do Not Track."
                )
        except Exception as e:
            check["message"] = f"Could not read browser tracking settings: {e}"
        return check

    def _check_tracking_software(self) -> dict[str, Any]:
        """Scan for known adware / tracking software."""
        check: dict[str, Any] = {
            "id": "tracking_software",
            "name": "Installed Tracking Software",
            "status": "unknown",
            "message": "",
            "weight": 9,
            "recommendation": "",
        }
        try:
            found: list[str] = []
            if IS_WINDOWS:
                # Check Program Files directories for known install folders.
                candidates = [
                    os.environ.get("ProgramFiles", r"C:\Program Files"),
                    os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"),
                    os.environ.get("LOCALAPPDATA", ""),
                ]
                for base in candidates:
                    if not base or not os.path.isdir(base):
                        continue
                    try:
                        for entry in os.listdir(base):
                            low = entry.lower()
                            for label, keyword in _TRACKING_SOFTWARE.items():
                                if keyword in low:
                                    found.append(f"{label} ({entry})")
                    except Exception:
                        continue

                # Check running processes for known tracking process names.
                try:
                    out = _run_powershell(
                        "Get-Process | Select-Object -ExpandProperty Name"
                    )
                    running = {f"{n.strip().lower()}.exe" for n in out.splitlines() if n.strip()}
                    for proc in _TRACKING_PROCESS_NAMES:
                        if proc in running:
                            label = proc.replace(".exe", "")
                            found.append(f"Running tracking process: {label}")
                except Exception:
                    pass

            if not found:
                check["status"] = "good"
                check["message"] = "No known tracking software detected."
            else:
                check["status"] = "bad"
                check["message"] = "Known tracking software detected: " + ", ".join(found) + "."
                check["recommendation"] = "Uninstall the detected tracking software immediately."
        except Exception as e:
            check["message"] = f"Could not scan for tracking software: {e}"
        return check

    def _check_dns_settings(self) -> dict[str, Any]:
        """Encrypted DNS / DoH support."""
        check: dict[str, Any] = {
            "id": "dns_settings",
            "name": "DNS Encryption",
            "status": "unknown",
            "message": "",
            "weight": 5,
            "recommendation": "",
        }
        try:
            # Check whether DoH (DNS-over-HTTPS) is enabled via netsh.
            out = _run_powershell(
                "netsh dns show encryption 2>$null | Out-String"
            )
            if not out:
                # Fall back to registry-based DoH probe.
                doh = _reg_value(
                    r"SYSTEM\CurrentControlSet\Services\Dnscache\Parameters",
                    "EnableAutoDoh",
                    "HKLM:",
                )
                if doh == "1":
                    check["status"] = "good"
                    check["message"] = "Automatic DNS-over-HTTPS is enabled."
                elif doh == "0":
                    check["status"] = "warning"
                    check["message"] = "DNS-over-HTTPS is disabled."
                    check["recommendation"] = "Enable DNS-over-HTTPS for encrypted DNS queries."
                else:
                    check["status"] = "warning"
                    check["message"] = "DNS encryption status could not be determined."
                    check["recommendation"] = "Enable DNS-over-HTTPS for encrypted DNS queries."
            elif "enabled" in out.lower():
                check["status"] = "good"
                check["message"] = "Encrypted DNS profiles are configured."
            else:
                check["status"] = "warning"
                check["message"] = "No encrypted DNS profiles detected."
                check["recommendation"] = "Enable DNS-over-HTTPS for encrypted DNS queries."
        except Exception as e:
            check["message"] = f"Could not read DNS settings: {e}"
        return check

    def _check_background_apps(self) -> dict[str, Any]:
        """Background apps permission."""
        check: dict[str, Any] = {
            "id": "background_apps",
            "name": "Background Apps",
            "status": "unknown",
            "message": "",
            "weight": 5,
            "recommendation": "",
        }
        try:
            value = _reg_value(
                r"SOFTWARE\Microsoft\Windows\CurrentVersion\BackgroundAccessApplications",
                "GlobalUserDisabled",
                "HKCU:",
            )
            if value == "1":
                check["status"] = "good"
                check["message"] = "Background apps are globally disabled."
            elif value == "0":
                check["status"] = "warning"
                check["message"] = "Background apps are enabled."
                check["recommendation"] = "Disable background apps in Privacy settings."
            else:
                check["status"] = "warning"
                check["message"] = "Background apps setting not found."
                check["recommendation"] = "Disable background apps in Privacy settings."
        except Exception as e:
            check["message"] = f"Could not read background apps setting: {e}"
        return check

    def _check_clipboard_history(self) -> dict[str, Any]:
        """Clipboard history enabled state."""
        check: dict[str, Any] = {
            "id": "clipboard_history",
            "name": "Clipboard History",
            "status": "unknown",
            "message": "",
            "weight": 4,
            "recommendation": "",
        }
        try:
            value = _reg_value(
                r"SOFTWARE\Microsoft\Clipboard",
                "EnableClipboardHistory",
                "HKCU:",
            )
            if value == "0":
                check["status"] = "good"
                check["message"] = "Clipboard history is disabled."
            elif value == "1":
                check["status"] = "warning"
                check["message"] = "Clipboard history is enabled."
                check["recommendation"] = "Disable clipboard history if sensitive data is copied."
            else:
                check["status"] = "warning"
                check["message"] = "Clipboard history setting not found."
                check["recommendation"] = "Disable clipboard history if sensitive data is copied."
        except Exception as e:
            check["message"] = f"Could not read clipboard history setting: {e}"
        return check

    def _check_activity_history(self) -> dict[str, Any]:
        """Windows activity history / timeline upload."""
        check: dict[str, Any] = {
            "id": "activity_history",
            "name": "Activity History",
            "status": "unknown",
            "message": "",
            "weight": 5,
            "recommendation": "",
        }
        try:
            publish = _reg_value(
                r"SOFTWARE\Microsoft\Windows\CurrentVersion\Privacy",
                "PublishUserActivities",
                "HKCU:",
            )
            upload = _reg_value(
                r"SOFTWARE\Policies\Microsoft\Windows\System",
                "UploadUserActivities",
                "HKLM:",
            )
            if publish == "0" or upload == "0":
                check["status"] = "good"
                check["message"] = "Activity history upload is disabled."
            elif publish == "1" or upload == "1":
                check["status"] = "bad"
                check["message"] = "Activity history upload is enabled."
                check["recommendation"] = "Disable activity history upload in Privacy settings."
            else:
                check["status"] = "warning"
                check["message"] = "Activity history setting not explicitly configured."
                check["recommendation"] = "Disable activity history upload in Privacy settings."
        except Exception as e:
            check["message"] = f"Could not read activity history setting: {e}"
        return check

    # -----------------------------------------------------------------
    # Aggregation
    # -----------------------------------------------------------------

    @staticmethod
    def _status_points(status: str) -> float:
        """Map a status to a 0-1 contribution factor."""
        return {
            "good": 1.0,
            "warning": 0.5,
            "bad": 0.0,
            "unknown": 0.5,
        }.get(status, 0.5)

    @staticmethod
    def _grade_for(score: int) -> str:
        if score >= 90:
            return "A"
        if score >= 80:
            return "B"
        if score >= 70:
            return "C"
        if score >= 60:
            return "D"
        return "F"

    def _summarise(self, score: int, grade: str, checks: list[dict[str, Any]]) -> str:
        bad = sum(1 for c in checks if c["status"] == "bad")
        warn = sum(1 for c in checks if c["status"] == "warning")
        good = sum(1 for c in checks if c["status"] == "good")
        return (
            f"Privacy score {score}/100 (grade {grade}): "
            f"{good} good, {warn} warning, {bad} bad out of {len(checks)} checks."
        )

    # -----------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------

    def get_status(self) -> dict[str, Any]:
        """Return privacy scorer status."""
        return {
            "name": self.name,
            "available": True,
            "history_count": len(self._history),
            "last_calculation": self._history[-1].get("timestamp") if self._history else None,
            "platform": platform.system(),
        }

    def get_history(self) -> list[dict[str, Any]]:
        """Return a copy of stored privacy score history."""
        return list(self._history)

    def calculate(self) -> dict[str, Any]:
        """Run all privacy checks and return the aggregate result.

        Returns a dict with ``score`` (0-100), ``grade`` (A-F),
        ``checks`` (list of per-check dicts), ``recommendations``
        (list of strings) and ``summary`` (human-readable string).
        """
        checks: list[dict[str, Any]] = []
        check_methods = (
            self._check_telemetry,
            self._check_camera_access,
            self._check_microphone_access,
            self._check_location_services,
            self._check_advertising_id,
            self._check_cortana_search,
            self._check_browser_tracking,
            self._check_tracking_software,
            self._check_dns_settings,
            self._check_background_apps,
            self._check_clipboard_history,
            self._check_activity_history,
        )

        for method in check_methods:
            try:
                checks.append(method())
            except Exception as e:
                log.warning("Privacy check %s failed: %s", method.__name__, e)
                checks.append({
                    "id": method.__name__,
                    "name": method.__name__,
                    "status": "unknown",
                    "message": f"Check failed: {e}",
                    "weight": 1,
                    "recommendation": "",
                })

        # Weighted score.
        total_weight = sum(c["weight"] for c in checks)
        earned = sum(self._status_points(c["status"]) * c["weight"] for c in checks)
        score = int(round((earned / total_weight) * 100)) if total_weight else 0
        grade = self._grade_for(score)

        recommendations: list[str] = []
        for c in checks:
            rec = c.get("recommendation") or ""
            if rec and rec not in recommendations:
                recommendations.append(rec)

        summary = self._summarise(score, grade, checks)

        result: dict[str, Any] = {
            "score": score,
            "grade": grade,
            "checks": checks,
            "recommendations": recommendations,
            "summary": summary,
            "timestamp": _now_iso(),
        }

        try:
            self._save_history({
                "timestamp": result["timestamp"],
                "score": score,
                "grade": grade,
                "summary": summary,
            })
        except Exception as e:
            log.debug("Could not persist privacy score history: %s", e)

        log.info("Privacy score calculated: %d (%s)", score, grade)
        return result
