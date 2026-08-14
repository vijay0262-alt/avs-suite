# SC-8C4 Part 2 — Safe Filesystem Remediation Report

## 1. Scope

SC-8C4 Part 2 implements the first **real** remediation executor:
`FilesystemExecutor`. It supports safe live deletion of files and empty
directories and clearing approved cache directories. It operates behind the
existing `SafetyGate`, typed preconditions, and `DefaultExecutor` from Part 1
and does **not** implement registry, browser, or startup remediation.

Dry-run remains the default execution mode. No destructive work occurs unless
the caller explicitly passes `mode="live"` and a `BackupManager`.

## 2. Architecture

```
ActionPlan
    ↓
DefaultExecutor
    ↓
SafetyGate + typed Preconditions
    ↓
FilesystemExecutor (dry-run or live)
    ↓
BackupManager (live only)
    ↓
Target filesystem operation
    ↓
ExecutionResult
```

### New and extended components

| File | Role |
|------|------|
| `src/avs_backend/scan_core/execution/filesystem_executor.py` | Real `FilesystemExecutor` with TOCTOU, path safety, symlink/junction/reparse rejection, permission/lock handling, and dry/live modes. |
| `src/avs_backend/scan_core/execution/backup.py` | `BackupManager`, `BackupRecord`, and `RollbackResult`. Creates deterministic, execution-bound backups before live deletion. |
| `src/avs_backend/scan_core/execution/models.py` | Extended `ExecutionResult` and `TargetExecutorResult` with `before_state`, `after_state`, `backup_identity`, `backup_location`, and `operation` fields. |
| `src/avs_backend/scan_core/execution/executor.py` | `DefaultExecutor` now carries an optional `BackupManager` and routes live filesystem actions through `FilesystemExecutor`. |
| `src/avs_backend/scan_core/execution/target_executors.py` | Stub executors for registry, browser, and startup actions remain unchanged. Filesystem actions are routed to the new real executor. |
| `src/avs_backend/scan_core/execution/context.py` | `FilesystemContext.to_dict()` now preserves `modified_time` as a `datetime` for `PreconditionSet` compatibility and uses `is_symlink`/`is_junction`/`is_reparse_point` keys. |

## 3. Filesystem Safety Model

For every live operation, `FilesystemExecutor` performs, in order:

1. Cooperative cancellation check.
2. `validate_filesystem_path()` from SC-8C3 Part 4:
   - rejects `..` and traversal,
   - rejects UNC paths,
   - rejects `FORBIDDEN_ROOTS` (Windows, System32, Program Files, ProgramData, user-protected paths).
3. Allowed-scope check against `target.allowed_location`.
4. `os.lstat()` to re-read live state:
   - rejects symlinks (`is_symlink`),
   - rejects junctions (`os.path.isjunction`),
   - rejects Windows reparse points (`st_reparse_tag`).
5. Re-verifies typed preconditions:
   - target exists,
   - target is writable (no ACL changes),
   - size matches snapshot,
   - modified time matches snapshot,
   - SHA-256 content hash matches snapshot,
   - asset identity matches the action.
6. Optional backup (live mode with `BackupManager`).
7. Cancellation check before and after backup and between children.
8. The actual, target-specific operation.
9. Rollback on failure where a backup exists.
10. Structured `ExecutionResult` with `before_state`, `after_state`, and audit fields.

## 4. Backup and Rollback

`BackupManager` creates a `BackupRecord` before any live deletion:

- `backup_id` is a UUID.
- Backup location is `backup_root / execution_id / action_id / <basename>`.
- Files use `shutil.copy2`.
- Directories use `shutil.copytree`.
- Records include original path, original size, original modified time, backup
  location, backup hash (files), and creation timestamp.

`restore()` copies the backup back to the original path. If a live `clear_cache`
operation fails mid-way, the executor attempts to restore from the whole-cache
backup before returning the failure.

## 5. TOCTOU Protection

`FilesystemExecutor` does not trust the planner. Immediately before deletion it
re-reads the target and compares `size`, `modified_time`, and `SHA-256` hash
against the execution context. If any value has changed, it aborts with a
`TOCTOU_*` error and does not modify the filesystem.

## 6. Symlink, Junction, and Reparse Point Handling

The executor rejects all three categories during live execution:

- `os.path.islink` and `stat.S_ISLNK` detect symlinks.
- `os.path.isjunction` (Python 3.12+) detects junctions.
- `st_reparse_tag` on `os.lstat()` detects Windows reparse points.

No reparse-point target is ever followed for deletion.

## 7. Permission and Locking

- `os.access(path, os.W_OK)` is verified before deletion.
- Read-only or otherwise non-writable targets fail with `PERMISSION_DENIED`.
- No ACL modification, ownership take-over, or security-control disable occurs.
- If `os.remove` or `os.rmdir` raises `PermissionError` with `WinError 32`, the
  result is `LOCKED_TARGET`.
- No process termination, force-unlock, or unsafe handle manipulation is used.

## 8. Cooperative Cancellation

`FilesystemExecutor` checks the `CancellationToken`:

- before path validation,
- before backup creation,
- before the actual delete,
- between files in a `clear_cache` directory.

Cancelled operations do not continue destructive work.

## 9. Idempotency

The `ExecutionLedger` in `DefaultExecutor` still prevents repeated `action_id`
execution at the engine level. `FilesystemExecutor` itself will also fail with
`TARGET_MISSING` if a target has already been removed and is re-attempted
without ledger protection.

## 10. Audit Trail

Every real `ExecutionResult` includes:

- `action_id`, `execution_id`, `asset_id`, `target`, `operation`
- `status`, `reason`, `timestamp`
- `before_state` (live state before the action)
- `after_state` (state after the action)
- `backup_identity` and `backup_location`
- `error`/`verification` where applicable

No file contents are logged.

## 11. Dry-Run Behavior

Dry-run is the default. The executor performs path and scope validation but does
not touch the filesystem. It returns a `DRY_RUN` result with `dry_run_info`
describing the target, operation, and what would happen. No backup is created.

## 12. Test Coverage

`tests/test_sc8c4_part2_filesystem.py` covers:

- successful file deletion
- successful empty-directory deletion
- `clear_cache` of approved directory contents
- dry-run does not modify or back up
- protected Windows paths (System32, Program Files, ProgramData)
- relative paths, traversal, UNC paths
- symlink and directory-symlink rejection
- missing target failure
- changed size / mtime / hash (TOCTOU)
- directory-not-empty failure
- permission denied
- locked target
- backup creation and rollback
- backup integrity (hash)
- idempotent re-execution
- cancellation between actions
- audit-trail fields

## 13. Validation Results

```text
python -m mypy src/avs_backend/scan_core/execution tests/test_sc8c4_part2_filesystem.py
Success: no issues found

python -m flake8 --max-line-length=100 src/avs_backend/scan_core/execution tests/test_sc8c4_part2_filesystem.py
(no output)

python -m black --check src/avs_backend/scan_core/execution tests/test_sc8c4_part2_filesystem.py
All done! 10 files would be left unchanged.

python -m isort --check-only src/avs_backend/scan_core/execution tests/test_sc8c4_part2_filesystem.py
(no output)

python -m pytest tests/test_sc8c4_part2_filesystem.py -q
23 passed, 2 skipped in ~23s

python -m pytest tests/test_sc8c4_part1_execution_engine.py -q
23 passed

python -m pytest -q
998 passed, 11 skipped in 508.79s (0:08:28)
```

## 14. Security Guarantees

- No `PowerShell`, `subprocess`, or process-termination calls.
- No registry, browser, or cleaner integration in this phase.
- `SafetyGate` and typed preconditions are mandatory and cannot be bypassed.
- Dry-run is the default.
- Real deletion only occurs with `mode="live"` and a configured `BackupManager`.
- Symlinks, junctions, reparse points, and forbidden roots are rejected.
- TOCTOU checks prevent deletion of replaced or modified targets.
- Permission and lock failures are returned; no security controls are disabled.

## 15. Remaining Limitations

- Only filesystem actions are implemented. Registry, browser, and startup
  executors remain stubs for Part 2.
- `BackupManager` is in-memory and file-system-backed; remote/off-site backup is
  not implemented.
- `clear_cache` only supports one level of children; non-empty subdirectories
  cause a controlled failure.
- `FilesystemExecutor` uses Python `shutil` for backup copy, which is safe but
  not suitable for very large cache trees without additional policy.
- Junction creation in tests is skipped if the OS does not support it; directory
  symlinks are used as a functional reparse-point proxy on Windows.

---

End of report.
