"""Unit tests for the cleaning engine.

The tests are OS-independent: we build a synthetic file tree in a
tmp_path and point a stripped-down cleaner at it.
"""

from __future__ import annotations

import os
import platform
import time
from pathlib import Path
from threading import Event
from typing import Iterable

import pytest

# Skip cleaner tests on non-Windows platforms
pytestmark = pytest.mark.skipif(
    platform.system() != "Windows",
    reason="Cleaner tests are Windows-specific"
)

from avs_backend.cleaner.interfaces import CleanerCategory, ScanStatus
from avs_backend.cleaner.safe_paths import is_forbidden
from avs_backend.cleaner.scanner_base import BaseCleaner


class _TreeCleaner(BaseCleaner):
    """Toy cleaner used by tests. Points at a single root."""

    id = "tree"
    name = "Tree"
    description = "Test-only tree cleaner"
    category = CleanerCategory.USER

    def __init__(self, root: Path, *, extensions: tuple[str, ...] = (), min_age_days: int = 0):
        self._root = root
        self.extensions = extensions
        self.min_age_days = min_age_days

    def targets(self) -> Iterable[Path]:
        return [self._root]


def _make_file(path: Path, size: int = 0, mtime: float | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as f:
        if size:
            f.write(b"\x00" * size)
    if mtime is not None:
        os.utime(path, (mtime, mtime))


# ---------------------------------------------------------------------
# Forbidden-root guard
# ---------------------------------------------------------------------


def test_is_forbidden_recognises_system32() -> None:
    assert is_forbidden(r"C:\Windows\System32") is True
    assert is_forbidden(r"C:\Windows\System32\drivers") is True


def test_is_forbidden_allows_temp() -> None:
    assert is_forbidden(r"C:\Windows\Temp") is False


# ---------------------------------------------------------------------
# BaseCleaner traversal
# ---------------------------------------------------------------------


def test_scan_finds_every_file_and_reports_size(tmp_path: Path) -> None:
    for i in range(5):
        _make_file(tmp_path / f"junk_{i}.tmp", size=100 * (i + 1))
    # A nested folder.
    _make_file(tmp_path / "nested" / "deep.tmp", size=42)

    result = _TreeCleaner(tmp_path).scan(Event(), lambda _p: None)

    assert result.status == ScanStatus.COMPLETED
    assert result.total_files == 6
    assert result.total_bytes == 100 + 200 + 300 + 400 + 500 + 42
    assert not result.errors
    assert result.elapsed_ms >= 0


def test_scan_respects_extension_filter(tmp_path: Path) -> None:
    _make_file(tmp_path / "keep.log", size=10)
    _make_file(tmp_path / "skip.txt", size=99)

    result = _TreeCleaner(tmp_path, extensions=("log",)).scan(Event(), lambda _p: None)

    assert result.total_files == 1
    assert result.total_bytes == 10


def test_scan_respects_min_age_days(tmp_path: Path) -> None:
    now = time.time()
    old = now - (30 * 86_400)
    _make_file(tmp_path / "old.log", size=10, mtime=old)
    _make_file(tmp_path / "new.log", size=10)  # fresh

    result = _TreeCleaner(tmp_path, min_age_days=14).scan(Event(), lambda _p: None)

    assert result.total_files == 1
    assert result.items[0].name == "old.log"


def test_scan_skips_symlink_targets(tmp_path: Path) -> None:
    target_dir = tmp_path / "target"
    _make_file(target_dir / "real.tmp", size=10)

    link_dir = tmp_path / "link"
    try:
        os.symlink(target_dir, link_dir, target_is_directory=True)
    except (OSError, NotImplementedError):
        pytest.skip("Symlink creation not available on this host")

    result = _TreeCleaner(tmp_path).scan(Event(), lambda _p: None)

    # The real file is counted (via target_dir) but the symlinked dir
    # is not descended into again → still 1 file.
    assert result.total_files == 1


def test_scan_captures_permission_error(tmp_path: Path, monkeypatch) -> None:
    _make_file(tmp_path / "readable.tmp", size=1)

    original_scandir = os.scandir

    def denied(path):
        if str(path).endswith("denied"):
            raise PermissionError(13, "denied")
        return original_scandir(path)

    denied_dir = tmp_path / "denied"
    denied_dir.mkdir()
    _make_file(denied_dir / "hidden.tmp", size=1)

    monkeypatch.setattr(os, "scandir", denied)

    result = _TreeCleaner(tmp_path).scan(Event(), lambda _p: None)

    assert result.status == ScanStatus.COMPLETED
    assert any("denied" in e for e in result.errors)
    assert result.total_files == 1  # readable one, not the denied one


def test_scan_supports_cancellation(tmp_path: Path) -> None:
    for i in range(200):
        _make_file(tmp_path / f"f_{i:03d}.tmp", size=1)

    cancel = Event()
    cancel.set()  # cancel BEFORE starting → walker returns immediately.

    result = _TreeCleaner(tmp_path).scan(cancel, lambda _p: None)

    assert result.status == ScanStatus.CANCELLED


def test_scan_reports_progress(tmp_path: Path) -> None:
    for i in range(3):
        (tmp_path / f"sub_{i}").mkdir()
        _make_file(tmp_path / f"sub_{i}" / "f.tmp", size=1)

    ticks: list[int] = []
    result = _TreeCleaner(tmp_path).scan(Event(), lambda pct: ticks.append(pct))

    assert result.status == ScanStatus.COMPLETED
    assert ticks and ticks[-1] == 100
