# SC-8C8 Part 2A — RemediationCoordinator Read-Only RPC Bridge

## Summary
Implemented a thin, read-only JSON-RPC bridge that exposes the existing `scan_core.RemediationCoordinator` to the Electron/TypeScript frontend without creating the SC-8C8 Part 2B results UI.

## RPC Methods Exposed

| RPC Method | Coordinator Method | Purpose |
|---|---|---|
| `scan_core.remediation.prepare` | `RemediationCoordinator.prepare(plan_id)` | Returns a `RemediationPreview` with UI-required `approval_token` and full `affected_targets` list. |
| `scan_core.remediation.validate` | `RemediationCoordinator.validate(plan_id)` | Returns a `RemediationValidation` with the embedded `ExecutionSummary` included. |
| `scan_core.remediation.execute` | `RemediationCoordinator.execute(...)` | Executes a plan in `dry_run` or `live` mode and returns an `ExecutionSummary`. |
| `scan_core.remediation.cancel` | `RemediationCoordinator.cancel(execution_id)` | Requests cancellation of a running execution. |
| `scan_core.remediation.status` | `RemediationCoordinator.get_status(execution_id)` | Returns a `RemediationExecutionStatus` snapshot. |
| `scan_core.remediation.rollback` | `RemediationCoordinator.rollback(execution_id)` | Rolls back a completed execution and returns a `RollbackSummary`. |

All methods are registered through `avs_backend.api.registry.register` and return `{'ok': bool, ...}` envelopes so the RPC server never raises into the transport layer.

## Files Changed

- `backend/src/avs_backend/scan_core_rpc/__init__.py` — new module
  - Lazy/safe singleton `_coordinator` with `threading.Lock`
  - `get_coordinator()` — platform-aware app-data directory initialization
  - Six `@register`-decorated RPC handlers
  - Serialization helpers: `preview_to_dict`, `validation_to_dict`, `status_to_dict`, `rollback_to_dict`
- `backend/src/avs_backend/api/rpc_server.py`
  - Added `"avs_backend.scan_core_rpc"` to `_FEATURE_MODULES`
  - Added `"scan_core": "avs_backend.scan_core_rpc"` to `_explicit` prefix map
- `packages/shared/src/rpc/index.ts`
  - Added `SCAN_CORE_REMEDIATION_*` constants to `RPC_METHODS`
- `backend/tests/test_sc8c8_part2a_rpc_bridge.py` — focused integration tests
- `backend/SC8C8_PART2A_REMEDIATION_RPC_BRIDGE_REPORT.md` — this report

## Serialization Contract

### `preview_to_dict(preview: RemediationPreview)`
Manually built from the dataclass to include the fields the UI needs but the native `to_dict()` omits:
```json
{
  "request_id": "<uuid>",
  "plan_id": "<uuid>",
  "approval_token": "<uuid>",
  "total_actions": 3,
  "action_types": {"delete_file": 3},
  "affected_targets": [{...}, ...],
  "estimated_size": 12,
  "safety_state_counts": {"planned": 3},
  "fixability_counts": {"auto_fixable": 3},
  "backup_required": true,
  "rollback_supported": true,
  "warnings": [],
  "is_stale": false,
  "generated_at": "2026-08-15T..."
}
```

### `validation_to_dict(validation: RemediationValidation)`
Starts with `validation.to_dict()` and then adds:
```json
{
  "summary": {
    "execution_id": "...",
    "request_id": "...",
    "status": "completed",
    ...
  }
}
```
`summary` is `None` when the coordinator does not produce one.

### `status_to_dict(status: RemediationExecutionStatus)`
Direct pass-through: `status.to_dict()`.

### `rollback_to_dict(summary: RollbackSummary)`
Direct pass-through: `summary.to_dict()`.

### `execute` response
Returns `{'ok': True, 'summary': <ExecutionSummary.to_dict()>`.

## Security Boundaries

- The bridge is read-only with respect to the `scan_core` source files; no modifications were made to `remediation.py` or `remediation_models.py`.
- `approval_token` is generated and returned by `prepare`; `execute` with `mode='live'` refuses to run unless a token is supplied (enforced by the coordinator itself and the `mode` parameter validation in the handler).
- All handlers catch exceptions and return `{'ok': False, 'error': '...'}` instead of crashing the RPC server.
- `get_coordinator()` logs initialization failures and returns `None`, causing handlers to return a safe coordinator-unavailable error.
- The module computes the app data path from `LOCALAPPDATA`/`APPDATA` (Windows) or `XDG_DATA_HOME` (other platforms), matching the convention in `scan_core/context/scan_context.py`.

## Tests

`backend/tests/test_sc8c8_part2a_rpc_bridge.py` covers:
1. `scan_core.remediation.prepare` returns `approval_token` and a list of `affected_targets`.
2. `scan_core.remediation.validate` returns `valid` and includes `summary`.
3. `scan_core.remediation.execute` with `mode='live'` requires and consumes an `approval_token`, deletes files, and returns an `ExecutionSummary` dict.
4. `scan_core.remediation.cancel`/`status` round-trip.
5. `scan_core.remediation.rollback` restores deleted files and returns a `RollbackSummary` dict.
6. Unknown method returns a safe `{'ok': False, 'error': '...'}` response.
7. Every method result is `json.dumps`-serializable.

## Validation Results

- `cd backend && python -m pytest tests/test_sc8c8_part2a_rpc_bridge.py -q`  
  **7 passed in 61.99s**
- `cd backend && python -m pytest -q`  
  **1229 passed, 14 skipped in 558.97s (0:09:18)**
- `cd apps/pc-optimizer && yarn typecheck`  
  **Done in 35.85s (exit 0)**
- `cd apps/pc-optimizer && yarn lint`  
  **Done in 48.43s (exit 0)**
- `cd apps/pc-optimizer && yarn build`  
  **Done in 62.18s (exit 0)**

## Limitations

- This is Part 2A only: the RPC bridge is in place but no SC-8C8 Part 2B UI was created.
- No new rules, executors, target types, or SafetyGate changes were made.
- `scan_core.remediation.execute` does not expose a `cancellation_token` on the wire; callers can request cancellation post-hoc via `scan_core.remediation.cancel`.
- The bridge intentionally does not fabricate additional fields beyond what `RemediationCoordinator` and its models already provide.
