"""
Packaged E2E test: Start the packaged backend via stdin/stdout RPC,
create test fixtures, run a scan, clean, and verify.
"""
import os
import sys
import time
import json
import tempfile
import subprocess
from pathlib import Path

BACKEND_EXE = r"C:\Users\HPBP\Documents\GitHub\avs-suite\backend\dist\backend-py\avs-backend.exe"
TEMP_DIR = Path(os.environ.get("TEMP", tempfile.gettempdir()))
FIXTURE_PREFIX = "AVS_PACKAGED_E2E_"
FIXTURE_COUNT = 20
FIXTURE_SIZE = 4096

print(f"=== PACKAGED E2E TEST (stdin/stdout RPC) ===")
print(f"Backend: {BACKEND_EXE}")
print(f"Temp dir: {TEMP_DIR}")
print()

# Step 0: Create fixtures
print("--- STEP 0: Create test fixtures ---")
fixture_files = []
for i in range(FIXTURE_COUNT):
    p = TEMP_DIR / f"{FIXTURE_PREFIX}{i:04d}.tmp"
    p.write_bytes(b"X" * FIXTURE_SIZE)
    fixture_files.append(p)
print(f"Created {FIXTURE_COUNT} fixtures ({FIXTURE_SIZE} bytes each)")
print()

# Step 1: Start backend
print("--- STEP 1: Start packaged backend ---")
proc = subprocess.Popen(
    [BACKEND_EXE],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    bufsize=0,
)

rpc_id = 0

def rpc_call(method, params=None, timeout=300):
    """Make a JSON-RPC call via stdin/stdout."""
    global rpc_id
    rpc_id += 1
    request = json.dumps({
        "jsonrpc": "2.0",
        "method": method,
        "params": params or {},
        "id": rpc_id,
    }) + "\n"
    proc.stdin.write(request.encode())
    proc.stdin.flush()
    
    # Read response line
    start = time.time()
    while time.time() - start < timeout:
        line = proc.stdout.readline()
        if not line:
            time.sleep(0.1)
            continue
        try:
            resp = json.loads(line.decode().strip())
            if resp.get("id") == rpc_id:
                return resp
        except json.JSONDecodeError:
            continue
    return {"error": "timeout"}

# Wait for backend to be ready
print("Waiting for backend to initialize...")
ready = False
for i in range(300):
    resp = rpc_call("scan_core.scan.quick", {}, timeout=10)
    if "result" in resp:
        ready = True
        print(f"Backend ready after {i}s")
        # Cancel this scan and get a fresh one
        session_id = resp["result"].get("session_id")
        if session_id:
            rpc_call("scan_core.scan.cancel", {"session_id": session_id}, timeout=10)
        break
    if "error" in resp:
        err_msg = str(resp.get("error", ""))
        if "Unknown method" in err_msg:
            # Module not loaded yet
            pass
        elif "initializing" in err_msg.lower():
            pass
        else:
            # Some other error — might be ready
            ready = True
            print(f"Backend responding after {i}s (error: {err_msg[:100]})")
            break
    if i % 30 == 0 and i > 0:
        print(f"  [{i}s] Still initializing...")
    time.sleep(1)

if not ready:
    # Try one more time with longer timeout
    resp = rpc_call("scan_core.scan.status", {"session_id": "init-check"}, timeout=10)
    if "result" in resp:
        ready = True
        print(f"Backend ready after extended wait")
    else:
        print(f"Backend response: {resp}")
        # Check stderr
        proc.terminate()
        stderr = proc.stderr.read().decode()[-2000:]
        print(f"Stderr (last 2000 chars): {stderr}")
        for f in fixture_files:
            try: f.unlink()
            except: pass
        sys.exit(1)

# Step 2: Quick scan (the init loop already started one)
print("\n--- STEP 2: Quick scan ---")
scan_start = time.time()
if ready and "result" in rpc_call("scan_core.scan.status", {"session_id": session_id}, timeout=10):
    # Use the scan from init
    print(f"Using scan from init: {session_id}")
else:
    # Start a fresh scan
    resp = rpc_call("scan_core.scan.quick", {}, timeout=300)
    if "result" not in resp:
        print(f"ERROR: Scan failed: {resp.get('error', resp)}")
        proc.terminate()
        for f in fixture_files:
            try: f.unlink()
            except: pass
        sys.exit(1)
    session_id = resp["result"].get("session_id")
print(f"Session ID: {session_id}")

# Wait for scan to complete
print("Waiting for scan to complete...")
scan_complete = False
for i in range(120):
    status = rpc_call("scan_core.scan.status", {"session_id": session_id}, timeout=30)
    if "result" in status:
        state = status["result"].get("state", "unknown")
        if state == "completed":
            scan_complete = True
            scan_duration = i * 2
            print(f"Scan completed after ~{scan_duration}s")
            break
        elif state == "error":
            print(f"Scan error: {status['result']}")
            break
    time.sleep(2)
    if i % 10 == 0:
        print(f"  [{i*2}s] State: {state}")

if not scan_complete:
    print("ERROR: Scan did not complete")
    proc.terminate()
    for f in fixture_files:
        try: f.unlink()
        except: pass
    sys.exit(1)

# Get scan result
result_resp = rpc_call("scan_core.scan.result", {"session_id": session_id}, timeout=30)
if "result" in result_resp:
    result = result_resp["result"]
    stats = result.get("statistics", {})
    findings = result.get("findings", [])
    plan_id = result.get("action_plan_id")
    
    print(f"\nScan results:")
    print(f"  Assets discovered: {stats.get('assets_discovered', 'N/A')}")
    print(f"  Findings: {len(findings) if isinstance(findings, list) else 'N/A'}")
    print(f"  Action plan ID: {plan_id}")
    
    # Count fixture findings
    fixture_count = 0
    if isinstance(findings, list):
        for f in findings:
            f_str = json.dumps(f, default=str)
            if FIXTURE_PREFIX in f_str:
                fixture_count += 1
    print(f"  Fixture findings: {fixture_count}")
    
    # Step 3: Auto-optimize
    if plan_id:
        print(f"\n--- STEP 3: Auto-optimize ---")
        opt_start = time.time()
        opt_resp = rpc_call("scan_core.dashboard.auto_optimize", {"plan_id": plan_id}, timeout=30)
        print(f"Auto-optimize started: {json.dumps(opt_resp, indent=2)[:200]}")
        
        # Wait for completion
        print("Waiting for optimization...")
        for i in range(300):
            status = rpc_call("scan_core.dashboard.auto_optimize_status", {}, timeout=10)
            if "result" in status:
                r = status["result"]
                if r.get("completed"):
                    opt_duration = time.time() - opt_start
                    print(f"Optimization completed after {opt_duration:.1f}s")
                    result = r.get("result", {})
                    print(f"  files_found: {result.get('files_found', 'N/A')}")
                    print(f"  files_cleaned: {result.get('files_cleaned', 'N/A')}")
                    print(f"  space_recovered: {result.get('space_recovered', 'N/A')}")
                    print(f"  health_before: {result.get('health_before', 'N/A')}")
                    print(f"  health_after: {result.get('health_after', 'N/A')}")
                    break
            time.sleep(2)
            if i % 30 == 0 and i > 0:
                print(f"  [{i*2}s] Still optimizing...")

# Step 4: Verify physical deletion
print(f"\n--- STEP 4: Verify physical deletion ---")
existing_after = sum(1 for f in fixture_files if f.exists())
deleted = FIXTURE_COUNT - existing_after
print(f"Fixtures existing before: {FIXTURE_COUNT}")
print(f"Fixtures existing after: {existing_after}")
print(f"Fixtures actually deleted: {deleted}")

# Step 5: Second scan
if deleted > 0:
    print(f"\n--- STEP 5: Second scan ---")
    resp2 = rpc_call("scan_core.scan.quick", {}, timeout=300)
    if "result" in resp2:
        session2 = resp2["result"].get("session_id")
        for i in range(120):
            s = rpc_call("scan_core.scan.status", {"session_id": session2}, timeout=30)
            if "result" in s:
                state = s["result"].get("state", "unknown")
                if state in ("completed", "error"):
                    break
            time.sleep(2)
        
        r2 = rpc_call("scan_core.scan.result", {"session_id": session2}, timeout=30)
        if "result" in r2:
            findings2 = r2["result"].get("findings", [])
            fixture_findings2 = 0
            if isinstance(findings2, list):
                for f in findings2:
                    f_str = json.dumps(f, default=str)
                    if FIXTURE_PREFIX in f_str:
                        fixture_findings2 += 1
            print(f"Second scan fixture findings: {fixture_findings2}")

# Summary
print(f"\n=== PACKAGED E2E SUMMARY ===")
print(f"Fixtures created: {FIXTURE_COUNT}")
print(f"Fixtures physically deleted: {deleted}")
if deleted == FIXTURE_COUNT:
    print(f"VERDICT: PASS — All fixtures deleted by packaged app")
elif deleted > 0:
    print(f"VERDICT: PARTIAL — {deleted}/{FIXTURE_COUNT} deleted")
else:
    print(f"VERDICT: FAIL — No fixtures deleted")

# Cleanup
proc.terminate()
for f in fixture_files:
    try: f.unlink()
    except: pass

print(f"\n=== PACKAGED E2E COMPLETE ===")
