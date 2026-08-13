# AVS SHIELD — SC-8C3 Part 4 Safety Hardening Report

**Date:** 2026-08-14
**Scope:** SC-8C3 Parts 1–3 execution-readiness hardening
**Status:** COMPLETE — planning/validation only, no execution engine

---

## 1. Executive Summary

SC-8C3 Parts 1–3 are frozen. Part 4 addresses the **READY_WITH_REQUIRED_FIXES** verdict from `SC8C3_REMEDIATION_SECURITY_AUDIT.md` by closing the execution-readiness gaps identified during pre-execution review.

This work remains **planning-only**. No execution engine was implemented, no real user files or registry keys were modified, and no cleaner integrations were connected.

---

## 2. Audit Findings Fixed

| Audit Finding | Fix |
|---------------|-----|
| `canonical_path` from RuleResult trusted without validation | Added Windows-path-aware validation in `ActionPlanner` and `DefaultSafetyGate` |
| No FORBIDDEN_ROOTS protection for planned targets | Expanded forbidden-root list and made it environment-aware |
| No symlink/junction/reparse-point detection | Added `NotSymlink`, `NotJunction`, `NotReparsePoint` preconditions and `SymlinkContract` |
| No path-traversal or relative-path rejection | `validate_filesystem_path` now rejects `..`, relative paths, and unsafe UNC paths |
| Registry targets unvalidated | Added hive allowlist, protected-key denylist, parent-key protection, value-name validation, and WOW6432Node/view awareness |
| Preconditions were descriptive strings | Replaced with typed, machine-verifiable `Precondition` models in `PreconditionSet` |
| Missing safety gate contract | Created immutable `SafetyGate` protocol returning `APPROVED`, `REJECTED`, `REQUIRES_REVIEW` |
| No snapshot freshness | `ActionPlan` now records `snapshot_timestamp`, `snapshot_version`, and `snapshot_ttl_seconds` with `is_stale()` |
| TOCTOU (target replacement between scan and execution) | Added `TargetIdentityMatches`, `SizeMatches`, `ModifiedTimeMatches`, `HashMatches`, and re-verification contracts |
| Browser cache vs user data | Added `BrowserNotRunning`, `ProfileExists`, and `CacheScopeValid` preconditions; only cache scope is planned |
| `display_name` could influence targets | `ActionPlanner` never uses `display_name` as an execution target; it always uses `canonical_path` or `asset_id` |

---

## 3. Path Validation

### Implementation

- `action_path_validation.py`
- `ActionPlanner._build_target()`
- `DefaultSafetyGate.evaluate()`

### Hardening Applied

- **Forbidden roots:** system and user-protected locations (`C:\Windows`, `C:\Windows\System32`, `C:\Program Files`, `C:\ProgramData`, user documents, etc.)
- **Environment expansion:** `%SystemRoot%`, `%ProgramFiles%`, `%ProgramData%`, `%USERPROFILE%` are expanded before comparison
- **Path traversal:** any `..` component is rejected
- **Relative paths:** rejected unless explicitly allowed
- **UNC paths:** rejected unless explicitly allowed
- **Drive-letter awareness:** Windows `C:` style paths handled separately from POSIX-style and leading-slash absolute paths
- **Symlink/junction/reparse-point contracts:** recorded as preconditions; actual filesystem inspection is reserved for the future executor

### Files Affected

- `src/avs_backend/scan_core/rules/action_path_validation.py`
- `src/avs_backend/scan_core/rules/action.py`
- `src/avs_backend/scan_core/rules/safety_gate.py`

---

## 4. Registry Validation

### Implementation

- `action_registry_validation.py`
- `ActionPlanner._build_target()` for `RegistryActionTarget`

### Hardening Applied

- **Hive allowlist:** only `HKLM`, `HKCU`, `HKCR`, `HKU`, `HKCC` and their long forms are accepted
- **Hive normalization:** short canonical names are produced consistently
- **Protected-key denylist:** critical keys like `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run` are rejected
- **Protected prefixes:** any target under `HKLM\SYSTEM\CurrentControlSet`, `HKCR\CLSID`, etc. is rejected
- **Parent-key protection:** `REMOVE_REGISTRY_KEY` cannot delete a parent of protected keys
- **Value-name validation:** backslash and null bytes rejected; path-like value names are rejected
- **WOW6432Node/view awareness:** view is recorded as `wow6432node` when the marker appears in the key path

### Files Affected

- `src/avs_backend/scan_core/rules/action_registry_validation.py`
- `src/avs_backend/scan_core/rules/action.py`

---

## 5. Typed Preconditions

### Implementation

- `action_preconditions.py`
- `RemediationAction.preconditions` is now a `PreconditionSet` of `Precondition` objects
- `PreconditionSet.evaluate()` can be called by the future executor with an execution context

### Condition Models

| Precondition | Semantics |
|--------------|-----------|
| `TargetExists` | `context["exists"] == expected` |
| `TargetAccessible` | `context["accessible"] == expected` |
| `TargetNotLocked` | `context["locked"] != expected` |
| `TargetIdentityMatches` | `context["asset_id"] == expected_asset_id` |
| `PathWithinAllowedScope` | canonical path is within allowed location |
| `SnapshotFresh` | snapshot age <= `max_age_seconds` |
| `SizeMatches` | `context["size"] == expected_size` |
| `ModifiedTimeMatches` | `context["modified_time"] == expected_mtime` |
| `HashMatches` | `context["content_hash"] == expected_hash` |
| `RegistryHiveMatches` | `context["registry_hive"] == expected_hive` |
| `RegistryKeyExists` | `context["registry_key_exists"] == expected` |
| `RegistryValueExists` | `context["registry_value_exists"] == expected` |
| `BrowserNotRunning` | browser not in `context["running_browsers"]` |
| `CacheScopeValid` | `context["cache_type"] == cache_type` |
| `ProfileExists` | profile in `context["browser_profiles"]` |
| `SafetyLevelValid` | `context["safety_level"]` in allowed set |
| `NotSymlink` / `NotJunction` / `NotReparsePoint` | filesystem attributes are not set |

### Files Affected

- `src/avs_backend/scan_core/rules/action_preconditions.py`
- `src/avs_backend/scan_core/rules/action.py`

---

## 6. Safety Gate Contract

### Implementation

- `safety_gate.py`
- `SafetyGate` protocol
- `DefaultSafetyGate` immutable implementation
- `SafetyGateResult` enum (`APPROVED`, `REJECTED`, `REQUIRES_REVIEW`)

### Design

- The safety gate is a **separate, immutable contract** between `ActionPlan` and the future `Executor`.
- It evaluates safety **independently** of the `ActionPlanner`.
- The future executor is expected to call the gate for every action; the gate is a `Protocol`, so a different implementation can be supplied, but the contract is fixed.

### Default Gate Behavior

1. Reject `BLOCKED`, `NOT_FIXABLE`, `MISSING_TARGET`, `LOCKED_TARGET`, and `CONFLICT` actions
2. Return `REQUIRES_REVIEW` for `REVIEW_REQUIRED` actions
3. Reject stale plans
4. Evaluate all typed preconditions against the live execution context
5. Reject missing, locked, or inaccessible targets
6. Reject identity mismatches
7. Re-validate filesystem paths
8. Optional hash verification

### Files Affected

- `src/avs_backend/scan_core/rules/safety_gate.py`
- `src/avs_backend/scan_core/rules/action.py`

---

## 7. Snapshot Freshness and TOCTOU Protection

### Snapshot Freshness

- `ActionPlan.snapshot_timestamp`
- `ActionPlan.snapshot_version`
- `ActionPlan.snapshot_ttl_seconds` (configurable)
- `ActionPlan.is_stale()`
- `DefaultSafetyGate` rejects plans older than the TTL

### TOCTOU Re-verification Contracts

Preconditions capture the expected asset state at planning time:

- `TargetIdentityMatches` — re-verify the same `asset_id`
- `SizeMatches` — detect file replacement
- `ModifiedTimeMatches` — detect file modification
- `HashMatches` — detect content change
- `TargetExists` / `TargetAccessible` / `TargetNotLocked` — detect deletion/locking

The future executor must re-validate these immediately before action.

### Files Affected

- `src/avs_backend/scan_core/rules/action.py`
- `src/avs_backend/scan_core/rules/action_preconditions.py`
- `src/avs_backend/scan_core/rules/safety_gate.py`

---

## 8. Browser Safety

### Hardening Applied

- `BrowserActionTarget` records `browser`, `profile`, `cache_type`, `path`
- `user_data_safe` and `cache_only` flags are always set to safe values
- The planner only produces `cache_type == "cache"`
- Preconditions include:
  - `BrowserNotRunning`
  - `ProfileExists`
  - `CacheScopeValid`

### Scope Distinguishing

- `CacheScopeValid` fails for `cookies`, `history`, `login-data` contexts, preventing user-data targeting
- Paths containing `Cookies`, `History`, `Login Data` are not considered cache

### Files Affected

- `src/avs_backend/scan_core/rules/action.py`
- `src/avs_backend/scan_core/rules/action_preconditions.py`

---

## 9. Security Invariants Tested

The new test suite `test_action_part4_safety.py` explicitly verifies:

- `BLOCKED` → never executable (safety gate rejects)
- `REVIEW_REQUIRED` → never silently executable (returns `REQUIRES_REVIEW`)
- `UNKNOWN` / `NOT_FIXABLE` → never executable
- Stale plan → rejected
- Changed target (size, hash, mtime) → rejected
- Protected path (`System32`, `Windows`, `Program Files`, `ProgramData`, user documents) → rejected
- Unsafe registry target (`Run`, protected parents) → rejected
- Browser user-data target (cookies) → rejected
- Browser running → rejected
- Missing/locked targets → not executable
- `display_name` never used as execution target
- UNC and traversal paths rejected

### Test Counts

- `test_action.py` (existing Part 3 contract tests): 39 passed
- `test_action_part4_safety.py` (new Part 4 safety tests): 59 passed
- Combined rule test files: 98 passed
- Full `python -m pytest -q` suite: see validation section

---

## 10. Validation

All validation commands were run on the modified/new files and the project test suite.

| Tool | Command | Result |
|------|---------|--------|
| pytest (full suite) | `python -m pytest -q` | 952 passed, 9 skipped |
| pytest (rule tests) | `python -m pytest -q src/avs_backend/scan_core/rules/tests/test_action.py src/avs_backend/scan_core/rules/tests/test_action_part4_safety.py` | 98 passed |
| mypy | `python -m mypy <modified files>` | Success: no issues found |
| flake8 | `python -m flake8 --max-line-length=100 <modified files>` | No issues |
| black | `python -m black --check <modified files>` | All files formatted |
| isort | `python -m isort --check-only <modified files>` | No issues |

### No System Modification

Static source inspection confirms the implementation contains no:

- `os.remove`
- `os.unlink`
- `shutil` operations
- registry writes
- `subprocess` calls
- PowerShell invocation
- process termination
- cleaner execution calls

---

## 11. Files Added or Modified

### Modified

- `src/avs_backend/scan_core/rules/action.py`
- `src/avs_backend/scan_core/rules/action_path_validation.py`
- `src/avs_backend/scan_core/rules/action_preconditions.py`
- `src/avs_backend/scan_core/rules/action_registry_validation.py`
- `src/avs_backend/scan_core/rules/safety_gate.py`

### Added

- `src/avs_backend/scan_core/rules/tests/test_action_part4_safety.py`
- `SC8C3_PART4_SAFETY_HARDENING_REPORT.md` (this file)

---

## 12. Remaining Risks

The following risks are acknowledged and intentionally deferred to the future execution engine and/or SC-8C4:

1. **Execution-time filesystem inspection** — actual symlink/junction/reparse-point detection requires `os.lstat` and Windows reparse-point attribute checks at the moment of execution.
2. **Hash verification** — content hashing is optional; a future scanner must populate `content_hash` for it to be enforceable.
3. **Registry value read-back** — the gate checks contract strings, but actual registry existence and value type must be re-verified by the executor.
4. **Browser process detection** — `BrowserNotRunning` is a contract; the executor must query the OS process list.
5. **Backup and rollback** — backup location and identity are still placeholders; the execution engine must fill them.
6. **Concurrency** — concurrent plan execution and partially executed plans are not addressed in this planning layer.
7. **Full legacy cleaner integration** — this hardening provides the contract but does not wire existing cleaners to the new `ActionPlan`.

---

## 13. Stop Conditions Observed

- SC-8C4 was not implemented.
- No actions were executed.
- No real user files or registry keys were modified.
- No existing cleaners were connected.
- Dashboard/UI was not changed.
- Validation stopped after the Part 4 hardening tests and checks.

---

*End of report.*
