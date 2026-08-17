# SC-8C15 Specification — Process Intelligence Backend Integration

## 1. Objective

Complete the existing Process Intelligence feature by connecting its already-completed frontend/UI and engine to a real backend data source, replacing the current mock provider with a production RPC-backed process scanner.

The end state is a fully functional Process Intelligence dashboard that displays real system process data, AI analysis, insights, and recommendations — all driven by live backend process enumeration.

## 2. Current-State Analysis

### What exists (verified against source)

| Component | Location | Status |
|-----------|----------|--------|
| Engine (14 files) | `apps/pc-optimizer/src/features/process-ai/` | 100% complete — ProcessAIEngine, 8 impact analyzers, risk assessment, recommendations, trends, explanations, dashboard provider |
| Types | `process-ai/types.ts` | 100% — 653 lines, comprehensive type system |
| UI Page | `process-ai/ui/ProcessIntelligencePage.tsx` | 100% — 338 lines, full dashboard with summary bar, top consumers, alerts, insights, recommendations, risk assessment |
| ViewModel | `process-ai/ui/ProcessIntelligenceViewModel.ts` | 100% — MVVM with `MockProcessProvider` |
| Route | `/process-intelligence` | 100% — registered, lazy-loaded, in sidebar |
| Engine tests | `process-ai/__tests__/processAIEngine.test.ts` | 80% — 547+ lines, comprehensive engine tests |
| Backend process RPCs | `performance/`, `security/` | Partial — `psutil`-based enumeration exists but returns different data shapes |
| Backend `process_intelligence` module | Does not exist | 0% — must be created |

### What's missing

1. **Backend RPC module** — No `process_intelligence` backend module exists
2. **Real ProcessProvider** — Frontend uses `MockProcessProvider` with 5 hardcoded processes
3. **Shared RPC constant** — No `PROCESS_INTELLIGENCE_SCAN` constant in `packages/shared/src/rpc/index.ts`
4. **UI tests** — No tests for `ProcessIntelligencePage` or `ProcessIntelligenceViewModel`
5. **Integration tests** — No end-to-end tests with real backend

### PROJECT_STATUS.md correction

PROJECT_STATUS.md states "Engine 100%, UI 0%" — **this is wrong**. The UI is 100% complete. EPIC 7 should be "Engine 100%, UI 100%, Backend Integration 0%".

## 3. Problem Statement

The Process Intelligence feature has a complete frontend (engine + UI + route + navigation) but cannot display real data because it uses a mock provider with 5 hardcoded processes. Users see fake data instead of their actual running processes. The feature needs a backend RPC that enumerates real system processes and returns them in the `ProcessEntry[]` format the frontend engine expects.

## 4. Scope

### In scope

- Create backend `process_intelligence` module with a `scan` RPC
- Create shared RPC constant `PROCESS_INTELLIGENCE_SCAN`
- Create frontend `RpcProcessProvider` implementing `ProcessProvider`
- Replace `MockProcessProvider` with `RpcProcessProvider` in ViewModel
- Add UI tests for page and ViewModel
- Add backend tests for the new RPC
- Add integration tests
- Full regression validation

### Out of scope (Non-goals)

1. **scan_core modifications** — FORBIDDEN (frozen)
2. **SafetyGate modifications** — FORBIDDEN
3. **RemediationCoordinator modifications** — FORBIDDEN
4. **Executor modifications** — FORBIDDEN
5. **New ActionType values** — NOT NEEDED
6. **Automatic process termination** — FORBIDDEN (observability only)
7. **Automatic remediation** — FORBIDDEN
8. **Real-time polling** — NOT in this phase (the UI already has a "Scan Now" button)
9. **Process history persistence** — NOT in this phase (repository exists but is in-memory)
10. **GPU sensor data** — Best-effort only (psutil does not provide per-process GPU usage; set to 0)
11. **Code signing / MSI installer** — Out of scope (separate concern)
12. **License activation** — Out of scope
13. **Module Registry migration** — Out of scope
14. **Pause/Resume** — Out of scope (blocked by scan_core freeze)
15. **SC-8C16** — NOT STARTED

## 5. Existing Architecture

### Frontend data flow (current)

```
ProcessIntelligencePage
  → ProcessIntelligenceViewModel
    → ProcessManager (registers provider)
      → ProcessScanner.scan()
        → MockProcessProvider.scan()  ← returns hardcoded data
      → returns ProcessSnapshot
    → ProcessAIEngine.analyze(snapshot)
      → returns ProcessAIReport
    → setState({ report })
  → UI renders report
```

### Frontend data flow (target)

```
ProcessIntelligencePage
  → ProcessIntelligenceViewModel
    → ProcessManager (registers provider)
      → ProcessScanner.scan()
        → RpcProcessProvider.scan()  ← calls backend RPC
          → rpc.raw(PROCESS_INTELLIGENCE_SCAN)
            → process_intelligence.scan (backend)
              → psutil process enumeration
              → returns ProcessEntry[] (sanitized)
      → returns ProcessSnapshot
    → ProcessAIEngine.analyze(snapshot)
      → returns ProcessAIReport
    → setState({ report })
  → UI renders report
```

### Key architectural principle

The AI analysis engine runs entirely in the frontend. The backend is a **data provider only** — it enumerates processes and returns raw sensor data. The frontend engine performs all analysis, classification, insight generation, and recommendation creation. This preserves the separation between data collection and intelligence.

### Existing backend infrastructure (reusable)

| Component | Location | Reuse |
|-----------|----------|-------|
| `psutil` process enumeration | `performance/live_monitor.py` | Pattern reference for psutil usage |
| `psutil` memory info | `performance/memory_optimizer.py` | Pattern reference for memory fields |
| `@register` decorator | `avs_backend.api.registry` | Direct reuse for RPC registration |
| RPC dispatch | `avs_backend.api.rpc_server` | Automatic — just register the handler |
| `psutil` dependency | Already in `requirements.txt` | Direct reuse |

## 6. Target Architecture

### Backend module

New module: `backend/src/avs_backend/process_intelligence/__init__.py`

This module:
- Registers `process_intelligence.scan` RPC
- Uses `psutil` to enumerate all running processes
- Collects process info and sensor data
- Classifies processes (system/windows/user/etc.) using heuristics
- Sanitizes the response (no sensitive paths exposed beyond what's needed for analysis)
- Returns `ProcessEntry[]` in the exact format the frontend expects

### Frontend provider

New file: `apps/pc-optimizer/src/features/process-ai/RpcProcessProvider.ts`

This class:
- Implements `ProcessProvider` interface
- Calls `rpc.raw(RPC_METHODS.PROCESS_INTELLIGENCE_SCAN)` on `scan()`
- Maps the backend response to `ProcessEntry[]`
- Handles errors gracefully

### ViewModel change

`ProcessIntelligenceViewModel.ts`:
- Replace `MockProcessProvider` with `RpcProcessProvider`
- Preserve all existing state management, bootstrap, and scan logic

## 7. RPC Contracts

### `process_intelligence.scan`

**Registration:** `backend/src/avs_backend/process_intelligence/__init__.py`

**Request:** None (no parameters)

**Response (success):**
```json
{
  "ok": true,
  "entries": [
    {
      "info": {
        "pid": 1234,
        "name": "chrome.exe",
        "displayName": "Google Chrome",
        "parentPid": 104,
        "parentName": "explorer.exe",
        "publisher": "Google LLC",
        "description": "Google Chrome",
        "executablePath": "",
        "signatureStatus": "unknown",
        "signatureIssuer": "",
        "launchTime": 1723891200000,
        "priority": "normal",
        "integrityLevel": "high",
        "threadCount": 24,
        "handleCount": 850,
        "windowTitle": "",
        "userAccount": "CurrentUser",
        "isService": false,
        "serviceName": "",
        "isStartupEntry": false,
        "startupEntryName": "",
        "category": "browser",
        "safetyLevel": "safe"
      },
      "sensors": {
        "cpuUsagePercent": 28.4,
        "perCoreUsage": [],
        "memoryMB": 1024,
        "privateMemoryMB": 700,
        "workingSetMB": 1024,
        "virtualMemoryMB": 2048,
        "diskReadMBps": 2.5,
        "diskWriteMBps": 1.8,
        "gpuUsagePercent": 0,
        "vramMB": 0,
        "networkDownloadMbps": 0,
        "networkUploadMbps": 0,
        "powerDrawEstimateW": 8.5
      }
    }
  ],
  "count": 145,
  "scanDurationMs": 230
}
```

**Response (failure):**
```json
{
  "ok": false,
  "error": "Failed to enumerate processes: ..."
}
```

### Privacy contract

The response must NOT expose:
- Full executable paths for non-system processes (set to `""` for third-party processes; system processes may show `C:\Windows\System32\...` since this is not user-sensitive)
- Registry keys
- Browser profile paths
- Internal storage paths
- Credential stores
- Environment variables

The response MAY expose:
- Process names, PIDs, display names
- Publisher/signature information (from Windows digital signatures)
- Resource sensor data (CPU, memory, disk, network)
- Process classification (category, safety level)
- Parent process info
- Thread/handle counts
- Launch time
- User account name (already visible in Task Manager)

### Shared RPC constant

```typescript
// packages/shared/src/rpc/index.ts
PROCESS_INTELLIGENCE_SCAN: 'process_intelligence.scan',
```

## 8. Data Models

### Backend → Frontend mapping

The backend returns `ProcessEntry[]` which maps directly to the frontend `ProcessEntry` type:

| Frontend field | Backend source | psutil source | Notes |
|----------------|---------------|---------------|-------|
| `info.pid` | `proc.pid` | `proc.pid` | Direct |
| `info.name` | `proc.name()` | `proc.info['name']` | Direct |
| `info.displayName` | Derived from name | Heuristic | Strip `.exe`, use description if available |
| `info.parentPid` | `proc.ppid()` | `proc.ppid()` | Direct |
| `info.parentName` | `parent.name()` | `parent.info['name']` | Direct |
| `info.publisher` | Signature check or empty | Win32 API or `""` | Best-effort |
| `info.description` | `proc.exe()` description or name | Win32 API or name | Best-effort |
| `info.executablePath` | Sanitized | `proc.exe()` | Empty for non-system processes |
| `info.signatureStatus` | Win32 signature check | Win32 API | Best-effort, default `"unknown"` |
| `info.signatureIssuer` | Win32 signature check | Win32 API | Best-effort, default `""` |
| `info.launchTime` | `proc.create_time()` | `proc.create_time()` | Unix timestamp → ms |
| `info.priority` | `proc.nice()` | `proc.nice()` | Map to enum |
| `info.integrityLevel` | Win32 API or heuristic | Win32 API | Default `"high"` |
| `info.threadCount` | `proc.num_threads()` | `proc.num_threads()` | Direct |
| `info.handleCount` | `proc.num_handles()` | `proc.num_handles()` | Direct (Windows) |
| `info.windowTitle` | Not collected | — | Empty string |
| `info.userAccount` | `proc.username()` | `proc.username()` | Direct |
| `info.isService` | Check if service | `psutil` or Win32 | Best-effort |
| `info.serviceName` | Service name if service | Win32 | Best-effort |
| `info.isStartupEntry` | Check startup entries | Registry check | Best-effort, default `false` |
| `info.startupEntryName` | Startup entry name | Registry check | Best-effort, default `""` |
| `info.category` | Heuristic classification | Name/path-based | See classification rules |
| `info.safetyLevel` | Heuristic | Category-based | See safety rules |
| `sensors.cpuUsagePercent` | `proc.cpu_percent()` | `proc.cpu_percent()` | Direct |
| `sensors.perCoreUsage` | Not available per-process | — | Empty array `[]` |
| `sensors.memoryMB` | `proc.memory_info().rss / 1048576` | `proc.memory_info()` | Bytes → MB |
| `sensors.privateMemoryMB` | `proc.memory_info().private / 1048576` | `proc.memory_info()` | Bytes → MB |
| `sensors.workingSetMB` | Same as memoryMB | — | Same as RSS |
| `sensors.virtualMemoryMB` | `proc.memory_info().vms / 1048576` | `proc.memory_info()` | Bytes → MB |
| `sensors.diskReadMBps` | `proc.io_counters().read_bytes / 1048576` | `proc.io_counters()` | Bytes → MB (cumulative, rate estimated) |
| `sensors.diskWriteMBps` | `proc.io_counters().write_bytes / 1048576` | `proc.io_counters()` | Bytes → MB (cumulative, rate estimated) |
| `sensors.gpuUsagePercent` | Not available via psutil | — | `0` |
| `sensors.vramMB` | Not available via psutil | — | `0` |
| `sensors.networkDownloadMbps` | Not reliably per-process | — | `0` |
| `sensors.networkUploadMbps` | Not reliably per-process | — | `0` |
| `sensors.powerDrawEstimateW` | Estimated from CPU usage | Heuristic | `cpuUsagePercent * 0.3` (rough estimate) |

### Process classification heuristics

| Category | Rule |
|----------|------|
| `system` | PID 4 (System), 0 (Idle), or name in `["System", "Idle", "Registry", "smss.exe"]` |
| `windows` | Path starts with `C:\Windows\` and publisher is Microsoft |
| `microsoft` | Publisher contains "Microsoft" but not in Windows directory |
| `browser` | Name in `["chrome.exe", "msedge.exe", "firefox.exe", "brave.exe", "opera.exe", "vivaldi.exe"]` |
| `development` | Name in `["code.exe", "devenv.exe", "idea64.exe", "pycharm64.exe", "node.exe"]` |
| `security` | Name in `["MsMpEng.exe", "SecurityHealthService.exe", "avp.exe", "ekrn.exe"]` |
| `updater` | Name contains "update" or "updater" |
| `driver` | Name ends with `.sys` or is a known driver host |
| `gaming` | Name in known game processes |
| `user_application` | Has a window title or is in user's app directories |
| `background` | No window, low CPU, not a service |
| `unknown` | Default if no rule matches |

### Safety level heuristics

| Safety level | Rule |
|--------------|------|
| `critical_system` | Category is `system` or process is essential Windows service |
| `safe` | Signed by Microsoft or known publisher, category is `windows`/`microsoft`/`browser`/`development` |
| `review_recommended` | Unsigned or unknown publisher, non-system |
| `avoid` | Known malware name or invalid signature |

## 9. Security

### Security invariants preserved

All 18 security invariants from SC-8C10 through SC-8C14 remain intact:

1. `scan_core` internals frozen — NO changes to `scan_core/`
2. `SafetyGate` unchanged — NO changes
3. `RemediationCoordinator` unchanged — NO changes
4. Executors unchanged — NO changes
5. No new ActionType values
6. No automatic destructive execution
7. No automatic remediation
8. No automatic approval
9. No automatic rollback
10. No automatic resume
11. No sensitive remediation state in browser storage
12. Backend remains authoritative for security-sensitive information
13. RPC responses must not expose sensitive filesystem paths
14. No browser storage of sensitive state
15. Explicit approval for destructive operations
16. Immutable planning
17. Backend-authoritative ActionPlans
18. No bypass of SafetyGate

### Process Intelligence security posture

Process Intelligence is an **observability/analysis feature**. It must NOT:
- Terminate processes
- Modify process priorities
- Start/stop services
- Modify registry entries
- Execute any system changes
- Trigger remediation
- Call any executor
- Call RemediationCoordinator
- Call SafetyGate
- Access scan_core

The backend RPC is **read-only**. It enumerates processes using `psutil` and returns data. No mutations.

### Process enumeration safety

- Use `psutil.process_iter()` with error handling for `NoSuchProcess`, `AccessDenied`, `ZombieProcess`
- Never crash if a process disappears mid-scan
- Skip processes that cannot be accessed (AccessDenied)
- Limit to a reasonable maximum (e.g., 500 processes) to prevent DoS from process flooding

## 10. Privacy

### What the RPC exposes

| Field | Exposed? | Rationale |
|-------|----------|-----------|
| Process name | YES | Already visible in Task Manager |
| PID | YES | Already visible in Task Manager |
| Display name | YES | Human-readable name |
| Parent PID/name | YES | Already visible in Task Manager |
| Publisher | YES | From digital signature, public information |
| Description | YES | From executable metadata, public |
| Executable path | **SANITIZED** | Empty for non-system processes; system paths OK |
| Signature status | YES | Public security information |
| CPU/memory/disk sensors | YES | Already visible in Task Manager |
| Thread/handle counts | YES | Already visible in Task Manager |
| User account | YES | Already visible in Task Manager |
| Launch time | YES | Already visible in Task Manager |
| Category/safety level | YES | AI classification, not raw system data |

### What the RPC does NOT expose

- Full filesystem paths for user applications
- Registry keys
- Browser profile paths
- Environment variables
- Command-line arguments (may contain secrets)
- Network connection details (IPs, ports)
- File handles
- DLL lists
- Memory contents

### Command-line arguments

**IMPORTANT:** `psutil` can provide `proc.cmdline()` which may contain secrets, passwords, or file paths. The RPC must NOT include command-line arguments in the response.

## 11. Concurrency

### Backend

- Process enumeration is a single-threaded operation (psutil iteration)
- The RPC handler is called from the RPC server's thread pool (8 workers)
- No shared state between concurrent scan requests
- Each scan is independent and stateless
- No locking required

### Frontend

- The ViewModel creates a single `RpcProcessProvider` instance
- Only one scan can be in progress at a time (UI disables the "Scan Now" button during scan)
- `ProcessScanner.scan()` is async and returns a single snapshot
- No polling is active by default (the UI uses manual "Scan Now")
- On unmount, `dispose()` cleans up the provider

### Stale response prevention

- The ViewModel's `isScanning` flag prevents concurrent scans
- If the component unmounts during a scan, `dispose()` is called
- State updates after dispose are harmless (ViewModel is no longer observed)

## 12. Performance

### Backend

- `psutil.process_iter()` with a single 0.1s CPU baseline sleep (same pattern as existing `live_monitor.py`)
- Memory info fetched only for processes that pass the filter
- Target: complete scan in < 500ms for typical process count (100-200 processes)
- Maximum process limit: 500 (configurable)
- No GPU/network per-process queries (not available via psutil)

### Frontend

- No polling by default (manual "Scan Now" button)
- No unnecessary re-renders (existing React.memo on dashboard components)
- Lazy-loaded route (already implemented)
- Engine analysis runs in-memory, no network calls
- Single RPC call per scan

### What NOT to optimize

- Do not add polling (not in scope)
- Do not add caching (not needed for manual scan)
- Do not add WebSocket/SSE (not needed)
- Do not add background scanning (not needed)

## 13. Error Handling

### Backend errors

| Error | Response | Behavior |
|-------|----------|----------|
| `psutil` not available | `{ "ok": false, "error": "psutil not available" }` | Frontend shows error state with retry |
| Process enumeration fails | `{ "ok": false, "error": "..." }` | Frontend shows error state with retry |
| Individual process access denied | Skip process, continue scan | Partial results returned |
| Individual process disappeared | Skip process, continue scan | Partial results returned |
| Timeout (> 5s) | Return partial results with `partial: true` metadata | Frontend displays available data |

### Frontend errors

| Error | Behavior |
|-------|----------|
| RPC call fails | `bootstrap` state → `error`, show error state with retry button |
| RPC returns `ok: false` | `bootstrap` state → `error`, show error message |
| RPC returns malformed data | `bootstrap` state → `error`, show "Invalid response from backend" |
| RPC returns empty entries | `bootstrap` state → `ready`, show empty state ("No processes found") |
| Scan fails after bootstrap | `isScanning` → `false`, `bootstrapError` set, show error inline |

## 14. Testing

### Backend tests

File: `backend/tests/test_process_intelligence.py`

| Test | Description |
|------|-------------|
| `test_scan_rpc_is_registered` | RPC is registered in the registry |
| `test_scan_returns_ok` | Response has `ok: true` |
| `test_scan_returns_entries` | Response has `entries` array |
| `test_scan_entries_have_required_fields` | Each entry has `info` and `sensors` with required fields |
| `test_scan_does_not_expose_commandline` | No `cmdline` field in response |
| `test_scan_does_not_expose_user_paths` | `executablePath` is empty for non-system processes |
| `test_scan_handles_no_processes` | Returns empty entries if no processes |
| `test_scan_handles_psutil_error` | Returns `ok: false` on psutil failure |
| `test_scan_is_read_only` | No subprocess, no shutil, no os.remove in function body |
| `test_scan_does_not_call_scan_core` | No scan_core, SafetyGate, RemediationCoordinator references |
| `test_scan_classifies_system_processes` | System processes have `category: "system"` |
| `test_scan_classifies_browser_processes` | Browser processes have `category: "browser"` |
| `test_scan_limits_process_count` | Response respects max process limit |
| `test_scan_includes_scan_duration` | Response has `scanDurationMs` |

### Frontend tests

File: `apps/pc-optimizer/src/features/process-ai/__tests__/ProcessIntelligenceViewModel.test.ts`

| Test | Description |
|------|-------------|
| `test_viewmodel_initial_state` | Initial state is `bootstrap: "idle"` |
| `test_viewmodel_bootstrap_loading` | Bootstrap sets state to `loading` |
| `test_viewmodel_bootstrap_success` | Bootstrap completes with `ready` and report |
| `test_viewmodel_bootstrap_error` | Bootstrap failure sets `error` state |
| `test_viewmodel_scan_updates_report` | Scan updates `report` and `lastScanAt` |
| `test_viewmodel_scan_error` | Scan failure sets error |
| `test_viewmodel_uses_rpc_provider` | ViewModel uses `RpcProcessProvider`, not `MockProcessProvider` |
| `test_viewmodel_dispose_cleans_up` | Dispose cleans up provider |

File: `apps/pc-optimizer/src/features/process-ai/__tests__/ProcessIntelligencePage.test.tsx`

| Test | Description |
|------|-------------|
| `test_page_renders_loading_state` | Shows loading state during bootstrap |
| `test_page_renders_error_state` | Shows error state with retry button |
| `test_page_renders_dashboard` | Shows dashboard with report data |
| `test_page_renders_empty_state` | Shows empty state when no data |
| `test_page_scan_button_triggers_scan` | Clicking "Scan Now" triggers scan |
| `test_page_scan_button_disabled_during_scan` | Button disabled during scan |

### Integration tests

File: `apps/pc-optimizer/src/features/process-ai/__tests__/processIntelligenceIntegration.test.ts`

| Test | Description |
|------|-------------|
| `test_rpc_provider_returns_entries` | RpcProcessProvider returns ProcessEntry[] from mocked RPC |
| `test_rpc_provider_handles_error` | RpcProcessProvider handles RPC error |
| `test_rpc_provider_handles_empty` | RpcProcessProvider handles empty response |
| `test_rpc_provider_handles_malformed` | RpcProcessProvider handles malformed response |
| `test_end_to_end_flow` | Full flow: provider → scanner → engine → report |

## 15. Acceptance Criteria

1. `process_intelligence.scan` RPC is registered and callable
2. RPC returns real process data from `psutil` (not hardcoded)
3. RPC response matches `ProcessEntry[]` format
4. RPC does not expose command-line arguments
5. RPC does not expose user filesystem paths for non-system processes
6. RPC is read-only (no subprocess, no shutil, no os.remove, no scan_core)
7. `RpcProcessProvider` implements `ProcessProvider` interface
8. ViewModel uses `RpcProcessProvider` instead of `MockProcessProvider`
9. Process Intelligence page displays real process data
10. Loading state shows during bootstrap
11. Error state shows on RPC failure with retry button
12. Empty state shows when no processes returned
13. "Scan Now" button triggers a new scan
14. "Scan Now" button is disabled during scan
15. All backend tests pass
16. All frontend tests pass
17. All integration tests pass
18. Typecheck passes
19. Lint passes (0 warnings)
20. Production build passes
21. Full frontend suite passes (no new failures)
22. Full backend suite passes (no new failures, pre-existing flakes documented)
23. No scan_core modifications
24. No SafetyGate modifications
25. No RemediationCoordinator modifications
26. No executor modifications
27. No new ActionType values
28. No automatic destructive execution
29. No browser storage of sensitive state

## 16. Definition of Done

| Criterion | Status |
|-----------|--------|
| Backend `process_intelligence.scan` RPC created and registered | ☐ |
| Shared `PROCESS_INTELLIGENCE_SCAN` constant added | ☐ |
| `RpcProcessProvider` created and implements `ProcessProvider` | ☐ |
| ViewModel uses `RpcProcessProvider` | ☐ |
| Process Intelligence page displays real data | ☐ |
| All UI states work (loading, error, empty, success) | ☐ |
| Backend tests pass (14+ tests) | ☐ |
| Frontend tests pass (14+ tests) | ☐ |
| Integration tests pass (5+ tests) | ☐ |
| Typecheck passes | ☐ |
| Lint passes (0 warnings) | ☐ |
| Production build passes | ☐ |
| Full frontend suite passes | ☐ |
| Full backend suite passes | ☐ |
| Security audit: no destructive execution, no scan_core changes | ☐ |
| Privacy audit: no command-line args, no user paths exposed | ☐ |
| SC-8C15 final report created | ☐ |
| SC-8C16 NOT started | ☐ |

## 17. Exactly 3 Implementation Phases

### Phase 1 — Backend Integration + Contract Completion

- Create `backend/src/avs_backend/process_intelligence/__init__.py`
- Implement `process_intelligence.scan` RPC using `psutil`
- Add `PROCESS_INTELLIGENCE_SCAN` constant to `packages/shared/src/rpc/index.ts`
- Implement process classification heuristics
- Implement privacy sanitization (no cmdline, no user paths)
- Add backend tests (`test_process_intelligence.py`)
- Verify RPC is registered and callable
- **Exit criteria:** Backend RPC returns real process data in correct format, all backend tests pass

### Phase 2 — Frontend Integration + End-to-End Workflow

- Create `RpcProcessProvider.ts` implementing `ProcessProvider`
- Update `ProcessIntelligenceViewModel.ts` to use `RpcProcessProvider`
- Verify all UI states (loading, error, empty, success)
- Verify "Scan Now" button works with real backend
- Add ViewModel tests
- Add Page tests
- Add integration tests
- **Exit criteria:** Process Intelligence page displays real backend data, all frontend tests pass, end-to-end workflow functional

### Phase 3 — Final Validation + Production Hardening

- Run full frontend suite
- Run full backend suite
- Run typecheck, lint, build
- Security audit (no destructive execution, no scan_core changes)
- Privacy audit (no cmdline, no user paths)
- Concurrency audit (no stale state, no duplicate requests)
- Performance validation (scan completes in < 500ms)
- Regression audit (SC-8C10 through SC-8C14 invariants intact)
- Remove dead code directly related to SC-8C15 (e.g., `MockProcessProvider` if no longer referenced)
- Create `SC8C15_PHASE3_FINAL_PRODUCTION_READINESS_AUDIT.md`
- **Exit criteria:** All validation passes, production-ready, SC-8C15 COMPLETE

## 18. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `psutil` CPU measurement adds latency | Medium | Low | Use single 0.1s baseline sleep (existing pattern) |
| Some processes return AccessDenied | High | Low | Skip inaccessible processes, return partial results |
| Process classification heuristics are imperfect | Medium | Low | Classification is advisory only, not used for destructive actions |
| GPU/network sensors are zero (psutil limitation) | Certain | Low | Engine handles zero values gracefully; UI shows "0" |
| `proc.exe()` may fail for some processes | Medium | Low | Try/except, default to empty string |
| Backend scan takes > 500ms on systems with many processes | Low | Low | Limit to 500 processes, return partial if timeout |
| Frontend test setup requires RPC mocking | Medium | Low | Use existing `rpc.raw` mock pattern from other tests |
| `MockProcessProvider` removal breaks existing engine tests | Low | Medium | Keep `MockProcessProvider` for engine tests; only ViewModel uses `RpcProcessProvider` |

## 19. SC-8C16 Boundary

**SC-8C16 is NOT started.**

No SC-8C16 specification is created. No SC-8C16 requirements are invented. No SC-8C16 implementation is started.

SC-8C15 is strictly scoped to Process Intelligence backend integration. No unrelated features, architecture changes, or future phases are introduced.

---

**End of SC-8C15 Specification**
