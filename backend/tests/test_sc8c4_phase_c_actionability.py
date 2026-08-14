"""
SC-8C4 Phase C — Actionability / Capability Contract Tests.

Validates that the capability contract controls which findings become
executable actions and that unsupported/detection-only findings never reach
the execution engine.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Optional

from avs_backend.scan_core.assets import AssetCategory, AssetType
from avs_backend.scan_core.execution import (
    BackupManager,
    DefaultExecutor,
    ExecutionRequest,
    ExecutionStatus,
    FilesystemContext,
)
from avs_backend.scan_core.rules.action import (
    ActionPlan,
    ActionPlanner,
    ActionState,
    ActionType,
)
from avs_backend.scan_core.rules.actionability import (
    Actionability,
    CapabilityContract,
)
from avs_backend.scan_core.rules.actionability_audit import (
    audit_registry,
    coverage_statistics,
)
from avs_backend.scan_core.rules.aggregation import DetectionAggregator
from avs_backend.scan_core.rules.confidence import Confidence, ConfidenceScore
from avs_backend.scan_core.rules.detection.junk_rules import register_junk_rules
from avs_backend.scan_core.rules.enums import ActionType as RuleActionType
from avs_backend.scan_core.rules.enums import (
    ConfidenceFactor,
    EvidenceType,
    RuleCategory,
    SafetyBlocker,
    SafetyLevel,
    Severity,
)
from avs_backend.scan_core.rules.evidence import Evidence, EvidenceCollection
from avs_backend.scan_core.rules.priority import (
    FindingPrioritizer,
    Fixability,
    RuleCapability,
)
from avs_backend.scan_core.rules.registry import RuleRegistry
from avs_backend.scan_core.rules.result import RuleMatchStatus, RuleResult
from avs_backend.scan_core.rules.safety import SafetyAssessment


@dataclass
class _Snapshot:
    exists: bool = True
    is_accessible: bool = True
    is_locked: bool = False
    canonical_path: str = ""
    asset_id: str = "asset-0"
    size: Optional[int] = None
    content_hash: Optional[str] = None
    content_fingerprint: Optional[str] = None
    modified_time: Optional[datetime] = None
    snapshot_timestamp: Optional[datetime] = None
    snapshot_version: Optional[str] = None
    is_symlink: bool = False
    is_junction: bool = False
    is_reparse_point: bool = False


def _make_confidence(score: float = 90.0) -> Confidence:
    return Confidence(
        score=score,
        factors=(
            ConfidenceScore(
                factor=ConfidenceFactor.RULE_CERTAINTY,
                score=score,
                description="test",
            ),
        ),
    )


def _make_evidence() -> EvidenceCollection:
    return EvidenceCollection(
        items=(
            Evidence(
                evidence_type=EvidenceType.PATH_MATCH,
                description="Test",
                source="test",
                value="x",
                weight=1.0,
            ),
        )
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


def _make_result(
    rule_id: str = "junk.temp.test",
    asset_id: str = "asset-0",
    severity: Severity = Severity.LOW,
    safety_level: SafetyLevel = SafetyLevel.SAFE,
    status: RuleMatchStatus = RuleMatchStatus.MATCHED,
    estimated_size: Optional[int] = 100,
) -> RuleResult:
    return RuleResult(
        rule_id=rule_id,
        rule_version="1.0.0",
        asset_id=asset_id,
        status=status,
        severity=severity,
        confidence=_make_confidence(),
        safety=_make_safety(safety_level),
        reason="test detection",
        evidence=_make_evidence(),
        recommended_action=RuleActionType.DELETE,
        estimated_size=estimated_size,
        evaluated_at=datetime.now(UTC),
    )


def _rule_category_resolver(rule_id: str) -> RuleCategory:
    if rule_id.startswith("junk"):
        return RuleCategory.JUNK
    if rule_id.startswith("temp") or rule_id.startswith("cache.windowsupdate"):
        return RuleCategory.TEMPORARY
    if rule_id.startswith("cache"):
        return RuleCategory.CACHE
    if rule_id.startswith("registry"):
        return RuleCategory.REGISTRY
    if rule_id.startswith("browser"):
        return RuleCategory.BROWSER
    if rule_id.startswith("startup"):
        return RuleCategory.STARTUP
    if rule_id.startswith("perf"):
        return RuleCategory.PERFORMANCE
    if rule_id.startswith("security"):
        return RuleCategory.SECURITY
    return RuleCategory.JUNK


def _make_prioritized_result(
    rule_id: str,
    asset_type: AssetType,
    canonical_path: str,
    *,
    safety_level: SafetyLevel = SafetyLevel.SAFE,
    rule_capability: RuleCapability = RuleCapability.REMEDIATION_AVAILABLE,
):
    result = _make_result(rule_id=rule_id, safety_level=safety_level)
    aggregator = DetectionAggregator(
        asset_lookup=lambda aid: (
            asset_type,
            AssetCategory.FILESYSTEM,
            "Test",
            canonical_path,
        ),
        rule_category_resolver=_rule_category_resolver,
    )
    agg = aggregator.aggregate([result])
    return FindingPrioritizer(
        rule_capability_resolver=lambda r: rule_capability
    ).prioritize(agg)


def _make_planner() -> ActionPlanner:
    return ActionPlanner(
        asset_snapshot_resolver=lambda aid: _Snapshot(
            canonical_path="",
            snapshot_timestamp=datetime.now(UTC),
            snapshot_version="1",
        ),
    )


class TestCapabilityContract:
    """CapabilityContract verdicts for category/asset/action combinations."""

    def _resolve(
        self,
        category: RuleCategory,
        asset_type: AssetType,
        action_type_value: Optional[str],
        *,
        safety_level: SafetyLevel = SafetyLevel.SAFE,
        fixability: Fixability = Fixability.AUTO_FIXABLE,
        rule_capability: RuleCapability = RuleCapability.REMEDIATION_AVAILABLE,
    ) -> Actionability:
        contract = CapabilityContract()
        return contract.resolve(
            category=category,
            asset_type=asset_type,
            action_type_value=action_type_value,
            safety=_make_safety(safety_level),
            fixability=fixability,
            rule_capability=rule_capability,
        )

    def test_junk_file_delete_actionable(self):
        assert (
            self._resolve(RuleCategory.JUNK, AssetType.FILE, "delete_file")
            == Actionability.ACTIONABLE
        )

    def test_temporary_directory_delete_actionable(self):
        assert (
            self._resolve(
                RuleCategory.TEMPORARY, AssetType.DIRECTORY, "delete_directory"
            )
            == Actionability.ACTIONABLE
        )

    def test_cache_file_clear_cache_actionable(self):
        assert (
            self._resolve(RuleCategory.CACHE, AssetType.FILE, "clear_cache")
            == Actionability.ACTIONABLE
        )

    def test_registry_value_remove_actionable(self):
        assert (
            self._resolve(
                RuleCategory.REGISTRY, AssetType.REGISTRY_VALUE, "remove_registry_value"
            )
            == Actionability.ACTIONABLE
        )

    def test_startup_entry_disable_actionable(self):
        assert (
            self._resolve(
                RuleCategory.STARTUP,
                AssetType.STARTUP_ENTRY,
                "disable_startup_entry",
            )
            == Actionability.ACTIONABLE
        )

    def test_browser_cache_clear_actionable(self):
        assert (
            self._resolve(
                RuleCategory.BROWSER,
                AssetType.BROWSER_CACHE,
                "clear_browser_cache",
            )
            == Actionability.ACTIONABLE
        )

    def test_unknown_category_unsupported(self):
        assert (
            self._resolve(RuleCategory.NETWORK, AssetType.FILE, "delete_file")
            == Actionability.UNSUPPORTED
        )

    def test_incompatible_asset_unsupported(self):
        assert (
            self._resolve(RuleCategory.JUNK, AssetType.REGISTRY_VALUE, "delete_file")
            == Actionability.UNSUPPORTED
        )

    def test_blocked_safety_overrides_actionable(self):
        assert (
            self._resolve(
                RuleCategory.JUNK,
                AssetType.FILE,
                "delete_file",
                safety_level=SafetyLevel.BLOCKED,
            )
            == Actionability.BLOCKED
        )

    def test_review_required_safety_overrides_actionable(self):
        assert (
            self._resolve(
                RuleCategory.JUNK,
                AssetType.FILE,
                "delete_file",
                safety_level=SafetyLevel.REVIEW_REQUIRED,
            )
            == Actionability.REVIEW_REQUIRED
        )

    def test_high_risk_fixability_detection_only(self):
        assert (
            self._resolve(
                RuleCategory.JUNK,
                AssetType.FILE,
                "delete_file",
                fixability=Fixability.NOT_FIXABLE,
            )
            == Actionability.DETECTION_ONLY
        )

    def test_no_remediation_detection_only(self):
        assert (
            self._resolve(
                RuleCategory.JUNK,
                AssetType.FILE,
                "delete_file",
                rule_capability=RuleCapability.NO_REMEDIATION,
            )
            == Actionability.DETECTION_ONLY
        )

    def test_review_required_capability_review_required(self):
        assert (
            self._resolve(
                RuleCategory.JUNK,
                AssetType.FILE,
                "delete_file",
                rule_capability=RuleCapability.REVIEW_REQUIRED,
            )
            == Actionability.REVIEW_REQUIRED
        )

    def test_missing_action_type_unsupported(self):
        assert (
            self._resolve(RuleCategory.JUNK, AssetType.FILE, None)
            == Actionability.UNSUPPORTED
        )


class TestActionPlanner:
    """ActionPlanner enforces the capability contract on real findings."""

    def _plan(
        self,
        rule_id: str,
        asset_type: AssetType,
        canonical_path: str,
        *,
        safety_level: SafetyLevel = SafetyLevel.SAFE,
    ) -> ActionPlan:
        prio = _make_prioritized_result(
            rule_id, asset_type, canonical_path, safety_level=safety_level
        )
        snapshot = _Snapshot(
            canonical_path=canonical_path,
            snapshot_timestamp=datetime.now(UTC),
            snapshot_version="1",
        )
        return ActionPlanner(
            asset_snapshot_resolver=lambda aid: snapshot,
        ).plan(prio)

    def test_junk_file_planned_delete(self, tmp_path: Path):
        target = tmp_path / "junk.txt"
        target.write_bytes(b"junk")
        plan = self._plan("junk.temp.test", AssetType.FILE, str(target))
        assert len(plan.actions) == 1
        action = plan.actions[0]
        assert action.action_type == ActionType.DELETE_FILE
        assert action.state == ActionState.PLANNED
        assert action.target is not None

    def test_temporary_directory_planned_delete(self, tmp_path: Path):
        target = tmp_path / "tempdir"
        target.mkdir()
        plan = self._plan("temp.windows.test", AssetType.DIRECTORY, str(target))
        action = plan.actions[0]
        assert action.action_type == ActionType.DELETE_DIRECTORY
        assert action.state == ActionState.PLANNED

    def test_cache_file_planned_clear_cache(self, tmp_path: Path):
        target = tmp_path / "cache"
        target.mkdir()
        plan = self._plan("cache.browser.test", AssetType.FILE, str(target))
        action = plan.actions[0]
        assert action.action_type == ActionType.CLEAR_CACHE
        assert action.state == ActionState.PLANNED

    def test_registry_value_planned_remove(self):
        path = "HKCU\\Software\\Vendor"
        plan = self._plan("registry.vendor.value", AssetType.REGISTRY_VALUE, path)
        action = plan.actions[0]
        assert action.action_type == ActionType.REMOVE_REGISTRY_VALUE
        assert action.state == ActionState.PLANNED

    def test_registry_key_planned_remove(self):
        path = "HKCU\\Software\\Vendor"
        plan = self._plan("registry.vendor.key", AssetType.REGISTRY_KEY, path)
        action = plan.actions[0]
        assert action.action_type == ActionType.REMOVE_REGISTRY_KEY
        assert action.state == ActionState.PLANNED

    def test_startup_entry_planned_disable(self):
        plan = self._plan("startup.vendor.app", AssetType.STARTUP_ENTRY, "startup\\app")
        action = plan.actions[0]
        assert action.action_type == ActionType.DISABLE_STARTUP_ENTRY
        assert action.state == ActionState.PLANNED

    def test_browser_cache_planned_clear(self):
        path = "C:\\Users\\x\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cache"
        plan = self._plan("browser.chrome.cache", AssetType.BROWSER_CACHE, path)
        action = plan.actions[0]
        assert action.action_type == ActionType.CLEAR_BROWSER_CACHE
        assert action.state == ActionState.PLANNED

    def test_unsupported_category_not_fixable(self, tmp_path: Path):
        target = tmp_path / "perf.log"
        target.write_bytes(b"log")
        plan = self._plan("perf.slow.test", AssetType.FILE, str(target))
        action = plan.actions[0]
        assert action.action_type == ActionType.NONE
        assert action.state == ActionState.NOT_FIXABLE

    def test_blocked_finding_blocked(self, tmp_path: Path):
        target = tmp_path / "junk.txt"
        target.write_bytes(b"junk")
        plan = self._plan(
            "junk.temp.test",
            AssetType.FILE,
            str(target),
            safety_level=SafetyLevel.BLOCKED,
        )
        action = plan.actions[0]
        assert action.action_type == ActionType.NONE
        assert action.state == ActionState.BLOCKED

    def test_review_required_finding_review(self, tmp_path: Path):
        target = tmp_path / "junk.txt"
        target.write_bytes(b"junk")
        plan = self._plan(
            "junk.temp.test",
            AssetType.FILE,
            str(target),
            safety_level=SafetyLevel.REVIEW_REQUIRED,
        )
        action = plan.actions[0]
        assert action.action_type == ActionType.NONE
        assert action.state == ActionState.REVIEW_REQUIRED

    def test_unknown_asset_type_unsupported(self, tmp_path: Path):
        target = tmp_path / "junk.txt"
        target.write_bytes(b"junk")
        plan = self._plan("junk.temp.test", AssetType.DRIVE, str(target))
        action = plan.actions[0]
        assert action.action_type == ActionType.NONE
        assert action.state == ActionState.NOT_FIXABLE


class TestAuditAndCoverage:
    """Audit the currently registered rules and compute coverage statistics."""

    def test_junk_rules_audit_matrix(self):
        registry = RuleRegistry()
        register_junk_rules(registry)
        rows = audit_registry(registry)
        assert rows
        for row in rows:
            assert "rule_id" in row
            assert "category" in row
            assert "asset_type" in row
            assert "actionability" in row

    def test_coverage_statistics(self):
        registry = RuleRegistry()
        register_junk_rules(registry)
        stats = coverage_statistics(registry)
        assert stats["total_rules"] == len(registry.list_enabled())
        assert stats["total_rows"] == len(audit_registry(registry))
        assert "actionable" in stats
        assert "unsupported" in stats
        assert "supported_action_types" in stats
        assert stats["supported_action_type_count"] > 0

    def test_browser_cache_browser_asset_has_no_executor(self):
        # BrowserCacheRule supports FILE and BROWSER_CACHE, but only FILE maps to a
        # supported remediation action through the current filesystem contract.
        registry = RuleRegistry()
        register_junk_rules(registry)
        rows = audit_registry(registry)
        browser_cache_rows = [
            r for r in rows if r["rule_id"].startswith("cache.browser")
        ]
        assert browser_cache_rows
        unsupported = [
            r
            for r in browser_cache_rows
            if r["actionability"] == Actionability.UNSUPPORTED.value
        ]
        assert (
            unsupported
        ), "Expected BROWSER_CACHE asset for BrowserCacheRule to be unsupported"

    def test_actionability_values_are_contract_strings(self):
        registry = RuleRegistry()
        register_junk_rules(registry)
        allowed = {v.value for v in Actionability}
        for row in audit_registry(registry):
            assert row["actionability"] in allowed


class TestExecutorIntegration:
    """Unsupported / detection-only findings must not be dispatched."""

    def test_unsupported_finding_never_reaches_default_executor(self, tmp_path: Path):
        target = tmp_path / "perf.log"
        target.write_bytes(b"log")
        prio = _make_prioritized_result(
            "perf.slow.test",
            AssetType.FILE,
            str(target),
        )
        snapshot = _Snapshot(
            canonical_path=str(target),
            snapshot_timestamp=datetime.now(UTC),
            snapshot_version="1",
        )
        plan = ActionPlanner(
            asset_snapshot_resolver=lambda aid: snapshot,
        ).plan(prio)

        # The planner must not produce an executable action.
        assert all(a.action_type == ActionType.NONE for a in plan.actions)

        request = ExecutionRequest(plan=plan, mode="dry_run")
        executor = DefaultExecutor(backup_manager=BackupManager(tmp_path / "backups"))
        summary = executor.execute(request)

        # The executor rejects the detection-only action before any target
        # executor is invoked.
        assert summary.status == ExecutionStatus.REJECTED
        for result in summary.results:
            assert result.status == ExecutionStatus.REJECTED
            assert "SafetyGate" in result.reason

    def test_supported_file_action_still_runs(self, tmp_path: Path):
        target = tmp_path / "junk.txt"
        target.write_bytes(b"junk")
        prio = _make_prioritized_result("junk.temp.test", AssetType.FILE, str(target))
        snapshot = _Snapshot(
            canonical_path=str(target),
            snapshot_timestamp=datetime.now(UTC),
            snapshot_version="1",
        )
        plan = ActionPlanner(
            asset_snapshot_resolver=lambda aid: snapshot,
        ).plan(prio)

        assert len(plan.actions) == 1
        action = plan.actions[0]
        assert action.action_type == ActionType.DELETE_FILE

        context = FilesystemContext(
            exists=True,
            accessible=True,
            locked=False,
            canonical_path=str(target),
            asset_id=action.asset_id,
            safety_level="safe",
            size=len(b"junk"),
            content_hash="dummy",
        ).to_dict()
        context["snapshot_timestamp"] = datetime.now(UTC)
        context["snapshot_version"] = "1"

        request = ExecutionRequest(
            plan=plan,
            mode="dry_run",
            execution_context={action.action_id: context},
        )
        executor = DefaultExecutor(backup_manager=BackupManager(tmp_path / "backups"))
        summary = executor.execute(request)

        assert summary.status == ExecutionStatus.DRY_RUN
