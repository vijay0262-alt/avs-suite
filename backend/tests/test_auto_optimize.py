"""Tests for the Dashboard auto-optimization RPC endpoints.

Tests that:
1. auto_optimize starts a background session
2. auto_optimize_status returns the session state
3. auto_optimize_cancel marks the session as cancelled
4. The pipeline chains prepare → validate → execute
5. Only safe actions are executed (SafetyGate is not bypassed)
6. REQUIRES_REVIEW actions are counted but not executed
"""

from __future__ import annotations

import time
from unittest.mock import patch, MagicMock

import pytest

from avs_backend.scan_core_rpc import (
    _auto_opt_sessions,
    _auto_opt_lock,
)


@pytest.fixture(autouse=True)
def _mock_professional_edition():
    """Override edition to professional so require_feature decorators pass.

    The auto_optimize RPC is Pro-gated via @require_feature("performance.optimize").
    In the test environment there is no license SDK, so the edition defaults to
    'free' and the decorator blocks the call. These tests exercise the handler
    logic, not the licensing gate, so we mock the edition as 'professional'.
    """
    with patch("avs_backend.licensing._get_current_edition", return_value="professional"):
        yield


class TestAutoOptimizeRPC:
    """Test the auto-optimization RPC endpoints."""

    def test_auto_optimize_returns_session_id(self):
        """auto_optimize should return a session_id when plan_id is valid."""
        # We need to mock get_coordinator to avoid needing a real DB
        with patch("avs_backend.scan_core_rpc.get_coordinator") as mock_coord:
            mock_coord.return_value = MagicMock()
            from avs_backend.scan_core_rpc import _scan_core_dashboard_auto_optimize

            result = _scan_core_dashboard_auto_optimize({"plan_id": "test-plan"})
            assert result["ok"] is True
            assert "session_id" in result

            # Cleanup
            with _auto_opt_lock:
                _auto_opt_sessions.pop(result["session_id"], None)

    def test_auto_optimize_requires_plan_id(self):
        """auto_optimize should fail without plan_id."""
        from avs_backend.scan_core_rpc import _scan_core_dashboard_auto_optimize

        result = _scan_core_dashboard_auto_optimize({})
        assert result["ok"] is False
        assert "plan_id" in result.get("error", "").lower()

    def test_auto_optimize_status_returns_session_state(self):
        """auto_optimize_status should return the current session state."""
        from avs_backend.scan_core_rpc import _scan_core_dashboard_auto_optimize_status

        # Create a fake session
        session_id = "test-status-session"
        with _auto_opt_lock:
            _auto_opt_sessions[session_id] = {
                "session_id": session_id,
                "plan_id": "test-plan",
                "phase": "preparing",
                "message": "Preparing...",
                "completed": False,
                "cancelled": False,
                "error": None,
                "total_actions": 0,
                "safe_actions": 0,
                "review_required": 0,
                "blocked": 0,
                "result": None,
                "verification_status": None,
                "preview": None,
                "validation": None,
            }

        try:
            result = _scan_core_dashboard_auto_optimize_status({"session_id": session_id})
            assert result["ok"] is True
            assert result["phase"] == "preparing"
            assert result["plan_id"] == "test-plan"
        finally:
            with _auto_opt_lock:
                _auto_opt_sessions.pop(session_id, None)

    def test_auto_optimize_status_unknown_session(self):
        """auto_optimize_status should fail for unknown session."""
        from avs_backend.scan_core_rpc import _scan_core_dashboard_auto_optimize_status

        result = _scan_core_dashboard_auto_optimize_status({"session_id": "nonexistent"})
        assert result["ok"] is False

    def test_auto_optimize_cancel_marks_cancelled(self):
        """auto_optimize_cancel should mark the session as cancelled."""
        from avs_backend.scan_core_rpc import _scan_core_dashboard_auto_optimize_cancel

        session_id = "test-cancel-session"
        with _auto_opt_lock:
            _auto_opt_sessions[session_id] = {
                "session_id": session_id,
                "plan_id": "test-plan",
                "phase": "executing",
                "message": "Optimizing...",
                "completed": False,
                "cancelled": False,
                "error": None,
                "total_actions": 10,
                "safe_actions": 7,
                "review_required": 2,
                "blocked": 1,
                "result": None,
                "verification_status": None,
                "preview": None,
                "validation": None,
            }

        try:
            result = _scan_core_dashboard_auto_optimize_cancel({"session_id": session_id})
            assert result["ok"] is True
            assert result["cancelled"] is True

            with _auto_opt_lock:
                session = _auto_opt_sessions.get(session_id)
                assert session is not None
                assert session["cancelled"] is True
        finally:
            with _auto_opt_lock:
                _auto_opt_sessions.pop(session_id, None)

    def test_auto_optimize_cancel_unknown_session(self):
        """auto_optimize_cancel should fail for unknown session."""
        from avs_backend.scan_core_rpc import _scan_core_dashboard_auto_optimize_cancel

        result = _scan_core_dashboard_auto_optimize_cancel({"session_id": "nonexistent"})
        assert result["ok"] is False

    def test_auto_optimize_no_safe_actions_skips_execution(self):
        """When there are no safe actions, execution should be skipped."""
        # This tests the logic in _run_auto_optimize where safe_count == 0
        # We verify the session ends with "complete" and 0 completed actions
        from avs_backend.scan_core_rpc import _run_auto_optimize

        session_id = "test-no-safe"
        with _auto_opt_lock:
            _auto_opt_sessions[session_id] = {
                "session_id": session_id,
                "plan_id": "test-plan",
                "phase": "starting",
                "message": "Starting...",
                "completed": False,
                "cancelled": False,
                "error": None,
                "total_actions": 0,
                "safe_actions": 0,
                "review_required": 0,
                "blocked": 0,
                "result": None,
                "verification_status": None,
                "preview": None,
                "validation": None,
            }

        # Mock coordinator with a preview that has 0 safe actions
        mock_coord = MagicMock()
        mock_preview = MagicMock()
        mock_preview.total_actions = 5
        mock_preview.approval_token = "test-token"
        mock_preview.safety_state_counts = {"safe": 0, "review_required": 3, "blocked": 2}
        mock_coord.prepare.return_value = mock_preview

        try:
            with patch("avs_backend.scan_core_rpc.get_coordinator", return_value=mock_coord):
                _run_auto_optimize(session_id, "test-plan")

            with _auto_opt_lock:
                session = _auto_opt_sessions.get(session_id)
                assert session is not None
                assert session["phase"] == "complete"
                assert session["completed"] is True
                # V1.0: result uses "cleaned" instead of "completed"
                assert session["result"]["cleaned"] == 0
                # Internal diagnostics still track requires_review
                assert session["result"]["_diagnostics"]["requires_review"] == 3
        finally:
            with _auto_opt_lock:
                _auto_opt_sessions.pop(session_id, None)
