"""
Data models for the Scan Core Registry Enumerator.

These dataclasses are deliberately decoupled from the Registry Cleaner,
Security Engine, and all other modules. They describe only what exists
in the registry — not what should be done about it.
"""

from __future__ import annotations

import dataclasses
import sys
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional, Any

from ..utils.path_utils import asset_name as _asset_name, asset_directory as _asset_directory

if sys.platform == "win32":
    import winreg
else:
    winreg = None  # type: ignore[assignment]


class PlatformNotSupported(Exception):
    """Raised when a platform-specific feature is used on an unsupported platform."""
    pass


class RegistryHive(Enum):
    """Root registry hives."""
    HKEY_CLASSES_ROOT = "HKEY_CLASSES_ROOT"
    HKEY_CURRENT_USER = "HKEY_CURRENT_USER"
    HKEY_LOCAL_MACHINE = "HKEY_LOCAL_MACHINE"
    HKEY_USERS = "HKEY_USERS"
    HKEY_CURRENT_CONFIG = "HKEY_CURRENT_CONFIG"

    @property
    def abbrev(self) -> str:
        return {
            RegistryHive.HKEY_CLASSES_ROOT: "HKCR",
            RegistryHive.HKEY_CURRENT_USER: "HKCU",
            RegistryHive.HKEY_LOCAL_MACHINE: "HKLM",
            RegistryHive.HKEY_USERS: "HKU",
            RegistryHive.HKEY_CURRENT_CONFIG: "HKCC",
        }[self]

    @property
    def winreg_constant(self) -> int:
        if winreg is None:
            raise PlatformNotSupported("winreg is only available on Windows")
        return {
            RegistryHive.HKEY_CLASSES_ROOT: winreg.HKEY_CLASSES_ROOT,
            RegistryHive.HKEY_CURRENT_USER: winreg.HKEY_CURRENT_USER,
            RegistryHive.HKEY_LOCAL_MACHINE: winreg.HKEY_LOCAL_MACHINE,
            RegistryHive.HKEY_USERS: winreg.HKEY_USERS,
            RegistryHive.HKEY_CURRENT_CONFIG: winreg.HKEY_CURRENT_CONFIG,
        }[self]


class RegistryValueType(Enum):
    """Windows registry value types."""
    NONE = "REG_NONE"
    SZ = "REG_SZ"
    EXPAND_SZ = "REG_EXPAND_SZ"
    BINARY = "REG_BINARY"
    DWORD = "REG_DWORD"
    DWORD_BIG_ENDIAN = "REG_DWORD_BIG_ENDIAN"
    DWORD_LITTLE_ENDIAN = "REG_DWORD_LITTLE_ENDIAN"
    MULTI_SZ = "REG_MULTI_SZ"
    QWORD = "REG_QWORD"
    QWORD_LITTLE_ENDIAN = "REG_QWORD_LITTLE_ENDIAN"
    LINK = "REG_LINK"
    RESOURCE_LIST = "REG_RESOURCE_LIST"
    FULL_RESOURCE_DESCRIPTOR = "REG_FULL_RESOURCE_DESCRIPTOR"
    RESOURCE_REQUIREMENTS_LIST = "REG_RESOURCE_REQUIREMENTS_LIST"
    UNKNOWN = "UNKNOWN"

    @classmethod
    def from_winreg(cls, type_id: int) -> "RegistryValueType":
        if winreg is None:
            raise PlatformNotSupported("winreg is only available on Windows")
        mapping = {
            winreg.REG_NONE: cls.NONE,
            winreg.REG_SZ: cls.SZ,
            winreg.REG_EXPAND_SZ: cls.EXPAND_SZ,
            winreg.REG_BINARY: cls.BINARY,
            winreg.REG_DWORD: cls.DWORD,
            winreg.REG_DWORD_BIG_ENDIAN: cls.DWORD_BIG_ENDIAN,
            winreg.REG_DWORD_LITTLE_ENDIAN: cls.DWORD_LITTLE_ENDIAN,
            winreg.REG_MULTI_SZ: cls.MULTI_SZ,
            winreg.REG_QWORD: cls.QWORD,
            winreg.REG_QWORD_LITTLE_ENDIAN: cls.QWORD_LITTLE_ENDIAN,
            winreg.REG_LINK: cls.LINK,
            winreg.REG_RESOURCE_LIST: cls.RESOURCE_LIST,
            winreg.REG_FULL_RESOURCE_DESCRIPTOR: cls.FULL_RESOURCE_DESCRIPTOR,
            winreg.REG_RESOURCE_REQUIREMENTS_LIST: cls.RESOURCE_REQUIREMENTS_LIST,
        }
        return mapping.get(type_id, cls.UNKNOWN)


@dataclass(frozen=True, slots=True)
class RegistryValueAsset:
    """A single registry value discovered during enumeration."""

    hive: RegistryHive
    key_path: str
    value_name: str
    value_type: RegistryValueType
    value_data: str
    is_default: bool
    data_size: int

    @property
    def full_path(self) -> str:
        if self.is_default:
            return f"{self.hive.abbrev}\\{self.key_path}\\(Default)"
        return f"{self.hive.abbrev}\\{self.key_path}\\{self.value_name}"

    @property
    def asset_name(self) -> str:
        return self.value_name if not self.is_default else "(Default)"

    @property
    def asset_path(self) -> str:
        return self.full_path


@dataclass(frozen=True, slots=True)
class RegistryKeyAsset:
    """A registry key discovered during enumeration."""

    hive: RegistryHive
    key_path: str
    key_name: str
    subkey_count: int
    value_count: int
    last_write_time: Optional[float]
    depth: int
    parent_path: str
    is_wow6432node: bool
    permission_denied: bool

    @property
    def full_path(self) -> str:
        return f"{self.hive.abbrev}\\{self.key_path}"

    @property
    def asset_name(self) -> str:
        return self.key_name

    @property
    def asset_path(self) -> str:
        return self.full_path

    @property
    def asset_directory(self) -> str:
        return self.parent_path

    @property
    def last_write_datetime(self) -> Optional[datetime]:
        if self.last_write_time is None:
            return None
        return datetime.fromtimestamp(self.last_write_time)

    @property
    def has_values(self) -> bool:
        return self.value_count > 0

    @property
    def has_subkeys(self) -> bool:
        return self.subkey_count > 0


@dataclass
class RegistryStatistics:
    """Diagnostics collected during enumeration."""

    total_keys: int = 0
    total_values: int = 0
    permission_errors: int = 0
    skipped_keys: int = 0
    elapsed_seconds: float = 0.0
    keys_per_second: float = 0.0

    def record_key(self) -> None:
        self.total_keys += 1

    def record_value(self) -> None:
        self.total_values += 1

    def record_permission_error(self) -> None:
        self.permission_errors += 1

    def record_skip(self) -> None:
        self.skipped_keys += 1

    def finalize(self, elapsed: float) -> None:
        self.elapsed_seconds = elapsed
        if elapsed > 0:
            self.keys_per_second = self.total_keys / elapsed
