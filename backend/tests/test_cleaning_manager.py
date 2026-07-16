"""Integration tests — CleaningManager + HistoryStore + RPC handlers."""

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

from avs_backend.cleaner.cleaning_manager import CleaningManager
from avs_backend.cleaner.history_store import HistoryStore
from avs_backend.cleaner.interfaces import CleanerCategory, ScanStatus
from avs_backend.cleaner.scan_manager import ScanManager
from avs_backend.cleaner.scanner_base import BaseCleaner


class _Cleaner(BaseCleaner):
    def __init__(self, cid: str, root: Path):
        self.id = cid
        self.name = f"Cleaner {cid}"
        self.description = f"Cleaner {cid}"
        self.category = CleanerCategory.USER
        self._root = root

    def targets(self) -> Iterable[Path]:
        return [self._root]


def _make_tree(base: Path, n: int) -> None:
    base.mkdir(parents=True, exist_ok=True)
    for i in range(n):
        (base / f"f_{i:03d}.tmp").write_bytes(b"x" * (i + 1))


def _wait_until(predicate, timeout: float = 6.0, step: float = 0.02) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(step)
    raise AssertionError("Timed out waiting for predicate")


def _build_managers(tmp_path: Path, cleaners: list[_Cleaner]) -> tuple[ScanManager, HistoryStore, CleaningManager]:
    scan = ScanManager(cleaners)
    hist = HistoryStore(tmp_path / "history.sqlite")
    clean = CleaningManager(scan, {c.id: c for c in cleaners}, hist)
    return scan, hist, clean


def test_end_to_end_scan_preview_execute_history(tmp_path: Path) -> None:
    root_a = tmp_path / "a"
    root_b = tmp_path / "b"
    _make_tree(root_a, 10)
    _make_tree(root_b, 5)

    scan, hist, clean = _build_managers(
        tmp_path, [_Cleaner("a", root_a), _Cleaner("b", root_b)]
    )
    try:
        # 1. Scan
        scan_task = scan.start()
        _wait_until(lambda: (s := scan.snapshot(scan_task)).status != ScanStatus.RUNNING)

        # 2. Preview
        previews = clean.preview(scan_task)
        by_id = {p.cleaner_id: p for p in previews}
        assert by_id["a"].total_files == 10
        assert by_id["b"].total_files == 5

        # 3. Execute
        cleaning_task = clean.execute(scan_task)
        _wait_until(lambda: (c := clean.snapshot(cleaning_task)).status != ScanStatus.RUNNING)

        snap = clean.snapshot(cleaning_task)
        assert snap.status == ScanStatus.COMPLETED
        assert snap.total_files_removed == 15
        # Bytes: sum(1..10) + sum(1..5)
        assert snap.total_bytes_recovered == sum(range(1, 11)) + sum(range(1, 6))

        # 4. History is persisted (one row per cleaner).
        rows = hist.query(limit=10)
        assert len(rows) == 2
        assert {r["cleaner_id"] for r in rows} == {"a", "b"}
        assert all(r["result"] == "success" for r in rows)
    finally:
        clean.shutdown()
        scan.shutdown()
        hist.close()


def test_preview_only_filter(tmp_path: Path) -> None:
    root_a = tmp_path / "a"
    root_b = tmp_path / "b"
    _make_tree(root_a, 4)
    _make_tree(root_b, 4)

    scan, hist, clean = _build_managers(
        tmp_path, [_Cleaner("a", root_a), _Cleaner("b", root_b)]
    )
    try:
        scan_task = scan.start()
        _wait_until(lambda: (s := scan.snapshot(scan_task)).status != ScanStatus.RUNNING)

        previews = clean.preview(scan_task, only=["a"])
        assert len(previews) == 1
        assert previews[0].cleaner_id == "a"
    finally:
        clean.shutdown()
        scan.shutdown()
        hist.close()


def test_execute_refuses_when_nothing_valid(tmp_path: Path) -> None:
    root = tmp_path / "empty"
    root.mkdir()
    scan, hist, clean = _build_managers(tmp_path, [_Cleaner("x", root)])
    try:
        scan_task = scan.start()
        _wait_until(lambda: (s := scan.snapshot(scan_task)).status != ScanStatus.RUNNING)

        import pytest as _pytest

        with _pytest.raises(ValueError):
            clean.execute(scan_task)
    finally:
        clean.shutdown()
        scan.shutdown()
        hist.close()


def test_history_store_query_pagination_and_filters(tmp_path: Path) -> None:
    hist = HistoryStore(tmp_path / "h.sqlite")
    try:
        base = {
            "started_at": "2026-01-01T00:00:00+00:00",
            "finished_at": "2026-01-01T00:00:10+00:00",
            "cleaner_id": "x",
            "cleaner_name": "X",
            "category": "system",
            "action": "clean",
            "result": "success",
            "files_removed": 10,
            "bytes_recovered": 1024,
            "files_skipped": 0,
            "files_failed": 0,
            "duration_ms": 42,
            "errors_json": '{"count":0,"sample":[]}',
        }
        for i in range(25):
            row = dict(base, cleaner_name=f"X-{i}", result="success" if i % 2 else "partial")
            hist.append(row)

        assert hist.count() == 25
        assert hist.count(result="partial") == 13
        rows = hist.query(limit=10)
        assert len(rows) == 10
        assert "errors" in rows[0]  # JSON decoded back
        assert hist.query(result="success", limit=100)
    finally:
        hist.close()


def test_cancel_cleaning_task(tmp_path: Path) -> None:
    root = tmp_path / "big"
    _make_tree(root, 400)
    scan, hist, clean = _build_managers(tmp_path, [_Cleaner("big", root)])
    try:
        scan_task = scan.start()
        _wait_until(lambda: (s := scan.snapshot(scan_task)).status != ScanStatus.RUNNING)

        cleaning_task = clean.execute(scan_task)
        # Cancel immediately.
        assert clean.cancel(cleaning_task) is True
        _wait_until(lambda: (c := clean.snapshot(cleaning_task)).status != ScanStatus.RUNNING)
        snap = clean.snapshot(cleaning_task)
        assert snap.status == ScanStatus.CANCELLED
    finally:
        clean.shutdown()
        scan.shutdown()
        hist.close()


def test_rpc_handlers_execute_and_log(tmp_path: Path, monkeypatch) -> None:
    """Exercise the ``cleaner.clean.*`` RPC handlers end-to-end."""
    root = tmp_path / "junk"
    _make_tree(root, 6)

    from avs_backend import cleaner as cleaner_mod

    scan, hist, clean = _build_managers(tmp_path, [_Cleaner("mock", root)])
    monkeypatch.setattr(cleaner_mod, "_scan_manager", scan)
    monkeypatch.setattr(cleaner_mod, "_cleaning_manager", clean)
    monkeypatch.setattr(cleaner_mod, "_history", hist)

    try:
        scan_task = scan.start()
        _wait_until(lambda: (s := scan.snapshot(scan_task)).status != ScanStatus.RUNNING)

        preview = cleaner_mod.cleaner_clean_preview({"taskId": scan_task})
        assert preview["totalFiles"] == 6

        exec_resp = cleaner_mod.cleaner_clean_execute({"taskId": scan_task})
        cleaning_task = exec_resp["cleaningTaskId"]

        _wait_until(
            lambda: cleaner_mod.cleaner_clean_status({"cleaningTaskId": cleaning_task})[
                "status"
            ]
            != "running"
        )

        status = cleaner_mod.cleaner_clean_status({"cleaningTaskId": cleaning_task})
        assert status["status"] == "completed"
        assert status["totalFilesRemoved"] == 6

        logs = cleaner_mod.cleaner_clean_logs({"limit": 10})
        assert logs["total"] >= 1
        assert logs["entries"][0]["cleaner_id"] == "mock"
    finally:
        clean.shutdown()
        scan.shutdown()
        hist.close()
