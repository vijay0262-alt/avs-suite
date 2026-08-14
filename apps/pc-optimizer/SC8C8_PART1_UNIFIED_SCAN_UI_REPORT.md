# SC-8C8 Part 1 — Unified Scan UI Report

## 1. Files Changed / Created

### New `apps/pc-optimizer/src/features/scan/` feature

| File | Purpose |
|------|---------|
| `scan.service.ts` | Real backend bridge to `orchestratorService`; exposes `scan`, `scan_quick`, `scan_full`, `cancel_scan`, `status`, `result`. All `fullAsync` calls use `scanOnly: true`. |
| `useScan.ts` | Domain hook that owns the `sessionId` ref, polls `scanService.status` every 500ms, and maps real `OrchestratorStatus` to the unified scan state. |
| `reportBuilder.ts` | Pure helper `buildScanReport(moduleName, result, status)` that returns a `UnifiedScanReport` with no remediation actions. |
| `moduleConfigs.ts` | Re-exports `OPTIMIZE_SCAN_CONFIG` and `SECURITY_SCAN_CONFIG`, and adds `PROTECTION_SCAN_CONFIG` for the AI Protection Center. |
| `ScanView.tsx` | Shared scan UI component with a single safe Start Scan button and a `UnifiedScanView` rendering path. |
| `ScanPanel.tsx` | Thin `p-4` panel wrapper around `ScanView`. |
| `index.ts` | Public barrel exports for the new feature. |
| `__tests__/scan.test.tsx` | Vitest + happy-dom + React Testing Library tests for the three modules and the scan-only contract. |

### Page integrations

- `apps/pc-optimizer/src/features/protection-center/components/ProtectionCenterPage.tsx`
  - Replaced the `UnifiedOptimizeFlow` render with `<ScanView module="protection" mode="full" .../>`.
  - Removed the now-unused `UnifiedOptimizeFlow` import.

- `apps/pc-optimizer/src/features/smart-optimization-ai/SmartOptimizationPage.tsx`
  - Replaced the `UnifiedOptimizeFlow` render with `<ScanView module="optimize" mode="quick" .../>`.
  - Updated the main action button text from `Optimize Now` to `Scan & Optimize`.
  - Removed the now-unused `UnifiedOptimizeFlow` import.

- `apps/pc-optimizer/src/features/security-dashboard/SecurityCenterPage.tsx`
  - Replaced the inline `UnifiedSecurityScanProgress` render with `<ScanView module="security" mode="full" .../>`.
  - Removed the now-unused `UnifiedSecurityScanProgress` import.

### Report

- `apps/pc-optimizer/SC8C8_PART1_UNIFIED_SCAN_UI_REPORT.md` (this file).

## 2. Architecture / Components Reused

- `useUnifiedScan` from `features/unified-scan/useUnifiedScan.ts` manages the visual scan lifecycle (phase tracking, counters, tree nodes, start/complete/cancel/error).
- `UnifiedScanView` from `features/unified-scan/components/UnifiedScanView.tsx` renders the active scan, error, and complete states consistently.
- `UnifiedScanModuleConfig`, `UnifiedScanReport`, `UnifiedScanAction`, etc. are reused from `features/unified-scan/unifiedScanTypes.ts`.
- `orchestratorService` from `features/orchestrator/orchestrator.service.ts` is the only RPC entry point; the new `scan.service.ts` wraps it.

## 3. Shared Components Created

- `ScanView` — the single component used by Protection Center, Smart Optimization, and Security Center. It:
  - Selects the correct `UnifiedScanModuleConfig` by module.
  - Calls `useScan({ mode, config })`.
  - Shows a Start Scan card in `idle`.
  - Renders `UnifiedScanView` for `preparing` / `scanning` / `paused` / `error` / `complete`.
  - Passes a single non-destructive close action to `UnifiedScanView`.
- `ScanPanel` — simple `p-4` wrapper for inline/panel usage.
- `useScan` — reusable orchestrator-polling hook.

## 4. Backend Integration

- `scan.service.ts` always calls `orchestratorService.fullAsync(..., true)` so the backend performs a scan-only run and does **not** modify the system.
- `useScan.startScan()` calls `scanService.scan_quick()` for `mode === 'quick'` and `scanService.scan_full()` for `mode === 'full'`.
- The returned `sessionId` is stored in a ref and polled every 500ms via `scanService.status(sessionId)`.
- When the backend reports `phase === 'complete'`, `scanService.result(sessionId)` is fetched and `buildScanReport()` builds the final report.
- When the user cancels, `scanService.cancel_scan(sessionId)` is called and the poll interval is stopped.
- `OptimizationOrchestrator` / `scan_core` were **not** modified.

## 5. Tests

- `__tests__/scan.test.tsx` covers:
  - Rendering `ScanView` for all three modules.
  - Start scan button triggers `orchestratorService.fullAsync` with `scanOnly: true`.
  - Scanning state becomes active.
  - `0` issues renders a complete/no-issues state.
  - `>0` issues renders the issues-found summary.
  - Cancel button calls `orchestratorService.cancel`.
  - Backend errors render the error/retry state.
  - No remediation buttons (`Fix All`, `Optimize Now`, `Quarantine`) are rendered.
  - Full scan mode uses the `protection` profile.

## 6. Validation Results

All validation commands passed:

```text
cd apps/pc-optimizer && yarn typecheck
Done in 35.51s.

```

```text
cd apps/pc-optimizer && yarn lint
Done in 55.06s.
```

```text
npx vitest run apps/pc-optimizer/src/features/scan/__tests__/scan.test.tsx
Test Files  1 passed (1)
     Tests  9 passed (9)
```

```text
cd apps/pc-optimizer && yarn build
Done in 181.82s.
```

```text
cd backend && python -m pytest -q
1222 passed, 14 skipped in 720.77s (0:12:00)
```

No backend files were touched, and the backend test suite is unaffected.

## 7. Limitations / Known Items

- The page-level `dashVm.startHealthScan` and `SecurityCenterViewModel` scan helpers may still trigger a parallel `orchestratorService.fullAsync` in the existing view models. The new `ScanView` does its own `useScan` start, so at runtime the old and new orchestrator sessions can overlap. Per the task instructions, the UI wiring was done with minimal page changes rather than rewriting the view models.
- `buildScanReport` produces a safe, close-only action; no remediation actions are emitted by design.
