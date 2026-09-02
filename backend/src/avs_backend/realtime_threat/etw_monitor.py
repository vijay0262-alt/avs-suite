"""ETW / WMI real-time file and process monitoring for AVS Shield.

This module provides real-time monitoring of security-relevant file and
process activity on Windows. The name references ETW (Event Tracing for
Windows), but a true ETW consumer requires kernel-level access and
specialised Python bindings (``pywintrace`` / ``Etw``) that are uncommon
in userland applications.

For practicality this module therefore uses a **WMI-based approach**:

  * **File monitoring** — ``System.IO.FileSystemWatcher`` launched via
    PowerShell to watch for creation, modification and deletion of
    executable files in critical user directories (Temp, AppData,
    LocalAppData, Downloads, Desktop, Startup).
  * **Process monitoring** — a WMI ``Win32_ProcessStartTrace`` event
    subscription launched via PowerShell to capture new process
    creation with command line, executable path and parent process.

If WMI / PowerShell is unavailable (or the platform is not Windows),
the module transparently degrades to a ``PsutilFallback`` that polls
running processes via ``psutil``.

All monitoring runs in daemon threads so it never blocks shutdown.
Events are stored in a thread-safe ring buffer (max 1000 events).
"""

from __future__ import annotations

import json
import logging
import os
import platform
import subprocess
import threading
import time
from collections import deque
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any

log = logging.getLogger("avs.realtime_threat.etw_monitor")

IS_WINDOWS = platform.system() == "Windows"

# Creation flag to avoid popping up a console window on Windows.
_CREATE_NO_WINDOW = 0x08000000

# Maximum number of events retained in the ring buffer.
_MAX_EVENTS = 1000

# Executable / script extensions considered security-relevant.
_EXEC_EXTENSIONS = (".exe", ".dll", ".scr", ".bat", ".ps1", ".vbs", ".js")

# Locations commonly abused by malware — used to flag suspicious processes.
_SUSPICIOUS_PATH_MARKERS = (
    "\\temp\\",
    "\\appdata\\local\\temp\\",
    "\\windows\\temp\\",
    "\\downloads\\",
    "\\programdata\\",
)


# =====================================================================
# Data classes
# =====================================================================

@dataclass
class MonitorEvent:
    """A single monitoring event captured by the watcher."""

    timestamp: str
    type: str  # file_create | file_modify | file_delete | process_start
    path: str = ""
    process_name: str = ""
    details: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# =====================================================================
# Helpers
# =====================================================================

def _critical_directories() -> list[str]:
    """Return the list of critical directories to watch for file changes.

    Environment variables are expanded and only directories that exist on
    the current system are returned.
    """
    candidates = [
        os.path.expandvars("%TEMP%"),
        os.path.expandvars("%APPDATA%"),
        os.path.expandvars("%LOCALAPPDATA%"),
        os.path.join(os.path.expanduser("~"), "Downloads"),
        os.path.join(os.path.expanduser("~"), "Desktop"),
        # Windows Startup folder (per-user)
        os.path.expandvars(r"%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"),
        # All-users Startup folder
        os.path.expandvars(r"%ProgramData%\Microsoft\Windows\Start Menu\Programs\Startup"),
    ]
    dirs: list[str] = []
    for d in candidates:
        if d and os.path.isdir(d):
            dirs.append(os.path.abspath(d))
    # De-duplicate while preserving order.
    seen: set[str] = set()
    unique: list[str] = []
    for d in dirs:
        key = d.lower()
        if key not in seen:
            seen.add(key)
            unique.append(d)
    return unique


def _is_executable(path: str) -> bool:
    """Return True if *path* has a security-relevant extension."""
    return path.lower().endswith(_EXEC_EXTENSIONS)


def _is_suspicious_path(exe_path: str) -> bool:
    """Return True if *exe_path* lives in a commonly abused location."""
    if not exe_path:
        return False
    lower = exe_path.lower()
    return any(marker in lower for marker in _SUSPICIOUS_PATH_MARKERS)


def _run_powershell(script: str, timeout: float = 10.0) -> str | None:
    """Run a PowerShell snippet and return its stdout.

    Returns ``None`` if PowerShell is unavailable or the command failed.
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
            return None
        return proc.stdout.strip()
    except Exception as e:
        log.debug("PowerShell command failed: %s", e)
        return None


# =====================================================================
# Ring buffer
# =====================================================================

class _RingBuffer:
    """Thread-safe ring buffer of monitoring events."""

    def __init__(self, max_size: int = _MAX_EVENTS) -> None:
        self._lock = threading.Lock()
        self._events: deque[dict[str, Any]] = deque(maxlen=max_size)

    def add(self, event: dict[str, Any]) -> None:
        with self._lock:
            self._events.append(event)

    def snapshot(self) -> list[dict[str, Any]]:
        with self._lock:
            return list(self._events)

    def clear(self) -> None:
        with self._lock:
            self._events.clear()

    def __len__(self) -> int:
        with self._lock:
            return len(self._events)

    @property
    def max_size(self) -> int:
        return self._events.maxlen or _MAX_EVENTS


# =====================================================================
# Psutil fallback
# =====================================================================

class PsutilFallback:
    """Polling-based process monitor used when ETW / WMI is unavailable.

    Periodically enumerates running processes via ``psutil`` and emits
    ``process_start`` events for PIDs that were not seen in the previous
    poll. This is a coarse approximation of real-time monitoring but
    requires no Windows-specific tooling.
    """

    name = "psutil_fallback"

    def __init__(self, config: dict[str, Any], buffer: _RingBuffer) -> None:
        self._config = config
        self._buffer = buffer
        self._poll_interval = float(config.get("pollInterval", 2.0))
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._known_pids: set[int] = set()

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="etw_psutil_fallback", daemon=True)
        self._thread.start()
        log.info("PsutilFallback process polling started")

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=self._poll_interval + 1)
            self._thread = None

    def _run(self) -> None:
        try:
            import psutil
        except ImportError:
            log.warning("psutil not available — PsutilFallback cannot monitor processes")
            return

        # Seed the known-pid set so we don't flood events for every already-running process.
        try:
            self._known_pids = {p.pid for p in psutil.process_iter(["pid"])}
        except Exception:
            self._known_pids = set()

        while not self._stop.is_set():
            try:
                current: dict[int, dict[str, Any]] = {}
                for p in psutil.process_iter(["pid", "name", "exe", "ppid", "cmdline", "create_time"]):
                    try:
                        info = p.info
                        pid = info.get("pid", 0)
                        if not pid:
                            continue
                        current[pid] = {
                            "pid": pid,
                            "name": info.get("name", "") or "",
                            "exe": info.get("exe", "") or "",
                            "ppid": info.get("ppid", 0),
                            "cmdline": " ".join(info.get("cmdline") or []),
                            "create_time": info.get("create_time", 0),
                        }
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        continue

                for pid, info in current.items():
                    if pid in self._known_pids:
                        continue
                    self._known_pids.add(pid)
                    exe = info["exe"]
                    self._buffer.add(MonitorEvent(
                        timestamp=_now_iso(),
                        type="process_start",
                        process_name=info["name"],
                        path=exe,
                        details={
                            "pid": pid,
                            "ppid": info["ppid"],
                            "commandLine": info["cmdline"],
                            "suspiciousLocation": _is_suspicious_path(exe),
                            "source": "psutil_fallback",
                        },
                    ).to_dict())

                # Drop PIDs that no longer exist from the known set.
                self._known_pids &= set(current.keys())
            except Exception as e:
                log.debug("PsutilFallback poll error: %s", e)

            self._stop.wait(self._poll_interval)


# =====================================================================
# Watcher implementations
# =====================================================================

class _FileSystemWatcher:
    """Wraps a PowerShell ``System.IO.FileSystemWatcher`` for one directory.

    PowerShell is launched as a long-running subprocess that registers
    event handlers and prints one JSON object per event to stdout. The
    stdout stream is read line-by-line in a daemon thread.
    """

    def __init__(self, directory: str, buffer: _RingBuffer) -> None:
        self._directory = directory
        self._buffer = buffer
        self._proc: subprocess.Popen[str] | None = None
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()

    @property
    def directory(self) -> str:
        return self._directory

    @property
    def running(self) -> bool:
        return self._proc is not None and self._proc.poll() is None

    def start(self) -> bool:
        if not IS_WINDOWS:
            return False
        if not os.path.isdir(self._directory):
            return False

        # PowerShell script: register a FileSystemWatcher and emit JSON per event.
        # The script stays alive until the process is terminated by stop().
        ps_script = self._build_script()
        try:
            self._proc = subprocess.Popen(
                ["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy",
                 "Bypass", "-Command", ps_script],
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                text=True, creationflags=_CREATE_NO_WINDOW,
            )
        except Exception as e:
            log.warning("Failed to start FileSystemWatcher for %s: %s", self._directory, e)
            self._proc = None
            return False

        self._stop.clear()
        self._thread = threading.Thread(target=self._read_loop, name=f"etw_fsw_{self._directory}", daemon=True)
        self._thread.start()
        log.info("FileSystemWatcher started for %s", self._directory)
        return True

    def stop(self) -> None:
        self._stop.set()
        if self._proc:
            try:
                self._proc.terminate()
                self._proc.wait(timeout=3)
            except Exception:
                try:
                    self._proc.kill()
                except Exception:
                    pass
            self._proc = None
        if self._thread:
            self._thread.join(timeout=3)
            self._thread = None

    def _build_script(self) -> str:
        # Escape single quotes for PowerShell single-quoted strings.
        dir_escaped = self._directory.replace("'", "''")
        # Build a PowerShell array literal of extensions, e.g. @('.exe','.dll',...).
        exts_ps = ",".join(f"'{e}'" for e in _EXEC_EXTENSIONS)
        exts_array = f"@({exts_ps})"
        return (
            "$ErrorActionPreference='SilentlyContinue';"
            f"$watcher=New-Object System.IO.FileSystemWatcher '{dir_escaped}',*.* -Property @{{"
            "IncludeSubdirectories=$true;NotifyFilter='FileName,LastWrite,DirectoryName'};"
            f"$exts={exts_array};"
            "$pattern='(' + ($exts -join '|') + ')$';"
            "Register-ObjectEvent $watcher Created -Action {{"
            "if($EventArgs.FullPath -match $pattern){{"
            "Write-Output (ConvertTo-Json -Compress -Depth 2 @{{type='file_create';path=$EventArgs.FullPath}})"
            "}}}} | Out-Null;"
            "Register-ObjectEvent $watcher Changed -Action {{"
            "if($EventArgs.FullPath -match $pattern){{"
            "Write-Output (ConvertTo-Json -Compress -Depth 2 @{{type='file_modify';path=$EventArgs.FullPath}})"
            "}}}} | Out-Null;"
            "Register-ObjectEvent $watcher Deleted -Action {{"
            "if($EventArgs.FullPath -match $pattern){{"
            "Write-Output (ConvertTo-Json -Compress -Depth 2 @{{type='file_delete';path=$EventArgs.FullPath}})"
            "}}}} | Out-Null;"
            "while($true){{Start-Sleep -Seconds 1}}"
        )

    def _read_loop(self) -> None:
        if not self._proc or not self._proc.stdout:
            return
        stream = self._proc.stdout
        while not self._stop.is_set():
            line = stream.readline()
            if not line:
                if self._proc.poll() is not None:
                    break
                time.sleep(0.1)
                continue
            line = line.strip()
            if not line:
                continue
            self._handle_line(line)

    def _handle_line(self, line: str) -> None:
        try:
            payload = json.loads(line)
        except ValueError:
            return
        etype = payload.get("type", "")
        path = payload.get("path", "")
        if not path or not _is_executable(path):
            return
        self._buffer.add(MonitorEvent(
            timestamp=_now_iso(),
            type=etype,
            path=path,
            details={"source": "filesystem_watcher", "watchedDir": self._directory},
        ).to_dict())


class _ProcessStartWatcher:
    """WMI ``Win32_ProcessStartTrace`` event subscription via PowerShell.

    Emits one JSON object per new process to stdout, which is read in a
    daemon thread.
    """

    def __init__(self, buffer: _RingBuffer) -> None:
        self._buffer = buffer
        self._proc: subprocess.Popen[str] | None = None
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()

    @property
    def running(self) -> bool:
        return self._proc is not None and self._proc.poll() is None

    def start(self) -> bool:
        if not IS_WINDOWS:
            return False
        ps_script = (
            "$ErrorActionPreference='SilentlyContinue';"
            "$query=\"SELECT * FROM Win32_ProcessStartTrace\";"
            "Register-WmiEvent -Query $query -SourceIdentifier 'AvsProcStart' -Action {"
            "$p=$Event.SourceEventArgs.NewEvent;"
            "$obj=@{type='process_start';pid=$p.ProcessID;name=$p.ProcessName;"
            "exe=$p.ExecutablePath;ppid=$p.ParentProcessID;};"
            "Write-Output (ConvertTo-Json -Compress -Depth 3 $obj)"
            "} | Out-Null;"
            "while($true){Start-Sleep -Seconds 1}"
        )
        try:
            self._proc = subprocess.Popen(
                ["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy",
                 "Bypass", "-Command", ps_script],
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                text=True, creationflags=_CREATE_NO_WINDOW,
            )
        except Exception as e:
            log.warning("Failed to start WMI process watcher: %s", e)
            self._proc = None
            return False

        self._stop.clear()
        self._thread = threading.Thread(target=self._read_loop, name="etw_proc_watcher", daemon=True)
        self._thread.start()
        log.info("WMI Win32_ProcessStartTrace watcher started")
        return True

    def stop(self) -> None:
        self._stop.set()
        if self._proc:
            try:
                self._proc.terminate()
                self._proc.wait(timeout=3)
            except Exception:
                try:
                    self._proc.kill()
                except Exception:
                    pass
            self._proc = None
        if self._thread:
            self._thread.join(timeout=3)
            self._thread = None

    def _read_loop(self) -> None:
        if not self._proc or not self._proc.stdout:
            return
        stream = self._proc.stdout
        while not self._stop.is_set():
            line = stream.readline()
            if not line:
                if self._proc.poll() is not None:
                    break
                time.sleep(0.1)
                continue
            line = line.strip()
            if not line:
                continue
            self._handle_line(line)

    def _handle_line(self, line: str) -> None:
        try:
            payload = json.loads(line)
        except ValueError:
            return
        if payload.get("type") != "process_start":
            return
        pid = payload.get("pid", 0)
        name = payload.get("name", "") or ""
        exe = payload.get("exe", "") or ""
        ppid = payload.get("ppid", 0)
        # Win32_ProcessStartTrace does not always carry the command line; try to enrich.
        cmdline = self._query_command_line(pid)
        self._buffer.add(MonitorEvent(
            timestamp=_now_iso(),
            type="process_start",
            process_name=name,
            path=exe,
            details={
                "pid": pid,
                "ppid": ppid,
                "commandLine": cmdline,
                "suspiciousLocation": _is_suspicious_path(exe),
                "source": "wmi_process_trace",
            },
        ).to_dict())

    @staticmethod
    def _query_command_line(pid: int) -> str:
        """Best-effort retrieval of the command line for *pid* via WMI."""
        if not pid:
            return ""
        out = _run_powershell(
            f"(Get-WmiObject Win32_Process -Filter \"ProcessId={pid}\").CommandLine",
            timeout=3.0,
        )
        return out or ""


# =====================================================================
# Main monitor class
# =====================================================================

class EtwMonitor:
    """Real-time file and process monitor for AVS Shield.

    Despite the name (ETW = Event Tracing for Windows), true ETW
    consumption requires kernel-level access and specialised Python
    bindings. This class uses WMI event subscriptions and
    ``FileSystemWatcher`` via PowerShell — the practical userland
    approach — and falls back to ``psutil`` polling when those are
    unavailable.
    """

    name = "etw_monitor"

    def __init__(self, config: dict[str, Any]) -> None:
        self._config = config or {}
        self._buffer = _RingBuffer(max_size=int(self._config.get("maxEvents", _MAX_EVENTS)))
        self._file_watchers: list[_FileSystemWatcher] = []
        self._process_watcher: _ProcessStartWatcher | None = None
        self._fallback: PsutilFallback | None = None
        self._lock = threading.Lock()
        self._running = False
        self._started_at: str | None = None
        self._stopped_at: str | None = None
        self._use_fallback = False

    # ── lifecycle ──────────────────────────────────────────────────

    def start(self) -> bool:
        """Start monitoring in background daemon threads.

        Returns ``True`` if at least one watcher started successfully.
        """
        with self._lock:
            if self._running:
                return True
            if not IS_WINDOWS:
                log.info("ETW monitor not supported on this platform — using psutil fallback")
                self._use_fallback = True
                self._fallback = PsutilFallback(self._config, self._buffer)
                self._fallback.start()
                self._running = True
                self._started_at = _now_iso()
                return True

            started_any = False

            # File watchers for critical directories.
            for directory in _critical_directories():
                watcher = _FileSystemWatcher(directory, self._buffer)
                if watcher.start():
                    self._file_watchers.append(watcher)
                    started_any = True
                else:
                    log.debug("FileSystemWatcher failed to start for %s", directory)

            # Process start watcher via WMI.
            self._process_watcher = _ProcessStartWatcher(self._buffer)
            if not self._process_watcher.start():
                self._process_watcher = None
                log.warning("WMI process watcher unavailable — activating psutil fallback")
                self._use_fallback = True
                self._fallback = PsutilFallback(self._config, self._buffer)
                self._fallback.start()
                started_any = True
            else:
                started_any = True

            self._running = True
            self._started_at = _now_iso()
            self._stopped_at = None
            return started_any

    def stop(self) -> None:
        """Stop all monitoring."""
        with self._lock:
            if not self._running:
                return
            for watcher in self._file_watchers:
                watcher.stop()
            self._file_watchers.clear()
            if self._process_watcher:
                self._process_watcher.stop()
                self._process_watcher = None
            if self._fallback:
                self._fallback.stop()
                self._fallback = None
            self._running = False
            self._stopped_at = _now_iso()
            log.info("ETW monitor stopped")

    # ── accessors ──────────────────────────────────────────────────

    def get_events(self) -> list[dict[str, Any]]:
        """Return a snapshot of recent events (newest last)."""
        return self._buffer.snapshot()

    def get_status(self) -> dict[str, Any]:
        """Return current monitoring status."""
        file_watchers = []
        with self._lock:
            for w in self._file_watchers:
                file_watchers.append({"directory": w.directory, "running": w.running})
            proc_running = self._process_watcher is not None and self._process_watcher.running

        return {
            "name": self.name,
            "running": self._running,
            "startedAt": self._started_at,
            "stoppedAt": self._stopped_at,
            "platform": platform.system(),
            "supported": IS_WINDOWS,
            "usingFallback": self._use_fallback,
            "fileWatchers": file_watchers,
            "processWatcherRunning": proc_running,
            "eventCount": len(self._buffer),
            "maxEvents": self._buffer.max_size,
            "watchedDirectories": [w.directory for w in self._file_watchers],
        }
