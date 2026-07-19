"""Smoke test — imports every module so registration side-effects run."""

from __future__ import annotations

import platform


def test_registry_has_expected_methods() -> None:
    from avs_backend.api import registry
    from avs_backend.api import rpc_server  # noqa: F401

    methods = set(registry.all_methods())

    # Base methods that should always be present
    base_methods = {
        "system.ping",
        "system.info",
        "system.healthScore",
        "metrics.cpu",
        "metrics.memory",
        "metrics.disk",
        "startup.list",
        "startup.disable",
        "startup.enable",
        "startup.backups",
        "startup.restore",
        "privacy.scan",
        "privacy.clean",
        "duplicate.scan",
        "disk.analyze",
        "performance.memory.getInfo",
        "performance.memory.optimize",
        "performance.monitor.getMetrics",
    }

    # Cleaner and dashboard methods are only available on Windows
    if platform.system() == "Windows":
        base_methods.update({
            "cleaner.list",
            "cleaner.scan.start",
            "cleaner.scan.status",
            "cleaner.scan.cancel",
            "cleaner.scan.results",
            "cleaner.clean.preview",
            "cleaner.clean.execute",
            "cleaner.clean.status",
            "cleaner.clean.cancel",
            "cleaner.clean.logs",
            "dashboard.metrics",
            "dashboard.health",
            "dashboard.optimize.preview",
            "dashboard.optimize.execute",
        })

    assert base_methods.issubset(methods)


def test_system_ping_returns_pong() -> None:
    from avs_backend.system_information import system_ping

    assert system_ping(None) == {"pong": True}
