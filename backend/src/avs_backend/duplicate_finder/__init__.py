"""Duplicate finder — locate duplicate files by content hash.

Optimized with drive selection and progress tracking.
"""

from __future__ import annotations

import hashlib
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any
from concurrent.futures import ThreadPoolExecutor, as_completed

import psutil

from avs_backend.api.registry import register

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


def _scan_directory(directory: str, exclude_dirs: list[str] | None = None) -> dict[str, list[dict[str, Any]]]:
    """Scan directory for files and group by hash."""
    if exclude_dirs is None:
        exclude_dirs = ['$RECYCLE.BIN', 'System Volume Information', 'Windows', 'Program Files', 'Program Files (x86)']
    
    hash_map: dict[str, list[dict[str, Any]]] = {}
    scanned_count = 0
    
    try:
        for root, dirs, files in os.walk(directory):
            # Skip excluded directories
            dirs[:] = [d for d in dirs if d not in exclude_dirs and not d.startswith('.')]
            
            for file in files:
                try:
                    file_path = os.path.join(root, file)
                    if not os.path.isfile(file_path):
                        continue
                    
                    # Skip files larger than 100MB to avoid long scans
                    file_size = os.path.getsize(file_path)
                    if file_size > 100 * 1024 * 1024:
                        continue
                    
                    file_hash = _calculate_file_hash(file_path)
                    if not file_hash:
                        continue
                    
                    if file_hash not in hash_map:
                        hash_map[file_hash] = []
                    
                    hash_map[file_hash].append({
                        'path': file_path,
                        'size': file_size,
                        'name': file,
                        'modified': datetime.fromtimestamp(os.path.getmtime(file_path)).isoformat(),
                    })
                    
                    scanned_count += 1
                except (OSError, PermissionError):
                    continue
    except (OSError, PermissionError) as e:
        logger.warning(f"Could not scan directory {directory}: {e}")
    
    logger.info(f"Scanned {scanned_count} files in {directory}")
    return hash_map


@register("duplicate.scan")
def duplicate_scan(params: dict[str, Any] | None) -> dict[str, Any]:
    """Scan for duplicate files."""
    start_time = datetime.now()
    
    # Get scan parameters
    directories = []
    if params and 'directories' in params:
        directories = params['directories']
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
    
    exclude_dirs = params.get('excludeDirs') if params else None
    min_file_size = params.get('minFileSize', 1024) if params else 1024  # Default 1KB
    
    logger.info(f"Starting duplicate scan in {len(directories)} directories")
    
    # Scan all directories
    hash_map: dict[str, list[dict[str, Any]]] = {}
    for directory in directories:
        if os.path.isdir(directory):
            dir_hash_map = _scan_directory(directory, exclude_dirs)
            for file_hash, files in dir_hash_map.items():
                if file_hash not in hash_map:
                    hash_map[file_hash] = []
                hash_map[file_hash].extend(files)
    
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


@register("duplicate.delete")
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
    
    return {
        'deletedCount': deleted_count,
        'spaceFreed': space_freed,
        'errors': errors,
    }
