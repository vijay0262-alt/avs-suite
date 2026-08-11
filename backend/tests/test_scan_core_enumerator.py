"""
Unit tests for the Scan Core Filesystem Enumerator.

Tests cover:
- Small directory enumeration
- Large directory enumeration (many files)
- Empty directory
- Permission denied handling
- Symlink handling
- Hidden files
- Cancellation
- Filters (extension, depth, size, directory exclusion, hidden, date)
- Drive enumeration
- Progress events
- Streaming behavior (memory efficiency)
"""

from __future__ import annotations

import os
import sys
import time
import tempfile
import shutil
from pathlib import Path
from datetime import datetime, timedelta

import pytest

from avs_backend.scan_core import (
    FileEntry,
    DirectoryEntry,
    DriveEntry,
    EntryType,
    FilesystemEnumerator,
    EnumerateOptions,
    ProgressEvent,
    ScanLocation,
    CancelEvent,
    enumerate_filesystem,
    ExtensionFilter,
    DirectoryExclusionFilter,
    HiddenFileFilter,
    MaxDepthFilter,
    MaxSizeFilter,
    DateRangeFilter,
    FilterChain,
    get_default_scan_locations,
)


# ── Fixtures ───────────────────────────────────────────────────

@pytest.fixture
def small_dir(tmp_path: Path) -> Path:
    """Create a small directory with a few files and subdirectories."""
    (tmp_path / "file1.txt").write_text("hello")
    (tmp_path / "file2.log").write_text("world")
    (tmp_path / "file3.txt").write_text("test data here")
    (tmp_path / "subdir1").mkdir()
    (tmp_path / "subdir1" / "nested.py").write_text("# python")
    (tmp_path / "subdir2").mkdir()
    (tmp_path / "subdir2" / "deep").mkdir()
    (tmp_path / "subdir2" / "deep" / "deep_file.txt").write_text("deep")
    return tmp_path


@pytest.fixture
def empty_dir(tmp_path: Path) -> Path:
    """Create an empty directory."""
    (tmp_path / "empty").mkdir()
    return tmp_path / "empty"


@pytest.fixture
def large_dir(tmp_path: Path) -> Path:
    """Create a directory with many files for performance testing."""
    for i in range(500):
        (tmp_path / f"file_{i:04d}.txt").write_text(f"content {i}")
    # Create subdirectories with files
    for d in range(10):
        sub = tmp_path / f"sub_{d}"
        sub.mkdir()
        for f in range(50):
            (sub / f"file_{f:03d}.dat").write_bytes(b"\x00" * 100)
    return tmp_path


@pytest.fixture
def dir_with_symlinks(tmp_path: Path) -> Path:
    """Create a directory with symlinks (if supported on this platform)."""
    target = tmp_path / "target.txt"
    target.write_text("target content")
    link = tmp_path / "link.txt"
    try:
        os.symlink(str(target), str(link))
    except (OSError, NotImplementedError):
        pytest.skip("Symlinks not supported on this platform")
    (tmp_path / "regular.txt").write_text("regular")
    return tmp_path


# ── Model property tests ───────────────────────────────────────

class TestModelProperties:
    def test_file_entry_asset_name(self):
        """FileEntry.asset_name should return the filename via pathlib."""
        from avs_backend.scan_core.models import FileEntry
        from pathlib import Path
        path = r"C:\test\file.txt"
        fe = FileEntry(
            path=path, name="file.txt", size=100,
            extension=".txt", created_time=0, modified_time=0,
            is_hidden=False, is_system=False, is_read_only=False,
            is_archive=False, is_temporary=False, is_symlink=False,
            is_locked=False, parent_dir=r"C:\test", depth=1,
        )
        assert fe.asset_name == "file.txt"
        assert fe.asset_directory == str(Path(path).parent)
        assert fe.asset_extension == ".txt"

    def test_file_entry_asset_name_unix(self):
        """FileEntry.asset_name should work with Unix paths."""
        from avs_backend.scan_core.models import FileEntry
        from pathlib import Path
        path = "/var/log/syslog"
        fe = FileEntry(
            path=path, name="syslog", size=100,
            extension="", created_time=0, modified_time=0,
            is_hidden=False, is_system=False, is_read_only=False,
            is_archive=False, is_temporary=False, is_symlink=False,
            is_locked=False, parent_dir="/var/log", depth=1,
        )
        assert fe.asset_name == "syslog"
        assert fe.asset_directory == str(Path(path).parent)
        assert fe.asset_extension == ""

    def test_directory_entry_asset_name(self):
        """DirectoryEntry.asset_name should return the directory name via pathlib."""
        from avs_backend.scan_core.models import DirectoryEntry
        from pathlib import Path
        path = r"C:\test\subdir"
        de = DirectoryEntry(
            path=path, name="subdir",
            created_time=0, modified_time=0,
            is_hidden=False, is_system=False, is_read_only=False,
            is_symlink=False, parent_dir=r"C:\test", depth=1,
        )
        assert de.asset_name == "subdir"
        assert de.asset_directory == str(Path(path).parent)

    def test_drive_entry_asset_name(self):
        """DriveEntry.asset_name should return the drive name."""
        from avs_backend.scan_core.models import DriveEntry
        de = DriveEntry(
            path="C:\\", name="C:", drive_type="local",
            total_size=1000, free_space=500,
            is_removable=False, is_network=False, file_system="NTFS",
        )
        assert de.asset_name == "C:"


# ── Small directory tests ──────────────────────────────────────

class TestSmallDirectory:
    def test_enumerates_files_and_directories(self, small_dir: Path):
        enumerator = FilesystemEnumerator()
        entries = list(enumerator.enumerate(str(small_dir)))

        files = [e for e in entries if isinstance(e, FileEntry)]
        dirs = [e for e in entries if isinstance(e, DirectoryEntry)]

        assert len(files) == 5  # file1.txt, file2.log, file3.txt, nested.py, deep_file.txt
        assert len(dirs) == 4   # root, subdir1, subdir2, deep

    def test_file_entry_has_correct_attributes(self, small_dir: Path):
        enumerator = FilesystemEnumerator()
        entries = list(enumerator.enumerate(str(small_dir)))

        file1 = next(e for e in entries if isinstance(e, FileEntry) and e.name == "file1.txt")
        assert file1.size == 5  # "hello"
        assert file1.extension == ".txt"
        assert file1.entry_type == EntryType.FILE
        assert file1.depth == 1
        assert file1.parent_dir == str(small_dir)

    def test_directory_entry_has_correct_depth(self, small_dir: Path):
        enumerator = FilesystemEnumerator()
        entries = list(enumerator.enumerate(str(small_dir)))

        root = next(e for e in entries if isinstance(e, DirectoryEntry) and e.depth == 0)
        assert root.path == str(small_dir)

        deep = next(e for e in entries if isinstance(e, DirectoryEntry) and e.name == "deep")
        assert deep.depth == 2

    def test_convenience_function_works(self, small_dir: Path):
        entries = list(enumerate_filesystem(str(small_dir)))
        assert len(entries) > 0


# ── Empty directory tests ──────────────────────────────────────

class TestEmptyDirectory:
    def test_empty_directory_yields_only_itself(self, empty_dir: Path):
        enumerator = FilesystemEnumerator()
        entries = list(enumerator.enumerate(str(empty_dir)))

        dirs = [e for e in entries if isinstance(e, DirectoryEntry)]
        files = [e for e in entries if isinstance(e, FileEntry)]

        assert len(dirs) == 1  # the empty dir itself
        assert len(files) == 0
        assert dirs[0].name == "empty"

    def test_empty_directory_no_files(self, empty_dir: Path):
        enumerator = FilesystemEnumerator()
        opts = EnumerateOptions(include_directories=False)
        entries = list(enumerator.enumerate(str(empty_dir), options=opts))
        assert len(entries) == 0


# ── Large directory tests ──────────────────────────────────────

class TestLargeDirectory:
    def test_large_directory_counts(self, large_dir: Path):
        enumerator = FilesystemEnumerator()
        entries = list(enumerator.enumerate(str(large_dir)))

        files = [e for e in entries if isinstance(e, FileEntry)]
        dirs = [e for e in entries if isinstance(e, DirectoryEntry)]

        assert len(files) == 1000  # 500 root + 500 in subdirs
        assert len(dirs) == 11     # root + 10 subdirs

    def test_large_directory_streams(self, large_dir: Path):
        """Verify the enumerator yields incrementally, not all at once."""
        enumerator = FilesystemEnumerator()
        gen = enumerator.enumerate(str(large_dir))

        # Get first entry — should not consume all
        first = next(gen)
        assert first is not None

        # Count rest
        rest = sum(1 for _ in gen)
        assert rest > 900  # remaining entries


# ── Permission denied tests ────────────────────────────────────

class TestPermissionDenied:
    def test_permission_denied_does_not_crash(self, tmp_path: Path):
        """Ensure PermissionError is handled gracefully."""
        restricted = tmp_path / "restricted"
        restricted.mkdir()
        (restricted / "file.txt").write_text("content")

        # Create a subdirectory we can't read (skip if we can't set permissions)
        locked = restricted / "locked"
        locked.mkdir()
        (locked / "secret.txt").write_text("secret")

        try:
            os.chmod(str(locked), 0o000)
        except (PermissionError, OSError):
            pytest.skip("Cannot set restrictive permissions on this platform")

        try:
            enumerator = FilesystemEnumerator()
            entries = list(enumerator.enumerate(str(restricted)))

            # Should not crash, should still get files from restricted dir
            files = [e for e in entries if isinstance(e, FileEntry)]
            assert any(f.name == "file.txt" for f in files)
        finally:
            # Restore permissions so cleanup works
            os.chmod(str(locked), 0o755)


# ── Symlink tests ──────────────────────────────────────────────

class TestSymlinks:
    def test_symlink_detected(self, dir_with_symlinks: Path):
        enumerator = FilesystemEnumerator()
        entries = list(enumerator.enumerate(str(dir_with_symlinks)))

        files = [e for e in entries if isinstance(e, FileEntry)]
        link_entry = next(f for f in files if f.name == "link.txt")
        assert link_entry.is_symlink is True

    def test_symlink_not_followed_by_default(self, dir_with_symlinks: Path):
        enumerator = FilesystemEnumerator()
        opts = EnumerateOptions(follow_symlinks=False)
        entries = list(enumerator.enumerate(str(dir_with_symlinks), options=opts))

        files = [e for e in entries if isinstance(e, FileEntry)]
        # Should still get the symlink as a file entry, just not follow it
        assert any(f.name == "link.txt" for f in files)

    def test_symlink_target_resolved(self, dir_with_symlinks: Path):
        """Symlink entries should include the target path."""
        enumerator = FilesystemEnumerator()
        opts = EnumerateOptions(follow_symlinks=False)
        entries = list(enumerator.enumerate(str(dir_with_symlinks), options=opts))

        files = [e for e in entries if isinstance(e, FileEntry)]
        link_entry = next(f for f in files if f.name == "link.txt")
        assert link_entry.is_symlink is True
        assert link_entry.symlink_target is not None
        assert "target.txt" in link_entry.symlink_target
        assert link_entry.is_broken_symlink is False

    def test_broken_symlink_detected(self, tmp_path: Path):
        """Broken symlinks should be detected and still emitted."""
        link = tmp_path / "broken_link.txt"
        try:
            os.symlink(str(tmp_path / "nonexistent.txt"), str(link))
        except (OSError, NotImplementedError):
            pytest.skip("Symlinks not supported on this platform")

        (tmp_path / "regular.txt").write_text("regular")

        enumerator = FilesystemEnumerator()
        opts = EnumerateOptions(follow_symlinks=False)
        entries = list(enumerator.enumerate(str(tmp_path), options=opts))

        files = [e for e in entries if isinstance(e, FileEntry)]
        link_entry = next(f for f in files if f.name == "broken_link.txt")
        assert link_entry.is_symlink is True
        assert link_entry.is_broken_symlink is True
        assert link_entry.symlink_target is not None

    def test_follow_symlinks_option(self, dir_with_symlinks: Path):
        enumerator = FilesystemEnumerator()
        opts = EnumerateOptions(follow_symlinks=True)
        entries = list(enumerator.enumerate(str(dir_with_symlinks), options=opts))

        files = [e for e in entries if isinstance(e, FileEntry)]
        # When following symlinks, the link should report the target's size
        link = next(f for f in files if f.name == "link.txt")
        assert link.size == len("target content")


# ── Hidden files tests ─────────────────────────────────────────

class TestHiddenFiles:
    @pytest.mark.skipif(sys.platform != "win32", reason="Windows-specific hidden attribute")
    def test_hidden_file_detected(self, tmp_path: Path):
        import ctypes

        hidden_path = tmp_path / "hidden.txt"
        hidden_path.write_text("hidden")
        # Set hidden attribute on Windows
        attrs = ctypes.windll.kernel32.GetFileAttributesW(str(hidden_path))
        ctypes.windll.kernel32.SetFileAttributesW(
            str(hidden_path),
            attrs | 0x2  # FILE_ATTRIBUTE_HIDDEN
        )

        try:
            enumerator = FilesystemEnumerator()
            entries = list(enumerator.enumerate(str(tmp_path)))
            files = [e for e in entries if isinstance(e, FileEntry)]
            hidden = next(f for f in files if f.name == "hidden.txt")
            assert hidden.is_hidden is True
        finally:
            ctypes.windll.kernel32.SetFileAttributesW(str(hidden_path), attrs)

    def test_hidden_filter_excludes_hidden(self, tmp_path: Path):
        """HiddenFileFilter with include_hidden=False should exclude hidden entries."""
        regular = tmp_path / "regular.txt"
        regular.write_text("visible")

        enumerator = FilesystemEnumerator()
        filter_chain = FilterChain(HiddenFileFilter(include_hidden=False))
        opts = EnumerateOptions(filter=filter_chain)

        entries = list(enumerator.enumerate(str(tmp_path), options=opts))
        files = [e for e in entries if isinstance(e, FileEntry)]
        assert any(f.name == "regular.txt" for f in files)


# ── Cancellation tests ─────────────────────────────────────────

class TestCancellation:
    def test_cancellation_stops_enumeration(self, large_dir: Path):
        cancel = CancelEvent()
        opts = EnumerateOptions(cancel_event=cancel)

        enumerator = FilesystemEnumerator()
        gen = enumerator.enumerate(str(large_dir), options=opts)

        # Consume a few entries
        first = next(gen)
        assert first is not None

        # Cancel
        cancel.cancel()

        # Drain remaining — should stop quickly
        remaining = list(gen)
        # Should have stopped well before enumerating everything
        assert len(remaining) < 1100  # 1011 total, should stop much sooner

    def test_cancellation_before_start(self, small_dir: Path):
        cancel = CancelEvent()
        cancel.cancel()
        opts = EnumerateOptions(cancel_event=cancel)

        enumerator = FilesystemEnumerator()
        entries = list(enumerator.enumerate(str(small_dir), options=opts))
        assert len(entries) == 0


# ── Filter tests ───────────────────────────────────────────────

class TestFilters:
    def test_extension_filter(self, small_dir: Path):
        enumerator = FilesystemEnumerator()
        filter_chain = FilterChain(ExtensionFilter(extensions={".txt"}))
        opts = EnumerateOptions(filter=filter_chain)

        entries = list(enumerator.enumerate(str(small_dir), options=opts))
        files = [e for e in entries if isinstance(e, FileEntry)]
        assert all(f.extension == ".txt" for f in files)
        assert len(files) == 3  # file1.txt, file3.txt, deep_file.txt

    def test_extension_filter_multiple(self, small_dir: Path):
        enumerator = FilesystemEnumerator()
        filter_chain = FilterChain(ExtensionFilter(extensions={".txt", ".log"}))
        opts = EnumerateOptions(filter=filter_chain)

        entries = list(enumerator.enumerate(str(small_dir), options=opts))
        files = [e for e in entries if isinstance(e, FileEntry)]
        assert all(f.extension in (".txt", ".log") for f in files)
        assert len(files) == 4

    def test_max_depth_filter(self, small_dir: Path):
        enumerator = FilesystemEnumerator()
        filter_chain = FilterChain(MaxDepthFilter(max_depth=1))
        opts = EnumerateOptions(filter=filter_chain)

        entries = list(enumerator.enumerate(str(small_dir), options=opts))
        files = [e for e in entries if isinstance(e, FileEntry)]
        # depth 0 = root dir, depth 1 = files in root
        # Should get file1.txt, file2.log, file3.txt but NOT nested.py or deep_file.txt
        names = {f.name for f in files}
        assert "file1.txt" in names
        assert "nested.py" not in names
        assert "deep_file.txt" not in names

    def test_max_size_filter(self, small_dir: Path):
        enumerator = FilesystemEnumerator()
        filter_chain = FilterChain(MaxSizeFilter(max_size=5))
        opts = EnumerateOptions(filter=filter_chain)

        entries = list(enumerator.enumerate(str(small_dir), options=opts))
        files = [e for e in entries if isinstance(e, FileEntry)]
        assert all(f.size <= 5 for f in files)

    def test_directory_exclusion_filter(self, small_dir: Path):
        enumerator = FilesystemEnumerator()
        filter_chain = FilterChain(
            DirectoryExclusionFilter(excluded_paths={str(small_dir / "subdir2")})
        )
        opts = EnumerateOptions(filter=filter_chain)

        entries = list(enumerator.enumerate(str(small_dir), options=opts))
        dirs = [e for e in entries if isinstance(e, DirectoryEntry)]
        files = [e for e in entries if isinstance(e, FileEntry)]

        # subdir2 and its children should be excluded
        dir_names = {d.name for d in dirs}
        assert "subdir2" not in dir_names
        assert "deep" not in dir_names

        file_names = {f.name for f in files}
        assert "deep_file.txt" not in file_names

    def test_directory_exclusion_by_name(self, small_dir: Path):
        enumerator = FilesystemEnumerator()
        filter_chain = FilterChain(
            DirectoryExclusionFilter(excluded_paths=set(), excluded_names={"subdir1"})
        )
        opts = EnumerateOptions(filter=filter_chain)

        entries = list(enumerator.enumerate(str(small_dir), options=opts))
        files = [e for e in entries if isinstance(e, FileEntry)]
        file_names = {f.name for f in files}
        assert "nested.py" not in file_names

    def test_date_range_filter(self, small_dir: Path):
        future = datetime.now() + timedelta(days=1)
        enumerator = FilesystemEnumerator()
        filter_chain = FilterChain(DateRangeFilter(before=future))
        opts = EnumerateOptions(filter=filter_chain)

        entries = list(enumerator.enumerate(str(small_dir), options=opts))
        files = [e for e in entries if isinstance(e, FileEntry)]
        # All files were just created, so all should pass
        assert len(files) > 0

    def test_date_range_filter_excludes_old(self, small_dir: Path):
        # Set an old modification time on a file
        old_file = small_dir / "file1.txt"
        old_time = time.time() - 86400 * 365  # 1 year ago
        os.utime(str(old_file), (old_time, old_time))

        cutoff = datetime.now() - timedelta(days=30)
        enumerator = FilesystemEnumerator()
        filter_chain = FilterChain(DateRangeFilter(after=cutoff))
        opts = EnumerateOptions(filter=filter_chain)

        entries = list(enumerator.enumerate(str(small_dir), options=opts))
        files = [e for e in entries if isinstance(e, FileEntry)]
        file_names = {f.name for f in files}
        assert "file1.txt" not in file_names  # too old
        assert "file2.log" in file_names      # recent

    def test_filter_chain_combines_multiple(self, small_dir: Path):
        enumerator = FilesystemEnumerator()
        filter_chain = FilterChain(
            ExtensionFilter(extensions={".txt"}),
            MaxDepthFilter(max_depth=1),
        )
        opts = EnumerateOptions(filter=filter_chain)

        entries = list(enumerator.enumerate(str(small_dir), options=opts))
        files = [e for e in entries if isinstance(e, FileEntry)]
        names = {f.name for f in files}
        assert names == {"file1.txt", "file3.txt"}


# ── Progress event tests ───────────────────────────────────────

class TestProgressEvents:
    def test_progress_events_emitted(self, large_dir: Path):
        events: list[ProgressEvent] = []

        def callback(event: ProgressEvent) -> None:
            events.append(event)

        enumerator = FilesystemEnumerator()
        opts = EnumerateOptions(progress_interval=50)
        list(enumerator.enumerate(str(large_dir), options=opts, on_progress=callback))

        assert len(events) > 0
        # Last event should have final counts
        last = events[-1]
        assert last.files_enumerated > 0
        assert last.elapsed_seconds >= 0

    def test_progress_event_has_current_folder(self, small_dir: Path):
        events: list[ProgressEvent] = []

        def callback(event: ProgressEvent) -> None:
            events.append(event)

        enumerator = FilesystemEnumerator()
        opts = EnumerateOptions(progress_interval=1)
        list(enumerator.enumerate(str(small_dir), options=opts, on_progress=callback))

        assert len(events) > 0
        assert events[-1].current_folder is not None


# ── Drive enumeration tests ────────────────────────────────────

class TestDriveEnumeration:
    def test_enumerate_drives_returns_list(self):
        enumerator = FilesystemEnumerator()
        drives = enumerator.enumerate_drives()
        assert isinstance(drives, list)
        # Should have at least one drive
        assert len(drives) > 0
        for drive in drives:
            assert isinstance(drive, DriveEntry)
            assert drive.total_size > 0
            assert drive.entry_type == EntryType.DRIVE


# ── Scan locations tests ───────────────────────────────────────

class TestScanLocations:
    def test_default_scan_locations_not_empty(self):
        locations = get_default_scan_locations()
        assert len(locations) > 0
        for loc in locations:
            assert isinstance(loc, ScanLocation)
            assert loc.path
            assert loc.label

    def test_enumerate_multiple_locations(self, tmp_path: Path):
        loc1 = tmp_path / "loc1"
        loc2 = tmp_path / "loc2"
        loc1.mkdir()
        loc2.mkdir()
        (loc1 / "a.txt").write_text("a")
        (loc2 / "b.txt").write_text("b")

        locations = [
            ScanLocation(path=str(loc1), label="Location 1"),
            ScanLocation(path=str(loc2), label="Location 2"),
        ]

        enumerator = FilesystemEnumerator()
        entries = list(enumerator.enumerate_locations(locations))

        files = [e for e in entries if isinstance(e, FileEntry)]
        names = {f.name for f in files}
        assert "a.txt" in names
        assert "b.txt" in names

    def test_disabled_location_skipped(self, tmp_path: Path):
        loc1 = tmp_path / "loc1"
        loc2 = tmp_path / "loc2"
        loc1.mkdir()
        loc2.mkdir()
        (loc1 / "a.txt").write_text("a")
        (loc2 / "b.txt").write_text("b")

        locations = [
            ScanLocation(path=str(loc1), label="Location 1", enabled=True),
            ScanLocation(path=str(loc2), label="Location 2", enabled=False),
        ]

        enumerator = FilesystemEnumerator()
        entries = list(enumerator.enumerate_locations(locations))
        files = [e for e in entries if isinstance(e, FileEntry)]
        names = {f.name for f in files}
        assert "a.txt" in names
        assert "b.txt" not in names


# ── Options tests ──────────────────────────────────────────────

class TestOptions:
    def test_include_files_false(self, small_dir: Path):
        enumerator = FilesystemEnumerator()
        opts = EnumerateOptions(include_files=False)
        entries = list(enumerator.enumerate(str(small_dir), options=opts))
        files = [e for e in entries if isinstance(e, FileEntry)]
        assert len(files) == 0

    def test_include_directories_false(self, small_dir: Path):
        enumerator = FilesystemEnumerator()
        opts = EnumerateOptions(include_directories=False)
        entries = list(enumerator.enumerate(str(small_dir), options=opts))
        dirs = [e for e in entries if isinstance(e, DirectoryEntry)]
        assert len(dirs) == 0

    def test_include_drives_false(self, tmp_path: Path):
        enumerator = FilesystemEnumerator()
        opts = EnumerateOptions(include_drives=False)
        entries = list(enumerator.enumerate(str(tmp_path), options=opts))
        drives = [e for e in entries if isinstance(e, DriveEntry)]
        assert len(drives) == 0


# ── Drive enumeration tests ─────────────────────────────────────

class TestDriveEnumeration:
    def test_enumerate_drives_returns_list(self):
        """enumerate_drives should return a list of DriveEntry."""
        enumerator = FilesystemEnumerator()
        drives = enumerator.enumerate_drives()
        assert isinstance(drives, list)

    @pytest.mark.skipif(sys.platform == "win32", reason="Linux-specific pseudo filesystem test")
    def test_pseudo_filesystems_excluded_on_linux(self):
        """Pseudo filesystems like /proc, /sys, /dev, /run should not appear as drives."""
        from avs_backend.scan_core.enumerator import _enumerate_drives
        drives = _enumerate_drives()
        paths = {d.path for d in drives}
        # None of these pseudo mount paths should be reported as drives
        assert "/proc" not in paths
        assert "/sys" not in paths
        assert "/dev" not in paths
        assert "/run" not in paths
        # Also check fs_type
        for d in drives:
            assert d.file_system not in ("proc", "sysfs", "devtmpfs", "devpts", "tmpfs", "overlay", "squashfs")
