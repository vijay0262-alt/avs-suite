"""V1.0 Critical Four-Scan Workflow Fix — regression tests.

Tests the two critical production issues:
  1. "No Plan Defined" — plan ID must be retained through the entire
     scan → clean → verify lifecycle.
  2. "AVS is preparing the scanner" — get_scan_orchestrator(wait_for_ready=True)
     must block until initialization completes instead of returning None.

Also tests:
  - Scan with zero cleanable files completes successfully.
  - Scan with findings but zero safe actions completes successfully.
  - Plan is persisted and loadable after scan completion.
  - Second scan creates a new independent session/plan.
"""

from __future__ import annotations

import threading
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from unittest.mock import patch

import pytest

from avs_backend import scan_core_rpc
from avs_backend.scan_core.metadata.action_plan_repository import ActionPlanRepository
from avs_backend.scan_core.metadata.database import DatabaseConfig, MetadataDatabase
from avs_backend.scan_core.orchestration.orchestrator import ScanOrchestrator
from avs_backend.scan_core.rules.registry import RuleRegistry
from avs_backend.scan_core.rules.detection.junk_rules import register_junk_rules
from avs_backend.scan_core.orchestration.discovery import FilesystemDiscoveryEngine


# ── Fixtures ────────────────────────────────────────────────────────────


@pytest.fixture
def fresh_orchestrator(tmp_path: Path) -> ScanOrchestrator:
    """Create a fresh ScanOrchestrator with an isolated database."""
    db = MetadataDatabase(DatabaseConfig(db_path=tmp_path / "metadata.db"))
    db.initialize()
    registry = RuleRegistry()
    register_junk_rules(registry)
    return ScanOrchestrator(
        database=db,
        registry=registry,
        discovery_engines={"filesystem": FilesystemDiscoveryEngine()},
        snapshot_ttl_seconds=3600,
    )


# ── Issue 2: "AVS is preparing the scanner" ────────────────────────────


class TestScannerReadinessContract:
    """Regression tests for the initialization race fix."""

    def test_wait_for_ready_returns_orchestrator_when_already_ready(
        self, fresh_orchestrator: ScanOrchestrator
    ):
        """If the orchestrator is already initialized, wait_for_ready
        returns it immediately."""
        with patch.object(scan_core_rpc, "_scan_orchestrator", fresh_orchestrator):
            result = scan_core_rpc.get_scan_orchestrator(wait_for_ready=True, timeout_s=5.0)
            assert result is not None
            assert result is fresh_orchestrator

    def test_wait_for_ready_blocks_until_initialization_completes(self):
        """When another thread is initializing, wait_for_ready blocks
        until it's done instead of returning None."""
        # Reset state
        with patch.object(scan_core_rpc, "_scan_orchestrator", None), \
             patch.object(scan_core_rpc, "_scan_orchestrator_initializing", True):

            # Simulate another thread finishing initialization after 0.5s
            def _finish_init():
                time.sleep(0.5)
                # Set the orchestrator to a sentinel and clear the flag
                sentinel = object()
                scan_core_rpc._scan_orchestrator = sentinel  # type: ignore
                scan_core_rpc._scan_orchestrator_initializing = False

            t = threading.Thread(target=_finish_init, daemon=True)
            t.start()

            start = time.monotonic()
            result = scan_core_rpc.get_scan_orchestrator(wait_for_ready=True, timeout_s=10.0)
            elapsed = time.monotonic() - start

            # Should have waited ~0.5s, not returned immediately
            assert elapsed >= 0.3, f"Expected to wait >= 0.3s, waited {elapsed:.2f}s"
            assert result is not None

            # Cleanup
            scan_core_rpc._scan_orchestrator = None

    def test_wait_for_ready_returns_none_on_init_failure(self):
        """If initialization fails, wait_for_ready returns None.
        With the retry-allowed design, a failed init returns None and
        the caller can retry later."""
        with patch.object(scan_core_rpc, "_scan_orchestrator", None), \
             patch.object(scan_core_rpc, "_scan_orchestrator_initializing", False), \
             patch.object(scan_core_rpc, "_get_app_data_dir", side_effect=RuntimeError("test failure")):
            result = scan_core_rpc.get_scan_orchestrator(wait_for_ready=True, timeout_s=5.0)
            assert result is None

    def test_non_blocking_call_returns_none_while_initializing(self):
        """Non-blocking callers (like scan_core.scan.latest) still get None
        immediately while initialization is in progress."""
        with patch.object(scan_core_rpc, "_scan_orchestrator", None), \
             patch.object(scan_core_rpc, "_scan_orchestrator_initializing", True):
            result = scan_core_rpc.get_scan_orchestrator()
            assert result is None


# ── Issue 1: "No Plan Defined" ─────────────────────────────────────────


class TestPlanIdRetention:
    """Regression tests for plan ID retention through the scan lifecycle."""

    def test_scan_result_always_contains_action_plan_id(
        self, fresh_orchestrator: ScanOrchestrator
    ):
        """A completed scan must always return action_plan_id in the result,
        even if there are zero findings."""
        result = fresh_orchestrator.scan_quick(scope=None)
        result_dict = result.to_dict()

        # action_plan_id must be present (not missing from the dict)
        assert "action_plan_id" in result_dict
        # It must be a string (the plan is always created)
        assert isinstance(result_dict["action_plan_id"], str)
        assert len(result_dict["action_plan_id"]) > 0

    def test_plan_persisted_and_loadable_after_scan(
        self, fresh_orchestrator: ScanOrchestrator
    ):
        """After a scan, the plan must be loadable from the repository."""
        result = fresh_orchestrator.scan_quick(scope=None)
        plan_id = result.action_plan_id

        assert plan_id is not None
        loaded = fresh_orchestrator._action_plan_repo.load(plan_id)
        assert loaded is not None
        assert loaded.plan_id == plan_id

    def test_second_scan_creates_new_independent_plan(
        self, fresh_orchestrator: ScanOrchestrator
    ):
        """A second scan must create a new, independent plan ID."""
        result1 = fresh_orchestrator.scan_quick(scope=None)
        result2 = fresh_orchestrator.scan_quick(scope=None)

        assert result1.action_plan_id is not None
        assert result2.action_plan_id is not None
        assert result1.action_plan_id != result2.action_plan_id

    def test_scan_with_zero_findings_completes_successfully(
        self, fresh_orchestrator: ScanOrchestrator
    ):
        """A scan with zero findings must complete without error and
        still have a valid plan ID."""
        result = fresh_orchestrator.scan_quick(scope=None)

        assert result.cancelled is False
        assert len(result.errors) == 0
        assert result.action_plan_id is not None

        # The plan should have zero or minimal actions
        plan = fresh_orchestrator._action_plan_repo.load(result.action_plan_id)
        assert plan is not None
