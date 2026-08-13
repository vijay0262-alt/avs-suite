# SC-8C2 Remediation Report — Part 1

## Detection Coverage and Safety

**Date:** 2025  
**Scope:** SC-8C2 detection rules, safety policy, and location knowledge  
**Status:** Complete — all validation passing

---

## 1. Summary

This remediation addresses audit findings for SC-8C2 detection coverage and safety consistency. The work delivers 5 new production detection rules, a centralized safety policy, expanded location knowledge, and comprehensive test coverage — all with zero system modification.

### Key Metrics

| Metric | Before | After |
|--------|--------|-------|
| Detection rules | 4 | 9 |
| Location categories | 4 | 9 |
| Safety policy | Per-rule (inconsistent) | Centralized `SafetyPolicy` |
| Protected exception mechanism | None | `get_protected_exceptions()` |
| Test count | ~30 | 89 |
| SyntaxWarnings | 2 | 0 |

---

## 2. Files Changed

### New Files

| File | Purpose |
|------|---------|
| `src/avs_backend/scan_core/rules/detection/safety_policy.py` | Centralized safety assessment |
| `src/avs_backend/scan_core/rules/detection/junk_rules_ext.py` | 5 new detection rules |
| `src/avs_backend/scan_core/rules/detection/tests/test_junk_rules_ext.py` | Tests for new rules |

### Modified Files

| File | Changes |
|------|---------|
| `src/avs_backend/scan_core/rules/detection/locations.py` | New location getters, extension/age helpers, protected exceptions, expanded protected roots |
| `src/avs_backend/scan_core/rules/detection/junk_rules.py` | Refactored to use `SafetyPolicy`, added supporting evidence, updated `register_junk_rules` |
| `src/avs_backend/scan_core/rules/detection/__init__.py` | Export new rules and `SafetyPolicy` |
| `src/avs_backend/scan_core/rules/detection/tests/test_junk_rules.py` | Updated for new safety behavior, rule count 4→9 |

---

## 3. New Detection Rules

### 3.1 ApplicationTempRule (`junk.temp.application`)

**Detects:** Files in known application-specific temporary directories.

**Locations:**
- `%LOCALAPPDATA%\Microsoft\Office\16.0\Temp`
- `%LOCALAPPDATA%\Microsoft\Office\15.0\Temp`

**Detection criterion:** Known application temp location + FILE asset type.  
**Supporting evidence:** Temporary extension, age >7 days.  
**Recommended action:** DELETE  
**Severity:** LOW

### 3.2 BrowserCacheRule (`cache.browser`)

**Detects:** Browser cache files for Chrome, Edge, Brave, Opera, Vivaldi, and Firefox.

**Locations:** 22+ Chromium-based cache directories + Firefox profile-based `cache2`.

**Detection criterion:** Known browser cache location + FILE/BROWSER_CACHE asset type.  
**Supporting evidence:** Temporary extension, age >7 days.  
**Recommended action:** CLEAR_CACHE  
**Severity:** LOW

### 3.3 InstallerCacheRule (`cache.installer`)

**Detects:** Windows Installer patch cache files.

**Location:** `%SystemRoot%\Installer\$PatchCache$` (subfolder only — never parent Installer).

**Detection criterion:** Under `$PatchCache$` + FILE asset type.  
**Supporting evidence:** Age >7 days.  
**Recommended action:** DELETE  
**Severity:** LOW  
**Safety note:** Parent `Installer` directory is protected. `$PatchCache$` is a protected exception — safe to clean.

### 3.4 WindowsUpdateCacheRule (`cache.windows_update`)

**Detects:** Downloaded Windows Update packages retained after installation.

**Location:** `%SystemRoot%\SoftwareDistribution\Download`

**Detection criterion:** Under update cache root + FILE asset type.  
**Supporting evidence:** Age >7 days.  
**Recommended action:** DELETE  
**Severity:** LOW

### 3.5 ApplicationCacheRule (`cache.application`)

**Detects:** Known application cache files (Office caches, IconCache.db).

**Locations:**
- `%LOCALAPPDATA%\Microsoft\Office\16.0\OfficeFileCache`
- `%LOCALAPPDATA%\Microsoft\Office\15.0\OfficeFileCache`
- `%LOCALAPPDATA%\Microsoft\Office\16.0\DocumentCache`
- `%LOCALAPPDATA%\Microsoft\Office\UnsavedFiles`
- `%LOCALAPPDATA%\IconCache.db` (single file match)

**Detection criterion:** Known application cache location or IconCache.db match + FILE asset type.  
**Supporting evidence:** Temporary extension, age >7 days.  
**Recommended action:** CLEAR_CACHE  
**Severity:** LOW

---

## 4. Centralized Safety Policy

### `SafetyPolicy` class (`safety_policy.py`)

Single source of truth for safety assessment across all rules.

**Policy matrix:**

| Condition | Safety Level | Behavior |
|-----------|-------------|----------|
| Protected location | `BLOCKED` | `SYSTEM_CRITICAL` blocker |
| Missing (`snapshot.exists == False`) | `NO_MATCH` | Rule returns no-match |
| Locked | `REVIEW_REQUIRED` | Manual review recommended |
| Inaccessible | `REVIEW_REQUIRED` | Cannot verify safety |
| Unknown state | `REVIEW_REQUIRED` | Manual review required |
| Otherwise | `SAFE` | Proceed with recommended action |

**Methods:**
- `assess(asset, snapshot, safe_reason)` → `SafetyAssessment`
- `should_skip_missing(snapshot)` → `bool`

### Protected Exceptions

New `get_protected_exceptions()` in `KnownLocations` handles safe subfolders within protected roots:

- `%SystemRoot%\Installer\$PatchCache$` — safe to clean despite parent `Installer` being protected.

`is_in_protected_location()` checks exceptions **first**, returning `False` for exception paths.

---

## 5. Existing Rule Fixes

### 5.1 Safety Consistency

All 4 existing rules (`UserTempRule`, `WindowsTempRule`, `ShaderCacheRule`, `ThumbnailCacheRule`) now use `SafetyPolicy.assess()` instead of inline safety logic. This ensures:
- Consistent `REVIEW_REQUIRED` for locked files (was `HIGH_RISK` in some rules)
- Consistent `NO_MATCH` for missing assets (was `REVIEW_REQUIRED` in some rules)
- Consistent `BLOCKED` for protected locations

### 5.2 Missing Asset Handling

All rules now call `SafetyPolicy.should_skip_missing(snapshot)` early in evaluation. Assets with `snapshot.exists == False` return `NO_MATCH` — they are not reported as active cleanup candidates.

### 5.3 Supporting Evidence

All rules now collect:
- `EXTENSION_MATCH` evidence when asset has a temporary extension (`.tmp`, `.temp`, `.cache`, `.bak`, `.old`, `.dmp`)
- `AGE_MATCH` evidence when asset is older than 7 days

These are **supporting evidence only** — never sufficient alone for classification.

---

## 6. Expanded Location Knowledge

### New `KnownLocations` Methods

| Method | Returns |
|--------|---------|
| `get_application_temp_roots()` | Office temp directories |
| `get_browser_cache_roots()` | 22+ browser cache directories + Firefox profiles |
| `get_installer_cache_root()` | `$PatchCache$` directory |
| `get_windows_update_cache_root()` | SoftwareDistribution\Download |
| `get_application_cache_roots()` | Office cache directories |
| `get_icon_cache_file()` | IconCache.db file path |
| `get_temporary_extensions()` | Tuple of temp file extensions |
| `has_temporary_extension(path)` | Boolean check |
| `get_default_age_threshold_days()` | 7 days |
| `get_asset_age_days(modified_at)` | Age in days or None |
| `is_asset_old(modified_at, threshold)` | Boolean check |
| `get_protected_exceptions()` | Safe subfolders within protected roots |
| `get_protected_roots()` | Expanded protected directory list |

### Expanded Protected Roots

Added to the protected list:
- `%SystemRoot%\System32\drivers`
- `%SystemRoot%\Config`
- `%SystemRoot%\Boot`
- `%SystemRoot%\Installer`
- `%ProgramFiles%`
- `%ProgramFiles(x86)%`
- User personal folders (Documents, Desktop, Downloads, Pictures, Videos, Music)

---

## 7. Test Coverage

### Test Files

| File | Tests | Coverage |
|------|-------|----------|
| `test_junk_rules.py` | ~40 | Existing 4 rules + registration + false positives |
| `test_junk_rules_ext.py` | ~49 | 5 new rules + safety policy + false positives |

### Test Categories

- **Positive match:** Asset in known location → matched with correct rule ID
- **Negative match:** Asset outside known location → no match
- **Supporting evidence:** Extension and age evidence collected when present
- **Safety — locked:** `REVIEW_REQUIRED` safety level
- **Safety — inaccessible:** `REVIEW_REQUIRED` safety level
- **Safety — missing:** `NO_MATCH` (not reported as active candidate)
- **Safety — protected:** `BLOCKED` safety level
- **False positives:** System32, Program Files, AppData non-cache, Documents — all return no match
- **Determinism:** Same input → same output across multiple evaluations
- **Estimated size:** Size correctly extracted from `custom_metadata`
- **Rule registration:** 9 rules registered, all enabled by default

---

## 8. Validation Results

| Check | Result |
|-------|--------|
| pytest (89 tests) | **89 passed, 0 warnings** |
| flake8 (--max-line-length=100) | **Clean** |
| mypy (--ignore-missing-imports) | **Clean** |
| black (--line-length=100) | **All formatted** |
| isort (--profile black) | **All sorted** |

---

## 9. Architecture Decisions

### 9.1 Detection Only

All rules are detection-only. No deletion, no system modification. Rules produce `RuleResult` with evidence, confidence, and safety assessment. The Action Engine (future) will consume results.

### 9.2 Safety ≠ Severity ≠ Confidence

These three dimensions are strictly separated:
- **Severity:** How impactful the junk is (LOW for all current rules)
- **Confidence:** How certain the detection is (average of factor scores)
- **Safety:** Whether it's safe to act (SAFE / REVIEW_REQUIRED / BLOCKED)

### 9.3 Supporting Evidence Never Sufficient Alone

Extension and age are supporting evidence only. A `.tmp` file in `Documents` will NOT match any rule. Location is the primary detection criterion.

### 9.4 Protected Exceptions

The `$PatchCache$` subfolder is under the protected `Installer` directory. Without exceptions, `SafetyPolicy` would block it. The exception mechanism allows specific safe subfolders within protected roots.

---

## 10. Out of Scope (Part 2)

Per task constraints, the following are NOT included in Part 1:
- SC-8C3 (action execution)
- UI changes
- Architecture redesign outside SC-8C2 detection and safety
- API base URL changes
