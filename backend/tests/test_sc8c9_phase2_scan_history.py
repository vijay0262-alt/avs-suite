"""SC-8C9 Phase 2 — scan history persistence and read-only dashboard RPC."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import pytest

from avs_backend import scan_core_rpc
from avs_backend.api import registry
from avs_backend.scan_core.metadata.database import DatabaseConfig, MetadataDatabase
from avs_backend.scan_core.metadata.scan_history_repository import ScanHistoryRepository


def _call(method: str, params: dict[str, Any] | None = None) -> Any:
    """Dispatch a registered RPC method, returning a safe error if unknown."""
    handler = registry.get(method)
    if handler is None:
        return {"ok": False, "error": f"Unknown method: {method}"}
    return handler(params)


@pytest.fixture
def fresh_scan_history(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
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


def _temp_files(tmp_path: Path, count: int = 1) -> Path:
    """Create junk-style temp files under the scope directory."""
    tmp_path.mkdir(parents=True, exist_ok=True)
    for i in range(count):
        (tmp_path / f"junk{i:04d}.tmp").write_bytes(b"junk")
    return tmp_path


def _wait_for_session(session_id: str, timeout: float = 60.0) -> dict[str, Any]:
    """Poll status until the session completes.

    Generous timeout (60s) for lazy scan engine initialization on CI.
    """
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
    scope = _temp_files(app_dir.parent / "quick_scope", count=2)
    start = _call("scan_core.scan.quick", {"scope": [str(scope)]})
    assert start["ok"] is True
    _wait_for_session(start["session_id"])
    return _call("scan_core.scan.result", {"session_id": start["session_id"]})


def test_latest_history_after_quick_scan(fresh_scan_history: Path) -> None:
    app_dir = fresh_scan_history
    result = _run_quick_scan(app_dir)
    assert result["ok"] is True

    latest = _call("scan_core.scan.latest")
    assert latest["ok"] is True
    record = latest["latest"]
    assert record is not None
    assert record["scan_id"]
    assert record["scan_type"] == "quick"
    assert record["completed"] is True
    assert record["findings_count"] >= 0
    assert record["action_plan_id"] is not None
    assert record["actionable_count"] >= 0
    assert record["review_count"] >= 0
    assert record["blocked_count"] >= 0
    assert record["not_fixable_count"] >= 0
    assert "statistics" in record
    assert "created_at" in record


def test_history_list_after_quick_scan(fresh_scan_history: Path) -> None:
    app_dir = fresh_scan_history
    _run_quick_scan(app_dir)

    history = _call("scan_core.scan.history", {"limit": 5})
    assert history["ok"] is True
    assert len(history["history"]) == 1
    record = history["history"][0]
    assert record["scan_type"] == "quick"
    assert record["completed"] is True


def test_history_does_not_expose_raw_findings(fresh_scan_history: Path) -> None:
    app_dir = fresh_scan_history
    _run_quick_scan(app_dir)

    latest = _call("scan_core.scan.latest")
    record = latest["latest"]
    assert "findings" not in record
    assert "canonical_path" not in record
    assert "raw" not in record


def test_history_rpc_is_read_only(fresh_scan_history: Path) -> None:
    app_dir = fresh_scan_history
    _run_quick_scan(app_dir)

    # Calling latest/history multiple times does not alter the persisted row.
    first = _call("scan_core.scan.latest")["latest"]["created_at"]
    second = _call("scan_core.scan.latest")["latest"]["created_at"]
    assert first == second


def test_empty_history_works(fresh_scan_history: Path) -> None:
    latest = _call("scan_core.scan.latest")
    assert latest["ok"] is True
    assert latest["latest"] is None

    history = _call("scan_core.scan.history")
    assert history["ok"] is True
    assert history["history"] == []


def test_scan_history_repository_uses_metadata_database(tmp_path: Path) -> None:
    db_path = tmp_path / "metadata.db"
    db = MetadataDatabase(DatabaseConfig(db_path=db_path))
    db.initialize()

    repo = ScanHistoryRepository(db)
    record = {
        "scan_id": "s1",
        "scan_type": "quick",
        "started_at": "2024-01-01T00:00:00+00:00",
        "completed_at": "2024-01-01T00:01:00+00:00",
        "duration_ms": 60000,
        "cancelled": False,
        "completed": True,
        "error_count": 0,
        "findings_count": 5,
        "action_plan_id": "plan-1",
        "actionable_count": 2,
        "review_count": 1,
        "blocked_count": 1,
        "not_fixable_count": 1,
        "statistics": {"matches": 5, "actionable": 2},
    }
    repo.save(record)

    latest = repo.get_latest()
    assert latest is not None
    assert latest["scan_id"] == "s1"
    assert latest["statistics"]["matches"] == 5

    recent = repo.list_recent(limit=5)
    assert len(recent) == 1
    assert recent[0]["scan_id"] == "s1"
