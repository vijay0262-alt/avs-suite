"""
Root cause investigation: Create real test files, run scan → detect → clean → verify.
Tests the ACTUAL packaged backend pipeline end-to-end.
"""
import os
import sys
import json
import time
import tempfile
import subprocess
import threading
from pathlib import Path

# Create test fixture files in %TEMP%
TEMP_DIR = Path(os.environ.get("TEMP", tempfile.gettempdir()))
FIXTURE_PREFIX = "AVS_ROOT_CAUSE_TEST_"
FIXTURE_COUNT = 50
FIXTURE_SIZE = 1024  # 1KB each

print(f"=== ROOT CAUSE INVESTIGATION ===")
print(f"Temp dir: {TEMP_DIR}")
print()

# Create fixture files
fixture_files = []
for i in range(FIXTURE_COUNT):
    p = TEMP_DIR / f"{FIXTURE_PREFIX}{i:04d}.tmp"
    p.write_bytes(b"A" * FIXTURE_SIZE)
    fixture_files.append(p)

print(f"Created {FIXTURE_COUNT} fixture files ({FIXTURE_SIZE} bytes each)")
print(f"Total fixture size: {FIXTURE_SIZE * FIXTURE_COUNT} bytes")
print()

# Verify fixtures exist
existing_before = sum(1 for f in fixture_files if f.exists())
print(f"Fixtures existing before scan: {existing_before}/{FIXTURE_COUNT}")
print()

# Start the packaged backend
backend_path = Path(__file__).parent / "backend" / "dist" / "backend-py" / "avs-backend.exe"
print(f"Starting backend: {backend_path}")
backend = subprocess.Popen(
    [str(backend_path)],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
)

responses = {}
lock = threading.Lock()

def read_stdout():
    """Read JSON-RPC responses from stdout."""
    for line in backend.stdout:
        line = line.strip()
        if line.startswith("{") and '"id"' in line:
            try:
                obj = json.loads(line)
                if "id" in obj:
                    with lock:
                        responses[obj["id"]] = obj
            except json.JSONDecodeError:
                pass

thread = threading.Thread(target=read_stdout, daemon=True)
thread.start()

def call_rpc(method, params=None, rpc_id=1):
    """Send a JSON-RPC request."""
    req = json.dumps({"jsonrpc": "2.0", "method": method, "params": params or {}, "id": rpc_id}) + "\n"
    backend.stdin.write(req)
    backend.stdin.flush()

def wait_response(rpc_id, timeout=300):
    """Wait for a specific RPC response."""
    start = time.time()
    while time.time() - start < timeout:
        with lock:
            if rpc_id in responses:
                return responses.pop(rpc_id)
        time.sleep(0.5)
    return None

# Wait for backend to initialize
print("Waiting 120s for backend initialization...")
time.sleep(120)

# Step 1: Start a quick scan
print("\n--- STEP 1: Start quick scan ---")
call_rpc("scan_core.scan.quick", {"scope": []}, 1)
resp = wait_response(1, timeout=30)
if not resp:
    print("ERROR: No response to scan_core.scan.quick")
    backend.kill()
    sys.exit(1)

result = resp.get("result", {})
session_id = result.get("session_id")
print(f"Scan started: ok={result.get('ok')}, session_id={session_id}")

if not session_id:
    print(f"ERROR: {result.get('error', 'No session_id')}")
    backend.kill()
    sys.exit(1)

# Step 2: Poll scan status
print("\n--- STEP 2: Poll scan status ---")
scan_complete = False
scan_result = None
for i in range(600):  # 5 minutes max
    time.sleep(2)
    call_rpc("scan_core.scan.status", {"session_id": session_id}, 2)
    resp = wait_response(2, timeout=10)
    if not resp:
        continue
    result = resp.get("result", {})
    progress = result.get("progress", {})
    completed = result.get("completed", False)
    error = result.get("error")
    
    if error:
        print(f"  Scan error: {error}")
        scan_complete = True
        break
    
    pct = progress.get("completion_percent", 0)
    phase = progress.get("phase", "?")
    assets = progress.get("assets_discovered", 0)
    findings = progress.get("findings", 0)
    print(f"  [{i*2}s] {pct:.0f}% phase={phase} assets={assets} findings={findings}")
    
    if completed:
        print(f"  Scan completed!")
        scan_complete = True
        break

if not scan_complete:
    print("ERROR: Scan did not complete in 5 minutes")
    backend.kill()
    sys.exit(1)

# Step 3: Get scan result
print("\n--- STEP 3: Get scan result ---")
call_rpc("scan_core.scan.result", {"session_id": session_id}, 3)
resp = wait_response(3, timeout=30)
if not resp:
    print("ERROR: No response to scan_core.scan.result")
    backend.kill()
    sys.exit(1)

result = resp.get("result", {})
scan_result = result.get("result", {})
stats = scan_result.get("statistics", {})
action_plan_id = scan_result.get("action_plan_id")

print(f"Scan result keys: {list(scan_result.keys())}")
print(f"Statistics: {json.dumps(stats, indent=2)[:500]}")
print(f"Action plan ID: {action_plan_id}")

# Check if our fixture files appear in findings
findings = scan_result.get("findings", [])
print(f"Total findings: {len(findings) if isinstance(findings, list) else 'N/A'}")

# Look for our fixture files in findings
fixture_findings = []
if isinstance(findings, list):
    for f in findings:
        f_str = json.dumps(f)
        if FIXTURE_PREFIX in f_str:
            fixture_findings.append(f)

print(f"Findings matching our fixtures: {len(fixture_findings)}")

# Step 4: Run auto-optimize
if action_plan_id:
    print(f"\n--- STEP 4: Run auto-optimize (plan_id={action_plan_id}) ---")
    call_rpc("scan_core.dashboard.auto_optimize", {"plan_id": action_plan_id}, 4)
    resp = wait_response(4, timeout=30)
    if resp:
        result = resp.get("result", {})
        opt_session_id = result.get("session_id")
        print(f"Auto-optimize started: ok={result.get('ok')}, session_id={opt_session_id}")
        
        if opt_session_id:
            # Poll auto-optimize status
            for i in range(300):  # 5 minutes max
                time.sleep(2)
                call_rpc("scan_core.dashboard.auto_optimize_status", {"session_id": opt_session_id}, 5)
                resp = wait_response(5, timeout=10)
                if not resp:
                    continue
                result = resp.get("result", {})
                phase = result.get("phase", "?")
                completed = result.get("completed", False)
                progress = result.get("overall_progress", 0)
                msg = result.get("message", "")
                exec_prog = result.get("execution_progress", 0)
                exec_total = result.get("execution_total", 0)
                print(f"  [{i*2}s] {progress:.0f}% phase={phase} exec={exec_prog}/{exec_total} msg={msg}")
                
                if completed:
                    opt_result = result.get("result", {})
                    print(f"\n  AUTO-OPTIMIZE RESULT:")
                    print(f"  files_found: {opt_result.get('files_found')}")
                    print(f"  files_cleaned: {opt_result.get('files_cleaned')}")
                    print(f"  space_recovered: {opt_result.get('space_recovered')}")
                    print(f"  detected: {opt_result.get('detected')}")
                    print(f"  cleaned: {opt_result.get('cleaned')}")
                    print(f"  remaining: {opt_result.get('remaining')}")
                    print(f"  failed: {opt_result.get('failed')}")
                    print(f"  health_before: {opt_result.get('health_before')}")
                    print(f"  health_after: {opt_result.get('health_after')}")
                    diag = opt_result.get("_diagnostics", {})
                    print(f"  diagnostics: {json.dumps(diag, indent=2)[:500]}")
                    break
    else:
        print("ERROR: No response to auto_optimize")
else:
    print("\n--- STEP 4: SKIPPED (no action_plan_id) ---")

# Step 5: Check if fixture files were actually deleted
print(f"\n--- STEP 5: Verify physical deletion ---")
existing_after = sum(1 for f in fixture_files if f.exists())
deleted = FIXTURE_COUNT - existing_after
print(f"Fixtures existing before: {FIXTURE_COUNT}")
print(f"Fixtures existing after: {existing_after}")
print(f"Fixtures actually deleted: {deleted}")
print(f"Files AVS said it cleaned: {opt_result.get('files_cleaned', 'N/A') if action_plan_id else 'N/A'}")

if deleted > 0:
    print(f"\nVERDICT: {deleted}/{FIXTURE_COUNT} fixtures were physically deleted")
else:
    print(f"\nVERDICT: NO fixtures were physically deleted — CLEANUP ENGINE IS BROKEN")

# Step 6: Run second scan to verify
print(f"\n--- STEP 6: Second scan to verify cleanup ---")
call_rpc("scan_core.scan.quick", {"scope": []}, 6)
resp = wait_response(6, timeout=30)
if resp:
    result = resp.get("result", {})
    session_id2 = result.get("session_id")
    if session_id2:
        for i in range(300):
            time.sleep(2)
            call_rpc("scan_core.scan.status", {"session_id": session_id2}, 7)
            resp = wait_response(7, timeout=10)
            if not resp:
                continue
            result = resp.get("result", {})
            if result.get("completed"):
                call_rpc("scan_core.scan.result", {"session_id": session_id2}, 8)
                resp = wait_response(8, timeout=30)
                if resp:
                    result2 = resp.get("result", {}).get("result", {})
                    stats2 = result2.get("statistics", {})
                    findings2 = result2.get("findings", [])
                    fixture_findings2 = []
                    if isinstance(findings2, list):
                        for f in findings2:
                            if FIXTURE_PREFIX in json.dumps(f):
                                fixture_findings2.append(f)
                    print(f"  Second scan findings: {len(findings2) if isinstance(findings2, list) else 'N/A'}")
                    print(f"  Second scan fixture findings: {len(fixture_findings2)}")
                    if len(fixture_findings2) == 0 and deleted == FIXTURE_COUNT:
                        print(f"  VERDICT: Second scan confirms cleanup — fixtures NOT found again")
                    elif len(fixture_findings2) > 0:
                        print(f"  VERDICT: SECOND SCAN STILL FINDS DELETED FILES — PIPELINE BROKEN")
                break

# Cleanup remaining fixtures
for f in fixture_files:
    try:
        f.unlink()
    except:
        pass

print(f"\n=== INVESTIGATION COMPLETE ===")
backend.kill()
