"""
Runtime Adapter — SC-6B

Converts runtime models (ProcessAsset, ConnectionAsset, SessionAsset, LockedFileAsset) to ScanAsset.
"""

from __future__ import annotations

from typing import Any
from datetime import datetime

from .base_adapter import BaseAssetAdapter
from ..runtime.models import ProcessAsset, ConnectionAsset, SessionAsset, LockedFileAsset
from ..assets import (
    ScanAsset,
    AssetType,
    AssetCategory,
    AssetSource,
    generate_process_asset_id,
    AssetIdentity,
    generate_asset_id,
    AssetRelationship,
    RelationshipType,
)


class RuntimeAdapter(BaseAssetAdapter):
    """Adapter for runtime models."""

    def supports(self, obj: Any) -> bool:
        """Check if object is a runtime model."""
        return isinstance(obj, (ProcessAsset, ConnectionAsset, SessionAsset, LockedFileAsset))

    def convert(self, obj: Any) -> ScanAsset:
        """Convert runtime model to ScanAsset."""
        if isinstance(obj, ProcessAsset):
            return self._convert_process(obj)
        elif isinstance(obj, ConnectionAsset):
            return self._convert_connection(obj)
        elif isinstance(obj, SessionAsset):
            return self._convert_session(obj)
        elif isinstance(obj, LockedFileAsset):
            return self._convert_locked_file(obj)
        else:
            raise ValueError(f"Unsupported type: {type(obj)}")

    def _convert_process(self, process: ProcessAsset) -> ScanAsset:
        """Convert ProcessAsset to ScanAsset."""
        asset_id = generate_process_asset_id(process.executable_path, process.pid)

        asset = ScanAsset(
            asset_id=asset_id,
            asset_type=AssetType.PROCESS,
            asset_category=AssetCategory.RUNTIME,
            asset_source=AssetSource.RUNTIME_ENUMERATOR,
            display_name=process.name,
            canonical_path=process.executable_path.lower().replace("\\", "/"),
            created_at=datetime.fromtimestamp(process.creation_time) if process.creation_time else None,
            exists=True,
            accessible=True,
            locked=False,
            hidden=False,
            system=False,
        )

        asset.add_tag("runtime")
        asset.add_tag("process")

        if process.username:
            asset.add_tag("user")

        asset.custom_metadata.set("pid", process.pid)
        asset.custom_metadata.set("name", process.name)
        asset.custom_metadata.set("executable_path", process.executable_path)
        asset.custom_metadata.set("command_line", process.command_line)
        asset.custom_metadata.set("working_directory", process.working_directory)
        asset.custom_metadata.set("username", process.username)
        asset.custom_metadata.set("cpu_percent", process.cpu_percent)
        asset.custom_metadata.set("memory_percent", process.memory_percent)
        asset.custom_metadata.set("memory_bytes", process.memory_bytes)
        asset.custom_metadata.set("thread_count", process.thread_count)
        asset.custom_metadata.set("handle_count", process.handle_count)
        asset.custom_metadata.set("status", process.status)
        asset.custom_metadata.set("creation_time", process.creation_time)
        asset.custom_metadata.set("parent_pid", process.parent_pid)

        # Add parent relationship if parent exists
        if process.parent_pid and process.parent_pid > 0:
            # Note: We don't know the parent's executable path, so we use a placeholder
            # In a real implementation, this would be resolved by the consumer
            parent_identity = AssetIdentity(
                asset_type=AssetType.PROCESS,
                primary_key="unknown",
                secondary_key=str(process.parent_pid),
            )
            parent_id = generate_asset_id(parent_identity)
            
            parent_rel = AssetRelationship(
                source_asset_id=asset_id,
                target_asset_id=parent_id,
                relationship_type=RelationshipType.PARENT,
                metadata={"parent_pid": str(process.parent_pid)},
            )
            asset.add_relationship(parent_rel)

        return asset

    def _convert_connection(self, connection: ConnectionAsset) -> ScanAsset:
        """Convert ConnectionAsset to ScanAsset."""
        identity = AssetIdentity(
            asset_type=AssetType.NETWORK_CONNECTION,
            primary_key=connection.protocol,
            secondary_key=f"{connection.local_address}:{connection.local_port}",
            tertiary_key=f"{connection.remote_address}:{connection.remote_port}",
        )
        asset_id = generate_asset_id(identity)

        asset = ScanAsset(
            asset_id=asset_id,
            asset_type=AssetType.NETWORK_CONNECTION,
            asset_category=AssetCategory.NETWORK,
            asset_source=AssetSource.RUNTIME_ENUMERATOR,
            display_name=f"{connection.protocol} {connection.local_address}:{connection.local_port} → {connection.remote_address}:{connection.remote_port}",
            canonical_path=f"connection:{connection.protocol.lower()}:{connection.local_address}:{connection.local_port}",
            exists=True,
            accessible=True,
            locked=False,
            hidden=False,
            system=False,
        )

        asset.add_tag("runtime")
        asset.add_tag("network")
        asset.add_tag("connection")
        asset.add_tag(connection.protocol.lower())
        asset.add_tag(connection.state.lower())

        asset.custom_metadata.set("protocol", connection.protocol)
        asset.custom_metadata.set("local_address", connection.local_address)
        asset.custom_metadata.set("local_port", connection.local_port)
        asset.custom_metadata.set("remote_address", connection.remote_address)
        asset.custom_metadata.set("remote_port", connection.remote_port)
        asset.custom_metadata.set("state", connection.state)
        asset.custom_metadata.set("pid", connection.pid)
        asset.custom_metadata.set("process_name", connection.process_name)

        # Add owned_by relationship to process if known
        if connection.pid and connection.pid > 0:
            process_identity = AssetIdentity(
                asset_type=AssetType.PROCESS,
                primary_key="unknown",
                secondary_key=str(connection.pid),
            )
            process_id = generate_asset_id(process_identity)
            
            owned_by_rel = AssetRelationship(
                source_asset_id=asset_id,
                target_asset_id=process_id,
                relationship_type=RelationshipType.OWNED_BY,
                metadata={"pid": str(connection.pid)},
            )
            asset.add_relationship(owned_by_rel)

        return asset

    def _convert_session(self, session: SessionAsset) -> ScanAsset:
        """Convert SessionAsset to ScanAsset."""
        identity = AssetIdentity(
            asset_type=AssetType.SESSION,
            primary_key=str(session.session_id),
            secondary_key=session.username or "unknown",
        )
        asset_id = generate_asset_id(identity)

        asset = ScanAsset(
            asset_id=asset_id,
            asset_type=AssetType.SESSION,
            asset_category=AssetCategory.RUNTIME,
            asset_source=AssetSource.RUNTIME_ENUMERATOR,
            display_name=f"Session {session.session_id} ({session.username or 'Unknown'})",
            canonical_path=f"session:{session.session_id}",
            created_at=datetime.fromtimestamp(session.connect_time) if session.connect_time else None,
            exists=True,
            accessible=True,
            locked=False,
            hidden=False,
            system=False,
        )

        asset.add_tag("runtime")
        asset.add_tag("session")
        asset.add_tag("user")

        if session.is_active:
            asset.add_tag("active")

        asset.custom_metadata.set("session_id", session.session_id)
        asset.custom_metadata.set("username", session.username)
        asset.custom_metadata.set("domain", session.domain)
        asset.custom_metadata.set("session_type", session.session_type)
        asset.custom_metadata.set("state", session.state)
        asset.custom_metadata.set("connect_time", session.connect_time)
        asset.custom_metadata.set("idle_time", session.idle_time)

        return asset

    def _convert_locked_file(self, locked_file: LockedFileAsset) -> ScanAsset:
        """Convert LockedFileAsset to ScanAsset."""
        identity = AssetIdentity(
            asset_type=AssetType.LOCKED_FILE,
            primary_key=locked_file.path,
            secondary_key=str(locked_file.pid) if locked_file.pid else "unknown",
        )
        asset_id = generate_asset_id(identity)

        asset = ScanAsset(
            asset_id=asset_id,
            asset_type=AssetType.LOCKED_FILE,
            asset_category=AssetCategory.RUNTIME,
            asset_source=AssetSource.RUNTIME_ENUMERATOR,
            display_name=locked_file.path.split("\\")[-1] if "\\" in locked_file.path else locked_file.path,
            canonical_path=locked_file.path.lower().replace("\\", "/"),
            exists=True,
            accessible=False,
            locked=True,
            hidden=False,
            system=False,
        )

        asset.add_tag("runtime")
        asset.add_tag("locked_file")
        asset.add_tag("locked")

        asset.custom_metadata.set("path", locked_file.path)
        asset.custom_metadata.set("pid", locked_file.pid)
        asset.custom_metadata.set("process_name", locked_file.process_name)

        # Add locked_by relationship to process if known
        if locked_file.pid and locked_file.pid > 0:
            process_identity = AssetIdentity(
                asset_type=AssetType.PROCESS,
                primary_key="unknown",
                secondary_key=str(locked_file.pid),
            )
            process_id = generate_asset_id(process_identity)
            
            locked_by_rel = AssetRelationship(
                source_asset_id=asset_id,
                target_asset_id=process_id,
                relationship_type=RelationshipType.LOCKED_BY,
                metadata={"pid": str(locked_file.pid)},
            )
            asset.add_relationship(locked_by_rel)

        return asset
