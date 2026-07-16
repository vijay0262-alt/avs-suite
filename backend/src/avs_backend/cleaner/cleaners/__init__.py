"""Concrete cleaner implementations.

Each cleaner sub-classes :class:`~avs_backend.cleaner.scanner_base.BaseCleaner`
and only declares its identity + target roots. All traversal, filtering,
and error handling live in the base class.
"""

from .browser_cache import BrowserCacheCleaner
from .crash_dump import CrashDumpCleaner
from .log_file import LogFileCleaner
from .prefetch import PrefetchCleaner
from .recycle_bin import RecycleBinCleaner
from .thumbnail_cache import ThumbnailCacheCleaner
from .user_temp import UserTempCleaner
from .windows_temp import WindowsTempCleaner
from .windows_update_cache import WindowsUpdateCacheCleaner


def all_cleaners() -> list:
    """Factory returning the canonical, ordered list of cleaners.

    Order matters: the UI displays them in this order and it drives
    the deterministic execution order of the ScanManager.
    """
    return [
        WindowsTempCleaner(),
        UserTempCleaner(),
        RecycleBinCleaner(),
        ThumbnailCacheCleaner(),
        PrefetchCleaner(),
        WindowsUpdateCacheCleaner(),
        BrowserCacheCleaner(),
        CrashDumpCleaner(),
        LogFileCleaner(),
    ]


__all__ = [
    "BrowserCacheCleaner",
    "CrashDumpCleaner",
    "LogFileCleaner",
    "PrefetchCleaner",
    "RecycleBinCleaner",
    "ThumbnailCacheCleaner",
    "UserTempCleaner",
    "WindowsTempCleaner",
    "WindowsUpdateCacheCleaner",
    "all_cleaners",
]
