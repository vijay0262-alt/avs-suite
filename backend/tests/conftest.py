"""Pytest configuration — ensures background threads are stopped before teardown.

Without this, daemon threads (dashboard live metrics, job manager cleanup timer)
can continue logging after pytest closes logging handlers, producing
"I/O operation on closed file" errors.
"""
from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def _shutdown_background_threads():
    """Stop all background daemon threads after each test module completes.

    This fixture runs automatically for every test. It uses a finalizer
    to shut down threads that may have been started during the test:
      - Dashboard live metrics thread
      - JobManager cleanup timer singleton
    """
    yield
    # --- Post-test cleanup ---
    # Dashboard live metrics daemon thread
    try:
        from avs_backend.dashboard import shutdown_live_metrics
        shutdown_live_metrics()
    except Exception:
        pass

    # JobManager cleanup timer singleton
    try:
        from avs_backend.common.job_manager import _job_manager
        if _job_manager is not None:
            _job_manager.shutdown()
    except Exception:
        pass

    # Browser enumerator config cache
    try:
        from avs_backend.scan_core.browser.enumerator import _reset_browser_configs_cache
        _reset_browser_configs_cache()
    except Exception:
        pass
