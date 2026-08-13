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

    @staticmethod
    def expand(template: str) -> Path:
        """Expand environment variables in path template."""
        return Path(os.path.expandvars(template))

    @staticmethod
    def get_user_temp_roots() -> list[Path]:
        """
        Get known user temporary directories.

        Returns:
            List of user temp directory paths
        """
        seen: set[str] = set()
        roots: list[Path] = []

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
    def is_under_path(asset_path: str, root_path: Path) -> bool:
        """
        Check if asset path is under a root path.

        Args:
            asset_path: Asset canonical path
            root_path: Root directory path

        Returns:
            True if asset is under root
        """
        try:
            asset_p = Path(asset_path)
            root_p = Path(root_path)

            # Normalize paths for comparison (handle case sensitivity on Windows)
            asset_parts = [p.lower() for p in asset_p.parts]
            root_parts = [p.lower() for p in root_p.parts]

            # Check if asset path starts with root path
            if len(asset_parts) < len(root_parts):
                return False

            return asset_parts[: len(root_parts)] == root_parts
        except Exception:
            # Fallback to string comparison
            asset_lower = asset_path.lower().replace("/", "\\")
            root_lower = str(root_path).lower().replace("/", "\\")

            # Ensure root ends with separator for accurate matching
            if not root_lower.endswith("\\"):
                root_lower += "\\"

            return asset_lower.startswith(root_lower) or asset_lower == root_lower.rstrip("\\")

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

        Returns:
            List of protected directory paths
        """
        protected = [
            # Windows system directories
            r"%SystemRoot%\System32",
            r"%SystemRoot%\SysWOW64",
            r"%SystemRoot%\WinSxS",
            r"%SystemRoot%\System32\drivers",
            r"%SystemRoot%\Config",
            r"%SystemRoot%\Boot",
            r"%SystemRoot%\Installer",
            # Program Files
            r"%ProgramFiles%",
            r"%ProgramFiles(x86)%",
            # User personal data
            r"%USERPROFILE%\Documents",
            r"%USERPROFILE%\Desktop",
            r"%USERPROFILE%\Downloads",
            r"%USERPROFILE%\Pictures",
            r"%USERPROFILE%\Videos",
            r"%USERPROFILE%\Music",
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

        Args:
            asset_path: Asset canonical path

        Returns:
            True if asset appears to be in protected location
        """
        # Check exceptions first — if asset is in a known-safe
        # subfolder of a protected root, it is NOT protected.
        for exception_root in KnownLocations.get_protected_exceptions():
            if KnownLocations.is_under_path(asset_path, exception_root):
                return False

        for protected_root in KnownLocations.get_protected_roots():
            if KnownLocations.is_under_path(asset_path, protected_root):
                return True

        return False
