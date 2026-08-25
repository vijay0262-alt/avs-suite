"""
Focused root cause test: Create fixtures in %TEMP%, scan, clean, verify deletion.
Uses the development backend (not packaged) for faster iteration.
"""
import os
import sys
import time
import tempfile
import threading
import json
import subprocess
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent / "backend" / "src"))

# Create test fixture files in %TEMP%
TEMP_DIR = Path(os.environ.get("TEMP", tempfile.gettempdir()))
FIXTURE_PREFIX = "AVS_ROOT_CAUSE_TEST_"
FIXTURE_COUNT = 20
FIXTURE_SIZE = 2048  # 2KB each

print(f"=== ROOT CAUSE TEST (Development Backend) ===")
print(f"Temp dir: {TEMP_DIR}")
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
from avs_backend.scan_core_rpc import get_scan_orchestrator, get_coordinator

print("Waiting for scan orchestrator to initialize...")
orchestrator = None
for i in range(60):
    orchestrator = get_scan_orchestrator()
    if orchestrator is not None:
        break
    time.sleep(2)
    if i % 10 == 0:
        print(f"  [{i*2}s] Still initializing...")

if orchestrator is None:
    print("ERROR: Orchestrator failed to initialize")
    # Cleanup
    for f in fixture_files:
        try: f.unlink()
        except: pass
    sys.exit(1)

print(f"Orchestrator ready after ~{i*2}s")
print()

# Step 1: Run a quick scan
print("--- STEP 1: Quick scan ---")
start_time = time.time()
result = orchestrator.scan_quick(
    scope=None,
    on_progress=lambda p: None,  # Silent
)
scan_duration = time.time() - start_time

stats = result.statistics if hasattr(result, 'statistics') else {}
findings = result.findings if hasattr(result, 'findings') else []
action_plan_id = result.action_plan_id if hasattr(result, 'action_plan_id') else None

print(f"Scan duration: {scan_duration:.1f}s")
print(f"Assets discovered: {stats.get('assets_discovered', 'N/A')}")
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
print()

# Step 2: Run auto-optimize
if action_plan_id:
    print(f"--- STEP 2: Auto-optimize ---")
    coord = get_coordinator()
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
    print(f"Safe actions: {safe_count}")

    # Execute
    print("Executing...")
    start_time = time.time()
    summary = coord.execute(
        action_plan_id,
        request_id=f"root-cause-test-{int(time.time())}",
        approval_token=preview.approval_token,
        mode="live",
    )
    exec_duration = time.time() - start_time

    print(f"Execution duration: {exec_duration:.1f}s")
    print(f"Total: {summary.total}")
    print(f"Completed: {summary.completed}")
    print(f"Failed: {summary.failed}")
    print(f"Rejected: {summary.rejected}")
    print(f"Skipped: {summary.skipped}")
    print()

    # Check some results for our fixtures
    fixture_results = []
    for r in summary.results:
        target = r.target if hasattr(r, 'target') else {}
        target_str = json.dumps(target) if isinstance(target, dict) else str(target)
        if FIXTURE_PREFIX in target_str:
            fixture_results.append(r)

    print(f"Results matching our fixtures: {len(fixture_results)}")
    for r in fixture_results[:5]:
        after = r.after_state if hasattr(r, 'after_state') else {}
        before = r.before_state if hasattr(r, 'before_state') else {}
        print(f"  status={r.status.value} before_exists={before.get('exists')} after_exists={after.get('exists')} size={before.get('size')}")
else:
    print("--- STEP 2: SKIPPED (no action plan) ---")

# Step 3: Verify physical deletion
print(f"\n--- STEP 3: Verify physical deletion ---")
existing_after = sum(1 for f in fixture_files if f.exists())
deleted = FIXTURE_COUNT - existing_after
print(f"Fixtures existing before: {FIXTURE_COUNT}")
print(f"Fixtures existing after: {existing_after}")
print(f"Fixtures actually deleted: {deleted}")

if deleted > 0:
    print(f"\nVERDICT: {deleted}/{FIXTURE_COUNT} fixtures were physically deleted")
else:
    print(f"\nVERDICT: NO fixtures were physically deleted — CLEANUP ENGINE IS BROKEN")

# Step 4: Second scan
print(f"\n--- STEP 4: Second scan ---")
result2 = orchestrator.scan_quick(scope=None, on_progress=lambda p: None)
findings2 = result2.findings if hasattr(result2, 'findings') else []
fixture_findings2 = []
if isinstance(findings2, list):
    for f in findings2:
        f_str = json.dumps(f) if isinstance(f, dict) else str(f)
        if FIXTURE_PREFIX in f_str:
            fixture_findings2.append(f)

print(f"Second scan findings: {len(findings2) if isinstance(findings2, list) else findings2}")
print(f"Second scan fixture findings: {len(fixture_findings2)}")

if len(fixture_findings2) == 0 and deleted == FIXTURE_COUNT:
    print(f"VERDICT: Second scan confirms cleanup — fixtures NOT found again")
elif len(fixture_findings2) > 0:
    print(f"VERDICT: SECOND SCAN STILL FINDS DELETED FILES — PIPELINE BROKEN")
elif deleted < FIXTURE_COUNT:
    print(f"VERDICT: Some fixtures not deleted ({existing_after} remain)")

# Cleanup remaining fixtures
for f in fixture_files:
    try: f.unlink()
    except: pass

print(f"\n=== TEST COMPLETE ===")
