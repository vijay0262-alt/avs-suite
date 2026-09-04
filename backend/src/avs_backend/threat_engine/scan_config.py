"""Centralized scan configuration for AVS AI Shield.

This module provides a single source of truth for scan extensions,
exclusions, and policies. Both the threat engine and one-click scan
import from here to ensure consistent behavior across all scan paths.

Usage:
    from avs_backend.threat_engine.scan_config import (
        SCAN_EXTENSIONS, SKIP_EXTENSIONS, EXCLUDE_PATHS,
        MAX_FILE_SIZE, MAX_DEPTH, should_scan_file, is_excluded_path,
    )
"""
from __future__ import annotations

import os
from typing import Any

# ─── File extensions to scan ─────────────────────────────────────────
# Security-relevant file types that may contain malware.
SCAN_EXTENSIONS: frozenset[str] = frozenset({
    # Executables
    ".exe", ".dll", ".sys", ".scr", ".ocx", ".com", ".pif",
    # Scripts
    ".bat", ".cmd", ".ps1", ".vbs", ".js", ".jse", ".wsf", ".wsh", ".hta",
    # Installers
    ".msi", ".msp", ".mst", ".cpl", ".inf",
    # Shortcuts
    ".lnk",
    # Java
    ".jar", ".class",
    # Python / Ruby / Perl / Shell
    ".py", ".pyw", ".rb", ".pl", ".sh",
    # Mobile
    ".apk", ".appx", ".msix",
    # Archives
    ".zip", ".rar", ".7z", ".cab", ".tar", ".gz", ".iso", ".img",
    # Documents (including macro-enabled)
    ".doc", ".xls", ".ppt", ".docm", ".xlsm", ".pptm",
    # Other potentially dangerous formats
    ".pdf", ".html", ".htm", ".swf", ".flv",
})

# ─── Extensions to always skip ───────────────────────────────────────
# Not security-relevant — scanning these wastes time.
SKIP_EXTENSIONS: frozenset[str] = frozenset({
    ".txt", ".log", ".csv", ".json", ".xml", ".css", ".md", ".rst",
    # Media
    ".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv",
    ".mp3", ".wav", ".flac", ".aac", ".ogg",
    # Images
    ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".webp",
    # Temp
    ".tmp", ".temp",
})

# ─── Paths to exclude from scan ──────────────────────────────────────
# System-protected, huge, or not useful to scan.
EXCLUDE_PATHS: frozenset[str] = frozenset({
    r"C:\Windows\WinSxS",
    r"C:\ProgramData\Microsoft\Windows Defender",
    r"C:\$Recycle.Bin",
    r"C:\System Volume Information",
    r"C:\Windows\assembly",
    r"C:\Windows\Installer",
})

# ─── Scan limits ─────────────────────────────────────────────────────
MAX_FILE_SIZE: int = 100 * 1024 * 1024  # 100 MB
MAX_DEPTH: int = 12


def should_scan_file(file_path: str) -> bool:
    """Check if a file should be scanned based on extension.

    Returns True if the extension is in SCAN_EXTENSIONS and not in
    SKIP_EXTENSIONS. SKIP_EXTENSIONS takes priority.
    """
    ext = os.path.splitext(file_path)[1].lower()
    if ext in SKIP_EXTENSIONS:
        return False
    return ext in SCAN_EXTENSIONS


def is_excluded_path(path: str) -> bool:
    """Check if a path should be excluded from scanning.

    Matches case-insensitively against the EXCLUDE_PATHS set.
    """
    path_lower = path.lower()
    for excl in EXCLUDE_PATHS:
        if path_lower.startswith(excl.lower()):
            return True
    return False


def get_scan_config() -> dict[str, Any]:
    """Return the full scan configuration as a dict (for RPC/API use)."""
    return {
        "scan_extensions": sorted(SCAN_EXTENSIONS),
        "skip_extensions": sorted(SKIP_EXTENSIONS),
        "exclude_paths": sorted(EXCLUDE_PATHS),
        "max_file_size": MAX_FILE_SIZE,
        "max_depth": MAX_DEPTH,
    }
