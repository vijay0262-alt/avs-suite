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
    # Email files (scanned for malicious attachments)
    ".eml", ".msg",
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
    # Don't scan our own installation
    os.path.join(os.environ.get("LOCALAPPDATA", ""), "AVS AI Shield"),
})

# ─── Scan limits ─────────────────────────────────────────────────────
MAX_FILE_SIZE: int = 100 * 1024 * 1024  # 100 MB
MAX_DEPTH: int = 12

# ─── Archive / zip-bomb protection ───────────────────────────────────
# Limits to prevent zip-bomb attacks where a small archive contains
# petabytes of data. These are checked before extracting archives.
ARCHIVE_EXTENSIONS: frozenset[str] = frozenset({
    ".zip", ".rar", ".7z", ".cab", ".tar", ".gz", ".tgz", ".bz2",
    ".tar.gz", ".tar.bz2", ".iso", ".img",
})
MAX_ARCHIVE_RECURSION_DEPTH: int = 3       # Max nested archives (archive-in-archive)
MAX_ARCHIVE_EXTRACTION_RATIO: int = 100    # Max extracted size / compressed size ratio
MAX_ARCHIVE_EXTRACTED_SIZE: int = 500 * 1024 * 1024  # 500 MB max extracted size
MAX_ARCHIVE_ENTRIES: int = 10_000          # Max files in a single archive


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
        # Detection source defaults
        "enabled_sources": {
            "hash_blocklist": True,
            "yara": True,
            "amsi": True,
            "heuristic": True,
            "defender": True,
            "behavioral": True,
            "clamav": False,  # Disabled by default, requires bundled ClamAV
            "virustotal": False,  # Requires API key
            "ml_detector": True,  # ML/AI-based detection
        },
        # Scan behavior
        "scan_archives": True,
        "scan_email": True,
        "auto_quarantine": True,
        # Archive / zip-bomb protection
        "max_archive_recursion_depth": MAX_ARCHIVE_RECURSION_DEPTH,
        "max_archive_extraction_ratio": MAX_ARCHIVE_EXTRACTION_RATIO,
        "max_archive_extracted_size": MAX_ARCHIVE_EXTRACTED_SIZE,
        "max_archive_entries": MAX_ARCHIVE_ENTRIES,
        # Quick scan targets (relative to drive root)
        "quick_scan_targets": [
            "Windows\\System32",
            "Windows\\SysWOW64",
            "Program Files",
            "Program Files (x86)",
            "ProgramData",
            "Users\\{user}\\AppData\\Roaming",
            "Users\\{user}\\AppData\\Local",
            "Users\\{user}\\Downloads",
        ],
        # Hash cache settings
        "hash_cache_max_entries": 100_000,
        # Quarantine settings
        "quarantine_expiry_days": 30,
    }


def get_quick_scan_targets() -> list[str]:
    """Get list of directories to scan during a quick scan.

    Replaces {user} with the current username and returns absolute paths.
    """
    import os

    targets: list[str] = []
    config = get_scan_config()
    user = os.environ.get("USERNAME", os.environ.get("USER", ""))
    system_drive = os.environ.get("SystemDrive", "C:")

    for target in config.get("quick_scan_targets", []):
        # Replace {user} placeholder
        target = target.replace("{user}", user)
        # Make absolute path
        if not target.startswith("\\") and not target[1:3] == ":\\":
            target = f"{system_drive}\\{target}"
        if os.path.exists(target):
            targets.append(target)

    return targets


def get_detection_source_defaults() -> dict[str, bool]:
    """Get the default enabled/disabled state for each detection source."""
    return get_scan_config().get("enabled_sources", {})
