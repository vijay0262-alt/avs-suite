"""
SC-8C4 Part 3 — Safe Windows Registry remediation tests.

Live tests are Windows-only and use isolated keys under HKCU.
No critical system registry area is modified.
"""

from __future__ import annotations

import sys
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Optional

import pytest

from avs_backend.scan_core.assets import AssetCategory, AssetType
from avs_backend.scan_core.execution import (
    DefaultExecutor,
    ExecutionRequest,
    ExecutionStatus,
    RegistryBackup,
    RegistryContext,
)
from avs_backend.scan_core.rules.action import ActionPlan, ActionPlanner
from avs_backend.scan_core.rules.aggregation import DetectionAggregator
from avs_backend.scan_core.rules.confidence import Confidence, ConfidenceScore
from avs_backend.scan_core.rules.enums import (
    ActionType,
    ConfidenceFactor,
    EvidenceType,
    RuleCategory,
    Severity,
)
from avs_backend.scan_core.rules.evidence import Evidence, EvidenceCollection
from avs_backend.scan_core.rules.priority import FindingPrioritizer, RuleCapability
from avs_backend.scan_core.rules.result import RuleMatchStatus, RuleResult
from avs_backend.scan_core.rules.safety import SafetyAssessment

if sys.platform == "win32":
    import winreg  # type: ignore[import]
else:
    winreg = None  # type: ignore


@dataclass
class _Snapshot:
    exists: bool = True
    is_accessible: bool = True
    is_locked: bool = False
    canonical_path: str = ""
    asset_id: str = "asset-0"
    size: Optional[int] = None
    content_hash: Optional[str] = None
    modified_time: Optional[datetime] = None
    snapshot_timestamp: Optional[datetime] = None
    snapshot_version: Optional[str] = None
    is_symlink: bool = False
    is_junction: bool = False
    is_reparse_point: bool = False


# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_confidence() -> Confidence:
    return Confidence(
        score=90.0,
        factors=(
            ConfidenceScore(
                factor=ConfidenceFactor.RULE_CERTAINTY,
                score=90.0,
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


def _make_result(
    rule_id: str = "registry.unused.value",
    asset_id: str = "asset-0",
) -> RuleResult:
    return RuleResult(
        rule_id=rule_id,
        rule_version="1.0.0",
        asset_id=asset_id,
        status=RuleMatchStatus.MATCHED,
        severity=Severity.LOW,
        confidence=_make_confidence(),
        safety=SafetyAssessment.create_safe("safe"),
        reason="x",
        evidence=_make_evidence(),
        recommended_action=ActionType.DELETE,
        estimated_size=100,
        evaluated_at=datetime.now(UTC),
    )


def _rule_category_resolver(rule_id: str) -> RuleCategory:
    if rule_id.startswith("registry"):
        return RuleCategory.REGISTRY
    return RuleCategory.REGISTRY


def _make_registry_plan(
    *,
    canonical_path: str,
    asset_id: str,
    asset_type: AssetType,
    value_type: Optional[str] = None,
    value_data: Any = None,
) -> tuple[ActionPlan, dict[str, Any]]:
    """Create a single-action registry plan."""
    lookup = {
        asset_id: (
            asset_type,
            AssetCategory.REGISTRY,
            "Test",
            canonical_path,
        )
    }
    result = _make_result(asset_id=asset_id)
    agg = DetectionAggregator(
        asset_lookup=lambda aid: lookup.get(
            aid, (AssetType.UNKNOWN, AssetCategory.UNKNOWN, f"U {aid}", "")
        ),
        rule_category_resolver=_rule_category_resolver,
    ).aggregate([result])
    prio = FindingPrioritizer(
        rule_capability_resolver=lambda r: RuleCapability.REMEDIATION_AVAILABLE
    ).prioritize(agg)
    plan = ActionPlanner(
        asset_snapshot_resolver=lambda aid: _Snapshot(
            canonical_path=canonical_path,
            asset_id=aid,
        ),
    ).plan(prio)

    parts = canonical_path.split("\\")
    hive = parts[0] if parts else "HKCU"
    key = "\\".join(parts[1:]) if len(parts) > 1 else ""
    value_name = asset_id if asset_type == AssetType.REGISTRY_VALUE else None

    ctx = RegistryContext(
        exists=True,
        accessible=True,
        locked=False,
        hive=hive,
        key=key,
        value=value_name,
        key_exists=True,
        value_exists=value_name is not None,
        value_type=value_type,
        value_data=value_data,
        view="default",
        asset_id=asset_id,
        safety_level="safe",
    ).to_dict()

    return plan, ctx


@pytest.fixture
def live_registry_executor() -> DefaultExecutor:
    return DefaultExecutor(registry_backup=RegistryBackup())


@pytest.fixture
def dry_executor() -> DefaultExecutor:
    return DefaultExecutor()


# ── Dry-Run ───────────────────────────────────────────────────────────────────


class TestDryRun:
    def test_dry_run_does_not_modify_registry(self, dry_executor):
        plan, ctx = _make_registry_plan(
            canonical_path=r"HKCU\Software\AVS-Test-Dry",
            asset_id="ValueToRemove",
            asset_type=AssetType.REGISTRY_VALUE,
            value_type="REG_SZ",
            value_data="data",
        )
        request = ExecutionRequest(
            plan=plan,
            mode="dry_run",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = dry_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.DRY_RUN
        assert summary.results[0].dry_run_info is not None
        assert summary.results[0].backup_identity is None

    def test_dry_run_shows_what_would_happen(self, dry_executor):
        plan, ctx = _make_registry_plan(
            canonical_path=r"HKCU\Software\AVS-Test-Dry2",
            asset_id="Value",
            asset_type=AssetType.REGISTRY_VALUE,
            value_type="REG_SZ",
            value_data="x",
        )
        request = ExecutionRequest(
            plan=plan,
            mode="dry_run",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = dry_executor.execute(request)
        info = summary.results[0].dry_run_info
        assert info.get("hive") == "HKCU"
        assert info.get("key") == r"Software\AVS-Test-Dry2"
        assert info.get("value_name") == "Value"


# ── Live Windows-Only Tests ───────────────────────────────────────────────────


@pytest.mark.skipif(winreg is None, reason="Windows registry not available")
class TestLiveValueRemoval:
    @pytest.fixture(autouse=True)
    def isolated_test_key(self):
        """Create and clean up an isolated HKCU test key."""
        self.test_root = f"Software\\AVS-Suite-Test-{uuid.uuid4()}"
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, self.test_root) as _:
            pass
        yield self.test_root
        try:
            with winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                "Software",
                0,
                winreg.KEY_ALL_ACCESS,
            ) as handle:
                winreg.DeleteKey(handle, self.test_root.split("\\")[-1])
        except OSError:
            pass

    def _set_value(self, key: str, value_name: str, data: Any, vtype: int) -> None:
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key) as handle:
            winreg.SetValueEx(handle, value_name, 0, vtype, data)

    def _value_exists(self, key: str, value_name: str) -> bool:
        try:
            with winreg.OpenKey(
                winreg.HKEY_CURRENT_USER, key, 0, winreg.KEY_READ
            ) as handle:
                winreg.QueryValueEx(handle, value_name)
            return True
        except FileNotFoundError:
            return False

    def test_successful_value_deletion(self, live_registry_executor, isolated_test_key):
        value_name = "DeleteMe"
        self._set_value(isolated_test_key, value_name, "original", winreg.REG_SZ)
        canonical = f"HKCU\\{isolated_test_key}"
        plan, ctx = _make_registry_plan(
            canonical_path=canonical,
            asset_id=value_name,
            asset_type=AssetType.REGISTRY_VALUE,
            value_type="REG_SZ",
            value_data="original",
        )
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = live_registry_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.COMPLETED
        assert not self._value_exists(isolated_test_key, value_name)

    def test_changed_value_data_fails(self, live_registry_executor, isolated_test_key):
        value_name = "ChangedMe"
        self._set_value(isolated_test_key, value_name, "original", winreg.REG_SZ)
        canonical = f"HKCU\\{isolated_test_key}"
        plan, ctx = _make_registry_plan(
            canonical_path=canonical,
            asset_id=value_name,
            asset_type=AssetType.REGISTRY_VALUE,
            value_type="REG_SZ",
            value_data="original",
        )
        self._set_value(isolated_test_key, value_name, "modified", winreg.REG_SZ)
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = live_registry_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.FAILED
        assert "VALUE_DATA_MISMATCH" in summary.results[0].error.code

    def test_wrong_type_fails(self, live_registry_executor, isolated_test_key):
        value_name = "WrongType"
        self._set_value(isolated_test_key, value_name, 123, winreg.REG_DWORD)
        canonical = f"HKCU\\{isolated_test_key}"
        plan, ctx = _make_registry_plan(
            canonical_path=canonical,
            asset_id=value_name,
            asset_type=AssetType.REGISTRY_VALUE,
            value_type="REG_SZ",
            value_data=123,
        )
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = live_registry_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.FAILED
        assert summary.results[0].error.code == "VALUE_TYPE_MISMATCH"

    def test_rollback_restores_value(self, live_registry_executor, isolated_test_key):
        value_name = "RollMeBack"
        self._set_value(isolated_test_key, value_name, "keep", winreg.REG_SZ)
        canonical = f"HKCU\\{isolated_test_key}"
        plan, ctx = _make_registry_plan(
            canonical_path=canonical,
            asset_id=value_name,
            asset_type=AssetType.REGISTRY_VALUE,
            value_type="REG_SZ",
            value_data="keep",
        )
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = live_registry_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.COMPLETED
        record = live_registry_executor.registry_backup.get(
            summary.results[0].backup_identity
        )
        assert record is not None
        restore_result = live_registry_executor.registry_backup.restore(record)
        assert restore_result.success
        assert self._value_exists(isolated_test_key, value_name)

    def test_idempotent_reexecution(self, live_registry_executor, isolated_test_key):
        value_name = "Idempotent"
        self._set_value(isolated_test_key, value_name, "x", winreg.REG_SZ)
        canonical = f"HKCU\\{isolated_test_key}"
        plan, ctx = _make_registry_plan(
            canonical_path=canonical,
            asset_id=value_name,
            asset_type=AssetType.REGISTRY_VALUE,
            value_type="REG_SZ",
            value_data="x",
        )
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        first = live_registry_executor.execute(request)
        assert first.results[0].status == ExecutionStatus.COMPLETED
        second = live_registry_executor.execute(request)
        assert second.results[0].status == ExecutionStatus.SKIPPED

    def test_missing_value_fails(self, live_registry_executor, isolated_test_key):
        canonical = f"HKCU\\{isolated_test_key}"
        plan, ctx = _make_registry_plan(
            canonical_path=canonical,
            asset_id="MissingValue",
            asset_type=AssetType.REGISTRY_VALUE,
            value_type="REG_SZ",
            value_data="x",
        )
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = live_registry_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.FAILED

    def test_audit_trail(self, live_registry_executor, isolated_test_key):
        value_name = "Audit"
        self._set_value(isolated_test_key, value_name, "before", winreg.REG_SZ)
        canonical = f"HKCU\\{isolated_test_key}"
        plan, ctx = _make_registry_plan(
            canonical_path=canonical,
            asset_id=value_name,
            asset_type=AssetType.REGISTRY_VALUE,
            value_type="REG_SZ",
            value_data="before",
        )
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = live_registry_executor.execute(request)
        result = summary.results[0]
        assert result.before_state.get("registry_value_exists") is True
        assert result.after_state.get("registry_value_exists") is False
        assert result.operation == "remove_registry_value"
        assert result.backup_identity is not None


@pytest.mark.skipif(winreg is None, reason="Windows registry not available")
class TestLiveKeyRemoval:
    @pytest.fixture(autouse=True)
    def isolated_subkey(self):
        self.test_root = f"Software\\AVS-Suite-KeyTest-{uuid.uuid4()}"
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, self.test_root) as _:
            pass
        self.child = f"{self.test_root}\\EmptyChild"
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, self.child) as _:
            pass
        yield self.child
        try:
            with winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                self.test_root,
                0,
                winreg.KEY_ALL_ACCESS,
            ) as handle:
                winreg.DeleteKey(handle, "EmptyChild")
            with winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                "Software",
                0,
                winreg.KEY_ALL_ACCESS,
            ) as handle:
                winreg.DeleteKey(handle, self.test_root.split("\\")[-1])
        except OSError:
            pass

    def test_successful_empty_key_deletion(
        self, live_registry_executor, isolated_subkey
    ):
        canonical = f"HKCU\\{isolated_subkey}"
        plan, ctx = _make_registry_plan(
            canonical_path=canonical,
            asset_id="EmptyChild",
            asset_type=AssetType.REGISTRY_KEY,
        )
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = live_registry_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.COMPLETED


# ── Safety and Rejection ──────────────────────────────────────────────────────


class TestSafety:
    def test_protected_key_rejected(self, dry_executor):
        plan, ctx = _make_registry_plan(
            canonical_path=r"HKLM\SYSTEM\CurrentControlSet\Services",
            asset_id="Services",
            asset_type=AssetType.REGISTRY_KEY,
        )
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = dry_executor.execute(request)
        assert summary.results[0].status in (
            ExecutionStatus.REJECTED,
            ExecutionStatus.FAILED,
        )

    def test_invalid_hive_rejected(self, dry_executor):
        plan, ctx = _make_registry_plan(
            canonical_path=r"XX\Software\Bad",
            asset_id="Bad",
            asset_type=AssetType.REGISTRY_VALUE,
        )
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = dry_executor.execute(request)
        assert summary.results[0].status in (
            ExecutionStatus.REJECTED,
            ExecutionStatus.FAILED,
        )

    def test_traversal_rejected(self, dry_executor):
        plan, ctx = _make_registry_plan(
            canonical_path=r"HKCU\Software\..",
            asset_id="Run",
            asset_type=AssetType.REGISTRY_VALUE,
        )
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = dry_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.REJECTED

    def test_stale_plan_rejected(self, dry_executor):
        old = datetime.now(UTC)
        old = old.replace(year=old.year - 2)
        plan, ctx = _make_registry_plan(
            canonical_path=r"HKCU\Software\AVS-Stale",
            asset_id="Value",
            asset_type=AssetType.REGISTRY_VALUE,
        )
        plan = ActionPlan(
            actions=plan.actions,
            summary=plan.summary,
            generated_at=old,
        )
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = dry_executor.execute(request)
        assert summary.rejected == 1
        assert summary.total == 0

    def test_100_registry_actions_routed_through_safety_gate(self, dry_executor):
        results = [_make_result(asset_id=f"value-{i}") for i in range(100)]
        lookup = {
            f"value-{i}": (
                AssetType.REGISTRY_VALUE,
                AssetCategory.REGISTRY,
                "Test",
                r"HKCU\Software\AVS-100",
            )
            for i in range(100)
        }
        # Inject an unsafe protected path for one action.
        lookup["value-50"] = (
            AssetType.REGISTRY_VALUE,
            AssetCategory.REGISTRY,
            "Test",
            r"HKLM\SYSTEM\CurrentControlSet\Services",
        )
        agg = DetectionAggregator(
            asset_lookup=lambda aid: lookup.get(
                aid, (AssetType.UNKNOWN, AssetCategory.UNKNOWN, f"U {aid}", "")
            ),
            rule_category_resolver=_rule_category_resolver,
        ).aggregate(results)
        prio = FindingPrioritizer(
            rule_capability_resolver=lambda r: RuleCapability.REMEDIATION_AVAILABLE
        ).prioritize(agg)
        plan = ActionPlanner(
            asset_snapshot_resolver=lambda aid: _Snapshot(
                canonical_path=lookup[aid][3],
                asset_id=aid,
            ),
        ).plan(prio)
        request = ExecutionRequest(plan=plan, mode="dry_run")
        summary = dry_executor.execute(request)
        assert summary.total == 100
        assert any(r.status == ExecutionStatus.REJECTED for r in summary.results)
