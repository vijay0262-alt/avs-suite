# SC-8C4 Part 3 — Safe Registry Remediation Report

## 1. Scope

SC-8C4 Part 3 implements the first real **Windows Registry** remediation
executor: `RegistryExecutor`. It supports:

- `remove_registry_value`
- `remove_registry_key` for empty, explicitly approved keys

It operates behind the existing `SafetyGate`, typed preconditions, and
`DefaultExecutor` from Parts 1 and 2. It does **not** implement filesystem,
browser, or startup remediation.

Dry-run remains the default execution mode. No live registry modification
occurs unless the caller explicitly passes `mode="live"` and a `RegistryBackup`.

## 2. Architecture

```
ActionPlan
    ↓
DefaultExecutor
    ↓
SafetyGate + typed Preconditions
    ↓
RegistryExecutor (dry-run or live)
    ↓
RegistryBackup (live only)
    ↓
Windows winreg API
    ↓
ExecutionResult
```

### New and extended components

| File | Role |
|------|------|
| `src/avs_backend/scan_core/execution/registry_executor.py` | Real `RegistryExecutor` with hive validation, protected-key rejection, WOW64 view handling, value type/data verification, live re-read, backup, and rollback. |
| `src/avs_backend/scan_core/execution/registry_backup.py` | `RegistryBackup`, `RegistryBackupRecord`, `RegistryRestoreResult`. Captures original value state and can restore removed values. |
| `src/avs_backend/scan_core/execution/context.py` | Extended `RegistryContext` with `asset_id`, `safety_level`, `view`, `value_data`, and precondition-compatible dictionary keys (`registry_hive`, `registry_key_exists`, etc.). |
| `src/avs_backend/scan_core/execution/executor.py` | `DefaultExecutor` now carries an optional `RegistryBackup` and passes it to the live target executor. |
| `src/avs_backend/scan_core/execution/target_executors.py` | `get_target_executor` routes `remove_registry_value` and `remove_registry_key` to the real `RegistryExecutor`. |
| `tests/test_sc8c4_part3_registry.py` | 15 tests covering dry-run, live value/key removal, safety, rollback, idempotency, WOW64, and SafetyGate. |

## 3. Registry Operations

Supported live operations are limited to the explicitly approved action types:

- `remove_registry_value` — deletes one named value in a key.
- `remove_registry_key` — deletes an explicitly approved, empty registry key.

The executor uses native `winreg` on Windows. On non-Windows systems,
live execution fails with `NO_WINREG`; dry-run still validates the target.

## 4. Registry Safety Model

For every live operation, `RegistryExecutor` performs, in order:

1. Cooperative cancellation check.
2. Hive normalization and allowlist check against `ALLOWED_HIVES`.
3. Key path normalization and rejection of `..` traversal components.
4. Protected-key and parent-key checks from
   `action_registry_validation`.
5. Live re-read via `winreg.OpenKey`/`QueryValueEx`.
6. Existence check (key exists; value exists for `remove_registry_value`).
7. Value type verification when `registry_value_type` is supplied.
8. Value data verification when `registry_value_data` is supplied.
9. Asset identity verification.
10. For key deletion: confirms the key is empty.
11. Backup creation.
12. Cancellation check before delete.
13. `winreg.DeleteValue` or `winreg.DeleteKey`.
14. Rollback on failure.

Any failed check produces a structured `FAILED` or `REJECTED` result and
causes no registry modification.

## 5. Hive Allowlist

Only canonical hives are permitted:

- `HKLM` (`HKEY_LOCAL_MACHINE`)
- `HKCU` (`HKEY_CURRENT_USER`)
- `HKCR` (`HKEY_CLASSES_ROOT`)
- `HKU` (`HKEY_USERS`)
- `HKCC` (`HKEY_CURRENT_CONFIG`)

Unknown hives are rejected by `normalize_hive`.

## 6. Protected Keys and Parent-Key Safety

The executor reuses `validate_registry_target` from SC-8C3 Part 4, which
protects:

- `HKLM\SYSTEM\CurrentControlSet` and `ControlSet00*`
- `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run` family
- `HKLM\SAM`, `HKLM\SECURITY`, `HKLM\HARDWARE`
- `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
- `HKCR\CLSID`, `HKCR\Interface`, `HKCR\TypeLib`
- `HKU\.DEFAULT`, `HKU\S-1-5-18`, `HKU\S-1-5-19`, `HKU\S-1-5-20`

Key deletion is additionally guarded by `is_parent_key_deletion` and a live
`subkey_count`/`value_count` check. A non-empty key cannot be deleted, and a
parent of a protected subtree cannot be deleted.

## 7. WOW6432Node / 32-bit vs 64-bit Views

`RegistryContext` carries a `view` field. `RegistryExecutor` maps it to
`winreg` access flags:

- `wow6432node` / `wow32` / `32` → `KEY_WOW64_32KEY`
- `wow6446node` / `wow64` / `64` → `KEY_WOW64_64KEY`
- `default` → 0

The `ActionPlanner` already sets `view = "wow6432node"` when `WOW6432Node`
appears in the planned key path. The executor uses the view to open the
correct hive view before any read or write.

## 8. Value vs Key Deletion

- `remove_registry_value` requires a `value_name` and only removes that value.
- `remove_registry_key` requires `value_name=None` and only removes an empty
  key.

The executor never upgrades a value deletion into a key deletion. The
`value_name` is taken from the `RegistryActionTarget` (via
`default_registry_context`) and re-verified at execution time.

## 9. Backup and Rollback

`RegistryBackup` creates a `RegistryBackupRecord` before live removal:

- `backup_id`, `execution_id`, `action_id`, `asset_id`
- `hive`, `view`, `key`, `value_name`
- original `value_type`, `value_data`
- `key_existed`, `value_existed`
- `created_at`

`restore()` creates the parent key and calls `winreg.SetValueEx` with the
original type and data. Key restoration is intentionally limited to empty-key
recreation; value restoration is fully supported.

## 10. Live Re-verification (TOCTOU)

Immediately before any live write, the executor re-reads the target and
compares:

- key existence
- value existence (for value deletion)
- value type
- value data
- asset identity

If the live state differs from the supplied execution context, the operation
aborts with `VALUE_TYPE_MISMATCH`, `VALUE_DATA_MISMATCH`, `IDENTITY_MISMATCH`,
or `TARGET_MISSING`.

## 11. Dry-Run

Dry-run is the default. The executor normalizes the target, validates
protected-key status, reads the live value when `winreg` is available, and
returns a `DRY_RUN` result with `dry_run_info`:

- `hive`, `view`, `key`, `value_name`
- `key_exists`, `value_exists`
- `value_type`
- `would_remove`

No registry modification occurs and no backup is created.

## 12. Permission and Locking

- `winreg.OpenKey`/`DeleteValue`/`DeleteKey` permission failures are caught and
  returned as `PERMISSION_DENIED`.
- No ACL changes, ownership take-over, or security-control disable.
- No process termination or force-unlock.

## 13. Cancellation

The `CancellationToken` is checked:

- before path/hive validation
- before live re-read
- before backup creation
- before the delete operation

Cancelled operations produce `CANCELLED` results and do not modify the
registry.

## 14. Audit Trail

Every `ExecutionResult` includes:

- `action_id`, `execution_id`, `asset_id`, `target`, `operation`
- `status`, `reason`, `timestamp`
- `before_state` with `registry_hive`, `registry_key`, `registry_value`,
  `registry_key_exists`, `registry_value_exists`, `registry_value_type`,
  `registry_value_data`, `registry_view`
- `after_state` with post-operation existence
- `backup_identity` and `backup_location`
- `error`/`verification` where applicable

Raw value data is not written to logs; the backup record stores the original
state internally.

## 15. Test Coverage

`tests/test_sc8c4_part3_registry.py` covers:

- dry-run does not modify and returns plan info
- successful value deletion
- value data change (TOCTOU)
- wrong value type
- rollback restores removed value
- idempotent re-execution
- missing value failure
- audit-trail fields
- successful empty-key deletion
- protected key rejection
- invalid hive rejection
- traversal rejection
- stale ActionPlan rejection
- 100+ actions routed through SafetyGate (one blocked)

Live tests are `pytest.mark.skipif` on non-Windows platforms.

## 16. Validation Results

```text
python -m mypy src/avs_backend/scan_core/execution tests/test_sc8c4_part3_registry.py
Success: no issues found

python -m flake8 --max-line-length=100 src/avs_backend/scan_core/execution tests/test_sc8c4_part3_registry.py
(no output)

python -m black --check src/avs_backend/scan_core/execution tests/test_sc8c4_part3_registry.py
All done! 11 files would be left unchanged.

python -m isort --check-only src/avs_backend/scan_core/execution tests/test_sc8c4_part3_registry.py
(no output)

python -m pytest tests/test_sc8c4_part3_registry.py -q
15 passed in ~31s

python -m pytest -q
1013 passed, 11 skipped in 533.72s (0:08:53)
```

## 17. Security Guarantees

- Native `winreg` only; no `PowerShell` or `subprocess`.
- Mandatory `SafetyGate` and typed preconditions cannot be bypassed.
- Dry-run by default.
- Live execution requires `mode="live"` and a `RegistryBackup`.
- Protected Windows keys are rejected with boundary-aware checks.
- WOW64 view handling prevents accidental wrong-view changes.
- Value and key deletion are strictly separated.
- TOCTOU re-verification before every live write.
- Rollback support for removed values.
- No ACL tampering or process termination.

## 18. Remaining Limitations

- Key rollback only recreates an empty key; subkey/value contents are not
  recorded or restored.
- `winreg` is only available on Windows; non-Windows execution cannot modify
  the registry.
- Browser and startup remediation remain stubbed.
- No UI or cleaner integration in Part 3.

---

End of report.
