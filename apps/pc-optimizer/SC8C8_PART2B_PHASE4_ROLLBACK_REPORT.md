# SC-8C8 Part 2B Phase 4 — Rollback & Recovery UI Report

## Summary

Implemented the remediation rollback and recovery UI for `apps/pc-optimizer/src/features/scan` using **only** the existing `scan_core.remediation.rollback` JSON-RPC method. No second rollback mechanism, direct filesystem/registry/browser restoration, `BackupManager`/`RegistryBackup` access, or SC-8C9 logic was added.

## Files Changed

### 1. Types — `apps/pc-optimizer/src/features/scan/types.ts`
- Added `RollbackResult`, `RollbackSummary`, and `RemediationRollbackResponse`.
- Added `RollbackStep` union type (`'idle' | 'confirm' | 'rollbacking' | 'success' | 'partial' | 'failed' | 'unavailable'`).

### 2. Service — `apps/pc-optimizer/src/features/scan/remediation.service.ts`
- Added `rollback(executionId: string): Promise<RemediationRollbackResponse>` to the `RemediationService` interface and implementation, calling `RPC_METHODS.SCAN_CORE_REMEDIATION_ROLLBACK`.

### 3. State Hook — `apps/pc-optimizer/src/features/scan/useResults.ts`
- Added `rollbackStep`, `rollbackSummary`, `rollbackError`, and `isRollbacking` state.
- Added `hasRequestedRollback` ref and `resetRollback`.
- Added `rollbackAvailable()` guard, `initiateRollback()`, `cancelRollback()`, and `confirmRollback()`.
- Returned new state/actions in `UseResultsReturn`.

### 4. UI Components
- `apps/pc-optimizer/src/features/scan/RollbackConfirmationPanel.tsx` (new) — confirmation view for execution ID, completed/total counts, affected targets, and Confirm/Cancel actions.
- `apps/pc-optimizer/src/features/scan/RollbackResultPanel.tsx` (new) — result view for `success`, `partial`, `failed`, and `unavailable` rollback steps.

### 5. Wiring
- `apps/pc-optimizer/src/features/scan/TerminalStatePanel.tsx` — added `onRollback` and `rollbackAvailable` props; renders a `Rollback Changes` button when available.
- `apps/pc-optimizer/src/features/scan/ResultsView.tsx` — renders `RollbackConfirmationPanel`, loading state, `RollbackResultPanel`, and passes `initiateRollback` to `TerminalStatePanel`.
- `apps/pc-optimizer/src/features/scan/index.ts` — exported the two new panels and new types.

### 6. Tests
- `apps/pc-optimizer/src/features/scan/__tests__/results.test.tsx` — updated the disallowed-methods list to remove `SCAN_CORE_REMEDIATION_ROLLBACK` (it is now a legitimate, user-triggered RPC) and kept the remaining security assertions.
- `apps/pc-optimizer/src/features/scan/__tests__/rollback.test.tsx` (new) — 20 focused tests covering partial/failed/cancelled rollback availability, explicit confirmation, correct execution ID, success/partial/failure display, backend conflict handling, rapid-click de-duplication, concurrent-execution prevention, and disallowed method absence.

## Backend Contract

- `scan_core.remediation.rollback` is called with `{ execution_id: string }`.
- The UI respects `preview.rollback_supported` and `executionStatus.completed` before offering or confirming rollback.
- Rollback is only meaningful for terminal execution states where `completed > 0` and `preview.rollback_supported === true`.

## Security Review

Grep of `apps/pc-optimizer/src/features/scan` found:
- No usage of `orchestrator.optimize`, `orchestrator.fullAsync`, `security.remediation.*`, `fs.`, `child_process`, `PowerShell`, `reg.exe`, or `localStorage` for restoration.
- No direct imports of `BackupManager`, `RegistryBackup`, or `SafetyGate`.
- The only rollback RPC invoked is `scan_core.remediation.rollback`.

Matches for the grep were limited to test assertions that verify these APIs are **not** called.

## Validation Results

All required checks were run in `C:\Users\HPBP\Documents\GitHub\avs-suite`:

| Command | Result |
|---|---|
| `cd apps/pc-optimizer && yarn typecheck` | Pass, `Done in 36.00s` (exit 0) |
| `cd apps/pc-optimizer && yarn lint` | Pass, `Done in 49.53s` (exit 0) |
| `cd apps/pc-optimizer && yarn build` | Pass, `Done in 69.77s` (exit 0) |
| `npx vitest run apps/pc-optimizer/src/features/scan/__tests__/results.test.tsx` | **22 passed** (1.59s) |
| `npx vitest run apps/pc-optimizer/src/features/scan/__tests__/scan.test.tsx` | **17 passed** (3.73s) |
| `npx vitest run apps/pc-optimizer/src/features/scan/__tests__/rollback.test.tsx` | **20 passed** (1.29s) |
| `cd backend && python -m pytest -q` | **1235 passed, 14 skipped** in 677.61s |

## Notes

- Some `act(...)` warnings appear in `rollback.test.tsx` for the rapid-click test; these are warnings only and the test suite passes.
- The `clean_stress_ten_thousand_files` threshold was not modified.
