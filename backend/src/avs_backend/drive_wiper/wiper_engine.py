"""
Drive Wiper / Secure File Shredder engine.

Provides secure file shredding (overwrite) and directory cleanup with
optional blank-space filling of a selected drive (simple "drive wiper").
"""
from __future__ import annotations

import os
import shutil
import random
import string
import tempfile
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import List, Tuple


DEFAULT_PASSES = 3
DEFAULT_BUFFER = 1024 * 1024  # 1 MiB


@dataclass
class ShredResult:
    path: str
    success: bool
    message: str


@dataclass
class WipeResult:
    drive: str
    bytesProcessed: int
    success: bool
    message: str


@dataclass
class WipeConfig:
    passes: int = DEFAULT_PASSES
    zeros: bool = False  # if True, overwrite with zeros instead of random bytes
    removeDirs: bool = True


def _secure_delete_file(path: str, passes: int = DEFAULT_PASSES, zeros: bool = False) -> ShredResult:
    p = Path(path)
    if not p.exists():
        return ShredResult(path=str(p), success=False, message="File not found")
    if not p.is_file():
        return ShredResult(path=str(p), success=False, message="Path is not a regular file")
    try:
        size = p.stat().st_size
        with open(p, "r+b") as f:
            for _ in range(passes):
                f.seek(0)
                written = 0
                data = b"\x00" * DEFAULT_BUFFER if zeros else os.urandom(DEFAULT_BUFFER)
                while written < size:
                    chunk = data[: min(DEFAULT_BUFFER, size - written)]
                    f.write(chunk)
                    written += len(chunk)
                f.flush()
                os.fsync(f.fileno())
        # Truncate and rename to obscure original name
        p.rename(p.with_name("".join(random.choices(string.ascii_letters + string.digits, k=16))))
        p.unlink()
        return ShredResult(path=str(p), success=True, message=f"Shredded with {passes} pass(es)")
    except Exception as exc:
        return ShredResult(path=str(p), success=False, message=str(exc))


def shred_items(paths: List[str], passes: int = DEFAULT_PASSES, zeros: bool = False) -> List[ShredResult]:
    results: List[ShredResult] = []
    for raw in paths:
        p = Path(raw)
        if p.is_dir():
            try:
                for root, dirs, files in os.walk(str(p), topdown=False):
                    for name in files:
                        results.append(_secure_delete_file(os.path.join(root, name), passes, zeros))
                    for name in dirs:
                        dir_path = os.path.join(root, name)
                        try:
                            shutil.rmtree(dir_path, ignore_errors=False)
                        except Exception as exc:
                            results.append(ShredResult(path=dir_path, success=False, message=str(exc)))
                shutil.rmtree(str(p), ignore_errors=False)
                results.append(ShredResult(path=str(p), success=True, message="Directory shredded and removed"))
            except Exception as exc:
                results.append(ShredResult(path=str(p), success=False, message=str(exc)))
        else:
            results.append(_secure_delete_file(raw, passes, zeros))
    return results


def list_drives() -> List[Tuple[str, str, str, int, int]]:
    """Return list of (drive_letter, label, file_system, total_bytes, free_bytes)."""
    drives: List[Tuple[str, str, str, int, int]] = []
    try:
        bitmask = ord(subprocess.run(["cmd", "/c", "wmic", "logicaldisk", "get", "DeviceID,VolumeName,FileSystem,Size,FreeSpace", "/format:csv"], capture_output=True, text=True).stdout.splitlines()[1][0])
    except Exception:
        bitmask = 0
    # Fallback using WMIC CSV parsing
    try:
        output = subprocess.run(
            ["wmic", "logicaldisk", "get", "DeviceID,VolumeName,FileSystem,Size,FreeSpace", "/format:csv"],
            capture_output=True, text=True, check=False
        ).stdout
        lines = [line.strip() for line in output.splitlines() if line.strip()]
        for line in lines[1:]:
            parts = [p.strip() for p in line.split(",")]
            if len(parts) < 6:
                continue
            _, device, label, fs, size_s, free_s = parts[:6]
            if not device:
                continue
            try:
                total = int(size_s) if size_s else 0
                free = int(free_s) if free_s else 0
            except ValueError:
                total = 0
                free = 0
            drives.append((device, label, fs, total, free))
    except Exception:
        pass
    return drives


def wipe_free_space(drive: str, passes: int = 1, zeros: bool = False) -> WipeResult:
    """Fill the selected drive's free space with temporary files, then delete them."""
    drive = drive.strip().rstrip("\\/")
    if not drive or not os.path.isdir(drive):
        return WipeResult(drive=drive, bytesProcessed=0, success=False, message="Invalid drive path")
    temp_dir = os.path.join(drive, "AVSWipeTemp")
    os.makedirs(temp_dir, exist_ok=True)
    total_bytes = 0
    try:
        free = shutil.disk_usage(drive).free
        chunk = 1024 * 1024 * 100  # 100 MiB files
        for i in range(max(1, free // chunk)):
            temp_file = os.path.join(temp_dir, f"wipe_{i}_{random.randint(1000, 9999)}.tmp")
            try:
                with open(temp_file, "wb") as f:
                    remaining = chunk
                    data = b"\x00" * DEFAULT_BUFFER if zeros else os.urandom(DEFAULT_BUFFER)
                    while remaining > 0:
                        to_write = min(DEFAULT_BUFFER, remaining)
                        f.write(data[:to_write])
                        remaining -= to_write
                        total_bytes += to_write
                    f.flush()
                    os.fsync(f.fileno())
            except OSError:
                break
        # Delete the temp fill files
        shutil.rmtree(temp_dir, ignore_errors=True)
        return WipeResult(
            drive=drive,
            bytesProcessed=total_bytes,
            success=True,
            message=f"Wrote and removed {total_bytes} bytes of free-space filler",
        )
    except Exception as exc:
        return WipeResult(drive=drive, bytesProcessed=total_bytes, success=False, message=str(exc))
