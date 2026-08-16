# SC-8C8 Final Hardening Report

## Executive Summary

This report documents the remediation of the SC-8C8 audit findings for the `avs-suite` scan and smart-optimization features. The work focused on three areas:

1. **H-1 Rejected execution contract**: the `scan_core.remediation.execute` RPC handler now surfaces rejected executions (stale plan, missing/invalid approval token, duplicate request) as `ok: false` with `status: "rejected"` and a clear `reason`, without fabricating a `summary` or `execution_id`.
2. **Smart Optimization legacy auto-execute removal**: the `SmartOptimizationPage` no longer exposes buttons, toggles, or marketing copy that could trigger or enable one-click/background/scheduled automatic execution. The only actionable scan control is the shared `ScanView` with `buttonLabel="Scan & Optimize"`.
3. **Unused `scan` method**: the duplicate `scan()` method was removed from `scan.service.ts` and the `ScanService` interface, leaving `scan_quick` and `scan_full` as the only entry points.

Validation completed successfully: backend RPC bridge tests, full backend suite, frontend type check, lint, targeted Vitest suites, and production build all pass.

---

## H-1 Before/After Contract

### Before

`scan_core.remediation.execute` returned `{"ok": true, "summary": ...}` for every `ExecutionSummary` produced by `RemediationCoordinator.execute`, including rejected summaries. A rejected execution still carried a fabricated `execution_id` and looked like a successful response, making it impossible for the UI to distinguish stale/missing-token/duplicate cases from real executions.

### After

The `_scan_core_remediation_execute` handler in `backend/src/avs_backend/scan_core_rpc/__init__.py` now inspects `summary.status.value`:

```python
summary = coord.execute(...)
if summary.status.value == "rejected":
    return {
        "ok": False,
        "status": "rejected",
        "reason": summary.reason or "Execution rejected",
    }
return {"ok": True, "summary": summary.to_dict()}
```

Rejected executions are therefore never presented as successful and never include a fake `summary` or `execution_id`.

---

## Files Changed

| File | Change |
|------|--------|
| `backend/src/avs_backend/scan_core_rpc/__init__.py` | Added rejected-contract handling in `_scan_core_remediation_execute`; made `approval_token` optional at the RPC parameter layer so the coordinator can reject missing tokens. |
| `backend/tests/test_sc8c8_part2a_rpc_bridge.py` | Added `test_execute_rejects_stale_plan`, `test_execute_rejects_missing_approval_token`, `test_execute_rejects_invalid_approval_token`. |
| `apps/pc-optimizer/src/features/scan/types.ts` | Added `'rejected'` to `ExecutionStatus` and `ExecutionStep`; extended `RemediationExecuteResponse` with `status?` and `reason?`. |
| `apps/pc-optimizer/src/features/scan/useResults.ts` | Added `'rejected'` to `ResultsStep` and terminal statuses; updated `approve()` to set `step('rejected')` and `error(reason)` on a rejected response without creating an `executionId` or polling. |
| `apps/pc-optimizer/src/features/scan/ValidationPanel.tsx` | `canApprove` now also requires `preview.is_stale !== true`; added a visible stale warning. |
| `apps/pc-optimizer/src/features/scan/ResultsView.tsx` | Added a dedicated `step === 'rejected'` branch with an "Execution rejected" panel and a `Back to Review` button. |
| `apps/pc-optimizer/src/features/scan/scan.service.ts` | Removed the unused `scan()` method and its `ScanService` interface entry. |
| `apps/pc-optimizer/src/features/scan/__tests__/results.test.tsx` | Added tests for rejected stale plan, missing token, valid approval, and no status polling on rejection. |
| `apps/pc-optimizer/src/features/smart-optimization-ai/SmartOptimizationPage.tsx` | Removed `Auto Optimize` button, `Background Optimization` toggle, `Auto-approve Low Risk` toggle, `One-click Auto Optimize` / `Automatic` marketing copy, `lastReport`/`isExecuting` state, `handleExecutePlan`, and the `createExecutionHandler` import. |

---

## Approval Gating

The explicit approval flow is now fully gated:

1. `ResultsView` only shows `Approve & Fix` after validation succeeds.
2. `ValidationPanel` disables the button when `preview.is_stale` is `true` and shows: "Preview is stale. Re-run prepare before approving."
3. `useResults.approve()` does not start polling when the backend responds with `ok: false, status: 'rejected'`; it transitions the UI to the `rejected` step and surfaces the backend `reason`.

---

## Smart Optimization Changes

The `SmartOptimizationPage` remains a scan/review page and no longer contains any production path that calls `orchestrator.optimize`, `dashboardService.executeOptimize`, `registryService.clean`, `performanceService.optimizeMemory`, or the legacy `executionHandler`. Specifically:

- The `Auto Optimize` / `Upgrade to Execute` button and `handleExecutePlan` were removed.
- The `Background Optimization` toggle was removed.
- The `Auto-approve Low Risk` toggle was removed from the configuration grid.
- One-click / automatic execution language was removed from the empty state and upgrade card.
- The `ScanView` with `buttonLabel="Scan & Optimize"` is retained as the only user-facing action.
- `executionHandler.ts` was left in place for test usage but is no longer imported by production code.

---

## `scan` Method Resolution

`apps/pc-optimizer/src/features/scan/scan.service.ts` previously exposed a `scan()` method identical to `scan_quick`. A search for `scanService.scan(` and `\.scan(` in `apps/pc-optimizer/src` showed no production callers. The method and its interface entry were removed; `useScan.ts` continues to call `scanService.scan_quick` or `scanService.scan_full`.

---

## Tests Added

### Backend

- `test_execute_rejects_stale_plan`
- `test_execute_rejects_missing_approval_token`
- `test_execute_rejects_invalid_approval_token`

### Frontend

- `rejected execution leaves step="rejected" and does not poll status`
- `missing approval token rejection renders the rejected panel`
- `valid approval still reaches normal execution completion`

---

## Validation Results

| Command | Result |
|---------|--------|
| `python -m pytest tests/test_sc8c8_part2a_rpc_bridge.py -q` (backend) | 10 passed |
| `python -m pytest -q` (full backend) | 1238 passed, 14 skipped |
| `yarn typecheck` (apps/pc-optimizer) | Passed |
| `yarn lint` (apps/pc-optimizer) | Passed |
| `npx vitest run src/features/scan/__tests__/` | 62 passed |
| `npx vitest run src/features/smart-optimization-ai/__tests__/` | 58 passed |
| `yarn build` (apps/pc-optimizer) | Passed |

`test_clean_stress_ten_thousand_files` did not fail in the full run; no unrelated test required modification.

---

## Security Verification

Grep of `apps/pc-optimizer/src/features/scan` and `apps/pc-optimizer/src/features/smart-optimization-ai` for the following patterns found matches only in test files, not in production code:

- `orchestrator.optimize`
- `orchestrator.fullAsync`
- `security.remediation.execute`
- `security.remediation.rollback`
- `fs.`
- `child_process`
- `PowerShell`
- `reg.exe`
- `localStorage`
- `sessionStorage`

The only `scan_core.*` RPCs used by the affected production code remain:

- `scan_core.scan.quick`
- `scan_core.scan.full`
- `scan_core.scan.status`
- `scan_core.scan.result`
- `scan_core.scan.cancel`
- `scan_core.remediation.prepare`
- `scan_core.remediation.validate`
- `scan_core.remediation.execute`
- `scan_core.remediation.status`
- `scan_core.remediation.cancel`
- `scan_core.remediation.rollback`

No direct filesystem, process, registry, or storage APIs are invoked from the scan or smart-optimization feature code.

---

## Remaining Limitations

- `executionHandler.ts` still exists to support the engine's unit tests; it is no longer referenced from `SmartOptimizationPage.tsx`.
- The `SmartOptimizationPage` auto-generates a plan preview on load, but it no longer triggers any automatic remediation execution.
- `Scheduled Optimization` UI remains as a configuration-only control and is not wired to execute without explicit user approval through the shared `ResultsView` flow.

---

## Conclusion

All requested SC-8C8 hardening items have been implemented and validated. The execution contract is now explicit about rejection, the Smart Optimization page no longer exposes auto-execute paths, and the frontend scan service surface has been reduced to the documented `scan_quick` and `scan_full` methods. Work on SC-8C9 was not started.
