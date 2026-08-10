# SCORE INTEGRITY REPORT

## Phase 22 — Scan Accuracy & Score Integrity

### Overview

This phase audited every score calculation in AVS Shield to ensure that
every point in the Health Score corresponds to a real, verifiable
improvement. Six integrity issues were found and fixed.

---

## Scoring Architecture

### Two Scoring Systems

AVS Shield has two scoring systems that must stay aligned:

1. **`calculateHealthScore()`** in `dashboard.utils.ts` — the **canonical**
   source used by the Dashboard. Computes category scores (0–100) from
   real `DashboardMetrics`, then combines them via weighted average.

2. **`HealthScoreService.computeHealth()`** in `HealthScoreService.ts` —
   used by diagnostics reports. Computes `100 - sum(penalties)` from
   registered `HealthContributionProvider` instances.

Both systems read from the same `DashboardMetrics` and must use the same
thresholds and penalty values from `HealthEngineConfig`.

---

## Score Formulas (Canonical — `calculateHealthScore`)

### Overall Health Score

```
overallScore = (storageScore × 0.30 +
                startupScore × 0.15 +
                privacyScore × 0.10 +
                performanceScore × 0.15 +
                securityScore × 0.20 +
                windowsScore × 0.10) / weightSum
```

- **Weight sum**: 1.00 (normalised)
- **Clamped**: [0, 100]
- **Unresolvable cap**: If unresolvable issues exist (critically full disk,
  disabled security, long uptime), score is capped at 99 (never 100)
- **Deferred handling**: Deferred modules are excluded from the overall
  score calculation (both numerator and denominator)

### Storage Score

| Input | Metric | Formula |
|---|---|---|
| Junk size | `performance.potentialRecoverable` | `penalty = min(40, log10(MB + 1) × 5)` |
| Drive usage | `storage[].usage` | `+20 if >90%, +10 if >80%` |

```
storageScore = clamp(100 - junkPenalty - driveFullPenalty)
```

- **Max contribution**: 30% of overall (weight × 100)
- **Min contribution**: 0% (if storage score is 0)
- **Deferred**: Excluded from overall calculation

### Startup Score

| Input | Metric | Formula |
|---|---|---|
| Startup apps | `performance.startupApps` | `penalty = min(50, apps × 5)` |

```
startupScore = clamp(100 - startupPenalty)
```

- **Max contribution**: 15% of overall
- **Min contribution**: 0%

### Privacy Score

| Input | Metric | Formula |
|---|---|---|
| Privacy risks | `privacyRisks` (browser count) | `penalty = min(100, risks × 10)` |

```
privacyScore = clamp(100 - privacyPenalty)
```

- **Max contribution**: 10% of overall
- **Min contribution**: 0%
- **FIX (Phase 22)**: Previously had no `maxPenalty` cap — penalty could
  exceed 100. Now capped at `privacyCfg.maxPenalty` (100).

### Performance Score

| Input | Metric | Formula |
|---|---|---|
| CPU usage | `cpu.usage` | `-30 if >80%, -15 if >60%` |
| Memory usage | `memory.usage` | `-25 if >85%, -12 if >70%` |

```
performanceScore = clamp(100 - cpuPenalty - memoryPenalty)
```

- **Max contribution**: 15% of overall
- **Min contribution**: 0%
- **Thresholds**: Configurable via `HealthEngineConfig.performance`

### Security Score

| Input | Metric | Formula |
|---|---|---|
| Defender disabled | `security.defender.enabled` | `-30` |
| RTP disabled | `security.defender.realTimeProtection` | `-20` |
| Firewall disabled | `security.firewall.enabled` | `-25` |
| SmartScreen disabled | `security.smartScreen` | `-10` |
| Pending updates | `security.updates.pendingUpdates > 0` | `-15` |

```
securityScore = clamp(100 - sum(securityPenalties))
```

- **Max contribution**: 20% of overall
- **Min contribution**: 0%
- **Third-party AV**: If third-party AV is detected, Defender/firewall
  penalties are skipped

### Windows Health Score

| Input | Metric | Formula |
|---|---|---|
| Uptime days | `windows.uptime / 86400` | Graduated: 100/90/70/40 |

```
windowsScore = clamp(
  uptimeDays >= 60 ? 40 :
  uptimeDays > 30 ? 70 :
  uptimeDays > 7 ? 90 : 100
)
```

- **Max contribution**: 10% of overall
- **Min contribution**: 0%

---

## Verification Logic

### Post-Optimization Re-Scan

After every optimization, `_verifyCategoryCleanup()` re-scans the cleaned
location to verify actual changes:

| Category | Verification Method | Score Formula |
|---|---|---|
| Storage | Re-scan junk cleaners, check `totalBytes` | `100 - log10(MB+1) × 5` (same as `calculateHealthScore`) |
| Privacy | Re-scan privacy service | `100 - min(100, issues × 10)` (same as `calculateHealthScore`) |
| System Health | Re-scan registry | `100 - min(20, issues × 0.5)` |
| Performance | Re-check CPU/memory thresholds | Threshold-based (same as `calculateHealthScore`) |
| Protection | Re-check security metrics | Binary penalties (same as `calculateHealthScore`) |

**FIX (Phase 22)**: Previously, `_verifyCategoryCleanup` used ad-hoc
formulas that didn't match `calculateHealthScore`. For example:
- Storage used `100 - issues/100` instead of `100 - log10(MB+1) × 5`
- Privacy used `100 - issues × 2` instead of `100 - min(100, issues × 10)`
- Performance used `100 - high.length × 5 - alerts × 10 - CPU/2` instead
  of threshold-based penalties
- Protection used `100 - (issues + (defender+firewall) × 20)` instead of
  config-based penalties

Now all verification formulas read from `HealthEngineConfig`, ensuring
the post-cleanup score is consistent with the dashboard score.

### Score Update Rules

After verification, the score is updated based on verified state:

| Condition | Score |
|---|---|
| Nothing cleaned (`itemsFixed=0 && bytesRecovered=0`) | `beforeScore` (no change) |
| All issues resolved (`afterIssues=0 && afterRecoverable=0`) | `100` |
| Fewer issues than before | `verifiedScore` (from re-scan) |
| More issues than before | `verifiedScore` (score may decrease) |
| Same issue count | `beforeScore` (no inflation) |

**FIX (Phase 22)**: Previously used `Math.max(verifiedScore, beforeScore)`
which prevented scores from ever decreasing. Now uses `verifiedScore`
directly, allowing honest score changes in both directions.

---

## Issue Accounting

### Invariant

```
Issues Found (before) = Fixed + Deferred + Failed + Remaining
```

Each module's `verification` object now includes:

| Field | Description |
|---|---|
| `fixed` | Issues actually resolved (verified by re-scan) |
| `deferred` | Issues deferred (locked, permission, browser running) |
| `failed` | Issues that failed to clean (error, not deferred) |
| `remaining` | Issues still present after optimization |

**FIX (Phase 22)**: Previously, the `verification` object only had
`beforeIssues` and `afterIssues` with no breakdown. Now the invariant
`beforeIssues = fixed + deferred + failed + remaining` is enforced.

### Aggregation

When modules are grouped into categories (via `healthCategoryMapping.ts`),
the `fixed`, `deferred`, `failed`, and `remaining` fields are summed
across all modules in the category.

---

## Duplicate Counting

### Browser Cache — FIXED

**Issue**: `browserCacheSize` was counted as an issue in BOTH:
- `buildStorageIssues()` → `storage-browser-cache` issue
- `buildPrivacyIssues()` → `privacy-cache` issue

This meant the same junk was double-counted in two categories, inflating
the issue count and penalizing both storage AND privacy scores.

**Fix**: Removed the `privacy-cache` issue from `buildPrivacyIssues()`.
Browser cache is now only counted in the storage category. Privacy
category only counts browser privacy traces (cookies, history, etc.).

---

## HealthScoreService Provider Alignment

### Discrepancies Found and Fixed

| Provider | Issue | Fix |
|---|---|---|
| `PrivacyHealthProvider` | Used `browserCount × 5` with `maxPenalty=15` | Now uses `cfg.privacy.penaltyPerRisk` (10) and `cfg.privacy.maxPenalty` (100) |
| `PerformanceHealthProvider` | Used `avgUsage × 0.25` (linear) with `maxPenalty=25` | Now uses threshold-based penalties from `cfg.performance` (same as `calculateHealthScore`) |
| `SecurityHealthProvider` | Used hardcoded penalties (15/10/12/5/8) with `maxPenalty=50` | Now uses `cfg.security` penalty values (30/20/25/10/15) |

All providers now read from `HealthEngineConfig`, ensuring
`HealthScoreService.computeHealth()` produces the same results as
`calculateHealthScore()`.

---

## Edge Cases

### 1. Backend Unavailable

When the backend is unavailable, `getMetrics()` returns `null`. All
category scores default to 100 (no penalty). The overall score is 100.
This is intentional — we don't penalize the user for backend issues.

### 2. Partial Metrics

If some metrics are missing (e.g. `security` is undefined), the guard
clauses in `calculateHealthScore` provide defaults. Security defaults
to all-disabled (score=0), which is conservative.

### 3. Deferred Items

Deferred items are excluded from the overall score calculation. They
don't penalize the user because the issues couldn't be cleaned
automatically. The background cleanup service retries them when the
blocking application closes.

### 4. Unresolvable Issues

If unresolvable issues exist (critically full disk, disabled security,
long uptime), the overall score is capped at 99. The app can improve
the score by fixing what it can, but cannot honestly report 100 when
issues remain that require user action.

### 5. Score Decrease After Optimization

If verification finds MORE issues than before (e.g. new junk accumulated
during the optimization), the score may decrease. This is honest behavior
— the previous formula prevented this by using `Math.max(verified, before)`.

### 6. Second Scan Finds Fewer Issues

After a successful optimization, the verification re-scan should find
fewer issues. The score is updated to `verifiedScore` which reflects the
actual post-cleanup state. No score inflation.

---

## Files Modified

### `dashboard.utils.ts`
- Removed duplicate `privacy-cache` issue from `buildPrivacyIssues()`
- Applied `privacyCfg.maxPenalty` cap to privacy penalty calculation

### `DashboardViewModel.ts`
- Added `getHealthEngineConfig` import
- Rewrote `_verifyCategoryCleanup()` to use `HealthEngineConfig` thresholds
  instead of ad-hoc formulas
- Fixed score inflation: use `verifiedScore` directly instead of
  `Math.max(verifiedScore, beforeScore)`
- Added issue accounting fields (`fixed`, `deferred`, `failed`, `remaining`)
  to all three `verification` object construction sites

### `dashboard.types.ts`
- Added `fixed`, `deferred`, `failed`, `remaining` fields to
  `HealthScanModuleResult.verification` interface

### `healthCategoryMapping.ts`
- Added issue accounting field aggregation to `aggregatedVerification`

### `healthProviders.ts`
- Added `getHealthEngineConfig` import
- Aligned `PrivacyHealthProvider` with config-based penalties
- Aligned `PerformanceHealthProvider` with threshold-based penalties
- Aligned `SecurityHealthProvider` with config-based penalty values

---

## Validation

- **Lint**: 0 warnings, 0 errors
- **Typecheck**: 0 errors
- **Tests**: 8001 passed (120 test files)
- **Build**: Successful production build (15.52s)

---

## Manual Validation Checklist

### Test 1: Score Explainability

1. Open AVS Shield Dashboard
2. Note the Health Score (e.g. 94)
3. Click on each category (Storage, Startup, Privacy, Performance, Security, Windows)
4. Verify: Each category score matches the formula in this report
5. Verify: Overall score = weighted average of category scores

### Test 2: Optimization Score Update

1. Run "Optimize Now"
2. After optimization completes, note the before/after scores
3. Verify: After score = verifiedScore from re-scan (not inflated)
4. Verify: If nothing was cleaned, score didn't change
5. Verify: If all issues resolved, score = 100

### Test 3: Issue Accounting

1. Run "Optimize Now" with Chrome open (to create deferred items)
2. After optimization, check each module's verification object
3. Verify: `beforeIssues = fixed + deferred + failed + remaining`
4. Verify: Deferred items are excluded from overall score

### Test 4: No Duplicate Counting

1. Check the issues list on the Dashboard
2. Verify: Browser cache appears only once (in Storage category)
3. Verify: Privacy category only shows browser traces, not cache size

### Test 5: Multiple Optimization Cycles

1. Run "Optimize Now" — note score and issues
2. Run "Optimize Now" again immediately
3. Verify: Second scan finds fewer (or equal) issues
4. Verify: Score doesn't randomly change between scans
5. Verify: No score inflation across multiple cycles

### Test 6: Score Decrease (Honest Behavior)

1. Note current score
2. Create junk files (copy large files to temp directory)
3. Refresh dashboard
4. Verify: Score decreases (storage penalty increases)
5. Run "Optimize Now"
6. Verify: Score increases after cleaning
