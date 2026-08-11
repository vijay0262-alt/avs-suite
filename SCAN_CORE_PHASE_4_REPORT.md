# Scan Core — Phase SC-4: Windows Enumerator

## Architecture

The Windows Enumerator is a new, isolated package at `backend/src/avs_backend/scan_core/windows/`.
It is completely decoupled from all existing modules — Optimization Engine, Security Engine,
Protection Engine, Health Engine, Malware Engine, Orchestrator, and UI.

```
backend/src/avs_backend/scan_core/windows/
    __init__.py      — Public API exports
    models.py        — Dataclasses: ServiceAsset, DriverAsset, ScheduledTaskAsset, InstalledProgramAsset,
                       SecurityAsset, RestorePointAsset, SystemAsset, NetworkAdapterAsset, WindowsStatistics
    filters.py       — Composable filters: AssetType, Status, Name, Path, Regex, Enabled + WindowsFilterChain
    enumerator.py    — Streaming generator, all Windows asset categories, progress, cancellation, statistics
```

## Classes

### Models (`models.py`)

| Class | Description |
|-------|-------------|
| `WindowsAssetType` | Enum — SERVICE, DRIVER, SCHEDULED_TASK, INSTALLED_PROGRAM, INSTALLED_UPDATE, WINDOWS_FEATURE, SECURITY, SYSTEM, NETWORK_ADAPTER, RESTORE_POINT, EVENT_LOG, POWER_PLAN, ENVIRONMENT |
| `ServiceAsset` | Frozen slots — service_name, display_name, status, startup_type, binary_path, service_account, dependencies, description, pid |
| `DriverAsset` | Frozen slots — driver_name, provider, version, path, driver_type, state, start_mode |
| `ScheduledTaskAsset` | Frozen slots — task_name, task_folder, enabled, last_run_time, next_run_time, trigger_count, action_count, principal |
| `InstalledProgramAsset` | Frozen slots — display_name, publisher, version, install_date, install_location, estimated_size, registry_source, architecture, is_update, is_feature |
| `SecurityAsset` | Frozen slots — security_type, name, status, details, is_enabled |
| `RestorePointAsset` | Frozen slots — description, creation_time, sequence_number |
| `SystemAsset` | Frozen slots — computer_name, os_version, build_number, edition, architecture, boot_time, uptime_seconds, language, timezone, domain |
| `NetworkAdapterAsset` | Frozen slots — adapter_name, description, mac_address, ipv4_addresses, ipv6_addresses, default_gateway, dns_servers, dhcp_enabled, state |
| `WindowsStatistics` | Mutable — services, drivers, tasks, programs, updates, security_assets, restore_points, network_adapters, event_logs, power_plans, environment_vars, errors, skipped, elapsed_seconds, assets_per_second |

### Filters (`filters.py`)

| Class | Description |
|-------|-------------|
| `AssetTypeFilter` | Include only assets of specified WindowsAssetType |
| `StatusFilter` | Filter by status string (applies to services, drivers, security, network adapters) |
| `NameFilter` | Match by asset name substring (case-insensitive) |
| `PathFilter` | Match by asset path substring (case-insensitive) |
| `RegexFilter` | Match by regex pattern on asset name or path |
| `EnabledFilter` | Filter scheduled tasks or security assets by enabled status |
| `WindowsFilterChain` | Compose multiple filters — asset must pass ALL |

### Enumerator (`enumerator.py`)

| Class | Description |
|-------|-------------|
| `WindowsEnumerator` | Main class — `enumerate()`, `get_statistics()` |
| `WindowsEnumerateOptions` | include_services, include_drivers, include_tasks, include_programs, include_security, include_system, include_network, include_restore_points, include_event_logs, include_power_plans, include_environment, progress_interval, filter, cancel_event |
| `WindowsProgressEvent` | current_category, current_asset, assets_enumerated, elapsed_seconds, assets_per_second, cancelled |
| `WindowsCancelEvent` | Cooperative cancellation |

## Discovered Windows Assets

### Services
- **Method**: `sc queryex type= service state= all` + `sc qc` + `sc qdescription`
- **Fields**: service_name, display_name, status (Running/Stopped/Paused), startup_type (Auto/Manual/Disabled/Delayed-Auto/Boot/System), binary_path, service_account, dependencies, description, PID

### Drivers
- **Method**: `sc queryex type= driver state= all` + `sc qc` + file version query
- **Fields**: driver_name, provider, version, path, driver_type (Kernel/File System/Adapter), state, start_mode

### Scheduled Tasks
- **Method**: `schtasks /query /fo CSV /v /nh`
- **Fields**: task_name, task_folder, enabled, last_run_time, next_run_time, trigger_count, action_count, principal

### Installed Programs
- **Method**: Registry Uninstall keys (HKLM 64-bit, HKLM WOW6432Node 32-bit, HKCU)
- **Fields**: display_name, publisher, version, install_date, install_location, estimated_size, registry_source, architecture, is_update, is_feature

### Security
- **Method**: PowerShell `Get-MpComputerStatus` (Defender), `netsh advfirewall` (Firewall), Registry (SmartScreen), `manage-bde` (BitLocker)
- **Fields**: security_type (Defender/Firewall/SmartScreen/BitLocker/RealTimeProtection/TamperProtection), name, status, details, is_enabled

### System
- **Method**: `kernel32.GetVersionExW` + `kernel32.GetTickCount64` + Registry + environment variables
- **Fields**: computer_name, os_version, build_number, edition, architecture, boot_time, uptime_seconds, language, timezone, domain

### Network Adapters
- **Method**: `ipconfig /all` parsing
- **Fields**: adapter_name, description, mac_address, ipv4_addresses, ipv6_addresses, default_gateway, dns_servers, dhcp_enabled, state

### Restore Points
- **Method**: PowerShell `Get-ComputerRestorePoint`
- **Fields**: description, creation_time, sequence_number

### Event Logs (optional)
- **Method**: `wevtutil el`
- **Fields**: name

### Power Plans (optional)
- **Method**: `powercfg /list`
- **Fields**: name, guid

### Environment Variables (optional)
- **Method**: `os.environ`
- **Fields**: name, value

## Windows APIs Used

| API | Purpose | Native? |
|-----|---------|---------|
| `sc queryex` | Service and driver enumeration | Windows command |
| `sc qc` | Service/driver configuration (startup type, binary path, account) | Windows command |
| `sc qdescription` | Service description | Windows command |
| `schtasks /query` | Scheduled task enumeration | Windows command |
| `winreg` | Installed programs from registry Uninstall keys, SmartScreen setting, OS edition | Python stdlib |
| `netsh advfirewall` | Firewall profile status | Windows command |
| `manage-bde` | BitLocker status | Windows command |
| `kernel32.GetVersionExW` | OS version and build number | Win32 API (ctypes) |
| `kernel32.GetTickCount64` | System uptime | Win32 API (ctypes) |
| `version.GetFileVersionInfoSizeW` | Driver file version | Win32 API (ctypes) |
| `version.GetFileVersionInfoW` | Driver file version | Win32 API (ctypes) |
| `version.VerQueryValueW` | Driver file version | Win32 API (ctypes) |
| `ipconfig /all` | Network adapter info | Windows command |
| `wevtutil el` | Event log channels | Windows command |
| `powercfg /list` | Power plans | Windows command |
| `os.environ` | Environment variables | Python stdlib |
| PowerShell `Get-MpComputerStatus` | Windows Defender status | PowerShell (no native alternative) |
| PowerShell `Get-ComputerRestorePoint` | Restore points | PowerShell (WMI, no native alternative) |

## Performance Considerations

1. **Streaming generator** — Yields assets one at a time. Never builds one huge list. Constant memory regardless of how many services/drivers/tasks/programs exist.

2. **Frozen slots dataclasses** — All asset types use `frozen=True, slots=True` for lower memory and faster access.

3. **Native Windows commands** — Uses `sc`, `schtasks`, `netsh`, `ipconfig`, `wevtutil`, `powercfg` instead of PowerShell wherever possible. PowerShell is used only for Defender status and restore points (no native alternative).

4. **Avoids WMI** — WMI is slow and unreliable. Uses direct Windows commands and registry reads instead.

5. **Cooperative cancellation** — `WindowsCancelEvent` checked at each category boundary and between assets.

6. **Progress throttling** — Events emitted every `progress_interval` assets (default 50).

7. **Error isolation** — Each category wrapped in try/except. Errors increment `statistics.errors` but don't crash the enumerator.

8. **Registry reads** — Direct `winreg` API for installed programs, SmartScreen, and OS edition. No WMI or PowerShell needed.

9. **File version queries** — Uses Win32 `GetFileVersionInfoW` API for driver versions. Only queries if the driver file path exists.

## Statistics

`WindowsStatistics` tracks:
- `services` — number of services discovered
- `drivers` — number of drivers discovered
- `tasks` — number of scheduled tasks discovered
- `programs` — number of installed programs (non-updates) discovered
- `updates` — number of installed updates discovered
- `security_assets` — number of security assets discovered
- `restore_points` — number of restore points discovered
- `network_adapters` — number of network adapters discovered
- `event_logs` — number of event log channels discovered
- `power_plans` — number of power plans discovered
- `environment_vars` — number of environment variables discovered
- `errors` — number of errors encountered
- `skipped` — number of entries skipped
- `elapsed_seconds` — total enumeration time
- `assets_per_second` — average discovery rate
- `total_assets` — property summing all categories

## Tests

**File:** `backend/tests/test_scan_core_windows.py`
**Results:** 41 passed

| Test Class | Tests | Description |
|-----------|-------|-------------|
| `TestServiceEnumeration` | 3 | Services found, fields populated, is_running property |
| `TestDriverEnumeration` | 2 | Drivers found, fields populated |
| `TestScheduledTaskEnumeration` | 2 | Tasks found, fields populated |
| `TestInstalledProgramEnumeration` | 3 | Programs found, fields populated, size_mb property |
| `TestSecurityEnumeration` | 2 | Security assets found, fields populated |
| `TestSystemInfo` | 3 | System info found, fields populated, uptime_str property |
| `TestNetworkAdapters` | 2 | Adapters found, fields populated |
| `TestStatistics` | 3 | Counts tracked, total_assets, finalize |
| `TestProgressEvents` | 2 | Events emitted, current_category included |
| `TestCancellation` | 2 | Mid-scan and pre-start cancellation |
| `TestFilters` | 7 | Asset type, status, name, path, regex, enabled, combined chain |
| `TestOptions` | 2 | include_services/system false |
| `TestModels` | 5 | Service, driver, task, restore point, network adapter properties |
| `TestConvenienceFunction` | 1 | enumerate_windows() works |
| `TestErrorHandling` | 2 | Full enumeration doesn't crash, errors tracked |

## Future Integration Points

The Windows Enumerator is designed as reusable infrastructure:

1. **Optimization Engine** — Can enumerate services with startup_type=Disabled or Manual for optimization recommendations
2. **Security Engine** — Can enumerate services, drivers, scheduled tasks for security analysis and threat detection
3. **Protection Engine** — Can monitor security assets (Defender, Firewall, SmartScreen, BitLocker) for protection status
4. **Health Engine** — Can enumerate system info, drivers, and services for health assessment
5. **Malware Engine** — Can enumerate services, scheduled tasks, and installed programs for persistence detection
6. **Orchestrator** — Can use `enumerate()` for system-wide Windows asset discovery

The enumerator does NOT repair, optimize, clean, disable, remove, or classify — it only discovers.
Higher-level modules consume the stream and apply their own logic.

## Files Created

| File | Purpose |
|------|---------|
| `scan_core/windows/__init__.py` | Public API exports |
| `scan_core/windows/models.py` | 8 asset dataclasses + WindowsAssetType enum + WindowsStatistics |
| `scan_core/windows/filters.py` | 6 filter types + WindowsFilterChain |
| `scan_core/windows/enumerator.py` | WindowsEnumerator with 11 enumeration categories, progress, cancellation, statistics |
| `tests/test_scan_core_windows.py` | 41 test cases across 15 test classes |
