"""
Unit tests for Scan Core Asset Adapters (SC-6B).

Tests cover:
- Filesystem adapter (FileEntry, DirectoryEntry)
- Registry adapter (RegistryKeyAsset, RegistryValueAsset)
- Browser adapter (BrowserInstallation, BrowserProfile, BrowserAsset)
- Windows adapter (ServiceAsset, DriverAsset, etc.)
- Runtime adapter (ProcessAsset, ConnectionAsset, SessionAsset, LockedFileAsset)
- Adapter registry
- Identity preservation
- Metadata preservation
- Relationship preservation
- Tag preservation
"""

from __future__ import annotations

import pytest
from datetime import datetime

from avs_backend.scan_core.adapters import (
    FilesystemAdapter,
    RegistryAdapter,
    BrowserAdapter,
    WindowsAdapter,
    RuntimeAdapter,
    AdapterRegistry,
    get_adapter_for,
    convert_to_asset,
)
from avs_backend.scan_core.models import FileEntry, DirectoryEntry
from avs_backend.scan_core.registry.models import (
    RegistryKeyAsset,
    RegistryValueAsset,
    RegistryHive,
    RegistryValueType,
)
from avs_backend.scan_core.browser.models import (
    BrowserInstallation,
    BrowserProfile,
    BrowserAsset,
    BrowserType,
    ProfileStatus,
    BrowserAssetType,
)
from avs_backend.scan_core.windows.models import (
    ServiceAsset,
    DriverAsset,
    ScheduledTaskAsset,
    InstalledProgramAsset,
)
from avs_backend.scan_core.runtime.models import (
    ProcessAsset,
    ConnectionAsset,
    SessionAsset,
    LockedFileAsset,
)
from avs_backend.scan_core.assets import (
    AssetType,
    AssetCategory,
    AssetSource,
    validate_asset,
)


# ── Filesystem Adapter Tests ───────────────────────────────────────


class TestFilesystemAdapter:
    def test_supports_file_entry(self):
        """Test adapter supports FileEntry."""
        adapter = FilesystemAdapter()
        entry = FileEntry(
            path="C:\\test\\file.txt",
            name="file.txt",
            size=1024,
            extension=".txt",
            created_time=1234567890.0,
            modified_time=1234567890.0,
            is_hidden=False,
            is_system=False,
            is_read_only=False,
            is_archive=False,
            is_temporary=False,
            is_symlink=False,
            is_locked=False,
            parent_dir="C:\\test",
            depth=2,
        )
        assert adapter.supports(entry)

    def test_convert_file_entry(self):
        """Test converting FileEntry to ScanAsset."""
        adapter = FilesystemAdapter()
        entry = FileEntry(
            path="C:\\Users\\Alice\\Documents\\report.pdf",
            name="report.pdf",
            size=2048,
            extension=".pdf",
            created_time=1234567890.0,
            modified_time=1234567891.0,
            is_hidden=False,
            is_system=False,
            is_read_only=False,
            is_archive=False,
            is_temporary=False,
            is_symlink=False,
            is_locked=False,
            parent_dir="C:\\Users\\Alice\\Documents",
            depth=3,
        )

        asset = adapter.convert(entry)

        assert asset.asset_type == AssetType.FILE
        assert asset.asset_category == AssetCategory.FILESYSTEM
        assert asset.asset_source == AssetSource.FILESYSTEM_ENUMERATOR
        assert asset.display_name == "report.pdf"
        assert asset.canonical_path == "c:/users/alice/documents/report.pdf"
        assert asset.exists is True
        assert asset.accessible is True
        assert asset.locked is False

        # Check tags
        assert asset.has_tag("filesystem")
        assert asset.has_tag("file")

        # Check metadata
        assert asset.custom_metadata.get("size") == 2048
        assert asset.custom_metadata.get("extension") == ".pdf"
        assert asset.custom_metadata.get("depth") == 3

        # Validate
        result = validate_asset(asset)
        assert result.is_valid

    def test_convert_directory_entry(self):
        """Test converting DirectoryEntry to ScanAsset."""
        adapter = FilesystemAdapter()
        entry = DirectoryEntry(
            path="C:\\Users\\Alice\\Documents",
            name="Documents",
            created_time=1234567890.0,
            modified_time=1234567891.0,
            is_hidden=False,
            is_system=False,
            is_read_only=False,
            is_symlink=False,
            parent_dir="C:\\Users\\Alice",
            depth=2,
            file_count=10,
            subdirectory_count=3,
        )

        asset = adapter.convert(entry)

        assert asset.asset_type == AssetType.DIRECTORY
        assert asset.asset_category == AssetCategory.FILESYSTEM
        assert asset.display_name == "Documents"
        assert asset.has_tag("directory")
        assert asset.custom_metadata.get("file_count") == 10
        assert asset.custom_metadata.get("subdirectory_count") == 3

    def test_convert_locked_file(self):
        """Test converting locked FileEntry."""
        adapter = FilesystemAdapter()
        entry = FileEntry(
            path="C:\\test\\locked.dat",
            name="locked.dat",
            size=512,
            extension=".dat",
            created_time=1234567890.0,
            modified_time=1234567890.0,
            is_hidden=False,
            is_system=False,
            is_read_only=False,
            is_archive=False,
            is_temporary=False,
            is_symlink=False,
            is_locked=True,
            parent_dir="C:\\test",
            depth=1,
        )

        asset = adapter.convert(entry)

        assert asset.accessible is False
        assert asset.locked is True
        assert asset.has_tag("locked")


# ── Registry Adapter Tests ─────────────────────────────────────────


class TestRegistryAdapter:
    def test_supports_registry_key(self):
        """Test adapter supports RegistryKeyAsset."""
        adapter = RegistryAdapter()
        key = RegistryKeyAsset(
            hive=RegistryHive.HKEY_LOCAL_MACHINE,
            key_path="SOFTWARE\\Microsoft\\Windows",
            key_name="Windows",
            subkey_count=10,
            value_count=5,
            last_write_time=1234567890.0,
            depth=2,
            parent_path="SOFTWARE\\Microsoft",
            is_wow6432node=False,
            permission_denied=False,
        )
        assert adapter.supports(key)

    def test_convert_registry_key(self):
        """Test converting RegistryKeyAsset to ScanAsset."""
        adapter = RegistryAdapter()
        key = RegistryKeyAsset(
            hive=RegistryHive.HKEY_LOCAL_MACHINE,
            key_path="SOFTWARE\\Microsoft\\Windows",
            key_name="Windows",
            subkey_count=10,
            value_count=5,
            last_write_time=1234567890.0,
            depth=2,
            parent_path="SOFTWARE\\Microsoft",
            is_wow6432node=False,
            permission_denied=False,
        )

        asset = adapter.convert(key)

        assert asset.asset_type == AssetType.REGISTRY_KEY
        assert asset.asset_category == AssetCategory.REGISTRY
        assert asset.asset_source == AssetSource.REGISTRY_ENUMERATOR
        assert asset.display_name == "Windows"
        assert asset.system is True

        # Check tags
        assert asset.has_tag("registry")
        assert asset.has_tag("registry_key")
        assert asset.has_tag("system")

        # Check metadata
        assert asset.custom_metadata.get("hive") == "HKEY_LOCAL_MACHINE"
        assert asset.custom_metadata.get("subkey_count") == 10
        assert asset.custom_metadata.get("value_count") == 5

        # Check parent relationship
        assert len(asset.relationships) == 1
        assert asset.relationships[0].relationship_type.value == "parent"

        # Validate
        result = validate_asset(asset)
        assert result.is_valid

    def test_convert_registry_value(self):
        """Test converting RegistryValueAsset to ScanAsset."""
        adapter = RegistryAdapter()
        value = RegistryValueAsset(
            hive=RegistryHive.HKEY_LOCAL_MACHINE,
            key_path="SOFTWARE\\Microsoft\\Windows\\CurrentVersion",
            value_name="ProgramFilesDir",
            value_type=RegistryValueType.SZ,
            value_data="C:\\Program Files",
            is_default=False,
            data_size=32,
        )

        asset = adapter.convert(value)

        assert asset.asset_type == AssetType.REGISTRY_VALUE
        assert asset.asset_category == AssetCategory.REGISTRY
        assert asset.display_name == "ProgramFilesDir"
        assert asset.has_tag("registry_value")

        # Check metadata
        assert asset.custom_metadata.get("value_type") == "REG_SZ"
        assert asset.custom_metadata.get("value_data") == "C:\\Program Files"

        # Check belongs_to relationship
        assert len(asset.relationships) == 1
        assert asset.relationships[0].relationship_type.value == "belongs_to"


# ── Browser Adapter Tests ──────────────────────────────────────────


class TestBrowserAdapter:
    def test_supports_browser_installation(self):
        """Test adapter supports BrowserInstallation."""
        adapter = BrowserAdapter()
        browser = BrowserInstallation(
            browser_type=BrowserType.CHROME,
            executable_path="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            version="120.0.0.0",
            install_dir="C:\\Program Files\\Google\\Chrome",
            is_portable=False,
            user_data_dir="C:\\Users\\Alice\\AppData\\Local\\Google\\Chrome\\User Data",
        )
        assert adapter.supports(browser)

    def test_convert_browser_installation(self):
        """Test converting BrowserInstallation to ScanAsset."""
        adapter = BrowserAdapter()
        browser = BrowserInstallation(
            browser_type=BrowserType.CHROME,
            executable_path="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            version="120.0.0.0",
            install_dir="C:\\Program Files\\Google\\Chrome",
            is_portable=False,
            user_data_dir="C:\\Users\\Alice\\AppData\\Local\\Google\\Chrome\\User Data",
        )

        asset = adapter.convert(browser)

        assert asset.asset_type == AssetType.BROWSER_INSTALLATION
        assert asset.asset_category == AssetCategory.BROWSER
        assert asset.display_name == "Google Chrome"
        assert asset.has_tag("browser")
        assert asset.has_tag("chrome")
        assert asset.has_tag("chromium_based")

        # Check metadata
        assert asset.custom_metadata.get("browser_type") == "chrome"
        assert asset.custom_metadata.get("version") == "120.0.0.0"
        assert asset.custom_metadata.get("is_chromium_based") is True

    def test_convert_browser_profile(self):
        """Test converting BrowserProfile to ScanAsset."""
        adapter = BrowserAdapter()
        profile = BrowserProfile(
            browser_type=BrowserType.CHROME,
            profile_name="Default",
            profile_path="C:\\Users\\Alice\\AppData\\Local\\Google\\Chrome\\User Data\\Default",
            display_name="Person 1",
            is_default=True,
            is_guest=False,
            profile_size=1024000,
            last_used_time=1234567890.0,
            status=ProfileStatus.ACTIVE,
        )

        asset = adapter.convert(profile)

        assert asset.asset_type == AssetType.BROWSER_PROFILE
        assert asset.display_name == "Person 1"
        assert asset.has_tag("default_profile")
        assert asset.has_tag("active")
        assert asset.custom_metadata.get("profile_size") == 1024000


# ── Windows Adapter Tests ──────────────────────────────────────────


class TestWindowsAdapter:
    def test_supports_service(self):
        """Test adapter supports ServiceAsset."""
        adapter = WindowsAdapter()
        service = ServiceAsset(
            service_name="wuauserv",
            display_name="Windows Update",
            status="Running",
            startup_type="Auto",
            binary_path="C:\\Windows\\System32\\svchost.exe",
            service_account="LocalSystem",
            dependencies=("rpcss",),
            description="Enables detection and installation of updates",
            pid=1234,
        )
        assert adapter.supports(service)

    def test_convert_service(self):
        """Test converting ServiceAsset to ScanAsset."""
        adapter = WindowsAdapter()
        service = ServiceAsset(
            service_name="wuauserv",
            display_name="Windows Update",
            status="Running",
            startup_type="Auto",
            binary_path="C:\\Windows\\System32\\svchost.exe",
            service_account="LocalSystem",
            dependencies=("rpcss",),
            description="Enables detection and installation of updates",
            pid=1234,
        )

        asset = adapter.convert(service)

        assert asset.asset_type == AssetType.SERVICE
        assert asset.asset_category == AssetCategory.WINDOWS
        assert asset.display_name == "Windows Update"
        assert asset.has_tag("service")
        assert asset.has_tag("running")
        assert asset.has_tag("startup")
        assert asset.custom_metadata.get("service_name") == "wuauserv"

    def test_convert_driver(self):
        """Test converting DriverAsset to ScanAsset."""
        adapter = WindowsAdapter()
        driver = DriverAsset(
            driver_name="nvlddmkm",
            provider="NVIDIA Corporation",
            version="31.0.15.5123",
            path="C:\\Windows\\System32\\DriverStore\\FileRepository\\nv_dispi.inf_amd64\\nvlddmkm.sys",
            driver_type="Kernel",
            state="Running",
            start_mode="Auto",
        )

        asset = adapter.convert(driver)

        assert asset.asset_type == AssetType.DRIVER
        assert asset.asset_category == AssetCategory.WINDOWS
        assert asset.has_tag("driver")
        assert asset.custom_metadata.get("provider") == "NVIDIA Corporation"


# ── Runtime Adapter Tests ──────────────────────────────────────────


class TestRuntimeAdapter:
    def test_supports_process(self):
        """Test adapter supports ProcessAsset."""
        adapter = RuntimeAdapter()
        process = ProcessAsset(
            pid=1234,
            name="chrome.exe",
            parent_pid=5678,
            executable_path="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            command_line="chrome.exe --type=renderer",
            username="Alice",
            cpu_percent=5.2,
            memory_percent=2.5,
            memory_bytes=134217728,
            thread_count=12,
            handle_count=456,
            status="Running",
            creation_time=1234567890.0,
        )
        assert adapter.supports(process)

    def test_convert_process(self):
        """Test converting ProcessAsset to ScanAsset."""
        adapter = RuntimeAdapter()
        process = ProcessAsset(
            pid=1234,
            name="chrome.exe",
            parent_pid=5678,
            executable_path="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            command_line="chrome.exe --type=renderer",
            username="Alice",
            cpu_percent=5.2,
            memory_percent=2.5,
            memory_bytes=134217728,
            thread_count=12,
            handle_count=456,
            status="Running",
            creation_time=1234567890.0,
        )

        asset = adapter.convert(process)

        assert asset.asset_type == AssetType.PROCESS
        assert asset.asset_category == AssetCategory.RUNTIME
        assert asset.display_name == "chrome.exe"
        assert asset.has_tag("process")
        assert asset.has_tag("user")
        assert asset.custom_metadata.get("pid") == 1234
        assert asset.custom_metadata.get("cpu_percent") == 5.2

        # Check parent relationship
        assert len(asset.relationships) == 1
        assert asset.relationships[0].relationship_type.value == "parent"

    def test_convert_connection(self):
        """Test converting ConnectionAsset to ScanAsset."""
        adapter = RuntimeAdapter()
        connection = ConnectionAsset(
            protocol="TCP",
            local_address="192.168.1.100",
            local_port=54321,
            remote_address="93.184.216.34",
            remote_port=443,
            state="ESTABLISHED",
            pid=1234,
            process_name="chrome.exe",
        )

        asset = adapter.convert(connection)

        assert asset.asset_type == AssetType.NETWORK_CONNECTION
        assert asset.asset_category == AssetCategory.NETWORK
        assert asset.has_tag("connection")
        assert asset.has_tag("tcp")
        assert asset.custom_metadata.get("remote_port") == 443

        # Check owned_by relationship
        assert len(asset.relationships) == 1
        assert asset.relationships[0].relationship_type.value == "owned_by"

    def test_convert_locked_file(self):
        """Test converting LockedFileAsset to ScanAsset."""
        adapter = RuntimeAdapter()
        locked_file = LockedFileAsset(
            path="C:\\Users\\Alice\\Documents\\locked.docx",
            pid=1234,
            process_name="WINWORD.EXE",
        )

        asset = adapter.convert(locked_file)

        assert asset.asset_type == AssetType.LOCKED_FILE
        assert asset.asset_category == AssetCategory.RUNTIME
        assert asset.locked is True
        assert asset.accessible is False
        assert asset.has_tag("locked_file")

        # Check locked_by relationship
        assert len(asset.relationships) == 1
        assert asset.relationships[0].relationship_type.value == "locked_by"


# ── Adapter Registry Tests ─────────────────────────────────────────


class TestAdapterRegistry:
    def test_get_adapter_for_file_entry(self):
        """Test registry finds correct adapter for FileEntry."""
        registry = AdapterRegistry()
        entry = FileEntry(
            path="C:\\test.txt",
            name="test.txt",
            size=100,
            extension=".txt",
            created_time=1234567890.0,
            modified_time=1234567890.0,
            is_hidden=False,
            is_system=False,
            is_read_only=False,
            is_archive=False,
            is_temporary=False,
            is_symlink=False,
            is_locked=False,
            parent_dir="C:\\",
            depth=0,
        )

        adapter = registry.get_adapter_for(entry)
        assert adapter is not None
        assert isinstance(adapter, FilesystemAdapter)

    def test_convert_with_registry(self):
        """Test converting object using registry."""
        registry = AdapterRegistry()
        entry = FileEntry(
            path="C:\\test.txt",
            name="test.txt",
            size=100,
            extension=".txt",
            created_time=1234567890.0,
            modified_time=1234567890.0,
            is_hidden=False,
            is_system=False,
            is_read_only=False,
            is_archive=False,
            is_temporary=False,
            is_symlink=False,
            is_locked=False,
            parent_dir="C:\\",
            depth=0,
        )

        asset = registry.convert(entry)
        assert asset.asset_type == AssetType.FILE
        assert asset.display_name == "test.txt"

    def test_convert_unsupported_type(self):
        """Test converting unsupported type raises error."""
        registry = AdapterRegistry()
        
        with pytest.raises(ValueError, match="No adapter found"):
            registry.convert("unsupported object")

    def test_global_convert_function(self):
        """Test global convert_to_asset function."""
        entry = FileEntry(
            path="C:\\test.txt",
            name="test.txt",
            size=100,
            extension=".txt",
            created_time=1234567890.0,
            modified_time=1234567890.0,
            is_hidden=False,
            is_system=False,
            is_read_only=False,
            is_archive=False,
            is_temporary=False,
            is_symlink=False,
            is_locked=False,
            parent_dir="C:\\",
            depth=0,
        )

        asset = convert_to_asset(entry)
        assert asset.asset_type == AssetType.FILE


# ── Identity Preservation Tests ────────────────────────────────────


class TestIdentityPreservation:
    def test_same_file_produces_same_id(self):
        """Test same file produces same asset ID."""
        adapter = FilesystemAdapter()
        
        entry1 = FileEntry(
            path="C:\\Users\\Alice\\file.txt",
            name="file.txt",
            size=100,
            extension=".txt",
            created_time=1234567890.0,
            modified_time=1234567890.0,
            is_hidden=False,
            is_system=False,
            is_read_only=False,
            is_archive=False,
            is_temporary=False,
            is_symlink=False,
            is_locked=False,
            parent_dir="C:\\Users\\Alice",
            depth=2,
        )
        
        entry2 = FileEntry(
            path="C:\\Users\\Alice\\file.txt",
            name="file.txt",
            size=200,  # Different size
            extension=".txt",
            created_time=1234567891.0,  # Different time
            modified_time=1234567892.0,
            is_hidden=True,  # Different attributes
            is_system=False,
            is_read_only=False,
            is_archive=False,
            is_temporary=False,
            is_symlink=False,
            is_locked=False,
            parent_dir="C:\\Users\\Alice",
            depth=2,
        )

        asset1 = adapter.convert(entry1)
        asset2 = adapter.convert(entry2)

        # Same path → same asset ID
        assert asset1.asset_id == asset2.asset_id

    def test_cross_platform_path_normalization(self):
        """Test Windows and POSIX paths normalize to same ID."""
        adapter = FilesystemAdapter()
        
        windows_entry = FileEntry(
            path="C:\\Users\\Alice\\file.txt",
            name="file.txt",
            size=100,
            extension=".txt",
            created_time=1234567890.0,
            modified_time=1234567890.0,
            is_hidden=False,
            is_system=False,
            is_read_only=False,
            is_archive=False,
            is_temporary=False,
            is_symlink=False,
            is_locked=False,
            parent_dir="C:\\Users\\Alice",
            depth=2,
        )

        # Manually create asset with POSIX-style path
        from avs_backend.scan_core.assets import generate_file_asset_id
        posix_id = generate_file_asset_id("c:/users/alice/file.txt")
        windows_asset = adapter.convert(windows_entry)

        assert windows_asset.asset_id == posix_id


# ── Data Preservation Tests ────────────────────────────────────────


class TestDataPreservation:
    def test_all_file_metadata_preserved(self):
        """Test all FileEntry metadata is preserved."""
        adapter = FilesystemAdapter()
        entry = FileEntry(
            path="C:\\test.txt",
            name="test.txt",
            size=1024,
            extension=".txt",
            created_time=1234567890.0,
            modified_time=1234567891.0,
            is_hidden=True,
            is_system=True,
            is_read_only=True,
            is_archive=True,
            is_temporary=True,
            is_symlink=False,
            is_locked=False,
            parent_dir="C:\\",
            depth=1,
        )

        asset = adapter.convert(entry)

        # All metadata preserved
        assert asset.custom_metadata.get("size") == 1024
        assert asset.custom_metadata.get("extension") == ".txt"
        assert asset.custom_metadata.get("depth") == 1
        assert asset.custom_metadata.get("is_archive") is True
        assert asset.custom_metadata.get("is_read_only") is True
        assert asset.hidden is True
        assert asset.system is True

    def test_all_registry_metadata_preserved(self):
        """Test all RegistryKeyAsset metadata is preserved."""
        adapter = RegistryAdapter()
        key = RegistryKeyAsset(
            hive=RegistryHive.HKEY_LOCAL_MACHINE,
            key_path="SOFTWARE\\Test",
            key_name="Test",
            subkey_count=5,
            value_count=3,
            last_write_time=1234567890.0,
            depth=1,
            parent_path="SOFTWARE",
            is_wow6432node=True,
            permission_denied=False,
        )

        asset = adapter.convert(key)

        assert asset.custom_metadata.get("subkey_count") == 5
        assert asset.custom_metadata.get("value_count") == 3
        assert asset.custom_metadata.get("is_wow6432node") is True
        assert asset.has_tag("wow6432node")
