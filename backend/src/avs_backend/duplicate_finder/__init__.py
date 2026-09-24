"""Duplicate finder — locate duplicate files by content hash.

Optimized with drive selection and progress tracking.
"""

from __future__ import annotations

import hashlib
import logging
import os
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any
from concurrent.futures import ThreadPoolExecutor, as_completed

import psutil

from avs_backend.api.registry import register
from avs_backend.licensing import require_feature

logger = logging.getLogger(__name__)

IS_WINDOWS = os.name == "nt"


@register("duplicate.listDrives")
def duplicate_list_drives(_params: dict[str, Any] | None) -> list[dict[str, Any]]:
    """List all available drives with their usage information."""
    drives = []
    
    try:
        for part in psutil.disk_partitions(all=False):
            try:
                usage = psutil.disk_usage(part.mountpoint)
                drives.append({
                    'device': part.device,
                    'mountpoint': part.mountpoint,
                    'fstype': part.fstype,
                    'total': usage.total,
                    'used': usage.used,
                    'free': usage.free,
                    'percent': usage.percent,
                })
            except OSError:
                continue
    except Exception as e:
        logger.error(f"Failed to list drives: {e}")
        raise
    
    return drives


@dataclass(slots=True)
class DuplicateGroup:
    """A group of duplicate files with the same content hash."""
    hash: str
    files: list[dict[str, Any]] = field(default_factory=list)
    total_size: int = 0


@dataclass(slots=True)
class DuplicateScanResult:
    """Result of a duplicate file scan."""
    groups: list[DuplicateGroup]
    total_files: int
    total_duplicates: int
    recoverable_space: int
    scan_duration_ms: int
    scanned_directories: list[str]


def _safe_mtime(file_path: str) -> str:
    """Return an ISO mtime string, or '' for unreadable/insane timestamps."""
    try:
        return datetime.fromtimestamp(os.path.getmtime(file_path)).isoformat()
    except (OSError, ValueError, OverflowError):
        return ''


def _calculate_file_hash(file_path: str, block_size: int = 65536) -> str:
    """Calculate SHA256 hash of a file."""
    hasher = hashlib.sha256()
    try:
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(block_size), b''):
                hasher.update(chunk)
        return hasher.hexdigest()
    except (OSError, PermissionError) as e:
        logger.warning(f"Could not hash file {file_path}: {e}")
        return ""


MAX_FILES_PER_SCAN = 250_000
MAX_SCAN_TIMEOUT_S = 60.0
# Files larger than this are skipped — hashing them dominates scan time.
MAX_HASH_FILE_SIZE = 1024 * 1024 * 1024  # 1 GB
_HASH_WORKERS = 8
_DIR_WORKERS = 4

# Live scan progress — polled by the frontend via duplicate.scan.progress.
_progress_lock = threading.Lock()
_progress: dict[str, Any] = {
    'running': False,
    'currentPath': None,
    'filesScanned': 0,
    'phase': 'idle',  # idle | scanning | hashing
    'hashTotal': 0,
    'hashDone': 0,
}


def _report_progress(**kwargs: Any) -> None:
    with _progress_lock:
        _progress.update(kwargs)


def _bump_scanned(path: str) -> None:
    with _progress_lock:
        _progress['currentPath'] = path
        _progress['filesScanned'] += 1


def _bump_hashed(path: str) -> None:
    with _progress_lock:
        _progress['currentPath'] = path
        _progress['hashDone'] += 1


@register("duplicate.scan.progress")
def duplicate_scan_progress(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Return live duplicate-scan progress for the frontend to poll."""
    with _progress_lock:
        return dict(_progress)


def _scan_directory(directory: str, exclude_dirs: list[str] | None = None) -> dict[str, list[dict[str, Any]]]:
    """Scan directory for files and group by hash.

    Safety limits:
    - MAX_FILES_PER_SCAN: stop after scanning this many files
    - MAX_SCAN_TIMEOUT_S: stop after this many seconds
    - Files >1GB are skipped (too slow to hash)
    - First pass groups by size, then only hashes files with same size
    - Hashing runs on a thread pool — it is the dominant cost
    """
    if exclude_dirs is None:
        exclude_dirs = ['$RECYCLE.BIN', 'System Volume Information', 'Windows', 'Program Files', 'Program Files (x86)']

    hash_map: dict[str, list[dict[str, Any]]] = {}
    scanned_count = 0
    start_time = time.monotonic()

    # Phase 1: Group by size first (fast, no hashing)
    size_map: dict[int, list[dict[str, Any]]] = {}

    try:
        for root, dirs, files in os.walk(directory):
            # Skip excluded directories
            dirs[:] = [d for d in dirs if d not in exclude_dirs and not d.startswith('.')]

            for file in files:
                if scanned_count >= MAX_FILES_PER_SCAN:
                    logger.info(f"Scan limit reached: {MAX_FILES_PER_SCAN} files in {directory}")
                    break
                if time.monotonic() - start_time > MAX_SCAN_TIMEOUT_S:
                    logger.info(f"Scan timeout reached: {MAX_SCAN_TIMEOUT_S}s in {directory}")
                    break
                try:
                    file_path = os.path.join(root, file)
                    if not os.path.isfile(file_path):
                        continue

                    file_size = os.path.getsize(file_path)
                    if file_size > MAX_HASH_FILE_SIZE:
                        continue

                    scanned_count += 1
                    _bump_scanned(file_path)
                    file_info = {
                        'path': file_path,
                        'size': file_size,
                        'name': file,
                        'modified': _safe_mtime(file_path),
                    }
                    size_map.setdefault(file_size, []).append(file_info)
                except Exception:
                    # A single unreadable/odd file must never abort the scan.
                    continue
            else:
                continue
            break  # Break outer loop if inner loop broke
    except (OSError, PermissionError) as e:
        logger.warning(f"Could not scan directory {directory}: {e}")

    # Phase 2: Only hash files that share a size with another file.
    # Hashing is the dominant cost — run it on a thread pool.
    to_hash: list[dict[str, Any]] = [
        info for file_list in size_map.values() if len(file_list) > 1 for info in file_list
    ]
    with _progress_lock:
        _progress['phase'] = 'hashing'
        _progress['hashTotal'] += len(to_hash)

    deadline = start_time + MAX_SCAN_TIMEOUT_S
    timed_out = False
    pool = ThreadPoolExecutor(max_workers=_HASH_WORKERS)
    try:
        futures = {pool.submit(_calculate_file_hash, info['path']): info for info in to_hash}
        for future in as_completed(futures):
            info = futures[future]
            _bump_hashed(info['path'])
            if time.monotonic() > deadline:
                logger.info(f"Hash timeout reached: {MAX_SCAN_TIMEOUT_S}s in {directory}")
                timed_out = True
                break
            try:
                file_hash = future.result()
            except Exception:
                continue
            if not file_hash:
                continue
            hash_map.setdefault(file_hash, []).append(info)
    finally:
        # On timeout, don't block the RPC on in-flight hashes —
        # cancel pending work and let running files finish in the
        # background so the scan returns within its time budget.
        pool.shutdown(wait=not timed_out, cancel_futures=True)

    logger.info(f"Scanned {scanned_count} files in {directory} ({time.monotonic() - start_time:.1f}s)")
    return hash_map


@register("duplicate.scan")
def duplicate_scan(params: dict[str, Any] | None) -> dict[str, Any]:
    """Scan for duplicate files."""
    start_time = datetime.now()
    
    # Get scan parameters
    params = params or {}
    scope = params.get('scope', 'custom')
    explicit_dirs = params.get('directories') or []
    directories: list[str] = []

    # Resolve directories from scope
    if scope and scope != 'custom':
        directories = _resolve_estimate_directories(params)
    elif explicit_dirs:
        directories = [str(d) for d in explicit_dirs if d]
    else:
        # Default to common user directories
        if IS_WINDOWS:
            user_profile = os.environ.get('USERPROFILE', '')
            if user_profile:
                directories = [
                    os.path.join(user_profile, 'Documents'),
                    os.path.join(user_profile, 'Downloads'),
                    os.path.join(user_profile, 'Pictures'),
                    os.path.join(user_profile, 'Desktop'),
                ]
        else:
            directories = [os.path.expanduser('~')]
    
    exclude_dirs = params.get('excludeDirs')
    min_file_size = params.get('minFileSize', 1024)  # Default 1KB
    
    logger.info(f"Starting duplicate scan in {len(directories)} directories")

    _report_progress(
        running=True, currentPath=None, filesScanned=0,
        phase='scanning', hashTotal=0, hashDone=0,
    )

    # Scan directories in parallel — each is bounded by its own timeout,
    # so the whole scan stays within one MAX_SCAN_TIMEOUT_S window.
    # A failure in one directory must not abort the whole scan.
    valid_dirs = [d for d in directories if os.path.isdir(d)]
    hash_map: dict[str, list[dict[str, Any]]] = {}
    try:
        with ThreadPoolExecutor(max_workers=min(_DIR_WORKERS, max(1, len(valid_dirs)))) as pool:
            futures = {pool.submit(_scan_directory, d, exclude_dirs): d for d in valid_dirs}
            for future in as_completed(futures):
                try:
                    dir_hash_map = future.result()
                except Exception as e:
                    logger.warning(f"Directory scan failed for {futures[future]}: {e}")
                    continue
                for file_hash, files in dir_hash_map.items():
                    hash_map.setdefault(file_hash, []).extend(files)
    finally:
        _report_progress(running=False, phase='idle')
    
    # Filter for duplicates (groups with more than 1 file)
    duplicate_groups = []
    total_files = 0
    total_duplicates = 0
    recoverable_space = 0
    
    for file_hash, files in hash_map.items():
        if len(files) > 1:
            # Filter by minimum file size
            if files[0]['size'] >= min_file_size:
                group = DuplicateGroup(
                    hash=file_hash,
                    files=files,
                    total_size=files[0]['size'] * (len(files) - 1),
                )
                duplicate_groups.append(group)
                total_files += len(files)
                total_duplicates += len(files) - 1
                recoverable_space += group.total_size
    
    # Sort by recoverable space (descending)
    duplicate_groups.sort(key=lambda g: g.total_size, reverse=True)
    
    elapsed = (datetime.now() - start_time).total_seconds()
    scan_duration_ms = int(elapsed * 1000)
    
    result = DuplicateScanResult(
        groups=duplicate_groups,
        total_files=total_files,
        total_duplicates=total_duplicates,
        recoverable_space=recoverable_space,
        scan_duration_ms=scan_duration_ms,
        scanned_directories=directories,
    )
    
    logger.info(f"Duplicate scan completed in {elapsed:.2f}s: {total_duplicates} duplicates, {recoverable_space / 1024 / 1024:.1f} MB recoverable")
    
    return {
        'groups': [
            {
                'hash': group.hash,
                'files': group.files,
                'totalSize': group.total_size,
                'fileCount': len(group.files),
            }
            for group in result.groups
        ],
        'totalFiles': result.total_files,
        'totalDuplicates': result.total_duplicates,
        'recoverableSpace': result.recoverable_space,
        'scanDurationMs': result.scan_duration_ms,
        'scannedDirectories': result.scanned_directories,
    }


_USER_SCOPE_FOLDERS = {
    'pictures': 'Pictures',
    'videos': 'Videos',
    'music': 'Music',
    'documents': 'Documents',
    'downloads': 'Downloads',
    'desktop': 'Desktop',
}


def _resolve_estimate_directories(params: dict[str, Any] | None) -> list[str]:
    """Resolve directories from a scope or explicit list."""
    params = params or {}
    scope = params.get('scope', 'custom')
    explicit = params.get('directories') or []

    if scope == 'custom':
        return [str(d) for d in explicit if d]

    if scope in _USER_SCOPE_FOLDERS:
        if IS_WINDOWS:
            profile = os.environ.get('USERPROFILE', '')
        else:
            profile = os.path.expanduser('~')
        if profile:
            return [os.path.join(profile, _USER_SCOPE_FOLDERS[scope])]
        return []

    if scope == 'entire':
        if explicit:
            return [str(d) for d in explicit if d]
        # Fallback to user profile defaults
        if IS_WINDOWS:
            profile = os.environ.get('USERPROFILE', '')
            if profile:
                return [
                    os.path.join(profile, 'Documents'),
                    os.path.join(profile, 'Downloads'),
                    os.path.join(profile, 'Pictures'),
                    os.path.join(profile, 'Desktop'),
                ]
        return [os.path.expanduser('~')]

    return [str(d) for d in explicit if d]


def _estimate_directory(directory: str) -> tuple[int, int]:
    """Count files and total bytes in a directory tree without hashing."""
    total_files = 0
    total_bytes = 0
    exclude_dirs = ['$RECYCLE.BIN', 'System Volume Information', 'Windows', 'Program Files', 'Program Files (x86)']
    start_time = time.monotonic()

    try:
        for root, dirs, files in os.walk(directory):
            dirs[:] = [d for d in dirs if d not in exclude_dirs and not d.startswith('.')]
            for file in files:
                if total_files >= MAX_FILES_PER_SCAN:
                    logger.info(f"Estimate limit reached: {MAX_FILES_PER_SCAN} files in {directory}")
                    break
                if time.monotonic() - start_time > MAX_SCAN_TIMEOUT_S:
                    logger.info(f"Estimate timeout reached: {MAX_SCAN_TIMEOUT_S}s in {directory}")
                    break
                try:
                    file_path = os.path.join(root, file)
                    if not os.path.isfile(file_path):
                        continue
                    file_size = os.path.getsize(file_path)
                    if file_size > 100 * 1024 * 1024:
                        continue
                    total_files += 1
                    total_bytes += file_size
                except Exception:
                    continue
            else:
                continue
            break
    except (OSError, PermissionError) as e:
        logger.warning(f"Could not estimate directory {directory}: {e}")

    return total_files, total_bytes


@register("duplicate.estimate")
def duplicate_estimate(params: dict[str, Any] | None) -> dict[str, Any]:
    """Estimate the number of files and bytes that would be scanned."""
    directories = _resolve_estimate_directories(params)
    estimated_files = 0
    estimated_bytes = 0

    for directory in directories:
        if os.path.isdir(directory):
            files, bytes_count = _estimate_directory(directory)
            estimated_files += files
            estimated_bytes += bytes_count

    return {
        'directories': directories,
        'estimatedFiles': estimated_files,
        'estimatedBytes': estimated_bytes,
    }


@register("duplicate.delete")
@require_feature("duplicate.delete")
def duplicate_delete(params: dict[str, Any] | None) -> dict[str, Any]:
    """Delete selected duplicate files."""
    if not params or 'files' not in params:
        raise ValueError("Missing 'files' parameter")

    files_to_delete = params['files']

    deleted_count = 0
    space_freed = 0
    errors = []
    
    for file_info in files_to_delete:
        file_path = file_info['path']
        try:
            if os.path.exists(file_path):
                file_size = os.path.getsize(file_path)
                os.remove(file_path)
                deleted_count += 1
                space_freed += file_size
                logger.info(f"Deleted duplicate file: {file_path}")
        except (OSError, PermissionError) as e:
            error_msg = f"Could not delete {file_path}: {e}"
            errors.append(error_msg)
            logger.warning(error_msg)
    
    logger.info(f"Duplicate delete completed: {deleted_count} files deleted, {space_freed / 1024 / 1024:.1f} MB freed, {len(errors)} errors")

    return {
        'deletedCount': deleted_count,
        'spaceFreed': space_freed,
        'errors': errors,
    }
