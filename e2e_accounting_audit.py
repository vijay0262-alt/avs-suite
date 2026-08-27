#!/usr/bin/env python3
"""
AVS V1.0 — Dashboard Cleanup Accounting + Physical Verification E2E

This script drives the ACTUAL PACKAGED backend through the full
Dashboard cleanup workflow with strict accounting verification:

  Detected = Cleaned + Failed + Remaining

Test matrix:
  1. Controlled fixtures in every category (TEMP, Windows TEMP, Prefetch,
     Shader Cache, Thumbnail Cache)
  2. Locked file test (10 cleanable + 5 locked + 5 missing)
  3. Recycle Bin fixture (if safely possible)
  4. Physical filesystem verification per category
  5. Second scan to verify cleaned files don't return
  6. Accounting equation verification

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
import ctypes
import traceback
from pathlib import Path
from datetime import datetime
from typing import Any, Optional


# ── Configuration ──────────────────────────────────────────────────

BACKEND_EXE = Path(
    r"C:\Users\HPBP\Documents\GitHub\avs-suite\apps\pc-optimizer"
    r"\release\win-unpacked\resources\backend\avs-backend.exe"
)

POLL_INTERVAL = 0.5
SCAN_TIMEOUT = 180.0
OPTIMIZE_TIMEOUT = 300.0


# ── JSON-RPC Client ────────────────────────────────────────────────

class BackendClient:
    """JSON-RPC 2.0 client over stdin/stdout for the packaged backend."""

    def __init__(self, exe_path: Path):
        self.exe_path = exe_path
        self.proc: Optional[subprocess.Popen] = None
        self._id = 0

    def start(self) -> None:
        print(f"[backend] Starting {self.exe_path} ...")
        t0 = time.time()
        self.proc = subprocess.Popen(
            [str(self.exe_path)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1,
            encoding="utf-8",
            errors="replace",
        )
        print(f"[backend] Process started (PID={self.proc.pid}) in {time.time()-t0:.1f}s")

        print("[backend] Waiting for system.ping ...")
        t0 = time.time()
        while time.time() - t0 < 300:
            try:
                result = self.call("system.ping", {}, timeout=15)
                if result.get("ok") or result.get("pong"):
                    print(f"[backend] Ready after {time.time()-t0:.1f}s")
                    return
            except Exception:
                if self.proc.poll() is not None:
                    raise RuntimeError(f"Backend exited with code {self.proc.returncode}")
            time.sleep(1)
        raise RuntimeError("Backend did not become ready within 300s")

    def call(self, method: str, params: dict[str, Any] | None = None,
             timeout: float = 30.0) -> dict[str, Any]:
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


# ── Test Fixture Manager ───────────────────────────────────────────

class FixtureManager:
    """Creates and tracks controlled test fixtures in real cleanup locations."""

    def __init__(self):
        self.fixtures: dict[str, list[Path]] = {}
        self.fixture_sizes: dict[str, int] = {}
        self.temp_dirs: list[Path] = []
        self._locked_handles: list = []

    def _create_files(self, category: str, directory: Path,
                      prefix: str, count: int, size: int,
                      suffix: str = ".tmp") -> tuple[list[Path], int]:
        """Create fixture files in a directory."""
        try:
            directory.mkdir(parents=True, exist_ok=True)
        except PermissionError:
            print(f"  [fixture] WARNING: Cannot access {directory} (permission denied) - skipping {category}")
            self.fixtures[category] = []
            self.fixture_sizes[category] = 0
            return [], 0
        if directory not in self.temp_dirs:
            self.temp_dirs.append(directory)
        files = []
        total_size = 0
        for i in range(count):
            fpath = directory / f"{prefix}_{i:04d}{suffix}"
            try:
                fpath.write_bytes(b"X" * size)
                files.append(fpath)
                total_size += size
            except PermissionError:
                print(f"  [fixture] WARNING: Cannot create {fpath}")
                break
        self.fixtures[category] = files
        self.fixture_sizes[category] = total_size
        print(f"  [fixture] {category}: {len(files)} files in {directory} ({total_size} bytes)")
        return files, total_size

    def create_user_temp_fixtures(self, count: int = 50) -> tuple[list[Path], int]:
        temp_dir = Path(os.environ.get("TEMP", ""))
        fixture_dir = temp_dir / "avs_e2e_test"
        return self._create_files("user_temp", fixture_dir, "avs_test_temp", count, 4096)

    def create_windows_temp_fixtures(self, count: int = 30) -> tuple[list[Path], int]:
        win_temp = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "Temp"
        fixture_dir = win_temp / "avs_e2e_test"
        return self._create_files("windows_temp", fixture_dir, "avs_test_wtemp", count, 4096)

    def create_prefetch_fixtures(self, count: int = 20) -> tuple[list[Path], int]:
        prefetch = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "Prefetch"
        return self._create_files("prefetch", prefetch, "AVSTESTFIXTURE", count, 1024, ".pf")

    def create_shader_cache_fixtures(self, count: int = 20) -> tuple[list[Path], int]:
        localappdata = Path(os.environ.get("LOCALAPPDATA", ""))
        d3d_cache = localappdata / "D3DSCache" / "avs_e2e_test"
        return self._create_files("shader_cache", d3d_cache, "avs_test_shader", count, 2048, ".bin")

    def create_thumbnail_cache_fixtures(self, count: int = 20) -> tuple[list[Path], int]:
        localappdata = Path(os.environ.get("LOCALAPPDATA", ""))
        thumb_cache = localappdata / "Microsoft" / "Windows" / "Explorer"
        # Must use thumbcache_*.db pattern to match ThumbnailCacheRule
        return self._create_files("thumbnail_cache", thumb_cache, "thumbcache_avstest", count, 2048, ".db")

    def create_locked_file_test(self) -> dict[str, list[Path]]:
        """Create 10 cleanable + 5 locked + 5 missing files in TEMP."""
        temp_dir = Path(os.environ.get("TEMP", "")) / "avs_e2e_locked_test"
        temp_dir.mkdir(parents=True, exist_ok=True)
        self.temp_dirs.append(temp_dir)

        # 10 cleanable files
        cleanable = []
        for i in range(10):
            fpath = temp_dir / f"cleanable_{i:04d}.tmp"
            fpath.write_bytes(b"C" * 2048)
            cleanable.append(fpath)

        # 5 locked files (held open by this process)
        locked = []
        for i in range(5):
            fpath = temp_dir / f"locked_{i:04d}.tmp"
            fpath.write_bytes(b"L" * 2048)
            fh = open(fpath, "r+b")
            self._locked_handles.append(fh)
            locked.append(fpath)

        # 5 missing files (create then immediately delete, so they're "known" but absent)
        missing = []
        for i in range(5):
            fpath = temp_dir / f"missing_{i:04d}.tmp"
            fpath.write_bytes(b"M" * 2048)
            missing.append(fpath)
            fpath.unlink()  # delete immediately

        self.fixtures["locked_test_cleanable"] = cleanable
        self.fixtures["locked_test_locked"] = locked
        self.fixtures["locked_test_missing"] = missing
        print(f"  [fixture] locked_test: 10 cleanable, 5 locked, 5 missing in {temp_dir}")
        return {"cleanable": cleanable, "locked": locked, "missing": missing}

    def create_recycle_bin_fixture(self) -> int:
        """Send files to Recycle Bin using SHFileOperation."""
        temp_dir = Path(os.environ.get("TEMP", "")) / "avs_e2e_recycle_test"
        temp_dir.mkdir(parents=True, exist_ok=True)
        self.temp_dirs.append(temp_dir)

        files = []
        for i in range(20):
            fpath = temp_dir / f"recycle_fixture_{i:04d}.tmp"
            fpath.write_bytes(b"R" * 1024)
            files.append(fpath)

        # Send files to Recycle Bin using SHFileOperation
        # FO_DELETE with FOF_ALLOWUNDO sends to Recycle Bin
        try:
            from ctypes import wintypes

            class SHFILEOPSTRUCT(ctypes.Structure):
                _fields_ = [
                    ("hwnd", wintypes.HWND),
                    ("wFunc", ctypes.c_uint),
                    ("pFrom", ctypes.c_char_p),
                    ("pTo", ctypes.c_char_p),
                    ("fFlags", ctypes.c_uint16),
                    ("fAnyOperationsAborted", wintypes.BOOL),
                    ("hNameMappings", ctypes.c_void_p),
                    ("lpszProgressTitle", ctypes.c_char_p),
                ]

            FO_DELETE = 0x0003
            FOF_ALLOWUNDO = 0x0040
            FOF_NOCONFIRMATION = 0x0010
            FOF_SILENT = 0x0004

            # pFrom must be double-null-terminated
            file_list = "\0".join(str(f) for f in files) + "\0\0"
            op = SHFILEOPSTRUCT()
            op.hwnd = None
            op.wFunc = FO_DELETE
            op.pFrom = file_list.encode("utf-16-le") + b"\0\0" if False else file_list.encode("cp1252")
            op.pTo = None
            op.fFlags = FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT
            op.fAnyOperationsAborted = False
            op.hNameMappings = None
            op.lpszProgressTitle = None

            result = ctypes.windll.shell32.SHFileOperationA(ctypes.byref(op))
            if result == 0:
                print(f"  [fixture] recycle_bin: sent {len(files)} files to Recycle Bin")
                self.fixtures["recycle_bin"] = files
                return len(files)
            else:
                print(f"  [fixture] recycle_bin: SHFileOperation returned {result}")
                return 0
        except Exception as e:
            print(f"  [fixture] recycle_bin: Failed to create fixture: {e}")
            return 0

    def count_recycle_bin_items(self) -> tuple[int, int]:
        """Count files and total size in Recycle Bin."""
        from avs_backend.scan_core.rules.detection.locations import KnownLocations
        rb_roots = KnownLocations.get_recycle_bin_roots()
        count = 0
        total_size = 0
        for root in rb_roots:
            if root.exists():
                for f in root.rglob("*"):
                    if f.is_file():
                        try:
                            total_size += f.stat().st_size
                            count += 1
                        except (OSError, PermissionError):
                            pass
        return count, total_size

    def verify_deleted(self, category: str) -> tuple[int, int, list[Path]]:
        """Verify which fixture files were physically deleted."""
        files = self.fixtures.get(category, [])
        remaining = []
        deleted = 0
        for f in files:
            if f.exists():
                remaining.append(f)
            else:
                deleted += 1
        return deleted, len(remaining), remaining

    def cleanup(self) -> None:
        for fh in self._locked_handles:
            try:
                fh.close()
            except Exception:
                pass
        for d in self.temp_dirs:
            try:
                shutil.rmtree(d, ignore_errors=True)
            except Exception:
                pass


# ── E2E Test Driver ────────────────────────────────────────────────

def run_scan_and_wait(client: BackendClient, timeout: float = SCAN_TIMEOUT) -> dict[str, Any]:
    """Run a quick scan and wait for completion. Returns scan result dict."""
    scan_resp = client.call("scan_core.scan.quick", {}, timeout=120)
    if not scan_resp.get("ok"):
        raise RuntimeError(f"scan_core.scan.quick failed: {scan_resp}")
    session_id = scan_resp.get("session_id", "")
    print(f"  [scan] Started session: {session_id}")

    t0 = time.time()
    while time.time() - t0 < timeout:
        status = client.call("scan_core.scan.status", {"session_id": session_id}, timeout=10)
        if not status.get("ok"):
            raise RuntimeError(f"scan status error: {status}")
        if status.get("completed"):
            result_resp = client.call("scan_core.scan.result", {"session_id": session_id}, timeout=30)
            if not result_resp.get("ok"):
                raise RuntimeError(f"scan result error: {result_resp}")
            return result_resp.get("result", {})
        progress = status.get("progress") or {}
        phase = progress.get("phase", "?")
        assets = progress.get("assets_discovered", 0)
        findings = progress.get("findings", 0)
        if phase != "evaluating" or int(time.time() - t0) % 10 == 0:
            print(f"  [scan] phase={phase} assets={assets} findings={findings}")
        time.sleep(POLL_INTERVAL)
    raise TimeoutError(f"Scan did not complete within {timeout}s")


def run_optimize_and_wait(client: BackendClient, plan_id: str,
                          timeout: float = OPTIMIZE_TIMEOUT) -> dict[str, Any]:
    """Run auto-optimize and wait for completion. Returns result dict."""
    opt_resp = client.call("scan_core.dashboard.auto_optimize",
                           {"plan_id": plan_id}, timeout=30)
    if not opt_resp.get("ok"):
        raise RuntimeError(f"auto_optimize failed: {opt_resp}")
    session_id = opt_resp.get("session_id", "")
    print(f"  [optimize] Started session: {session_id}")

    t0 = time.time()
    last_phase = ""
    while time.time() - t0 < timeout:
        status = client.call("scan_core.dashboard.auto_optimize_status",
                             {"session_id": session_id}, timeout=10)
        if not status.get("ok"):
            raise RuntimeError(f"optimize status error: {status}")
        if status.get("completed"):
            return status.get("result", {})
        phase = status.get("phase", "?")
        pct = status.get("overall_progress", 0)
        exec_prog = status.get("execution_progress", 0)
        exec_total = status.get("execution_total", 0)
        space = status.get("space_recovered", 0)
        msg = status.get("message", "")
        if phase != last_phase or int(time.time() - t0) % 15 == 0:
            print(f"  [optimize] phase={phase} pct={pct}% exec={exec_prog}/{exec_total} space={space}")
            last_phase = phase
        time.sleep(POLL_INTERVAL)
    raise TimeoutError(f"Optimization did not complete within {timeout}s")


def run_e2e_audit():
    print("=" * 70)
    print("AVS V1.0 - DASHBOARD CLEANUP ACCOUNTING + PHYSICAL VERIFICATION E2E")
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
        fixture_mgr.create_user_temp_fixtures(50)
        fixture_mgr.create_windows_temp_fixtures(30)
        fixture_mgr.create_prefetch_fixtures(20)
        fixture_mgr.create_shader_cache_fixtures(20)
        fixture_mgr.create_thumbnail_cache_fixtures(20)
        locked_test = fixture_mgr.create_locked_file_test()
        rb_count = fixture_mgr.create_recycle_bin_fixture()
        fixture_time = time.time() - t0

        total_fixtures = sum(len(v) for v in fixture_mgr.fixtures.values() if isinstance(v, list))
        total_fixture_size = sum(fixture_mgr.fixture_sizes.values())
        print(f"\n  Total fixtures: {total_fixtures} files, {total_fixture_size} bytes, {fixture_time:.1f}s")

        # Record Recycle Bin state before cleanup
        rb_before_count, rb_before_bytes = fixture_mgr.count_recycle_bin_items()
        print(f"  Recycle Bin before: {rb_before_count} items, {rb_before_bytes} bytes")
        results["rb_before_count"] = rb_before_count
        results["rb_before_bytes"] = rb_before_bytes

        # ── Phase 2: Start backend ─────────────────────────────────
        print("\n" + "=" * 70)
        print("PHASE 2: START PACKAGED BACKEND")
        print("=" * 70)

        t0 = time.time()
        client.start()
        startup_time = time.time() - t0
        results["startup_time"] = startup_time

        # ── Phase 3: First scan ────────────────────────────────────
        print("\n" + "=" * 70)
        print("PHASE 3: FIRST DASHBOARD SCAN")
        print("=" * 70)

        t0 = time.time()
        scan_result = run_scan_and_wait(client)
        scan_time = time.time() - t0
        results["scan1_time"] = scan_time
        results["scan1_findings"] = scan_result.get("findings_count", 0)
        results["scan1_assets"] = scan_result.get("statistics", {}).get("assets_discovered", 0)
        plan_id = scan_result.get("action_plan_id", "")
        print(f"\n  [scan1] Completed in {scan_time:.1f}s")
        print(f"  findings: {results['scan1_findings']}")
        print(f"  assets: {results['scan1_assets']}")
        print(f"  action_plan_id: {plan_id}")

        if not plan_id:
            print("FAIL: No action_plan_id returned from scan")
            return

        # ── Phase 4: Auto-optimize ─────────────────────────────────
        print("\n" + "=" * 70)
        print("PHASE 4: AUTO-OPTIMIZE (LIVE CLEANUP)")
        print("=" * 70)

        t0 = time.time()
        opt_result = run_optimize_and_wait(client, plan_id)
        optimize_time = time.time() - t0
        results["optimize_time"] = optimize_time

        detected = opt_result.get("detected", 0)
        cleaned = opt_result.get("cleaned", 0)
        failed = opt_result.get("failed", 0)
        remaining = opt_result.get("remaining", 0)
        space_recovered = opt_result.get("space_recovered", 0)
        health_before = opt_result.get("health_before", 0)
        health_after = opt_result.get("health_after", 0)

        print(f"\n  [optimize] Completed in {optimize_time:.1f}s")
        print(f"  detected:  {detected}")
        print(f"  cleaned:   {cleaned}")
        print(f"  failed:    {failed}")
        print(f"  remaining: {remaining}")
        print(f"  space_recovered: {space_recovered} bytes ({space_recovered/1024/1024:.2f} MB)")
        print(f"  health: {health_before} -> {health_after}")

        # ── ACCOUNTING VERIFICATION ────────────────────────────────
        print("\n  --- ACCOUNTING VERIFICATION ---")
        accounting_check = detected == cleaned + failed + remaining
        print(f"  Detected = Cleaned + Failed + Remaining")
        print(f"  {detected} = {cleaned} + {failed} + {remaining} = {cleaned + failed + remaining}")
        print(f"  CHECK: {'PASS' if accounting_check else 'FAIL'}")

        results["accounting_detected"] = detected
        results["accounting_cleaned"] = cleaned
        results["accounting_failed"] = failed
        results["accounting_remaining"] = remaining
        results["accounting_check"] = accounting_check
        results["space_recovered"] = space_recovered
        results["health_before"] = health_before
        results["health_after"] = health_after

        # Category breakdown
        categories = opt_result.get("categories", {})
        print(f"\n  Categories ({len(categories)}):")
        for cat_name, cat_stats in categories.items():
            print(f"    {cat_name}: found={cat_stats.get('files_found',0)} "
                  f"cleaned={cat_stats.get('files_cleaned',0)} "
                  f"space={cat_stats.get('space_recovered',0)}")
        results["categories"] = categories

        # ── Phase 5: Physical filesystem verification ─────────────
        print("\n" + "=" * 70)
        print("PHASE 5: PHYSICAL FILESYSTEM VERIFICATION")
        print("=" * 70)

        phys_results = {}
        for category in ["user_temp", "windows_temp", "prefetch",
                         "shader_cache", "thumbnail_cache"]:
            deleted, remaining_count, remaining_files = fixture_mgr.verify_deleted(category)
            total = len(fixture_mgr.fixtures.get(category, []))
            status = "VERIFIED" if deleted == total else "MISMATCH"
            print(f"  [{category}] {total} created -> {deleted} deleted, {remaining_count} remain [{status}]")
            if remaining_files:
                for rf in remaining_files[:5]:
                    print(f"    REMAINS: {rf}")
            phys_results[category] = {
                "total": total, "deleted": deleted, "remaining": remaining_count,
                "status": status,
            }

        # Locked file test verification
        print("\n  --- LOCKED FILE TEST ---")
        lt_cleanable = locked_test["cleanable"]
        lt_locked = locked_test["locked"]
        lt_missing = locked_test["missing"]

        cleanable_deleted = sum(1 for f in lt_cleanable if not f.exists())
        cleanable_remain = sum(1 for f in lt_cleanable if f.exists())
        locked_remain = sum(1 for f in lt_locked if f.exists())
        missing_still_missing = sum(1 for f in lt_missing if not f.exists())

        print(f"  cleanable: {len(lt_cleanable)} created -> {cleanable_deleted} deleted, {cleanable_remain} remain")
        print(f"  locked: {len(lt_locked)} created -> {locked_remain} remain (expected: {len(lt_locked)})")
        print(f"  missing: {len(lt_missing)} created -> {missing_still_missing} still missing (expected: {len(lt_missing)})")

        locked_test_pass = (cleanable_deleted == len(lt_cleanable)
                           and locked_remain == len(lt_locked)
                           and missing_still_missing == len(lt_missing))
        print(f"  LOCKED TEST: {'PASS' if locked_test_pass else 'FAIL'}")

        phys_results["locked_test"] = {
            "cleanable_total": len(lt_cleanable),
            "cleanable_deleted": cleanable_deleted,
            "locked_total": len(lt_locked),
            "locked_remain": locked_remain,
            "missing_total": len(lt_missing),
            "missing_still_missing": missing_still_missing,
            "pass": locked_test_pass,
        }
        results["physical"] = phys_results

        # Recycle Bin verification
        print("\n  --- RECYCLE BIN VERIFICATION ---")
        rb_after_count, rb_after_bytes = fixture_mgr.count_recycle_bin_items()
        rb_cleaned = max(0, rb_before_count - rb_after_count)
        rb_bytes_cleaned = max(0, rb_before_bytes - rb_after_bytes)
        print(f"  before: {rb_before_count} items, {rb_before_bytes} bytes")
        print(f"  after: {rb_after_count} items, {rb_after_bytes} bytes")
        print(f"  cleaned: {rb_cleaned} items, {rb_bytes_cleaned} bytes")
        results["rb_after_count"] = rb_after_count
        results["rb_after_bytes"] = rb_after_bytes
        results["rb_cleaned"] = rb_cleaned
        results["rb_bytes_cleaned"] = rb_bytes_cleaned

        # ── Phase 6: Second scan ───────────────────────────────────
        print("\n" + "=" * 70)
        print("PHASE 6: SECOND SCAN (verify cleaned files don't return)")
        print("=" * 70)

        t0 = time.time()
        scan2_result = run_scan_and_wait(client)
        scan2_time = time.time() - t0
        results["scan2_time"] = scan2_time
        results["scan2_findings"] = scan2_result.get("findings_count", 0)
        results["scan2_assets"] = scan2_result.get("statistics", {}).get("assets_discovered", 0)
        print(f"\n  [scan2] Completed in {scan2_time:.1f}s")
        print(f"  findings: {results['scan2_findings']} (was {results['scan1_findings']} in scan 1)")
        print(f"  assets: {results['scan2_assets']} (was {results['scan1_assets']} in scan 1)")

        # ── Phase 7: Summary ───────────────────────────────────────
        print("\n" + "=" * 70)
        print("PHASE 7: FINAL SUMMARY")
        print("=" * 70)

        total_time = startup_time + scan_time + optimize_time + scan2_time
        print(f"  Backend startup:  {startup_time:.1f}s")
        print(f"  Scan 1:           {scan_time:.1f}s")
        print(f"  Optimize:         {optimize_time:.1f}s")
        print(f"  Scan 2:           {scan2_time:.1f}s")
        print(f"  Total:            {total_time:.1f}s")
        print(f"\n  ACCOUNTING: Detected={detected} Cleaned={cleaned} Failed={failed} Remaining={remaining}")
        print(f"  Equation: {detected} = {cleaned} + {failed} + {remaining} = {cleaned+failed+remaining} [{'PASS' if accounting_check else 'FAIL'}]")
        print(f"  Space recovered: {space_recovered} bytes ({space_recovered/1024/1024:.2f} MB)")
        print(f"  Health: {health_before} -> {health_after}")
        print(f"  Recycle Bin: {rb_before_count} -> {rb_after_count} (cleaned {rb_cleaned})")

        print(f"\n  PHYSICAL VERIFICATION:")
        all_phys_pass = True
        for cat, pr in phys_results.items():
            if isinstance(pr, dict) and "status" in pr:
                print(f"    {cat}: {pr['status']}")
                if pr["status"] != "VERIFIED":
                    all_phys_pass = False
            elif isinstance(pr, dict) and "pass" in pr:
                print(f"    {cat}: {'PASS' if pr['pass'] else 'FAIL'}")
                if not pr["pass"]:
                    all_phys_pass = False
        print(f"  ALL PHYSICAL: {'PASS' if all_phys_pass else 'FAIL'}")

        results["all_physical_pass"] = all_phys_pass
        results["total_time"] = total_time

    except Exception as e:
        print(f"\nFATAL ERROR: {e}")
        traceback.print_exc()
    finally:
        print("\n[cleanup] Removing test fixtures ...")
        fixture_mgr.cleanup()
        client.stop()
        print("[cleanup] Done")

    results_file = Path("e2e_accounting_results.json")
    with open(results_file, "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nResults written to {results_file}")


if __name__ == "__main__":
    run_e2e_audit()
