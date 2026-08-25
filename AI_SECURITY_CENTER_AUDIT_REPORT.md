# AVS V1.0 — AI SECURITY CENTER AUDIT REPORT

## Architecture

### Canonical path (ACTIVE — correct)

```
SecurityCenterPage "Scan Now" button
→ Modal open
→ ScanView(module="security", mode="full", autoStart=true)
→ useScan({ config: SECURITY_SCAN_CONFIG })
→ scanService.scan_full()
→ RPC: scan_core.scan.full
→ ScanOrchestrator
  → FilesystemDiscoveryEngine (real filesystem enumeration)
  → DefenderThreatDiscoveryEngine (real Get-MpThreatDetection)
  → RuleRegistry (junk rules + security rules + DefenderConfirmedThreatRule)
  → DetectionAggregator
  → ActionPlanner
  → SafetyGate (authoritative)
  → RemediationCoordinator (quarantine_executor for confirmed threats)
  → Post-action verification
→ RPC: scan_core.scan.status (polled every 500ms)
→ RPC: scan_core.scan.result
→ AutoOptimizeView (auto-cleanup for safe actions)
→ ResultsView (same modal)
→ OptimizationEventBus → Dashboard refresh
```

This path is correct, uses the canonical scan architecture, and shares the same pipeline as Dashboard, Smart Optimization, and Protection Center.

### Legacy paths (ACTIVE — incorrect)

```
SecurityCenterPage
→ SecurityCenterViewModel (constructed on page mount)
→ SecurityCenterService
→ SecurityEngine (frontend-only, 28+ JavaScript providers)
→ SecuritySnapshotBuilder (fabricated security score)
→ Polls every 5 seconds via setInterval
→ Displays: securityScore, activeThreats, scanHistory, providers, capabilities
```

```
SecurityCenterPage → ScanTab
→ ScanIdleView (shows 14 fake scan phases)
→ vm.startScan() (DEAD CODE — never called from UI)
→ Simulated progress with hardcoded SIM_PATHS, PHASE_STATS, delay()
→ SecurityCenterService.runDeepFileScanPhase()
→ generateSimulatedFilePaths() (fake file paths)
```

### Duplicate engines

| Engine | Location | Status |
|--------|----------|--------|
| ScanOrchestrator (canonical) | `backend/src/avs_backend/scan_core/orchestration/` | ACTIVE — correct |
| SecurityEngine (frontend-only) | `apps/pc-optimizer/src/features/security-center/SecurityEngine.ts` | ACTIVE — parallel |
| SecurityCenterService | `apps/pc-optimizer/src/features/security-dashboard/SecurityCenterService.ts` | ACTIVE — parallel |
| SecurityCenterViewModel | `apps/pc-optimizer/src/features/security-dashboard/SecurityCenterViewModel.ts` | ACTIVE — parallel |
| 28+ frontend providers | `apps/pc-optimizer/src/features/security-center/*Provider.ts` | ACTIVE — heuristic |
| Backend security module | `backend/src/avs_backend/security/__init__.py` | ACTIVE — data collection only |

### Detection providers (frontend-only — 28 providers)

| Provider | Classification | Data Source | Real? | Remediation |
|----------|---------------|-------------|-------|-------------|
| SpywareDetectionProvider | SUSPICIOUS | Backend processes + frontend heuristics | Heuristic | `canRemediate: false` |
| AdwareDetectionProvider | SUSPICIOUS | Backend processes + frontend heuristics | Heuristic | `canRemediate: false` |
| PUPDetectionProvider | SUSPICIOUS | Backend processes + frontend heuristics | Heuristic | `canRemediate: false` |
| TrojanDetectionProvider | SUSPICIOUS | Backend processes + frontend heuristics | Heuristic | `canRemediate: false` |
| RansomwareDetectionProvider | SUSPICIOUS | Backend processes + frontend heuristics | Heuristic | `canRemediate: false` |
| KeyloggerDetectionProvider | SUSPICIOUS | Backend processes + frontend heuristics | Heuristic | `canRemediate: false` |
| RootkitDetectionProvider | SUSPICIOUS | Backend processes + frontend heuristics | Heuristic | `canRemediate: false` |
| CryptoMinerDetectionProvider | SUSPICIOUS | Backend processes + frontend heuristics | Heuristic | `canRemediate: false` |
| BrowserHijackerProvider | SUSPICIOUS | Backend browser extensions + frontend heuristics | Heuristic | `canRemediate: false` |
| PersistenceDetectionProvider | SUSPICIOUS | Backend startup/tasks + frontend heuristics | Heuristic | `canRemediate: false` |
| StartupAbuseProvider | SUSPICIOUS | Backend startup entries + frontend heuristics | Heuristic | `canRemediate: false` |
| ScheduledTaskProvider | SUSPICIOUS | Backend scheduled tasks + frontend heuristics | Heuristic | `canRemediate: false` |
| ServiceAnalysisProvider | SUSPICIOUS | Backend services + frontend heuristics | Heuristic | `canRemediate: false` |
| PowerShellDetectionProvider | SUSPICIOUS | Backend processes + frontend heuristics | Heuristic | `canRemediate: false` |
| MacroDetectionProvider | SUSPICIOUS | Frontend heuristics only | Heuristic | `canRemediate: false` |
| ScriptDetectionProvider | SUSPICIOUS | Frontend heuristics only | Heuristic | `canRemediate: false` |
| SuspiciousProcessProvider | SUSPICIOUS | Backend processes + frontend heuristics | Heuristic | `canRemediate: false` |
| UnsignedExecutableProvider | INFORMATIONAL | Backend unsigned executable scan | Real data | `canRemediate: false` |
| FileReputationProvider | INFORMATIONAL | Frontend heuristics only | Heuristic | `canRemediate: false` |
| PublisherTrustProvider | INFORMATIONAL | Frontend heuristics only | Heuristic | `canRemediate: false` |
| NetworkBehaviorProvider | SUSPICIOUS | Backend network connections + frontend heuristics | Heuristic | `canRemediate: false` |
| BehaviorProvider | SUSPICIOUS | Frontend heuristics only | Heuristic | `canRemediate: false` |
| SignatureProvider | UNSUPPORTED | No signature database | Fake | N/A |
| PersistenceProvider | SUSPICIOUS | Frontend heuristics only | Heuristic | `canRemediate: false` |
| BrowserProtectionProvider | SUSPICIOUS | Frontend heuristics only | Heuristic | `canRemediate: false` |
| ReputationProvider | INFORMATIONAL | Frontend heuristics only | Heuristic | `canRemediate: false` |
| ThreatIntelligenceProvider | UNSUPPORTED | No threat intelligence feed | Fake | N/A |
| SecurityDashboardProvider | INFORMATIONAL | Frontend heuristics only | Heuristic | N/A |

### Canonical detection providers (backend — used by ScanView modal)

| Provider | Classification | Data Source | Real? | Remediation |
|----------|---------------|-------------|-------|-------------|
| DefenderConfirmedThreatRule | CONFIRMED | Windows Defender `Get-MpThreatDetection` | Authoritative | QUARANTINE_FILE |
| MaliciousFileNameRule | SUSPICIOUS | Filesystem scan + heuristic | Heuristic | None (not auto-remediated) |
| SuspiciousScriptRule | SUSPICIOUS | Filesystem scan + heuristic | Heuristic | None (not auto-remediated) |
| SuspiciousExecutableRule | SUSPICIOUS | Filesystem scan + heuristic | Heuristic | None (not auto-remediated) |
| TrackingCookieRule | PRIVACY | Filesystem scan + heuristic | Heuristic | None (privacy, not security) |
| Junk rules (temp, cache, etc.) | JUNK | Filesystem scan | Real | DELETE_FILE / CLEAR_CACHE |

### Remediation

- **Canonical path:** SafetyGate → RemediationCoordinator → QuarantineExecutor (for confirmed threats) / DefaultExecutor (for junk). Execution-time revalidation, AVS self-protection, Windows protected-path checks, post-action verification.
- **Legacy path:** RemediationTab has a "Review and Fix" button that converts frontend-only plans to canonical ActionPlans via `scan_core.security_remediation.plan` RPC, then routes through `PlanReviewView` → canonical `scan_core.remediation.*` flow. But the frontend plans have `canRemediate: false` for all threats, so there are no actions to convert.
- **No direct filesystem cleanup, process termination, or registry modification** occurs from the frontend. The frontend-only engine produces `Threat` objects with `canRemediate: false`.

### Verification

- **Canonical path:** Post-action verification checks original path removed + quarantine copy exists + SHA-256 hash match. Hash mismatch triggers rollback.
- **Legacy path:** No verification — frontend-only engine doesn't execute anything.

### Persistence

- **Canonical path:** Quarantine manifest at `%LOCALAPPDATA%\AVS Shield\Quarantine\manifest.json`. Atomic writes, survives restart.
- **Legacy path:** Frontend-only `SecurityRepository` stores snapshots/threats in memory. Lost on page reload.

## Detection

| Category | Real Source | Classification | Remediation | Verified |
|----------|------------|---------------|-------------|----------|
| Confirmed Threats (Defender) | `Get-MpThreatDetection` | CONFIRMED | QUARANTINE_FILE | Yes (post-action hash verification) |
| Suspicious Files | Heuristic rules | SUSPICIOUS | None (not auto-remediated) | N/A |
| Tracking Cookies | Heuristic rules | PRIVACY | None (privacy, not security) | N/A |
| Spyware (frontend) | Frontend heuristics | SUSPICIOUS | None (`canRemediate: false`) | No |
| Trojan (frontend) | Frontend heuristics | SUSPICIOUS | None (`canRemediate: false`) | No |
| Ransomware (frontend) | Frontend heuristics | SUSPICIOUS | None (`canRemediate: false`) | No |
| Keylogger (frontend) | Frontend heuristics | SUSPICIOUS | None (`canRemediate: false`) | No |
| Rootkit (frontend) | Frontend heuristics | SUSPICIOUS | None (`canRemediate: false`) | No |
| Crypto Miner (frontend) | Frontend heuristics | SUSPICIOUS | None (`canRemediate: false`) | No |
| Adware (frontend) | Frontend heuristics | SUSPICIOUS | None (`canRemediate: false`) | No |
| PUP (frontend) | Frontend heuristics | SUSPICIOUS | None (`canRemediate: false`) | No |
| Browser Hijacker (frontend) | Frontend heuristics | SUSPICIOUS | None (`canRemediate: false`) | No |
| Persistence (frontend) | Frontend heuristics | SUSPICIOUS | None (`canRemediate: false`) | No |
| Signature (frontend) | No database | UNSUPPORTED | N/A | No |
| Threat Intelligence (frontend) | No feed | UNSUPPORTED | N/A | No |

**8 security categories are displayed in the UI (`THREAT_CATEGORIES` array) but NONE have authoritative detection sources.** All are heuristic at best, fake at worst.

## Security Actions

- **Confirmed detected:** 0 (Defender disabled on this machine)
- **Secured:** 0
- **Remaining:** 0
- **Failed:** 0
- **Suspicious:** 0 (canonical path) / 58 (frontend-only, on full scan)
- **Unsupported:** 2 providers (SignatureProvider, ThreatIntelligenceProvider) have no real data source

## Score

- **Before:** 100 (fabricated default from `SecuritySnapshotBuilder.computeScores()` — returns 100 when no threats)
- **After:** 100 (no change — no threats detected by frontend engine)
- **Delta:** 0
- **Calculation source:** Frontend-only `SecuritySnapshotBuilder.computeScores()` in `SecuritySnapshot.ts`. Formula: `100 - normalizedThreatScore - riskScore * 0.3 - exposureScore * 0.2`. When no threats: hardcoded 100. This is NOT based on real security posture. The canonical scan_core path does NOT produce a security score.

**Defect:** The security score shown on the page is fabricated. It always shows 100 when no frontend threats are detected, regardless of actual security state (Defender status, real-time protection, etc.).

## Performance

- **Scan duration (canonical):** ~280 seconds (528,812 assets, full scan with Defender discovery)
- **Detection duration (canonical):** Included in scan duration
- **Remediation (canonical):** N/A (no confirmed threats on this machine)
- **Verification (canonical):** N/A (no confirmed threats on this machine)
- **Total (canonical):** ~282 seconds
- **Frontend polling:** Every 5 seconds via `setInterval` in `SecurityCenterViewModel` — calls `SecurityCenterService.getSnapshot()` which returns cached frontend data. Wasteful but low-overhead.
- **Frontend simulated scan:** Dead code (`vm.startScan()` never called from UI)

## UI

- **Single modal:** Yes — "Scan Now" button opens a single Modal with `ScanView(module="security", autoStart=true)`. Scan → detect → auto-clean → results all in same modal.
- **Live progress:** Yes — `useScan` polls `scan_core.scan.status` every 500ms, maps to `UnifiedScanView` with real progress percent, phase, current path.
- **Current path:** Yes — `current_folder` from backend progress surfaced as `currentPath` in `CurrentOperationCard`.
- **Counters:** Yes — `SECURITY_SCAN_CONFIG.counters` includes 12 counters (filesScanned, processesAnalyzed, servicesChecked, registryKeysChecked, browserObjects, scriptsInspected, scheduledTasks, persistenceEntries, threatsFound, suspiciousProcesses, unsignedExecutables, aiConfidence). These are mapped from backend progress in `useScan.mapStatusCounters()`.
- **Results:** Yes — `ResultsView` shows in same modal when scan completes.
- **Dashboard synchronization:** Yes — `OptimizationEventBus` `CleaningCompleted` event refreshes Dashboard after auto-optimization.
- **Tabbed sidebar (legacy):** 7 tabs (Overview, Scan, Threats, Investigation, Remediation, Reports, Settings) display frontend-only data. The Scan tab shows `ScanIdleView` with 14 fake phases. The Threats tab shows frontend-only threats. The Remediation tab shows frontend-only plans.

## Safety

- **Windows protection:** Yes — `validate_filesystem_path()` rejects `C:\Windows`, `C:\Program Files`, `C:\ProgramData`, `%SystemRoot%`, `%ProgramFiles%`, etc. (canonical path)
- **AVS self-protection:** Yes — `_is_avs_path()` in `QuarantineExecutor` rejects `LOCALAPPDATA\AVS Shield` and `LOCALAPPDATA\Programs\Devin` paths. (canonical path)
- **Locked files:** Yes — `_check_file_locked()` via `CreateFileW(GENERIC_DELETE)` probe in `RemediationCoordinator`. (canonical path)
- **Running files:** Yes — locked file check catches running executables. (canonical path)
- **Execution revalidation:** Yes — `RemediationCoordinator._context_provider` re-reads fresh filesystem state before execution. (canonical path)
- **Quarantine:** Yes — `QuarantineExecutor` with path validation, AVS self-protection, TOCTOU re-verification, atomic move, SHA-256 hash verification, manifest persistence, duplicate prevention. (canonical path)
- **Frontend-only path:** No safety concerns — it doesn't execute anything (`canRemediate: false` for all threats).

## Tests

- **Backend:** 1755 passed, 14 skipped, 0 failed (with `--basetemp` outside `%USERPROFILE%\Documents`)
- **Frontend:** 8399 passed, 0 failed, 0 skipped
- **Typecheck:** PASS
- **Lint:** PASS
- **Security regression:** 26 Protection Center tests pass (Defender integration, quarantine, suspicious classification, AVS self-protection, Windows protected paths, duplicate prevention, manifest persistence)
- **Packaged E2E:** Backend builds successfully. Frontend builds successfully. Windows packaged application builds successfully. Defender status RPC correctly reports `disabled`. Full scan with Defender discovery engine works (528,812 assets, 0 errors, correct security counters).

### Test environment note

When pytest runs with the default basetemp inside `C:\Users\HPBP\Documents\GitHub\...`, 85 tests fail because `%USERPROFILE%\Documents` is a forbidden root in `validate_filesystem_path()`. This is NOT a code defect — it's the safety system correctly rejecting paths inside the user's Documents folder. Running with `--basetemp=C:\AVS_test_tmp\pytest-basetemp` resolves all 85 failures.

## Findings

### Defect 1: Parallel frontend-only security engine

- **Root cause:** `SecurityCenterPage` constructs `SecurityCenterViewModel` which constructs `SecurityCenterService` which constructs `SecurityEngine` with 28+ frontend-only providers. This is a completely separate scan/detection engine from the canonical `ScanOrchestrator`.
- **Impact:** The page displays a fabricated security score (always 100), fake threats (empty in production), and fake capabilities. The 7-tab sidebar shows frontend-only data that doesn't reflect real security state. 5-second polling wastes resources.
- **Fix required:** Remove or disable the frontend-only `SecurityEngine`, `SecurityCenterService`, `SecurityCenterViewModel` polling, and all 28+ frontend providers. The page should use the canonical scan_core path exclusively. The security score should come from real backend data (Defender status, scan results, etc.).
- **Test proving the fix:** Verify that `SecurityCenterPage` does not construct `SecurityCenterViewModel` or poll frontend-only services. Verify that the security score is derived from real backend data.

### Defect 2: Fabricated security score

- **Root cause:** `SecuritySnapshotBuilder.computeScores()` returns `securityScore: 100` when no threats are detected by the frontend engine. This is a hardcoded default, not based on real security posture.
- **Impact:** The page always shows "100 / Protected" regardless of actual security state (Defender disabled, real-time protection off, etc.).
- **Fix required:** Remove the fabricated score. If a security score is needed, it should be calculated from real backend data (Defender status, scan results, quarantine state). A scan completing successfully must NOT automatically increase the score.
- **Test proving the fix:** Verify that the security score reflects real Defender status and scan results, not a hardcoded 100.

### Defect 3: Simulated scan progress (dead code)

- **Root cause:** `SecurityCenterViewModel.startScan()` contains hardcoded `SIM_PATHS`, `PHASE_STATS`, `runPhaseSimulation()`, `delay()`, and `generateSimulatedFilePaths()`. This is a fully simulated scan with fake file paths and fake progress.
- **Impact:** Dead code — `vm.startScan()` is never called from the UI. But it's still present and could be accidentally re-enabled. The `ScanIdleView` also shows 14 fake scan phases.
- **Fix required:** Remove `SecurityCenterViewModel.startScan()`, `runPhaseSimulation()`, `SIM_PATHS`, `PHASE_STATS`, `generateSimulatedFilePaths()`, and the `ScanIdleView` fake phase preview. The Scan tab should use the canonical `ScanView` exclusively.
- **Test proving the fix:** Verify that no simulated scan paths or fake progress code exists in the Security Center.

### Defect 4: 8 security categories displayed without real detection

- **Root cause:** `THREAT_CATEGORIES` array in `SecurityCenterPage.tsx` displays 8 categories (Spyware, Malware, Adware, Ransomware, Browser Hijacker, Crypto Miner, Trojans, PUP). None have authoritative detection sources — all are heuristic at best.
- **Impact:** The UI implies antivirus capabilities that AVS does not have. Users may believe their system has been scanned for these specific threat types when it hasn't.
- **Fix required:** Remove categories that don't have real detection sources. A smaller truthful feature set is better than a large fake antivirus feature set. Only show categories backed by the canonical scan_core path (confirmed threats, suspicious items, privacy items).
- **Test proving the fix:** Verify that only categories with real backend detection sources are displayed.

### Defect 5: Frontend-only providers classify heuristics as threats

- **Root cause:** 28+ frontend providers (SpywareDetectionProvider, TrojanDetectionProvider, etc.) run JavaScript heuristics on backend-collected data and produce `Threat` objects. These are labeled as "threats" with severity levels (high, critical) and MITRE ATT&CK mappings, despite being heuristic.
- **Impact:** Frontend heuristics are treated as security detections. The Protection Center correctly classifies heuristics as SUSPICIOUS, but the Security Center's frontend engine still calls them "threats."
- **Fix required:** Remove the frontend-only providers. The canonical scan_core path already has suspicious classification rules that correctly label heuristic findings as SUSPICIOUS, not confirmed threats.
- **Test proving the fix:** Verify that no frontend-only security providers exist.

### Defect 6: 5-second polling of frontend-only engine

- **Root cause:** `SecurityCenterViewModel.startPolling()` calls `this.refresh()` every 5 seconds, which calls `SecurityCenterService.getSnapshot()` → `SecurityEngine.getSnapshot()` — all frontend-only.
- **Impact:** Unnecessary CPU/memory usage. The frontend engine returns cached data, so polling adds no value.
- **Fix required:** Remove the 5-second polling. If real-time data is needed, use the canonical event bus or backend RPC.
- **Test proving the fix:** Verify that no `setInterval` polling exists in the Security Center.

### Defect 7: Backend security module is data-collection only

- **Root cause:** `backend/src/avs_backend/security/__init__.py` provides `security.snapshot`, `security.fullSystemScan`, `security.scan` etc. These collect real system data (processes, services, tasks, etc.) but do NOT detect threats or produce security findings. They feed the frontend-only engine.
- **Impact:** The backend security module creates a false impression of backend threat detection. It collects data but all "detection" happens in frontend JavaScript.
- **Fix required:** Either (a) remove the backend security module if the canonical scan_core path is sufficient, or (b) integrate the data collection into the canonical scan_core discovery engines if the data is genuinely useful. Do not maintain a parallel data collection pipeline.
- **Test proving the fix:** Verify that security data collection is integrated into the canonical scan pipeline or removed.

### Defect 8: ScanTab shows ScanView without autoStart

- **Root cause:** `ScanTab` renders `<ScanView module="security" mode="full" onClose={() => {}} />` when `s.isScanning` is true, but WITHOUT `autoStart={true}`. This means the ScanView shows in idle state inside the tab.
- **Impact:** Confusing UX — the Scan tab shows an idle ScanView when the ViewModel thinks it's scanning.
- **Fix required:** The Scan tab should either use the canonical ScanView with autoStart or be removed entirely in favor of the modal-based scan flow.
- **Test proving the fix:** Verify that the Scan tab uses the canonical scan flow consistently.

## FINAL STATUS

**AI SECURITY CENTER — BLOCKED**

The audit identified 8 defects that must be fixed before AI Security can be verified:

1. **Parallel frontend-only security engine** — must be removed
2. **Fabricated security score** — must be replaced with real backend-derived score
3. **Simulated scan progress (dead code)** — must be removed
4. **8 security categories without real detection** — must be removed or backed by real sources
5. **Frontend-only providers classifying heuristics as threats** — must be removed
6. **5-second polling of frontend-only engine** — must be removed
7. **Backend security module is data-collection only** — must be integrated or removed
8. **ScanTab shows ScanView without autoStart** — must be fixed or removed

The canonical scan path (ScanView modal → scan_core.scan.full → ScanOrchestrator) is correct and shares the same pipeline as Dashboard, Smart Optimization, and Protection Center. The Defender integration, quarantine executor, SafetyGate, and post-action verification are all working correctly.

The blocking issue is the parallel frontend-only architecture that fabricates scores, displays fake categories, and runs heuristic providers in JavaScript. This must be removed before AI Security can be considered verified.

**Do NOT modify Protection Center** — no shared regressions were found. The Protection Center canonical path is correct and verified.
