"""
Drive Wiper / Secure File Shredder engine.

Provides secure file shredding with multiple overwrite patterns:
  - Quick (1-pass random)
  - DoD 5220.22-M (3-pass: zeros, ones, random)
  - Gutmann (35-pass with specific byte patterns)

Also provides directory cleanup and free-space wiping.
"""
from __future__ import annotations

import logging
import os
import random
import shutil
import string
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import List, Tuple

log = logging.getLogger("avs.shredder")

DEFAULT_BUFFER = 1024 * 1024  # 1 MiB


# ─── Shredding Methods ────────────────────────────────────────────

# DoD 5220.22-M pass patterns: zeros, ones (0xFF), then random
DOD_PASSES = [b"\x00", b"\xFF"]

# The full 35-pass Gutmann method:
# Passes 1-4: random, Passes 5-31: fixed patterns, Passes 32-35: random
GUTMANN_FULL: list[bytes | None] = [
    None, None, None, None,  # 1-4: random
    b"\x55", b"\xAA",  # 5-6
    b"\x92\x49\x24", b"\x49\x24\x92", b"\x24\x92\x49",  # 7-9
    b"\x6D\xB6\xDB", b"\xB6\xDB\x6D", b"\xDB\x6D\xB6",  # 10-12
    b"\x92\x49\x24", b"\x49\x24\x92", b"\x24\x92\x49",  # 13-15
    b"\x6D\xB6\xDB", b"\xB6\xDB\x6D", b"\xDB\x6D\xB6",  # 16-18
    b"\x92\x49\x24", b"\x49\x24\x92", b"\x24\x92\x49",  # 19-21
    b"\x6D\xB6\xDB", b"\xB6\xDB\x6D", b"\xDB\x6D\xB6",  # 22-24
    b"\x92\x49\x24", b"\x49\x24\x92", b"\x24\x92\x49",  # 25-27
    b"\x6D\xB6\xDB", b"\xB6\xDB\x6D", b"\xDB\x6D\xB6",  # 28-30
    b"\x55", b"\xAA",  # 31-32
    None, None, None,  # 33-35: random
]


@dataclass
class ShredResult:
    path: str
    success: bool
    message: str
    passes: int = 0
    bytes_shredded: int = 0


@dataclass
class WipeResult:
    drive: str
    bytesProcessed: int
    success: bool
    message: str


@dataclass
class WipeConfig:
    passes: int = 3
    zeros: bool = False
    removeDirs: bool = True


def _get_pass_data(method: str, pass_index: int, buffer_size: int) -> bytes:
    """Get the overwrite data for a specific pass based on the shredding method.

    Methods:
        - "quick": 1 pass of random data
        - "dod": DoD 5220.22-M (zeros, 0xFF, random)
        - "gutmann": 35-pass Gutmann method
        - "random": N passes of random data (legacy, uses passes param)
    """
    if method == "dod":
        if pass_index < len(DOD_PASSES):
            return DOD_PASSES[pass_index] * buffer_size
        # Final pass is random
        return os.urandom(buffer_size)

    if method == "gutmann":
        if pass_index < len(GUTMANN_FULL):
            pattern = GUTMANN_FULL[pass_index]
            if pattern is None:
                return os.urandom(buffer_size)
            # Repeat the pattern to fill the buffer
            repeat = (buffer_size // len(pattern)) + 1
            return (pattern * repeat)[:buffer_size]
        return os.urandom(buffer_size)

    # Default: random data (covers "quick" and legacy "random" method)
    return os.urandom(buffer_size)


def _get_method_pass_count(method: str, passes: int) -> int:
    """Get the number of passes for a shredding method."""
    if method == "quick":
        return 1
    if method == "dod":
        return 3  # DoD 5220.22-M is 3 passes
    if method == "gutmann":
        return 35  # Gutmann is 35 passes
    return passes  # Legacy: user-specified number of passes


def _secure_delete_file(
    path: str,
    method: str = "dod",
    passes: int = 3,
    zeros: bool = False,
) -> ShredResult:
    """Securely delete a single file by overwriting it multiple times.

    Args:
        path: Path to the file
        method: Shredding method ("quick", "dod", "gutmann", or "random")
        passes: Number of passes (used only for "random" method)
        zeros: If True and method is "random", use zeros instead of random

    Returns:
        ShredResult with operation details
    """
    p = Path(path)
    if not p.exists():
        return ShredResult(path=str(p), success=False, message="File not found")
    if not p.is_file():
        return ShredResult(path=str(p), success=False, message="Path is not a regular file")

    try:
        size = p.stat().st_size
        actual_passes = _get_method_pass_count(method, passes)

        with open(p, "r+b") as f:
            for pass_idx in range(actual_passes):
                f.seek(0)
                written = 0

                # Get the data pattern for this pass
                if method == "random" and zeros:
                    data = b"\x00" * DEFAULT_BUFFER
                else:
                    data = _get_pass_data(method, pass_idx, DEFAULT_BUFFER)

                while written < size:
                    chunk = data[: min(DEFAULT_BUFFER, size - written)]
                    f.write(chunk)
                    written += len(chunk)
                f.flush()
                os.fsync(f.fileno())

        # Truncate file to zero size
        with open(p, "wb") as f:
            f.truncate(0)
            f.flush()
            os.fsync(f.fileno())

        # Rename to obscure the original filename, then delete
        # Fix: capture the renamed path and unlink that
        try:
            random_name = "".join(random.choices(string.ascii_letters + string.digits, k=16))
            renamed = p.with_name(random_name)
            p.rename(renamed)
            renamed.unlink()
        except Exception:
            # Fallback: just unlink the original
            p.unlink()

        return ShredResult(
            path=str(p),
            success=True,
            message=f"Shredded with {method} ({actual_passes} pass(es))",
            passes=actual_passes,
            bytes_shredded=size,
        )
    except Exception as exc:
        log.warning("Shred failed for %s: %s", path, exc)
        return ShredResult(path=str(p), success=False, message=str(exc))


def shred_items(
    paths: List[str],
    method: str = "dod",
    passes: int = 3,
    zeros: bool = False,
) -> List[ShredResult]:
    """Shred a list of files and/or directories.

    Args:
        paths: List of file/directory paths
        method: Shredding method ("quick", "dod", "gutmann", "random")
        passes: Number of passes (for "random" method)
        zeros: Use zeros instead of random (for "random" method)

    Returns:
        List of ShredResult for each file processed
    """
    results: List[ShredResult] = []
    for raw in paths:
        p = Path(raw)
        if p.is_dir():
            try:
                for root, dirs, files in os.walk(str(p), topdown=False):
                    for name in files:
                        results.append(
                            _secure_delete_file(os.path.join(root, name), method, passes, zeros)
                        )
                    for name in dirs:
                        dir_path = os.path.join(root, name)
                        try:
                            shutil.rmtree(dir_path, ignore_errors=False)
                        except Exception as exc:
                            results.append(
                                ShredResult(path=dir_path, success=False, message=str(exc))
                            )
                shutil.rmtree(str(p), ignore_errors=False)
                results.append(
                    ShredResult(
                        path=str(p),
                        success=True,
                        message="Directory shredded and removed",
                    )
                )
            except Exception as exc:
                results.append(ShredResult(path=str(p), success=False, message=str(exc)))
        else:
            results.append(_secure_delete_file(raw, method, passes, zeros))
    return results


def list_drives() -> List[Tuple[str, str, str, int, int]]:
    """Return list of (drive_letter, label, file_system, total_bytes, free_bytes)."""
    drives: List[Tuple[str, str, str, int, int]] = []
    try:
        output = subprocess.run(
            ["wmic", "logicaldisk", "get", "DeviceID,VolumeName,FileSystem,Size,FreeSpace", "/format:csv"],
            capture_output=True, text=True, check=False,
        ).stdout
        lines = [line.strip() for line in output.splitlines() if line.strip()]
        for line in lines[1:]:
            parts = [part.strip() for part in line.split(",")]
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
    """Fill the selected drive's free space with temporary files, then delete them.

    This prevents recovery of previously deleted files on the drive's free space.
    """
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
