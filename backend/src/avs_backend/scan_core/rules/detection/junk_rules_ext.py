"""
SC-8C2 Extended Junk Detection Rules

New production rules for:
- Application Temp
- Browser Cache
- Installer Cache
- Windows Update Cache
- Application Cache

DETECTION ONLY - NO ACTION EXECUTION.
"""

from __future__ import annotations

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


class ApplicationTempRule(Rule):
    """
    Detect files in known application-specific temporary directories.

    Matches files located under recognized application temp locations:
    - Microsoft Office 16.0 Temp
    - Microsoft Office 15.0 Temp

    Detection criterion: known application temp location + FILE asset type.
    Extension and age are SUPPORTING evidence only.

    Safety: centralized via SafetyPolicy.
    """

    def __init__(self) -> None:
        metadata = RuleMetadata(
            identifier=RuleIdentifier("junk.temp.application"),
            version=RuleVersion(1, 0, 0),
            name="Application Temporary Files",
            description=(
                "Detects temporary files in known application-specific "
                "temporary directories (e.g. Microsoft Office)"
            ),
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
        """Evaluate if asset is an application temporary file."""

        app_temp_roots = KnownLocations.get_application_temp_roots()
        matched_root: Optional[str] = None

        for root in app_temp_roots:
            if KnownLocations.is_under_path(asset.canonical_path, root):
                matched_root = str(root)
                break

        if matched_root is None:
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset is not in a known application temp directory",
            )

        assert matched_root is not None

        # Skip missing assets — not actionable
        if SafetyPolicy.should_skip_missing(snapshot):
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset no longer exists on filesystem",
            )

        # Build evidence
        evidence_items: list[Evidence] = []

        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.KNOWN_LOCATION,
                source=self.rule_id,
                description=(f"Asset is in known application temp directory: {matched_root}"),
                value=matched_root,
            )
        )

        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.APPLICATION_MATCH,
                source=self.rule_id,
                description="Application temp directory is recognized and defensible",
                value="application_temp",
            )
        )

        # Extension supporting evidence
        if KnownLocations.has_temporary_extension(asset.canonical_path):
            evidence_items.append(
                Evidence(
                    evidence_type=EvidenceType.EXTENSION_MATCH,
                    source=self.rule_id,
                    description="Asset has a temporary file extension",
                    value=Path(asset.canonical_path).suffix.lower(),
                )
            )

        # Age supporting evidence
        if KnownLocations.is_asset_old(asset.modified_at):
            evidence_items.append(
                Evidence(
                    evidence_type=EvidenceType.AGE_MATCH,
                    source=self.rule_id,
                    description=(
                        f"Asset is older than "
                        f"{KnownLocations.get_default_age_threshold_days()} days"
                    ),
                    value="old",
                )
            )

        if snapshot:
            evidence_items.append(
                Evidence(
                    evidence_type=EvidenceType.METADATA_MATCH,
                    source=self.rule_id,
                    description=f"Asset state: {snapshot.state.value}",
                    value=snapshot.state.value,
                )
            )

        # Confidence
        confidence_factors: list[ConfidenceScore] = []

        confidence_factors.append(
            ConfidenceScore(
                factor=ConfidenceFactor.PATH_MATCH,
                score=88.0,
                description="Asset is in a known application temp directory",
            )
        )

        confidence_factors.append(
            ConfidenceScore(
                factor=ConfidenceFactor.APPLICATION_MATCH,
                score=85.0,
                description="Application-specific temp location is recognized",
            )
        )

        confidence_factors.append(
            ConfidenceScore(
                factor=ConfidenceFactor.ASSET_TYPE_MATCH,
                score=80.0,
                description="Asset type is FILE",
            )
        )

        # Extension boosts confidence
        if KnownLocations.has_temporary_extension(asset.canonical_path):
            confidence_factors.append(
                ConfidenceScore(
                    factor=ConfidenceFactor.MULTIPLE_EVIDENCE,
                    score=75.0,
                    description="Asset has temporary extension (supporting evidence)",
                )
            )

        # Age boosts confidence
        if KnownLocations.is_asset_old(asset.modified_at):
            confidence_factors.append(
                ConfidenceScore(
                    factor=ConfidenceFactor.MULTIPLE_EVIDENCE,
                    score=70.0,
                    description="Asset is old (supporting evidence)",
                )
            )

        avg_score = sum(f.score for f in confidence_factors) / len(confidence_factors)

        confidence = Confidence(
            score=avg_score,
            factors=tuple(confidence_factors),
        )

        # Safety via centralized policy
        safety = SafetyPolicy.assess(
            asset=asset,
            snapshot=snapshot,
            safe_reason="Asset is in a known application temp directory",
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
            reason=f"Application temp file in: {matched_root}",
            evidence=EvidenceCollection(tuple(evidence_items)),
            recommended_action=ActionType.DELETE,
            estimated_size=estimated_size,
        )


class BrowserCacheRule(Rule):
    """
    Detect browser cache files.

    Matches files located under known browser cache directories for:
    - Chrome, Edge, Brave, Opera, Vivaldi (Chromium-based)
    - Firefox (profile-based cache2)

    Reuses location knowledge from BrowserCacheCleaner (SC-3).
    Does NOT read browser databases. Does NOT delete anything.

    Supports both FILE and BROWSER_CACHE asset types.

    Safety: centralized via SafetyPolicy.
    """

    def __init__(self) -> None:
        metadata = RuleMetadata(
            identifier=RuleIdentifier("cache.browser"),
            version=RuleVersion(1, 0, 0),
            name="Browser Cache",
            description=(
                "Detects browser cache files for Chrome, Edge, Brave, "
                "Opera, Vivaldi, and Firefox"
            ),
            category=RuleCategory.CACHE,
            severity=Severity.LOW,
            supported_asset_types=(
                AssetType.FILE.value,
                AssetType.BROWSER_CACHE.value,
            ),
        )
        super().__init__(metadata)

    def evaluate(
        self,
        asset: ScanAsset,
        snapshot: Optional[AssetSnapshot] = None,
        context: Optional[ScanContext] = None,
    ) -> RuleResult:
        """Evaluate if asset is a browser cache file."""

        browser_cache_roots = KnownLocations.get_browser_cache_roots()
        matched_root: Optional[str] = None

        for root in browser_cache_roots:
            if KnownLocations.is_under_path(asset.canonical_path, root):
                matched_root = str(root)
                break

        if matched_root is None:
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset is not in a known browser cache directory",
            )

        assert matched_root is not None

        # Skip missing assets — not actionable
        if SafetyPolicy.should_skip_missing(snapshot):
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset no longer exists on filesystem",
            )

        # Build evidence
        evidence_items: list[Evidence] = []

        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.KNOWN_LOCATION,
                source=self.rule_id,
                description=(f"Asset is in known browser cache directory: {matched_root}"),
                value=matched_root,
            )
        )

        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.BEHAVIOR_MATCH,
                source=self.rule_id,
                description=(
                    "Browser caches are regenerated automatically by " "the browser on next visit"
                ),
                value="auto-regenerated",
            )
        )

        # Extension supporting evidence
        if KnownLocations.has_temporary_extension(asset.canonical_path):
            evidence_items.append(
                Evidence(
                    evidence_type=EvidenceType.EXTENSION_MATCH,
                    source=self.rule_id,
                    description="Asset has a temporary/cache extension",
                    value=Path(asset.canonical_path).suffix.lower(),
                )
            )

        # Age supporting evidence
        if KnownLocations.is_asset_old(asset.modified_at):
            evidence_items.append(
                Evidence(
                    evidence_type=EvidenceType.AGE_MATCH,
                    source=self.rule_id,
                    description=(
                        f"Asset is older than "
                        f"{KnownLocations.get_default_age_threshold_days()} days"
                    ),
                    value="old",
                )
            )

        if snapshot:
            evidence_items.append(
                Evidence(
                    evidence_type=EvidenceType.METADATA_MATCH,
                    source=self.rule_id,
                    description=f"Asset state: {snapshot.state.value}",
                    value=snapshot.state.value,
                )
            )

        # Confidence
        confidence_factors: list[ConfidenceScore] = []

        confidence_factors.append(
            ConfidenceScore(
                factor=ConfidenceFactor.PATH_MATCH,
                score=92.0,
                description="Asset is in a well-known browser cache directory",
            )
        )

        confidence_factors.append(
            ConfidenceScore(
                factor=ConfidenceFactor.STRONG_EVIDENCE,
                score=90.0,
                description="Browser caches are safe to clear — auto-regenerated",
            )
        )

        confidence_factors.append(
            ConfidenceScore(
                factor=ConfidenceFactor.ASSET_TYPE_MATCH,
                score=80.0,
                description="Asset type is FILE or BROWSER_CACHE",
            )
        )

        if KnownLocations.is_asset_old(asset.modified_at):
            confidence_factors.append(
                ConfidenceScore(
                    factor=ConfidenceFactor.MULTIPLE_EVIDENCE,
                    score=70.0,
                    description="Old cache entry — likely stale (supporting evidence)",
                )
            )

        avg_score = sum(f.score for f in confidence_factors) / len(confidence_factors)

        confidence = Confidence(
            score=avg_score,
            factors=tuple(confidence_factors),
        )

        # Safety via centralized policy
        safety = SafetyPolicy.assess(
            asset=asset,
            snapshot=snapshot,
            safe_reason="Browser cache is safe to clear — regenerated by browser",
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
            reason=f"Browser cache file in: {matched_root}",
            evidence=EvidenceCollection(tuple(evidence_items)),
            recommended_action=ActionType.CLEAR_CACHE,
            estimated_size=estimated_size,
        )


class InstallerCacheRule(Rule):
    """
    Detect Windows Installer patch cache files.

    Matches files under:
    - %SystemRoot%\\Installer\\$PatchCache$

    Only the $PatchCache$ subfolder — never the parent Installer directory
    which contains critical MSI packages.

    Safety: centralized via SafetyPolicy. The parent Installer directory
    is in the protected roots list, so even path escapes are caught.
    """

    def __init__(self) -> None:
        metadata = RuleMetadata(
            identifier=RuleIdentifier("cache.installer"),
            version=RuleVersion(1, 0, 0),
            name="Windows Installer Patch Cache",
            description=(
                "Detects Windows Installer patch cache files " "($PatchCache$ subfolder only)"
            ),
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
        """Evaluate if asset is a Windows Installer patch cache file."""

        installer_cache_root = KnownLocations.get_installer_cache_root()

        if not KnownLocations.is_under_path(asset.canonical_path, installer_cache_root):
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset is not in Windows Installer patch cache",
            )

        # Skip missing assets — not actionable
        if SafetyPolicy.should_skip_missing(snapshot):
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset no longer exists on filesystem",
            )

        # Build evidence
        evidence_items: list[Evidence] = []

        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.KNOWN_LOCATION,
                source=self.rule_id,
                description=(f"Asset is in Windows Installer patch cache: {installer_cache_root}"),
                value=str(installer_cache_root),
            )
        )

        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.BEHAVIOR_MATCH,
                source=self.rule_id,
                description=(
                    "Installer patch cache is re-downloaded by Windows "
                    "Installer if needed for self-healing"
                ),
                value="auto-reparable",
            )
        )

        # Age supporting evidence
        if KnownLocations.is_asset_old(asset.modified_at):
            evidence_items.append(
                Evidence(
                    evidence_type=EvidenceType.AGE_MATCH,
                    source=self.rule_id,
                    description=(
                        f"Patch cache file is older than "
                        f"{KnownLocations.get_default_age_threshold_days()} days"
                    ),
                    value="old",
                )
            )

        if snapshot:
            evidence_items.append(
                Evidence(
                    evidence_type=EvidenceType.METADATA_MATCH,
                    source=self.rule_id,
                    description=f"Asset state: {snapshot.state.value}",
                    value=snapshot.state.value,
                )
            )

        # Confidence
        confidence_factors: list[ConfidenceScore] = []

        confidence_factors.append(
            ConfidenceScore(
                factor=ConfidenceFactor.PATH_MATCH,
                score=90.0,
                description="Asset is in $PatchCache$ — not the parent Installer dir",
            )
        )

        confidence_factors.append(
            ConfidenceScore(
                factor=ConfidenceFactor.STRONG_EVIDENCE,
                score=85.0,
                description=(
                    "Patch cache is safe to clear — Installer re-downloads " "patches if needed"
                ),
            )
        )

        confidence_factors.append(
            ConfidenceScore(
                factor=ConfidenceFactor.ASSET_TYPE_MATCH,
                score=80.0,
                description="Asset type is FILE",
            )
        )

        if KnownLocations.is_asset_old(asset.modified_at):
            confidence_factors.append(
                ConfidenceScore(
                    factor=ConfidenceFactor.MULTIPLE_EVIDENCE,
                    score=70.0,
                    description="Old patch cache file (supporting evidence)",
                )
            )

        avg_score = sum(f.score for f in confidence_factors) / len(confidence_factors)

        confidence = Confidence(
            score=avg_score,
            factors=tuple(confidence_factors),
        )

        # Safety via centralized policy
        safety = SafetyPolicy.assess(
            asset=asset,
            snapshot=snapshot,
            safe_reason=("Installer patch cache is safe to clear — " "re-downloaded if needed"),
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
            reason=f"Installer patch cache file in: {installer_cache_root}",
            evidence=EvidenceCollection(tuple(evidence_items)),
            recommended_action=ActionType.DELETE,
            estimated_size=estimated_size,
        )


class WindowsUpdateCacheRule(Rule):
    """
    Detect Windows Update download cache files.

    Matches files under:
    - %SystemRoot%\\SoftwareDistribution\\Download

    These are downloaded update packages retained after installation.
    The wuauserv service may lock files during active updates.

    Safety: centralized via SafetyPolicy.
    """

    def __init__(self) -> None:
        metadata = RuleMetadata(
            identifier=RuleIdentifier("cache.windows_update"),
            version=RuleVersion(1, 0, 0),
            name="Windows Update Cache",
            description=(
                "Detects downloaded Windows Update packages " "retained after installation"
            ),
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
        """Evaluate if asset is a Windows Update cache file."""

        update_cache_root = KnownLocations.get_windows_update_cache_root()

        if not KnownLocations.is_under_path(asset.canonical_path, update_cache_root):
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset is not in Windows Update download cache",
            )

        # Skip missing assets — not actionable
        if SafetyPolicy.should_skip_missing(snapshot):
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset no longer exists on filesystem",
            )

        # Build evidence
        evidence_items: list[Evidence] = []

        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.KNOWN_LOCATION,
                source=self.rule_id,
                description=(f"Asset is in Windows Update download cache: " f"{update_cache_root}"),
                value=str(update_cache_root),
            )
        )

        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.BEHAVIOR_MATCH,
                source=self.rule_id,
                description=(
                    "Downloaded update packages are retained after "
                    "installation and can be safely removed"
                ),
                value="post-install-retained",
            )
        )

        # Age supporting evidence
        if KnownLocations.is_asset_old(asset.modified_at):
            evidence_items.append(
                Evidence(
                    evidence_type=EvidenceType.AGE_MATCH,
                    source=self.rule_id,
                    description=(
                        f"Update cache file is older than "
                        f"{KnownLocations.get_default_age_threshold_days()} days"
                    ),
                    value="old",
                )
            )

        if snapshot:
            evidence_items.append(
                Evidence(
                    evidence_type=EvidenceType.METADATA_MATCH,
                    source=self.rule_id,
                    description=f"Asset state: {snapshot.state.value}",
                    value=snapshot.state.value,
                )
            )

        # Confidence
        confidence_factors: list[ConfidenceScore] = []

        confidence_factors.append(
            ConfidenceScore(
                factor=ConfidenceFactor.PATH_MATCH,
                score=90.0,
                description="Asset is in Windows Update download cache",
            )
        )

        confidence_factors.append(
            ConfidenceScore(
                factor=ConfidenceFactor.STRONG_EVIDENCE,
                score=85.0,
                description=("Downloaded updates are safe to remove after installation"),
            )
        )

        confidence_factors.append(
            ConfidenceScore(
                factor=ConfidenceFactor.ASSET_TYPE_MATCH,
                score=80.0,
                description="Asset type is FILE",
            )
        )

        if KnownLocations.is_asset_old(asset.modified_at):
            confidence_factors.append(
                ConfidenceScore(
                    factor=ConfidenceFactor.MULTIPLE_EVIDENCE,
                    score=70.0,
                    description="Old update cache file (supporting evidence)",
                )
            )

        avg_score = sum(f.score for f in confidence_factors) / len(confidence_factors)

        confidence = Confidence(
            score=avg_score,
            factors=tuple(confidence_factors),
        )

        # Safety via centralized policy
        safety = SafetyPolicy.assess(
            asset=asset,
            snapshot=snapshot,
            safe_reason=("Windows Update download cache is safe to clear " "after installation"),
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
            reason=f"Windows Update cache file in: {update_cache_root}",
            evidence=EvidenceCollection(tuple(evidence_items)),
            recommended_action=ActionType.DELETE,
            estimated_size=estimated_size,
        )


class ApplicationCacheRule(Rule):
    """
    Detect known application cache files.

    Matches files under recognized application cache directories:
    - Microsoft Office OfficeFileCache (15.0, 16.0)
    - Microsoft Office DocumentCache (16.0)
    - Microsoft Office UnsavedFiles
    - Windows IconCache.db

    Only well-known, defensible cache locations where the application
    explicitly regenerates cached data.

    Safety: centralized via SafetyPolicy.
    """

    def __init__(self) -> None:
        metadata = RuleMetadata(
            identifier=RuleIdentifier("cache.application"),
            version=RuleVersion(1, 0, 0),
            name="Application Cache",
            description=(
                "Detects cache files in known application cache " "directories (Office, IconCache)"
            ),
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
        """Evaluate if asset is an application cache file."""

        # Check application cache roots
        app_cache_roots = KnownLocations.get_application_cache_roots()
        matched_root: Optional[str] = None

        for root in app_cache_roots:
            if KnownLocations.is_under_path(asset.canonical_path, root):
                matched_root = str(root)
                break

        # Also check IconCache.db (single file, not directory)
        is_icon_cache = False
        icon_cache_file = KnownLocations.get_icon_cache_file()
        if asset.canonical_path.lower() == str(icon_cache_file).lower():
            is_icon_cache = True
            matched_root = str(icon_cache_file)

        if matched_root is None and not is_icon_cache:
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset is not in a known application cache directory",
            )

        assert matched_root is not None

        # Skip missing assets — not actionable
        if SafetyPolicy.should_skip_missing(snapshot):
            return RuleResult.create_no_match(
                rule_id=self.rule_id,
                rule_version=str(self.version),
                asset_id=asset.asset_id,
                reason="Asset no longer exists on filesystem",
            )

        # Build evidence
        evidence_items: list[Evidence] = []

        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.KNOWN_LOCATION,
                source=self.rule_id,
                description=(f"Asset is in known application cache: {matched_root}"),
                value=matched_root,
            )
        )

        if is_icon_cache:
            evidence_items.append(
                Evidence(
                    evidence_type=EvidenceType.KNOWN_PATTERN,
                    source=self.rule_id,
                    description="Asset is the Windows IconCache.db file",
                    value="iconcache_db",
                )
            )

        evidence_items.append(
            Evidence(
                evidence_type=EvidenceType.BEHAVIOR_MATCH,
                source=self.rule_id,
                description=(
                    "Application caches are regenerated automatically " "by the application"
                ),
                value="auto-regenerated",
            )
        )

        # Extension supporting evidence
        if KnownLocations.has_temporary_extension(asset.canonical_path):
            evidence_items.append(
                Evidence(
                    evidence_type=EvidenceType.EXTENSION_MATCH,
                    source=self.rule_id,
                    description="Asset has a temporary/cache extension",
                    value=Path(asset.canonical_path).suffix.lower(),
                )
            )

        # Age supporting evidence
        if KnownLocations.is_asset_old(asset.modified_at):
            evidence_items.append(
                Evidence(
                    evidence_type=EvidenceType.AGE_MATCH,
                    source=self.rule_id,
                    description=(
                        f"Asset is older than "
                        f"{KnownLocations.get_default_age_threshold_days()} days"
                    ),
                    value="old",
                )
            )

        if snapshot:
            evidence_items.append(
                Evidence(
                    evidence_type=EvidenceType.METADATA_MATCH,
                    source=self.rule_id,
                    description=f"Asset state: {snapshot.state.value}",
                    value=snapshot.state.value,
                )
            )

        # Confidence
        confidence_factors: list[ConfidenceScore] = []

        confidence_factors.append(
            ConfidenceScore(
                factor=ConfidenceFactor.PATH_MATCH,
                score=88.0,
                description="Asset is in a known application cache directory",
            )
        )

        confidence_factors.append(
            ConfidenceScore(
                factor=ConfidenceFactor.APPLICATION_MATCH,
                score=85.0,
                description="Application cache location is recognized",
            )
        )

        confidence_factors.append(
            ConfidenceScore(
                factor=ConfidenceFactor.STRONG_EVIDENCE,
                score=85.0,
                description="Application caches are safe to clear — auto-regenerated",
            )
        )

        if KnownLocations.is_asset_old(asset.modified_at):
            confidence_factors.append(
                ConfidenceScore(
                    factor=ConfidenceFactor.MULTIPLE_EVIDENCE,
                    score=70.0,
                    description="Old cache file (supporting evidence)",
                )
            )

        avg_score = sum(f.score for f in confidence_factors) / len(confidence_factors)

        confidence = Confidence(
            score=avg_score,
            factors=tuple(confidence_factors),
        )

        # Safety via centralized policy
        safety = SafetyPolicy.assess(
            asset=asset,
            snapshot=snapshot,
            safe_reason="Application cache is safe to clear — auto-regenerated",
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
            reason=f"Application cache file in: {matched_root}",
            evidence=EvidenceCollection(tuple(evidence_items)),
            recommended_action=ActionType.CLEAR_CACHE,
            estimated_size=estimated_size,
        )
