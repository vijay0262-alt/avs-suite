# SC-8C4 Phase A — Critical Safety Hardening Report

## Scope

This report documents the Phase A remediation of the four critical findings
from `SC8C4_FINAL_INTEGRATION_SECURITY_AUDIT.md`:

1. Add mandatory post-execution verification to all live executors.
2. Restrict `DefaultExecutor`'s default execution-context fallback in live mode.
3. Fix `execution/__init__.py` so `StartupExecutor` is actually imported.
4. Make `AssetSnapshot.content_fingerprint` operational for filesystem assets.

No SC-8C5 work, no UI/dashboard changes, and no new executors were added.
SafetyGate, TOCTOU, backup/rollback, cancellation, and idempotency behavior
were preserved.

## Files Changed

| File | Change |
|------|--------|
| `src/avs_backend/scan_core/execution/filesystem_executor.py` | Added post-execution verification for `delete_file`, `delete_directory`, and `clear_cache`. If the target or any removed cache child still exists, the executor restores the backup and returns `FAILED` with `POST_EXECUTION_VERIFICATION_FAILED`. `_clear_cache` now returns the list of removed child paths. |
| `src/avs_backend/scan_core/execution/registry_executor.py` | Added post-execution re-read after `remove_registry_value`/`remove_registry_key`. If the value/key still exists, the backup is restored and the result is `FAILED` with `POST_EXECUTION_VERIFICATION_FAILED`. |
| `src/avs_backend/scan_core/execution/browser_executor.py` | Added post-execution verification for every removed cache child. If any child still exists, the executor restores all per-child backups and returns `FAILED` with `POST_EXECUTION_VERIFICATION_FAILED`. |
| `src/avs_backend/scan_core/execution/startup_executor.py` | Added `_verify_and_wrap()` to re-verify a startup target after the delegated executor returns `COMPLETED`. Registry startup items are re-read with `winreg`; filesystem startup items are re-checked with `os.path.lexists`. On failure the backup is restored and `FAILED` is returned. |
| `src/avs_backend/scan_core/execution/executor.py` | `_resolve_context()` returns `None` in `live` mode unless `request.execution_context` or `request.context_provider` supplies a fresh context. `_execute_action()` rejects the action with `REJECTED` / `MISSING_EXECUTION_CONTEXT` before any target executor is invoked. Dry-run still permits `default_context_for_action()`. |
| `src/avs_backend/scan_core/execution/__init__.py` | Added `from .startup_executor import StartupExecutor` so the name in `__all__` is importable. |
| `src/avs_backend/scan_core/context/asset_snapshot.py` | `create_snapshot_from_asset()` now computes `content_fingerprint` for regular filesystem files under 100 MiB. `canonical_path` is stored in `attributes` and exposed as a property. `AssetSnapshot` now exposes `is_accessible`, `is_locked`, `content_hash`, and `canonical_path` aliases to satisfy the `_AssetSnapshot` planning protocol. |
| `src/avs_backend/scan_core/rules/action.py` | `ActionPlanner` now falls back from `content_hash` to `content_fingerprint` when building `HashMatches` preconditions. |
| `tests/test_sc8c4_phase_a_safety_hardening.py` | New regression/security test suite covering all four fixes (10 tests). |
| `tests/test_sc8c4_part5_startup.py` | Made the top-level `winreg` import conditional so the test module can be collected on non-Windows platforms and skipped by `pytestmark`. |

## Security Fixes Implemented

### 1. Post-execution verification in all live executors

Before returning `ExecutionStatus.COMPLETED`, each live executor now
independently re-reads the target and confirms the intended change actually
occurred:

- **FilesystemExecutor**: `os.path.lexists()` is re-checked for the target
  path after `delete_file`/`delete_directory`; for `clear_cache`, every
  removed child is re-checked.
- **RegistryExecutor**: the target registry value/key is re-read after the
  deletion API call.
- **BrowserExecutor**: every removed cache child is re-checked after
  `_delete_path()`.
- **StartupExecutor**: after delegating to `RegistryExecutor` or
  `FilesystemExecutor`, `_verify_and_wrap()` performs a final check that the
  startup entry is gone.

If verification fails, the executor restores the backup it just created and
returns `FAILED` with code `POST_EXECUTION_VERIFICATION_FAILED`. This closes the
audit finding that a failed remediation could incorrectly be reported as
`COMPLETED`.

### 2. DefaultExecutor live context enforcement

`DefaultExecutor` no longer falls back to `default_context_for_action()` in live
mode. A live action is rejected unless:

- `request.execution_context[action.action_id]` is supplied, or
- `request.context_provider` returns a context for the action.

Dry-run mode still allows `default_context_for_action()` so planning and UI
dry-run workflows continue to work without supplying explicit live state.

### 3. `StartupExecutor` package export

`src/avs_backend/scan_core/execution/__init__.py` now imports
`StartupExecutor` before listing it in `__all__`, preventing an `ImportError` or
broken `from ...execution import *` contract.

### 4. `AssetSnapshot.content_fingerprint` operational

- `create_snapshot_from_asset(..., canonical_path=...)` computes a SHA-256
  content fingerprint for regular files under 100 MiB.
- `AssetSnapshot` exposes `content_hash` (alias to `content_fingerprint`),
  `is_accessible`, `is_locked`, and `canonical_path` so it can be used directly
  by `ActionPlanner`.
- `ActionPlanner` now builds `HashMatches` from `content_hash` if present,
  falling back to `content_fingerprint`, giving `HashMatches` real source data
  for filesystem TOCTOU verification.

## Tests Added

`tests/test_sc8c4_phase_a_safety_hardening.py` (10 tests):

1. `test_live_rejected_without_context`
2. `test_dry_run_allows_default_context`
3. `test_delete_file_fails_when_target_still_exists`
4. `test_clear_cache_fails_when_child_still_exists`
5. `test_browser_cache_fails_when_child_still_exists`
6. `test_registry_value_fails_when_value_still_exists`
7. `test_startup_file_fails_when_file_still_exists`
8. `test_create_snapshot_computes_content_fingerprint`
9. `test_action_planner_uses_content_fingerprint_for_hashmatches`
10. `test_startupexecutor_imported_via_all`

## Validation Results

### Full test suite

```text
$ python -m pytest -q
1080 passed, 14 skipped in 495.77s (0:08:15)
```

### Static checks on modified files

| Tool | Command | Result |
|------|---------|--------|
| mypy | `mypy src/avs_backend/scan_core/execution src/avs_backend/scan_core/context/asset_snapshot.py src/avs_backend/scan_core/rules/action.py` | 0 issues |
| flake8 | `flake8 --max-line-length=100 src/avs_backend/scan_core/execution tests/test_sc8c4_phase_a_safety_hardening.py tests/test_sc8c4_part5_startup.py` | clean |
| black | `black --check src/avs_backend/scan_core/execution tests/test_sc8c4_phase_a_safety_hardening.py tests/test_sc8c4_part5_startup.py` | clean |
| isort | `isort --check-only src/avs_backend/scan_core/execution tests/test_sc8c4_phase_a_safety_hardening.py tests/test_sc8c4_part5_startup.py` | clean |

## Remaining Risks

1. **Post-execution verification checks existence, not backup integrity.** The
   restored backup is not re-hashed or otherwise validated; a separate integrity
   audit may be needed for high-assurance deployments.
2. **Content-fingerprint size cap.** Files larger than 100 MiB are not
   fingerprinted during snapshot creation; large-file hash TOCTOU remains
   unsupported.
3. **Registry re-verification is Windows-only.** On non-Windows platforms,
   `StartupExecutor` cannot independently re-verify a registry value and relies
   on the delegated `RegistryExecutor` result.
4. **Unaddressed audit findings.** Phase A deliberately did not implement:
   - `ActionPlan` persistence/recovery
   - `RuleCategory`/`AssetType` mappings for non-filesystem/non-registry/non-browser/non-startup assets
   - Performance optimization for large scans
   These remain documented in `SC8C4_FINAL_INTEGRATION_SECURITY_AUDIT.md`.

## Conclusion

Phase A is complete. The four critical safety gaps are closed, the new
regression tests pass, the full suite is green, and modified code passes all
requested static checks. Phase B was not started.
