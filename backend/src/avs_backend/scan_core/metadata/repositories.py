"""
Repository Aggregator — SC-7

Convenience module that provides all repositories from a single import.
"""

from .asset_repository import AssetRepository
from .snapshot_repository import SnapshotRepository
from .context_repository import ContextRepository
from .diff_repository import DiffRepository

__all__ = [
    "AssetRepository",
    "SnapshotRepository",
    "ContextRepository",
    "DiffRepository",
]
