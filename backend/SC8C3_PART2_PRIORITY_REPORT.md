# AVS SHIELD — SC-8C3 PART 2
## Finding Prioritization + Fixability Contracts

**Status:** COMPLETE AND FROZEN

**Date:** 2026-08-14

---

## 1. SUMMARY

SC-8C3 Part 2 extends the detection result aggregation layer (Part 1) with a deterministic priority scoring system, fixability classification, and actionability contracts. This layer answers:

1. Which findings should be shown first?
2. Which findings are safe to act on?
3. Which findings require review?
4. Which findings are blocked?
5. Which findings are currently not actionable?

**Architecture:**
```
RuleResults
   ↓
Aggregation (Part 1)
   ↓
[Prioritization + Fixability] (Part 2)
   ↓
Future Action Engine
```

**Validation Results:**
- 43 new prioritization tests passed
- 854 total backend tests passed, 9 skipped
- mypy clean
- flake8 clean (max-line-length=100)
- black clean
- isort clean

---

## 2. PRIORITY MODEL

### 2.1 Design Principles

Priority is a **derived presentation/workflow value**. It must NOT replace:
- `severity` — remains an independent property from RuleResult
- `confidence` — remains an independent property from RuleResult
- `safety` — remains authoritative and independent

### 2.2 Deterministic Scoring Formula

```
base = SEVERITY_PRIORITY_SCORE[severity]
confidence_mod = confidence.score / 100.0
safety_mod = SAFETY_PRIORITY_MODIFIER[safety.level.value]
size_bonus = min(log10(size + 1) * 5.0, 20.0)  [if size known]
category_bonus = CATEGORY_PRIORITY_BONUS[rule_category]

priority_score = base * confidence_mod * safety_mod + size_bonus + category_bonus
```

### 2.3 Documented Weights

**Severity Priority Scores:**
| Severity | Score | Rationale |
|----------|-------|-----------|
| CRITICAL | 100 | Immediate attention required |
| HIGH | 80 | Serious issue |
| MEDIUM | 60 | Notable issue |
| LOW | 40 | Minor issue |
| INFO | 20 | Purely informational |

**Safety Priority Modifiers:**
| Safety Level | Modifier | Rationale |
|--------------|----------|-----------|
| SAFE | 1.0 | Fully eligible for action |
| LOW_RISK | 0.9 | Nearly as eligible |
| REVIEW_REQUIRED | 0.5 | Eligible but needs human approval |
| HIGH_RISK | 0.3 | Poorly eligible |
| BLOCKED | 0.1 | Ineligible |

**Category Priority Bonuses:**
| Category | Bonus | Rationale |
|----------|-------|-----------|
| SECURITY | 10 | Highest impact |
| SYSTEM | 8 | System-level impact |
| SUSPICIOUS | 8 | Potential threats |
| PERFORMANCE | 5 | Performance impact |
| PRIVACY | 4 | Privacy concerns |
| NETWORK | 4 | Network exposure |
| STARTUP | 3 | Boot impact |
| REGISTRY | 3 | Registry modifications |
| BROWSER | 2 | Browser data |
| JUNK | 2 | Junk files |
| CACHE | 1 | Cache files |
| TEMPORARY | 1 | Temp files |
| CUSTOM | 0 | Unknown category |

**Size Bonus:**
- Formula: `min(log10(size_bytes + 1) * 5.0, 20.0)`
- Logarithmic scaling prevents large files from completely dominating
- Capped at 20 points maximum
- Unknown size contributes 0 bonus

---

## 3. FIXABILITY MODEL

### 3.1 Fixability States

| State | Description |
|-------|-------------|
| AUTO_FIXABLE | Safe to act on, and rule has remediation available |
| REVIEW_REQUIRED | Requires human approval before action |
| BLOCKED | Never actionable due to safety constraints |
| NOT_FIXABLE | No remediation path exists |
| UNKNOWN | Fixability cannot be determined |

### 3.2 Derivation Rules

Fixability is derived from `SafetyAssessment` + `RuleCapability`:

```
if safety.is_blocked:
    return BLOCKED
if safety.requires_review:
    return REVIEW_REQUIRED
if safety.level == HIGH_RISK:
    return NOT_FIXABLE
# SAFE or LOW_RISK
if rule_capability == REMEDIATION_AVAILABLE:
    return AUTO_FIXABLE
if rule_capability == REVIEW_REQUIRED:
    return REVIEW_REQUIRED
return NOT_FIXABLE
```

**SafetyAssessment is authoritative.** It always overrides rule capability.

---

## 4. ACTIONABILITY CONTRACTS

### 4.1 Deterministic Boolean Properties

| Safety | Fixability | is_actionable | is_auto_fixable | requires_review | is_blocked | is_fixable |
|--------|------------|---------------|-----------------|-----------------|------------|------------|
| BLOCKED | BLOCKED | false | false | false | true | false |
| REVIEW_REQUIRED | REVIEW_REQUIRED | false | false | true | false | true |
| HIGH_RISK | NOT_FIXABLE | false | false | false | false | false |
| SAFE | AUTO_FIXABLE | true | true | false | false | true |
| SAFE | REVIEW_REQUIRED | false | false | true | false | true |
| SAFE | NOT_FIXABLE | false | false | false | false | false |
| LOW_RISK | AUTO_FIXABLE | true | true | false | false | true |
| LOW_RISK | REVIEW_REQUIRED | false | false | true | false | true |
| LOW_RISK | NOT_FIXABLE | false | false | false | false | false |

### 4.2 Safety Precedence

SafetyAssessment constrains all actionability:

- **BLOCKED** → never automatically actionable, regardless of severity or confidence
- **REVIEW_REQUIRED** → requires manual review, not auto-actionable
- **HIGH_RISK** → not fixable, not actionable
- **SAFE / LOW_RISK** → eligible based on rule capability

**Example: HIGH severity + BLOCKED safety = NOT actionable**

---

## 5. RULE CAPABILITY

### 5.1 Contract-Only Model

RuleCapability describes whether a rule has a future remediation strategy. It is a **contract only** — it does NOT connect to actual cleaners.

### 5.2 States

| State | Description |
|-------|-------------|
| NO_REMEDIATION | No remediation strategy exists |
| REMEDIATION_AVAILABLE | Future remediation is planned/available |
| REVIEW_REQUIRED | Remediation requires human review |

### 5.3 Resolution

- Resolved via optional `RuleCapabilityResolver` callable
- Falls back to `NO_REMEDIATION` if no resolver configured
- Does not execute any action or call any cleaner

---

## 6. DETERMINISTIC ORDERING

### 6.1 Sort Strategy

Findings are sorted using a stable multi-key sort:

1. **priority_score** (descending) — higher score = more important
2. **severity_order** (descending) — CRITICAL before HIGH before MEDIUM...
3. **confidence_score** (descending) — higher confidence = more reliable
4. **affected_size** (descending) — larger impact = higher priority; None last
5. **rule_category** (ascending) — alphabetical
6. **rule_id** (ascending) — alphabetical
7. **asset_id** (ascending) — alphabetical

### 6.2 Stability Guarantees

- Never relies on dictionary/set ordering
- Same input always produces identical ordering
- Shuffled input produces identical ordering after aggregation

---

## 7. BULK SUMMARY

### 7.1 PrioritizedSummary Counts

| Count | Description |
|-------|-------------|
| total_findings | Total number of prioritized findings |
| unique_assets | Number of unique assets affected |
| auto_fixable_findings | Findings eligible for automatic action |
| review_required_fixability | Findings requiring human review |
| blocked_fixability | Findings blocked by safety |
| not_fixable_findings | Findings with no remediation path |
| unknown_fixability | Findings with undetermined fixability |

### 7.2 Extreme Findings

| Extreme | Description |
|---------|-------------|
| highest_priority_finding_id | Finding with highest priority score |
| highest_severity_finding_id | Finding with highest severity |
| largest_affected_finding_id | Finding with largest affected size |

All extreme values are derived from actual findings. No statistics are fabricated.

---

## 8. SAFETY TEST MATRIX

### 8.1 Covered Combinations

| Test | Safety | Severity | Confidence | Expected Fixability |
|------|--------|----------|------------|---------------------|
| test_safe_high_confidence | SAFE | HIGH | 95 | AUTO_FIXABLE |
| test_safe_low_confidence | SAFE | LOW | 25 | AUTO_FIXABLE |
| test_review_required_high_severity | REVIEW_REQUIRED | HIGH | 90 | REVIEW_REQUIRED |
| test_blocked_critical_severity | BLOCKED | CRITICAL | 90 | BLOCKED |
| test_not_fixable_explicit | HIGH_RISK | LOW | 90 | NOT_FIXABLE |
| test_unknown_fixability_with_defaults | SAFE | LOW | 90 | NOT_FIXABLE (no resolver) |

### 8.2 Safety Override Verification

All tests verify that safety constraints override other factors:
- BLOCKED + CRITICAL severity = never actionable
- REVIEW_REQUIRED + HIGH severity = requires review, not auto-actionable
- HIGH_RISK = not fixable regardless of rule capability

---

## 9. DETERMINISM TESTS

### 9.1 Test Strategy

Identical findings are shuffled repeatedly and verified to produce:
- Same priority scores
- Same ordering
- Same actionability
- Same fixability
- Same summary

### 9.2 Test Coverage

| Test | Description |
|------|-------------|
| test_same_input_same_order | Identical input produces identical ordering |
| test_shuffled_input_same_order | Shuffled input produces same ordering |
| test_10k_findings_deterministic | 10,000 findings produce deterministic output |

---

## 10. PERFORMANCE

### 10.1 Benchmark

- **Dataset:** 10,000 aggregated findings
- **Metric:** Prioritization + fixability processing time
- **Target:** O(n log n) or better
- **Result:** < 1000ms

### 10.2 Algorithm Complexity

| Step | Complexity | Notes |
|------|------------|-------|
| Priority computation | O(n) | Single pass over findings |
| Sort | O(n log n) | Python TimSort |
| Summary computation | O(n) | Single pass over findings |
| **Total** | **O(n log n)** | Dominated by sort |

---

## 11. NO EXECUTION GUARANTEE

### 11.1 Verified Absence

The implementation contains ZERO system modification code:

- No `os.remove` or `os.unlink`
- No `shutil` operations
- No `subprocess` calls
- No PowerShell invocation
- No registry writes
- No cleaner calls
- No optimizer calls
- No process termination

### 11.2 Test Verification

`TestNoExecution.test_no_system_calls_in_source` inspects the priority module source and asserts no forbidden terms are present.

---

## 12. VALIDATION RESULTS

### 12.1 Test Results

```
============================= test session starts ==============================
...
43 passed in 2.07s (priority tests only)
854 passed, 9 skipped in 506.89s (full suite)
```

### 12.2 Static Analysis

| Tool | Result |
|------|--------|
| mypy | Success: no issues found |
| flake8 (max-line-length=100) | No issues |
| black --check | Would be left unchanged |
| isort --check-only | No issues |

### 12.3 Files Created/Modified

**New Files:**
- `src/avs_backend/scan_core/rules/priority.py` — Prioritization + Fixability layer
- `src/avs_backend/scan_core/rules/tests/test_priority.py` — Comprehensive tests

**Unchanged Files:**
- `src/avs_backend/scan_core/rules/aggregation.py` — Part 1 frozen baseline
- All existing detection rules, evaluator, safety, confidence, evidence modules

---

## 13. DOMAIN MODELS

### 13.1 FindingPriority

Immutable dataclass containing:
- `finding` — The DetectionFinding from Part 1
- `priority_score` — Computed float score
- `fixability` — Fixability enum
- `is_blocked` — Boolean from SafetyAssessment
- `requires_review` — Boolean from SafetyAssessment
- `is_actionable` — Derived boolean
- `is_auto_fixable` — Derived boolean
- `is_fixable` — Derived boolean
- `rule_capability` — RuleCapability enum
- `computed_at` — UTC timestamp

### 13.2 PrioritizedSummary

Immutable dataclass extending DetectionSummary with:
- Priority and fixability counts
- Extreme finding IDs (highest priority, severity, size)

### 13.3 PrioritizedResult

Immutable dataclass containing:
- `priorities` — Tuple of FindingPriority objects (sorted)
- `summary` — PrioritizedSummary

---

## 14. KEY CLASSES

### 14.1 FindingPrioritizer

Main class for computing priorities. Accepts optional:
- `rule_capability_resolver` — Resolves RuleCapability from rule_id
- `asset_size_resolver` — Resolves asset size from asset_id

### 14.2 Enumerations

**Fixability:**
- AUTO_FIXABLE
- REVIEW_REQUIRED
- BLOCKED
- NOT_FIXABLE
- UNKNOWN

**RuleCapability:**
- NO_REMEDIATION
- REMEDIATION_AVAILABLE
- REVIEW_REQUIRED

---

## 15. CONSTANTS AND CONFIGURATION

### 15.1 Documented Magic Numbers

All weights and bonuses are explicitly documented:

| Constant | Value | Purpose |
|----------|-------|---------|
| SEVERITY_CRITICAL | 100 | Critical severity base score |
| SEVERITY_HIGH | 80 | High severity base score |
| SEVERITY_MEDIUM | 60 | Medium severity base score |
| SEVERITY_LOW | 40 | Low severity base score |
| SEVERITY_INFO | 20 | Info severity base score |
| SAFETY_SAFE | 1.0 | Safe safety modifier |
| SAFETY_LOW_RISK | 0.9 | Low risk safety modifier |
| SAFETY_REVIEW_REQUIRED | 0.5 | Review required safety modifier |
| SAFETY_HIGH_RISK | 0.3 | High risk safety modifier |
| SAFETY_BLOCKED | 0.1 | Blocked safety modifier |
| SIZE_BONUS_MULTIPLIER | 5.0 | Logarithmic size bonus multiplier |
| SIZE_BONUS_CAP | 20 | Maximum size bonus |

---

## 16. REMAINING LIMITATIONS

1. **RuleCapability is contract-only** — not connected to actual cleaners or remediation engines
2. **AssetSizeResolver is optional** — without it, size comes from RuleResult.estimated_size only
3. **Priority is deterministic but heuristic** — weights are documented and configurable via constants, but not yet user-tunable at runtime
4. **No Dashboard/UI integration** — this is a pure domain layer
5. **No Action Engine** — this layer only classifies; it does not execute

---

## 17. WHAT WAS NOT DONE (BY DESIGN)

Per task constraints, the following were explicitly NOT implemented:

- Actual cleanup or remediation execution
- Cleaner integration
- Action execution
- Dashboard/UI integration
- Health Score modifications
- SC-8C3 Part 3
- Modifications to SC-8A, SC-8B, SC-8C1, or SC-8C2 detection rules

---

## 18. CONCLUSION

SC-8C3 Part 2 is complete. The prioritization layer provides:

1. **Deterministic priority scoring** with documented weights
2. **Fixability classification** derived from safety + rule capability
3. **Actionability contracts** that never contradict SafetyAssessment
4. **Deterministic ordering** with stable tiebreakers
5. **Bulk summary** with counts and extremes
6. **Comprehensive tests** (43 tests, including safety matrix and determinism)
7. **Performance** — O(n log n), 10k findings in < 1000ms
8. **Zero system modification** — pure domain layer

The layer is frozen and ready for the Future Action Engine to consume.
