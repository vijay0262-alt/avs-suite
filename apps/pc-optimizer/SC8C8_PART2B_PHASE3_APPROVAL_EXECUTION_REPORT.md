# SC-8C8 Part 2B Phase 3 — Approval & Execution Report

## Summary

Implemented the explicit approval, live execution, status polling, cancellation, and terminal-state UI for the unified `scan_core.remediation` flow in the AVS PC Optimizer frontend.

The only `scan_core.remediation.execute` call is made from `remediation.service.execute` and triggered exclusively by `useResults.approve` after the user clicks the explicit `Approve & Fix` button. No orchestrator methods, no `security.remediation.execute`, and no `scan_core.remediation.rollback` are involved.

## Files Changed

| File | Change |
|------|--------|
| `apps/pc-optimizer/src/features/scan/types.ts` | Added `ExecutionStatus`, `RemediationExecution`, `RemediationExecutionStatus`, `ExecutionStep`, and the execute/status/cancel response types. Added `request_id` to `RemediationPreview`. |
| `apps/pc-optimizer/src/features/scan/remediation.service.ts` | Added `execute(plan_id, request_id, approval_token, mode)`, `status(execution_id)`, and `cancel(execution_id)`. No rollback. |
| `apps/pc-optimizer/src/features/scan/useResults.ts` | Added approval/execution state (`executionId`, `executionStatus`, `isCancelling`, `hasRequestedExecution` ref). `validate()` now ends at `awaiting_approval`. Added `approve()`, `pollExecution()` (500ms), `cancelExecution()`, and reset logic in `goBack()`. |
| `apps/pc-optimizer/src/features/scan/ValidationPanel.tsx` | Shows explicit `Approve & Fix` section when `validation.valid === true` and `preview` is present; blocked view otherwise. Calls `onApprove` prop. |
| `apps/pc-optimizer/src/features/scan/ExecutionProgressPanel.tsx` | New. Live progress: status, `completed/total`, `failed`, `rejected`, `skipped`, `requires_review`, `cancelled`, `dry_run`, `reason`, and `Cancel` button when non-terminal. |
| `apps/pc-optimizer/src/features/scan/TerminalStatePanel.tsx` | New. Components for `completed`, `partial`, `failed`, `cancelled` terminal states. No rollback button; `Back to Results` only. |
| `apps/pc-optimizer/src/features/scan/ResultsView.tsx` | Wires `onApprove`, `ExecutionProgressPanel`, terminal panels, and error state. |
| `apps/pc-optimizer/src/features/scan/__tests__/results.test.tsx` | Rewrote/extended to cover awaiting approval, explicit Approve & Fix, execute payload, polling, cancel, terminal states, disabled stale plan, double-approval guard, and disallowed-method checks. |
| `apps/pc-optimizer/src/features/scan/__tests__/scan.test.tsx` | Added a full `ScanView` end-to-end test through `scan → review → preview → validate → approve → execute` ensuring `execute` is not called before approval. |
| `apps/pc-optimizer/src/features/scan/index.ts` | Exported new components, hooks, and types. |

## Approval Safety

- `useResults.approve()` requires both `preview` and `validation.valid === true`.
- The guard `hasRequestedExecution` ref prevents more than one `scan_core.remediation.execute` call for the same approval action, even on rapid clicks.
- `ValidationPanel` does not call `execute` directly; it invokes the `onApprove` prop.
- The `Approve & Fix` button is disabled when `validation.valid !== true` or `preview === null`.

## Execution Flow

1. User selects findings and clicks **Review & Remediate** → `scan_core.remediation.prepare`.
2. Preview panel shows plan summary; user clicks **Validate Plan** → `scan_core.remediation.validate`.
3. Validation success sets the `awaiting_approval` step.
4. User clicks **Approve & Fix** → `useResults.approve()` calls `scan_core.remediation.execute` with `mode: 'live'`.
5. On success, `executionId` and `executionStatus` are stored and `step` becomes `executing` (or the terminal status if the backend already returned one).
6. `useEffect` polls `scan_core.remediation.status` every 500ms while `step === 'executing'`.
7. When a terminal status is reported (`completed`, `partial`, `failed`, `cancelled`), polling stops and the corresponding terminal UI is shown.
8. `goBack` clears the execution state and returns to the findings list.

## Cancellation

- `useResults.cancelExecution()` calls `scan_core.remediation.cancel(executionId)` and sets `isCancelling = true`.
- The component continues to poll until the backend reports a terminal state; it does not immediately show `cancelled` unless the status itself indicates so.

## Terminal States

- `TerminalStatePanel` displays `completed`, `partial`, `failed`, and `cancelled` states with counts and safe, non-rollback messages.
- `ExecutionProgressPanel` has the `Cancel` button only while the status is non-terminal.

## Safety / Search

Grep of `apps/pc-optimizer/src/features/scan` confirmed:

- No calls to `orchestrator.optimize` / `orchestrator.fullAsync` / `security.remediation.execute` / `scan_core.remediation.rollback` in source code (only in test assertions).
- No direct filesystem / registry / process deletion patterns beyond test fixture strings and `Set.prototype.delete`.

## Validation

| Command | Result |
|---------|--------|
| `cd apps/pc-optimizer && yarn typecheck` | Pass, `Done in 36.52s` (exit 0) |
| `cd apps/pc-optimizer && yarn lint` | Pass, `Done in 52.65s` (exit 0) |
| `cd apps/pc-optimizer && yarn build` | Pass, `Done in 74.43s` (exit 0) |
| `npx vitest run apps/pc-optimizer/src/features/scan/__tests__/results.test.tsx` | **22 passed** (1.69s) |
| `npx vitest run apps/pc-optimizer/src/features/scan/__tests__/scan.test.tsx` | **17 passed** (3.63s) |
| `cd backend && python -m pytest -q` | **1234 passed, 14 skipped, 1 failed** in 677.68s. The single failure is `tests/test_cleaning_engine.py::test_clean_stress_ten_thousand_files[10000]` (elapsed 25.4s vs 10s threshold) and is unrelated to the scan/remediation UI changes. |

## Stop Condition

The full flow `SCAN → RESULTS → SELECT → PREVIEW → VALIDATE → APPROVAL → EXECUTE → PROGRESS → COMPLETED/PARTIAL/FAILED/CANCELLED` is implemented and tested. Rollback and SC-8C9 were not implemented.
