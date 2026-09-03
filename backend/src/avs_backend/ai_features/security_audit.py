"""One-Click Security Audit module for AVS AI Shield.

Performs a comprehensive security posture assessment of the local Windows
machine by running a series of independent checks:

  1.  Windows Defender status
  2.  Firewall status (all profiles)
  3.  Windows Update service state
  4.  User Account Control (UAC) setting
  5.  Administrator privileges
  6.  BitLocker / drive encryption status
  7.  Network profile (public vs. private)
  8.  Shared folders
  9.  Open listening ports
  10. Startup programs (suspicious entries)
  11. Running processes (known malware names)

Each check is executed independently so that a failure in one does not abort
the whole audit.  Results are aggregated into a numeric score (0-100), a letter
grade (A-F), a human-readable summary, and a list of actionable
recommendations.

Audit history is persisted to
``%LOCALAPPDATA%\\AVS AI Shield\\threat_engine\\security_audit_history.json`` so
that trends can be reviewed over time.
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

log = logging.getLogger("avs.ai_features.security_audit")

IS_WINDOWS = platform.system() == "Windows"

# Suppress console-window pop-ups when spawning child processes on Windows.
_CREATE_NO_WINDOW = 0x08000000

# =====================================================================
# Constants
# =====================================================================

_HISTORY_PATH = Path(
    os.path.expandvars(r"%LOCALAPPDATA%\AVS AI Shield\threat_engine\security_audit_history.json")
)

_MAX_HISTORY = 50

# Known malware / suspicious process names (lower-case).  This is a small
# representative sample — the list can be extended via config["malware_names"].
_DEFAULT_MALWARE_NAMES: set[str] = {
    "emotet.exe",
    "trickbot.exe",
    "wannacry.exe",
    "wcry.exe",
    "ryuk.exe",
    "conti.exe",
    "locky.exe",
    "cerber.exe",
    "maze.exe",
    "sodinokibi.exe",
    "revil.exe",
    "darkside.exe",
    "agenttesla.exe",
    "asyncrat.exe",
    "njrat.exe",
    "quakbot.exe",
    "qakbot.exe",
    "icedid.exe",
    "bazarloader.exe",
    "bazar.exe",
    "cobaltstrike.exe",
    "beacon.exe",
    "mimikatz.exe",
    "lazagne.exe",
    "sharpkatz.exe",
    "procdump.exe",
    "anydesk_remote.exe",
    "teamviewer_remote.exe",
    "vnc.exe",
    "ammyy.exe",
    "supercop.exe",
    "filecop.exe",
    "rubeus.exe",
    "seatbelt.exe",
    "keethief.exe",
    "sharpchrome.exe",
    "sharpaduser.exe",
    "bloodhound.exe",
    "sharphound.exe",
    "inveigh.exe",
    "responder.exe",
    "nbtscan.exe",
    "advanced_ip_scanner.exe",
    "netscan.exe",
    "advancedportscanner.exe",
}

# Startup locations commonly abused by malware (registry + folder paths).
_STARTUP_REG_KEYS: list[str] = [
    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
    r"HKCU\Software\Microsoft\Windows\CurrentVersion\RunOnce",
    r"HKLM\Software\Microsoft\Windows\CurrentVersion\Run",
    r"HKLM\Software\Microsoft\Windows\CurrentVersion\RunOnce",
]

_STARTUP_FOLDERS: list[str] = [
    os.path.expandvars(r"%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"),
    os.path.expandvars(r"%PROGRAMDATA%\Microsoft\Windows\Start Menu\Programs\Startup"),
]

# Suspicious startup indicators (paths / keywords that warrant a warning).
_SUSPICIOUS_STARTUP_INDICATORS: list[str] = [
    "temp",
    "appdata\\local\\temp",
    "downloads",
    "public",
    "programdata",
    "\\tmp\\",
    "powershell -enc",
    "powershell -e ",
    "cmd /c",
    "wscript",
    "cscript",
    "mshta",
    "regsvr32 /u",
    "rundll32",
    "schtasks",
]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# =====================================================================
# SecurityAuditor
# =====================================================================


class SecurityAuditor:
    """One-Click Security Audit for AVS AI Shield.

    Runs a battery of independent security checks against the local machine
    and produces a scored report with a letter grade and recommendations.
    """

    name = "security_audit"

    def __init__(self, config: dict[str, Any]) -> None:
        self._config = config or {}

        # Allow callers to extend the malware-name blocklist.
        extra_malware = set(
            str(n).lower() for n in self._config.get("malware_names", [])
        )
        self._malware_names = _DEFAULT_MALWARE_NAMES | extra_malware

        # Load persisted audit history.
        self._history: list[dict[str, Any]] = []
        self._load_history()

    # -----------------------------------------------------------------
    # History persistence
    # -----------------------------------------------------------------

    def _load_history(self) -> None:
        """Load previous audit results from disk if available."""
        try:
            if _HISTORY_PATH.exists():
                with open(_HISTORY_PATH, "r", encoding="utf-8") as fh:
                    data = json.load(fh)
                if isinstance(data, list):
                    self._history = data
                    log.info("Loaded %d historical audit records", len(self._history))
        except Exception as e:
            log.debug("Could not load audit history: %s", e)
            self._history = []

    def _save_history(self) -> None:
        """Persist the audit history to disk (capped at _MAX_HISTORY entries)."""
        try:
            _HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
            with open(_HISTORY_PATH, "w", encoding="utf-8") as fh:
                json.dump(self._history[-_MAX_HISTORY:], fh, indent=2)
        except Exception as e:
            log.warning("Failed to save audit history: %s", e)

    def get_history(self) -> list[dict[str, Any]]:
        """Return a copy of the stored audit history (oldest first)."""
        return list(self._history)

    def get_status(self) -> dict[str, Any]:
        """Return security auditor status."""
        return {
            "name": self.name,
            "available": True,
            "history_count": len(self._history),
            "last_audit": self._history[-1].get("timestamp") if self._history else None,
            "platform": platform.system(),
        }

    # -----------------------------------------------------------------
    # Subprocess helper
    # -----------------------------------------------------------------

    @staticmethod
    def _run_command(args: list[str], timeout: int = 15) -> str:
        """Run a command and return its stdout as text.

        Uses ``CREATE_NO_WINDOW`` on Windows to avoid console pop-ups.
        Returns an empty string on any failure.
        """
        creationflags = _CREATE_NO_WINDOW if IS_WINDOWS else 0
        try:
            result = subprocess.run(
                args,
                capture_output=True,
                text=True,
                timeout=timeout,
                creationflags=creationflags,
                check=False,
            )
            return (result.stdout or "") + (result.stderr or "")
        except subprocess.TimeoutExpired:
            log.debug("Command timed out: %s", " ".join(args))
            return ""
        except FileNotFoundError:
            log.debug("Command not found: %s", args[0])
            return ""
        except Exception as e:
            log.debug("Command failed (%s): %s", " ".join(args), e)
            return ""

    # -----------------------------------------------------------------
    # Individual checks
    # -----------------------------------------------------------------

    def _check_defender(self) -> dict[str, Any]:
        """Check 1 — Windows Defender real-time protection status."""
        check_id = "defender"
        name = "Windows Defender Status"
        weight = 10
        try:
            output = self._run_command(
                ["powershell", "-NoProfile", "-Command",
                 "Get-MpComputerStatus | Select-Object -Property "
                 "AntivirusEnabled,RealTimeProtectionEnabled,AMServiceEnabled,"
                 "AntivirusSignatureLastUpdated,AntispywareSignatureLastUpdated "
                 "| Format-List"]
            )
            if not output.strip():
                return self._info_check(
                    check_id, name, weight,
                    "Defender status could not be retrieved (non-Windows or "
                    "PowerShell unavailable).",
                )

            av_enabled = "AntivirusEnabled" in output and "True" in output
            rtp_enabled = "RealTimeProtectionEnabled" in output and "True" in output

            if av_enabled and rtp_enabled:
                return self._pass_check(
                    check_id, name, weight,
                    "Windows Defender is enabled with real-time protection active.",
                )
            if av_enabled and not rtp_enabled:
                return self._warn_check(
                    check_id, name, weight,
                    "Defender is enabled but real-time protection is OFF.",
                    "Enable real-time protection in Windows Security settings.",
                )
            return self._fail_check(
                check_id, name, weight,
                "Windows Defender appears to be disabled.",
                "Enable Windows Defender or install a reputable antivirus.",
            )
        except Exception as e:
            return self._error_check(check_id, name, weight, e)

    def _check_firewall(self) -> dict[str, Any]:
        """Check 2 — Firewall status across all profiles."""
        check_id = "firewall"
        name = "Firewall Status"
        weight = 10
        try:
            output = self._run_command(
                ["netsh", "advfirewall", "show", "allprofiles", "state"]
            )
            if not output.strip():
                return self._info_check(
                    check_id, name, weight,
                    "Firewall status could not be retrieved.",
                )

            off_count = output.lower().count("off")
            on_count = output.lower().count("on")
            # netsh reports one state line per profile (Domain, Private, Public).
            if off_count > 0 and on_count == 0:
                return self._fail_check(
                    check_id, name, weight,
                    f"Firewall is OFF for all {off_count} profile(s).",
                    "Enable the Windows Firewall for all network profiles.",
                )
            if off_count > 0:
                return self._warn_check(
                    check_id, name, weight,
                    f"Firewall is OFF for {off_count} profile(s) and ON for "
                    f"{on_count}.",
                    "Enable the firewall for every network profile.",
                )
            return self._pass_check(
                check_id, name, weight,
                "Firewall is ON for all network profiles.",
            )
        except Exception as e:
            return self._error_check(check_id, name, weight, e)

    def _check_windows_update(self) -> dict[str, Any]:
        """Check 3 — Windows Update service state."""
        check_id = "windows_update"
        name = "Windows Update Service"
        weight = 7
        try:
            output = self._run_command(
                ["powershell", "-NoProfile", "-Command",
                 "Get-Service wuauserv | Select-Object Status,StartType | "
                 "Format-List"]
            )
            if not output.strip():
                return self._info_check(
                    check_id, name, weight,
                    "Windows Update service status could not be retrieved.",
                )

            status_running = "Status" in output and "Running" in output
            disabled = "Disabled" in output

            if status_running:
                return self._pass_check(
                    check_id, name, weight,
                    "Windows Update service is running.",
                )
            if disabled:
                return self._fail_check(
                    check_id, name, weight,
                    "Windows Update service is disabled.",
                    "Re-enable the Windows Update service to receive security "
                    "patches.",
                )
            return self._warn_check(
                check_id, name, weight,
                "Windows Update service is not running (stopped).",
                "Start the Windows Update service or set it to Automatic.",
            )
        except Exception as e:
            return self._error_check(check_id, name, weight, e)

    def _check_uac(self) -> dict[str, Any]:
        """Check 4 — User Account Control (UAC) setting via registry."""
        check_id = "uac"
        name = "User Account Control (UAC)"
        weight = 8
        try:
            output = self._run_command(
                ["reg", "query",
                 r"HKLM\Software\Microsoft\Windows\CurrentVersion\Policies\System",
                 "/v", "EnableLUA"]
            )
            if not output.strip():
                return self._info_check(
                    check_id, name, weight,
                    "UAC setting could not be retrieved from the registry.",
                )

            # Output line looks like:  EnableLUA    REG_DWORD    0x1
            enabled = "0x1" in output.lower() or "reg_dword    1" in output.lower()
            if enabled:
                return self._pass_check(
                    check_id, name, weight,
                    "UAC is enabled.",
                )
            return self._fail_check(
                check_id, name, weight,
                "UAC is disabled (EnableLUA = 0).",
                "Enable User Account Control via Security Settings or the "
                "registry.",
            )
        except Exception as e:
            return self._error_check(check_id, name, weight, e)

    def _check_admin_privileges(self) -> dict[str, Any]:
        """Check 5 — Whether the current session has administrator privileges."""
        check_id = "admin_privileges"
        name = "Administrator Privileges"
        weight = 5
        try:
            output = self._run_command(
                ["powershell", "-NoProfile", "-Command",
                 "([Security.Principal.WindowsPrincipal] "
                 "[Security.Principal.WindowsIdentity]::GetCurrent())."
                 "IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"]
            )
            is_admin = "True" in output

            if is_admin:
                return self._warn_check(
                    check_id, name, weight,
                    "The current session is running with administrator "
                    "privileges.",
                    "Use a standard user account for daily work; reserve admin "
                    "for tasks that require it.",
                )
            return self._pass_check(
                check_id, name, weight,
                "The current session is running as a standard user.",
            )
        except Exception as e:
            return self._error_check(check_id, name, weight, e)

    def _check_bitlocker(self) -> dict[str, Any]:
        """Check 6 — BitLocker / drive encryption status."""
        check_id = "bitlocker"
        name = "BitLocker / Encryption"
        weight = 8
        try:
            output = self._run_command(
                ["powershell", "-NoProfile", "-Command",
                 "Get-BitLockerVolume | Select-Object MountPoint,ProtectionStatus "
                 "| Format-Table -AutoSize"]
            )
            if not output.strip():
                return self._info_check(
                    check_id, name, weight,
                    "BitLocker status could not be retrieved (feature may be "
                    "unavailable on this edition).",
                )

            off_count = output.lower().count("off")
            on_count = output.lower().count("on")

            if on_count > 0 and off_count == 0:
                return self._pass_check(
                    check_id, name, weight,
                    "All BitLocker-protected volumes have protection ON.",
                )
            if off_count > 0 and on_count > 0:
                return self._warn_check(
                    check_id, name, weight,
                    f"{on_count} volume(s) encrypted, {off_count} volume(s) "
                    "unprotected.",
                    "Enable BitLocker on all fixed data drives.",
                )
            if off_count > 0:
                return self._fail_check(
                    check_id, name, weight,
                    "No volumes have BitLocker protection enabled.",
                    "Enable BitLocker on the OS drive and all fixed data drives.",
                )
            return self._info_check(
                check_id, name, weight,
                "No BitLocker volumes were returned.",
            )
        except Exception as e:
            return self._error_check(check_id, name, weight, e)

    def _check_network_profile(self) -> dict[str, Any]:
        """Check 7 — Network profile classification (public vs. private)."""
        check_id = "network_profile"
        name = "Network Profile"
        weight = 6
        try:
            output = self._run_command(
                ["powershell", "-NoProfile", "-Command",
                 "Get-NetConnectionProfile | Select-Object Name,NetworkCategory "
                 "| Format-Table -AutoSize"]
            )
            if not output.strip():
                return self._info_check(
                    check_id, name, weight,
                    "Network profile could not be retrieved.",
                )

            public_count = output.lower().count("public")
            private_count = output.lower().count("private")

            if public_count > 0 and private_count == 0:
                return self._warn_check(
                    check_id, name, weight,
                    f"All {public_count} active network(s) are set to Public.",
                    "Set trusted home/work networks to Private for better "
                    "sharing and discovery.",
                )
            if public_count > 0:
                return self._warn_check(
                    check_id, name, weight,
                    f"{public_count} network(s) are Public, "
                    f"{private_count} are Private.",
                    "Review Public networks — switch trusted ones to Private.",
                )
            return self._pass_check(
                check_id, name, weight,
                f"All {private_count} active network(s) are set to Private.",
            )
        except Exception as e:
            return self._error_check(check_id, name, weight, e)

    def _check_shared_folders(self) -> dict[str, Any]:
        """Check 8 — Shared folders exposed by the machine."""
        check_id = "shared_folders"
        name = "Shared Folders"
        weight = 6
        try:
            output = self._run_command(["net", "share"])
            if not output.strip():
                return self._info_check(
                    check_id, name, weight,
                    "Shared folders could not be enumerated.",
                )

            # Filter out default administrative shares (C$, ADMIN$, IPC$).
            lines = output.splitlines()
            shares: list[str] = []
            for line in lines:
                parts = line.split()
                if not parts:
                    continue
                share_name = parts[0]
                if share_name.upper() in ("C$", "ADMIN$", "IPC$"):
                    continue
                # Skip header / separator lines.
                if share_name.upper() in (
                    "SHARE", "----", "SHARE", "NAME",
                ):
                    continue
                if share_name.startswith("-"):
                    continue
                shares.append(share_name)

            if not shares:
                return self._pass_check(
                    check_id, name, weight,
                    "No user-created shared folders detected.",
                )
            return self._warn_check(
                check_id, name, weight,
                f"{len(shares)} user-created share(s) found: "
                f"{', '.join(shares[:10])}",
                "Review shared folders and remove any that are unnecessary.",
            )
        except Exception as e:
            return self._error_check(check_id, name, weight, e)

    def _check_open_ports(self) -> dict[str, Any]:
        """Check 9 — Open / listening TCP & UDP ports."""
        check_id = "open_ports"
        name = "Open Listening Ports"
        weight = 7
        try:
            output = self._run_command(["netstat", "-an"])
            if not output.strip():
                return self._info_check(
                    check_id, name, weight,
                    "Open ports could not be enumerated.",
                )

            listening = 0
            established = 0
            for line in output.splitlines():
                upper = line.upper().strip()
                if "LISTENING" in upper:
                    listening += 1
                elif "ESTABLISHED" in upper:
                    established += 1

            if listening == 0:
                return self._pass_check(
                    check_id, name, weight,
                    "No listening ports detected.",
                )
            if listening <= 10:
                return self._pass_check(
                    check_id, name, weight,
                    f"{listening} listening port(s) and {established} "
                    "established connection(s).",
                )
            if listening <= 30:
                return self._warn_check(
                    check_id, name, weight,
                    f"{listening} listening port(s) detected — review for "
                    "unnecessary services.",
                    "Close unused listening ports and disable unneeded services.",
                )
            return self._fail_check(
                check_id, name, weight,
                f"{listening} listening port(s) detected — high exposure.",
                "Audit running services and close all unnecessary listening "
                "ports.",
            )
        except Exception as e:
            return self._error_check(check_id, name, weight, e)

    def _check_startup_programs(self) -> dict[str, Any]:
        """Check 10 — Startup programs for suspicious entries."""
        check_id = "startup_programs"
        name = "Startup Programs"
        weight = 8
        try:
            entries: list[str] = []

            # Registry-based startup entries.
            for key in _STARTUP_REG_KEYS:
                root, sub = key.split("\\", 1)
                # reg query uses the full path with backslashes.
                output = self._run_command(["reg", "query", key])
                if not output:
                    continue
                for line in output.splitlines():
                    line = line.strip()
                    if not line or line.startswith(key) or "HKEY_" in line:
                        continue
                    # Value lines contain the entry name + data.
                    if "REG_" in line:
                        entries.append(f"{key}: {line}")

            # Folder-based startup entries.
            for folder in _STARTUP_FOLDERS:
                p = Path(folder)
                if p.exists():
                    for item in p.iterdir():
                        entries.append(str(item))

            if not entries:
                return self._pass_check(
                    check_id, name, weight,
                    "No startup programs detected.",
                )

            suspicious: list[str] = []
            for entry in entries:
                lower = entry.lower()
                if any(ind in lower for ind in _SUSPICIOUS_STARTUP_INDICATORS):
                    suspicious.append(entry)

            if suspicious:
                return self._fail_check(
                    check_id, name, weight,
                    f"{len(suspicious)} suspicious startup entr(y/ies) found: "
                    + "; ".join(suspicious[:5]),
                    "Remove suspicious startup entries and investigate the "
                    "referenced files.",
                )
            return self._pass_check(
                check_id, name, weight,
                f"{len(entries)} startup program(s) found, none flagged as "
                "suspicious.",
            )
        except Exception as e:
            return self._error_check(check_id, name, weight, e)

    def _check_running_processes(self) -> dict[str, Any]:
        """Check 11 — Running processes for known malware names."""
        check_id = "running_processes"
        name = "Running Processes (Malware Scan)"
        weight = 10
        try:
            output = self._run_command(
                ["powershell", "-NoProfile", "-Command",
                 "Get-Process | Select-Object -ExpandProperty Name"]
            )
            if not output.strip():
                return self._info_check(
                    check_id, name, weight,
                    "Running processes could not be enumerated.",
                )

            process_names = {
                line.strip().lower() for line in output.splitlines() if line.strip()
            }
            # Also check with .exe suffix appended.
            process_names_exe = {f"{n}.exe" for n in process_names}
            all_names = process_names | process_names_exe

            matched = sorted(all_names & self._malware_names)

            if matched:
                return self._fail_check(
                    check_id, name, weight,
                    f"{len(matched)} process(es) matching known malware names: "
                    + ", ".join(matched[:10]),
                    "Immediately isolate the machine, terminate the flagged "
                    "processes, and run a full antivirus scan.",
                )
            return self._pass_check(
                check_id, name, weight,
                "No running processes match known malware names.",
            )
        except Exception as e:
            return self._error_check(check_id, name, weight, e)

    # -----------------------------------------------------------------
    # Check-result factories
    # -----------------------------------------------------------------

    @staticmethod
    def _pass_check(
        cid: str, name: str, weight: int, message: str,
        recommendation: str = "",
    ) -> dict[str, Any]:
        return {
            "id": cid,
            "name": name,
            "status": "pass",
            "message": message,
            "weight": weight,
            "recommendation": recommendation,
        }

    @staticmethod
    def _warn_check(
        cid: str, name: str, weight: int, message: str,
        recommendation: str = "",
    ) -> dict[str, Any]:
        return {
            "id": cid,
            "name": name,
            "status": "warn",
            "message": message,
            "weight": weight,
            "recommendation": recommendation,
        }

    @staticmethod
    def _fail_check(
        cid: str, name: str, weight: int, message: str,
        recommendation: str = "",
    ) -> dict[str, Any]:
        return {
            "id": cid,
            "name": name,
            "status": "fail",
            "message": message,
            "weight": weight,
            "recommendation": recommendation,
        }

    @staticmethod
    def _info_check(
        cid: str, name: str, weight: int, message: str,
        recommendation: str = "",
    ) -> dict[str, Any]:
        return {
            "id": cid,
            "name": name,
            "status": "info",
            "message": message,
            "weight": weight,
            "recommendation": recommendation,
        }

    @staticmethod
    def _error_check(
        cid: str, name: str, weight: int, error: Exception,
    ) -> dict[str, Any]:
        return {
            "id": cid,
            "name": name,
            "status": "info",
            "message": f"Check could not be completed: {error}",
            "weight": weight,
            "recommendation": "Retry the audit or check system permissions.",
        }

    # -----------------------------------------------------------------
    # Scoring & grading
    # -----------------------------------------------------------------

    @staticmethod
    def _compute_score(checks: list[dict[str, Any]]) -> int:
        """Compute the numeric score from a list of check results.

        Starts at 100 and subtracts weighted penalties for ``warn`` and
        ``fail`` statuses.  ``info`` and ``pass`` do not reduce the score.
        """
        score = 100
        for check in checks:
            status = check.get("status", "info")
            weight = int(check.get("weight", 1))
            if status == "fail":
                score -= weight
            elif status == "warn":
                score -= weight // 2
        return max(0, min(100, score))

    @staticmethod
    def _compute_grade(score: int) -> str:
        """Convert a numeric score into a letter grade."""
        if score >= 90:
            return "A"
        if score >= 80:
            return "B"
        if score >= 70:
            return "C"
        if score >= 60:
            return "D"
        return "F"

    @staticmethod
    def _build_summary(
        score: int, grade: str, checks: list[dict[str, Any]],
    ) -> str:
        """Build a human-readable summary of the audit results."""
        total = len(checks)
        passed = sum(1 for c in checks if c.get("status") == "pass")
        warned = sum(1 for c in checks if c.get("status") == "warn")
        failed = sum(1 for c in checks if c.get("status") == "fail")
        info = sum(1 for c in checks if c.get("status") == "info")
        return (
            f"Security audit completed with score {score}/100 (grade {grade}). "
            f"{total} checks run: {passed} passed, {warned} warnings, "
            f"{failed} failed, {info} informational."
        )

    @staticmethod
    def _build_recommendations(checks: list[dict[str, Any]]) -> list[str]:
        """Collect non-empty recommendations from warn/fail checks."""
        recs: list[str] = []
        for check in checks:
            status = check.get("status", "info")
            rec = check.get("recommendation", "")
            if status in ("warn", "fail") and rec:
                recs.append(f"[{check['name']}] {rec}")
        return recs

    # -----------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------

    def audit(self) -> dict[str, Any]:
        """Perform a comprehensive security audit.

        Runs every check independently (each wrapped in its own try/except)
        and returns an aggregated report containing the score, grade, per-check
        details, a summary string, and a list of recommendations.
        """
        log.info("Starting one-click security audit")
        start_time = time.time()

        # Each check method is called individually so that an exception in
        # one does not prevent the others from running.
        check_methods = [
            self._check_defender,
            self._check_firewall,
            self._check_windows_update,
            self._check_uac,
            self._check_admin_privileges,
            self._check_bitlocker,
            self._check_network_profile,
            self._check_shared_folders,
            self._check_open_ports,
            self._check_startup_programs,
            self._check_running_processes,
        ]

        checks: list[dict[str, Any]] = []
        for method in check_methods:
            try:
                result = method()
                if isinstance(result, dict):
                    checks.append(result)
                else:
                    checks.append(self._info_check(
                        "unknown", "Unknown Check", 1,
                        "Check returned an unexpected result type.",
                    ))
            except Exception as e:
                log.warning("Security check %s raised: %s", method.__name__, e)
                checks.append(self._info_check(
                    "unknown", method.__name__, 1,
                    f"Check raised an exception: {e}",
                ))

        score = self._compute_score(checks)
        grade = self._compute_grade(score)
        summary = self._build_summary(score, grade, checks)
        recommendations = self._build_recommendations(checks)

        elapsed = round(time.time() - start_time, 2)
        report: dict[str, Any] = {
            "score": score,
            "grade": grade,
            "checks": checks,
            "summary": summary,
            "recommendations": recommendations,
            "timestamp": _now_iso(),
            "duration_seconds": elapsed,
        }

        # Persist to history.
        self._history.append(report)
        if len(self._history) > _MAX_HISTORY:
            self._history = self._history[-_MAX_HISTORY:]
        self._save_history()

        log.info(
            "Security audit complete: score=%d grade=%s (%.2fs)",
            score, grade, elapsed,
        )
        return report
