"""Concrete cleaner implementations.

Each cleaner sub-classes :class:`~avs_backend.cleaner.scanner_base.BaseCleaner`
and only declares its identity + target roots. All traversal, filtering,
and error handling live in the base class.
"""

import platform

# Only import cleaner classes on Windows
if platform.system() == "Windows":
    from .browser_cache import BrowserCacheCleaner
    from .browser_history import BrowserHistoryCleaner
    from .chkdsk_fragments import ChkdskFragmentsCleaner
    from .crash_dump import CrashDumpCleaner
    from .event_logs import EventLogCleaner
    from .icon_cache import IconCacheCleaner
    from .installer_cache import InstallerCacheCleaner
    from .log_file import LogFileCleaner
    from .office_cache import OfficeCacheCleaner
    from .prefetch import PrefetchCleaner
    from .recent_items import RecentItemsCleaner
    from .recycle_bin import RecycleBinCleaner
    from .shader_cache import ShaderCacheCleaner
    from .thumbnail_cache import ThumbnailCacheCleaner
    from .user_temp import UserTempCleaner
    from .windows_temp import WindowsTempCleaner
    from .windows_update_cache import WindowsUpdateCacheCleaner
else:
    # Stub classes for non-Windows platforms
    BrowserCacheCleaner = None
    BrowserHistoryCleaner = None
    ChkdskFragmentsCleaner = None
    CrashDumpCleaner = None
    EventLogCleaner = None
    IconCacheCleaner = None
    InstallerCacheCleaner = None
    LogFileCleaner = None
    OfficeCacheCleaner = None
    PrefetchCleaner = None
    RecentItemsCleaner = None
    RecycleBinCleaner = None
    ShaderCacheCleaner = None
    ThumbnailCacheCleaner = None
    UserTempCleaner = None
    WindowsTempCleaner = None
    WindowsUpdateCacheCleaner = None


def all_cleaners() -> list:
    """Factory returning the canonical, ordered list of cleaners.

    Order matters: the UI displays them in this order and it drives
    the deterministic execution order of the ScanManager.
    
    On non-Windows platforms, return an empty list since cleaners
    are Windows-specific.
    """
    if platform.system() != "Windows":
        return []
    
    return [
        # Core System & Junk Cleanup
        WindowsTempCleaner(),
        UserTempCleaner(),
        PrefetchCleaner(),
        CrashDumpCleaner(),
        ChkdskFragmentsCleaner(),
        LogFileCleaner(),
        EventLogCleaner(),
        IconCacheCleaner(),
        RecentItemsCleaner(),
        InstallerCacheCleaner(),
        # GPU & Application Caches
        ShaderCacheCleaner(),
        OfficeCacheCleaner(),
        # Browser Cleaning
        BrowserCacheCleaner(),
        BrowserHistoryCleaner(),
        # Other
        RecycleBinCleaner(),
        ThumbnailCacheCleaner(),
        WindowsUpdateCacheCleaner(),
    ]


__all__ = [
    "BrowserCacheCleaner",
    "BrowserHistoryCleaner",
    "ChkdskFragmentsCleaner",
    "CrashDumpCleaner",
    "EventLogCleaner",
    "IconCacheCleaner",
    "InstallerCacheCleaner",
    "LogFileCleaner",
    "OfficeCacheCleaner",
    "PrefetchCleaner",
    "RecentItemsCleaner",
    "RecycleBinCleaner",
    "ShaderCacheCleaner",
    "ThumbnailCacheCleaner",
    "UserTempCleaner",
    "WindowsTempCleaner",
    "WindowsUpdateCacheCleaner",
    "all_cleaners",
]
