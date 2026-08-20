"""
SC-8C2 Known Safe Locations

Read-only reference for known temporary/cache locations.

This module provides location knowledge WITHOUT deletion behavior.
The Rule Engine uses this for detection/classification.
The Action Engine (future) will use this for safe execution.

NO SYSTEM MODIFICATION.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional


class KnownLocations:
    """
    Read-only knowledge base of known safe temporary/cache locations.

    This is NOT a whitelist for automatic deletion.
    This is evidence for rule evaluation.
    """

    # Hardcoded Windows env-var defaults for non-Windows hosts (Linux CI).
    # Used only when the corresponding env var is not set in os.environ.
    _WINDOWS_ENV_DEFAULTS: dict[str, str] = {
        "SystemRoot": r"C:\Windows",
        "ProgramFiles": r"C:\Program Files",
        "ProgramFiles(x86)": r"C:\Program Files (x86)",
        "LOCALAPPDATA": r"C:\Users\User\AppData\Local",
        "APPDATA": r"C:\Users\User\AppData\Roaming",
        "TEMP": r"C:\Users\User\AppData\Local\Temp",
        "TMP": r"C:\Users\User\AppData\Local\Temp",
        "USERPROFILE": r"C:\Users\User",
    }

    @staticmethod
    def expand(template: str) -> Path:
        """
        Expand environment variables in path template.

        On Windows, real env vars are used. On non-Windows hosts
        (e.g. Linux CI), hardcoded defaults are substituted so that
        Windows-style path templates resolve correctly regardless
        of the host OS.
        """
        result = template
        for var, default in KnownLocations._WINDOWS_ENV_DEFAULTS.items():
            placeholder = f"%{var}%"
            if placeholder in result:
                env_val = os.environ.get(var)
                if env_val:
                    result = result.replace(placeholder, env_val)
                else:
                    result = result.replace(placeholder, default)
        result = os.path.expandvars(result)
        return Path(result)

    @staticmethod
    def get_user_temp_roots() -> list[Path]:
        """
        Get known user temporary directories.

        Returns:
            List of user temp directory paths
        """
        seen: set[str] = set()
        roots: list[Path] = []

        if os.name != "nt":
            # On non-Windows (Linux CI, macOS, etc.), use platform temp dirs.
            for candidate in ("/tmp", "/var/tmp", f"/tmp/{os.environ.get('USER', 'user')}"):
                p = Path(candidate)
                key = str(p).lower()
                if key in seen:
                    continue
                seen.add(key)
                roots.append(p)
            return roots

        for candidate in (r"%LOCALAPPDATA%\Temp", r"%TEMP%", r"%TMP%"):
            p = KnownLocations.expand(candidate)
            key = str(p).lower()
            if key in seen:
                continue
            seen.add(key)
            roots.append(p)

        return roots

    @staticmethod
    def get_windows_temp_root() -> Path:
        """
        Get Windows system temporary directory.

        Returns:
            Windows temp directory path
        """
        if os.name != "nt":
            # On non-Windows, there is no equivalent of %SystemRoot%\Temp.
            # Return /var/tmp as the closest analogue (system-wide temp).
            return Path("/var/tmp")
        return KnownLocations.expand(r"%SystemRoot%\Temp")

    @staticmethod
    def get_shader_cache_roots() -> list[Path]:
        """
        Get known GPU shader cache directories.

        These are regenerated automatically by GPU drivers.

        Returns:
            List of shader cache directory paths
        """
        candidates = [
            r"%LOCALAPPDATA%\D3DSCache",
            r"%LOCALAPPDATA%\NVIDIA\DXCache",
            r"%LOCALAPPDATA%\NVIDIA\GLCache",
            r"%LOCALAPPDATA%\NVIDIA\ComputeCache",
            r"%LOCALAPPDATA%\AMD\DxCache",
            r"%LOCALAPPDATA%\AMD\GLCache",
            r"%LOCALAPPDATA%\AMD\DxcCache",
        ]

        roots: list[Path] = []
        for template in candidates:
            p = KnownLocations.expand(template)
            roots.append(p)

        return roots

    @staticmethod
    def get_thumbnail_cache_root() -> Path:
        """
        Get Windows Explorer thumbnail cache directory.

        Returns:
            Thumbnail cache directory path
        """
        return KnownLocations.expand(r"%LOCALAPPDATA%\Microsoft\Windows\Explorer")

    # ── Application Temp Roots ─────────────────────────────────

    @staticmethod
    def get_application_temp_roots() -> list[Path]:
        """
        Get known application-specific temporary directories.

        Only well-known, defensible locations where applications
        explicitly write temporary scratch files. NOT a broad
        AppData catch-all.

        Returns:
            List of application temp directory paths
        """
        candidates = [
            r"%LOCALAPPDATA%\Microsoft\Office\16.0\Temp",
            r"%LOCALAPPDATA%\Microsoft\Office\15.0\Temp",
        ]
        roots: list[Path] = []
        for template in candidates:
            p = KnownLocations.expand(template)
            roots.append(p)
        return roots

    # ── Browser Cache Roots ─────────────────────────────────────

    @staticmethod
    def get_browser_cache_roots() -> list[Path]:
        """
        Get known browser cache directories.

        Reuses location knowledge from BrowserCacheCleaner (SC-3).
        Supports Chrome, Edge, Brave, Opera, Vivaldi, and Firefox.

        Returns:
            List of browser cache directory paths
        """
        candidates: list[str] = [
            r"%LOCALAPPDATA%\Google\Chrome\User Data\Default\Cache",
            r"%LOCALAPPDATA%\Google\Chrome\User Data\Default\Code Cache",
            r"%LOCALAPPDATA%\Google\Chrome\User Data\Default\GPUCache",
            r"%LOCALAPPDATA%\Google\Chrome\User Data\Default\Service Worker\CacheStorage",
            r"%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Cache",
            r"%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Code Cache",
            r"%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\GPUCache",
            r"%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Service Worker\CacheStorage",
            r"%LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data\Default\Cache",
            r"%LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data\Default\Code Cache",
            r"%LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data\Default\GPUCache",
            r"%LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data\Default\Service Worker"
            r"\CacheStorage",
            r"%APPDATA%\Opera Software\Opera Stable\Cache",
            r"%APPDATA%\Opera Software\Opera Stable\Code Cache",
            r"%APPDATA%\Opera Software\Opera Stable\GPUCache",
            r"%APPDATA%\Opera Software\Opera GX Stable\Cache",
            r"%APPDATA%\Opera Software\Opera GX Stable\Code Cache",
            r"%APPDATA%\Opera Software\Opera GX Stable\GPUCache",
            r"%LOCALAPPDATA%\Vivaldi\User Data\Default\Cache",
            r"%LOCALAPPDATA%\Vivaldi\User Data\Default\Code Cache",
            r"%LOCALAPPDATA%\Vivaldi\User Data\Default\GPUCache",
            r"%LOCALAPPDATA%\Vivaldi\User Data\Default\Service Worker\CacheStorage",
        ]

        roots: list[Path] = []
        for template in candidates:
            p = KnownLocations.expand(template)
            roots.append(p)

        # Firefox profile-based cache
        firefox_profiles = KnownLocations.expand(r"%APPDATA%\Mozilla\Firefox\Profiles")
        if firefox_profiles.exists():
            try:
                for entry in os.scandir(firefox_profiles):
                    if entry.is_dir(follow_symlinks=False):
                        cache2 = Path(entry.path) / "cache2"
                        roots.append(cache2)
            except OSError:
                pass

        return roots

    # ── Installer Cache Root ────────────────────────────────────

    @staticmethod
    def get_installer_cache_root() -> Path:
        """
        Get Windows Installer patch cache directory.

        Only the $PatchCache$ subfolder — never the parent
        %SystemRoot%\\Installer which contains critical MSI packages.

        Returns:
            Installer patch cache directory path
        """
        return KnownLocations.expand(r"%SystemRoot%\Installer\$PatchCache$")

    # ── Windows Update Cache Root ───────────────────────────────

    @staticmethod
    def get_windows_update_cache_root() -> Path:
        """
        Get Windows Update download cache directory.

        Downloaded update packages retained after install.

        Returns:
            Windows Update cache directory path
        """
        return KnownLocations.expand(r"%SystemRoot%\SoftwareDistribution\Download")

    # ── Application Cache Roots ─────────────────────────────────

    @staticmethod
    def get_application_cache_roots() -> list[Path]:
        """
        Get known application cache directories.

        Only well-known, defensible cache locations where the
        application explicitly regenerates cached data.

        Returns:
            List of application cache directory paths
        """
        candidates = [
            r"%LOCALAPPDATA%\Microsoft\Office\16.0\OfficeFileCache",
            r"%LOCALAPPDATA%\Microsoft\Office\15.0\OfficeFileCache",
            r"%LOCALAPPDATA%\Microsoft\Office\16.0\DocumentCache",
            r"%LOCALAPPDATA%\Microsoft\Office\UnsavedFiles",
        ]
        roots: list[Path] = []
        for template in candidates:
            p = KnownLocations.expand(template)
            roots.append(p)
        return roots

    @staticmethod
    def get_icon_cache_file() -> Path:
        """
        Get the Windows icon cache database file path.

        Returns:
            IconCache.db file path
        """
        return KnownLocations.expand(r"%LOCALAPPDATA%\IconCache.db")

    # ── Recycle Bin Roots ────────────────────────────────────────

    @staticmethod
    def get_recycle_bin_roots() -> list[Path]:
        """
        Get Recycle Bin directory paths on all local drives.

        The Recycle Bin is located at C:\\$Recycle.Bin on the system
        drive, and at D:\\$Recycle.Bin, E:\\$Recycle.Bin, etc. on
        other local fixed volumes.

        Returns:
            List of Recycle Bin directory paths
        """
        roots: list[Path] = []
        if os.name != "nt":
            return roots

        # System drive Recycle Bin
        system_drive = os.environ.get("SystemDrive", "C:")
        roots.append(Path(f"{system_drive}\\$Recycle.Bin"))

        # Other local fixed drives
        try:
            import ctypes
            GetLogicalDrives = ctypes.windll.kernel32.GetLogicalDrives
            bitmask = GetLogicalDrives()
            for i in range(26):
                if bitmask & (1 << i):
                    drive = f"{chr(65 + i)}:"
                    # Skip system drive (already added) and non-fixed drives
                    if drive == system_drive:
                        continue
                    # Check if drive is fixed (DriveType 3)
                    try:
                        GetDriveType = ctypes.windll.kernel32.GetDriveTypeW
                        drive_type = GetDriveType(f"{drive}\\")
                        if drive_type == 3:  # DRIVE_FIXED
                            roots.append(Path(f"{drive}\\$Recycle.Bin"))
                    except Exception:
                        pass
        except Exception:
            pass

        return roots

    # ── Delivery Optimization Cache ──────────────────────────────

    @staticmethod
    def get_delivery_optimization_roots() -> list[Path]:
        """
        Get Windows Delivery Optimization cache directories.

        Delivery Optimization stores downloaded update fragments
        for peer-to-peer distribution. These are safe to clean
        when no active download is in progress.

        Returns:
            List of Delivery Optimization cache directory paths
        """
        candidates = [
            r"%SystemRoot%\SoftwareDistribution\DeliveryOptimization",
            r"%LOCALAPPDATA%\Microsoft\Windows\DeliveryOptimization",
        ]
        roots: list[Path] = []
        for template in candidates:
            p = KnownLocations.expand(template)
            roots.append(p)
        return roots

    # ── Windows Error Reporting / Crash Dump Locations ───────────

    @staticmethod
    def get_crash_dump_roots() -> list[Path]:
        """
        Get Windows Error Reporting and crash dump directories.

        Includes:
        - Windows Error Reporting (WER) report queues and archives
        - Minidump files
        - Live kernel reports

        These are safe to clean when no active diagnostic operation
        is in progress.

        Returns:
            List of crash dump / error reporting directory paths
        """
        candidates = [
            # Windows Error Reporting (WER) — report queue and archive
            r"%PROGRAMDATA%\Microsoft\Windows\WER\ReportQueue",
            r"%PROGRAMDATA%\Microsoft\Windows\WER\ReportArchive",
            r"%PROGRAMDATA%\Microsoft\Windows\WER\Temp",
            # User-level WER
            r"%LOCALAPPDATA%\Microsoft\Windows\WER\ReportQueue",
            r"%LOCALAPPDATA%\Microsoft\Windows\WER\ReportArchive",
            r"%LOCALAPPDATA%\Microsoft\Windows\WER\Temp",
            # Minidump files
            r"%SystemRoot%\Minidump",
            # Live kernel reports
            r"%SystemRoot%\LiveKernelReports",
        ]
        roots: list[Path] = []
        for template in candidates:
            p = KnownLocations.expand(template)
            roots.append(p)
        return roots

    # ── Windows.old (Previous Installation) ──────────────────────

    @staticmethod
    def get_windows_old_root() -> Path:
        """
        Get the Windows.old directory path.

        This directory contains the previous Windows installation
        after an upgrade. It is NOT safe to automatically delete
        because it may be needed for rollback.

        Returns:
            Windows.old directory path
        """
        return Path(r"C:\Windows.old")

    # ── Device Driver Packages ───────────────────────────────────

    @staticmethod
    def get_driver_package_roots() -> list[Path]:
        """
        Get Windows driver package staging directories.

        The FileRepository under System32\\DriverStore contains
        installed driver packages. Only the "stale" driver packages
        (superseded versions) are safe to clean, and only via
        Windows-supported APIs (pnputil). Direct file deletion
        is NOT safe.

        For V1.0 Dashboard automatic cleanup, this provider is
        EXCLUDED — driver cleanup requires Windows API coordination.

        Returns:
            List of driver store paths (for detection only, NOT deletion)
        """
        return [
            KnownLocations.expand(r"%SystemRoot%\System32\DriverStore\FileRepository"),
        ]

    # ── Temporary Extension Helpers ─────────────────────────────

    @staticmethod
    def get_temporary_extensions() -> tuple[str, ...]:
        """
        Get file extensions commonly associated with temporary files.

        These are SUPPORTING evidence only — never sufficient alone.

        Returns:
            Tuple of extensions without leading dot (lowercase)
        """
        return ("tmp", "temp", "cache", "bak", "old", "dmp")

    @staticmethod
    def has_temporary_extension(asset_path: str) -> bool:
        """
        Check if asset has a temporary file extension.

        Args:
            asset_path: Asset canonical path

        Returns:
            True if extension is in the temporary extensions list
        """
        try:
            p = Path(asset_path)
            ext = p.suffix.lstrip(".").lower()
            return ext in KnownLocations.get_temporary_extensions()
        except Exception:
            return False

    # ── Age Helpers ─────────────────────────────────────────────

    @staticmethod
    def get_default_age_threshold_days() -> int:
        """
        Get the default age threshold (in days) for supporting evidence.

        Files older than this in a known temp/cache location get
        an age-based confidence boost. This is NOT a standalone
        classification criterion.

        Returns:
            Default age threshold in days
        """
        return 7

    @staticmethod
    def get_asset_age_days(
        modified_at: Optional[object] = None,
    ) -> Optional[float]:
        """
        Calculate asset age in days from modified_at timestamp.

        Args:
            modified_at: datetime or timestamp (int/float epoch)

        Returns:
            Age in days, or None if not determinable
        """
        from datetime import UTC, datetime

        if modified_at is None:
            return None

        try:
            if isinstance(modified_at, datetime):
                delta = datetime.now(UTC) - modified_at
                return delta.total_seconds() / 86400.0
            elif isinstance(modified_at, (int, float)):
                import time

                now = time.time()
                return (now - float(modified_at)) / 86400.0
        except Exception:
            pass

        return None

    @staticmethod
    def is_asset_old(
        modified_at: Optional[object] = None,
        threshold_days: Optional[int] = None,
    ) -> bool:
        """
        Check if asset is older than the threshold.

        Age is SUPPORTING evidence only — never sufficient alone.

        Args:
            modified_at: datetime or timestamp
            threshold_days: Age threshold in days (default: 7)

        Returns:
            True if asset age exceeds threshold, False otherwise
        """
        if threshold_days is None:
            threshold_days = KnownLocations.get_default_age_threshold_days()

        age = KnownLocations.get_asset_age_days(modified_at)
        if age is None:
            return False
        return age >= threshold_days

    @staticmethod
    def _normalize_windows_path(path: str) -> list[str]:
        """
        Normalize a Windows path into lowercase path components.

        OS-independent — does not rely on pathlib or os.path.
        Handles forward and backward slashes, drive letters, and
        trailing separators.

        Args:
            path: A Windows-style path string.

        Returns:
            List of lowercase path components (no drive letter,
            no separators, no empty elements).
        """
        normalized = path.replace("/", "\\")
        if len(normalized) >= 2 and normalized[1] == ":" and normalized[0].isalpha():
            normalized = normalized[2:]
        normalized = normalized.strip("\\")
        return [p.lower() for p in normalized.split("\\") if p]

    @staticmethod
    def is_under_path(asset_path: str, root_path: Path) -> bool:
        """
        Check if asset path is under a root path.

        Uses OS-independent Windows path normalization so that
        Windows-style paths are compared correctly regardless of
        the host OS (Windows or Linux CI).

        Boundary-safe: ``C:\\WindowsBackup`` is NOT under ``C:\\Windows``
        because the comparison is component-by-component, not substring.

        Args:
            asset_path: Asset canonical path
            root_path: Root directory path

        Returns:
            True if asset is under root
        """
        asset_parts = KnownLocations._normalize_windows_path(asset_path)
        root_parts = KnownLocations._normalize_windows_path(str(root_path))

        if len(asset_parts) < len(root_parts):
            return False

        return asset_parts[: len(root_parts)] == root_parts

    @staticmethod
    def is_thumbnail_cache_file(asset_path: str) -> bool:
        """
        Check if asset is a Windows Explorer thumbnail cache file.

        Args:
            asset_path: Asset canonical path

        Returns:
            True if asset is a thumbnail cache file
        """
        try:
            p = Path(asset_path)
            name_lower = p.name.lower()

            # Check if it's in the thumbnail cache directory
            if not KnownLocations.is_under_path(
                asset_path, KnownLocations.get_thumbnail_cache_root()
            ):
                return False

            # Check if it matches thumbnail cache patterns
            if name_lower.startswith(("thumbcache_", "iconcache_")):
                return name_lower.endswith(".db")

            return False
        except Exception:
            return False

    @staticmethod
    def get_protected_roots() -> list[Path]:
        """
        Get protected system roots that should NOT be classified as junk.

        This is NOT exhaustive - it's a safety check.
        Rules should use SafetyAssessment for proper safety evaluation.

        Includes:
        - Windows system directories (System32, SysWOW64, WinSxS, etc.)
        - Program Files directories
        - Boot/EFI/Recovery partitions
        - System Volume Information
        - User personal data directories
        - AVS Shield installation directories
        """
        protected = [
            # Windows system root itself
            r"%SystemRoot%",
            # Windows system directories
            r"%SystemRoot%\System32",
            r"%SystemRoot%\SysWOW64",
            r"%SystemRoot%\WinSxS",
            r"%SystemRoot%\System32\drivers",
            r"%SystemRoot%\Config",
            r"%SystemRoot%\Boot",
            r"%SystemRoot%\Installer",
            r"%SystemRoot%\Repair",
            r"%SystemRoot%\Registration",
            # Program Files
            r"%ProgramFiles%",
            r"%ProgramFiles(x86)%",
            # AVS Shield installation directories
            r"%ProgramFiles%\AVS Shield",
            r"%ProgramFiles%\AVS Shield Optimizer",
            r"%ProgramFiles(x86)%\AVS Shield",
            r"%ProgramFiles(x86)%\AVS Shield Optimizer",
            r"%LOCALAPPDATA%\Programs\AVS Shield Optimizer",
            # User personal data
            r"%USERPROFILE%\Documents",
            r"%USERPROFILE%\Desktop",
            r"%USERPROFILE%\Downloads",
            r"%USERPROFILE%\Pictures",
            r"%USERPROFILE%\Videos",
            r"%USERPROFILE%\Music",
            # Boot/EFI/Recovery — system-critical, never auto-clean
            r"C:\Boot",
            r"C:\EFI",
            r"C:\Recovery",
            r"C:\System Volume Information",
            r"C:\$Windows.~WS",
            r"C:\$Windows.~BT",
            r"C:\Windows.old",
        ]

        roots: list[Path] = []
        for template in protected:
            try:
                p = KnownLocations.expand(template)
                roots.append(p)
            except Exception:
                continue

        return roots

    @staticmethod
    def get_protected_files() -> list[str]:
        """
        Get protected system files (by name) that must NEVER be deleted.

        These are critical system files that exist at the root of the
        system drive. They are not directories and need special handling.

        Returns:
            List of protected file names (lowercase)
        """
        return [
            "pagefile.sys",
            "hiberfil.sys",
            "swapfile.sys",
            "ntldr",
            "ntdetect.com",
            "bootmgr",
            "bootsect.bak",
            "win.ini",
            "system.ini",
        ]

    @staticmethod
    def is_protected_file(asset_path: str) -> bool:
        """
        Check if asset is a protected system file by name.

        Args:
            asset_path: Asset canonical path

        Returns:
            True if the file name is in the protected files list
        """
        try:
            p = Path(asset_path)
            name_lower = p.name.lower()
            return name_lower in KnownLocations.get_protected_files()
        except Exception:
            return False

    @staticmethod
    def get_protected_exceptions() -> list[Path]:
        """
        Get known-safe subfolders that exist within protected roots.

        These are directories that are under a protected parent but are
        themselves safe to clean. The safety policy must NOT block
        assets in these locations.

        Examples:
            - $PatchCache$ is under %SystemRoot%\\Installer (protected)
              but is safe to clear.

        Returns:
            List of exception paths that are safe despite being
            under a protected root.
        """
        candidates = [
            r"%SystemRoot%\Installer\$PatchCache$",
            r"%SystemRoot%\Temp",
            r"%SystemRoot%\SoftwareDistribution\Download",
            # V1.0: Crash dump directories under %SystemRoot% are safe
            # exceptions — they contain disposable diagnostic data.
            r"%SystemRoot%\Minidump",
            r"%SystemRoot%\LiveKernelReports",
            # V1.0: Delivery Optimization under SoftwareDistribution
            r"%SystemRoot%\SoftwareDistribution\DeliveryOptimization",
        ]
        roots: list[Path] = []
        for template in candidates:
            try:
                p = KnownLocations.expand(template)
                roots.append(p)
            except Exception:
                continue
        return roots

    @staticmethod
    def is_in_protected_location(asset_path: str) -> bool:
        """
        Check if asset is in a protected location.

        This is a conservative safety check. Assets in known-safe
        exception subfolders (e.g. $PatchCache$ under Installer) are
        NOT considered protected.

        Also checks for protected system files by name (pagefile.sys,
        hiberfil.sys, swapfile.sys, etc.) regardless of directory.

        Args:
            asset_path: Asset canonical path

        Returns:
            True if asset appears to be in protected location
        """
        # Check protected files by name first (pagefile.sys, etc.)
        if KnownLocations.is_protected_file(asset_path):
            return True

        # Check exceptions first — if asset is in a known-safe
        # subfolder of a protected root, it is NOT protected.
        for exception_root in KnownLocations.get_protected_exceptions():
            if KnownLocations.is_under_path(asset_path, exception_root):
                return False

        for protected_root in KnownLocations.get_protected_roots():
            if KnownLocations.is_under_path(asset_path, protected_root):
                return True

        return False
