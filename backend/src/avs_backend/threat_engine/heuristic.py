"""Heuristic Detector — behavior and characteristic-based malware detection.

Heuristic detection identifies suspicious files based on their
characteristics and behavior patterns without needing exact signatures.
This module performs several lightweight checks:

  - Double extension detection (e.g. invoice.pdf.exe)
  - Suspicious file names impersonating system files in wrong locations
  - Executables in suspicious locations (Downloads, Temp, AppData\\Roaming)
  - PE file characteristics (suspicious imports, missing imports, odd sections)
  - File size anomalies (tiny executables, oversized scripts)
  - Recently created files in suspicious locations
  - High-entropy PE sections (possible packed/encrypted payloads)

A suspicion score is accumulated; a detection is only reported when the
score exceeds a configurable threshold (default 3 points).
"""

from __future__ import annotations

import hashlib
import logging
import math
import os
import platform
import time
from typing import Any

log = logging.getLogger("avs.threat_engine.heuristic")

IS_WINDOWS = platform.system() == "Windows"

# Try to import pefile for PE analysis
try:
    import pefile  # type: ignore
    PEFILE_AVAILABLE = True
    log.info("pefile available for PE heuristic analysis")
except ImportError:
    PEFILE_AVAILABLE = False
    log.info("pefile not available — PE heuristics disabled (pip install pefile)")

# Suspicious Windows API imports commonly used by malware for process
# injection, memory manipulation and hooking.
_SUSPICIOUS_IMPORTS = {
    "VirtualAllocEx",
    "WriteProcessMemory",
    "CreateRemoteThread",
    "NtUnmapViewOfSection",
    "SetWindowsHookExA",
    "SetWindowsHookExW",
    "GetAsyncKeyState",
    "CreateToolhelp32Snapshot",
    "ZwUnmapViewOfSection",
    "LdrLoadDll",
    "RtlMoveMemory",
}

# System process names that malware frequently impersonates. Finding one of
# these outside its legitimate directory is a strong indicator of masquerading.
_SYSTEM_FILE_NAMES = {
    "svchost.exe",
    "explorer.exe",
    "csrss.exe",
    "lsass.exe",
    "winlogon.exe",
    "wininit.exe",
    "smss.exe",
    "spoolsv.exe",
    "services.exe",
    "taskhostw.exe",
    "rundll32.exe",
    "cmd.exe",
    "powershell.exe",
}

# Directories where finding an executable is suspicious.
_SUSPICIOUS_DIR_PARTS = (
    "downloads",
    os.path.join("appdata", "roaming"),
    os.path.join("appdata", "local", "temp"),
    os.sep + "temp" + os.sep,
    os.sep + "tmp" + os.sep,
)

# Executable / script extensions we care about.
_EXEC_EXTENSIONS = {".exe", ".scr", ".com", ".pif"}
_SCRIPT_EXTENSIONS = {".js", ".jse", ".vbs", ".vba", ".ps1", ".bat", ".cmd"}

# Default suspicion threshold for reporting a detection.
_DEFAULT_THRESHOLD = 3

# Entropy threshold above which a PE section is considered suspicious
# (packed / encrypted content typically has entropy > 7.0).
_HIGH_ENTROPY_THRESHOLD = 7.0


def _compute_sha256(file_path: str) -> str | None:
    """Compute SHA-256 hash of a file."""
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


def _shannon_entropy(data: bytes) -> float:
    """Compute Shannon entropy (0..8) for a byte sequence."""
    if not data:
        return 0.0
    counts = [0] * 256
    for b in data:
        counts[b] += 1
    length = len(data)
    entropy = 0.0
    for c in counts:
        if c == 0:
            continue
        p = c / length
        entropy -= p * math.log2(p)
    return entropy


def _normalize_path(path: str) -> str:
    """Normalize a path for case-insensitive comparison on Windows."""
    normalized = os.path.normpath(os.path.abspath(path)).lower()
    if IS_WINDOWS:
        return normalized
    return normalized


def _is_in_suspicious_location(file_path: str) -> bool:
    """Check whether a file resides in a suspicious directory."""
    try:
        normalized = _normalize_path(file_path)
        for part in _SUSPICIOUS_DIR_PARTS:
            if part in normalized:
                return True
    except Exception:
        pass
    return False


def _has_double_extension(file_path: str) -> bool:
    """Detect double-extension tricks like invoice.pdf.exe or photo.jpg.scr."""
    try:
        name = os.path.basename(file_path).lower()
        # Split on dots and inspect the trailing extensions.
        parts = name.split(".")
        if len(parts) < 3:
            return False
        # The final extension must be an executable/script type.
        final_ext = "." + parts[-1]
        if final_ext not in _EXEC_EXTENSIONS and final_ext not in _SCRIPT_EXTENSIONS:
            return False
        # The penultimate extension must look like a document/media type
        # that a user would trust opening.
        penultimate_ext = "." + parts[-2]
        document_extensions = {
            ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
            ".txt", ".rtf", ".jpg", ".jpeg", ".png", ".gif", ".bmp",
            ".zip", ".rar", ".7z", ".mp3", ".mp4", ".avi", ".mov",
            ".html", ".htm", ".csv",
        }
        if penultimate_ext in document_extensions:
            return True
    except Exception:
        pass
    return False


def _is_suspicious_system_filename(file_path: str) -> bool:
    """Detect system file names appearing outside their legitimate locations."""
    try:
        name = os.path.basename(file_path).lower()
        if name not in _SYSTEM_FILE_NAMES:
            return False
        normalized = _normalize_path(file_path)
        # Legitimate locations for system binaries on Windows.
        legit_markers = (
            os.sep + "windows" + os.sep + "system32" + os.sep,
            os.sep + "windows" + os.sep + "syswow64" + os.sep,
            os.sep + "windows" + os.sep + "system" + os.sep,
        )
        for marker in legit_markers:
            if marker in normalized:
                return False
        # Not in a legitimate system directory — suspicious.
        return True
    except Exception:
        pass
    return False


def _check_pe_imports(pe: Any) -> tuple[list[str], bool]:
    """Inspect PE imports. Returns (suspicious_imports_found, has_no_imports)."""
    suspicious_found: list[str] = []
    total_imports = 0
    try:
        if not hasattr(pe, "DIRECTORY_ENTRY_IMPORT"):
            return [], True
        for entry in pe.DIRECTORY_ENTRY_IMPORT:
            try:
                for imp in entry.imports:
                    total_imports += 1
                    if imp.name is None:
                        continue
                    name = imp.name.decode("utf-8", errors="ignore") if isinstance(imp.name, bytes) else str(imp.name)
                    if name in _SUSPICIOUS_IMPORTS:
                        if name not in suspicious_found:
                            suspicious_found.append(name)
            except Exception:
                continue
    except Exception:
        pass
    return suspicious_found, total_imports == 0


def _check_pe_sections(pe: Any) -> tuple[list[str], list[str]]:
    """Inspect PE sections. Returns (suspicious_sections, high_entropy_sections)."""
    suspicious_sections: list[str] = []
    high_entropy_sections: list[str] = []
    try:
        for section in pe.sections:
            try:
                name = section.Name.rstrip(b"\x00").decode("utf-8", errors="ignore")
                # Section name should be printable and reasonably short.
                if name and not all(32 <= ord(c) <= 126 for c in name):
                    suspicious_sections.append(name or "<unprintable>")
                # Known-suspicious packer section names.
                packer_names = {"upx0", "upx1", "upx2", ".themida", ".vmp0", ".vmp1", ".aspack"}
                if name.lower() in packer_names:
                    if name not in suspicious_sections:
                        suspicious_sections.append(name)
                # Entropy check on the section's raw data.
                try:
                    data = section.get_data()
                    if data and len(data) >= 256:
                        entropy = _shannon_entropy(data)
                        if entropy >= _HIGH_ENTROPY_THRESHOLD:
                            high_entropy_sections.append(f"{name}({entropy:.2f})")
                except Exception:
                    pass
            except Exception:
                continue
    except Exception:
        pass
    return suspicious_sections, high_entropy_sections


class HeuristicDetector:
    """Heuristic malware detector — flags suspicious file characteristics."""

    name = "heuristic"

    def __init__(self, config: dict[str, Any]):
        self.config = config
        self.threshold = int(config.get("heuristic_threshold", _DEFAULT_THRESHOLD))
        self.high_entropy_threshold = float(
            config.get("heuristic_entropy_threshold", _HIGH_ENTROPY_THRESHOLD)
        )
        log.info(
            "HeuristicDetector initialized: threshold=%d, pefile=%s",
            self.threshold,
            PEFILE_AVAILABLE,
        )

    def scan_file(self, file_path: str) -> dict[str, Any] | None:
        """Scan a file using heuristic checks.

        Returns a detection dict when the suspicion score exceeds the
        threshold, a clean dict otherwise, or ``None`` if the file cannot
        be analyzed.
        """
        try:
            if not os.path.exists(file_path) or not os.path.isfile(file_path):
                return None
        except Exception:
            return None

        sha256 = _compute_sha256(file_path)
        if not sha256:
            return None

        reasons: list[str] = []
        score = 0

        ext = os.path.splitext(file_path)[1].lower()
        is_exec = ext in _EXEC_EXTENSIONS
        is_script = ext in _SCRIPT_EXTENSIONS

        try:
            file_size = os.path.getsize(file_path)
        except Exception:
            file_size = -1

        # --- Check 1: Double extension detection ---------------------------
        if _has_double_extension(file_path):
            reasons.append("Double extension (possible masquerading)")
            score += 2

        # --- Check 2: Suspicious system file name in wrong location --------
        if _is_suspicious_system_filename(file_path):
            reasons.append("System file name outside legitimate directory")
            score += 3

        # --- Check 3: Executable in suspicious location -------------------
        in_suspicious_dir = _is_in_suspicious_location(file_path)
        if is_exec and in_suspicious_dir:
            reasons.append("Executable in suspicious location (Downloads/Temp/AppData)")
            score += 1

        # --- Check 5: File size anomalies ---------------------------------
        if is_exec and 0 <= file_size < 1024:
            reasons.append(f"Extremely small executable ({file_size} bytes)")
            score += 1
        if is_script and file_size > 512 * 1024:  # >512KB script is unusual
            reasons.append(f"Unusually large script ({file_size} bytes)")
            score += 1

        # --- Check 6: Recently created in suspicious location -------------
        if in_suspicious_dir:
            try:
                mtime = os.path.getmtime(file_path)
                age_seconds = time.time() - mtime
                if age_seconds < 3600:  # created/modified within the last hour
                    reasons.append("Recently created file in suspicious location")
                    score += 1
            except Exception:
                pass

        # --- Check 4 & 7: PE file characteristics + entropy ----------------
        if is_exec and PEFILE_AVAILABLE and file_size > 0:
            pe_info = self._analyze_pe(file_path)
            if pe_info is not None:
                if pe_info["suspicious_imports"]:
                    reasons.append(
                        "Suspicious imports: " + ", ".join(pe_info["suspicious_imports"])
                    )
                    score += min(3, len(pe_info["suspicious_imports"]))
                if pe_info["no_imports"]:
                    reasons.append("PE file has no imports (possible packed/obfuscated binary)")
                    score += 2
                if pe_info["suspicious_sections"]:
                    reasons.append(
                        "Suspicious PE sections: " + ", ".join(pe_info["suspicious_sections"])
                    )
                    score += min(2, len(pe_info["suspicious_sections"]))
                if pe_info["high_entropy_sections"]:
                    reasons.append(
                        "High-entropy PE sections (possible packed/encrypted): "
                        + ", ".join(pe_info["high_entropy_sections"])
                    )
                    score += min(2, len(pe_info["high_entropy_sections"]))

        # --- Evaluate score against threshold ------------------------------
        if score >= self.threshold:
            # Scale confidence with the score, capped at 0.9.
            confidence = min(0.9, 0.4 + (score - self.threshold) * 0.1)
            severity = self._severity_for_score(score)
            return {
                "detected": True,
                "threat_name": "Heuristic.SuspiciousFile",
                "threat_type": "suspicious",
                "severity": severity,
                "confidence": round(confidence, 2),
                "sha256": sha256,
                "details": {
                    "reasons": reasons,
                    "score": score,
                    "threshold": self.threshold,
                    "source": "heuristic",
                },
            }

        return {"detected": False, "sha256": sha256}

    def _analyze_pe(self, file_path: str) -> dict[str, Any] | None:
        """Parse a PE file and return heuristic findings, or None on failure."""
        pe = None
        try:
            pe = pefile.PE(file_path, fast_load=True)
            pe.parse_data_directories()
        except Exception as e:
            log.debug("pefile failed to parse %s: %s", file_path, e)
            if pe is not None:
                try:
                    pe.close()
                except Exception:
                    pass
            return None

        try:
            suspicious_imports, no_imports = _check_pe_imports(pe)
            suspicious_sections, high_entropy_sections = _check_pe_sections(pe)
            return {
                "suspicious_imports": suspicious_imports,
                "no_imports": no_imports,
                "suspicious_sections": suspicious_sections,
                "high_entropy_sections": high_entropy_sections,
            }
        finally:
            try:
                pe.close()
            except Exception:
                pass

    @staticmethod
    def _severity_for_score(score: int) -> str:
        """Map a suspicion score to a severity label."""
        if score >= 8:
            return "critical"
        if score >= 6:
            return "high"
        if score >= 4:
            return "medium"
        return "low"
