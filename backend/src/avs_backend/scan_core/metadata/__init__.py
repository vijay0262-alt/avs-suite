"""
Metadata Cache & Persistent Asset Store — SC-7

The persistent memory of the Scan Core.

STORAGE ONLY. NO DECISIONS.

This package stores:
- ScanAsset (permanent asset identity)
- ScanContext (scan execution metadata)
- AssetSnapshot (observed state during scan)
- SnapshotDiff (changes between scans)

The cache does NOT:
- Clean, delete, optimize, repair
- Score, classify, detect malware
- Make security decisions
- Execute rules
- Modify Windows

Those decisions belong to the Rule Engine (SC-8).

Architecture:
  ENUMERATORS → ADAPTERS → SCAN ASSETS → SNAPSHOTS → METADATA CACHE
  
  Later: CACHE → RULE ENGINE → OPTIMIZATION ENGINE → VERIFICATION
"""

from .database import MetadataDatabase, DatabaseConfig
from .asset_repository import AssetRepository
from .snapshot_repository import SnapshotRepository
from .context_repository import ContextRepository
from .diff_repository import DiffRepository
from .queries import MetadataQueries
from .retention import RetentionPolicy, RetentionConfig

__all__ = [
    "MetadataDatabase",
    "DatabaseConfig",
    "AssetRepository",
    "SnapshotRepository",
    "ContextRepository",
    "DiffRepository",
    "MetadataQueries",
    "RetentionPolicy",
    "RetentionConfig",
]
