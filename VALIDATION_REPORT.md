# Health Score Verification Engine — Sprint 2 Critical Bug Fix

## Objective

Ensure the Health Score is never estimated or hardcoded. It must always reflect the current system state. Every optimization action must be real, measurable, and verified by a fresh scan.

---

## Audit of Optimization Modules

| Module | Modifies Windows? | Implementation Status | Notes |
|--------|-------------------|----------------------|-------|
| **Junk Cleaner** | Real | Real implementation | `dashboard.optimize.execute` deletes temp files, empties Recycle Bin, removes browser/thumbnail caches, flushes DNS, restarts Explorer. Real `CleaningManager` in backend tracks `filesRemoved`, `bytesRecovered`, `filesSkipped`, `filesFailed` per cleaner. |
| **Startup Manager** | Real | Real implementation | `startup.disable` disables high-impact startup entries. Backup/restore available via `startup.restore`. |
| **Privacy Cleaner** | Real | Real implementation | `privacy.clean` accepts the scanned `PrivacyItem[]` and returns `itemsCleaned`, `spaceFreed`, `errors`. |
| **Registry Cleaner** | Real | Real implementation | `registry.clean` accepts scanned `RegistryIssue[]` and returns `fixed`, `failed`, `backupId`, `errors`. |
| **Performance** | No real action | Placeholder | Dashboard scans metrics and alerts but has no `performance.optimize` RPC. Memory trim in `dashboard.optimize.execute` only iterates processes with `psutil` and does not actually trim. |
| **Disk Analyzer** | No modification | Not applicable | Scans drives and lists large files. Does not delete. |
| **Security Check** | No real action | Placeholder | Scans Defender, Firewall, and Windows Update status. Cannot automatically apply security fixes. |
| **System Information** | No modification | Not applicable | Reads hardware/OS info. Recommends restart but does not reboot. |

### Simulated / Estimated Values Removed

- `DashboardViewModel.executeHealthScanOptimizations` previously added `selected.reduce((s, i) => s + i.recoverableSpace, 0)` to `totalRecovered` and boosted the health score by `selected.length * 6` points.
- That logic has been removed.
- The new flow performs real module actions, then runs `runHealthScan('verify')` to re-scan the system and recalculates health from the fresh data only.

---

## What the New Workflow Does

### Pre-Optimization

- Smart Health Scan runs a real backend scan per module.
- `rawContext` stores the exact scan payloads needed for execution.

### Optimization

- For each selected module the UI calls the real backend method:
  - **junk** → `dashboard.optimize.execute`
  - **privacy** → `privacy.clean` with scanned `items`
  - **startup** → `startup.disable` for each high-impact enabled entry
  - **registry** → `registry.clean` with scanned `issues`
- Failures are captured per-module with `reason` and `errors`.

### Post-Optimization Verification

- `runHealthScan('verify')` forces a fresh scan (the `ScanManager` cache is invalidated by `CleaningManager.execute`, and the scan pool runs again).
- `finishHealthScan('verify')` compares each module's `before` and `after` values and writes the `verification` field.
- Health score is recomputed from the fresh metrics; no artificial boost is applied.

### User-Facing Results

- `HealthScanModal` `complete` step displays:
  - Verified `Health Score` Before → After.
  - Per-module `Before / After / Difference`.
  - Actual number of files deleted, bytes recovered, items removed, entries disabled, or issues fixed.
  - Failure reasons when an action fails.
- The score does **not** increase if a module reports `success: false` or the verification scan shows no improvement.

---

## Developer Verification Mode

- Added to **Settings → Developer**.
- When enabled, every optimization RPC is logged with:
  - `moduleId`, `action`, `rpcMethod`
  - `before` / `after` values
  - `durationMs`
  - `success` / `FAIL` status
- Logs are persisted to `localStorage` and displayed in a table in Settings.

---

## Remaining Placeholders / Future Work

1. **Performance module** does not currently optimize memory. Consider wiring to `EmptyWorkingSet` or `memory_optimizer` if a backend action exists.
2. **Security module** cannot auto-enable Defender / Firewall / install updates. It should remain a report-only module.
3. **System Information** does not reboot the PC. The restart recommendation is informational.
4. **Privacy/Startup/Registry** clean methods could fail silently if the backend returns success but actually does nothing. Backend instrumentation should be reviewed independently.
5. **Windows Update** status in `dashboard` returns `pendingUpdates: 0` as a placeholder because the COM query is too slow. This is a known backend placeholder.

---

## Verification Checklist

- [x] Health Score is never hardcoded/estimated during the health-scan optimization flow.
- [x] Dashboard metrics are refreshed automatically after optimization (`loadMetrics`).
- [x] Before / After / Difference is shown for every selected module.
- [x] Failures are displayed with reasons and do not inflate the score.
- [x] Developer mode exposes RPC and action logs.
- [x] `yarn lint` passes.
- [ ] `npm run build` passes (run as final step).
