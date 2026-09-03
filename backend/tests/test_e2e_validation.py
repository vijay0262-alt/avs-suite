"""End-to-end validation of the scan -> clean pipeline.

Tests the core product invariant:
  "IF AVS SHOWS A FILE AS 'DETECTED' THEN AVS MUST BE ABLE TO
   SAFELY DELETE THAT FILE."

Creates real temp files, scans them, verifies detection, cleans them,
and verifies every detected file was actually deleted.
"""
from __future__ import annotations

import sys
import time
import tempfile
import shutil
from pathlib import Path
from typing import Iterable
from unittest.mock import patch

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from avs_backend.cleaner.cleaning_manager import CleaningManager
from avs_backend.cleaner.history_store import HistoryStore
from avs_backend.cleaner.interfaces import CleanerCategory, ScanStatus
from avs_backend.cleaner.scan_manager import ScanManager
from avs_backend.cleaner.scanner_base import BaseCleaner


class _TestCleaner(BaseCleaner):
    """A simple cleaner that scans a single directory for .tmp files."""

    def __init__(self, cid: str, root: Path):
        self.id = cid
        self.name = f"Test Cleaner {cid}"
        self.description = f"Test cleaner {cid}"
        self.category = CleanerCategory.USER
        self._root = root

    def targets(self) -> Iterable[Path]:
        return [self._root]


def _wait_until(predicate, timeout=30.0, step=0.05):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(step)
    raise AssertionError("Timed out waiting for predicate")


def test_scan_clean_pipeline():
    """Test that every detected file is actually deleted."""
    tmp_dir = Path(tempfile.mkdtemp(prefix="avs_e2e_"))
    junk_root = tmp_dir / "junk"
    junk_root.mkdir()

    # Create 20 known junk files of various sizes
    for i in range(20):
        (junk_root / f"junk_{i:03d}.tmp").write_bytes(b"\x00" * (1024 * (i + 1)))

    print(f"Created 20 junk files in {junk_root}")

    try:
        cleaner = _TestCleaner("test_junk", junk_root)
        scan = ScanManager([cleaner])
        hist = HistoryStore(tmp_dir / "history.sqlite")
        clean = CleaningManager(scan, {cleaner.id: cleaner}, hist)

        with patch("avs_backend.licensing._get_current_edition", return_value="professional"):
            # Step 1: SCAN
            print("\n=== STEP 1: SCAN ===")
            task_id = scan.start()
            print(f"  taskId: {task_id}")
            _wait_until(lambda: scan.snapshot(task_id).status != ScanStatus.RUNNING)
            snap = scan.snapshot(task_id)
            print(f"  Status: {snap.status.value}")
            print(f"  Files detected: {snap.total_files}")
            print(f"  Bytes detected: {snap.total_bytes}")

            assert snap.status.value == "completed", f"Scan failed: {snap.status.value}"
            assert snap.total_files == 20, f"Expected 20 files, got {snap.total_files}"

            # Step 2: PREVIEW
            print("\n=== STEP 2: PREVIEW ===")
            previews = clean.preview(task_id)
            total_files = sum(p.total_files for p in previews)
            total_bytes = sum(p.total_bytes for p in previews)
            print(f"  Preview files: {total_files}")
            print(f"  Preview bytes: {total_bytes}")
            assert total_files == 20, f"Preview expected 20, got {total_files}"

            # Step 3: CLEAN
            print("\n=== STEP 3: CLEAN ===")
            cleaning_task_id = clean.execute(task_id)
            print(f"  cleaningTaskId: {cleaning_task_id}")
            _wait_until(lambda: clean.snapshot(cleaning_task_id).status != ScanStatus.RUNNING)
            csnap = clean.snapshot(cleaning_task_id)
            print(f"  Status: {csnap.status.value}")
            print(f"  Files removed: {csnap.total_files_removed}")
            print(f"  Bytes recovered: {csnap.total_bytes_recovered}")
            print(f"  Files skipped: {csnap.total_files_skipped}")
            print(f"  Files failed: {csnap.total_files_failed}")

            assert csnap.status.value == "completed", f"Clean failed: {csnap.status.value}"

            # Step 4: VERIFY product invariant
            print("\n=== STEP 4: VERIFY PRODUCT INVARIANT ===")
            remaining = list(junk_root.glob("*.tmp"))
            print(f"  Remaining files: {len(remaining)}")

            if remaining:
                print("  [FAIL] Files still exist:")
                for f in remaining:
                    print(f"    {f}")
                return False

            if csnap.total_files_failed > 0:
                print(f"  [FAIL] {csnap.total_files_failed} files failed to delete")
                return False

            if csnap.total_files_removed != 20:
                print(f"  [FAIL] Expected 20 removed, got {csnap.total_files_removed}")
                return False

            print("\n  [PASS] PRODUCT INVARIANT VERIFIED")
            print(f"    Detected:  {snap.total_files}")
            print(f"    Deleted:   {csnap.total_files_removed}")
            print(f"    Failed:    {csnap.total_files_failed}")
            print(f"    Remaining: {len(remaining)}")
            return True

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def test_free_edition_limit():
    """Test that Free edition is limited to 500MB but Professional is unlimited."""
    tmp_dir = Path(tempfile.mkdtemp(prefix="avs_e2e_free_"))
    junk_root = tmp_dir / "junk"
    junk_root.mkdir()

    # Create 600 files of ~1MB each = ~600MB (over the 500MB Free limit)
    for i in range(600):
        (junk_root / f"big_{i:03d}.tmp").write_bytes(b"\x00" * (1024 * 1024))

    print(f"Created 600 files totaling ~600MB in {junk_root}")

    try:
        cleaner = _TestCleaner("test_big", junk_root)
        scan = ScanManager([cleaner])
        hist = HistoryStore(tmp_dir / "history.sqlite")
        clean = CleaningManager(scan, {cleaner.id: cleaner}, hist)

        # Scan
        task_id = scan.start()
        _wait_until(lambda: scan.snapshot(task_id).status != ScanStatus.RUNNING)
        snap = scan.snapshot(task_id)
        print(f"Scan: {snap.total_files} files, {snap.total_bytes} bytes")

        # Test 1: Free edition should be blocked by the 500MB limit
        print("\n=== FREE EDITION TEST ===")
        with patch("avs_backend.licensing._get_current_edition", return_value="free"):
            from avs_backend.licensing import get_edition_limit
            limit = get_edition_limit("junk.bytes_per_run")
            print(f"  Free limit: {limit} bytes ({limit // (1024*1024)} MB)")
            assert limit is not None, "Free edition should have a limit"

            previews = clean.preview(task_id)
            total_bytes = sum(p.total_bytes for p in previews)
            print(f"  Total bytes: {total_bytes} ({total_bytes // (1024*1024)} MB)")
            assert total_bytes > limit, "Test data should exceed Free limit"

            # Try to clean — should be blocked by the RPC layer
            from avs_backend.cleaner import cleaner_clean_execute
            from avs_backend.common.errors import RpcError
            try:
                cleaner_clean_execute({"taskId": task_id})
                print("  [FAIL] Free edition should have been blocked")
                return False
            except RpcError as e:
                print(f"  [PASS] Free edition correctly blocked: {e}")

        # Test 2: Professional edition should be unlimited
        print("\n=== PROFESSIONAL EDITION TEST ===")
        with patch("avs_backend.licensing._get_current_edition", return_value="professional"):
            from avs_backend.licensing import get_edition_limit
            limit = get_edition_limit("junk.bytes_per_run")
            print(f"  Professional limit: {limit}")
            assert limit is None, "Professional should have no limit"

            cleaning_task_id = clean.execute(task_id)
            _wait_until(lambda: clean.snapshot(cleaning_task_id).status != ScanStatus.RUNNING)
            csnap = clean.snapshot(cleaning_task_id)
            print(f"  Status: {csnap.status.value}")
            print(f"  Files removed: {csnap.total_files_removed}")

            assert csnap.status.value == "completed"
            assert csnap.total_files_removed == 600
            print("  [PASS] Professional cleaned all 600 files (unlimited)")

        # Verify all files are gone
        remaining = list(junk_root.glob("*.tmp"))
        if remaining:
            print(f"  [FAIL] {len(remaining)} files still exist after Professional clean")
            return False

        print("\n  [PASS] FREE/PRO ENFORCEMENT VERIFIED")
        return True

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def test_complete_workflow():
    """Test the complete workflow: SCAN NOW -> SCANNING -> CLEANING -> COMPLETE."""
    tmp_dir = Path(tempfile.mkdtemp(prefix="avs_e2e_wf_"))
    junk_root = tmp_dir / "junk"
    junk_root.mkdir()

    for i in range(10):
        (junk_root / f"wf_{i:03d}.tmp").write_bytes(b"\x00" * 4096)

    try:
        cleaner = _TestCleaner("wf", junk_root)
        scan = ScanManager([cleaner])
        hist = HistoryStore(tmp_dir / "history.sqlite")
        clean = CleaningManager(scan, {cleaner.id: cleaner}, hist)

        with patch("avs_backend.licensing._get_current_edition", return_value="professional"):
            # SCAN NOW
            print("=== SCAN NOW ===")
            task_id = scan.start()
            print(f"  taskId: {task_id}")

            # SCANNING
            print("=== SCANNING ===")
            _wait_until(lambda: scan.snapshot(task_id).status != ScanStatus.RUNNING)
            snap = scan.snapshot(task_id)
            assert snap.status.value == "completed"
            print(f"  Status: {snap.status.value}")
            print(f"  Files: {snap.total_files}")

            # CLEANING
            print("=== CLEANING ===")
            cleaning_task_id = clean.execute(task_id)
            _wait_until(lambda: clean.snapshot(cleaning_task_id).status != ScanStatus.RUNNING)
            csnap = clean.snapshot(cleaning_task_id)

            # COMPLETE
            print("=== COMPLETE ===")
            print(f"  Status: {csnap.status.value}")
            print(f"  Files removed: {csnap.total_files_removed}")
            print(f"  Bytes recovered: {csnap.total_bytes_recovered}")

            assert csnap.status.value == "completed"
            assert csnap.total_files_removed == 10

            remaining = list(junk_root.glob("*.tmp"))
            assert len(remaining) == 0, f"{len(remaining)} files remain"

            print("\n  [PASS] SCAN NOW -> SCANNING -> CLEANING -> COMPLETE verified")
            return True

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


if __name__ == "__main__":
    print("=" * 70)
    print("AVS AI Shield V1.0 - End-to-End Validation")
    print("Product Invariant: DETECTED = VERIFIED AUTOMATICALLY CLEANABLE")
    print("=" * 70)

    results = []

    print("\n" + "=" * 70)
    print("TEST 1: Scan -> Clean Pipeline (Product Invariant)")
    print("=" * 70)
    results.append(("Scan->Clean Pipeline", test_scan_clean_pipeline()))

    print("\n" + "=" * 70)
    print("TEST 2: Free/Pro Edition Enforcement")
    print("=" * 70)
    results.append(("Free/Pro Enforcement", test_free_edition_limit()))

    print("\n" + "=" * 70)
    print("TEST 3: Complete Workflow (SCAN -> SCANNING -> CLEANING -> COMPLETE)")
    print("=" * 70)
    results.append(("Complete Workflow", test_complete_workflow()))

    print("\n" + "=" * 70)
    print("VALIDATION SUMMARY")
    print("=" * 70)
    all_passed = True
    for name, passed in results:
        status = "[PASS]" if passed else "[FAIL]"
        print(f"  {status} - {name}")
        if not passed:
            all_passed = False

    print()
    if all_passed:
        print("ALL VALIDATION TESTS PASSED")
        print("  Product invariant verified: DETECTED = VERIFIED AUTOMATICALLY CLEANABLE")
    else:
        print("SOME VALIDATION TESTS FAILED")
        sys.exit(1)
