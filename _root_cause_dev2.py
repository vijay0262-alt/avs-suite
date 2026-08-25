"""
Focused root cause test: Create fixtures in %TEMP%, scan, clean, verify deletion.
Uses a temporary database for fast iteration.
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
FIXTURE_PREFIX = "AVS_ROOT_CAUSE_TEST_"
FIXTURE_COUNT = 20
FIXTURE_SIZE = 2048  # 2KB each

print(f"=== ROOT CAUSE TEST (Temp DB) ===")
print(f"Temp dir: {TEMP_DIR}")
print(f"Test DB: {TEST_DB_DIR}")
print()

# Create fixture files
fixture_files = []
for i in range(FIXTURE_COUNT):
    p = TEMP_DIR / f"{FIXTURE_PREFIX}{i:04d}.tmp"
    p.write_bytes(b"X" * FIXTURE_SIZE)
    fixture_files.append(p)

print(f"Created {FIXTURE_COUNT} fixture files ({FIXTURE_SIZE} bytes each)")
existing_before = sum(1 for f in fixture_files if f.exists())
print(f"Fixtures existing before scan: {existing_before}/{FIXTURE_COUNT}")
print()

# Import and use the scan engine directly
from avs_backend.scan_core_rpc import get_scan_orchestrator, get_coordinator, _scan_orchestrator_initializing

# Force reset the orchestrator state for fresh init
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
    if i % 10 == 0:
        print(f"  [{i}s] Still initializing...")

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
result = orchestrator.scan_quick(
    scope=None,
    on_progress=lambda p: None,
)
scan_duration = time.time() - start_time

stats = result.statistics if hasattr(result, 'statistics') else {}
findings = result.findings if hasattr(result, 'findings') else []
action_plan_id = result.action_plan_id if hasattr(result, 'action_plan_id') else None

print(f"Scan duration: {scan_duration:.1f}s")
print(f"Assets discovered: {stats.get('assets_discovered', 'N/A')}")
print(f"Assets evaluated: {stats.get('assets_evaluated', 'N/A')}")
print(f"Findings: {len(findings) if isinstance(findings, list) else findings}")
print(f"Action plan ID: {action_plan_id}")

# Check if our fixtures appear in findings
fixture_findings = []
if isinstance(findings, list):
    for f in findings:
        f_str = json.dumps(f) if isinstance(f, dict) else str(f)
        if FIXTURE_PREFIX in f_str:
            fixture_findings.append(f)

print(f"Findings matching our fixtures: {len(fixture_findings)}")
if fixture_findings:
    print(f"  First fixture finding: {json.dumps(fixture_findings[0], indent=2)[:300]}")
print()

# Step 2: Run auto-optimize via coordinator
if action_plan_id:
    print(f"--- STEP 2: Auto-optimize ---")
    coord = scan_core_rpc.get_coordinator()
    if coord is None:
        print("ERROR: Coordinator not available")
        for f in fixture_files:
            try: f.unlink()
            except: pass
        sys.exit(1)

    # Prepare
    print("Preparing...")
    preview = coord.prepare(action_plan_id)
    safe_count = preview.safety_state_counts.get("planned", 0)
    review_count = preview.safety_state_counts.get("review_required", 0)
    blocked_count = preview.safety_state_counts.get("blocked", 0)
    print(f"  Total actions: {preview.total_actions}")
    print(f"  Safe (planned): {safe_count}")
    print(f"  Review required: {review_count}")
    print(f"  Blocked: {blocked_count}")

    if safe_count == 0:
        print("  No safe actions — skipping execution")
    else:
        # Execute
        print(f"Executing {safe_count} safe actions...")
        start_time = time.time()
        summary = coord.execute(
            action_plan_id,
            request_id=f"root-cause-test-{int(time.time())}",
            approval_token=preview.approval_token,
            mode="live",
        )
        exec_duration = time.time() - start_time

        print(f"Execution duration: {exec_duration:.1f}s")
        print(f"  Total: {summary.total}")
        print(f"  Completed: {summary.completed}")
        print(f"  Failed: {summary.failed}")
        print(f"  Rejected: {summary.rejected}")
        print(f"  Skipped: {summary.skipped}")

        # Check results for our fixtures
        fixture_results = []
        for r in summary.results:
            target = r.target if hasattr(r, 'target') else {}
            target_str = json.dumps(target) if isinstance(target, dict) else str(target)
            if FIXTURE_PREFIX in target_str:
                fixture_results.append(r)

        print(f"\n  Results matching our fixtures: {len(fixture_results)}")
        for r in fixture_results[:5]:
            after = r.after_state if hasattr(r, 'after_state') else {}
            before = r.before_state if hasattr(r, 'before_state') else {}
            print(f"    status={r.status.value} before_exists={before.get('exists')} after_exists={after.get('exists')} size={before.get('size')} reason={r.reason}")

        # Check failed results
        failed_results = [r for r in summary.results if r.status.value == "failed"]
        if failed_results:
            print(f"\n  Failed results ({len(failed_results)}):")
            for r in failed_results[:5]:
                target = r.target if hasattr(r, 'target') else {}
                err = r.error if hasattr(r, 'error') else None
                print(f"    reason={r.reason} error_code={err.code if err else 'N/A'} error={err.message if err else 'N/A'}")
else:
    print("--- STEP 2: SKIPPED (no action plan) ---")

# Step 3: Verify physical deletion
print(f"\n--- STEP 3: Verify physical deletion ---")
existing_after = sum(1 for f in fixture_files if f.exists())
deleted = FIXTURE_COUNT - existing_after
print(f"Fixtures existing before: {FIXTURE_COUNT}")
print(f"Fixtures existing after: {existing_after}")
print(f"Fixtures actually deleted: {deleted}")

if deleted == FIXTURE_COUNT:
    print(f"VERDICT: ALL {FIXTURE_COUNT} fixtures physically deleted — CLEANUP WORKS")
elif deleted > 0:
    print(f"VERDICT: {deleted}/{FIXTURE_COUNT} fixtures physically deleted — PARTIAL")
else:
    print(f"VERDICT: NO fixtures physically deleted — CLEANUP BROKEN")

# Step 4: Second scan
if deleted > 0:
    print(f"\n--- STEP 4: Second scan ---")
    result2 = orchestrator.scan_quick(scope=None, on_progress=lambda p: None)
    findings2 = result2.findings if hasattr(result2, 'findings') else []
    fixture_findings2 = []
    if isinstance(findings2, list):
        for f in findings2:
            f_str = json.dumps(f) if isinstance(f, dict) else str(f)
            if FIXTURE_PREFIX in f_str:
                fixture_findings2.append(f)

    print(f"Second scan fixture findings: {len(fixture_findings2)}")
    if len(fixture_findings2) == 0:
        print(f"VERDICT: Second scan confirms cleanup — fixtures NOT found again")
    else:
        print(f"VERDICT: SECOND SCAN STILL FINDS DELETED FILES — PIPELINE BROKEN")

# Cleanup remaining fixtures
for f in fixture_files:
    try: f.unlink()
    except: pass

# Cleanup test DB
import shutil
try: shutil.rmtree(TEST_DB_DIR)
except: pass

print(f"\n=== TEST COMPLETE ===")
