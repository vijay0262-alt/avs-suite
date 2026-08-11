"""
Windows Adapter — SC-6B

Converts Windows models (ServiceAsset, DriverAsset, etc.) to ScanAsset.
"""

from __future__ import annotations

from typing import Any
from datetime import datetime

from .base_adapter import BaseAssetAdapter
from ..windows.models import (
    ServiceAsset,
    DriverAsset,
    ScheduledTaskAsset,
    InstalledProgramAsset,
    SecurityAsset,
    RestorePointAsset,
    SystemAsset,
    NetworkAdapterAsset,
)
from ..assets import (
    ScanAsset,
    AssetType,
    AssetCategory,
    AssetSource,
    generate_service_asset_id,
    generate_driver_asset_id,
    AssetIdentity,
    generate_asset_id,
)


class WindowsAdapter(BaseAssetAdapter):
    """Adapter for Windows models."""

    def supports(self, obj: Any) -> bool:
        """Check if object is a Windows model."""
        return isinstance(obj, (
            ServiceAsset,
            DriverAsset,
            ScheduledTaskAsset,
            InstalledProgramAsset,
            SecurityAsset,
            RestorePointAsset,
            SystemAsset,
            NetworkAdapterAsset,
        ))

    def convert(self, obj: Any) -> ScanAsset:
        """Convert Windows model to ScanAsset."""
        if isinstance(obj, ServiceAsset):
            return self._convert_service(obj)
        elif isinstance(obj, DriverAsset):
            return self._convert_driver(obj)
        elif isinstance(obj, ScheduledTaskAsset):
            return self._convert_scheduled_task(obj)
        elif isinstance(obj, InstalledProgramAsset):
            return self._convert_installed_program(obj)
        elif isinstance(obj, SecurityAsset):
            return self._convert_security(obj)
        elif isinstance(obj, RestorePointAsset):
            return self._convert_restore_point(obj)
        elif isinstance(obj, SystemAsset):
            return self._convert_system(obj)
        elif isinstance(obj, NetworkAdapterAsset):
            return self._convert_network_adapter(obj)
        else:
            raise ValueError(f"Unsupported type: {type(obj)}")

    def _convert_service(self, service: ServiceAsset) -> ScanAsset:
        """Convert ServiceAsset to ScanAsset."""
        asset_id = generate_service_asset_id(service.service_name)

        asset = ScanAsset(
            asset_id=asset_id,
            asset_type=AssetType.SERVICE,
            asset_category=AssetCategory.WINDOWS,
            asset_source=AssetSource.WINDOWS_ENUMERATOR,
            display_name=service.display_name,
            canonical_path=f"service:{service.service_name.lower()}",
            exists=True,
            accessible=True,
            locked=False,
            hidden=False,
            system=True,
        )

        asset.add_tag("windows")
        asset.add_tag("service")
        asset.add_tag("system")

        if service.is_running:
            asset.add_tag("running")
        if service.startup_type == "Auto":
            asset.add_tag("startup")

        asset.custom_metadata.set("service_name", service.service_name)
        asset.custom_metadata.set("display_name", service.display_name)
        asset.custom_metadata.set("description", service.description)
        asset.custom_metadata.set("status", service.status)
        asset.custom_metadata.set("startup_type", service.startup_type)
        asset.custom_metadata.set("is_running", service.is_running)
        asset.custom_metadata.set("binary_path", service.binary_path)
        asset.custom_metadata.set("service_account", service.service_account)
        asset.custom_metadata.set("dependencies", list(service.dependencies))
        asset.custom_metadata.set("pid", service.pid)

        return asset

    def _convert_driver(self, driver: DriverAsset) -> ScanAsset:
        """Convert DriverAsset to ScanAsset."""
        asset_id = generate_driver_asset_id(driver.driver_name)

        asset = ScanAsset(
            asset_id=asset_id,
            asset_type=AssetType.DRIVER,
            asset_category=AssetCategory.WINDOWS,
            asset_source=AssetSource.WINDOWS_ENUMERATOR,
            display_name=driver.driver_name,
            canonical_path=f"driver:{driver.driver_name.lower()}",
            exists=True,
            accessible=True,
            locked=False,
            hidden=False,
            system=True,
        )

        asset.add_tag("windows")
        asset.add_tag("driver")
        asset.add_tag("system")

        if driver.state.lower() == "running":
            asset.add_tag("running")

        asset.custom_metadata.set("driver_name", driver.driver_name)
        asset.custom_metadata.set("provider", driver.provider)
        asset.custom_metadata.set("version", driver.version)
        asset.custom_metadata.set("driver_type", driver.driver_type)
        asset.custom_metadata.set("state", driver.state)
        asset.custom_metadata.set("start_mode", driver.start_mode)
        asset.custom_metadata.set("path", driver.path)

        return asset

    def _convert_scheduled_task(self, task: ScheduledTaskAsset) -> ScanAsset:
        """Convert ScheduledTaskAsset to ScanAsset."""
        identity = AssetIdentity(
            asset_type=AssetType.SCHEDULED_TASK,
            primary_key=task.task_folder,
            secondary_key=task.task_name,
        )
        asset_id = generate_asset_id(identity)

        asset = ScanAsset(
            asset_id=asset_id,
            asset_type=AssetType.SCHEDULED_TASK,
            asset_category=AssetCategory.WINDOWS,
            asset_source=AssetSource.WINDOWS_ENUMERATOR,
            display_name=task.task_name,
            canonical_path=f"{task.task_folder}/{task.task_name}".lower(),
            exists=True,
            accessible=True,
            locked=False,
            hidden=task.is_hidden,
            system=False,
        )

        asset.add_tag("windows")
        asset.add_tag("scheduled_task")

        if task.is_enabled:
            asset.add_tag("enabled")
        if task.is_hidden:
            asset.add_tag("hidden")

        asset.custom_metadata.set("task_name", task.task_name)
        asset.custom_metadata.set("task_folder", task.task_folder)
        asset.custom_metadata.set("status", task.status)
        asset.custom_metadata.set("is_enabled", task.is_enabled)
        asset.custom_metadata.set("is_hidden", task.is_hidden)
        asset.custom_metadata.set("last_run_time", task.last_run_time)
        asset.custom_metadata.set("next_run_time", task.next_run_time)
        asset.custom_metadata.set("author", task.author)
        asset.custom_metadata.set("description", task.description)

        return asset

    def _convert_installed_program(self, program: InstalledProgramAsset) -> ScanAsset:
        """Convert InstalledProgramAsset to ScanAsset."""
        identity = AssetIdentity(
            asset_type=AssetType.INSTALLED_PROGRAM,
            primary_key=program.display_name,
            secondary_key=program.publisher or "unknown",
        )
        asset_id = generate_asset_id(identity)

        asset = ScanAsset(
            asset_id=asset_id,
            asset_type=AssetType.INSTALLED_PROGRAM,
            asset_category=AssetCategory.WINDOWS,
            asset_source=AssetSource.WINDOWS_ENUMERATOR,
            display_name=program.display_name,
            canonical_path=program.install_location.lower().replace("\\", "/") if program.install_location else f"program:{program.display_name.lower()}",
            exists=True,
            accessible=True,
            locked=False,
            hidden=False,
            system=program.is_system_component,
        )

        asset.add_tag("windows")
        asset.add_tag("installed_program")

        if program.is_system_component:
            asset.add_tag("system")

        asset.custom_metadata.set("display_name", program.display_name)
        asset.custom_metadata.set("publisher", program.publisher)
        asset.custom_metadata.set("version", program.version)
        asset.custom_metadata.set("install_date", program.install_date)
        asset.custom_metadata.set("install_location", program.install_location)
        asset.custom_metadata.set("uninstall_string", program.uninstall_string)
        asset.custom_metadata.set("is_system_component", program.is_system_component)
        asset.custom_metadata.set("estimated_size", program.estimated_size)

        return asset

    def _convert_security(self, security: SecurityAsset) -> ScanAsset:
        """Convert SecurityAsset to ScanAsset."""
        identity = AssetIdentity(
            asset_type=AssetType.UNKNOWN,
            primary_key=security.security_type,
            secondary_key=security.name,
        )
        asset_id = generate_asset_id(identity)

        asset = ScanAsset(
            asset_id=asset_id,
            asset_type=AssetType.UNKNOWN,
            asset_category=AssetCategory.SECURITY,
            asset_source=AssetSource.WINDOWS_ENUMERATOR,
            display_name=security.name,
            canonical_path=f"security:{security.security_type.lower()}:{security.name.lower()}",
            exists=True,
            accessible=True,
            locked=False,
            hidden=False,
            system=True,
        )

        asset.add_tag("windows")
        asset.add_tag("security")
        asset.add_tag("system")
        asset.add_tag(security.security_type.lower())

        asset.custom_metadata.set("security_type", security.security_type)
        asset.custom_metadata.set("name", security.name)
        asset.custom_metadata.set("status", security.status)
        asset.custom_metadata.set("details", security.details)

        return asset

    def _convert_restore_point(self, restore_point: RestorePointAsset) -> ScanAsset:
        """Convert RestorePointAsset to ScanAsset."""
        identity = AssetIdentity(
            asset_type=AssetType.UNKNOWN,
            primary_key="restore_point",
            secondary_key=str(restore_point.creation_time),
        )
        asset_id = generate_asset_id(identity)

        asset = ScanAsset(
            asset_id=asset_id,
            asset_type=AssetType.UNKNOWN,
            asset_category=AssetCategory.WINDOWS,
            asset_source=AssetSource.WINDOWS_ENUMERATOR,
            display_name=restore_point.description,
            canonical_path=f"restore_point:{restore_point.sequence_number}",
            created_at=datetime.fromtimestamp(restore_point.creation_time),
            exists=True,
            accessible=True,
            locked=False,
            hidden=False,
            system=True,
        )

        asset.add_tag("windows")
        asset.add_tag("restore_point")
        asset.add_tag("system")

        asset.custom_metadata.set("description", restore_point.description)
        asset.custom_metadata.set("creation_time", restore_point.creation_time)
        asset.custom_metadata.set("restore_point_type", restore_point.restore_point_type)
        asset.custom_metadata.set("sequence_number", restore_point.sequence_number)

        return asset

    def _convert_system(self, system: SystemAsset) -> ScanAsset:
        """Convert SystemAsset to ScanAsset."""
        identity = AssetIdentity(
            asset_type=AssetType.UNKNOWN,
            primary_key="system",
            secondary_key=system.computer_name,
        )
        asset_id = generate_asset_id(identity)

        asset = ScanAsset(
            asset_id=asset_id,
            asset_type=AssetType.UNKNOWN,
            asset_category=AssetCategory.WINDOWS,
            asset_source=AssetSource.WINDOWS_ENUMERATOR,
            display_name=system.computer_name,
            canonical_path=f"system:{system.computer_name.lower()}",
            exists=True,
            accessible=True,
            locked=False,
            hidden=False,
            system=True,
        )

        asset.add_tag("windows")
        asset.add_tag("system")

        asset.custom_metadata.set("computer_name", system.computer_name)
        asset.custom_metadata.set("os_version", system.os_version)
        asset.custom_metadata.set("os_build", system.os_build)
        asset.custom_metadata.set("os_architecture", system.os_architecture)
        asset.custom_metadata.set("processor", system.processor)
        asset.custom_metadata.set("total_memory", system.total_memory)
        asset.custom_metadata.set("boot_time", system.boot_time)
        asset.custom_metadata.set("is_admin", system.is_admin)
        asset.custom_metadata.set("username", system.username)
        asset.custom_metadata.set("domain", system.domain)

        return asset

    def _convert_network_adapter(self, adapter: NetworkAdapterAsset) -> ScanAsset:
        """Convert NetworkAdapterAsset to ScanAsset."""
        identity = AssetIdentity(
            asset_type=AssetType.UNKNOWN,
            primary_key="network_adapter",
            secondary_key=adapter.adapter_name,
        )
        asset_id = generate_asset_id(identity)

        asset = ScanAsset(
            asset_id=asset_id,
            asset_type=AssetType.UNKNOWN,
            asset_category=AssetCategory.NETWORK,
            asset_source=AssetSource.WINDOWS_ENUMERATOR,
            display_name=adapter.adapter_name,
            canonical_path=f"network:{adapter.adapter_name.lower()}",
            exists=True,
            accessible=True,
            locked=False,
            hidden=False,
            system=True,
        )

        asset.add_tag("windows")
        asset.add_tag("network")
        asset.add_tag("network_adapter")
        asset.add_tag("system")

        if adapter.is_enabled:
            asset.add_tag("enabled")

        asset.custom_metadata.set("adapter_name", adapter.adapter_name)
        asset.custom_metadata.set("description", adapter.description)
        asset.custom_metadata.set("mac_address", adapter.mac_address)
        asset.custom_metadata.set("ip_addresses", adapter.ip_addresses)
        asset.custom_metadata.set("is_enabled", adapter.is_enabled)
        asset.custom_metadata.set("connection_type", adapter.connection_type)
        asset.custom_metadata.set("speed", adapter.speed)

        return asset
