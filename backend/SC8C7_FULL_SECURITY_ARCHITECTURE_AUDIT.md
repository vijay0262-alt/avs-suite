# SC-8C7 — Full Scan Core Security, Integration & Architecture Audit

## 1. Executive Summary

This audit inspected the AVS AI Shield `scan_core` implementation from discovery through SC-8C6 live remediation/rollback. No production code or tests were modified. The codebase has strong architectural separation between scanning and remediation, immutable models, a deterministic planning chain, and a comprehensive test suite. However, several issues must be fixed before a UI/GA release, primarily around silent persistence failures, stale context, TOCTOU gaps in backup creation, path/registry validation completeness, and privacy-safe identifiers.

**Verdict: `READY_WITH_REQUIRED_FIXES`**

The architecture is sound, but the `Required Fixes Before UI` (Section 13) must be completed before production execution is enabled in a UI.

---

## 2. Architecture / Data-Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Discovery                        → Filesystem/Registry/Browser/Startup      │
│    (scan_core/orchestration/discovery.py, scan_core/enumerator.py)          │
└──────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  ScanAsset → AssetSnapshot → ScanContext                                     │
│    (scan_core/assets.py, scan_core/context/asset_snapshot.py,                │
│     scan_core/context/scan_context.py)                                       │
└──────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  Metadata Cache / MetadataDatabase                                           │
│    (scan_core/metadata/database.py, repositories)                            │
└──────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  Rule Registry → Rule Evaluation → Detection Findings                        │
│    (scan_core/rules/registry.py, rule.py, result.py)                         │
└──────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  Aggregation → Priority/Fixability → CapabilityContract                      │
│    (scan_core/rules/aggregator.py, priority.py, actionability.py)            │
└──────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  ActionPlanner → ActionPlan                                                  │
│    (scan_core/rules/action.py)                                               │
└──────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  Safety Hardening → SafetyGate, PreconditionSet, Path/Registry validation    │
│    (scan_core/rules/safety_gate.py, action_preconditions.py,                 │
│     action_path_validation.py, action_registry_validation.py)                │
└──────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  RemediationCoordinator (SC-8C6)                                             │
│    (scan_core/orchestration/remediation.py)                                  │
└──────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  DefaultExecutor → TargetExecutors → Backup/Rollback → Persistence           │
│    (scan_core/execution/executor.py, target_executors.py,                    │
│     filesystem_executor.py, registry_executor.py, browser_executor.py,       │
│     startup_executor.py, backup.py, registry_backup.py)                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

Scan and remediation are cleanly separated: the scan orchestrator produces and persists an `ActionPlan`; `RemediationCoordinator` loads the plan, enforces explicit approval, rebuilds typed preconditions, supplies fresh context, and delegates to `DefaultExecutor`.

---

## 3. Security Invariant Matrix

| Invariant | Status | Evidence / Gap |
|-----------|--------|----------------|
| A. Scan never performs remediation automatically | **PASS** | `ScanOrchestrator` only calls discovery, rule evaluation, aggregation, and `ActionPlanner`. No execution code is called. |
| B. Live remediation requires explicit approval | **PASS** | `RemediationCoordinator.execute()` requires an `approval_token`; live mode is rejected without it (`remediation.py:116-119`). |
| C. Live remediation requires fresh execution context | **PASS** | `RemediationCoordinator._context_provider()` re-reads current filesystem state per action (`remediation.py:448-498`). `DefaultExecutor._resolve_context()` rejects live mode without context (`executor.py:401-411`). |
| D. SafetyGate cannot be bypassed | **PARTIAL** | `DefaultExecutor` always calls `SafetyGate.evaluate()` before target execution (`executor.py:300`). However, a `RemediationAction` with a non-`PLANNED` state and a non-None target could still be passed to a buggy direct-executor call; `from_dict` does not reject this. |
| E. Detection-only findings cannot reach executors | **PASS** | `CapabilityContract` maps `NOT_FIXABLE`/`DETECTION_ONLY` to `ActionState.NOT_FIXABLE`; `SafetyGate.evaluate()` rejects `blocked`/`not_fixable`/`missing_target`/`locked_target` states. |
| F. Protected filesystem locations cannot be modified | **PARTIAL** | `validate_filesystem_path()` rejects forbidden roots and `..` traversal (`action_path_validation.py:158-220`), but does not reject Windows device paths (`\\?\`, `\\.\`) and lacks Unicode NFC normalization. |
| G. Protected registry locations cannot be modified | **PARTIAL** | `is_protected_key()` checks key paths (`action_registry_validation.py:211-263`) but does not protect critical value names (`SystemRoot`, `ProgramFilesDir`, etc.). |
| H. Browser user data cannot be treated as cache | **PARTIAL** | `BrowserExecutor._classify_rule()` rejects rule IDs with user-data keywords (`browser_executor.py:47-92`), but keyword heuristics can be bypassed by crafted rule IDs. |
| I. Startup protection cannot be bypassed | **PARTIAL** | `StartupExecutor` checks publisher, signing, and running state, but does not verify executable hash before delegating to `FilesystemExecutor`/`RegistryExecutor`. |
| J. TOCTOU checks occur immediately before mutation | **PARTIAL** | `FilesystemExecutor` re-reads live state, re-verifies invariants, then copies to backup. However, backup creation (`filesystem_executor.py:287-292`) occurs after the live-state read, leaving a window for a symlink swap. |
| K. COMPLETED requires independent post-execution verification | **PASS** | `FilesystemExecutor` re-reads `live_after` and fails if the target still exists (`filesystem_executor.py:340-360`). `RegistryExecutor` re-checks key/value absence. |
| L. Duplicate completed actions cannot execute again after restart | **PASS** | `ExecutionRepository.get_completed_action_ids()` filters by `ExecutionState.COMPLETED` (`execution_repository.py:251-269`) and seeds the `ExecutionLedger`. |
| M. Rollback cannot overwrite changed user data | **PASS** | `RemediationCoordinator._safe_to_restore()` compares SHA-256 of current target and backup before restoring files, and refuses to restore non-empty directories (`remediation.py:534-545`). |
| N. Dry-run performs no system modification | **PASS** | `FilesystemExecutor`, `BrowserExecutor`, `RegistryExecutor`, and `StartupExecutor` all return before destructive operations when `mode != "live"`. |
| O. Cancellation cannot continue destructive work | **PARTIAL** | Cancellation is checked before each action and operation, but `BackupManager.create_backup()` uses `shutil.copy2()` / `shutil.copytree()` with no cancellation hook; a large-file backup will continue after cancellation. |
| P. Persistence failure cannot falsely report successful execution | **FAIL** | `DefaultExecutor._persist_action_result()` and `_finalize_persistence()` swallow exceptions (`executor.py:211-213, 232-234`); `RemediationCoordinator._finalize_status()` also swallows persistence exceptions (`remediation.py:139-148`). |
| Q. No subprocess/PowerShell/process termination is used for remediation | **PASS** | No `subprocess`, PowerShell, process termination, or direct `winreg` writes were found in the remediation path. Registry changes use `winreg` delete APIs only inside `RegistryExecutor`. |

---

## 4. SC-1 → SC-8C6 Phase Integration Matrix

| Phase | Key Components | Integration Status | Notes |
|-------|----------------|--------------------|-------|
| SC-1  | Asset model, discovery interfaces | **OK** | `ScanAsset` and `ScanContext` are stable. |
| SC-2  | `FilesystemEnumerator`, `MetadataDatabase` | **AT RISK** | Enumerator does not validate `requested_scope` or detect reparse points. |
| SC-3  | `RuleRegistry`, `Rule` protocol | **OK** | Clean rule interface. |
| SC-4  | `RuleResult`, `DetectionFinding`, `Evidence` | **AT RISK** | Free-form `metadata`/`value` may leak sensitive data. |
| SC-5  | `DetectionAggregator`, `FindingPrioritizer` | **OK** | Deterministic aggregation. |
| SC-6  | `CapabilityContract`, `Fixability` | **OK** | Contract enforced, though `ActionPlanner` still builds a target for non-actionable verdicts. |
| SC-7  | `ActionPlanner`, `ActionPlan` | **AT RISK** | Snapshot freshness precondition is optional; `PreconditionSet` placeholders in persisted plans must be rebuilt before execution. |
| SC-8C1 | `DefaultExecutor`, `ExecutionLedger` | **AT RISK** | Persistence failures swallowed; no ledger status validation needed (already filters by `COMPLETED`). |
| SC-8C2 | `FilesystemExecutor` | **AT RISK** | TOCTOU gap between live-state read and backup creation; `BackupManager.restore()` does not verify restored hash. |
| SC-8C3 | `SafetyGate`, `PreconditionSet` | **AT RISK** | Path validation does not cover device paths or Unicode normalization. |
| SC-8C4 | Registry/Browser/Startup executors | **AT RISK** | Registry view validation incomplete; browser keyword classification bypassable; startup hash not verified. |
| SC-8C5 | `ScanOrchestrator` | **OK** | Scan and planning are non-executing; removed `content_fingerprint=""` was restored to preserve 10k scan performance. |
| SC-8C6 | `RemediationCoordinator`, `ExecutionRepository` | **AT RISK** | `_finalize_status()` swallows persistence errors; `_safe_to_restore()` directory check only verifies emptiness. |

---

## 5. Critical Findings (Block Production or Enable System Modification)

### C-1: Persistence failures are silently swallowed
- **File**: `src/avs_backend/scan_core/execution/executor.py` lines 201-213 and 215-234
- **Problem**: `_persist_action_result()` and `_finalize_persistence()` catch `Exception` and ignore it. The same pattern exists in `orchestration/remediation.py:139-148` (`_finalize_status()`).
- **Failure scenario**: Database is full, write fails, but `DefaultExecutor` returns `ExecutionStatus.COMPLETED` with no audit record. A UI shows success; no rollback or investigation is possible.
- **Impact**: Falsely reported successful execution, loss of audit trail, inability to recover.
- **Recommended fix**: Log persistence failures at a minimum; for the coordinator, return a `FAILED`/`PERSISTENCE_ERROR` summary and never report `COMPLETED` when audit persistence fails.
- **Blocks production**: **YES**

### C-2: Database corruption recovery deletes all data
- **File**: `src/avs_backend/scan_core/metadata/database.py` lines 166-196
- **Problem**: `_recover_from_corruption()` copies the corrupted file to a `.corrupted.*` backup, then `unlink()`s the database. No attempt is made to dump recoverable tables or use `PRAGMA wal_checkpoint`.
- **Failure scenario**: Crash leaves a corrupt WAL. On next start the entire `MetadataDatabase` is deleted; all plans, audit history, and execution state are lost.
- **Impact**: Total loss of audit and recovery state; action plans cannot be reloaded.
- **Recommended fix**: Attempt `PRAGMA wal_checkpoint(TRUNCATE)` and `sqlite3` dump first. Only delete as a last resort, and expose a configuration to fail-fast instead of auto-recover.
- **Blocks production**: **YES**

### C-3: `requested_scope` is not validated before discovery
- **File**: `src/avs_backend/scan_core/orchestration/discovery.py` lines 88-92
- **Problem**: `FilesystemDiscoveryEngine._select_locations()` creates `ScanLocation` objects directly from `scan_context.requested_scope` without normalizing, validating, or rejecting traversal sequences.
- **Failure scenario**: A UI or API caller passes `scope=["C:\\Users\\x\\..\\Windows\\System32\\config"]`. The enumerator scans and records protected system files.
- **Impact**: Information disclosure; protected files can enter the `ActionPlan` pipeline.
- **Recommended fix**: Call `validate_filesystem_path(p, allow_relative=False, allow_unc=False)` and use `os.path.abspath()` before creating `ScanLocation`.
- **Blocks production**: **YES**

### C-4: Reparse points are not detected during enumeration
- **File**: `src/avs_backend/scan_core/enumerator.py` lines 37, 524-541
- **Problem**: `FILE_ATTRIBUTE_REPARSE_POINT` is defined but never used. Junctions and mount points can appear as directories and are enumerated; symlinks are emitted as entries without target validation.
- **Failure scenario**: A malicious junction `C:\Users\x\Junk` → `C:\Windows` is scanned. The planner could emit delete actions for system files if downstream re-verification is bypassed.
- **Impact**: Path traversal via reparse points; protected locations can be reached.
- **Recommended fix**: Use `entry.stat().st_file_attributes` (Windows) or `os.lstat()` to detect reparse points, and mark/tag such entries so the planner can reject them.
- **Blocks production**: **YES**

### C-5: Machine/user ID hashes are reversible / unsalted
- **File**: `src/avs_backend/scan_core/context/scan_context.py` lines 165-207
- **Problem**: `generate_machine_id_hash()` and `generate_user_id_hash()` hash `platform.node()`, `platform.machine()`, `platform.processor()`, and `getpass.getuser()` without a salt or stretching.
- **Failure scenario**: An attacker with the database can brute-force the hostname/user name and correlate scans to individuals.
- **Impact**: Privacy leakage; violates the stated privacy-safe design.
- **Recommended fix**: Add a per-installation random salt stored in a non-audited secure location, and hash `salt + identifier`.
- **Blocks production**: **YES**

### C-6: TOCTOU window between live-state read and backup creation
- **File**: `src/avs_backend/scan_core/execution/filesystem_executor.py` lines 254 and 287-292
- **Problem**: `_read_live_state()` is called at line 254; `backup_manager.create_backup()` is called at line 287. A race can swap the target for a symlink to a protected file between these two points.
- **Failure scenario**: User targets `C:\Temp\bad.exe`; attacker replaces it with a symlink to `C:\Windows\System32\config\SAM` after the safety checks. The backup copies the SAM hive.
- **Impact**: Sensitive file exfiltration via backup; potential credential theft.
- **Recommended fix**: Open a file handle or re-stat immediately before `create_backup()`, and reject if the path is now a reparse point or its identity has changed.
- **Blocks production**: **YES**

### C-7: Registry view not validated against protected-key checks
- **File**: `src/avs_backend/scan_core/execution/registry_executor.py` lines 82-91; `src/avs_backend/scan_core/rules/action_registry_validation.py` lines 211-263
- **Problem**: `_view_to_sam()` selects 32/64-bit access mask based on the action's `view` string. `is_protected_key()` does not consider the view, so a `WOW6432Node` path of a protected key is not necessarily blocked.
- **Failure scenario**: A rule targets `HKLM\SOFTWARE\WOW6432Node\...` of a protected key. Validation passes because the protected list is for the 64-bit view.
- **Impact**: Modification of protected registry locations via view mismatch.
- **Recommended fix**: Normalize `WOW6432Node` into the canonical key path before `is_protected_key()`, and maintain view-aware protected lists.
- **Blocks production**: **YES**

### C-8: Browser cache classification is keyword-based and bypassable
- **File**: `src/avs_backend/scan_core/execution/browser_executor.py` lines 47-92
- **Problem**: `_classify_rule(rule_id)` decides whether a target is user data by substring search in the rule ID. A crafted rule ID such as `http_cache_login_data` would be classified as cache.
- **Failure scenario**: A malicious rule causes deletion of `Login Data` or `Cookies` files, removing saved credentials.
- **Impact**: User data loss, credential deletion.
- **Recommended fix**: Classify by explicit `cache_type`/target type fields on `BrowserActionTarget`, not by rule ID strings.
- **Blocks production**: **YES**

---

## 6. High-Risk Findings

### H-1: Protected registry *value names* are not checked
- **File**: `src/avs_backend/scan_core/rules/action_registry_validation.py` lines 266-306
- **Problem**: `validate_registry_target()` checks protected key paths and validates value-name syntax, but does not reject known critical value names (e.g. `SystemRoot`, `ProgramFilesDir`, `Path`).
- **Impact**: A non-protected key containing a system-critical value could be modified.
- **Recommended fix**: Add a `PROTECTED_VALUE_NAMES` list and reject actions that target those values.
- **Blocks production**: **NO** (but should be fixed before GA)

### H-2: Snapshot freshness precondition is optional
- **File**: `src/avs_backend/scan_core/rules/action.py` lines 1099-1101
- **Problem**: `SnapshotFresh` is only added if `snapshot.snapshot_timestamp` is not `None`. `AssetSnapshot` currently uses `observed_at`, not `snapshot_timestamp`, so most snapshots never get a freshness precondition.
- **Impact**: Stale data can be used for action planning.
- **Recommended fix**: Make `snapshot_timestamp` a required attribute of the snapshot protocol, or map `observed_at` into the freshness precondition.
- **Blocks production**: **NO**

### H-3: `SafetyGate` is a protocol, not a mandatory call
- **File**: `src/avs_backend/scan_core/rules/safety_gate.py` lines 39-181
- **Problem**: `DefaultSafetyGate.evaluate()` is invoked by `DefaultExecutor`, but nothing in the target-executor layer prevents direct invocation of `FilesystemExecutor.execute()` without the gate.
- **Impact**: Future code or a buggy path can bypass the gate.
- **Recommended fix**: Make `SafetyGate` a required argument of `DefaultExecutor` and add an internal assertion that every target execution is preceded by gate approval.
- **Blocks production**: **NO**

### H-4: `BaseTargetExecutor` is reachable and returns DRY_RUN in live mode
- **File**: `src/avs_backend/scan_core/execution/target_executors.py` lines 15-47
- **Problem**: The base class is not registered by `get_target_executor()`, but it is public. If a future path returns it for an unsupported action, `BaseTargetExecutor.execute()` returns `ExecutionStatus.DRY_RUN` regardless of `mode`.
- **Impact**: User may believe live action succeeded while nothing was changed.
- **Recommended fix**: Have `BaseTargetExecutor.execute()` raise `NotImplementedError` when `mode == "live"`.
- **Blocks production**: **NO** (currently unreachable)

### H-5: `validate_filesystem_path()` does not reject Windows device paths
- **File**: `src/avs_backend/scan_core/rules/action_path_validation.py` lines 158-220
- **Problem**: Paths with `\\?\`, `\\.\`, or device namespaces are not explicitly rejected, potentially bypassing forbidden-root checks.
- **Impact**: Path-traversal / protected-location bypass.
- **Recommended fix**: Reject strings starting with `\\\\?\\`, `\\\\.\\`, or `\\*`.
- **Blocks production**: **NO**

### H-6: `BackupManager.restore()` does not verify restored content
- **File**: `src/avs_backend/scan_core/execution/backup.py` lines 159-197
- **Problem**: After restoring a file, no hash is computed and compared to the stored `backup_hash`.
- **Impact**: Corrupted or tampered backups could be restored silently.
- **Recommended fix**: Compute SHA-256 of the restored file and compare to the record; fail on mismatch.
- **Blocks production**: **NO**

### H-7: Audit output includes full `context_data`/`result_data`
- **File**: `src/avs_backend/scan_core/metadata/execution_repository.py` lines 307-335
- **Problem**: `get_request_audit()` returns raw `context_data` and `result_data` JSON blobs, which contain canonical paths, browser profiles, registry keys, etc.
- **Impact**: UI or exported audit logs may expose user-identifiable information.
- **Recommended fix**: Provide a redacted view by default; only include raw data with an explicit `include_raw` flag.
- **Blocks production**: **NO**

---

## 7. Medium / Low / Info Findings

### M-1: `snapshot_ttl_seconds` is hardcoded to 3600
- **File**: `src/avs_backend/scan_core/rules/safety_gate.py` line 92
- **Impact**: Long scans may produce plans that are stale by the time execution is requested. Make it configurable.

### M-2: `PRAGMA synchronous=NORMAL` trades durability for speed
- **File**: `src/avs_backend/scan_core/metadata/database.py` line 132
- **Impact**: A crash may lose the last committed transaction. Consider `FULL` for audit data.

### M-3: `PreconditionSet` placeholder records must be rebuilt
- **File**: `src/avs_backend/scan_core/rules/action_preconditions.py` lines 349-365
- **Impact**: `_PersistedPrecondition.evaluate()` intentionally raises. `RemediationCoordinator` correctly rebuilds preconditions, but this is a documented necessity, not automatic safety.

### M-4: `assert` statements used for input validation in `action.py`
- **File**: `src/avs_backend/scan_core/rules/action.py` lines 585, 646, 892
- **Impact**: Running under `python -O` disables these checks. Replace with explicit `ValueError`.

### M-5: `_expand_env_vars` uses a hardcoded, incomplete variable list
- **File**: `src/avs_backend/scan_core/rules/action_path_validation.py` lines 114-130
- **Impact**: `%TEMP%`, `%TMP%`, `%LOCALAPPDATA%` may not expand consistently. Use `os.path.expandvars` fully.

### M-6: `StartupExecutor` does not verify executable content hash
- **File**: `src/avs_backend/scan_core/execution/startup_executor.py` lines 316-430
- **Impact**: A swapped but same-path executable passes safety checks and is not re-verified.

### M-7: `BrowserExecutor` dry-run may enumerate large directories with `os.scandir`
- **File**: `src/avs_backend/scan_core/execution/browser_executor.py` lines 431-437
- **Impact**: Large cache directories can consume memory. Add a child-count/size limit.

### L-1: No integration test for full scan → plan → live → rollback
- **File**: `tests/test_sc8c6_remediation_coordinator.py`
- **Impact**: Component tests exist, but no end-to-end pipeline test covers format compatibility between scan and remediation.

### L-2: Test helper duplication across SC-8C5/SC-8C6 test files
- **Files**: `tests/test_sc8c5_scan_orchestration.py`, `tests/test_sc8c6_remediation_coordinator.py`
- **Impact**: Maintenance burden; inconsistent fixtures.

### I-1: Strong immutability and deterministic ordering
- **Files**: `scan_core/rules/action.py`, `scan_core/execution/models.py`
- **Positive**: Frozen dataclasses, deterministic `action_id` hashing, and sorted execution order reduce mutation and non-determinism bugs.

---

## 8. Dead / Stub / Reachable-Code Analysis

| Code | Location | Status | Risk |
|------|----------|--------|------|
| `BaseTargetExecutor` | `execution/target_executors.py:15-47` | **Dead** (not registered) | **Risk if accidentally returned** — currently no production path returns it, but it is public and returns `DRY_RUN` for live mode. |
| `_NoTarget` | `rules/action.py:356-386` | **Used** | Correctly used for non-actionable verdicts; no risk. |
| `_delete_hklm_tree` | `tests/test_sc8c4_part5_startup.py:411` | **Dead test helper** | No functional risk, but should be removed or used. |
| `_make_confidence` / `_make_evidence` duplicated | Multiple test files | **Duplication** | Maintenance burden; no runtime risk. |
| `RegistryBackup` stub | `execution/registry_backup.py` | **Partially implemented** | In-memory records only; restart loses registry backups. Rollback after process restart cannot be supported without persistence. |
| `BrowserExecutor` backups | `execution/browser_executor.py` | **50 MiB cap exists** | Reasonable guard; good safety default. |

---

## 9. Persistence / Recovery Audit

- **Atomicity**: `ActionPlanRepository.save()` uses a single `conn.commit()` after all inserts (correct). `ExecutionRepository.save_summary()` and `save_request()` are each single transactions. No per-action transaction across the whole batch is used.
- **Durability**: `PRAGMA synchronous=NORMAL` may lose the last write on power loss. Audit-critical data should use `FULL`.
- **Corruption handling**: `_recover_from_corruption()` preserves the damaged file but then deletes the working database. This is a destructive recovery that loses all state.
- **Schema version handling**: `ActionPlanRepository.load()` only rejects newer schema versions; older versions are accepted without migration logic.
- **State machine**: `_ALLOWED_TRANSITIONS` only defines `PLANNED → RUNNING` and `RUNNING → FINAL_STATES`. Recovery transitions between final states are not defined, limiting restart/recovery flexibility.
- **Audit privacy**: `get_request_audit()` returns full `context_data`/`result_data`. A privacy-safe view is not available.
- **Ledger idempotency**: Correctly seeds from `execution_results WHERE er.status = 'completed'`. Only truly completed actions are skipped on restart.

---

## 10. Execution / Rollback Audit

- **Precondition enforcement**: `DefaultExecutor` calls `preconditions.evaluate(context)` and `SafetyGate.evaluate()` before every action. `RemediationCoordinator` rebuilds `_PersistedPrecondition` placeholders into typed preconditions before execution.
- **Fresh context**: `RemediationCoordinator` supplies `FilesystemContext` re-read from disk for each action. `DefaultExecutor` rejects live mode without context.
- **Backup/TOCTOU**: `FilesystemExecutor` creates a backup, then deletes, then re-reads to verify. The main TOCTOU gap is the window between the initial `_read_live_state()` and `create_backup()`.
- **Rollback**: `RemediationCoordinator.rollback()` only restores `status == "completed"` results, verifies file hash before overwriting, and refuses to overwrite non-empty directories. It does not verify that the backup file still exists before attempting `BackupManager.restore()`.
- **Cancellation**: Cancellation tokens are checked at action boundaries. `shutil` operations in `BackupManager` are not interruptible.
- **COMPLETED reporting**: `COMPLETED` is only returned after post-execution verification in `FilesystemExecutor` and `RegistryExecutor`. However, `DefaultExecutor` can report `COMPLETED` while the audit summary/result persistence has failed.

---

## 11. Performance Observations

- **10k asset scan**: Currently passes in ~55 s because `content_fingerprint=""` is used as a scan-time optimization. Recomputing partial hashes for 10k files would exceed the 120 s threshold.
- **Full-file SHA-256**: `FilesystemExecutor._compute_sha256()` reads the entire file for the context `live.hash` comparison. For files > 100 MB this is slow and currently unavoidable if `content_fingerprint` is used. The coordinator disables `HashMatches` by rebuilding preconditions without it, which is safe for the current tests but reduces hash-based TOCTOU protection.
- **Progress throttling**: `ScanOrchestrator` emits progress every 500 items with no time-based throttling. Very fast SSDs may spam the callback.
- **Batch size**: Hardcoded `batch_size = 500` in `orchestration/orchestrator.py`.
- **Registry/binary backup**: `RegistryBackupRecord` stores value data in memory without size caps; large REG_BINARY values could exhaust memory.

---

## 12. Test Coverage Gaps

- No end-to-end `scan → plan → live → rollback` test.
- No stress test for concurrent execution of the same `request_id` with a barrier.
- No Windows extended-length path (`\\?\`, >260 chars) tests.
- No Windows device/UNC traversal tests for `validate_filesystem_path()`.
- No test for `BackupManager` failure when disk is full.
- No test for corrupted `MetadataDatabase` recovery behavior.
- No test verifying that `DefaultExecutor` persistence failures do not produce `COMPLETED` audit.
- No tests for Unicode NFC/NFD path variants.

---

## 13. Production Readiness Verdict

**`READY_WITH_REQUIRED_FIXES`**

The AVS AI Shield `scan_core` has a robust, safety-first architecture. It correctly separates discovery from execution, uses immutable models, and enforces approval, fresh context, and `SafetyGate` evaluation. The test suite is large (1177 tests) and the SC-8C6 integration tests demonstrate real live file deletion and rollback. However, the codebase is **not ready as-is** for production execution: critical persistence, context-freshness, path/registry validation, and privacy issues must be resolved before a UI exposes live remediation.

---

## 14. Required Fixes Before UI

1. **C-1**: Stop swallowing persistence exceptions; log and fail-safe instead of `COMPLETED`. (`executor.py:211-213, 232-234`; `remediation.py:139-148`)
2. **C-2**: Make database corruption recovery non-destructive; attempt WAL checkpoint/dump before deleting the database. (`database.py:166-196`)
3. **C-3**: Validate `requested_scope` paths before discovery. (`orchestration/discovery.py:88-92`)
4. **C-4**: Detect and tag reparse points/junctions in `FilesystemEnumerator`. (`enumerator.py:37, 524-541`)
5. **C-5**: Salt machine/user identifier hashes. (`context/scan_context.py:165-207`)
6. **C-6**: Close the TOCTOU window between live-state read and backup creation. (`filesystem_executor.py:254, 287-292`)
7. **C-7**: Validate registry view and protect `WOW6432Node` variants of protected keys. (`registry_executor.py:82-91`; `action_registry_validation.py:211-263`)
8. **C-8**: Replace keyword-based browser cache classification with explicit target-type checks. (`browser_executor.py:47-92`)
9. **H-1**: Add protected registry value-name list. (`action_registry_validation.py:266-306`)
10. **H-7**: Redact sensitive fields in `get_request_audit()` by default. (`execution_repository.py:307-335`)
11. **M-4**: Replace `assert` with `ValueError` in `action.py`.
12. **H-5**: Reject Windows device paths in `validate_filesystem_path()`.

---

## 15. Recommended Fixes That Can Wait

- Make `snapshot_ttl_seconds` configurable. (`safety_gate.py:92`)
- Use `PRAGMA synchronous=FULL` for audit tables. (`database.py:132`)
- Expand `StartupExecutor` executable hash verification. (`startup_executor.py`)
- Verify restored file hash in `BackupManager.restore()`. (`backup.py`)
- Add end-to-end scan-to-rollback integration test.
- Extract shared test fixtures to `tests/conftest.py`.
- Add extended-length path and Unicode normalization tests.
- Implement backup retention/cleanup policy in `RemediationCoordinator`.

---

## 16. Statement: No Code Was Modified

This audit was performed **read-only**. No source files, test files, or configuration files were modified, added, or deleted during SC-8C7. The only file created is this report, `SC8C7_FULL_SECURITY_ARCHITECTURE_AUDIT.md`.

---

## Final Label

`READY_WITH_REQUIRED_FIXES`
