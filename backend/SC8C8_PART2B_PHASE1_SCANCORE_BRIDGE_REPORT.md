# SC-8C8 Part 2B Phase 1 — Scan-Core Bridge & ScanView Integration Report

## Summary

This phase exposed the existing `ScanOrchestrator` through the `avs_backend.scan_core_rpc` JSON-RPC bridge and rewired the frontend `features/scan` UI to call the new `scan_core.scan.*` methods. No remediation, preview/approve/execute/rollback, or dashboard redesign was implemented.

## Files Changed

### Backend

- `backend/src/avs_backend/scan_core_rpc/__init__.py`
  - Added lazy `ScanOrchestrator` singleton (`_scan_orchestrator`, `get_scan_orchestrator()`).
  - Shared the same `app_dir/metadata.db` path used by `RemediationCoordinator`.
  - Created `RuleRegistry()`, imported `register_junk_rules` from `avs_backend.scan_core.rules.detection.junk_rules` and registered all junk rules.
  - Added in-memory session tracking: `_scan_sessions`, `_scan_session_lock`, background `Thread` per scan.
  - Implemented RPC handlers for:
    - `scan_core.scan.quick`
    - `scan_core.scan.full`
    - `scan_core.scan.cancel`
    - `scan_core.scan.status`
    - `scan_core.scan.result`
  - Background scan `on_progress` safely updates `_scan_sessions[scan_id]['progress']`.
  - On completion, stores `ScanResult.to_dict()` under the session and marks `completed`.

- `backend/tests/test_sc8c8_part2b_phase1_scan_bridge.py`
  - New focused test suite covering quick/full start, status polling, cancellation, persisted `action_plan_id`, and read-only behavior.

### Shared

- `packages/shared/src/rpc/index.ts`
  - Added `SCAN_CORE_SCAN_QUICK`, `SCAN_CORE_SCAN_FULL`, `SCAN_CORE_SCAN_CANCEL`, `SCAN_CORE_SCAN_STATUS`, `SCAN_CORE_SCAN_RESULT`.

### Frontend (`apps/pc-optimizer`)

- `src/features/scan/scan.service.ts`
  - Removed `orchestratorService` dependency.
  - Now calls `window.avs.rpc.call` with the new `scan_core.scan.*` methods.

- `src/features/scan/useScan.ts`
  - Maps `scan_core.scan.status` `progress` to `UnifiedScanLiveStatus`.
  - Calls `scanService.scan_quick()` / `scan_full()` and polls `scanService.scan_status()`.
  - Calls `scanService.scan_result()` on `completed` to build the `UnifiedScanReport`.
  - `cancelScan` now calls `scanService.cancel_scan(sessionId)` then `reset`.

- `src/features/scan/reportBuilder.ts`
  - Uses new `ScanResult` keys: `findings_count`, `statistics`, `action_plan_id`.
  - Adds `planId` to `UnifiedScanReport`.

- `src/features/unified-scan/unifiedScanTypes.ts`
  - Added optional `planId?: string` to `UnifiedScanReport`.

- `src/features/scan/__tests__/scan.test.tsx`
  - Replaced `orchestratorService` mocks with `window.avs.rpc.call` mock.
  - Verifies `scan_core.scan.quick/full/status/result/cancel` are called and `orchestrator.*` is never invoked.

## RPC Contract

| Method | Params | Response |
|--------|--------|----------|
| `scan_core.scan.quick` | `{ scope?: string[] }` | `{ ok: true, session_id: string, started_at: string }` |
| `scan_core.scan.full` | `{ scope?: string[] }` | `{ ok: true, session_id: string, started_at: string }` |
| `scan_core.scan.cancel` | `{ session_id: string }` | `{ ok: true, cancelled: boolean }` |
| `scan_core.scan.status` | `{ session_id: string }` | `{ ok: true, progress: ScanProgress \| null, completed: boolean, cancelled: boolean, error: string \| null }` |
| `scan_core.scan.result` | `{ session_id: string }` | `{ ok: true, result: ScanResult }` or `{ ok: false, error: string }` |

`ScanProgress.to_dict()` includes `phase`, `current_operation`, `assets_discovered`, `assets_evaluated`, `findings`, `actions_available`, `elapsed_time_ms`, `completion_percent`, `is_cancelled`.

`ScanResult.to_dict()` includes `scan_id`, `scan_type`, `started_at`, `completed_at`, `elapsed_time_ms`, `statistics`, `findings_count`, `findings`, `aggregation_summary`, `priority_summary`, `actionability_summary`, `action_plan_id`, `errors`, `warnings`, `cancelled`.

## Validation Results

### Backend

```bash
cd backend
python -m pytest tests/test_sc8c8_part2b_phase1_scan_bridge.py -q
# 6 passed in 24.35s

python -m pytest -q
# 1235 passed, 14 skipped in 636.97s (0:10:36)
```

### Frontend

```bash
cd apps/pc-optimizer
yarn typecheck  # Done in 32.22s (exit 0)
yarn lint       # Done in 55.13s (exit 0)
yarn build      # Done in 72.63s (exit 0)
```

## Not Implemented (Per Constraints)

- Remediation result/preview/approve/execute/rollback UI.
- Any changes to `scan_core/orchestration/orchestrator.py`, `remediation.py`, `remediation_models.py`, `SafetyGate`, executors, or `orchestrator.__init__.py`.
- SC-8C9 or dashboard redesign.

## Notes

- The `ScanOrchestrator` and `RemediationCoordinator` now share the same `app_dir/metadata.db` database, so action plans created by scans are persisted in one place.
- Scans are read-only: the bridge starts `scan_quick`/`scan_full` and never triggers any executor or destructive operation.
