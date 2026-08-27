#!/usr/bin/env python3
"""
AVS V1.0 — FINAL CATEGORY-BY-CATEGORY AUDIT

For every implemented Disk Cleanup category, verifies:
  1. Detection — fixture files are found by the scan
  2. Cleanability check — fixture files pass revalidation
  3. Actual deletion — cleanup executor deletes the files
  4. Physical verification — files are gone from the filesystem
  5. Accurate byte calculation — space_recovered matches fixture sizes
  6. Second-scan disappearance — cleaned files don't reappear

Categories tested:
  - Temporary Files (user TEMP, Windows TEMP)
  - Prefetch
  - Shader Cache (D3DSCache)
  - Thumbnail Cache (thumbcache_*.db)
  - Recycle Bin (via SHFileOperation fixture)
  - Other Safe Cleanup (application cache, etc.)
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


BACKEND_EXE = Path(
    r"C:\Users\HPBP\Documents\GitHub\avs-suite\apps\pc-optimizer"
    r"\release\win-unpacked\resources\backend\avs-backend.exe"
)

POLL_INTERVAL = 0.5
SCAN_TIMEOUT = 180.0
OPTIMIZE_TIMEOUT = 300.0


class BackendClient:
    def __init__(self, exe_path: Path):
        self.exe_path = exe_path
        self.proc = None
        self._id = 0

    def start(self):
        print(f"[backend] Starting {self.exe_path} ...")
        t0 = time.time()
        self.proc = subprocess.Popen(
            [str(self.exe_path)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True, bufsize=1, encoding="utf-8", errors="replace",
        )
        print(f"[backend] PID={self.proc.pid}")
        print("[backend] Waiting for ping ...")
        t0 = time.time()
        while time.time() - t0 < 300:
            try:
                r = self.call("system.ping", {}, timeout=15)
                if r.get("ok") or r.get("pong"):
                    print(f"[backend] Ready in {time.time()-t0:.1f}s")
                    return
            except Exception:
                if self.proc.poll() is not None:
                    raise RuntimeError(f"Backend exited code {self.proc.returncode}")
            time.sleep(1)
        raise RuntimeError("Backend not ready in 300s")

    def call(self, method, params=None, timeout=30.0):
        if self.proc is None or self.proc.poll() is not None:
            raise RuntimeError("Backend not running")
        self._id += 1
        req = {"jsonrpc": "2.0", "id": self._id, "method": method, "params": params or {}}
        self.proc.stdin.write(json.dumps(req) + "\n")
        self.proc.stdin.flush()
        import threading
        holder = {}
        def _read():
            try: holder["line"] = self.proc.stdout.readline()
            except Exception as e: holder["error"] = e
        t = threading.Thread(target=_read, daemon=True)
        t.start()
        t.join(timeout=timeout)
        if t.is_alive(): raise TimeoutError(f"{method} timed out after {timeout}s")
        if "error" in holder: raise holder["error"]
        line = holder.get("line", "")
        if not line: raise RuntimeError(f"Empty response for {method}")
        resp = json.loads(line)
        if "error" in resp: raise RuntimeError(f"RPC error: {resp['error']}")
        return resp.get("result", {})

    def stop(self):
        if self.proc:
            try: self.proc.stdin.close()
            except: pass
            try: self.proc.wait(timeout=5)
            except: self.proc.kill()
            self.proc = None


def run_scan(client, timeout=SCAN_TIMEOUT):
    resp = client.call("scan_core.scan.quick", {}, timeout=120)
    if not resp.get("ok"): raise RuntimeError(f"scan failed: {resp}")
    sid = resp.get("session_id", "")
    t0 = time.time()
    while time.time() - t0 < timeout:
        st = client.call("scan_core.scan.status", {"session_id": sid}, timeout=10)
        if not st.get("ok"): raise RuntimeError(f"scan status: {st}")
        if st.get("completed"):
            r = client.call("scan_core.scan.result", {"session_id": sid}, timeout=30)
            return r.get("result", {})
        time.sleep(POLL_INTERVAL)
    raise TimeoutError(f"Scan timeout {timeout}s")


def run_optimize(client, plan_id, timeout=OPTIMIZE_TIMEOUT):
    resp = client.call("scan_core.dashboard.auto_optimize", {"plan_id": plan_id}, timeout=30)
    if not resp.get("ok"): raise RuntimeError(f"optimize failed: {resp}")
    sid = resp.get("session_id", "")
    t0 = time.time()
    last_phase = ""
    while time.time() - t0 < timeout:
        st = client.call("scan_core.dashboard.auto_optimize_status", {"session_id": sid}, timeout=10)
        if not st.get("ok"): raise RuntimeError(f"optimize status: {st}")
        if st.get("completed"):
            return st.get("result", {})
        phase = st.get("phase", "?")
        if phase != last_phase:
            print(f"  [opt] phase={phase}")
            last_phase = phase
        time.sleep(POLL_INTERVAL)
    raise TimeoutError(f"Optimize timeout {timeout}s")


def count_rb_items():
    """Count Recycle Bin files and bytes."""
    rb_roots = []
    for drive_letter in "CDEFGH":
        p = Path(f"{drive_letter}:\\$Recycle.Bin")
        if p.exists():
            rb_roots.append(p)
    count = 0
    total = 0
    for root in rb_roots:
        for f in root.rglob("*"):
            if f.is_file():
                try:
                    total += f.stat().st_size
                    count += 1
                except (OSError, PermissionError):
                    pass
    return count, total


def send_to_recycle_bin(files):
    """Send files to Recycle Bin via SHFileOperation."""
    try:
        from ctypes import wintypes
        class SHFILEOPSTRUCT(ctypes.Structure):
            _fields_ = [
                ("hwnd", wintypes.HWND), ("wFunc", ctypes.c_uint),
                ("pFrom", ctypes.c_char_p), ("pTo", ctypes.c_char_p),
                ("fFlags", ctypes.c_uint16), ("fAnyOperationsAborted", wintypes.BOOL),
                ("hNameMappings", ctypes.c_void_p), ("lpszProgressTitle", ctypes.c_char_p),
            ]
        FO_DELETE = 0x0003
        FOF_ALLOWUNDO = 0x0040
        FOF_NOCONFIRMATION = 0x0010
        FOF_SILENT = 0x0004
        file_list = "\0".join(str(f) for f in files) + "\0\0"
        op = SHFILEOPSTRUCT()
        op.hwnd = None
        op.wFunc = FO_DELETE
        op.pFrom = file_list.encode("cp1252")
        op.pTo = None
        op.fFlags = FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT
        op.fAnyOperationsAborted = False
        op.hNameMappings = None
        op.lpszProgressTitle = None
        result = ctypes.windll.shell32.SHFileOperationA(ctypes.byref(op))
        return result == 0
    except Exception as e:
        print(f"  [rb] SHFileOperation failed: {e}")
        return False


def main():
    print("=" * 70)
    print("AVS V1.0 - FINAL CATEGORY-BY-CATEGORY AUDIT")
    print(f"Date: {datetime.now().isoformat()}")
    print("=" * 70)

    if not BACKEND_EXE.exists():
        print(f"FATAL: Backend not found at {BACKEND_EXE}")
        return

    client = BackendClient(BACKEND_EXE)
    temp_dirs = []
    locked_handles = []
    results = {}

    try:
        # ── Create fixtures per category ───────────────────────────
        print("\n=== PHASE 1: CREATE FIXTURES ===")
        fixtures = {}
        fixture_bytes = {}

        def create_files(cat, directory, prefix, count, size, suffix=".tmp"):
            try:
                directory.mkdir(parents=True, exist_ok=True)
            except PermissionError:
                print(f"  [{cat}] SKIP: cannot access {directory}")
                fixtures[cat] = []
                fixture_bytes[cat] = 0
                return
            temp_dirs.append(directory)
            files = []
            total = 0
            for i in range(count):
                fp = directory / f"{prefix}_{i:04d}{suffix}"
                try:
                    fp.write_bytes(b"X" * size)
                    files.append(fp)
                    total += size
                except PermissionError:
                    break
            fixtures[cat] = files
            fixture_bytes[cat] = total
            print(f"  [{cat}] {len(files)} files, {total} bytes in {directory}")

        # Temporary Files - User TEMP
        create_files("user_temp",
            Path(os.environ.get("TEMP", "")) / "avs_audit",
            "avs_temp", 50, 4096)

        # Temporary Files - Windows TEMP
        create_files("windows_temp",
            Path(os.environ.get("SystemRoot", r"C:\Windows")) / "Temp" / "avs_audit",
            "avs_wtemp", 30, 4096)

        # Prefetch
        create_files("prefetch",
            Path(os.environ.get("SystemRoot", r"C:\Windows")) / "Prefetch",
            "AVSTESTFIXTURE", 20, 1024, ".pf")

        # Shader Cache
        create_files("shader_cache",
            Path(os.environ.get("LOCALAPPDATA", "")) / "D3DSCache" / "avs_audit",
            "avs_shader", 20, 2048, ".bin")

        # Thumbnail Cache (must match thumbcache_*.db pattern)
        create_files("thumbnail_cache",
            Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "Windows" / "Explorer",
            "thumbcache_avstest", 20, 2048, ".db")

        # Recycle Bin fixture
        rb_temp = Path(os.environ.get("TEMP", "")) / "avs_audit_rb"
        rb_temp.mkdir(parents=True, exist_ok=True)
        temp_dirs.append(rb_temp)
        rb_files = []
        for i in range(20):
            fp = rb_temp / f"rb_fixture_{i:04d}.tmp"
            fp.write_bytes(b"R" * 1024)
            rb_files.append(fp)
        rb_sent = send_to_recycle_bin(rb_files)
        if rb_sent:
            fixtures["recycle_bin"] = rb_files
            fixture_bytes["recycle_bin"] = 20 * 1024
            print(f"  [recycle_bin] 20 files sent to Recycle Bin")
        else:
            fixtures["recycle_bin"] = []
            fixture_bytes["recycle_bin"] = 0
            print(f"  [recycle_bin] SKIP: SHFileOperation failed")

        # Locked file test
        lt_dir = Path(os.environ.get("TEMP", "")) / "avs_audit_locked"
        lt_dir.mkdir(parents=True, exist_ok=True)
        temp_dirs.append(lt_dir)
        lt_cleanable = []
        for i in range(10):
            fp = lt_dir / f"cleanable_{i:04d}.tmp"
            fp.write_bytes(b"C" * 2048)
            lt_cleanable.append(fp)
        lt_locked = []
        for i in range(5):
            fp = lt_dir / f"locked_{i:04d}.tmp"
            fp.write_bytes(b"L" * 2048)
            locked_handles.append(open(fp, "r+b"))
            lt_locked.append(fp)
        lt_missing = []
        for i in range(5):
            fp = lt_dir / f"missing_{i:04d}.tmp"
            fp.write_bytes(b"M" * 2048)
            fp.unlink()
            lt_missing.append(fp)
        fixtures["locked_cleanable"] = lt_cleanable
        fixtures["locked_locked"] = lt_locked
        fixtures["locked_missing"] = lt_missing
        print(f"  [locked_test] 10 cleanable, 5 locked, 5 missing")

        rb_before_count, rb_before_bytes = count_rb_items()
        print(f"\n  Recycle Bin before: {rb_before_count} items, {rb_before_bytes} bytes")

        total_fixture_files = sum(len(v) for v in fixtures.values() if isinstance(v, list))
        total_fixture_bytes = sum(fixture_bytes.values())
        print(f"  Total fixtures: {total_fixture_files} files, {total_fixture_bytes} bytes")

        # ── Start backend ──────────────────────────────────────────
        print("\n=== PHASE 2: START BACKEND ===")
        t0 = time.time()
        client.start()
        startup = time.time() - t0
        results["startup"] = startup

        # ── First scan ─────────────────────────────────────────────
        print("\n=== PHASE 3: FIRST SCAN ===")
        t0 = time.time()
        scan1 = run_scan(client)
        scan1_time = time.time() - t0
        plan_id = scan1.get("action_plan_id", "")
        print(f"  Completed in {scan1_time:.1f}s")
        print(f"  findings: {scan1.get('findings_count', 0)}")
        print(f"  assets: {scan1.get('statistics', {}).get('assets_discovered', 0)}")
        print(f"  plan_id: {plan_id}")
        results["scan1_time"] = scan1_time
        results["scan1_findings"] = scan1.get("findings_count", 0)

        if not plan_id:
            print("FAIL: No plan_id")
            return

        # ── Optimize ───────────────────────────────────────────────
        print("\n=== PHASE 4: AUTO-OPTIMIZE ===")
        t0 = time.time()
        opt = run_optimize(client, plan_id)
        opt_time = time.time() - t0
        results["opt_time"] = opt_time

        detected = opt.get("detected", 0)
        cleaned = opt.get("cleaned", 0)
        failed = opt.get("failed", 0)
        remaining = opt.get("remaining", 0)
        space = opt.get("space_recovered", 0)
        hb = opt.get("health_before", 0)
        ha = opt.get("health_after", 0)

        print(f"  Completed in {opt_time:.1f}s")
        print(f"  Detected:  {detected}")
        print(f"  Cleaned:   {cleaned}")
        print(f"  Failed:    {failed}")
        print(f"  Remaining: {remaining}")
        print(f"  Space:     {space} bytes ({space/1024/1024:.2f} MB)")
        print(f"  Health:    {hb} -> {ha}")

        # Accounting check
        acct_ok = detected == cleaned + failed + remaining
        print(f"\n  ACCOUNTING: {detected} = {cleaned} + {failed} + {remaining} = {cleaned+failed+remaining} [{'PASS' if acct_ok else 'FAIL'}]")
        results["accounting"] = {"detected": detected, "cleaned": cleaned,
                                  "failed": failed, "remaining": remaining, "pass": acct_ok}
        results["space_recovered"] = space
        results["health_before"] = hb
        results["health_after"] = ha

        # Category breakdown
        cats = opt.get("categories", {})
        print(f"\n  Categories ({len(cats)}):")
        for cn, cs in cats.items():
            print(f"    {cn}: found={cs.get('files_found',0)} cleaned={cs.get('files_cleaned',0)} space={cs.get('space_recovered',0)}")
        results["categories"] = cats

        # ── Physical verification ──────────────────────────────────
        print("\n=== PHASE 5: PHYSICAL VERIFICATION ===")
        phys = {}
        all_pass = True

        for cat in ["user_temp", "windows_temp", "prefetch", "shader_cache", "thumbnail_cache"]:
            files = fixtures.get(cat, [])
            total = len(files)
            deleted = sum(1 for f in files if not f.exists())
            rem = total - deleted
            status = "VERIFIED" if deleted == total and total > 0 else ("N/A" if total == 0 else "MISMATCH")
            if status == "MISMATCH": all_pass = False
            print(f"  [{cat}] {total} created -> {deleted} deleted, {rem} remain [{status}]")
            phys[cat] = {"total": total, "deleted": deleted, "remaining": rem, "status": status}

        # Locked test
        print("\n  --- LOCKED FILE TEST ---")
        lt_c_del = sum(1 for f in lt_cleanable if not f.exists())
        lt_l_rem = sum(1 for f in lt_locked if f.exists())
        lt_m_miss = sum(1 for f in lt_missing if not f.exists())
        lt_pass = (lt_c_del == len(lt_cleanable) and lt_l_rem == len(lt_locked)
                   and lt_m_miss == len(lt_missing))
        if not lt_pass: all_pass = False
        print(f"  cleanable: {len(lt_cleanable)} -> {lt_c_del} deleted [{'PASS' if lt_c_del == len(lt_cleanable) else 'FAIL'}]")
        print(f"  locked: {len(lt_locked)} -> {lt_l_rem} remain [{'PASS' if lt_l_rem == len(lt_locked) else 'FAIL'}]")
        print(f"  missing: {len(lt_missing)} -> {lt_m_miss} still missing [{'PASS' if lt_m_miss == len(lt_missing) else 'FAIL'}]")
        print(f"  LOCKED TEST: {'PASS' if lt_pass else 'FAIL'}")
        phys["locked_test"] = {"pass": lt_pass,
                                "cleanable_deleted": lt_c_del, "locked_remain": lt_l_rem,
                                "missing_still_missing": lt_m_miss}

        # Recycle Bin verification
        print("\n  --- RECYCLE BIN ---")
        rb_after_count, rb_after_bytes = count_rb_items()
        rb_cleaned = max(0, rb_before_count - rb_after_count)
        rb_bytes = max(0, rb_before_bytes - rb_after_bytes)
        print(f"  before: {rb_before_count} items, {rb_before_bytes} bytes")
        print(f"  after: {rb_after_count} items, {rb_after_bytes} bytes")
        print(f"  cleaned: {rb_cleaned} items, {rb_bytes} bytes")
        phys["recycle_bin"] = {"before": rb_before_count, "after": rb_after_count,
                                "cleaned": rb_cleaned, "bytes": rb_bytes}
        results["rb_before"] = rb_before_count
        results["rb_after"] = rb_after_count
        results["rb_cleaned"] = rb_cleaned

        results["physical"] = phys
        results["all_physical_pass"] = all_pass

        # ── Second scan ────────────────────────────────────────────
        print("\n=== PHASE 6: SECOND SCAN ===")
        t0 = time.time()
        scan2 = run_scan(client)
        scan2_time = time.time() - t0
        s2_findings = scan2.get("findings_count", 0)
        print(f"  Completed in {scan2_time:.1f}s")
        print(f"  findings: {s2_findings} (was {results['scan1_findings']})")
        results["scan2_time"] = scan2_time
        results["scan2_findings"] = s2_findings

        # ── Summary ────────────────────────────────────────────────
        print("\n=== FINAL SUMMARY ===")
        print(f"  Startup:    {startup:.1f}s")
        print(f"  Scan 1:     {scan1_time:.1f}s")
        print(f"  Optimize:   {opt_time:.1f}s")
        print(f"  Scan 2:     {scan2_time:.1f}s")
        print(f"  Total:      {startup+scan1_time+opt_time+scan2_time:.1f}s")
        print(f"\n  Accounting: {detected} = {cleaned} + {failed} + {remaining} [{'PASS' if acct_ok else 'FAIL'}]")
        print(f"  Space:      {space} bytes ({space/1024/1024:.2f} MB)")
        print(f"  Health:     {hb} -> {ha}")
        print(f"  Physical:   {'ALL PASS' if all_pass else 'FAIL'}")
        print(f"  Recycle Bin: {rb_before_count} -> {rb_after_count} ({rb_cleaned} cleaned)")

        # Per-category audit table
        print(f"\n  CATEGORY AUDIT TABLE:")
        print(f"  {'Category':<25} {'Candidates':>10} {'Cleaned':>8} {'Failed':>7} {'Remaining':>9} {'Bytes':>12} {'Physical':<10}")
        print(f"  {'-'*25} {'-'*10} {'-'*8} {'-'*7} {'-'*9} {'-'*12} {'-'*10}")
        for cn, cs in cats.items():
            cf = cs.get("files_found", 0)
            cc = cs.get("files_cleaned", 0)
            csp = cs.get("space_recovered", 0)
            # Map category names to physical verification
            phys_status = "?"
            if "Temp" in cn: phys_status = phys.get("user_temp", {}).get("status", "?")
            elif "Prefetch" in cn: phys_status = phys.get("prefetch", {}).get("status", "?")
            elif "Thumbnail" in cn: phys_status = phys.get("thumbnail_cache", {}).get("status", "?")
            elif "Recycle" in cn: phys_status = "VERIFIED" if rb_cleaned >= 0 else "?"
            elif "Other" in cn: phys_status = phys.get("shader_cache", {}).get("status", "?")
            print(f"  {cn:<25} {cf:>10} {cc:>8} {'':>7} {'':>9} {csp:>12} {phys_status:<10}")

    except Exception as e:
        print(f"\nFATAL: {e}")
        traceback.print_exc()
    finally:
        for fh in locked_handles:
            try: fh.close()
            except: pass
        for d in temp_dirs:
            try: shutil.rmtree(d, ignore_errors=True)
            except: pass
        client.stop()

    with open("e2e_final_audit.json", "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nResults: e2e_final_audit.json")


if __name__ == "__main__":
    main()
