#!/usr/bin/env python3
"""
AVS V1.0 — Real-World Dashboard Cleanup E2E Audit

This script drives the ACTUAL PACKAGED backend through the full
Dashboard cleanup workflow:

1. Create controlled test fixtures in real cleanup locations
2. Start the packaged backend
3. Run a quick scan (Dashboard scan)
4. Create an optimization plan from the scan results
5. Run auto-optimize (live cleanup)
6. Physically verify file deletion
7. Compare backend-reported vs physical results
8. Run a second scan to verify cleaned files don't return
9. Measure performance per phase

The script communicates with the backend via JSON-RPC 2.0 over
stdin/stdout, exactly as the Electron frontend does.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
import tempfile
import traceback
from pathlib import Path
from datetime import datetime
from typing import Any, Optional
import ctypes


# ── Configuration ──────────────────────────────────────────────────

BACKEND_EXE = Path(
    r"C:\Users\HPBP\Documents\GitHub\avs-suite\apps\pc-optimizer"
    r"\release\win-unpacked\resources\backend\avs-backend.exe"
)

# Number of fixture files to create per category
FIXTURE_COUNT = 50
FIXTURE_FILE_SIZE = 4096  # 4KB per file

# RPC polling interval
POLL_INTERVAL = 0.5

# Timeout for scan/optimize operations
SCAN_TIMEOUT = 120.0
OPTIMIZE_TIMEOUT = 300.0


# ── JSON-RPC Client ────────────────────────────────────────────────

class BackendClient:
    """JSON-RPC 2.0 client over stdin/stdout for the packaged backend."""

    def __init__(self, exe_path: Path):
        self.exe_path = exe_path
        self.proc: Optional[subprocess.Popen] = None
        self._id = 0

    def start(self) -> None:
        """Start the backend process."""
        print(f"[backend] Starting {self.exe_path} ...")
        t0 = time.time()
        self.proc = subprocess.Popen(
            [str(self.exe_path)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,  # Discard stderr to avoid pipe blocking
            text=True,
            bufsize=1,
            encoding="utf-8",
            errors="replace",
        )
        startup_time = time.time() - t0
        print(f"[backend] Process started (PID={self.proc.pid}) in {startup_time:.1f}s")

        # Wait for the backend to be ready by pinging
        print("[backend] Waiting for system.ping ...")
        t0 = time.time()
        while time.time() - t0 < 300:
            try:
                result = self.call("system.ping", {}, timeout=15)
                if result.get("ok") or result.get("pong"):
                    print(f"[backend] Ready after {time.time()-t0:.1f}s")
                    return
            except Exception as e:
                # Check if process died
                if self.proc.poll() is not None:
                    raise RuntimeError(f"Backend process exited with code {self.proc.returncode}")
            time.sleep(1)
            elapsed = time.time() - t0
            if int(elapsed) % 30 == 0 and int(elapsed) > 0:
                print(f"  [backend] Still waiting after {elapsed:.0f}s ...")
        raise RuntimeError("Backend did not become ready within 300s")

    def call(self, method: str, params: dict[str, Any] | None = None,
             timeout: float = 30.0) -> dict[str, Any]:
        """Send a JSON-RPC request and return the result."""
        if self.proc is None or self.proc.poll() is not None:
            raise RuntimeError("Backend process is not running")
        self._id += 1
        request = {
            "jsonrpc": "2.0",
            "id": self._id,
            "method": method,
            "params": params or {},
        }
        line = json.dumps(request) + "\n"
        self.proc.stdin.write(line)
        self.proc.stdin.flush()

        # Read response line with timeout
        import threading

        result_holder: dict[str, Any] = {}
        def _read():
            try:
                result_holder["line"] = self.proc.stdout.readline()
            except Exception as e:
                result_holder["error"] = e

        thread = threading.Thread(target=_read, daemon=True)
        thread.start()
        thread.join(timeout=timeout)

        if thread.is_alive():
            raise TimeoutError(f"RPC call {method} timed out after {timeout}s")
        if "error" in result_holder:
            raise result_holder["error"]
        resp_line = result_holder.get("line", "")
        if not resp_line:
            raise RuntimeError(f"Empty response from backend for {method}")
        resp = json.loads(resp_line)
        if "error" in resp:
            raise RuntimeError(f"RPC error: {resp['error']}")
        return resp.get("result", {})

    def stop(self) -> None:
        """Stop the backend process."""
        if self.proc:
            try:
                self.proc.stdin.close()
            except Exception:
                pass
            try:
                self.proc.wait(timeout=5)
            except Exception:
                self.proc.kill()
            self.proc = None


# ── Test Fixture Creation ──────────────────────────────────────────

class FixtureManager:
    """Creates and tracks controlled test fixtures in real cleanup locations."""

    def __init__(self):
        self.fixtures: dict[str, list[Path]] = {}
        self.fixture_sizes: dict[str, int] = {}
        self.temp_dirs: list[Path] = []

    def create_user_temp_fixtures(self, count: int = FIXTURE_COUNT) -> tuple[list[Path], int]:
        """Create fixture files in the user TEMP directory."""
        temp_dir = Path(os.environ.get("TEMP", os.environ.get("LOCALAPPDATA", "") + "\\Temp"))
        fixture_dir = temp_dir / "avs_e2e_test"
        fixture_dir.mkdir(parents=True, exist_ok=True)
        self.temp_dirs.append(fixture_dir)

        files = []
        total_size = 0
        for i in range(count):
            fpath = fixture_dir / f"avs_test_temp_{i:04d}.tmp"
            data = b"A" * FIXTURE_FILE_SIZE
            fpath.write_bytes(data)
            files.append(fpath)
            total_size += FIXTURE_FILE_SIZE

        self.fixtures["user_temp"] = files
        self.fixture_sizes["user_temp"] = total_size
        print(f"[fixture] Created {count} files in {fixture_dir} ({total_size} bytes)")
        return files, total_size

    def create_windows_temp_fixtures(self, count: int = FIXTURE_COUNT) -> tuple[list[Path], int]:
        """Create fixture files in Windows TEMP directory."""
        win_temp = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "Temp"
        fixture_dir = win_temp / "avs_e2e_test"
        try:
            fixture_dir.mkdir(parents=True, exist_ok=True)
        except PermissionError:
            print(f"[fixture] WARNING: Cannot write to {win_temp} (permission denied)")
            return [], 0
        self.temp_dirs.append(fixture_dir)

        files = []
        total_size = 0
        for i in range(count):
            fpath = fixture_dir / f"avs_test_wtemp_{i:04d}.tmp"
            try:
                fpath.write_bytes(b"B" * FIXTURE_FILE_SIZE)
                files.append(fpath)
                total_size += FIXTURE_FILE_SIZE
            except PermissionError:
                print(f"[fixture] WARNING: Cannot create {fpath}")
                break

        self.fixtures["windows_temp"] = files
        self.fixture_sizes["windows_temp"] = total_size
        print(f"[fixture] Created {len(files)} files in {fixture_dir} ({total_size} bytes)")
        return files, total_size

    def create_prefetch_fixtures(self, count: int = 20) -> tuple[list[Path], int]:
        """Create fixture .pf files in Prefetch directory."""
        prefetch = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "Prefetch"
        files = []
        total_size = 0
        for i in range(count):
            fpath = prefetch / f"AVSTESTFIXTURE-{i:04d}.pf"
            try:
                fpath.write_bytes(b"C" * 1024)
                files.append(fpath)
                total_size += 1024
            except PermissionError:
                print(f"[fixture] WARNING: Cannot create {fpath}")
                break

        self.fixtures["prefetch"] = files
        self.fixture_sizes["prefetch"] = total_size
        print(f"[fixture] Created {len(files)} .pf files in {prefetch} ({total_size} bytes)")
        return files, total_size

    def create_shader_cache_fixtures(self, count: int = 20) -> tuple[list[Path], int]:
        """Create fixture files in D3D shader cache directory."""
        localappdata = Path(os.environ.get("LOCALAPPDATA", ""))
        d3d_cache = localappdata / "D3DSCache"
        d3d_cache.mkdir(parents=True, exist_ok=True)
        self.temp_dirs.append(d3d_cache / "avs_e2e_test")

        fixture_dir = d3d_cache / "avs_e2e_test"
        fixture_dir.mkdir(parents=True, exist_ok=True)

        files = []
        total_size = 0
        for i in range(count):
            fpath = fixture_dir / f"avs_test_shader_{i:04d}.bin"
            fpath.write_bytes(b"D" * 2048)
            files.append(fpath)
            total_size += 2048

        self.fixtures["shader_cache"] = files
        self.fixture_sizes["shader_cache"] = total_size
        print(f"[fixture] Created {count} files in {fixture_dir} ({total_size} bytes)")
        return files, total_size

    def create_locked_file(self) -> Optional[Path]:
        """Create a locked file in TEMP (held open by this process)."""
        temp_dir = Path(os.environ.get("TEMP", ""))
        fpath = temp_dir / "avs_e2e_test" / "avs_test_locked.tmp"
        fpath.parent.mkdir(parents=True, exist_ok=True)
        fpath.write_bytes(b"LOCKED" * 1000)

        # Open and hold the file
        self._locked_fh = open(fpath, "r+b")
        try:
            # Try to get an exclusive lock via Windows API
            ctypes.windll.kernel32.LockFile(
                ctypes.windll.kernel32.CreateFileW(
                    str(fpath), 0x40000000, 0, None, 3, 0, None
                ),
                0, 0, 0xFFFFFFFF, 0xFFFFFFFF
            )
        except Exception:
            pass  # Holding the file open may be sufficient

        print(f"[fixture] Created locked file: {fpath}")
        self.fixtures.setdefault("locked", []).append(fpath)
        return fpath

    def cleanup(self) -> None:
        """Clean up all fixture directories and locked files."""
        if hasattr(self, "_locked_fh"):
            try:
                self._locked_fh.close()
            except Exception:
                pass
        for d in self.temp_dirs:
            try:
                shutil.rmtree(d, ignore_errors=True)
            except Exception:
                pass
        # Clean up prefetch fixtures
        for f in self.fixtures.get("prefetch", []):
            try:
                f.unlink(missing_ok=True)
            except Exception:
                pass

    def verify_deleted(self, category: str) -> tuple[int, int, list[Path]]:
        """Verify which fixture files were physically deleted.
        Returns (deleted_count, remaining_count, remaining_files).
        """
        files = self.fixtures.get(category, [])
        remaining = []
        deleted = 0
        for f in files:
            if f.exists():
                remaining.append(f)
            else:
                deleted += 1
        return deleted, len(remaining), remaining

    def all_fixtures(self) -> dict[str, list[Path]]:
        return dict(self.fixtures)


# ── E2E Test Driver ────────────────────────────────────────────────

def run_e2e_audit():
    """Main E2E audit entry point."""

    print("=" * 70)
    print("AVS V1.0 — REAL-WORLD DASHBOARD CLEANUP E2E AUDIT")
    print(f"Date: {datetime.now().isoformat()}")
    print(f"Backend: {BACKEND_EXE}")
    print("=" * 70)

    if not BACKEND_EXE.exists():
        print(f"\nFATAL: Backend not found at {BACKEND_EXE}")
        return

    fixture_mgr = FixtureManager()
    client = BackendClient(BACKEND_EXE)

    results: dict[str, Any] = {}

    try:
        # ── Phase 1: Create fixtures ───────────────────────────────
        print("\n" + "=" * 70)
        print("PHASE 1: CREATE CONTROLLED TEST FIXTURES")
        print("=" * 70)

        t0 = time.time()
        user_temp_files, user_temp_size = fixture_mgr.create_user_temp_fixtures(50)
        win_temp_files, win_temp_size = fixture_mgr.create_windows_temp_fixtures(30)
        prefetch_files, prefetch_size = fixture_mgr.create_prefetch_fixtures(20)
        shader_files, shader_size = fixture_mgr.create_shader_cache_fixtures(20)
        locked_file = fixture_mgr.create_locked_file()
        fixture_time = time.time() - t0

        total_fixtures = sum(len(v) for v in fixture_mgr.fixtures.values() if isinstance(v, list))
        total_fixture_size = sum(fixture_mgr.fixture_sizes.values())
        print(f"\n[fixture] Total: {total_fixtures} files, {total_fixture_size} bytes, {fixture_time:.1f}s")

        # ── Phase 2: Start backend ─────────────────────────────────
        print("\n" + "=" * 70)
        print("PHASE 2: START PACKAGED BACKEND")
        print("=" * 70)

        t0 = time.time()
        client.start()
        startup_time = time.time() - t0
        results["startup_time"] = startup_time

        # ── Phase 3: Run Dashboard scan (quick scan) ───────────────
        print("\n" + "=" * 70)
        print("PHASE 3: DASHBOARD SCAN (scan_core.scan.quick)")
        print("=" * 70)

        # Wait for scan_core module to be loaded (it may take a while
        # in the PyInstaller bundle due to import-time DB initialization)
        print("[scan] Waiting for scan_core module to be ready ...")
        t0 = time.time()
        while time.time() - t0 < 300:
            try:
                # The scan_core.scan.quick call waits for orchestrator readiness
                # internally (up to 90s). We give it a longer timeout.
                scan_resp = client.call("scan_core.scan.quick", {}, timeout=120)
                break
            except TimeoutError:
                print(f"  [scan] Retrying after {time.time()-t0:.0f}s ...")
                if time.time() - t0 > 300:
                    raise
                continue
            except Exception as e:
                print(f"  [scan] Error: {e}, retrying ...")
                time.sleep(2)
                if time.time() - t0 > 300:
                    raise
        if not scan_resp.get("ok"):
            print(f"FAIL: scan_core.scan.quick returned: {scan_resp}")
            return
        scan_session = scan_resp.get("session_id", "")
        print(f"[scan] Started session: {scan_session}")

        # Poll for scan completion
        scan_complete = False
        scan_result = None
        t_scan_start = time.time()
        while time.time() - t_scan_start < SCAN_TIMEOUT:
            status = client.call("scan_core.scan.status",
                                 {"session_id": scan_session}, timeout=10)
            if not status.get("ok"):
                print(f"[scan] Status error: {status}")
                break
            if status.get("completed"):
                scan_complete = True
                # Fetch the actual result via scan_core.scan.result
                result_resp = client.call("scan_core.scan.result",
                                          {"session_id": scan_session}, timeout=30)
                scan_result = result_resp.get("result", {}) if result_resp.get("ok") else {}
                if status.get("error"):
                    print(f"  [scan] Scan error: {status.get('error')}")
                break
            progress = status.get("progress") or {}
            phase = progress.get("phase", "?")
            pct = progress.get("percent", 0)
            assets = progress.get("assets_discovered", 0)
            findings = progress.get("findings", 0)
            print(f"  [scan] phase={phase} pct={pct}% assets={assets} findings={findings}")
            time.sleep(POLL_INTERVAL)

        scan_time = time.time() - t0
        results["scan_time"] = scan_time

        if not scan_complete:
            print(f"FAIL: Scan did not complete within {SCAN_TIMEOUT}s")
            client.call("scan_core.scan.cancel", {"session_id": scan_session}, timeout=10)
            return

        print(f"\n[scan] Completed in {scan_time:.1f}s")
        print(f"  scan_id: {scan_result.get('scan_id', '')}")
        print(f"  findings: {scan_result.get('findings_count', 0)}")
        print(f"  action_plan_id: {scan_result.get('action_plan_id', '')}")
        stats = scan_result.get("statistics", {})
        print(f"  assets_discovered: {stats.get('assets_discovered', 0)}")
        print(f"  assets_evaluated: {stats.get('assets_evaluated', 0)}")
        print(f"  matches: {stats.get('matches', 0)}")
        print(f"  phase_timings: {scan_result.get('phase_timings', {})}")

        plan_id = scan_result.get("action_plan_id", "") or scan_result.get("plan_id", "")
        if not plan_id:
            print(f"FAIL: No action_plan_id returned from scan. Result keys: {list(scan_result.keys())}")
            print(f"  Full result (truncated): {json.dumps(scan_result, default=str)[:2000]}")
            return

        results["scan_findings"] = scan_result.get("findings_count", 0)
        results["scan_assets"] = stats.get("assets_discovered", 0)
        results["scan_matches"] = stats.get("matches", 0)
        results["phase_timings"] = scan_result.get("phase_timings", {})

        # ── Phase 4: Auto-optimize (live cleanup) ──────────────────
        print("\n" + "=" * 70)
        print("PHASE 4: AUTO-OPTIMIZE (scan_core.dashboard.auto_optimize)")
        print("=" * 70)

        t0 = time.time()
        opt_resp = client.call("scan_core.dashboard.auto_optimize",
                               {"plan_id": plan_id}, timeout=30)
        if not opt_resp.get("ok"):
            print(f"FAIL: auto_optimize returned: {opt_resp}")
            return
        opt_session = opt_resp.get("session_id", "")
        print(f"[optimize] Started session: {opt_session}")

        # Poll for optimization completion
        opt_complete = False
        opt_result = None
        t_opt_start = time.time()
        while time.time() - t_opt_start < OPTIMIZE_TIMEOUT:
            status = client.call("scan_core.dashboard.auto_optimize_status",
                                 {"session_id": opt_session}, timeout=10)
            if not status.get("ok"):
                print(f"[optimize] Status error: {status}")
                break
            if status.get("completed"):
                opt_complete = True
                opt_result = status.get("result", {})
                break
            phase = status.get("phase", "?")
            pct = status.get("overall_progress", 0)
            exec_prog = status.get("execution_progress", 0)
            exec_total = status.get("execution_total", 0)
            space = status.get("space_recovered", 0)
            current_file = status.get("current_file", "")
            msg = status.get("message", "")
            print(f"  [optimize] phase={phase} pct={pct}% exec={exec_prog}/{exec_total} space={space} msg={msg}")
            time.sleep(POLL_INTERVAL)

        optimize_time = time.time() - t0
        results["optimize_time"] = optimize_time

        if not opt_complete:
            print(f"FAIL: Optimization did not complete within {OPTIMIZE_TIMEOUT}s")
            client.call("scan_core.dashboard.auto_optimize_cancel",
                        {"session_id": opt_session}, timeout=10)
            return

        print(f"\n[optimize] Completed in {optimize_time:.1f}s")
        print(f"  files_found: {opt_result.get('files_found', 0)}")
        print(f"  files_cleaned: {opt_result.get('files_cleaned', 0)}")
        print(f"  folders_found: {opt_result.get('folders_found', 0)}")
        print(f"  folders_cleaned: {opt_result.get('folders_cleaned', 0)}")
        print(f"  space_recovered: {opt_result.get('space_recovered', 0)}")
        print(f"  detected: {opt_result.get('detected', 0)}")
        print(f"  cleaned: {opt_result.get('cleaned', 0)}")
        print(f"  remaining: {opt_result.get('remaining', 0)}")
        print(f"  failed: {opt_result.get('failed', 0)}")
        print(f"  health_before: {opt_result.get('health_before', 0)}")
        print(f"  health_after: {opt_result.get('health_after', 0)}")

        categories = opt_result.get("categories", {})
        print(f"\n  Categories ({len(categories)}):")
        for cat_name, cat_stats in categories.items():
            print(f"    {cat_name}: found={cat_stats.get('files_found',0)} "
                  f"cleaned={cat_stats.get('files_cleaned',0)} "
                  f"space={cat_stats.get('space_recovered',0)}")

        results["opt_files_found"] = opt_result.get("files_found", 0)
        results["opt_files_cleaned"] = opt_result.get("files_cleaned", 0)
        results["opt_folders_cleaned"] = opt_result.get("folders_cleaned", 0)
        results["opt_space_recovered"] = opt_result.get("space_recovered", 0)
        results["opt_detected"] = opt_result.get("detected", 0)
        results["opt_cleaned"] = opt_result.get("cleaned", 0)
        results["opt_remaining"] = opt_result.get("remaining", 0)
        results["opt_failed"] = opt_result.get("failed", 0)
        results["health_before"] = opt_result.get("health_before", 0)
        results["health_after"] = opt_result.get("health_after", 0)
        results["categories"] = categories

        # ── Phase 5: Physical filesystem verification ─────────────
        print("\n" + "=" * 70)
        print("PHASE 5: PHYSICAL FILESYSTEM VERIFICATION")
        print("=" * 70)

        for category in ["user_temp", "windows_temp", "prefetch", "shader_cache"]:
            deleted, remaining_count, remaining_files = fixture_mgr.verify_deleted(category)
            total = len(fixture_mgr.fixtures.get(category, []))
            print(f"  [{category}] {total} created -> {deleted} deleted, {remaining_count} remain")
            if remaining_files:
                for rf in remaining_files[:5]:
                    print(f"    REMAINS: {rf}")
            results[f"phys_{category}_total"] = total
            results[f"phys_{category}_deleted"] = deleted
            results[f"phys_{category}_remaining"] = remaining_count

        # Check locked file
        if locked_file and locked_file.exists():
            print(f"  [locked] File correctly remains: {locked_file}")
            results["phys_locked"] = "remains (correct)"
        elif locked_file:
            print(f"  [locked] WARNING: Locked file was deleted: {locked_file}")
            results["phys_locked"] = "DELETED (BUG)"
        else:
            results["phys_locked"] = "N/A"

        # ── Phase 6: Second scan (verify no rediscovery) ──────────
        print("\n" + "=" * 70)
        print("PHASE 6: SECOND SCAN (verify cleaned files don't return)")
        print("=" * 70)

        t0 = time.time()
        scan2_resp = client.call("scan_core.scan.quick", {}, timeout=30)
        if not scan2_resp.get("ok"):
            print(f"FAIL: Second scan failed: {scan2_resp}")
            return
        scan2_session = scan2_resp.get("session_id", "")

        scan2_complete = False
        scan2_result = None
        t_scan2_start = time.time()
        while time.time() - t_scan2_start < SCAN_TIMEOUT:
            status = client.call("scan_core.scan.status",
                                 {"session_id": scan2_session}, timeout=10)
            if not status.get("ok"):
                break
            if status.get("completed"):
                scan2_complete = True
                result_resp = client.call("scan_core.scan.result",
                                          {"session_id": scan2_session}, timeout=30)
                scan2_result = result_resp.get("result", {}) if result_resp.get("ok") else {}
                break
            time.sleep(POLL_INTERVAL)

        scan2_time = time.time() - t0
        results["scan2_time"] = scan2_time

        if scan2_complete and scan2_result:
            stats2 = scan2_result.get("statistics", {})
            findings2 = scan2_result.get("findings_count", 0)
            matches2 = stats2.get("matches", 0)
            print(f"[scan2] Completed in {scan2_time:.1f}s")
            print(f"  findings: {findings2} (was {results.get('scan_findings', 0)} in scan 1)")
            print(f"  matches: {matches2} (was {results.get('scan_matches', 0)} in scan 1)")
            results["scan2_findings"] = findings2
            results["scan2_matches"] = matches2
        else:
            print(f"[scan2] Did not complete")
            results["scan2_findings"] = -1

        # ── Phase 7: Summary ───────────────────────────────────────
        print("\n" + "=" * 70)
        print("PHASE 7: SUMMARY")
        print("=" * 70)

        total_time = startup_time + results.get("scan_time", 0) + results.get("optimize_time", 0)
        print(f"  Backend startup: {startup_time:.1f}s")
        print(f"  Scan time: {results.get('scan_time', 0):.1f}s")
        print(f"  Optimize time: {results.get('optimize_time', 0):.1f}s")
        print(f"  Second scan: {results.get('scan2_time', 0):.1f}s")
        print(f"  Total workflow: {total_time:.1f}s")
        print(f"  Files found: {results.get('opt_files_found', 0)}")
        print(f"  Files cleaned: {results.get('opt_files_cleaned', 0)}")
        print(f"  Space recovered: {results.get('opt_space_recovered', 0)} bytes")
        print(f"  Health: {results.get('health_before', 0)} -> {results.get('health_after', 0)}")

        # Backend vs physical comparison
        print("\n  Backend vs Physical comparison:")
        for category in ["user_temp", "windows_temp", "prefetch", "shader_cache"]:
            phys_deleted = results.get(f"phys_{category}_deleted", 0)
            print(f"    {category}: physical_deleted={phys_deleted}")

    except Exception as e:
        print(f"\nFATAL ERROR: {e}")
        traceback.print_exc()
    finally:
        # Clean up
        print("\n[cleanup] Removing test fixtures ...")
        fixture_mgr.cleanup()
        client.stop()
        print("[cleanup] Done")

    # Write results to JSON file
    results_file = Path("e2e_audit_results.json")
    with open(results_file, "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nResults written to {results_file}")


if __name__ == "__main__":
    run_e2e_audit()
