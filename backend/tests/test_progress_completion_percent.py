"""Tests for the completion_percent calculation in _emit_progress.

Verifies that:
- Each phase maps to a sensible percentage
- Discovery progresses with assets_discovered
- Percentage never goes backward within a phase
- Percentage never exceeds 100
- Percentage is never 0 during active scanning
- Percentage doesn't jump to 100 before completion
"""

from __future__ import annotations

from avs_backend.scan_core.orchestration.orchestrator import ScanOrchestrator
from avs_backend.scan_core.orchestration.models import ScanProgress


def _make_orchestrator(tmp_path) -> ScanOrchestrator:
    """Create a minimal ScanOrchestrator for testing _emit_progress."""
    from avs_backend.scan_core.metadata.database import DatabaseConfig, MetadataDatabase
    from avs_backend.scan_core.rules.registry import RuleRegistry
    from avs_backend.scan_core.rules.detection.junk_rules import register_junk_rules

    db = MetadataDatabase(DatabaseConfig(db_path=tmp_path / "metadata.db"))
    db.initialize()
    registry = RuleRegistry()
    register_junk_rules(registry)
    return ScanOrchestrator(database=db, registry=registry, snapshot_ttl_seconds=3600)


def test_initializing_phase_has_sensible_percentage(tmp_path) -> None:
    """Initializing phase should show a small non-zero percentage."""
    orch = _make_orchestrator(tmp_path)
    captured: list[ScanProgress] = []
    orch._emit_progress("scan-1", lambda p: captured.append(p), "initializing", "Starting...")
    assert len(captured) == 1
    assert 0 < captured[0].completion_percent <= 10, (
        f"Initializing should be 0-10%, got {captured[0].completion_percent}"
    )


def test_discovery_progresses_with_assets(tmp_path) -> None:
    """Discovery percentage should increase as more assets are discovered."""
    orch = _make_orchestrator(tmp_path)
    captured: list[ScanProgress] = []
    cb = lambda p: captured.append(p)

    for count in [1, 10, 100, 1000, 10000]:
        orch._emit_progress("scan-1", cb, "discovery", "Scanning...", assets_discovered=count)

    percents = [p.completion_percent for p in captured]
    # Each should be greater than the previous (monotonically increasing)
    for i in range(1, len(percents)):
        assert percents[i] > percents[i - 1], (
            f"Discovery should progress: {percents}"
        )
    # Should be in the 10-50% range
    assert percents[0] >= 10, f"First discovery should be >= 10%, got {percents[0]}"
    assert percents[-1] <= 50, f"Discovery should be capped at 50%, got {percents[-1]}"


def test_evaluating_phase_percentage(tmp_path) -> None:
    """Evaluating phase should show ~55%."""
    orch = _make_orchestrator(tmp_path)
    captured: list[ScanProgress] = []
    orch._emit_progress("scan-1", lambda p: captured.append(p), "evaluating", "Evaluating...")
    assert captured[0].completion_percent == 55.0


def test_aggregating_phase_percentage(tmp_path) -> None:
    """Aggregating phase should show ~75%."""
    orch = _make_orchestrator(tmp_path)
    captured: list[ScanProgress] = []
    orch._emit_progress("scan-1", lambda p: captured.append(p), "aggregating", "Aggregating...")
    assert captured[0].completion_percent == 75.0


def test_prioritizing_phase_percentage(tmp_path) -> None:
    """Prioritizing phase should show ~85%."""
    orch = _make_orchestrator(tmp_path)
    captured: list[ScanProgress] = []
    orch._emit_progress("scan-1", lambda p: captured.append(p), "prioritizing", "Prioritizing...")
    assert captured[0].completion_percent == 85.0


def test_planning_phase_percentage(tmp_path) -> None:
    """Planning phase should show ~95%."""
    orch = _make_orchestrator(tmp_path)
    captured: list[ScanProgress] = []
    orch._emit_progress("scan-1", lambda p: captured.append(p), "planning", "Planning...")
    assert captured[0].completion_percent == 95.0


def test_percentage_never_exceeds_100(tmp_path) -> None:
    """Percentage should never exceed 100."""
    orch = _make_orchestrator(tmp_path)
    captured: list[ScanProgress] = []
    cb = lambda p: captured.append(p)

    for phase in ["initializing", "discovery", "evaluating", "aggregating", "prioritizing", "planning"]:
        orch._emit_progress("scan-1", cb, phase, "Op...", assets_discovered=999999)

    for p in captured:
        assert p.completion_percent <= 100, (
            f"Percentage should never exceed 100, got {p.completion_percent}"
        )


def test_percentage_never_zero_during_active_scanning(tmp_path) -> None:
    """Percentage should never be 0 during any known scan phase."""
    orch = _make_orchestrator(tmp_path)
    captured: list[ScanProgress] = []
    cb = lambda p: captured.append(p)

    for phase in ["initializing", "discovery", "evaluating", "aggregating", "prioritizing", "planning"]:
        orch._emit_progress("scan-1", cb, phase, "Op...")

    for p in captured:
        assert p.completion_percent > 0, (
            f"Percentage should never be 0 during active scanning, got 0 for phase {p.phase}"
        )


def test_unknown_phase_defaults_to_zero(tmp_path) -> None:
    """Unknown phases should default to 0% (not fabricated)."""
    orch = _make_orchestrator(tmp_path)
    captured: list[ScanProgress] = []
    orch._emit_progress("scan-1", lambda p: captured.append(p), "unknown_phase", "Op...")
    assert captured[0].completion_percent == 0.0, (
        "Unknown phases should default to 0% — no fabricated progress"
    )


def test_discovery_log_scale_does_not_jump_to_50(tmp_path) -> None:
    """Discovery with a small number of files should not jump to 50%."""
    orch = _make_orchestrator(tmp_path)
    captured: list[ScanProgress] = []
    orch._emit_progress("scan-1", lambda p: captured.append(p), "discovery", "Op...", assets_discovered=1)
    assert captured[0].completion_percent < 30, (
        f"Discovery with 1 file should not jump to 50%, got {captured[0].completion_percent}"
    )
