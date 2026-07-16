"""Unit tests for the safe-clean engine.

Covers the ``validate() / clean() / rollback_supported()`` contract on
``BaseCleaner`` — every safety rule the design brief demands has a
dedicated test.
"""

from __future__ import annotations

import os
import time
from pathlib import Path
from threading import Event
from typing import Iterable

import pytest

from avs_backend.cleaner.interfaces import CleanerCategory, CleaningActionResult
from avs_backend.cleaner.scanner_base import BaseCleaner


class _TreeCleaner(BaseCleaner):
    """Toy cleaner pointing at a single root — used by every test here."""

    def __init__(self, root: Path):
        self.id = "tree"
        self.name = "Tree"
        self.description = "Test-only tree cleaner"
        self.category = CleanerCategory.USER
        self._root = root

    def targets(self) -> Iterable[Path]:
        return [self._root]


def _make_files(root: Path, n: int, size: int = 8) -> list[str]:
    root.mkdir(parents=True, exist_ok=True)
    paths: list[str] = []
    for i in range(n):
        p = root / f"file_{i:04d}.tmp"
        p.write_bytes(b"x" * size)
        paths.append(str(p))
    return paths


# ---------------------------------------------------------------------
# validate()
# ---------------------------------------------------------------------


def test_validate_accepts_paths_inside_targets(tmp_path: Path) -> None:
    paths = _make_files(tmp_path, 3)
    preview = _TreeCleaner(tmp_path).validate(paths)
    assert preview.total_files == 3
    assert preview.total_bytes == 24
    assert preview.warnings == []


def test_validate_rejects_out_of_scope(tmp_path: Path) -> None:
    inside = _make_files(tmp_path / "in", 1)
    outside_dir = tmp_path / "outside"
    outside = _make_files(outside_dir, 1)
    preview = _TreeCleaner(tmp_path / "in").validate(inside + outside)
    assert preview.total_files == 1
    assert any(w.reason == "out-of-scope" for w in preview.warnings)


def test_validate_rejects_missing_file(tmp_path: Path) -> None:
    missing = str(tmp_path / "ghost.tmp")
    preview = _TreeCleaner(tmp_path).validate([missing])
    assert preview.total_files == 0
    assert any(w.reason == "missing" for w in preview.warnings)


def test_validate_rejects_symlink(tmp_path: Path) -> None:
    real = tmp_path / "real.tmp"
    real.write_bytes(b"x")
    link = tmp_path / "link.tmp"
    try:
        os.symlink(real, link)
    except (OSError, NotImplementedError):
        pytest.skip("Symlinks not available on this host")

    preview = _TreeCleaner(tmp_path).validate([str(link)])
    assert preview.total_files == 0
    assert any(w.reason == "symlink" for w in preview.warnings)


def test_validate_rejects_directory(tmp_path: Path) -> None:
    subdir = tmp_path / "subdir"
    subdir.mkdir()
    preview = _TreeCleaner(tmp_path).validate([str(subdir)])
    assert preview.total_files == 0
    assert any(w.reason == "not-a-file" for w in preview.warnings)


# ---------------------------------------------------------------------
# clean()
# ---------------------------------------------------------------------


def test_clean_removes_files_and_reports_bytes(tmp_path: Path) -> None:
    paths = _make_files(tmp_path, 5, size=100)
    result = _TreeCleaner(tmp_path).clean(paths, Event(), lambda _p: None)

    assert result.result == CleaningActionResult.SUCCESS
    assert result.files_removed == 5
    assert result.bytes_recovered == 500
    assert result.files_skipped == 0
    assert result.files_failed == 0
    for p in paths:
        assert not os.path.exists(p)


def test_clean_never_touches_out_of_scope_even_if_asked(tmp_path: Path) -> None:
    inside = _make_files(tmp_path / "safe", 1)
    outside = _make_files(tmp_path / "outside", 1)

    result = _TreeCleaner(tmp_path / "safe").clean(inside + outside, Event(), lambda _p: None)
    # The outside file must still exist.
    assert os.path.exists(outside[0])
    assert result.files_removed == 1
    assert result.files_skipped == 1


def test_clean_reports_partial_when_some_files_fail(tmp_path: Path, monkeypatch) -> None:
    paths = _make_files(tmp_path, 3)

    real_remove = os.remove
    fail_target = paths[1]

    def flaky_remove(p):
        if p == fail_target:
            raise PermissionError(13, "denied")
        return real_remove(p)

    monkeypatch.setattr(os, "remove", flaky_remove)

    result = _TreeCleaner(tmp_path).clean(paths, Event(), lambda _p: None)

    assert result.result == CleaningActionResult.PARTIAL
    assert result.files_removed == 2
    assert result.files_failed == 1


def test_clean_retries_transient_failures(tmp_path: Path, monkeypatch) -> None:
    paths = _make_files(tmp_path, 1)
    calls = {"count": 0}
    real_remove = os.remove

    def transient(p):
        calls["count"] += 1
        if calls["count"] < 3:
            raise PermissionError(13, "temporarily denied")
        return real_remove(p)

    monkeypatch.setattr(os, "remove", transient)

    result = _TreeCleaner(tmp_path).clean(paths, Event(), lambda _p: None)

    assert result.result == CleaningActionResult.SUCCESS
    assert result.files_removed == 1
    assert calls["count"] == 3  # 2 failures + 1 success


def test_clean_cancels_between_files(tmp_path: Path) -> None:
    paths = _make_files(tmp_path, 500)
    cancel = Event()

    files_seen: list[str] = []

    def on_file(p: str) -> None:
        files_seen.append(p)
        if len(files_seen) == 10:
            cancel.set()

    # Wire on_file through the clean call by using a small helper
    # cleaner that exposes the callback path.
    class _Cancellable(_TreeCleaner):
        pass

    result = _Cancellable(tmp_path).clean(paths, cancel, lambda _p: None, on_file=on_file)

    assert result.result == CleaningActionResult.CANCELLED
    # Some files got removed; hundreds are still on disk.
    remaining = sum(1 for p in paths if os.path.exists(p))
    assert 0 < remaining < len(paths)


def test_clean_reports_nothing_to_do(tmp_path: Path) -> None:
    result = _TreeCleaner(tmp_path).clean([], Event(), lambda _p: None)
    assert result.result == CleaningActionResult.NOTHING_TO_DO
    assert result.files_removed == 0


def test_rollback_not_supported_by_default(tmp_path: Path) -> None:
    assert _TreeCleaner(tmp_path).rollback_supported() is False


def test_clean_progress_reaches_100(tmp_path: Path) -> None:
    paths = _make_files(tmp_path, 20)
    ticks: list[int] = []
    _TreeCleaner(tmp_path).clean(paths, Event(), lambda pct: ticks.append(pct))
    assert ticks
    assert ticks[-1] == 100


# ---------------------------------------------------------------------
# Stress — real deletion of a large synthetic tree.
# ---------------------------------------------------------------------


@pytest.mark.parametrize(
    "count", [int(os.environ.get("AVS_STRESS_FILES", "10000"))]
)
def test_clean_stress_ten_thousand_files(tmp_path: Path, count: int) -> None:
    """Real end-to-end stress test.

    Default 10k files; override with ``AVS_STRESS_FILES=100000`` to
    reach the 100k+ target from the brief on beefier CI hardware. Runs
    in ~1s at 10k on modern SSDs.
    """
    paths = _make_files(tmp_path, count, size=1)
    started = time.monotonic()
    result = _TreeCleaner(tmp_path).clean(paths, Event(), lambda _p: None)
    elapsed = time.monotonic() - started

    assert result.result == CleaningActionResult.SUCCESS
    assert result.files_removed == count
    # Sanity-check that the loop is fast enough — ~1000 files/second
    # is the floor even on slow CI runners.
    assert elapsed < max(2.0, count / 1000.0)
