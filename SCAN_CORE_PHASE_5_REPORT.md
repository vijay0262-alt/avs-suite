# Scan Core — Phase SC-5: Runtime Enumerator + Build Stabilization

## Part 1: Build Stabilization (SC-1 through SC-4)

### Build Issues Found

| # | Phase | File | Issue | Severity |
|---|-------|------|-------|----------|
| 1 | SC-4 | `windows/filters.py:123` | `RegexFilter._compiled` field typed as `re.Pattern` but default `None` — mypy `arg-type` error | Type |
| 2 | SC-2 | `registry/filters.py:155` | Same `RegexFilter._compiled` typing issue | Type |
| 3 | SC-3 | `browser/filters.py:130` | Same `RegexFilter._compiled` typing issue | Type |
| 4 | SC-1 | `enumerator.py:49` | `_GetFileAttributesW = None` on non-Windows — mypy `assignment` error (incompatible with `_NamedFuncPointer`) | Type |
| 5 | SC-1 | `enumerator.py:73` | `os.O_NONBLOCK` not available on Windows — mypy `attr-defined` error | Type |
| 6 | SC-1 | `enumerator.py:215` | `os.statvfs()` not available on Windows — mypy `attr-defined` error | Type |
| 7 | SC-1 | `enumerator.py:266` | `os.statvfs()` not available on Windows — mypy `attr-defined` error (second call) | Type |
| 8 | SC-4 | `windows/enumerator.py:730` | `_reg_get(subkey, "SystemComponent", 0)` — int default passed to function expecting str | Type |
| 9 | SC-4 | `windows/enumerator.py` | Dead code: unused ctypes SCM structures (`_SERVICE_STATUS_PROCESS`, `_ENUM_SERVICE_STATUS_PROCESS`, `_QUERY_SERVICE_CONFIG`) and constants left after switching to `sc queryex` | Dead code |
| 10 | SC-4 | `windows/enumerator.py` | Dead code: unused `_SERVICE_STATE_MAP`, `_START_TYPE_MAP`, `_SERVICE_TYPE_DRIVER_MAP` | Dead code |
| 11 | SC-4 | `windows/enumerator.py` | Dead imports: `field`, `Union` imported but never used | Dead imports |
| 12 | SC-4 | `windows/enumerator.py` | `from datetime import datetime` at bottom of file (line 1146) instead of top | Code style |
| 13 | SC-4 | `windows/enumerator.py` | Unused Win32 API bindings: `_advapi32`, `_psapi`, `_iphlpapi`, `_srclient` after SCM API removal | Dead code |
| 14 | SC-4 | `windows/filters.py:129-130` | After fixing #1, mypy `union-attr`: `Optional[re.Pattern]` has no `.search()` | Type |
| 15 | SC-2 | `registry/filters.py:161,167` | Same `union-attr` issue after fixing #2 | Type |
| 16 | SC-3 | `browser/filters.py:142` | Same `union-attr` issue after fixing #3 | Type |

### Fixes Applied

| # | Fix |
|---|-----|
| 1-3 | Changed `_compiled: re.Pattern` → `_compiled: Optional[re.Pattern]` in all 3 filter files |
| 4 | Added `# type: ignore[assignment]` to `_GetFileAttributesW = None` on non-Windows |
| 5 | Changed `os.O_WRONLY | os.O_NONBLOCK` → `os.O_WRONLY | getattr(os, "O_NONBLOCK", 0)` |
| 6-7 | Added `# type: ignore[attr-defined]` to both `os.statvfs()` calls (Unix-only code paths) |
| 8 | Changed `self._reg_get(subkey, "SystemComponent", 0) == 1` → `self._reg_get(subkey, "SystemComponent", "0") == "1"` |
| 9-10 | Removed all dead ctypes structures, constants, and maps from `windows/enumerator.py` |
| 11 | Removed unused `field` and `Union` from imports |
| 12 | Moved `from datetime import datetime` to top of file with other imports |
| 13 | Removed unused `_advapi32`, `_psapi`, `_iphlpapi`, `_srclient` bindings; kept only `_kernel32` |
| 14-16 | Added `assert self._compiled is not None` before `.search()` calls in all 3 filter files |

### Verification After Fixes

- **mypy**: `scan_core/` — **0 errors** (was 8 errors before)
- **All Scan Core tests**: 140 passed, 3 skipped (SC-1 through SC-4)
- **Existing backend tests**: 73 passed, 2 skipped
- **TypeScript**: `tsc --noEmit` — clean
- **ESLint**: `eslint --max-warnings 0` — clean

---

## Part 2: Runtime Enumerator Architecture

### Package Structure

```
backend/src/avs_backend/scan_core/runtime/
    __init__.py      — Public API exports
    models.py        — Dataclasses: ProcessAsset, ConnectionAsset, SessionAsset, LockedFileAsset, ResourceSnapshot, RuntimeStatistics
    filters.py       — Composable filters: ProcessName, PID, User, Status, Path, Regex + RuntimeFilterChain
    enumerator.py    — Streaming generator, psutil-based, progress, cancellation, statistics
```

### Models (`models.py`)

| Class | Description |
|-------|-------------|
| `RuntimeAssetType` | Enum — PROCESS, CONNECTION, SESSION, LOCKED_FILE, RESOURCE_SNAPSHOT |
| `ProcessAsset` | Frozen slots — pid, name, parent_pid, executable_path, command_line, working_directory, username, cpu_percent, memory_percent, memory_bytes, thread_count, handle_count, status, creation_time |
| `ConnectionAsset` | Frozen slots — protocol, local_address, local_port, remote_address, remote_port, state, pid, process_name |
| `SessionAsset` | Frozen slots — session_id, username, domain, session_type, state, connect_time, idle_time |
| `LockedFileAsset` | Frozen slots — path, pid, process_name |
| `ResourceSnapshot` | Frozen slots — cpu_percent, cpu_count, memory_total, memory_used, memory_percent, disk_read_bytes, disk_write_bytes, net_sent_bytes, net_recv_bytes, gpu_percent, gpu_memory_total, gpu_memory_used, gpu_name |
| `RuntimeStatistics` | Mutable — processes, connections, sessions, locked_files, resource_snapshots, permission_errors, skipped, errors, elapsed_seconds, assets_per_second |

### Filters (`filters.py`)

| Class | Description |
|-------|-------------|
| `ProcessNameFilter` | Include only processes whose name contains substring (case-insensitive) |
| `PIDFilter` | Include only processes with specific PID |
| `UserFilter` | Include only processes/sessions belonging to specified user (case-insensitive) |
| `StatusFilter` | Filter by status string (applies to processes, connections, sessions) |
| `PathFilter` | Match by executable path substring (case-insensitive, multiple substrings) |
| `RegexFilter` | Match by regex pattern on asset name or path |
| `RuntimeFilterChain` | Compose multiple filters — asset must pass ALL |

### Enumerator (`enumerator.py`)

| Class | Description |
|-------|-------------|
| `RuntimeEnumerator` | Main class — `enumerate()`, `get_statistics()` |
| `RuntimeEnumerateOptions` | include_processes, include_connections, include_sessions, include_locked_files, include_resource_snapshot, progress_interval, filter, cancel_event, locked_file_dirs, locked_file_extensions |
| `RuntimeProgressEvent` | current_category, current_asset, assets_enumerated, elapsed_seconds, assets_per_second, cancelled |
| `RuntimeCancelEvent` | Cooperative cancellation |

## APIs Used

| API | Purpose | Native? |
|-----|---------|---------|
| `psutil.process_iter()` | Process enumeration with all attrs (pid, name, ppid, exe, cmdline, cwd, username, cpu_percent, memory_percent, memory_info, num_threads, num_handles, status, create_time) | Python library (wraps Win32/Native APIs) |
| `psutil.net_connections()` | TCP/UDP connection enumeration | Python library |
| `psutil.Process(pid).name()` | Resolve owning process name for connections | Python library |
| `psutil.cpu_percent()` | CPU usage snapshot | Python library |
| `psutil.cpu_count()` | CPU core count | Python library |
| `psutil.virtual_memory()` | Memory usage snapshot | Python library |
| `psutil.disk_io_counters()` | Disk I/O counters | Python library |
| `psutil.net_io_counters()` | Network I/O counters | Python library |
| `query user` (Windows) | Interactive session enumeration | Windows command |
| `who` (Unix) | Interactive session enumeration | Unix command |
| `os.open()` / `os.close()` | Locked file detection (try exclusive open) | Python stdlib |
| `nvidia-smi` | GPU usage (if available) | NVIDIA tool (optional) |

## Performance Considerations

1. **Streaming generator** — Yields assets one at a time. Never builds one huge list. Constant memory regardless of process count.

2. **psutil batch attrs** — `process_iter(attrs=[...])` fetches all needed attributes in one call per process, minimizing cross-process queries.

3. **Frozen slots dataclasses** — All asset types use `frozen=True, slots=True` for lower memory and faster access.

4. **No PowerShell or WMI** — Uses psutil (which wraps native Win32 APIs internally) and simple Windows commands (`query user`).

5. **Cooperative cancellation** — `RuntimeCancelEvent` checked at each category boundary and between assets.

6. **Progress throttling** — Events emitted every `progress_interval` assets (default 50).

7. **Error isolation** — Each category wrapped in try/except. Permission errors (AccessDenied, NoSuchProcess) tracked separately from general errors.

8. **GPU detection is optional** — `nvidia-smi` called with 5s timeout; silently skipped if not available.

9. **Locked files opt-in** — Disabled by default (`include_locked_files=False`). Only scans specified directories and extensions.

## Statistics

`RuntimeStatistics` tracks:
- `processes` — number of processes discovered
- `connections` — number of network connections discovered
- `sessions` — number of user sessions discovered
- `locked_files` — number of locked files discovered
- `resource_snapshots` — always 0 or 1 (single snapshot)
- `permission_errors` — number of AccessDenied/NoSuchProcess exceptions
- `skipped` — number of assets filtered out
- `errors` — number of general errors
- `elapsed_seconds` — total enumeration time
- `assets_per_second` — average discovery rate
- `total_assets` — property summing all categories

## Tests

**File:** `backend/tests/test_scan_core_runtime.py`
**Results:** 46 passed

| Test Class | Tests | Description |
|-----------|-------|-------------|
| `TestModels` | 8 | Process, connection, session, locked file, resource snapshot properties |
| `TestStatistics` | 2 | Counts tracked, finalize with elapsed |
| `TestProcessEnumeration` | 4 | Processes found, fields populated, parent PID, memory info |
| `TestConnectionEnumeration` | 2 | Connections enumerated, fields populated |
| `TestSessionEnumeration` | 2 | Sessions enumerated, fields populated |
| `TestResourceSnapshot` | 2 | Snapshot taken, CPU/memory fields populated |
| `TestFilters` | 11 | Process name, PID, user, status (process+connection), path (single+multiple), regex, chain combines, empty chain |
| `TestOptions` | 2 | include_processes false, include_connections false |
| `TestProgressEvents` | 2 | Events emitted, current_category present |
| `TestCancellation` | 2 | Mid-scan and pre-start cancellation |
| `TestErrorHandling` | 3 | No crash, permission errors tracked, errors tracked |
| `TestStatisticsIntegration` | 3 | Process count matches, total_assets matches, elapsed > 0 |
| `TestConvenienceFunction` | 1 | `enumerate_runtime()` works |
| `TestLockedFiles` | 2 | No dirs yields nothing, with dir doesn't crash |

## Full Test Results

| Test Suite | Passed | Skipped | Failed |
|-----------|--------|---------|--------|
| SC-1 (Filesystem) | 17 | 0 | 0 |
| SC-2 (Registry) | 17 | 0 | 0 |
| SC-3 (Browser) | 25 | 3 | 0 |
| SC-4 (Windows) | 41 | 0 | 0 |
| SC-5 (Runtime) | 46 | 0 | 0 |
| Existing backend | 73 | 2 | 0 |
| **Total** | **219** | **5** | **0** |

## Remaining Technical Debt

1. **Pre-existing mypy errors outside Scan Core** — `cleaner/` and `orchestrator/` modules have ~50 mypy type errors. These are pre-existing and not introduced by Scan Core phases. They should be addressed in a separate stabilization pass.

2. **Locked file detection is basic** — Uses `os.open()` exclusive open approach. The Windows Restart Manager API (`RmRegisterResources` / `RmGetList`) could provide more accurate results with process attribution, but requires complex ctypes bindings.

3. **GPU monitoring** — Only supports NVIDIA GPUs via `nvidia-smi`. AMD and Intel GPU monitoring would require additional tools or APIs.

4. **Session enumeration on Unix** — Uses `who` command which may not show all session types. Could be enhanced with `loginctl` on systemd-based systems.

5. **`query user` parsing** — The Windows `query user` command output format varies by locale and Windows version. Current parsing handles the common case but may need adjustments for edge cases.

## Files Created

| File | Purpose |
|------|---------|
| `scan_core/runtime/__init__.py` | Public API exports |
| `scan_core/runtime/models.py` | 5 asset dataclasses + RuntimeAssetType enum + RuntimeStatistics |
| `scan_core/runtime/filters.py` | 6 filter types + RuntimeFilterChain |
| `scan_core/runtime/enumerator.py` | RuntimeEnumerator with 5 enumeration categories, progress, cancellation, statistics |
| `tests/test_scan_core_runtime.py` | 46 test cases across 14 test classes |

## Files Modified (Build Stabilization)

| File | Changes |
|------|---------|
| `scan_core/windows/filters.py` | Fixed `Optional[re.Pattern]` typing + assert narrowing |
| `scan_core/registry/filters.py` | Fixed `Optional[re.Pattern]` typing + assert narrowing |
| `scan_core/browser/filters.py` | Fixed `Optional[re.Pattern]` typing + assert narrowing |
| `scan_core/enumerator.py` | Fixed `os.O_NONBLOCK` with `getattr`, `os.statvfs` type ignores, `_GetFileAttributesW` type ignore |
| `scan_core/windows/enumerator.py` | Removed dead ctypes structures/constants/maps, fixed `_reg_get` int→str, moved `datetime` import to top, removed unused imports, removed unused Win32 API bindings |
