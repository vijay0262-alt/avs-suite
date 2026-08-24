"""Defender threat discovery engine.

Discovers confirmed threats from Windows Defender as ScanAsset objects
so they can flow through the canonical scan pipeline:

    DiscoveryEngine → ScanAsset → Rule evaluation → Finding → ActionPlan → Execution

This is NOT a parallel scan engine — it is a canonical DiscoveryEngine
implementation that yields assets from the Defender threat information
source. The ScanOrchestrator processes these assets through the same
rule registry, action planner, and remediation coordinator as filesystem
assets.

Performance:
    Defender is queried ONCE at the start of enumerate(). No per-file
    Defender queries are performed. Each confirmed threat becomes a
    single ScanAsset.
"""

from __future__ import annotations

import hashlib
import logging
import os
from datetime import datetime, UTC
from typing import Any, Iterator, Optional

from ..assets import AssetCategory, AssetSource, AssetType, ScanAsset
from ..assets.metadata import AssetMetadata
from ..context import ScanContext
from ..rules.evaluator import CancellationToken
from .defender_integration import (
    DefenderStatus,
    DefenderThreat,
    DefenderThreatInfo,
    get_defender_threat_info,
)

logger = logging.getLogger(__name__)


class DefenderThreatDiscoveryEngine:
    """Discovery engine that yields ScanAssets from Defender threat detections.

    Only active threats (where the file still exists) are yielded as assets.
    Threats that Defender has already quarantined/removed are NOT yielded
    because there is no file to quarantine.

    The DefenderThreatInfo is cached on the engine instance so it can be
    reused by the DefenderConfirmedThreatRule without a second query.
    """

    name: str = "defender"

    def __init__(
        self,
        threat_info_provider: Optional[Any] = None,
    ) -> None:
        """Initialize the discovery engine.

        Args:
            threat_info_provider: Optional callable that returns a
                DefenderThreatInfo. Defaults to get_defender_threat_info.
                Used in tests to inject mock Defender responses.
        """
        self._provider = threat_info_provider or get_defender_threat_info
        self._cached_threat_info: Optional[DefenderThreatInfo] = None

    @property
    def threat_info(self) -> Optional[DefenderThreatInfo]:
        """Return the cached Defender threat info from the last enumerate()."""
        return self._cached_threat_info

    def enumerate(
        self,
        scan_context: ScanContext,
        cancellation_token: CancellationToken,
        on_progress: Optional[Any] = None,
    ) -> Iterator[ScanAsset]:
        """Yield ScanAsset objects for each active Defender threat.

        Only threats where the file still exists on disk are yielded.
        Threats in protected/system locations are still yielded (the
        SafetyGate and path validation handle protection).
        """
        if cancellation_token.is_cancelled:
            return

        # Query Defender ONCE.
        try:
            threat_info = self._provider()
        except Exception as exc:
            logger.warning("Defender threat query failed: %s", exc)
            threat_info = DefenderThreatInfo(
                status=DefenderStatus.QUERY_FAILED,
                reason=str(exc),
            )
        self._cached_threat_info = threat_info

        if not threat_info.is_available:
            logger.info(
                "Defender threat info unavailable: %s — %s",
                threat_info.status.value,
                threat_info.reason,
            )
            return

        for threat in threat_info.threats:
            if cancellation_token.is_cancelled:
                break

            # Only yield threats with a file path that still exists.
            file_path = threat.file_path
            if not file_path:
                continue
            if not os.path.isfile(file_path):
                # File already removed/quarantined by Defender.
                continue

            asset = self._threat_to_asset(threat)
            if asset is not None:
                yield asset

    def _threat_to_asset(self, threat: DefenderThreat) -> Optional[ScanAsset]:
        """Convert a DefenderThreat into a ScanAsset.

        The asset carries Defender metadata in custom_metadata so the
        DefenderConfirmedThreatRule can match it.
        """
        file_path = threat.file_path
        if not file_path:
            return None

        try:
            display_name = os.path.basename(file_path)
        except Exception:
            display_name = "defender-threat"

        # Deterministic asset_id from threat detection ID + file path.
        raw_id = f"defender:{threat.detection_id}:{file_path}"
        asset_id = hashlib.sha256(raw_id.encode()).hexdigest()

        # Read file size if possible.
        size: Optional[int] = None
        try:
            size = os.path.getsize(file_path)
        except OSError:
            pass

        custom_meta = AssetMetadata()
        custom_metadata_dict = {
            "defender_threat": True,
            "threat_id": threat.threat_id,
            "threat_name": threat.threat_name,
            "severity": threat.severity,
            "category": threat.category,
            "detection_id": threat.detection_id,
            "detection_source": "WINDOWS_DEFENDER",
            "detection_time": threat.detection_time or "",
            "action_taken": threat.action_taken,
            "remediation_state": threat.remediation_state,
            "is_active": threat.is_active,
        }
        for k, v in custom_metadata_dict.items():
            custom_meta.set(k, v)
        if size is not None:
            custom_meta.set("size", size)

        return ScanAsset(
            asset_id=asset_id,
            asset_type=AssetType.FILE,
            asset_category=AssetCategory.FILESYSTEM,
            asset_source=AssetSource.MALWARE_SCANNER,
            display_name=display_name,
            canonical_path=file_path,
            exists=True,
            accessible=True,
            locked=False,
            custom_metadata=custom_meta,
            discovered_at=datetime.now(UTC),
        )
