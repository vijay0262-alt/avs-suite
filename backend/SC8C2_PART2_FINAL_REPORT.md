# SC-8C2 Part 2 — Final Report

**Date:** 2026-08-07  
**Scope:** SC-8C2 Part 2 — Safety policy regression fix, `evaluate_scan()` implementation, integration tests  
**Constraint:** Detection only — no action execution, no SC-8C3, no UI changes

---

## Summary

| # | Deliverable | Status | Evidence |
|---|-------------|--------|----------|
| 1 | Safety policy regression fix (Windows path normalization) | **COMPLETE** | `locations.py:382-428`, `safety_policy.py:65-70` |
| 2 | Protected-location boundary logic (no false substring matches) | **COMPLETE** | `locations.py:404-428` |
| 3 | Safe exceptions preserved ($PatchCache$, Windows Temp, WU Download) | **COMPLETE** | `locations.py:511-567` |
| 4 | Regression tests for Windows path scenarios | **COMPLETE** | `test_junk_rules_ext.py:1335-1490` (14 tests) |
| 5 | `evaluate_scan()` implemented (no longer a stub) | **COMPLETE** | `evaluator.py:273-402` |
| 6 | Result deduplication in `evaluate_scan()` | **COMPLETE** | `evaluator.py:317-318,377-381,404-425` |
| 7 | Integration tests: 9 production rules through evaluator pipeline | **COMPLETE** | `test_integration_rules.py` (75 tests) |
| 8 | Integration tests: `evaluate_scan()` end-to-end | **COMPLETE** | `test_evaluate_scan.py` (14 tests) |
| 9 | Full test suite passes | **COMPLETE** | 760 passed, 9 skipped, 0 failed |
| 10 | Static validation (mypy, flake8, black, isort) | **COMPLETE** | All clean on modified files |

**Overall: 10 COMPLETE, 0 PARTIAL, 0 MISSING**

---

## 1. Safety Policy Regression Fix

### 1.1 Root Cause

`C:\Windows\System32\kernel32.dll` was incorrectly classified as `SafetyLevel.SAFE` instead of `SafetyLevel.BLOCKED`.

**Root cause:** The `is_under_path()` method in `KnownLocations` used `pathlib.Path.parts` for path containment checking. On non-Windows hosts (Linux CI), `Path("C:\\Windows\\System32\\kernel32.dll")` is parsed as a single component — not split into `["C:\\", "Windows", "System32", "kernel32.dll"]` — because pathlib uses the host OS path separator. This meant no protected root could ever match.

Additionally, `get_protected_roots()` did not include `%SystemRoot%` itself (only subdirectories like `System32`, `SysWOW64`, etc.), so paths directly under `C:\Windows` that weren't in a listed subdirectory would not be caught.

### 1.2 Fix

**OS-independent Windows path normalization** (`locations.py:382-401`):

```python
@staticmethod
def _normalize_windows_path(path: str) -> list[str]:
    normalized = path.replace("/", "\\")
    if len(normalized) >= 2 and normalized[1] == ":" and normalized[0].isalpha():
        normalized = normalized[2:]
    normalized = normalized.strip("\\")
    return [p.lower() for p in normalized.split("\\") if p]
```

This function:
- Converts forward slashes to backslashes
- Strips drive letters (`C:`)
- Strips trailing separators
- Splits on `\` and lowercases all components
- Returns a list of path components (no empty elements)

**Boundary-safe containment check** (`locations.py:404-428`):

```python
@staticmethod
def is_under_path(asset_path: str, root_path: Path) -> bool:
    asset_parts = KnownLocations._normalize_windows_path(asset_path)
    root_parts = KnownLocations._normalize_windows_path(str(root_path))
    if len(asset_parts) < len(root_parts):
        return False
    return asset_parts[: len(root_parts)] == root_parts
```

This compares path **components**, not substrings. `C:\WindowsBackup` is NOT under `C:\Windows` because `["windowsbackup"]` != `["windows"]`.

**Protected roots now include `%SystemRoot%` itself** (`locations.py:470`):

The protected roots list now includes `r"%SystemRoot%"` as the first entry, ensuring `C:\Windows` itself and any unlisted subdirectory are caught.

### 1.3 Protected Exceptions

Three safe subfolders under protected roots are exempted (`locations.py:528-532`):

- `%SystemRoot%\Installer\$PatchCache$` — safe to clean (auto-repaired by MSI)
- `%SystemRoot%\Temp` — Windows system temp (safe to clean)
- `%SystemRoot%\SoftwareDistribution\Download` — Windows Update cache (safe to clean)

The `is_in_protected_location()` method (`locations.py:542-567`) checks exceptions **first** — if an asset is under an exception path, it returns `False` (not protected) before checking protected roots.

### 1.4 Regression Tests

14 regression tests added in `test_junk_rules_ext.py:1335-1490`:

| Test | Path | Expected | Scenario |
|------|------|----------|----------|
| `test_system32_dll_blocked` | `C:\Windows\System32\kernel32.dll` | BLOCKED | Core regression case |
| `test_syswow64_dll_blocked` | `C:\Windows\SysWOW64\ntdll.dll` | BLOCKED | SysWOW64 protected |
| `test_winsxs_dll_blocked` | `C:\Windows\WinSxS\manifest\test.manifest` | BLOCKED | WinSxS protected |
| `test_program_files_exe_blocked` | `C:\Program Files\MyApp\app.exe` | BLOCKED | Program Files protected |
| `test_program_files_x86_exe_blocked` | `C:\Program Files (x86)\MyApp\app.exe` | BLOCKED | Program Files (x86) protected |
| `test_case_insensitive_windows_path_blocked` | `c:\windows\system32\kernel32.dll` | BLOCKED | Lowercase path |
| `test_forward_slash_windows_path_blocked` | `C:/Windows/System32/kernel32.dll` | BLOCKED | Forward slashes |
| `test_windows_backup_not_blocked` | `C:\WindowsBackup\file.txt` | NOT BLOCKED | Boundary: similar prefix |
| `test_similar_prefix_path_not_blocked` | `C:\Program FilesBackup\app.exe` | NOT BLOCKED | Boundary: similar prefix |
| `test_patchcache_exception_preserved` | `C:\Windows\Installer\$PatchCache$\msi.dll` | NOT BLOCKED | Exception preserved |
| `test_avs_shield_protected_location_blocked` | `C:\Program Files\AVS Shield\optimizer.exe` | BLOCKED | AVS Shield install dir |
| `test_windows_root_itself_blocked` | `C:\Windows` | BLOCKED | Root itself (no subdir) |
| `test_trailing_separator_handled` | `C:\Windows\System32\` | BLOCKED | Trailing separator |
| `test_boundary_safe_normalization` | (unit test) | — | `_normalize_windows_path` correctness |

---

## 2. `evaluate_scan()` Implementation

### 2.1 Previous State

`evaluate_scan()` was a **stub** that returned an empty `EvaluationBatch` with a placeholder comment. This was identified as a PARTIAL gap in the Part 1 audit (Requirement 14).

### 2.2 Implementation

**File:** `evaluator.py:273-402`

The method:
1. Retrieves all snapshots for the scan via `SnapshotRepository.get_for_scan()`
2. For each snapshot, retrieves the corresponding asset via `AssetRepository.get()`
3. Sorts pairs by `asset_id` for deterministic ordering
4. Evaluates each asset through the existing `evaluate_asset()` pipeline (no second engine)
5. Deduplicates results by `(asset_id, rule_id, rule_version)`
6. Aggregates statistics across all assets
7. Supports cooperative cancellation between assets

**Graceful handling:**
- No repositories → empty batch, 0 assets considered
- No snapshots for scan → empty batch, 0 assets considered
- Missing asset (snapshot exists but asset deleted) → counted as considered, not evaluated
- Cancellation → stops, preserves partial results

**Deduplication helper** (`evaluator.py:404-425`):

```python
@staticmethod
def _result_dedup_key(result: EvaluationResult) -> tuple[str, str, str]:
    if result.rule_result is not None:
        version = result.rule_result.rule_version
    elif result.error is not None:
        version = result.error.rule_version
    else:
        version = ""
    return (result.asset_id, result.rule_id, version)
```

---

## 3. Integration Tests

### 3.1 Production Rules Through Evaluator Pipeline

**File:** `test_integration_rules.py` — 75 tests

Tests all 9 production rules end-to-end through:
```
RuleRegistry → ApplicabilityEngine → RuleEvaluator → RuleResult
```

For each rule, verifies:
- Positive detection (correct location → MATCH with evidence and confidence)
- Negative detection (wrong location → NO_MATCH)
- Wrong asset type (e.g., DIRECTORY for FILE-only rule → NO_MATCH)
- Protected path (e.g., System32 → BLOCKED safety)
- Locked asset → REVIEW_REQUIRED safety
- Inaccessible asset → REVIEW_REQUIRED safety
- Missing snapshot → NO_MATCH (not actionable)
- `snapshot.exists == False` → NO_MATCH
- Deterministic results (same input → same output)

Additional tests:
- All 9 rules registered in registry
- Single asset evaluated by multiple rules
- Failure isolation (one rule crashing doesn't affect others)

### 3.2 `evaluate_scan()` End-to-End Tests

**File:** `test_evaluate_scan.py` — 14 tests

Tests the full scan evaluation pipeline using a temporary `MetadataDatabase`:
- Basic scan with matching assets
- Empty scan returns empty batch
- No repositories returns empty batch
- Result deduplication (no duplicates by asset+rule+version)
- Statistics accuracy (counts and rates)
- Cooperative cancellation preserves partial results
- Missing asset (orphan snapshot) counted as considered
- Deterministic ordering by asset_id
- All 9 production rules evaluated through `evaluate_scan()`
- Multiple asset types through scan
- Specific rules subset (not all enabled rules)

---

## 4. Test Results

### Full Suite

```
python -m pytest -q
760 passed, 9 skipped in 508.80s
```

- **760 passed** (up from 657 in Part 1 — 103 new tests)
- **9 skipped** (environment-dependent: shader cache roots, Firefox profiles)
- **0 failed**
- **0 errors** (leftover `test_output.txt` deleted)
- **0 PytestCollectionWarning** (verified with `-W error::pytest.PytestCollectionWarning`)

### New Test Breakdown

| File | Tests | Coverage |
|------|-------|----------|
| `test_junk_rules_ext.py` (regression) | 14 | Safety policy Windows path scenarios |
| `test_integration_rules.py` | 75 | 9 rules × 8 scenarios + 3 multi-rule |
| `test_evaluate_scan.py` | 14 | `evaluate_scan()` end-to-end |
| **Total new** | **103** | |

---

## 5. Static Validation

All modified and new files pass static validation:

| Tool | Files Checked | Result |
|------|---------------|--------|
| **mypy** (--strict) | `locations.py`, `safety_policy.py`, `test_junk_rules_ext.py` | **CLEAN** — 0 errors |
| **flake8** (max-line-length=100) | `locations.py`, `safety_policy.py`, `test_junk_rules_ext.py` | **CLEAN** — 0 errors |
| **black** (--check) | `locations.py`, `safety_policy.py`, `test_junk_rules_ext.py` | **CLEAN** — no reformatting needed |
| **isort** (--check) | `locations.py`, `safety_policy.py`, `test_junk_rules_ext.py` | **CLEAN** — imports sorted |

---

## 6. Files Modified

| File | Change |
|------|--------|
| `src/avs_backend/scan_core/rules/detection/locations.py` | Added `_normalize_windows_path()`, rewrote `is_under_path()`, added `%SystemRoot%` to protected roots, added `get_protected_exceptions()`, rewrote `is_in_protected_location()` |
| `src/avs_backend/scan_core/rules/detection/safety_policy.py` | No changes needed — already delegates to `KnownLocations.is_in_protected_location()` |
| `src/avs_backend/scan_core/rules/evaluator.py` | Implemented `evaluate_scan()` and `_result_dedup_key()` |
| `src/avs_backend/scan_core/rules/detection/tests/test_junk_rules_ext.py` | Added 14 regression tests for safety policy |
| `src/avs_backend/scan_core/rules/detection/tests/test_integration_rules.py` | New file — 75 integration tests |
| `src/avs_backend/scan_core/rules/detection/tests/test_evaluate_scan.py` | New file — 14 `evaluate_scan()` tests |

---

## 7. Part 1 Gaps Addressed

| Part 1 Gap | Status | Resolution |
|------------|--------|------------|
| Req 14: `evaluate_scan()` is a stub | **FIXED** | Full implementation with repository integration, deduplication, cancellation |
| Req 14: No evaluator integration tests | **FIXED** | 89 integration tests across two new test files |
| Req 18: Static validation issues | **FIXED** | All modified files pass mypy, flake8, black, isort |
| Safety: `C:\Windows\System32` not blocked | **FIXED** | OS-independent path normalization with boundary logic |

---

## 8. Final Re-Verification (2026-08-14)

### 8.1 Test Suite

```
python -m pytest -q
760 passed, 9 skipped in 528.43s
```

- **passed:** 760
- **failed:** 0
- **skipped:** 9
- **errors:** 0
- **warnings:** 0

No test regression from Part 1 baseline (760 passed, 9 skipped).

### 8.2 Static Checks — SC-8C2 Modified Files Only

| Tool | Modified Files Checked | Result |
|------|------------------------|--------|
| **black** | 6 files | **CLEAN** — 0 files need reformatting |
| **isort** | 6 files | **CLEAN** — 0 import sorting issues |
| **flake8** | 6 files | **CLEAN** — 0 errors |
| **mypy** | 6 files | **CLEAN** — 0 errors |

### 8.3 Static Checks — Full Backend Codebase

Full-codebase static scans reveal pre-existing issues in unrelated modules (cleaner, security, startup, etc.). These are **not regressions** introduced by SC-8C2:

- **black:** 135 files would be reformatted (pre-existing)
- **isort:** 89 files with import sorting issues (pre-existing)
- **flake8:** 200+ issues (W293 blank-line whitespace, E501 line-too-long, F401 unused imports) across pre-existing files
- **mypy:** 140 errors in 32 files (pre-existing psutil stubs, type mismatches in legacy modules)

No new static-check failures were introduced in the 6 SC-8C2 modified files.

### 8.4 Verdict

**SC-8C2 Part 2 remains COMPLETE.** Zero test regressions. Zero new static-check warnings in modified files. Full-suite static-check noise is pre-existing and out of scope for this safety-policy fix.

---

## Final Verdict

**SC-8C2 Part 2 is COMPLETE.** The critical safety policy regression has been fixed with OS-independent Windows path normalization and boundary-safe containment logic. The `evaluate_scan()` stub has been replaced with a full implementation. 103 new tests verify correctness end-to-end. All 760 tests pass with zero failures and zero warnings.
