"""
SC-8C4 Part 5 — Safe Windows startup remediation tests.

All destructive operations use temporary isolated registry keys and
pytest temporary directories. No real machine startup configuration
is modified.
"""

from __future__ import annotations

import os
import sys
import uuid

if sys.platform == "win32":
    import winreg
else:
    winreg = None  # type: ignore[misc]
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Optional

import pytest

from avs_backend.scan_core.assets import AssetCategory, AssetType
from avs_backend.scan_core.execution import (
    BackupManager,
    DefaultExecutor,
    ExecutionRequest,
    ExecutionStatus,
    RegistryBackup,
    StartupContext,
)
from avs_backend.scan_core.rules.action import ActionPlan, ActionPlanner
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

pytestmark = [
    pytest.mark.skipif(
        sys.platform != "win32", reason="Windows startup remediation only"
    )
]


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
    rule_id: str = "startup.user.app",
    asset_id: str = "asset-0",
    safety: Optional[SafetyAssessment] = None,
) -> RuleResult:
    return RuleResult(
        rule_id=rule_id,
        rule_version="1.0.0",
        asset_id=asset_id,
        status=RuleMatchStatus.MATCHED,
        severity=Severity.LOW,
        confidence=_make_confidence(),
        safety=safety or SafetyAssessment.create_safe("test"),
        reason="x",
        evidence=_make_evidence(),
        recommended_action=ActionType.DELETE,
        estimated_size=100,
        evaluated_at=datetime.now(UTC),
    )


def _rule_category_resolver(rule_id: str) -> RuleCategory:
    if rule_id.lower().startswith("startup"):
        return RuleCategory.STARTUP
    return RuleCategory.STARTUP


def _make_startup_plan(
    *,
    entry_id: str,
    rule_id: str = "startup.user.app",
    asset_id: str = "asset-0",
    safety: Optional[SafetyAssessment] = None,
    size: Optional[int] = None,
    modified_time: Optional[datetime] = None,
    content_hash: Optional[str] = None,
    **ctx_overrides: Any,
) -> tuple[ActionPlan, dict[str, Any]]:
    lookup = {
        asset_id: (
            AssetType.STARTUP_ENTRY,
            AssetCategory.WINDOWS,
            "Test",
            entry_id,
        )
    }
    result = _make_result(rule_id=rule_id, asset_id=asset_id, safety=safety)
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
            canonical_path=entry_id,
            asset_id=aid,
            size=size,
            modified_time=modified_time,
            content_hash=content_hash,
        ),
    ).plan(prio)

    base = StartupContext(
        exists=True,
        accessible=True,
        locked=False,
        source="",
        entry_id=entry_id,
        canonical_path=entry_id if not _is_registry(entry_id) else "",
        allowed_location="",
        publisher="Test Publisher",
        executable_path="",
        is_running=False,
        running_processes=(),
        is_signed=True,
        is_system=False,
        is_security=False,
        is_auto_fixable=True,
        hive="",
        key="",
        value=None,
        registry_view="default",
        asset_id=asset_id,
        size=size,
        modified_time=modified_time,
        content_hash=content_hash,
        safety_level="safe",
    )
    ctx = base.to_dict()
    ctx.update(ctx_overrides)
    return plan, ctx


def _is_registry(entry_id: str) -> bool:
    upper = entry_id.upper()
    return any(
        upper.startswith(prefix)
        for prefix in (
            "HKCU\\",
            "HKLM\\",
            "HKCR\\",
            "HKU\\",
            "HKCC\\",
            "HKEY_CURRENT_USER\\",
            "HKEY_LOCAL_MACHINE\\",
            "HKEY_CLASSES_ROOT\\",
            "HKEY_USERS\\",
            "HKEY_CURRENT_CONFIG\\",
        )
    )


def _create_hkcu_run_key(value_name: str = "TestApp", value_data: str = "notepad.exe"):
    """Create a temporary HKCU Run-style key and return the base key path."""
    base = f"Software\\AVS\\TestStartup\\{uuid.uuid4().hex}"
    run_key = f"{base}\\Run"
    try:
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, run_key) as key:
            winreg.SetValueEx(key, value_name, 0, winreg.REG_SZ, value_data)
    except OSError as exc:
        pytest.skip(f"Cannot create test registry key: {exc}")
    return f"HKCU\\{run_key}\\{value_name}", f"HKCU\\{base}"


def _delete_hkcu_run_tree(base_path: str) -> None:
    """Best-effort removal of a temporary HKCU key tree."""
    # base_path is like HKCU\Software\AVS\TestStartup\<uuid>
    _, root = _parse_hive_key(base_path)
    try:
        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER, root, 0, winreg.KEY_ALL_ACCESS
        ) as base:
            _delete_key_tree(base, "Run")
    except OSError:
        pass
    parts = root.split("\\")
    for i in range(len(parts), 4, -1):
        try:
            winreg.DeleteKey(winreg.HKEY_CURRENT_USER, "\\".join(parts[:i]))
        except OSError:
            break


def _parse_hive_key(entry_id: str) -> tuple[str, str]:
    """Return (hive, key-with-hive-stripped) for a registry entry id."""
    parts = entry_id.split("\\", 1)
    return parts[0], parts[1] if len(parts) > 1 else ""


def _delete_key_tree(parent: Any, subkey_name: str) -> None:
    """Delete a subkey and its values recursively."""
    try:
        with winreg.OpenKey(parent, subkey_name, 0, winreg.KEY_ALL_ACCESS) as key:
            try:
                i = 0
                while True:
                    value = winreg.EnumValue(key, i)
                    winreg.DeleteValue(key, value[0])
            except OSError:
                pass
        winreg.DeleteKey(parent, subkey_name)
    except OSError:
        pass


def _value_exists(entry_id: str, value_name: str) -> bool:
    hive, rest = _parse_hive_key(entry_id)
    parts = rest.split("\\")
    key_path = "\\".join(parts[:-1])
    try:
        hkey = _hive_const(hive)
        with winreg.OpenKey(hkey, key_path, 0, winreg.KEY_READ) as key:
            try:
                winreg.QueryValueEx(key, value_name)
                return True
            except FileNotFoundError:
                return False
    except OSError:
        return False


def _hive_const(hive: str) -> int:
    return {
        "HKCU": winreg.HKEY_CURRENT_USER,
        "HKEY_CURRENT_USER": winreg.HKEY_CURRENT_USER,
        "HKLM": winreg.HKEY_LOCAL_MACHINE,
        "HKEY_LOCAL_MACHINE": winreg.HKEY_LOCAL_MACHINE,
    }.get(hive, winreg.HKEY_CURRENT_USER)


@pytest.fixture
def live_startup_executor(tmp_path):
    return DefaultExecutor(
        backup_manager=BackupManager(tmp_path / "backups"),
        registry_backup=RegistryBackup(),
    )


@pytest.fixture
def dry_startup_executor():
    return DefaultExecutor()


# ── Registry Startup ──────────────────────────────────────────────────────────


class TestRegistryStartup:
    def test_dry_run_does_not_modify_hkcu_run(self, dry_startup_executor):
        entry_id, base = _create_hkcu_run_key()
        try:
            plan, ctx = _make_startup_plan(
                entry_id=entry_id,
                asset_id=entry_id,
                registry_value_type="REG_SZ",
                registry_value_data="notepad.exe",
            )
            request = ExecutionRequest(
                plan=plan,
                mode="dry_run",
                execution_context={plan.actions[0].action_id: ctx},
            )
            summary = dry_startup_executor.execute(request)
            assert summary.results[0].status == ExecutionStatus.DRY_RUN
            assert _value_exists(entry_id, entry_id.split("\\")[-1])
        finally:
            _delete_hkcu_run_tree(base)

    def test_hkcu_run_value_remediation(self, live_startup_executor):
        value_name = "TestApp"
        entry_id, base = _create_hkcu_run_key(value_name=value_name)
        try:
            plan, ctx = _make_startup_plan(
                entry_id=entry_id,
                asset_id=entry_id,
                registry_value_type="REG_SZ",
                registry_value_data="notepad.exe",
            )
            request = ExecutionRequest(
                plan=plan,
                mode="live",
                execution_context={plan.actions[0].action_id: ctx},
            )
            summary = live_startup_executor.execute(request)
            assert summary.results[0].status == ExecutionStatus.COMPLETED
            assert not _value_exists(entry_id, value_name)
            assert summary.results[0].backup_identity is not None
        finally:
            _delete_hkcu_run_tree(base)

    def test_runonce_value_remediation(self, live_startup_executor):
        value_name = "RunOnceApp"
        base = f"Software\\AVS\\TestStartup\\{uuid.uuid4().hex}"
        runonce_key = f"{base}\\RunOnce"
        try:
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, runonce_key) as key:
                winreg.SetValueEx(key, value_name, 0, winreg.REG_SZ, "notepad.exe")
        except OSError as exc:
            pytest.skip(f"Cannot create test RunOnce key: {exc}")
        entry_id = f"HKCU\\{runonce_key}\\{value_name}"
        try:
            plan, ctx = _make_startup_plan(
                entry_id=entry_id,
                asset_id=entry_id,
                registry_value_type="REG_SZ",
                registry_value_data="notepad.exe",
            )
            request = ExecutionRequest(
                plan=plan,
                mode="live",
                execution_context={plan.actions[0].action_id: ctx},
            )
            summary = live_startup_executor.execute(request)
            assert summary.results[0].status == ExecutionStatus.COMPLETED
            assert not _value_exists(entry_id, value_name)
        finally:
            _delete_hkcu_run_tree(f"HKCU\\{base}")

    def test_hklm_run_value_remediation(self, live_startup_executor):
        base = f"SOFTWARE\\AVS\\TestStartup\\{uuid.uuid4().hex}"
        run_key = f"{base}\\Run"
        value_name = "TestApp"
        try:
            with winreg.CreateKey(winreg.HKEY_LOCAL_MACHINE, run_key) as key:
                winreg.SetValueEx(key, value_name, 0, winreg.REG_SZ, "notepad.exe")
        except PermissionError as exc:
            pytest.skip(f"Insufficient privileges for HKLM: {exc}")
        except OSError as exc:
            pytest.skip(f"Cannot create test HKLM key: {exc}")
        entry_id = f"HKLM\\{run_key}\\{value_name}"
        try:
            plan, ctx = _make_startup_plan(
                entry_id=entry_id,
                asset_id=entry_id,
                registry_value_type="REG_SZ",
                registry_value_data="notepad.exe",
            )
            request = ExecutionRequest(
                plan=plan,
                mode="live",
                execution_context={plan.actions[0].action_id: ctx},
            )
            summary = live_startup_executor.execute(request)
            assert summary.results[0].status == ExecutionStatus.COMPLETED
            assert not _value_exists(entry_id, value_name)
        finally:
            _delete_hklm_tree(f"HKLM\\{base}")

    def test_backup_and_rollback_registry(self, live_startup_executor):
        value_name = "RollMeBack"
        value_data = "calc.exe"
        entry_id, base = _create_hkcu_run_key(value_name, value_data)
        try:
            plan, ctx = _make_startup_plan(
                entry_id=entry_id,
                asset_id=entry_id,
                registry_value_type="REG_SZ",
                registry_value_data=value_data,
            )
            request = ExecutionRequest(
                plan=plan,
                mode="live",
                execution_context={plan.actions[0].action_id: ctx},
            )
            summary = live_startup_executor.execute(request)
            record = live_startup_executor.registry_backup.get(
                summary.results[0].backup_identity
            )
            assert record is not None
            restore = live_startup_executor.registry_backup.restore(record)
            assert restore.success
            assert _value_exists(entry_id, value_name)
        finally:
            _delete_hkcu_run_tree(base)

    def test_changed_registry_value_toctou_fails(self, live_startup_executor):
        value_name = "ChangedMe"
        value_data = "original.exe"
        entry_id, base = _create_hkcu_run_key(value_name, value_data)
        try:
            plan, ctx = _make_startup_plan(
                entry_id=entry_id,
                asset_id=entry_id,
                registry_value_type="REG_SZ",
                registry_value_data=value_data,
            )
            with winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                "\\".join(entry_id.split("\\")[1:-1]),
                0,
                winreg.KEY_SET_VALUE,
            ) as key:
                winreg.SetValueEx(key, value_name, 0, winreg.REG_SZ, "modified.exe")
            request = ExecutionRequest(
                plan=plan,
                mode="live",
                execution_context={plan.actions[0].action_id: ctx},
            )
            summary = live_startup_executor.execute(request)
            assert summary.results[0].status == ExecutionStatus.FAILED
            assert _value_exists(entry_id, value_name)
        finally:
            _delete_hkcu_run_tree(base)

    def test_wrong_registry_view_rejected(self, dry_startup_executor):
        value_name = "ViewApp"
        value_data = "notepad.exe"
        entry_id, base = _create_hkcu_run_key(value_name, value_data)
        try:
            plan, ctx = _make_startup_plan(
                entry_id=entry_id,
                asset_id=entry_id,
                registry_value_type="REG_SZ",
                registry_value_data=value_data,
                registry_view="wow6432node",
            )
            request = ExecutionRequest(
                plan=plan,
                mode="live",
                execution_context={plan.actions[0].action_id: ctx},
            )
            summary = dry_startup_executor.execute(request)
            assert summary.results[0].status == ExecutionStatus.REJECTED
        finally:
            _delete_hkcu_run_tree(base)

    def test_parent_key_deletion_prevented(self, dry_startup_executor):
        base = f"Software\\AVS\\TestStartup\\{uuid.uuid4().hex}"
        run_key = f"{base}\\Run"
        try:
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, run_key) as key:
                winreg.SetValueEx(key, "x", 0, winreg.REG_SZ, "y")
        except OSError as exc:
            pytest.skip(f"Cannot create test key: {exc}")
        entry_id = f"HKCU\\{run_key}\\"
        try:
            plan, ctx = _make_startup_plan(entry_id=entry_id, asset_id=entry_id)
            request = ExecutionRequest(
                plan=plan,
                mode="live",
                execution_context={plan.actions[0].action_id: ctx},
            )
            summary = dry_startup_executor.execute(request)
            assert summary.results[0].status == ExecutionStatus.REJECTED
        finally:
            _delete_hkcu_run_tree(f"HKCU\\{base}")


# ── Filesystem Startup ────────────────────────────────────────────────────────


class TestFilesystemStartup:
    def test_dry_run_does_not_modify_startup_folder(
        self, dry_startup_executor, tmp_path
    ):
        startup = tmp_path / "Startup"
        startup.mkdir()
        shortcut = startup / "test_app.lnk"
        shortcut.write_text("x")
        entry_id = str(shortcut)
        plan, ctx = _make_startup_plan(
            entry_id=entry_id,
            asset_id=entry_id,
            allowed_location=str(startup),
        )
        request = ExecutionRequest(
            plan=plan,
            mode="dry_run",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = dry_startup_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.DRY_RUN
        assert shortcut.exists()

    def test_startup_folder_file_remediation(self, live_startup_executor, tmp_path):
        startup = tmp_path / "Startup"
        startup.mkdir()
        shortcut = startup / "test_app.lnk"
        shortcut.write_text("x")
        entry_id = str(shortcut)
        plan, ctx = _make_startup_plan(
            entry_id=entry_id,
            asset_id=entry_id,
            allowed_location=str(startup),
        )
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = live_startup_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.COMPLETED
        assert not shortcut.exists()
        assert summary.results[0].backup_identity is not None

    def test_changed_executable_toctou_fails(self, live_startup_executor, tmp_path):
        startup = tmp_path / "Startup"
        startup.mkdir()
        shortcut = startup / "test_app.lnk"
        shortcut.write_text("short")
        size = shortcut.stat().st_size
        entry_id = str(shortcut)
        plan, ctx = _make_startup_plan(
            entry_id=entry_id,
            asset_id=entry_id,
            allowed_location=str(startup),
            size=size,
        )
        shortcut.write_text("this is a much longer value")
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = live_startup_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.FAILED
        assert shortcut.exists()


# ── Safety and Review ─────────────────────────────────────────────────────────


class TestSafety:
    def test_protected_windows_component_rejected(self, dry_startup_executor):
        entry_id, base = _create_hkcu_run_key()
        try:
            plan, ctx = _make_startup_plan(
                entry_id=entry_id,
                asset_id=entry_id,
                is_system=True,
            )
            request = ExecutionRequest(
                plan=plan,
                mode="live",
                execution_context={plan.actions[0].action_id: ctx},
            )
            summary = dry_startup_executor.execute(request)
            assert summary.results[0].status == ExecutionStatus.REJECTED
        finally:
            _delete_hkcu_run_tree(base)

    def test_security_software_rejected(self, dry_startup_executor):
        entry_id, base = _create_hkcu_run_key()
        try:
            plan, ctx = _make_startup_plan(
                entry_id=entry_id,
                asset_id=entry_id,
                is_security=True,
            )
            request = ExecutionRequest(
                plan=plan,
                mode="live",
                execution_context={plan.actions[0].action_id: ctx},
            )
            summary = dry_startup_executor.execute(request)
            assert summary.results[0].status == ExecutionStatus.REJECTED
        finally:
            _delete_hkcu_run_tree(base)

    def test_unknown_publisher_requires_review(self, dry_startup_executor):
        entry_id, base = _create_hkcu_run_key()
        try:
            plan, ctx = _make_startup_plan(
                entry_id=entry_id,
                asset_id=entry_id,
                publisher="",
                is_signed=False,
            )
            request = ExecutionRequest(
                plan=plan,
                mode="live",
                execution_context={plan.actions[0].action_id: ctx},
            )
            summary = dry_startup_executor.execute(request)
            assert summary.results[0].status == ExecutionStatus.REQUIRES_REVIEW
        finally:
            _delete_hkcu_run_tree(base)

    def test_running_executable_requires_review(self, dry_startup_executor):
        entry_id, base = _create_hkcu_run_key()
        try:
            plan, ctx = _make_startup_plan(
                entry_id=entry_id,
                asset_id=entry_id,
                is_running=True,
            )
            request = ExecutionRequest(
                plan=plan,
                mode="live",
                execution_context={plan.actions[0].action_id: ctx},
            )
            summary = dry_startup_executor.execute(request)
            assert summary.results[0].status == ExecutionStatus.REQUIRES_REVIEW
        finally:
            _delete_hkcu_run_tree(base)

    def test_not_auto_fixable_requires_review(self, dry_startup_executor):
        entry_id, base = _create_hkcu_run_key()
        try:
            plan, ctx = _make_startup_plan(
                entry_id=entry_id,
                asset_id=entry_id,
                is_auto_fixable=False,
            )
            request = ExecutionRequest(
                plan=plan,
                mode="live",
                execution_context={plan.actions[0].action_id: ctx},
            )
            summary = dry_startup_executor.execute(request)
            assert summary.results[0].status == ExecutionStatus.REQUIRES_REVIEW
        finally:
            _delete_hkcu_run_tree(base)

    def test_forbidden_path_rejected(self, dry_startup_executor):
        entry_id = r"C:\Windows\System32\evil.lnk"
        plan, ctx = _make_startup_plan(entry_id=entry_id, asset_id=entry_id)
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = dry_startup_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.REJECTED


# ── Symlink / Traversal Safety ────────────────────────────────────────────────


class TestPathSafety:
    @pytest.mark.skipif(
        sys.platform != "win32",
        reason="Windows symlink creation",
    )
    def test_symlink_rejected(self, live_startup_executor, tmp_path):
        real = tmp_path / "real.lnk"
        real.write_text("x")
        link = tmp_path / "Startup" / "link.lnk"
        link.parent.mkdir()
        try:
            os.symlink(real, link)
        except OSError as exc:
            pytest.skip(f"Cannot create symlink: {exc}")
        entry_id = str(link)
        plan, ctx = _make_startup_plan(
            entry_id=entry_id,
            asset_id=entry_id,
            allowed_location=str(link.parent),
        )
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = live_startup_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.REJECTED

    def test_traversal_rejected(self, dry_startup_executor):
        entry_id = r"C:\Users\Public\..\Windows\startup.lnk"
        plan, ctx = _make_startup_plan(entry_id=entry_id, asset_id=entry_id)
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = dry_startup_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.REJECTED


# ── Cancellation + Idempotency ────────────────────────────────────────────────


class TestLifecycle:
    def test_cancellation_before_modification(self, live_startup_executor):
        value_name = "CancelApp"
        entry_id, base = _create_hkcu_run_key(value_name=value_name)
        try:
            plan, ctx = _make_startup_plan(
                entry_id=entry_id,
                asset_id=entry_id,
                registry_value_type="REG_SZ",
                registry_value_data="notepad.exe",
            )
            from avs_backend.scan_core.execution import CancellationToken

            token = CancellationToken()
            token.cancel()
            request = ExecutionRequest(
                plan=plan,
                mode="live",
                execution_context={plan.actions[0].action_id: ctx},
                cancellation_token=token,
            )
            summary = live_startup_executor.execute(request)
            assert summary.results[0].status == ExecutionStatus.CANCELLED
            assert _value_exists(entry_id, value_name)
        finally:
            _delete_hkcu_run_tree(base)

    def test_idempotent_reexecution(self, live_startup_executor):
        value_name = "IdempotentApp"
        entry_id, base = _create_hkcu_run_key(value_name=value_name)
        try:
            plan, ctx = _make_startup_plan(
                entry_id=entry_id,
                asset_id=entry_id,
                registry_value_type="REG_SZ",
                registry_value_data="notepad.exe",
            )
            request = ExecutionRequest(
                plan=plan,
                mode="live",
                execution_context={plan.actions[0].action_id: ctx},
            )
            first = live_startup_executor.execute(request)
            assert first.results[0].status == ExecutionStatus.COMPLETED
            second = live_startup_executor.execute(request)
            assert second.results[0].status == ExecutionStatus.SKIPPED
        finally:
            _delete_hkcu_run_tree(base)


# ── Safety Gate / Scale ───────────────────────────────────────────────────────


class TestSafetyGate:
    def test_safety_gate_rejects_blocked(self, dry_startup_executor):
        safety = SafetyAssessment(
            level=SafetyLevel.BLOCKED,
            reason="Blocked startup entry",
            blockers=(SafetyBlocker.USER_DATA,),
        )
        entry_id, base = _create_hkcu_run_key()
        try:
            plan, ctx = _make_startup_plan(
                entry_id=entry_id,
                asset_id=entry_id,
                safety=safety,
            )
            request = ExecutionRequest(
                plan=plan,
                mode="live",
                execution_context={plan.actions[0].action_id: ctx},
            )
            summary = dry_startup_executor.execute(request)
            assert summary.results[0].status == ExecutionStatus.REJECTED
        finally:
            _delete_hkcu_run_tree(base)

    def test_100_startup_actions_cannot_bypass_safety_gate(
        self, dry_startup_executor, tmp_path
    ):
        startup = tmp_path / "Startup"
        startup.mkdir()
        results = []
        lookup = {}
        for i in range(100):
            asset_id = f"startup-{i}"
            if i == 50:
                lookup[asset_id] = (
                    AssetType.STARTUP_ENTRY,
                    AssetCategory.WINDOWS,
                    "Test",
                    f"HKCU\\Software\\AVS\\TestScale\\{i}\\Run\\x",
                )
                results.append(
                    _make_result(
                        rule_id="startup.user.system",
                        asset_id=asset_id,
                    )
                )
            else:
                lnk = startup / f"app_{i}.lnk"
                lnk.write_text("x")
                lookup[asset_id] = (
                    AssetType.STARTUP_ENTRY,
                    AssetCategory.WINDOWS,
                    "Test",
                    str(lnk),
                )
                results.append(_make_result(asset_id=asset_id))

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
        summary = dry_startup_executor.execute(request)
        assert summary.total == 100
        assert any(r.status == ExecutionStatus.REJECTED for r in summary.results)


# ── Local helpers for HKLM cleanup ────────────────────────────────────────────


def _delete_hklm_tree(base_path: str) -> None:
    """Best-effort removal of a temporary HKLM key tree."""
    _, root = _parse_hive_key(base_path)
    try:
        with winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE, root, 0, winreg.KEY_ALL_ACCESS
        ) as base:
            _delete_key_tree(base, "Run")
    except OSError:
        pass
    parts = root.split("\\")
    for i in range(len(parts), 4, -1):
        try:
            winreg.DeleteKey(winreg.HKEY_LOCAL_MACHINE, "\\".join(parts[:i]))
        except OSError:
            break
