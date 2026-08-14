"""
SC-8C4 Phase A — Critical Safety Hardening regression tests.

Covers:
1. Mandatory post-execution verification in all live executors.
2. DefaultExecutor live execution requires fresh explicit context.
3. execution/__init__.py exports StartupExecutor.
4. AssetSnapshot.content_fingerprint is populated and used by HashMatches.
"""

from __future__ import annotations

import os
import sys
import types
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Optional

import pytest

from avs_backend.scan_core.assets import AssetCategory, AssetType
from avs_backend.scan_core.context.asset_snapshot import (
    AssetSnapshot,
    create_snapshot_from_asset,
)
from avs_backend.scan_core.execution import (
    BackupManager,
    BrowserExecutor,
    DefaultExecutor,
    ExecutionRequest,
    ExecutionStatus,
    FilesystemExecutor,
    RegistryBackup,
    RegistryExecutor,
    StartupContext,
    StartupExecutor,
)
from avs_backend.scan_core.rules.action import (
    ActionPlan,
    ActionPlanner,
    StartupActionTarget,
)
from avs_backend.scan_core.rules.aggregation import DetectionAggregator
from avs_backend.scan_core.rules.confidence import Confidence, ConfidenceScore
from avs_backend.scan_core.rules.enums import ActionType as RuleActionType
from avs_backend.scan_core.rules.enums import (
    ConfidenceFactor,
    EvidenceType,
    RuleCategory,
    Severity,
)
from avs_backend.scan_core.rules.evidence import Evidence, EvidenceCollection
from avs_backend.scan_core.rules.priority import FindingPrioritizer, RuleCapability
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


def _make_result(rule_id: str = "junk.temp.application") -> RuleResult:
    return RuleResult(
        rule_id=rule_id,
        rule_version="1.0.0",
        asset_id="asset-0",
        status=RuleMatchStatus.MATCHED,
        severity=Severity.LOW,
        confidence=_make_confidence(),
        safety=SafetyAssessment.create_safe("safe"),
        reason="x",
        evidence=_make_evidence(),
        recommended_action=RuleActionType.DELETE,
        estimated_size=100,
        evaluated_at=datetime.now(UTC),
    )


def _rule_category_resolver(rule_id: str) -> RuleCategory:
    if rule_id.startswith("junk"):
        return RuleCategory.JUNK
    return RuleCategory.JUNK


def _make_action_plan(tmp_path: Path, canonical_path: Path) -> ActionPlan:
    canonical_path.parent.mkdir(parents=True, exist_ok=True)
    canonical_path.write_bytes(b"junk data")

    lookup = {
        "asset-0": (
            AssetType.FILE,
            AssetCategory.FILESYSTEM,
            "Test",
            str(canonical_path),
        )
    }
    result = _make_result()
    agg = DetectionAggregator(
        asset_lookup=lambda aid: lookup.get(
            aid, (AssetType.UNKNOWN, AssetCategory.UNKNOWN, f"U {aid}", "")
        ),
        rule_category_resolver=_rule_category_resolver,
    ).aggregate([result])
    prio = FindingPrioritizer(
        rule_capability_resolver=lambda r: RuleCapability.REMEDIATION_AVAILABLE
    ).prioritize(agg)
    # Intentionally omit size, mtime, and hash so default dry-run context passes.
    return ActionPlanner(
        asset_snapshot_resolver=lambda aid: _Snapshot(
            canonical_path=str(canonical_path),
            asset_id=aid,
        ),
    ).plan(prio)


import hashlib  # noqa: E402


class TestExecutionPackage:
    """Ensure StartupExecutor is correctly exported."""

    def test_startupexecutor_imported_via_all(self):
        # If __all__ contains an unimported name, import * fails.
        import avs_backend.scan_core.execution as exec_pkg

        names = set(exec_pkg.__all__)
        for name in names:
            assert hasattr(exec_pkg, name), f"{name} in __all__ but not imported"
        assert exec_pkg.StartupExecutor is StartupExecutor


class TestDefaultExecutorLiveContext:
    """DefaultExecutor must reject live mode without a fresh explicit context."""

    def test_live_rejected_without_context(self, tmp_path: Path):
        target = tmp_path / "junk.txt"
        plan = _make_action_plan(tmp_path, target)
        executor = DefaultExecutor()
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={},
        )
        summary = executor.execute(request)
        assert summary.status == ExecutionStatus.REJECTED
        assert any(
            r.status == ExecutionStatus.REJECTED
            and r.reason == "Live execution requires a fresh execution context"
            for r in summary.results
        )

    def test_dry_run_allows_default_context(self, tmp_path: Path):
        target = tmp_path / "junk.txt"
        plan = _make_action_plan(tmp_path, target)
        executor = DefaultExecutor()
        request = ExecutionRequest(plan=plan, mode="dry_run", execution_context={})
        summary = executor.execute(request)
        assert summary.results
        assert all(r.status == ExecutionStatus.DRY_RUN for r in summary.results)


class TestFilesystemPostExecutionVerification:
    """Filesystem executor must not report COMPLETED if the target still exists."""

    def test_delete_file_fails_when_target_still_exists(
        self, tmp_path: Path, monkeypatch
    ):
        target = tmp_path / "junk.txt"
        target.write_bytes(b"junk data")
        file_size = len(b"junk data")
        modified_time = datetime.fromtimestamp(target.stat().st_mtime, tz=UTC)

        action = types.SimpleNamespace(
            action_id="a1",
            action_type=types.SimpleNamespace(value="delete_file"),
            asset_id="asset-0",
            target=types.SimpleNamespace(
                canonical_path=str(target),
                allowed_location=str(tmp_path),
                scope="junk",
            ),
        )
        context = {
            "exists": True,
            "accessible": True,
            "locked": False,
            "canonical_path": str(target),
            "asset_id": "asset-0",
            "size": file_size,
            "modified_time": modified_time,
            "safety_level": "safe",
            "symlink": False,
            "junction": False,
            "reparse_point": False,
        }

        monkeypatch.setattr(
            FilesystemExecutor, "_delete_file", classmethod(lambda cls, p, t: None)
        )

        result = FilesystemExecutor.execute(
            action,
            context,
            mode="live",
            backup_manager=BackupManager(tmp_path / "backups"),
        )
        assert result.status == ExecutionStatus.FAILED
        assert result.error.code == "POST_EXECUTION_VERIFICATION_FAILED"

    def test_clear_cache_fails_when_child_still_exists(
        self, tmp_path: Path, monkeypatch
    ):
        cache_dir = tmp_path / "cache"
        cache_dir.mkdir()
        child = cache_dir / "cookie.dat"
        child.write_bytes(b"data")

        action = types.SimpleNamespace(
            action_id="a1",
            action_type=types.SimpleNamespace(value="clear_cache"),
            asset_id="asset-0",
            target=types.SimpleNamespace(
                canonical_path=str(cache_dir),
                allowed_location=str(tmp_path),
                scope="cache",
            ),
        )
        context = {
            "exists": True,
            "accessible": True,
            "locked": False,
            "canonical_path": str(cache_dir),
            "asset_id": "asset-0",
            "safety_level": "safe",
            "symlink": False,
            "junction": False,
            "reparse_point": False,
        }

        monkeypatch.setattr(
            FilesystemExecutor, "_delete_file", classmethod(lambda cls, p, t: None)
        )
        monkeypatch.setattr(
            FilesystemExecutor, "_delete_directory", classmethod(lambda cls, p, t: None)
        )

        result = FilesystemExecutor.execute(
            action,
            context,
            mode="live",
            backup_manager=BackupManager(tmp_path / "backups"),
        )
        assert result.status == ExecutionStatus.FAILED
        assert result.error.code == "POST_EXECUTION_VERIFICATION_FAILED"


class TestBrowserPostExecutionVerification:
    """Browser executor must not report COMPLETED if a child still exists."""

    def test_browser_cache_fails_when_child_still_exists(
        self, tmp_path: Path, monkeypatch
    ):
        cache_dir = tmp_path / "browser_cache"
        cache_dir.mkdir()
        child = cache_dir / "cache_1.dat"
        child.write_bytes(b"data")

        action = types.SimpleNamespace(
            action_id="a1",
            action_type=types.SimpleNamespace(value="clear_browser_cache"),
            asset_id="asset-0",
            rule_id="browser.cache.safe",
            target=types.SimpleNamespace(
                browser="test_browser",
                profile="default",
                cache_type="cache",
                path=str(cache_dir),
                allowed_location=str(tmp_path),
            ),
        )
        context = {
            "canonical_path": str(cache_dir),
            "browser": "test_browser",
            "profile": "default",
            "running_browsers": [],
            "safety_level": "safe",
        }

        monkeypatch.setattr(
            "avs_backend.scan_core.execution.browser_executor._delete_path",
            lambda p: None,
        )

        result = BrowserExecutor.execute(
            action,
            context,
            mode="live",
            backup_manager=BackupManager(tmp_path / "backups"),
            execution_id="e1",
        )
        assert result.status == ExecutionStatus.FAILED
        assert result.error.code == "POST_EXECUTION_VERIFICATION_FAILED"


@pytest.mark.skipif(sys.platform != "win32", reason="Registry tests require Windows")
class TestRegistryPostExecutionVerification:
    """Registry executor must not report COMPLETED if the value still exists."""

    def test_registry_value_fails_when_value_still_exists(
        self, tmp_path: Path, monkeypatch
    ):
        import winreg

        # Use a unique test key under HKCU.
        subkey = r"Software\AVS_TEST\PhaseA" + os.urandom(4).hex()
        full_key = "HKCU\\" + subkey
        value_name = "TestValue"
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, subkey) as key:
            winreg.SetValueEx(key, value_name, 0, winreg.REG_SZ, "x")

        action = types.SimpleNamespace(
            action_id="a1",
            action_type=types.SimpleNamespace(value="remove_registry_value"),
            asset_id="asset-0",
            target=types.SimpleNamespace(
                canonical_path=full_key,
                registry_hive="HKCU",
                registry_key=subkey,
                registry_value=value_name,
                registry_view="default",
                allowed_location=r"HKCU\Software\AVS_TEST",
            ),
        )
        context = {
            "registry_hive": "HKCU",
            "registry_key": subkey,
            "registry_value": value_name,
            "registry_view": "default",
            "registry_value_type": "REG_SZ",
            "registry_value_data": "x",
            "asset_id": "asset-0",
            "safety_level": "safe",
        }

        monkeypatch.setattr(
            RegistryExecutor, "_delete_value", lambda *args, **kwargs: None
        )

        result = RegistryExecutor.execute(
            action,
            context,
            mode="live",
            registry_backup=RegistryBackup(),
            execution_id="e1",
        )

        # Cleanup real value so we do not leave data behind.
        try:
            with winreg.OpenKey(
                winreg.HKEY_CURRENT_USER, subkey, 0, winreg.KEY_ALL_ACCESS
            ) as key:
                winreg.DeleteValue(key, value_name)
            winreg.DeleteKey(winreg.HKEY_CURRENT_USER, subkey)
        except OSError:
            pass

        assert result.status == ExecutionStatus.FAILED
        assert result.error.code == "POST_EXECUTION_VERIFICATION_FAILED"


class TestStartupPostExecutionVerification:
    """Startup executor must not report COMPLETED if the file still exists."""

    def test_startup_file_fails_when_file_still_exists(
        self, tmp_path: Path, monkeypatch
    ):
        target = tmp_path / "startup" / "bad.lnk"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b"data")

        action = types.SimpleNamespace(
            action_id="a1",
            action_type=types.SimpleNamespace(value="disable_startup_entry"),
            asset_id="asset-0",
            target=StartupActionTarget(
                asset_id="asset-0",
                entry_id=str(target),
                scope="startup",
            ),
        )
        context = StartupContext(
            exists=True,
            accessible=True,
            locked=False,
            source="filesystem",
            entry_id=str(target),
            canonical_path=str(target),
            allowed_location=str(tmp_path),
            publisher="Known Publisher",
            is_running=False,
            is_signed=False,
            is_auto_fixable=True,
            asset_id="asset-0",
            safety_level="safe",
        ).to_dict()

        monkeypatch.setattr(
            FilesystemExecutor, "_delete_file", classmethod(lambda cls, p, t: None)
        )

        result = StartupExecutor.execute(
            action,
            context,
            mode="live",
            backup_manager=BackupManager(tmp_path / "backups"),
            execution_id="e1",
        )
        assert result.status == ExecutionStatus.FAILED
        assert result.error.code == "POST_EXECUTION_VERIFICATION_FAILED"


class TestContentFingerprint:
    """AssetSnapshot.content_fingerprint must be computed and used."""

    def test_create_snapshot_computes_content_fingerprint(self, tmp_path: Path):
        target = tmp_path / "file.txt"
        target.write_bytes(b"hello world")
        snapshot = create_snapshot_from_asset(
            asset_id="a1",
            scan_id="s1",
            exists=True,
            accessible=True,
            size=target.stat().st_size,
            canonical_path=str(target),
        )
        assert (
            snapshot.content_fingerprint == hashlib.sha256(b"hello world").hexdigest()
        )
        assert snapshot.canonical_path == str(target)
        assert snapshot.attributes.get("canonical_path") == str(target)

    def test_action_planner_uses_content_fingerprint_for_hashmatches(
        self, tmp_path: Path
    ):
        target = tmp_path / "file.txt"
        target.write_bytes(b"hello world")

        lookup = {
            "asset-0": (AssetType.FILE, AssetCategory.FILESYSTEM, "Test", str(target))
        }
        result = _make_result()
        agg = DetectionAggregator(
            asset_lookup=lambda aid: lookup.get(
                aid, (AssetType.UNKNOWN, AssetCategory.UNKNOWN, f"U {aid}", "")
            ),
            rule_category_resolver=_rule_category_resolver,
        ).aggregate([result])
        prio = FindingPrioritizer(
            rule_capability_resolver=lambda r: RuleCapability.REMEDIATION_AVAILABLE
        ).prioritize(agg)

        def snapshot_resolver(aid: str) -> AssetSnapshot:
            return create_snapshot_from_asset(
                asset_id=aid,
                scan_id="s1",
                exists=True,
                accessible=True,
                canonical_path=str(target),
            )

        plan = ActionPlanner(asset_snapshot_resolver=snapshot_resolver).plan(prio)
        action = plan.actions[0]
        assert any(
            "hash_matches:" in cond.to_contract()
            for cond in action.preconditions.conditions
        )
