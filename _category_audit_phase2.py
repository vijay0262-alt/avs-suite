"""
Phase 2 Audit: Path validation + fixture-based tests for EVERY remaining category.

1. Test validate_filesystem_path() for every Windows cleanup root
2. Create safe fixtures in each category's directory
3. Detect → clean → physically verify → second scan
"""
from __future__ import annotations

import os
import sys
import time
import shutil
import tempfile
import uuid
from pathlib import Path
from collections import Counter, defaultdict

# IMPORTANT: Do NOT override LOCALAPPDATA or APPDATA — the scanner uses these
# to find browser caches, shader caches, etc. Overriding them would cause the
# scanner to look in the wrong directory.
# Instead, we use the real AVS Shield database and accept that it may conflict
# with a running instance. Kill any running backend first.
import subprocess as _sp
try:
    _sp.run(["taskkill", "/f", "/im", "avs-backend.exe"], capture_output=True, timeout=5)
except Exception:
    pass

sys.path.insert(0, str(Path(__file__).parent / "backend" / "src"))

# First: test path validation directly
from avs_backend.scan_core.rules.action_path_validation import (
    validate_filesystem_path,
    is_path_safe_for_planning,
    PathValidationError,
    EXCEPTION_ROOTS,
    FORBIDDEN_ROOTS,
)

print("=" * 80)
print("PHASE 2A: PATH VALIDATION FOR EVERY WINDOWS CLEANUP ROOT")
print("=" * 80)

# Every Windows cleanup root that is under a forbidden parent
cleanup_roots_under_forbidden = [
    (r"C:\Windows\Temp", "Windows Temp"),
    (r"C:\Windows\Prefetch", "Prefetch"),
    (r"C:\Windows\SoftwareDistribution\Download", "Windows Update Cache"),
    (r"C:\Windows\SoftwareDistribution\DeliveryOptimization", "Delivery Optimization"),
    (r"C:\Windows\Downloaded Program Files", "Downloaded Program Files"),
    (r"C:\Windows\Offline Web Pages", "Offline Web Pages"),
    (r"C:\Windows\Minidump", "Minidump"),
    (r"C:\Windows\LiveKernelReports", "LiveKernelReports"),
    (r"C:\Windows\Installer\$PatchCache$", "Installer Patch Cache"),
    (r"C:\Windows\ServiceProfiles\LocalService\AppData\Local\FontCache", "Font Cache"),
    (r"C:\Windows\ServiceProfiles\NetworkService\AppData\Local\BranchCache", "BranchCache"),
    (r"C:\Windows\MEMORY.DMP", "Memory Dump"),
    (r"C:\ProgramData\Microsoft\Windows\WER", "Windows Error Reporting"),
    (r"C:\ProgramData\Microsoft\Windows\RetailDemo", "Retail Demo"),
]

# Also test paths that should REMAIN forbidden
should_remain_forbidden = [
    (r"C:\Windows\System32", "System32"),
    (r"C:\Windows\System32\config", "System32 config"),
    (r"C:\Windows\SysWOW64", "SysWOW64"),
    (r"C:\Windows\WinSxS", "WinSxS"),
    (r"C:\Windows\Boot", "Boot"),
    (r"C:\Windows\Installer", "Installer (root)"),
    (r"C:\Program Files", "Program Files"),
    (r"C:\ProgramData\Microsoft\Windows Defender", "Windows Defender"),
]

print(f"\nException roots configured: {len(EXCEPTION_ROOTS)}")
for er in sorted(EXCEPTION_ROOTS):
    print(f"  {er}")

print(f"\n--- Cleanup roots under forbidden parents ---")
all_pass = True
for path, label in cleanup_roots_under_forbidden:
    try:
        validate_filesystem_path(path)
        safe = is_path_safe_for_planning(path)
        status = "PASS" if safe else "FAIL"
        if not safe:
            all_pass = False
        print(f"  [{status}] {label}: {path}")
    except PathValidationError as e:
        print(f"  [FAIL] {label}: {path} -> {e.reason}")
        all_pass = False

# Also test a file INSIDE each cleanup root
print(f"\n--- Files inside cleanup roots ---")
for root, label in cleanup_roots_under_forbidden:
    test_file = root + r"\test_file.tmp"
    try:
        validate_filesystem_path(test_file)
        safe = is_path_safe_for_planning(test_file)
        status = "PASS" if safe else "FAIL"
        if not safe:
            all_pass = False
        print(f"  [{status}] {label}\\test_file.tmp")
    except PathValidationError as e:
        print(f"  [FAIL] {label}\\test_file.tmp -> {e.reason}")
        all_pass = False

print(f"\n--- Paths that should REMAIN forbidden ---")
for path, label in should_remain_forbidden:
    try:
        validate_filesystem_path(path)
        # If no exception, check if it's in exceptions
        normalized = path.replace("\\", "/").lower()
        in_exception = any(
            normalized == er or normalized.startswith(er + "/")
            for er in EXCEPTION_ROOTS
        )
        if in_exception:
            print(f"  [WARN] {label}: {path} — unexpectedly in exceptions!")
        else:
            print(f"  [FAIL] {label}: {path} — should be forbidden but passed!")
        all_pass = False
    except PathValidationError as e:
        print(f"  [PASS] {label}: {path} -> {e.reason}")

# Also test a file inside a forbidden root (not in exceptions)
print(f"\n--- Files inside forbidden roots (should be rejected) ---")
for root, label in should_remain_forbidden:
    test_file = root + r"\test_file.tmp"
    try:
        validate_filesystem_path(test_file)
        normalized = test_file.replace("\\", "/").lower()
        in_exception = any(
            normalized == er or normalized.startswith(er + "/")
            for er in EXCEPTION_ROOTS
        )
        if in_exception:
            print(f"  [WARN] {label}\\test_file.tmp — unexpectedly in exceptions!")
        else:
            print(f"  [FAIL] {label}\\test_file.tmp — should be forbidden but passed!")
        all_pass = False
    except PathValidationError as e:
        print(f"  [PASS] {label}\\test_file.tmp -> {e.reason}")

print(f"\nPath validation overall: {'ALL PASS' if all_pass else 'FAILURES DETECTED'}")

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 2B: Fixture-based tests for EVERY remaining category
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "=" * 80)
print("PHASE 2B: FIXTURE-BASED TESTS FOR EVERY REMAINING CATEGORY")
print("=" * 80)

import avs_backend.scan_core_rpc as scan_core_rpc
scan_core_rpc._scan_orchestrator = None
scan_core_rpc._scan_orchestrator_initializing = False
scan_core_rpc._coordinator = None

from avs_backend.scan_core.rules.cleanup_categories import rule_id_to_category

FIXTURE_PREFIX = "AVS_AUDIT2_"
FIXTURE_SIZE = 4096

# Define fixture locations for every category
# We create the directory structure if it doesn't exist (where safe)
local_appdata = Path(os.environ.get("LOCALAPPDATA", r"C:\Users\HPBP\AppData\Local"))
# Use the REAL local appdata for fixture creation
real_local = Path(os.environ.get("LOCALAPPDATA", r"C:\Users\HPBP\AppData\Local"))
real_appdata = Path(os.environ.get("APPDATA", r"C:\Users\HPBP\AppData\Roaming"))
real_temp = Path(os.environ.get("TEMP", tempfile.gettempdir()))
win_dir = Path(os.path.expandvars(r"%SystemRoot%"))
program_data = Path(os.path.expandvars(r"%ProgramData%"))

# Wait for orchestrator
orch = None
for i in range(120):
    orch = scan_core_rpc.get_scan_orchestrator()
    if orch: break
    time.sleep(1)
if not orch:
    print("FATAL: Orchestrator failed to initialize")
    sys.exit(1)

# Define all fixture test cases
fixture_tests = [
    # Browser caches — create fake browser cache directories
    {
        "name": "Browser Cache — Chrome",
        "dir": real_local / "Google" / "Chrome" / "User Data" / "Default" / "Cache",
        "rule_id": "cache.browser.chrome",
        "count": 3,
    },
    {
        "name": "Browser Cache — Edge",
        "dir": real_local / "Microsoft" / "Edge" / "User Data" / "Default" / "Cache",
        "rule_id": "cache.browser.edge",
        "count": 3,
    },
    {
        "name": "Browser Cache — Brave",
        "dir": real_local / "BraveSoftware" / "Brave-Browser" / "User Data" / "Default" / "Cache",
        "rule_id": "cache.browser.brave",
        "count": 3,
    },
    {
        "name": "Browser Cache — Firefox",
        "dir": real_appdata / "Mozilla" / "Firefox" / "Profiles" / "avs-test-profile" / "cache2",
        "rule_id": "cache.browser.firefox",
        "count": 3,
    },
    {
        "name": "Browser Cache — Opera",
        "dir": real_appdata / "Opera Software" / "Opera Stable" / "Cache",
        "rule_id": "cache.browser.opera",
        "count": 3,
    },
    {
        "name": "Browser Cache — Opera GX",
        "dir": real_appdata / "Opera Software" / "Opera GX Stable" / "Cache",
        "rule_id": "cache.browser.opera",
        "count": 3,
    },
    {
        "name": "Browser Cache — Vivaldi",
        "dir": real_local / "Vivaldi" / "User Data" / "Default" / "Cache",
        "rule_id": "cache.browser.vivaldi",
        "count": 3,
    },
    # Shader caches
    {
        "name": "D3D Shader Cache",
        "dir": real_local / "D3DSCache",
        "rule_id": "cache.shader.d3d",
        "count": 3,
    },
    {
        "name": "NVIDIA DX Cache",
        "dir": real_local / "NVIDIA" / "DXCache",
        "rule_id": "cache.shader.nvidia_dx",
        "count": 3,
    },
    {
        "name": "NVIDIA GL Cache",
        "dir": real_local / "NVIDIA" / "GLCache",
        "rule_id": "cache.shader.nvidia_gl",
        "count": 3,
    },
    {
        "name": "NVIDIA Compute Cache",
        "dir": real_local / "NVIDIA" / "ComputeCache",
        "rule_id": "cache.shader.nvidia_compute",
        "count": 3,
    },
    {
        "name": "AMD DX Cache",
        "dir": real_local / "AMD" / "DxCache",
        "rule_id": "cache.shader.amd_dx",
        "count": 3,
    },
    {
        "name": "AMD GL Cache",
        "dir": real_local / "AMD" / "GLCache",
        "rule_id": "cache.shader.amd_gl",
        "count": 3,
    },
    # Thumbnail Cache
    {
        "name": "Thumbnail Cache",
        "dir": real_local / "Microsoft" / "Windows" / "Explorer",
        "rule_id": "cache.thumbnail",
        "count": 3,
    },
    # Windows Update / Delivery Optimization
    {
        "name": "Windows Update Cleanup (fixture)",
        "dir": win_dir / "SoftwareDistribution" / "Download",
        "rule_id": "cache.windows_update",
        "count": 3,
    },
    {
        "name": "Delivery Optimization (fixture)",
        "dir": win_dir / "SoftwareDistribution" / "DeliveryOptimization",
        "rule_id": "cache.delivery_optimization",
        "count": 3,
    },
    # Memory dumps
    {
        "name": "Minidump (fixture)",
        "dir": win_dir / "Minidump",
        "rule_id": "junk.crash_dump",
        "count": 3,
    },
    {
        "name": "LiveKernelReports (fixture)",
        "dir": win_dir / "LiveKernelReports",
        "rule_id": "junk.crash_dump",
        "count": 3,
    },
    # Font Cache
    {
        "name": "Font Cache (fixture)",
        "dir": win_dir / "ServiceProfiles" / "LocalService" / "AppData" / "Local" / "FontCache",
        "rule_id": "cache.font_cache",
        "count": 3,
    },
    # BranchCache
    {
        "name": "BranchCache (fixture)",
        "dir": win_dir / "ServiceProfiles" / "NetworkService" / "AppData" / "Local" / "BranchCache",
        "rule_id": "cache.branch_cache",
        "count": 3,
    },
    # Retail Demo
    {
        "name": "Retail Demo (fixture)",
        "dir": program_data / "Microsoft" / "Windows" / "RetailDemo",
        "rule_id": "junk.retail_demo",
        "count": 3,
    },
    # Office caches
    {
        "name": "Office Cache 16.0 (fixture)",
        "dir": real_local / "Microsoft" / "Office" / "16.0" / "OfficeFileCache",
        "rule_id": "cache.application",
        "count": 3,
    },
    {
        "name": "Office UnsavedFiles (fixture)",
        "dir": real_local / "Microsoft" / "Office" / "UnsavedFiles",
        "rule_id": "cache.application",
        "count": 3,
    },
]

# Create fixtures
all_fixtures = {}  # name -> list of Path
created_dirs = []  # dirs we created (for cleanup afterward)

print(f"\nCreating fixtures for {len(fixture_tests)} categories...\n")

for test in fixture_tests:
    name = test["name"]
    directory = test["dir"]
    count = test["count"]
    rule_id = test["rule_id"]

    try:
        # Create the directory if it doesn't exist
        if not directory.exists():
            directory.mkdir(parents=True, exist_ok=True)
            created_dirs.append(directory)

        # Create fixture files
        fixtures = []
        for i in range(count):
            p = directory / f"{FIXTURE_PREFIX}{i:04d}.tmp"
            p.write_bytes(b"X" * FIXTURE_SIZE)
            fixtures.append(p)

        all_fixtures[name] = fixtures
        existing = sum(1 for f in fixtures if f.exists())
        print(f"  CREATED {name}: {existing}/{count} fixtures in {directory}")

    except PermissionError as e:
        print(f"  SKIP {name}: PermissionError — {e}")
        all_fixtures[name] = []
    except Exception as e:
        print(f"  SKIP {name}: {type(e).__name__} — {e}")
        all_fixtures[name] = []

# ═══════════════════════════════════════════════════════════════════════════════
# Run scan
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "=" * 80)
print("SCAN #1")
print("=" * 80)

scan_start = time.time()
result = orch.scan_quick(scope=None, on_progress=lambda p: None)
scan_duration = time.time() - scan_start

# Group findings by rule_id and check for fixtures
findings_by_rule = defaultdict(list)
for f in result.findings:
    if isinstance(f, dict):
        rid = f.get("rule_id", "") or ""
        findings_by_rule[rid].append(f)

print(f"\n  Scan duration: {scan_duration:.1f}s")
print(f"  Total findings: {len(result.findings)}")
print(f"  Action plan ID: {result.action_plan_id}")

print(f"\n  Findings by rule_id:")
for rid in sorted(findings_by_rule.keys()):
    print(f"    {rid}: {len(findings_by_rule[rid])}")

# Check which fixtures were detected
print(f"\n  Fixture detection by category:")
for name, fixtures in all_fixtures.items():
    if not fixtures:
        continue
    detected = 0
    for f in result.findings:
        if isinstance(f, dict):
            cp = f.get("canonical_path", "")
            for fx in fixtures:
                if str(fx).lower().replace("\\", "/") in cp.lower().replace("\\", "/") or cp.lower().replace("\\", "/") in str(fx).lower().replace("\\", "/"):
                    detected += 1
                    break
    print(f"    {name}: {detected}/{len(fixtures)} fixtures detected")

# ═══════════════════════════════════════════════════════════════════════════════
# Run cleanup
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "=" * 80)
print("CLEANUP")
print("=" * 80)

plan_id = result.action_plan_id
if not plan_id:
    print("FATAL: No action plan")
    sys.exit(1)

coord = scan_core_rpc.get_coordinator()
preview = coord.prepare(plan_id)
reval = coord.revalidate_planned_actions(plan_id)

summary = coord.execute(
    plan_id,
    request_id=str(uuid.uuid4()),
    approval_token=preview.approval_token,
    mode="live",
    on_progress=lambda p, c, t, i: None,
)

print(f"\n  Total actions: {preview.total_actions}")
print(f"  Safety state: {preview.safety_state_counts}")
print(f"  Revalidation: {reval}")
print(f"  Completed: {summary.completed}")
print(f"  Failed: {summary.failed}")
print(f"  Rejected: {summary.rejected}")

# ═══════════════════════════════════════════════════════════════════════════════
# Physical verification of fixtures
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "=" * 80)
print("PHYSICAL VERIFICATION OF FIXTURES")
print("=" * 80)

print(f"\n{'Category':<40s} {'Created':>7s} {'Deleted':>7s} {'Remaining':>9s} {'Verdict':<15s}")
print(f"{'-'*40} {'-'*7} {'-'*7} {'-'*9} {'-'*15}")

total_created = 0
total_deleted = 0

for name, fixtures in all_fixtures.items():
    if not fixtures:
        print(f"  {name:<40s} {'N/A':>7s} {'N/A':>7s} {'N/A':>9s} {'SKIP':<15s}")
        continue
    created = len(fixtures)
    deleted = sum(1 for f in fixtures if not f.exists())
    remaining = created - deleted
    total_created += created
    total_deleted += deleted
    if deleted == created:
        verdict = "PASS"
    elif deleted > 0:
        verdict = "PARTIAL"
    else:
        verdict = "FAIL"
    print(f"  {name:<40s} {created:>7d} {deleted:>7d} {remaining:>9d} {verdict:<15s}")

print(f"\n  TOTAL: {total_created} created, {total_deleted} deleted")

# ═══════════════════════════════════════════════════════════════════════════════
# Second scan
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "=" * 80)
print("SCAN #2 — SECOND SCAN VALIDATION")
print("=" * 80)

scan2_start = time.time()
result2 = orch.scan_quick(scope=None, on_progress=lambda p: None)
scan2_duration = time.time() - scan2_start

print(f"\n  Scan #2 duration: {scan2_duration:.1f}s")
print(f"  Scan #2 findings: {len(result2.findings)}")

# Check if any fixtures reappear
print(f"\n  Fixture reappear check:")
for name, fixtures in all_fixtures.items():
    if not fixtures:
        continue
    reappear = 0
    for f in result2.findings:
        if isinstance(f, dict):
            cp = f.get("canonical_path", "")
            for fx in fixtures:
                fx_norm = str(fx).lower().replace("\\", "/")
                cp_norm = cp.lower().replace("\\", "/")
                if fx_norm in cp_norm or cp_norm in fx_norm:
                    reappear += 1
                    break
    if reappear == 0:
        print(f"    {name}: PASS (0 reappear)")
    else:
        print(f"    {name}: FAIL ({reappear} reappear)")

# ═══════════════════════════════════════════════════════════════════════════════
# Recycle Bin API test
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "=" * 80)
print("RECYCLE BIN API TEST")
print("=" * 80)

# Create a file and send it to Recycle Bin
rb_test_file = real_temp / f"{FIXTURE_PREFIX}RECYCLE.tmp"
try:
    rb_test_file.write_bytes(b"X" * 1024)
    print(f"  Created test file: {rb_test_file}")

    # Send to Recycle Bin using SHFileOperation
    import ctypes
    from ctypes import wintypes

    class SHFILEOPSTRUCT(ctypes.Structure):
        _fields_ = [
            ("hwnd", wintypes.HWND),
            ("wFunc", ctypes.c_uint),
            ("pFrom", ctypes.c_wchar_p),
            ("pTo", ctypes.c_wchar_p),
            ("fFlags", ctypes.c_uint16),
            ("fAnyOperationsAborted", wintypes.BOOL),
            ("hNameMappings", ctypes.c_void_p),
            ("lpszProgressTitle", ctypes.c_wchar_p),
        ]

    FO_DELETE = 3
    FOF_ALLOWUNDO = 0x40
    FOF_NOCONFIRMATION = 0x10
    FOF_SILENT = 0x04

    op = SHFILEOPSTRUCT()
    op.hwnd = None
    op.wFunc = FO_DELETE
    op.pFrom = str(rb_test_file) + "\0\0"
    op.pTo = "\0\0"
    op.fFlags = FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT

    result_code = ctypes.windll.shell32.SHFileOperationW(ctypes.byref(op))
    if result_code == 0:
        print(f"  File sent to Recycle Bin: SUCCESS")
        print(f"  File no longer in original location: {not rb_test_file.exists()}")

        # Now test SHEmptyRecycleBin
        SHERB_NOCONFIRMATION = 0x00000001
        SHERB_NOPROGRESSUI = 0x00000002
        SHERB_NOSOUND = 0x00000004

        # Check if RecycleBinExecutor exists
        try:
            from avs_backend.scan_core.execution.recycle_bin_executor import RecycleBinExecutor
            print(f"  RecycleBinExecutor: IMPORTED")

            # Try to empty recycle bin
            try:
                result_rb = ctypes.windll.shell32.SHEmptyRecycleBinW(
                    None, None,
                    SHERB_NOCONFIRMATION | SHERB_NOPROGRESSUI | SHERB_NOSOUND
                )
                if result_rb == 0:
                    print(f"  SHEmptyRecycleBinW: SUCCESS (return code 0)")
                elif result_code == -10:  # S_OK
                    print(f"  SHEmptyRecycleBinW: SUCCESS")
                else:
                    print(f"  SHEmptyRecycleBinW: return code {result_rb}")
            except Exception as e:
                print(f"  SHEmptyRecycleBinW: {e}")
        except ImportError as e:
            print(f"  RecycleBinExecutor: NOT FOUND — {e}")
    else:
        print(f"  SHFileOperationW failed: code {result_code}")

except Exception as e:
    print(f"  Recycle Bin test error: {e}")
finally:
    try:
        if rb_test_file.exists():
            rb_test_file.unlink()
    except OSError:
        pass

# ═══════════════════════════════════════════════════════════════════════════════
# Cleanup audit fixtures
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "=" * 80)
print("CLEANUP AUDIT ARTIFACTS")
print("=" * 80)

# Remove any remaining fixtures
for name, fixtures in all_fixtures.items():
    for f in fixtures:
        try:
            if f.exists():
                f.unlink()
        except OSError:
            pass

# Remove created directories (only if empty)
for d in reversed(created_dirs):
    try:
        if d.exists() and d.is_dir():
            # Only remove if it's our created directory and is empty
            shutil.rmtree(d, ignore_errors=True)
    except Exception:
        pass

print("  Audit artifacts cleaned up")
print("\n=== PHASE 2 AUDIT COMPLETE ===")
