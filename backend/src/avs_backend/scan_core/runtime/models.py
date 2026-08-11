"""
Runtime asset models — frozen dataclasses for runtime discovery.

No references to cleaners, UI, or any other module.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Tuple

from ..utils.path_utils import asset_name as _asset_name, asset_directory as _asset_directory, asset_extension as _asset_extension


class RuntimeAssetType(Enum):
    """Types of runtime assets discovered by the enumerator."""
    PROCESS = "process"
    CONNECTION = "connection"
    SESSION = "session"
    LOCKED_FILE = "locked_file"
    RESOURCE_SNAPSHOT = "resource_snapshot"


@dataclass(frozen=True, slots=True)
class ProcessAsset:
    """A running process discovered at runtime."""
    pid: int
    name: str
    parent_pid: Optional[int] = None
    executable_path: str = ""
    command_line: str = ""
    working_directory: str = ""
    username: str = ""
    cpu_percent: float = 0.0
    memory_percent: float = 0.0
    memory_bytes: int = 0
    thread_count: int = 0
    handle_count: int = 0
    status: str = "Unknown"
    creation_time: float = 0.0

    @property
    def asset_type(self) -> RuntimeAssetType:
        return RuntimeAssetType.PROCESS

    @property
    def asset_name(self) -> str:
        return self.name

    @property
    def asset_path(self) -> str:
        return self.executable_path

    @property
    def asset_directory(self) -> str:
        if not self.executable_path:
            return ""
        return _asset_directory(self.executable_path)

    @property
    def asset_extension(self) -> str:
        if not self.executable_path:
            return ""
        return _asset_extension(self.executable_path)

    @property
    def is_running(self) -> bool:
        return self.status.lower() in ("running", "sleeping", "waiting")


@dataclass(frozen=True, slots=True)
class ConnectionAsset:
    """An active network connection discovered at runtime."""
    protocol: str
    local_address: str
    local_port: int
    remote_address: str = ""
    remote_port: int = 0
    state: str = "UNKNOWN"
    pid: Optional[int] = None
    process_name: str = ""

    @property
    def asset_type(self) -> RuntimeAssetType:
        return RuntimeAssetType.CONNECTION

    @property
    def asset_name(self) -> str:
        return f"{self.protocol}:{self.local_address}:{self.local_port}"

    @property
    def asset_path(self) -> str:
        return ""

    @property
    def is_listening(self) -> bool:
        return self.state.upper() in ("LISTEN", "LISTENING")


@dataclass(frozen=True, slots=True)
class SessionAsset:
    """An interactive user session discovered at runtime."""
    session_id: int
    username: str = ""
    domain: str = ""
    session_type: str = ""
    state: str = "Active"
    connect_time: float = 0.0
    idle_time: float = 0.0

    @property
    def asset_type(self) -> RuntimeAssetType:
        return RuntimeAssetType.SESSION

    @property
    def asset_name(self) -> str:
        return self.username or f"Session-{self.session_id}"

    @property
    def asset_path(self) -> str:
        return ""

    @property
    def is_active(self) -> bool:
        return self.state.lower() == "active"


@dataclass(frozen=True, slots=True)
class LockedFileAsset:
    """A file currently in use (locked) discovered at runtime."""
    path: str
    pid: Optional[int] = None
    process_name: str = ""

    @property
    def asset_type(self) -> RuntimeAssetType:
        return RuntimeAssetType.LOCKED_FILE

    @property
    def asset_name(self) -> str:
        return _asset_name(self.path)

    @property
    def asset_path(self) -> str:
        return self.path


@dataclass(frozen=True, slots=True)
class ResourceSnapshot:
    """A point-in-time snapshot of system resource usage."""
    cpu_percent: float = 0.0
    cpu_count: int = 0
    memory_total: int = 0
    memory_used: int = 0
    memory_percent: float = 0.0
    disk_read_bytes: int = 0
    disk_write_bytes: int = 0
    net_sent_bytes: int = 0
    net_recv_bytes: int = 0
    gpu_percent: float = 0.0
    gpu_memory_total: int = 0
    gpu_memory_used: int = 0
    gpu_name: str = ""

    @property
    def asset_type(self) -> RuntimeAssetType:
        return RuntimeAssetType.RESOURCE_SNAPSHOT

    @property
    def asset_name(self) -> str:
        return "ResourceSnapshot"

    @property
    def asset_path(self) -> str:
        return ""

    @property
    def memory_free(self) -> int:
        return self.memory_total - self.memory_used


@dataclass
class RuntimeStatistics:
    """Mutable statistics collected during runtime enumeration."""
    processes: int = 0
    connections: int = 0
    sessions: int = 0
    locked_files: int = 0
    resource_snapshots: int = 0
    permission_errors: int = 0
    skipped: int = 0
    errors: int = 0
    elapsed_seconds: float = 0.0
    assets_per_second: float = 0.0

    @property
    def total_assets(self) -> int:
        return (
            self.processes
            + self.connections
            + self.sessions
            + self.locked_files
            + self.resource_snapshots
        )

    def finalize(self, elapsed: float) -> None:
        self.elapsed_seconds = elapsed
        if elapsed > 0:
            self.assets_per_second = self.total_assets / elapsed
