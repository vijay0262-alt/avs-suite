"""
Packaged E2E test: Launch the packaged AVS Shield Optimizer,
create test fixtures, run a scan via RPC, clean, and verify.
"""
import os
import sys
import time
import json
import tempfile
import subprocess
import socket
from pathlib import Path

# Configuration
PACKAGED_APP = r"C:\Users\HPBP\Documents\GitHub\avs-suite\release\win-unpacked\AVS Shield Optimizer.exe"
BACKEND_EXE = r"C:\Users\HPBP\Documents\GitHub\avs-suite\backend\dist\backend-py\avs-backend.exe"
RPC_PORT = 8765
TEMP_DIR = Path(os.environ.get("TEMP", tempfile.gettempdir()))
FIXTURE_PREFIX = "AVS_PACKAGED_E2E_"
FIXTURE_COUNT = 20
FIXTURE_SIZE = 4096

print(f"=== PACKAGED E2E TEST ===")
print(f"Packaged app: {PACKAGED_APP}")
print(f"Backend: {BACKEND_EXE}")
print(f"Temp dir: {TEMP_DIR}")
print()

# Step 0: Create fixture files
print("--- STEP 0: Create test fixtures ---")
fixture_files = []
for i in range(FIXTURE_COUNT):
    p = TEMP_DIR / f"{FIXTURE_PREFIX}{i:04d}.tmp"
    p.write_bytes(b"X" * FIXTURE_SIZE)
    fixture_files.append(p)

existing_before = sum(1 for f in fixture_files if f.exists())
print(f"Created {FIXTURE_COUNT} fixtures ({FIXTURE_SIZE} bytes each)")
print(f"Fixtures existing: {existing_before}/{FIXTURE_COUNT}")
print()

# Step 1: Start the backend directly (faster than launching Electron)
print("--- STEP 1: Start packaged backend ---")
proc = subprocess.Popen(
    [BACKEND_EXE],
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    env={**os.environ, "AVS_RPC_PORT": str(RPC_PORT)},
)

# Wait for the backend to start listening
print(f"Waiting for backend on port {RPC_PORT}...")
backend_ready = False
for i in range(180):
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1)
        result = sock.connect_ex(("127.0.0.1", RPC_PORT))
        sock.close()
        if result == 0:
            backend_ready = True
            print(f"Backend ready after {i}s")
            break
    except Exception:
        pass
    time.sleep(1)
    if i % 30 == 0 and i > 0:
        print(f"  [{i}s] Still waiting...")

if not backend_ready:
    print("ERROR: Backend failed to start")
    proc.kill()
    for f in fixture_files:
        try: f.unlink()
        except: pass
    sys.exit(1)

# Give it extra time to initialize the scan engine
print("Waiting for scan engine to initialize...")
time.sleep(30)

# Step 2: Run a quick scan via RPC
print("\n--- STEP 2: Quick scan via RPC ---")

def rpc_call(method, params=None):
    """Make a JSON-RPC call to the backend."""
    import urllib.request
    data = json.dumps({
        "jsonrpc": "2.0",
        "method": method,
        "params": params or {},
        "id": 1,
    }).encode()
    req = urllib.request.Request(
        f"http://127.0.0.1:{RPC_PORT}/rpc",
        data=data,
        headers={"Content-Type": "application/json"},
    )
    try:
        resp = urllib.request.urlopen(req, timeout=300)
        return json.loads(resp.read())
    except Exception as e:
        return {"error": str(e)}

# Try scanning
scan_result = rpc_call("scan_core.scan.quick", {})
print(f"Scan result: {json.dumps(scan_result, indent=2)[:500]}")

if "error" in scan_result:
    print(f"Scan error: {scan_result['error']}")
    # Try again after more wait
    print("Waiting 60 more seconds...")
    time.sleep(60)
    scan_result = rpc_call("scan_core.scan.quick", {})
    print(f"Retry scan result: {json.dumps(scan_result, indent=2)[:500]}")

# Get scan status
if "result" in scan_result:
    session_id = scan_result["result"].get("session_id")
    print(f"Session ID: {session_id}")

    # Wait for scan to complete
    print("Waiting for scan to complete...")
    for i in range(120):
        status = rpc_call("scan_core.scan.status", {"session_id": session_id})
        if "result" in status:
            state = status["result"].get("state", "unknown")
            if state in ("completed", "error"):
                print(f"Scan {state} after {i}s")
                break
        time.sleep(2)
        if i % 10 == 0:
            print(f"  [{i}s] Scan state: {state}")

    # Get scan result
    scan_result_data = rpc_call("scan_core.scan.result", {"session_id": session_id})
    if "result" in scan_result_data:
        result = scan_result_data["result"]
        stats = result.get("statistics", {})
        findings = result.get("findings", [])
        plan_id = result.get("action_plan_id")

        print(f"\nScan statistics:")
        print(f"  Assets discovered: {stats.get('assets_discovered', 'N/A')}")
        print(f"  Findings: {len(findings) if isinstance(findings, list) else findings}")
        print(f"  Action plan ID: {plan_id}")

        # Check fixture findings
        fixture_findings = []
        if isinstance(findings, list):
            for f in findings:
                f_str = json.dumps(f, default=str)
                if FIXTURE_PREFIX in f_str:
                    fixture_findings.append(f)
        print(f"  Fixture findings: {len(fixture_findings)}")

        # Step 3: Auto-optimize
        if plan_id:
            print(f"\n--- STEP 3: Auto-optimize ---")
            opt_result = rpc_call("scan_core.dashboard.auto_optimize", {"plan_id": plan_id})
            print(f"Auto-optimize started: {json.dumps(opt_result, indent=2)[:300]}")

            # Wait for optimization to complete
            print("Waiting for optimization to complete...")
            for i in range(300):
                opt_status = rpc_call("scan_core.dashboard.auto_optimize_status", {})
                if "result" in opt_status:
                    r = opt_status["result"]
                    if r.get("completed"):
                        print(f"Optimization completed after {i}s")
                        print(f"  Result: {json.dumps(r.get('result', {}), indent=2)[:500]}")
                        break
                time.sleep(2)
                if i % 30 == 0 and i > 0:
                    print(f"  [{i}s] Still optimizing...")

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
    scan2 = rpc_call("scan_core.scan.quick", {})
    if "result" in scan2:
        session2 = scan2["result"].get("session_id")
        for i in range(120):
            status2 = rpc_call("scan_core.scan.status", {"session_id": session2})
            if "result" in status2:
                state2 = status2["result"].get("state", "unknown")
                if state2 in ("completed", "error"):
                    break
            time.sleep(2)

        result2 = rpc_call("scan_core.scan.result", {"session_id": session2})
        if "result" in result2:
            findings2 = result2["result"].get("findings", [])
            fixture_findings2 = 0
            if isinstance(findings2, list):
                for f in findings2:
                    f_str = json.dumps(f, default=str)
                    if FIXTURE_PREFIX in f_str:
                        fixture_findings2 += 1
            print(f"Second scan fixture findings: {fixture_findings2}")

# Summary
print(f"\n=== SUMMARY ===")
print(f"Fixtures created: {FIXTURE_COUNT}")
print(f"Fixtures physically deleted: {deleted}")
if deleted == FIXTURE_COUNT:
    print(f"VERDICT: PASS — All fixtures deleted by packaged app")
elif deleted > 0:
    print(f"VERDICT: PARTIAL — {deleted}/{FIXTURE_COUNT} deleted")
else:
    print(f"VERDICT: FAIL — No fixtures deleted")

# Cleanup
proc.kill()
for f in fixture_files:
    try: f.unlink()
    except: pass

print(f"\n=== PACKAGED E2E COMPLETE ===")
