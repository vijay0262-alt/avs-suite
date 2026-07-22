"""Integration tests for the ScanManager and RPC layer.

We exercise the manager against a real filesystem tree in ``tmp_path``
by injecting a bespoke cleaner list. This validates:

* Parallel execution across multiple cleaners.
* Progress and status reporting via ``snapshot()``.
* Cancellation.
* The RPC handler wrapper functions.
"""

from __future__ import annotations

import platform
import time
from pathlib import Path
from typing import Iterable

import pytest

# Skip cleaner tests on non-Windows platforms
pytestmark = pytest.mark.skipif(
    platform.system() != "Windows",
    reason="Cleaner tests are Windows-specific"
)

from avs_backend.cleaner.interfaces import CleanerCategory, ScanStatus
from avs_backend.cleaner.scan_manager import ScanManager
from avs_backend.cleaner.scanner_base import BaseCleaner


class _Cleaner(BaseCleaner):
    def __init__(self, cid: str, root: Path):
        self.id = cid
        self.name = f"Cleaner {cid}"
        self.description = f"Cleaner {cid} description"
        self.category = CleanerCategory.USER
        self._root = root

    def targets(self) -> Iterable[Path]:
        return [self._root]


def _make_tree(base: Path, n: int) -> None:
    base.mkdir(parents=True, exist_ok=True)
    for i in range(n):
        (base / f"f_{i}.tmp").write_bytes(b"x" * (i + 1))


def _wait_until(predicate, timeout: float = 30.0, step: float = 0.02) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(step)
    raise AssertionError("Timed out waiting for predicate")


def test_scan_manager_runs_all_and_aggregates(tmp_path: Path) -> None:
    a = tmp_path / "a"
    b = tmp_path / "b"
    _make_tree(a, 5)
    _make_tree(b, 10)

    mgr = ScanManager([_Cleaner("a", a), _Cleaner("b", b)])
    try:
        task_id = mgr.start()
        _wait_until(lambda: (s := mgr.snapshot(task_id)) is not None and s.status != ScanStatus.RUNNING)
        snap = mgr.snapshot(task_id)
        assert snap is not None
        assert snap.status == ScanStatus.COMPLETED
        assert snap.total_files == 15
        # Sum of 1..5 + 1..10 bytes
        assert snap.total_bytes == sum(range(1, 6)) + sum(range(1, 11))
        assert snap.progress == 100
        assert len(snap.cleaners) == 2
        assert all(c["status"] == "completed" for c in snap.cleaners)
    finally:
        mgr.shutdown()


def test_scan_manager_cancels(tmp_path: Path) -> None:
    root = tmp_path / "big"
    _make_tree(root, 500)

    mgr = ScanManager([_Cleaner("big", root)])
    try:
        task_id = mgr.start()
        # Cancel immediately.
        assert mgr.cancel(task_id) is True
        _wait_until(lambda: (s := mgr.snapshot(task_id)) is not None and s.status != ScanStatus.RUNNING)
        snap = mgr.snapshot(task_id)
        assert snap is not None
        assert snap.status == ScanStatus.CANCELLED
    finally:
        mgr.shutdown()


def test_scan_manager_items_page(tmp_path: Path) -> None:
    root = tmp_path / "root"
    _make_tree(root, 20)

    mgr = ScanManager([_Cleaner("root", root)])
    try:
        task_id = mgr.start()
        _wait_until(lambda: (s := mgr.snapshot(task_id)) is not None and s.status != ScanStatus.RUNNING)

        page1 = mgr.items_page(task_id, "root", offset=0, limit=5)
        page2 = mgr.items_page(task_id, "root", offset=5, limit=5)
        assert len(page1) == 5
        assert len(page2) == 5
        assert {i["name"] for i in page1}.isdisjoint({i["name"] for i in page2})
    finally:
        mgr.shutdown()


def test_scan_manager_only_filter(tmp_path: Path) -> None:
    a = tmp_path / "a"
    b = tmp_path / "b"
    _make_tree(a, 3)
    _make_tree(b, 3)
    mgr = ScanManager([_Cleaner("a", a), _Cleaner("b", b)])
    try:
        task_id = mgr.start(only=["a"])
        _wait_until(lambda: (s := mgr.snapshot(task_id)) is not None and s.status != ScanStatus.RUNNING)
        snap = mgr.snapshot(task_id)
        assert snap is not None
        assert len(snap.cleaners) == 1
        assert snap.cleaners[0]["id"] == "a"
    finally:
        mgr.shutdown()


def test_rpc_handlers_end_to_end(tmp_path: Path, monkeypatch) -> None:
    """Swap the singleton ScanManager for one pointed at a fake tree."""
    root = tmp_path / "junk"
    _make_tree(root, 8)

    from avs_backend import cleaner as cleaner_mod

    fake_cleaners = [_Cleaner("fake", root)]
    fake_mgr = ScanManager(fake_cleaners)
    # With lazy-loading, _ensure_singletons() checks if _cleaners is not None.
    # Set all singletons so the fake manager is used without re-creating.
    monkeypatch.setattr(cleaner_mod, "_cleaners", fake_cleaners)
    monkeypatch.setattr(cleaner_mod, "_cleaner_by_id", {c.id: c for c in fake_cleaners})
    monkeypatch.setattr(cleaner_mod, "_scan_manager", fake_mgr)

    try:
        assert cleaner_mod.cleaner_list(None) == [
            {
                "id": "fake",
                "name": "Cleaner fake",
                "description": "Cleaner fake description",
                "category": "user",
            }
        ]

        start = cleaner_mod.cleaner_scan_start(None)
        assert "taskId" in start
        task_id = start["taskId"]

        _wait_until(
            lambda: cleaner_mod.cleaner_scan_status({"taskId": task_id})["status"] != "running"
        )

        status = cleaner_mod.cleaner_scan_status({"taskId": task_id})
        assert status["status"] == "completed"
        assert status["totalFiles"] == 8

        details = cleaner_mod.cleaner_scan_results(
            {"taskId": task_id, "cleanerId": "fake", "offset": 0, "limit": 100}
        )
        assert len(details["items"]) == 8
    finally:
        fake_mgr.shutdown()
