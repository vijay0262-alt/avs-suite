"""SC-8C8 Part 2B Phase 1 — focused tests for the ScanOrchestrator RPC bridge."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import pytest

from avs_backend import scan_core_rpc
from avs_backend.api import registry
from avs_backend.scan_core.metadata.action_plan_repository import ActionPlanRepository
from avs_backend.scan_core.metadata.database import DatabaseConfig, MetadataDatabase


def _call(method: str, params: dict[str, Any] | None = None) -> Any:
    """Dispatch a registered RPC method, returning a safe error if unknown."""
    handler = registry.get(method)
    if handler is None:
        return {"ok": False, "error": f"Unknown method: {method}"}
    return handler(params)


@pytest.fixture
def fresh_scan_bridge(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Point the scan bridge at a temp app dir and reset its singletons."""
    app_dir = tmp_path / "app_data"
    app_dir.mkdir()
    monkeypatch.setattr(scan_core_rpc, "_get_app_data_dir", lambda: app_dir)
    monkeypatch.setattr(scan_core_rpc, "_scan_orchestrator", None)
    scan_core_rpc._scan_sessions.clear()
    monkeypatch.setenv("TEMP", str(tmp_path))
    monkeypatch.setenv("TMP", str(tmp_path))
    yield app_dir
    scan_core_rpc._scan_sessions.clear()
    scan_core_rpc._scan_orchestrator = None


def _temp_files(tmp_path: Path, count: int = 1) -> Path:
    """Create junk-style temp files under the scope directory."""
    tmp_path.mkdir(parents=True, exist_ok=True)
    for i in range(count):
        (tmp_path / f"junk{i:04d}.tmp").write_bytes(b"junk")
    return tmp_path


def _wait_for_session(session_id: str, key: str = "completed", timeout: float = 10.0) -> dict[str, Any]:
    """Poll status until the requested key becomes truthy."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        status = _call("scan_core.scan.status", {"session_id": session_id})
        if status.get("ok") and status.get(key):
            return status
        if status.get("ok") and status.get("error"):
            raise AssertionError(f"Session errored: {status['error']}")
        time.sleep(0.05)
    raise AssertionError(f"Timeout waiting for session {session_id} key={key}")


def test_quick_scan_returns_session_id_and_starts_in_background(fresh_scan_bridge: Path) -> None:
    app_dir = fresh_scan_bridge
    scope = _temp_files(app_dir.parent / "quick_scope", count=3)

    start = _call("scan_core.scan.quick", {"scope": [str(scope)]})
    assert start["ok"] is True
    assert isinstance(start["session_id"], str)
    assert isinstance(start["started_at"], str)

    _wait_for_session(start["session_id"])

    result = _call("scan_core.scan.result", {"session_id": start["session_id"]})
    assert result["ok"] is True
    assert "action_plan_id" in result["result"]


def test_full_scan_returns_session_id_and_starts_in_background(fresh_scan_bridge: Path) -> None:
    app_dir = fresh_scan_bridge
    scope = _temp_files(app_dir.parent / "full_scope", count=2)

    start = _call("scan_core.scan.full", {"scope": [str(scope)]})
    assert start["ok"] is True
    assert isinstance(start["session_id"], str)
    assert isinstance(start["started_at"], str)

    _wait_for_session(start["session_id"])


def test_status_returns_progress_before_completion_and_completed_after(fresh_scan_bridge: Path) -> None:
    app_dir = fresh_scan_bridge
    scope = _temp_files(app_dir.parent / "status_scope", count=20)

    start = _call("scan_core.scan.quick", {"scope": [str(scope)]})
    session_id = start["session_id"]

    saw_progress = False
    deadline = time.time() + 10.0
    while time.time() < deadline:
        status = _call("scan_core.scan.status", {"session_id": session_id})
        assert status.get("ok") is True
        if status["progress"]:
            saw_progress = True
        if status["completed"]:
            break
        time.sleep(0.01)

    assert saw_progress, "Expected at least one progress update before completion"
    final = _call("scan_core.scan.status", {"session_id": session_id})
    assert final["ok"] is True
    assert final["completed"] is True


def test_cancel_cancels_running_scan_and_result_not_called(fresh_scan_bridge: Path) -> None:
    app_dir = fresh_scan_bridge
    scope = _temp_files(app_dir.parent / "cancel_scope", count=50)

    start = _call("scan_core.scan.quick", {"scope": [str(scope)]})
    session_id = start["session_id"]

    # Let the scan start producing progress before cancelling.
    saw_progress = False
    for _ in range(50):
        status = _call("scan_core.scan.status", {"session_id": session_id})
        if status.get("ok") and status["progress"]:
            saw_progress = True
            break
        time.sleep(0.01)
    assert saw_progress, "Expected progress to appear before attempting cancel"

    cancel = _call("scan_core.scan.cancel", {"session_id": session_id})
    assert cancel["ok"] is True
    assert isinstance(cancel["cancelled"], bool)

    # The result RPC was intentionally not called; verify result is not forced.
    result = _call("scan_core.scan.result", {"session_id": session_id})
    # After cancellation the session may or may not have completed, but we
    # should not receive a successful non-cancelled result.
    if result["ok"]:
        assert result["result"].get("cancelled") is True
    else:
        assert "not complete" in result["error"].lower() or "cancel" in result["error"].lower()


def test_result_contains_persisted_action_plan_id(fresh_scan_bridge: Path) -> None:
    app_dir = fresh_scan_bridge
    scope = _temp_files(app_dir.parent / "plan_scope", count=3)

    start = _call("scan_core.scan.quick", {"scope": [str(scope)]})
    session_id = start["session_id"]

    _wait_for_session(session_id)

    result = _call("scan_core.scan.result", {"session_id": session_id})
    assert result["ok"] is True
    plan_id = result["result"].get("action_plan_id")
    assert isinstance(plan_id, str) and plan_id

    db = MetadataDatabase(DatabaseConfig(db_path=app_dir / "metadata.db"))
    db.initialize()
    repo = ActionPlanRepository(db)
    loaded = repo.load(plan_id)
    assert loaded is not None
    assert loaded.plan_id == plan_id


def test_quick_full_are_read_only_and_do_not_delete_files(fresh_scan_bridge: Path) -> None:
    app_dir = fresh_scan_bridge
    scope = _temp_files(app_dir.parent / "readonly_scope", count=3)
    original = sorted(scope.iterdir())

    start = _call("scan_core.scan.full", {"scope": [str(scope)]})
    _wait_for_session(start["session_id"])

    remaining = sorted(scope.iterdir())
    assert remaining == original, "Read-only scan must not delete files"
