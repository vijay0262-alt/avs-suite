# SC-8C2: Production Detection Rules — Junk, Temporary Files & Safe Cache Data

## Status: COMPLETE

**Date:** August 13, 2026  
**Build:** On top of commit 0ecf131 (main)  
**Principle:** Detection only — no action execution, no system modification.

---

## 1. Overview

SC-8C2 implements the first production detection rule pack for the AVS Shield Rule Engine. Four rules detect junk, temporary, and safe cache files using the SC-8A contract model (evidence, confidence, safety) and SC-8B applicability/context. Rules run through the SC-8C1 evaluator.

**Key design decisions:**
- Reused location knowledge from existing cleaners (`cleaner/cleaners/`) without inheriting deletion behavior.
- Centralized path logic in `KnownLocations` (read-only knowledge base).
- Every match produces explainable evidence, a confidence score with factors, and a safety assessment.
- Protected system paths are explicitly checked — rules never recommend deletion of system-critical files.

---

## 2. Rules Implemented

| Rule ID | Name | Severity | Category | Detection Target |
|---|---|---|---|---|
| `junk.temp.user` | User Temporary Files | LOW | JUNK | `%LOCALAPPDATA%\Temp`, `%TEMP%`, `%TMP%` |
| `junk.temp.windows` | Windows Temporary Files | LOW | JUNK | `%SystemRoot%\Temp` |
| `cache.shader` | GPU Shader Cache | LOW | JUNK | D3DSCache, NVIDIA DX/GL/Compute, AMD DX/GL/DXC |
| `cache.thumbnail` | Windows Thumbnail Cache | LOW | JUNK | `thumbcache_*.db`, `iconcache_*.db` in Explorer cache dir |

All rules are version 1.0.0, support `AssetType.FILE`, and recommend `ActionType.DELETE` (detection only — no execution).

---

## 3. Files Created/Modified

### New files

| File | Purpose |
|---|---|
| `detection/__init__.py` | Package init, exports all rules + `KnownLocations` |
| `detection/locations.py` | `KnownLocations` — read-only path knowledge base (217 lines) |
| `detection/junk_rules.py` | Four rule implementations + `register_junk_rules()` (736 lines) |
| `detection/tests/test_junk_rules.py` | Comprehensive synthetic test suite (699 lines, 28 tests) |

### Modified files

| File | Change |
|---|---|
| `rules/safety.py` | Added `create_low_risk()` and `create_high_risk()` factory methods to `SafetyAssessment` |

---

## 4. Architecture

### 4.1 KnownLocations (`locations.py`)

Read-only static methods providing:
- `get_user_temp_roots()` — deduplicated user temp paths
- `get_windows_temp_root()` — `%SystemRoot%\Temp`
- `get_shader_cache_roots()` — 7 GPU cache paths (DirectX, NVIDIA, AMD)
- `get_thumbnail_cache_root()` — Explorer cache directory
- `is_under_path()` — case-insensitive path prefix matching (Windows-aware)
- `is_thumbnail_cache_file()` — combined location + pattern check
- `get_protected_roots()` — System32, SysWOW64, WinSxS, Program Files, user Documents/Desktop/Downloads/Pictures/Videos/Music
- `is_in_protected_location()` — conservative safety check

### 4.2 Rule Structure

Each rule follows the same pattern:

1. **Path check** — match against known locations via `KnownLocations`
2. **Early return** — `RuleResult.create_no_match()` if asset is not in target location
3. **Evidence collection** — `Evidence` items with `evidence_type`, `source`, `description`, `value`
4. **Confidence scoring** — `ConfidenceScore` factors averaged into `Confidence`
5. **Safety assessment** — `SafetyAssessment` based on snapshot state (locked, accessible, exists, protected)
6. **Size extraction** — from `asset.custom_metadata.get("size")`
7. **Return** — `RuleResult.create_matched()` with all collected data

### 4.3 Safety Matrix

| Condition | UserTempRule | WindowsTempRule | ShaderCacheRule | ThumbnailCacheRule |
|---|---|---|---|---|
| Accessible & unlocked | SAFE | SAFE | SAFE | SAFE |
| Locked | REVIEW_REQUIRED | REVIEW_REQUIRED | REVIEW_REQUIRED | REVIEW_REQUIRED |
| Inaccessible | HIGH_RISK | HIGH_RISK | REVIEW_REQUIRED | REVIEW_REQUIRED |
| Missing | REVIEW_REQUIRED | REVIEW_REQUIRED | — | — |
| Protected location | BLOCKED | — | — | — |

### 4.4 Confidence Factors

| Rule | Factor 1 | Factor 2 | Factor 3 | Score Range |
|---|---|---|---|---|
| UserTempRule | PATH_MATCH (90) | ASSET_TYPE_MATCH (80) | METADATA_MATCH (85, if accessible) | 85.0–91.67 |
| WindowsTempRule | PATH_MATCH (90) | ASSET_TYPE_MATCH (80) | METADATA_MATCH (85, if accessible) | 85.0–91.67 |
| ShaderCacheRule | PATH_MATCH (95) | STRONG_EVIDENCE (90) | — | 92.5 |
| ThumbnailCacheRule | PATH_MATCH (95) | STRONG_EVIDENCE (95) | STRONG_EVIDENCE (90) | 93.33 |

---

## 5. Test Coverage

**28 tests, all passing.** Test classes:

| Class | Tests | Coverage |
|---|---|---|
| `TestUserTempRule` | 6 | Positive match, negative match, locked, inaccessible, missing, wrong asset type |
| `TestWindowsTempRule` | 3 | Positive match, negative match, locked system file |
| `TestShaderCacheRule` | 5 | D3DSCache match, NVIDIA match, AMD match, negative match, locked review |
| `TestThumbnailCacheRule` | 5 | thumbcache match, iconcache match, wrong location, wrong pattern, locked review |
| `TestFalsePositives` | 4 | .tmp in Documents, System32, Program Files, AppData non-cache |
| `TestRuleRegistration` | 2 | All 4 rules registered, all enabled by default |
| `TestDeterminism` | 1 | Same input → same output (status, confidence, safety, reason) |
| `TestEstimatedSize` | 2 | Size from asset metadata, None when unavailable |

**Test fixtures:** Synthetic `ScanAsset` and `AssetSnapshot` created via `TestFixtures` factory. Uses actual `KnownLocations` paths for realistic testing. No filesystem dependency.

---

## 6. Verification Results

### Tests
```
python -m pytest src/avs_backend/scan_core/rules/detection/tests/test_junk_rules.py
→ 28 passed in 1.26s

python -m pytest  (full suite)
→ 596 passed, 9 skipped in 442.27s
```

### Static checks
```
python -m black --line-length 100  → All formatted
python -m isort --check-only       → All sorted
python -m flake8 --max-line-length=100 → 0 errors
python -m mypy                     → Success: no issues found in 2 source files
```

---

## 7. Detection-Only Compliance

- **No file deletion** — rules only produce `RuleResult` with `recommended_action=ActionType.DELETE`
- **No system modification** — `KnownLocations` is read-only, no writes
- **No action execution** — rules return results; the future Action Engine (separate component) will execute
- **Protected paths** — `is_in_protected_location()` check prevents classifying system-critical files as junk
- **Safety first** — locked/inaccessible/missing files get REVIEW_REQUIRED or HIGH_RISK, never SAFE

---

## 8. What's Next (Out of Scope for SC-8C2)

- Additional rule categories (registry junk, log files, browser caches)
- Action Engine (SC-8D) — executing recommended actions with rollback
- Rule prioritization and conflict resolution across multiple matches
- Integration with scan pipeline for real-time evaluation
