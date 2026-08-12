# SCAN CORE PHASE SC-8B: RULE REGISTRY + EVALUATION CONTEXT

**Date:** August 13, 2026, 12:47 AM IST  
**Status:** ✅ COMPLETE  
**Phase:** SC-8B (Registry & Context Infrastructure)  
**Next Phase:** SC-8C (Rule Evaluation Implementation)

---

## EXECUTIVE SUMMARY

SC-8B establishes the infrastructure for safe rule registration, discovery, and evaluation without implementing actual detection rules. This phase creates the **registry and context layer** that enables controlled rule execution with read-only data access.

### Key Achievements

- ✅ **42 new tests** — all passing
- ✅ **530 total tests** — zero regressions (488 existing + 42 new)
- ✅ **mypy strict mode** — clean
- ✅ **Thread-safe registry** — with deterministic ordering
- ✅ **Read-only context** — enforces no system modification
- ✅ **Applicability filtering** — performance optimization
- ✅ **Version conflict detection** — prevents silent overwrites

---

## ARCHITECTURE OVERVIEW

### Data Flow

```
ScanAsset
    ↓
AssetSnapshot
    ↓
Metadata Cache
    ↓
RuleRegistry ← SC-8B (YOU ARE HERE)
    ↓
Applicability Check
    ↓
RuleEvaluationContext
    ↓
[Future: Rule.evaluate()]
    ↓
RuleResult
    ↓
[Future: Action Engine]
```

### SC-8B Boundary

**IN SCOPE:**
- Rule registration and discovery
- Version conflict detection
- Applicability filtering
- Read-only evaluation context
- Metadata access through existing repositories

**OUT OF SCOPE:**
- Rule evaluation implementation (SC-8C)
- Actual detection rules (SC-8C+)
- Action execution (future)
- Cleaner integration (future)

---

## CREATED MODULES

### Module Structure

```
backend/src/avs_backend/scan_core/rules/
├── registry.py           # RuleRegistry, RuleRegistrationError
├── applicability.py      # ApplicabilityEngine, ApplicabilityResult
├── context.py            # RuleEvaluationContext
└── tests/
    ├── test_registry.py       # 17 tests
    ├── test_applicability.py  # 14 tests
    └── test_context.py        # 11 tests
```

---

## 1. RULE REGISTRY

### RuleRegistry

Thread-safe registry for rule registration and discovery.

**Features:**
- Safe registration with duplicate detection
- Version conflict detection
- Efficient indexed lookup
- Deterministic ordering
- Thread-safe operations

**Methods:**

```python
register(rule: Rule) -> None
unregister(rule_id: str) -> bool
get(rule_id: str) -> Optional[Rule]
contains(rule_id: str) -> bool
list_all() -> list[Rule]
list_enabled() -> list[Rule]
get_by_category(category: RuleCategory) -> list[Rule]
get_by_asset_type(asset_type: AssetType) -> list[Rule]
get_by_status(status: RuleStatus) -> list[Rule]
count() -> int
clear() -> None
```

### Registration Safety

**Duplicate Detection:**

```python
# Same rule ID + same version = ERROR
registry.register(rule_v1_0_0)
registry.register(rule_v1_0_0)  # RuleRegistrationError

# Same rule ID + different version = ERROR
registry.register(rule_v1_0_0)
registry.register(rule_v2_0_0)  # RuleRegistrationError (version conflict)
```

**Rationale:** No silent overwrites. Explicit unregister required for version upgrades.

### Validation

Rules are validated on registration:

- ✅ Rule ID not empty
- ✅ Name not empty
- ✅ Description not empty
- ✅ Version components non-negative

Invalid rules are rejected with `RuleRegistrationError`.

### Indexing

Internal indexes for O(1) lookup:

- `_by_category: dict[RuleCategory, list[str]]`
- `_by_status: dict[RuleStatus, list[str]]`
- `_by_asset_type: dict[str, list[str]]`

**Performance:**
- Tested with 100 rules
- Lookup: O(1)
- List operations: O(n log n) for sorting (deterministic order)

### Deterministic Ordering

All list operations return rules sorted by rule ID:

```python
rules = registry.list_all()
# Always returns: ["alpha.rule", "beta.rule", "gamma.rule"]
# Never random order
```

**Rationale:** Reproducible behavior for testing and debugging.

---

## 2. APPLICABILITY ENGINE

### ApplicabilityEngine

Determines whether a rule can apply to an asset **before** evaluation.

**Purpose:**
- Performance optimization (skip inapplicable rules)
- Correctness boundary (don't evaluate wrong asset types)

### ApplicabilityStatus

```python
APPLICABLE           # Rule can be evaluated
NOT_APPLICABLE       # Rule cannot apply (wrong type/category)
DISABLED             # Rule is disabled
UNSUPPORTED_ASSET    # Asset type not supported by rule
INVALID_RULE         # Rule configuration invalid
```

**IMPORTANT:** This is NOT the same as `RuleMatchStatus`.

- `APPLICABLE` ≠ `MATCHED`
- `NOT_APPLICABLE` ≠ `NO_MATCH`

Applicability is a **pre-check**. Match status is the **result**.

### ApplicabilityResult

```python
@dataclass(frozen=True)
class ApplicabilityResult:
    status: ApplicabilityStatus
    reason: str
    
    @property
    def is_applicable(self) -> bool
```

### Applicability Checks

```python
# Check single rule
result = ApplicabilityEngine.check_applicability(rule, asset)

# Filter all rules
results = ApplicabilityEngine.filter_applicable_rules(rules, asset)

# Get only applicable rules
applicable = ApplicabilityEngine.get_applicable_rules(rules, asset)
```

### Applicability Logic

1. **Check rule status** — disabled/experimental rules are not applicable
2. **Check asset type** — rule must support asset type
3. **Return result** — APPLICABLE or reason for rejection

**Example:**

```python
# Browser cache rule
rule.supported_asset_types = [AssetType.FILE]

# File asset → APPLICABLE
# Registry asset → UNSUPPORTED_ASSET
# Process asset → UNSUPPORTED_ASSET
```

### Universal Rules

Rules with no asset type restrictions apply to all types:

```python
rule.supported_asset_types = tuple()  # Empty = all types

# Applicable to FILE, DIRECTORY, REGISTRY_KEY, etc.
```

---

## 3. RULE EVALUATION CONTEXT

### RuleEvaluationContext

Read-only context providing rules with access to scan data.

**Immutable:** `@dataclass(frozen=True)`

**Fields:**

```python
asset: ScanAsset                                    # Primary asset
snapshot: Optional[AssetSnapshot]                   # Current snapshot
scan_context: Optional[ScanContext]                 # Scan context
asset_repository: Optional[AssetRepository]         # For queries
snapshot_repository: Optional[SnapshotRepository]   # For queries
```

### Read-Only Methods

```python
get_asset() -> ScanAsset
get_snapshot() -> Optional[AssetSnapshot]
get_scan_context() -> Optional[ScanContext]
get_previous_snapshot() -> Optional[AssetSnapshot]
get_asset_history(limit: int = 10) -> list[AssetSnapshot]
get_related_assets() -> list[ScanAsset]
find_assets_by_tag(tag: str) -> list[str]
find_assets_by_type(asset_type: AssetType) -> list[str]
get_latest_snapshot(asset_id: str) -> Optional[AssetSnapshot]
```

**Note:** Repository methods return asset IDs, not full `ScanAsset` objects (matches SC-7 API).

### Factory Methods

```python
# Minimal context (asset only)
context = RuleEvaluationContext.create_minimal(asset)

# Full context with repositories
context = RuleEvaluationContext.create(
    asset=asset,
    snapshot=snapshot,
    scan_context=scan_context,
    asset_repository=asset_repo,
    snapshot_repository=snapshot_repo,
)
```

### Read-Only Enforcement

**What the context PROVIDES:**
- ✅ ScanAsset (read-only)
- ✅ AssetSnapshot (read-only)
- ✅ ScanContext (read-only)
- ✅ Metadata queries (read-only)

**What the context DOES NOT PROVIDE:**
- ❌ File write operations
- ❌ Registry write operations
- ❌ Process termination
- ❌ Shell execution
- ❌ Cleaner interfaces
- ❌ Orchestrator mutation

**Enforcement:** No write interfaces are exposed. Context is frozen (immutable).

---

## 4. INTEGRATION WITH SC-7 METADATA CACHE

### Repository Access

The context integrates with existing SC-7 repositories:

- `AssetRepository` — for asset queries
- `SnapshotRepository` — for snapshot queries

**NO DUPLICATION:** Uses existing persistence layer.

**NO RAW SQL:** Only structured repository methods.

### Example Queries

```python
# Find assets by tag
asset_ids = context.find_assets_by_tag("browser_cache")

# Find assets by type
file_ids = context.find_assets_by_type(AssetType.FILE)

# Get asset history
snapshots = context.get_asset_history(limit=10)
```

---

## 5. VERSION HANDLING

### Version Conflict Detection

```python
# Register v1.0.0
registry.register(rule_v1_0_0)

# Attempt to register v2.0.0 with same ID
registry.register(rule_v2_0_0)
# → RuleRegistrationError: version conflict
```

**Upgrade Process:**

```python
# Explicit upgrade
registry.unregister("junk.temp")
registry.register(rule_v2_0_0)
```

**Rationale:** No automatic upgrades in SC-8B. Explicit control required.

### Version Comparison

Uses `RuleVersion` from SC-8A:

```python
v1_0_0 = RuleVersion(1, 0, 0)
v2_0_0 = RuleVersion(2, 0, 0)

v1_0_0 < v2_0_0  # True
v1_0_0 == v2_0_0  # False
```

---

## 6. SECURITY BOUNDARIES

### No Arbitrary Code Execution

Rules cannot execute arbitrary code through:

- ❌ Configuration
- ❌ Metadata
- ❌ Rule ID
- ❌ Rule name
- ❌ Serialized data
- ❌ External files
- ❌ Dynamic imports

**Only explicitly registered `Rule` objects may execute.**

### Read-Only Data Access

Rules receive:

- ✅ Immutable context (`frozen=True`)
- ✅ Read-only repository methods
- ✅ No write interfaces

**System modification is impossible through the context.**

---

## 7. PERFORMANCE

### Registry Performance

**Tested with 100 rules:**

- Registration: O(1) + indexing overhead
- Lookup by ID: O(1)
- List all: O(n log n) for sorting
- Filter by category: O(k log k) where k = rules in category
- Filter by asset type: O(k log k) where k = applicable rules

**Indexes:**

- Category index: O(1) lookup
- Status index: O(1) lookup
- Asset type index: O(1) lookup

### Applicability Performance

**Optimization:**

Instead of evaluating all rules:

```python
# Without applicability (slow)
for rule in all_rules:
    result = rule.evaluate(asset)  # Expensive

# With applicability (fast)
applicable = ApplicabilityEngine.get_applicable_rules(all_rules, asset)
for rule in applicable:
    result = rule.evaluate(asset)  # Only applicable rules
```

**Example:**

- 100 total rules
- 10 applicable to FILE assets
- 90% reduction in evaluations

---

## 8. DETERMINISM

### Deterministic Ordering

All registry operations return deterministic order:

```python
# Always sorted by rule ID
registry.list_all()
registry.list_enabled()
registry.get_by_category(RuleCategory.JUNK)
registry.get_by_asset_type(AssetType.FILE)
```

**Rationale:** Reproducible behavior for testing and debugging.

### Deterministic Applicability

Same inputs → same output:

```python
rule + asset → ApplicabilityResult (always same)
```

**No randomness. No timestamps. No UUIDs.**

---

## 9. TEST COVERAGE

### Test Summary

```
42 new tests — all passing
530 total tests — zero regressions
```

### Test Breakdown

| Module | Tests | Coverage |
|--------|-------|----------|
| `test_registry.py` | 17 | Registration, lookup, indexes, versioning, validation |
| `test_applicability.py` | 14 | Status, filtering, asset types, determinism |
| `test_context.py` | 11 | Creation, immutability, read-only access |

### Test Categories

✅ **Registry:**
- Empty registry
- Register rule
- Duplicate detection (same version)
- Version conflict detection
- Unregister
- Lookup (get, contains)
- List all (deterministic order)
- List enabled
- Filter by category
- Filter by asset type
- Filter by status
- Clear
- Invalid rule rejection
- Large registry (100 rules)

✅ **Applicability:**
- Enabled rule applicable
- Disabled rule not applicable
- Unsupported asset type
- Universal rules (all types)
- Filter applicable rules
- Get applicable rules only
- Experimental rules
- Deterministic results

✅ **Context:**
- Minimal context (asset only)
- Context with snapshot
- Immutability
- Read-only access
- Repository methods (no repository = empty results)
- Factory methods

---

## 10. VALIDATION RESULTS

### pytest

```bash
python -m pytest backend/tests/ backend/src/avs_backend/scan_core/rules/tests/ -q
```

**Result:** ✅ **530 passed, 9 skipped** (zero regressions)

### mypy (strict mode)

```bash
python -m mypy backend/src/avs_backend/scan_core/rules --exclude tests --strict
```

**Result:** ✅ **Success: no issues found in 11 source files**

### SC-8A Integrity

✅ **SC-8A contracts unchanged**  
✅ **98 SC-8A tests still passing**  
✅ **No modifications to domain models**

---

## 11. KNOWN LIMITATIONS

### Deferred to SC-8C

❌ Rule evaluation implementation  
❌ Actual detection rules  
❌ Rule execution engine  
❌ Historical snapshot queries (placeholder methods)  
❌ Related asset queries (placeholder methods)  

### Design Decisions

1. **No automatic rule upgrades** — explicit unregister + register required
2. **No rule dependencies** — rules cannot depend on other rules yet
3. **No rule composition** — no AND/OR/NOT logic yet
4. **No rule caching** — results are not cached yet
5. **Repository methods return IDs** — not full objects (matches SC-7 API)

---

## 12. ARCHITECTURAL REVIEW

### ✅ Verified Principles

| Principle | Status |
|-----------|--------|
| Registry is thread-safe | ✅ |
| Duplicate rules are rejected | ✅ |
| Version conflicts are detected | ✅ |
| Applicability is deterministic | ✅ |
| Context is read-only | ✅ |
| Context is immutable | ✅ |
| No system modification possible | ✅ |
| Metadata Cache is single source | ✅ |
| No raw SQL exposed | ✅ |
| Ordering is deterministic | ✅ |

---

## 13. INTEGRATION POINTS (Future)

### SC-8C: Rule Evaluation

- Implement `Rule.evaluate()` for concrete rule classes
- Use `RuleEvaluationContext` for data access
- Return `RuleResult` objects
- Leverage applicability filtering for performance

### SC-8D: Action Engine

- Consume `RuleResult` objects from registry
- Map `ActionType` to cleaner operations
- Enforce safety checks
- Provide rollback capabilities

---

## 14. SUCCESS CRITERIA

### ✅ All Criteria Met

- [x] Rules can be registered safely
- [x] Duplicate rules are rejected
- [x] Version conflicts are detected
- [x] Rules can be queried efficiently
- [x] Evaluation context is read-only
- [x] Evaluation context is immutable
- [x] Metadata Cache remains single persistence layer
- [x] Applicability is deterministic
- [x] Unsupported rules are filtered before evaluation
- [x] No system modification is possible
- [x] SC-8A remains unchanged
- [x] All existing tests pass (530 total)
- [x] New tests pass (42 new)
- [x] mypy is clean (strict mode)
- [x] Zero regressions

---

## 15. NEXT STEPS

### SC-8C: Rule Evaluation Implementation

**Scope:**
1. Implement concrete rule classes
2. Create detection rules for:
   - Junk files (browser cache, temp files, logs)
   - Registry issues (orphaned entries, invalid paths)
   - Startup entries (missing targets, suspicious locations)
   - Privacy data (browser history, cookies, traces)
   - Security threats (unsigned executables, suspicious processes)
3. Implement `Rule.evaluate()` method
4. Test rule evaluation with real assets
5. Validate rule results

**NOT in SC-8C:**
- Action execution (deferred to SC-8D)
- Cleaner integration (deferred to SC-8D)
- Dashboard integration (deferred to SC-8D)

---

## 16. CONCLUSION

SC-8B successfully establishes the infrastructure for safe rule registration and evaluation. The registry and context are:

- **Safe** — no duplicate rules, version conflicts detected
- **Efficient** — indexed lookup, applicability filtering
- **Deterministic** — reproducible ordering and results
- **Read-only** — no system modification possible
- **Immutable** — frozen contexts, no accidental mutation
- **Tested** — 42 new tests, zero regressions

**The Rule Engine infrastructure is complete and frozen.**

---

**Report Generated:** August 13, 2026, 12:47 AM IST  
**Phase:** SC-8B COMPLETE  
**Status:** ✅ READY FOR SC-8C
