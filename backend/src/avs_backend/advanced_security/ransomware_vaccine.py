"""Ransomware vaccine / canary file protection module for AVS AI Shield.

Deploys realistic-looking decoy ("canary") files inside protected user
directories and monitors them for unauthorized modification, deletion,
encryption, or extension changes. Because legitimate applications have
no reason to touch these files, any change is treated as a strong
indicator of ransomware activity and triggers an immediate alert.

Canary file design:
    * Files use realistic names (e.g. ``Important_Document.docx``) so
      that ransomware enumerating the directory will pick them up.
    * Each file embeds a unique UUID-based marker and a SHA-256 digest
      of its canonical content so that tampering can be detected
      reliably.
    * Files are placed in the user's Documents, Desktop, Pictures and
      any user-configured protected directories.

Detection strategy:
    A background daemon thread polls the deployed canary files every
    ``monitor_interval`` seconds. For each file it checks existence,
    size, modification time, content hash and extension. Any deviation
    from the baseline raises an alert. When ``auto_block`` is enabled
    the module attempts to terminate the process responsible for the
    change (identified via ``psutil``).

Config options:
    canary_count       (int)      — canary files per directory (default 5)
    protected_dirs     (list[str])— extra directories to protect
    auto_block         (bool)     — terminate processes that touch canaries (default False)
    monitor_interval   (int)      — seconds between canary checks (default 2)
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import platform
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger("avs.advanced_security.ransomware_vaccine")

IS_WINDOWS = platform.system() == "Windows"

# Ring buffer size for recent ransomware alerts
_MAX_ALERTS = 200

# Default canary file name templates (rotated per directory)
_CANARY_TEMPLATES: list[str] = [
    "Important_Document.docx",
    "Financial_Records.xlsx",
    "Family_Photos.jpg",
    "Backup_Passwords.txt",
    "Company_Report.pdf",
    "Personal_Notes.docx",
    "Tax_Return_2023.xlsx",
    "Vacation_Photos.jpg",
    "Server_Credentials.txt",
    "Meeting_Minutes.pdf",
]

# Marker prefix embedded in every canary file
_MARKER_PREFIX = "AVS-CANARY"


def _now_iso() -> str:
    """Return the current UTC timestamp in ISO-8601 format."""
    return datetime.now(timezone.utc).isoformat()


def _user_home() -> Path:
    """Return the current user's home directory."""
    return Path(os.path.expanduser("~"))


def _default_protected_dirs() -> list[Path]:
    """Return the default set of protected directories (Documents, Desktop, Pictures)."""
    home = _user_home()
    candidates = [
        home / "Documents",
        home / "Desktop",
        home / "Pictures",
    ]
    # On Windows also honour the known-folder redirects if present
    if IS_WINDOWS:
        try:
            import ctypes
            from ctypes import wintypes

            class KnownFolderID:
                Documents = "{FDD39AD0-238F-46AF-ADB4-6C85480369C7}"
                Desktop = "{B4BFCC3A-DB2C-424C-B029-7FE99A87C641}"
                Pictures = "{33E28130-4E1E-4676-835A-98317C2D6113}"

            try:
                shell32 = ctypes.windll.shell32
                SHGetKnownFolderPath = shell32.SHGetKnownFolderPath
                SHGetKnownFolderPath.argtypes = [
                    ctypes.POINTER(wintypes.GUID), wintypes.DWORD,
                    wintypes.HANDLE, ctypes.POINTER(ctypes.c_wchar_p),
                ]
                SHGetKnownFolderPath.restype = ctypes.HRESULT

                def _known_folder(guid_str: str) -> Path | None:
                    guid = wintypes.GUID(guid_str)
                    ptr = ctypes.c_wchar_p()
                    if SHGetKnownFolderPath(ctypes.byref(guid), 0, None, ctypes.byref(ptr)) == 0:
                        p = Path(ptr.value)
                        return p if p.exists() else None
                    return None

                for attr, fallback in (
                    ("Documents", candidates[0]),
                    ("Desktop", candidates[1]),
                    ("Pictures", candidates[2]),
                ):
                    guid_str = getattr(KnownFolderID, attr)
                    resolved = _known_folder(guid_str)
                    if resolved is not None:
                        idx = ["Documents", "Desktop", "Pictures"].index(attr)
                        candidates[idx] = resolved
            except Exception as e:  # pragma: no cover - defensive
                log.debug("SHGetKnownFolderPath unavailable: %s", e)
        except Exception as e:  # pragma: no cover - defensive
            log.debug("ctypes known-folder resolution failed: %s", e)

    return [p for p in candidates if p.exists()]


def _sha256(data: bytes) -> str:
    """Return the hex SHA-256 digest of ``data``."""
    return hashlib.sha256(data).hexdigest()


def _build_canary_content(marker: str) -> bytes:
    """Build the canonical content for a canary file.

    The content is deterministic given the marker so that the baseline
    hash can be recomputed and compared. It includes a human-readable
    header followed by the unique marker and a JSON envelope.
    """
    envelope = {
        "marker": marker,
        "created": _now_iso(),
        "type": "avs_canary",
        "version": 1,
    }
    body = (
        f"{_MARKER_PREFIX}\n"
        f"Marker: {marker}\n"
        f"This file is a monitored decoy maintained by AVS AI Shield.\n"
        f"Do not modify, move, or delete this file.\n"
        f"--- BEGIN ENVELOPE ---\n"
        f"{json.dumps(envelope, sort_keys=True)}\n"
        f"--- END ENVELOPE ---\n"
    )
    return body.encode("utf-8", errors="replace")


def _find_process_for_path(path: Path) -> dict[str, Any] | None:
    """Best-effort identification of the process that last touched ``path``.

    Uses ``psutil`` to scan open file handles and recent process activity.
    Returns a dict with ``pid``, ``name``, ``exe`` and ``cmdline`` keys, or
    ``None`` if no candidate could be identified.
    """
    try:
        import psutil
    except Exception as e:  # pragma: no cover - psutil optional
        log.debug("psutil unavailable: %s", e)
        return None

    target = str(path)
    candidates: list[dict[str, Any]] = []

    try:
        for proc in psutil.process_iter(["pid", "name", "exe", "cmdline", "open_files"]):
            try:
                info = proc.info
                open_files = info.get("open_files") or []
                for of in open_files:
                    if str(of.path).lower() == target.lower():
                        candidates.append({
                            "pid": info.get("pid"),
                            "name": info.get("name"),
                            "exe": info.get("exe"),
                            "cmdline": info.get("cmdline"),
                        })
                        break
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
    except Exception as e:  # pragma: no cover - defensive
        log.debug("psutil process scan failed: %s", e)

    if candidates:
        return candidates[0]

    # Fallback: look for processes whose working directory or cmdline
    # references the canary's parent directory.
    parent = str(path.parent).lower()
    try:
        for proc in psutil.process_iter(["pid", "name", "exe", "cmdline", "cwd"]):
            try:
                info = proc.info
                cwd = info.get("cwd")
                if cwd and str(cwd).lower() == parent:
                    candidates.append({
                        "pid": info.get("pid"),
                        "name": info.get("name"),
                        "exe": info.get("exe"),
                        "cmdline": info.get("cmdline"),
                    })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
    except Exception as e:  # pragma: no cover - defensive
        log.debug("psutil cwd scan failed: %s", e)

    return candidates[0] if candidates else None


def _terminate_process(pid: int | None) -> bool:
    """Attempt to terminate the process with the given PID."""
    if pid is None:
        return False
    try:
        import psutil
    except Exception:  # pragma: no cover - psutil optional
        return False
    try:
        proc = psutil.Process(pid)
        proc.terminate()
        try:
            proc.wait(timeout=5.0)
        except Exception:
            proc.kill()
        log.warning("Terminated process %d (%s) for touching a canary file", pid, proc.name())
        return True
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        return False
    except Exception as e:  # pragma: no cover - defensive
        log.debug("Failed to terminate process %d: %s", pid, e)
        return False


def _notify(title: str, message: str) -> None:
    """Generate a best-effort system notification."""
    # Log first so the alert is always captured.
    log.warning("%s: %s", title, message)

    if IS_WINDOWS:
        try:
            # PowerShell toast notification (best-effort, non-fatal)
            import subprocess

            ps_script = (
                "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, "
                "ContentType = WindowsRuntime] | Out-Null; "
                "$template = [Windows.UI.Notifications.ToastNotificationManager]::"
                "GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02); "
                "$text = $template.GetElementsByTagName('text'); "
                "$text.Item(0).AppendChild($template.CreateTextNode('AVS AI Shield')) | Out-Null; "
                f"$text.Item(1).AppendChild($template.CreateTextNode('{message}')) | Out-Null; "
                "$notifier = [Windows.UI.Notifications.ToastNotificationManager]::"
                "CreateToastNotifier('AVS.Shield'); "
                "$notifier.Show([Windows.UI.Notifications.ToastNotification]::new($template))"
            )
            subprocess.run(
                ["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy",
                 "Bypass", "-Command", ps_script],
                capture_output=True, text=True, timeout=5.0,
                creationflags=0x08000000,
            )
        except Exception as e:  # pragma: no cover - defensive
            log.debug("Windows toast notification failed: %s", e)


# =====================================================================
# RansomwareVaccine class
# =====================================================================

class RansomwareVaccine:
    """Ransomware vaccine / canary file protection for AVS AI Shield.

    Deploys decoy files in protected directories and monitors them for
    unauthorized changes. On non-Windows platforms monitoring still
    functions but process attribution and auto-block are best-effort.
    """

    name = "ransomware_vaccine"

    def __init__(self, config: dict[str, Any]) -> None:
        """Initialise the vaccine with the supplied configuration.

        Config keys:
            canary_count       (int)       — canary files per directory (default 5)
            protected_dirs     (list[str]) — extra directories to protect
            auto_block         (bool)      — terminate processes touching canaries (default False)
            monitor_interval   (int)       — seconds between canary checks (default 2)
        """
        self._canary_count: int = int(config.get("canary_count", 5))
        if self._canary_count < 1:
            self._canary_count = 1
        if self._canary_count > len(_CANARY_TEMPLATES):
            self._canary_count = len(_CANARY_TEMPLATES)

        self._protected_dirs: list[Path] = []
        for d in config.get("protected_dirs", []) or []:
            if isinstance(d, str) and d.strip():
                p = Path(d.strip())
                if p.exists() and p.is_dir():
                    self._protected_dirs.append(p)

        self._auto_block: bool = bool(config.get("auto_block", False))
        self._monitor_interval: float = float(config.get("monitor_interval", 2))
        if self._monitor_interval < 0.5:
            self._monitor_interval = 0.5

        self._running: bool = False
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()

        # Ring buffer of ransomware alerts
        self._alerts: list[dict[str, Any]] = []

        # Baseline state for each deployed canary file.
        # key   = str(canary_path)
        # value = dict(marker, dir, expected_hash, expected_size,
        #              expected_mtime, expected_ext, deployed_at)
        self._canaries: dict[str, dict[str, Any]] = {}

        # Counters
        self._alerts_triggered: int = 0
        self._canaries_deployed: int = 0

    # ── Internal helpers ───────────────────────────────────────────

    def _add_alert(self, alert: dict[str, Any]) -> None:
        """Append an alert to the thread-safe ring buffer."""
        with self._lock:
            self._alerts.append(alert)
            if len(self._alerts) > _MAX_ALERTS:
                self._alerts.pop(0)
            self._alerts_triggered += 1

    def _resolve_protected_dirs(self) -> list[Path]:
        """Return the full set of protected directories (defaults + configured)."""
        dirs: list[Path] = []
        seen: set[str] = set()
        for d in _default_protected_dirs() + self._protected_dirs:
            key = str(d).lower()
            if key not in seen:
                seen.add(key)
                dirs.append(d)
        return dirs

    def _deploy_in_dir(self, directory: Path) -> int:
        """Deploy canary files into a single directory.

        Returns the number of canary files successfully deployed.
        """
        deployed = 0
        for i in range(self._canary_count):
            template = _CANARY_TEMPLATES[i % len(_CANARY_TEMPLATES)]
            # If the same template is reused, disambiguate with an index.
            name = template if i < len(_CANARY_TEMPLATES) else f"AVS_{i}_{template}"
            canary_path = directory / name
            marker = str(uuid.uuid4())
            try:
                content = _build_canary_content(marker)
                canary_path.write_bytes(content)
                stat = canary_path.stat()
                baseline = {
                    "marker": marker,
                    "dir": str(directory),
                    "expected_hash": _sha256(content),
                    "expected_size": stat.st_size,
                    "expected_mtime": stat.st_mtime,
                    "expected_ext": canary_path.suffix.lower(),
                    "deployed_at": _now_iso(),
                    "path": str(canary_path),
                }
                with self._lock:
                    self._canaries[str(canary_path)] = baseline
                deployed += 1
                log.debug("Deployed canary: %s", canary_path)
            except Exception as e:
                log.debug("Failed to deploy canary in %s: %s", directory, e)
        return deployed

    def _check_canary(self, path_str: str, baseline: dict[str, Any]) -> None:
        """Check a single canary file against its baseline and raise alerts on change."""
        path = Path(path_str)
        expected_ext = baseline.get("expected_ext", "")
        marker = baseline.get("marker", "")

        # 1. Deletion check
        if not path.exists():
            # Detect extension-renamed variant (ransomware often renames
            # original file and writes an encrypted copy with a new ext).
            renamed = self._detect_renamed_canary(path, baseline)
            if renamed is not None:
                self._raise_alert(
                    path=path,
                    baseline=baseline,
                    event="extension_change",
                    detail=f"Canary renamed to {renamed.name}",
                    renamed_path=renamed,
                )
                # Update baseline to the renamed file so we keep tracking it.
                try:
                    stat = renamed.stat()
                    with self._lock:
                        new_baseline = dict(baseline)
                        new_baseline["path"] = str(renamed)
                        new_baseline["expected_ext"] = renamed.suffix.lower()
                        new_baseline["expected_size"] = stat.st_size
                        new_baseline["expected_mtime"] = stat.st_mtime
                        del self._canaries[path_str]
                        self._canaries[str(renamed)] = new_baseline
                except Exception:
                    pass
                return

            self._raise_alert(
                path=path,
                baseline=baseline,
                event="deletion",
                detail="Canary file was deleted",
            )
            with self._lock:
                self._canaries.pop(path_str, None)
            return

        # 2. Extension change (file exists but suffix differs)
        current_ext = path.suffix.lower()
        if current_ext != expected_ext:
            self._raise_alert(
                path=path,
                baseline=baseline,
                event="extension_change",
                detail=f"Extension changed from {expected_ext} to {current_ext}",
            )
            with self._lock:
                self._canaries[path_str]["expected_ext"] = current_ext
            return

        # 3. Content / encryption detection via hash
        try:
            content = path.read_bytes()
            current_hash = _sha256(content)
        except Exception as e:
            log.debug("Could not read canary %s: %s", path, e)
            return

        if current_hash != baseline.get("expected_hash"):
            # Check whether the marker is still present — if it is gone
            # the file was likely encrypted/overwritten.
            marker_present = marker.encode("utf-8", errors="replace") in content
            event = "encryption" if not marker_present else "modification"
            self._raise_alert(
                path=path,
                baseline=baseline,
                event=event,
                detail="Canary content changed (hash mismatch)",
                current_hash=current_hash,
            )
            # Update baseline so we don't re-alert on the same state.
            try:
                stat = path.stat()
                with self._lock:
                    if path_str in self._canaries:
                        self._canaries[path_str]["expected_hash"] = current_hash
                        self._canaries[path_str]["expected_size"] = stat.st_size
                        self._canaries[path_str]["expected_mtime"] = stat.st_mtime
            except Exception:
                pass
            return

        # 4. Modification-time drift without content change (e.g. touch).
        try:
            stat = path.stat()
            if stat.st_mtime != baseline.get("expected_mtime"):
                with self._lock:
                    if path_str in self._canaries:
                        self._canaries[path_str]["expected_mtime"] = stat.st_mtime
        except Exception:
            pass

    def _detect_renamed_canary(self, path: Path, baseline: dict[str, Any]) -> Path | None:
        """Detect a canary file that was renamed (extension changed) by ransomware.

        Looks for a file in the same directory whose content still
        contains the original marker but whose extension differs.
        """
        marker = baseline.get("marker", "")
        if not marker:
            return None
        parent = path.parent
        stem = path.stem
        try:
            for candidate in parent.iterdir():
                if not candidate.is_file():
                    continue
                if candidate.name == path.name:
                    continue
                if candidate.stem != stem:
                    continue
                try:
                    data = candidate.read_bytes()
                except Exception:
                    continue
                if marker.encode("utf-8", errors="replace") in data:
                    return candidate
        except Exception as e:
            log.debug("Renamed-canary scan failed in %s: %s", parent, e)
        return None

    def _raise_alert(
        self,
        *,
        path: Path,
        baseline: dict[str, Any],
        event: str,
        detail: str,
        current_hash: str | None = None,
        renamed_path: Path | None = None,
    ) -> None:
        """Raise a ransomware alert and optionally auto-block the responsible process."""
        proc_info = _find_process_for_path(renamed_path or path)

        severity = "critical" if event in ("encryption", "deletion") else "high"

        alert: dict[str, Any] = {
            "type": "ransomware_canary_alert",
            "event": event,
            "severity": severity,
            "file_path": str(path),
            "renamed_path": str(renamed_path) if renamed_path else None,
            "marker": baseline.get("marker"),
            "expected_hash": baseline.get("expected_hash"),
            "current_hash": current_hash,
            "detail": detail,
            "process": proc_info,
            "auto_blocked": False,
            "timestamp": _now_iso(),
        }

        # Auto-block the offending process if enabled and a PID was found.
        if self._auto_block and proc_info and proc_info.get("pid") is not None:
            alert["auto_blocked"] = _terminate_process(proc_info.get("pid"))

        self._add_alert(alert)
        _notify(
            "AVS AI Shield — Ransomware Alert",
            f"{event} detected on canary file: {path.name}",
        )
        log.warning(
            "Ransomware canary alert: event=%s file=%s detail=%s proc=%s",
            event, path, detail, proc_info,
        )

    # ── Monitoring loop ────────────────────────────────────────────

    def _monitor_canaries(self) -> None:
        """Background thread that monitors canary files for changes."""
        log.info("Ransomware canary monitoring started")
        while True:
            with self._lock:
                if not self._running:
                    break
                snapshot = list(self._canaries.items())

            for path_str, baseline in snapshot:
                with self._lock:
                    if not self._running:
                        break
                try:
                    self._check_canary(path_str, baseline)
                except Exception as e:
                    log.debug("Canary check error for %s: %s", path_str, e)

            try:
                time.sleep(self._monitor_interval)
            except Exception:
                break

        log.info("Ransomware canary monitoring stopped")

    # ── Public API ─────────────────────────────────────────────────

    def start(self) -> dict[str, Any]:
        """Deploy canary files and start monitoring in a background thread."""
        with self._lock:
            if self._running:
                return {"started": False, "reason": "already_running"}

        deploy_result = self.deploy_canaries()
        if not deploy_result.get("deployed"):
            return {
                "started": False,
                "reason": "no_canaries_deployed",
                "deploy": deploy_result,
            }

        with self._lock:
            self._running = True
            self._alerts_triggered = 0

        self._thread = threading.Thread(target=self._monitor_canaries, daemon=True)
        self._thread.start()

        return {
            "started": True,
            "canaries_deployed": deploy_result.get("deployed", 0),
            "timestamp": _now_iso(),
        }

    def stop(self) -> dict[str, Any]:
        """Stop monitoring and optionally remove canary files."""
        with self._lock:
            if not self._running:
                return {"stopped": False, "reason": "not_running"}
            self._running = False

        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5.0)

        removed = self.remove_canaries()
        return {
            "stopped": True,
            "canaries_removed": removed.get("removed", 0),
            "timestamp": _now_iso(),
        }

    def get_status(self) -> dict[str, Any]:
        """Return the current vaccine status."""
        with self._lock:
            return {
                "running": self._running,
                "canary_files_deployed": len(self._canaries),
                "alerts_triggered": self._alerts_triggered,
                "protected_dirs": [str(d) for d in self._resolve_protected_dirs()],
                "auto_block": self._auto_block,
                "monitor_interval": self._monitor_interval,
                "canary_count": self._canary_count,
                "alerts_buffered": len(self._alerts),
                "captured_at": _now_iso(),
            }

    def get_alerts(self) -> list[dict[str, Any]]:
        """Return ransomware alerts (most recent first)."""
        with self._lock:
            alerts = list(self._alerts)
        alerts.reverse()
        return alerts

    def configure(self, config: dict) -> dict:
        """Update vaccine configuration.

        Accepts ``protected_dirs``, ``canary_count``, ``auto_block`` and
        ``monitor_interval``. Changes to ``protected_dirs`` or
        ``canary_count`` only take effect on the next ``deploy_canaries``
        call (or ``start``).
        """
        changed: list[str] = []

        if "canary_count" in config:
            count = int(config["canary_count"])
            if count < 1:
                count = 1
            if count > len(_CANARY_TEMPLATES):
                count = len(_CANARY_TEMPLATES)
            with self._lock:
                self._canary_count = count
            changed.append("canary_count")

        if "protected_dirs" in config:
            dirs: list[Path] = []
            for d in config.get("protected_dirs", []) or []:
                if isinstance(d, str) and d.strip():
                    p = Path(d.strip())
                    if p.exists() and p.is_dir():
                        dirs.append(p)
            with self._lock:
                self._protected_dirs = dirs
            changed.append("protected_dirs")

        if "auto_block" in config:
            with self._lock:
                self._auto_block = bool(config.get("auto_block", False))
            changed.append("auto_block")

        if "monitor_interval" in config:
            interval = float(config.get("monitor_interval", 2))
            if interval < 0.5:
                interval = 0.5
            with self._lock:
                self._monitor_interval = interval
            changed.append("monitor_interval")

        log.info("Ransomware vaccine reconfigured: %s", ", ".join(changed) or "no changes")
        return {
            "success": True,
            "changed": changed,
            "status": self.get_status(),
        }

    def deploy_canaries(self) -> dict:
        """Create canary files in all protected directories.

        Returns a dict with ``deployed`` (total count) and a per-directory
        breakdown.
        """
        per_dir: dict[str, int] = {}
        total = 0
        for directory in self._resolve_protected_dirs():
            try:
                count = self._deploy_in_dir(directory)
                per_dir[str(directory)] = count
                total += count
            except Exception as e:
                log.debug("Failed to deploy canaries in %s: %s", directory, e)
                per_dir[str(directory)] = 0

        with self._lock:
            self._canaries_deployed = len(self._canaries)

        log.info("Deployed %d canary file(s) across %d director(ies)", total, len(per_dir))
        return {
            "deployed": total,
            "per_directory": per_dir,
            "timestamp": _now_iso(),
        }

    def remove_canaries(self) -> dict:
        """Remove all deployed canary files.

        Returns a dict with ``removed`` (count) and ``failed`` (count).
        """
        with self._lock:
            canaries = list(self._canaries.items())

        removed = 0
        failed = 0
        for path_str, _baseline in canaries:
            try:
                p = Path(path_str)
                if p.exists():
                    p.unlink()
                removed += 1
            except Exception as e:
                log.debug("Failed to remove canary %s: %s", path_str, e)
                failed += 1

        # Also clean up any renamed variants we may still be tracking.
        with self._lock:
            extra = [k for k in list(self._canaries.keys()) if k not in [c[0] for c in canaries]]
            for path_str in extra:
                try:
                    p = Path(path_str)
                    if p.exists():
                        p.unlink()
                    removed += 1
                except Exception:
                    failed += 1
            self._canaries.clear()

        log.info("Removed %d canary file(s) (%d failed)", removed, failed)
        return {
            "removed": removed,
            "failed": failed,
            "timestamp": _now_iso(),
        }
