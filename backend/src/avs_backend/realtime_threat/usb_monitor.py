"""USB device insertion detection and auto-scan module for AVS AI Shield.

Monitors for USB/removable device insertion on Windows using WMI events.
When a new removable drive is detected, the module can automatically
trigger a threat scan on the newly inserted drive and generate alerts
if suspicious files are found.

Detection strategy:
    Polls ``Win32_LogicalDisk`` (DriveType = 2, removable) every 2 seconds
    via PowerShell and compares against the set of known drives. New
    drives trigger an insertion event; disappeared drives trigger a
    removal event. This userland polling approach avoids the complexity
    of long-lived ``Register-WmiEvent`` subscriptions while remaining
    responsive enough for interactive use.

Config options:
    usb_auto_scan       (bool)   — automatically scan USB drives on insertion (default True)
    usb_scan_quick      (bool)   — use quick scan vs full scan (default True)
    usb_exclude_drives  (list)   — drive letters to exclude from auto-scan (e.g. ["E:"])
"""

from __future__ import annotations

import logging
import platform
import subprocess
import threading
import time
from datetime import datetime, timezone
from typing import Any

from avs_backend.api.registry import get as get_handler

log = logging.getLogger("avs.realtime_threat.usb_monitor")

IS_WINDOWS = platform.system() == "Windows"
_CREATE_NO_WINDOW = 0x08000000 if IS_WINDOWS else 0

# Ring buffer size for recent USB events
_MAX_EVENTS = 500

# Polling interval (seconds) for removable drive detection
_POLL_INTERVAL = 2.0

# PowerShell timeout for WMI queries (seconds)
_PS_TIMEOUT = 10.0


def _now_iso() -> str:
    """Return the current UTC timestamp in ISO-8601 format."""
    return datetime.now(timezone.utc).isoformat()


def _run_powershell(script: str, timeout: float = _PS_TIMEOUT) -> str | None:
    """Run a PowerShell script and return its stdout (stripped).

    Returns ``None`` on non-Windows platforms or if the command fails.
    """
    if not IS_WINDOWS:
        return None
    try:
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy",
             "Bypass", "-Command", script],
            capture_output=True, text=True, timeout=timeout,
            creationflags=_CREATE_NO_WINDOW,
        )
        if proc.returncode != 0:
            log.debug("PowerShell exit %d: %s", proc.returncode, proc.stderr.strip())
            return None
        return proc.stdout.strip()
    except Exception as e:
        log.debug("PowerShell invocation failed: %s", e)
        return None


# =====================================================================
# Helper functions
# =====================================================================

def list_removable_drives() -> list[dict[str, Any]]:
    """List all currently connected removable drives.

    Each entry contains:
        drive_letter  — e.g. "E:"
        label         — volume label (may be empty)
        size          — total capacity in bytes
        free_space    — free space in bytes
        filesystem    — e.g. "FAT32", "NTFS", "exFAT"

    Returns an empty list on non-Windows platforms or on error.
    """
    if not IS_WINDOWS:
        return []

    # Query Win32_LogicalDisk for removable drives (DriveType = 2).
    # Properties are emitted pipe-delimited so that a single PowerShell
    # invocation yields parseable output without JSON edge cases.
    script = r"""
$ErrorActionPreference = 'SilentlyContinue'
Get-WmiObject Win32_LogicalDisk -Filter "DriveType=2" | ForEach-Object {
    "$($_.DeviceID)|$($_.VolumeName)|$($_.Size)|$($_.FreeSpace)|$($_.FileSystem)"
}
"""
    output = _run_powershell(script)
    if not output:
        return []

    drives: list[dict[str, Any]] = []
    for line in output.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split("|")
        if len(parts) < 5:
            continue
        drive_letter, label, size, free_space, filesystem = parts[:5]
        try:
            drives.append({
                "drive_letter": drive_letter.strip().upper(),
                "label": (label or "").strip(),
                "size": int(size) if size.strip() else 0,
                "free_space": int(free_space) if free_space.strip() else 0,
                "filesystem": (filesystem or "").strip(),
            })
        except (ValueError, TypeError):
            continue

    return drives


def scan_usb_drive(drive_letter: str) -> dict[str, Any]:
    """Scan a specific USB drive for threats.

    Triggers a ``threat.scan`` RPC on the given drive. The scan runs
    asynchronously in the threat engine; this function returns the
    initial scan handle (``scan_id``) immediately.

    Args:
        drive_letter: Drive letter with optional colon/backslash (e.g. "E:", "E:\\").

    Returns:
        A dict with ``success``, ``scan_id``, and ``drive`` keys. On
        non-Windows or if the threat engine is unavailable, returns a
        failure dict.
    """
    if not IS_WINDOWS:
        return {"success": False, "error": "not_windows", "drive": drive_letter}

    # Normalise the drive letter to "X:\"
    letter = drive_letter.strip().upper()
    if len(letter) >= 1 and letter[0].isalpha():
        path = f"{letter[0]}:\\"
    else:
        return {"success": False, "error": "invalid_drive_letter", "drive": drive_letter}

    handler = get_handler("threat.scan")
    if handler is None:
        log.warning("threat.scan handler not registered; cannot scan %s", path)
        return {"success": False, "error": "threat_engine_unavailable", "drive": path}

    try:
        result = handler({"path": path, "scan_type": "custom"})
        log.info("Triggered scan on USB drive %s: %s", path, result)
        return {
            "success": result.get("success", False),
            "scan_id": result.get("scan_id"),
            "drive": path,
            "files_total": result.get("files_total", 0),
        }
    except Exception as e:
        log.error("Failed to trigger scan on %s: %s", path, e)
        return {"success": False, "error": str(e), "drive": path}


# =====================================================================
# UsbMonitor class
# =====================================================================

class UsbMonitor:
    """Monitors for USB/removable device insertion and auto-scans new drives.

    On non-Windows platforms all operations are no-ops and accessors
    return empty/false values.
    """

    name = "usb_monitor"

    def __init__(self, config: dict[str, Any]) -> None:
        """Initialise the monitor with the supplied configuration.

        Config keys:
            usb_auto_scan       (bool)  — auto-scan inserted drives (default True)
            usb_scan_quick      (bool)  — quick scan vs full scan (default True)
            usb_exclude_drives  (list)  — drive letters to exclude from auto-scan
        """
        self._auto_scan_enabled: bool = bool(config.get("usb_auto_scan", True))
        self._scan_on_insert: bool = bool(config.get("usb_scan_quick", True))
        self._quick_scan: bool = bool(config.get("usb_scan_quick", True))
        self._exclude_drives: set[str] = {
            d.strip().upper().rstrip("\\").rstrip(":")
            for d in config.get("usb_exclude_drives", [])
            if isinstance(d, str) and d.strip()
        }

        self._running: bool = False
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()

        # Ring buffer of recent USB events
        self._events: list[dict[str, Any]] = []

        # Set of currently-known removable drive letters (e.g. {"E:", "F:"})
        self._known_drives: set[str] = set()

        # Counters
        self._devices_watched: int = 0
        self._scans_triggered: int = 0

    # ── Internal helpers ───────────────────────────────────────────

    def _add_event(self, event: dict[str, Any]) -> None:
        """Append an event to the thread-safe ring buffer."""
        with self._lock:
            self._events.append(event)
            if len(self._events) > _MAX_EVENTS:
                self._events.pop(0)

    def _is_excluded(self, drive_letter: str) -> bool:
        """Check whether a drive letter is in the exclusion list."""
        letter = drive_letter.strip().upper().rstrip("\\").rstrip(":")
        return letter in self._exclude_drives

    def _handle_insertion(self, drive: dict[str, Any]) -> None:
        """Handle a newly detected removable drive.

        Logs the event, optionally triggers an auto-scan, and stores the
        event in the ring buffer.
        """
        drive_letter = drive.get("drive_letter", "")
        label = drive.get("label", "")
        size = drive.get("size", 0)
        filesystem = drive.get("filesystem", "")

        log.info(
            "USB device inserted: %s (label=%r, size=%d bytes, fs=%s)",
            drive_letter, label, size, filesystem,
        )

        event: dict[str, Any] = {
            "type": "usb_inserted",
            "drive_letter": drive_letter,
            "label": label,
            "size": size,
            "free_space": drive.get("free_space", 0),
            "filesystem": filesystem,
            "auto_scanned": False,
            "scan_id": None,
            "timestamp": _now_iso(),
        }

        # Trigger auto-scan if enabled and the drive is not excluded
        if self._auto_scan_enabled and not self._is_excluded(drive_letter):
            scan_result = scan_usb_drive(drive_letter)
            event["auto_scanned"] = scan_result.get("success", False)
            event["scan_id"] = scan_result.get("scan_id")
            if scan_result.get("success"):
                with self._lock:
                    self._scans_triggered += 1
                # Poll the scan result to check for threats and generate alert
                self._check_scan_result(scan_result.get("scan_id"), drive_letter)
        else:
            reason = "excluded" if self._is_excluded(drive_letter) else "auto_scan_disabled"
            log.debug("Skipping auto-scan for %s: %s", drive_letter, reason)

        self._add_event(event)

    def _handle_removal(self, drive_letter: str) -> None:
        """Handle a removed removable drive."""
        log.info("USB device removed: %s", drive_letter)
        self._add_event({
            "type": "usb_removed",
            "drive_letter": drive_letter,
            "timestamp": _now_iso(),
        })

    def _check_scan_result(self, scan_id: str | None, drive_letter: str) -> None:
        """Poll a triggered scan for completion and generate an alert if threats are found.

        This runs in the monitoring thread and blocks for a bounded amount
        of time (max ~120 s). If the scan is still running when the timeout
        elapses, the result is simply not recorded — the threat engine
        itself retains the scan and its results.
        """
        if not scan_id:
            return

        result_handler = get_handler("threat.scanResult")
        if result_handler is None:
            return

        max_wait = 120.0  # seconds
        elapsed = 0.0
        interval = 3.0

        while elapsed < max_wait:
            # Bail out if monitoring was stopped
            with self._lock:
                if not self._running:
                    return

            try:
                result = result_handler({"scan_id": scan_id})
            except Exception as e:
                log.debug("Error fetching scan result %s: %s", scan_id, e)
                time.sleep(interval)
                elapsed += interval
                continue

            status = result.get("status", "")
            if status in ("completed", "error", "cancelled"):
                threats_found = result.get("threats_found", 0)
                if threats_found > 0:
                    threats = result.get("threats", [])
                    log.warning(
                        "USB scan on %s found %d threat(s)", drive_letter, threats_found,
                    )
                    self._add_event({
                        "type": "usb_threat_alert",
                        "drive_letter": drive_letter,
                        "scan_id": scan_id,
                        "threats_found": threats_found,
                        "threats": threats,
                        "severity": "high" if threats_found > 3 else "medium",
                        "timestamp": _now_iso(),
                    })
                else:
                    log.info("USB scan on %s completed clean", drive_letter)
                return

            time.sleep(interval)
            elapsed += interval

        log.debug("Timed out waiting for scan %s on %s", scan_id, drive_letter)

    # ── Monitoring loop ────────────────────────────────────────────

    def _monitor_loop(self) -> None:
        """Background polling loop — detects new/removed removable drives."""
        log.info("USB monitoring started")

        # Seed the known-drives set so we don't fire insertion events for
        # drives that were already connected at start-up.
        self._known_drives = {
            d["drive_letter"] for d in list_removable_drives()
        }
        with self._lock:
            self._devices_watched = len(self._known_drives)

        while True:
            with self._lock:
                if not self._running:
                    break

            try:
                current_drives = list_removable_drives()
                current_letters = {d["drive_letter"] for d in current_drives}

                # Detect insertions
                new_letters = current_letters - self._known_drives
                for drive in current_drives:
                    if drive["drive_letter"] in new_letters:
                        self._handle_insertion(drive)

                # Detect removals
                removed_letters = self._known_drives - current_letters
                for letter in removed_letters:
                    self._handle_removal(letter)

                self._known_drives = current_letters
                with self._lock:
                    self._devices_watched = len(self._known_drives)

            except Exception as e:
                log.debug("USB monitoring loop error: %s", e)

            time.sleep(_POLL_INTERVAL)

        log.info("USB monitoring stopped")

    # ── Public API ─────────────────────────────────────────────────

    def start(self) -> dict[str, Any]:
        """Start monitoring for USB insertion in a background thread."""
        if not IS_WINDOWS:
            return {"started": False, "reason": "not_windows"}

        with self._lock:
            if self._running:
                return {"started": False, "reason": "already_running"}

            self._running = True
            self._events.clear()
            self._devices_watched = 0
            self._scans_triggered = 0

        self._thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self._thread.start()

        return {"started": True, "timestamp": _now_iso()}

    def stop(self) -> dict[str, Any]:
        """Stop monitoring."""
        with self._lock:
            if not self._running:
                return {"stopped": False, "reason": "not_running"}
            self._running = False

        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5.0)

        return {"stopped": True, "timestamp": _now_iso()}

    def get_events(self) -> list[dict[str, Any]]:
        """Return recent USB events (most recent first)."""
        with self._lock:
            events = list(self._events)
        events.reverse()
        return events

    def get_status(self) -> dict[str, Any]:
        """Return the current monitoring status."""
        with self._lock:
            return {
                "running": self._running,
                "devices_watched": self._devices_watched,
                "scans_triggered": self._scans_triggered,
                "auto_scan_enabled": self._auto_scan_enabled,
                "scan_on_insert": self._scan_on_insert,
                "quick_scan": self._quick_scan,
                "excluded_drives": sorted(self._exclude_drives),
                "events_buffered": len(self._events),
                "captured_at": _now_iso(),
            }

    def get_devices(self) -> list[dict[str, Any]]:
        """List currently connected removable devices."""
        if not IS_WINDOWS:
            return []
        return list_removable_drives()
