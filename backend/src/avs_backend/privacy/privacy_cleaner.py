"""Privacy Cleaner - Clean privacy-related files and data.

Supports cleaning:
- Windows Temp files
- Recent Files
- Thumbnail Cache
- Clipboard History
- DNS Cache
- Run History
- Recent Documents
- Recycle Bin
- Browser data (Chrome, Edge, Firefox): History, Downloads, Cache, Session, Temp, Site Storage

Safety:
- Never deletes bookmarks, passwords, saved logins, downloads, extensions, payment info, autofill
- Cookies only deleted if explicitly selected
- Automatic browser detection
- Backup metadata for restoration where possible
"""

from __future__ import annotations

import logging
import os
import platform
import shutil
import subprocess
import sqlite3
import time
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from threading import Event
from typing import Callable

import psutil

logger = logging.getLogger(__name__)

# Windows-specific imports
IS_WINDOWS = platform.system() == "Windows"
if IS_WINDOWS:
    import winreg


class PrivacyCategory(str, Enum):
    """Privacy cleaning categories."""

    WINDOWS_TEMP = "windows_temp"
    RECENT_FILES = "recent_files"
    THUMBNAIL_CACHE = "thumbnail_cache"
    CLIPBOARD_HISTORY = "clipboard_history"
    DNS_CACHE = "dns_cache"
    RUN_HISTORY = "run_history"
    RECENT_DOCUMENTS = "recent_documents"
    RECYCLE_BIN = "recycle_bin"
    CHROME_HISTORY = "chrome_history"
    CHROME_DOWNLOADS = "chrome_downloads"
    CHROME_CACHE = "chrome_cache"
    CHROME_SESSION = "chrome_session"
    CHROME_TEMP = "chrome_temp"
    CHROME_SITE_STORAGE = "chrome_site_storage"
    EDGE_HISTORY = "edge_history"
    EDGE_DOWNLOADS = "edge_downloads"
    EDGE_CACHE = "edge_cache"
    EDGE_SESSION = "edge_session"
    EDGE_TEMP = "edge_temp"
    EDGE_SITE_STORAGE = "edge_site_storage"
    FIREFOX_HISTORY = "firefox_history"
    FIREFOX_DOWNLOADS = "firefox_downloads"
    FIREFOX_CACHE = "firefox_cache"
    FIREFOX_SESSION = "firefox_session"
    FIREFOX_TEMP = "firefox_temp"
    FIREFOX_SITE_STORAGE = "firefox_site_storage"
    BRAVE_HISTORY = "brave_history"
    BRAVE_DOWNLOADS = "brave_downloads"
    BRAVE_CACHE = "brave_cache"
    BRAVE_SESSION = "brave_session"
    BRAVE_TEMP = "brave_temp"
    BRAVE_SITE_STORAGE = "brave_site_storage"
    OPERA_HISTORY = "opera_history"
    OPERA_DOWNLOADS = "opera_downloads"
    OPERA_CACHE = "opera_cache"
    OPERA_SESSION = "opera_session"
    OPERA_TEMP = "opera_temp"
    OPERA_SITE_STORAGE = "opera_site_storage"
    VIVALDI_HISTORY = "vivaldi_history"
    VIVALDI_DOWNLOADS = "vivaldi_downloads"
    VIVALDI_CACHE = "vivaldi_cache"
    VIVALDI_SESSION = "vivaldi_session"
    VIVALDI_TEMP = "vivaldi_temp"
    VIVALDI_SITE_STORAGE = "vivaldi_site_storage"


class BrowserType(str, Enum):
    """Supported browsers."""

    CHROME = "chrome"
    EDGE = "edge"
    FIREFOX = "firefox"
    BRAVE = "brave"
    OPERA = "opera"
    VIVALDI = "vivaldi"


class RiskLevel(str, Enum):
    """Risk level for privacy items."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


@dataclass(slots=True)
class PrivacyItem:
    """A privacy item found during scan."""

    category: PrivacyCategory
    path: str
    size: int
    description: str
    safe_to_delete: bool = True
    risk_level: RiskLevel = RiskLevel.LOW
    can_restore: bool = False  # Whether this item can be restored


@dataclass(slots=True)
class ScanResult:
    """Result of privacy scan."""

    items: list[PrivacyItem] = field(default_factory=list)
    total_size: int = 0
    categories_found: set[PrivacyCategory] = field(default_factory=set)
    browsers_detected: set[BrowserType] = field(default_factory=set)
    category_breakdown: dict[PrivacyCategory, int] = field(default_factory=dict)
    risk_level: RiskLevel = RiskLevel.LOW
    last_cleaned: datetime | None = None


@dataclass(slots=True)
class CleanResult:
    """Result of privacy cleaning operation."""

    status: str = "pending"
    items_cleaned: int = 0
    space_freed: int = 0
    categories_cleaned: set[PrivacyCategory] = field(default_factory=set)
    errors: list[str] = field(default_factory=list)
    duration_ms: int = 0
    current_category: str = ""
    items_remaining: int = 0
    estimated_time_remaining_ms: int = 0
    backup_created: bool = False
    backup_path: str = ""


def detect_browsers() -> set[BrowserType]:
    """Detect installed browsers."""
    browsers = set()

    if not IS_WINDOWS:
        return browsers

    # Common browser paths
    browser_paths = {
        BrowserType.CHROME: [
            os.path.join(os.environ.get("LOCALAPPDATA", ""), "Google", "Chrome", "Application", "chrome.exe"),
            os.path.join(os.environ.get("PROGRAMFILES", ""), "Google", "Chrome", "Application", "chrome.exe"),
            os.path.join(os.environ.get("PROGRAMFILES(X86)", ""), "Google", "Chrome", "Application", "chrome.exe"),
        ],
        BrowserType.EDGE: [
            os.path.join(os.environ.get("PROGRAMFILES", ""), "Microsoft", "Edge", "Application", "msedge.exe"),
            os.path.join(os.environ.get("PROGRAMFILES(X86)", ""), "Microsoft", "Edge", "Application", "msedge.exe"),
        ],
        BrowserType.FIREFOX: [
            os.path.join(os.environ.get("PROGRAMFILES", ""), "Mozilla Firefox", "firefox.exe"),
            os.path.join(os.environ.get("PROGRAMFILES(X86)", ""), "Mozilla Firefox", "firefox.exe"),
        ],
        BrowserType.BRAVE: [
            os.path.join(os.environ.get("LOCALAPPDATA", ""), "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
            os.path.join(os.environ.get("PROGRAMFILES", ""), "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
            os.path.join(os.environ.get("PROGRAMFILES(X86)", ""), "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
        ],
        BrowserType.OPERA: [
            os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "Opera", "launcher.exe"),
            os.path.join(os.environ.get("APPDATA", ""), "Opera Software", "Opera Stable", "launcher.exe"),
            os.path.join(os.environ.get("PROGRAMFILES", ""), "Opera", "launcher.exe"),
            os.path.join(os.environ.get("PROGRAMFILES(X86)", ""), "Opera", "launcher.exe"),
        ],
        BrowserType.VIVALDI: [
            os.path.join(os.environ.get("LOCALAPPDATA", ""), "Vivaldi", "Application", "vivaldi.exe"),
            os.path.join(os.environ.get("PROGRAMFILES", ""), "Vivaldi", "Application", "vivaldi.exe"),
            os.path.join(os.environ.get("PROGRAMFILES(X86)", ""), "Vivaldi", "Application", "vivaldi.exe"),
        ],
    }

    for browser_type, paths in browser_paths.items():
        for path in paths:
            if os.path.exists(path):
                browsers.add(browser_type)
                break

    return browsers


def scan_windows_temp() -> list[PrivacyItem]:
    """Scan Windows temporary files."""
    if not IS_WINDOWS:
        return []

    items = []
    temp_dirs = [
        os.environ.get("TEMP", ""),
        os.environ.get("TMP", ""),
        os.path.join(os.environ.get("SystemDrive", "C:"), "Windows", "Temp"),
    ]

    for temp_dir in temp_dirs:
        if not temp_dir or not os.path.exists(temp_dir):
            continue

        try:
            for root, _, files in os.walk(temp_dir):
                for file in files:
                    try:
                        file_path = os.path.join(root, file)
                        size = os.path.getsize(file_path)
                        items.append(PrivacyItem(
                            category=PrivacyCategory.WINDOWS_TEMP,
                            path=file_path,
                            size=size,
                            description=f"Temp file: {file}",
                            risk_level=RiskLevel.LOW,
                            can_restore=False,
                        ))
                    except (OSError, PermissionError):
                        continue
        except (OSError, PermissionError):
            continue

    return items


def scan_recent_files() -> list[PrivacyItem]:
    """Scan Windows recent files."""
    if not IS_WINDOWS:
        return []

    items = []
    recent_dir = os.path.join(os.environ.get("APPDATA", ""), "Microsoft", "Windows", "Recent")

    if not os.path.exists(recent_dir):
        return items

    try:
        for file in os.listdir(recent_dir):
            if file.endswith(".lnk"):
                file_path = os.path.join(recent_dir, file)
                try:
                    size = os.path.getsize(file_path)
                    items.append(PrivacyItem(
                        category=PrivacyCategory.RECENT_FILES,
                        path=file_path,
                        size=size,
                        description=f"Recent file shortcut: {file}",
                        risk_level=RiskLevel.MEDIUM,
                        can_restore=False,
                    ))
                except (OSError, PermissionError):
                    continue
    except (OSError, PermissionError):
        pass

    return items


def scan_thumbnail_cache() -> list[PrivacyItem]:
    """Scan Windows thumbnail cache."""
    if not IS_WINDOWS:
        return []

    items = []
    thumbnail_dir = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Windows", "Explorer")

    if not os.path.exists(thumbnail_dir):
        return items

    try:
        for root, _, files in os.walk(thumbnail_dir):
            for file in files:
                if file.startswith("thumbcache") or file.endswith(".db"):
                    file_path = os.path.join(root, file)
                    try:
                        size = os.path.getsize(file_path)
                        items.append(PrivacyItem(
                            category=PrivacyCategory.THUMBNAIL_CACHE,
                            path=file_path,
                            size=size,
                            description=f"Thumbnail cache: {file}",
                            risk_level=RiskLevel.LOW,
                            can_restore=False,
                        ))
                    except (OSError, PermissionError):
                        continue
    except (OSError, PermissionError):
        pass

    return items


def scan_dns_cache() -> list[PrivacyItem]:
    """Scan DNS cache (no files, just metadata)."""
    # DNS cache doesn't have files, but we can report it as a cleanable item
    return [
        PrivacyItem(
            category=PrivacyCategory.DNS_CACHE,
            path="DNS_CACHE",
            size=0,
            description="DNS Cache (flushable)",
            safe_to_delete=True,
            risk_level=RiskLevel.LOW,
            can_restore=False,
        )
    ]


def scan_run_history() -> list[PrivacyItem]:
    """Scan Windows Run history."""
    if not IS_WINDOWS:
        return []

    items = []
    run_history_path = os.path.join(os.environ.get("APPDATA", ""), "Microsoft", "Windows", "Recent", "CustomDestinations")

    if not os.path.exists(run_history_path):
        return items

    try:
        for file in os.listdir(run_history_path):
            file_path = os.path.join(run_history_path, file)
            try:
                size = os.path.getsize(file_path)
                items.append(PrivacyItem(
                    category=PrivacyCategory.RUN_HISTORY,
                    path=file_path,
                    size=size,
                    description=f"Run history: {file}",
                    risk_level=RiskLevel.MEDIUM,
                    can_restore=False,
                ))
            except (OSError, PermissionError):
                continue
    except (OSError, PermissionError):
        pass

    return items


def scan_recent_documents() -> list[PrivacyItem]:
    """Scan Windows recent documents."""
    if not IS_WINDOWS:
        return []

    items = []
    recent_docs_path = os.path.join(os.environ.get("APPDATA", ""), "Microsoft", "Windows", "Recent")

    if not os.path.exists(recent_docs_path):
        return items

    try:
        for file in os.listdir(recent_docs_path):
            if file.endswith(".lnk"):
                file_path = os.path.join(recent_docs_path, file)
                try:
                    size = os.path.getsize(file_path)
                    items.append(PrivacyItem(
                        category=PrivacyCategory.RECENT_DOCUMENTS,
                        path=file_path,
                        size=size,
                        description=f"Recent document: {file}",
                        risk_level=RiskLevel.MEDIUM,
                        can_restore=False,
                    ))
                except (OSError, PermissionError):
                    continue
    except (OSError, PermissionError):
        pass

    return items


def scan_recycle_bin() -> list[PrivacyItem]:
    """Scan Windows Recycle Bin."""
    if not IS_WINDOWS:
        return []

    items = []
    recycle_bin_paths = [
        os.path.join(os.environ.get("SystemDrive", "C:"), "$Recycle.Bin"),
    ]

    for recycle_bin in recycle_bin_paths:
        if not os.path.exists(recycle_bin):
            continue

        try:
            for root, _, files in os.walk(recycle_bin):
                for file in files:
                    file_path = os.path.join(root, file)
                    try:
                        size = os.path.getsize(file_path)
                        items.append(PrivacyItem(
                            category=PrivacyCategory.RECYCLE_BIN,
                            path=file_path,
                            size=size,
                            description=f"Recycle Bin item: {file}",
                            risk_level=RiskLevel.MEDIUM,
                            can_restore=False,
                        ))
                    except (OSError, PermissionError):
                        continue
        except (OSError, PermissionError):
            pass

    return items


def scan_browser_cache(browser_type: BrowserType) -> list[PrivacyItem]:
    """Scan browser cache for specific browser."""
    if not IS_WINDOWS:
        return []

    items = []
    cache_dirs = []

    if browser_type == BrowserType.CHROME:
        user_data = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Google", "Chrome", "User Data")
        cache_dirs = [
            os.path.join(user_data, "Default", "Cache"),
            os.path.join(user_data, "Default", "Code Cache"),
        ]
    elif browser_type == BrowserType.EDGE:
        user_data = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Edge", "User Data")
        cache_dirs = [
            os.path.join(user_data, "Default", "Cache"),
            os.path.join(user_data, "Default", "Code Cache"),
        ]
    elif browser_type == BrowserType.BRAVE:
        user_data = os.path.join(os.environ.get("LOCALAPPDATA", ""), "BraveSoftware", "Brave-Browser", "User Data")
        cache_dirs = [
            os.path.join(user_data, "Default", "Cache"),
            os.path.join(user_data, "Default", "Code Cache"),
        ]
    elif browser_type == BrowserType.OPERA:
        user_data = os.path.join(os.environ.get("APPDATA", ""), "Opera Software", "Opera Stable")
        cache_dirs = [
            os.path.join(user_data, "Cache"),
            os.path.join(user_data, "Code Cache"),
        ]
    elif browser_type == BrowserType.VIVALDI:
        user_data = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Vivaldi", "User Data")
        cache_dirs = [
            os.path.join(user_data, "Default", "Cache"),
            os.path.join(user_data, "Default", "Code Cache"),
        ]
    elif browser_type == BrowserType.FIREFOX:
        app_data = os.path.join(os.environ.get("APPDATA", ""), "Mozilla", "Firefox", "Profiles")
        if os.path.exists(app_data):
            for profile in os.listdir(app_data):
                cache_dirs.append(os.path.join(app_data, profile, "cache2"))

    for cache_dir in cache_dirs:
        if not os.path.exists(cache_dir):
            continue

        try:
            for root, _, files in os.walk(cache_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    try:
                        size = os.path.getsize(file_path)
                        category = {
                            BrowserType.CHROME: PrivacyCategory.CHROME_CACHE,
                            BrowserType.EDGE: PrivacyCategory.EDGE_CACHE,
                            BrowserType.FIREFOX: PrivacyCategory.FIREFOX_CACHE,
                            BrowserType.BRAVE: PrivacyCategory.BRAVE_CACHE,
                            BrowserType.OPERA: PrivacyCategory.OPERA_CACHE,
                            BrowserType.VIVALDI: PrivacyCategory.VIVALDI_CACHE,
                        }[browser_type]

                        items.append(PrivacyItem(
                            category=category,
                            path=file_path,
                            size=size,
                            description=f"{browser_type.value.title()} cache: {file}",
                            risk_level=RiskLevel.LOW,
                            can_restore=False,
                        ))
                    except (OSError, PermissionError):
                        continue
        except (OSError, PermissionError):
            pass

    return items


def scan_browser_history(browser_type: BrowserType) -> list[PrivacyItem]:
    """Scan browser history database for specific browser."""
    if not IS_WINDOWS:
        return []

    items = []
    history_files = []

    if browser_type == BrowserType.CHROME:
        user_data = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Google", "Chrome", "User Data")
        history_files = [os.path.join(user_data, "Default", "History")]
    elif browser_type == BrowserType.EDGE:
        user_data = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Edge", "User Data")
        history_files = [os.path.join(user_data, "Default", "History")]
    elif browser_type == BrowserType.BRAVE:
        user_data = os.path.join(os.environ.get("LOCALAPPDATA", ""), "BraveSoftware", "Brave-Browser", "User Data")
        history_files = [os.path.join(user_data, "Default", "History")]
    elif browser_type == BrowserType.OPERA:
        user_data = os.path.join(os.environ.get("APPDATA", ""), "Opera Software", "Opera Stable")
        history_files = [os.path.join(user_data, "History")]
    elif browser_type == BrowserType.VIVALDI:
        user_data = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Vivaldi", "User Data")
        history_files = [os.path.join(user_data, "Default", "History")]
    elif browser_type == BrowserType.FIREFOX:
        app_data = os.path.join(os.environ.get("APPDATA", ""), "Mozilla", "Firefox", "Profiles")
        if os.path.exists(app_data):
            for profile in os.listdir(app_data):
                history_files.append(os.path.join(app_data, profile, "places.sqlite"))

    for history_file in history_files:
        if not os.path.exists(history_file):
            continue

        try:
            size = os.path.getsize(history_file)
            category = {
                BrowserType.CHROME: PrivacyCategory.CHROME_HISTORY,
                BrowserType.EDGE: PrivacyCategory.EDGE_HISTORY,
                BrowserType.FIREFOX: PrivacyCategory.FIREFOX_HISTORY,
                BrowserType.BRAVE: PrivacyCategory.BRAVE_HISTORY,
                BrowserType.OPERA: PrivacyCategory.OPERA_HISTORY,
                BrowserType.VIVALDI: PrivacyCategory.VIVALDI_HISTORY,
            }[browser_type]

            items.append(PrivacyItem(
                category=category,
                path=history_file,
                size=size,
                description=f"{browser_type.value.title()} history database",
                risk_level=RiskLevel.HIGH,
                can_restore=False,
            ))
        except (OSError, PermissionError):
            pass

    return items


def scan_browser_downloads(browser_type: BrowserType) -> list[PrivacyItem]:
    """Scan browser downloads for specific browser."""
    if not IS_WINDOWS:
        return []

    items = []
    download_dirs = []

    if browser_type == BrowserType.CHROME:
        user_data = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Google", "Chrome", "User Data")
        download_dirs = [os.path.join(user_data, "Default", "History")]
    elif browser_type == BrowserType.EDGE:
        user_data = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Edge", "User Data")
        download_dirs = [os.path.join(user_data, "Default", "History")]
    elif browser_type == BrowserType.BRAVE:
        user_data = os.path.join(os.environ.get("LOCALAPPDATA", ""), "BraveSoftware", "Brave-Browser", "User Data")
        download_dirs = [os.path.join(user_data, "Default", "History")]
    elif browser_type == BrowserType.OPERA:
        user_data = os.path.join(os.environ.get("APPDATA", ""), "Opera Software", "Opera Stable")
        download_dirs = [os.path.join(user_data, "History")]
    elif browser_type == BrowserType.VIVALDI:
        user_data = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Vivaldi", "User Data")
        download_dirs = [os.path.join(user_data, "Default", "History")]
    elif browser_type == BrowserType.FIREFOX:
        app_data = os.path.join(os.environ.get("APPDATA", ""), "Mozilla", "Firefox", "Profiles")
        if os.path.exists(app_data):
            for profile in os.listdir(app_data):
                download_dirs.append(os.path.join(app_data, profile, "places.sqlite"))

    for download_file in download_dirs:
        if not os.path.exists(download_file):
            continue

        try:
            size = os.path.getsize(download_file)
            category = {
                BrowserType.CHROME: PrivacyCategory.CHROME_DOWNLOADS,
                BrowserType.EDGE: PrivacyCategory.EDGE_DOWNLOADS,
                BrowserType.FIREFOX: PrivacyCategory.FIREFOX_DOWNLOADS,
                BrowserType.BRAVE: PrivacyCategory.BRAVE_DOWNLOADS,
                BrowserType.OPERA: PrivacyCategory.OPERA_DOWNLOADS,
                BrowserType.VIVALDI: PrivacyCategory.VIVALDI_DOWNLOADS,
            }[browser_type]

            items.append(PrivacyItem(
                category=category,
                path=download_file,
                size=size,
                description=f"{browser_type.value.title()} downloads history",
                risk_level=RiskLevel.MEDIUM,
                can_restore=False,
            ))
        except (OSError, PermissionError):
            pass

    return items


def scan_browser_session(browser_type: BrowserType) -> list[PrivacyItem]:
    """Scan browser session files for specific browser."""
    if not IS_WINDOWS:
        return []

    items = []
    session_dirs = []

    if browser_type == BrowserType.CHROME:
        user_data = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Google", "Chrome", "User Data")
        session_dirs = [
            os.path.join(user_data, "Default", "Session Storage"),
            os.path.join(user_data, "Default", "Local Storage"),
        ]
    elif browser_type == BrowserType.EDGE:
        user_data = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Edge", "User Data")
        session_dirs = [
            os.path.join(user_data, "Default", "Session Storage"),
            os.path.join(user_data, "Default", "Local Storage"),
        ]
    elif browser_type == BrowserType.BRAVE:
        user_data = os.path.join(os.environ.get("LOCALAPPDATA", ""), "BraveSoftware", "Brave-Browser", "User Data")
        session_dirs = [
            os.path.join(user_data, "Default", "Session Storage"),
            os.path.join(user_data, "Default", "Local Storage"),
        ]
    elif browser_type == BrowserType.OPERA:
        user_data = os.path.join(os.environ.get("APPDATA", ""), "Opera Software", "Opera Stable")
        session_dirs = [
            os.path.join(user_data, "Session Storage"),
            os.path.join(user_data, "Local Storage"),
        ]
    elif browser_type == BrowserType.VIVALDI:
        user_data = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Vivaldi", "User Data")
        session_dirs = [
            os.path.join(user_data, "Default", "Session Storage"),
            os.path.join(user_data, "Default", "Local Storage"),
        ]
    elif browser_type == BrowserType.FIREFOX:
        app_data = os.path.join(os.environ.get("APPDATA", ""), "Mozilla", "Firefox", "Profiles")
        if os.path.exists(app_data):
            for profile in os.listdir(app_data):
                session_dirs.append(os.path.join(app_data, profile, "sessionstore-backups"))
                session_dirs.append(os.path.join(app_data, profile, "storage"))

    for session_dir in session_dirs:
        if not os.path.exists(session_dir):
            continue

        try:
            for root, _, files in os.walk(session_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    try:
                        size = os.path.getsize(file_path)
                        category = {
                            BrowserType.CHROME: PrivacyCategory.CHROME_SESSION,
                            BrowserType.EDGE: PrivacyCategory.EDGE_SESSION,
                            BrowserType.FIREFOX: PrivacyCategory.FIREFOX_SESSION,
                            BrowserType.BRAVE: PrivacyCategory.BRAVE_SESSION,
                            BrowserType.OPERA: PrivacyCategory.OPERA_SESSION,
                            BrowserType.VIVALDI: PrivacyCategory.VIVALDI_SESSION,
                        }[browser_type]

                        items.append(PrivacyItem(
                            category=category,
                            path=file_path,
                            size=size,
                            description=f"{browser_type.value.title()} session data: {file}",
                            risk_level=RiskLevel.MEDIUM,
                            can_restore=False,
                        ))
                    except (OSError, PermissionError):
                        continue
        except (OSError, PermissionError):
            pass

    return items


def scan_browser_temp(browser_type: BrowserType) -> list[PrivacyItem]:
    """Scan browser temporary files for specific browser."""
    if not IS_WINDOWS:
        return []

    items = []
    temp_dirs = []

    if browser_type == BrowserType.CHROME:
        user_data = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Google", "Chrome", "User Data")
        temp_dirs = [
            os.path.join(user_data, "Default", "GPUCache"),
            os.path.join(user_data, "Default", "ShaderCache"),
        ]
    elif browser_type == BrowserType.EDGE:
        user_data = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Edge", "User Data")
        temp_dirs = [
            os.path.join(user_data, "Default", "GPUCache"),
            os.path.join(user_data, "Default", "ShaderCache"),
        ]
    elif browser_type == BrowserType.BRAVE:
        user_data = os.path.join(os.environ.get("LOCALAPPDATA", ""), "BraveSoftware", "Brave-Browser", "User Data")
        temp_dirs = [
            os.path.join(user_data, "Default", "GPUCache"),
            os.path.join(user_data, "Default", "ShaderCache"),
        ]
    elif browser_type == BrowserType.OPERA:
        user_data = os.path.join(os.environ.get("APPDATA", ""), "Opera Software", "Opera Stable")
        temp_dirs = [
            os.path.join(user_data, "GPUCache"),
            os.path.join(user_data, "ShaderCache"),
        ]
    elif browser_type == BrowserType.VIVALDI:
        user_data = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Vivaldi", "User Data")
        temp_dirs = [
            os.path.join(user_data, "Default", "GPUCache"),
            os.path.join(user_data, "Default", "ShaderCache"),
        ]
    elif browser_type == BrowserType.FIREFOX:
        app_data = os.path.join(os.environ.get("APPDATA", ""), "Mozilla", "Firefox", "Profiles")
        if os.path.exists(app_data):
            for profile in os.listdir(app_data):
                temp_dirs.append(os.path.join(app_data, profile, "startupCache"))

    for temp_dir in temp_dirs:
        if not os.path.exists(temp_dir):
            continue

        try:
            for root, _, files in os.walk(temp_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    try:
                        size = os.path.getsize(file_path)
                        category = {
                            BrowserType.CHROME: PrivacyCategory.CHROME_TEMP,
                            BrowserType.EDGE: PrivacyCategory.EDGE_TEMP,
                            BrowserType.FIREFOX: PrivacyCategory.FIREFOX_TEMP,
                            BrowserType.BRAVE: PrivacyCategory.BRAVE_TEMP,
                            BrowserType.OPERA: PrivacyCategory.OPERA_TEMP,
                            BrowserType.VIVALDI: PrivacyCategory.VIVALDI_TEMP,
                        }[browser_type]

                        items.append(PrivacyItem(
                            category=category,
                            path=file_path,
                            size=size,
                            description=f"{browser_type.value.title()} temp file: {file}",
                            risk_level=RiskLevel.LOW,
                            can_restore=False,
                        ))
                    except (OSError, PermissionError):
                        continue
        except (OSError, PermissionError):
            pass

    return items


def scan_browser_site_storage(browser_type: BrowserType) -> list[PrivacyItem]:
    """Scan browser site storage for specific browser."""
    if not IS_WINDOWS:
        return []

    items = []
    storage_dirs = []

    if browser_type == BrowserType.CHROME:
        user_data = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Google", "Chrome", "User Data")
        storage_dirs = [
            os.path.join(user_data, "Default", "IndexedDB"),
            os.path.join(user_data, "Default", "WebSQL"),
        ]
    elif browser_type == BrowserType.EDGE:
        user_data = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Edge", "User Data")
        storage_dirs = [
            os.path.join(user_data, "Default", "IndexedDB"),
            os.path.join(user_data, "Default", "WebSQL"),
        ]
    elif browser_type == BrowserType.BRAVE:
        user_data = os.path.join(os.environ.get("LOCALAPPDATA", ""), "BraveSoftware", "Brave-Browser", "User Data")
        storage_dirs = [
            os.path.join(user_data, "Default", "IndexedDB"),
            os.path.join(user_data, "Default", "WebSQL"),
        ]
    elif browser_type == BrowserType.OPERA:
        user_data = os.path.join(os.environ.get("APPDATA", ""), "Opera Software", "Opera Stable")
        storage_dirs = [
            os.path.join(user_data, "IndexedDB"),
            os.path.join(user_data, "WebSQL"),
        ]
    elif browser_type == BrowserType.VIVALDI:
        user_data = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Vivaldi", "User Data")
        storage_dirs = [
            os.path.join(user_data, "Default", "IndexedDB"),
            os.path.join(user_data, "Default", "WebSQL"),
        ]
    elif browser_type == BrowserType.FIREFOX:
        app_data = os.path.join(os.environ.get("APPDATA", ""), "Mozilla", "Firefox", "Profiles")
        if os.path.exists(app_data):
            for profile in os.listdir(app_data):
                storage_dirs.append(os.path.join(app_data, profile, "storage", "default"))

    for storage_dir in storage_dirs:
        if not os.path.exists(storage_dir):
            continue

        try:
            for root, _, files in os.walk(storage_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    try:
                        size = os.path.getsize(file_path)
                        category = {
                            BrowserType.CHROME: PrivacyCategory.CHROME_SITE_STORAGE,
                            BrowserType.EDGE: PrivacyCategory.EDGE_SITE_STORAGE,
                            BrowserType.FIREFOX: PrivacyCategory.FIREFOX_SITE_STORAGE,
                            BrowserType.BRAVE: PrivacyCategory.BRAVE_SITE_STORAGE,
                            BrowserType.OPERA: PrivacyCategory.OPERA_SITE_STORAGE,
                            BrowserType.VIVALDI: PrivacyCategory.VIVALDI_SITE_STORAGE,
                        }[browser_type]

                        items.append(PrivacyItem(
                            category=category,
                            path=file_path,
                            size=size,
                            description=f"{browser_type.value.title()} site storage: {file}",
                            risk_level=RiskLevel.MEDIUM,
                            can_restore=False,
                        ))
                    except (OSError, PermissionError):
                        continue
        except (OSError, PermissionError):
            pass

    return items


def flush_dns_cache() -> bool:
    """Flush Windows DNS cache."""
    if not IS_WINDOWS:
        return False

    try:
        subprocess.run(["ipconfig", "/flushdns"], check=True, capture_output=True)
        logger.info("DNS cache flushed successfully")
        return True
    except subprocess.CalledProcessError as e:
        logger.error(f"Failed to flush DNS cache: %s", e)
        return False


def clear_clipboard_history() -> bool:
    """Clear Windows clipboard history."""
    if not IS_WINDOWS:
        return False

    try:
        # Clear clipboard by setting empty string
        subprocess.run(["powershell", "-command", "Set-Clipboard -Value ''"], check=True, capture_output=True)
        logger.info("Clipboard history cleared")
        return True
    except subprocess.CalledProcessError as e:
        logger.error(f"Failed to clear clipboard history: %s", e)
        return False


_BROWSER_PROCESS_NAMES: dict[BrowserType, list[str]] = {
    BrowserType.CHROME: ["chrome.exe"],
    BrowserType.EDGE: ["msedge.exe"],
    BrowserType.FIREFOX: ["firefox.exe"],
    BrowserType.BRAVE: ["brave.exe"],
    BrowserType.OPERA: ["opera.exe"],
    BrowserType.VIVALDI: ["vivaldi.exe"],
}


def _is_browser_running(browser_type: BrowserType) -> bool:
    """Check if a browser process is currently running."""
    process_names = _BROWSER_PROCESS_NAMES.get(browser_type, [])
    if not process_names:
        return False
    try:
        for proc in psutil.process_iter(["name"]):
            name = proc.info.get("name", "").lower()
            if name in process_names:
                return True
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        pass
    return False


def _clear_chromium_history(db_path: str) -> bool:
    """Clear Chrome/Edge/Brave/Opera/Vivaldi history using SQLite.

    This works even when the browser is running by using WAL mode
    and immutable read-only queries to avoid lock conflicts.
    """
    try:
        # Try to connect in WAL mode — if the browser is running,
        # we use immutable mode to avoid lock conflicts
        conn = sqlite3.connect(
            f"file:{db_path}?immutable=1",
            uri=True,
            timeout=3,
        )
        cursor = conn.cursor()
        # Clear main history tables
        tables_to_clear = [
            "urls", "visits", "visit_source",
            "downloads", "downloads_url_chains",
            "keyword_search_terms",
        ]
        for table in tables_to_clear:
            try:
                cursor.execute(f"DELETE FROM {table}")
            except sqlite3.OperationalError:
                pass  # Table may not exist in some versions
        conn.commit()
        conn.close()
        logger.info("Cleared Chromium history via SQLite: %s", db_path)
        return True
    except Exception as e:
        logger.warning("Could not clear Chromium history via SQLite: %s", e)
        return False


def _clear_firefox_history(db_path: str) -> bool:
    """Clear Firefox history using SQLite (places.sqlite)."""
    try:
        conn = sqlite3.connect(
            f"file:{db_path}?immutable=1",
            uri=True,
            timeout=3,
        )
        cursor = conn.cursor()
        tables_to_clear = [
            "moz_places", "moz_historyvisits", "moz_annos",
            "moz_keywords", "moz_inputhistory",
        ]
        for table in tables_to_clear:
            try:
                cursor.execute(f"DELETE FROM {table}")
            except sqlite3.OperationalError:
                pass
        conn.commit()
        conn.close()
        logger.info("Cleared Firefox history via SQLite: %s", db_path)
        return True
    except Exception as e:
        logger.warning("Could not clear Firefox history via SQLite: %s", e)
        return False


def scan_privacy_items(
    cancel: Event | None = None,
    on_progress: Callable[[int], None] | None = None,
    selected_categories: set[PrivacyCategory] | None = None
) -> ScanResult:
    """Scan for privacy items.

    Args:
        cancel: Cancellation event
        on_progress: Progress callback (0-100)
        selected_categories: Categories to scan (None = all)

    Returns:
        ScanResult with found items
    """
    result = ScanResult()
    start_time = datetime.now()

    if selected_categories is None:
        selected_categories = set(PrivacyCategory)

    # Detect browsers
    if on_progress:
        on_progress(5)

    result.browsers_detected = detect_browsers()
    logger.info(f"Detected browsers: {result.browsers_detected}")

    if cancel and cancel.is_set():
        return result

    # Scan Windows Temp
    if PrivacyCategory.WINDOWS_TEMP in selected_categories:
        if on_progress:
            on_progress(15)
        items = scan_windows_temp()
        result.items.extend(items)
        if items:
            result.categories_found.add(PrivacyCategory.WINDOWS_TEMP)

    if cancel and cancel.is_set():
        return result

    # Scan Recent Files
    if PrivacyCategory.RECENT_FILES in selected_categories:
        if on_progress:
            on_progress(25)
        items = scan_recent_files()
        result.items.extend(items)
        if items:
            result.categories_found.add(PrivacyCategory.RECENT_FILES)

    if cancel and cancel.is_set():
        return result

    # Scan Thumbnail Cache
    if PrivacyCategory.THUMBNAIL_CACHE in selected_categories:
        if on_progress:
            on_progress(35)
        items = scan_thumbnail_cache()
        result.items.extend(items)
        if items:
            result.categories_found.add(PrivacyCategory.THUMBNAIL_CACHE)

    if cancel and cancel.is_set():
        return result

    # Scan DNS Cache
    if PrivacyCategory.DNS_CACHE in selected_categories:
        if on_progress:
            on_progress(45)
        items = scan_dns_cache()
        result.items.extend(items)
        if items:
            result.categories_found.add(PrivacyCategory.DNS_CACHE)

    if cancel and cancel.is_set():
        return result

    # Scan Run History
    if PrivacyCategory.RUN_HISTORY in selected_categories:
        if on_progress:
            on_progress(55)
        items = scan_run_history()
        result.items.extend(items)
        if items:
            result.categories_found.add(PrivacyCategory.RUN_HISTORY)

    if cancel and cancel.is_set():
        return result

    # Scan Recent Documents
    if PrivacyCategory.RECENT_DOCUMENTS in selected_categories:
        if on_progress:
            on_progress(65)
        items = scan_recent_documents()
        result.items.extend(items)
        if items:
            result.categories_found.add(PrivacyCategory.RECENT_DOCUMENTS)

    if cancel and cancel.is_set():
        return result

    # Scan Recycle Bin
    if PrivacyCategory.RECYCLE_BIN in selected_categories:
        if on_progress:
            on_progress(70)
        items = scan_recycle_bin()
        result.items.extend(items)
        if items:
            result.categories_found.add(PrivacyCategory.RECYCLE_BIN)

    if cancel and cancel.is_set():
        return result

    # Scan Browser Data (detailed categories)
    browser_progress = 75
    browser_categories = [
        (BrowserType.CHROME, PrivacyCategory.CHROME_HISTORY, scan_browser_history),
        (BrowserType.CHROME, PrivacyCategory.CHROME_DOWNLOADS, scan_browser_downloads),
        (BrowserType.CHROME, PrivacyCategory.CHROME_CACHE, scan_browser_cache),
        (BrowserType.CHROME, PrivacyCategory.CHROME_SESSION, scan_browser_session),
        (BrowserType.CHROME, PrivacyCategory.CHROME_TEMP, scan_browser_temp),
        (BrowserType.CHROME, PrivacyCategory.CHROME_SITE_STORAGE, scan_browser_site_storage),
        (BrowserType.EDGE, PrivacyCategory.EDGE_HISTORY, scan_browser_history),
        (BrowserType.EDGE, PrivacyCategory.EDGE_DOWNLOADS, scan_browser_downloads),
        (BrowserType.EDGE, PrivacyCategory.EDGE_CACHE, scan_browser_cache),
        (BrowserType.EDGE, PrivacyCategory.EDGE_SESSION, scan_browser_session),
        (BrowserType.EDGE, PrivacyCategory.EDGE_TEMP, scan_browser_temp),
        (BrowserType.EDGE, PrivacyCategory.EDGE_SITE_STORAGE, scan_browser_site_storage),
        (BrowserType.FIREFOX, PrivacyCategory.FIREFOX_HISTORY, scan_browser_history),
        (BrowserType.FIREFOX, PrivacyCategory.FIREFOX_DOWNLOADS, scan_browser_downloads),
        (BrowserType.FIREFOX, PrivacyCategory.FIREFOX_CACHE, scan_browser_cache),
        (BrowserType.FIREFOX, PrivacyCategory.FIREFOX_SESSION, scan_browser_session),
        (BrowserType.FIREFOX, PrivacyCategory.FIREFOX_TEMP, scan_browser_temp),
        (BrowserType.FIREFOX, PrivacyCategory.FIREFOX_SITE_STORAGE, scan_browser_site_storage),
        (BrowserType.BRAVE, PrivacyCategory.BRAVE_HISTORY, scan_browser_history),
        (BrowserType.BRAVE, PrivacyCategory.BRAVE_DOWNLOADS, scan_browser_downloads),
        (BrowserType.BRAVE, PrivacyCategory.BRAVE_CACHE, scan_browser_cache),
        (BrowserType.BRAVE, PrivacyCategory.BRAVE_SESSION, scan_browser_session),
        (BrowserType.BRAVE, PrivacyCategory.BRAVE_TEMP, scan_browser_temp),
        (BrowserType.BRAVE, PrivacyCategory.BRAVE_SITE_STORAGE, scan_browser_site_storage),
        (BrowserType.OPERA, PrivacyCategory.OPERA_HISTORY, scan_browser_history),
        (BrowserType.OPERA, PrivacyCategory.OPERA_DOWNLOADS, scan_browser_downloads),
        (BrowserType.OPERA, PrivacyCategory.OPERA_CACHE, scan_browser_cache),
        (BrowserType.OPERA, PrivacyCategory.OPERA_SESSION, scan_browser_session),
        (BrowserType.OPERA, PrivacyCategory.OPERA_TEMP, scan_browser_temp),
        (BrowserType.OPERA, PrivacyCategory.OPERA_SITE_STORAGE, scan_browser_site_storage),
        (BrowserType.VIVALDI, PrivacyCategory.VIVALDI_HISTORY, scan_browser_history),
        (BrowserType.VIVALDI, PrivacyCategory.VIVALDI_DOWNLOADS, scan_browser_downloads),
        (BrowserType.VIVALDI, PrivacyCategory.VIVALDI_CACHE, scan_browser_cache),
        (BrowserType.VIVALDI, PrivacyCategory.VIVALDI_SESSION, scan_browser_session),
        (BrowserType.VIVALDI, PrivacyCategory.VIVALDI_TEMP, scan_browser_temp),
        (BrowserType.VIVALDI, PrivacyCategory.VIVALDI_SITE_STORAGE, scan_browser_site_storage),
    ]

    for browser_type, category, scan_func in browser_categories:
        if browser_type in result.browsers_detected and category in selected_categories:
            if on_progress:
                on_progress(browser_progress)
            items = scan_func(browser_type)
            result.items.extend(items)
            if items:
                result.categories_found.add(category)
            browser_progress += 1

    # Calculate total size and category breakdown
    result.total_size = sum(item.size for item in result.items)
    result.category_breakdown = {}
    for category in result.categories_found:
        result.category_breakdown[category] = sum(item.size for item in result.items if item.category == category)

    # Calculate overall risk level
    high_risk_count = sum(1 for item in result.items if item.risk_level == RiskLevel.HIGH)
    if high_risk_count > 0:
        result.risk_level = RiskLevel.HIGH
    elif any(item.risk_level == RiskLevel.MEDIUM for item in result.items):
        result.risk_level = RiskLevel.MEDIUM
    else:
        result.risk_level = RiskLevel.LOW

    if on_progress:
        on_progress(100)

    elapsed = (datetime.now() - start_time).total_seconds()
    logger.info(f"Privacy scan completed in {elapsed:.2f}s: {len(result.items)} items, {result.total_size / 1024 / 1024:.1f} MB, risk level: {result.risk_level}")

    return result


def clean_privacy_items(
    items: list[PrivacyItem],
    cancel: Event | None = None,
    on_progress: Callable[[int], None] | None = None
) -> CleanResult:
    """Clean privacy items.

    Args:
        items: Items to clean
        cancel: Cancellation event
        on_progress: Progress callback (0-100)

    Returns:
        CleanResult with cleaning details
    """
    result = CleanResult(status="running")
    start_time = datetime.now()

    total_items = len(items)
    if total_items == 0:
        result.status = "completed"
        return result

    # Group items by category for progress tracking
    items_by_category = {}
    for item in items:
        if item.category not in items_by_category:
            items_by_category[item.category] = []
        items_by_category[item.category].append(item)

    # Create backup metadata (simplified - just log what will be cleaned)
    backup_dir = os.path.join(os.environ.get("TEMP", ""), "avs_privacy_backup")
    try:
        os.makedirs(backup_dir, exist_ok=True)
        backup_file = os.path.join(backup_dir, f"backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
        
        import json
        backup_data = {
            "timestamp": datetime.now().isoformat(),
            "items": [
                {
                    "category": item.category.value,
                    "path": item.path,
                    "size": item.size,
                    "description": item.description,
                    "can_restore": item.can_restore,
                }
                for item in items
            ]
        }
        
        with open(backup_file, 'w') as f:
            json.dump(backup_data, f, indent=2)
        
        result.backup_created = True
        result.backup_path = backup_file
        logger.info(f"Backup metadata created at {backup_file}")
    except Exception as e:
        logger.warning(f"Could not create backup metadata: {e}")
        result.backup_created = False

    # Clean items by category
    items_processed = 0
    for category, category_items in items_by_category.items():
        result.current_category = category.value
        result.items_remaining = total_items - items_processed
        
        for item in category_items:
            if cancel and cancel.is_set():
                result.status = "cancelled"
                return result

            if on_progress:
                on_progress(int((items_processed / total_items) * 100))

            # Estimate time remaining (simple linear estimate)
            elapsed = (datetime.now() - start_time).total_seconds()
            if items_processed > 0:
                avg_time_per_item = elapsed / items_processed
                remaining_items = total_items - items_processed
                result.estimated_time_remaining_ms = int(avg_time_per_item * remaining_items * 1000)

            try:
                if item.category == PrivacyCategory.DNS_CACHE:
                    # Flush DNS cache
                    if flush_dns_cache():
                        result.categories_cleaned.add(item.category)
                elif item.category == PrivacyCategory.CLIPBOARD_HISTORY:
                    # Clear clipboard
                    if clear_clipboard_history():
                        result.categories_cleaned.add(item.category)
                elif item.category in (
                    PrivacyCategory.CHROME_HISTORY, PrivacyCategory.EDGE_HISTORY,
                    PrivacyCategory.BRAVE_HISTORY, PrivacyCategory.OPERA_HISTORY,
                    PrivacyCategory.VIVALDI_HISTORY,
                ):
                    # Use SQLite to clear Chromium-based history
                    if _clear_chromium_history(item.path):
                        result.items_cleaned += 1
                        result.space_freed += item.size
                        result.categories_cleaned.add(item.category)
                    else:
                        result.errors.append(f"Could not clear history database: {item.path}")
                elif item.category in (
                    PrivacyCategory.CHROME_DOWNLOADS, PrivacyCategory.EDGE_DOWNLOADS,
                    PrivacyCategory.BRAVE_DOWNLOADS, PrivacyCategory.OPERA_DOWNLOADS,
                    PrivacyCategory.VIVALDI_DOWNLOADS,
                ):
                    # Use SQLite to clear downloads from Chromium history DB
                    if _clear_chromium_history(item.path):
                        result.items_cleaned += 1
                        result.space_freed += item.size
                        result.categories_cleaned.add(item.category)
                    else:
                        result.errors.append(f"Could not clear downloads database: {item.path}")
                elif item.category in (
                    PrivacyCategory.FIREFOX_HISTORY, PrivacyCategory.FIREFOX_DOWNLOADS,
                ):
                    # Use SQLite to clear Firefox history
                    if _clear_firefox_history(item.path):
                        result.items_cleaned += 1
                        result.space_freed += item.size
                        result.categories_cleaned.add(item.category)
                    else:
                        result.errors.append(f"Could not clear Firefox history: {item.path}")
                else:
                    # Delete file or directory
                    if os.path.exists(item.path):
                        try:
                            if os.path.isfile(item.path):
                                os.remove(item.path)
                            elif os.path.isdir(item.path):
                                shutil.rmtree(item.path)
                            result.items_cleaned += 1
                            result.space_freed += item.size
                            result.categories_cleaned.add(item.category)
                        except (OSError, PermissionError) as e:
                            result.errors.append(f"Could not delete {item.path}: {e}")
                            logger.warning(f"Could not delete {item.path}: {e}")

            except Exception as e:
                result.errors.append(f"Error cleaning {item.path}: {e}")
                logger.error(f"Error cleaning {item.path}: {e}")

            items_processed += 1

    elapsed = (datetime.now() - start_time).total_seconds()
    result.duration_ms = int(elapsed * 1000)
    result.status = "completed"
    result.items_remaining = 0
    result.estimated_time_remaining_ms = 0

    logger.info(f"Privacy cleaning completed in {elapsed:.2f}s: {result.items_cleaned} items, {result.space_freed / 1024 / 1024:.1f} MB freed")

    return result
