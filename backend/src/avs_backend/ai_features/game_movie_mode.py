"""Game/Movie Mode for AVS Shield — silences non-critical notifications
and background scans while the user is gaming or watching media.

When enabled, Game/Movie Mode:
  * Pauses scheduled scans
  * Suppresses non-critical notifications
  * Pauses real-time monitoring (optional, off by default)
  * Pauses ML anomaly monitoring (optional)
  * Reduces background CPU usage from AVS processes
  * Automatically detects fullscreen applications (optional)

The mode can be toggled manually or auto-activated when a fullscreen
application is detected.
"""

from __future__ import annotations

import logging
import os
import platform
import threading
import time
from datetime import datetime, timezone
from typing import Any

try:
    import psutil
except ImportError:  # pragma: no cover
    psutil = None  # type: ignore[assignment]

log = logging.getLogger("avs.ai_features.game_mode")

IS_WINDOWS = platform.system() == "Windows"

_CREATE_NO_WINDOW = 0x08000000


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# =====================================================================
# GameMovieMode
# =====================================================================

class GameMovieMode:
    """Silences non-critical AVS activity during gaming or media playback."""

    name = "game_movie_mode"

    def __init__(self, config: dict[str, Any]) -> None:
        self._config = config or {}
        self._lock = threading.Lock()
        self._active = False
        self._auto_detect = bool(self._config.get("auto_detect", False))
        self._pause_realtime = bool(self._config.get("pause_realtime", False))
        self._pause_ml = bool(self._config.get("pause_ml", True))
        self._pause_scheduled_scans = bool(
            self._config.get("pause_scheduled_scans", True)
        )
        self._suppress_notifications = bool(
            self._config.get("suppress_notifications", True)
        )
        self._activated_at: str | None = None
        self._deactivated_at: str | None = None
        self._auto_thread: threading.Thread | None = None
        self._auto_stop = threading.Event()
        self._fullscreen_was: bool = False
        self._sessions: list[dict[str, Any]] = []
        self._max_sessions = 100

    # -----------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------

    def activate(self) -> dict[str, Any]:
        """Activate Game/Movie Mode."""
        with self._lock:
            if self._active:
                return {"success": True, "message": "Already active", "active": True}
            self._active = True
            self._activated_at = _now_iso()
            log.info("Game/Movie Mode activated at %s", self._activated_at)
        return {
            "success": True,
            "active": True,
            "activated_at": self._activated_at,
            "settings": self._get_settings(),
        }

    def deactivate(self) -> dict[str, Any]:
        """Deactivate Game/Movie Mode."""
        with self._lock:
            if not self._active:
                return {"success": True, "message": "Not active", "active": False}
            self._active = False
            self._deactivated_at = _now_iso()
            if self._activated_at:
                session = {
                    "activated_at": self._activated_at,
                    "deactivated_at": self._deactivated_at,
                }
                self._sessions.append(session)
                if len(self._sessions) > self._max_sessions:
                    self._sessions.pop(0)
            log.info("Game/Movie Mode deactivated at %s", self._deactivated_at)
        return {
            "success": True,
            "active": False,
            "deactivated_at": self._deactivated_at,
        }

    def toggle(self) -> dict[str, Any]:
        """Toggle Game/Movie Mode on/off."""
        if self._active:
            return self.deactivate()
        return self.activate()

    def get_status(self) -> dict[str, Any]:
        """Return current Game/Movie Mode status."""
        with self._lock:
            return {
                "active": self._active,
                "auto_detect": self._auto_detect,
                "activated_at": self._activated_at,
                "deactivated_at": self._deactivated_at,
                "settings": self._get_settings(),
                "sessions_count": len(self._sessions),
                "fullscreen_detected": self._fullscreen_was,
                "captured_at": _now_iso(),
            }

    def configure(self, config: dict[str, Any]) -> dict[str, Any]:
        """Update Game/Movie Mode configuration."""
        with self._lock:
            if "auto_detect" in config:
                self._auto_detect = bool(config["auto_detect"])
            if "pause_realtime" in config:
                self._pause_realtime = bool(config["pause_realtime"])
            if "pause_ml" in config:
                self._pause_ml = bool(config["pause_ml"])
            if "pause_scheduled_scans" in config:
                self._pause_scheduled_scans = bool(config["pause_scheduled_scans"])
            if "suppress_notifications" in config:
                self._suppress_notifications = bool(config["suppress_notifications"])
        # Start or stop auto-detect thread
        if self._auto_detect:
            self._start_auto_detect()
        else:
            self._stop_auto_detect()
        return {"success": True, "settings": self._get_settings()}

    def get_sessions(self) -> list[dict[str, Any]]:
        """Return history of Game/Movie Mode sessions."""
        with self._lock:
            return list(self._sessions)

    def is_active(self) -> bool:
        """Return True if Game/Movie Mode is currently active."""
        with self._lock:
            return self._active

    # -----------------------------------------------------------------
    # Settings helper
    # -----------------------------------------------------------------

    def _get_settings(self) -> dict[str, Any]:
        return {
            "pause_realtime": self._pause_realtime,
            "pause_ml": self._pause_ml,
            "pause_scheduled_scans": self._pause_scheduled_scans,
            "suppress_notifications": self._suppress_notifications,
        }

    # -----------------------------------------------------------------
    # Auto-detect fullscreen
    # -----------------------------------------------------------------

    def _start_auto_detect(self) -> None:
        if self._auto_thread and self._auto_thread.is_alive():
            return
        self._auto_stop.clear()
        self._auto_thread = threading.Thread(
            target=self._auto_detect_loop, daemon=True
        )
        self._auto_thread.start()
        log.info("Auto-detect fullscreen thread started")

    def _stop_auto_detect(self) -> None:
        self._auto_stop.set()
        if self._auto_thread:
            self._auto_thread.join(timeout=3)
        self._auto_thread = None

    def _auto_detect_loop(self) -> None:
        """Background thread that detects fullscreen apps and toggles mode."""
        while not self._auto_stop.is_set():
            try:
                fullscreen = self._detect_fullscreen()
                if fullscreen and not self._active:
                    log.info("Fullscreen detected — auto-activating Game/Movie Mode")
                    self.activate()
                elif not fullscreen and self._active:
                    log.info("Fullscreen ended — auto-deactivating Game/Movie Mode")
                    self.deactivate()
                self._fullscreen_was = fullscreen
            except Exception as e:
                log.debug("Auto-detect error: %s", e)
            self._auto_stop.wait(5)  # Check every 5 seconds

    @staticmethod
    def _detect_fullscreen() -> bool:
        """Detect if a fullscreen application is running.

        Uses PowerShell to query foreground window state on Windows.
        Returns False on non-Windows or if detection fails.
        """
        if not IS_WINDOWS:
            return False
        try:
            import subprocess
            # Query for fullscreen processes via PowerShell
            # Check if any process has a window that covers the entire screen
            ps_script = (
                "Add-Type -AssemblyName System.Windows.Forms;"
                "$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds;"
                "$procs = Get-Process | Where-Object { $_.MainWindowTitle -ne '' };"
                "foreach ($p in $procs) {"
                "  try {"
                "    $hwnd = $p.MainWindowHandle;"
                "    if ($hwnd -eq 0) { continue }"
                "    Add-Type -TypeDefinition '"
                "      using System;"
                "      using System.Runtime.InteropServices;"
                "      public class Win {"
                "        [DllImport(\"user32.dll\")]"
                "        public static extern bool GetWindowRect(IntPtr h, out RECT r);"
                "        public struct RECT { public int Left, Top, Right, Bottom; }"
                "      }';"
                "    $r = New-Object Win+RECT;"
                "    [Win]::GetWindowRect($hwnd, [ref]$r) | Out-Null;"
                "    if ($r.Right - $r.Left -ge $screen.Width -and"
                "        $r.Bottom - $r.Top -ge $screen.Height) {"
                "      Write-Output 'FULLSCREEN';"
                "      exit;"
                "    }"
                "  } catch {}"
                "}"
                "Write-Output 'NORMAL';"
            )
            result = subprocess.run(
                ["powershell", "-NoProfile", "-Command", ps_script],
                capture_output=True, text=True, timeout=10,
                creationflags=_CREATE_NO_WINDOW,
            )
            return "FULLSCREEN" in result.stdout
        except Exception:
            return False

    # -----------------------------------------------------------------
    # Cleanup
    # -----------------------------------------------------------------

    def shutdown(self) -> None:
        """Clean shutdown — stop auto-detect thread."""
        self._stop_auto_detect()
        if self._active:
            self.deactivate()
