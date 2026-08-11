"""
Data models for the Scan Core Windows Enumerator.

These dataclasses are deliberately decoupled from all existing modules.
They describe only what exists on the Windows system — not what should
be done about it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional, Union

from ..utils.path_utils import asset_name as _asset_name, asset_directory as _asset_directory, asset_extension as _asset_extension


class WindowsAssetType(Enum):
    """Type of Windows asset discovered by the enumerator."""
    SERVICE = "service"
    DRIVER = "driver"
    SCHEDULED_TASK = "scheduled_task"
    INSTALLED_PROGRAM = "installed_program"
    INSTALLED_UPDATE = "installed_update"
    WINDOWS_FEATURE = "windows_feature"
    SECURITY = "security"
    SYSTEM = "system"
    NETWORK_ADAPTER = "network_adapter"
    RESTORE_POINT = "restore_point"
    EVENT_LOG = "event_log"
    POWER_PLAN = "power_plan"
    ENVIRONMENT = "environment"


# ── Base protocol ──────────────────────────────────────────────

class WindowsAsset:
    """Base protocol — all asset dataclasses have these properties."""
    @property
    def asset_type(self) -> WindowsAssetType:
        raise NotImplementedError

    @property
    def asset_name(self) -> str:
        raise NotImplementedError

    @property
    def asset_path(self) -> str:
        return ""


# ── Service ────────────────────────────────────────────────────

@dataclass(frozen=True, slots=True)
class ServiceAsset:
    """A Windows service discovered on the system."""
    service_name: str
    display_name: str
    status: str  # Running, Stopped, Paused
    startup_type: str  # Auto, Manual, Disabled, Delayed-Auto
    binary_path: str
    service_account: str
    dependencies: tuple[str, ...]
    description: str
    pid: Optional[int]
    asset_type: WindowsAssetType = WindowsAssetType.SERVICE

    @property
    def asset_name(self) -> str:
        return self.display_name or self.service_name

    @property
    def asset_path(self) -> str:
        return self.binary_path

    @property
    def asset_directory(self) -> str:
        return _asset_directory(self.binary_path)

    @property
    def asset_extension(self) -> str:
        return _asset_extension(self.binary_path)

    @property
    def is_running(self) -> bool:
        return self.status.lower() == "running"


# ── Driver ─────────────────────────────────────────────────────

@dataclass(frozen=True, slots=True)
class DriverAsset:
    """A device driver discovered on the system."""
    driver_name: str
    provider: str
    version: str
    path: str
    driver_type: str  # Kernel, File System, Adapter, Recognizer
    state: str  # Running, Stopped, Paused
    start_mode: str  # Auto, Manual, Disabled, Boot, System
    asset_type: WindowsAssetType = WindowsAssetType.DRIVER

    @property
    def asset_name(self) -> str:
        return self.driver_name

    @property
    def asset_path(self) -> str:
        return self.path

    @property
    def asset_directory(self) -> str:
        return _asset_directory(self.path)

    @property
    def asset_extension(self) -> str:
        return _asset_extension(self.path)


# ── Scheduled Task ─────────────────────────────────────────────

@dataclass(frozen=True, slots=True)
class ScheduledTaskAsset:
    """A scheduled task discovered on the system."""
    task_name: str
    task_folder: str
    enabled: bool
    last_run_time: Optional[float]
    next_run_time: Optional[float]
    trigger_count: int
    action_count: int
    principal: str
    asset_type: WindowsAssetType = WindowsAssetType.SCHEDULED_TASK

    @property
    def asset_name(self) -> str:
        return self.task_name

    @property
    def asset_path(self) -> str:
        return f"{self.task_folder}\\{self.task_name}"

    @property
    def last_run_datetime(self) -> Optional[datetime]:
        if self.last_run_time is None:
            return None
        return datetime.fromtimestamp(self.last_run_time)

    @property
    def next_run_datetime(self) -> Optional[datetime]:
        if self.next_run_time is None:
            return None
        return datetime.fromtimestamp(self.next_run_time)


# ── Installed Program ──────────────────────────────────────────

@dataclass(frozen=True, slots=True)
class InstalledProgramAsset:
    """An installed program or update discovered on the system."""
    display_name: str
    publisher: str
    version: str
    install_date: str
    install_location: str
    estimated_size: int  # in KB
    registry_source: str  # HKLM\..., HKCU\...
    architecture: str  # x86, x64, ARM64
    is_update: bool
    is_feature: bool
    asset_type: WindowsAssetType = WindowsAssetType.INSTALLED_PROGRAM

    @property
    def asset_name(self) -> str:
        return self.display_name

    @property
    def asset_path(self) -> str:
        return self.install_location

    @property
    def asset_directory(self) -> str:
        return _asset_directory(self.install_location)

    @property
    def size_mb(self) -> float:
        return self.estimated_size / 1024.0


# ── Security ───────────────────────────────────────────────────

@dataclass(frozen=True, slots=True)
class SecurityAsset:
    """A Windows security-related asset (Defender, Firewall, SmartScreen, etc.)."""
    security_type: str  # Defender, Firewall, SmartScreen, BitLocker, etc.
    name: str
    status: str  # Enabled, Disabled, Unknown
    details: str
    is_enabled: bool
    asset_type: WindowsAssetType = WindowsAssetType.SECURITY

    @property
    def asset_name(self) -> str:
        return self.name

    @property
    def asset_path(self) -> str:
        return ""


# ── Restore Point ──────────────────────────────────────────────

@dataclass(frozen=True, slots=True)
class RestorePointAsset:
    """A system restore point discovered on the system."""
    description: str
    creation_time: float
    sequence_number: int
    asset_type: WindowsAssetType = WindowsAssetType.RESTORE_POINT

    @property
    def asset_name(self) -> str:
        return self.description

    @property
    def asset_path(self) -> str:
        return ""

    @property
    def creation_datetime(self) -> datetime:
        return datetime.fromtimestamp(self.creation_time)


# ── System ─────────────────────────────────────────────────────

@dataclass(frozen=True, slots=True)
class SystemAsset:
    """Windows system information."""
    computer_name: str
    os_version: str
    build_number: str
    edition: str
    architecture: str
    boot_time: float
    uptime_seconds: float
    language: str
    timezone: str
    domain: str
    asset_type: WindowsAssetType = WindowsAssetType.SYSTEM

    @property
    def asset_name(self) -> str:
        return self.computer_name

    @property
    def asset_path(self) -> str:
        return ""

    @property
    def boot_datetime(self) -> datetime:
        return datetime.fromtimestamp(self.boot_time)

    @property
    def uptime_str(self) -> str:
        h = int(self.uptime_seconds // 3600)
        m = int((self.uptime_seconds % 3600) // 60)
        return f"{h}h {m}m"


# ── Network Adapter ────────────────────────────────────────────

@dataclass(frozen=True, slots=True)
class NetworkAdapterAsset:
    """A network adapter discovered on the system."""
    adapter_name: str
    description: str
    mac_address: str
    ipv4_addresses: tuple[str, ...]
    ipv6_addresses: tuple[str, ...]
    default_gateway: str
    dns_servers: tuple[str, ...]
    dhcp_enabled: bool
    state: str  # Up, Down, Disabled
    asset_type: WindowsAssetType = WindowsAssetType.NETWORK_ADAPTER

    @property
    def asset_name(self) -> str:
        return self.adapter_name

    @property
    def asset_path(self) -> str:
        return ""

    @property
    def is_up(self) -> bool:
        return self.state.lower() in ("up", "connected", "enabled")


# ── Statistics ─────────────────────────────────────────────────

@dataclass
class WindowsStatistics:
    """Diagnostics collected during Windows enumeration."""
    services: int = 0
    drivers: int = 0
    tasks: int = 0
    programs: int = 0
    updates: int = 0
    security_assets: int = 0
    restore_points: int = 0
    network_adapters: int = 0
    event_logs: int = 0
    power_plans: int = 0
    environment_vars: int = 0
    errors: int = 0
    skipped: int = 0
    elapsed_seconds: float = 0.0
    assets_per_second: float = 0.0

    @property
    def total_assets(self) -> int:
        return (
            self.services + self.drivers + self.tasks + self.programs +
            self.updates + self.security_assets + self.restore_points +
            self.network_adapters + self.event_logs + self.power_plans +
            self.environment_vars
        )

    def finalize(self, elapsed: float) -> None:
        self.elapsed_seconds = elapsed
        if elapsed > 0:
            self.assets_per_second = self.total_assets / elapsed
