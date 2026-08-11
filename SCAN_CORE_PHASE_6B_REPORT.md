# Scan Core Phase SC-6B — Asset Adapter Layer

**Status:** ✅ Complete — All 260 tests pass (198 SC-1 to SC-5 + 37 SC-6A + 25 SC-6B)

## Executive Summary

Created a **pure translation layer** that converts every existing Scan Core model into the Universal ScanAsset model (SC-6A). Enumerators continue returning their native models unchanged. The Adapter Layer sits between Discovery and future consumers (Metadata Cache, Rule Engine, UI).

**Key Achievement:** Complete model translation without modifying any existing enumerators.

## Architecture Overview

### Package Structure

```
backend/src/avs_backend/scan_core/adapters/
├── __init__.py              # Public API exports
├── base_adapter.py          # BaseAssetAdapter + statistics
├── filesystem_adapter.py    # FileEntry, DirectoryEntry → ScanAsset
├── registry_adapter.py      # RegistryKeyAsset, RegistryValueAsset → ScanAsset
├── browser_adapter.py       # BrowserInstallation, BrowserProfile, BrowserAsset → ScanAsset
├── windows_adapter.py       # ServiceAsset, DriverAsset, etc. → ScanAsset
├── runtime_adapter.py       # ProcessAsset, ConnectionAsset, etc. → ScanAsset
└── adapter_registry.py      # Automatic adapter selection
```

### Adapter Hierarchy

```
BaseAssetAdapter (ABC)
├── supports(obj) → bool
├── convert(obj) → ScanAsset
├── convert_many(objects) → list[ScanAsset]
├── validate(asset) → ValidationResult
└── get_statistics() → AdapterStatistics

Concrete Adapters:
├── FilesystemAdapter
├── RegistryAdapter
├── BrowserAdapter
├── WindowsAdapter
└── RuntimeAdapter
```

## Conversion Matrix

| Source Model | Adapter | Target AssetType | Category | Relationships |
|--------------|---------|------------------|----------|---------------|
| **Filesystem** |
| `FileEntry` | FilesystemAdapter | `FILE` or `SYMLINK` | FILESYSTEM | None |
| `DirectoryEntry` | FilesystemAdapter | `DIRECTORY` or `JUNCTION` | FILESYSTEM | None |
| **Registry** |
| `RegistryKeyAsset` | RegistryAdapter | `REGISTRY_KEY` | REGISTRY | `parent` (to parent key) |
| `RegistryValueAsset` | RegistryAdapter | `REGISTRY_VALUE` | REGISTRY | `belongs_to` (to parent key) |
| **Browser** |
| `BrowserInstallation` | BrowserAdapter | `BROWSER_INSTALLATION` | BROWSER | None |
| `BrowserProfile` | BrowserAdapter | `BROWSER_PROFILE` | BROWSER | None |
| `BrowserAsset` | BrowserAdapter | `BROWSER_CACHE`, `BROWSER_COOKIE`, `BROWSER_HISTORY`, `BROWSER_EXTENSION` | BROWSER | `belongs_to` (to profile) |
| **Windows** |
| `ServiceAsset` | WindowsAdapter | `SERVICE` | WINDOWS | None |
| `DriverAsset` | WindowsAdapter | `DRIVER` | WINDOWS | None |
| `ScheduledTaskAsset` | WindowsAdapter | `SCHEDULED_TASK` | WINDOWS | None |
| `InstalledProgramAsset` | WindowsAdapter | `INSTALLED_PROGRAM` | WINDOWS | None |
| `SecurityAsset` | WindowsAdapter | `UNKNOWN` | SECURITY | None |
| `RestorePointAsset` | WindowsAdapter | `UNKNOWN` | WINDOWS | None |
| `SystemAsset` | WindowsAdapter | `UNKNOWN` | WINDOWS | None |
| `NetworkAdapterAsset` | WindowsAdapter | `UNKNOWN` | NETWORK | None |
| **Runtime** |
| `ProcessAsset` | RuntimeAdapter | `PROCESS` | RUNTIME | `parent` (to parent process) |
| `ConnectionAsset` | RuntimeAdapter | `NETWORK_CONNECTION` | NETWORK | `owned_by` (to process) |
| `SessionAsset` | RuntimeAdapter | `SESSION` | RUNTIME | None |
| `LockedFileAsset` | RuntimeAdapter | `LOCKED_FILE` | RUNTIME | `locked_by` (to process) |

## Data Preservation Guarantees

### 1. Identity Preservation

**Deterministic IDs remain stable across conversions:**

```python
# Same file → same asset ID, always
file_entry1 = FileEntry(path="C:\\test.txt", ...)
file_entry2 = FileEntry(path="C:\\test.txt", ...)  # Different metadata

asset1 = filesystem_adapter.convert(file_entry1)
asset2 = filesystem_adapter.convert(file_entry2)

assert asset1.asset_id == asset2.asset_id  # ✅ Same ID
```

**Cross-platform normalization:**

```python
# Windows path
windows_entry = FileEntry(path="C:\\Users\\Alice\\file.txt", ...)
windows_asset = adapter.convert(windows_entry)

# POSIX path (normalized)
posix_id = generate_file_asset_id("c:/users/alice/file.txt")

assert windows_asset.asset_id == posix_id  # ✅ Same ID
```

### 2. Metadata Preservation

**All source model fields are preserved in `custom_metadata`:**

```python
# FileEntry → ScanAsset
file_entry = FileEntry(
    path="C:\\test.txt",
    size=1024,
    extension=".txt",
    is_hidden=True,
    is_system=True,
    is_temporary=True,
    depth=2,
    ...
)

asset = filesystem_adapter.convert(file_entry)

# All metadata preserved
assert asset.custom_metadata.get("size") == 1024
assert asset.custom_metadata.get("extension") == ".txt"
assert asset.custom_metadata.get("depth") == 2
assert asset.custom_metadata.get("is_archive") is not None
assert asset.hidden is True
assert asset.system is True
```

**No data loss:**
- All source fields mapped to `custom_metadata`
- State flags mapped to base `ScanAsset` fields
- Timestamps preserved
- Relationships preserved

### 3. Relationship Preservation

**Existing relationships are preserved:**

```python
# Registry value → key relationship
registry_value = RegistryValueAsset(
    hive=RegistryHive.HKEY_LOCAL_MACHINE,
    key_path="SOFTWARE\\Test",
    value_name="Version",
    ...
)

asset = registry_adapter.convert(registry_value)

# Relationship preserved
assert len(asset.relationships) == 1
assert asset.relationships[0].relationship_type == RelationshipType.BELONGS_TO
```

**Supported relationships:**
- **Registry:** Value `belongs_to` Key, Key `parent` of parent Key
- **Browser:** Asset `belongs_to` Profile
- **Runtime:** Process `parent` of parent Process, Connection `owned_by` Process, LockedFile `locked_by` Process

### 4. Tag Preservation

**Meaningful tags automatically generated:**

```python
# FileEntry with flags
file_entry = FileEntry(
    path="C:\\temp\\cache.tmp",
    is_temporary=True,
    is_hidden=True,
    is_locked=True,
    ...
)

asset = filesystem_adapter.convert(file_entry)

# Tags generated
assert asset.has_tag("filesystem")
assert asset.has_tag("file")
assert asset.has_tag("temporary")
assert asset.has_tag("hidden")
assert asset.has_tag("locked")
```

**Tag categories:**
- **Domain:** `filesystem`, `registry`, `browser`, `windows`, `runtime`, `network`
- **Type:** `file`, `directory`, `service`, `process`, `connection`
- **State:** `running`, `active`, `locked`, `hidden`, `system`
- **Special:** `cache`, `temporary`, `startup`, `user`, `chromium_based`

## Adapter Registry

**Automatic adapter selection:**

```python
from avs_backend.scan_core.adapters import convert_to_asset

# Consumer doesn't need to know which adapter to use
file_entry = FileEntry(...)
asset = convert_to_asset(file_entry)  # ✅ Automatically uses FilesystemAdapter

registry_key = RegistryKeyAsset(...)
asset = convert_to_asset(registry_key)  # ✅ Automatically uses RegistryAdapter

process = ProcessAsset(...)
asset = convert_to_asset(process)  # ✅ Automatically uses RuntimeAdapter
```

**Registry API:**

```python
from avs_backend.scan_core.adapters import AdapterRegistry

registry = AdapterRegistry()

# Find adapter
adapter = registry.get_adapter_for(file_entry)  # → FilesystemAdapter

# Convert single object
asset = registry.convert(file_entry)

# Convert multiple objects
assets = registry.convert_many([file1, file2, registry_key, process])

# Register custom adapter
registry.register_adapter(MyCustomAdapter())
```

## Adapter Statistics

**Track conversion success/failure:**

```python
adapter = FilesystemAdapter()

# Convert many files
assets = adapter.convert_many(file_entries)

# Check statistics
stats = adapter.get_statistics()
print(f"Converted: {stats.total_converted}")
print(f"Failed: {stats.total_failed}")
print(f"Success rate: {stats.success_rate * 100}%")
print(f"Validation errors: {stats.total_validation_errors}")
```

## Usage Examples

### Example 1: Filesystem Enumeration

```python
from avs_backend.scan_core import FilesystemEnumerator
from avs_backend.scan_core.adapters import FilesystemAdapter

# Enumerate files (returns FileEntry, DirectoryEntry)
enumerator = FilesystemEnumerator()
entries = list(enumerator.enumerate_directory("C:\\Users\\Alice\\Documents"))

# Convert to ScanAssets
adapter = FilesystemAdapter()
assets = adapter.convert_many(entries)

# Now assets are in universal format
for asset in assets:
    print(f"{asset.display_name}: {asset.asset_type.value}")
    print(f"  ID: {asset.asset_id}")
    print(f"  Tags: {asset.tags}")
```

### Example 2: Registry Enumeration

```python
from avs_backend.scan_core.registry import RegistryEnumerator, RegistryTarget, RegistryHive
from avs_backend.scan_core.adapters import RegistryAdapter

# Enumerate registry (returns RegistryKeyAsset, RegistryValueAsset)
enumerator = RegistryEnumerator()
target = RegistryTarget(
    hive=RegistryHive.HKEY_LOCAL_MACHINE,
    subpath="SOFTWARE\\Microsoft\\Windows\\CurrentVersion",
    label="Windows Version",
    recurse=True,
)
entries = list(enumerator.enumerate_targets([target]))

# Convert to ScanAssets
adapter = RegistryAdapter()
assets = adapter.convert_many(entries)

# Relationships preserved
for asset in assets:
    if asset.relationships:
        print(f"{asset.display_name} has {len(asset.relationships)} relationships")
```

### Example 3: Mixed Enumeration with Registry

```python
from avs_backend.scan_core.adapters import convert_to_asset

# Mix of different model types
objects = [
    FileEntry(...),
    DirectoryEntry(...),
    RegistryKeyAsset(...),
    ProcessAsset(...),
    BrowserProfile(...),
]

# Convert all to ScanAssets
assets = [convert_to_asset(obj) for obj in objects]

# All are now ScanAssets with consistent interface
for asset in assets:
    print(f"{asset.display_name} ({asset.asset_category.value})")
    print(f"  Source: {asset.asset_source.value}")
    print(f"  Tags: {', '.join(asset.tags)}")
```

## Test Coverage

**25 comprehensive adapter tests:**

| Test Category | Tests | Coverage |
|--------------|-------|----------|
| Filesystem Adapter | 4 | FileEntry, DirectoryEntry, locked files, symlinks |
| Registry Adapter | 3 | RegistryKeyAsset, RegistryValueAsset, relationships |
| Browser Adapter | 3 | BrowserInstallation, BrowserProfile, BrowserAsset |
| Windows Adapter | 3 | ServiceAsset, DriverAsset, metadata preservation |
| Runtime Adapter | 4 | ProcessAsset, ConnectionAsset, SessionAsset, LockedFileAsset |
| Adapter Registry | 4 | Automatic selection, conversion, unsupported types |
| Identity Preservation | 2 | Same object → same ID, cross-platform normalization |
| Data Preservation | 2 | All metadata preserved, no data loss |

**All existing tests still pass:**
- 198 Scan Core tests (SC-1 through SC-5)
- 37 Asset Model tests (SC-6A)
- 25 Adapter tests (SC-6B)
- **Total: 260 tests**

## Design Principles

### 1. Pure Translation

**Adapters NEVER:**
- Clean, repair, score, classify
- Cache, optimize, verify
- Modify source data
- Execute actions
- Make decisions

**Adapters ONLY:**
- Map fields
- Generate tags
- Preserve relationships
- Validate output

### 2. No Enumerator Modifications

**Zero changes to existing enumerators:**
- All enumerators return native models unchanged
- No breaking changes
- No behavioral changes
- Backward compatible

### 3. Automatic Adapter Selection

**Consumers don't need to know which adapter to use:**
- `AdapterRegistry` automatically finds the right adapter
- `convert_to_asset(obj)` works for any supported type
- Extensible: register custom adapters

### 4. Validation

**Every converted ScanAsset is validated:**

```python
adapter = FilesystemAdapter()
asset = adapter.convert(file_entry)

# Validate
result = adapter.validate(asset)
if not result.is_valid:
    print(f"Errors: {result.errors}")
    print(f"Warnings: {result.warnings}")
```

## Migration Strategy

### Phase 1: Adapter Layer (SC-6B) — ✅ Complete

Created translation layer. Enumerators unchanged.

### Phase 2: Metadata Cache (SC-7)

Build persistent storage consuming `ScanAsset`:

```python
from avs_backend.scan_core.adapters import convert_to_asset
from avs_backend.metadata_cache import MetadataCache

# Enumerate
entries = list(filesystem_enumerator.enumerate_directory("C:\\Users"))

# Convert
assets = [convert_to_asset(entry) for entry in entries]

# Store
cache = MetadataCache()
cache.store_assets(assets)
```

### Phase 3: Rule Engine (SC-8)

Consume `ScanAsset` for classification:

```python
from avs_backend.rule_engine import RuleEngine

# Assets already in universal format
assets = [convert_to_asset(entry) for entry in entries]

# Apply rules
engine = RuleEngine()
for asset in assets:
    if asset.has_tag("cache") and asset.has_tag("temporary"):
        asset.add_tag("cleanable")
```

### Phase 4: Enumerator Migration (SC-9)

Gradually migrate enumerators to emit `ScanAsset` directly:

```python
# Old way
class FilesystemEnumerator:
    def enumerate_directory(self, path):
        yield FileEntry(...)  # Native model

# New way
class FilesystemEnumerator:
    def enumerate_directory(self, path):
        entry = FileEntry(...)
        yield convert_to_asset(entry)  # ScanAsset
```

## Benefits

### 1. Single Translation Point

**All model conversion happens in one place:**
- No scattered conversion logic
- Easy to maintain
- Easy to test
- Easy to extend

### 2. No Breaking Changes

**Existing code continues to work:**
- Enumerators unchanged
- Tests unchanged
- Consumers can opt-in to adapters

### 3. Extensibility

**Easy to add new adapters:**

```python
class CustomAdapter(BaseAssetAdapter):
    def supports(self, obj):
        return isinstance(obj, MyCustomModel)
    
    def convert(self, obj):
        return ScanAsset(...)

# Register
registry = AdapterRegistry()
registry.register_adapter(CustomAdapter())
```

### 4. Validation

**Every conversion is validated:**
- Catch errors early
- Ensure data integrity
- Track statistics

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `adapters/__init__.py` | 35 | Public API exports |
| `adapters/base_adapter.py` | 140 | Base adapter + statistics |
| `adapters/filesystem_adapter.py` | 155 | Filesystem model conversion |
| `adapters/registry_adapter.py` | 165 | Registry model conversion |
| `adapters/browser_adapter.py` | 230 | Browser model conversion |
| `adapters/windows_adapter.py` | 380 | Windows model conversion |
| `adapters/runtime_adapter.py` | 255 | Runtime model conversion |
| `adapters/adapter_registry.py` | 135 | Automatic adapter selection |
| `tests/test_scan_core_adapters.py` | 744 | Comprehensive adapter tests |
| **Total** | **2,239** | **9 files** |

## Success Criteria — Met

✅ **Translation layer exists**
- Every Scan Core model can be converted to `ScanAsset`
- Pure mapping, no business logic

✅ **No enumerator modifications**
- All 198 Scan Core tests still pass
- Zero breaking changes

✅ **Data preservation**
- Identity preserved (deterministic IDs)
- Metadata preserved (all fields mapped)
- Relationships preserved (parent, belongs_to, owned_by, locked_by)
- Tags preserved (meaningful tags generated)

✅ **Automatic adapter selection**
- `AdapterRegistry` finds the right adapter
- `convert_to_asset(obj)` works for any supported type

✅ **Comprehensive tests**
- 25 new adapter tests
- All conversion paths tested
- Identity, metadata, relationships validated

✅ **Architecture only**
- No Metadata Cache
- No Rule Engine
- No Storage
- No UI integration

## Next Steps

**SC-7: Metadata Cache**
- SQLite-based asset storage
- Consume `ScanAsset` from adapters
- Incremental updates
- Query interface

**SC-8: Rule Engine**
- Tag-based classification
- Metadata-based rules
- Threat scoring
- Consume `ScanAsset` from cache

**SC-9: Enumerator Migration**
- Gradually migrate to native `ScanAsset` emission
- Deprecate adapter layer
- Complete platform unification

## Conclusion

The Adapter Layer (SC-6B) successfully bridges the gap between existing Scan Core models and the Universal Asset Model (SC-6A). Every discovered object can now be translated into a `ScanAsset` with zero changes to existing enumerators. The platform is ready for the Metadata Cache (SC-7) and Rule Engine (SC-8).
