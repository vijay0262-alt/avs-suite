# SC-8C4 Part 1 — Safe Remediation Execution Engine Foundation

## Executive Summary

This part delivers the execution-engine foundation for the AVS SHIELD remediation pipeline. It introduces an immutable, dry-run-first executor that sits downstream of `ActionPlan` and `SafetyGate` and produces `ExecutionResult` / `ExecutionSummary` records. No destructive system operations are implemented or performed.

Key outcomes:

- `ActionPlan → SafetyGate → Execution Engine → ExecutionResult` pipeline established.
- `DefaultExecutor` with SafetyGate-mandatory execution, dry-run default, deterministic ordering, failure isolation, cancellation, and idempotency.
- Immutable execution models: `ExecutionRequest`, `ExecutionResult`, `ExecutionSummary`, `ExecutionError`, `ExecutionLedger`, `CancellationToken`.
- Typed execution-time context contracts: `FilesystemContext`, `RegistryContext`, `BrowserContext`.
- Stub target executors: `FilesystemExecutor`, `RegistryExecutor`, `BrowserExecutor`, `StartupExecutor`.
- 24 new tests covering dry-run, SafetyGate integration, preconditions, cancellation, failure isolation, deterministic order, idempotency, performance (10,000 actions), and security invariants.
- Validation: `pytest -q`, `mypy`, `flake8`, `black --check`, `isort --check-only` are clean on the new code.

## Scope and Boundaries

This part is explicitly foundation-only. The following are NOT implemented or connected:

- Real file deletion (`os.remove`, `os.unlink`, `shutil.rmtree`).
- Real registry writes.
- Real browser-data modification.
- Real process termination.
- Junk Cleaner, Registry Cleaner, Browser Cleaner, Startup Manager integrations.
- Dashboard/UI changes.
- SC-8C4 Part 2 or beyond.

## Files Added / Modified

### New execution package

- `src/avs_backend/scan_core/execution/__init__.py`
- `src/avs_backend/scan_core/execution/models.py`
- `src/avs_backend/scan_core/execution/context.py`
- `src/avs_backend/scan_core/execution/executor.py`
- `src/avs_backend/scan_core/execution/ledger.py`
- `src/avs_backend/scan_core/execution/target_executors.py`

### New tests

- `tests/test_sc8c4_part1_execution_engine.py`

### Existing files (SC-8C3 Part 4) — unchanged

- `src/avs_backend/scan_core/rules/action.py`
- `src/avs_backend/scan_core/rules/safety_gate.py`
- `src/avs_backend/scan_core/rules/action_preconditions.py`
- `src/avs_backend/scan_core/rules/action_path_validation.py`
- `src/avs_backend/scan_core/rules/action_registry_validation.py`

## 1. Executor Contract

The executor is built around immutable dataclasses.

### ExecutionStatus

Enum covering the full lifecycle:

- `PLANNED`
- `DRY_RUN`
- `APPROVED`
- `REJECTED`
- `SKIPPED`
- `FAILED`
- `COMPLETED`
- `REQUIRES_REVIEW`
- `CANCELLED`

### ExecutionError

```python
@dataclass(frozen=True)
class ExecutionError:
    code: str
    message: str
    details: dict[str, Any]
```

### ExecutionResult

Every action produces one `ExecutionResult` with:

- `execution_id`
- `action_id`
- `finding_id`
- `asset_id`
- `action_type`
- `target` (snapshot)
- `status`
- `reason`
- `timestamp`
- `error` (optional)
- `verification` (precondition pass/fail list)
- `dry_run_info` (what would happen)

### ExecutionSummary

Batch-level summary:

- `execution_id`, `request_id`, `status`
- `total`, `completed`, `failed`, `rejected`, `skipped`, `requires_review`, `cancelled`, `dry_run`
- `results: tuple[ExecutionResult, ...]`
- `started_at`, `completed_at`
- `ledger` (idempotency record)
- `reason`

### ExecutionRequest

Immutable request:

- `plan: ActionPlan`
- `request_id: str`
- `mode: str` (`"dry_run"` default, or `"live"`)
- `safety_gate: Optional[SafetyGate]`
- `execution_context: dict[str, dict[str, Any]]`
- `context_provider: Optional[Callable[[Any], dict[str, Any]]]`
- `cancellation_token: Optional[CancellationToken]`

## 2. Executor Interface

A protocol and default implementation ensure no action can bypass the SafetyGate.

```python
@runtime_checkable
class Executor(Protocol):
    def execute(self, request: ExecutionRequest) -> ExecutionSummary: ...
```

`DefaultExecutor.execute` performs the following pipeline for every action:

1. Stale plan check (rejects the whole plan if `ActionPlan.is_stale()` is True).
2. Deterministic sort by `(priority_score desc, action_id asc)`.
3. Cancellation check before every action.
4. Idempotency check against `ExecutionLedger`.
5. Resolve execution context (per-action override, provider, or safe default).
6. Evaluate typed preconditions and capture verification.
7. Invoke `SafetyGate.evaluate(action, context, plan_metadata)`.
8. Only if `APPROVED`, route to a stub `TargetExecutor`.
9. Record the `ExecutionResult` in the ledger.
10. Continue on failure (one failed action does not crash the batch).

The executor never trusts the planner alone: it re-evaluates identity, path, preconditions, and freshness at execution time.

## 3. Dry-Run Mode

`mode="dry_run"` is the default. In this mode:

- No file deletion.
- No registry write.
- No browser data modification.
- No subprocess or PowerShell.
- The engine returns exactly what would happen.

The `dry_run_info` map contains:

- `operation` (action type)
- `target` (serialized target)
- `context_snapshot` (safe subset of live state)

The stub `BaseTargetExecutor` is the only thing that builds `dry_run_info`; it never invokes destructive APIs. A source-invariant test scans `target_executors.py` for forbidden terms such as `os.remove`, `os.unlink`, `shutil.rmtree`, `subprocess`, `winreg.Delete`.

## 4. Live Execution Architecture (Stubs)

Four stub executors are registered:

- `FilesystemExecutor` — `delete_file`, `delete_directory`, `clear_cache`
- `RegistryExecutor` — `remove_registry_value`, `remove_registry_key`
- `BrowserExecutor` — `clear_browser_cache`
- `StartupExecutor` — `disable_startup_entry`

Each returns a `TargetExecutorResult` with `ExecutionStatus.DRY_RUN` for the stub and no destructive work. When `mode="live"` is requested in Part 1, `DefaultExecutor` marks the action `APPROVED` but does not perform the operation, preserving the contract for future phases.

## 5. Target Re-Verification

Execution-time context is provided through:

### FilesystemContext

- `exists`, `accessible`, `locked`
- `canonical_path`, `asset_id`
- `size`, `modified_time`, `content_hash`
- `symlink`, `junction`, `reparse_point`
- `safety_level`

### RegistryContext

- `hive`, `key`, `value`
- `key_exists`, `value_exists`, `value_type`

### BrowserContext

- `browser`, `profile`
- `running`
- `cache_type`, `cache_scope`

The `DefaultExecutor` supports injection via `execution_context[action_id]` or a `context_provider(action)` callable, allowing tests and future real resolvers to supply values without changing the executor.

## 6. Cancellation

`CancellationToken` is a cooperative token. The executor checks it:

- Before every action in the loop.
- Through `raise_if_cancelled` where applicable.

A cancelled batch records `CANCELLED` results for all remaining actions and returns a `CANCELLED` summary. Already completed actions remain in the `ExecutionLedger`.

## 7. Execution Order

Actions are deterministically sorted:

```python
sorted_actions = sorted(request.plan.actions, key=lambda a: (-a.priority_score, a.action_id))
```

No reliance on `dict` or `set` ordering.

## 8. Failure Isolation

Each action runs in its own `try/except`. A raised exception produces a `FAILED` `ExecutionResult` with an `ExecutionError` and the batch continues. This is tested by injecting an exception in the `context_provider` for one action and verifying the remaining actions still return `DRY_RUN`.

## 9. Idempotency

`ExecutionLedger` records every `action_id → ExecutionRecord`. Before executing an action the executor checks the ledger. Re-executing the same `action_id` in a second batch yields `SKIPPED` results, even though the plan is otherwise identical.

The ledger is an in-memory contract; persistence is deferred to a later phase.

## 10. Security Guarantees

- No destructive APIs in the new source.
- `SafetyGate` is mandatory; the executor cannot be constructed to skip it.
- Dry-run is the default; `live` mode is non-destructive in Part 1.
- Stale plans are rejected at the executor entry point.
- `ActionPlan` action counts and preconditions are re-evaluated against execution-time context.
- `BLOCKED`, `NOT_FIXABLE`, `REVIEW_REQUIRED`, and `UNKNOWN` action states flow through the SafetyGate and are never `DRY_RUN`/`COMPLETED`.
- Protected paths (e.g., `C:\Windows\System32`) injected into the execution context are rejected even if the action is `PLANNED`, proving the gate cannot be bypassed at scale.

## 11. Tests

`tests/test_sc8c4_part1_execution_engine.py` adds 24 tests covering:

- Executor contract and result structure
- Dry-run default and live-mode non-destructive behavior
- SafetyGate rejection, review, stale plan, and large-plan bypass-proof
- Precondition failures: missing target, locked target, identity mismatch, changed size, changed hash
- Cancellation before and between actions
- Failure isolation
- Deterministic execution order
- Idempotency / duplicate action detection
- Empty plan
- 10,000-action dry-run performance
- Source-invariant proof of no system-modification calls

## 12. Performance

A `DRY_RUN` plan of 10,000 actions is processed in under 2 seconds (measured on the current platform), covering SafetyGate evaluation, precondition checking, and result generation for every action. Sorting dominates at `O(n log n)`.

## 13. Validation

Focused run:

```
python -m pytest tests/test_sc8c4_part1_execution_engine.py -q
24 passed
```

Type and lint checks:

```
python -m mypy src/avs_backend/scan_core/execution tests/test_sc8c4_part1_execution_engine.py
Success: no issues found in 7 source files

python -m flake8 --max-line-length=100 src/avs_backend/scan_core/execution tests/test_sc8c4_part1_execution_engine.py
(no output)

python -m black --check src/avs_backend/scan_core/execution tests/test_sc8c4_part1_execution_engine.py
All done! 7 files would be left unchanged.

python -m isort --check-only src/avs_backend/scan_core/execution tests/test_sc8c4_part1_execution_engine.py
(no output)
```

Full backend suite:

```
python -m pytest -q
976 passed, 9 skipped in 520.52s (0:08:40)
```

## 14. Remaining Limitations

- Only dry-run / stub execution is active. Real filesystem, registry, and browser operations are not implemented.
- `ExecutionLedger` is in-memory; persistence is a future concern.
- Execution context is injected by the caller; a real provider will need to read live system state safely.
- `RegistryExecutor`, `BrowserExecutor`, and `StartupExecutor` are stubs with no OS integration.
- Live `APPROVED` results do not yet transition to `COMPLETED` because the destructive phase is intentionally excluded from Part 1.

## Conclusion

SC-8C4 Part 1 establishes a safe, dry-run-first execution architecture that respects every Part 4 safety contract. The executor is non-destructive, non-bypassable, deterministic, cancellable, and idempotent, providing the foundation for future real remediation work while keeping destructive capabilities disabled.
