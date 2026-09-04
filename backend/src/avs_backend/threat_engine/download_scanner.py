"""Download Scanner - real-time scanning of downloaded files.

Monitors browser download directories for new files and automatically
scans them using ClamAV and other detection sources. This provides
real-time protection against downloaded threats, similar to Norton's
Download Insight and McAfee's download scanning.

When a new executable or archive file appears in a monitored directory
(Downloads, Desktop), it is immediately scanned. If a threat is detected,
the file is quarantined and an alert is raised.

Monitored directories:
  - USERPROFILE/Downloads (all browsers)
  - USERPROFILE/Desktop
  - LOCALAPPDATA/Microsoft/Windows/INetCache/IE (Internet Explorer)
  - LOCALAPPDATA/Google/Chrome/User Data/Default/Downloads (Chrome)
  - APPDATA/Mozilla/Firefox/Profiles/*/downloads (Firefox)
  - LOCALAPPDATA/Microsoft/Edge/User Data/Default/Downloads (Edge)

File types scanned on arrival:
  - Executables: .exe, .dll, .scr, .msi, .com, .bat, .cmd, .ps1
  - Scripts: .vbs, .js, .jse, .wsf, .hta, .py, .sh
  - Archives: .zip, .rar, .7z, .cab, .tar, .gz, .iso
  - Documents with macros: .docm, .xlsm, .pptm
  - Other: .lnk, .jar, .apk, .appx, .pdf, .html, .htm

RPC methods:
    download_scanner.status   - get scanner status
    download_scanner.start    - start monitoring download directories
    download_scanner.stop     - stop monitoring
    download_scanner.events   - get recent scan events
    download_scanner.scanFile - manually scan a single downloaded file
"""
from __future__ import annotations

import logging
import os
import platform
import threading
import time
from datetime import datetime, timezone
from typing import Any

from avs_backend.api.registry import register

log = logging.getLogger("avs.download_scanner")

IS_WINDOWS = platform.system() == "Windows"
_CREATE_NO_WINDOW = 0x08000000 if IS_WINDOWS else 0

# File extensions to scan when they appear in download directories
_SCAN_EXTENSIONS = {
    ".exe", ".dll", ".sys", ".scr", ".ocx", ".com", ".pif", ".bat",
    ".cmd", ".ps1", ".vbs", ".js", ".jse", ".wsf", ".wsh", ".hta",
    ".msi", ".msp", ".mst", ".cpl", ".inf", ".lnk", ".jar", ".class",
    ".py", ".pyw", ".rb", ".pl", ".sh", ".apk", ".appx", ".msix",
    ".zip", ".rar", ".7z", ".cab", ".tar", ".gz", ".iso", ".img",
    ".docm", ".xlsm", ".pptm",
    ".pdf", ".html", ".htm", ".swf", ".flv",
}

# Directories to monitor for downloads
def _get_download_dirs() -> list[str]:
    """Get all browser download directories."""
    dirs: list[str] = []
    if not IS_WINDOWS:
        return dirs

    user_profile = os.environ.get("USERPROFILE", os.path.expanduser("~"))
    local_app = os.environ.get("LOCALAPPDATA", "")
    app_data = os.environ.get("APPDATA", "")

    candidates = [
        # Standard Downloads folder
        os.path.join(user_profile, "Downloads"),
        # Desktop (some users save downloads here)
        os.path.join(user_profile, "Desktop"),
        # Internet Explorer / Edge legacy INetCache
        os.path.join(local_app, "Microsoft", "Windows", "INetCache"),
        # Chrome
        os.path.join(local_app, "Google", "Chrome", "User Data", "Default", "Downloads"),
        # Edge
        os.path.join(local_app, "Microsoft", "Edge", "User Data", "Default", "Downloads"),
        # Firefox profiles (wildcard - we check parent)
        os.path.join(app_data, "Mozilla", "Firefox", "Profiles"),
        # Temp download locations
        os.environ.get("TEMP", ""),
    ]

    for c in candidates:
        if c and os.path.isdir(c):
            dirs.append(os.path.abspath(c))

    # For Firefox, find all profile download dirs
    firefox_profiles = os.path.join(app_data, "Mozilla", "Firefox", "Profiles")
    if os.path.isdir(firefox_profiles):
        try:
            for profile in os.listdir(firefox_profiles):
                profile_downloads = os.path.join(firefox_profiles, profile, "downloads")
                if os.path.isdir(profile_downloads):
                    dirs.append(os.path.abspath(profile_downloads))
        except Exception:
            pass

    # De-duplicate
    seen: set[str] = set()
    unique: list[str] = []
    for d in dirs:
        key = d.lower()
        if key not in seen:
            seen.add(key)
            unique.append(d)
    return unique


def _should_scan(path: str) -> bool:
    """Check if a file should be scanned based on extension."""
    ext = os.path.splitext(path)[1].lower()
    return ext in _SCAN_EXTENSIONS


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class DownloadScanner:
    """Real-time download scanner — monitors download directories and scans new files."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._running = False
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._watched_dirs: list[str] = []
        self._seen_files: dict[str, float] = {}  # path -> first_seen timestamp
        self._events: list[dict[str, Any]] = []
        self._max_events = 500
        self._threats_found = 0
        self._files_scanned = 0
        self._started_at: str | None = None

    def start(self) -> bool:
        with self._lock:
            if self._running:
                return True
            self._watched_dirs = _get_download_dirs()
            if not self._watched_dirs:
                log.warning("No download directories found to monitor")
                return False
            self._running = True
            self._stop.clear()
            self._started_at = _now_iso()
            self._thread = threading.Thread(target=self._poll_loop, name="download_scanner", daemon=True)
            self._thread.start()
            log.info("Download scanner started, monitoring %d directories", len(self._watched_dirs))
            return True

    def stop(self) -> None:
        with self._lock:
            if not self._running:
                return
            self._stop.set()
            self._running = False
        if self._thread:
            self._thread.join(timeout=5)
            self._thread = None
        log.info("Download scanner stopped")

    def _poll_loop(self) -> None:
        """Poll download directories for new files and scan them."""
        # Seed with existing files so we don't scan everything on startup
        self._seed_existing_files()
        poll_interval = 2.0  # seconds
        while not self._stop.is_set():
            try:
                self._scan_new_files()
            except Exception as e:
                log.warning("Download scan poll error: %s", e)
            self._stop.wait(poll_interval)

    def _seed_existing_files(self) -> None:
        """Record existing files so only NEW files trigger scans."""
        for directory in self._watched_dirs:
            try:
                for root, _dirs, files in os.walk(directory):
                    for fname in files:
                        fpath = os.path.join(root, fname)
                        if _should_scan(fpath):
                            try:
                                self._seen_files[fpath] = os.path.getmtime(fpath)
                            except OSError:
                                pass
            except Exception:
                pass
        log.info("Seeded %d existing files in download directories", len(self._seen_files))

    def _scan_new_files(self) -> None:
        """Find and scan files that appeared since the last poll."""
        current_files: set[str] = set()
        for directory in self._watched_dirs:
            try:
                for root, _dirs, files in os.walk(directory):
                    for fname in files:
                        fpath = os.path.join(root, fname)
                        if not _should_scan(fpath):
                            continue
                        current_files.add(fpath)
                        # Check if this is a new file
                        if fpath not in self._seen_files:
                            self._seen_files[fpath] = time.time()
                            self._scan_file_async(fpath)
                        else:
                            # Check if file was modified (re-downloaded)
                            try:
                                mtime = os.path.getmtime(fpath)
                                if mtime > self._seen_files.get(fpath, 0) + 1:
                                    self._seen_files[fpath] = mtime
                                    self._scan_file_async(fpath)
                            except OSError:
                                pass
            except Exception:
                pass
        # Clean up deleted files from seen set
        deleted = set(self._seen_files.keys()) - current_files
        for d in deleted:
            self._seen_files.pop(d, None)

    def _scan_file_async(self, file_path: str) -> None:
        """Scan a single file in a background thread."""
        # Wait briefly for the file to finish being written
        time.sleep(0.5)
        try:
            if not os.path.exists(file_path):
                return
            # Check file is not still being written
            size1 = os.path.getsize(file_path)
            time.sleep(0.3)
            size2 = os.path.getsize(file_path)
            if size1 != size2:
                return  # Still being written, will catch on next poll
            if size2 == 0:
                return
        except OSError:
            return

        thread = threading.Thread(target=self._scan_file, args=(file_path,), daemon=True)
        thread.start()

    def _scan_file(self, file_path: str) -> None:
        """Scan a downloaded file with all available detection sources."""
        result = {"file": file_path, "timestamp": _now_iso(), "detected": False}
        self._files_scanned += 1

        # Try ClamAV
        try:
            from avs_backend.threat_engine.clamav_scanner import check_clamav_available, ClamAvScanner
            if check_clamav_available():
                scanner = ClamAvScanner({})
                scan_result = scanner.scan_file(file_path)
                if scan_result and scan_result.get("detected"):
                    result["detected"] = True
                    result["threat_name"] = scan_result.get("threat_name", "Unknown")
                    result["threat_type"] = scan_result.get("threat_type", "malware")
                    result["severity"] = scan_result.get("severity", "high")
                    result["source"] = "clamav"
        except Exception as e:
            log.debug("ClamAV scan failed for %s: %s", file_path, e)

        # Try hash detector if ClamAV didn't find anything
        if not result.get("detected"):
            try:
                from avs_backend.threat_engine.hash_detector import HashDetector
                detector = HashDetector({})
                scan_result = detector.scan_file(file_path)
                if scan_result and scan_result.get("detected"):
                    result["detected"] = True
                    result["threat_name"] = scan_result.get("threat_name", "Unknown")
                    result["threat_type"] = scan_result.get("threat_type", "malware")
                    result["severity"] = scan_result.get("severity", "high")
                    result["source"] = "hash_detector"
            except Exception as e:
                log.debug("Hash detector scan failed for %s: %s", file_path, e)

        # Try behavioral detector for scripts
        if not result.get("detected"):
            try:
                from avs_backend.threat_engine.behavioral import BehavioralDetector
                detector = BehavioralDetector({})
                scan_result = detector.scan_file(file_path)
                if scan_result and scan_result.get("detected"):
                    result["detected"] = True
                    result["threat_name"] = scan_result.get("threat_name", "Behavioral.Detected")
                    result["threat_type"] = scan_result.get("threat_type", "suspicious")
                    result["severity"] = scan_result.get("severity", "medium")
                    result["source"] = "behavioral"
            except Exception as e:
                log.debug("Behavioral scan failed for %s: %s", file_path, e)

        # If threat detected, quarantine it
        if result.get("detected"):
            self._threats_found += 1
            try:
                from avs_backend.threat_engine import threat_quarantine
                threat_quarantine({
                    "file_path": file_path,
                    "threat_info": {
                        "threat_name": result.get("threat_name", "Unknown"),
                        "threat_type": result.get("threat_type", "malware"),
                        "severity": result.get("severity", "high"),
                        "source": result.get("source", "download_scanner"),
                    },
                })
                result["quarantined"] = True
                log.warning("Downloaded threat quarantined: %s (%s)", file_path, result.get("threat_name"))
            except Exception as e:
                result["quarantined"] = False
                result["quarantine_error"] = str(e)
                log.error("Failed to quarantine downloaded threat %s: %s", file_path, e)

        # Record event
        with self._lock:
            self._events.append(result)
            if len(self._events) > self._max_events:
                self._events = self._events[-self._max_events:]

    def get_status(self) -> dict[str, Any]:
        return {
            "running": self._running,
            "started_at": self._started_at,
            "watched_dirs": self._watched_dirs,
            "files_scanned": self._files_scanned,
            "threats_found": self._threats_found,
            "events_count": len(self._events),
        }

    def get_events(self, limit: int = 100) -> list[dict[str, Any]]:
        with self._lock:
            return list(reversed(self._events[-limit:]))

    def scan_file_manual(self, file_path: str) -> dict[str, Any]:
        """Manually scan a single file (used by RPC)."""
        if not os.path.exists(file_path):
            return {"success": False, "error": "File not found"}
        self._scan_file(file_path)
        with self._lock:
            if self._events:
                return {"success": True, "result": self._events[-1]}
        return {"success": True, "result": {"file": file_path, "detected": False}}


# Singleton instance
_scanner: DownloadScanner | None = None
_scanner_lock = threading.Lock()


def _get_scanner() -> DownloadScanner:
    global _scanner
    with _scanner_lock:
        if _scanner is None:
            _scanner = DownloadScanner()
        return _scanner


@register("download_scanner.status")
def download_scanner_status(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get download scanner status."""
    return {"success": True, "status": _get_scanner().get_status()}


@register("download_scanner.start")
def download_scanner_start(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Start monitoring download directories."""
    scanner = _get_scanner()
    if scanner.start():
        return {"success": True, "message": "Download scanner started"}
    return {"success": False, "error": "No download directories found"}


@register("download_scanner.stop")
def download_scanner_stop(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Stop monitoring download directories."""
    _get_scanner().stop()
    return {"success": True, "message": "Download scanner stopped"}


@register("download_scanner.events")
def download_scanner_events(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get recent download scan events."""
    params = params or {}
    limit = int(params.get("limit", 100))
    return {"success": True, "events": _get_scanner().get_events(limit)}


@register("download_scanner.scanFile")
def download_scanner_scan_file(params: dict[str, Any] | None) -> dict[str, Any]:
    """Manually scan a single downloaded file."""
    params = params or {}
    file_path = params.get("file_path", "")
    if not file_path:
        return {"success": False, "error": "file_path is required"}
    return _get_scanner().scan_file_manual(file_path)
