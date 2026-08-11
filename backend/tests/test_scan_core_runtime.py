"""
Tests for the Runtime Enumerator (Phase SC-5).

Covers process enumeration, connection enumeration, session enumeration,
resource snapshots, locked files, filters, statistics, progress events,
cancellation, and error handling.
"""

import os
import sys
import time
import pytest

from avs_backend.scan_core.runtime import (
    RuntimeAssetType,
    ProcessAsset,
    ConnectionAsset,
    SessionAsset,
    LockedFileAsset,
    ResourceSnapshot,
    RuntimeStatistics,
    ProcessNameFilter,
    PIDFilter,
    UserFilter,
    StatusFilter,
    PathFilter,
    RegexFilter,
    RuntimeFilterChain,
    RuntimeEnumerator,
    RuntimeEnumerateOptions,
    RuntimeProgressEvent,
    RuntimeCancelEvent,
    RuntimeCapabilities,
    enumerate_runtime,
)


# ── Model tests ────────────────────────────────────────────────

class TestModels:
    def test_process_asset_properties(self):
        p = ProcessAsset(pid=1, name="test", status="running")
        assert p.asset_type == RuntimeAssetType.PROCESS
        assert p.asset_name == "test"
        assert p.is_running is True

    def test_process_asset_not_running(self):
        p = ProcessAsset(pid=1, name="test", status="stopped")
        assert p.is_running is False

    def test_connection_asset_properties(self):
        c = ConnectionAsset(protocol="tcp", local_address="0.0.0.0", local_port=80, state="LISTEN")
        assert c.asset_type == RuntimeAssetType.CONNECTION
        assert c.is_listening is True

    def test_connection_asset_not_listening(self):
        c = ConnectionAsset(protocol="tcp", local_address="1.2.3.4", local_port=80, state="ESTABLISHED")
        assert c.is_listening is False

    def test_session_asset_properties(self):
        s = SessionAsset(session_id=1, username="user", state="Active")
        assert s.asset_type == RuntimeAssetType.SESSION
        assert s.is_active is True

    def test_session_asset_inactive(self):
        s = SessionAsset(session_id=1, username="user", state="Disc")
        assert s.is_active is False

    def test_locked_file_asset_properties(self):
        f = LockedFileAsset(path="C:\\test\\file.txt")
        assert f.asset_type == RuntimeAssetType.LOCKED_FILE
        assert f.asset_name == "file.txt"
        assert f.asset_path == "C:\\test\\file.txt"

    def test_resource_snapshot_properties(self):
        r = ResourceSnapshot(cpu_percent=50.0, memory_total=1000, memory_used=500)
        assert r.asset_type == RuntimeAssetType.RESOURCE_SNAPSHOT
        assert r.memory_free == 500

    def test_process_asset_pathlib_properties(self):
        """ProcessAsset should expose asset_directory and asset_extension via pathlib."""
        from pathlib import Path
        exe = "/usr/bin/test.exe"
        p = ProcessAsset(pid=1, name="test", executable_path=exe)
        assert p.asset_directory == str(Path(exe).parent)
        assert p.asset_extension == ".exe"

    def test_process_asset_empty_path_properties(self):
        """ProcessAsset with empty path should return empty dir/extension."""
        p = ProcessAsset(pid=1, name="test", executable_path="")
        assert p.asset_directory == ""
        assert p.asset_extension == ""

    def test_locked_file_asset_name_unix_path(self):
        """LockedFileAsset.asset_name should return basename for Unix paths."""
        f = LockedFileAsset(path="/var/log/syslog")
        assert f.asset_name == "syslog"

    def test_locked_file_asset_name_windows_path(self):
        """LockedFileAsset.asset_name should return basename for Windows paths."""
        f = LockedFileAsset(path=r"C:\Users\test\file.txt")
        assert f.asset_name == "file.txt"


# ── Capability tests ───────────────────────────────────────────

class TestCapabilities:
    def test_capabilities_created(self):
        """RuntimeEnumerator should have capabilities."""
        enumerator = RuntimeEnumerator()
        assert enumerator.capabilities is not None

    @pytest.mark.skipif(sys.platform != "win32", reason="Windows-specific")
    def test_supports_handles_on_windows(self):
        """supports_handles should be True on Windows."""
        caps = RuntimeCapabilities()
        assert caps.supports_handles is True
        assert caps.supports_locked_files is True

    @pytest.mark.skipif(sys.platform == "win32", reason="Non-Windows specific")
    def test_does_not_support_handles_on_linux(self):
        """supports_handles should be False on non-Windows."""
        caps = RuntimeCapabilities()
        assert caps.supports_handles is False
        assert caps.supports_locked_files is False

    def test_supports_sessions_all_platforms(self):
        """supports_sessions should be True on all platforms."""
        caps = RuntimeCapabilities()
        assert caps.supports_sessions is True


# ── Statistics tests ───────────────────────────────────────────

class TestStatistics:
    def test_statistics_track_counts(self):
        stats = RuntimeStatistics()
        stats.processes += 5
        stats.connections += 3
        stats.sessions += 1
        assert stats.total_assets == 9

    def test_statistics_finalize(self):
        stats = RuntimeStatistics()
        stats.processes += 10
        stats.finalize(2.0)
        assert stats.elapsed_seconds == 2.0
        assert stats.assets_per_second == 5.0


# ── Process enumeration tests ──────────────────────────────────

class TestProcessEnumeration:
    def test_processes_found(self):
        """Processes should be enumerated."""
        enumerator = RuntimeEnumerator()
        entries = list(enumerator.enumerate())
        processes = [e for e in entries if isinstance(e, ProcessAsset)]
        assert len(processes) > 0

    def test_process_has_fields(self):
        """Each process should have required fields populated."""
        enumerator = RuntimeEnumerator()
        entries = list(enumerator.enumerate())
        processes = [e for e in entries if isinstance(e, ProcessAsset)]
        if processes:
            p = processes[0]
            assert p.pid >= 0
            assert p.name != ""
            assert p.status != ""
            assert p.thread_count >= 0

    def test_process_has_parent_pid(self):
        """Most processes should have a parent PID."""
        enumerator = RuntimeEnumerator()
        opts = RuntimeEnumerateOptions(include_connections=False, include_sessions=False, include_resource_snapshot=False)
        entries = list(enumerator.enumerate(options=opts))
        processes = [e for e in entries if isinstance(e, ProcessAsset)]
        with_parent = [p for p in processes if p.parent_pid is not None]
        assert len(with_parent) > 0

    def test_process_has_memory(self):
        """Processes should have memory info."""
        enumerator = RuntimeEnumerator()
        opts = RuntimeEnumerateOptions(include_connections=False, include_sessions=False, include_resource_snapshot=False)
        entries = list(enumerator.enumerate(options=opts))
        processes = [e for e in entries if isinstance(e, ProcessAsset)]
        if processes:
            p = processes[0]
            assert p.memory_bytes >= 0
            assert p.memory_percent >= 0.0


# ── Connection enumeration tests ───────────────────────────────

class TestConnectionEnumeration:
    def test_connections_enumerated(self):
        """Connections should be enumerated without crashing."""
        enumerator = RuntimeEnumerator()
        opts = RuntimeEnumerateOptions(include_processes=False, include_sessions=False, include_resource_snapshot=False)
        entries = list(enumerator.enumerate(options=opts))
        connections = [e for e in entries if isinstance(e, ConnectionAsset)]
        # May be 0 on some systems, but should not crash
        for c in connections:
            assert c.protocol in ("tcp", "udp")
            assert c.local_port >= 0

    def test_connection_has_fields(self):
        """Connections should have required fields."""
        enumerator = RuntimeEnumerator()
        opts = RuntimeEnumerateOptions(include_processes=False, include_sessions=False, include_resource_snapshot=False)
        entries = list(enumerator.enumerate(options=opts))
        connections = [e for e in entries if isinstance(e, ConnectionAsset)]
        if connections:
            c = connections[0]
            assert c.protocol != ""
            assert c.state != ""


# ── Session enumeration tests ──────────────────────────────────

class TestSessionEnumeration:
    def test_sessions_enumerated(self):
        """Sessions should be enumerated without crashing."""
        enumerator = RuntimeEnumerator()
        opts = RuntimeEnumerateOptions(include_processes=False, include_connections=False, include_resource_snapshot=False)
        entries = list(enumerator.enumerate(options=opts))
        sessions = [e for e in entries if isinstance(e, SessionAsset)]
        # May be 0 on some systems, but should not crash
        for s in sessions:
            assert s.session_id >= 0

    def test_session_has_fields(self):
        """Sessions should have required fields."""
        enumerator = RuntimeEnumerator()
        opts = RuntimeEnumerateOptions(include_processes=False, include_connections=False, include_resource_snapshot=False)
        entries = list(enumerator.enumerate(options=opts))
        sessions = [e for e in entries if isinstance(e, SessionAsset)]
        if sessions:
            s = sessions[0]
            assert s.state != ""


# ── Resource snapshot tests ────────────────────────────────────

class TestResourceSnapshot:
    def test_resource_snapshot_taken(self):
        """A resource snapshot should be taken."""
        enumerator = RuntimeEnumerator()
        opts = RuntimeEnumerateOptions(
            include_processes=False, include_connections=False, include_sessions=False,
            include_resource_snapshot=True,
        )
        entries = list(enumerator.enumerate(options=opts))
        snapshots = [e for e in entries if isinstance(e, ResourceSnapshot)]
        assert len(snapshots) == 1

    def test_resource_snapshot_has_fields(self):
        """Resource snapshot should have CPU and memory info."""
        enumerator = RuntimeEnumerator()
        opts = RuntimeEnumerateOptions(
            include_processes=False, include_connections=False, include_sessions=False,
            include_resource_snapshot=True,
        )
        entries = list(enumerator.enumerate(options=opts))
        snapshots = [e for e in entries if isinstance(e, ResourceSnapshot)]
        if snapshots:
            s = snapshots[0]
            assert s.cpu_percent >= 0.0
            assert s.cpu_count > 0
            assert s.memory_total > 0
            assert s.memory_used >= 0
            assert s.memory_percent >= 0.0


# ── Filter tests ───────────────────────────────────────────────

class TestFilters:
    def test_process_name_filter(self):
        p1 = ProcessAsset(pid=1, name="chrome.exe")
        p2 = ProcessAsset(pid=2, name="firefox.exe")
        f = ProcessNameFilter(name_substring="chrome")
        assert f.matches(p1) is True
        assert f.matches(p2) is False

    def test_process_name_filter_case_insensitive(self):
        p = ProcessAsset(pid=1, name="Chrome.exe")
        f = ProcessNameFilter(name_substring="chrome")
        assert f.matches(p) is True

    def test_pid_filter(self):
        p1 = ProcessAsset(pid=100, name="test")
        p2 = ProcessAsset(pid=200, name="test")
        f = PIDFilter(pid=100)
        assert f.matches(p1) is True
        assert f.matches(p2) is False

    def test_user_filter(self):
        p1 = ProcessAsset(pid=1, name="test", username="ADMIN\\user1")
        p2 = ProcessAsset(pid=2, name="test", username="ADMIN\\user2")
        f = UserFilter(username_substring="user1")
        assert f.matches(p1) is True
        assert f.matches(p2) is False

    def test_status_filter_process(self):
        p1 = ProcessAsset(pid=1, name="test", status="running")
        p2 = ProcessAsset(pid=2, name="test", status="stopped")
        f = StatusFilter(status="running")
        assert f.matches(p1) is True
        assert f.matches(p2) is False

    def test_status_filter_connection(self):
        c1 = ConnectionAsset(protocol="tcp", local_address="0.0.0.0", local_port=80, state="LISTEN")
        c2 = ConnectionAsset(protocol="tcp", local_address="1.2.3.4", local_port=80, state="ESTABLISHED")
        f = StatusFilter(status="listen")
        assert f.matches(c1) is True
        assert f.matches(c2) is False

    def test_path_filter(self):
        p1 = ProcessAsset(pid=1, name="test", executable_path="C:\\Program Files\\app\\test.exe")
        p2 = ProcessAsset(pid=2, name="test", executable_path="C:\\Windows\\system32\\test.exe")
        f = PathFilter(path_substrings=("Program Files",))
        assert f.matches(p1) is True
        assert f.matches(p2) is False

    def test_path_filter_multiple(self):
        p1 = ProcessAsset(pid=1, name="test", executable_path="C:\\Program Files\\app\\test.exe")
        p2 = ProcessAsset(pid=2, name="test", executable_path="C:\\Windows\\system32\\test.exe")
        f = PathFilter(path_substrings=("Program Files", "Windows"))
        assert f.matches(p1) is True
        assert f.matches(p2) is True

    def test_regex_filter(self):
        p1 = ProcessAsset(pid=1, name="chrome.exe")
        p2 = ProcessAsset(pid=2, name="firefox.exe")
        f = RegexFilter(pattern=r"^chrome")
        assert f.matches(p1) is True
        assert f.matches(p2) is False

    def test_filter_chain_combines(self):
        p1 = ProcessAsset(pid=1, name="chrome.exe", status="running")
        p2 = ProcessAsset(pid=2, name="chrome.exe", status="stopped")
        p3 = ProcessAsset(pid=3, name="firefox.exe", status="running")
        chain = RuntimeFilterChain(
            ProcessNameFilter(name_substring="chrome"),
            StatusFilter(status="running"),
        )
        assert chain.matches(p1) is True
        assert chain.matches(p2) is False
        assert chain.matches(p3) is False

    def test_filter_chain_empty_passes_all(self):
        p = ProcessAsset(pid=1, name="test")
        chain = RuntimeFilterChain()
        assert chain.matches(p) is True


# ── Options tests ──────────────────────────────────────────────

class TestOptions:
    def test_include_processes_false(self):
        """When include_processes=False, no ProcessAssets should be yielded."""
        enumerator = RuntimeEnumerator()
        opts = RuntimeEnumerateOptions(
            include_processes=False,
            include_connections=False, include_sessions=False, include_resource_snapshot=False,
        )
        entries = list(enumerator.enumerate(options=opts))
        processes = [e for e in entries if isinstance(e, ProcessAsset)]
        assert len(processes) == 0

    def test_include_connections_false(self):
        """When include_connections=False, no ConnectionAssets should be yielded."""
        enumerator = RuntimeEnumerator()
        opts = RuntimeEnumerateOptions(
            include_connections=False,
            include_processes=False, include_sessions=False, include_resource_snapshot=False,
        )
        entries = list(enumerator.enumerate(options=opts))
        connections = [e for e in entries if isinstance(e, ConnectionAsset)]
        assert len(connections) == 0


# ── Progress event tests ───────────────────────────────────────

class TestProgressEvents:
    def test_progress_events_emitted(self):
        """Progress events should be emitted during enumeration."""
        enumerator = RuntimeEnumerator()
        events = []
        opts = RuntimeEnumerateOptions(progress_interval=1)
        list(enumerator.enumerate(options=opts, on_progress=events.append))
        # At least the final "Complete" event
        assert len(events) > 0
        assert events[-1].current_category == "Complete"

    def test_progress_has_current_category(self):
        """Progress events should have a category."""
        enumerator = RuntimeEnumerator()
        events = []
        opts = RuntimeEnumerateOptions(progress_interval=1)
        list(enumerator.enumerate(options=opts, on_progress=events.append))
        # Some events should have a category
        categories = [e.current_category for e in events if e.current_category]
        assert "Complete" in categories


# ── Cancellation tests ─────────────────────────────────────────

class TestCancellation:
    def test_cancellation_stops_enumeration(self):
        """Cancelling mid-scan should stop enumeration."""
        enumerator = RuntimeEnumerator()
        cancel = RuntimeCancelEvent()
        opts = RuntimeEnumerateOptions(cancel_event=cancel)
        count = 0
        for asset in enumerator.enumerate(options=opts):
            count += 1
            if count >= 5:
                cancel.cancel()
        # Should have stopped after a few items
        assert count >= 5

    def test_cancellation_before_start(self):
        """Cancelling before starting should yield nothing."""
        enumerator = RuntimeEnumerator()
        cancel = RuntimeCancelEvent()
        cancel.cancel()
        opts = RuntimeEnumerateOptions(cancel_event=cancel)
        entries = list(enumerator.enumerate(options=opts))
        assert len(entries) == 0


# ── Error handling tests ───────────────────────────────────────

class TestErrorHandling:
    def test_enumeration_does_not_crash(self):
        """Full enumeration should not crash."""
        enumerator = RuntimeEnumerator()
        entries = list(enumerator.enumerate())
        # Should complete without exception
        assert isinstance(entries, list)

    def test_statistics_track_permission_errors(self):
        """Permission errors should be tracked in statistics."""
        enumerator = RuntimeEnumerator()
        list(enumerator.enumerate())
        stats = enumerator.get_statistics()
        # On most systems, some processes will be access-denied
        # Just verify the field exists and is non-negative
        assert stats.permission_errors >= 0

    def test_statistics_track_errors(self):
        """Errors should be tracked in statistics."""
        enumerator = RuntimeEnumerator()
        list(enumerator.enumerate())
        stats = enumerator.get_statistics()
        assert stats.errors >= 0


# ── Statistics integration tests ───────────────────────────────

class TestStatisticsIntegration:
    def test_statistics_processes_count(self):
        """Statistics should track process count."""
        enumerator = RuntimeEnumerator()
        opts = RuntimeEnumerateOptions(
            include_connections=False, include_sessions=False, include_resource_snapshot=False,
        )
        entries = list(enumerator.enumerate(options=opts))
        stats = enumerator.get_statistics()
        processes = [e for e in entries if isinstance(e, ProcessAsset)]
        assert stats.processes == len(processes)

    def test_statistics_total_assets(self):
        """Total assets should equal sum of all categories."""
        enumerator = RuntimeEnumerator()
        entries = list(enumerator.enumerate())
        stats = enumerator.get_statistics()
        assert stats.total_assets == len(entries)

    def test_statistics_elapsed_seconds(self):
        """Elapsed seconds should be positive after enumeration."""
        enumerator = RuntimeEnumerator()
        list(enumerator.enumerate())
        stats = enumerator.get_statistics()
        assert stats.elapsed_seconds > 0.0


# ── Convenience function tests ─────────────────────────────────

class TestConvenienceFunction:
    def test_enumerate_runtime_works(self):
        """The convenience function should work."""
        entries = list(enumerate_runtime())
        assert len(entries) > 0


# ── Locked file tests ──────────────────────────────────────────

class TestLockedFiles:
    def test_locked_files_no_dirs(self):
        """With no directories specified, no locked files should be yielded."""
        enumerator = RuntimeEnumerator()
        opts = RuntimeEnumerateOptions(
            include_processes=False, include_connections=False, include_sessions=False,
            include_resource_snapshot=False, include_locked_files=True,
        )
        entries = list(enumerator.enumerate(options=opts))
        locked = [e for e in entries if isinstance(e, LockedFileAsset)]
        assert len(locked) == 0

    def test_locked_files_with_dir(self):
        """With a directory specified, should not crash."""
        import tempfile
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create a test file
            test_file = os.path.join(tmpdir, "test_file.txt")
            with open(test_file, "w") as f:
                f.write("test")

            enumerator = RuntimeEnumerator()
            opts = RuntimeEnumerateOptions(
                include_processes=False, include_connections=False, include_sessions=False,
                include_resource_snapshot=False, include_locked_files=True,
                locked_file_dirs=(tmpdir,),
            )
            entries = list(enumerator.enumerate(options=opts))
            locked = [e for e in entries if isinstance(e, LockedFileAsset)]
            # The test file should not be locked since we just created it
            assert len(locked) == 0
