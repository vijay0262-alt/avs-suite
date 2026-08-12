"""
Scan Context & Asset Snapshot — SC-6C

Separates permanent asset identity from scan-specific observations.

ScanAsset:     WHAT an asset is (permanent identity)
ScanContext:   WHICH scan discovered it (scan metadata)
AssetSnapshot: WHAT was observed during this scan (state at scan time)
SnapshotDiff:  WHAT changed between scans (comparison)

This package defines:
- ScanContext: Scan execution metadata
- AssetSnapshot: Observed asset state during scan
- ScanStatistics: Scan performance metrics
- SnapshotDiff: Comparison between snapshots

No persistent storage. No database. No cache.
Architecture only.
"""

from .scan_context import ScanContext, ScanType, generate_scan_id
from .asset_snapshot import AssetSnapshot, SnapshotState, generate_fingerprint
from .scan_statistics import ScanStatistics, EnumeratorTiming, AdapterTiming
from .snapshot_diff import SnapshotDiff, AssetChange, ChangeType

__all__ = [
    "ScanContext",
    "ScanType",
    "generate_scan_id",
    "AssetSnapshot",
    "SnapshotState",
    "generate_fingerprint",
    "ScanStatistics",
    "EnumeratorTiming",
    "AdapterTiming",
    "SnapshotDiff",
    "AssetChange",
    "ChangeType",
]
