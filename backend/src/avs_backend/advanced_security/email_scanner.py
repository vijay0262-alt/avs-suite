"""Email Attachment Scanner — detects malicious content in email attachments.

Email is one of the most common attack vectors for malware delivery. This
module scans individual email attachment files (or an entire attachment
folder) for a range of threats commonly distributed via email:

  - Dangerous file extensions (.exe, .scr, .lnk, .iso, macro docs, ...)
  - Files whose SHA-256 hash appears in the threat-engine hash blocklist
  - Macro-enabled Office documents (.docm, .xlsm, .pptm)
  - Archive attachments (.zip, .rar, .7z) that bundle executables
  - Embedded executables hidden inside archives
  - Double-extension tricks (e.g. invoice.pdf.exe)
  - Oversized attachments (> 50 MB)
  - Files with no extension
  - Encrypted archives whose contents cannot be inspected

Each scan produces a result dict with a ``safe`` flag, a ``threat_level``
of ``safe`` / ``suspicious`` / ``malicious`` and a list of human-readable
threat descriptions. Scan history is persisted to
``%LOCALAPPDATA%\\AVS AI Shield\\threat_engine\\email_scan_history.json``.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import platform
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger("avs.advanced_security.email_scanner")

IS_WINDOWS = platform.system() == "Windows"

# ─── Optional archive backends ──────────────────────────────────────

try:
    import rarfile  # type: ignore

    RARFILE_AVAILABLE = True
    log.info("rarfile available for RAR archive scanning")
except ImportError:
    RARFILE_AVAILABLE = False
    log.info("rarfile not available — RAR scanning disabled (pip install rarfile)")

try:
    import py7zr  # type: ignore

    PY7ZR_AVAILABLE = True
    log.info("py7zr available for 7z archive scanning")
except ImportError:
    PY7ZR_AVAILABLE = False
    log.info("py7zr not available — 7z scanning disabled (pip install py7zr)")


# ─── Storage paths ──────────────────────────────────────────────────

_DATA_DIR = Path(os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))) / "AVS AI Shield" / "threat_engine"
_DATA_DIR.mkdir(parents=True, exist_ok=True)
_HISTORY_PATH = _DATA_DIR / "email_scan_history.json"
_HASH_DB_PATH = _DATA_DIR / "hash_blocklist.json"

# ─── Extension / pattern definitions ────────────────────────────────

# Extensions that are outright dangerous in an email attachment context.
_DANGEROUS_EXTENSIONS = {
    # Executables & scripts
    ".exe", ".scr", ".com", ".bat", ".cmd", ".ps1", ".vbs", ".js",
    ".hta", ".msi", ".jar",
    # Macro-enabled Office documents
    ".docm", ".xlsm", ".pptm",
    # Disk images used to bypass Mark-of-the-Web (MOTW)
    ".iso", ".img",
    # Shortcut files
    ".lnk",
}

# Macro-enabled Office document extensions (reported separately from the
# generic dangerous-extension check so the threat description is clearer).
_MACRO_EXTENSIONS = {".docm", ".xlsm", ".pptm"}

# Archive extensions we can attempt to inspect.
_ARCHIVE_EXTENSIONS = {".zip", ".rar", ".7z"}

# Executable / script extensions that are suspicious when found *inside*
# an archive attachment.
_EMBEDDED_EXEC_EXTENSIONS = {
    ".exe", ".scr", ".com", ".bat", ".cmd", ".ps1", ".vbs", ".js",
    ".hta", ".msi", ".jar", ".lnk",
}

# Document / media extensions used as the "trusted" prefix in a
# double-extension masquerade (e.g. invoice.pdf.exe).
_TRUSTED_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".txt", ".rtf", ".jpg", ".jpeg", ".png", ".gif", ".bmp",
    ".zip", ".rar", ".7z", ".mp3", ".mp4", ".avi", ".mov",
    ".html", ".htm", ".csv",
}

# Attachments larger than this are flagged as suspicious.
_LARGE_ATTACHMENT_THRESHOLD = 50 * 1024 * 1024  # 50 MB


# ─── Helpers ────────────────────────────────────────────────────────


def _compute_sha256(file_path: str) -> str | None:
    """Compute the SHA-256 hash of a file, or ``None`` on error."""
    try:
        h = hashlib.sha256()
        with open(file_path, "rb") as f:
            while True:
                chunk = f.read(65536)
                if not chunk:
                    break
                h.update(chunk)
        return h.hexdigest()
    except Exception as e:
        log.debug("Failed to hash %s: %s", file_path, e)
        return None


def _load_hash_blocklist() -> set[str]:
    """Load SHA-256 hashes from the threat-engine hash blocklist.

    Returns a set of lowercased SHA-256 hex strings. If the blocklist
    cannot be loaded an empty set is returned so scanning degrades
    gracefully (hash check is simply skipped).
    """
    try:
        if not _HASH_DB_PATH.exists():
            return set()
        with open(_HASH_DB_PATH, "r", encoding="utf-8") as f:
            db = json.load(f)
        hashes: set[str] = set()
        for entry in db.get("hashes", []):
            sha = entry.get("sha256", "")
            if sha:
                hashes.add(sha.lower())
        return hashes
    except Exception as e:
        log.warning("Failed to load hash blocklist: %s", e)
        return set()


def _has_double_extension(file_path: str) -> bool:
    """Detect double-extension tricks such as ``invoice.pdf.exe``."""
    try:
        name = os.path.basename(file_path).lower()
        parts = name.split(".")
        if len(parts) < 3:
            return False
        final_ext = "." + parts[-1]
        if final_ext not in _DANGEROUS_EXTENSIONS:
            return False
        penultimate_ext = "." + parts[-2]
        if penultimate_ext in _TRUSTED_EXTENSIONS:
            return True
    except Exception:
        pass
    return False


def _load_history() -> list[dict[str, Any]]:
    """Load persisted scan history from disk."""
    try:
        if _HISTORY_PATH.exists():
            with open(_HISTORY_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
    except Exception as e:
        log.warning("Failed to load email scan history: %s", e)
    return []


def _save_history(history: list[dict[str, Any]]) -> None:
    """Persist scan history to disk (keeping the most recent 200 entries)."""
    try:
        if len(history) > 200:
            history = history[-200:]
        with open(_HISTORY_PATH, "w", encoding="utf-8") as f:
            json.dump(history, f, indent=2)
    except Exception as e:
        log.error("Failed to save email scan history: %s", e)


# ─── EmailScanner ───────────────────────────────────────────────────


class EmailScanner:
    """Email attachment scanner for AVS AI Shield.

    Scans email attachment files for malicious content using a combination
    of extension checks, hash blocklist lookups, macro-document detection,
    archive inspection and heuristics such as double-extension detection.
    """

    name = "email_scanner"

    def __init__(self, config: dict[str, Any]):
        self.config = config
        self._files_scanned = 0
        self._threats_found = 0
        self._last_scan: str | None = None
        self._history: list[dict[str, Any]] = _load_history()
        self._hash_blocklist = _load_hash_blocklist()
        log.info(
            "EmailScanner initialized: %d hashes in blocklist, history entries=%d",
            len(self._hash_blocklist),
            len(self._history),
        )

    # ── Public API ──────────────────────────────────────────────────

    def scan_file(self, file_path: str) -> dict[str, Any]:
        """Scan a single email attachment file.

        Returns a dict with the following keys::

            {
                "safe": bool,
                "threat_level": "safe" | "suspicious" | "malicious",
                "threats": list[str],
                "file_info": {
                    "path": str,
                    "name": str,
                    "size": int,
                    "extension": str,
                    "sha256": str | None,
                },
            }
        """
        threats: list[str] = []
        threat_level = "safe"

        try:
            if not os.path.exists(file_path) or not os.path.isfile(file_path):
                threats.append("File not found or not a regular file")
                return self._build_result(file_path, threats, "suspicious", None, -1)

            file_size = os.path.getsize(file_path)
            file_name = os.path.basename(file_path)
            ext = os.path.splitext(file_name)[1].lower()
            sha256 = _compute_sha256(file_path)

            # --- Check 1: dangerous file extension ---------------------
            if ext in _DANGEROUS_EXTENSIONS:
                if ext in _MACRO_EXTENSIONS:
                    threats.append(f"Macro-enabled Office document ({ext})")
                else:
                    threats.append(f"Dangerous file extension ({ext})")
                threat_level = self._escalate(threat_level, "malicious")

            # --- Check 2: hash blocklist -------------------------------
            if sha256 and sha256.lower() in self._hash_blocklist:
                threats.append("File hash matches known-malicious blocklist entry")
                threat_level = self._escalate(threat_level, "malicious")

            # --- Check 3: macro-enabled Office documents ---------------
            # (Already partly covered by Check 1, but this gives a clearer
            # dedicated message and catches the case where the extension
            # list might be customised.)
            if ext in _MACRO_EXTENSIONS:
                msg = f"Office document with macros detected ({ext})"
                if msg not in threats:
                    threats.append(msg)

            # --- Check 4: double extension -----------------------------
            if _has_double_extension(file_path):
                threats.append("Double extension detected (possible masquerading)")
                threat_level = self._escalate(threat_level, "malicious")

            # --- Check 5: no extension --------------------------------
            if not ext:
                threats.append("File has no extension")
                threat_level = self._escalate(threat_level, "suspicious")

            # --- Check 6: very large attachment ------------------------
            if file_size > _LARGE_ATTACHMENT_THRESHOLD:
                size_mb = file_size / (1024 * 1024)
                threats.append(f"Very large attachment ({size_mb:.1f} MB)")
                threat_level = self._escalate(threat_level, "suspicious")

            # --- Check 7: archive inspection ---------------------------
            if ext in _ARCHIVE_EXTENSIONS:
                archive_threats, archive_level = self._scan_archive(file_path)
                threats.extend(archive_threats)
                if archive_threats:
                    threat_level = self._escalate(threat_level, archive_level)

        except Exception as e:
            log.error("Error scanning %s: %s", file_path, e)
            threats.append(f"Scan error: {e}")
            threat_level = self._escalate(threat_level, "suspicious")

        safe = threat_level == "safe"
        result = self._build_result(file_path, threats, threat_level, sha256, file_size)

        # Update counters & history
        self._files_scanned += 1
        if not safe:
            self._threats_found += 1
        self._last_scan = datetime.now(timezone.utc).isoformat()
        self._record_history(result)

        return result

    def scan_directory(self, dir_path: str) -> dict[str, Any]:
        """Scan every file in an email attachment directory.

        Returns a summary dict::

            {
                "scanned": int,
                "threats_found": int,
                "safe": bool,
                "threat_level": "safe" | "suspicious" | "malicious",
                "results": list[dict],
            }
        """
        results: list[dict[str, Any]] = []
        overall_level = "safe"

        try:
            if not os.path.exists(dir_path) or not os.path.isdir(dir_path):
                return {
                    "scanned": 0,
                    "threats_found": 0,
                    "safe": False,
                    "threat_level": "suspicious",
                    "results": [],
                    "error": "Directory not found",
                }

            for root, _dirs, files in os.walk(dir_path):
                for fname in files:
                    fpath = os.path.join(root, fname)
                    try:
                        result = self.scan_file(fpath)
                        results.append(result)
                        if result.get("threat_level") != "safe":
                            overall_level = self._escalate(
                                overall_level, result["threat_level"]
                            )
                    except Exception as e:
                        log.error("Error scanning %s: %s", fpath, e)
                        results.append(
                            self._build_result(fpath, [f"Scan error: {e}"], "suspicious", None, -1)
                        )
                        overall_level = self._escalate(overall_level, "suspicious")
        except Exception as e:
            log.error("Error scanning directory %s: %s", dir_path, e)
            return {
                "scanned": len(results),
                "threats_found": sum(1 for r in results if not r.get("safe", True)),
                "safe": False,
                "threat_level": "suspicious",
                "results": results,
                "error": str(e),
            }

        threats_found = sum(1 for r in results if not r.get("safe", True))
        return {
            "scanned": len(results),
            "threats_found": threats_found,
            "safe": overall_level == "safe",
            "threat_level": overall_level,
            "results": results,
        }

    def get_status(self) -> dict[str, Any]:
        """Return the current scanner status."""
        return {
            "name": self.name,
            "files_scanned": self._files_scanned,
            "threats_found": self._threats_found,
            "last_scan": self._last_scan,
            "hash_blocklist_size": len(self._hash_blocklist),
            "rar_support": RARFILE_AVAILABLE,
            "sevenzip_support": PY7ZR_AVAILABLE,
        }

    def get_history(self) -> list[dict[str, Any]]:
        """Return the persisted scan history."""
        return list(self._history)

    # ── Internal helpers ───────────────────────────────────────────

    def _scan_archive(self, archive_path: str) -> tuple[list[str], str]:
        """Inspect an archive attachment for embedded executables / encryption.

        Returns a list of threat descriptions and the highest threat level
        produced by the inspection (``safe`` / ``suspicious`` / ``malicious``).
        """
        threats: list[str] = []
        level = "safe"
        ext = os.path.splitext(archive_path)[1].lower()

        if ext == ".zip":
            try:
                with zipfile.ZipFile(archive_path, "r") as zf:
                    # Encrypted archive?
                    encrypted = False
                    embedded_execs: list[str] = []
                    for info in zf.infolist():
                        if info.flag_bits & 0x1:  # AES / traditional encryption bit
                            encrypted = True
                        inner_name = os.path.basename(info.filename)
                        if not inner_name:
                            continue
                        inner_ext = os.path.splitext(inner_name)[1].lower()
                        if inner_ext in _EMBEDDED_EXEC_EXTENSIONS:
                            embedded_execs.append(inner_name)
                        if _has_double_extension(inner_name):
                            threats.append(
                                f"Double extension inside archive: {inner_name}"
                            )
                            level = self._escalate(level, "malicious")

                    if encrypted:
                        threats.append("Encrypted archive — contents cannot be scanned")
                        level = self._escalate(level, "suspicious")

                    if embedded_execs:
                        for name in embedded_execs:
                            threats.append(f"Executable inside archive: {name}")
                        level = self._escalate(level, "malicious")

            except zipfile.BadZipFile:
                threats.append("Corrupt or invalid ZIP archive")
                level = self._escalate(level, "suspicious")
            except Exception as e:
                log.debug("ZIP inspection failed for %s: %s", archive_path, e)
                threats.append(f"Could not inspect ZIP archive: {e}")
                level = self._escalate(level, "suspicious")

        elif ext == ".rar" and RARFILE_AVAILABLE:
            try:
                with rarfile.RarFile(archive_path) as rf:
                    encrypted = rf.needs_password()
                    embedded_execs: list[str] = []
                    for info in rf.infolist():
                        inner_name = os.path.basename(info.filename)
                        if not inner_name:
                            continue
                        inner_ext = os.path.splitext(inner_name)[1].lower()
                        if inner_ext in _EMBEDDED_EXEC_EXTENSIONS:
                            embedded_execs.append(inner_name)
                        if _has_double_extension(inner_name):
                            threats.append(
                                f"Double extension inside archive: {inner_name}"
                            )
                            level = self._escalate(level, "malicious")

                    if encrypted:
                        threats.append("Encrypted RAR archive — contents cannot be scanned")
                        level = self._escalate(level, "suspicious")

                    if embedded_execs:
                        for name in embedded_execs:
                            threats.append(f"Executable inside archive: {name}")
                        level = self._escalate(level, "malicious")

            except Exception as e:
                log.debug("RAR inspection failed for %s: %s", archive_path, e)
                threats.append(f"Could not inspect RAR archive: {e}")
                level = self._escalate(level, "suspicious")

        elif ext == ".7z" and PY7ZR_AVAILABLE:
            try:
                with py7zr.SevenZipFile(archive_path, mode="r") as zf:
                    encrypted = zf.needs_password()
                    embedded_execs: list[str] = []
                    for info in zf.list():
                        inner_name = os.path.basename(info.filename)
                        if not inner_name:
                            continue
                        inner_ext = os.path.splitext(inner_name)[1].lower()
                        if inner_ext in _EMBEDDED_EXEC_EXTENSIONS:
                            embedded_execs.append(inner_name)
                        if _has_double_extension(inner_name):
                            threats.append(
                                f"Double extension inside archive: {inner_name}"
                            )
                            level = self._escalate(level, "malicious")

                    if encrypted:
                        threats.append("Encrypted 7z archive — contents cannot be scanned")
                        level = self._escalate(level, "suspicious")

                    if embedded_execs:
                        for name in embedded_execs:
                            threats.append(f"Executable inside archive: {name}")
                        level = self._escalate(level, "malicious")

            except Exception as e:
                log.debug("7z inspection failed for %s: %s", archive_path, e)
                threats.append(f"Could not inspect 7z archive: {e}")
                level = self._escalate(level, "suspicious")

        elif ext in _ARCHIVE_EXTENSIONS:
            # Archive type we recognise but cannot inspect (missing library)
            lib = "rarfile" if ext == ".rar" else "py7zr"
            threats.append(
                f"Archive type ({ext}) cannot be inspected — {lib} not installed"
            )
            level = self._escalate(level, "suspicious")

        return threats, level

    @staticmethod
    def _escalate(current: str, candidate: str) -> str:
        """Return the higher of two threat levels."""
        order = {"safe": 0, "suspicious": 1, "malicious": 2}
        if order.get(candidate, 0) > order.get(current, 0):
            return candidate
        return current

    @staticmethod
    def _build_result(
        file_path: str,
        threats: list[str],
        threat_level: str,
        sha256: str | None,
        file_size: int,
    ) -> dict[str, Any]:
        """Construct the standard scan result dict."""
        return {
            "safe": threat_level == "safe" and not threats,
            "threat_level": threat_level,
            "threats": threats,
            "file_info": {
                "path": file_path,
                "name": os.path.basename(file_path),
                "size": file_size,
                "extension": os.path.splitext(file_path)[1].lower(),
                "sha256": sha256,
            },
        }

    def _record_history(self, result: dict[str, Any]) -> None:
        """Append a scan result to the in-memory and on-disk history."""
        try:
            entry = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "file_path": result["file_info"]["path"],
                "file_name": result["file_info"]["name"],
                "threat_level": result["threat_level"],
                "threats": result["threats"],
                "sha256": result["file_info"].get("sha256"),
            }
            self._history.append(entry)
            _save_history(self._history)
        except Exception as e:
            log.debug("Failed to record history entry: %s", e)
