"""ClamAV Setup — downloads and installs ClamAV portable on first run.

This module handles the complete ClamAV setup workflow:
  1. Download the official ClamAV portable ZIP for Windows
  2. Extract it to a local directory under AVS Shield
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

# ClamAV installation directory under AVS Shield data
_DATA_DIR = Path(
    os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))
) / "AVS Shield" / "clamav"

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


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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
        f"""# ClamAV daemon configuration — generated by AVS Shield
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
        f"""# Freshclam configuration — generated by AVS Shield
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
    """Run the full ClamAV setup in a background thread."""
    global _setup_in_progress, _setup_progress

    try:
        with _setup_lock:
            _setup_progress = {"phase": "downloading_clamav"}

        # Step 1: Download ClamAV portable
        install_dir = _DATA_DIR
        install_dir.mkdir(parents=True, exist_ok=True)

        zip_path = install_dir / "clamav.zip"
        if not _download_file(_CLAMAV_ZIP_URL, zip_path, "clamav_download"):
            with _setup_lock:
                _setup_progress = {"phase": "error", "error": "Failed to download ClamAV"}
            return

        with _setup_lock:
            _setup_progress = {"phase": "extracting"}

        # Step 2: Extract
        try:
            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.extractall(install_dir)
            zip_path.unlink(missing_ok=True)
        except Exception as e:
            log.error("Failed to extract ClamAV ZIP: %s", e)
            with _setup_lock:
                _setup_progress = {"phase": "error", "error": f"Extraction failed: {e}"}
            return

        # Find the extracted directory (usually clamav-VERSION.win.x64)
        extracted_dirs = [
            d for d in install_dir.iterdir()
            if d.is_dir() and d.name.startswith("clamav")
        ]
        if extracted_dirs:
            # Move contents to install_dir root
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

        # Step 3: Generate config files
        _generate_config(install_dir)

        with _setup_lock:
            _setup_progress = {"phase": "downloading_signatures"}

        # Step 4: Download signature database
        db_dir = install_dir / "db"
        db_results = _download_signatures(db_dir)

        with _setup_lock:
            _setup_progress = {"phase": "complete"}

        # Step 5: Save state
        _save_state({
            "installed": True,
            "version": _CLAMAV_VERSION,
            "setup_date": _now_iso(),
            "db_results": db_results,
            "install_dir": str(install_dir),
        })

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
