"""
Scan Context — SC-6C

Represents one scan execution with metadata about when, where, and how the scan ran.

Privacy-safe: Uses non-reversible hashes for machine/user identity.
"""

from __future__ import annotations

import hashlib
import platform
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional


class ScanType(Enum):
    """Type of scan performed."""
    FULL = "full"
    QUICK = "quick"
    CUSTOM = "custom"
    INCREMENTAL = "incremental"
    TARGETED = "targeted"


@dataclass
class ScanContext:
    """
    Metadata about a scan execution.
    
    Answers: WHICH scan discovered this asset?
    
    Privacy-safe: Machine and user identifiers are hashed, not stored raw.
    """
    
    # Identity
    scan_id: str
    
    # Timing
    started_at: datetime
    completed_at: Optional[datetime] = None
    
    # Environment
    scanner_version: str = "3.0.0"
    machine_id_hash: str = ""  # SHA-256 hash, not raw machine ID
    user_id_hash: str = ""  # SHA-256 hash, not raw username
    platform: str = ""
    platform_version: str = ""
    
    # Scan configuration
    scan_type: ScanType = ScanType.FULL
    requested_scope: list[str] = field(default_factory=list)
    enumerators_used: list[str] = field(default_factory=list)
    
    # Results
    assets_discovered: int = 0
    assets_failed: int = 0
    assets_skipped: int = 0
    
    # Status
    duration_ms: int = 0
    cancelled: bool = False
    completed: bool = False
    error_count: int = 0
    
    # Schema versioning
    schema_version: int = 1
    
    def __post_init__(self):
        """Initialize computed fields."""
        if not self.platform:
            self.platform = platform.system()
        if not self.platform_version:
            self.platform_version = platform.version()
    
    @property
    def is_running(self) -> bool:
        """Check if scan is currently running."""
        return not self.completed and not self.cancelled
    
    @property
    def is_successful(self) -> bool:
        """Check if scan completed successfully."""
        return self.completed and not self.cancelled and self.error_count == 0
    
    @property
    def duration_seconds(self) -> float:
        """Get duration in seconds."""
        return self.duration_ms / 1000.0
    
    def mark_completed(self) -> None:
        """Mark scan as completed."""
        self.completed = True
        if self.completed_at is None:
            self.completed_at = datetime.utcnow()
        if self.duration_ms == 0 and self.completed_at:
            delta = self.completed_at - self.started_at
            self.duration_ms = int(delta.total_seconds() * 1000)
    
    def mark_cancelled(self) -> None:
        """Mark scan as cancelled."""
        self.cancelled = True
        self.completed = True
        if self.completed_at is None:
            self.completed_at = datetime.utcnow()
    
    def to_dict(self) -> dict:
        """Serialize to dictionary."""
        return {
            "schema_version": self.schema_version,
            "scan_id": self.scan_id,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "scanner_version": self.scanner_version,
            "machine_id_hash": self.machine_id_hash,
            "user_id_hash": self.user_id_hash,
            "platform": self.platform,
            "platform_version": self.platform_version,
            "scan_type": self.scan_type.value,
            "requested_scope": self.requested_scope,
            "enumerators_used": self.enumerators_used,
            "assets_discovered": self.assets_discovered,
            "assets_failed": self.assets_failed,
            "assets_skipped": self.assets_skipped,
            "duration_ms": self.duration_ms,
            "cancelled": self.cancelled,
            "completed": self.completed,
            "error_count": self.error_count,
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> ScanContext:
        """Deserialize from dictionary."""
        return cls(
            scan_id=data["scan_id"],
            started_at=datetime.fromisoformat(data["started_at"]) if data.get("started_at") else datetime.utcnow(),
            completed_at=datetime.fromisoformat(data["completed_at"]) if data.get("completed_at") else None,
            scanner_version=data.get("scanner_version", "3.0.0"),
            machine_id_hash=data.get("machine_id_hash", ""),
            user_id_hash=data.get("user_id_hash", ""),
            platform=data.get("platform", ""),
            platform_version=data.get("platform_version", ""),
            scan_type=ScanType(data.get("scan_type", "full")),
            requested_scope=data.get("requested_scope", []),
            enumerators_used=data.get("enumerators_used", []),
            assets_discovered=data.get("assets_discovered", 0),
            assets_failed=data.get("assets_failed", 0),
            assets_skipped=data.get("assets_skipped", 0),
            duration_ms=data.get("duration_ms", 0),
            cancelled=data.get("cancelled", False),
            completed=data.get("completed", False),
            error_count=data.get("error_count", 0),
            schema_version=data.get("schema_version", 1),
        )


def generate_scan_id() -> str:
    """Generate a unique scan ID."""
    return str(uuid.uuid4())


def generate_machine_id_hash() -> str:
    """
    Generate a privacy-safe machine identifier hash.
    
    Uses platform-specific identifiers but hashes them to prevent
    reverse engineering the actual machine ID.
    
    Returns:
        SHA-256 hash of machine identifier (64 hex chars)
    """
    # Combine multiple platform identifiers
    identifiers = [
        platform.node(),  # Hostname
        platform.machine(),  # Machine type
        platform.processor(),  # Processor
    ]
    
    # Create stable hash
    combined = "|".join(identifiers)
    return hashlib.sha256(combined.encode()).hexdigest()


def generate_user_id_hash(username: Optional[str] = None) -> str:
    """
    Generate a privacy-safe user identifier hash.
    
    Args:
        username: Optional username to hash. If None, uses platform default.
    
    Returns:
        SHA-256 hash of username (64 hex chars), or empty string if unavailable
    """
    if username is None:
        try:
            import getpass
            username = getpass.getuser()
        except Exception:
            return ""
    
    if not username:
        return ""
    
    return hashlib.sha256(username.encode()).hexdigest()
