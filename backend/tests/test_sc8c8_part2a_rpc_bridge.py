"""SC-8C8 Part 2A — focused tests for the RemediationCoordinator RPC bridge."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest

from avs_backend import scan_core_rpc
from avs_backend.api import registry
from avs_backend.scan_core.metadata.action_plan_repository import ActionPlanRepository
from avs_backend.scan_core.metadata.database import DatabaseConfig, MetadataDatabase
from avs_backend.scan_core.orchestration import RemediationCoordinator
from avs_backend.scan_core.rules.action import (
    ActionPlan,
    ActionSummary,
    ActionState,
    ActionType,
    FilesystemActionTarget,
    RemediationAction,
)
from avs_backend.scan_core.rules.action_preconditions import PreconditionSet
from avs_backend.scan_core.rules.priority import Fixability, RuleCapability


def _make_filesystem_target(
    asset_id: str, canonical_path: Path, allowed_location: Path
) -> FilesystemActionTarget:
    return FilesystemActionTarget(
        asset_id=asset_id,
        canonical_path=str(canonical_path),
        allowed_location=str(allowed_location),
        scope="test",
        backup_required=True,
        rollback_supported=True,
    )


def _make_delete_action(
    action_id: str, asset_id: str, target: FilesystemActionTarget, size: int
) -> RemediationAction:
    now = datetime.now(UTC)
    return RemediationAction(
        action_id=action_id,
        action_type=ActionType.DELETE_FILE,
        state=ActionState.PLANNED,
        target=target,
        finding_id=f"finding-{action_id}",
        rule_id="junk.test.fake",
        rule_version="1.0.0",
        asset_id=asset_id,
        priority_score=10.0,
        fixability=Fixability.AUTO_FIXABLE,
        is_blocked=False,
        requires_review=False,
        is_actionable=True,
        is_auto_fixable=True,
        is_fixable=True,
        rule_capability=RuleCapability.REMEDIATION_AVAILABLE,
        preconditions=PreconditionSet.from_contract_strings([]),
        safety_assessment="safe",
        reason="fake junk file",
        estimated_size=size,
        backup_required=True,
        rollback_supported=True,
        backup_location=None,
        backup_identity=None,
        computed_at=now,
        metadata={},
    )


def _make_action_plan(tmp_path: Path, file_count: int = 3) -> tuple[RemediationCoordinator, str]:
    """Create a RemediationCoordinator with a persisted ActionPlan of temp files."""
    target = tmp_path / "junk"
    target.mkdir()

    db = MetadataDatabase(DatabaseConfig(db_path=tmp_path / "metadata.db"))
    db.initialize()

    actions: list[RemediationAction] = []
    for i in range(file_count):
        file_path = target / f"file{i:04d}.tmp"
        file_path.write_bytes(b"junk")
        asset_id = str(uuid.uuid4())
        fs_target = _make_filesystem_target(asset_id, file_path, target)
        actions.append(
            _make_delete_action(f"action-{i}", asset_id, fs_target, len(b"junk"))
        )

    now = datetime.now(UTC)
    summary = ActionSummary(
        total_findings=file_count,
        actions_planned=file_count,
        auto_fixable_actions=file_count,
        review_required_actions=0,
        blocked_actions=0,
        not_fixable_actions=0,
        unknown_fixability_actions=0,
        actions_by_type={"delete_file": file_count},
        estimated_affected_size=file_count * len(b"junk"),
        highest_priority_action_id=actions[0].action_id if actions else None,
        highest_severity_action_id=actions[0].action_id if actions else None,
        largest_affected_action_id=actions[0].action_id if actions else None,
        generated_at=now,
    )
    plan_id = str(uuid.uuid4())
    plan = ActionPlan(
        actions=tuple(actions),
        summary=summary,
        generated_at=now,
        snapshot_timestamp=now,
        plan_id=plan_id,
    )

    ActionPlanRepository(db).save(plan)

    coordinator = RemediationCoordinator(database=db, backup_root=tmp_path / "backups")
    return coordinator, plan_id


@pytest.fixture
def patched_coordinator(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Create a test coordinator and monkeypatch the module singleton."""
    coordinator, plan_id = _make_action_plan(tmp_path)
    monkeypatch.setattr(scan_core_rpc, "_coordinator", coordinator)
    yield coordinator, plan_id


def _call(method: str, params: dict[str, Any] | None = None) -> Any:
    """Dispatch a registered RPC method, returning a safe error if unknown."""
    handler = registry.get(method)
    if handler is None:
        return {"ok": False, "error": f"Unknown method: {method}"}
    return handler(params)


def test_prepare_returns_approval_token_and_affected_targets(
    patched_coordinator: tuple[RemediationCoordinator, str],
) -> None:
    _coordinator, plan_id = patched_coordinator
    result = _call("scan_core.remediation.prepare", {"plan_id": plan_id})
    assert result["ok"] is True
    preview = result["preview"]
    assert "approval_token" in preview
    assert isinstance(preview["approval_token"], str)
    assert "affected_targets" in preview
    assert isinstance(preview["affected_targets"], list)
    assert len(preview["affected_targets"]) == 3
    assert preview["total_actions"] == 3
    json.dumps(result)


def test_validate_returns_valid_and_summary(
    patched_coordinator: tuple[RemediationCoordinator, str],
) -> None:
    _coordinator, plan_id = patched_coordinator
    result = _call("scan_core.remediation.validate", {"plan_id": plan_id})
    assert result["ok"] is True
    validation = result["validation"]
    assert "valid" in validation
    assert "summary" in validation
    assert validation["total"] == 3
    json.dumps(result)


def test_execute_live_requires_approval_and_returns_summary(
    patched_coordinator: tuple[RemediationCoordinator, str], tmp_path: Path
) -> None:
    _coordinator, plan_id = patched_coordinator

    preview_result = _call("scan_core.remediation.prepare", {"plan_id": plan_id})
    preview = preview_result["preview"]

    result = _call(
        "scan_core.remediation.execute",
        {
            "plan_id": plan_id,
            "request_id": preview["request_id"],
            "approval_token": preview["approval_token"],
            "mode": "live",
        },
    )
    assert result["ok"] is True
    summary = result["summary"]
    assert "status" in summary
    assert summary["status"] == "completed"
    assert summary["completed"] == 3
    for f in (tmp_path / "junk").iterdir():
        assert not f.exists()
    json.dumps(result)


def test_cancel_status_round_trip(
    patched_coordinator: tuple[RemediationCoordinator, str],
) -> None:
    _coordinator, plan_id = patched_coordinator

    preview_result = _call("scan_core.remediation.prepare", {"plan_id": plan_id})
    preview = preview_result["preview"]

    exec_result = _call(
        "scan_core.remediation.execute",
        {
            "plan_id": plan_id,
            "request_id": preview["request_id"],
            "approval_token": preview["approval_token"],
            "mode": "dry_run",
        },
    )
    assert exec_result["ok"] is True
    request_id = preview["request_id"]

    cancel_result = _call("scan_core.remediation.cancel", {"execution_id": request_id})
    assert cancel_result["ok"] is True
    assert isinstance(cancel_result["cancelled"], bool)
    json.dumps(cancel_result)

    status_result = _call("scan_core.remediation.status", {"execution_id": request_id})
    assert status_result["ok"] is True
    assert "status" in status_result
    assert "execution_id" in status_result["status"]
    json.dumps(status_result)


def test_rollback_with_completed_execution_returns_result(
    patched_coordinator: tuple[RemediationCoordinator, str], tmp_path: Path
) -> None:
    _coordinator, plan_id = patched_coordinator
    target = tmp_path / "junk"

    preview_result = _call("scan_core.remediation.prepare", {"plan_id": plan_id})
    preview = preview_result["preview"]

    exec_result = _call(
        "scan_core.remediation.execute",
        {
            "plan_id": plan_id,
            "request_id": preview["request_id"],
            "approval_token": preview["approval_token"],
            "mode": "live",
        },
    )
    assert exec_result["ok"] is True
    request_id = preview["request_id"]

    rollback_result = _call("scan_core.remediation.rollback", {"execution_id": request_id})
    assert rollback_result["ok"] is True
    rollback = rollback_result["rollback"]
    assert "total" in rollback
    assert rollback["successful"] == 3
    assert rollback["failed"] == 0
    for f in target.iterdir():
        assert f.exists()
        assert f.read_bytes() == b"junk"
    json.dumps(rollback_result)


def test_unknown_method_returns_safe_error() -> None:
    result = _call("scan_core.remediation.unknown", {"plan_id": "x"})
    assert result["ok"] is False
    assert "error" in result
    assert "Unknown method" in result["error"]
    json.dumps(result)


def test_all_methods_return_json_serializable_results(
    patched_coordinator: tuple[RemediationCoordinator, str],
) -> None:
    _coordinator, plan_id = patched_coordinator
    preview = _call("scan_core.remediation.prepare", {"plan_id": plan_id})["preview"]
    methods = [
        ("scan_core.remediation.prepare", {"plan_id": plan_id}),
        ("scan_core.remediation.validate", {"plan_id": plan_id}),
        (
            "scan_core.remediation.execute",
            {
                "plan_id": plan_id,
                "request_id": preview["request_id"],
                "approval_token": preview["approval_token"],
                "mode": "dry_run",
            },
        ),
        ("scan_core.remediation.cancel", {"execution_id": preview["request_id"]}),
        ("scan_core.remediation.status", {"execution_id": preview["request_id"]}),
        ("scan_core.remediation.rollback", {"execution_id": preview["request_id"]}),
    ]
    for method, params in methods:
        result = _call(method, params)
        assert "ok" in result
        json.dumps(result)
