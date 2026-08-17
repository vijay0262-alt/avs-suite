# SC-8C15 Phase Plan — Process Intelligence Backend Integration

## Overview

SC-8C15 is executed in exactly **3 implementation phases**. No additional phases are created.

```
Phase 1 → Phase 2 → Phase 3 → FINAL PRODUCTION READY
```

---

## Phase 1 — Backend Integration + Contract Completion

### Objective

Create the backend `process_intelligence.scan` RPC that enumerates real system processes and returns them in the `ProcessEntry[]` format the frontend expects.

### Work items

1. **Create backend module**
   - File: `backend/src/avs_backend/process_intelligence/__init__.py`
   - Register `process_intelligence.scan` RPC via `@register`
   - Use `psutil` to enumerate processes
   - Collect process info (pid, name, parent, threads, handles, launch time, user)
   - Collect sensor data (CPU, memory, disk I/O)
   - Classify processes using heuristics (system, windows, browser, development, etc.)
   - Assign safety levels (critical_system, safe, review_recommended, avoid)
   - Sanitize response (no command-line args, no user filesystem paths)
   - Handle errors gracefully (NoSuchProcess, AccessDenied, ZombieProcess)
   - Limit to 500 processes max
   - Return `{ ok, entries, count, scanDurationMs }`

2. **Add shared RPC constant**
   - File: `packages/shared/src/rpc/index.ts`
   - Add: `PROCESS_INTELLIGENCE_SCAN: 'process_intelligence.scan'`

3. **Create backend tests**
   - File: `backend/tests/test_process_intelligence.py`
   - Tests: registration, response format, privacy sanitization, read-only verification, error handling, classification, process limit

### Exit criteria

- [ ] `process_intelligence.scan` RPC is registered and callable
- [ ] RPC returns real process data from `psutil`
- [ ] RPC response matches `ProcessEntry[]` format
- [ ] RPC does not expose command-line arguments
- [ ] RPC does not expose user filesystem paths for non-system processes
- [ ] RPC is read-only (no subprocess, no shutil, no os.remove, no scan_core)
- [ ] All backend tests pass
- [ ] Shared RPC constant exists

### Files created

| File | Purpose |
|------|---------|
| `backend/src/avs_backend/process_intelligence/__init__.py` | Backend RPC module |
| `backend/tests/test_process_intelligence.py` | Backend tests |

### Files modified

| File | Change |
|------|--------|
| `packages/shared/src/rpc/index.ts` | Add `PROCESS_INTELLIGENCE_SCAN` constant |

### Files NOT modified

- `backend/src/avs_backend/scan_core/` — FROZEN
- `backend/src/avs_backend/scan_core_rpc/` — NOT touched
- Any executor — NOT touched
- Any frontend file — NOT touched in Phase 1

---

## Phase 2 — Frontend Integration + End-to-End Workflow

### Objective

Connect the existing Process Intelligence UI to the real backend by replacing `MockProcessProvider` with `RpcProcessProvider`, and verify the complete user workflow.

### Work items

1. **Create RpcProcessProvider**
   - File: `apps/pc-optimizer/src/features/process-ai/RpcProcessProvider.ts`
   - Implement `ProcessProvider` interface
   - `scan()` calls `rpc.raw(RPC_METHODS.PROCESS_INTELLIGENCE_SCAN)`
   - Map backend response to `ProcessEntry[]`
   - Handle `ok: false` responses
   - Handle malformed responses
   - Handle empty entries

2. **Update ViewModel**
   - File: `apps/pc-optimizer/src/features/process-ai/ui/ProcessIntelligenceViewModel.ts`
   - Replace `MockProcessProvider` with `RpcProcessProvider`
   - Preserve all existing state management, bootstrap, and scan logic
   - Preserve error handling and state transitions

3. **Add frontend tests**
   - File: `apps/pc-optimizer/src/features/process-ai/__tests__/ProcessIntelligenceViewModel.test.ts`
   - File: `apps/pc-optimizer/src/features/process-ai/__tests__/ProcessIntelligencePage.test.tsx`
   - File: `apps/pc-optimizer/src/features/process-ai/__tests__/processIntelligenceIntegration.test.ts`
   - Tests: initial state, bootstrap loading/success/error, scan, RPC provider usage, page rendering (loading/error/empty/dashboard), scan button, end-to-end flow

4. **Verify UI states**
   - Loading state during bootstrap
   - Error state with retry button on RPC failure
   - Empty state when no processes returned
   - Success state with real data
   - "Scan Now" button triggers new scan
   - Button disabled during scan
   - Navigation works
   - No sensitive information rendered

### Exit criteria

- [ ] `RpcProcessProvider` implements `ProcessProvider` interface
- [ ] ViewModel uses `RpcProcessProvider` instead of `MockProcessProvider`
- [ ] Process Intelligence page displays real backend data
- [ ] Loading state shows during bootstrap
- [ ] Error state shows on RPC failure with retry button
- [ ] Empty state shows when no processes returned
- [ ] "Scan Now" button triggers a new scan
- [ ] "Scan Now" button is disabled during scan
- [ ] All frontend tests pass
- [ ] All integration tests pass
- [ ] Typecheck passes
- [ ] Lint passes (0 warnings)

### Files created

| File | Purpose |
|------|---------|
| `apps/pc-optimizer/src/features/process-ai/RpcProcessProvider.ts` | RPC-backed process provider |
| `apps/pc-optimizer/src/features/process-ai/__tests__/ProcessIntelligenceViewModel.test.ts` | ViewModel tests |
| `apps/pc-optimizer/src/features/process-ai/__tests__/ProcessIntelligencePage.test.tsx` | Page tests |
| `apps/pc-optimizer/src/features/process-ai/__tests__/processIntelligenceIntegration.test.ts` | Integration tests |

### Files modified

| File | Change |
|------|--------|
| `apps/pc-optimizer/src/features/process-ai/ui/ProcessIntelligenceViewModel.ts` | Replace MockProcessProvider with RpcProcessProvider |

### Files NOT modified

- `ProcessIntelligencePage.tsx` — NOT modified (UI is complete)
- `ProcessAIEngine.ts` — NOT modified (engine is complete)
- `ProcessScanner.ts` — NOT modified (scanner is complete)
- `ProcessManager.ts` — NOT modified (manager is complete)
- `types.ts` — NOT modified (types are complete)
- Any backend file — NOT touched in Phase 2

---

## Phase 3 — Final Validation + Production Hardening

### Objective

Perform comprehensive final validation, security/privacy audit, regression testing, and production-readiness verification. Create the final audit report.

### Work items

1. **Full regression validation**
   - Run full frontend suite (`npx vitest run`)
   - Run full backend suite (`python -m pytest`)
   - Run typecheck (`npm run typecheck`)
   - Run lint (`npm run lint`)
   - Run production build (`npm run build`)
   - Document pre-existing intermittent failures

2. **Security audit**
   - Verify no destructive execution introduced
   - Verify no subprocess/shutil/os.remove in `process_intelligence` module
   - Verify no scan_core modifications
   - Verify no SafetyGate modifications
   - Verify no RemediationCoordinator modifications
   - Verify no executor modifications
   - Verify no new ActionType values
   - Verify no automatic remediation
   - Verify all 18 security invariants intact

3. **Privacy audit**
   - Verify no command-line arguments in RPC response
   - Verify no user filesystem paths exposed for non-system processes
   - Verify no browser storage of sensitive state
   - Verify no sensitive process information leaked

4. **Concurrency audit**
   - Verify no stale response can overwrite newer state
   - Verify no duplicate requests during scan
   - Verify proper cleanup on unmount/navigation

5. **Performance validation**
   - Verify scan completes in < 500ms for typical process count
   - Verify no unnecessary polling
   - Verify no rendering bottlenecks

6. **Dead code cleanup**
   - Remove `MockProcessProvider` from `ProcessIntelligenceViewModel.ts` ONLY if no longer referenced by any test or production code
   - Do NOT remove `MockProcessProvider` if engine tests still use it
   - Do NOT remove any unrelated code

7. **Create final report**
   - File: `apps/pc-optimizer/SC8C15_PHASE3_FINAL_PRODUCTION_READINESS_AUDIT.md`
   - Include: executive summary, files created/modified/deleted, RPC contract, security audit, privacy audit, concurrency audit, performance validation, regression results, definition of done, SC-8C16 boundary

### Exit criteria

- [ ] Full frontend suite passes (no new failures)
- [ ] Full backend suite passes (no new failures, pre-existing flakes documented)
- [ ] Typecheck passes
- [ ] Lint passes (0 warnings)
- [ ] Production build passes
- [ ] Security audit: 18/18 invariants PASS
- [ ] Privacy audit: PASS
- [ ] Concurrency audit: PASS
- [ ] Performance validation: scan < 500ms
- [ ] Dead code cleanup: only SC-8C15-related dead code removed
- [ ] Final report created
- [ ] SC-8C16 NOT started

### Files created

| File | Purpose |
|------|---------|
| `apps/pc-optimizer/SC8C15_PHASE3_FINAL_PRODUCTION_READINESS_AUDIT.md` | Final audit report |

### Files potentially modified

| File | Change |
|------|--------|
| `apps/pc-optimizer/src/features/process-ai/ui/ProcessIntelligenceViewModel.ts` | Remove MockProcessProvider class if no longer needed |

### Files NOT modified

- No production code changes unless fixing a genuine issue discovered during validation
- No architecture changes
- No new features

---

## Phase Summary

| Phase | Duration estimate | Files created | Files modified | Exit state |
|-------|-------------------|---------------|----------------|------------|
| Phase 1 | Backend + tests | 2 | 1 | Backend RPC works |
| Phase 2 | Frontend + tests | 4 | 1 | End-to-end works |
| Phase 3 | Validation + audit | 1 | 0-1 | Production ready |

**Total: 3 phases. No Phase 4, Phase 5, or beyond.**

---

## SC-8C16 Boundary

**SC-8C16 is NOT started.**

No SC-8C16 specification, phase plan, or implementation is created during SC-8C15.

SC-8C16 may only be considered after SC-8C15 is COMPLETE and production-ready, and only with a new Product Owner decision and authoritative specification.

---

**End of SC-8C15 Phase Plan**
