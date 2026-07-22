"""Disk analyzer — analyze disk usage by directory and file type.

Optimized with drive selection and progress tracking.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

import psutil

from avs_backend.api.registry import register

logger = logging.getLogger(__name__)

IS_WINDOWS = os.name == "nt"

# File category mappings for user-friendly grouping
_FILE_CATEGORIES: dict[str, list[str]] = {
    "Pictures": [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg", ".tiff", ".ico", ".heic", ".heif"],
    "Videos": [".mp4", ".avi", ".mkv", ".mov", ".wmv", ".flv", ".webm", ".m4v", ".mpg", ".mpeg", ".3gp"],
    "Documents": [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".rtf", ".odt", ".ods", ".odp", ".csv", ".md"],
    "Audio": [".mp3", ".wav", ".flac", ".aac", ".ogg", ".wma", ".m4a", ".opus", ".aiff"],
    "Archives": [".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz", ".iso", ".cab"],
    "Applications": [".exe", ".msi", ".bat", ".cmd", ".ps1", ".sh", ".app"],
    "Code": [".js", ".ts", ".py", ".java", ".cpp", ".c", ".cs", ".go", ".rs", ".rb", ".php", ".html", ".css", ".json", ".xml", ".yaml", ".yml"],
    "Databases": [".db", ".sqlite", ".mdb", ".accdb", ".dbf"],
    "System": [".dll", ".sys", ".drv", ".inf", ".log", ".tmp", ".temp"],
}

# Reverse lookup: extension -> category
_EXT_TO_CATEGORY: dict[str, str] = {}
for cat, exts in _FILE_CATEGORIES.items():
    for ext in exts:
        _EXT_TO_CATEGORY[ext] = cat


def _get_file_category(ext: str) -> str:
    """Get the user-friendly category name for a file extension."""
    ext = ext.lower()
    if ext in _EXT_TO_CATEGORY:
        return _EXT_TO_CATEGORY[ext]
    return "Other"


@register("disk.listDrives")
def disk_list_drives(_params: dict[str, Any] | None) -> list[dict[str, Any]]:
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
class DiskItem:
    """A file or directory in the disk analysis."""
    name: str
    path: str
    size: int
    type: str  # 'file' or 'directory'
    modified: str


@dataclass(slots=True)
class DirectoryAnalysis:
    """Analysis result for a directory."""
    path: str
    totalSize: int
    fileCount: int
    directoryCount: int
    largestFiles: list[DiskItem]
    fileTypes: dict[str, int]  # extension -> total size
    subdirectories: list[DirectoryAnalysis] = field(default_factory=list)


@dataclass(slots=True)
class DiskAnalysisResult:
    """Complete disk analysis result."""
    rootPath: str
    totalSize: int
    fileCount: int
    directoryCount: int
    analysis: DirectoryAnalysis
    scanDurationMs: int


# Max files to collect per category (to keep response size reasonable)
_MAX_FILES_PER_CATEGORY = 500


def _analyze_directory(directory: str, maxDepth: int = 3, currentDepth: int = 0,
                        categorized: dict[str, list[dict[str, Any]]] | None = None) -> DirectoryAnalysis:
    """Analyze a directory recursively.
    
    If ``categorized`` is provided, files are also grouped into user-friendly
    categories (Pictures, Videos, etc.) during the same walk — avoiding a
    second recursive scan.
    """
    total_size = 0
    file_count = 0
    directory_count = 0
    largest_files = []
    file_types: dict[str, int] = {}
    subdirectories = []
    
    try:
        for item in os.listdir(directory):
            item_path = os.path.join(directory, item)
            
            if os.path.isfile(item_path):
                try:
                    file_size = os.path.getsize(item_path)
                    total_size += file_size
                    file_count += 1
                    
                    # Track largest files
                    largest_files.append(DiskItem(
                        name=item,
                        path=item_path,
                        size=file_size,
                        type='file',
                        modified=datetime.fromtimestamp(os.path.getmtime(item_path)).isoformat(),
                    ))
                    if len(largest_files) > 20:
                        largest_files.sort(key=lambda x: x.size, reverse=True)
                        largest_files = largest_files[:20]
                    
                    # Track file types by extension
                    ext = os.path.splitext(item)[1].lower() or 'no_extension'
                    if ext not in file_types:
                        file_types[ext] = 0
                    file_types[ext] += file_size
                    
                    # Categorize files in the same pass
                    if categorized is not None:
                        category = _get_file_category(ext if ext != 'no_extension' else '')
                        cat_list = categorized.get(category)
                        if cat_list is None:
                            cat_list = []
                            categorized[category] = cat_list
                        if len(cat_list) < _MAX_FILES_PER_CATEGORY:
                            cat_list.append({
                                'name': item,
                                'path': item_path,
                                'size': file_size,
                                'extension': ext if ext != 'no_extension' else 'none',
                                'modified': datetime.fromtimestamp(os.path.getmtime(item_path)).isoformat(),
                            })
                    
                except (OSError, PermissionError):
                    continue
                    
            elif os.path.isdir(item_path):
                directory_count += 1
                
                # Recursively analyze subdirectories if within max depth
                if currentDepth < maxDepth:
                    try:
                        sub_analysis = _analyze_directory(item_path, maxDepth, currentDepth + 1, categorized)
                        subdirectories.append(sub_analysis)
                        total_size += sub_analysis.totalSize
                        file_count += sub_analysis.fileCount
                        directory_count += sub_analysis.directoryCount
                    except (OSError, PermissionError):
                        continue
    except (OSError, PermissionError) as e:
        logger.warning(f"Could not analyze directory {directory}: {e}")
    
    # Sort largest files by size
    largest_files.sort(key=lambda x: x.size, reverse=True)
    
    # Sort file types by size
    file_types = dict(sorted(file_types.items(), key=lambda x: x[1], reverse=True))
    
    return DirectoryAnalysis(
        path=directory,
        totalSize=total_size,
        fileCount=file_count,
        directoryCount=directory_count,
        largestFiles=largest_files,
        fileTypes=file_types,
        subdirectories=subdirectories,
    )


def _collect_categorized_files(directory: str, max_depth: int = 5) -> dict[str, list[dict[str, Any]]]:
    """Walk a directory and group files by user-friendly categories.
    
    Returns a dict mapping category name -> list of file dicts with
    name, path, size, extension, and modified date.
    """
    categories: dict[str, list[dict[str, Any]]] = {}
    
    try:
        for root, dirs, files in os.walk(directory):
            # Check depth
            rel_depth = root[len(directory):].count(os.sep)
            if rel_depth > max_depth:
                dirs.clear()
                continue
            
            for filename in files:
                file_path = os.path.join(root, filename)
                try:
                    file_size = os.path.getsize(file_path)
                    ext = os.path.splitext(filename)[1].lower()
                    category = _get_file_category(ext)
                    modified = datetime.fromtimestamp(
                        os.path.getmtime(file_path)
                    ).isoformat()
                    
                    if category not in categories:
                        categories[category] = []
                    
                    categories[category].append({
                        'name': filename,
                        'path': file_path,
                        'size': file_size,
                        'extension': ext or 'none',
                        'modified': modified,
                    })
                except (OSError, PermissionError):
                    continue
    except (OSError, PermissionError) as e:
        logger.warning(f"Could not collect files from {directory}: {e}")
    
    # Sort each category by size descending
    for cat in categories:
        categories[cat].sort(key=lambda f: f['size'], reverse=True)
    
    return categories


@register("disk.analyze")
def disk_analyze(params: dict[str, Any] | None) -> dict[str, Any]:
    """Analyze disk usage for a directory."""
    start_time = datetime.now()
    
    # Get parameters
    directory = params.get('directory') if params else None
    maxDepth = params.get('maxDepth', 2) if params else 2
    
    # Default to user profile or root
    if not directory:
        if IS_WINDOWS:
            directory = os.environ.get('USERPROFILE', 'C:\\')
        else:
            directory = os.path.expanduser('~')
    
    logger.info(f"Starting disk analysis of {directory} with max depth {maxDepth}")
    
    # Single-pass: analyze directory and collect categorized files together
    categorized_files: dict[str, list[dict[str, Any]]] = {}
    analysis = _analyze_directory(directory, maxDepth, categorized=categorized_files)
    
    # Calculate totals
    total_size = analysis.totalSize
    total_files = analysis.fileCount
    total_directories = analysis.directoryCount
    
    elapsed = (datetime.now() - start_time).total_seconds()
    scan_duration_ms = int(elapsed * 1000)
    
    logger.info(f"Disk analysis completed in {elapsed:.2f}s: {total_files} files, {total_directories} directories, {total_size / 1024 / 1024:.1f} MB")
    
    # Sort each category by size descending
    for cat in categorized_files:
        categorized_files[cat].sort(key=lambda f: f['size'], reverse=True)
    
    # Build category summary with counts and total sizes
    category_summary: list[dict[str, Any]] = []
    for cat_name, files in sorted(categorized_files.items(), key=lambda x: sum(f['size'] for f in x[1]), reverse=True):
        cat_size = sum(f['size'] for f in files)
        category_summary.append({
            'category': cat_name,
            'fileCount': len(files),
            'totalSize': cat_size,
        })
    
    return {
        'rootPath': directory,
        'totalSize': total_size,
        'fileCount': total_files,
        'directoryCount': total_directories,
        'scanDurationMs': scan_duration_ms,
        'analysis': {
            'path': analysis.path,
            'totalSize': analysis.totalSize,
            'fileCount': analysis.fileCount,
            'directoryCount': analysis.directoryCount,
            'largestFiles': [
                {
                    'name': f.name,
                    'path': f.path,
                    'size': f.size,
                    'type': f.type,
                    'modified': f.modified,
                }
                for f in analysis.largestFiles
            ],
            'fileTypes': analysis.fileTypes,
            'subdirectories': [
                {
                    'path': sub.path,
                    'totalSize': sub.totalSize,
                    'fileCount': sub.fileCount,
                    'directoryCount': sub.directoryCount,
                }
                for sub in analysis.subdirectories
            ],
        },
        'categorizedFiles': categorized_files,
        'categorySummary': category_summary,
    }


@register("disk.deleteFiles")
def disk_delete_files(params: dict[str, Any] | None) -> dict[str, Any]:
    """Delete a list of files selected by the user.
    
    Expected params:
        files: list of file path strings to delete
    """
    if not params or 'files' not in params:
        raise ValueError("Missing 'files' parameter")
    
    files_to_delete = params['files']
    if not isinstance(files_to_delete, list):
        raise ValueError("'files' must be a list of file paths")
    
    deleted = 0
    failed = 0
    bytes_freed = 0
    errors: list[dict[str, str]] = []
    
    for file_path in files_to_delete:
        try:
            if not os.path.exists(file_path):
                errors.append({'path': file_path, 'error': 'File not found'})
                failed += 1
                continue
            
            if os.path.isfile(file_path):
                file_size = os.path.getsize(file_path)
                os.remove(file_path)
                deleted += 1
                bytes_freed += file_size
            elif os.path.isdir(file_path):
                import shutil
                # Calculate directory size before deletion
                dir_size = 0
                for root, _, files in os.walk(file_path):
                    for f in files:
                        try:
                            dir_size += os.path.getsize(os.path.join(root, f))
                        except (OSError, PermissionError):
                            continue
                shutil.rmtree(file_path)
                deleted += 1
                bytes_freed += dir_size
            else:
                errors.append({'path': file_path, 'error': 'Not a file or directory'})
                failed += 1
        except PermissionError as e:
            errors.append({'path': file_path, 'error': f'Permission denied: {e}'})
            failed += 1
        except OSError as e:
            errors.append({'path': file_path, 'error': str(e)})
            failed += 1
    
    logger.info(f"Deleted {deleted} files ({bytes_freed / 1024 / 1024:.1f} MB freed), {failed} failed")
    
    return {
        'deleted': deleted,
        'failed': failed,
        'bytesFreed': bytes_freed,
        'errors': errors,
    }
