"""Disk Optimizer — defragment HDDs and run TRIM on SSDs.

Provides:
  - Drive analysis (fragmentation level, drive type HDD/SSD)
  - HDD defragmentation via Windows defrag.exe
  - SSD TRIM optimization via Windows defrag.exe
  - Optimization status and progress

RPC methods:
    disk_optimizer.listDrives   — list drives with type (HDD/SSD) and fragmentation
    disk_optimizer.analyze      — analyze a specific drive for fragmentation
    disk_optimizer.optimize     — defrag (HDD) or TRIM (SSD) a drive (Pro only)
    disk_optimizer.status       — get optimization status
"""

from __future__ import annotations

import logging
import os
import platform
import subprocess
import threading
import time
from datetime import datetime, timezone
from typing import Any

import psutil
from avs_backend.api.registry import register
from avs_backend.licensing import require_feature

log = logging.getLogger("avs.disk_optimizer")

IS_WINDOWS = platform.system() == "Windows"
_NO_WINDOW = 0x08000000 if IS_WINDOWS else 0

# Track optimization progress
_optimization_status: dict[str, Any] = {
    "running": False,
    "drive": None,
    "progress": 0,
    "message": "Idle",
    "startedAt": None,
    "completedAt": None,
    "result": None,
}
_status_lock = threading.Lock()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _run_powershell(script: str, timeout: int = 30) -> str:
    """Run a PowerShell script and return stdout."""
    if not IS_WINDOWS:
        return ""
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
            capture_output=True, text=True, timeout=timeout,
            creationflags=_NO_WINDOW,
        )
        return result.stdout.strip()
    except Exception as e:
        log.error("PowerShell command failed: %s", e)
        return ""


def _detect_drive_type(mountpoint: str) -> str:
    """Detect if a drive is HDD or SSD using PowerShell Get-PhysicalDisk.

    Returns 'SSD', 'HDD', or 'Unknown'.
    """
    if not IS_WINDOWS:
        return "Unknown"

    # Get the drive letter from mountpoint (e.g. "C:\\" -> "C")
    drive_letter = mountpoint.strip("\\/").rstrip(":")
    if not drive_letter or len(drive_letter) > 1:
        return "Unknown"

    # Query physical disk media type via PowerShell
    ps_script = f"""
$drive = Get-Partition -DriveLetter '{drive_letter}' -ErrorAction SilentlyContinue
if ($drive) {{
    $disk = Get-PhysicalDisk -DeviceNumber $drive.DiskNumber -ErrorAction SilentlyContinue
    if ($disk) {{
        Write-Output $disk.MediaType
    }}
}}
"""
    output = _run_powershell(ps_script, timeout=15)
    if output:
        if "SSD" in output:
            return "SSD"
        if "HDD" in output:
            return "HDD"
    return "Unknown"


def _analyze_drive(drive_letter: str) -> dict[str, Any]:
    """Analyze a drive for fragmentation using defrag.exe /A.

    Returns analysis data including fragmentation percentage.
    """
    if not IS_WINDOWS:
        return {"error": "Only available on Windows"}

    try:
        result = subprocess.run(
            ["defrag", f"{drive_letter}:", "/A", "/V"],
            capture_output=True, text=True, timeout=120,
            creationflags=_NO_WINDOW,
        )
        output = result.stdout + result.stderr

        # Parse fragmentation percentage from output
        frag_percent = 0.0
        for line in output.split("\n"):
            line = line.strip()
            if "fragmented" in line.lower() and "%" in line:
                # Try to extract percentage
                try:
                    pct_str = line.split("%")[0].split()[-1]
                    frag_percent = float(pct_str)
                except (ValueError, IndexError):
                    pass
            if "Total fragmentation" in line or "Fragmentation" in line:
                try:
                    pct_str = line.split("%")[0].split()[-1]
                    frag_percent = float(pct_str)
                except (ValueError, IndexError):
                    pass

        drive_type = _detect_drive_type(f"{drive_letter}:\\")

        return {
            "drive": f"{drive_letter}:",
            "driveType": drive_type,
            "fragmentationPercent": frag_percent,
            "needsOptimization": frag_percent > 10 and drive_type == "HDD",
            "analysisOutput": output[:2000],  # Truncate for storage
            "analyzedAt": _now_iso(),
        }
    except subprocess.TimeoutExpired:
        return {"error": "Analysis timed out", "drive": f"{drive_letter}:"}
    except Exception as e:
        return {"error": str(e), "drive": f"{drive_letter}:"}


def _optimize_drive(drive_letter: str, drive_type: str) -> dict[str, Any]:
    """Optimize a drive — defrag for HDD, TRIM for SSD.

    Uses Windows defrag.exe with appropriate flags:
      - HDD: defrag /D (defragment)
      - SSD: defrag /L (TRIM/retrim)
    """
    if not IS_WINDOWS:
        return {"error": "Only available on Windows"}

    try:
        if drive_type == "SSD":
            # SSD: run TRIM
            cmd = ["defrag", f"{drive_letter}:", "/L", "/U", "/V"]
            action = "TRIM"
        else:
            # HDD: defragment
            cmd = ["defrag", f"{drive_letter}:", "/D", "/U", "/V"]
            action = "Defragment"

        result = subprocess.run(
            cmd,
            capture_output=True, text=True, timeout=600,  # 10 min max
            creationflags=_NO_WINDOW,
        )
        output = result.stdout + result.stderr
        success = result.returncode == 0

        return {
            "drive": f"{drive_letter}:",
            "action": action,
            "success": success,
            "message": f"{action} {'completed' if success else 'failed'} for {drive_letter}:",
            "output": output[:2000],
            "completedAt": _now_iso(),
        }
    except subprocess.TimeoutExpired:
        return {
            "drive": f"{drive_letter}:",
            "action": action if 'action' in locals() else "Optimize",
            "success": False,
            "message": "Optimization timed out",
            "output": "",
            "completedAt": _now_iso(),
        }
    except Exception as e:
        return {
            "drive": f"{drive_letter}:",
            "action": "Optimize",
            "success": False,
            "message": str(e),
            "output": "",
            "completedAt": _now_iso(),
        }


# ─── RPC Methods ──────────────────────────────────────────────────

@register("disk_optimizer.listDrives")
def disk_optimizer_list_drives(_params: dict[str, Any] | None) -> dict[str, Any]:
    """List all drives with type (HDD/SSD) and basic info."""
    if not IS_WINDOWS:
        return {"drives": [], "supported": False}

    drives: list[dict[str, Any]] = []
    try:
        for part in psutil.disk_partitions(all=False):
            try:
                usage = psutil.disk_usage(part.mountpoint)
                drive_letter = part.device.strip("\\/").rstrip(":")
                drive_type = _detect_drive_type(part.mountpoint)

                drives.append({
                    "device": part.device,
                    "mountpoint": part.mountpoint,
                    "fstype": part.fstype,
                    "total": usage.total,
                    "used": usage.used,
                    "free": usage.free,
                    "percent": usage.percent,
                    "driveType": drive_type,
                    "isSSD": drive_type == "SSD",
                    "needsOptimization": False,  # Set after analyze
                })
            except OSError:
                continue
    except Exception as e:
        log.error("Failed to list drives: %s", e)

    return {
        "drives": drives,
        "count": len(drives),
        "supported": True,
        "capturedAt": _now_iso(),
    }


@register("disk_optimizer.analyze")
def disk_optimizer_analyze(params: dict[str, Any] | None) -> dict[str, Any]:
    """Analyze a drive for fragmentation.

    Params:
        drive: drive letter (e.g. "C")
    """
    if not IS_WINDOWS:
        return {"error": "Only available on Windows", "supported": False}

    if not params or "drive" not in params:
        return {"error": "Drive parameter is required"}

    drive = params["drive"].strip().rstrip(":")
    return _analyze_drive(drive)


@register("disk_optimizer.optimize")
@require_feature("disk.optimize")
def disk_optimizer_optimize(params: dict[str, Any] | None) -> dict[str, Any]:
    """Optimize a drive — defrag (HDD) or TRIM (SSD). Pro only.

    Params:
        drive: drive letter (e.g. "C")
        driveType: optional, auto-detected if not provided
    """
    if not IS_WINDOWS:
        return {"error": "Only available on Windows", "supported": False}

    if not params or "drive" not in params:
        return {"error": "Drive parameter is required"}

    drive = params["drive"].strip().rstrip(":")
    drive_type = params.get("driveType") or _detect_drive_type(f"{drive}:\\")

    # Check if already running
    with _status_lock:
        if _optimization_status["running"]:
            return {"error": "An optimization is already running", "drive": _optimization_status["drive"]}

    # Update status
    with _status_lock:
        _optimization_status.update({
            "running": True,
            "drive": f"{drive}:",
            "progress": 0,
            "message": f"Starting {('TRIM' if drive_type == 'SSD' else 'defragmentation')}...",
            "startedAt": _now_iso(),
            "completedAt": None,
            "result": None,
        })

    # Run optimization in background thread
    def _run():
        try:
            with _status_lock:
                _optimization_status["message"] = f"{'TRIM' if drive_type == 'SSD' else 'Defragmenting'} {drive}:..."
                _optimization_status["progress"] = 50

            result = _optimize_drive(drive, drive_type)

            with _status_lock:
                _optimization_status.update({
                    "running": False,
                    "progress": 100,
                    "message": result.get("message", "Complete"),
                    "completedAt": _now_iso(),
                    "result": result,
                })
        except Exception as e:
            with _status_lock:
                _optimization_status.update({
                    "running": False,
                    "progress": 0,
                    "message": f"Error: {e}",
                    "completedAt": _now_iso(),
                    "result": {"success": False, "message": str(e)},
                })

    thread = threading.Thread(target=_run, daemon=True, name="disk-optimizer")
    thread.start()

    return {
        "started": True,
        "drive": f"{drive}:",
        "driveType": drive_type,
        "action": "TRIM" if drive_type == "SSD" else "Defragment",
        "message": f"Optimization started for {drive}:",
    }


@register("disk_optimizer.status")
def disk_optimizer_status(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get current optimization status."""
    with _status_lock:
        return dict(_optimization_status)
