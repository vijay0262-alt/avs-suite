# SC-8C9 Final Hardening Report

## Summary

SC-8C9 Phases 1–3 are complete. This report documents the final hardening pass that addresses the three MEDIUM findings from `SC8C9_FINAL_INTEGRATION_SECURITY_UX_AUDIT.md`:

- **M1** — Sanitize preview / rollback target display.
- **M2** — Sanitize active scan findings.
- **M3** — Add in-flight guards for `prepare` / `validate`.

No SC-8C10 work was performed. No LOW findings were addressed in this task.

---

## M1 — Sanitize Preview / Rollback Target Display

### Problem

`RemediationCoordinator._build_preview()` exposed `affected_targets` derived from `action.target.to_dict()`, which included `canonical_path`, `asset_id`, `backup_location`, and other raw target fields. `PreviewPanel` fell back to displaying `path`, and `RollbackConfirmationPanel` expected `display_name` that did not exist, rendering `undefined`.

### Fix

- `backend/src/avs_backend/scan_core/orchestration/remediation.py`
  - `_build_preview()` now builds `affected_targets` as `[{ "display_name": ... }]` only.
  - The `display_name` is derived from `rule_id` / `action_type` and contains no file paths, registry keys, browser profile paths, `asset_id`, or `backup_location`.

### Frontend behaviour

- `apps/pc-optimizer/src/features/scan/PreviewPanel.tsx` already reads `display_name` first and only falls back to `path` if missing.
- `apps/pc-optimizer/src/features/scan/RollbackConfirmationPanel.tsx` already reads `display_name`.
- With `display_name` now always present, `PreviewPanel` and `RollbackConfirmationPanel` render safe, human-readable labels.

### Tests

- `apps/pc-optimizer/src/features/scan/__tests__/targetSanitization.test.tsx` (new)
  - `PreviewPanel` renders `display_name`.
  - `PreviewPanel` does not render `canonical_path`, `asset_id`, or `backup_location` even if present.
  - `RollbackConfirmationPanel` renders `display_name`.
  - `RollbackConfirmationPanel` does not render raw paths, `asset_id`, or `backup_location`.
  - String targets still render safely.
- `apps/pc-optimizer/src/features/scan/__tests__/planHydration.test.tsx`
  - Added `remediation preview displays display_name and does not show canonical_path`.

---

## M2 — Sanitize Active Scan Findings

### Problem

`scan_core.scan.result` returned raw `DetectionFinding.to_dict()` with `canonical_path`, `asset_id`, `evidence`, `detected_at`, and other internal fields. `plan_details` was already sanitized, so the two endpoints had inconsistent privacy contracts.

### Fix

- `backend/src/avs_backend/scan_core_rpc/__init__.py`
  - Added `_sanitize_finding_for_frontend()` and `_sanitize_findings_for_frontend()`.
  - `_scan_core_scan_result()` now returns a copied `result` dict whose `findings` list has been sanitized before crossing the RPC boundary.
  - Internal `DetectionFinding.to_dict()` is unchanged, so backend scan processing is not affected.

### Sanitized finding contract

```python
{
    "finding_id": str,
    "display_name": str,
    "rule_id": str,
    "rule_category": str,
    "severity": str,
    "confidence": float,
    "safety": str,
    "reason": str,
    "recommended_action": str,
    "estimated_size": int,
    "is_blocked": bool,
    "requires_review": bool,
    "is_actionable": bool,
    "canonical_path": "",
}
```

Removed fields include `asset_id`, `target`, `backup_location`, `evidence`, `detected_at`, and `source_result`.

### Tests

- `backend/tests/test_sc8c9_final_hardening.py` (new)
  - `test_scan_result_findings_are_sanitized`
  - `test_plan_details_and_scan_result_privacy_are_consistent`
  - `test_remediation_prepare_affected_targets_are_sanitized`
- `apps/pc-optimizer/src/features/scan/__tests__/scan.test.tsx`
  - Updated existing `findings` mocks to use `canonical_path: ""`.
  - Added `active scan results do not display canonical_path or asset_id`.

---

## M3 — Prepare / Validate In-Flight Guards

### Problem

`useResults.prepare()` and `useResults.validate()` had no in-flight guards, allowing rapid double-clicks to issue overlapping RPC calls.

### Fix

- `apps/pc-optimizer/src/features/scan/useResults.ts`
  - Added `isPreparing` / `isValidating` state and `isPreparingRef` / `isValidatingRef` guards.
  - `prepare()` and `validate()` immediately return if the same operation is already in progress.
  - `finally` blocks reset both the ref and the state, whether the call succeeds or fails.
  - Existing `hasRequestedExecution` and `hasRequestedRollback` guards were left unchanged.

- `apps/pc-optimizer/src/features/scan/ResultsView.tsx`
  - Destructured `isPreparing` and `isValidating` from `useResults`.
  - `Review & Remediate` button is disabled and shows `Preparing...` while `isPreparing`.

- `apps/pc-optimizer/src/features/scan/PreviewPanel.tsx`
  - Added `isValidating` prop.
  - `Validate Plan` button is disabled and shows `Validating...` while `isValidating`.

### Tests

- `apps/pc-optimizer/src/features/scan/__tests__/planHydration.test.tsx`
  - `double clicking Review & Remediate calls prepare only once`
  - `validate cannot be re-triggered while already validating`

---

## Files Changed

| File | Change |
|------|--------|
| `backend/src/avs_backend/scan_core/orchestration/remediation.py` | M1: emit safe `display_name` only in `affected_targets` |
| `backend/src/avs_backend/scan_core_rpc/__init__.py` | M2: add `_sanitize_finding_for_frontend` and `_sanitize_findings_for_frontend` to `scan_core.scan.result`; minor type narrowing for safety / confidence |
| `apps/pc-optimizer/src/features/scan/useResults.ts` | M3: in-flight guards and new return values for `isPreparing` / `isValidating` |
| `apps/pc-optimizer/src/features/scan/ResultsView.tsx` | M3: pass and consume `isPreparing` and `isValidating`; disable `Review & Remediate` |
| `apps/pc-optimizer/src/features/scan/PreviewPanel.tsx` | M3: accept `isValidating`; disable `Validate Plan` |
| `apps/pc-optimizer/src/features/scan/__tests__/planHydration.test.tsx` | M1 + M3 regression tests |
| `apps/pc-optimizer/src/features/scan/__tests__/scan.test.tsx` | M2 regression tests |
| `apps/pc-optimizer/src/features/scan/__tests__/targetSanitization.test.tsx` | M1 unit tests (new) |
| `backend/tests/test_sc8c9_final_hardening.py` | M1 + M2 backend regression tests (new) |

---

## Validation Results

### Frontend

| Command | Result |
|---------|--------|
| `cd apps/pc-optimizer && yarn typecheck` | **PASS** |
| `cd apps/pc-optimizer && yarn lint` | **PASS** (0 warnings) |
| `npx vitest run src/features/scan/__tests__/` | **85 passed** |
| `npx vitest run src/features/dashboard/__tests__/ src/features/smart-optimization-ai/__tests__/` | **170 passed** |
| `cd apps/pc-optimizer && yarn build` | **PASS** |

### Backend

| Command | Result |
|---------|--------|
| `cd backend && python -m pytest -q tests/test_sc8c9_final_hardening.py` | **3 passed** |
| `cd backend && python -m pytest -q` | **1250 passed, 14 skipped, 1 failed** |

The single backend full-suite failure was an **unrelated, pre-existing timeout** in `tests/test_sc8c9_phase3_plan_hydration.py::test_plan_details_no_raw_path_data`. It occurred under parallel load and was not reproducible in isolation:

- `cd backend && python -m pytest -q tests/test_sc8c9_phase3_plan_hydration.py` — **4 passed**

No performance thresholds were modified. The stress-test failure known in previous runs did not reappear.

---

## Security Regression Verification

Searches of `apps/pc-optimizer/src/features/scan`, `src/features/dashboard`, and `src/features/smart-optimization-ai` confirmed:

| Pattern | Result |
|---------|--------|
| `orchestrator.fullAsync` / `orchestrator.optimize` | Only in test assertions; no new production usage |
| `security.remediation` | Only in test assertions; no new production usage |
| `child_process` / `subprocess` | Not present in the scan/dashboard production paths |
| `PowerShell` / `reg.exe` | Not present in the scan/dashboard production paths |
| Direct filesystem mutation (`fs.unlink`, `fs.rmdir`, `fs.rm`, `fs.writeFile`) | Not present in the scan feature code |
| `localStorage` / `sessionStorage` for scan/remediation state | `unifiedScanState` remains in-memory; `DashboardViewModel`/`ScanStatePersistence` legacy usage unchanged and not used by the SC-8C9 scan path |

Additional invariants verified:

- No automatic execution is triggered on navigation or mount.
- No automatic rollback is triggered.
- Explicit `Approve & Fix` with a valid `approval_token` is still required for `scan_core.remediation.execute`.
- Stale plans are still rejected by `ActionPlan.is_stale()` and `RemediationCoordinator.execute()`.
- Rejected executions still do not create a fake `execution_id`.
- Duplicate execution protection (`hasRequestedExecution` ref, backend `_is_request_final`) remains intact.

---

## Scope Confirmation

- **No LOW findings were fixed in this task.**
  - `DashboardViewModel` dead scan/optimize methods remain.
  - `ScanStatePersistence` and its misleading comment remain.
  - Duplicate `import uuid` in `scan_core_rpc/__init__.py` remains.
  - Unused `SmartOptimizationExecutionHandler` remains.

- **No SC-8C10 work was started or performed.**

- **No new scan engines, remediation engines, SafetyGate changes, executors, or rules were added.**
