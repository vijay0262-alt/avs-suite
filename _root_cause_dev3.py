"""
Focused root cause test v3: Verify fixes work.
- Create fixtures in %TEMP%
- Scan (should be faster now with targeted browser cache locations)
- Clean
- Verify physical deletion
- Check accounting (verified_cleaned should match physical deletion)
"""
import os
import sys
import time
import tempfile
import json
from pathlib import Path

# Create a temporary directory for the test database
TEST_DB_DIR = Path(tempfile.mkdtemp(prefix="avs_test_db_"))
os.environ["AVS_DB_PATH"] = str(TEST_DB_DIR / "test.db")
os.environ["AVS_DATA_DIR"] = str(TEST_DB_DIR)

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent / "backend" / "src"))

# Create test fixture files in %TEMP%
TEMP_DIR = Path(os.environ.get("TEMP", tempfile.gettempdir()))
FIXTURE_PREFIX = "AVS_ROOT_CAUSE_TEST_V3_"
FIXTURE_COUNT = 20
FIXTURE_SIZE = 2048  # 2KB each

print(f"=== ROOT CAUSE TEST V3 (With Fixes) ===")
print(f"Temp dir: {TEMP_DIR}")
print()

# Create fixture files
fixture_files = []
for i in range(FIXTURE_COUNT):
    p = TEMP_DIR / f"{FIXTURE_PREFIX}{i:04d}.tmp"
    p.write_bytes(b"X" * FIXTURE_SIZE)
    fixture_files.append(p)

print(f"Created {FIXTURE_COUNT} fixture files ({FIXTURE_SIZE} bytes each)")
print()

# Import and use the scan engine directly
import avs_backend.scan_core_rpc as scan_core_rpc
scan_core_rpc._scan_orchestrator = None
scan_core_rpc._scan_orchestrator_initializing = False
scan_core_rpc._coordinator = None

print("Initializing scan orchestrator (temp DB)...")
orchestrator = None
for i in range(120):
    orchestrator = scan_core_rpc.get_scan_orchestrator()
    if orchestrator is not None:
        break
    time.sleep(1)

if orchestrator is None:
    print("ERROR: Orchestrator failed to initialize")
    for f in fixture_files:
        try: f.unlink()
        except: pass
    sys.exit(1)

print(f"Orchestrator ready after ~{i}s")
print()

# Step 1: Run a quick scan
print("--- STEP 1: Quick scan ---")
start_time = time.time()
result = orchestrator.scan_quick(scope=None, on_progress=lambda p: None)
scan_duration = time.time() - start_time

stats = result.statistics if hasattr(result, 'statistics') else {}
findings = result.findings if hasattr(result, 'findings') else []
action_plan_id = result.action_plan_id if hasattr(result, 'action_plan_id') else None

# Count findings - handle set or list
findings_list = list(findings) if findings else []
fixture_findings = []
for f in findings_list:
    f_str = json.dumps(f, default=str) if isinstance(f, dict) else str(f)
    if FIXTURE_PREFIX in f_str:
        fixture_findings.append(f)

print(f"Scan duration: {scan_duration:.1f}s")
print(f"Assets discovered: {stats.get('assets_discovered', 'N/A')}")
print(f"Total findings: {len(findings_list)}")
print(f"Fixture findings: {len(fixture_findings)}")
print(f"Action plan ID: {action_plan_id}")
print()

# Step 2: Run auto-optimize
if action_plan_id:
    print(f"--- STEP 2: Auto-optimize ---")
    coord = scan_core_rpc.get_coordinator()
    if coord is None:
        print("ERROR: Coordinator not available")
        for f in fixture_files:
            try: f.unlink()
            except: pass
        sys.exit(1)

    print("Preparing...")
    preview = coord.prepare(action_plan_id)
    safe_count = preview.safety_state_counts.get("planned", 0)
    print(f"  Total actions: {preview.total_actions}")
    print(f"  Safe (planned): {safe_count}")

    if safe_count == 0:
        print("  No safe actions — skipping execution")
    else:
        print(f"Executing {safe_count} safe actions...")
        start_time = time.time()
        summary = coord.execute(
            action_plan_id,
            request_id=f"root-cause-test-v3-{int(time.time())}",
            approval_token=preview.approval_token,
            mode="live",
        )
        exec_duration = time.time() - start_time

        print(f"Execution duration: {exec_duration:.1f}s")
        print(f"  Total: {summary.total}")
        print(f"  Completed: {summary.completed}")
        print(f"  Failed: {summary.failed}")
        print(f"  Rejected: {summary.rejected}")

        # Check verified_cleaned (after_state.exists == False)
        verified_cleaned = 0
        unverified_completed = 0
        for r in summary.results:
            if r.status.value == "completed":
                after = getattr(r, 'after_state', None)
                if after and isinstance(after, dict) and after.get("exists") is False:
                    verified_cleaned += 1
                else:
                    unverified_completed += 1

        print(f"  Verified cleaned (after_state.exists=False): {verified_cleaned}")
        print(f"  Unverified completed: {unverified_completed}")

        # Check fixture results
        fixture_results = []
        for r in summary.results:
            target = r.target if hasattr(r, 'target') else {}
            target_str = json.dumps(target.to_dict() if hasattr(target, 'to_dict') else {}, default=str)
            if FIXTURE_PREFIX in target_str:
                fixture_results.append(r)

        print(f"\n  Results matching our fixtures: {len(fixture_results)}")
        for r in fixture_results[:5]:
            after = r.after_state if hasattr(r, 'after_state') else {}
            before = r.before_state if hasattr(r, 'before_state') else {}
            print(f"    status={r.status.value} before_exists={before.get('exists')} after_exists={after.get('exists')} size={before.get('size')}")

# Step 3: Verify physical deletion
print(f"\n--- STEP 3: Verify physical deletion ---")
existing_after = sum(1 for f in fixture_files if f.exists())
deleted = FIXTURE_COUNT - existing_after
print(f"Fixtures existing before: {FIXTURE_COUNT}")
print(f"Fixtures existing after: {existing_after}")
print(f"Fixtures actually deleted: {deleted}")

# Step 4: Second scan
if deleted > 0:
    print(f"\n--- STEP 4: Second scan ---")
    result2 = orchestrator.scan_quick(scope=None, on_progress=lambda p: None)
    findings2 = list(result2.findings) if result2.findings else []
    fixture_findings2 = []
    for f in findings2:
        f_str = json.dumps(f, default=str) if isinstance(f, dict) else str(f)
        if FIXTURE_PREFIX in f_str:
            fixture_findings2.append(f)

    print(f"Second scan fixture findings: {len(fixture_findings2)}")

# Summary
print(f"\n=== SUMMARY ===")
print(f"Scan duration: {scan_duration:.1f}s")
print(f"Fixtures created: {FIXTURE_COUNT}")
print(f"Fixtures detected: {len(fixture_findings)}")
print(f"Fixtures physically deleted: {deleted}")
print(f"Verified cleaned (after_state): {verified_cleaned if action_plan_id else 'N/A'}")
print(f"Second scan finds fixtures: {len(fixture_findings2) if deleted > 0 else 'N/A'}")

if deleted == FIXTURE_COUNT and len(fixture_findings2) == 0:
    print(f"VERDICT: PASS — All fixtures deleted, second scan confirms")
elif deleted > 0:
    print(f"VERDICT: PARTIAL — {deleted}/{FIXTURE_COUNT} deleted")
else:
    print(f"VERDICT: FAIL — No fixtures deleted")

# Cleanup
for f in fixture_files:
    try: f.unlink()
    except: pass
import shutil
try: shutil.rmtree(TEST_DB_DIR)
except: pass

print(f"\n=== TEST COMPLETE ===")
