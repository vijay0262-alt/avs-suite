# Scan Core — Phase SC-2: Registry Enumerator

## Architecture

The Registry Enumerator is a new, isolated package at `backend/src/avs_backend/scan_core/registry/`.
It is completely decoupled from the existing Registry Cleaner, Security Engine, Orchestrator, and all other modules.

```
backend/src/avs_backend/scan_core/registry/
    __init__.py      — Public API exports
    models.py        — Dataclasses: RegistryHive, RegistryKeyAsset, RegistryValueAsset, RegistryStatistics
    filters.py       — Composable filters: Hive, Key, ValueName, Depth, Path, Regex + FilterChain
    enumerator.py    — Streaming generator using winreg, progress events, cancellation, statistics, predefined targets
```

## Classes

### Models (`models.py`)

| Class | Description |
|-------|-------------|
| `RegistryHive` | Enum — HKCR, HKCU, HKLM, HKU, HKCC with abbrev and winreg constant properties |
| `RegistryValueType` | Enum — all 14 REG_* types with `from_winreg()` classmethod |
| `RegistryKeyAsset` | Frozen slots dataclass — hive, key_path, key_name, subkey_count, value_count, last_write_time, depth, parent_path, is_wow6432node, permission_denied |
| `RegistryValueAsset` | Frozen slots dataclass — hive, key_path, value_name, value_type, value_data, is_default, data_size |
| `RegistryStatistics` | Mutable dataclass — total_keys, total_values, permission_errors, skipped_keys, elapsed_seconds, keys_per_second |

### Filters (`filters.py`)

| Class | Description |
|-------|-------------|
| `RegistryFilter` | Protocol — `matches_key()`, `should_descend()`, `matches_value()` |
| `HiveFilter` | Restrict to specified hives |
| `KeyFilter` | Match keys by name substring (case-insensitive) |
| `ValueNameFilter` | Match values by exact name (case-insensitive) |
| `DepthFilter` | Limit enumeration depth |
| `PathFilter` | Match keys by path prefix (case-insensitive, normalized) |
| `RegexFilter` | Match by regex pattern against full path |
| `RegistryFilterChain` | Compose multiple filters — entry must pass ALL |

### Enumerator (`enumerator.py`)

| Class | Description |
|-------|-------------|
| `RegistryEnumerator` | Main class — `enumerate_key()`, `enumerate_targets()`, `get_statistics()` |
| `RegistryEnumerateOptions` | include_values, include_keys, max_depth, progress_interval, filter, cancel_event, skip_permission_errors |
| `RegistryProgressEvent` | current_hive, current_key, keys/values enumerated, elapsed_seconds, keys_per_second, cancelled |
| `RegistryCancelEvent` | Cooperative cancellation |
| `RegistryTarget` | Predefined location — hive, subpath, label, recurse, max_depth, enabled |

## Interfaces

### Basic Enumeration
```python
from avs_backend.scan_core.registry import RegistryEnumerator, RegistryHive, RegistryEnumerateOptions

enumerator = RegistryEnumerator()
opts = RegistryEnumerateOptions(max_depth=2)
for asset in enumerator.enumerate_key(RegistryHive.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft", options=opts):
    if hasattr(asset, 'subkey_count'):
        print(f"Key: {asset.full_path} ({asset.subkey_count} subkeys)")
    else:
        print(f"Value: {asset.full_path} = {asset.value_data}")
```

### With Progress
```python
def on_progress(event):
    print(f"Keys: {event.keys_enumerated}, Speed: {event.keys_per_second:.0f}/s")

for asset in enumerator.enumerate_key(hive, subpath, on_progress=on_progress):
    process(asset)
```

### With Filters
```python
from avs_backend.scan_core.registry import RegistryFilterChain, DepthFilter, KeyFilter

filters = RegistryFilterChain(
    DepthFilter(max_depth=2),
    KeyFilter(key_names={"Microsoft"}),
)
opts = RegistryEnumerateOptions(filter=filters)
```

### With Cancellation
```python
cancel = RegistryCancelEvent()
opts = RegistryEnumerateOptions(cancel_event=cancel)
for asset in enumerator.enumerate_key(hive, subpath, options=opts):
    if should_stop():
        cancel.cancel()
        break
```

### Predefined Targets
```python
from avs_backend.scan_core.registry import get_default_registry_targets

targets = get_default_registry_targets()
for asset in enumerator.enumerate_targets(targets):
    process(asset)
```

## Predefined Registry Targets

`get_default_registry_targets()` returns 25+ targets:

- **Run / RunOnce**: HKLM, HKCU, WOW6432Node variants
- **StartupApproved**: HKCU, HKLM
- **Uninstall**: HKLM, HKLM WOW64, HKCU
- **Services**: HKLM\\SYSTEM\\CurrentControlSet\\Services
- **COM CLSID**: HKLM, HKLM WOW64
- **File Associations**: HKCR (depth 1)
- **Shell Extensions**: HKLM Approved
- **App Paths**: HKLM
- **Shared DLLs**: HKLM
- **MUI Cache**: HKCU
- **RecentDocs**: HKCU
- **Explorer**: HKCU
- **Policies**: HKLM, HKCU
- **Browser Registrations**: HKLM Clients\\StartMenuInternet
- **Installed Software**: HKLM, HKLM WOW64, HKCU App Management

## Performance Considerations

1. **winreg native API** — Uses `winreg.OpenKey`, `EnumKey`, `EnumValue`, `QueryInfoKey` for direct registry access. No WMI or PowerShell overhead.

2. **Streaming generator** — Yields assets one at a time. Never loads the entire registry into memory. Consumers can process millions of keys with constant memory.

3. **Frozen slots dataclasses** — `RegistryKeyAsset` and `RegistryValueAsset` use `frozen=True, slots=True` for lower memory and faster access.

4. **Key handle reuse** — Each key is opened once, all values and subkeys enumerated from the same handle, then closed. No repeated `OpenKey` calls for the same path.

5. **Cooperative cancellation** — `RegistryCancelEvent` checked at each key and value boundary. Cancellation is immediate.

6. **Progress throttling** — Events emitted every `progress_interval` entries (default 500), not on every entry.

7. **Permission error handling** — `PermissionError` and `OSError` caught per-key; errors recorded in statistics without crashing. `skip_permission_errors=True` by default.

8. **FILETIME conversion** — Last write time converted from Windows FILETIME (100ns since 1601) to Unix timestamp in one arithmetic operation.

## Statistics

`RegistryStatistics` tracks:
- `total_keys` — total keys enumerated
- `total_values` — total values enumerated
- `permission_errors` — keys that couldn't be opened due to permissions
- `skipped_keys` — keys that didn't exist or had other errors
- `elapsed_seconds` — total enumeration time
- `keys_per_second` — average speed (computed on finalize)

## Tests

**File:** `backend/tests/test_scan_core_registry.py`
**Results:** 33 passed

| Test Class | Tests | Description |
|-----------|-------|-------------|
| `TestBasicEnumeration` | 4 | HKCU enumeration, key info, values, convenience function |
| `TestEmptyKey` | 1 | Empty key has zero subkeys and values |
| `TestLargeTree` | 2 | HKLM\\SOFTWARE has many subkeys, streaming verified |
| `TestPermissionDenied` | 2 | SAM key access handled gracefully, errors recorded |
| `TestCancellation` | 2 | Mid-scan and pre-start cancellation |
| `TestRecursiveTraversal` | 2 | Nested keys found at multiple depths, max_depth limits traversal |
| `TestFilters` | 7 | Hive, depth, key name, value name, path, regex, combined chain |
| `TestStatistics` | 3 | Keys/values tracked, elapsed time, permission errors |
| `TestProgressEvents` | 2 | Events emitted with correct counts, current key |
| `TestWOW6432Node` | 1 | WOW6432Node keys flagged correctly |
| `TestDefaultValue` | 1 | Default value (empty name) detected and flagged |
| `TestRegistryTargets` | 3 | Default targets non-empty, enumerate works, disabled skipped |
| `TestOptions` | 2 | include_keys=false, include_values=false |
| `TestValueTypes` | 1 | SZ, DWORD, MULTI_SZ types correctly identified |

## Future Integration Points

The Registry Enumerator is designed as reusable infrastructure:

1. **Registry Cleaner** — Can enumerate specific hives/paths and apply junk heuristics to `RegistryKeyAsset`/`RegistryValueAsset` objects
2. **Startup Manager** — Can enumerate Run/RunOnce keys to list startup programs
3. **Security Engine** — Can enumerate Services, COM CLSID, Shell Extensions for threat analysis
4. **Protection Engine** — Can monitor specific registry keys for changes
5. **Malware Engine** — Can enumerate all startup vectors (Run, Services, CLSID, App Paths) for persistence detection
6. **Uninstaller** — Can enumerate Uninstall keys to list installed software
7. **Orchestrator** — Can use `enumerate_targets()` with predefined targets for system-wide registry scans

The enumerator does NOT classify, repair, or delete — it only discovers. Higher-level modules consume the stream and apply their own logic.

## Files Created

| File | Purpose |
|------|---------|
| `scan_core/registry/__init__.py` | Public API exports |
| `scan_core/registry/models.py` | RegistryHive, RegistryValueType, RegistryKeyAsset, RegistryValueAsset, RegistryStatistics |
| `scan_core/registry/filters.py` | 6 filter types + RegistryFilterChain |
| `scan_core/registry/enumerator.py` | RegistryEnumerator, options, progress, cancellation, targets, statistics |
| `tests/test_scan_core_registry.py` | 33 test cases across 14 test classes |
