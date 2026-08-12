"""
Snapshot Diff — SC-6C

Compares asset snapshots between scans to detect changes.

NO cleanup logic. NO decisions about clean/delete/repair.
Pure comparison only.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

from .asset_snapshot import AssetSnapshot, SnapshotState


class ChangeType(Enum):
    """Type of change detected between snapshots."""
    ADDED = "added"  # Asset appeared
    REMOVED = "removed"  # Asset disappeared
    CHANGED = "changed"  # Asset modified
    UNCHANGED = "unchanged"  # No changes
    BECAME_INACCESSIBLE = "became_inaccessible"  # Was accessible, now isn't
    BECAME_LOCKED = "became_locked"  # Was unlocked, now locked
    BECAME_AVAILABLE = "became_available"  # Was inaccessible/locked, now available


@dataclass
class AssetChange:
    """Represents a change detected between two snapshots."""
    
    asset_id: str
    change_type: ChangeType
    previous_snapshot: Optional[AssetSnapshot] = None
    current_snapshot: Optional[AssetSnapshot] = None
    
    @property
    def fingerprint_changed(self) -> bool:
        """Check if metadata fingerprint changed."""
        if not self.previous_snapshot or not self.current_snapshot:
            return False
        return self.previous_snapshot.metadata_fingerprint != self.current_snapshot.metadata_fingerprint
    
    @property
    def content_changed(self) -> bool:
        """Check if content fingerprint changed."""
        if not self.previous_snapshot or not self.current_snapshot:
            return False
        prev_fp = self.previous_snapshot.content_fingerprint
        curr_fp = self.current_snapshot.content_fingerprint
        if prev_fp is None or curr_fp is None:
            return False
        return prev_fp != curr_fp
    
    @property
    def size_changed(self) -> bool:
        """Check if size changed."""
        if not self.previous_snapshot or not self.current_snapshot:
            return False
        return self.previous_snapshot.size != self.current_snapshot.size
    
    @property
    def modified_time_changed(self) -> bool:
        """Check if modified time changed."""
        if not self.previous_snapshot or not self.current_snapshot:
            return False
        return self.previous_snapshot.modified_time != self.current_snapshot.modified_time


@dataclass
class SnapshotDiff:
    """
    Comparison result between two sets of snapshots.
    
    Answers: WHAT changed between scans?
    
    NO cleanup logic. Pure comparison only.
    """
    
    # Scan identifiers
    previous_scan_id: str
    current_scan_id: str
    
    # Changes
    added: list[AssetChange] = field(default_factory=list)
    removed: list[AssetChange] = field(default_factory=list)
    changed: list[AssetChange] = field(default_factory=list)
    unchanged: list[AssetChange] = field(default_factory=list)
    became_inaccessible: list[AssetChange] = field(default_factory=list)
    became_locked: list[AssetChange] = field(default_factory=list)
    became_available: list[AssetChange] = field(default_factory=list)
    
    @property
    def total_changes(self) -> int:
        """Get total number of changes."""
        return (
            len(self.added) +
            len(self.removed) +
            len(self.changed) +
            len(self.became_inaccessible) +
            len(self.became_locked) +
            len(self.became_available)
        )
    
    @property
    def has_changes(self) -> bool:
        """Check if any changes detected."""
        return self.total_changes > 0
    
    def to_dict(self) -> dict:
        """Serialize to dictionary."""
        return {
            "previous_scan_id": self.previous_scan_id,
            "current_scan_id": self.current_scan_id,
            "added": [{"asset_id": c.asset_id, "change_type": c.change_type.value} for c in self.added],
            "removed": [{"asset_id": c.asset_id, "change_type": c.change_type.value} for c in self.removed],
            "changed": [{"asset_id": c.asset_id, "change_type": c.change_type.value} for c in self.changed],
            "unchanged": [{"asset_id": c.asset_id, "change_type": c.change_type.value} for c in self.unchanged],
            "became_inaccessible": [{"asset_id": c.asset_id, "change_type": c.change_type.value} for c in self.became_inaccessible],
            "became_locked": [{"asset_id": c.asset_id, "change_type": c.change_type.value} for c in self.became_locked],
            "became_available": [{"asset_id": c.asset_id, "change_type": c.change_type.value} for c in self.became_available],
            "total_changes": self.total_changes,
        }


def compare_snapshots(
    previous: list[AssetSnapshot],
    current: list[AssetSnapshot],
) -> SnapshotDiff:
    """
    Compare two sets of snapshots to detect changes.
    
    Uses dictionary-based lookup for O(n) performance instead of O(n²).
    
    Args:
        previous: Snapshots from previous scan
        current: Snapshots from current scan
    
    Returns:
        SnapshotDiff with detected changes
    """
    # Build index for fast lookup
    prev_by_id = {s.asset_id: s for s in previous}
    curr_by_id = {s.asset_id: s for s in current}
    
    # Extract scan IDs
    prev_scan_id = previous[0].scan_id if previous else ""
    curr_scan_id = current[0].scan_id if current else ""
    
    diff = SnapshotDiff(
        previous_scan_id=prev_scan_id,
        current_scan_id=curr_scan_id,
    )
    
    # Find added assets (in current but not in previous)
    for asset_id, curr_snapshot in curr_by_id.items():
        if asset_id not in prev_by_id:
            diff.added.append(AssetChange(
                asset_id=asset_id,
                change_type=ChangeType.ADDED,
                current_snapshot=curr_snapshot,
            ))
    
    # Find removed assets (in previous but not in current)
    for asset_id, prev_snapshot in prev_by_id.items():
        if asset_id not in curr_by_id:
            diff.removed.append(AssetChange(
                asset_id=asset_id,
                change_type=ChangeType.REMOVED,
                previous_snapshot=prev_snapshot,
            ))
    
    # Find changed/unchanged assets (in both)
    for asset_id in prev_by_id.keys() & curr_by_id.keys():
        prev_snapshot = prev_by_id[asset_id]
        curr_snapshot = curr_by_id[asset_id]
        
        # Check accessibility changes
        if prev_snapshot.accessible and not curr_snapshot.accessible:
            diff.became_inaccessible.append(AssetChange(
                asset_id=asset_id,
                change_type=ChangeType.BECAME_INACCESSIBLE,
                previous_snapshot=prev_snapshot,
                current_snapshot=curr_snapshot,
            ))
        elif not prev_snapshot.locked and curr_snapshot.locked:
            diff.became_locked.append(AssetChange(
                asset_id=asset_id,
                change_type=ChangeType.BECAME_LOCKED,
                previous_snapshot=prev_snapshot,
                current_snapshot=curr_snapshot,
            ))
        elif (not prev_snapshot.accessible or prev_snapshot.locked) and curr_snapshot.accessible and not curr_snapshot.locked:
            diff.became_available.append(AssetChange(
                asset_id=asset_id,
                change_type=ChangeType.BECAME_AVAILABLE,
                previous_snapshot=prev_snapshot,
                current_snapshot=curr_snapshot,
            ))
        # Check if metadata changed
        elif curr_snapshot.has_changed_from(prev_snapshot):
            diff.changed.append(AssetChange(
                asset_id=asset_id,
                change_type=ChangeType.CHANGED,
                previous_snapshot=prev_snapshot,
                current_snapshot=curr_snapshot,
            ))
        else:
            diff.unchanged.append(AssetChange(
                asset_id=asset_id,
                change_type=ChangeType.UNCHANGED,
                previous_snapshot=prev_snapshot,
                current_snapshot=curr_snapshot,
            ))
    
    return diff


def get_changes_by_type(diff: SnapshotDiff, change_type: ChangeType) -> list[AssetChange]:
    """
    Get all changes of a specific type.
    
    Args:
        diff: SnapshotDiff to query
        change_type: Type of change to filter
    
    Returns:
        List of matching changes
    """
    mapping = {
        ChangeType.ADDED: diff.added,
        ChangeType.REMOVED: diff.removed,
        ChangeType.CHANGED: diff.changed,
        ChangeType.UNCHANGED: diff.unchanged,
        ChangeType.BECAME_INACCESSIBLE: diff.became_inaccessible,
        ChangeType.BECAME_LOCKED: diff.became_locked,
        ChangeType.BECAME_AVAILABLE: diff.became_available,
    }
    return mapping.get(change_type, [])
