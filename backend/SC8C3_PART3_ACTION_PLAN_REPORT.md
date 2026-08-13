# AVS SHIELD — SC-8C3 PART 3
## Remediation Action Contract + Action Planning

**Status:** COMPLETE AND FROZEN

**Date:** 2026-08-14

---

## 1. SUMMARY

SC-8C3 Part 3 extends the detection pipeline with an immutable action planning layer. This layer answers:

1. Which findings should be shown first? (Part 2)
2. Which findings are safe to act on? (Part 2)
3. Which findings require review? (Part 2)
4. Which findings are blocked? (Part 2)
5. Which findings are currently not actionable? (Part 2)
6. **What would be done for each actionable finding? (Part 3)**

**Architecture:**
```
RuleResults
   ↓
Aggregation (Part 1)
   ↓
Priority/Fixability (Part 2)
   ↓
[Action Planning Layer] (Part 3)
   ↓
Future Safety Gate
   ↓
Future Execution Engine
```

**Validation Results:**
- 39 new action planning tests passed
- 893 total backend tests passed, 9 skipped
- mypy clean
- flake8 clean (max-line-length=100)
- black clean
- isort clean

---

## 2. ACTION MODEL

### 2.1 Immutable Domain Models

**RemediationAction**
- `action_id`: Deterministic SHA256-based ID (finding_id|action_type|state|strategy_version)
- `action_type`: ActionType enum (DELETE_FILE, DELETE_DIRECTORY, CLEAR_CACHE, etc.)
- `state`: ActionState enum (PLANNED, REVIEW_REQUIRED, BLOCKED, NOT_FIXABLE, CONFLICT, MISSING_TARGET, LOCKED_TARGET)
- `target`: ActionTarget (filesystem, registry, browser, startup)
- `finding_id`, `rule_id`, `rule_version`, `asset_id`: Provenance
- `priority_score`, `fixability`, `is_blocked`, `requires_review`, `is_actionable`, `is_auto_fixable`, `is_fixable`, `rule_capability`: Derived from Part 2
- `preconditions`: Tuple of explicit precondition strings
- `safety_assessment`: String representation of safety level
- `reason`: Human-readable description
- `estimated_size`: Optional affected size
- `backup_required`, `rollback_supported`, `backup_location`, `backup_identity`: Rollback contract
- `computed_at`: UTC timestamp
- `metadata`: Optional additional data

**ActionPlan**
- `actions`: Tuple of RemediationAction objects
- `summary`: ActionSummary
- `generated_at`: UTC timestamp

**ActionSummary**
- `total_findings`, `actions_planned`: Counts
- `auto_fixable_actions`, `review_required_actions`, `blocked_actions`, `not_fixable_actions`, `unknown_fixability_actions`: Counts by fixability
- `actions_by_type`: Dict mapping action type to count
- `estimated_affected_size`: Total size or None if unknown
- `highest_priority_action_id`, `highest_severity_action_id`, `largest_affected_action_id`: Extremes

### 2.2 Supported Action Types

| Action Type | Description | Target Category |
|-------------|-------------|-----------------|
| DELETE_FILE | Delete a single file | Filesystem |
| DELETE_DIRECTORY | Delete a directory | Filesystem |
| CLEAR_CACHE | Clear cache files | Cache |
| REMOVE_REGISTRY_VALUE | Remove a registry value | Registry |
| REMOVE_REGISTRY_KEY | Remove a registry key | Registry |
| DISABLE_STARTUP_ENTRY | Disable a startup entry | Startup |
| CLEAR_BROWSER_CACHE | Clear browser cache | Browser |

**NONE** is used internally for non-actionable states (BLOCKED, NOT_FIXABLE, etc.).

---

## 3. ACTION TARGET MODEL

### 3.1 FilesystemActionTarget

| Field | Description |
|-------|-------------|
| `asset_id` | Asset identifier |
| `canonical_path` | Full canonical path |
| `allowed_location` | Location that justified detection |
| `scope` | user_junk, user_temp, user_cache, etc. |
| `backup_required` | Whether backup is needed |
| `rollback_supported` | Whether rollback is possible |
| `backup_location` | Where backup would be stored |
| `backup_identity` | Backup identifier |

### 3.2 RegistryActionTarget

| Field | Description |
|-------|-------------|
| `asset_id` | Asset identifier |
| `hive` | Registry hive (HKLM, HKCU, etc.) |
| `key_path` | Full registry key path |
| `value_name` | Registry value name (for value removal) |
| `backup_required` | Default: True |
| `rollback_supported` | Default: True |

### 3.3 BrowserActionTarget

| Field | Description |
|-------|-------------|
| `asset_id` | Asset identifier |
| `browser` | Browser name (chrome, firefox, edge, brave) |
| `profile` | Browser profile |
| `cache_type` | Type of cache |
| `path` | Cache path |
| `backup_required` | Default: False |
| `rollback_supported` | Default: False |

### 3.4 StartupActionTarget

| Field | Description |
|-------|-------------|
| `asset_id` | Asset identifier |
| `entry_id` | Startup entry identifier |
| `scope` | Startup scope |
| `backup_required` | Default: True |
| `rollback_supported` | Default: True |

**Key Principle:** Never rely on `display_name` alone. All targets include `asset_id` plus type-specific identifiers.

---

## 4. SAFETY GATE

### 4.1 Refused States

The action planner MUST refuse to produce PLANNED actions for:

| Condition | Resulting Action State |
|-----------|------------------------|
| `priority.is_blocked` | BLOCKED |
| `priority.fixability == REVIEW_REQUIRED` | REVIEW_REQUIRED |
| `priority.fixability == NOT_FIXABLE` | NOT_FIXABLE |
| `priority.fixability == UNKNOWN` | NOT_FIXABLE |
| `priority.rule_capability != REMEDIATION_AVAILABLE` | NOT_FIXABLE |
| Asset snapshot missing | MISSING_TARGET |
| `snapshot.exists == False` | MISSING_TARGET |
| `snapshot.is_locked == True` | LOCKED_TARGET |
| `snapshot.is_accessible == False` | LOCKED_TARGET |
| No supported action type for finding | NOT_FIXABLE |

### 4.2 Safety Precedence

SafetyAssessment is authoritative. The action planner never overrides it.

- BLOCKED safety → BLOCKED action (never actionable)
- REVIEW_REQUIRED safety → REVIEW_REQUIRED action (requires human review)
- HIGH_RISK safety → NOT_FIXABLE action
- SAFE/LOW_RISK + REMEDIATION_AVAILABLE → PLANNED action
- SAFE/LOW_RISK + NO_REMEDIATION → NOT_FIXABLE action

---

## 5. FIXABILITY CONTRACT

### 5.1 Eligibility Rules

Only findings meeting ALL of the following may produce PLANNED actions:

1. `fixability == AUTO_FIXABLE`
2. `rule_capability == REMEDIATION_AVAILABLE`
3. `is_actionable == True`
4. `is_auto_fixable == True`
5. Asset snapshot exists and is accessible
6. Asset snapshot is not locked

Everything else produces either:
- NO_ACTION (ActionType.NONE) with appropriate state
- REVIEW_REQUIRED state

---

## 6. ACTION PRECONDITIONS

### 6.1 Required Preconditions

Every PLANNED action includes explicit preconditions:

| Precondition | Description |
|--------------|-------------|
| `target_exists:{bool}` | Asset snapshot exists |
| `target_accessible:{bool}` | Asset is accessible |
| `target_not_locked:{bool}` | Asset is not locked |
| `identity_matches:{bool}` | asset_id matches expected |
| `canonical_path:{path}` | Expected canonical path |
| `safety_valid:{level}` | Safety assessment level |
| `inside_allowed_location:{location}` | Target is within allowed scope |
| `scope_valid:{scope}` | Scope is valid |

### 6.2 Precondition Philosophy

Preconditions are descriptive contracts only. They describe what must be true for execution to proceed. They do NOT execute checks.

---

## 7. ALLOWED LOCATION / SCOPE

### 7.1 Filesystem Actions

For filesystem actions, the `allowed_location` field records the location that justified the detection:

- Derived from `finding.canonical_path` when available
- Falls back to `finding.display_name`
- Falls back to `finding.asset_id`

### 7.2 Scope Values

| Scope | Description |
|-------|-------------|
| `user_junk` | User junk files |
| `user_temp` | User temporary files |
| `user_cache` | User cache files |
| `startup` | Startup entries |
| `browser` | Browser data |

---

## 8. ROLLBACK CONTRACT

### 8.1 Design

The action model includes rollback information so future execution engines can support rollback where technically possible.

| Field | Type | Description |
|-------|------|-------------|
| `backup_required` | bool | Whether a backup is needed before action |
| `rollback_supported` | bool | Whether rollback is technically possible |
| `backup_location` | Optional[str] | Where backup would be stored |
| `backup_identity` | Optional[str] | Identifier for the backup |

### 8.2 Defaults by Target Type

| Target Type | backup_required | rollback_supported |
|-------------|-----------------|-------------------|
| Filesystem | False (files) / True (dirs) | False (files) / True (dirs) |
| Registry | True | True |
| Browser | False | False |
| Startup | True | True |

### 8.3 No Actual Backups

The action planning layer does NOT create backups. It only records whether backups would be required.

---

## 9. IDEMPOTENCY

### 9.1 Deterministic Action IDs

Action IDs are deterministic SHA256 hashes:

```
action_id = SHA256(finding_id|action_type|state|strategy_version)[:16]
```

### 9.2 Properties

- Same finding + same strategy → same action ID
- Different strategy version → different action ID
- Different finding → different action ID
- Repeated planning → no duplicate actions (deduplication)

---

## 10. DEDUPLICATION AND CONFLICT HANDLING

### 10.1 Deduplication

PLANNED actions targeting the same physical object are deduplicated:

- Key: `target.target_identity()` (asset_id + path/hive/key + type-specific data)
- Same target + same action type → single action
- Same target + different action types → conflict (marked for review)

### 10.2 Conflict Handling

When two rules propose different actions for the same physical target:

1. Both actions are generated initially
2. The conflict is detected during deduplication
3. One action is marked with `ActionState.CONFLICT`
4. Both actions remain in the plan for human review

### 10.3 Non-PLANNED Actions

Non-PLANNED actions (BLOCKED, REVIEW_REQUIRED, NOT_FIXABLE, MISSING_TARGET, LOCKED_TARGET) are never deduplicated. Each finding produces its own state action.

---

## 11. ACTION SUMMARY

### 11.1 Counts

| Count | Description |
|-------|-------------|
| `total_findings` | Total findings in prioritized result |
| `actions_planned` | Total actions in plan |
| `auto_fixable_actions` | Actions eligible for automatic execution |
| `review_required_actions` | Actions requiring human review |
| `blocked_actions` | Actions blocked by safety |
| `not_fixable_actions` | Actions with no remediation path |
| `unknown_fixability_actions` | Actions with undetermined fixability |

### 11.2 Actions by Type

Dictionary mapping action type string to count, sorted by key.

### 11.3 Extremes

| Extreme | Description |
|---------|-------------|
| `highest_priority_action_id` | Action with highest priority score |
| `highest_severity_action_id` | Action with highest severity |
| `largest_affected_action_id` | Action with largest affected size |

All values derived from actual actions. No fabricated statistics.

---

## 12. PERFORMANCE

### 12.1 Benchmark

- **Dataset:** 10,000 aggregated findings
- **Metric:** Action plan generation time
- **Target:** O(n log n) or better
- **Result:** < 2000ms

### 12.2 Algorithm Complexity

| Step | Complexity | Notes |
|------|------------|-------|
| Action planning per finding | O(n) | Single pass |
| Deduplication | O(n) | Dict-based lookup |
| Sort | O(n log n) | Python TimSort |
| Summary computation | O(n) | Single pass |
| **Total** | **O(n log n)** | Dominated by sort |

---

## 13. NO EXECUTION GUARANTEE

### 13.1 Verified Absence

The implementation contains ZERO system modification code:

- No `os.remove` or `os.unlink`
- No `shutil` operations
- No `subprocess` calls
- No PowerShell invocation
- No registry write APIs
- No cleaner calls
- No optimizer calls
- No process termination

### 13.2 Test Verification

`TestEdgeCases.test_no_system_calls_in_source` inspects the action module source and asserts no forbidden terms are present in executable code.

---

## 14. VALIDATION RESULTS

### 14.1 Test Results

```
============================= test session starts ==============================
...
39 passed in 3.86s (action tests only)
893 passed, 9 skipped in 519.17s (full suite)
```

### 14.2 Static Analysis

| Tool | Result |
|------|--------|
| mypy | Success: no issues found |
| flake8 (max-line-length=100) | No issues |
| black --check | Would be left unchanged |
| isort --check-only | No issues |

### 14.3 Files Created

| File | Description |
|------|-------------|
| `src/avs_backend/scan_core/rules/action.py` | Action planning layer implementation |
| `src/avs_backend/scan_core/rules/tests/test_action.py` | 39 comprehensive tests |

### 14.4 Unchanged Files

| File | Description |
|------|-------------|
| `src/avs_backend/scan_core/rules/aggregation.py` | Part 1 frozen baseline |
| `src/avs_backend/scan_core/rules/priority.py` | Part 2 frozen baseline |
| All existing detection rules, evaluator, safety, confidence, evidence modules | Unchanged |

---

## 15. KEY CLASSES

### 15.1 ActionPlanner

Main class for planning actions. Accepts optional:
- `asset_snapshot_resolver` — Resolves asset snapshot state from asset_id
- `strategy_version` — Version string for deterministic action IDs

### 15.2 Enumerations

**ActionType:**
- DELETE_FILE
- DELETE_DIRECTORY
- CLEAR_CACHE
- REMOVE_REGISTRY_VALUE
- REMOVE_REGISTRY_KEY
- DISABLE_STARTUP_ENTRY
- CLEAR_BROWSER_CACHE
- NONE

**ActionState:**
- PLANNED
- REVIEW_REQUIRED
- BLOCKED
- NOT_FIXABLE
- CONFLICT
- MISSING_TARGET
- LOCKED_TARGET

**ActionTargetType:**
- FILESYSTEM
- REGISTRY
- BROWSER
- STARTUP

---

## 16. CONSTANTS AND CONFIGURATION

### 16.1 Documented Defaults

| Target Type | backup_required | rollback_supported |
|-------------|-----------------|-------------------|
| Filesystem (file) | False | False |
| Filesystem (directory) | True | True |
| Registry | True | True |
| Browser | False | False |
| Startup | True | True |

### 16.2 Strategy Version

Default strategy version: `"1.0.0"`

Changing the strategy version produces different action IDs for the same findings, enabling strategy evolution without breaking existing plans.

---

## 17. REMAINING LIMITATIONS

1. **Action targets are contracts only** — no actual file/registry/browser manipulation
2. **AssetSnapshotResolver is optional** — without it, missing/locked detection is limited
3. **Rule-to-action mapping is heuristic** — based on rule category and asset type prefixes
4. **No execution engine** — this layer only plans; it does not execute
5. **No cleaner integration** — existing cleaners are NOT called
6. **No Dashboard/UI integration** — pure domain layer

---

## 18. WHAT WAS NOT DONE (BY DESIGN)

Per task constraints, the following were explicitly NOT implemented:

- Actual cleanup or remediation execution
- Cleaner integration (Junk Cleaner, Browser Cleaner, Registry Cleaner, Startup Manager)
- Action execution
- Dashboard/UI integration
- Health Score modifications
- SC-8C4 or subsequent parts
- Modifications to SC-8A, SC-8B, SC-8C1, or SC-8C2 detection rules
- Modifications to Parts 1 or 2

---

## 19. CONCLUSION

SC-8C3 Part 3 is complete. The action planning layer provides:

1. **Immutable action models** (RemediationAction, ActionPlan, ActionTarget, ActionSummary)
2. **Safety-first gating** that never overrides SafetyAssessment
3. **Fixability enforcement** — only AUTO_FIXABLE + REMEDIATION_AVAILABLE produces PLANNED actions
4. **Explicit preconditions** for every planned action
5. **Allowed location/scope** for filesystem actions
6. **Rollback contract** (backup_required, rollback_supported, backup_location, backup_identity)
7. **Deterministic action IDs** via SHA256 hashing
8. **Deduplication and conflict handling** for multi-rule targets
9. **Comprehensive tests** (39 tests, including safety matrix, determinism, 10k benchmark)
10. **Performance** — O(n log n), 10k findings in < 2000ms
11. **Zero system modification** — pure domain layer

The layer is frozen and ready for the Future Safety Gate and Execution Engine to consume.
