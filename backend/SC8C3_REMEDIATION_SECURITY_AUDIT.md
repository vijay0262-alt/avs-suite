# AVS SHIELD — REMEDIATION SECURITY AUDIT
## Pre-Execution Review

**Audit Date:** 2026-08-14  
**Scope:** SC-8C3 Parts 1-3 complete remediation chain  
**Status:** PRE-EXECUTION REVIEW — NO CODE MODIFIED

---

## 1. EXECUTIVE SUMMARY

The SC-8C3 remediation chain (Parts 1-3) is a **well-architected, immutable, read-only domain layer** that correctly separates detection, prioritization, and action planning from execution. The architecture strongly enforces safety-first principles through frozen dataclasses, deterministic identity, and explicit safety gating.

However, **critical gaps exist** before execution can safely proceed. The most significant risks are:

1. **No path validation in the action planning layer** — `canonical_path` from findings flows directly into action targets without re-validating against forbidden roots, junctions, symlinks, or reparse points.
2. **TOCTOU vulnerabilities** — Snapshots are optional and unversioned; an action plan created today may target a different file tomorrow.
3. **Trust boundary violations** — `display_name` and `reason` fields from untrusted rule evidence can influence action target construction.
4. **Legacy cleaner integration risks** — Existing cleaners have their own safety models that may bypass the new action plan's preconditions.
5. **Missing failure-mode handling** — No defined behavior for partial execution, crashes mid-action, or backup failures.

**VERDICT: READY_WITH_REQUIRED_FIXES**

The architecture is sound. With the fixes listed below, this chain can safely proceed to a gated execution layer.

---

## 2. ARCHITECTURE REVIEW

### 2.1 Current Chain

```
RuleResult
   ↓
Aggregation (Part 1)
   ↓
Priority/Fixability (Part 2)
   ↓
ActionPlan (Part 3)
   ↓
[Future Safety Gate] ← MISSING
   ↓
[Future Execution Engine] ← MISSING
```

### 2.2 Strengths

| Strength | Evidence |
|----------|----------|
| Immutable domain models | All models use `frozen=True` dataclasses |
| Deterministic identity | `finding_id = asset_id|rule_id|rule_version`; `action_id = SHA256(finding_id|action_type|state|strategy_version)` |
| Safety-first gating | ActionPlanner refuses BLOCKED, REVIEW_REQUIRED, NOT_FIXABLE, UNKNOWN, missing/locked/inaccessible |
| Separation of concerns | Detection → Prioritization → Planning are pure functions with no side effects |
| Zero system modification | No I/O, no subprocess, no cleaner calls in Parts 1-3 |
| Fixability derivation | SafetyAssessment is authoritative; never overridden |
| Deduplication | ActionPlanner deduplicates by `target.target_identity()` |
| Conflict detection | Conflicting actions on same target are marked for review |

### 2.3 Weaknesses

| Weakness | Impact |
|----------|--------|
| No execution safety gate | ActionPlan has no mechanism to re-verify preconditions at execution time |
| Snapshot is optional | Without snapshots, all "exists/locked/accessible" checks are skipped |
| No path validation | `canonical_path` is trusted without checking FORBIDDEN_ROOTS |
| No hash/content verification | Size is checked, but not file hash or modification time |
| Stale plan tolerance | ActionPlan has no TTL or freshness check |
| No execution budget | No limit on how many actions can be planned/executed in one batch |

---

## 3. TRUST BOUNDARIES

### 3.1 Untrusted Data Sources

| Source | Enters At | Risk Level | Current Validation |
|--------|-----------|------------|-------------------|
| `RuleResult.asset_id` | Aggregation | MEDIUM | None beyond string format |
| `RuleResult.canonical_path` | Aggregation → ActionPlan | **HIGH** | **None** — flows directly to action target |
| `RuleResult.display_name` | Aggregation | LOW | Used as fallback for `allowed_location` |
| `RuleResult.reason` | Aggregation | LOW | Serialized to action plan but not used for targeting |
| `RuleResult.evidence` | Aggregation | LOW | Serialized but not used for targeting |
| Rule metadata (`rule_id`, `rule_category`) | Aggregation | LOW | Heuristic prefix matching |
| Asset lookup callback | Aggregation | MEDIUM | Trusts caller-provided mapping |
| Asset snapshot resolver | ActionPlan | **HIGH** | Trusts caller-provided snapshot |
| `ActionPlan.metadata` | ActionPlan | LOW | Free-form dict, could be tampered with |

### 3.2 Critical Finding: Untrusted Path Becomes Execution Target

**The `canonical_path` field from RuleResult flows directly into FilesystemActionTarget.canonical_path without any validation:**

```
RuleResult.canonical_path
    ↓
DetectionFinding.canonical_path
    ↓
FilesystemActionTarget.canonical_path
    ↓
[Future Execution Engine would act on this path]
```

A malicious or compromised rule could set `canonical_path = "C:\\Windows\\System32\\kernel32.dll"` and the action plan would happily plan a DELETE_FILE action on it. The safety gate in ActionPlanner only checks `snapshot.exists/is_locked/is_accessible` — it does NOT check whether the path is in a protected location.

**This is the single most critical gap in the architecture.**

### 3.3 Display Name Attack Surface

`_extract_allowed_location()` falls back to `display_name` when `canonical_path` is empty:

```python
def _extract_allowed_location(self, finding: DetectionFinding) -> str:
    if finding.canonical_path:
        return finding.canonical_path
    return finding.display_name or finding.asset_id
```

If `display_name` contains path traversal sequences or malicious paths, these flow into `allowed_location` without sanitization.

---

## 4. FILESYSTEM SAFETY AUDIT

### 4.1 Path Validation in New Chain

| Check | Present in Parts 1-3 | Present in Legacy Cleaners |
|-------|----------------------|---------------------------|
| Forbidden root check | **NO** | YES (`safe_paths.is_forbidden()`) |
| Symlink detection | **NO** | YES (`is_symlink_like()`) |
| Reparse point detection | **NO** | YES (`st_file_attributes & 0x400`) |
| Path normalization | **NO** | YES (`_norm()`) |
| Case folding (Windows) | **NO** | YES |
| Junction detection | **NO** | YES |
| Relative path rejection | **NO** | Implicit via `Path.resolve()` in some cleaners |
| UNC path handling | **NO** | Unknown |
| Drive change detection | **NO** | Unknown |

### 4.2 Junction/Symlink Attack

An attacker could:
1. Create a junction `C:\Users\User\AppData\Local\Temp\junk_dir -> C:\Windows\System32`
2. A junk rule detects the junction target
3. `canonical_path` resolves to `C:\Windows\System32\...`
4. ActionPlan plans DELETE_DIRECTORY on the junction target
5. Future execution deletes system files

**Without symlink/junction detection in the action planning layer, this attack is possible.**

### 4.3 Path Traversal

If `canonical_path` contains `..\` sequences, the action target could escape intended directories. No normalization or traversal rejection exists in Parts 1-3.

---

## 5. REGISTRY SAFETY AUDIT

### 5.1 Registry Target Construction

```python
def _extract_hive(self, finding: DetectionFinding) -> str:
    if finding.canonical_path:
        parts = finding.canonical_path.split("\\")
        if parts:
            return parts[0]
    return "HKLM"
```

**Issues:**
1. No validation that `hive` is a valid root (`HKLM`, `HKCU`, `HKCR`, `HKU`, `HKCC`)
2. No validation that `key_path` doesn't point to protected keys
3. `value_name` defaults to `asset_id` — if `asset_id` contains special characters, this could cause issues
4. No WOW6432Node awareness — 32-bit vs 64-bit registry views are not distinguished
5. No check for parent-key deletion risk — `REMOVE_REGISTRY_KEY` could delete an entire key subtree

### 5.2 Protected Keys

The legacy `startup_manager.py` has a `CRITICAL_SYSTEM_ENTRIES` blocklist. The new action planning layer has **no equivalent** for registry keys. A rule could theoretically target `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run` for deletion.

---

## 6. BROWSER SAFETY AUDIT

### 6.1 Browser Target Construction

```python
def _extract_browser(self, finding: DetectionFinding) -> str:
    if finding.canonical_path:
        parts = finding.canonical_path.replace("\\", "/").split("/")
        for part in parts:
            if part.lower() in ("chrome", "firefox", "edge", "brave"):
                return part
    return "unknown"
```

**Issues:**
1. **No browser-running check** — The action plan doesn't verify if the browser is currently running
2. **No profile identity verification** — `profile` is hardcoded to `"default"`; no validation that the profile actually exists
3. **Cache vs user data** — `CLEAR_BROWSER_CACHE` is planned without verifying the target is actually cache data (could be history, cookies, or login data)
4. **No active database check** — SQLite databases in use by a running browser may be corrupted if modified

### 6.2 Legacy Browser Cleaner Comparison

The legacy `privacy_cleaner.py`:
- Uses `immutable=1` SQLite mode to avoid lock conflicts
- Only clears specific tables (`urls`, `visits`, `moz_places`, etc.)
- Never touches bookmarks/passwords/downloads
- Has `_is_browser_running()` check

The new action planning layer has **none of these protections** in the plan itself. It relies entirely on the future execution engine to implement them.

---

## 7. TOCTOU SAFETY AUDIT

### 7.1 Time-of-Check vs Time-of-Use

The current architecture has a **fundamental TOCTOU gap**:

1. **Scan phase** — Rules evaluate assets, produce RuleResults with snapshots
2. **Aggregation phase** — RuleResults are deduplicated, no re-validation
3. **Prioritization phase** — Safety and fixability are derived, no re-validation
4. **Action planning phase** — Snapshot is optionally checked ONCE
5. **Execution phase** — Would act on the plan without re-verification

Between steps 1 and 5, the target can:
- Be deleted by another process
- Be replaced with a different file (same path, different content)
- Become locked/unlocked
- Have its permissions changed
- Be replaced with a symlink/junction pointing elsewhere

### 7.2 Snapshot Staleness

| Issue | Current State | Required for Safe Execution |
|-------|---------------|----------------------------|
| Snapshot timestamp | Not recorded in ActionPlan | Must include `snapshot_timestamp` |
| Snapshot version | No versioning | Must include `snapshot_version` or hash |
| Re-verification | None planned | Must re-check all preconditions immediately before execution |
| Stale plan detection | None | Must reject plans older than a configurable TTL |

### 7.3 Asset Identity Verification

The `identity_matches` precondition is a string comparison:
```python
f"identity_matches:{snapshot.asset_id == finding.asset_id}"
```

This is **not cryptographically verified**. An attacker who can control the snapshot resolver could return a snapshot with a matching `asset_id` for a different physical file.

---

## 8. ACTION PLAN AUDIT

### 8.1 Deterministic IDs

**Strength:** Action IDs are deterministic SHA256 hashes. This is correct.

**Weakness:** The hash includes `strategy_version`, which means changing the strategy version invalidates all existing plans. This is good for evolution but means plans are not portable across versions.

### 8.2 Idempotency

| Check | Status |
|-------|--------|
| Same input → same action ID | YES |
| Same input → same target | YES |
| Same input → same state | YES |
| Re-running plan → no duplicates | YES (deduplication) |
| Re-executing same action | **UNKNOWN** — depends on execution engine |
| Crash recovery | **NOT ADDRESSED** |

### 8.3 Rollback Metadata

| Field | Present | Populated |
|-------|---------|-----------|
| `backup_required` | YES | YES (by target type) |
| `rollback_supported` | YES | YES (by target type) |
| `backup_location` | YES | **NO** — always None |
| `backup_identity` | YES | **NO** — always None |

**The rollback contract exists but is empty.** No backup location or identity is ever generated during planning. This is by design (planning doesn't execute), but it means the execution engine must fill these in, and there's no contract enforcing it.

---

## 9. SAFETY MODEL VERIFICATION

### 9.1 State Transition Analysis

| From State | Can Become | Mechanism | Verified |
|------------|-----------|-----------|----------|
| BLOCKED | executable | Direct mutation of `is_blocked` | NO — frozen dataclass prevents this |
| BLOCKED | executable | Re-running prioritizer with different inputs | YES — SafetyAssessment is copied verbatim |
| REVIEW_REQUIRED | AUTO_FIXABLE | Direct mutation | NO — frozen dataclass |
| REVIEW_REQUIRED | AUTO_FIXABLE | Re-running with different rule capability | YES — but safety takes precedence |
| UNKNOWN | executable | Direct mutation | NO — frozen dataclass |
| UNKNOWN | executable | Re-running | YES — UNKNOWN fixability → NOT_FIXABLE |
| NOT_FIXABLE | executable | Direct mutation | NO — frozen dataclass |
| NOT_FIXABLE | executable | Re-running | YES — requires both AUTO_FIXABLE + REMEDIATION_AVAILABLE |
| AUTO_FIXABLE | executable | Direct mutation | NO — frozen dataclass |
| AUTO_FIXABLE | executable | Execution without preconditions | **NOT ADDRESSED** — no execution gate |

### 9.2 Safety Model Verdict

**The frozen dataclass design correctly prevents in-memory state mutation.** The only attack vector is if a new ActionPlan is constructed by bypassing the ActionPlanner entirely, or if the execution engine ignores preconditions.

---

## 10. EXISTING CLEANER INTEGRATION RISKS

### 10.1 Cleaner Safety Models vs. Action Plan Safety Model

| Aspect | Legacy Cleaners | New Action Plan |
|--------|----------------|-----------------|
| Path validation | `safe_paths.is_forbidden()` + `is_symlink_like()` | **NONE** |
| Safety assessment | Per-cleaner heuristics | Centralized SafetyAssessment |
| Pre-execution check | `validate()` method | Preconditions (strings only) |
| Backup before delete | Some cleaners | Contract only (not enforced) |
| Re-parse point check | YES (`st_file_attributes`) | **NO** |
| Protected root list | 30+ paths | **NONE** |

### 10.2 Integration Risk: Bypassing Safety

If the future Action Engine delegates to existing cleaners like this:

```python
for action in action_plan.actions:
    if action.action_type == ActionType.DELETE_FILE:
        cleaner.delete(action.target.canonical_path)
```

**The cleaner's safety checks are bypassed** because:
1. The cleaner's `validate()` checks paths against its own `FORBIDDEN_ROOTS`
2. But the action target's `canonical_path` was never validated against `FORBIDDEN_ROOTS` during planning
3. If `canonical_path` points to a protected location, the cleaner might reject it — OR it might not, depending on cleaner configuration
4. The action plan's `preconditions` are strings, not executable checks

### 10.3 Specific Cleaner Risks

| Cleaner | Risk | Mitigation |
|---------|------|-----------|
| Junk Cleaner | Accepts arbitrary paths from scan results | Must validate against ActionPlan targets, not just scan results |
| Registry Cleaner | Backs up before delete, but no key-level protection | Must validate registry targets against protected key list |
| Startup Manager | Has critical entry blocklist | Must respect blocklist when executing DISABLE_STARTUP_ENTRY |
| Browser Cleaner | Uses `immutable=1` SQLite mode | Must maintain this protection when executing CLEAR_BROWSER_CACHE |
| Recycle Bin | `restore_from_recycle_bin()` always returns False | Undo feature is broken |

---

## 11. FAILURE MODE ANALYSIS

### 11.1 What Happens When...

| Failure | Current Behavior | Risk |
|---------|------------------|------|
| File disappears between scan and execution | Snapshot `exists=False` → MISSING_TARGET | **LOW** — action is not executed |
| File becomes locked between scan and execution | Snapshot `is_locked=True` → LOCKED_TARGET | **LOW** — action is not executed |
| File is replaced with different content | **NOT DETECTED** — no hash/content check | **HIGH** — wrong file could be deleted |
| Permissions change | **NOT DETECTED** — no permission check | **MEDIUM** — execution might fail |
| Registry key disappears | **NOT DETECTED** — no re-verification | **LOW** — action would fail at execution |
| Browser profile disappears | **NOT DETECTED** | **LOW** — action would fail at execution |
| Asset ID no longer matches snapshot | `identity_matches` precondition records mismatch | **MEDIUM** — but precondition is informational only |
| Backup fails | No backup is created during planning | **MEDIUM** — execution engine must handle |
| Action partially completes | Not addressed | **HIGH** — no atomicity guarantee |
| Execution crashes midway | Not addressed | **HIGH** — no recovery mechanism |

### 11.2 Critical Gap: Preconditions Are Informational Only

The `preconditions` field in `RemediationAction` is a `tuple[str, ...]` — a list of descriptive strings. It is **not executable code**. The future execution engine must:

1. Parse these strings
2. Re-verify each precondition
3. Decide whether to proceed

There is **no contract enforcing this**. A naive execution engine could ignore preconditions entirely.

---

## 12. TEST GAP MATRIX

### 12.1 CRITICAL (Must fix before execution)

| Gap | Test | Risk if Untested |
|-----|------|------------------|
| Path validation | Test that `canonical_path` pointing to `C:\Windows\System32` is rejected | System file deletion |
| Symlink/junction detection | Test that junction targets are detected and rejected | Directory traversal attack |
| Path traversal | Test that `..\` sequences are rejected | Escape intended directory |
| Registry hive validation | Test that invalid hives are rejected | Registry corruption |
| Registry key protection | Test that protected keys (e.g., `HKLM\...\Run`) are rejected | System breakage |
| Browser running check | Test that actions on running browsers are rejected | Data corruption |
| Precondition enforcement | Test that execution engine actually checks preconditions | Safety bypass |

### 12.2 HIGH (Should fix before execution)

| Gap | Test | Risk if Untested |
|-----|------|------------------|
| Snapshot staleness | Test that stale snapshots (>1 hour) are rejected | TOCTOU |
| Hash verification | Test that file hash changes between scan and execution are detected | Wrong file deletion |
| UNC path handling | Test that UNC paths are rejected or validated | Network share deletion |
| Drive change detection | Test that paths on different drives are rejected | Cross-drive deletion |
| WOW6432Node registry | Test that 32-bit vs 64-bit registry is correctly handled | Wrong registry modification |
| Parent key deletion | Test that REMOVE_REGISTRY_KEY doesn't delete parent keys | Registry corruption |
| Action plan TTL | Test that expired plans are rejected | Stale plan execution |
| Execution idempotency | Test that re-executing same action is safe | Double execution |

### 12.3 MEDIUM (Should fix before SC-8C4)

| Gap | Test | Risk if Untested |
|-----|------|------------------|
| Conflict resolution | Test that conflicting actions are always marked, never silently merged | Data loss |
| Rollback contract completeness | Test that backup_location/backup_identity are populated | No undo capability |
| Browser cache vs data | Test that only cache is cleared, not history/cookies | Privacy violation |
| Permission changes | Test that permission changes mid-execution are handled | Execution failure |
| Partial execution recovery | Test that partially executed plans can be rolled back | Inconsistent state |
| Concurrent plan execution | Test that two plans targeting same asset are handled | Race condition |

### 12.4 LOW (Nice to have)

| Gap | Test | Risk if Untested |
|-----|------|------------------|
| Display name sanitization | Test that malicious display names don't affect targets | Low |
| Metadata tampering | Test that ActionPlan.metadata modifications are detected | Low |
| Strategy version migration | Test that old plans can be upgraded | Low |
| Large batch limits | Test that plans with >1000 actions are handled | Performance |

---

## 13. ARCHITECTURAL VERDICT

### 13.1 Verdict: READY_WITH_REQUIRED_FIXES

The SC-8C3 remediation chain has a **solid architectural foundation**:
- Immutable, frozen dataclasses prevent in-memory tampering
- Deterministic IDs enable idempotency and deduplication
- Safety-first gating correctly blocks dangerous states
- Separation of concerns prevents accidental coupling

However, **execution readiness requires the following fixes**:

### 13.2 Required Fixes (Blocking)

| # | Fix | Location | Priority |
|---|-----|----------|----------|
| 1 | **Add path validation in ActionPlanner** — reject paths in FORBIDDEN_ROOTS, reject symlinks/junctions/reparse points | `action.py` | **CRITICAL** |
| 2 | **Add registry target validation** — validate hives against allowlist, validate key paths against protected list | `action.py` | **CRITICAL** |
| 3 | **Add browser safety checks** — verify browser is not running, verify target is cache not user data | `action.py` | **HIGH** |
| 4 | **Add path normalization** — normalize paths, reject traversal sequences, handle UNC paths | `action.py` | **CRITICAL** |
| 5 | **Make preconditions executable** — convert string preconditions to typed, verifiable conditions | `action.py` | **CRITICAL** |
| 6 | **Add snapshot freshness check** — include timestamp in ActionPlan, reject stale plans at execution | `action.py` | **HIGH** |
| 7 | **Add content/hash verification** — include file hash or at least size+timestamp in snapshot | `action.py` | **HIGH** |
| 8 | **Define execution safety gate interface** — formal contract between ActionPlan and Future Safety Gate | New file | **CRITICAL** |

### 13.3 Recommended Fixes (Non-blocking but important)

| # | Fix | Location | Priority |
|---|-----|----------|----------|
| 9 | **Sanitize display_name fallback** — never use display_name as a path component without validation | `action.py` | HIGH |
| 10 | **Add registry parent-key protection** — prevent REMOVE_REGISTRY_KEY from targeting parent keys | `action.py` | HIGH |
| 11 | **Add WOW6432Node awareness** — distinguish 32-bit vs 64-bit registry views | `action.py` | MEDIUM |
| 12 | **Add execution budget** — limit batch size, add cancellation support | `action.py` | MEDIUM |
| 13 | **Add atomicity contract** — define rollback behavior for partial execution | New file | MEDIUM |
| 14 | **Add ActionPlan TTL** — plans should expire after configurable duration | `action.py` | MEDIUM |
| 15 | **Add hash-based deduplication** — deduplicate by content hash, not just path | `action.py` | LOW |

---

## 14. EXISTING CLEANER INTEGRATION: SAFE WITH WRAPPER

The existing cleaners can be safely integrated **IF** the Action Engine wraps them with a safety gate that:

1. **Validates action targets against FORBIDDEN_ROOTS** before calling any cleaner
2. **Re-verifies all preconditions** immediately before execution (not just at plan time)
3. **Wraps cleaner calls with the ActionPlan's safety model** — don't trust the cleaner's internal checks alone
4. **Enforces the same safety assessment** — BLOCKED findings never reach cleaners
5. **Implements backup contract** — populates `backup_location` and `backup_identity` before execution
6. **Handles partial failure** — rolls back completed actions if later actions fail

The legacy cleaners themselves are **safer than the new action planning layer** because they have path validation, symlink detection, and re-parse point checks. The risk is that the Action Engine might **bypass these checks** by trusting the ActionPlan's preconditions without independent verification.

---

## 15. FINAL READINESS VERDICT

```
VERDICT: READY_WITH_REQUIRED_FIXES
```

### Conditions for READY_FOR_EXECUTION:

1. **MUST** add path validation (FORBIDDEN_ROOTS, symlinks, junctions, reparse points) to ActionPlanner
2. **MUST** add registry target validation (hive allowlist, protected key list)
3. **MUST** make preconditions executable/verifiable, not just strings
4. **MUST** define and implement the Future Safety Gate interface
5. **MUST** add snapshot freshness/re-verification mechanism
6. **SHOULD** add browser safety checks (running check, cache-only targeting)
7. **SHOULD** add content/hash verification for filesystem targets

### Conditions NOT Required for Execution Readiness:

- Connecting to existing cleaners (can be done after safety gate is proven)
- Dashboard/UI integration (separate concern)
- Implementation of SC-8C4 or later
- Modifications to SC-8A, SC-8B, SC-8C1, SC-8C2

---

## 16. POSITIVE FINAL NOTES

Despite the gaps identified above, the SC-8C3 remediation chain represents a **significant security improvement** over the legacy cleaner architecture:

1. **Immutable by design** — Frozen dataclasses prevent accidental mutation
2. **Deterministic** — Same inputs always produce same outputs, enabling audit trails
3. **Safety-first** — SafetyAssessment is authoritative and never overridden
4. **Zero-trust execution model** — Nothing executes until a future safety gate approves
5. **Audit-ready** — Every action has a deterministic ID, explicit preconditions, and rollback contract

The architecture is **fundamentally sound**. The gaps are implementation details, not architectural flaws. With the required fixes, this chain can safely proceed to execution.

---

*This audit was performed read-only. No files were modified. No code was written.*
