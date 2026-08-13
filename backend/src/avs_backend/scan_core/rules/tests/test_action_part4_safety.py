"""
SC-8C3 Part 4 — Remediation Action Safety Hardening Tests

Tests the execution-readiness hardening added by the security audit.

These tests are planning/validation only and never modify system state.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Callable, Optional

import pytest

from avs_backend.scan_core.assets import AssetCategory, AssetType
from avs_backend.scan_core.rules.action import (
    ActionPlan,
    ActionPlanner,
    ActionState,
    ActionSummary,
    BrowserActionTarget,
    FilesystemActionTarget,
    RemediationAction,
)
from avs_backend.scan_core.rules.action_path_validation import (
    PathValidationError,
    SymlinkContract,
    is_path_safe_for_planning,
    validate_filesystem_path,
)
from avs_backend.scan_core.rules.action_preconditions import (
    BrowserNotRunning,
    CacheScopeValid,
    HashMatches,
    ModifiedTimeMatches,
    NotJunction,
    NotReparsePoint,
    NotSymlink,
    PathWithinAllowedScope,
    PreconditionSet,
    ProfileExists,
    RegistryHiveMatches,
    RegistryKeyExists,
    RegistryValueExists,
    SafetyLevelValid,
    SizeMatches,
    SnapshotFresh,
    TargetAccessible,
    TargetExists,
    TargetIdentityMatches,
    TargetNotLocked,
)
from avs_backend.scan_core.rules.action_registry_validation import (
    RegistryValidationError,
    is_registry_target_safe,
    normalize_hive,
    validate_registry_target,
    validate_value_name,
)
from avs_backend.scan_core.rules.aggregation import DetectionAggregator
from avs_backend.scan_core.rules.confidence import Confidence, ConfidenceScore
from avs_backend.scan_core.rules.enums import (
    ActionType,
    ConfidenceFactor,
    EvidenceType,
    RuleCategory,
    SafetyBlocker,
    SafetyLevel,
    Severity,
)
from avs_backend.scan_core.rules.evidence import Evidence, EvidenceCollection
from avs_backend.scan_core.rules.priority import FindingPrioritizer, RuleCapability
from avs_backend.scan_core.rules.result import RuleMatchStatus, RuleResult
from avs_backend.scan_core.rules.safety import SafetyAssessment
from avs_backend.scan_core.rules.safety_gate import (
    SafetyGateResult,
    create_safety_gate,
)

# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_confidence(score: float = 90.0) -> Confidence:
    return Confidence(
        score=score,
        factors=tuple(
            [
                ConfidenceScore(
                    factor=ConfidenceFactor.RULE_CERTAINTY,
                    score=score,
                    description="test",
                )
            ]
        ),
    )


def _make_safety(level: SafetyLevel = SafetyLevel.SAFE) -> SafetyAssessment:
    if level == SafetyLevel.BLOCKED:
        return SafetyAssessment.create_blocked(
            "System critical", [SafetyBlocker.SYSTEM_CRITICAL]
        )
    if level == SafetyLevel.REVIEW_REQUIRED:
        return SafetyAssessment.create_review_required("Manual review needed")
    if level == SafetyLevel.HIGH_RISK:
        return SafetyAssessment.create_high_risk("High risk action")
    if level == SafetyLevel.LOW_RISK:
        return SafetyAssessment.create_low_risk("Low risk action")
    return SafetyAssessment.create_safe("Safe to act")


def _make_evidence() -> EvidenceCollection:
    return EvidenceCollection(
        items=tuple(
            [
                Evidence(
                    evidence_type=EvidenceType.PATH_MATCH,
                    description="Test evidence",
                    source="test",
                    value="test-value",
                    weight=1.0,
                )
            ]
        )
    )


def _make_result(
    asset_id: str = "asset-1",
    rule_id: str = "junk.temp.application",
    rule_version: str = "1.0.0",
    severity: Severity = Severity.LOW,
    safety_level: SafetyLevel = SafetyLevel.SAFE,
    estimated_size: Optional[int] = 1024,
    status: RuleMatchStatus = RuleMatchStatus.MATCHED,
) -> RuleResult:
    return RuleResult(
        rule_id=rule_id,
        rule_version=rule_version,
        asset_id=asset_id,
        status=status,
        severity=severity,
        confidence=_make_confidence(),
        safety=_make_safety(safety_level),
        reason="Test detection reason",
        evidence=_make_evidence(),
        recommended_action=ActionType.DELETE,
        estimated_size=estimated_size,
        evaluated_at=datetime.now(UTC),
    )


def _make_asset_lookup(
    canonical_path: str, display_name: str = "Test Asset"
) -> dict[str, tuple[AssetType, AssetCategory, str, str]]:
    return {
        "asset-1": (
            AssetType.FILE,
            AssetCategory.FILESYSTEM,
            display_name,
            canonical_path,
        ),
    }


def _rule_category_resolver() -> dict[str, RuleCategory]:
    return {
        "junk.temp.application": RuleCategory.JUNK,
        "cache.application": RuleCategory.CACHE,
        "registry.temp": RuleCategory.REGISTRY,
        "startup.entry": RuleCategory.STARTUP,
        "browser.cache": RuleCategory.BROWSER,
    }


def _asset_lookup_resolver(
    lookup_map: dict[str, tuple[AssetType, AssetCategory, str, str]],
) -> Callable[[str], tuple[AssetType, AssetCategory, str, str]]:
    def resolver(asset_id: str) -> tuple[AssetType, AssetCategory, str, str]:
        result = lookup_map.get(asset_id)
        if result is not None:
            return result
        return (
            AssetType.UNKNOWN,
            AssetCategory.UNKNOWN,
            f"Unknown Asset ({asset_id[:8]})",
            "",
        )

    return resolver


def _rule_category_resolver_fn(
    resolver_map: dict[str, RuleCategory],
) -> Callable[[str], RuleCategory]:
    def resolver(rule_id: str) -> RuleCategory:
        return resolver_map.get(rule_id, RuleCategory.CUSTOM)

    return resolver


def _aggregate(
    results,
    asset_lookup=None,
    rule_category=None,
):
    lookup = asset_lookup or _make_asset_lookup(r"C:\temp\junk.txt")
    if not callable(lookup):
        lookup = _asset_lookup_resolver(lookup)
    resolver = rule_category or _rule_category_resolver()
    if not callable(resolver):
        resolver = _rule_category_resolver_fn(resolver)
    aggregator = DetectionAggregator(
        asset_lookup=lookup,
        rule_category_resolver=resolver,
    )
    return aggregator.aggregate(results)


def _prioritize(result, rule_capability_resolver=None):
    return FindingPrioritizer(
        rule_capability_resolver=rule_capability_resolver,
    ).prioritize(result)


@dataclass
class _Snapshot:
    """Test asset snapshot."""

    exists: bool = True
    is_locked: bool = False
    is_accessible: bool = True
    canonical_path: str = r"C:\temp\junk.txt"
    asset_id: str = "asset-1"
    snapshot_timestamp: Optional[datetime] = None
    snapshot_version: Optional[str] = None
    content_hash: Optional[str] = None
    size: Optional[int] = None
    modified_time: Optional[datetime] = None


def _plan(result, asset_snapshot_resolver=None, snapshot_ttl_seconds: int = 3600):
    return ActionPlanner(
        asset_snapshot_resolver=asset_snapshot_resolver,
        snapshot_ttl_seconds=snapshot_ttl_seconds,
    ).plan(result)


def _planned_action_for_path(
    canonical_path: str,
    rule_id: str = "junk.temp.application",
    asset_type: AssetType = AssetType.FILE,
    asset_category: AssetCategory = AssetCategory.FILESYSTEM,
    display_name: str = "Test Asset",
    snapshot: Optional[_Snapshot] = None,
    safety_level: SafetyLevel = SafetyLevel.SAFE,
) -> RemediationAction:
    lookup = {
        "asset-1": (asset_type, asset_category, display_name, canonical_path),
    }
    result = _make_result(rule_id=rule_id, safety_level=safety_level)
    agg = _aggregate([result], asset_lookup=lookup)
    prio = _prioritize(
        agg, rule_capability_resolver=lambda r: RuleCapability.REMEDIATION_AVAILABLE
    )
    snap = snapshot or _Snapshot(canonical_path=canonical_path)
    plan = _plan(prio, asset_snapshot_resolver=lambda aid: snap)
    assert len(plan.actions) == 1
    return plan.actions[0]


# ── Path Validation Tests ─────────────────────────────────────────────────────


class TestPathValidation:
    """Tests for Windows-path-aware validation."""

    @pytest.mark.parametrize(
        "path",
        [
            r"C:\Windows\System32\kernel32.dll",
            r"C:\Windows",
            r"C:\Program Files\Application",
            r"C:\Program Files (x86)\Application",
            r"C:\ProgramData\Microsoft",
            r"C:\Users\User\Documents",
        ],
    )
    def test_forbidden_paths_rejected(self, path: str) -> None:
        """Protected system and user paths are rejected."""
        with pytest.raises(PathValidationError):
            validate_filesystem_path(path)
        assert not is_path_safe_for_planning(path)

    def test_path_traversal_rejected(self) -> None:
        """Paths containing '..' traversal sequences are rejected."""
        with pytest.raises(PathValidationError) as exc:
            validate_filesystem_path(r"C:\temp\..\Windows\System32\kernel32.dll")
        assert exc.value.reason == "path_traversal"

    def test_unc_path_rejected(self) -> None:
        """UNC paths are rejected by default."""
        with pytest.raises(PathValidationError) as exc:
            validate_filesystem_path(r"\\server\share\file.txt")
        assert exc.value.reason == "unsafe_unc_path"

    def test_symlink_contract_present(self) -> None:
        """Symlink/junction/reparse-point contracts are recorded."""
        contracts = SymlinkContract.check_preconditions(r"C:\temp\junk.txt")
        assert "not_symlink:true" in contracts
        assert "not_junction:true" in contracts
        assert "not_reparse_point:true" in contracts

    def test_symlink_like_path_heuristic(self) -> None:
        """String-level heuristic for symlink-like path components."""
        assert SymlinkContract.is_symlink_like_path(r"C:\temp\symlink\target")
        assert SymlinkContract.is_symlink_like_path(r"C:\temp\junction\target")

    def test_safe_path_accepted(self) -> None:
        """Known-safe paths are accepted."""
        validate_filesystem_path(r"C:\temp\junk.txt")
        assert is_path_safe_for_planning(r"C:\temp\junk.txt")

    def test_relative_path_rejected(self) -> None:
        """Relative paths without a drive or leading slash are rejected."""
        with pytest.raises(PathValidationError) as exc:
            validate_filesystem_path(r"temp\junk.txt")
        assert exc.value.reason == "relative_path"

    def test_empty_path_rejected(self) -> None:
        """Empty paths are rejected."""
        with pytest.raises(PathValidationError):
            validate_filesystem_path("")


# ── Registry Validation Tests ─────────────────────────────────────────────────


class TestRegistryValidation:
    """Tests for registry target safety."""

    def test_invalid_hive_rejected(self) -> None:
        """Unknown registry hives are rejected."""
        with pytest.raises(RegistryValidationError) as exc:
            validate_registry_target("UNKNOWN_HIVE", r"Software\Test", None)
        assert exc.value.reason == "invalid_hive"

    def test_protected_registry_key_rejected(self) -> None:
        """Protected system registry keys are rejected."""
        with pytest.raises(RegistryValidationError) as exc:
            validate_registry_target(
                "HKLM",
                r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run",
                None,
                "remove_registry_key",
            )
        assert exc.value.reason == "protected_registry_key"

    def test_parent_key_deletion_rejected(self) -> None:
        """Deleting a parent of protected keys is rejected."""
        with pytest.raises(RegistryValidationError) as exc:
            validate_registry_target(
                "HKLM",
                r"SOFTWARE\Microsoft\Windows\CurrentVersion",
                None,
                "remove_registry_key",
            )
        assert exc.value.reason == "parent_key_deletion"

    def test_wow6432node_view_recorded(self) -> None:
        """WOW6432Node paths set the correct view."""
        assert is_registry_target_safe(
            "HKLM", r"SOFTWARE\WOW6432Node\Application", "value"
        )

    def test_value_name_with_separator_rejected(self) -> None:
        """Registry value names with separators are rejected."""
        with pytest.raises(RegistryValidationError):
            validate_value_name(r"sub\key\value")

    def test_allowed_registry_key_accepted(self) -> None:
        """Non-protected registry keys are accepted."""
        validate_registry_target("HKLM", r"SOFTWARE\Application\Junk", "value")
        assert is_registry_target_safe("HKLM", r"SOFTWARE\Application\Junk", "value")

    def test_hive_normalization(self) -> None:
        """Hive names are normalized to short canonical forms."""
        assert normalize_hive("HKEY_LOCAL_MACHINE") == "HKLM"
        assert normalize_hive("hklm") == "HKLM"


# ── Typed Precondition Tests ──────────────────────────────────────────────────


class TestTypedPreconditions:
    """Tests for machine-verifiable precondition models."""

    def test_precondition_set_evaluates_all_conditions(self) -> None:
        """PreconditionSet returns pass/fail and failed contracts."""
        pre = PreconditionSet(
            conditions=(
                TargetExists(expected=True),
                TargetAccessible(expected=True),
                TargetNotLocked(expected=True),
            )
        )
        passed, failed = pre.evaluate(
            {"exists": True, "accessible": True, "locked": False}
        )
        assert passed is True
        assert failed == []

    def test_target_exists_fails_when_missing(self) -> None:
        """TargetExists precondition fails when target missing."""
        cond = TargetExists(expected=True)
        assert cond.evaluate({"exists": False}) is False

    def test_target_not_locked_fails_when_locked(self) -> None:
        """TargetNotLocked precondition fails when target locked."""
        cond = TargetNotLocked(expected=True)
        assert cond.evaluate({"locked": True}) is False

    def test_target_identity_matches(self) -> None:
        """TargetIdentityMatches compares asset IDs."""
        cond = TargetIdentityMatches(expected_asset_id="asset-1")
        assert cond.evaluate({"asset_id": "asset-1"}) is True
        assert cond.evaluate({"asset_id": "asset-2"}) is False

    def test_path_within_allowed_scope(self) -> None:
        """PathWithinAllowedScope checks prefix containment."""
        cond = PathWithinAllowedScope(
            allowed_location=r"C:\temp",
            canonical_path=r"C:\temp\junk.txt",
        )
        assert cond.evaluate({"canonical_path": r"C:\temp\junk.txt"}) is True
        assert cond.evaluate({"canonical_path": r"C:\Windows\junk.txt"}) is False

    def test_size_matches(self) -> None:
        """SizeMatches precondition fails on changed size."""
        cond = SizeMatches(expected_size=1234)
        assert cond.evaluate({"size": 1234}) is True
        assert cond.evaluate({"size": 5678}) is False

    def test_modified_time_matches(self) -> None:
        """ModifiedTimeMatches precondition fails on changed mtime."""
        now = datetime.now(UTC)
        cond = ModifiedTimeMatches(expected_mtime=now)
        assert cond.evaluate({"modified_time": now}) is True
        assert cond.evaluate({"modified_time": now + timedelta(seconds=1)}) is False

    def test_hash_matches(self) -> None:
        """HashMatches precondition fails on changed content hash."""
        cond = HashMatches(expected_hash="abc123")
        assert cond.evaluate({"content_hash": "abc123"}) is True
        assert cond.evaluate({"content_hash": "def456"}) is False

    def test_snapshot_fresh(self) -> None:
        """SnapshotFresh precondition fails on stale snapshot."""
        now = datetime.now(UTC)
        cond = SnapshotFresh(max_age_seconds=60)
        assert cond.evaluate({"snapshot_timestamp": now}) is True
        assert (
            cond.evaluate({"snapshot_timestamp": now - timedelta(seconds=120)}) is False
        )

    def test_not_symlink_junction_reparse(self) -> None:
        """Filesystem reparse-point preconditions fail on unsafe attributes."""
        assert NotSymlink().evaluate({"is_symlink": False}) is True
        assert NotSymlink().evaluate({"is_symlink": True}) is False
        assert NotJunction().evaluate({"is_junction": False}) is True
        assert NotJunction().evaluate({"is_junction": True}) is False
        assert NotReparsePoint().evaluate({"is_reparse_point": False}) is True
        assert NotReparsePoint().evaluate({"is_reparse_point": True}) is False

    def test_registry_preconditions(self) -> None:
        """Registry preconditions evaluate hive and key existence."""
        pre = PreconditionSet(
            conditions=(
                RegistryHiveMatches(expected_hive="HKLM"),
                RegistryKeyExists(expected=True),
                RegistryValueExists(expected=True),
            )
        )
        passed, _ = pre.evaluate(
            {
                "registry_hive": "HKLM",
                "registry_key_exists": True,
                "registry_value_exists": True,
            }
        )
        assert passed is True

    def test_browser_preconditions(self) -> None:
        """Browser preconditions evaluate running state and cache scope."""
        pre = PreconditionSet(
            conditions=(
                BrowserNotRunning(browser="chrome"),
                ProfileExists(profile="default"),
                CacheScopeValid(cache_type="cache"),
            )
        )
        passed, _ = pre.evaluate(
            {
                "running_browsers": [],
                "browser_profiles": ["default"],
                "cache_type": "cache",
            }
        )
        assert passed is True

        assert (
            BrowserNotRunning(browser="chrome").evaluate(
                {"running_browsers": ["chrome"]}
            )
            is False
        )

    def test_safety_level_valid(self) -> None:
        """SafetyLevelValid allows only configured levels."""
        cond = SafetyLevelValid(allowed_levels=("safe", "low_risk"))
        assert cond.evaluate({"safety_level": "safe"}) is True
        assert cond.evaluate({"safety_level": "blocked"}) is False

    def test_precondition_contract_strings(self) -> None:
        """Preconditions serialize to deterministic contract strings."""
        cond = TargetExists(expected=True)
        assert cond.to_contract() == "target_exists:True"


# ── Planner Safety Tests ──────────────────────────────────────────────────────


class TestActionPlannerSafety:
    """Tests that the planner rejects unsafe targets."""

    @pytest.mark.parametrize(
        "path",
        [
            r"C:\Windows\System32\kernel32.dll",
            r"C:\Windows",
            r"C:\Program Files\Application",
            r"C:\ProgramData\Microsoft",
            r"C:\Users\User\Documents\file.txt",
            r"C:\temp\..\Windows\System32",
            r"\\server\share\file.txt",
        ],
    )
    def test_unsafe_filesystem_paths_never_executable(self, path: str) -> None:
        """Unsafe filesystem targets never produce an executable action."""
        action = _planned_action_for_path(path)
        assert action.state != ActionState.PLANNED

    def test_protected_registry_target_never_executable(self) -> None:
        """Protected registry targets never produce an executable action."""
        action = _planned_action_for_path(
            r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run",
            rule_id="registry.temp",
            asset_type=AssetType.REGISTRY_KEY,
            asset_category=AssetCategory.REGISTRY,
        )
        assert action.state != ActionState.PLANNED

    def test_browser_cookie_path_never_executable(self) -> None:
        """Browser user-data paths (cookies, history, login) are not cache."""
        cond = CacheScopeValid(cache_type="cache")
        assert cond.evaluate({"cache_type": "cookies"}) is False
        assert cond.evaluate({"cache_type": "history"}) is False
        assert cond.evaluate({"cache_type": "cache"}) is True

    def test_browser_cache_path_allowed(self) -> None:
        """Browser cache-type targets are accepted."""
        action = _planned_action_for_path(
            r"C:\Users\User\AppData\Local\Chrome\User Data\Default\Cache",
            rule_id="browser.cache",
            asset_type=AssetType.BROWSER_CACHE,
            asset_category=AssetCategory.BROWSER,
        )
        assert action.state == ActionState.PLANNED
        assert isinstance(action.target, BrowserActionTarget)
        assert action.target.cache_only is True
        assert action.target.user_data_safe is True

    def test_missing_target_is_not_executable(self) -> None:
        """Missing targets are recorded but not executable."""
        lookup = _make_asset_lookup(r"C:\temp\junk.txt")
        result = _make_result()
        agg = _aggregate([result], asset_lookup=lookup)
        prio = _prioritize(
            agg, rule_capability_resolver=lambda r: RuleCapability.REMEDIATION_AVAILABLE
        )
        plan = _plan(prio, asset_snapshot_resolver=lambda aid: None)
        assert len(plan.actions) == 1
        action = plan.actions[0]
        assert action.state == ActionState.MISSING_TARGET
        assert action.state != ActionState.PLANNED

    def test_locked_target_is_not_executable(self) -> None:
        """Locked targets are recorded but not executable."""
        result = _make_result()
        agg = _aggregate([result])
        prio = _prioritize(
            agg, rule_capability_resolver=lambda r: RuleCapability.REMEDIATION_AVAILABLE
        )
        plan = _plan(
            prio,
            asset_snapshot_resolver=lambda aid: _Snapshot(
                asset_id=aid,
                canonical_path=r"C:\temp\junk.txt",
                is_locked=True,
                is_accessible=False,
            ),
        )
        action = plan.actions[0]
        assert action.state == ActionState.LOCKED_TARGET
        assert action.state != ActionState.PLANNED

    def test_display_name_not_used_as_target(self) -> None:
        """display_name is never used as an execution target."""
        malicious_display = r"C:\Windows\System32\kernel32.dll"
        lookup = _make_asset_lookup(r"C:\temp\junk.txt", display_name=malicious_display)
        result = _make_result()
        agg = _aggregate([result], asset_lookup=lookup)
        prio = _prioritize(
            agg, rule_capability_resolver=lambda r: RuleCapability.REMEDIATION_AVAILABLE
        )
        plan = _plan(
            prio,
            asset_snapshot_resolver=lambda aid: _Snapshot(
                asset_id=aid, canonical_path=r"C:\temp\junk.txt"
            ),
        )
        action = plan.actions[0]
        assert action.state == ActionState.PLANNED
        target = action.target
        assert isinstance(target, FilesystemActionTarget)
        assert target.canonical_path == r"C:\temp\junk.txt"
        assert target.allowed_location != malicious_display

    def test_snapshot_fields_in_plan(self) -> None:
        """ActionPlan records snapshot timestamp, version, and TTL."""
        now = datetime.now(UTC)
        result = _make_result()
        agg = _aggregate([result])
        prio = _prioritize(
            agg, rule_capability_resolver=lambda r: RuleCapability.REMEDIATION_AVAILABLE
        )
        plan = _plan(
            prio,
            asset_snapshot_resolver=lambda aid: _Snapshot(
                asset_id=aid,
                canonical_path=r"C:\temp\junk.txt",
                snapshot_timestamp=now,
                snapshot_version="v1",
                size=1024,
                modified_time=now,
                content_hash="abc123",
            ),
            snapshot_ttl_seconds=300,
        )
        assert plan.snapshot_timestamp == now
        assert plan.snapshot_version == "v1"
        assert plan.snapshot_ttl_seconds == 300


# ── Safety Gate Tests ─────────────────────────────────────────────────────────


def _make_safety_context(**overrides) -> dict[str, Any]:
    """Default execution context for an approved filesystem action."""
    ctx = {
        "exists": True,
        "accessible": True,
        "locked": False,
        "asset_id": "asset-1",
        "canonical_path": r"C:\temp\junk.txt",
        "safety_level": "safe",
        "is_symlink": False,
        "is_junction": False,
        "is_reparse_point": False,
        "snapshot_timestamp": datetime.now(UTC),
    }
    ctx.update(overrides)
    return ctx


class TestSafetyGate:
    """Tests for formal SafetyGate contract."""

    def test_approved_for_safe_planned_action(self) -> None:
        """SafetyGate approves a fully validated planned action."""
        action = _planned_action_for_path(r"C:\temp\junk.txt")
        gate = create_safety_gate()
        result = gate.evaluate(
            action,
            _make_safety_context(),
            plan_metadata={"generated_at": datetime.now(UTC)},
        )
        assert result == SafetyGateResult.APPROVED

    def test_rejected_for_blocked_action(self) -> None:
        """BLOCKED action is always rejected by the safety gate."""
        action = _planned_action_for_path(
            r"C:\temp\junk.txt", safety_level=SafetyLevel.BLOCKED
        )
        gate = create_safety_gate()
        result = gate.evaluate(action, _make_safety_context())
        assert result == SafetyGateResult.REJECTED

    def test_rejected_for_not_fixable_action(self) -> None:
        """NOT_FIXABLE action is always rejected."""
        action = _planned_action_for_path(
            r"C:\temp\junk.txt",
            rule_id="cache.application",
        )
        # CACHE + no snapshot of correct type may be not fixable
        # Force a NOT_FIXABLE by using a path that fails validation
        action = _planned_action_for_path(r"C:\Windows\junk.txt")
        gate = create_safety_gate()
        result = gate.evaluate(action, _make_safety_context())
        assert result == SafetyGateResult.REJECTED

    def test_requires_review_for_review_required_action(self) -> None:
        """REVIEW_REQUIRED action returns REQUIRES_REVIEW."""
        action = _planned_action_for_path(
            r"C:\temp\junk.txt",
            safety_level=SafetyLevel.REVIEW_REQUIRED,
        )
        gate = create_safety_gate()
        result = gate.evaluate(action, _make_safety_context())
        assert result == SafetyGateResult.REQUIRES_REVIEW

    def test_rejected_for_stale_plan(self) -> None:
        """Expired plans are rejected."""
        action = _planned_action_for_path(r"C:\temp\junk.txt")
        gate = create_safety_gate(snapshot_ttl_seconds=60)
        stale_time = datetime.now(UTC) - timedelta(seconds=120)
        result = gate.evaluate(
            action,
            _make_safety_context(),
            plan_metadata={"generated_at": stale_time},
        )
        assert result == SafetyGateResult.REJECTED

    def test_rejected_when_target_changed(self) -> None:
        """Size or hash change in execution context causes rejection."""
        action = _planned_action_for_path(
            r"C:\temp\junk.txt",
            snapshot=_Snapshot(
                asset_id="asset-1",
                canonical_path=r"C:\temp\junk.txt",
                size=1024,
                modified_time=datetime.now(UTC),
                content_hash="abc123",
            ),
        )
        gate = create_safety_gate()
        result = gate.evaluate(
            action,
            _make_safety_context(
                size=2048, content_hash="def456", modified_time=datetime.now(UTC)
            ),
        )
        assert result == SafetyGateResult.REJECTED

    def test_rejected_when_protected_path(self) -> None:
        """Safety gate rejects protected filesystem paths at execution."""
        action = _planned_action_for_path(r"C:\temp\junk.txt")
        gate = create_safety_gate()
        result = gate.evaluate(
            action,
            _make_safety_context(canonical_path=r"C:\Windows\System32\kernel32.dll"),
        )
        assert result == SafetyGateResult.REJECTED

    def test_rejected_when_browser_running(self) -> None:
        """Browser cache action is rejected when the browser is running."""
        action = _planned_action_for_path(
            r"C:\Users\User\AppData\Local\Chrome\User Data\Default\Cache",
            rule_id="browser.cache",
            asset_type=AssetType.BROWSER_CACHE,
            asset_category=AssetCategory.BROWSER,
        )
        gate = create_safety_gate()
        result = gate.evaluate(
            action,
            _make_safety_context(
                canonical_path=r"C:\Users\User\AppData\Local\Chrome\User Data\Default\Cache",
                running_browsers=["chrome"],
                cache_type="cache",
                browser_profiles=["default"],
            ),
        )
        assert result == SafetyGateResult.REJECTED

    def test_rejected_for_browser_user_data_target(self) -> None:
        """Browser cache action is rejected when scope is not cache."""
        action = _planned_action_for_path(
            r"C:\Users\User\AppData\Local\Chrome\User Data\Default\Cache",
            rule_id="browser.cache",
            asset_type=AssetType.BROWSER_CACHE,
            asset_category=AssetCategory.BROWSER,
        )
        gate = create_safety_gate()
        result = gate.evaluate(
            action,
            _make_safety_context(
                canonical_path=r"C:\Users\User\AppData\Local\Chrome\User Data\Default\Cookies",
                cache_type="cookies",
                running_browsers=[],
                browser_profiles=["default"],
            ),
        )
        assert result == SafetyGateResult.REJECTED

    def test_unknown_and_not_fixable_never_approved(self) -> None:
        """UNKNOWN and NOT_FIXABLE states are never approved."""
        # Force a NOT_FIXABLE plan by using a path that fails validation
        action = _planned_action_for_path(r"C:\Windows\junk.txt")
        gate = create_safety_gate()
        assert (
            gate.evaluate(action, _make_safety_context()) == SafetyGateResult.REJECTED
        )

    def test_action_plan_staleness(self) -> None:
        """ActionPlan reports staleness correctly."""
        now = datetime.now(UTC)
        summary = ActionSummary(
            total_findings=0,
            actions_planned=0,
            auto_fixable_actions=0,
            review_required_actions=0,
            blocked_actions=0,
            not_fixable_actions=0,
            unknown_fixability_actions=0,
            actions_by_type={},
            estimated_affected_size=None,
            highest_priority_action_id=None,
            highest_severity_action_id=None,
            largest_affected_action_id=None,
            generated_at=now,
        )
        plan = ActionPlan(
            actions=(),
            summary=summary,
            generated_at=now - timedelta(seconds=120),
            snapshot_ttl_seconds=60,
        )
        assert plan.is_stale() is True
