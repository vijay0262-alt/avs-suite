"""
V1.0 Disk Cleanup+ — Additional cleanup providers.

Implements detection rules for Windows Disk Cleanup categories that
were not covered by the original SC-8C2 rules:

- Recycle Bin (junk.recycle_bin)
- Delivery Optimization cache (cache.delivery_optimization)
- Windows Error Reporting / Crash Dumps (junk.crash_dump)
- Windows.old (junk.windows_old) — REVIEW_REQUIRED by default

These rules follow the same architecture as existing rules:
- DETECTION ONLY — no system modification
- Safety via centralized SafetyPolicy
- Uses KnownLocations for path knowledge
- Supports the V1.0 Dashboard eligibility filter (safety.is_safe)

DO NOT bypass SafetyGate.
DO NOT weaken safety checks.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from ...assets import ScanAsset
    from ...context import AssetSnapshot, ScanContext

from ...assets import AssetType
from ..confidence import Confidence, ConfidenceScore
from ..enums import ActionType, ConfidenceFactor, EvidenceType, RuleCategory, Severity
from ..evidence import Evidence, EvidenceCollection
from ..models import RuleIdentifier, RuleVersion
from ..result import RuleResult
from ..rule import Rule, RuleMetadata
from .locations import KnownLocations
from .safety_policy import SafetyPolicy


class RecycleBinRule(Rule):
    """
    Detect files in the Windows Recycle Bin.

    The Recycle Bin is located at C:\\$Recycle.Bin (and on other
    local fixed drives). Files in the Recycle Bin are intentionally
    deleted by the user and are safe to permanently remove.

    Safety: centralized via SafetyPolicy. The Recycle Bin directory
    itself is NOT in the protected roots list, so files inside it
    pass the protected-location check. Locked files (e.g., a file
    being restored) are classified as REVIEW_REQUIRED.
    """

    def __init__(self) -> None:
        metadata = RuleMetadata(
            identifier=RuleIdentifier("junk.recycle_bin"),
            version=RuleVersion(1, 0, 0),
            name="Recycle Bin",
            description="Detects files in the Windows Recycle Bin for permanent removal",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
            supported_asset_types=tuple([AssetType.FILE.value]),
        )
        super().__init__(metadata)

    def evaluate(
        self,
        asset: ScanAsset,
        snapshot: Optional[AssetSnapshot] = None,
        context: Optional[ScanContext] = None,
    ) -> RuleResult:
        """Evaluate if asset is a Recycle Bin file."""

        recycle_bin_roots = KnownLocations.get_recycle_bin_roots()
        matched_root: Optional[str] = None

        for root in recycle_bin_roots:
            if KnownLocations.is_under_path(asset.canonical_path, root):
                matched_root = str(root)
                break

        if matched_root is None:
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset is not in a Recycle Bin directory",
            )

        assert matched_root is not None

        if SafetyPolicy.should_skip_missing(snapshot):
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset no longer exists on filesystem",
            )

        evidence_items: list[Evidence] = []
        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.KNOWN_LOCATION,
                source=self.rule_id,
                description=f"Asset is in Recycle Bin: {matched_root}",
                value=matched_root,
            )
        )
        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.BEHAVIOR_MATCH,
                source=self.rule_id,
                description="Recycle Bin contains intentionally deleted files",
                value="recycle_bin",
            )
        )

        confidence_factors: list[ConfidenceScore] = [
            ConfidenceScore(
                factor=ConfidenceFactor.PATH_MATCH,
                score=95.0,
                description="Asset is in a well-known Recycle Bin directory",
            ),
            ConfidenceScore(
                factor=ConfidenceFactor.STRONG_EVIDENCE,
                score=92.0,
                description="Recycle Bin files are intentionally deleted by the user",
            ),
            ConfidenceScore(
                factor=ConfidenceFactor.ASSET_TYPE_MATCH,
                score=80.0,
                description="Asset type is FILE",
            ),
        ]

        avg_score = sum(f.score for f in confidence_factors) / len(confidence_factors)
        confidence = Confidence(score=avg_score, factors=tuple(confidence_factors))

        safety = SafetyPolicy.assess(
            asset=asset,
            snapshot=snapshot,
            safe_reason="Recycle Bin file is safe to permanently remove",
        )

        estimated_size: Optional[int] = None
        size_value = asset.custom_metadata.get("size")
        if size_value is not None and isinstance(size_value, (int, float)):
            estimated_size = int(size_value)

        return RuleResult.create_matched(
            rule_id=self.rule_id,
            rule_version=str(self.version),
            asset_id=asset.asset_id,
            severity=self.metadata.severity,
            confidence=confidence,
            safety=safety,
            reason=f"Recycle Bin file in: {matched_root}",
            evidence=EvidenceCollection(tuple(evidence_items)),
            recommended_action=ActionType.DELETE,
            estimated_size=estimated_size,
        )


class DeliveryOptimizationRule(Rule):
    """
    Detect Windows Delivery Optimization cache files.

    Delivery Optimization stores downloaded update fragments for
    peer-to-peer distribution. These cache files are safe to clean
    when no active download is in progress.

    Safety: centralized via SafetyPolicy. The Delivery Optimization
    directories are NOT in protected roots (they are exceptions under
    SoftwareDistribution). Locked files are REVIEW_REQUIRED.
    """

    def __init__(self) -> None:
        metadata = RuleMetadata(
            identifier=RuleIdentifier("cache.delivery_optimization"),
            version=RuleVersion(1, 0, 0),
            name="Delivery Optimization Cache",
            description="Detects Windows Delivery Optimization cache files",
            category=RuleCategory.CACHE,
            severity=Severity.LOW,
            supported_asset_types=tuple([AssetType.FILE.value]),
        )
        super().__init__(metadata)

    def evaluate(
        self,
        asset: ScanAsset,
        snapshot: Optional[AssetSnapshot] = None,
        context: Optional[ScanContext] = None,
    ) -> RuleResult:
        """Evaluate if asset is a Delivery Optimization cache file."""

        do_roots = KnownLocations.get_delivery_optimization_roots()
        matched_root: Optional[str] = None

        for root in do_roots:
            if KnownLocations.is_under_path(asset.canonical_path, root):
                matched_root = str(root)
                break

        if matched_root is None:
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset is not in a Delivery Optimization directory",
            )

        assert matched_root is not None

        if SafetyPolicy.should_skip_missing(snapshot):
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset no longer exists on filesystem",
            )

        evidence_items: list[Evidence] = []
        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.KNOWN_LOCATION,
                source=self.rule_id,
                description=f"Asset is in Delivery Optimization cache: {matched_root}",
                value=matched_root,
            )
        )
        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.BEHAVIOR_MATCH,
                source=self.rule_id,
                description="Delivery Optimization cache is regenerated by Windows Update",
                value="auto-regenerated",
            )
        )

        confidence_factors: list[ConfidenceScore] = [
            ConfidenceScore(
                factor=ConfidenceFactor.PATH_MATCH,
                score=90.0,
                description="Asset is in a known Delivery Optimization directory",
            ),
            ConfidenceScore(
                factor=ConfidenceFactor.STRONG_EVIDENCE,
                score=85.0,
                description="Delivery Optimization cache is auto-regenerated",
            ),
            ConfidenceScore(
                factor=ConfidenceFactor.ASSET_TYPE_MATCH,
                score=80.0,
                description="Asset type is FILE",
            ),
        ]

        avg_score = sum(f.score for f in confidence_factors) / len(confidence_factors)
        confidence = Confidence(score=avg_score, factors=tuple(confidence_factors))

        safety = SafetyPolicy.assess(
            asset=asset,
            snapshot=snapshot,
            safe_reason="Delivery Optimization cache is safe to clear",
        )

        estimated_size: Optional[int] = None
        size_value = asset.custom_metadata.get("size")
        if size_value is not None and isinstance(size_value, (int, float)):
            estimated_size = int(size_value)

        return RuleResult.create_matched(
            rule_id=self.rule_id,
            rule_version=str(self.version),
            asset_id=asset.asset_id,
            severity=self.metadata.severity,
            confidence=confidence,
            safety=safety,
            reason=f"Delivery Optimization cache file in: {matched_root}",
            evidence=EvidenceCollection(tuple(evidence_items)),
            recommended_action=ActionType.DELETE,
            estimated_size=estimated_size,
        )


class CrashDumpRule(Rule):
    """
    Detect Windows Error Reporting and crash dump files.

    Includes:
    - Windows Error Reporting (WER) report queue and archive files
    - Minidump files
    - Live kernel reports

    These are safe to clean when no active diagnostic operation
    is in progress. Locked files are REVIEW_REQUIRED.

    Safety: centralized via SafetyPolicy. WER directories under
    %PROGRAMDATA% and %LOCALAPPDATA% are not in protected roots.
    %SystemRoot%\\Minidump and %SystemRoot%\\LiveKernelReports
    ARE under %SystemRoot% (protected), so they are added as
    protected exceptions.
    """

    def __init__(self) -> None:
        metadata = RuleMetadata(
            identifier=RuleIdentifier("junk.crash_dump"),
            version=RuleVersion(1, 0, 0),
            name="Crash Dumps & Error Reports",
            description="Detects Windows crash dumps and error reporting files",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
            supported_asset_types=tuple([AssetType.FILE.value]),
        )
        super().__init__(metadata)

    def evaluate(
        self,
        asset: ScanAsset,
        snapshot: Optional[AssetSnapshot] = None,
        context: Optional[ScanContext] = None,
    ) -> RuleResult:
        """Evaluate if asset is a crash dump or error report file."""

        dump_roots = KnownLocations.get_crash_dump_roots()
        matched_root: Optional[str] = None

        for root in dump_roots:
            if KnownLocations.is_under_path(asset.canonical_path, root):
                matched_root = str(root)
                break

        if matched_root is None:
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset is not in a crash dump or error reporting directory",
            )

        assert matched_root is not None

        if SafetyPolicy.should_skip_missing(snapshot):
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset no longer exists on filesystem",
            )

        evidence_items: list[Evidence] = []
        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.KNOWN_LOCATION,
                source=self.rule_id,
                description=f"Asset is in crash/error reporting directory: {matched_root}",
                value=matched_root,
            )
        )
        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.BEHAVIOR_MATCH,
                source=self.rule_id,
                description="Crash dumps and error reports are disposable diagnostic data",
                value="disposable_diagnostics",
            )
        )

        confidence_factors: list[ConfidenceScore] = [
            ConfidenceScore(
                factor=ConfidenceFactor.PATH_MATCH,
                score=90.0,
                description="Asset is in a known crash dump or WER directory",
            ),
            ConfidenceScore(
                factor=ConfidenceFactor.STRONG_EVIDENCE,
                score=85.0,
                description="Crash dumps are disposable after diagnostic collection",
            ),
            ConfidenceScore(
                factor=ConfidenceFactor.ASSET_TYPE_MATCH,
                score=80.0,
                description="Asset type is FILE",
            ),
        ]

        avg_score = sum(f.score for f in confidence_factors) / len(confidence_factors)
        confidence = Confidence(score=avg_score, factors=tuple(confidence_factors))

        safety = SafetyPolicy.assess(
            asset=asset,
            snapshot=snapshot,
            safe_reason="Crash dump / error report is safe to clean",
        )

        estimated_size: Optional[int] = None
        size_value = asset.custom_metadata.get("size")
        if size_value is not None and isinstance(size_value, (int, float)):
            estimated_size = int(size_value)

        return RuleResult.create_matched(
            rule_id=self.rule_id,
            rule_version=str(self.version),
            asset_id=asset.asset_id,
            severity=self.metadata.severity,
            confidence=confidence,
            safety=safety,
            reason=f"Crash dump / error report in: {matched_root}",
            evidence=EvidenceCollection(tuple(evidence_items)),
            recommended_action=ActionType.DELETE,
            estimated_size=estimated_size,
        )


class WindowsOldRule(Rule):
    """
    Detect Windows.old (previous Windows installation) files.

    This is a SPECIAL category. Deleting Windows.old removes the
    ability to roll back to the previous Windows version.

    V1.0 Dashboard policy: DEFAULT = REVIEW_REQUIRED.
    The files are detected but NOT automatically cleaned.
    The user must explicitly decide to remove Windows.old.

    This rule intentionally returns REVIEW_REQUIRED safety for ALL
    matches, regardless of file lock state. This ensures the V1.0
    Dashboard eligibility filter excludes Windows.old from automatic
    cleanup.
    """

    def __init__(self) -> None:
        metadata = RuleMetadata(
            identifier=RuleIdentifier("junk.windows_old"),
            version=RuleVersion(1, 0, 0),
            name="Previous Windows Installation",
            description=(
                "Detects Windows.old files — requires explicit user "
                "decision before removal (affects rollback capability)"
            ),
            category=RuleCategory.JUNK,
            severity=Severity.MEDIUM,
            supported_asset_types=tuple([AssetType.FILE.value]),
        )
        super().__init__(metadata)

    def evaluate(
        self,
        asset: ScanAsset,
        snapshot: Optional[AssetSnapshot] = None,
        context: Optional[ScanContext] = None,
    ) -> RuleResult:
        """Evaluate if asset is a Windows.old file."""

        windows_old_root = KnownLocations.get_windows_old_root()

        if not KnownLocations.is_under_path(asset.canonical_path, windows_old_root):
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset is not in Windows.old",
            )

        if SafetyPolicy.should_skip_missing(snapshot):
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset no longer exists on filesystem",
            )

        evidence_items: list[Evidence] = []
        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.KNOWN_LOCATION,
                source=self.rule_id,
                description="Asset is in Windows.old (previous Windows installation)",
                value=str(windows_old_root),
            )
        )
        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.BEHAVIOR_MATCH,
                source=self.rule_id,
                description=(
                    "Windows.old contains the previous Windows installation. "
                    "Deleting it removes the ability to roll back."
                ),
                value="rollback_critical",
            )
        )

        confidence_factors: list[ConfidenceScore] = [
            ConfidenceScore(
                factor=ConfidenceFactor.PATH_MATCH,
                score=95.0,
                description="Asset is in Windows.old directory",
            ),
            ConfidenceScore(
                factor=ConfidenceFactor.STRONG_EVIDENCE,
                score=90.0,
                description="Windows.old is a known previous installation directory",
            ),
            ConfidenceScore(
                factor=ConfidenceFactor.ASSET_TYPE_MATCH,
                score=80.0,
                description="Asset type is FILE",
            ),
        ]

        avg_score = sum(f.score for f in confidence_factors) / len(confidence_factors)
        confidence = Confidence(score=avg_score, factors=tuple(confidence_factors))

        # V1.0: Always REVIEW_REQUIRED — never automatically delete Windows.old.
        # The user must explicitly decide to remove the previous installation.
        from ..safety import SafetyAssessment
        safety = SafetyAssessment.create_review_required(
            reason=(
                "Windows.old contains the previous Windows installation. "
                "Automatic deletion is disabled — removing it will prevent "
                "rollback to the previous Windows version."
            ),
        )

        estimated_size: Optional[int] = None
        size_value = asset.custom_metadata.get("size")
        if size_value is not None and isinstance(size_value, (int, float)):
            estimated_size = int(size_value)

        return RuleResult.create_matched(
            rule_id=self.rule_id,
            rule_version=str(self.version),
            asset_id=asset.asset_id,
            severity=self.metadata.severity,
            confidence=confidence,
            safety=safety,
            reason="Windows.old file — requires explicit user decision",
            evidence=EvidenceCollection(tuple(evidence_items)),
            recommended_action=ActionType.NONE,
            estimated_size=estimated_size,
        )


def register_cleanup_provider_rules(registry) -> None:
    """
    Register all V1.0 Disk Cleanup+ provider rules with the registry.

    Args:
        registry: RuleRegistry instance
    """
    registry.register(RecycleBinRule())
    registry.register(DeliveryOptimizationRule())
    registry.register(CrashDumpRule())
    registry.register(WindowsOldRule())
