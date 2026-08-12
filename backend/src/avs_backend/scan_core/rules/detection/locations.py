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
            
            return asset_parts[:len(root_parts)] == root_parts
        except Exception:
            # Fallback to string comparison
            asset_lower = asset_path.lower().replace('/', '\\')
            root_lower = str(root_path).lower().replace('/', '\\')
            
            # Ensure root ends with separator for accurate matching
            if not root_lower.endswith('\\'):
                root_lower += '\\'
            
            return asset_lower.startswith(root_lower) or asset_lower == root_lower.rstrip('\\')
    
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
            if not KnownLocations.is_under_path(asset_path, KnownLocations.get_thumbnail_cache_root()):
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
            r"%SystemRoot%\System32",
            r"%SystemRoot%\SysWOW64",
            r"%SystemRoot%\WinSxS",
            r"%ProgramFiles%",
            r"%ProgramFiles(x86)%",
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
    def is_in_protected_location(asset_path: str) -> bool:
        """
        Check if asset is in a protected location.
        
        This is a conservative safety check.
        
        Args:
            asset_path: Asset canonical path
        
        Returns:
            True if asset appears to be in protected location
        """
        for protected_root in KnownLocations.get_protected_roots():
            if KnownLocations.is_under_path(asset_path, protected_root):
                return True
        
        return False
