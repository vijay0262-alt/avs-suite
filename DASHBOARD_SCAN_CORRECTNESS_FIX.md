# AVS SUITE V1.0 — DASHBOARD SCAN CORRECTNESS FIX

## CRITICAL BUGS IDENTIFIED

### 1. "Review Results" Button Opens New Scan Instead of Showing Results
**Location:** `DashboardPageV2.tsx` line 334
**Current behavior:** `onClick={() => setScanModalOpen(true)}` opens ScanView which starts a NEW scan
**Expected behavior:** Navigate to the completed scan results using the stored `planId`

### 2. Dashboard Cards Not Updating After Auto-Optimization
**Root cause:** Auto-optimization completes but Dashboard state is not refreshed
**Missing:** Proper event handling and state refresh after optimization completes

### 3. Scan Performance Issues
**Root cause:** Large database (2.1 GB with 631K assets) causes slow initialization
**Impact:** Scan engine takes 60+ seconds to initialize, blocking all scans

### 4. Auto-Optimization Hangs on Large Plans
**Root cause:** Plans with >10K actions take too long to process
**Current fix:** Added 10K action limit, but needs better UX

## DATA FLOW ANALYSIS

### Current Complete Lifecycle

1. **Dashboard → Scan Button** → Opens `ScanView` modal (`setScanModalOpen(true)`)
2. **ScanView** → Uses `useScan` hook → Calls `scan_core.scan.quick` RPC
3. **Backend** → `ScanOrchestrator.scan_quick()` → Returns `ScanResult` with `action_plan_id`
4. **ScanView** → Detects completion → Triggers auto-optimization (for Dashboard module)
5. **AutoOptimizeView** → Calls `autoOptimize(planId)` RPC
6. **Backend** → `_run_auto_optimize` thread → `prepare → execute → verify`
7. **AutoOptimizeView** → Polls status → Shows completion summary
8. **AutoOptimizeView** → Emits `OptimizationEventType.CLEANING_COMPLETED` event
9. **DashboardViewModel** → Receives event → Calls `invalidateMetricsCache()` → Refreshes metrics
10. **Dashboard** → Should update health score and issue counts

### What's Broken

**After step 9:**
- Dashboard health score updates ✓
- Dashboard issue count does NOT update ✗
- "Review Results" button appears but opens new scan ✗
- Scan modal closes but no way to see results ✗

### Root Cause

The `useDashboardScan` hook provides a `snapshot` with:
- `scanStatus: 'complete'`
- `issuesFound: 32671` (from scan)
- `planId: 'plan-abc-123'`

But there's NO field for:
- `issuesRemaining` (after cleanup)
- `issuesCleaned`
- `cleanupResult`

The Dashboard shows `issuesFound` which is the DETECTION count, not the REMAINING count.

## FIX PLAN

### Fix 1: "Review Results" Button Navigation

**File:** `apps/pc-optimizer/src/features/dashboard/DashboardPageV2.tsx`
**Line:** 334

**Change:**
```tsx
// BEFORE (WRONG):
<Button
  onClick={() => setScanModalOpen(true)}  // Opens new scan
  ...
>
  Review Results
</Button>

// AFTER (CORRECT):
<Button
  onClick={() => {
    if (snapshot.planId) {
      navigate(`${snapshot.moduleRoute}?planId=${encodeURIComponent(snapshot.planId)}`);
    }
  }}
  ...
>
  Review Results
</Button>
```

This navigates to `/ai-smart-optimize?planId=plan-abc-123` which shows `PlanReviewView` with the completed scan results.

### Fix 2: Distinguish Detected vs Remaining Issues

**Problem:** Dashboard shows "32,671 issues found" even after cleaning 32,000 of them.

**Solution:** The backend auto-optimization result already contains:
- `total`: Total actions in plan
- `completed`: Actions successfully executed
- `failed`: Actions that failed
- `rejected`: Actions rejected by SafetyGate
- `skipped`: Actions skipped
- `requires_review`: Actions needing manual review

**Remaining issues = total - completed**

But this data is NOT persisted or exposed to the Dashboard after auto-optimization completes.

**Required changes:**
1. Persist auto-optimization result to scan history
2. Add `cleanupResult` to `DashboardScanSnapshot`
3. Update Dashboard cards to show remaining issues

### Fix 3: Scan Performance

**Immediate fix:** Database was reset (2.1 GB → fresh)
**Long-term fix:** Add database maintenance/cleanup job

### Fix 4: Auto-Optimization UX for Large Plans

**Current:** Shows error "Too many actions (32K) for automatic optimization"
**Better:** Show progress during execution, allow cancellation, batch processing

## IMPLEMENTATION PRIORITY

1. **Fix "Review Results" button** (5 minutes) — CRITICAL UX BUG
2. **Add cleanup result to snapshot** (30 minutes) — Show real remaining issues
3. **Update Dashboard cards** (15 minutes) — Display correct counts
4. **Test end-to-end** (30 minutes) — Verify complete workflow

## VERIFICATION CHECKLIST

After fixes:
- [ ] Click "Scan Now" → Scan runs with live progress
- [ ] Scan completes → Auto-optimization starts automatically
- [ ] Optimization completes → Shows summary with files cleaned, space recovered
- [ ] Dashboard health score updates to new value
- [ ] Dashboard issue count shows REMAINING issues (not detected)
- [ ] Click "Review Results" → Shows completed scan results (NOT new scan)
- [ ] Results show: detected, cleaned, remaining, failed, review required
- [ ] Health score matches the optimization summary
