"""ClamAV Setup — downloads and installs ClamAV portable on first run.

This module handles the complete ClamAV setup workflow:
  1. Download the official ClamAV portable ZIP for Windows
  2. Extract it to a local directory under AVS AI Shield
  3. Generate clamd.conf and freshclam.conf configuration files
  4. Run freshclam to download the initial signature database
  5. Optionally start clamd as a background process

The ClamAV portable package is ~50MB. The signature database is
~300MB. Both are downloaded on demand, NOT bundled in the installer.

All downloads use the official ClamAV URLs:
  - https://www.clamav.net/downloads
  - https://database.clamav.net

The setup is opt-in — the user must explicitly request it via the
RPC method threat.clamavSetup or the frontend setup wizard.
"""

from __future__ import annotations

import logging
import os
import platform
import shutil
import subprocess
import sys
import threading
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger("avs.threat_engine.clamav_setup")

IS_WINDOWS = platform.system() == "Windows"
_NO_WINDOW = 0x08000000 if IS_WINDOWS else 0

# ClamAV installation directory under AVS AI Shield data
_DATA_DIR = Path(
    os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))
) / "AVS AI Shield" / "clamav"

# Bundled ClamAV binaries — shipped with the app, no download needed.
# In development: apps/pc-optimizer/resources/clamav/
# In production (packaged): <app>/resources/clamav/ (backend exe is at
#   <app>/resources/backend/avs-backend.exe, so ClamAV is at ../clamav)
_BUNDLED_CLAMAV_PATHS: list[Path] = []
if IS_WINDOWS:
    # Development path (relative to backend src)
    _dev_path = Path(__file__).resolve().parent.parent.parent.parent.parent / "apps" / "pc-optimizer" / "resources" / "clamav"
    _BUNDLED_CLAMAV_PATHS.append(_dev_path)
    # Production paths (packaged app)
    # Backend exe: <app>/resources/backend/avs-backend.exe
    # ClamAV:      <app>/resources/clamav/
    # So from exe.parent (backend/): ../clamav
    # From exe.parent.parent (resources/): clamav/
    # From exe.parent.parent.parent (<app>/): resources/clamav/
    _exe = Path(sys.executable).resolve()
    _BUNDLED_CLAMAV_PATHS.append(_exe.parent / ".." / "clamav")  # backend/ -> ../clamav
    _BUNDLED_CLAMAV_PATHS.append(_exe.parent.parent / "clamav")  # resources/ -> clamav/
    _BUNDLED_CLAMAV_PATHS.append(_exe.parent.parent.parent / "resources" / "clamav")  # <app>/ -> resources/clamav/
    # PyInstaller _MEIPASS (onefile builds extract to temp dir)
    _meipass = getattr(sys, "_MEIPASS", None)
    if _meipass:
        _BUNDLED_CLAMAV_PATHS.append(Path(_meipass) / "clamav")
        _BUNDLED_CLAMAV_PATHS.append(Path(_meipass) / "resources" / "clamav")
    # Also check via LOCALAPPDATA Programs
    _lad = os.environ.get("LOCALAPPDATA", "")
    if _lad:
        _BUNDLED_CLAMAV_PATHS.append(Path(_lad) / "Programs" / "avs-ai-shield" / "resources" / "clamav")


def _find_bundled_clamav() -> Path | None:
    """Find bundled ClamAV binaries. Returns the directory containing clamd.exe, or None."""
    for path in _BUNDLED_CLAMAV_PATHS:
        if (path / "clamd.exe").exists():
            return path
    return None


# State file to track setup progress
_STATE_PATH = _DATA_DIR / "setup_state.json"

# Official ClamAV download URL (Windows portable)
# We use the ClamAV releases page on GitHub
_CLAMAV_VERSION = "1.4.3"
_CLAMAV_DOWNLOAD_URL = (
    "https://github.com/Cisco-Talos/clamav/releases/download/"
    f"clamav-{_CLAMAV_VERSION}/clamav-{_CLAMAV_VERSION}.win.x64.msi"
)

# Alternative: ZIP portable package
_CLAMAV_ZIP_URL = (
    "https://github.com/Cisco-Talos/clamav/releases/download/"
    f"clamav-{_CLAMAV_VERSION}/clamav-{_CLAMAV_VERSION}.win.x64.zip"
)

# Signature database URLs
_DB_BASE_URL = "https://database.clamav.net"
_MAIN_CVD_URL = f"{_DB_BASE_URL}/main.cvd"
_DAILY_CVD_URL = f"{_DB_BASE_URL}/daily.cvd"
_BYTECODE_CVD_URL = f"{_DB_BASE_URL}/bytecode.cvd"

# Setup state
_setup_lock = threading.Lock()
_setup_in_progress = False
_setup_progress: dict[str, Any] = {}

# Auto-update scheduler state
_auto_update_timer: threading.Timer | None = None
_auto_update_running = False
_LAST_UPDATE_FILE = _DATA_DIR / "last_update.txt"
_UPDATE_INTERVAL_SECONDS = 24 * 60 * 60  # 24 hours


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _run_freshclam() -> dict[str, Any]:
    """Run freshclam to update signature database."""
    state = _load_state()
    if not state.get("installed"):
        return {"success": False, "error": "ClamAV not installed"}

    freshclam_exe = _DATA_DIR / "freshclam.exe"
    if not freshclam_exe.exists():
        return {"success": False, "error": "freshclam.exe not found"}

    try:
        result = subprocess.run(
            [str(freshclam_exe), "--config-file", str(_DATA_DIR / "freshclam.conf"), "--no-dns"],
            capture_output=True,
            text=True,
            timeout=300,
            creationflags=_NO_WINDOW,
        )
        success = result.returncode == 0
        if success:
            _LAST_UPDATE_FILE.write_text(_now_iso(), encoding="utf-8")
        log.info("freshclam update: success=%s rc=%s", success, result.returncode)
        return {
            "success": success,
            "returncode": result.returncode,
            "stdout": result.stdout[-500:] if result.stdout else "",
            "stderr": result.stderr[-500:] if result.stderr else "",
        }
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "freshclam timed out"}
    except Exception as e:
        log.error("freshclam failed: %s", e)
        return {"success": False, "error": str(e)}


def _auto_update_tick() -> None:
    """Background tick that runs freshclam if 24h elapsed since last update."""
    global _auto_update_running
    if not _auto_update_running:
        return

    state = _load_state()
    if not state.get("installed"):
        _schedule_next_update()
        return

    # Check if 24h has passed since last update
    should_update = True
    if _LAST_UPDATE_FILE.exists():
        try:
            last = _LAST_UPDATE_FILE.read_text(encoding="utf-8").strip()
            from datetime import datetime as _dt
            last_dt = _dt.fromisoformat(last)
            elapsed = (datetime.now(timezone.utc) - last_dt).total_seconds()
            if elapsed < _UPDATE_INTERVAL_SECONDS:
                should_update = False
        except Exception:
            pass

    if should_update:
        log.info("ClamAV auto-update: running freshclam")
        _run_freshclam()

    _schedule_next_update()


def _schedule_next_update() -> None:
    """Schedule the next auto-update tick (checks every hour)."""
    global _auto_update_timer
    if not _auto_update_running:
        return
    _auto_update_timer = threading.Timer(3600, _auto_update_tick)  # check hourly
    _auto_update_timer.daemon = True
    _auto_update_timer.start()


def start_auto_update() -> dict[str, Any]:
    """Start the ClamAV auto-update scheduler.

    Runs freshclam daily (checks hourly) to keep virus definitions current.
    """
    global _auto_update_running
    if _auto_update_running:
        return {"success": True, "message": "Auto-update already running"}
    _auto_update_running = True
    _schedule_next_update()
    log.info("ClamAV auto-update scheduler started")
    return {"success": True, "message": "Auto-update started"}


def stop_auto_update() -> dict[str, Any]:
    """Stop the ClamAV auto-update scheduler."""
    global _auto_update_running, _auto_update_timer
    _auto_update_running = False
    if _auto_update_timer:
        _auto_update_timer.cancel()
        _auto_update_timer = None
    log.info("ClamAV auto-update scheduler stopped")
    return {"success": True, "message": "Auto-update stopped"}


def get_auto_update_status() -> dict[str, Any]:
    """Get auto-update status."""
    last_update = None
    if _LAST_UPDATE_FILE.exists():
        try:
            last_update = _LAST_UPDATE_FILE.read_text(encoding="utf-8").strip()
        except Exception:
            pass
    return {
        "running": _auto_update_running,
        "last_update": last_update,
        "interval_hours": _UPDATE_INTERVAL_SECONDS // 3600,
    }


def _load_state() -> dict[str, Any]:
    """Load the setup state from disk."""
    try:
        if _STATE_PATH.exists():
            import json
            with open(_STATE_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return {"installed": False, "version": None, "setup_date": None}


def _save_state(state: dict[str, Any]) -> None:
    """Save the setup state to disk."""
    try:
        import json
        _DATA_DIR.mkdir(parents=True, exist_ok=True)
        with open(_STATE_PATH, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2)
    except Exception as e:
        log.warning("Failed to save ClamAV setup state: %s", e)


def get_setup_status() -> dict[str, Any]:
    """Get the current ClamAV setup status."""
    global _setup_in_progress, _setup_progress
    state = _load_state()
    with _setup_lock:
        return {
            "installed": state.get("installed", False),
            "version": state.get("version"),
            "setup_date": state.get("setup_date"),
            "install_dir": str(_DATA_DIR) if _DATA_DIR.exists() else None,
            "setup_in_progress": _setup_in_progress,
            "setup_progress": dict(_setup_progress) if _setup_in_progress else None,
        }


def _download_file(url: str, dest: Path, progress_key: str = "") -> bool:
    """Download a file with progress tracking."""
    global _setup_progress
    try:
        log.info("Downloading %s to %s", url, dest)
        req = urllib.request.Request(url, headers={"User-Agent": "AVS-Shield/1.0"})
        with urllib.request.urlopen(req, timeout=300) as response:
            total = int(response.headers.get("Content-Length", 0))
            downloaded = 0
            dest.parent.mkdir(parents=True, exist_ok=True)
            with open(dest, "wb") as f:
                while True:
                    chunk = response.read(65536)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total > 0 and progress_key:
                        with _setup_lock:
                            _setup_progress[progress_key] = {
                                "downloaded": downloaded,
                                "total": total,
                                "percent": round(downloaded / total * 100, 1),
                            }
            log.info("Download complete: %s (%d bytes)", dest, downloaded)
        return True
    except Exception as e:
        log.error("Download failed for %s: %s", url, e)
        if progress_key:
            with _setup_lock:
                _setup_progress[progress_key] = {"error": str(e)}
        return False


def _generate_config(install_dir: Path) -> None:
    """Generate clamd.conf and freshclam.conf configuration files."""
    db_dir = install_dir / "db"
    db_dir.mkdir(parents=True, exist_ok=True)

    # clamd.conf
    clamd_conf = install_dir / "clamd.conf"
    clamd_conf.write_text(
        f"""# ClamAV daemon configuration — generated by AVS AI Shield
LogFile "{install_dir / 'clamd.log'}"
LogFileMaxSize 10M
LogTime yes
LogClean no
LogSyslog no
LogVerbose no
PidFile "{install_dir / 'clamd.pid'}"
DatabaseDirectory "{db_dir}"
LocalSocket "{install_dir / 'clamd.sock'}"
TCPAddress 127.0.0.1
TCPSocket 3310
MaxConnectionQueueLength 200
StreamMaxLength 100M
MaxThreads 12
ReadTimeout 180
CommandReadTimeout 30
SendBufTimeout 200
IdleTimeout 30
SelfCheck 600
ConcurrentDatabaseReload yes
DetectPUA yes
ExcludePUA NetTool
ExcludePUA PWTool
ScanPE yes
ScanELF yes
ScanOLE2 yes
ScanPDF yes
ScanSWF yes
ScanXMLDOCS yes
ScanHWP3 yes
ScanMail yes
ScanArchive yes
MaxScanSize 400M
MaxFileSize 100M
MaxRecursion 16
MaxFiles 10000
""",
        encoding="utf-8",
    )

    # freshclam.conf
    freshclam_conf = install_dir / "freshclam.conf"
    freshclam_conf.write_text(
        f"""# Freshclam configuration — generated by AVS AI Shield
DatabaseDirectory "{db_dir}"
UpdateLogFile "{install_dir / 'freshclam.log'}"
LogFileMaxSize 10M
LogTime yes
LogSyslog no
LogVerbose no
PidFile "{install_dir / 'freshclam.pid'}"
DatabaseOwner {os.environ.get("USERNAME", "user")}
Checks 24
DatabaseMirror database.clamav.net
MaxAttempts 5
ConnectTimeout 30
ReceiveTimeout 30
NotifyClamd "{clamd_conf}"
""",
        encoding="utf-8",
    )

    log.info("Generated ClamAV config files in %s", install_dir)


def _download_signatures(db_dir: Path) -> dict[str, Any]:
    """Download the initial ClamAV signature database."""
    global _setup_progress
    results = {"main": False, "daily": False, "bytecode": False}

    # Download main.cvd (~130MB)
    main_path = db_dir / "main.cvd"
    if not main_path.exists():
        if _download_file(_MAIN_CVD_URL, main_path, "db_main"):
            results["main"] = True
    else:
        results["main"] = True

    # Download daily.cvd (~50MB)
    daily_path = db_dir / "daily.cvd"
    if not daily_path.exists():
        if _download_file(_DAILY_CVD_URL, daily_path, "db_daily"):
            results["daily"] = True
    else:
        results["daily"] = True

    # Download bytecode.cvd (~1MB)
    bytecode_path = db_dir / "bytecode.cvd"
    if not bytecode_path.exists():
        if _download_file(_BYTECODE_CVD_URL, bytecode_path, "db_bytecode"):
            results["bytecode"] = True
    else:
        results["bytecode"] = True

    return results


def _run_setup_async() -> None:
    """Run the ClamAV setup in a background thread.

    Uses bundled ClamAV binaries (shipped with the app) — no binary download needed.
    Only virus definitions are downloaded (they change daily and are ~300MB).
    """
    global _setup_in_progress, _setup_progress

    try:
        install_dir = _DATA_DIR
        install_dir.mkdir(parents=True, exist_ok=True)

        # Step 1: Check for bundled ClamAV binaries first
        bundled = _find_bundled_clamav()
        if bundled:
            with _setup_lock:
                _setup_progress = {"phase": "copying_bundled"}

            # Copy bundled binaries to data dir (so we can write configs/db)
            log.info("Using bundled ClamAV binaries from %s", bundled)
            for item in bundled.iterdir():
                dest = install_dir / item.name
                if dest.exists():
                    if dest.is_dir():
                        shutil.rmtree(dest)
                    else:
                        dest.unlink()
                if item.is_dir():
                    shutil.copytree(str(item), str(dest))
                else:
                    shutil.copy2(str(item), str(dest))
        else:
            # Fallback: download ClamAV portable (if bundled not found)
            with _setup_lock:
                _setup_progress = {"phase": "downloading_clamav"}

            log.warning("Bundled ClamAV not found, downloading from GitHub...")
            zip_path = install_dir / "clamav.zip"
            if not _download_file(_CLAMAV_ZIP_URL, zip_path, "clamav_download"):
                with _setup_lock:
                    _setup_progress = {"phase": "error", "error": "Failed to download ClamAV"}
                return

            with _setup_lock:
                _setup_progress = {"phase": "extracting"}

            try:
                with zipfile.ZipFile(zip_path, "r") as zf:
                    zf.extractall(install_dir)
                zip_path.unlink(missing_ok=True)
            except Exception as e:
                log.error("Failed to extract ClamAV ZIP: %s", e)
                with _setup_lock:
                    _setup_progress = {"phase": "error", "error": f"Extraction failed: {e}"}
                return

            # Find the extracted directory and flatten it
            extracted_dirs = [
                d for d in install_dir.iterdir()
                if d.is_dir() and d.name.startswith("clamav")
            ]
            if extracted_dirs:
                src_dir = extracted_dirs[0]
                for item in src_dir.iterdir():
                    dest = install_dir / item.name
                    if dest.exists():
                        if dest.is_dir():
                            shutil.rmtree(dest)
                        else:
                            dest.unlink()
                    shutil.move(str(item), str(dest))
                src_dir.rmdir()

        with _setup_lock:
            _setup_progress = {"phase": "configuring"}

        # Step 2: Generate config files
        _generate_config(install_dir)

        with _setup_lock:
            _setup_progress = {"phase": "downloading_signatures"}

        # Step 3: Download virus definitions (only thing that needs downloading)
        db_dir = install_dir / "db"
        db_results = _download_signatures(db_dir)

        with _setup_lock:
            _setup_progress = {"phase": "starting_engine"}

        # Step 4: Save state
        _save_state({
            "installed": True,
            "version": _CLAMAV_VERSION,
            "setup_date": _now_iso(),
            "db_results": db_results,
            "install_dir": str(install_dir),
        })

        # Step 5: Auto-start clamd daemon (seamless — no user action needed)
        try:
            start_result = start_clamd()
            if start_result.get("success"):
                log.info("ClamAV daemon auto-started after setup (PID %s)", start_result.get("pid"))
            else:
                log.warning("ClamAV auto-start failed: %s", start_result.get("error"))
        except Exception as e:
            log.warning("ClamAV auto-start error: %s", e)

        # Step 6: Auto-enable daily signature updates
        try:
            start_auto_update()
            log.info("ClamAV auto-update scheduler enabled after setup")
        except Exception as e:
            log.warning("ClamAV auto-update enable error: %s", e)

        with _setup_lock:
            _setup_progress = {"phase": "complete"}

        log.info("ClamAV setup complete: version %s at %s", _CLAMAV_VERSION, install_dir)

    except Exception as e:
        log.error("ClamAV setup failed: %s", e)
        with _setup_lock:
            _setup_progress = {"phase": "error", "error": str(e)}
    finally:
        with _setup_lock:
            _setup_in_progress = False


def start_setup() -> dict[str, Any]:
    """Start the ClamAV setup process (async, runs in background).

    Returns immediately with setup_in_progress=True. The actual
    download and installation happens in a background thread.

    Returns:
        A dict with keys: success, setup_in_progress, message
    """
    global _setup_in_progress

    if not IS_WINDOWS:
        return {
            "success": False,
            "error": "ClamAV portable setup is only supported on Windows",
        }

    with _setup_lock:
        if _setup_in_progress:
            return {
                "success": True,
                "setup_in_progress": True,
                "message": "Setup is already in progress",
            }
        _setup_in_progress = True
        _setup_progress.clear()

    # Check if already installed
    state = _load_state()
    if state.get("installed"):
        with _setup_lock:
            _setup_in_progress = False
        return {
            "success": True,
            "setup_in_progress": False,
            "message": f"ClamAV {state.get('version')} is already installed",
            "install_dir": str(_DATA_DIR),
        }

    # Start background setup
    thread = threading.Thread(target=_run_setup_async, daemon=True, name="clamav-setup")
    thread.start()

    return {
        "success": True,
        "setup_in_progress": True,
        "message": "ClamAV setup started. Downloading and installing in background.",
        "version": _CLAMAV_VERSION,
        "install_dir": str(_DATA_DIR),
    }


_auto_setup_started = False
_auto_setup_lock = threading.Lock()


def auto_setup_on_startup() -> None:
    """Auto-setup ClamAV on backend startup if not already installed.

    This runs in a background daemon thread so it doesn't block startup.
    Uses bundled ClamAV binaries — only virus definitions are downloaded.
    If already installed, tries to start clamd and auto-update scheduler.

    Guards:
    - Skips if already started (prevents duplicate threads/clamd processes).
    - Skips if AVS_NO_CLAMAV_AUTO_SETUP env var is set (for tests).
    """
    global _auto_setup_started
    if not IS_WINDOWS:
        return
    if os.environ.get("AVS_NO_CLAMAV_AUTO_SETUP"):
        return
    with _auto_setup_lock:
        if _auto_setup_started:
            return
        _auto_setup_started = True

    def _do_auto_setup():
        try:
            state = _load_state()
            if state.get("installed"):
                # Already installed — just start clamd and auto-update
                log.info("ClamAV already installed, auto-starting engine...")
                try:
                    # Check if clamd is already running before starting
                    from avs_backend.threat_engine.clamav_scanner import check_clamav_available
                    if not check_clamav_available():
                        start_result = start_clamd()
                        if start_result.get("success"):
                            log.info("ClamAV daemon auto-started on startup (PID %s)", start_result.get("pid"))
                        else:
                            log.warning("ClamAV auto-start on startup: %s", start_result.get("error"))
                    else:
                        log.info("ClamAV daemon already running, skipping auto-start")
                except Exception as e:
                    log.warning("ClamAV auto-start on startup error: %s", e)

                try:
                    start_auto_update()
                    log.info("ClamAV auto-update scheduler enabled on startup")
                except Exception as e:
                    log.warning("ClamAV auto-update on startup error: %s", e)
            else:
                # Not installed — start setup (uses bundled binaries)
                log.info("ClamAV not installed, auto-starting setup...")
                start_setup()
        except Exception as e:
            log.error("ClamAV auto-setup on startup failed: %s", e)

    thread = threading.Thread(target=_do_auto_setup, daemon=True, name="clamav-auto-setup")
    thread.start()


def start_clamd() -> dict[str, Any]:
    """Start the ClamAV daemon (clamd) as a background process.

    Returns:
        A dict with keys: success, message, pid
    """
    if not IS_WINDOWS:
        return {"success": False, "error": "Only supported on Windows"}

    state = _load_state()
    if not state.get("installed"):
        return {
            "success": False,
            "error": "ClamAV is not installed. Run setup first.",
        }

    clamd_exe = _DATA_DIR / "clamd.exe"
    if not clamd_exe.exists():
        return {"success": False, "error": f"clamd.exe not found at {clamd_exe}"}

    try:
        proc = subprocess.Popen(
            [str(clamd_exe), "--config-file", str(_DATA_DIR / "clamd.conf")],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=_NO_WINDOW | 0x00000004,  # DETACHED_PROCESS
        )
        log.info("clamd started with PID %d", proc.pid)
        return {
            "success": True,
            "message": "clamd started",
            "pid": proc.pid,
        }
    except Exception as e:
        log.error("Failed to start clamd: %s", e)
        return {"success": False, "error": str(e)}


def uninstall() -> dict[str, Any]:
    """Remove the ClamAV installation.

    Returns:
        A dict with keys: success, message
    """
    global _setup_in_progress

    with _setup_lock:
        if _setup_in_progress:
            return {"success": False, "error": "Setup in progress, cannot uninstall"}

    try:
        if _DATA_DIR.exists():
            shutil.rmtree(_DATA_DIR)
        _save_state({"installed": False, "version": None, "setup_date": None})
        log.info("ClamAV uninstalled from %s", _DATA_DIR)
        return {"success": True, "message": "ClamAV removed"}
    except Exception as e:
        return {"success": False, "error": str(e)}
