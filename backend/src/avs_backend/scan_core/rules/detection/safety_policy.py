"""
SC-8C2 Centralized Safety Policy

Single source of truth for safety assessment across all detection rules.

Ensures consistent behavior for:
- Protected locations
- Locked files
- Inaccessible files
- Missing assets
- Unknown state

Safety is SEPARATE from severity and confidence.
A finding can be HIGH severity, HIGH confidence, BLOCKED safety.

NO SYSTEM MODIFICATION.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

from ..enums import SafetyBlocker
from ..safety import SafetyAssessment
from .locations import KnownLocations

if TYPE_CHECKING:
    from ...assets import ScanAsset
    from ...context import AssetSnapshot


class SafetyPolicy:
    """
    Centralized safety assessment for all detection rules.

    Provides a single consistent policy for all rules so that
    locked, inaccessible, missing, and protected-location cases
    are handled identically regardless of which rule detected the asset.

    Policy:
        protected location  → BLOCKED (SYSTEM_CRITICAL)
        missing (not exists) → no actionable detection (NO_MATCH)
        locked              → REVIEW_REQUIRED
        inaccessible        → REVIEW_REQUIRED
        unknown state       → REVIEW_REQUIRED
        otherwise           → SAFE
    """

    @staticmethod
    def assess(
        asset: ScanAsset,
        snapshot: Optional[AssetSnapshot] = None,
        safe_reason: str = "Asset is safe to clean",
    ) -> SafetyAssessment:
        """
        Assess safety for a matched asset.

        Args:
            asset: The matched ScanAsset.
            snapshot: Optional AssetSnapshot with observed state.
            safe_reason: Reason string when asset is safe.

        Returns:
            SafetyAssessment with the appropriate level.
        """
        # 1. Protected location — always BLOCKED
        if KnownLocations.is_in_protected_location(asset.canonical_path):
            return SafetyAssessment.create_blocked(
                reason="Asset is in a protected system location",
                blockers=[SafetyBlocker.SYSTEM_CRITICAL],
            )

        # 2. Missing asset — not actionable
        if snapshot and not snapshot.exists:
            return SafetyAssessment.create_review_required(
                reason="Asset no longer exists on filesystem",
            )

        # 3. Locked — requires review
        if snapshot and snapshot.locked:
            return SafetyAssessment.create_review_required(
                reason="Asset is locked by another process — manual review recommended",
            )

        # 4. Inaccessible — requires review
        if snapshot and not snapshot.accessible:
            return SafetyAssessment.create_review_required(
                reason="Asset is not accessible — cannot verify safety",
            )

        # 5. Unknown / failed state
        if snapshot and not snapshot.exists and not snapshot.accessible:
            return SafetyAssessment.create_review_required(
                reason="Asset state is unknown — manual review required",
            )

        # 6. Safe
        return SafetyAssessment.create_safe(reason=safe_reason)

    @staticmethod
    def should_skip_missing(
        snapshot: Optional[AssetSnapshot] = None,
    ) -> bool:
        """
        Check if asset is missing and should not be reported as match.

        A missing asset must NOT be reported as an active cleanup candidate.

        Args:
            snapshot: Optional AssetSnapshot.

        Returns:
            True if the asset is missing (snapshot.exists == False).
        """
        if snapshot is None:
            return False
        return not snapshot.exists
