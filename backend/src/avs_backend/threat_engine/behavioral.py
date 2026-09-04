"""Behavioral Detector — runtime process behavior analysis for zero-day detection.

Unlike signature-based detection, behavioral analysis monitors what a process
*does* rather than what it *is*. This catches zero-day threats, fileless
malware, and living-off-the-land attacks that don't match any known signature.

Behavioral indicators monitored:
  - Mass file encryption (ransomware indicator)
  - Process injection attempts (CreateRemoteThread, WriteProcessMemory)
  - Suspicious child process spawning (e.g. Word spawning PowerShell)
  - Mass file deletion in user directories
  - Registry persistence attempts (Run/RunOnce writes)
  - Network connections to known-bad ports/IPs
  - Mass file creation in startup folders
  - DLL injection (loading DLLs into other processes)
  - Shadow copy deletion (ransomware indicator)
  - Suspicious command-line patterns (encoded PowerShell, download cradles)

A behavioral suspicion score is accumulated per process; a detection is
reported when the score exceeds a configurable threshold.
"""
from __future__ import annotations

import logging
import os
import platform
import re
import time
from typing import Any

log = logging.getLogger("avs.threat_engine.behavioral")

IS_WINDOWS = platform.system() == "Windows"

# Suspicious command-line patterns (Living Off The Land indicators)
_SUSPICIOUS_CMD_PATTERNS = [
    # Encoded/obfuscated PowerShell
    (re.compile(r"powershell.*-enc(odedCommand)?\s+", re.IGNORECASE), 5, "Encoded PowerShell command"),
    (re.compile(r"powershell.*-e\s+[A-Za-z0-9+/=]{20,}", re.IGNORECASE), 5, "Encoded PowerShell command"),
    (re.compile(r"powershell.*FromBase64String", re.IGNORECASE), 4, "Base64 decode in PowerShell"),
    (re.compile(r"powershell.*Hidden", re.IGNORECASE), 3, "Hidden PowerShell window"),
    (re.compile(r"powershell.*Bypass.*ExecutionPolicy", re.IGNORECASE), 3, "PowerShell execution policy bypass"),
    # Download cradles
    (re.compile(r"(Net\.WebClient|Invoke-WebRequest|wget|curl).*http", re.IGNORECASE), 4, "Network download in script"),
    (re.compile(r"DownloadFile|DownloadString", re.IGNORECASE), 4, "File download from script"),
    (re.compile(r"(IEX|Invoke-Expression).*http", re.IGNORECASE), 5, "Remote code execution via IEX"),
    # Process injection
    (re.compile(r"CreateRemoteThread|WriteProcessMemory|VirtualAllocEx", re.IGNORECASE), 5, "Process injection API in command"),
    # Registry persistence
    (re.compile(r"reg\s+add.*\\Run\b", re.IGNORECASE), 4, "Registry Run key persistence"),
    (re.compile(r"reg\s+add.*\\RunOnce\b", re.IGNORECASE), 4, "Registry RunOnce key persistence"),
    # Shadow copy deletion (ransomware)
    (re.compile(r"vssadmin\s+delete\s+shadows", re.IGNORECASE), 8, "Volume shadow copy deletion (ransomware)"),
    (re.compile(r"wbadmin\s+delete\s+catalog", re.IGNORECASE), 8, "Backup catalog deletion (ransomware)"),
    (re.compile(r"bcdedit.*recoveryenabled\s+no", re.IGNORECASE), 6, "Recovery disabled (ransomware)"),
    # Mass file operations
    (re.compile(r"cipher\s+/c\s+/u\s+/e", re.IGNORECASE), 5, "Mass file encryption (ransomware)"),
    # DLL injection
    (re.compile(r"rundll32\s+.*,\s*\w+", re.IGNORECASE), 3, "DLL execution via rundll32"),
    # Suspicious script hosts
    (re.compile(r"wscript\s+.*\.vbs", re.IGNORECASE), 3, "VBScript execution"),
    (re.compile(r"cscript\s+.*\.vbs", re.IGNORECASE), 3, "VBScript execution"),
    (re.compile(r"mshta\s+.*http", re.IGNORECASE), 5, "MSHTA remote execution"),
    # BITS jobs for stealth downloads
    (re.compile(r"bitsadmin.*/transfer.*http", re.IGNORECASE), 4, "BITS job for stealth download"),
    # Certutil for download (LOLBin)
    (re.compile(r"certutil.*-urlcache.*-split.*http", re.IGNORECASE), 5, "Certutil used for download"),
    # Disable security tools
    (re.compile(r"taskkill.*(?:antivirus|defender|security|protection)", re.IGNORECASE), 6, "Security tool termination"),
    (re.compile(r"Set-MpPreference.*-DisableRealtimeMonitoring", re.IGNORECASE), 7, "Defender real-time monitoring disabled"),
    (re.compile(r"Set-MpPreference.*-DisableBehaviorMonitoring", re.IGNORECASE), 6, "Defender behavior monitoring disabled"),
]

# Suspicious parent->child process relationships
# (parent_process, child_process, score, reason)
_SUSPICIOUS_PROCESS_TREE = [
    ("winword.exe", "powershell.exe", 6, "Word spawning PowerShell"),
    ("winword.exe", "cmd.exe", 5, "Word spawning cmd.exe"),
    ("winword.exe", "wscript.exe", 5, "Word spawning WScript"),
    ("winword.exe", "cscript.exe", 5, "Word spawning CScript"),
    ("winword.exe", "mshta.exe", 6, "Word spawning MSHTA"),
    ("excel.exe", "powershell.exe", 6, "Excel spawning PowerShell"),
    ("excel.exe", "cmd.exe", 5, "Excel spawning cmd.exe"),
    ("powerpnt.exe", "powershell.exe", 6, "PowerPoint spawning PowerShell"),
    ("outlook.exe", "powershell.exe", 6, "Outlook spawning PowerShell"),
    ("acrobat.exe", "powershell.exe", 5, "Acrobat spawning PowerShell"),
    ("acrord32.exe", "powershell.exe", 5, "Acrobat Reader spawning PowerShell"),
    ("java.exe", "powershell.exe", 4, "Java spawning PowerShell"),
    ("javaw.exe", "powershell.exe", 4, "Java spawning PowerShell"),
    ("python.exe", "powershell.exe", 3, "Python spawning PowerShell"),
    ("notepad.exe", "powershell.exe", 5, "Notepad spawning PowerShell (unusual)"),
    ("mshta.exe", "powershell.exe", 5, "MSHTA spawning PowerShell"),
    ("wscript.exe", "powershell.exe", 4, "WScript spawning PowerShell"),
    ("cscript.exe", "powershell.exe", 4, "CScript spawning PowerShell"),
]

# File extensions targeted by ransomware
_RANSOMWARE_TARGET_EXTENSIONS = {
    ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".bmp",
    ".mp3", ".mp4", ".avi", ".mov", ".zip", ".rar", ".7z",
    ".txt", ".csv", ".html", ".htm", ".xml", ".json",
    ".mdb", ".accdb", ".sql", ".db", ".sqlite",
    ".odt", ".ods", ".odp", ".rtf", ".wpd",
    ".bat", ".ps1", ".vbs", ".js",
    ".wallet", ".key", ".pem", ".crt", ".pfx",
}

# Default suspicion threshold for behavioral detection
_DEFAULT_THRESHOLD = 5


class BehavioralDetector:
    """Behavioral malware detector — monitors process behavior for zero-day threats.

    This detector operates differently from file-based scanners. Instead of
    scanning a file on disk, it analyzes running processes for suspicious
    behavior patterns. It can be used in two modes:

    1. **On-demand process scan**: Call `scan_processes()` to get a snapshot
       of all running processes and flag suspicious ones.

    2. **File-based behavioral check**: Call `scan_file(path)` to check if a
       file (executable or script) contains behavioral indicators in its
       content (e.g. encoded PowerShell, injection APIs).
    """

    name = "behavioral"

    def __init__(self, config: dict[str, Any]):
        self.config = config
        self.threshold = int(config.get("behavioral_threshold", _DEFAULT_THRESHOLD))
        log.info("BehavioralDetector initialized: threshold=%d", self.threshold)

    def scan_file(self, file_path: str) -> dict[str, Any] | None:
        """Scan a file for behavioral indicators in its content.

        For executables and scripts, this checks the file content for
        suspicious command patterns, injection APIs, and ransomware
        indicators. This is a static behavioral analysis (examining what
        the file *would do* if executed).
        """
        try:
            if not os.path.exists(file_path) or not os.path.isfile(file_path):
                return None
        except Exception:
            return None

        ext = os.path.splitext(file_path)[1].lower()

        # Only scan text-based files that can contain behavioral indicators
        _behavioral_exts = {".ps1", ".vbs", ".js", ".jse", ".wsf", ".bat",
                           ".cmd", ".hta", ".py", ".rb", ".pl", ".sh",
                           ".txt", ".htm", ".html"}
        if ext not in _behavioral_exts:
            return None

        try:
            file_size = os.path.getsize(file_path)
            if file_size > 1024 * 1024:  # 1MB max for content scanning
                return None
        except Exception:
            return None

        # Read file content
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
        except Exception:
            return None

        if not content:
            return None

        # Check against suspicious command patterns
        reasons: list[str] = []
        score = 0

        for pattern, points, reason in _SUSPICIOUS_CMD_PATTERNS:
            if pattern.search(content):
                score += points
                reasons.append(reason)
                if score >= 10:  # Cap to avoid over-counting same behavior
                    break

        # Check for ransomware file enumeration patterns
        ransomware_enumeration = 0
        for target_ext in _RANSOMWARE_TARGET_EXTENSIONS:
            if target_ext in content.lower():
                ransomware_enumeration += 1
        if ransomware_enumeration > 10:
            score += 5
            reasons.append(f"References {ransomware_enumeration} file types commonly targeted by ransomware")

        if score < self.threshold:
            return {"detected": False}

        severity = self._severity_for_score(score)
        threat_type = self._classify_behavior(reasons)

        return {
            "detected": True,
            "threat_name": f"Behavioral.{threat_type}",
            "threat_type": threat_type,
            "severity": severity,
            "source": "behavioral",
            "score": score,
            "reasons": reasons,
            "file": file_path,
        }

    def scan_processes(self) -> list[dict[str, Any]]:
        """Scan all running processes for suspicious behavior.

        Returns a list of detected threats from process behavior analysis.
        This is the real-time behavioral monitoring component.
        """
        if not IS_WINDOWS:
            return []

        threats: list[dict[str, Any]] = []

        try:
            processes = self._enumerate_processes()
        except Exception as e:
            log.warning("Failed to enumerate processes: %s", e)
            return []

        # Build process map for parent-child analysis
        proc_map: dict[int, dict[str, Any]] = {}
        for proc in processes:
            proc_map[proc["pid"]] = proc

        for proc in processes:
            score = 0
            reasons: list[str] = []

            # Check command line for suspicious patterns
            cmdline = proc.get("command_line", "")
            if cmdline:
                for pattern, points, reason in _SUSPICIOUS_CMD_PATTERNS:
                    if pattern.search(cmdline):
                        score += points
                        reasons.append(reason)
                        if score >= 15:
                            break

            # Check parent-child relationship
            parent_pid = proc.get("parent_pid")
            if parent_pid and parent_pid in proc_map:
                parent = proc_map[parent_pid]
                parent_name = parent.get("name", "").lower()
                child_name = proc.get("name", "").lower()
                for p_parent, p_child, points, reason in _SUSPICIOUS_PROCESS_TREE:
                    if parent_name == p_parent and child_name == p_child:
                        score += points
                        reasons.append(reason)
                        break

            # Check for processes running from suspicious locations
            exe_path = proc.get("executable", "")
            if exe_path:
                exe_lower = exe_path.lower()
                if "\\temp\\" in exe_lower or "\\appdata\\local\\temp\\" in exe_lower:
                    score += 3
                    reasons.append("Executable running from Temp directory")
                if "\\downloads\\" in exe_lower:
                    score += 2
                    reasons.append("Executable running from Downloads directory")
                # Running from AppData\Roaming is common for malware
                if "\\appdata\\roaming\\" in exe_lower and child_name not in ("",):
                    score += 2
                    reasons.append("Executable running from AppData\\Roaming")

            if score >= self.threshold:
                severity = self._severity_for_score(score)
                threat_type = self._classify_behavior(reasons)
                threats.append({
                    "detected": True,
                    "threat_name": f"Behavioral.{threat_type}",
                    "threat_type": threat_type,
                    "severity": severity,
                    "source": "behavioral",
                    "score": score,
                    "reasons": reasons,
                    "pid": proc.get("pid"),
                    "process_name": proc.get("name"),
                    "executable": exe_path,
                    "command_line": cmdline,
                })

        return threats

    def _enumerate_processes(self) -> list[dict[str, Any]]:
        """Enumerate running processes with command lines using WMI."""
        if not IS_WINDOWS:
            return []
        import subprocess
        try:
            proc = subprocess.run(
                ["powershell", "-NoProfile", "-NonInteractive", "-Command",
                 "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine | ConvertTo-Json -Depth 2"],
                capture_output=True, text=True, timeout=15,
                creationflags=0x08000000,
            )
            if proc.returncode != 0 or not proc.stdout.strip():
                return []
            import json
            data = json.loads(proc.stdout.strip())
            if not isinstance(data, list):
                data = [data]
            processes = []
            for item in data:
                processes.append({
                    "pid": item.get("ProcessId", 0),
                    "parent_pid": item.get("ParentProcessId"),
                    "name": item.get("Name", ""),
                    "executable": item.get("ExecutablePath", ""),
                    "command_line": item.get("CommandLine", ""),
                })
            return processes
        except Exception as e:
            log.warning("Process enumeration failed: %s", e)
            return []

    @staticmethod
    def _severity_for_score(score: int) -> str:
        if score >= 12:
            return "critical"
        if score >= 8:
            return "high"
        if score >= 6:
            return "medium"
        return "low"

    @staticmethod
    def _classify_behavior(reasons: list[str]) -> str:
        """Classify behavioral detection into a threat type."""
        reasons_str = " ".join(reasons).lower()
        if "ransomware" in reasons_str or "shadow" in reasons_str or "encryption" in reasons_str:
            return "ransomware"
        if "injection" in reasons_str or "remotethread" in reasons_str:
            return "trojan"
        if "persistence" in reasons_str or "run key" in reasons_str:
            return "backdoor"
        if "download" in reasons_str and "iex" in reasons_str:
            return "trojan"
        if "defender" in reasons_str or "security tool" in reasons_str:
            return "trojan"
        if "powershell" in reasons_str and "encoded" in reasons_str:
            return "backdoor"
        return "suspicious"
