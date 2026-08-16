"""SC-8C9 Final Hardening — M1/M2 backend regression tests."""

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
def fresh_hardening(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Point the scan bridge at a temp app dir and reset its singletons."""
    app_dir = tmp_path / "app_data"
    app_dir.mkdir()
    monkeypatch.setattr(scan_core_rpc, "_get_app_data_dir", lambda: app_dir)
    monkeypatch.setattr(scan_core_rpc, "_scan_orchestrator", None)
    monkeypatch.setattr(scan_core_rpc, "_coordinator", None)
    scan_core_rpc._scan_sessions.clear()
    monkeypatch.setenv("TEMP", str(tmp_path))
    monkeypatch.setenv("TMP", str(tmp_path))
    yield app_dir
    scan_core_rpc._scan_sessions.clear()
    scan_core_rpc._scan_orchestrator = None
    scan_core_rpc._coordinator = None


def _required_finding_fields(finding: dict[str, Any]) -> None:
    """Assert a frontend-facing finding has the required presentation fields."""
    assert "finding_id" in finding
    assert "display_name" in finding
    assert "rule_id" in finding
    assert "rule_category" in finding
    assert "severity" in finding
    assert "confidence" in finding
    assert "safety" in finding
    assert "reason" in finding
    assert "recommended_action" in finding
    assert "estimated_size" in finding
    assert "is_actionable" in finding
    assert "is_blocked" in finding
    assert "requires_review" in finding
    assert "canonical_path" in finding


def _assert_finding_privacy(finding: dict[str, Any]) -> None:
    """Assert no sensitive target/path data is exposed."""
    assert finding.get("canonical_path") == ""
    assert "asset_id" not in finding
    assert "target" not in finding
    assert "backup_location" not in finding
    assert "evidence" not in finding
    assert "detected_at" not in finding
    assert "source_result" not in finding


def test_scan_result_findings_are_sanitized(fresh_hardening: Path) -> None:
    app_dir = fresh_hardening
    result = _run_quick_scan(app_dir)
    assert result["ok"] is True
    findings = result["result"]["findings"]
    assert isinstance(findings, list)
    assert findings, "Expected at least one junk file finding for this test"

    for finding in findings:
        _required_finding_fields(finding)
        _assert_finding_privacy(finding)
        assert isinstance(finding["confidence"], (int, float))
        assert isinstance(finding["safety"], str)


def test_plan_details_and_scan_result_privacy_are_consistent(fresh_hardening: Path) -> None:
    app_dir = fresh_hardening
    result = _run_quick_scan(app_dir)
    plan_id = result["result"].get("action_plan_id")
    assert plan_id is not None

    details = _call("scan_core.scan.plan_details", {"plan_id": plan_id})
    assert details["ok"] is True
    details_finding = details["findings"][0]

    active_finding = result["result"]["findings"][0]

    # Same privacy keys and values where applicable.
    assert active_finding["canonical_path"] == details_finding["canonical_path"]
    assert active_finding["canonical_path"] == ""
    assert "asset_id" not in active_finding
    assert "asset_id" not in details_finding


def test_remediation_prepare_affected_targets_are_sanitized(fresh_hardening: Path) -> None:
    app_dir = fresh_hardening
    result = _run_quick_scan(app_dir)
    plan_id = result["result"].get("action_plan_id")
    assert plan_id is not None

    preview = _call("scan_core.remediation.prepare", {"plan_id": plan_id})
    assert preview["ok"] is True
    assert "preview" in preview

    affected = preview["preview"]["affected_targets"]
    assert isinstance(affected, list)
    assert affected, "Expected at least one affected target"

    for target in affected:
        assert "display_name" in target
        assert target["display_name"]
        assert "canonical_path" not in target
        assert "asset_id" not in target
        assert "backup_location" not in target
        assert "target" not in target
