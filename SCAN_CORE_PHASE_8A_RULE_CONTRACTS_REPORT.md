# SCAN CORE PHASE SC-8A: RULE ENGINE CONTRACTS & DOMAIN MODELS

**Date:** August 12, 2026  
**Status:** ✅ COMPLETE  
**Phase:** SC-8A (Domain Contracts Only)  
**Next Phase:** SC-8B (Rule Evaluation Implementation)

---

## EXECUTIVE SUMMARY

SC-8A establishes the complete domain language and contracts for the AVS Shield Rule Engine without implementing evaluation logic or actual detection rules. This phase creates the foundation for a **DECISION / CLASSIFICATION layer** that remains completely separated from system modification.

### Key Achievements

- ✅ **98 new tests** — all passing
- ✅ **390 existing tests** — zero regressions
- ✅ **mypy strict mode** — clean (source files)
- ✅ **Immutable models** — frozen dataclasses throughout
- ✅ **Explainable results** — evidence + confidence + safety
- ✅ **Separation of concerns** — severity ≠ confidence ≠ safety
- ✅ **No system modification** — contracts enforce read-only access

---

## ARCHITECTURE PRINCIPLE

The Rule Engine is a **DECISION / CLASSIFICATION layer** that answers:

1. **What did we discover?**
2. **Does this asset match a known condition?**
3. **Why does it match?**
4. **How confident are we?**
5. **Is it safe to act on?**
6. **What type of action could eventually be appropriate?**

It must **NEVER** perform the action.

### Data Flow

```
Enumerator
    ↓
ScanAsset (SC-6A)
    ↓
AssetSnapshot (SC-6C)
    ↓
Metadata Cache (SC-7)
    ↓
Rule Engine (SC-8A) ← YOU ARE HERE
    ↓
RuleResult
    ↓
[Future: Action Engine (SC-8B+)]
    ↓
[Future: Verification]
```

---

## CREATED MODULES

### Module Structure

```
backend/src/avs_backend/scan_core/rules/
├── __init__.py          # Public API exports
├── enums.py             # All enum types
├── models.py            # RuleIdentifier, RuleVersion
├── evidence.py          # Evidence, EvidenceCollection
├── confidence.py        # Confidence, ConfidenceScore
├── safety.py            # SafetyAssessment
├── result.py            # RuleResult, RuleMatchStatus
├── rule.py              # Rule (abstract), RuleMetadata
└── tests/
    ├── __init__.py
    ├── test_enums.py
    ├── test_models.py
    ├── test_evidence.py
    ├── test_confidence.py
    ├── test_safety.py
    ├── test_result.py
    └── test_rule.py
```

---

## 1. RULE IDENTIFIERS

### RuleIdentifier

**Format:** `category.subcategory.target[.detail]`

**Examples:**
- `junk.browser.chrome.cache`
- `registry.orphaned.startup`
- `startup.missing.target`
- `privacy.browser.history`
- `security.unsigned.executable`

**Validation:**
- Must be lowercase alphanumeric with dots and underscores only
- Minimum 2 segments (e.g., `category.target`)
- No random UUIDs — identifiers must be stable

**Properties:**
```python
identifier.category      # First segment
identifier.subcategory   # Second segment (if present)
identifier.target        # Third segment (if present)
```

### RuleVersion

**Format:** `major.minor.patch` (semantic versioning)

**Comparison:** Full ordering support (`<`, `<=`, `>`, `>=`, `==`, `!=`)

**Serialization:** `to_string()`, `from_string()`

---

## 2. ENUMERATIONS

### RuleCategory

```python
JUNK, CACHE, TEMPORARY, PRIVACY, REGISTRY, STARTUP, BROWSER,
PERFORMANCE, SECURITY, SYSTEM, NETWORK, SUSPICIOUS, CUSTOM
```

### Severity

```python
INFO, LOW, MEDIUM, HIGH, CRITICAL
```

**IMPORTANT:** Severity ≠ Safety. A `CRITICAL` severity finding may still be `BLOCKED` from action.

### ActionType

```python
NONE, DELETE, REGISTRY_REMOVE, DISABLE_STARTUP, CLEAR_CACHE,
RESET_SETTING, REVIEW, DEFER, QUARANTINE, REPAIR, OPTIMIZE
```

**DESCRIPTION ONLY** — the Rule Engine never executes these.

### SafetyLevel

```python
SAFE, LOW_RISK, REVIEW_REQUIRED, HIGH_RISK, BLOCKED
```

### EvidenceType

```python
PATH_MATCH, EXTENSION_MATCH, SIZE_MATCH, AGE_MATCH, METADATA_MATCH,
STATE_MATCH, RELATIONSHIP_MATCH, TAG_MATCH, CATEGORY_MATCH, TYPE_MATCH,
KNOWN_LOCATION, KNOWN_PATTERN, HISTORICAL_MATCH, APPLICATION_MATCH,
SIGNATURE_MATCH, BEHAVIOR_MATCH, CUSTOM
```

### ConfidenceFactor

```python
ASSET_TYPE_MATCH, PATH_MATCH, METADATA_MATCH, STATE_MATCH,
HISTORICAL_MATCH, APPLICATION_MATCH, RULE_CERTAINTY,
MULTIPLE_EVIDENCE, STRONG_EVIDENCE, WEAK_EVIDENCE
```

### SafetyBlocker

```python
SYSTEM_CRITICAL, ACTIVE, LOCKED, PROTECTED, UNKNOWN,
INSUFFICIENT_EVIDENCE, USER_DATA, REQUIRED_DEPENDENCY, CUSTOM
```

### RuleStatus

```python
ENABLED, DISABLED, DEPRECATED, EXPERIMENTAL
```

---

## 3. EVIDENCE MODEL

### Evidence (frozen dataclass)

```python
@dataclass(frozen=True)
class Evidence:
    evidence_type: EvidenceType
    description: str
    source: str
    value: str
    weight: float = 1.0  # 0.0-1.0
    timestamp: Optional[datetime] = None
```

**Requirements:**
- Human-readable description
- Traceable source
- Non-sensitive (no passwords, tokens)
- Weight between 0.0 and 1.0

**Serialization:** `to_dict()`, `from_dict()`

### EvidenceCollection (frozen dataclass)

```python
@dataclass(frozen=True)
class EvidenceCollection:
    items: tuple[Evidence, ...]
```

**Properties:**
- `count` — number of evidence items
- `total_weight` — sum of all weights
- `average_weight` — mean weight
- `get_by_type(evidence_type)` — filter by type

---

## 4. CONFIDENCE MODEL

### ConfidenceScore (frozen dataclass)

```python
@dataclass(frozen=True)
class ConfidenceScore:
    factor: ConfidenceFactor
    score: float  # 0.0-100.0
    description: str
```

### Confidence (frozen dataclass)

```python
@dataclass(frozen=True)
class Confidence:
    score: float  # 0.0-100.0
    factors: tuple[ConfidenceScore, ...]
```

**Levels:**
- 0-20: Very low
- 21-40: Low
- 41-60: Medium
- 61-80: High
- 81-100: Very high

**Properties:**
- `level` — string representation
- `is_high` — score > 60.0
- `is_low` — score ≤ 40.0

**IMPORTANT:** Confidence is separate from severity and safety.

---

## 5. SAFETY MODEL

### SafetyAssessment (frozen dataclass)

```python
@dataclass(frozen=True)
class SafetyAssessment:
    level: SafetyLevel
    reason: str
    blockers: tuple[SafetyBlocker, ...]
```

**Validation:**
- `BLOCKED` level must have at least one blocker
- Reason cannot be empty

**Properties:**
- `is_safe` — level == SAFE
- `is_blocked` — level == BLOCKED
- `requires_review` — level == REVIEW_REQUIRED
- `is_actionable` — SAFE or LOW_RISK

**Factory methods:**
- `create_safe(reason)`
- `create_blocked(reason, blockers)`
- `create_review_required(reason)`

**CRITICAL CONCEPT:**

A detection can be:
```python
matched = True
severity = CRITICAL
confidence = 95.0
safety = BLOCKED
```

This is **valid and expected** for system-critical assets.

---

## 6. RULE RESULT MODEL

### RuleMatchStatus

```python
NO_MATCH           # Rule did not match
MATCHED            # Rule matched
MATCHED_BLOCKED    # Rule matched but action is blocked
MATCHED_REVIEW     # Rule matched but requires manual review
```

### RuleResult (frozen dataclass)

```python
@dataclass(frozen=True)
class RuleResult:
    # Rule identification
    rule_id: str
    rule_version: str
    
    # Asset identification
    asset_id: str
    
    # Match status
    status: RuleMatchStatus
    
    # Assessment
    severity: Severity
    confidence: Confidence
    safety: SafetyAssessment
    
    # Explanation
    reason: str
    evidence: EvidenceCollection
    
    # Recommendation (DESCRIPTION only)
    recommended_action: ActionType
    
    # Optional
    estimated_size: Optional[int]
    metadata: dict[str, Any]
    evaluated_at: datetime
```

**Properties:**
- `matched` — status != NO_MATCH
- `is_blocked` — status == MATCHED_BLOCKED
- `requires_review` — status == MATCHED_REVIEW
- `is_actionable` — MATCHED and safety.is_actionable

**Factory methods:**
- `create_no_match(rule_id, rule_version, asset_id, reason)`
- `create_matched(rule_id, rule_version, asset_id, severity, confidence, safety, reason, evidence, recommended_action, ...)`

**Serialization:** `to_dict()`, `from_dict()`

---

## 7. RULE CONTRACT

### RuleMetadata (frozen dataclass)

```python
@dataclass(frozen=True)
class RuleMetadata:
    identifier: RuleIdentifier
    version: RuleVersion
    name: str
    description: str
    category: RuleCategory
    severity: Severity
    priority: int = 100
    status: RuleStatus = RuleStatus.ENABLED
    supported_asset_types: tuple[str, ...] = tuple()
    tags: tuple[str, ...] = tuple()
    author: Optional[str] = None
    documentation_url: Optional[str] = None
```

**Methods:**
- `supports_asset_type(asset_type)` — check if rule applies to asset type
- `is_enabled` — status == ENABLED
- `is_experimental` — status == EXPERIMENTAL

### Rule (abstract base class)

```python
class Rule(ABC):
    def __init__(self, metadata: RuleMetadata):
        self._metadata = metadata
    
    @abstractmethod
    def evaluate(
        self,
        asset: ScanAsset,
        snapshot: Optional[AssetSnapshot] = None,
        context: Optional[ScanContext] = None,
    ) -> RuleResult:
        """
        Evaluate rule against an asset.
        
        This method consumes READ-ONLY scan information and produces
        a RuleResult describing the match, confidence, safety, and
        recommended action.
        
        This method MUST NOT:
        - Modify the asset
        - Modify the snapshot
        - Modify the context
        - Perform any system modifications
        
        NOTE: Implementation is deferred to SC-8B.
        This is a contract definition only.
        """
        raise NotImplementedError("Rule evaluation not implemented in SC-8A")
```

---

## 8. SECURITY BOUNDARIES

### What the Rule Engine CAN Access (Read-Only)

✅ `ScanAsset` objects  
✅ `AssetSnapshot` objects  
✅ `ScanContext` objects  
✅ `MetadataQueries` (read-only queries)  
✅ Asset repositories (read-only)  

### What the Rule Engine CANNOT Access

❌ Filesystem write operations  
❌ Registry write operations  
❌ Shell execution  
❌ Process termination  
❌ Cleaner interfaces  
❌ Orchestrator mutation  
❌ Dashboard modification  
❌ Score modification  

**Enforcement:** The `Rule.evaluate()` contract accepts read-only parameters only. No write interfaces are exposed.

---

## 9. SERIALIZATION

All models support JSON-compatible serialization:

```python
# Evidence
evidence.to_dict() → dict
Evidence.from_dict(data) → Evidence

# Confidence
confidence.to_dict() → dict
Confidence.from_dict(data) → Confidence

# Safety
safety.to_dict() → dict
SafetyAssessment.from_dict(data) → SafetyAssessment

# Result
result.to_dict() → dict
RuleResult.from_dict(data) → RuleResult
```

**Schema versioning:** Follows SC-6A conventions (not yet implemented in SC-8A).

---

## 10. IMMUTABILITY

All domain models use `@dataclass(frozen=True)`:

- `RuleIdentifier`
- `RuleVersion`
- `Evidence`
- `EvidenceCollection`
- `ConfidenceScore`
- `Confidence`
- `SafetyAssessment`
- `RuleResult`
- `RuleMetadata`

**Benefit:** Accidental mutation is impossible. Results are safe to cache and share.

---

## 11. TEST COVERAGE

### Test Summary

```
98 tests — all passing
```

### Test Breakdown

| Module | Tests | Coverage |
|--------|-------|----------|
| `test_enums.py` | 14 | All enums, values, distinctness |
| `test_models.py` | 18 | Identifiers, versions, validation, comparison |
| `test_evidence.py` | 14 | Evidence, collections, serialization, immutability |
| `test_confidence.py` | 14 | Scores, factors, levels, validation |
| `test_safety.py` | 14 | Levels, blockers, factory methods, validation |
| `test_result.py` | 14 | Match statuses, serialization, properties |
| `test_rule.py` | 10 | Metadata, abstract contract, validation |

### Test Categories

✅ **Validation:** Empty values, invalid ranges, negative numbers  
✅ **Serialization:** `to_dict()`, `from_dict()`, round-trip  
✅ **Immutability:** Frozen dataclass enforcement  
✅ **Equality:** Comparison operators, hash stability  
✅ **Properties:** Computed properties, derived values  
✅ **Factory methods:** Convenience constructors  
✅ **Boundary values:** Min/max ranges, edge cases  

---

## 12. VALIDATION RESULTS

### pytest

```bash
python -m pytest backend/tests/ -q --tb=no
```

**Result:** ✅ **390 passed, 9 skipped** (zero regressions)

### mypy (strict mode)

```bash
python -m mypy backend/src/avs_backend/scan_core/rules --exclude tests --strict
```

**Result:** ✅ **Success: no issues found in 8 source files**

### SC-8A Tests

```bash
python -m pytest backend/src/avs_backend/scan_core/rules/tests/ -v
```

**Result:** ✅ **98 passed in 12.38s**

---

## 13. CROSS-PLATFORM COMPATIBILITY

The Rule Engine contracts are **platform-independent**:

- No OS-specific imports in domain models
- No Windows-only dependencies
- Path handling deferred to asset models (SC-6A)
- Ready for future macOS support

**Windows-specific logic** will be isolated in:
- Rule implementations (SC-8B+)
- Enumerators (SC-1 through SC-5)
- Action engines (future)

---

## 14. KNOWN LIMITATIONS

### Deferred to SC-8B

❌ Rule evaluation implementation  
❌ Actual detection rules  
❌ Rule registry  
❌ Rule execution engine  
❌ Action engine integration  
❌ Cleaner integration  
❌ Score integration  
❌ Dashboard integration  

### Design Decisions

1. **No schema versioning yet** — serialization supports it, but version migration logic is deferred
2. **No rule registry** — rules are not discoverable yet (SC-8B)
3. **No caching** — rule results are not cached (future optimization)
4. **No rule dependencies** — rules cannot depend on other rules yet
5. **No rule composition** — no AND/OR/NOT logic (future)

---

## 15. ARCHITECTURAL REVIEW

### ✅ Verified Principles

| Principle | Status |
|-----------|--------|
| Rule Engine depends on domain models, not UI | ✅ |
| Rule Engine does not depend on cleaners | ✅ |
| Rule Engine does not modify the system | ✅ |
| RuleResult is explainable | ✅ |
| Confidence is separate from severity | ✅ |
| Safety is separate from severity | ✅ |
| Recommended action is separate from execution | ✅ |
| Models are immutable | ✅ |
| Identifiers are deterministic | ✅ |
| Evidence is traceable | ✅ |

---

## 16. INTEGRATION POINTS (Future)

### SC-8B: Rule Evaluation

- Implement `Rule.evaluate()` for concrete rule classes
- Create rule implementations for junk, cache, privacy, registry, startup, security
- Build rule registry for discovery and management

### SC-8C: Action Engine

- Consume `RuleResult` objects
- Map `ActionType` to actual cleaner operations
- Enforce safety checks before execution
- Provide rollback/undo capabilities

### SC-8D: Integration

- Connect Rule Engine to existing cleaners
- Update orchestrator to use rule results
- Integrate with dashboard for visualization
- Update health model to consume rule-based scores

---

## 17. SUCCESS CRITERIA

### ✅ All Criteria Met

- [x] Rule domain contracts are clean
- [x] Models are deterministic
- [x] Results are explainable
- [x] Safety is separated from severity
- [x] No system modification is possible
- [x] Existing SC-1 through SC-7 tests remain green (390 passed)
- [x] New SC-8A tests are green (98 passed)
- [x] mypy is clean (strict mode)
- [x] Zero regressions

---

## 18. NEXT STEPS

### SC-8B: Rule Evaluation Implementation

**Scope:**
1. Implement concrete rule classes
2. Create detection rules for:
   - Junk files (browser cache, temp files, logs)
   - Registry issues (orphaned entries, invalid paths)
   - Startup entries (missing targets, suspicious locations)
   - Privacy data (browser history, cookies, traces)
   - Security threats (unsigned executables, suspicious processes)
3. Build rule registry for discovery
4. Create rule evaluation engine
5. Test rule evaluation with real assets

**NOT in SC-8B:**
- Action execution (deferred to SC-8C)
- Cleaner integration (deferred to SC-8D)
- Dashboard integration (deferred to SC-8D)

---

## 19. CONCLUSION

SC-8A successfully establishes the complete domain language for the AVS Shield Rule Engine. The contracts are:

- **Clean** — zero mypy errors, zero test failures
- **Deterministic** — stable identifiers, reproducible results
- **Explainable** — evidence + confidence + safety
- **Safe** — immutable, read-only, no system modification
- **Extensible** — ready for SC-8B implementation

**The Rule Engine foundation is complete and frozen.**

---

**Report Generated:** August 12, 2026  
**Phase:** SC-8A COMPLETE  
**Status:** ✅ READY FOR SC-8B
