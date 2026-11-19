"""Scam Guards — remote-access and clipboard-swap detection.

Two watchers, both free/local, both testable via injected enumerators:

* RemoteAccessGuard — polls running processes for remote-access tools
  (AnyDesk, TeamViewer, Quick Assist, ...). Severity is raised when a
  tool starts shortly after WebShield blocked a scam page — the classic
  tech-support-scam sequence. Bare launches get an informational alert.

* ClipboardGuard — polls the Windows clipboard. When a crypto address
  is replaced by a *different* crypto address within a short window, it
  is almost always a clipper trojan → critical alert.
"""

from __future__ import annotations

import json
import logging
import os
import platform
import re
import threading
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

log = logging.getLogger("avs.scam_guards")

IS_WINDOWS = platform.system() == "Windows"

_DATA_DIR = Path(os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))) / "AVS AI Shield" / "threat_engine"
_DATA_DIR.mkdir(parents=True, exist_ok=True)
_ALERTS_PATH = _DATA_DIR / "scam_guard_alerts.jsonl"
_MAX_ALERTS = 500

# Remote-access tool executables (lowercase, no .exe needed on match).
RAT_PROCESSES = {
    "anydesk", "teamviewer", "teamviewer_service", "quickassist", "quick_assist",
    "ultraviewer", "ultraviewer_desktop", "rustdesk", "logmein", "logmeinrescue",
    "gotoassist", "gotomeeting", "vncviewer", "vncserver", "winvnc", "tvnviewer",
    "ammyy", "aadmin", "supremo", "splashtop", "splashtop_streamer",
    "screenconnect", "connectwisecontrol", "connectwise", "zohoassist",
    "aeroadmin", "remotepc", "parsec", "dwagent", "netop", "radmin", "rserver3",
    "showmypc", "fixme.it", "isl light", "isllight", "beamyourscreen",
}

# Seconds after a blocked URL during which a RAT launch is high-severity.
_THREAT_CONTEXT_WINDOW = 15 * 60
# Seconds within which a crypto-address clipboard swap is suspicious.
_CLIPBOARD_SWAP_WINDOW = 20

_CRYPTO_RES = [
    re.compile(r"\bbc1[a-z0-9]{25,60}\b", re.I),
    re.compile(r"\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b"),
    re.compile(r"\b0x[a-fA-F0-9]{40}\b"),
    re.compile(r"\bT[A-Za-z1-9]{33}\b"),
]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _crypto_addresses(text: str) -> set[str]:
    found: set[str] = set()
    for rx in _CRYPTO_RES:
        found.update(rx.findall(text))
    return found


def read_clipboard_text() -> str:
    """Read clipboard text via Win32 ctypes. Returns "" on any failure."""
    if not IS_WINDOWS:
        return ""
    try:
        import ctypes
        user32 = ctypes.windll.user32
        kernel32 = ctypes.windll.kernel32
        CF_UNICODETEXT = 13
        # Explicit signatures — without them ctypes defaults to 32-bit int
        # and truncates 64-bit HANDLEs, which segfaults on Win64.
        user32.OpenClipboard.argtypes = [ctypes.c_void_p]
        user32.GetClipboardData.argtypes = [ctypes.c_uint]
        user32.GetClipboardData.restype = ctypes.c_void_p
        kernel32.GlobalLock.argtypes = [ctypes.c_void_p]
        kernel32.GlobalLock.restype = ctypes.c_void_p
        kernel32.GlobalUnlock.argtypes = [ctypes.c_void_p]
        if not user32.OpenClipboard(None):
            return ""
        try:
            handle = user32.GetClipboardData(CF_UNICODETEXT)
            if not handle:
                return ""
            ptr = kernel32.GlobalLock(handle)
            if not ptr:
                return ""
            try:
                return ctypes.wstring_at(ptr) or ""
            finally:
                kernel32.GlobalUnlock(handle)
        finally:
            user32.CloseClipboard()
    except Exception:
        return ""


def _process_names_psutil() -> set[str]:
    import psutil
    return {
        (p.info["name"] or "").lower().removesuffix(".exe")
        for p in psutil.process_iter(["name"])
    }


class ScamGuardMonitor:
    """Background monitor driving both guards. Enumerators/readers are
    injectable so unit tests never touch the OS."""

    def __init__(
        self,
        process_names_fn: Callable[[], set[str]] | None = None,
        clipboard_fn: Callable[[], str] | None = None,
        threat_context_fn: Callable[[], float] | None = None,
        on_alert: Callable[[dict[str, Any]], None] | None = None,
        poll_seconds: float = 3.0,
    ) -> None:
        self._proc_fn = process_names_fn or _process_names_psutil
        self._clip_fn = clipboard_fn or read_clipboard_text
        # Returns the epoch of the most recent blocked URL (0 if none).
        self._threat_fn = threat_context_fn or (lambda: 0.0)
        self._on_alert = on_alert
        self._poll = poll_seconds
        self._alerts: deque[dict[str, Any]] = deque(maxlen=_MAX_ALERTS)
        self._seen_processes: set[str] = set()
        self._last_clip: tuple[set[str], float] = (set(), 0.0)
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._lock = threading.RLock()
        self._running = False
        self._primed = False

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    @property
    def running(self) -> bool:
        return self._running

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._loop, name="scam-guards", daemon=True)
        self._thread.start()
        log.info("Scam guards started (poll %.1fs)", self._poll)

    def stop(self) -> None:
        self._running = False
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)
            self._thread = None

    def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                self.tick()
            except Exception as e:
                log.debug("Guard tick failed: %s", e)
            self._stop.wait(self._poll)

    # ------------------------------------------------------------------
    # One poll cycle — split out so tests can drive it directly
    # ------------------------------------------------------------------

    def tick(self) -> None:
        self._check_processes()
        self._check_clipboard()

    def _check_processes(self) -> None:
        try:
            names = self._proc_fn()
        except Exception:
            return
        rats = names & RAT_PROCESSES
        if not self._primed:
            # First poll: record baseline so existing tools don't alert.
            self._seen_processes = rats
            self._primed = True
            return
        new_rats = rats - self._seen_processes
        self._seen_processes = rats
        now = time.time()
        last_block = self._threat_fn()
        in_context = last_block and (now - last_block) < _THREAT_CONTEXT_WINDOW
        for name in sorted(new_rats):
            if in_context:
                self._alert(
                    "remote_access_tool", "critical",
                    f"{name} started {int(now - last_block)}s after a blocked scam page — "
                    "this is the classic tech-support-scam sequence.",
                    process=name)
            else:
                self._alert(
                    "remote_access_tool", "medium",
                    f"{name} started. If you didn't install it for a support session "
                    "you requested, this may be a scam.",
                    process=name)

    def _check_clipboard(self) -> None:
        text = self._clip_fn() or ""
        addrs = _crypto_addresses(text[:4096])
        if not addrs:
            return
        prev_addrs, prev_ts = self._last_clip
        self._last_clip = (addrs, time.time())
        if prev_addrs and addrs != prev_addrs and \
                (time.time() - prev_ts) < _CLIPBOARD_SWAP_WINDOW:
            self._alert(
                "clipboard_swap", "critical",
                "A crypto wallet address in your clipboard was silently replaced — "
                "a clipper trojan signature. Re-copy the address and verify every "
                "character before sending.",
                new_address=next(iter(addrs)),
            )

    # ------------------------------------------------------------------
    # Alerts
    # ------------------------------------------------------------------

    def _alert(self, kind: str, severity: str, message: str, **extra) -> dict[str, Any]:
        alert = {
            "type": kind, "severity": severity, "message": message,
            "timestamp": _now_iso(), **extra,
        }
        with self._lock:
            self._alerts.append(alert)
            self._persist(alert)
        log.warning("Scam guard alert [%s/%s]: %s", kind, severity, message)
        if self._on_alert:
            try:
                self._on_alert(alert)
            except Exception as e:
                log.debug("on_alert callback failed: %s", e)
        return alert

    def _persist(self, alert: dict[str, Any]) -> None:
        try:
            lines: deque[str] = deque(maxlen=_MAX_ALERTS)
            if _ALERTS_PATH.exists():
                with open(_ALERTS_PATH, "r", encoding="utf-8") as f:
                    lines.extend(f.readlines())
            lines.append(json.dumps(alert) + "\n")
            tmp = _ALERTS_PATH.with_suffix(".tmp")
            with open(tmp, "w", encoding="utf-8") as f:
                f.writelines(lines)
            os.replace(tmp, _ALERTS_PATH)
        except Exception as e:
            log.debug("Alert persist failed: %s", e)

    def get_alerts(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._lock:
            return list(self._alerts)[-limit:]

    def status(self) -> dict[str, Any]:
        return {
            "running": self._running,
            "poll_seconds": self._poll,
            "alerts_count": len(self._alerts),
            "rat_tools_watched": len(RAT_PROCESSES),
        }
