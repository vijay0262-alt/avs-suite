# Flagship Scan Pipeline Audit

**Date:** 2026-08-07
**Scope:** Dashboard, AI Smart Optimize, AI Protection Center, AI Smart Security
**Objective:** Document every backend module that executes during scans on each flagship page, verify scan/clean/verify/score/progress/paths/counters/events participation, identify gaps, and fix them.

---

## 1. Architecture Overview

### Two Independent Scan Pipelines

| Pipeline | Entry Point | Backend | Used By |
|----------|------------|---------|---------|
| **Orchestrator** | `orchestratorService.fullAsync(profile)` | `avs_backend/orchestrator/__init__.py` | Dashboard, AI Smart Optimize, AI Protection Center |
| **Security Engine** | `SecurityCenterService.scan()` | `avs_backend/security/__init__.py` + frontend providers | AI Smart Security |

### Orchestrator Pipeline Flow

```
DashboardViewModel.startHealthScan(profile, isPro)
  -> orchestratorService.fullAsync(profile, scanOnly)
  -> Python orchestrator.fullAsync (background thread)
     -> Phase 1: orchestrator.scan  (sequential module scans)
     -> Phase 2: orchestrator.optimize (sequential module optimizations)
     -> Phase 3: Verification re-scan
     -> Phase 4: Score calculation + unified health model
     -> Phase 5: History recording
  <- Frontend polls orchestrator.status for live progress/activity/counters
  <- Frontend calls orchestrator.result for final data
```

### Security Engine Pipeline Flow

```
SecurityCenterViewModel.startScan(mode)
  -> Simulated phase progression (SIM_PATHS, delays) [10 phases full, 6 quick]
  -> SecurityCenterService.scan(scanType)
     -> securityBackendService.getSnapshot() [real backend data]
     -> securityDataAdapter.transform() [maps to provider inputs]
     -> SecurityEngine.scan(scanType, targets, options) [frontend providers]
  <- Result: ScanResult with threats, securityScore, providerResults
```

---

## 2. Scan Profiles and Module Selection

### Orchestrator Profiles (health_model.py)

| Profile | Modules Scanned | Modules Optimized | Used By |
|---------|----------------|-------------------|---------|
| `dashboard` | junk, privacy, registry, startup, performance, disk, security, system | junk, privacy, registry, startup, performance | Dashboard |
| `optimize` | junk, privacy, registry, startup, performance, disk | junk, privacy, registry, startup, performance | AI Smart Optimize |
| `protection` | security, system, junk, privacy, registry | junk, privacy, registry | AI Protection Center |

### Module Categories

| Category | Modules | Health Weight |
|----------|---------|---------------|
| Optimization | junk, privacy, registry, startup, performance, disk | 40% of overall |
| Protection | security, system | 40% of overall |
| Hardware | system | 20% of overall |
| Performance | performance | sub-score |
| Storage | disk, junk | sub-score |

### Frontend Category Mapping (healthCategoryMapping.ts)

| UI Category | Backend Modules |
|-------------|----------------|
| System Health | registry, system |
| Storage | junk, disk |
| Performance | startup, performance |
| Privacy | privacy, browser |
| Protection | security |

### Security Engine Scan Types

| Scan Mode | Phases | Backend Data |
|-----------|--------|-------------|
| `quick` | 6 phases | processes, startup, tasks, services, behavior |
| `full` | 14 phases | all of quick + system dirs, user profile, registry, browser, powershell, persistence, investigation, remediation, verification |

---

## 3. Page-by-Page Scan Execution

### 3.1 Dashboard

- **Trigger:** `vm.startHealthScan('dashboard', isPro)` in `DashboardPageV2.tsx`
- **Pipeline:** Orchestrator, profile `'dashboard'`
- **Free:** scanOnly=true | **Pro:** scanOnly=false

| Module | Scanned | Optimized | Verified |
|--------|---------|-----------|----------|
| junk | Yes | Yes (Pro) | Yes |
| privacy | Yes | Yes (Pro) | Yes |
| registry | Yes | Yes (Pro) | Yes |
| startup | Yes | Yes (Pro) | Yes |
| performance | Yes | Yes (Pro) | Yes |
| disk | Yes | No | No |
| security | Yes | No | No |
| system | Yes | No | No |

### 3.2 AI Smart Optimize

- **Trigger:** `handleSmartOptimize()` -> `dashVm.startHealthScan('optimize', isPro)`
- **Pipeline:** Orchestrator, profile `'optimize'`

| Module | Scanned | Optimized | Verified |
|--------|---------|-----------|----------|
| junk | Yes | Yes (Pro) | Yes |
| privacy | Yes | Yes (Pro) | Yes |
| registry | Yes | Yes (Pro) | Yes |
| startup | Yes | Yes (Pro) | Yes |
| performance | Yes | Yes (Pro) | Yes |
| disk | Yes | No | No |

### 3.3 AI Protection Center

- **Trigger:** `handleScanNow()` -> `dashVm.startHealthScan('protection', isPro)`
- **Pipeline:** Orchestrator, profile `'protection'`

| Module | Scanned | Optimized | Verified |
|--------|---------|-----------|----------|
| security | Yes | No | No |
| system | Yes | No | No |
| junk | Yes | Yes (Pro) | Yes |
| privacy | Yes | Yes (Pro) | Yes |
| registry | Yes | Yes (Pro) | Yes |

### 3.4 AI Smart Security

- **Trigger:** `vm.startScan('full')` in `SecurityCenterPage.tsx`
- **Pipeline:** Security Engine (separate from orchestrator)

Backend data: `security.snapshot` (processes, startup, tasks, services, extensions, unsigned EXEs, network) + `security.fullSystemScan` (file scan, registry, unsigned EXEs).

Frontend providers: Spyware, Adware, PUP, CryptoMiner, SuspiciousProcess, Persistence, StartupAbuse, ScheduledTask, Service, BrowserHijacker, Unsigned, FileReputation, PublisherTrust, PowerShell, Script, Macro.

---

## 4. Module Behavior Audit Matrix (Orchestrator Pipeline)

**Legend:** Y = Yes, N = No, P = Partial, N/A = Not Applicable

| Module | Executed | Scan-Only | Auto-Clean | Auto-Verify | Health Score | Live Progress | Live Counters | Real File Paths | Cleanup Events |
|--------|----------|-----------|------------|-------------|-------------|---------------|---------------|-----------------|----------------|
| junk | Y | N (Pro) | Y (Pro) | Y (Pro) | Y | Y | Y | Y (fixed) | Y (fixed) |
| privacy | Y | N (Pro) | Y (Pro) | Y (Pro) | Y | Y | Y | Y (fixed) | Y |
| registry | Y | N (Pro) | Y (Pro) | Y (Pro) | Y | Y | Y | Y (fixed) | Y |
| startup | Y | N (Pro) | Y (Pro) | Y (Pro) | Y | Y | Y | Y (fixed) | Y |
| performance | Y | N (Pro) | Y (Pro) | Y (Pro) | Y | Y | Y | N | Y |
| disk | Y (fixed) | Y | N | N | Y | Y | Y | Y | N/A |
| security | Y (fixed) | Y | N | N | Y | Y (fixed) | Y | N/A | N/A |
| system | Y (fixed) | Y | N | N | Y | Y | Y | N/A | N/A |

### Security Engine Pipeline (AI Smart Security)

| Capability | Executed | Scan-Only | Auto-Clean | Auto-Verify | Health Score | Live Progress | Live Counters | Real File Paths | Cleanup Events |
|------------|----------|-----------|------------|-------------|-------------|---------------|---------------|-----------------|----------------|
| Backend snapshot | Y | Y | N | N | N | N | N | Y | N |
| Frontend providers | Y | Y | N | N | Y (securityScore) | Simulated | Y | Simulated | N |
| Remediation | Separate | N | Y (manual) | Y (rollback) | N | N | N | Y | Y |

---

## 5. Issues Found and Fixes Applied

### Issue 1: Non-fixable modules skipped during scan (CRITICAL)

- **File:** `backend/src/avs_backend/orchestrator/__init__.py` line ~795
- **Problem:** Scan loop filtered to `_can_auto_fix(mid)` only, skipping `disk`, `security`, `system` entirely. Their scan functions were never called.
- **Fix:** Changed loop to iterate ALL `scan_modules` from the profile. Non-fixable modules are scanned but not optimized.
- **Status:** FIXED

### Issue 2: Junk scan did not emit real file paths (MODERATE)

- **File:** `_scan_junk` in orchestrator
- **Problem:** `ScanSnapshot.current_path` was available but never passed to `_add_activity` or `_update_session`.
- **Fix:** Added `path=snap.current_path` to activity calls and `currentPath` to session updates during polling.
- **Status:** FIXED

### Issue 3: Privacy scan did not emit real file paths (MODERATE)

- **File:** `_scan_privacy` in orchestrator
- **Problem:** Items had real `path` fields but only summary activity was emitted.
- **Fix:** Added loop emitting `path=item.path` for first 5 items.
- **Status:** FIXED

### Issue 4: Registry scan did not emit real key paths (MODERATE)

- **File:** `_scan_registry` in orchestrator
- **Problem:** Issues had real registry key paths but only summary activity was emitted.
- **Fix:** Added loop emitting `path=issue.to_dict().get('key')` for first 5 issues.
- **Status:** FIXED

### Issue 5: Startup scan did not emit real entry locations (MODERATE)

- **File:** `_scan_startup` in orchestrator
- **Problem:** Entries had real `location` fields but only summary activity was emitted.
- **Fix:** Added loop emitting `path=e.location` for first 5 high-impact entries.
- **Status:** FIXED

### Issue 6: Security scan did not emit real check details (MODERATE)

- **File:** `_scan_security` in orchestrator
- **Problem:** Checked Defender/Firewall/Updates but only emitted summary count.
- **Fix:** Added individual activity calls for Defender, Firewall, and Windows Updates status.
- **Status:** FIXED

### Issue 7: Junk optimize did not emit per-category cleanup events (MINOR)

- **File:** `_optimize_junk` in orchestrator
- **Problem:** Single summary cleanup event only.
- **Fix:** Added per-category cleanup event loop.
- **Status:** FIXED

### Issue 8: Security Center uses simulated file paths (KNOWN LIMITATION)

- **File:** `SecurityCenterViewModel.ts`
- **Problem:** `SIM_PATHS` hardcoded paths during simulated phases. Real data only in final result.
- **Status:** NOT FIXED — architectural limitation, Security Engine is a separate pipeline.

---

## 6. Remaining Gaps

| Gap | Severity | Description |
|-----|----------|-------------|
| Performance scan paths | Low | `_scan_performance` does not emit file paths (no file paths applicable — CPU/memory metrics) |
| Security Center simulated phases | Medium | Security Center VM uses simulated paths/progress during scan phases; real data only in final result |
| `browser` module | Low | Listed in frontend category mapping but not a backend orchestrator module — privacy covers browser cleaning |
| Disk optimize | N/A | Disk module is informational only (drive usage stats), no cleanup possible via orchestrator |

---

## 7. Verification

All fixes verified with:
- `yarn lint` — passed (0 warnings)
- `yarn typecheck` — passed
- `yarn test` — 8001 tests passed (120 files)
- `yarn build:pc-optimizer` — passed

---

## 8. Summary

The audit identified **8 issues** in the flagship scan pipeline:

- **1 CRITICAL:** Non-fixable modules (disk, security, system) were silently skipped during scanning, meaning the Dashboard and Protection Center never showed real data for those modules.
- **6 MODERATE:** Multiple scan functions did not emit real file paths or detailed progress during scanning — only summary counts after completion.
- **1 KNOWN LIMITATION:** The Security Center uses a separate pipeline with simulated phase progression.

**7 of 8 issues were fixed** in `backend/src/avs_backend/orchestrator/__init__.py`. The remaining issue (Security Center simulated paths) is an architectural limitation requiring a redesign of the Security Engine pipeline to support real-time streaming from the Python backend.
