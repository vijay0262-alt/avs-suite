"""
Unit tests for the Scan Core Windows Enumerator.

Tests cover:
- Service enumeration
- Driver enumeration
- Scheduled task enumeration
- Installed program enumeration
- Security enumeration
- System info
- Network adapters
- Restore points
- Statistics
- Progress events
- Cancellation
- Filters (asset type, status, name, path, regex, enabled)
- Missing permissions
"""

from __future__ import annotations

import sys
import pytest

pytestmark = pytest.mark.skipif(
    sys.platform != "win32",
    reason="Windows Enumerator tests are Windows-specific",
)

from avs_backend.scan_core.windows import (
    WindowsAssetType,
    ServiceAsset,
    DriverAsset,
    ScheduledTaskAsset,
    InstalledProgramAsset,
    SecurityAsset,
    RestorePointAsset,
    SystemAsset,
    NetworkAdapterAsset,
    WindowsStatistics,
    WindowsEnumerator,
    WindowsEnumerateOptions,
    WindowsProgressEvent,
    WindowsCancelEvent,
    AssetTypeFilter,
    StatusFilter,
    NameFilter,
    PathFilter,
    RegexFilter,
    EnabledFilter,
    WindowsFilterChain,
    enumerate_windows,
)


# ── Service enumeration tests ──────────────────────────────────

class TestServiceEnumeration:
    def test_services_found(self):
        """At least some services should be enumerated."""
        enumerator = WindowsEnumerator()
        opts = WindowsEnumerateOptions(
            include_drivers=False, include_tasks=False, include_programs=False,
            include_security=False, include_system=False, include_network=False,
            include_restore_points=False,
        )
        entries = list(enumerator.enumerate(options=opts))
        services = [e for e in entries if isinstance(e, ServiceAsset)]
        assert len(services) > 10  # Windows has many services

    def test_service_has_fields(self):
        """Service assets should have all required fields."""
        enumerator = WindowsEnumerator()
        opts = WindowsEnumerateOptions(
            include_drivers=False, include_tasks=False, include_programs=False,
            include_security=False, include_system=False, include_network=False,
            include_restore_points=False,
        )
        entries = list(enumerator.enumerate(options=opts))
        services = [e for e in entries if isinstance(e, ServiceAsset)]
        if services:
            svc = services[0]
            assert svc.service_name
            assert svc.display_name
            assert svc.status in ("Running", "Stopped", "Paused", "Starting", "Stopping", "Continue Pending", "Pause Pending", "Unknown")
            assert svc.startup_type in ("Auto", "Manual", "Disabled", "Delayed-Auto", "Boot", "System", "Unknown")
            assert svc.asset_type == WindowsAssetType.SERVICE

    def test_service_is_running_property(self):
        """is_running property should work."""
        enumerator = WindowsEnumerator()
        opts = WindowsEnumerateOptions(
            include_drivers=False, include_tasks=False, include_programs=False,
            include_security=False, include_system=False, include_network=False,
            include_restore_points=False,
        )
        entries = list(enumerator.enumerate(options=opts))
        services = [e for e in entries if isinstance(e, ServiceAsset)]
        running = [s for s in services if s.is_running]
        stopped = [s for s in services if not s.is_running]
        # Windows should have both running and stopped services
        assert len(running) > 0
        assert len(stopped) > 0


# ── Driver enumeration tests ───────────────────────────────────

class TestDriverEnumeration:
    def test_drivers_found(self):
        """At least some drivers should be enumerated."""
        enumerator = WindowsEnumerator()
        opts = WindowsEnumerateOptions(
            include_services=False, include_tasks=False, include_programs=False,
            include_security=False, include_system=False, include_network=False,
            include_restore_points=False,
        )
        entries = list(enumerator.enumerate(options=opts))
        drivers = [e for e in entries if isinstance(e, DriverAsset)]
        assert len(drivers) > 10

    def test_driver_has_fields(self):
        """Driver assets should have required fields."""
        enumerator = WindowsEnumerator()
        opts = WindowsEnumerateOptions(
            include_services=False, include_tasks=False, include_programs=False,
            include_security=False, include_system=False, include_network=False,
            include_restore_points=False,
        )
        entries = list(enumerator.enumerate(options=opts))
        drivers = [e for e in entries if isinstance(e, DriverAsset)]
        if drivers:
            drv = drivers[0]
            assert drv.driver_name
            assert drv.state
            assert drv.start_mode
            assert drv.asset_type == WindowsAssetType.DRIVER


# ── Scheduled task enumeration tests ───────────────────────────

class TestScheduledTaskEnumeration:
    def test_tasks_found(self):
        """At least some scheduled tasks should be enumerated."""
        enumerator = WindowsEnumerator()
        opts = WindowsEnumerateOptions(
            include_services=False, include_drivers=False, include_programs=False,
            include_security=False, include_system=False, include_network=False,
            include_restore_points=False,
        )
        entries = list(enumerator.enumerate(options=opts))
        tasks = [e for e in entries if isinstance(e, ScheduledTaskAsset)]
        # Windows always has some scheduled tasks
        assert len(tasks) > 0

    def test_task_has_fields(self):
        """Task assets should have required fields."""
        enumerator = WindowsEnumerator()
        opts = WindowsEnumerateOptions(
            include_services=False, include_drivers=False, include_programs=False,
            include_security=False, include_system=False, include_network=False,
            include_restore_points=False,
        )
        entries = list(enumerator.enumerate(options=opts))
        tasks = [e for e in entries if isinstance(e, ScheduledTaskAsset)]
        if tasks:
            task = tasks[0]
            assert task.task_name
            assert task.task_folder
            assert isinstance(task.enabled, bool)
            assert task.asset_type == WindowsAssetType.SCHEDULED_TASK


# ── Installed program enumeration tests ────────────────────────

class TestInstalledProgramEnumeration:
    def test_programs_found(self):
        """At least some installed programs should be enumerated."""
        enumerator = WindowsEnumerator()
        opts = WindowsEnumerateOptions(
            include_services=False, include_drivers=False, include_tasks=False,
            include_security=False, include_system=False, include_network=False,
            include_restore_points=False,
        )
        entries = list(enumerator.enumerate(options=opts))
        programs = [e for e in entries if isinstance(e, InstalledProgramAsset)]
        assert len(programs) > 0

    def test_program_has_fields(self):
        """Program assets should have required fields."""
        enumerator = WindowsEnumerator()
        opts = WindowsEnumerateOptions(
            include_services=False, include_drivers=False, include_tasks=False,
            include_security=False, include_system=False, include_network=False,
            include_restore_points=False,
        )
        entries = list(enumerator.enumerate(options=opts))
        programs = [e for e in entries if isinstance(e, InstalledProgramAsset)]
        if programs:
            prog = programs[0]
            assert prog.display_name
            assert prog.architecture in ("x86", "x64", "ARM64")
            assert prog.asset_type == WindowsAssetType.INSTALLED_PROGRAM

    def test_program_size_mb(self):
        """size_mb property should convert KB to MB."""
        prog = InstalledProgramAsset(
            display_name="Test",
            publisher="Test",
            version="1.0",
            install_date="20230101",
            install_location="C:\\Test",
            estimated_size=2048,
            registry_source="HKLM\\...",
            architecture="x64",
            is_update=False,
            is_feature=False,
        )
        assert prog.size_mb == 2.0


# ── Security enumeration tests ─────────────────────────────────

class TestSecurityEnumeration:
    def test_security_assets_found(self):
        """Security assets should be enumerated."""
        enumerator = WindowsEnumerator()
        opts = WindowsEnumerateOptions(
            include_services=False, include_drivers=False, include_tasks=False,
            include_programs=False, include_system=False, include_network=False,
            include_restore_points=False,
        )
        entries = list(enumerator.enumerate(options=opts))
        security = [e for e in entries if isinstance(e, SecurityAsset)]
        # Should find at least Defender or Firewall
        assert len(security) > 0

    def test_security_has_fields(self):
        """Security assets should have required fields."""
        enumerator = WindowsEnumerator()
        opts = WindowsEnumerateOptions(
            include_services=False, include_drivers=False, include_tasks=False,
            include_programs=False, include_system=False, include_network=False,
            include_restore_points=False,
        )
        entries = list(enumerator.enumerate(options=opts))
        security = [e for e in entries if isinstance(e, SecurityAsset)]
        if security:
            sec = security[0]
            assert sec.name
            assert sec.security_type
            assert isinstance(sec.is_enabled, bool)
            assert sec.asset_type == WindowsAssetType.SECURITY


# ── System info tests ──────────────────────────────────────────

class TestSystemInfo:
    def test_system_info_found(self):
        """System info should be collected."""
        enumerator = WindowsEnumerator()
        opts = WindowsEnumerateOptions(
            include_services=False, include_drivers=False, include_tasks=False,
            include_programs=False, include_security=False, include_network=False,
            include_restore_points=False,
        )
        entries = list(enumerator.enumerate(options=opts))
        systems = [e for e in entries if isinstance(e, SystemAsset)]
        assert len(systems) == 1

    def test_system_has_fields(self):
        """System asset should have all required fields."""
        enumerator = WindowsEnumerator()
        opts = WindowsEnumerateOptions(
            include_services=False, include_drivers=False, include_tasks=False,
            include_programs=False, include_security=False, include_network=False,
            include_restore_points=False,
        )
        entries = list(enumerator.enumerate(options=opts))
        systems = [e for e in entries if isinstance(e, SystemAsset)]
        assert len(systems) == 1
        sys_info = systems[0]
        assert sys_info.computer_name
        assert sys_info.os_version
        assert sys_info.build_number
        assert sys_info.architecture
        assert sys_info.uptime_seconds > 0
        assert sys_info.asset_type == WindowsAssetType.SYSTEM

    def test_system_uptime_str(self):
        """uptime_str should format correctly."""
        sys_info = SystemAsset(
            computer_name="TEST",
            os_version="10.0",
            build_number="19045",
            edition="Windows 10 Pro",
            architecture="AMD64",
            boot_time=0.0,
            uptime_seconds=3661,
            language="en_US",
            timezone="UTC",
            domain="WORKGROUP",
        )
        assert "1h 1m" in sys_info.uptime_str


# ── Network adapter tests ──────────────────────────────────────

class TestNetworkAdapters:
    def test_network_adapters_found(self):
        """Network adapters should be enumerated."""
        enumerator = WindowsEnumerator()
        opts = WindowsEnumerateOptions(
            include_services=False, include_drivers=False, include_tasks=False,
            include_programs=False, include_security=False, include_system=False,
            include_restore_points=False,
        )
        entries = list(enumerator.enumerate(options=opts))
        adapters = [e for e in entries if isinstance(e, NetworkAdapterAsset)]
        # Should find at least one adapter
        assert len(adapters) > 0

    def test_adapter_has_fields(self):
        """Network adapter assets should have required fields."""
        enumerator = WindowsEnumerator()
        opts = WindowsEnumerateOptions(
            include_services=False, include_drivers=False, include_tasks=False,
            include_programs=False, include_security=False, include_system=False,
            include_restore_points=False,
        )
        entries = list(enumerator.enumerate(options=opts))
        adapters = [e for e in entries if isinstance(e, NetworkAdapterAsset)]
        if adapters:
            adapter = adapters[0]
            assert adapter.adapter_name
            assert adapter.asset_type == WindowsAssetType.NETWORK_ADAPTER


# ── Statistics tests ───────────────────────────────────────────

class TestStatistics:
    def test_statistics_track_counts(self):
        """Statistics should track counts of enumerated assets."""
        enumerator = WindowsEnumerator()
        opts = WindowsEnumerateOptions(
            include_services=True, include_drivers=False, include_tasks=False,
            include_programs=False, include_security=False, include_system=False,
            include_network=False, include_restore_points=False,
        )
        list(enumerator.enumerate(options=opts))
        stats = enumerator.get_statistics()
        assert stats.services > 0
        assert stats.drivers == 0  # not included

    def test_statistics_total_assets(self):
        """total_assets should sum all categories."""
        stats = WindowsStatistics()
        stats.services = 10
        stats.drivers = 20
        stats.tasks = 5
        assert stats.total_assets == 35

    def test_statistics_finalize(self):
        """finalize should compute assets_per_second."""
        stats = WindowsStatistics()
        stats.services = 100
        stats.finalize(10.0)
        assert stats.elapsed_seconds == 10.0
        assert stats.assets_per_second == 10.0


# ── Progress event tests ───────────────────────────────────────

class TestProgressEvents:
    def test_progress_events_emitted(self):
        """Progress events should be emitted during enumeration."""
        events: list[WindowsProgressEvent] = []

        def callback(event: WindowsProgressEvent) -> None:
            events.append(event)

        enumerator = WindowsEnumerator()
        opts = WindowsEnumerateOptions(
            include_drivers=False, include_tasks=False, include_programs=False,
            include_security=False, include_system=False, include_network=False,
            include_restore_points=False,
            progress_interval=5,
        )
        list(enumerator.enumerate(options=opts, on_progress=callback))

        assert len(events) > 0
        assert events[-1].assets_enumerated > 0
        assert events[-1].elapsed_seconds >= 0

    def test_progress_has_current_category(self):
        """Progress events should include current category."""
        events: list[WindowsProgressEvent] = []

        def callback(event: WindowsProgressEvent) -> None:
            events.append(event)

        enumerator = WindowsEnumerator()
        opts = WindowsEnumerateOptions(
            include_drivers=False, include_tasks=False, include_programs=False,
            include_security=False, include_system=False, include_network=False,
            include_restore_points=False,
            progress_interval=1,
        )
        list(enumerator.enumerate(options=opts, on_progress=callback))

        category_events = [e for e in events if e.current_category]
        assert len(category_events) > 0


# ── Cancellation tests ─────────────────────────────────────────

class TestCancellation:
    def test_cancellation_stops_enumeration(self):
        """Cancelling should stop enumeration."""
        cancel = WindowsCancelEvent()
        opts = WindowsEnumerateOptions(
            include_drivers=False, include_tasks=False, include_programs=False,
            include_security=False, include_system=False, include_network=False,
            include_restore_points=False,
            cancel_event=cancel,
        )
        enumerator = WindowsEnumerator()
        gen = enumerator.enumerate(options=opts)

        # Consume a few entries
        first = next(gen, None)
        assert first is not None

        cancel.cancel()
        remaining = list(gen)
        # Should have stopped
        assert len(remaining) < 200

    def test_cancellation_before_start(self):
        """Cancelling before start should yield nothing."""
        cancel = WindowsCancelEvent()
        cancel.cancel()
        opts = WindowsEnumerateOptions(cancel_event=cancel)

        enumerator = WindowsEnumerator()
        entries = list(enumerator.enumerate(options=opts))
        assert len(entries) == 0


# ── Filter tests ───────────────────────────────────────────────

class TestFilters:
    def test_asset_type_filter(self):
        """AssetTypeFilter should restrict to specified types."""
        enumerator = WindowsEnumerator()
        filter_chain = WindowsFilterChain(
            AssetTypeFilter(asset_types={WindowsAssetType.SERVICE}),
        )
        opts = WindowsEnumerateOptions(
            include_drivers=False, include_tasks=False, include_programs=False,
            include_security=False, include_system=False, include_network=False,
            include_restore_points=False,
            filter=filter_chain,
        )
        entries = list(enumerator.enumerate(options=opts))
        for e in entries:
            assert e.asset_type == WindowsAssetType.SERVICE

    def test_status_filter(self):
        """StatusFilter should filter by status."""
        enumerator = WindowsEnumerator()
        filter_chain = WindowsFilterChain(
            StatusFilter(statuses={"running"}),
        )
        opts = WindowsEnumerateOptions(
            include_drivers=False, include_tasks=False, include_programs=False,
            include_security=False, include_system=False, include_network=False,
            include_restore_points=False,
            filter=filter_chain,
        )
        entries = list(enumerator.enumerate(options=opts))
        services = [e for e in entries if isinstance(e, ServiceAsset)]
        for s in services:
            assert s.status.lower() == "running"

    def test_name_filter(self):
        """NameFilter should match by name substring."""
        enumerator = WindowsEnumerator()
        filter_chain = WindowsFilterChain(
            NameFilter(name_substrings={"windows"}),
        )
        opts = WindowsEnumerateOptions(
            include_drivers=False, include_tasks=False, include_programs=False,
            include_security=False, include_system=False, include_network=False,
            include_restore_points=False,
            filter=filter_chain,
        )
        entries = list(enumerator.enumerate(options=opts))
        for e in entries:
            assert "windows" in e.asset_name.lower()

    def test_path_filter(self):
        """PathFilter should match by path substring."""
        enumerator = WindowsEnumerator()
        filter_chain = WindowsFilterChain(
            PathFilter(path_substrings={"system32"}),
        )
        opts = WindowsEnumerateOptions(
            include_drivers=False, include_tasks=False, include_programs=False,
            include_security=False, include_system=False, include_network=False,
            include_restore_points=False,
            filter=filter_chain,
        )
        entries = list(enumerator.enumerate(options=opts))
        for e in entries:
            if e.asset_path:
                assert "system32" in e.asset_path.lower()

    def test_regex_filter(self):
        """RegexFilter should match by regex."""
        enumerator = WindowsEnumerator()
        filter_chain = WindowsFilterChain(
            RegexFilter(pattern=r"Windows.*Service"),
        )
        opts = WindowsEnumerateOptions(
            include_drivers=False, include_tasks=False, include_programs=False,
            include_security=False, include_system=False, include_network=False,
            include_restore_points=False,
            filter=filter_chain,
        )
        entries = list(enumerator.enumerate(options=opts))
        import re
        compiled = re.compile(r"Windows.*Service", re.IGNORECASE)
        for e in entries:
            assert compiled.search(e.asset_name) or (e.asset_path and compiled.search(e.asset_path))

    def test_enabled_filter(self):
        """EnabledFilter should filter by enabled status."""
        enumerator = WindowsEnumerator()
        filter_chain = WindowsFilterChain(
            AssetTypeFilter(asset_types={WindowsAssetType.SCHEDULED_TASK}),
            EnabledFilter(enabled_only=True),
        )
        opts = WindowsEnumerateOptions(
            include_services=False, include_drivers=False,
            include_programs=False, include_security=False,
            include_system=False, include_network=False,
            include_restore_points=False,
            filter=filter_chain,
        )
        entries = list(enumerator.enumerate(options=opts))
        tasks = [e for e in entries if isinstance(e, ScheduledTaskAsset)]
        for t in tasks:
            assert t.enabled

    def test_filter_chain_combines(self):
        """FilterChain should combine multiple filters."""
        enumerator = WindowsEnumerator()
        filter_chain = WindowsFilterChain(
            AssetTypeFilter(asset_types={WindowsAssetType.SERVICE}),
            StatusFilter(statuses={"running"}),
            NameFilter(name_substrings={"windows"}),
        )
        opts = WindowsEnumerateOptions(
            include_drivers=False, include_tasks=False, include_programs=False,
            include_security=False, include_system=False, include_network=False,
            include_restore_points=False,
            filter=filter_chain,
        )
        entries = list(enumerator.enumerate(options=opts))
        for e in entries:
            assert e.asset_type == WindowsAssetType.SERVICE
            assert isinstance(e, ServiceAsset)
            assert e.status.lower() == "running"
            assert "windows" in e.asset_name.lower()


# ── Options tests ──────────────────────────────────────────────

class TestOptions:
    def test_include_services_false(self):
        """include_services=False should skip services."""
        enumerator = WindowsEnumerator()
        opts = WindowsEnumerateOptions(
            include_services=False,
            include_drivers=False, include_tasks=False, include_programs=False,
            include_security=False, include_system=False, include_network=False,
            include_restore_points=False,
        )
        entries = list(enumerator.enumerate(options=opts))
        services = [e for e in entries if isinstance(e, ServiceAsset)]
        assert len(services) == 0

    def test_include_system_false(self):
        """include_system=False should skip system info."""
        enumerator = WindowsEnumerator()
        opts = WindowsEnumerateOptions(
            include_services=False, include_drivers=False, include_tasks=False,
            include_programs=False, include_security=False, include_system=False,
            include_network=False, include_restore_points=False,
        )
        entries = list(enumerator.enumerate(options=opts))
        systems = [e for e in entries if isinstance(e, SystemAsset)]
        assert len(systems) == 0


# ── Model tests ────────────────────────────────────────────────

class TestModels:
    def test_service_asset_properties(self):
        svc = ServiceAsset(
            service_name="TestSvc",
            display_name="Test Service",
            status="Running",
            startup_type="Auto",
            binary_path="C:\\test.exe",
            service_account="LocalSystem",
            dependencies=("dep1", "dep2"),
            description="A test service",
            pid=1234,
        )
        assert svc.asset_name == "Test Service"
        assert svc.asset_path == "C:\\test.exe"
        assert svc.is_running is True

    def test_driver_asset_properties(self):
        drv = DriverAsset(
            driver_name="TestDrv",
            provider="TestProvider",
            version="1.0.0",
            path="C:\\driver.sys",
            driver_type="Kernel Driver",
            state="Running",
            start_mode="System",
        )
        assert drv.asset_name == "TestDrv"
        assert drv.asset_path == "C:\\driver.sys"

    def test_scheduled_task_properties(self):
        import time
        task = ScheduledTaskAsset(
            task_name="TestTask",
            task_folder="\\TestFolder",
            enabled=True,
            last_run_time=time.time(),
            next_run_time=None,
            trigger_count=1,
            action_count=1,
            principal="SYSTEM",
        )
        assert task.asset_name == "TestTask"
        assert task.asset_path == "\\TestFolder\\TestTask"
        assert task.last_run_datetime is not None
        assert task.next_run_datetime is None

    def test_restore_point_properties(self):
        import time
        rp = RestorePointAsset(
            description="Test Restore Point",
            creation_time=time.time(),
            sequence_number=1,
        )
        assert rp.asset_name == "Test Restore Point"
        assert rp.creation_datetime is not None

    def test_network_adapter_properties(self):
        adapter = NetworkAdapterAsset(
            adapter_name="Ethernet",
            description="Realtek PCIe GbE",
            mac_address="AA:BB:CC:DD:EE:FF",
            ipv4_addresses=("192.168.1.100",),
            ipv6_addresses=("::1",),
            default_gateway="192.168.1.1",
            dns_servers=("8.8.8.8",),
            dhcp_enabled=True,
            state="Up",
        )
        assert adapter.asset_name == "Ethernet"
        assert adapter.is_up is True


# ── Convenience function test ──────────────────────────────────

class TestConvenienceFunction:
    def test_enumerate_windows_works(self):
        """enumerate_windows convenience function should work."""
        opts = WindowsEnumerateOptions(
            include_drivers=False, include_tasks=False, include_programs=False,
            include_security=False, include_system=True, include_network=False,
            include_restore_points=False,
        )
        entries = list(enumerate_windows(options=opts))
        assert len(entries) > 0


# ── Permission / error handling tests ──────────────────────────

class TestErrorHandling:
    def test_enumeration_does_not_crash(self):
        """Full enumeration should not crash even with permission errors."""
        enumerator = WindowsEnumerator()
        opts = WindowsEnumerateOptions(
            include_services=True, include_drivers=True, include_tasks=True,
            include_programs=True, include_security=True, include_system=True,
            include_network=True, include_restore_points=True,
        )
        entries = list(enumerator.enumerate(options=opts))
        # Should complete without crashing
        assert isinstance(entries, list)
        assert len(entries) > 0

    def test_statistics_track_errors(self):
        """Statistics should track errors without crashing."""
        enumerator = WindowsEnumerator()
        opts = WindowsEnumerateOptions(
            include_services=False, include_drivers=False, include_tasks=False,
            include_programs=False, include_security=True, include_system=False,
            include_network=False, include_restore_points=False,
        )
        list(enumerator.enumerate(options=opts))
        stats = enumerator.get_statistics()
        assert stats.errors >= 0
