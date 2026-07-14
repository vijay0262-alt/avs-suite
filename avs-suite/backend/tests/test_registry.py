"""Smoke test — imports every module so registration side-effects run."""

from __future__ import annotations


def test_registry_has_expected_methods() -> None:
    from avs_backend.api import registry
    from avs_backend.api import rpc_server  # noqa: F401

    methods = set(registry.all_methods())
    assert {
        "system.ping",
        "system.info",
        "system.healthScore",
        "metrics.cpu",
        "metrics.memory",
        "metrics.disk",
        "cleaner.list",
        "cleaner.scan.start",
        "cleaner.scan.status",
        "cleaner.scan.cancel",
        "cleaner.scan.results",
        "startup.list",
        "startup.toggle",
        "privacy.scan",
        "privacy.clean",
        "duplicate.scan",
        "disk.analyze",
        "performance.apply",
    }.issubset(methods)


def test_system_ping_returns_pong() -> None:
    from avs_backend.system_information import system_ping

    assert system_ping(None) == {"pong": True}
