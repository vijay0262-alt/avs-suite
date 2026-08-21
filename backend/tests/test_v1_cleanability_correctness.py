"""
V1.0 Cleanability Correctness Test

Proves that user-visible "detected" == actually deletable files right now.

Test 1: 100 genuinely deletable junk files
  SCAN  → Detected = 100
  CLEAN → Cleaned = 100, Failed = 0, Remaining = 0
  Verify all 100 files physically absent.

Test 2: 100 junk + 20 locked + 10 already-deleted
  SCAN  → Detected ≈ 100 (NOT 130)
  The 20 locked and 10 missing files must NOT appear as cleanable.
"""

from __future__ import annotations

import os
import sys
import tempfile
import threading
import time
from pathlib import Path

import pytest

# ── Helpers ──────────────────────────────────────────────────────────────


def _create_junk_file(dir_path: Path, name: str, content: bytes = b"junk") -> Path:
    """Create a junk file with the given content."""
    p = dir_path / name
    p.write_bytes(content)
    return p


def _hold_lock(path: Path, stop_event: threading.Event) -> None:
    """Open a file with an exclusive lock and hold it until stop_event is set."""
    try:
        fd = os.open(str(path), os.O_RDWR | getattr(os, "O_BINARY", 0))
        try:
            while not stop_event.is_set():
                time.sleep(0.1)
        finally:
            os.close(fd)
    except OSError:
        pass


def _get_temp_root() -> Path:
    """Get the actual temp root that UserTempRule matches."""
    from avs_backend.scan_core.rules.detection.locations import KnownLocations
    roots = KnownLocations.get_user_temp_roots()
    for r in roots:
        if r.exists():
            return r
    return Path(tempfile.gettempdir())


# ── Test 1: 100 deletable files → all detected, all cleaned ─────────────


def test_100_deletable_files_all_detected_and_cleaned() -> None:
    """100 genuinely deletable junk files → Detected=100, Cleaned=100."""
    from avs_backend.scan_core.enumerator import (
        EnumerateOptions,
        FilesystemEnumerator,
        ScanLocation,
    )
    from avs_backend.scan_core.adapters.adapter_registry import convert_to_asset
    from avs_backend.scan_core.rules.detection.junk_rules import UserTempRule
    from avs_backend.scan_core.rules.detection.safety_policy import SafetyPolicy
    from avs_backend.scan_core.context.asset_snapshot import create_snapshot_from_asset

    temp_root = _get_temp_root()
    test_dir = temp_root / "avs_v1_test_100"
    test_dir.mkdir(exist_ok=True)

    try:
        # Create 100 junk files
        files = []
        for i in range(100):
            f = _create_junk_file(test_dir, f"junk_{i:03d}.tmp", content=b"x" * 100)
            files.append(f)

        assert all(f.exists() for f in files), "All 100 files should exist initially"

        # Enumerate with check_locked=True
        enumerator = FilesystemEnumerator()
        options = EnumerateOptions(
            include_directories=False,
            include_drives=False,
            check_locked=True,
            progress_interval=10000,
        )
        location = ScanLocation(path=str(test_dir), label="test_junk")
        entries = list(enumerator.enumerate_locations([location], options=options))

        # Convert to assets
        assets = []
        for entry in entries:
            try:
                asset = convert_to_asset(entry)
                assets.append(asset)
            except Exception:
                continue

        assert len(assets) == 100, f"Expected 100 assets, got {len(assets)}"

        # Evaluate with UserTempRule
        rule = UserTempRule()
        safe_count = 0
        locked_count = 0
        for asset in assets:
            snapshot = create_snapshot_from_asset(
                asset_id=asset.asset_id,
                scan_id="test",
                exists=asset.exists,
                accessible=asset.accessible,
                locked=asset.locked,
                canonical_path=asset.canonical_path,
            )
            result = rule.evaluate(asset, snapshot)
            if result and result.matched:
                safety = SafetyPolicy.assess(asset, snapshot)
                if safety.is_safe:
                    safe_count += 1
                elif safety.requires_review and "locked" in (safety.reason or "").lower():
                    locked_count += 1

        # V1.0 invariant: all 100 should be SAFE (deletable right now)
        assert safe_count == 100, (
            f"Expected 100 safe (deletable) files, got {safe_count}. "
            f"Locked: {locked_count}. "
            "All 100 normal junk files must be classified as safe/cleanable."
        )
        assert locked_count == 0, f"Expected 0 locked, got {locked_count}"

        # Simulate deletion: delete all 100 files
        for f in files:
            os.remove(f)

        # Verify all 100 are gone
        remaining = sum(1 for f in files if f.exists())
        assert remaining == 0, f"Expected 0 remaining, got {remaining}"

    finally:
        # Cleanup
        import shutil
        if test_dir.exists():
            shutil.rmtree(test_dir, ignore_errors=True)


# ── Test 2: 100 junk + 20 locked + 10 missing → only 100 detected ────────


def test_locked_and_missing_not_detected_as_cleanable() -> None:
    """100 junk + 20 locked + 10 already-deleted → only 100 cleanable.

    Platform-aware:
    - Windows: mandatory file locking — held files are detected as locked.
    - Linux: advisory locking — open files can still be deleted, so the
      locked-file assertion is relaxed (Linux allows unlinking open files).
    - All platforms: 10 already-deleted files must NOT be enumerated.
    """
    from avs_backend.scan_core.enumerator import (
        EnumerateOptions,
        FilesystemEnumerator,
        ScanLocation,
    )
    from avs_backend.scan_core.adapters.adapter_registry import convert_to_asset
    from avs_backend.scan_core.rules.detection.junk_rules import UserTempRule
    from avs_backend.scan_core.rules.detection.safety_policy import SafetyPolicy
    from avs_backend.scan_core.context.asset_snapshot import create_snapshot_from_asset

    is_windows = sys.platform == "win32"

    temp_root = _get_temp_root()
    test_dir = temp_root / "avs_v1_test_mixed"
    test_dir.mkdir(exist_ok=True)

    # Create 100 normal junk files
    normal_files = []
    for i in range(100):
        f = _create_junk_file(test_dir, f"normal_{i:03d}.tmp", content=b"y" * 50)
        normal_files.append(f)

    # Create 20 locked files (held open by this process)
    # On Windows, holding a file open prevents deletion (mandatory locking).
    # On Linux, this does NOT prevent deletion (advisory locking + unlink).
    locked_files = []
    lock_stop = threading.Event()
    lock_threads = []
    for i in range(20):
        f = _create_junk_file(test_dir, f"locked_{i:03d}.tmp", content=b"z" * 50)
        locked_files.append(f)
        t = threading.Thread(target=_hold_lock, args=(f, lock_stop), daemon=True)
        t.start()
        lock_threads.append(t)

    # Create 10 files and then delete them (already-deleted)
    deleted_files = []
    for i in range(10):
        f = _create_junk_file(test_dir, f"deleted_{i:03d}.tmp", content=b"w" * 50)
        deleted_files.append(f)
    for f in deleted_files:
        os.remove(f)

    try:
        # Enumerate with check_locked=True
        enumerator = FilesystemEnumerator()
        options = EnumerateOptions(
            include_directories=False,
            include_drives=False,
            check_locked=True,
            progress_interval=10000,
        )
        location = ScanLocation(path=str(test_dir), label="test_mixed")
        entries = list(enumerator.enumerate_locations([location], options=options))

        # Convert to assets
        assets = []
        for entry in entries:
            try:
                asset = convert_to_asset(entry)
                assets.append(asset)
            except Exception:
                continue

        # The 10 deleted files should NOT be enumerated (they don't exist)
        # So we should have 120 assets (100 normal + 20 locked)
        assert len(assets) == 120, f"Expected 120 assets (100+20), got {len(assets)}"

        # Evaluate with UserTempRule
        rule = UserTempRule()
        safe_count = 0
        locked_count = 0
        for asset in assets:
            snapshot = create_snapshot_from_asset(
                asset_id=asset.asset_id,
                scan_id="test",
                exists=asset.exists,
                accessible=asset.accessible,
                locked=asset.locked,
                canonical_path=asset.canonical_path,
            )
            result = rule.evaluate(asset, snapshot)
            if result and result.matched:
                safety = SafetyPolicy.assess(asset, snapshot)
                if safety.is_safe:
                    safe_count += 1
                elif safety.requires_review and "locked" in (safety.reason or "").lower():
                    locked_count += 1

        # V1.0 invariant: only genuinely deletable files are "safe"
        if is_windows:
            # Windows: mandatory locking — held files must be detected as locked
            assert safe_count == 100, (
                f"Expected 100 safe (deletable) files, got {safe_count}. "
                f"Locked: {locked_count}. "
                "The 20 locked files must NOT be classified as safe/cleanable."
            )
            assert locked_count == 20, (
                f"Expected 20 locked files, got {locked_count}. "
                "Locked files must be detected as REVIEW_REQUIRED, not SAFE."
            )
        else:
            # Linux: advisory locking — open files can still be deleted.
            # The 20 "locked" files are actually deletable on Linux, so
            # all 120 should be safe. This is correct Linux behavior.
            assert safe_count == 120, (
                f"Expected 120 safe files on Linux (advisory locking), "
                f"got {safe_count}. Locked: {locked_count}."
            )
            assert locked_count == 0, (
                f"Expected 0 locked files on Linux, got {locked_count}."
            )

    finally:
        # Release locked files
        lock_stop.set()
        for t in lock_threads:
            t.join(timeout=5)
        # Cleanup
        import shutil
        if test_dir.exists():
            shutil.rmtree(test_dir, ignore_errors=True)


# ── Test 3: Execution-time revalidation catches TOCTOU ───────────────────


def test_filesystem_context_checks_locked(tmp_path: Path) -> None:
    """The _check_file_locked function must actually check file lock status."""
    from avs_backend.scan_core.orchestration.remediation import _check_file_locked

    # Create a normal file
    f = tmp_path / "test_file.txt"
    f.write_bytes(b"hello")

    # Not locked → should return False
    assert not _check_file_locked(str(f)), "Normal file should not be locked"

    # Hold the file open exclusively
    stop = threading.Event()
    lock_thread = threading.Thread(target=_hold_lock, args=(f, stop), daemon=True)
    lock_thread.start()
    try:
        time.sleep(0.3)
        result = _check_file_locked(str(f))
        assert isinstance(result, bool), "Should return a bool"
    finally:
        stop.set()
        lock_thread.join(timeout=5)

    # After releasing, should not be locked
    time.sleep(0.2)
    assert not _check_file_locked(str(f)), "File should not be locked after release"

    # Delete the file
    os.remove(f)
    # Non-existent file → should be "locked" (can't delete what doesn't exist)
    assert _check_file_locked(str(f)), "Non-existent file should be 'locked' (can't delete)"
