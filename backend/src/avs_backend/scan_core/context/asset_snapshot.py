"""
Asset Snapshot — SC-6C

Represents the observed state of an asset during a specific scan.

Answers: WHAT did AVS observe about this asset during this scan?

NOT a duplicate of ScanAsset. Stores only observed state.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Optional, Dict, Any
from datetime import datetime, UTC
from enum import Enum


class SnapshotState(Enum):
    """State of an asset during a scan."""
    DISCOVERED = "discovered"  # First time seeing this asset
    CHANGED = "changed"  # Asset exists but state changed
    UNCHANGED = "unchanged"  # Asset exists, no changes
    MISSING = "missing"  # Asset no longer exists
    INACCESSIBLE = "inaccessible"  # Asset exists but cannot be accessed
    LOCKED = "locked"  # Asset is locked by another process
    FAILED = "failed"  # Failed to scan this asset
    DEFERRED = "deferred"  # Scan deferred to later


@dataclass
class AssetSnapshot:
    """
    Observed state of an asset during a specific scan.
    
    Compact representation - stores only what was observed, not the entire ScanAsset.
    """
    
    # Identity (references)
    asset_id: str  # References ScanAsset.asset_id
    scan_id: str  # References ScanContext.scan_id
    
    # Observation
    observed_at: datetime
    
    # State
    state: SnapshotState
    exists: bool
    accessible: bool
    locked: bool
    
    # Observed properties (optional)
    size: Optional[int] = None
    modified_time: Optional[datetime] = None
    
    # Fingerprints
    content_fingerprint: Optional[str] = None  # Hash of file content (if applicable)
    metadata_fingerprint: str = ""  # Hash of observed metadata
    
    # Attributes (compact key-value storage)
    attributes: dict[str, Any] = field(default_factory=dict)
    
    # Schema versioning
    schema_version: int = 1
    
    def __post_init__(self):
        """Generate metadata fingerprint if not provided."""
        if not self.metadata_fingerprint:
            self.metadata_fingerprint = self._generate_metadata_fingerprint()
    
    def _generate_metadata_fingerprint(self) -> str:
        """
        Generate deterministic fingerprint of observed metadata.
        
        Answers: What state was this object in?
        
        Returns:
            SHA-256 hash of metadata (64 hex chars)
        """
        components = [
            str(self.exists),
            str(self.accessible),
            str(self.locked),
            str(self.size) if self.size is not None else "",
            self.modified_time.isoformat() if self.modified_time else "",
            str(sorted(self.attributes.items())),
        ]
        
        combined = "|".join(components)
        return hashlib.sha256(combined.encode()).hexdigest()
    
    def has_changed_from(self, previous: AssetSnapshot) -> bool:
        """
        Check if this snapshot differs from a previous snapshot.
        
        Args:
            previous: Previous snapshot to compare against
        
        Returns:
            True if metadata fingerprints differ
        """
        return self.metadata_fingerprint != previous.metadata_fingerprint
    
    def to_dict(self) -> dict:
        """Serialize to dictionary."""
        return {
            "schema_version": self.schema_version,
            "asset_id": self.asset_id,
            "scan_id": self.scan_id,
            "observed_at": self.observed_at.isoformat() if self.observed_at else None,
            "state": self.state.value,
            "exists": self.exists,
            "accessible": self.accessible,
            "locked": self.locked,
            "size": self.size,
            "modified_time": self.modified_time.isoformat() if self.modified_time else None,
            "content_fingerprint": self.content_fingerprint,
            "metadata_fingerprint": self.metadata_fingerprint,
            "attributes": self.attributes,
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> AssetSnapshot:
        """Deserialize from dictionary."""
        return cls(
            asset_id=data["asset_id"],
            scan_id=data["scan_id"],
            observed_at=datetime.fromisoformat(data["observed_at"]) if data.get("observed_at") else datetime.now(UTC),
            state=SnapshotState(data.get("state", "discovered")),
            exists=data.get("exists", True),
            accessible=data.get("accessible", True),
            locked=data.get("locked", False),
            size=data.get("size"),
            modified_time=datetime.fromisoformat(data["modified_time"]) if data.get("modified_time") else None,
            content_fingerprint=data.get("content_fingerprint"),
            metadata_fingerprint=data.get("metadata_fingerprint", ""),
            attributes=data.get("attributes", {}),
            schema_version=data.get("schema_version", 1),
        )


def generate_fingerprint(data: str) -> str:
    """
    Generate a deterministic fingerprint from data.
    
    Args:
        data: Data to fingerprint
    
    Returns:
        SHA-256 hash (64 hex chars)
    """
    return hashlib.sha256(data.encode()).hexdigest()


def generate_content_fingerprint(content: bytes) -> str:
    """
    Generate a fingerprint of file content.
    
    Args:
        content: File content bytes
    
    Returns:
        SHA-256 hash of content (64 hex chars)
    """
    return hashlib.sha256(content).hexdigest()


def create_snapshot_from_asset(
    asset_id: str,
    scan_id: str,
    exists: bool = True,
    accessible: bool = True,
    locked: bool = False,
    size: Optional[int] = None,
    modified_time: Optional[datetime] = None,
    content_fingerprint: Optional[str] = None,
    attributes: Optional[dict[str, Any]] = None,
) -> AssetSnapshot:
    """
    Create an AssetSnapshot from observed asset properties.
    
    Helper function for creating snapshots during enumeration.
    
    Args:
        asset_id: Asset identifier
        scan_id: Scan identifier
        exists: Whether asset exists
        accessible: Whether asset is accessible
        locked: Whether asset is locked
        size: Asset size in bytes
        modified_time: Last modified time
        content_fingerprint: Optional content hash
        attributes: Additional observed attributes
    
    Returns:
        AssetSnapshot instance
    """
    # Determine state
    if not exists:
        state = SnapshotState.MISSING
    elif locked:
        state = SnapshotState.LOCKED
    elif not accessible:
        state = SnapshotState.INACCESSIBLE
    else:
        state = SnapshotState.DISCOVERED
    
    return AssetSnapshot(
        asset_id=asset_id,
        scan_id=scan_id,
        observed_at=datetime.now(UTC),
        state=state,
        exists=exists,
        accessible=accessible,
        locked=locked,
        size=size,
        modified_time=modified_time,
        content_fingerprint=content_fingerprint,
        attributes=attributes or {},
    )
