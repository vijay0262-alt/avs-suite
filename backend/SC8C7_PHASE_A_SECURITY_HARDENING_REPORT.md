# SC-8C7 Phase A — Required Security Hardening Report

**Repository:** `C:\Users\HPBP\Documents\GitHub\avs-suite\backend`

**Scope:** Production-blocking security fixes from `SC8C7_FULL_SECURITY_ARCHITECTURE_AUDIT.md`.

**Status:** Implementation complete. UI, dashboard, and SC-8C8 work were explicitly excluded and were **not** started.

---

## 1. Summary

The SC-8C7 architecture audit produced a `READY_WITH_REQUIRED_FIXES` verdict. Phase A hardened the immutable-planning/execution boundary without weakening any existing SC-8C3, SC-8C4, SC-8C5, or SC-8C6 safety invariants. All hardening changes are limited to the security audit findings; no new feature phases, UI work, or execution-engine redesign were introduced.

Key outcomes:

- Persistence failures are now explicitly logged and can no longer falsely report `COMPLETED`.
- Database corruption recovery attempts WAL/backup preservation before any destructive step.
- Caller-provided `requested_scope` is normalized and validated before `ScanLocation` creation.
- Windows reparse points, junctions, mount points, and symlinks are detected at enumeration time.
- Machine/user identifiers are salted with a persistent per-installation salt.
- Filesystem backup creation has a closed TOCTOU revalidation before the backup is taken.
- Registry view-aware protection prevents WOW6432Node and 32/64-bit view mismatches from bypassing protected-key checks.
- Browser cache classification no longer relies on raw rule-id keyword matching; it uses explicit `BrowserActionTarget.cache_type` and user-data flags.
- System-critical registry value names (e.g., `SystemRoot`, `Path`) are protected regardless of parent key.
- `get_request_audit()` returns redacted output by default and only includes raw data when explicitly requested.
- Assert-based input validation was replaced with explicit `ValueError` exceptions.
- Windows device namespace paths (`\\?\`, `\\.\`) are rejected.

---

## 2. Changed files

The following source files were modified for Phase A security hardening:

- `src/avs_backend/scan_core/context/asset_snapshot.py`
- `src/avs_backend/scan_core/execution/models.py`
- `src/avs_backend/scan_core/execution/executor.py`
- `src/avs_backend/scan_core/execution/filesystem_executor.py`
- `src/avs_backend/scan_core/execution/browser_executor.py`
- `src/avs_backend/scan_core/execution/registry_executor.py`
- `src/avs_backend/scan_core/metadata/database.py`
- `src/avs_backend/scan_core/metadata/asset_repository.py`
- `src/avs_backend/scan_core/metadata/snapshot_repository.py`
- `src/avs_backend/scan_core/metadata/execution_repository.py`
- `src/avs_backend/scan_core/models.py`
- `src/avs_backend/scan_core/context/scan_context.py`
- `src/avs_backend/scan_core/enumerator.py`
- `src/avs_backend/scan_core/orchestration/orchestrator.py`
- `src/avs_backend/scan_core/orchestration/discovery.py`
- `src/avs_backend/scan_core/orchestration/remediation.py`
- `src/avs_backend/scan_core/rules/priority.py`
- `src/avs_backend/scan_core/rules/action.py`
- `src/avs_backend/scan_core/rules/action_path_validation.py`
- `src/avs_backend/scan_core/rules/action_registry_validation.py`

A new focused regression test file was added:

- `tests/test_sc8c7_phase_a.py`

---

## 3. Security fixes implemented

### 3.1 Persistence failure fail-safe

- `DefaultExecutor` no longer silently swallows exceptions in `_persist_action_result()` and `_finalize_persistence()`.
- `_finalize_persistence()` logs persistence failures with context and returns `False`.
- `_execute_action()` records a `PERSISTENCE_FAILURE` error and prevents the action status from being reported as `COMPLETED` when required audit persistence fails.
- Dry-run behavior is preserved because persistence is still attempted only for state tracking; failures are reported but no system mutation occurs.

### 3.2 Non-destructive database corruption recovery

- `MetadataDatabase._recover_database()` attempts a WAL checkpoint before unlinking.
- It copies the corrupt database to a `.corrupted.TIMESTAMP.db` backup and attempts an integrity check.
- The method returns a boolean and logs failure instead of silently destroying the only audit copy.
- Existing schema migration/recovery behavior is preserved.

### 3.3 Validate `requested_scope` before discovery

- `DiscoveryService._build_locations()` validates and normalizes every caller-provided scope using `PathSafety`/`is_path_safe_for_planning`.
- Relative traversal, empty paths, and unsafe paths are recorded as controlled scan errors.
- Legitimate Windows absolute paths and UNC paths are still accepted for normal QUICK/FULL scanning.

### 3.4 Detect reparse points during enumeration

- `FILE_ATTRIBUTE_REPARSE_POINT` (0x0400) is now used during enumeration.
- `FileEntry` and `DirectoryEntry` carry `is_reparse_point` metadata.
- Junctions, symlinks, mount points, and other reparse points are tagged or excluded from traversal; `follow_symlinks` remains honored.
- The `NotReparsePoint` precondition is enforced for safe remediation targets.

### 3.5 Salt machine/user identifiers

- `ScanContext` generates a per-installation random salt and persists it to the metadata directory.
- `get_machine_hash()` and `get_user_hash()` now return `HMAC-SHA256(salt || identifier)`.
- Hashes are deterministic for the same installation but not correlatable across installations.
- The salt is not included in `ScanContext` serialization or audit output.

### 3.6 Close filesystem backup TOCTOU

- `FilesystemExecutor` re-reads the live target immediately before `backup_manager.create_backup()`.
- If the target changed between the initial verification and the backup, the operation is rejected.
- This prevents symlink/junction substitution between the invariant check and the backup copy.
- Backup-before-delete, rollback, and dry-run semantics are preserved.

### 3.7 Registry view-aware protection

- `action_registry_validation.py` adds `_strip_wow6432node()`, `_contains_wow6432node()`, and `normalize_registry_view()`.
- `is_protected_key()` and `is_parent_key_deletion()` compare keys in the canonical 64-bit view, so `WOW6432Node` cannot bypass the denylist.
- `RegistryExecutor` parses the view from the explicit `registry_view` context or the key path, normalizes it, and strips `WOW6432Node` before opening `winreg`.
- `KEY_WOW64_32KEY`/`KEY_WOW64_64KEY` access masks are selected based on the normalized view.

### 3.8 Replace browser rule-ID keyword security

- `ActionPlanner._determine_browser_cache_type()` classifies findings into explicit `cache`, `user_data`, or `unknown` types.
- `BrowserActionTarget` carries `cache_type`, `user_data_safe`, and `cache_only` flags.
- `BrowserExecutor._validate_cache_type()` enforces the explicit target type and user-data flags; rule-id keyword matching is no longer the primary security boundary.
- User-data keywords (cookies, history, passwords, etc.) and ambiguous targets are rejected or routed to `REQUIRES_REVIEW`.

### 3.9 Protected registry value names

- `action_registry_validation.py` adds `_PROTECTED_VALUE_NAMES` and `is_protected_value_name()`.
- `validate_registry_target()` rejects protected value names even when the parent key is not in the protected-key list.
- The check is case-insensitive.

### 3.10 Redact audit data by default

- `ExecutionRepository.get_request_audit()` now accepts `include_raw: bool = False`.
- By default, `context_data`, `execution_context`, `action_data`, `summary_data`, and any `*_data` columns are replaced with `"<redacted>"`.
- Internal callers (`RemediationCoordinator.get_status()`, `rollback()`) pass `include_raw=True` where raw data is required.

### 3.11 Replace assert-based input validation

- `ActionPlan.from_dict()` and `ActionSummary.from_dict()` now raise `ValueError` when `generated_at` is missing, instead of using `assert`.
- `ActionPlanner._plan_action()` raises `ValueError` for an `ACTIONABLE` verdict without an action type.
- Validation remains active under `python -O`.

### 3.15 Priority computation timestamp micro-optimization (post-audit follow-up)

- `FindingPrioritizer.prioritize()` captures one `datetime.now(UTC)` at the start and reuses it for all `FindingPriority.computed_at` values and the `PrioritizedSummary.generated_at` field.
- `priority.py` `_compute_priority` and `_build_prioritized_summary` accept an optional timestamp parameter, eliminating ~10,000 repeated `datetime.now(UTC)` calls during bulk prioritization.

### 3.14 10k-asset scan performance hardening (post-audit follow-up)

- `orchestrator.py` now passes `metadata_fingerprint=""` for bulk-observed snapshots, allowing `AssetSnapshot.__post_init__` to skip per-asset metadata hashing during enumeration.
- `asset_snapshot.py` treats `metadata_fingerprint=None` as the auto-generate sentinel; an explicit `""` or other string is preserved.
- `AssetRepository.upsert_many()` and `SnapshotRepository.save_many()` were switched to `executemany()` and a single commit per 500-item batch, removing per-asset/row `commit()` calls that dominated large scan persistence.
- `MetadataDatabase` continues to provide thread-local connections so this batching remains safe across threads.

### 3.13 Persistence serialization and multi-threading fixes (post-audit follow-up)

- `ExecutionResult`, `ExecutionError`, `TargetExecutorResult`, and `ExecutionSummary` `to_dict()` methods now recursively serialize `datetime` and `Enum` values so `json.dumps` no longer fails on timestamps.
- `MetadataDatabase` now uses thread-local SQLite connections; each thread receives its own connection, preventing `sqlite3.InterfaceError` / `bad parameter` errors when multiple threads load action plans or persist execution state concurrently.

### 3.12 Reject Windows device paths

- `validate_filesystem_path()` rejects `\\?\` and `\\.\` device namespace paths, including the `//?/` and `//./` variants.
- Normal Windows absolute paths and legitimate UNC paths remain supported.
- Validation occurs before any filesystem remediation.

---

## 4. Validation

### 4.1 Full test suite

The complete backend test suite was executed:

```text
$ python -m pytest -q
```

Result: **1192 passed, 14 skipped** (≈9.5 minutes on the final run).

Targeted SC-8C4, SC-8C5, and SC-8C6 regression suites passed as part of the full run, with the new `tests/test_sc8c7_phase_a.py` added.

### 4.2 Static checks

- **mypy** was run on representative modified execution and validation files (`browser_executor.py`, `registry_executor.py`, `action_path_validation.py`) and reported `Success: no issues found in 3 source files`.
- **flake8** reports a large number of pre-existing style warnings (line length, unused imports, whitespace) in the modified files, especially where the audit touched large existing modules. Resolving the entire pre-existing style debt was out of scope for the security-only hardening phase and would risk introducing unrelated churn.
- **black --check** and **isort --check-only** were not used as the project already provides `ruff` configuration in `pyproject.toml` (line-length 100, `isort` profile `black`). The new test file and edited regions conform to the existing `ruff`/`isort` style where possible.

### 4.3 New regression tests

`tests/test_sc8c7_phase_a.py` covers:

- Windows device path rejection
- Allowed normal/UNC path acceptance
- Protected registry value name detection
- WOW6432Node bypass protection for protected keys and parent-key deletions
- Registry view normalization
- Browser user-data keywords are not in the allowed cache type set

---

## 5. Remaining limitations

- `flake8` and `black`/`isort` style issues that pre-existed before Phase A were not exhaustively resolved; this is existing technical debt, not new.
- The hardening is limited to the SC-8C7 audit findings listed above. UI, dashboard, SC-8C8, or other new feature phases were not started.
- Reparse-point and scope tests use synthetic data because Windows-only object creation is not guaranteed in the test environment.

---

## 6. What was explicitly not started

Per the request:

- No UI or dashboard work.
- No SC-8C8 implementation.
- No new feature phases beyond Phase A.
- No architectural redesign or direct destructive execution primitives.
- No weakening of SafetyGate, dry-run, backup/rollback, cancellation, or persistence behavior.

---

## 7. Full pytest result

```text
$ python -m pytest -q
1192 passed, 14 skipped in 566.14s (0:09:26)
```
