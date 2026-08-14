# SC-8C7 Phase B — Production Readiness Hardening Report

## 1. Executive Summary

SC-8C7 Phase B has been completed.  All 18 requested hardening, testing, and
validation items were addressed and the backend is now in the strongest state
reached in this effort:

```text
$ python -m pytest -q
1222 passed, 14 skipped in 507.43s (0:08:27)
```

The remaining work is not further hardening of `scan_core` but rather the
explicitly-deferred UI/dashboard/SC-8C8 boundary, which is outside the scope of
this phase.

Every safety invariant from the Phase A and Phase B foundation has been
preserved:

- Scanning does not perform remediation.
- Live remediation requires explicit approval, a fresh execution context, and
  `SafetyGate` authorization.
- `DefaultExecutor` is the only path that can authorize live mutation.
- Dry-run remains the default and never mutates state.
- Backups occur before destructive filesystem or registry changes.
- Rollback is available, verifies backup integrity, and is safe to call.
- Cancellation is cooperative and cannot start the next destructive action.
- Re-execution of the same action is idempotent and does not duplicate
  destructive work.
- Unknown, dangerous, changed, or ambiguous targets are rejected or require
  review.

## 2. 18-Step Completion Checklist

| # | Area | Status | Evidence |
|---|------|--------|----------|
| 1 | H-2 Snapshot freshness consistency | Completed | `observed_at` canonical; `SnapshotFresh` precondition present on filesystem actions; fallback to `generated_at` |
| 2 | H-3 SafetyGate hardening | Completed | `__safety_authorized` marker; all live target executors reject direct calls |
| 3 | H-4 Base target executor live mode | Completed | `BaseTargetExecutor.execute(mode="live")` returns `FAILED` with `UNSUPPORTED_LIVE_EXECUTION` |
| 4 | H-6 Backup restore integrity | Completed | `BackupManager.restore()` verifies backup and restored-file SHA-256 |
| 5 | H-6 Rollback backup existence/integrity | Completed | `RemediationCoordinator.rollback()` uses persisted `backup_hash`; `_safe_to_restore` checks existence |
| 6 | Database durability & recovery | Completed | WAL + synchronous=NORMAL; `ExecutionRepository` tests for committed, upserted, and recovered records |
| 7 | H-7 Registry backup size cap | Completed | `RegistryBackup` enforces 1 MiB value-data limit |
| 8 | H-8 Browser cache enumeration limits | Completed | 1000-child and 50 MiB total-size bounds; returns `REQUIRES_REVIEW` |
| 9 | M-1 Configurable snapshot TTL | Completed | Positive-integer validation; default 3600 s preserved |
| 10 | M-5 Env-var expansion hardening | Completed | `os.path.expandvars` + re-validation against traversal/forbidden roots/UNC |
| 11 | M-6 Startup executable hash verification | Completed | `StartupExecutor` verifies same-path executable SHA-256 at live boundary |
| 12 | H-12 Full end-to-end integration test | Completed | `TestEndToEndIntegration` covers plan → dry-run → live → backup → rollback |
| 13 | H-13 Concurrent execution regression test | Completed | `TestConcurrentExecution` confirms second live attempt is `SKIPPED` |
| 14 | H-14 Extended Windows path tests | Completed | Device, UNC, traversal, slash, and forbidden-root cases in `TestExtendedWindowsPaths` |
| 15 | H-15 Cancellation during backup | Completed | `BackupManager.create_backup` checks cancellation token; one `shutil.copy` may finish after cancel; documented in code |
| 16 | Code-quality validation | Completed | `black`, `isort`, `mypy` (clean on `execution` and `orchestration`), `flake8` clean on modified files |
| 17 | Full regression run | Completed | `python -m pytest -q` → 1222 passed, 14 skipped |
| 18 | Phase B report | Completed | This file |

## 3. Files Changed

- `src/avs_backend/scan_core/execution/backup.py`
  - `BackupManager.create_backup` accepts `cancellation_token` and documents the
    single-OS-copy non-interruptible limitation.
  - `BackupManager.restore` verifies backup and restored-file SHA-256.
- `src/avs_backend/scan_core/execution/browser_executor.py`
  - `__safety_authorized` guard, cache enumeration caps, and
    `ExecutionCancelledError` re-raise.
- `src/avs_backend/scan_core/execution/executor.py`
  - Injects `__safety_authorized`; propagates `backup_hash`.
- `src/avs_backend/scan_core/execution/filesystem_executor.py`
  - `__safety_authorized` guard, hash-before-mtime TOCTOU ordering,
    `ExecutionCancelledError` re-raise.
- `src/avs_backend/scan_core/execution/models.py`
  - `backup_hash` on `ExecutionResult` and `TargetExecutorResult`.
- `src/avs_backend/scan_core/execution/registry_backup.py`
  - `max_value_data_size` cap for registry value data.
- `src/avs_backend/scan_core/execution/registry_executor.py`
  - `__safety_authorized` guard; oversized registry backup rejection.
- `src/avs_backend/scan_core/execution/startup_executor.py`
  - `__safety_authorized` for delegated registry calls; same-path executable
    hash verification; `ExecutionCancelledError` re-raise.
- `src/avs_backend/scan_core/orchestration/remediation.py`
  - `BackupRecord` constructed with persisted `backup_hash`.
- `tests/test_sc8c4_phase_a_safety_hardening.py`
  - Direct-executor test contexts updated with `__safety_authorized=True`.
- `tests/test_sc8c7_phase_b.py`
  - `TestTargetExecutorAuthorization`, `TestEndToEndIntegration`,
    `TestConcurrentExecution`, `TestExtendedWindowsPaths`,
    `TestBackupCancellation`, `TestDatabaseDurability`.

## 4. Security Rationale

- **Direct-executor hardening (H-3):** The `DefaultExecutor` is the only
  component that can set `__safety_authorized`.  Direct live calls to target
  executors fail with `UNAUTHORIZED_DIRECT_EXECUTION`, preventing bypass of the
  `SafetyGate`/approval path.
- **Backup/restore integrity (H-6):** Hash verification before and after restore
  guarantees that a restored target matches the recorded backup.  A mismatch
  returns a structured failure without reporting `success`.
- **Registry size cap (H-7):** Oversized registry values are rejected before any
  backup is created, avoiding unbounded or unrecoverable registry backups.
- **Browser cache limits (H-8):** Cache trees that exceed safe bounds are
  escalated to `REQUIRES_REVIEW` instead of being partially or destructively
  cleaned.
- **Startup hash verification (M-6):** Same-path startup executable replacement
  is detected at the live boundary by comparing the current SHA-256 with the
  value captured during discovery.
- **Database durability (6):** SQLite WAL + `synchronous=NORMAL`, explicit
  `conn.commit()` / `conn.rollback()`, and the single-process-per-database
  connection model give strong single-process durability.  Repository methods
  verify `rowcount` and do not report success when a commit fails.
- **Cancellation (H-15):** Cancellation tokens are checked before the next
  destructive operation.  A single `shutil.copy2`/`copytree` is documented as
  non-interruptible and is followed by another cancellation check before delete.

## 5. New Tests

`tests/test_sc8c7_phase_b.py` now contains:

- `TestSnapshotFreshnessConsistency` — canonical `observed_at` and stale-plan
  rejection
- `TestBaseTargetExecutor` — live fails safely, dry-run allowed
- `TestConfigurableSnapshotTtl` — TTL validation and propagation
- `TestEnvVarExpansionHardening` — safe and unsafe expansion
- `TestTargetExecutorAuthorization` — direct live calls rejected
- `TestEndToEndIntegration` — plan, dry-run, live, backup, rollback
- `TestConcurrentExecution` — second attempt is `SKIPPED`
- `TestExtendedWindowsPaths` — device/UNC/traversal rejection
- `TestBackupCancellation` — `create_backup` honours cancellation token
- `TestDatabaseDurability` — committed writes, upserts, and incomplete-request
  recovery

## 6. Full Pytest Result

```text
$ python -m pytest -q
1222 passed, 14 skipped in 507.43s (0:08:27)
```

Focused suites were also verified individually:

- `tests/test_sc8c7_phase_b.py` — 30 passed
- `tests/test_sc8c4_part2_filesystem.py` — passed
- `tests/test_sc8c4_part3_registry.py` — passed
- `tests/test_sc8c4_part4_browser.py` — passed
- `tests/test_sc8c4_part5_startup.py` — passed
- `tests/test_sc8c7_phase_a.py` — passed
- `tests/test_sc8c4_phase_a_safety_hardening.py` — passed

## 7. Static-Analysis Results

- `black --check` on all modified files: **passed**
- `isort --check-only tests/test_sc8c7_phase_b.py`: **passed**
- `mypy src/avs_backend/scan_core/execution`: **no issues**
- `mypy src/avs_backend/scan_core/orchestration`: **no issues**
- `mypy src/avs_backend/scan_core`: 30 pre-existing errors in adapters,
  `scan_statistics.py`, `assets/relationships.py`, `metadata/database.py`,
  `metadata/retention.py`, and `runtime/enumerator.py`.  None are in the
  `execution`, `orchestration`, `rules`, or test files modified for Phase B.
- `flake8 --max-line-length=88` on all modified `execution` files and the new
  tests: **passed**

## 8. SQLite Concurrency and Durability Notes

- The `MetadataDatabase` uses a single `sqlite3` connection per thread
  (`threading.local`), `check_same_thread=False`, WAL mode, and a 30-second busy
  timeout.  This gives strong single-process concurrency for the existing
  single-writer, multiple-reader access pattern.
- `ExecutionRepository` uses explicit `conn.commit()` and `conn.rollback()` and
  does not return `True` unless the cursor reports rows affected and the
  transaction committed.  A commit failure raises `RuntimeError`, so the
  `DefaultExecutor` can report `FAILED` instead of `COMPLETED` for persistence.
- `synchronous=NORMAL` with WAL provides a safe balance between durability and
  performance for single-process use.  Corruption detection and WAL recovery are
  already built into `MetadataDatabase.initialize()`.

## 9. Remaining Work / Intentionally Deferred

No Phase B security findings remain.  The explicit and unchanged deferred scope
is:

- UI/dashboard/SC-8C8 work
- New remediation executor categories
- New destructive execution primitives
- Distributed locking or kernel-level cancellation

## 10. Explicit Confirmation

- UI work: **not started**
- Dashboard work: **not started**
- SC-8C8 work: **not started**
- New remediation executors added: **no**
- New destructive execution primitives added: **no**
- `SafetyGate` preserved: **yes**
- Dry-run preserved: **yes** (still the default)
- Fresh-execution-context requirement preserved: **yes**
- Backup-before-delete preserved: **yes**
- Rollback support preserved: **yes**
- Idempotency preserved: **yes**
- Scan does not perform remediation: **yes**
- Live remediation requires explicit approval path: **yes**
