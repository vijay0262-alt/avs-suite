# SC-8C8 Part 2B Phase 2 — Results + Remediation Preview Report

## Goal
After a scan completes, users can review findings, select actionable items, open a read-only remediation preview, and validate the plan. **Execution is explicitly excluded.**

## Files Created

- `apps/pc-optimizer/src/features/scan/remediation.service.ts`
  - Exposes only `prepare(planId)` and `validate(planId)`.
  - Uses `window.avs.rpc.call` with `RPC_METHODS.SCAN_CORE_REMEDIATION_PREPARE` / `VALIDATE`.
  - Does **not** expose `execute`, `cancel`, `status`, or `rollback`.

- `apps/pc-optimizer/src/features/scan/types.ts`
  - Defines `ScanFinding`, `ScanStatistics`, `RemediationPreview`, and `RemediationValidation` shapes.

- `apps/pc-optimizer/src/features/scan/useResults.ts`
  - State: `step`, `selectedIds`, `preview`, `validation`, `error`.
  - Actions: `toggleFinding`, `selectAll`, `clearSelection`, `prepare`, `validate`, `goBack`.
  - Selection restricted to `is_actionable === true` and not `is_blocked` / not `requires_review`.
  - Stops at preview/validation; never calls `execute`.

- `apps/pc-optimizer/src/features/scan/ResultsView.tsx`
  - Header: module name, `findings_count`, actionable/blocked/review/not-fixable counts.
  - No-issues state when `findings_count === 0`.
  - `FindingsList`, `PreviewPanel`, and `ValidationPanel` renders based on `step`.
  - Footer: selected count, `Select All Actionable`, `Clear`, `Review & Remediate` (enabled only with `planId` + actionable selection).

- `apps/pc-optimizer/src/features/scan/FindingsList.tsx`
  - Renders `ScanFindingCard` rows.
  - Visual distinction for actionable, review-required, blocked, and detection-only findings.
  - Checkboxes only on actionable, non-blocked, non-review findings.

- `apps/pc-optimizer/src/features/scan/PreviewPanel.tsx`
  - Read-only display of `total_actions`, `affected_targets`, `estimated_size`, `action_types`, `safety_state_counts`, `fixability_counts`, `backup_required`, `rollback_supported`, and `warnings`.
  - Includes `Validate Plan` and `Back` buttons; no execute.

- `apps/pc-optimizer/src/features/scan/ValidationPanel.tsx`
  - Shows `valid`, `status`, `total/completed/failed/rejected/requires_review`, `warnings`, and `summary`.
  - Displays a clear "Execution is blocked" message when `valid === false`.
  - No `Execute` button.

- `apps/pc-optimizer/src/features/scan/__tests__/results.test.tsx`
  - 10 tests covering no-issues state, selection rules, select-all, clear, `prepare`/`validate` calls, preview display, blocked validation, and the hard execution boundary.

## Files Modified

- `apps/pc-optimizer/src/features/scan/ScanView.tsx`
  - Added `showResults` state and `ResultsView` render path when `scan.step === 'complete'`.
  - `Review & Remediate` action added to `UnifiedScanView` when `planId` is present and issues found.
  - Preserved the `Close` action that resets and calls `onClose`.

- `apps/pc-optimizer/src/features/scan/useScan.ts`
  - Stores the raw `scan.result` and exposes it on `UseScanReturn`.
  - `buildScanReport` still builds `planId` from `result.action_plan_id`.

- `apps/pc-optimizer/src/features/scan/index.ts`
  - Exports new services, hooks, components, and types.

- `apps/pc-optimizer/src/features/scan/__tests__/scan.test.tsx`
  - Added test for `Review & Remediate` action opening the results view.
  - Tested `planId`/`findings` flow.

## Data Flow

1. `useScan` fetches `scan_core.scan.result` when `status.completed === true`.
2. Raw `result` (`findings`, `statistics`, `action_plan_id`) is stored and used to build the `UnifiedScanReport`.
3. When the user clicks `Review & Remediate` on the completed scan summary, `ScanView` switches to `ResultsView`.
4. `ResultsView` uses `useResults` to manage selection and calls `remediationService.prepare(planId)`.
5. On success, `PreviewPanel` is shown; clicking `Validate Plan` calls `remediationService.validate(planId)`.
6. `ValidationPanel` is shown; no further execution step is implemented.

## Safety Boundaries

- `scan_core.remediation.execute` is **never** called.
- `orchestratorService.optimize` and `orchestratorService.fullAsync` are never called.
- No backend safety/prioritization logic is duplicated; UI uses `finding` flags and `preview`/`validation` responses as-is.
- `SafetyGate`, executors, `orchestrator.__init__.py`, and `scan_core` itself were not modified.

## Validation Results

- `cd apps/pc-optimizer && yarn typecheck` — pass, `Done in 34.64s` (exit 0)
- `cd apps/pc-optimizer && yarn lint` — pass, `Done in 43.15s` (exit 0)
- `cd apps/pc-optimizer && yarn build` — pass, `Done in 61.73s` (exit 0)
- `npx vitest run apps/pc-optimizer/src/features/scan/__tests__/results.test.tsx` — **10 passed** (344ms)
- `npx vitest run apps/pc-optimizer/src/features/scan/__tests__/scan.test.tsx` — **16 passed** (3.23s)
- `cd backend && python -m pytest -q` — **1235 passed, 14 skipped** in 658.84s

## Stop Condition

Results, selection, preview, and validation are implemented and tested. No remediation execution logic has been added.
