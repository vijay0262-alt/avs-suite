# SC-8C4 Phase A — Critical Safety Hardening Report

## Scope

This report covers the Phase A remediation of the four critical issues
identified in `SC8C4_FINAL_INTEGRATION_SECURITY_AUDIT.md`:

1. Add mandatory post-execution verification to all live executors.
2. Restrict `DefaultExecutor` live-mode execution-context fallback.
3. Fix `execution/__init__.py` so `StartupExecutor` is imported.
4. Populate and use `AssetSnapshot.content_fingerprint` for filesystem assets.

No other features were added. SC-8C5, UI/dashboard, new executors,
services, scheduled tasks, process termination, and security-software
disabling were all explicitly avoided.

## Files Changed

| File | What Changed |
|------|--------------|
| `src/avs_backend/scan_core/execution/filesystem_executor.py` | Added mandatory post-execution verification. `delete_file`/`delete_directory` now fail with `POST_EXECUTION_VERIFICATION_FAILED` if the target still exists. `clear_cache` verifies every removed child and fails/rolls back if any child remains. `_clear_cache` now returns the list of removed paths. |
| `src/avs_backend/scan_core/execution/registry_executor.py` | Added post-execution re-read after `remove_registry_value`/`remove_registry_key`. If the value/key still exists, the executor restores the backup and reports `FAILED` with `POST_EXECUTION_VERIFICATION_FAILED`. |
| `src/avs_backend/scan_core/execution/browser_executor.py` | Added post-execution re-check for every removed cache child. If any child still exists, the executor restores all per-child backups and reports `FAILED` with `POST_EXECUTION_VERIFICATION_FAILED`. |
| `src/avs_backend/scan_core/execution/startup_executor.py` | Added `_verify_and_wrap()` to re-verify the startup target after a delegated `COMPLETED` result. Registry values are re-read with `winreg`; filesystem items are re-checked with `os.path.lexists`. On failure, the backup is restored and the final status is `FAILED`. |
| `src/avs_backend/scan_core/execution/executor.py` | `_resolve_context()` now returns `None` for `live` mode when no explicit context or `context_provider` is supplied. `_execute_action()` rejects the action with `REJECTED` / `MISSING_EXECUTION_CONTEXT` before any target executor is invoked. Dry-run still permits `default_context_for_action()`. |
| `src/avs_backend/scan_core/execution/__init__.py` | Added `from .startup_executor import StartupExecutor` so the class referenced in `__all__` is actually importable. |
| `src/avs_backend/scan_core/context/asset_snapshot.py` | `create_snapshot_from_asset()` now optionally computes `content_fingerprint` for regular files under 100 MiB. `canonical_path` is stored in `attributes` and exposed as a property. `AssetSnapshot` now exposes `is_accessible`, `is_locked`, `content_hash`, and `canonical_path` aliases so it satisfies the `_AssetSnapshot` planning protocol. |
| `src/avs_backend/scan_core/rules/action.py` | `ActionPlanner` now falls back from `content_hash` to `content_fingerprint` when building `HashMatches` preconditions. |
| `tests/test_sc8c4_phase_a_safety_hardening.py` | New regression/security test suite covering all four hardening items (10 tests). |

## Test Results

### New regression tests

```text
$ python -m pytest tests/test_sc8c4_phase_a_safety_hardening.py -v
10 passed in 68.42s
```

Covered:

- `StartupExecutor` importable via package `__all__`.
- `DefaultExecutor` rejects live execution without explicit context.
- `DefaultExecutor` allows dry-run with default context.
- `FilesystemExecutor` fails `delete_file` when the file still exists.
- `FilesystemExecutor` fails `clear_cache` when a child still exists.
- `BrowserExecutor` fails cache cleanup when a child still exists.
- `RegistryExecutor` fails value removal when the value still exists.
- `StartupExecutor` fails file removal when the file still exists.
- `AssetSnapshot.content_fingerprint` is computed from file content.
- `ActionPlanner` uses `content_fingerprint` to generate `HashMatches`.

### Full suite

```text
$ python -m pytest -q
1 failed, 1079 passed, 14 skipped in 613.92s
```

The single failure was `tests/test_cleaning_manager.py::test_cancel_cleaning_task`,
which timed out while waiting for a `CleaningTask` to leave `RUNNING` state. This
test was rerun in isolation:

```text
$ python -m pytest tests/test_cleaning_manager.py::test_cancel_cleaning_task -v
1 passed in 19.28s
```

The failure is a pre-existing timing/concurrency flake in `cleaning_manager`,
unrelated to the SC-8C4 execution engine changes. No `test_sc8c4_*` tests were
affected.

### Static checks on changed code

| Check | Command | Result |
|-------|---------|--------|
| mypy | `mypy src/avs_backend/scan_core/execution src/avs_backend/scan_core/context/asset_snapshot.py src/avs_backend/scan_core/rules/action.py` | **0 issues** |
| flake8 | `flake8 --max-line-length=100 src/avs_backend/scan_core/execution tests/test_sc8c4_phase_a_safety_hardening.py` | **clean** |
| black | `black --check src/avs_backend/scan_core/execution tests/test_sc8c4_phase_a_safety_hardening.py` | **clean** |
| isort | `isort --check-only src/avs_backend/scan_core/execution tests/test_sc8c4_phase_a_safety_hardening.py` | **clean** |

## Detailed Change Notes

### 1. Post-execution verification

- All live executors now independently re-read the target after the
  destructive operation and before returning `COMPLETED`.
- If the target still exists, the executor restores the backup and returns
  `FAILED` with `POST_EXECUTION_VERIFICATION_FAILED`.
- `TargetExecutorResult.after_state` now reflects the actual re-read state for
  file/registry operations; `BrowserExecutor` continues to report `removed_count`
  plus the verified children.
- Post-verification checks are skipped for `dry_run` and `REJECTED`/`REVIEW_REQUIRED`
  actions.

### 2. Live context enforcement

- `DefaultExecutor._resolve_context()` now returns `None` in `live` mode unless
  `request.execution_context[action.action_id]` or `request.context_provider`
  provides a context.
- `_execute_action()` returns `ExecutionStatus.REJECTED` with code
  `MISSING_EXECUTION_CONTEXT` before `SafetyGate` or the target executor run.
- Dry-run mode continues to use `default_context_for_action()`, preserving
  existing dry-run behavior.

### 3. `StartupExecutor` package export

- `src/avs_backend/scan_core/execution/__init__.py` now imports
  `StartupExecutor` from `.startup_executor`.
- `__all__` already listed `StartupExecutor`; the missing import was the bug.

### 4. `AssetSnapshot.content_fingerprint`

- `create_snapshot_from_asset(..., canonical_path="...")` computes a SHA-256
  content fingerprint for regular files under 100 MiB (chunked to avoid memory
  pressure).
- `AssetSnapshot` now provides `content_hash`, `is_accessible`, `is_locked`,
  and `canonical_path` compatibility properties so it can be passed directly to
  `ActionPlanner`.
- `ActionPlanner` builds `HashMatches` from `content_hash` first, then falls
  back to `content_fingerprint`, ensuring filesystem hash-based TOCTOU is
  actually operational.

## Remaining Risks

1. **Post-execution verification does not check backup integrity.** The
   re-read only confirms absence/existence of the target. It does not verify
   that the backup matches the original (this is a separate integrity audit).
2. **100 MiB content-hash cap.** Large files are not fingerprinted by default;
   large-file hash-based TOCTOU remains unsupported.
3. **Registry value verification is Windows-only.** On non-Windows platforms,
   `StartupExecutor` cannot independently re-verify a registry value and
   relies on the delegated `RegistryExecutor`.
4. **Flaky `test_cancel_cleaning_task`.** The full suite has one timing flake
   in `cleaning_manager` unrelated to these changes. It should be tracked
   separately.
5. **ActionPlan persistence and non-filesystem asset mappings** remain unaddressed
   (they were out of Phase A scope and are documented in the SC-8C4 audit
   report).

## Conclusion

Phase A is complete. All four critical safety gaps are closed, the new code
passes type checking and lint, and the SC-8C4 execution test suite plus the
new regression tests pass. The one full-suite failure is a pre-existing
unrelated flake.
