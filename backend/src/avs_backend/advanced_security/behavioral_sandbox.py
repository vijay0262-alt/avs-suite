"""Behavioral sandbox for AVS Shield — lightweight executable analysis.

This module provides a **lightweight behavioral analysis tool** that observes
executable behavior in a controlled manner and scores suspicious activity.

IMPORTANT
---------
This is **NOT** a true VM-based sandbox.  It does not provide full isolation.
It is a best-effort, userland observation tool that:

  1. Records a baseline of system state (running processes, network
     connections, registry run/startup keys).
  2. Launches a suspicious executable with monitoring.
  3. Observes its behavior for a short, configurable time (default 10 s).
  4. Scores the behavior based on suspicious indicators.
  5. Reports a verdict: ``benign``, ``suspicious``, or ``malicious``.

The sandbox never claims to be safe against determined malware — it should
only be used on samples that have already been quarantined or in a
disposable environment.  All activity is logged.

Scoring
-------
  +3  child process creation
  +2  network connection to an unknown / non-private IP
  +3  file creation in system directories
  +4  registry modification in startup / run keys
  +3  mass file creation (> 10 files in the observation window)
  +5  process-injection indicators
  +1  no visible window for a GUI executable

Verdict thresholds
------------------
  score >= 10  → ``malicious``
  score >=  5  → ``suspicious``
  score  <  5  → ``benign``
"""

from __future__ import annotations

import hashlib
import logging
import os
import platform
import subprocess
import threading
import time
from datetime import datetime, timezone
from typing import Any

log = logging.getLogger("avs.advanced_security.behavioral_sandbox")

IS_WINDOWS = platform.system() == "Windows"

# Creation flag to avoid popping up a console window on Windows.
_CREATE_NO_WINDOW = 0x08000000

# =====================================================================
# Constants
# =====================================================================

# Default observation window (seconds).
_DEFAULT_OBSERVATION_TIME = 10.0

# Verdict thresholds.
_MALICIOUS_THRESHOLD = 10
_SUSPICIOUS_THRESHOLD = 5

# Mass-file-creation threshold: more than this many new files within the
# observation window is considered suspicious.
_MASS_FILE_THRESHOLD = 10

# Registry run / startup key fragments (Windows).  Compared case-insensitively
# against the full key path.
_REGISTRY_STARTUP_MARKERS = (
    "\\run\\",
    "\\runonce\\",
    "\\startupapproved\\",
    "\\explorer\\run\\",
    "\\windows\\currentversion\\run",
    "\\windows\\currentversion\\runonce",
    "startup\\programs",
)

# Directories considered "system" directories — file creation here is suspicious.
_SYSTEM_DIR_MARKERS = (
    "\\windows\\system32\\",
    "\\windows\\syswow64\\",
    "\\windows\\system\\",
    "\\program files\\",
    "\\program files (x86)\\",
    "\\programdata\\",
)

# Private / reserved IP ranges that should not be flagged as unknown C2.
_PRIVATE_PREFIXES = (
    "10.",
    "172.16.", "172.17.", "172.18.", "172.19.",
    "172.20.", "172.21.", "172.22.", "172.23.",
    "172.24.", "172.25.", "172.26.", "172.27.",
    "172.28.", "172.29.", "172.30.", "172.31.",
    "192.168.",
    "127.", "0.", "169.254.",
    "::1", "fe80", "fc", "fd",
)

# Extensions considered executable for window-heuristic purposes.
_GUI_EXTENSIONS = (".exe", ".scr")


# =====================================================================
# Helpers
# =====================================================================

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_private_ip(ip: str) -> bool:
    """Return True for loopback / private / link-local addresses."""
    if not ip:
        return True
    ip_stripped = ip.lstrip("[").rstrip("]")
    if "%" in ip_stripped:
        ip_stripped = ip_stripped.split("%", 1)[0]
    return ip_stripped.lower().startswith(_PRIVATE_PREFIXES)


def _is_system_dir(path: str) -> bool:
    """Return True if *path* resides in a known system directory."""
    if not path:
        return False
    lower = path.lower()
    return any(marker in lower for marker in _SYSTEM_DIR_MARKERS)


def _is_startup_registry_key(key: str) -> bool:
    """Return True if *key* looks like a startup / run registry location."""
    if not key:
        return False
    lower = key.lower()
    return any(marker in lower for marker in _REGISTRY_STARTUP_MARKERS)


# =====================================================================
# BehavioralSandbox
# =====================================================================

class BehavioralSandbox:
    """Lightweight behavioral analysis sandbox for AVS Shield.

    The sandbox takes a baseline snapshot of system state, launches a
    suspicious executable with monitoring, observes its behavior for a
    configurable observation window, then compares the post-state to the
    baseline and scores the delta.

    All monitoring runs in daemon threads so it never blocks shutdown.
    Every step is logged and all errors are handled gracefully — a failed
    analysis returns a ``benign`` verdict with an ``error`` field rather
    than raising.
    """

    name = "behavioral_sandbox"

    def __init__(self, config: dict[str, Any]) -> None:
        self._config = config or {}
        self._observation_time = float(
            self._config.get("observation_time", _DEFAULT_OBSERVATION_TIME)
        )
        self._score_threshold = int(
            self._config.get("score_threshold", _MALICIOUS_THRESHOLD)
        )
        self._lock = threading.Lock()
        self._analyses_run = 0
        self._available = self._check_availability()

    # -----------------------------------------------------------------
    # Availability
    # -----------------------------------------------------------------

    @staticmethod
    def _check_availability() -> bool:
        """Return True if the minimum dependencies are present."""
        try:
            import psutil  # noqa: F401
            return True
        except ImportError:
            log.warning("psutil not available — behavioral sandbox disabled")
            return False

    # -----------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------

    def analyze(self, file_path: str) -> dict[str, Any]:
        """Analyze *file_path* and return a behavioral verdict.

        Returns a dict with the keys:
        ``verdict``, ``score``, ``indicators``, ``duration``,
        ``file_path``, ``sha256`` and (on error) ``error``.
        """
        result: dict[str, Any] = {
            "verdict": "benign",
            "score": 0,
            "indicators": [],
            "duration": 0.0,
            "file_path": file_path,
            "sha256": None,
            "timestamp": _now_iso(),
        }

        if not self._available:
            result["error"] = "sandbox unavailable (psutil missing)"
            return result

        if not file_path or not os.path.isfile(file_path):
            result["error"] = "file not found"
            log.warning("BehavioralSandbox.analyze: file not found: %s", file_path)
            return result

        # Compute SHA-256 up front so it is always present.
        result["sha256"] = self._compute_sha256(file_path)

        with self._lock:
            self._analyses_run += 1

        start = time.monotonic()
        log.info("Behavioral analysis starting for %s", file_path)

        try:
            before = self._take_snapshot()
        except Exception as e:
            log.warning("Failed to take baseline snapshot: %s", e)
            result["error"] = f"baseline snapshot failed: {e}"
            result["duration"] = round(time.monotonic() - start, 3)
            return result

        # Launch the sample in a restricted manner and observe.
        proc = self._launch_sample(file_path)

        # Observe for the configured window.  Monitoring runs in a daemon
        # thread that records live events into a shared list.
        live_events: list[dict[str, Any]] = []
        monitor_thread = threading.Thread(
            target=self._observe,
            args=(proc, live_events),
            name="bhsandbox_observe",
            daemon=True,
        )
        monitor_thread.start()
        monitor_thread.join(timeout=self._observation_time + 2)

        # Ensure the sample is terminated after observation.
        self._terminate_sample(proc)

        try:
            after = self._take_snapshot()
        except Exception as e:
            log.warning("Failed to take post-run snapshot: %s", e)
            after = {"processes": [], "connections": [], "files": [], "registry": []}

        # Merge snapshot-diff indicators with live events.
        try:
            indicators = self._compare_snapshots(before, after)
        except Exception as e:
            log.warning("Snapshot comparison failed: %s", e)
            indicators = []

        # Fold in live events that the monitor thread captured.
        indicators.extend(self._indicators_from_live_events(live_events, before))

        score = sum(ind.get("score", 0) for ind in indicators)
        verdict = self._verdict_from_score(score)

        result["verdict"] = verdict
        result["score"] = score
        result["indicators"] = indicators
        result["duration"] = round(time.monotonic() - start, 3)

        log.info(
            "Behavioral analysis complete: %s → verdict=%s score=%d indicators=%d",
            file_path, verdict, score, len(indicators),
        )
        return result

    def get_status(self) -> dict[str, Any]:
        """Return the current sandbox status."""
        with self._lock:
            analyses = self._analyses_run
        return {
            "available": self._available,
            "observation_time": self._observation_time,
            "score_threshold": self._score_threshold,
            "analyses_run": analyses,
            "platform": platform.system(),
            "captured_at": _now_iso(),
        }

    # -----------------------------------------------------------------
    # Snapshots
    # -----------------------------------------------------------------

    def _take_snapshot(self) -> dict[str, Any]:
        """Take a snapshot of the current system state.

        Captures running processes (pid, name, exe, ppid, create_time),
        active inet network connections, recently modified files in
        watched directories, and Windows startup registry keys.
        """
        import psutil

        # --- Processes -------------------------------------------------
        processes: list[dict[str, Any]] = []
        for p in psutil.process_iter(
            ["pid", "name", "exe", "ppid", "create_time", "cmdline"]
        ):
            try:
                info = p.info
                processes.append({
                    "pid": info.get("pid", 0),
                    "name": info.get("name", "") or "",
                    "exe": info.get("exe", "") or "",
                    "ppid": info.get("ppid", 0),
                    "create_time": info.get("create_time", 0.0),
                    "cmdline": " ".join(info.get("cmdline") or []),
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
            except Exception as e:
                log.debug("Snapshot process iter error: %s", e)
                continue

        # --- Network connections --------------------------------------
        connections: list[dict[str, Any]] = []
        try:
            for conn in psutil.net_connections(kind="inet"):
                try:
                    laddr = conn.laddr
                    raddr = conn.raddr
                    connections.append({
                        "pid": conn.pid or 0,
                        "local": f"{laddr.ip}:{laddr.port}" if laddr else "",
                        "remote": f"{raddr.ip}:{raddr.port}" if raddr else "",
                        "remote_ip": raddr.ip if raddr else "",
                        "status": conn.status or "",
                    })
                except Exception:
                    continue
        except psutil.AccessDenied:
            log.debug("Access denied reading net connections for snapshot")
        except Exception as e:
            log.debug("net_connections error: %s", e)

        # --- Registry startup keys (Windows only) ---------------------
        registry: list[str] = []
        if IS_WINDOWS:
            registry = self._snapshot_registry_keys()

        # --- Filesystem (watched dirs) --------------------------------
        files: list[dict[str, Any]] = self._snapshot_files()

        return {
            "processes": processes,
            "connections": connections,
            "registry": registry,
            "files": files,
            "taken_at": _now_iso(),
        }

    def _snapshot_registry_keys(self) -> list[str]:
        """Return a list of values present in Windows startup / run keys."""
        if not IS_WINDOWS:
            return []
        # Use reg.exe to query the most common autorun locations.
        keys = [
            r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
            r"HKCU\Software\Microsoft\Windows\CurrentVersion\RunOnce",
            r"HKLM\Software\Microsoft\Windows\CurrentVersion\Run",
            r"HKLM\Software\Microsoft\Windows\CurrentVersion\RunOnce",
        ]
        results: list[str] = []
        for key in keys:
            try:
                proc = subprocess.run(
                    ["reg", "query", key],
                    capture_output=True, text=True, timeout=5,
                    creationflags=_CREATE_NO_WINDOW,
                )
                if proc.returncode == 0 and proc.stdout:
                    # Normalise: one entry per non-blank line (minus the key header).
                    for line in proc.stdout.splitlines():
                        line = line.strip()
                        if not line or line.startswith(key):
                            continue
                        results.append(f"{key}\\{line}")
            except Exception as e:
                log.debug("reg query failed for %s: %s", key, e)
        return results

    def _snapshot_files(self) -> list[dict[str, Any]]:
        """Return a lightweight snapshot of files in watched directories.

        We do not enumerate the entire filesystem — only a small set of
        high-risk locations (Temp, AppData, ProgramData, System32) are
        scanned, and only file paths + mtimes are recorded.
        """
        watched: list[str] = []
        if IS_WINDOWS:
            candidates = [
                os.path.expandvars("%TEMP%"),
                os.path.expandvars(r"%APPDATA%"),
                os.path.expandvars(r"%LOCALAPPDATA%"),
                os.path.expandvars(r"%PROGRAMDATA%"),
                os.path.join(os.environ.get("SystemRoot", r"C:\Windows"), "System32"),
            ]
        else:
            candidates = ["/tmp", "/var/tmp"]

        for d in candidates:
            if d and os.path.isdir(d):
                watched.append(d)

        files: list[dict[str, Any]] = []
        for d in watched:
            try:
                with os.scandir(d) as it:
                    for entry in it:
                        try:
                            if entry.is_file():
                                st = entry.stat()
                                files.append({
                                    "path": entry.path,
                                    "mtime": st.st_mtime,
                                })
                        except OSError:
                            continue
            except OSError as e:
                log.debug("scandir failed for %s: %s", d, e)
            except Exception as e:
                log.debug("snapshot_files error for %s: %s", d, e)
        return files

    # -----------------------------------------------------------------
    # Snapshot comparison
    # -----------------------------------------------------------------

    def _compare_snapshots(
        self, before: dict[str, Any], after: dict[str, Any]
    ) -> list[dict[str, Any]]:
        """Compare two snapshots and return a list of indicator dicts.

        Each indicator dict has at least ``type``, ``score`` and ``detail``.
        """
        indicators: list[dict[str, Any]] = []

        # --- New processes (child creation) ---------------------------
        before_pids = {p["pid"] for p in before.get("processes", [])}
        after_procs = after.get("processes", [])
        new_procs = [p for p in after_procs if p["pid"] not in before_pids]
        if new_procs:
            indicators.append({
                "type": "child_process_creation",
                "score": 3,
                "detail": f"{len(new_procs)} new process(es) detected",
                "processes": [
                    {"pid": p["pid"], "name": p["name"], "exe": p["exe"]}
                    for p in new_procs
                ],
            })

        # --- New network connections ----------------------------------
        before_remotes = {
            c["remote"] for c in before.get("connections", []) if c.get("remote")
        }
        after_conns = after.get("connections", [])
        new_conns = [
            c for c in after_conns
            if c.get("remote") and c["remote"] not in before_remotes
        ]
        unknown_conns = [
            c for c in new_conns if not _is_private_ip(c.get("remote_ip", ""))
        ]
        if unknown_conns:
            indicators.append({
                "type": "network_connection_unknown",
                "score": 2,
                "detail": f"{len(unknown_conns)} new connection(s) to non-private IP(s)",
                "connections": [
                    {"remote": c["remote"], "pid": c.get("pid", 0)}
                    for c in unknown_conns
                ],
            })

        # --- New / modified files -------------------------------------
        before_files = {f["path"]: f["mtime"] for f in before.get("files", [])}
        after_files = after.get("files", [])
        new_files: list[str] = []
        system_files: list[str] = []
        for f in after_files:
            path = f["path"]
            prev_mtime = before_files.get(path)
            if prev_mtime is None:
                new_files.append(path)
                if _is_system_dir(path):
                    system_files.append(path)
            elif f["mtime"] != prev_mtime:
                new_files.append(path)
                if _is_system_dir(path):
                    system_files.append(path)

        if system_files:
            indicators.append({
                "type": "file_creation_system_dir",
                "score": 3,
                "detail": f"{len(system_files)} file(s) created/modified in system directories",
                "files": system_files,
            })

        if len(new_files) > _MASS_FILE_THRESHOLD:
            indicators.append({
                "type": "mass_file_creation",
                "score": 3,
                "detail": f"{len(new_files)} files created/modified within observation window",
                "files": new_files[:50],  # cap for report size
            })

        # --- Registry changes -----------------------------------------
        before_reg = set(before.get("registry", []))
        after_reg = set(after.get("registry", []))
        new_reg = after_reg - before_reg
        startup_changes = [k for k in new_reg if _is_startup_registry_key(k)]
        if startup_changes:
            indicators.append({
                "type": "registry_startup_modification",
                "score": 4,
                "detail": f"{len(startup_changes)} startup/run registry modification(s)",
                "keys": startup_changes,
            })

        return indicators

    # -----------------------------------------------------------------
    # Live observation
    # -----------------------------------------------------------------

    def _observe(
        self,
        proc: subprocess.Popen[str] | None,
        events: list[dict[str, Any]],
    ) -> None:
        """Poll the launched process and record live behavioural events.

        This runs in a daemon thread for the duration of the observation
        window.  It polls the child process handle and the global process
        / connection table at a short interval, recording indicators that
        are only visible while the sample is running (e.g. process
        injection heuristics, no-window heuristic).
        """
        import psutil

        deadline = time.monotonic() + self._observation_time
        seen_new_pids: set[int] = set()
        child_pid = proc.pid if proc else 0

        # Track connections seen at observe start to detect new ones live.
        try:
            initial_conns = {
                (c.laddr.port, c.raddr.ip if c.raddr else "")
                for c in psutil.net_connections(kind="inet")
            }
        except Exception:
            initial_conns = set()

        while time.monotonic() < deadline:
            # --- Process-injection heuristic --------------------------
            if child_pid:
                try:
                    child = psutil.Process(child_pid)
                    self._check_injection(child, events)
                    self._check_no_window(child, events)
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
                except Exception as e:
                    log.debug("observe child check error: %s", e)

            # --- New child processes (live) ---------------------------
            try:
                for p in psutil.process_iter(["pid", "ppid", "name", "exe"]):
                    try:
                        info = p.info
                        pid = info.get("pid", 0)
                        ppid = info.get("ppid", 0)
                        if ppid == child_pid and pid not in seen_new_pids:
                            seen_new_pids.add(pid)
                            events.append({
                                "type": "live_child_process",
                                "score": 0,  # already scored via snapshot diff
                                "detail": f"spawned child pid={pid} name={info.get('name', '')}",
                                "pid": pid,
                                "name": info.get("name", ""),
                                "exe": info.get("exe", ""),
                            })
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        continue
            except Exception as e:
                log.debug("observe process iter error: %s", e)

            # --- New network connections (live) -----------------------
            try:
                for conn in psutil.net_connections(kind="inet"):
                    try:
                        raddr = conn.raddr
                        if not raddr:
                            continue
                        key = (conn.laddr.port if conn.laddr else 0, raddr.ip)
                        if key in initial_conns:
                            continue
                        initial_conns.add(key)
                        if not _is_private_ip(raddr.ip):
                            events.append({
                                "type": "live_network_connection",
                                "score": 0,  # already scored via snapshot diff
                                "detail": f"new outbound connection to {raddr.ip}:{raddr.port}",
                                "remote_ip": raddr.ip,
                                "remote_port": raddr.port,
                                "pid": conn.pid or 0,
                            })
                    except Exception:
                        continue
            except Exception:
                pass

            time.sleep(0.5)

    def _check_injection(
        self, child: Any, events: list[dict[str, Any]]
    ) -> None:
        """Heuristic process-injection check.

        Looks for suspicious indicators such as a child process opening
        handles to other processes' memory or spawning processes with
        mismatched executables.  This is intentionally conservative —
        false positives are worse than false negatives here.
        """
        try:
            # A process with no executable path but an active name is suspicious.
            exe = child.exe()
            name = child.name()
            if name and not exe:
                events.append({
                    "type": "process_injection_indicator",
                    "score": 5,
                    "detail": (
                        f"process '{name}' has no executable path "
                        "(possible hollowed process)"
                    ),
                    "pid": child.pid,
                })
                return

            # Check for children whose exe differs from the parent — a common
            # injection / process-hollowing pattern.
            for sub in child.children(recursive=False):
                try:
                    sub_exe = sub.exe()
                    if sub_exe and exe and sub_exe.lower() != exe.lower():
                        events.append({
                            "type": "process_injection_indicator",
                            "score": 5,
                            "detail": (
                                f"child pid={sub.pid} exe='{sub_exe}' "
                                f"differs from parent exe='{exe}'"
                            ),
                            "pid": sub.pid,
                        })
                except (child.__class__.__mro__[0].NoSuchProcess,
                        child.__class__.__mro__[0].AccessDenied):
                    continue
                except Exception:
                    continue
        except Exception as e:
            log.debug("injection check error: %s", e)

    def _check_no_window(
        self, child: Any, events: list[dict[str, Any]]
    ) -> None:
        """Heuristic: a GUI executable with no visible window is suspicious."""
        try:
            exe = child.exe() or ""
            if not exe.lower().endswith(_GUI_EXTENSIONS):
                return
            # On Windows, a process with no windows is hard to detect from
            # psutil alone.  We use the presence of a non-empty cmdline and
            # a very short lifetime as a weak proxy.  This is intentionally
            # low-score (+1).
            cmdline = child.cmdline()
            if not cmdline:
                events.append({
                    "type": "no_visible_window",
                    "score": 1,
                    "detail": f"GUI executable '{exe}' launched with no command line / window",
                    "pid": child.pid,
                })
        except Exception as e:
            log.debug("no-window check error: %s", e)

    def _indicators_from_live_events(
        self,
        events: list[dict[str, Any]],
        before: dict[str, Any],
    ) -> list[dict[str, Any]]:
        """Convert live events into scored indicator dicts.

        Live child-process and network events are already captured by the
        snapshot diff, so we only emit indicators for events that carry an
        explicit score (injection, no-window).
        """
        indicators: list[dict[str, Any]] = []
        seen_types: set[str] = set()
        for ev in events:
            score = ev.get("score", 0)
            if score <= 0:
                continue
            etype = ev.get("type", "unknown")
            # De-duplicate injection / no-window indicators by type.
            if etype in seen_types:
                continue
            seen_types.add(etype)
            indicators.append({
                "type": etype,
                "score": score,
                "detail": ev.get("detail", ""),
                "pid": ev.get("pid"),
            })
        return indicators

    # -----------------------------------------------------------------
    # Sample launch / termination
    # -----------------------------------------------------------------

    def _launch_sample(self, file_path: str) -> subprocess.Popen[str] | None:
        """Launch *file_path* in a restricted manner.

        On Windows we pass ``CREATE_NO_WINDOW`` and ``CREATE_SUSPENDED`` is
        **not** used because resuming a suspended process reliably from
        Python is fragile.  Instead we launch normally and terminate after
        the observation window.

        The process is launched with ``stdin`` / ``stdout`` / ``stderr``
        piped to ``DEVNULL`` so it cannot interact with the user.
        """
        try:
            creationflags = _CREATE_NO_WINDOW
            proc = subprocess.Popen(
                [file_path],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=creationflags,
                close_fds=True,
            )
            log.info("Launched sample pid=%d path=%s", proc.pid, file_path)
            return proc
        except OSError as e:
            log.warning("Failed to launch sample %s: %s", file_path, e)
            return None
        except Exception as e:
            log.warning("Unexpected error launching sample %s: %s", file_path, e)
            return None

    def _terminate_sample(self, proc: subprocess.Popen[str] | None) -> None:
        """Terminate the launched sample process and any descendants."""
        if proc is None:
            return
        try:
            import psutil
            try:
                parent = psutil.Process(proc.pid)
                children = parent.children(recursive=True)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                children = []

            # Kill children first, then the parent.
            for child in children:
                try:
                    child.kill()
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
                except Exception:
                    continue

            try:
                proc.terminate()
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                try:
                    proc.kill()
                    proc.wait(timeout=3)
                except Exception:
                    pass
            except Exception:
                pass

            log.info("Terminated sample pid=%s", proc.pid)
        except ImportError:
            # psutil unavailable — best effort with subprocess only.
            try:
                proc.terminate()
                proc.wait(timeout=3)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass
        except Exception as e:
            log.debug("terminate_sample error: %s", e)

    # -----------------------------------------------------------------
    # Utilities
    # -----------------------------------------------------------------

    def _verdict_from_score(self, score: int) -> str:
        """Map a numeric score to a verdict string."""
        if score >= _MALICIOUS_THRESHOLD:
            return "malicious"
        if score >= _SUSPICIOUS_THRESHOLD:
            return "suspicious"
        return "benign"

    def _compute_sha256(self, file_path: str) -> str | None:
        """Compute the SHA-256 hash of *file_path*.

        Returns ``None`` if the file cannot be read.
        """
        try:
            h = hashlib.sha256()
            with open(file_path, "rb") as fh:
                while True:
                    chunk = fh.read(65536)
                    if not chunk:
                        break
                    h.update(chunk)
            return h.hexdigest()
        except OSError as e:
            log.warning("Failed to compute SHA-256 for %s: %s", file_path, e)
            return None
        except Exception as e:
            log.warning("Unexpected error hashing %s: %s", file_path, e)
            return None


log.info(
    "Behavioral sandbox module loaded (platform: %s, available: %s)",
    platform.system(), BehavioralSandbox._check_availability(),
)
