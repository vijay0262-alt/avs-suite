# SC-8C4 Part 5 — Safe Windows Startup Remediation Report

## Summary

Implemented a safe, dry-run-first `StartupExecutor` for approved Windows startup
entry remediation. The executor delegates to the existing `RegistryExecutor` for
`HKCU`/`HKLM` `Run` and `RunOnce` values and to `FilesystemExecutor` for
startup-folder items. It does not modify protected, unknown, unsigned, or
running startup items automatically. Filesystem, registry, and browser executor
logic was left unchanged.

## New / Modified Components

- `src/avs_backend/scan_core/execution/startup_executor.py` — real `StartupExecutor`
- `src/avs_backend/scan_core/execution/context.py` — new `StartupContext` and `default_startup_context`
- `src/avs_backend/scan_core/execution/target_executors.py` — routes `disable_startup_entry` / `remove_startup_entry` to `StartupExecutor`
- `src/avs_backend/scan_core/execution/__init__.py` — exports `StartupContext` and `StartupExecutor`
- `tests/test_sc8c4_part5_startup.py` — 23 new startup remediation tests
- `SC8C4_PART5_STARTUP_REMEDIATION_REPORT.md` — this report

## Supported Startup Sources

The executor recognizes registry and filesystem sources from `StartupActionTarget.entry_id`:

- `HKCU\...\Run` and `HKLM\...\Run` values
- `HKCU\...\RunOnce` and `HKLM\...\RunOnce` values
- `HKEY_CURRENT_USER\...` / `HKEY_LOCAL_MACHINE\...` long-form paths
- Startup folder files (`*.lnk`, `*.exe`, etc.)

The source type is determined by the `entry_id` prefix (`HK*`) or the explicit
`StartupContext.source` override.

## Allowed Actions

The executor supports:

- `disable_startup_entry`
- `remove_startup_entry`

Both map to the same safe underlying operations:

- `remove_registry_value` for registry startup values
- `delete_file` for startup-folder items

## Protected / Denied Entries

The executor never automatically modify the following:

- Windows Defender / security software
- Antivirus / endpoint protection
- Firewall / security components
- Microsoft Windows components
- Drivers
- Accessibility software
- Authentication / login components
- Enterprise management software
- System-critical services
- Unknown or unsigned publishers
- Unknown executables

Protection is enforced by `StartupContext` flags and publisher string checks:

- `is_system=True` → `REJECTED`
- `is_security=True` or publisher matches `*Microsoft*`, `*Windows*`, `*Defender*`,
  `*antivirus*`, `*endpoint*`, `*firewall*`, `*driver*`, `*accessibility*`,
  `*authentication*`, `*enterprise*`, `*system-critical*`, `*security*` → `REJECTED`
- `is_auto_fixable=False` → `REQUIRES_REVIEW`
- `is_running=True` or `running_processes` non-empty → `REQUIRES_REVIEW`
- unknown / unsigned publisher → `REQUIRES_REVIEW`

## Registry Safety

- Hive, key path, and value are parsed from `entry_id` at execution time.
- Explicit context overrides for `registry_hive`, `registry_key`, and
  `registry_view` are verified against the parsed entry.
- A trailing `\` or any missing value-name is rejected as parent-key deletion.
- The delegated `RegistryActionTarget` has `action_type=remove_registry_value`.
  `remove_registry_key` is never used.
- The existing `RegistryExecutor` validation, hive allowlist, protected-key
  checks, and `WOW6432Node` handling are reused unchanged.

## Filesystem Safety

- Startup-folder targets reuse `validate_filesystem_path` through `FilesystemExecutor`.
- `allowed_location` is enforced.
- Traversal, UNC paths, forbidden roots, symlinks, junctions, and reparse
  points are rejected.
- The Startup folder itself is never recursively deleted.

## Executable Validation

- `canonical_path`, `size`, `modified_time`, and `content_hash` are supplied in
  `StartupContext`.
- `FilesystemExecutor` re-reads live state and fails on mismatch.
- `StartupExecutor` does not execute, modify, or replace the executable.

## Backup and Rollback

- Registry startup values are backed up with `RegistryBackup` before live changes.
- Startup-folder files are backed up with `BackupManager`.
- `backup_identity` and `backup_location` are reported in the `ExecutionResult`.
- Rollback restores the original registry value (hive, key, name, type, data,
  view) or the original file.
- No `rollback_supported` claim is made unless a real backup record exists.

## Dry-Run

- `dry_run` is the default and performs no system modification.
- For allowed targets, the delegated executor reports what would be removed.
- For denied targets, the result reports the safety decision (`REJECTED` or
  `REQUIRES_REVIEW`) and `would_change=False`.

## TOCTOU

- Live registry values are re-read before deletion.
- `registry_value_data` and `registry_value_type` in the context are compared
  against live state; mismatches return `FAILED`.
- Startup-folder files are re-read for size, symlink/junction/reparse status,
  and hash when available.
- Wrong `registry_hive`, `registry_key`, or `registry_view` are rejected.

## Running Process Safety

If `is_running=True` or `running_processes` is non-empty, the executor returns
`REQUIRES_REVIEW`. It never terminates a process, stops a service, or disables
security controls.

## Cancellation

`CancellationToken` is checked:

- before safety classification
- before registry/filesystem delegation
- before live modification by the delegated executor

## Idempotency

The `ExecutionLedger` prevents a second execution of the same `action_id` from
repeating the destructive work. A repeated run returns `SKIPPED`.

## Audit Trail

`ExecutionResult` includes:

- `action_id` and `execution_id`
- `asset_id` and `target`
- `operation` (`disable_startup_entry` or `remove_startup_entry`)
- `before_state` and `after_state`
- `backup_identity` and `backup_location`
- `status` and `reason`
- `verification` from the delegated executor

Sensitive command-line arguments and user data are not logged.

## Test Coverage

`tests/test_sc8c4_part5_startup.py` covers:

- HKCU / HKLM `Run` value removal
- `RunOnce` value removal
- Startup-folder file removal
- Dry-run (no modification)
- Backup and rollback
- Registry TOCTOU (changed value)
- Filesystem TOCTOU (changed file size)
- Protected Windows component rejection
- Security software rejection
- Unknown publisher review
- Running executable review
- Not auto-fixable review
- Wrong registry view rejection
- Parent-key deletion prevention
- Traversal rejection
- Symlink rejection
- Cancellation
- Idempotency
- SafetyGate blocked rejection
- 100+ action batch that cannot bypass SafetyGate

Windows-specific tests skip safely on non-Windows CI.

## Validation

```text
python -m pytest -q
1070 passed, 14 skipped in 490.74s

mypy src/avs_backend/scan_core/execution tests/test_sc8c4_part5_startup.py
Success: no issues found in 13 source files

flake8 --max-line-length=100 <modified/new files>
clean

black --check src/avs_backend/scan_core/execution/startup_executor.py
       src/avs_backend/scan_core/execution/context.py
       src/avs_backend/scan_core/execution/target_executors.py
       tests/test_sc8c4_part5_startup.py
all clean

isort --check-only <modified/new files>
clean
```

## Limitations

- The implementation only handles explicitly approved `AUTO_FIXABLE` startup
  findings. Unknown, unsigned, or ambiguous entries require review.
- Scheduled tasks and service remediation are out of scope for Part 5.
- Process termination or security-software disabling is explicitly prohibited.
