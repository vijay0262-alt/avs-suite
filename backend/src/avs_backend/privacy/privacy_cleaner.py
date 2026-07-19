"""Privacy Cleaner - Clean privacy-related files and data.

Supports cleaning:
- Windows Temp files
- Recent Files
- Thumbnail Cache
- Clipboard History
- DNS Cache
- Run History
- Recent Documents
- Browser cache (Chrome, Edge, Firefox)

Safety:
- Never deletes bookmarks, passwords, saved logins, downloads
- Cookies only deleted if explicitly selected
- Automatic browser detection
"""

from __future__ import annotations

import logging
import os
import platform
import shutil
import subprocess
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
    CHROME_CACHE = "chrome_cache"
    EDGE_CACHE = "edge_cache"
    FIREFOX_CACHE = "firefox_cache"


class BrowserType(str, Enum):
    """Supported browsers."""

    CHROME = "chrome"
    EDGE = "edge"
    FIREFOX = "firefox"


@dataclass(slots=True)
class PrivacyItem:
    """A privacy item found during scan."""

    category: PrivacyCategory
    path: str
    size: int
    description: str
    safe_to_delete: bool = True


@dataclass(slots=True)
class ScanResult:
    """Result of privacy scan."""

    items: list[PrivacyItem] = field(default_factory=list)
    total_size: int = 0
    categories_found: set[PrivacyCategory] = field(default_factory=set)
    browsers_detected: set[BrowserType] = field(default_factory=set)


@dataclass(slots=True)
class CleanResult:
    """Result of privacy cleaning operation."""

    status: str = "pending"
    items_cleaned: int = 0
    space_freed: int = 0
    categories_cleaned: set[PrivacyCategory] = field(default_factory=set)
    errors: list[str] = field(default_factory=list)
    duration_ms: int = 0


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
                            description=f"Temp file: {file}"
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
                        description=f"Recent file shortcut: {file}"
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
                            description=f"Thumbnail cache: {file}"
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
            safe_to_delete=True
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
                    description=f"Run history: {file}"
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
                        description=f"Recent document: {file}"
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
                        }[browser_type]

                        items.append(PrivacyItem(
                            category=category,
                            path=file_path,
                            size=size,
                            description=f"{browser_type.value.title()} cache: {file}"
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
        logger.error(f"Failed to flush DNS cache: {e}")
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
        logger.error(f"Failed to clear clipboard history: {e}")
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

    # Scan Browser Caches
    browser_progress = 70
    if BrowserType.CHROME in result.browsers_detected and PrivacyCategory.CHROME_CACHE in selected_categories:
        if on_progress:
            on_progress(browser_progress)
        items = scan_browser_cache(BrowserType.CHROME)
        result.items.extend(items)
        if items:
            result.categories_found.add(PrivacyCategory.CHROME_CACHE)
        browser_progress += 10

    if cancel and cancel.is_set():
        return result

    if BrowserType.EDGE in result.browsers_detected and PrivacyCategory.EDGE_CACHE in selected_categories:
        if on_progress:
            on_progress(browser_progress)
        items = scan_browser_cache(BrowserType.EDGE)
        result.items.extend(items)
        if items:
            result.categories_found.add(PrivacyCategory.EDGE_CACHE)
        browser_progress += 10

    if cancel and cancel.is_set():
        return result

    if BrowserType.FIREFOX in result.browsers_detected and PrivacyCategory.FIREFOX_CACHE in selected_categories:
        if on_progress:
            on_progress(browser_progress)
        items = scan_browser_cache(BrowserType.FIREFOX)
        result.items.extend(items)
        if items:
            result.categories_found.add(PrivacyCategory.FIREFOX_CACHE)

    # Calculate total size
    result.total_size = sum(item.size for item in result.items)

    if on_progress:
        on_progress(100)

    elapsed = (datetime.now() - start_time).total_seconds()
    logger.info(f"Privacy scan completed in {elapsed:.2f}s: {len(result.items)} items, {result.total_size / 1024 / 1024:.1f} MB")

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

    for i, item in enumerate(items):
        if cancel and cancel.is_set():
            result.status = "cancelled"
            return result

        if on_progress:
            on_progress(int((i / total_items) * 100))

        try:
            if item.category == PrivacyCategory.DNS_CACHE:
                # Flush DNS cache
                if flush_dns_cache():
                    result.categories_cleaned.add(item.category)
            elif item.category == PrivacyCategory.CLIPBOARD_HISTORY:
                # Clear clipboard
                if clear_clipboard_history():
                    result.categories_cleaned.add(item.category)
            else:
                # Delete file
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

    elapsed = (datetime.now() - start_time).total_seconds()
    result.duration_ms = int(elapsed * 1000)
    result.status = "completed"

    logger.info(f"Privacy cleaning completed in {elapsed:.2f}s: {result.items_cleaned} items, {result.space_freed / 1024 / 1024:.1f} MB freed")

    return result
