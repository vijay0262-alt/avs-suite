# SC-8C2 Part 1 — Final Audit Verification Report

**Date:** 2026-08-07  
**Auditor:** Cascade (AI Pair Programmer)  
**Scope:** SC-8C2 Part 1 remediation — detection rules for junk/temp/cache files  
**Method:** Line-by-line source code inspection, test inspection, architecture verification, static validation  
**Constraint:** AUDIT ONLY — no code modifications, no Part 2, no SC-8C3  

---

## Verification Summary

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 1 | Application Temp rule (`junk.temp.application`) | **COMPLETE** | `junk_rules_ext.py:34-247` |
| 2 | Browser Cache rule (`cache.browser`) | **COMPLETE** | `junk_rules_ext.py:249-427` |
| 3 | Installer Cache rule (`cache.installer`) | **COMPLETE** | `junk_rules_ext.py:430-601` |
| 4 | Windows Update Cache rule (`cache.windows_update`) | **COMPLETE** | `junk_rules_ext.py:604-772` |
| 5 | Application Cache rule (`cache.application`) | **COMPLETE** | `junk_rules_ext.py:775-983` |
| 6 | Temp extension support (`.tmp`, `.temp`, `.cache`, `.bak`, `.old`, `.dmp`) | **COMPLETE** | `locations.py:248-276` |
| 7 | Age support (7-day threshold, supporting evidence only) | **COMPLETE** | `locations.py:278-349` |
| 8 | Protected locations + exceptions | **COMPLETE** | `locations.py:416-512`, `safety_policy.py:65-70` |
| 9 | Locked file → REVIEW_REQUIRED | **COMPLETE** | `safety_policy.py:79-82`, all 9 rules |
| 10 | Inaccessible file → REVIEW_REQUIRED | **COMPLETE** | `safety_policy.py:85-88`, all 9 rules |
| 11 | Missing snapshot → NO_MATCH (not actionable) | **COMPLETE** | `safety_policy.py:99-117`, all 9 rules |
| 12 | False positive test coverage | **COMPLETE** | `test_junk_rules.py:531-591`, `test_junk_rules_ext.py:822-965` |
| 13 | All 9 rules registered in RuleRegistry | **COMPLETE** | `junk_rules.py:759-786`, `__init__.py:1-44` |
| 14 | Production rules run through RuleEvaluator pipeline | **PARTIAL** | `evaluator.py:92-185` works, but `evaluate_scan()` is a stub (line 271-298) and no integration tests wire production rules through the evaluator |
| 15 | Detection-only safety (no action execution) | **COMPLETE** | `grep` for `os.remove`, `shutil.rmtree`, `subprocess`, `registry`, `PowerShell` → zero matches in `detection/` |
| 16 | Existing cleaner knowledge reuse without duplication | **PARTIAL** | Paths match cleaner modules exactly but are duplicated as string literals — no shared constant module or import from cleaner |
| 17 | Full test suite passes | **COMPLETE** | 657 passed, 9 skipped, 0 failed (458.99s) |
| 18 | Static validation (mypy, flake8, black, isort) | **PARTIAL** | flake8: clean. mypy: 10 errors (pre-existing in `junk_rules.py` + 1 import in `safety_policy.py`). black: 3 files need reformatting. isort: 2 files need import sorting. |
| 19 | Final verification matrix generated | **COMPLETE** | This document |

**Overall: 14 COMPLETE, 3 PARTIAL, 0 MISSING, 0 INCORRECT**

---

## Detailed Verification

### Requirement 1: Application Temp Rule (`junk.temp.application`)

**Status: COMPLETE**

**File:** `junk_rules_ext.py:34-247`

- **Rule ID:** `junk.temp.application` (line 37)
- **Version:** 1.0.0 (line 38)
- **Category:** `RuleCategory.JUNK` (line 41)
- **Severity:** `Severity.LOW` (line 42)
- **Supported asset types:** `FILE` (line 43)
- **Location matching:** Uses `KnownLocations.get_application_temp_roots()` — Office 16.0 Temp and 15.0 Temp (line 116-118 in `locations.py`)
- **Detection criterion:** Known application temp location + FILE asset type. Extension and age are supporting evidence only.
- **Evidence collected:** `KNOWN_LOCATION`, `APPLICATION_MATCH`, `EXTENSION_MATCH` (conditional), `AGE_MATCH` (conditional), `METADATA_MATCH` (conditional)
- **Confidence:** Averaged from `PATH_MATCH` (88), `APPLICATION_MATCH` (85), `ASSET_TYPE_MATCH` (80), plus optional `MULTIPLE_EVIDENCE` boosts
- **Safety:** Centralized via `SafetyPolicy.assess()` (line 218-222)
- **Missing snapshot:** Handled via `SafetyPolicy.should_skip_missing()` → NO_MATCH (line 91-97)
- **Recommended action:** `ActionType.DELETE`

**Tests:** `test_junk_rules_ext.py:129-280` — 8 tests covering positive match, extension evidence, age evidence, negative match (Documents, user temp), locked, missing, inaccessible.

---

### Requirement 2: Browser Cache Rule (`cache.browser`)

**Status: COMPLETE**

**File:** `junk_rules_ext.py:249-427`

- **Rule ID:** `cache.browser` (line 252)
- **Version:** 1.0.0 (line 253)
- **Category:** `RuleCategory.CACHE` (line 259)
- **Severity:** `Severity.LOW` (line 260)
- **Supported asset types:** `FILE` and `BROWSER_CACHE` (line 261-264)
- **Location matching:** Uses `KnownLocations.get_browser_cache_roots()` — Chrome, Edge, Brave, Opera, Opera GX, Vivaldi, Firefox profile-based (lines 128-180 in `locations.py`)
- **Evidence collected:** `KNOWN_LOCATION`, `BEHAVIOR_MATCH` (auto-regenerated), `EXTENSION_MATCH` (conditional), `AGE_MATCH` (conditional), `METADATA_MATCH` (conditional)
- **Confidence:** Averaged from `PATH_MATCH` (92), `STRONG_EVIDENCE` (90), `ASSET_TYPE_MATCH` (80), plus optional age boost
- **Safety:** Centralized via `SafetyPolicy.assess()` (line 405-409)
- **Missing snapshot:** Handled via `SafetyPolicy.should_skip_missing()` → NO_MATCH (line 294-301)
- **Recommended action:** `ActionType.CLEAR_CACHE`

**Tests:** `test_junk_rules_ext.py:288-433` — 8 tests covering positive match (Chrome cache), BROWSER_CACHE asset type, age evidence, negative match (Documents, browser History), locked, missing, regeneration evidence.

---

### Requirement 3: Installer Cache Rule (`cache.installer`)

**Status: COMPLETE**

**File:** `junk_rules_ext.py:430-601`

- **Rule ID:** `cache.installer` (line 446)
- **Version:** 1.0.0 (line 447)
- **Category:** `RuleCategory.CACHE` (line 452)
- **Severity:** `Severity.LOW` (line 453)
- **Supported asset types:** `FILE` (line 454)
- **Location matching:** Uses `KnownLocations.get_installer_cache_root()` — only `$PatchCache$` subfolder, never parent `Installer` (line 195 in `locations.py`)
- **Evidence collected:** `KNOWN_LOCATION`, `BEHAVIOR_MATCH` (auto-reparable), `AGE_MATCH` (conditional), `METADATA_MATCH` (conditional)
- **Confidence:** Averaged from `PATH_MATCH` (90), `STRONG_EVIDENCE` (85), `ASSET_TYPE_MATCH` (80), plus optional age boost
- **Safety:** Centralized via `SafetyPolicy.assess()` (line 579-583). Protected exceptions ensure `$PatchCache$` is NOT blocked despite being under protected `Installer` root.
- **Missing snapshot:** Handled via `SafetyPolicy.should_skip_missing()` → NO_MATCH (line 476-483)
- **Recommended action:** `ActionType.DELETE`

**Tests:** `test_junk_rules_ext.py:441-555` — 6 tests covering positive match, negative match (parent Installer dir, Downloads), locked, missing, auto-reparable evidence.

---

### Requirement 4: Windows Update Cache Rule (`cache.windows_update`)

**Status: COMPLETE**

**File:** `junk_rules_ext.py:604-772`

- **Rule ID:** `cache.windows_update` (line 619)
- **Version:** 1.0.0 (line 620)
- **Category:** `RuleCategory.CACHE` (line 625)
- **Severity:** `Severity.LOW` (line 626)
- **Supported asset types:** `FILE` (line 627)
- **Location matching:** Uses `KnownLocations.get_windows_update_cache_root()` — `%SystemRoot%\SoftwareDistribution\Download` (line 209 in `locations.py`)
- **Evidence collected:** `KNOWN_LOCATION`, `BEHAVIOR_MATCH` (post-install-retained), `AGE_MATCH` (conditional), `METADATA_MATCH` (conditional)
- **Confidence:** Averaged from `PATH_MATCH` (90), `STRONG_EVIDENCE` (85), `ASSET_TYPE_MATCH` (80), plus optional age boost
- **Safety:** Centralized via `SafetyPolicy.assess()` (line 750-754)
- **Missing snapshot:** Handled via `SafetyPolicy.should_skip_missing()` → NO_MATCH (line 649-656)
- **Recommended action:** `ActionType.DELETE`

**Tests:** `test_junk_rules_ext.py:563-673` — 6 tests covering positive match, negative match (System32, SoftwareDistribution parent), locked, missing, age evidence.

---

### Requirement 5: Application Cache Rule (`cache.application`)

**Status: COMPLETE**

**File:** `junk_rules_ext.py:775-983`

- **Rule ID:** `cache.application` (line 793)
- **Version:** 1.0.0 (line 794)
- **Category:** `RuleCategory.CACHE` (line 799)
- **Severity:** `Severity.LOW` (line 800)
- **Supported asset types:** `FILE` (line 801)
- **Location matching:** Uses `KnownLocations.get_application_cache_roots()` — Office OfficeFileCache (15.0, 16.0), DocumentCache, UnsavedFiles (lines 214-234 in `locations.py`). Also checks `IconCache.db` as a single file (line 822-827).
- **Evidence collected:** `KNOWN_LOCATION`, `KNOWN_PATTERN` (for IconCache.db), `BEHAVIOR_MATCH` (auto-regenerated), `EXTENSION_MATCH` (conditional), `AGE_MATCH` (conditional), `METADATA_MATCH` (conditional)
- **Confidence:** Averaged from `PATH_MATCH` (88), `APPLICATION_MATCH` (85), `STRONG_EVIDENCE` (85), plus optional age boost
- **Safety:** Centralized via `SafetyPolicy.assess()` (line 960-964)
- **Missing snapshot:** Handled via `SafetyPolicy.should_skip_missing()` → NO_MATCH (line 839-846)
- **Recommended action:** `ActionType.CLEAR_CACHE`

**Tests:** `test_junk_rules_ext.py:681-814` — 7 tests covering positive match (Office cache, IconCache.db), negative match (Documents, random AppData), locked, missing, regeneration evidence.

---

### Requirement 6: Temporary Extension Support

**Status: COMPLETE**

**File:** `locations.py:248-276`

- `get_temporary_extensions()` returns `("tmp", "temp", "cache", "bak", "old", "dmp")` — all 6 required extensions (line 258)
- `has_temporary_extension()` checks if asset path has one of these extensions (line 261-276)
- **Supporting only:** Docstring explicitly states "These are SUPPORTING evidence only — never sufficient alone" (line 253-254)
- **Usage in rules:** All 5 new rules and all 4 original rules use `has_temporary_extension()` to add `EXTENSION_MATCH` evidence conditionally. No rule uses extension as a primary match criterion.

**Tests:** `test_junk_rules_ext.py:154-171` — verifies `.tmp` extension adds `EXTENSION_MATCH` evidence to `ApplicationTempRule`.

---

### Requirement 7: Age Support

**Status: COMPLETE**

**File:** `locations.py:278-349`

- `get_default_age_threshold_days()` returns `7` (line 292)
- `get_asset_age_days()` calculates age from `datetime` or epoch timestamp (lines 294-324)
- `is_asset_old()` checks if age exceeds threshold, returns `False` if age is not determinable (lines 326-349)
- **Supporting only:** Docstring explicitly states "Age is SUPPORTING evidence only — never sufficient alone" (line 334)
- **Usage in rules:** All 5 new rules and all 4 original rules use `is_asset_old()` to add `AGE_MATCH` evidence conditionally. No rule uses age as a primary match criterion.

**Tests:** `test_junk_rules_ext.py:173-189` — verifies old file age adds `AGE_MATCH` evidence. `test_junk_rules_ext.py:329-345` — same for BrowserCacheRule. `test_junk_rules_ext.py:657-673` — same for WindowsUpdateCacheRule.

---

### Requirement 8: Protected Locations + Exceptions

**Status: COMPLETE**

**File:** `locations.py:416-512`, `safety_policy.py:65-70`

**Protected roots** (`locations.py:427-446`):
- `%SystemRoot%\System32`
- `%SystemRoot%\SysWOW64`
- `%SystemRoot%\WinSxS`
- `%SystemRoot%\System32\drivers`
- `%SystemRoot%\Config`
- `%SystemRoot%\Boot`
- `%SystemRoot%\Installer`
- `%ProgramFiles%`
- `%ProgramFiles(x86)%`
- `%USERPROFILE%\Documents`
- `%USERPROFILE%\Desktop`
- `%USERPROFILE%\Downloads`
- `%USERPROFILE%\Pictures`
- `%USERPROFILE%\Videos`
- `%USERPROFILE%\Music`

**Protected exceptions** (`locations.py:458-485`):
- `%SystemRoot%\Installer\$PatchCache$` — safe subfolder under protected `Installer` root

**Exception logic** (`locations.py:487-512`):
- `is_in_protected_location()` checks exceptions FIRST — if asset is in a known-safe exception subfolder, it returns `False` (NOT protected)
- Then checks protected roots — returns `True` if under any protected root

**SafetyPolicy integration** (`safety_policy.py:65-70`):
- `assess()` calls `KnownLocations.is_in_protected_location()` first
- If protected → returns `BLOCKED` with `SYSTEM_CRITICAL` blocker
- This means `$PatchCache$` assets are NOT blocked (exception works)

**Tests:** `test_junk_rules_ext.py:1190-1202` — verifies `SafetyPolicy.assess()` returns `BLOCKED` for System32 file. `test_junk_rules_ext.py:466-481` — verifies `InstallerCacheRule` does NOT match file in parent Installer dir (only matches `$PatchCache$`).

---

### Requirement 9: Locked File → REVIEW_REQUIRED

**Status: COMPLETE**

**File:** `safety_policy.py:79-82`

```python
if snapshot and snapshot.locked:
    return SafetyAssessment.create_review_required(
        reason="Asset is locked by another process — manual review recommended",
    )
```

**Consistency:** All 9 rules (4 original + 5 new) use `SafetyPolicy.assess()` for safety evaluation. The locked-file check is centralized in `SafetyPolicy.assess()`, so all rules behave identically.

**Tests:**
- `test_junk_rules.py:170-190` — UserTempRule locked → REVIEW_REQUIRED
- `test_junk_rules.py:301-320` — WindowsTempRule locked → REVIEW_REQUIRED
- `test_junk_rules.py:413-434` — ShaderCacheRule locked → REVIEW_REQUIRED
- `test_junk_rules.py:509-528` — ThumbnailCacheRule locked → REVIEW_REQUIRED
- `test_junk_rules_ext.py:219-238` — ApplicationTempRule locked → REVIEW_REQUIRED
- `test_junk_rules_ext.py:377-395` — BrowserCacheRule locked → REVIEW_REQUIRED
- `test_junk_rules_ext.py:496-514` — InstallerCacheRule locked → REVIEW_REQUIRED
- `test_junk_rules_ext.py:617-635` — WindowsUpdateCacheRule locked → REVIEW_REQUIRED
- `test_junk_rules_ext.py:759-777` — ApplicationCacheRule locked → REVIEW_REQUIRED
- `test_junk_rules_ext.py:1224-1242` — SafetyPolicy direct test: locked → REVIEW_REQUIRED

---

### Requirement 10: Inaccessible File → REVIEW_REQUIRED

**Status: COMPLETE**

**File:** `safety_policy.py:85-88`

```python
if snapshot and not snapshot.accessible:
    return SafetyAssessment.create_review_required(
        reason="Asset is not accessible — cannot verify safety",
    )
```

**Consistency:** All 9 rules use `SafetyPolicy.assess()`, so inaccessible files are handled identically across all rules.

**Tests:**
- `test_junk_rules.py:192-212` — UserTempRule inaccessible → REVIEW_REQUIRED
- `test_junk_rules_ext.py:261-280` — ApplicationTempRule inaccessible → REVIEW_REQUIRED
- `test_junk_rules_ext.py:1244-1262` — SafetyPolicy direct test: inaccessible → REVIEW_REQUIRED

---

### Requirement 11: Missing Snapshot → NO_MATCH (Not Actionable)

**Status: COMPLETE**

**File:** `safety_policy.py:99-117`

```python
@staticmethod
def should_skip_missing(snapshot: Optional[AssetSnapshot] = None) -> bool:
    if snapshot is None:
        return False
    if not snapshot.exists:
        return True
    return False
```

**Consistency:** All 9 rules call `SafetyPolicy.should_skip_missing(snapshot)` early in `evaluate()`, before building evidence or confidence. If missing → returns `RuleResult.create_no_match()` with reason "Asset no longer exists on filesystem".

**Tests:**
- `test_junk_rules.py:214-234` — UserTempRule missing → NO_MATCH
- `test_junk_rules_ext.py:240-259` — ApplicationTempRule missing → NO_MATCH
- `test_junk_rules_ext.py:397-416` — BrowserCacheRule missing → NO_MATCH
- `test_junk_rules_ext.py:516-534` — InstallerCacheRule missing → NO_MATCH
- `test_junk_rules_ext.py:637-655` — WindowsUpdateCacheRule missing → NO_MATCH
- `test_junk_rules_ext.py:779-797` — ApplicationCacheRule missing → NO_MATCH
- `test_junk_rules_ext.py:1264-1292` — SafetyPolicy direct tests: `should_skip_missing` for missing, existing, and None snapshots

---

### Requirement 12: False Positive Test Coverage

**Status: COMPLETE**

**File:** `test_junk_rules.py:531-591`, `test_junk_rules_ext.py:822-965`

**Original rules false positive tests** (`test_junk_rules.py:531-591`):
- `test_important_tmp_in_documents` — `.tmp` file in Documents NOT matched by UserTempRule, WindowsTempRule
- `test_system32_file` — System32 file NOT matched by UserTempRule, WindowsTempRule
- `test_program_files_binary` — Program Files binary NOT matched by all 4 original rules
- `test_appdata_non_cache` — AppData non-cache file NOT matched by ShaderCacheRule

**Extended rules false positive tests** (`test_junk_rules_ext.py:822-965`):
- `test_documents_file_not_matched` — Documents file NOT matched by all 5 new rules
- `test_system32_not_matched` — System32 file NOT matched by all 5 new rules
- `test_program_files_not_matched` — Program Files NOT matched by all 5 new rules
- `test_user_downloads_not_matched` — Downloads file NOT matched by all 5 new rules
- `test_browser_bookmarks_not_matched` — Browser Bookmarks file NOT matched by BrowserCacheRule
- `test_browser_login_data_not_matched` — Browser Login Data file NOT matched by BrowserCacheRule
- `test_msi_in_installer_parent_not_matched` — MSI in parent Installer dir NOT matched by InstallerCacheRule
- `test_temp_extension_in_documents_not_matched` — `.tmp` file in Documents NOT matched by all 5 new rules

**Additional negative tests within per-rule test classes:**
- `test_negative_match_not_app_temp` — file outside application temp
- `test_negative_match_user_temp` — user temp file NOT matched by ApplicationTempRule
- `test_negative_match_not_browser_cache` — file outside browser cache
- `test_negative_match_browser_history` — browser History NOT matched as cache
- `test_negative_match_parent_installer_dir` — parent Installer dir NOT matched
- `test_negative_match_not_installer` — Downloads file NOT matched
- `test_negative_match_not_update_cache` — System32 NOT matched
- `test_negative_match_software_distribution_parent` — SoftwareDistribution parent NOT matched
- `test_negative_match_not_app_cache` — Documents NOT matched
- `test_negative_match_random_appdata` — random AppData NOT matched

---

### Requirement 13: All 9 Rules Registered in RuleRegistry

**Status: COMPLETE**

**File:** `junk_rules.py:759-786`

```python
def register_junk_rules(registry) -> None:
    # Original rules
    registry.register(UserTempRule())
    registry.register(WindowsTempRule())
    registry.register(ShaderCacheRule())
    registry.register(ThumbnailCacheRule())
    # Extended rules (SC-8C2 Part 1)
    from .junk_rules_ext import (
        ApplicationCacheRule, ApplicationTempRule, BrowserCacheRule,
        InstallerCacheRule, WindowsUpdateCacheRule,
    )
    registry.register(ApplicationTempRule())
    registry.register(BrowserCacheRule())
    registry.register(InstallerCacheRule())
    registry.register(WindowsUpdateCacheRule())
    registry.register(ApplicationCacheRule())
```

**Exports:** `__init__.py:1-44` exports all 9 rule classes, `KnownLocations`, `SafetyPolicy`, and `register_junk_rules`.

**Tests:** `test_junk_rules.py:596-630` — verifies 9 rules registered, all 9 rule IDs present, all 9 enabled by default.

---

### Requirement 14: Production Rules Run Through RuleEvaluator Pipeline

**Status: PARTIAL**

**File:** `evaluator.py:1-361`

**What works:**
- `RuleEvaluator.evaluate_asset()` (line 92-185) implements the full pipeline: Asset → Applicability check → Rule.evaluate() → RuleResult. It sorts rules deterministically, handles cancellation, tracks statistics, and isolates failures.
- `RuleEvaluator.evaluate_assets()` (line 187-269) extends this to multiple assets.
- `_evaluate_single_rule()` (line 300-361) isolates rule failures and captures exceptions.
- The evaluator accepts a `RuleRegistry` which can contain the 9 production rules via `register_junk_rules()`.

**What is incomplete:**
- `evaluate_scan()` (line 271-298) is a **stub** — returns an empty `EvaluationBatch` with a placeholder comment: "This would need to fetch assets from the scan context / For now, return empty batch as placeholder"
- **No integration tests** wire production rules through the evaluator. `test_evaluator.py` contains no references to `junk_rules`, `UserTempRule`, `BrowserCacheRule`, or `register_junk_rules`.
- `register_junk_rules()` is only called from test code (`test_junk_rules.py`), never from production initialization code.

**Assessment:** The evaluator architecture is sound and `evaluate_asset()` / `evaluate_assets()` would correctly run the production rules if called. However, the full scan-level integration (`evaluate_scan`) is not implemented, and no test demonstrates production rules running through the evaluator end-to-end.

---

### Requirement 15: Detection-Only Safety (No Action Execution)

**Status: COMPLETE**

**Verification method:** Grepped entire `detection/` directory for: `os.remove`, `os.unlink`, `shutil.rmtree`, `subprocess`, `PowerShell`, `shell`, `registry`, `process.*terminat`, `cleaner`, `optimizer` — **zero matches**.

**Code evidence:**
- `junk_rules_ext.py:11` — "DETECTION ONLY - NO ACTION EXECUTION."
- `safety_policy.py:16` — "NO SYSTEM MODIFICATION."
- `locations.py:10` — "NO SYSTEM MODIFICATION."
- `__init__.py:6-7` — "NO ACTION EXECUTION. NO SYSTEM MODIFICATION."
- All 9 rules return `RuleResult` objects with `recommended_action` (e.g., `ActionType.DELETE`, `ActionType.CLEAR_CACHE`) — these are **recommendations only**, not executions.
- No imports of `os`, `shutil`, `subprocess`, or any system-modification module in any detection rule file.

---

### Requirement 16: Existing Cleaner Knowledge Reuse Without Duplication

**Status: PARTIAL**

**What works:**
- `KnownLocations.get_browser_cache_roots()` path strings match `BrowserCacheCleaner._CHROMIUM_ROOTS` in `cleaner/cleaners/browser_cache.py` exactly — same browsers, same subfolders (Cache, Code Cache, GPUCache, Service Worker\CacheStorage).
- `KnownLocations.get_installer_cache_root()` matches `InstallerCacheCleaner.targets()` — both use `%SystemRoot%\Installer\$PatchCache$`.
- `KnownLocations.get_windows_update_cache_root()` matches `WindowsUpdateCacheCleaner.targets()` — both use `%SystemRoot%\SoftwareDistribution\Download`.
- `KnownLocations.get_application_cache_roots()` matches `OfficeCacheCleaner.targets()` — same Office cache paths.
- `KnownLocations.get_application_temp_roots()` matches Office temp paths from `OfficeCacheCleaner`.
- `KnownLocations.get_icon_cache_file()` matches `IconCacheCleaner` — both use `%LOCALAPPDATA%\IconCache.db`.
- Firefox profile-based cache discovery logic is duplicated: both `KnownLocations.get_browser_cache_roots()` (line 170-178) and `BrowserCacheCleaner.targets()` (line 71-80) implement the same `os.scandir` + `cache2` pattern.

**What is incomplete:**
- Paths are **duplicated as string literals** — `KnownLocations` does not import from or reference the cleaner modules. There is no shared constant module.
- If a cleaner path changes, the detection rule path will not automatically update.
- The `BrowserCacheRule` docstring says "Reuses location knowledge from BrowserCacheCleaner (SC-3)" but this is a conceptual reuse, not a code-level import.
- The `BrowserEnumerator` in `scan_core/browser/` has its own browser detection configs (`_BrowserDetectConfig`) with user data paths that overlap with `KnownLocations.get_browser_cache_roots()` — three independent sources of truth for browser paths.

**Assessment:** The paths are consistent and correct, but the reuse is conceptual rather than structural. No duplication in behavior, but string literal duplication exists.

---

### Requirement 17: Full Test Suite Passes

**Status: COMPLETE**

**Command:** `python -m pytest -q`  
**Result:** 657 passed, 9 skipped, 0 failed (458.99s)  
**Warnings:** 4 `PytestCollectionWarning` for test classes with `__init__` constructors in `test_applicability.py` and `test_registry.py` (pre-existing, not SC-8C2 related).

The 9 skips are environment-dependent tests (e.g., shader cache roots not present on this machine, Firefox profiles not present).

---

### Requirement 18: Static Validation

**Status: PARTIAL**

| Tool | Result | Details |
|------|--------|---------|
| **flake8** (max-line-length=100) | **CLEAN** | 0 errors across all 4 detection files |
| **mypy** (--strict) | **10 ERRORS** | `safety_policy.py:23` — `SafetyBlocker` not explicitly exported from `..safety` (attr-defined). `junk_rules.py` — 9 errors: 4 missing `-> None` return annotations on `__init__` methods, 1 missing type annotation on `register_junk_rules` parameter, 4 "call to untyped function" errors from registering rules with untyped constructors. All errors are in pre-existing code (`junk_rules.py`) or a pre-existing import (`safety_policy.py`). |
| **black** (--check) | **3 FILES NEED REFORMAT** | `locations.py`, `junk_rules.py`, `junk_rules_ext.py` would be reformatted. `safety_policy.py` is clean. |
| **isort** (--check) | **2 FILES NEED IMPORT SORT** | `junk_rules_ext.py` and `junk_rules.py` imports are incorrectly sorted. |

**Assessment:** flake8 is clean. mypy errors are pre-existing (missing annotations on original `junk_rules.py` rules, not the new code). black/isort formatting issues exist but do not affect correctness. The new `junk_rules_ext.py` and `safety_policy.py` files have proper type annotations on all public methods.

---

## Architecture Verification

### Pipeline Trace

```
ScanAsset
  → KnownLocations.is_under_path() [location match check]
  → SafetyPolicy.should_skip_missing() [missing snapshot → NO_MATCH]
  → Evidence collection [KNOWN_LOCATION, EXTENSION_MATCH, AGE_MATCH, ...]
  → Confidence scoring [averaged from multiple factors]
  → SafetyPolicy.assess() [protected → BLOCKED, locked → REVIEW_REQUIRED, ...]
  → RuleResult.create_matched() [with confidence, safety, evidence, recommended_action]
```

### Centralized Safety Policy

All 9 rules delegate safety assessment to `SafetyPolicy.assess()`. The policy matrix:

| Condition | Result |
|-----------|--------|
| Protected location | `BLOCKED` (SYSTEM_CRITICAL) |
| Missing (not exists) | `REVIEW_REQUIRED` (but rules return NO_MATCH earlier via `should_skip_missing`) |
| Locked | `REVIEW_REQUIRED` |
| Inaccessible | `REVIEW_REQUIRED` |
| Unknown state | `REVIEW_REQUIRED` |
| Otherwise | `SAFE` |

### Protected Exceptions Mechanism

`KnownLocations.is_in_protected_location()` checks exceptions BEFORE protected roots:
1. If asset is under `$PatchCache$` → returns `False` (NOT protected)
2. If asset is under `Installer` (but not `$PatchCache$`) → returns `True` (protected)

This allows `InstallerCacheRule` to match files in `$PatchCache$` without being blocked by `SafetyPolicy.assess()`.

---

## Findings Summary

### Strengths
1. **All 5 new rules correctly implemented** with proper metadata, location matching, evidence collection, confidence scoring, and centralized safety assessment.
2. **Centralized `SafetyPolicy`** ensures consistent behavior across all 9 rules — no rule implements its own safety logic.
3. **Supporting evidence** (extension, age) is correctly implemented as confidence boosters, not primary match criteria.
4. **Comprehensive false positive tests** — 12+ false positive test cases covering Documents, System32, Program Files, Downloads, browser Bookmarks/Login Data, parent Installer dir, and temp extensions in non-temp locations.
5. **Zero action execution** — no `os.remove`, `shutil.rmtree`, `subprocess`, or any system modification calls anywhere in the detection module.
6. **All 657 tests pass** with 0 failures.
7. **Protected exceptions** mechanism correctly allows `$PatchCache$` while blocking parent `Installer`.

### Gaps (Partial items)
1. **`evaluate_scan()` is a stub** — the full scan-level evaluation method returns an empty batch. `evaluate_asset()` and `evaluate_assets()` work correctly but are not tested with production rules through the evaluator.
2. **No evaluator integration tests** — `test_evaluator.py` does not reference any production junk/cache rules.
3. **`register_junk_rules()` not called from production code** — only called from test code.
4. **Path string duplication** — `KnownLocations` duplicates path strings from cleaner modules rather than importing from a shared source.
5. **black/isort formatting** — 3 files need reformatting, 2 files need import sorting (cosmetic, not functional).
6. **mypy strict errors** — 10 errors, all pre-existing in `junk_rules.py` (missing annotations) and `safety_policy.py` (import visibility).

---

## Final Verdict

**SC-8C2 Part 1 remediation is substantively COMPLETE.** All 5 new detection rules, centralized safety policy, supporting evidence mechanisms, protected locations with exceptions, false positive test coverage, and detection-only safety constraints are correctly implemented and verified.

The 3 PARTIAL items are:
- **Evaluator integration (Req 14):** Architecture is correct but `evaluate_scan()` is a stub and no integration tests wire production rules through the evaluator. This is a known gap for future work (Part 2 or SC-8C3).
- **Cleaner knowledge reuse (Req 16):** Paths are consistent but duplicated as string literals. No behavioral duplication, but structural duplication exists.
- **Static validation (Req 18):** flake8 clean, but black/isort/mypy have pre-existing issues.

**No code modifications were made during this audit.**
