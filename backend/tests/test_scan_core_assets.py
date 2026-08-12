"""
Unit tests for Scan Core Universal Asset Model (SC-6A).

Tests cover:
- Asset identity generation (deterministic, cross-platform)
- Asset types and categories
- Metadata management
- Relationships
- Serialization and deserialization
- Validation
- Inheritance
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, UTC

import pytest

from avs_backend.scan_core.assets import (
    ScanAsset,
    AssetType,
    AssetCategory,
    AssetSource,
    generate_asset_id,
    AssetIdentity,
    AssetMetadata,
    AssetRelationship,
    RelationshipType,
    serialize_asset,
    deserialize_asset,
    validate_asset,
    ValidationError,
    ValidationResult,
    MetadataValue,
)
from avs_backend.scan_core.assets.identity import (
    generate_file_asset_id,
    generate_directory_asset_id,
    generate_registry_key_asset_id,
    generate_registry_value_asset_id,
    generate_process_asset_id,
    _normalize_path,
)
from avs_backend.scan_core.assets.asset_types import get_category_for_type
from avs_backend.scan_core.assets.relationships import (
    create_parent_child_relationship,
    create_dependency_relationship,
    create_launch_relationship,
    create_lock_relationship,
)
from avs_backend.scan_core.assets.validation import (
    validate_asset_id,
    validate_relationship_integrity,
    find_duplicate_assets,
)
from avs_backend.scan_core.assets.serialization import to_json, from_json


# ── Identity Tests ─────────────────────────────────────────────────


class TestAssetIdentity:
    def test_deterministic_id_generation(self):
        """Same identity components should always produce same asset ID."""
        identity1 = AssetIdentity(
            asset_type=AssetType.FILE,
            primary_key="C:\\Users\\Alice\\Documents\\report.pdf",
        )
        identity2 = AssetIdentity(
            asset_type=AssetType.FILE,
            primary_key="C:\\Users\\Alice\\Documents\\report.pdf",
        )

        id1 = generate_asset_id(identity1)
        id2 = generate_asset_id(identity2)

        assert id1 == id2
        assert len(id1) == 64  # SHA-256 hex digest

    def test_cross_platform_path_normalization(self):
        """Windows and POSIX paths should normalize to same ID."""
        windows_identity = AssetIdentity(
            asset_type=AssetType.FILE,
            primary_key="C:\\Users\\Alice\\Documents\\report.pdf",
        )
        posix_identity = AssetIdentity(
            asset_type=AssetType.FILE,
            primary_key="c:/users/alice/documents/report.pdf",
        )

        id_windows = generate_asset_id(windows_identity)
        id_posix = generate_asset_id(posix_identity)

        assert id_windows == id_posix

    def test_path_normalization_rules(self):
        """Test path normalization rules."""
        assert _normalize_path("C:\\Users\\Alice") == "c:/users/alice"
        assert _normalize_path("C:/Users/Alice") == "c:/users/alice"
        assert _normalize_path("C:/Users//Alice") == "c:/users/alice"
        assert _normalize_path("C:/Users/Alice/") == "c:/users/alice"
        assert _normalize_path("/usr/bin/") == "/usr/bin"

    def test_file_asset_id_generation(self):
        """Test convenience function for file asset IDs."""
        id1 = generate_file_asset_id("C:\\Users\\Alice\\file.txt")
        id2 = generate_file_asset_id("c:/users/alice/file.txt")
        assert id1 == id2
        assert len(id1) == 64

    def test_registry_key_asset_id_generation(self):
        """Test registry key asset ID generation."""
        id1 = generate_registry_key_asset_id(
            "HKEY_LOCAL_MACHINE",
            "SOFTWARE\\Microsoft\\Windows"
        )
        id2 = generate_registry_key_asset_id(
            "hkey_local_machine",
            "software/microsoft/windows"
        )
        assert id1 == id2

    def test_registry_value_asset_id_generation(self):
        """Test registry value asset ID generation."""
        id1 = generate_registry_value_asset_id(
            "HKEY_LOCAL_MACHINE",
            "SOFTWARE\\Microsoft\\Windows",
            "Version"
        )
        assert len(id1) == 64

    def test_process_asset_id_generation(self):
        """Test process asset ID generation."""
        id1 = generate_process_asset_id("C:\\Windows\\System32\\svchost.exe", 1234)
        id2 = generate_process_asset_id("c:/windows/system32/svchost.exe", 1234)
        assert id1 == id2

    def test_different_types_produce_different_ids(self):
        """Different asset types should produce different IDs even with same path."""
        file_id = generate_file_asset_id("C:\\test\\path")
        dir_id = generate_directory_asset_id("C:\\test\\path")
        assert file_id != dir_id


# ── Asset Types Tests ──────────────────────────────────────────────


class TestAssetTypes:
    def test_asset_type_enum(self):
        """Test AssetType enum values."""
        assert AssetType.FILE.value == "file"
        assert AssetType.REGISTRY_KEY.value == "registry_key"
        assert AssetType.PROCESS.value == "process"

    def test_asset_category_enum(self):
        """Test AssetCategory enum values."""
        assert AssetCategory.FILESYSTEM.value == "filesystem"
        assert AssetCategory.REGISTRY.value == "registry"
        assert AssetCategory.RUNTIME.value == "runtime"

    def test_get_category_for_type(self):
        """Test automatic category derivation from type."""
        assert get_category_for_type(AssetType.FILE) == AssetCategory.FILESYSTEM
        assert get_category_for_type(AssetType.REGISTRY_KEY) == AssetCategory.REGISTRY
        assert get_category_for_type(AssetType.PROCESS) == AssetCategory.RUNTIME
        assert get_category_for_type(AssetType.SERVICE) == AssetCategory.WINDOWS
        assert get_category_for_type(AssetType.BROWSER_INSTALLATION) == AssetCategory.BROWSER


# ── Metadata Tests ─────────────────────────────────────────────────


class TestAssetMetadata:
    def test_metadata_get_set(self):
        """Test basic metadata get/set operations."""
        metadata = AssetMetadata()
        metadata.set("key1", "value1")
        metadata.set("key2", 123)
        metadata.set("key3", True)

        assert metadata.get("key1") == "value1"
        assert metadata.get("key2") == 123
        assert metadata.get("key3") is True
        assert metadata.get("missing", "default") == "default"

    def test_metadata_has_remove(self):
        """Test metadata has/remove operations."""
        metadata = AssetMetadata()
        metadata.set("key1", "value1")

        assert metadata.has("key1")
        assert not metadata.has("missing")

        metadata.remove("key1")
        assert not metadata.has("key1")

    def test_metadata_datetime_serialization(self):
        """Test datetime serialization in metadata."""
        metadata = AssetMetadata()
        now = datetime.now(UTC)
        metadata.set("timestamp", now)

        data = metadata.to_dict()
        assert isinstance(data["timestamp"], str)
        assert "T" in data["timestamp"]

        # Deserialize
        metadata2 = AssetMetadata.from_dict(data)
        timestamp2 = metadata2.get("timestamp")
        assert isinstance(timestamp2, datetime)

    def test_metadata_merge(self):
        """Test metadata merging."""
        m1 = AssetMetadata()
        m1.set("key1", "value1")
        m1.set("key2", "value2")

        m2 = AssetMetadata()
        m2.set("key2", "new_value2")
        m2.set("key3", "value3")

        m1.merge(m2)
        assert m1.get("key1") == "value1"
        assert m1.get("key2") == "new_value2"  # Overwritten
        assert m1.get("key3") == "value3"


# ── Relationships Tests ────────────────────────────────────────────


class TestAssetRelationships:
    def test_relationship_creation(self):
        """Test basic relationship creation."""
        rel = AssetRelationship(
            source_asset_id="abc123",
            target_asset_id="def456",
            relationship_type=RelationshipType.DEPENDS_ON,
        )

        assert rel.source_asset_id == "abc123"
        assert rel.target_asset_id == "def456"
        assert rel.relationship_type == RelationshipType.DEPENDS_ON

    def test_relationship_serialization(self):
        """Test relationship serialization."""
        rel = AssetRelationship(
            source_asset_id="abc123",
            target_asset_id="def456",
            relationship_type=RelationshipType.PARENT,
            metadata={"note": "test"},
        )

        data = rel.to_dict()
        assert data["source_asset_id"] == "abc123"
        assert data["target_asset_id"] == "def456"
        assert data["relationship_type"] == "parent"
        assert data["metadata"]["note"] == "test"

        rel2 = AssetRelationship.from_dict(data)
        assert rel2.source_asset_id == rel.source_asset_id
        assert rel2.target_asset_id == rel.target_asset_id
        assert rel2.relationship_type == rel.relationship_type

    def test_parent_child_relationship_helper(self):
        """Test parent-child relationship helper."""
        parent_id = "parent123"
        child_id = "child456"

        parent_to_child, child_to_parent = create_parent_child_relationship(parent_id, child_id)

        assert parent_to_child.source_asset_id == parent_id
        assert parent_to_child.target_asset_id == child_id
        assert parent_to_child.relationship_type == RelationshipType.CHILD

        assert child_to_parent.source_asset_id == child_id
        assert child_to_parent.target_asset_id == parent_id
        assert child_to_parent.relationship_type == RelationshipType.PARENT

    def test_dependency_relationship_helper(self):
        """Test dependency relationship helper."""
        dependent_id = "app123"
        dependency_id = "lib456"

        depends_on, required_by = create_dependency_relationship(dependent_id, dependency_id)

        assert depends_on.relationship_type == RelationshipType.DEPENDS_ON
        assert required_by.relationship_type == RelationshipType.REQUIRED_BY

    def test_launch_relationship_helper(self):
        """Test launch relationship helper."""
        launcher_id = "explorer123"
        launched_id = "notepad456"

        launches, launched_by = create_launch_relationship(launcher_id, launched_id)

        assert launches.relationship_type == RelationshipType.LAUNCHES
        assert launched_by.relationship_type == RelationshipType.LAUNCHED_BY

    def test_lock_relationship_helper(self):
        """Test lock relationship helper."""
        locker_id = "process123"
        locked_id = "file456"

        locks, locked_by = create_lock_relationship(locker_id, locked_id)

        assert locks.relationship_type == RelationshipType.LOCKS
        assert locked_by.relationship_type == RelationshipType.LOCKED_BY


# ── Base Asset Tests ───────────────────────────────────────────────


class TestScanAsset:
    def test_asset_creation(self):
        """Test basic asset creation."""
        asset = ScanAsset(
            asset_id="a" * 64,
            asset_type=AssetType.FILE,
            asset_category=AssetCategory.FILESYSTEM,
            asset_source=AssetSource.FILESYSTEM_ENUMERATOR,
            display_name="test.txt",
            canonical_path="C:/test/test.txt",
        )

        assert asset.asset_id == "a" * 64
        assert asset.asset_type == AssetType.FILE
        assert asset.asset_category == AssetCategory.FILESYSTEM
        assert asset.display_name == "test.txt"
        assert asset.exists is True
        assert asset.accessible is True

    def test_asset_auto_category_derivation(self):
        """Test automatic category derivation from type."""
        asset = ScanAsset(
            asset_id="a" * 64,
            asset_type=AssetType.REGISTRY_KEY,
            asset_category=AssetCategory.UNKNOWN,  # Will be auto-derived
            asset_source=AssetSource.REGISTRY_ENUMERATOR,
            display_name="TestKey",
            canonical_path="HKLM\\SOFTWARE\\Test",
        )

        assert asset.asset_category == AssetCategory.REGISTRY

    def test_asset_tag_management(self):
        """Test asset tag operations."""
        asset = ScanAsset(
            asset_id="a" * 64,
            asset_type=AssetType.FILE,
            asset_category=AssetCategory.FILESYSTEM,
            asset_source=AssetSource.FILESYSTEM_ENUMERATOR,
            display_name="test.txt",
            canonical_path="C:/test/test.txt",
        )

        asset.add_tag("cache")
        asset.add_tag("temporary")
        asset.add_tag("SYSTEM")  # Should be lowercased

        assert asset.has_tag("cache")
        assert asset.has_tag("temporary")
        assert asset.has_tag("system")
        assert asset.has_any_tag("cache", "missing")
        assert asset.has_all_tags("cache", "temporary")
        assert not asset.has_all_tags("cache", "missing")

        asset.remove_tag("cache")
        assert not asset.has_tag("cache")

    def test_asset_relationship_management(self):
        """Test asset relationship operations."""
        asset = ScanAsset(
            asset_id="a" * 64,
            asset_type=AssetType.FILE,
            asset_category=AssetCategory.FILESYSTEM,
            asset_source=AssetSource.FILESYSTEM_ENUMERATOR,
            display_name="test.txt",
            canonical_path="C:/test/test.txt",
        )

        rel1 = AssetRelationship(
            source_asset_id=asset.asset_id,
            target_asset_id="b" * 64,
            relationship_type=RelationshipType.DEPENDS_ON,
        )
        rel2 = AssetRelationship(
            source_asset_id=asset.asset_id,
            target_asset_id="c" * 64,
            relationship_type=RelationshipType.PARENT,
        )

        asset.add_relationship(rel1)
        asset.add_relationship(rel2)

        assert len(asset.relationships) == 2
        depends_rels = asset.get_relationships_by_type("depends_on")
        assert len(depends_rels) == 1
        assert depends_rels[0].target_asset_id == "b" * 64

        related_ids = asset.get_related_asset_ids()
        assert len(related_ids) == 2
        assert "b" * 64 in related_ids
        assert "c" * 64 in related_ids

    def test_asset_common_interface(self):
        """Test common interface properties."""
        asset = ScanAsset(
            asset_id="a" * 64,
            asset_type=AssetType.FILE,
            asset_category=AssetCategory.FILESYSTEM,
            asset_source=AssetSource.FILESYSTEM_ENUMERATOR,
            display_name="test.txt",
            canonical_path="C:/test/test.txt",
        )

        asset.add_tag("test")
        asset.custom_metadata.set("key", "value")

        assert asset.asset_name == "test.txt"
        assert "test" in asset.asset_tags
        assert asset.asset_metadata.get("key") == "value"


# ── Serialization Tests ────────────────────────────────────────────


class TestSerialization:
    def test_asset_serialization(self):
        """Test asset serialization to dict."""
        now = datetime.now(UTC)
        asset = ScanAsset(
            asset_id="a" * 64,
            asset_type=AssetType.FILE,
            asset_category=AssetCategory.FILESYSTEM,
            asset_source=AssetSource.FILESYSTEM_ENUMERATOR,
            display_name="test.txt",
            canonical_path="C:/test/test.txt",
            created_at=now,
            modified_at=now,
            discovered_at=now,
        )
        asset.add_tag("test")
        asset.custom_metadata.set("key", "value")

        data = serialize_asset(asset)

        assert data["asset_id"] == "a" * 64
        assert data["asset_type"] == "file"
        assert data["asset_category"] == "filesystem"
        assert data["display_name"] == "test.txt"
        assert "test" in data["tags"]
        assert data["custom_metadata"]["key"] == "value"
        assert "schema_version" in data

    def test_asset_deserialization(self):
        """Test asset deserialization from dict."""
        data = {
            "schema_version": 1,
            "asset_id": "a" * 64,
            "asset_type": "file",
            "asset_category": "filesystem",
            "asset_source": "filesystem_enumerator",
            "display_name": "test.txt",
            "canonical_path": "C:/test/test.txt",
            "created_at": "2024-01-01T12:00:00",
            "modified_at": "2024-01-01T12:00:00",
            "discovered_at": "2024-01-01T12:00:00",
            "metadata_version": 1,
            "exists": True,
            "accessible": True,
            "locked": False,
            "hidden": False,
            "system": False,
            "tags": ["test", "cache"],
            "custom_metadata": {"key": "value"},
            "relationships": [],
        }

        kwargs = deserialize_asset(data)
        asset = ScanAsset(**kwargs)

        assert asset.asset_id == "a" * 64
        assert asset.asset_type == AssetType.FILE
        assert asset.display_name == "test.txt"
        assert "test" in asset.tags
        assert asset.custom_metadata.get("key") == "value"

    def test_json_serialization(self):
        """Test JSON serialization round-trip."""
        asset = ScanAsset(
            asset_id="a" * 64,
            asset_type=AssetType.FILE,
            asset_category=AssetCategory.FILESYSTEM,
            asset_source=AssetSource.FILESYSTEM_ENUMERATOR,
            display_name="test.txt",
            canonical_path="C:/test/test.txt",
        )

        json_str = to_json(asset)
        assert isinstance(json_str, str)
        assert "test.txt" in json_str

        kwargs = from_json(json_str)
        asset2 = ScanAsset(**kwargs)

        assert asset2.asset_id == asset.asset_id
        assert asset2.display_name == asset.display_name


# ── Validation Tests ───────────────────────────────────────────────


class TestValidation:
    def test_valid_asset(self):
        """Test validation of a valid asset."""
        asset = ScanAsset(
            asset_id="a" * 64,
            asset_type=AssetType.FILE,
            asset_category=AssetCategory.FILESYSTEM,
            asset_source=AssetSource.FILESYSTEM_ENUMERATOR,
            display_name="test.txt",
            canonical_path="C:/test/test.txt",
        )

        result = validate_asset(asset)
        assert result.is_valid
        assert len(result.errors) == 0

    def test_missing_required_fields(self):
        """Test validation with missing required fields."""
        asset = ScanAsset(
            asset_id="",  # Missing
            asset_type=AssetType.FILE,
            asset_category=AssetCategory.FILESYSTEM,
            asset_source=AssetSource.FILESYSTEM_ENUMERATOR,
            display_name="",  # Missing
            canonical_path="",  # Missing
        )

        result = validate_asset(asset)
        assert not result.is_valid
        assert "Missing asset_id" in result.errors
        assert "Missing display_name" in result.errors
        assert "Missing canonical_path" in result.errors

    def test_invalid_timestamps(self):
        """Test validation with invalid timestamps."""
        now = datetime.now(UTC)
        future = now + timedelta(days=1)

        asset = ScanAsset(
            asset_id="a" * 64,
            asset_type=AssetType.FILE,
            asset_category=AssetCategory.FILESYSTEM,
            asset_source=AssetSource.FILESYSTEM_ENUMERATOR,
            display_name="test.txt",
            canonical_path="C:/test/test.txt",
            created_at=future,
            modified_at=now,  # Before created_at
        )

        result = validate_asset(asset)
        assert not result.is_valid
        assert any("created_at is after modified_at" in err for err in result.errors)

    def test_validate_asset_id_format(self):
        """Test asset ID format validation."""
        assert validate_asset_id("a" * 64)
        assert not validate_asset_id("a" * 63)  # Too short
        assert not validate_asset_id("a" * 65)  # Too long
        assert not validate_asset_id("Z" * 64)  # Invalid hex
        assert not validate_asset_id("")

    def test_relationship_integrity_validation(self):
        """Test relationship integrity across multiple assets."""
        asset1 = ScanAsset(
            asset_id="a" * 64,
            asset_type=AssetType.FILE,
            asset_category=AssetCategory.FILESYSTEM,
            asset_source=AssetSource.FILESYSTEM_ENUMERATOR,
            display_name="file1.txt",
            canonical_path="C:/test/file1.txt",
        )
        asset2 = ScanAsset(
            asset_id="b" * 64,
            asset_type=AssetType.FILE,
            asset_category=AssetCategory.FILESYSTEM,
            asset_source=AssetSource.FILESYSTEM_ENUMERATOR,
            display_name="file2.txt",
            canonical_path="C:/test/file2.txt",
        )

        # Valid relationship
        rel = AssetRelationship(
            source_asset_id=asset1.asset_id,
            target_asset_id=asset2.asset_id,
            relationship_type=RelationshipType.DEPENDS_ON,
        )
        asset1.add_relationship(rel)

        result = validate_relationship_integrity([asset1, asset2])
        assert result.is_valid

        # Invalid relationship (target doesn't exist)
        rel2 = AssetRelationship(
            source_asset_id=asset1.asset_id,
            target_asset_id="c" * 64,  # Doesn't exist
            relationship_type=RelationshipType.DEPENDS_ON,
        )
        asset1.add_relationship(rel2)

        result = validate_relationship_integrity([asset1, asset2])
        assert not result.is_valid
        assert len(result.errors) > 0

    def test_find_duplicate_assets(self):
        """Test finding duplicate assets."""
        asset1 = ScanAsset(
            asset_id="a" * 64,
            asset_type=AssetType.FILE,
            asset_category=AssetCategory.FILESYSTEM,
            asset_source=AssetSource.FILESYSTEM_ENUMERATOR,
            display_name="file1.txt",
            canonical_path="C:/test/file1.txt",
        )
        asset2 = ScanAsset(
            asset_id="a" * 64,  # Duplicate ID
            asset_type=AssetType.FILE,
            asset_category=AssetCategory.FILESYSTEM,
            asset_source=AssetSource.FILESYSTEM_ENUMERATOR,
            display_name="file1_copy.txt",
            canonical_path="C:/test/file1_copy.txt",
        )
        asset3 = ScanAsset(
            asset_id="b" * 64,
            asset_type=AssetType.FILE,
            asset_category=AssetCategory.FILESYSTEM,
            asset_source=AssetSource.FILESYSTEM_ENUMERATOR,
            display_name="file2.txt",
            canonical_path="C:/test/file2.txt",
        )

        duplicates = find_duplicate_assets([asset1, asset2, asset3])
        assert len(duplicates) == 1
        assert duplicates[0][0] == "a" * 64
        assert len(duplicates[0][1]) == 2


# ── Inheritance Tests ──────────────────────────────────────────────


class TestInheritance:
    def test_subclass_creation(self):
        """Test creating a subclass of ScanAsset."""
        from dataclasses import dataclass

        @dataclass
        class FileAsset(ScanAsset):
            file_size: int = 0
            file_extension: str = ""

        file_asset = FileAsset(
            asset_id="a" * 64,
            asset_type=AssetType.FILE,
            asset_category=AssetCategory.FILESYSTEM,
            asset_source=AssetSource.FILESYSTEM_ENUMERATOR,
            display_name="test.txt",
            canonical_path="C:/test/test.txt",
            file_size=1024,
            file_extension=".txt",
        )

        assert file_asset.file_size == 1024
        assert file_asset.file_extension == ".txt"
        assert file_asset.asset_type == AssetType.FILE
        assert isinstance(file_asset, ScanAsset)

    def test_subclass_serialization(self):
        """Test serialization of ScanAsset subclass."""
        from dataclasses import dataclass

        @dataclass
        class FileAsset(ScanAsset):
            file_size: int = 0

        file_asset = FileAsset(
            asset_id="a" * 64,
            asset_type=AssetType.FILE,
            asset_category=AssetCategory.FILESYSTEM,
            asset_source=AssetSource.FILESYSTEM_ENUMERATOR,
            display_name="test.txt",
            canonical_path="C:/test/test.txt",
            file_size=1024,
        )

        data = serialize_asset(file_asset)
        assert data["file_size"] == 1024
        assert data["asset_type"] == "file"
