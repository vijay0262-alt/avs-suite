"""SC-8C9 Phase 3 — plan hydration and authoritative metrics safety tests."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import pytest

from avs_backend import scan_core_rpc
from avs_backend.api import registry


def _call(method: str, params: dict[str, Any] | None = None) -> Any:
    """Dispatch a registered RPC method, returning a safe error if unknown."""
    handler = registry.get(method)
    if handler is None:
        return {"ok": False, "error": f"Unknown method: {method}"}
    return handler(params)


def _wait_for_session(session_id: str, timeout: float = 10.0) -> dict[str, Any]:
    """Poll status until the session completes."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        status = _call("scan_core.scan.status", {"session_id": session_id})
        if status.get("ok") and status.get("completed"):
            return status
        if status.get("ok") and status.get("error"):
            raise AssertionError(f"Session errored: {status['error']}")
        time.sleep(0.05)
    raise AssertionError(f"Timeout waiting for session {session_id}")


def _run_quick_scan(app_dir: Path) -> dict[str, Any]:
    app_dir.mkdir(parents=True, exist_ok=True)
    scope = app_dir.parent / "quick_scope"
    scope.mkdir(parents=True, exist_ok=True)
    for i in range(2):
        (scope / f"junk{i:04d}.tmp").write_bytes(b"junk")
    start = _call("scan_core.scan.quick", {"scope": [str(scope)]})
    assert start["ok"] is True
    _wait_for_session(start["session_id"])
    return _call("scan_core.scan.result", {"session_id": start["session_id"]})


@pytest.fixture
def fresh_plan_hydration(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
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


def test_plan_details_hydrates_findings_and_statistics(fresh_plan_hydration: Path) -> None:
    app_dir = fresh_plan_hydration
    result = _run_quick_scan(app_dir)
    assert result["ok"] is True
    plan_id = result["result"].get("action_plan_id")
    assert plan_id is not None

    details = _call("scan_core.scan.plan_details", {"plan_id": plan_id})
    assert details["ok"] is True
    assert details["plan_id"] == plan_id
    assert "is_stale" in details
    assert "findings" in details
    assert "statistics" in details

    stats = details["statistics"]
    assert "matches" in stats
    assert "actionable" in stats
    assert "blocked" in stats
    assert "review" in stats
    assert "not_fixable" in stats

    findings = details["findings"]
    assert isinstance(findings, list)
    for finding in findings:
        assert "finding_id" in finding
        assert "display_name" in finding
        assert "rule_id" in finding
        assert "rule_category" in finding
        assert "severity" in finding
        assert "is_actionable" in finding
        assert "is_blocked" in finding
        assert "requires_review" in finding


def test_plan_details_no_raw_path_data(fresh_plan_hydration: Path) -> None:
    app_dir = fresh_plan_hydration
    result = _run_quick_scan(app_dir)
    plan_id = result["result"].get("action_plan_id")

    details = _call("scan_core.scan.plan_details", {"plan_id": plan_id})
    assert details["ok"] is True
    for finding in details["findings"]:
        # canonical_path is intentionally left blank; asset_id and paths are not exposed.
        assert finding.get("canonical_path") == ""
        assert "target" not in finding
        assert "asset_id" not in finding
        assert "backup_location" not in finding


def test_plan_details_missing_plan_returns_safe_error(fresh_plan_hydration: Path) -> None:
    details = _call("scan_core.scan.plan_details", {"plan_id": "missing-plan-id"})
    assert details["ok"] is False
    assert "not found" in details["error"].lower()


def test_plan_details_is_read_only(fresh_plan_hydration: Path) -> None:
    app_dir = fresh_plan_hydration
    result = _run_quick_scan(app_dir)
    plan_id = result["result"].get("action_plan_id")

    first = _call("scan_core.scan.plan_details", {"plan_id": plan_id})
    second = _call("scan_core.scan.plan_details", {"plan_id": plan_id})
    assert first["ok"] and second["ok"]
    assert first["findings"] == second["findings"]
    assert first["statistics"] == second["statistics"]
