"""Deterministic concurrency tests for get_scan_orchestrator() initialization.

Verifies that the non-blocking initialization pattern is safe under:
- Normal startup
- RPC during initialization
- Multiple simultaneous callers
- Initialization failure
- Repeated initialization attempts
- No duplicate orchestrator instances
- No stuck _scan_orchestrator_initializing state
"""

from __future__ import annotations

import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from unittest.mock import patch

import avs_backend.scan_core_rpc as rpc_module


def _reset_orchestrator_state() -> None:
    """Reset the module-level orchestrator state for a clean test."""
    rpc_module._scan_orchestrator = None
    rpc_module._scan_orchestrator_initializing = False


def test_normal_startup_initializes_orchestrator(tmp_path) -> None:
    """A. Normal startup: backend starts → orchestrator initializes → ready."""
    _reset_orchestrator_state()
    with patch.object(rpc_module, "_get_app_data_dir", return_value=tmp_path):
        orch = rpc_module.get_scan_orchestrator()
        assert orch is not None, "Orchestrator should be initialized"
        # Second call returns the same instance
        orch2 = rpc_module.get_scan_orchestrator()
        assert orch2 is orch, "Should return the same instance"
    _reset_orchestrator_state()


def test_rpc_during_init_returns_none_not_blocking(tmp_path) -> None:
    """B. RPC during initialization returns None instead of blocking."""
    _reset_orchestrator_state()

    init_started = threading.Event()
    init_can_proceed = threading.Event()

    def slow_init(self):
        init_started.set()
        init_can_proceed.wait(timeout=5.0)
        # Don't call real initialize — just return (schema is irrelevant for this test)

    with patch.object(rpc_module, "_get_app_data_dir", return_value=tmp_path):
        with patch.object(rpc_module.MetadataDatabase, "initialize", slow_init):
            def _init_in_thread():
                return rpc_module.get_scan_orchestrator()

            def _call_during_init():
                init_started.wait(timeout=5.0)
                # This should return None, not block
                return rpc_module.get_scan_orchestrator()

            with ThreadPoolExecutor(max_workers=2) as pool:
                fut_init = pool.submit(_init_in_thread)
                fut_call = pool.submit(_call_during_init)

                # Wait for init to start, then let it proceed
                init_started.wait(timeout=5.0)
                init_can_proceed.set()

                orch = fut_init.result(timeout=10.0)
                during_result = fut_call.result(timeout=10.0)

            assert orch is not None, "Init thread should succeed"
            assert during_result is None, "Call during init should return None, not block"
    _reset_orchestrator_state()


def test_multiple_simultaneous_callers(tmp_path) -> None:
    """C/D. Multiple simultaneous callers — only one initializes, others get None or the instance."""
    _reset_orchestrator_state()

    init_started = threading.Event()
    init_can_proceed = threading.Event()

    def slow_init(self):
        init_started.set()
        init_can_proceed.wait(timeout=5.0)
        # Don't call real initialize — just return

    with patch.object(rpc_module, "_get_app_data_dir", return_value=tmp_path):
        with patch.object(rpc_module.MetadataDatabase, "initialize", slow_init):
            def _caller():
                return rpc_module.get_scan_orchestrator()

            with ThreadPoolExecutor(max_workers=8) as pool:
                init_started.clear()
                init_can_proceed.clear()

                futures = [pool.submit(_caller) for _ in range(8)]
                init_started.wait(timeout=5.0)
                init_can_proceed.set()

                results = [f.result(timeout=10.0) for f in futures]

            # At least one should be the orchestrator, rest should be None or the same instance
            orchs = [r for r in results if r is not None]
            assert len(orchs) >= 1, "At least one caller should get the orchestrator"
            # All non-None results should be the same instance
            first = orchs[0]
            for r in orchs[1:]:
                assert r is first, "All initialized orchestrators should be the same instance"
    _reset_orchestrator_state()


def test_initialization_failure_resets_flag(tmp_path) -> None:
    """F. Initialization failure resets the _scan_orchestrator_initializing flag."""
    _reset_orchestrator_state()

    def failing_init(self):
        raise RuntimeError("Simulated DB init failure")

    with patch.object(rpc_module, "_get_app_data_dir", return_value=tmp_path):
        with patch.object(rpc_module.MetadataDatabase, "initialize", failing_init):
            result = rpc_module.get_scan_orchestrator()
            assert result is None, "Failed init should return None"
            assert rpc_module._scan_orchestrator_initializing is False, (
                "Flag should be reset after failure"
            )

            # Retry should work (flag is reset)
            with patch.object(rpc_module.MetadataDatabase, "initialize", lambda self: None):
                result2 = rpc_module.get_scan_orchestrator()
                assert result2 is not None, "Retry after failure should succeed"
    _reset_orchestrator_state()


def test_no_duplicate_orchestrator_instances(tmp_path) -> None:
    """I. No duplicate ScanOrchestrator instances even under concurrent access."""
    _reset_orchestrator_state()

    with patch.object(rpc_module, "_get_app_data_dir", return_value=tmp_path):
        with ThreadPoolExecutor(max_workers=16) as pool:
            futures = [pool.submit(rpc_module.get_scan_orchestrator) for _ in range(16)]
            results = [f.result(timeout=10.0) for f in futures]

        orchs = [r for r in results if r is not None]
        assert len(orchs) >= 1, "At least one should succeed"
        first = orchs[0]
        for r in orchs[1:]:
            assert r is first, "All orchestrator instances must be the same object"
    _reset_orchestrator_state()


def test_no_stuck_initializing_state(tmp_path) -> None:
    """L. No permanently stuck _scan_orchestrator_initializing state."""
    _reset_orchestrator_state()

    def failing_init(self):
        raise RuntimeError("Simulated failure")

    with patch.object(rpc_module, "_get_app_data_dir", return_value=tmp_path):
        with patch.object(rpc_module.MetadataDatabase, "initialize", failing_init):
            rpc_module.get_scan_orchestrator()
            assert not rpc_module._scan_orchestrator_initializing, (
                "Flag must not be stuck after failure"
            )

        # After failure, a successful init should work
        orch = rpc_module.get_scan_orchestrator()
        assert orch is not None, "Should initialize after previous failure"
        assert not rpc_module._scan_orchestrator_initializing, (
            "Flag must not be stuck after success"
        )
    _reset_orchestrator_state()


def test_eager_init_thread_safe(tmp_path) -> None:
    """The eager init function should not raise even if called concurrently."""
    _reset_orchestrator_state()

    with patch.object(rpc_module, "_get_app_data_dir", return_value=tmp_path):
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = [pool.submit(rpc_module._eager_init) for _ in range(4)]
            # Should not raise
            for f in as_completed(futures):
                f.result(timeout=10.0)

        assert rpc_module._scan_orchestrator is not None, "Orchestrator should be initialized"
    _reset_orchestrator_state()
