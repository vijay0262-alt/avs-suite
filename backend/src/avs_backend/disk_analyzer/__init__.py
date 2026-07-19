"""Disk analyzer — analyze disk usage by directory and file type."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from avs_backend.api.registry import register

logger = logging.getLogger(__name__)

IS_WINDOWS = os.name == "nt"


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


def _analyze_directory(directory: str, maxDepth: int = 3, currentDepth: int = 0) -> DirectoryAnalysis:
    """Analyze a directory recursively."""
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
                    
                except (OSError, PermissionError):
                    continue
                    
            elif os.path.isdir(item_path):
                directory_count += 1
                
                # Recursively analyze subdirectories if within max depth
                if currentDepth < maxDepth:
                    try:
                        sub_analysis = _analyze_directory(item_path, maxDepth, currentDepth + 1)
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
    
    # Analyze directory
    analysis = _analyze_directory(directory, maxDepth)
    
    # Calculate totals
    total_size = analysis.totalSize
    total_files = analysis.fileCount
    total_directories = analysis.directoryCount
    
    elapsed = (datetime.now() - start_time).total_seconds()
    scan_duration_ms = int(elapsed * 1000)
    
    result = DiskAnalysisResult(
        rootPath=directory,
        totalSize=total_size,
        fileCount=total_files,
        directoryCount=total_directories,
        analysis=analysis,
        scanDurationMs=scan_duration_ms,
    )
    
    logger.info(f"Disk analysis completed in {elapsed:.2f}s: {total_files} files, {total_directories} directories, {total_size / 1024 / 1024:.1f} MB")
    
    return {
        'rootPath': result.rootPath,
        'totalSize': result.totalSize,
        'fileCount': result.fileCount,
        'directoryCount': result.directoryCount,
        'scanDurationMs': result.scanDurationMs,
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
    }
