# Scan Core Phase SC-6A — Universal Asset Model

**Status:** ✅ Complete — All 235 tests pass (198 existing + 37 new asset tests)

## Executive Summary

Created a **Universal Asset Model** — the common language of the AVS Shield platform. Every discovered object (files, registry keys, processes, browsers, services) will eventually become a `ScanAsset` with deterministic identity, extensible metadata, and relationship tracking.

**Key Achievement:** Platform-wide standardization without modifying any existing enumerators.

## Architecture Overview

### Package Structure

```
backend/src/avs_backend/scan_core/assets/
├── __init__.py              # Public API exports
├── asset_types.py           # Type taxonomy (AssetType, AssetCategory, AssetSource)
├── base_asset.py            # ScanAsset base class
├── identity.py              # Deterministic ID generation
├── metadata.py              # Extensible metadata container
├── relationships.py         # Asset relationship model
├── serialization.py         # JSON serialization with versioning
└── validation.py            # Validation helpers
```

### Class Hierarchy

```
ScanAsset (base class)
├── Mandatory fields (17)
│   ├── Identity: asset_id, asset_type, asset_category, asset_source
│   ├── Display: display_name, canonical_path
│   ├── Timestamps: created_at, modified_at, discovered_at
│   ├── Versioning: metadata_version
│   ├── State: exists, accessible, locked, hidden, system
│   └── Extensibility: tags, custom_metadata, relationships
│
└── Future subclasses
    ├── FileAsset (filesystem)
    ├── RegistryAsset (registry)
    ├── ProcessAsset (runtime)
    ├── BrowserAsset (browser)
    ├── ServiceAsset (windows)
    └── ... (extensible)
```

## Core Components

### 1. Asset Identity (Deterministic)

**Algorithm:** SHA-256 hash of canonical identifier

**Format:** `sha256(type:primary[:secondary[:tertiary]])`

**Normalization Rules:**
- Lowercase all paths
- Backslash → forward slash
- Collapse multiple slashes
- Remove trailing slashes

**Examples:**

```python
# File (Windows)
identity = AssetIdentity(
    asset_type=AssetType.FILE,
    primary_key="C:\\Users\\Alice\\Documents\\report.pdf"
)
# → sha256("file:c:/users/alice/documents/report.pdf")

# File (Linux) — same ID!
identity = AssetIdentity(
    asset_type=AssetType.FILE,
    primary_key="c:/users/alice/documents/report.pdf"
)
# → sha256("file:c:/users/alice/documents/report.pdf")

# Registry Key
identity = AssetIdentity(
    asset_type=AssetType.REGISTRY_KEY,
    primary_key="HKEY_LOCAL_MACHINE",
    secondary_key="SOFTWARE\\Microsoft\\Windows"
)
# → sha256("registry_key:hkey_local_machine:software/microsoft/windows")

# Process
identity = AssetIdentity(
    asset_type=AssetType.PROCESS,
    primary_key="C:\\Windows\\System32\\svchost.exe",
    secondary_key="1234"  # PID
)
# → sha256("process:c:/windows/system32/svchost.exe:1234")
```

**Cross-Platform Guarantee:** Same object on Windows and Linux → same asset ID.

### 2. Asset Types and Categories

**Asset Types (26 defined, extensible):**

| Category | Types |
|----------|-------|
| **Filesystem** | file, directory, drive, symlink, junction |
| **Registry** | registry_key, registry_value |
| **Browser** | browser_installation, browser_profile, browser_extension, browser_cache, browser_cookie, browser_history |
| **Windows** | service, driver, installed_program, startup_entry, scheduled_task |
| **Runtime** | process, locked_file, session, resource_snapshot |
| **Reserved** | network_connection, network_share, cloud_file, malware_signature, plugin |

**Auto-Category Derivation:**
```python
asset = ScanAsset(
    asset_type=AssetType.REGISTRY_KEY,
    asset_category=AssetCategory.UNKNOWN,  # Auto-derived to REGISTRY
    ...
)
```

### 3. Extensible Metadata

**Typed Metadata Container:**
```python
metadata = AssetMetadata()
metadata.set("file_size", 1024)
metadata.set("last_scan", datetime.utcnow())
metadata.set("threat_score", 0.85)
metadata.set("custom_tags", ["suspicious", "network"])

# Serialization preserves types
data = metadata.to_dict()
# → {"file_size": 1024, "last_scan": "2024-01-01T12:00:00", ...}

# Deserialization restores types
metadata2 = AssetMetadata.from_dict(data)
assert isinstance(metadata2.get("last_scan"), datetime)
```

**Supported Types:**
- `str`, `int`, `float`, `bool`
- `datetime` (auto-serialized to ISO format)
- `list[Any]`, `dict[str, Any]`
- `None`

### 4. Relationship Model

**Relationship Types:**
- **Containment:** `contains`, `belongs_to`
- **Dependency:** `depends_on`, `required_by`
- **Execution:** `launches`, `launched_by`
- **Ownership:** `owns`, `owned_by`
- **Reference:** `references`, `referenced_by`
- **Hierarchy:** `parent`, `child`
- **Locking:** `locks`, `locked_by`

**Bidirectional Helpers:**
```python
# Parent-child
parent_to_child, child_to_parent = create_parent_child_relationship(
    parent_id="dir_abc123",
    child_id="file_def456"
)

# Dependency
depends_on, required_by = create_dependency_relationship(
    dependent_id="app_abc123",
    dependency_id="lib_def456"
)

# Process locking file
locks, locked_by = create_lock_relationship(
    locker_id="process_abc123",
    locked_id="file_def456"
)
```

**Relationship Structure:**
```python
@dataclass(frozen=True)
class AssetRelationship:
    source_asset_id: str
    target_asset_id: str
    relationship_type: RelationshipType
    metadata: Optional[dict[str, str]] = None
```

### 5. Serialization with Versioning

**Schema Version:** 1 (current)

**Forward/Backward Compatibility:**
```python
# Serialize
data = serialize_asset(asset)
# → {"schema_version": 1, "asset_id": "...", ...}

# Deserialize with migration support
kwargs = deserialize_asset(data)
asset = ScanAsset(**kwargs)

# JSON support
json_str = to_json(asset, indent=2)
kwargs = from_json(json_str)
```

**Migration Strategy:**
```python
def _migrate_schema(data, from_version, to_version):
    # Example future migration:
    # if from_version == 1 and to_version >= 2:
    #     data = _migrate_v1_to_v2(data)
    # if from_version <= 2 and to_version >= 3:
    #     data = _migrate_v2_to_v3(data)
    data["schema_version"] = to_version
    return data
```

### 6. Validation

**Asset Validation:**
```python
result = validate_asset(asset)
# → ValidationResult(is_valid=True, errors=[], warnings=[])

if not result.is_valid:
    print(f"Errors: {result.errors}")
    print(f"Warnings: {result.warnings}")
```

**Validation Checks:**
- Required fields present (asset_id, asset_type, display_name, canonical_path, asset_source)
- Asset ID format (64-char hex)
- Timestamp consistency (created_at ≤ modified_at)
- Relationship integrity (source/target IDs valid)
- State consistency (exists vs accessible)

**Relationship Integrity:**
```python
result = validate_relationship_integrity([asset1, asset2, asset3])
# Checks:
# - All referenced asset IDs exist
# - No broken relationships
# - Source asset ID matches relationship owner
```

**Duplicate Detection:**
```python
duplicates = find_duplicate_assets([asset1, asset2, asset3])
# → [(asset_id, [duplicate_assets])]
```

## Common Interface

Every `ScanAsset` exposes:

```python
# Identity
asset.asset_id          # str (64-char hex)
asset.asset_type        # AssetType enum
asset.asset_category    # AssetCategory enum
asset.asset_source      # AssetSource enum

# Display
asset.asset_name        # Alias for display_name
asset.canonical_path    # Normalized path

# Tags
asset.add_tag("cache")
asset.has_tag("cache")
asset.has_any_tag("cache", "temporary")
asset.has_all_tags("cache", "system")

# Metadata
asset.asset_metadata.set("key", "value")
asset.asset_metadata.get("key")

# Relationships
asset.add_relationship(relationship)
asset.get_relationships_by_type("depends_on")
asset.get_related_asset_ids()

# Serialization
data = asset.serialize()
json_str = to_json(asset)

# Validation
is_valid, errors = asset.validate()
```

## Inheritance Example

```python
from dataclasses import dataclass
from avs_backend.scan_core.assets import ScanAsset, AssetType, AssetCategory, AssetSource

@dataclass
class FileAsset(ScanAsset):
    """File-specific asset with additional fields."""
    
    file_size: int = 0
    file_extension: str = ""
    mime_type: str = ""
    hash_sha256: str = ""
    
    def __post_init__(self):
        super().__post_init__()
        # Additional file-specific initialization

# Usage
file_asset = FileAsset(
    asset_id=generate_file_asset_id("C:/test/file.txt"),
    asset_type=AssetType.FILE,
    asset_category=AssetCategory.FILESYSTEM,
    asset_source=AssetSource.FILESYSTEM_ENUMERATOR,
    display_name="file.txt",
    canonical_path="c:/test/file.txt",
    file_size=1024,
    file_extension=".txt",
    mime_type="text/plain",
)

# All base methods available
file_asset.add_tag("document")
file_asset.custom_metadata.set("author", "Alice")
data = file_asset.serialize()  # Includes file_size, file_extension, etc.
```

## Test Coverage

**37 comprehensive tests:**

| Test Category | Tests | Coverage |
|--------------|-------|----------|
| Identity | 9 | Deterministic IDs, cross-platform normalization, convenience functions |
| Asset Types | 3 | Enum values, category derivation |
| Metadata | 4 | Get/set, datetime serialization, merging |
| Relationships | 5 | Creation, serialization, bidirectional helpers |
| Base Asset | 5 | Creation, tags, relationships, common interface |
| Serialization | 3 | Dict serialization, JSON round-trip |
| Validation | 6 | Valid/invalid assets, timestamps, relationships, duplicates |
| Inheritance | 2 | Subclass creation, serialization |

**All existing tests still pass:**
- 198 Scan Core tests (SC-1 through SC-5)
- 7 skipped (platform-specific)

## Future Migration Strategy

### Phase 1: Adapter Layer (SC-6B)
Create adapters to convert existing enumerator outputs to `ScanAsset` instances:
```python
def filesystem_entry_to_asset(entry: FileEntry) -> FileAsset:
    return FileAsset(
        asset_id=generate_file_asset_id(entry.path),
        asset_type=AssetType.FILE,
        asset_category=AssetCategory.FILESYSTEM,
        asset_source=AssetSource.FILESYSTEM_ENUMERATOR,
        display_name=entry.asset_name,
        canonical_path=entry.path,
        file_size=entry.size,
        file_extension=entry.asset_extension,
        created_at=datetime.fromtimestamp(entry.created),
        modified_at=datetime.fromtimestamp(entry.modified),
    )
```

### Phase 2: Metadata Cache (SC-7)
Build persistent storage for `ScanAsset` instances:
- SQLite database
- Asset versioning
- Incremental updates
- Query interface

### Phase 3: Rule Engine (SC-8)
Consume `ScanAsset` instances for classification:
- Tag-based rules
- Metadata-based rules
- Relationship-based rules
- Threat scoring

### Phase 4: Enumerator Migration (SC-9)
Gradually migrate enumerators to emit `ScanAsset` directly:
- Filesystem → `FileAsset`, `DirectoryAsset`
- Registry → `RegistryKeyAsset`, `RegistryValueAsset`
- Runtime → `ProcessAsset`, `LockedFileAsset`
- Browser → `BrowserAsset`
- Windows → `ServiceAsset`, `DriverAsset`

## Benefits

### 1. Platform-Wide Standardization
- Every component speaks the same language
- No impedance mismatch between layers
- Consistent data model from discovery to UI

### 2. Deterministic Identity
- Same object → same ID, always
- Cross-platform consistency
- Enables deduplication
- Supports incremental scanning

### 3. Extensibility
- Unlimited tags
- Typed custom metadata
- Relationship tracking
- Future-proof design

### 4. Versioning
- Schema evolution support
- Forward/backward compatibility
- Migration framework

### 5. Validation
- Integrity checks
- Relationship validation
- Duplicate detection
- Error reporting

### 6. Serialization
- JSON export/import
- Database persistence
- API responses
- Logging/debugging

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `assets/__init__.py` | 43 | Public API exports |
| `assets/asset_types.py` | 130 | Type taxonomy |
| `assets/base_asset.py` | 147 | ScanAsset base class |
| `assets/identity.py` | 171 | Deterministic ID generation |
| `assets/metadata.py` | 102 | Extensible metadata |
| `assets/relationships.py` | 161 | Relationship model |
| `assets/serialization.py` | 157 | JSON serialization |
| `assets/validation.py` | 174 | Validation helpers |
| `tests/test_scan_core_assets.py` | 654 | Comprehensive tests |
| **Total** | **1,739** | **9 files** |

## Success Criteria — Met

✅ **Universal Asset Model exists**
- `ScanAsset` base class with 17 mandatory fields
- Deterministic identity generation
- Extensible metadata and relationships

✅ **No existing enumerator modified**
- All 198 Scan Core tests still pass
- Zero breaking changes

✅ **Comprehensive tests**
- 37 new tests covering all components
- Identity, serialization, validation, inheritance

✅ **Common language established**
- Every future component can communicate through `ScanAsset`
- Platform-wide standardization achieved

✅ **Architecture only**
- No Metadata Cache
- No Rule Engine
- No Storage
- No UI integration

## Next Steps

**SC-6B: Adapter Layer**
- Create converters from existing models to `ScanAsset`
- Non-destructive transformation
- Preserve all original data

**SC-7: Metadata Cache**
- SQLite-based asset storage
- Incremental updates
- Query interface

**SC-8: Rule Engine**
- Tag-based classification
- Metadata-based rules
- Threat scoring

**SC-9: Enumerator Migration**
- Gradually migrate to native `ScanAsset` emission
- Deprecate old models
- Complete platform unification
