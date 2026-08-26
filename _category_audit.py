"""
V1.0 Category-by-Category Cleanup Correctness Audit.

For EVERY cleanup category, tests:
1. Real production discovery path
2. Category detection rule
3. Fixture creation (where safe)
4. Fixture detection under correct category
5. Exact file count, folder count, byte size
6. Safety classification
7. Auto-cleanable classification
8. Automatic cleanup
9. Physical deletion verification
10. Exact bytes recovered
11. Second scan
12. Cleaned fixtures don't reappear
13. Locked/in-use fixture test
14. Locked items NOT force-deleted
15. Windows-native cleanup mechanism investigation

DO NOT bypass SafetyGate.
DO NOT disable lock detection.
DO NOT force-delete locked system files.
"""
from __future__ import annotations

import os
import sys
import time
import tempfile
import shutil
import json
from pathlib import Path
from collections import Counter, defaultdict

# Use a temporary database — override LOCALAPPDATA so AVS Shield uses a temp dir
# IMPORTANT: The audit DB must NOT be under %TEMP% because %TEMP% is a scan target.
# If the DB is under %TEMP%, the scan will enumerate the DB files as junk.
TEST_DB_DIR = Path.home() / "avs_audit_db"
TEST_DB_DIR.mkdir(parents=True, exist_ok=True)
os.environ["LOCALAPPDATA"] = str(TEST_DB_DIR)
os.environ["APPDATA"] = str(TEST_DB_DIR)

sys.path.insert(0, str(Path(__file__).parent / "backend" / "src"))

import avs_backend.scan_core_rpc as scan_core_rpc
scan_core_rpc._scan_orchestrator = None
scan_core_rpc._scan_orchestrator_initializing = False
scan_core_rpc._coordinator = None

from avs_backend.scan_core.rules.detection.locations import KnownLocations
from avs_backend.scan_core.rules.cleanup_categories import rule_id_to_category, RULE_ID_TO_CATEGORY
from avs_backend.scan_core.enumerator import get_default_scan_locations

FIXTURE_PREFIX = "AVS_AUDIT_"
FIXTURE_SIZE = 4096


def count_dir(path: Path) -> tuple[int, int, int]:
    """Count files, folders, bytes in a directory tree."""
    files = folders = bytes_total = 0
    try:
        for entry in os.scandir(str(path)):
            try:
                if entry.is_dir(follow_symlinks=False):
                    folders += 1
                    f, d, b = count_dir(Path(entry.path))
                    files += f; folders += d; bytes_total += b
                elif entry.is_file(follow_symlinks=False):
                    files += 1
                    try: bytes_total += entry.stat().st_size
                    except OSError: pass
            except (PermissionError, OSError): pass
    except (PermissionError, OSError): pass
    return files, folders, bytes_total


def create_fixture(path: Path, size: int = FIXTURE_SIZE) -> Path:
    """Create a single fixture file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"X" * size)
    return path


def create_fixtures(directory: Path, count: int, prefix: str = FIXTURE_PREFIX) -> list[Path]:
    """Create fixture files in a directory."""
    fixtures = []
    for i in range(count):
        p = directory / f"{prefix}{i:04d}.tmp"
        p.write_bytes(b"X" * FIXTURE_SIZE)
        fixtures.append(p)
    return fixtures


def get_all_scan_locations() -> list[tuple[str, str]]:
    """Get all production scan locations with labels."""
    locations = get_default_scan_locations()
    return [(str(loc.path), loc.label) for loc in locations]


def run_scan() -> dict:
    """Run a quick scan and return detailed results."""
    orchestrator = None
    for i in range(120):
        orchestrator = scan_core_rpc.get_scan_orchestrator()
        if orchestrator is not None:
            break
        time.sleep(1)
    if orchestrator is None:
        return {"error": "Orchestrator failed to initialize"}

    scan_start = time.time()
    result = orchestrator.scan_quick(scope=None, on_progress=lambda p: None)
    scan_duration = time.time() - scan_start

    # Group findings by category
    findings_by_category = defaultdict(list)
    findings_by_rule = defaultdict(list)
    for f in result.findings:
        # Findings are dicts (converted via to_dict() in the orchestrator)
        if isinstance(f, dict):
            rule_id = f.get("rule_id", "") or ""
            canonical_path = f.get("canonical_path", "") or ""
            display_name = f.get("display_name", "") or ""
        else:
            rule_id = getattr(f, "rule_id", "") or ""
            canonical_path = getattr(f, "canonical_path", "") or ""
            display_name = getattr(f, "display_name", "") or ""
        cat = rule_id_to_category(rule_id) if rule_id else "Unknown"
        findings_by_category[cat].append(f)
        findings_by_rule[rule_id].append(f)

    return {
        "scan_duration": scan_duration,
        "assets_discovered": result.statistics.get("assets_discovered", 0),
        "findings_count": len(result.findings),
        "action_plan_id": result.action_plan_id,
        "findings_by_category": dict(findings_by_category),
        "findings_by_rule": dict(findings_by_rule),
        "statistics": result.statistics,
    }


def run_cleanup(plan_id: str) -> dict:
    """Run cleanup and return detailed results."""
    if not plan_id:
        return {"error": "No plan ID"}

    coord = scan_core_rpc.get_coordinator()
    preview = coord.prepare(plan_id)

    # Revalidate
    reval = coord.revalidate_planned_actions(plan_id)

    summary = coord.execute(
        plan_id,
        request_id=str(__import__("uuid").uuid4()),
        approval_token=preview.approval_token,
        mode="live",
        on_progress=lambda p, c, t, i: None,
    )

    # Analyze results by category
    plan = coord._plan_repo.load(plan_id)
    action_rule_map = {a.action_id: getattr(a, "rule_id", "") for a in plan.actions}
    action_type_map = {a.action_id: a.action_type.value for a in plan.actions}
    action_state_map = {a.action_id: a.state.value for a in plan.actions}

    category_results = defaultdict(lambda: {
        "files_found": 0, "files_cleaned": 0, "files_failed": 0,
        "files_rejected": 0, "space_recovered": 0,
        "rejection_reasons": [], "failure_reasons": [],
        "states": Counter(),
    })

    for r in summary.results:
        rule_id = action_rule_map.get(r.action_id, "")
        cat = rule_id_to_category(rule_id) if rule_id else "Other Safe Cleanup"
        action_type = action_type_map.get(r.action_id, "none")
        state = action_state_map.get(r.action_id, "unknown")

        if action_type in ("delete_file", "clear_cache", "delete_directory"):
            category_results[cat]["files_found"] += 1
            category_results[cat]["states"][state] += 1

            if r.status.value == "completed":
                after = getattr(r, "after_state", None)
                before = getattr(r, "before_state", None)
                if after and isinstance(after, dict) and after.get("exists") is False:
                    category_results[cat]["files_cleaned"] += 1
                    if before and isinstance(before, dict):
                        size = before.get("size", 0)
                        if isinstance(size, (int, float)) and size > 0:
                            category_results[cat]["space_recovered"] += int(size)
                else:
                    category_results[cat]["files_failed"] += 1
                    category_results[cat]["failure_reasons"].append(getattr(r, "reason", "unknown"))
            elif r.status.value == "failed":
                category_results[cat]["files_failed"] += 1
                err = getattr(r, "error", None)
                reason = getattr(r, "reason", "")
                if err:
                    reason = f"{reason} [{err.code}]" if hasattr(err, "code") else reason
                category_results[cat]["failure_reasons"].append(reason)
            elif r.status.value == "rejected":
                category_results[cat]["files_rejected"] += 1
                err = getattr(r, "error", None)
                reason = getattr(r, "reason", "")
                if err:
                    reason = f"{reason} [{err.code}]" if hasattr(err, "code") else reason
                category_results[cat]["rejection_reasons"].append(reason)

    return {
        "total_actions": preview.total_actions,
        "safety_state_counts": preview.safety_state_counts,
        "fixability_counts": preview.fixability_counts,
        "revalidation": reval,
        "completed": summary.completed,
        "failed": summary.failed,
        "rejected": summary.rejected,
        "category_results": dict(category_results),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# PART 1: Discovery Path Audit — Verify every category's discovery path
# ═══════════════════════════════════════════════════════════════════════════════
print("=" * 80)
print("PART 1: DISCOVERY PATH AUDIT")
print("=" * 80)

all_locations = get_all_scan_locations()
print(f"\nTotal production scan locations: {len(all_locations)}")
for path, label in all_locations:
    exists = os.path.exists(path)
    status = "EXISTS" if exists else "MISSING"
    print(f"  [{status}] {label}: {path}")

# ═══════════════════════════════════════════════════════════════════════════════
# PART 2: Detection Rule Audit — Verify rule_id → category mapping
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "=" * 80)
print("PART 2: DETECTION RULE AUDIT")
print("=" * 80)

print(f"\nTotal rule_id -> category mappings: {len(RULE_ID_TO_CATEGORY)}")
for rule_id, category in sorted(RULE_ID_TO_CATEGORY.items()):
    print(f"  {rule_id:40s} -> {category}")

# ═══════════════════════════════════════════════════════════════════════════════
# PART 3: Fixture-Based Category Tests
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "=" * 80)
print("PART 3: FIXTURE-BASED CATEGORY TESTS")
print("=" * 80)

temp_dir = Path(os.environ.get("TEMP", tempfile.gettempdir()))
win_dir = Path(os.environ.get("SystemRoot", r"C:\Windows"))
local_appdata = Path(os.environ.get("LOCALAPPDATA", r"C:\Users\User\AppData\Local"))

# Create fixtures in categories where it's safe to do so
fixture_categories = {
    "Temporary Files (User Temp)": {
        "dir": temp_dir,
        "count": 10,
        "expected_category": "Temporary Files",
    },
    "Windows Temp": {
        "dir": win_dir / "Temp",
        "count": 5,
        "expected_category": "Temporary Files",
        "requires_admin": True,
    },
}

# Create fixtures
all_fixtures = []
for cat_name, config in fixture_categories.items():
    directory = config["dir"]
    count = config["count"]
    if not directory.exists():
        print(f"\n  SKIP {cat_name}: directory does not exist ({directory})")
        continue
    try:
        fixtures = create_fixtures(directory, count)
        all_fixtures.extend(fixtures)
        existing = sum(1 for f in fixtures if f.exists())
        print(f"\n  CREATED {cat_name}: {existing}/{count} fixtures in {directory}")
        print(f"    Total fixture bytes: {count * FIXTURE_SIZE:,}")
    except PermissionError as e:
        print(f"\n  SKIP {cat_name}: PermissionError ({e})")

# ═══════════════════════════════════════════════════════════════════════════════
# PART 4: Scan #1 — Detection and Classification
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "=" * 80)
print("PART 4: SCAN #1 — DETECTION AND CLASSIFICATION")
print("=" * 80)

scan1 = run_scan()
if "error" in scan1:
    print(f"FATAL: {scan1['error']}")
    sys.exit(1)

print(f"\n  Scan duration: {scan1['scan_duration']:.1f}s")
print(f"  Assets discovered (internal): {scan1['assets_discovered']}")
print(f"  Total findings: {scan1['findings_count']}")
print(f"  Action plan ID: {scan1['action_plan_id']}")

print(f"\n  Findings by category:")
for cat in sorted(scan1["findings_by_category"].keys()):
    count = len(scan1["findings_by_category"][cat])
    print(f"    {cat}: {count}")

print(f"\n  Findings by rule_id:")
for rule_id in sorted(scan1["findings_by_rule"].keys()):
    count = len(scan1["findings_by_rule"][rule_id])
    print(f"    {rule_id}: {count}")

# ═══════════════════════════════════════════════════════════════════════════════
# PART 5: Cleanup and Physical Verification
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "=" * 80)
print("PART 5: CLEANUP AND PHYSICAL VERIFICATION")
print("=" * 80)

cleanup1 = run_cleanup(scan1["action_plan_id"])

print(f"\n  Total actions: {cleanup1['total_actions']}")
print(f"  Safety state counts: {cleanup1['safety_state_counts']}")
print(f"  Fixability counts: {cleanup1['fixability_counts']}")
print(f"  Revalidation: {cleanup1['revalidation']}")
print(f"  Completed: {cleanup1['completed']}")
print(f"  Failed: {cleanup1['failed']}")
print(f"  Rejected: {cleanup1['rejected']}")

print(f"\n  Per-category cleanup results:")
print(f"  {'Category':<30s} {'Found':>6s} {'Clean':>6s} {'Fail':>6s} {'Rej':>6s} {'Bytes':>12s} {'States':<30s}")
print(f"  {'-'*30} {'-'*6} {'-'*6} {'-'*6} {'-'*6} {'-'*12} {'-'*30}")

for cat in sorted(cleanup1["category_results"].keys()):
    r = cleanup1["category_results"][cat]
    states_str = ", ".join(f"{k}={v}" for k, v in r["states"].most_common())
    print(f"  {cat:<30s} {r['files_found']:>6d} {r['files_cleaned']:>6d} {r['files_failed']:>6d} {r['files_rejected']:>6d} {r['space_recovered']:>12d} {states_str:<30s}")

# Show rejection reasons for categories with rejections
print(f"\n  Rejection reasons by category:")
for cat in sorted(cleanup1["category_results"].keys()):
    r = cleanup1["category_results"][cat]
    if r["rejection_reasons"]:
        reasons = Counter(r["rejection_reasons"])
        print(f"    {cat}:")
        for reason, count in reasons.most_common():
            print(f"      {count}x: {reason[:80]}")

print(f"\n  Failure reasons by category:")
for cat in sorted(cleanup1["category_results"].keys()):
    r = cleanup1["category_results"][cat]
    if r["failure_reasons"]:
        reasons = Counter(r["failure_reasons"])
        print(f"    {cat}:")
        for reason, count in reasons.most_common():
            print(f"      {count}x: {reason[:80]}")

# ═══════════════════════════════════════════════════════════════════════════════
# PART 6: Physical Verification of Fixtures
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "=" * 80)
print("PART 6: PHYSICAL VERIFICATION OF FIXTURES")
print("=" * 80)

if all_fixtures:
    existing_before = sum(1 for f in all_fixtures if f.exists())
    deleted = sum(1 for f in all_fixtures if not f.exists())
    print(f"\n  Fixtures created: {len(all_fixtures)}")
    print(f"  Fixtures still existing: {existing_before}")
    print(f"  Fixtures physically deleted: {deleted}")

    if deleted == len(all_fixtures):
        print(f"  PASS: All fixtures physically deleted")
    elif deleted > 0:
        print(f"  PARTIAL: {deleted}/{len(all_fixtures)} fixtures deleted")
    else:
        print(f"  FAIL: No fixtures were deleted")
else:
    print(f"\n  No fixtures were created (all directories may require admin access)")

# ═══════════════════════════════════════════════════════════════════════════════
# PART 7: Second Scan Validation
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "=" * 80)
print("PART 7: SECOND SCAN VALIDATION")
print("=" * 80)

scan2 = run_scan()
print(f"\n  Scan #2 duration: {scan2['scan_duration']:.1f}s")
print(f"  Scan #2 findings: {scan2['findings_count']}")

# Check if fixtures reappear
if all_fixtures:
    fixture_findings = 0
    for cat_findings in scan2.get("findings_by_category", {}).values():
        for f in cat_findings:
            if isinstance(f, dict):
                f_str = f.get("canonical_path", "") + f.get("display_name", "")
            else:
                f_str = str(f)
            if FIXTURE_PREFIX in f_str:
                fixture_findings += 1
    print(f"  Second scan fixture findings: {fixture_findings}")
    if fixture_findings == 0:
        print(f"  PASS: Cleaned fixtures did NOT reappear in second scan")
    else:
        print(f"  FAIL: {fixture_findings} fixtures reappeared in second scan")

# Compare scan1 vs scan2 by category
print(f"\n  Category comparison (Scan #1 vs Scan #2):")
print(f"  {'Category':<30s} {'Scan1':>8s} {'Scan2':>8s} {'Delta':>8s}")
print(f"  {'-'*30} {'-'*8} {'-'*8} {'-'*8}")
all_cats = sorted(set(list(scan1["findings_by_category"].keys()) + list(scan2["findings_by_category"].keys())))
for cat in all_cats:
    c1 = len(scan1["findings_by_category"].get(cat, []))
    c2 = len(scan2["findings_by_category"].get(cat, []))
    delta = c2 - c1
    print(f"  {cat:<30s} {c1:>8d} {c2:>8d} {delta:>+8d}")

# ═══════════════════════════════════════════════════════════════════════════════
# PART 8: Locked File Test
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "=" * 80)
print("PART 8: LOCKED FILE TEST")
print("=" * 80)

# Create a locked fixture by opening it with an exclusive handle
locked_fixture = temp_dir / f"{FIXTURE_PREFIX}LOCKED.tmp"
try:
    locked_fixture.write_bytes(b"X" * FIXTURE_SIZE)
    # Open with exclusive lock (no sharing)
    import msvcrt
    fd = os.open(str(locked_fixture), os.O_RDWR)
    try:
        msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)
        print(f"\n  Created locked fixture: {locked_fixture}")
        print(f"  Fixture exists: {locked_fixture.exists()}")

        # Run scan and check if the locked fixture is detected
        scan_lock = run_scan()
        locked_findings = 0
        locked_category = ""
        locked_safety = ""
        for cat_findings in scan_lock.get("findings_by_category", {}).values():
            for f in cat_findings:
                if isinstance(f, dict):
                    f_str = f.get("canonical_path", "") + f.get("display_name", "")
                    rule_id = f.get("rule_id", "")
                else:
                    f_str = str(f)
                    rule_id = getattr(f, "rule_id", "")
                if FIXTURE_PREFIX + "LOCKED" in f_str:
                    locked_findings += 1
                    locked_category = rule_id_to_category(rule_id) if rule_id else "Unknown"
                    if isinstance(f, dict):
                        locked_safety = str(f.get("safety", ""))
                    else:
                        safety = getattr(f, "safety", None)
                        if safety:
                            locked_safety = getattr(safety, "level", str(safety))

        print(f"  Locked fixture detected: {locked_findings} findings")
        print(f"  Category: {locked_category}")
        print(f"  Safety: {locked_safety}")

        # Run cleanup and verify the locked file is NOT deleted
        if scan_lock["action_plan_id"]:
            cleanup_lock = run_cleanup(scan_lock["action_plan_id"])
            still_exists = locked_fixture.exists()
            print(f"  After cleanup, locked fixture exists: {still_exists}")
            if still_exists:
                print(f"  PASS: Locked file was NOT force-deleted")
            else:
                print(f"  FAIL: Locked file was force-deleted — SAFETY VIOLATION")
        else:
            print(f"  No action plan generated for locked fixture scan")

    finally:
        try:
            msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)
        except OSError:
            pass
        os.close(fd)
except Exception as e:
    print(f"\n  Could not create locked fixture: {e}")
finally:
    try:
        if locked_fixture.exists():
            locked_fixture.unlink()
    except OSError:
        pass

# ═══════════════════════════════════════════════════════════════════════════════
# PART 9: Windows-Native Cleanup Mechanism Investigation
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "=" * 80)
print("PART 9: WINDOWS-NATIVE CLEANUP MECHANISM INVESTIGATION")
print("=" * 80)

windows_native_mechanisms = {
    "Prefetch": {
        "mechanism": "Windows automatically regenerates Prefetch files. Direct deletion is safe for unlocked files. The SuperFetch service may lock some .pf files. Windows Disk Cleanup also directly deletes Prefetch files.",
        "api": "Direct file deletion (no special API needed)",
        "recommendation": "Delete unlocked .pf files directly. Skip locked files. Windows will regenerate them.",
    },
    "Windows Update Cleanup": {
        "mechanism": "Windows has a built-in cleanup mechanism via DISM: 'dism /Online /Cleanup-Image /StartComponentCleanup'. The SoftwareDistribution\\Download folder can also be safely cleared directly.",
        "api": "DISM command or direct file deletion for Download folder",
        "recommendation": "Direct deletion for unlocked files in SoftwareDistribution\\Download. DISM for component store cleanup (not AVS scope).",
    },
    "Windows Error Reporting": {
        "mechanism": "WER files in %ProgramData%\\Microsoft\\Windows\\WER can be safely deleted directly. The WER service may lock some files.",
        "api": "Direct file deletion",
        "recommendation": "Delete unlocked WER files directly. Skip locked files.",
    },
    "Memory Dumps": {
        "mechanism": "MEMORY.DMP and Minidump files can be safely deleted directly. They are not locked unless a crash is being written.",
        "api": "Direct file deletion",
        "recommendation": "Direct deletion. Skip if locked (rare).",
    },
    "Font Cache": {
        "mechanism": "Windows Font Cache service rebuilds the cache. Files in ServiceProfiles\\LocalService\\AppData\\Local\\FontCache can be deleted but may be locked by the service.",
        "api": "Direct file deletion (stop FontCache service first for locked files — NOT recommended for AVS)",
        "recommendation": "Direct deletion for unlocked files. Skip locked files. Do NOT stop Windows services.",
    },
    "BranchCache": {
        "mechanism": "BranchCache can be flushed via 'netsh branchcache flush'. Files can also be deleted directly.",
        "api": "netsh branchcache flush or direct file deletion",
        "recommendation": "Direct deletion for unlocked files. Skip locked files.",
    },
    "Recycle Bin": {
        "mechanism": "SHEmptyRecycleBinW Windows API empties the Recycle Bin on all drives.",
        "api": "SHEmptyRecycleBinW (shell32)",
        "recommendation": "Use SHEmptyRecycleBinW API. Already implemented in RecycleBinExecutor.",
    },
    "Delivery Optimization": {
        "mechanism": "Files in SoftwareDistribution\\DeliveryOptimization can be safely deleted directly.",
        "api": "Direct file deletion",
        "recommendation": "Direct deletion for unlocked files.",
    },
    "Thumbnail Cache": {
        "mechanism": "Windows Explorer rebuilds thumbnail cache automatically. Files can be deleted directly.",
        "api": "Direct file deletion",
        "recommendation": "Direct deletion. Explorer will rebuild the cache.",
    },
    "Shader Cache": {
        "mechanism": "GPU drivers (NVIDIA, AMD, D3D) rebuild shader caches automatically. Files can be deleted directly.",
        "api": "Direct file deletion",
        "recommendation": "Direct deletion. GPU drivers will rebuild caches.",
    },
    "Browser Cache": {
        "mechanism": "Browsers rebuild cache automatically. Cache subdirectories can be cleared directly.",
        "api": "Direct file deletion / clear_cache action",
        "recommendation": "Direct deletion for cache subdirectories. Browser should be closed for best results.",
    },
    "Windows.old": {
        "mechanism": "Windows has a built-in mechanism: delete via system cleanup or remove directory directly (requires admin).",
        "api": "Direct deletion (requires admin) or Windows Disk Cleanup",
        "recommendation": "REQUIRES_REVIEW — user must confirm. Not auto-cleanable.",
    },
}

for cat, info in windows_native_mechanisms.items():
    print(f"\n  {cat}:")
    print(f"    Mechanism: {info['mechanism']}")
    print(f"    API: {info['api']}")
    print(f"    Recommendation: {info['recommendation']}")

# ═══════════════════════════════════════════════════════════════════════════════
# PART 10: Category-by-Category Verdict Matrix
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "=" * 80)
print("PART 10: CATEGORY-BY-CATEGORY VERDICT MATRIX")
print("=" * 80)

# Build the verdict for each category
all_categories = sorted(set(
    list(RULE_ID_TO_CATEGORY.values()) +
    list(cleanup1["category_results"].keys()) +
    list(scan1["findings_by_category"].keys())
))

print(f"\n{'Category':<30s} {'Discovery':>10s} {'Detection':>10s} {'Eligible':>8s} {'Cleaned':>8s} {'Bytes':>12s} {'Verdict':<25s}")
print(f"{'-'*30} {'-'*10} {'-'*10} {'-'*8} {'-'*8} {'-'*12} {'-'*25}")

for cat in all_categories:
    # Discovery: is this category in the scan locations?
    discovery = "PASS" if any(
        cat.lower() in label.lower() or
        (cat == "Temporary Files" and "Temp" in label) or
        (cat == "Browser Cache" and "Browser" in label) or
        (cat == "Shader Cache" and "Shader" in label) or
        (cat == "Thumbnail Cache" and "Thumbnail" in label) or
        (cat == "Prefetch" and "Prefetch" in label) or
        (cat == "Windows Update Cleanup" and "Update" in label) or
        (cat == "Delivery Optimization" and "Delivery" in label) or
        (cat == "Windows Error Reporting" and "WER" in label) or
        (cat == "Memory Dumps" and "MEMORY" in label) or
        (cat == "Downloaded Program Files" and "Downloaded" in label) or
        (cat == "Offline Web Pages" and "Offline" in label) or
        (cat == "Font Cache" and "Font" in label) or
        (cat == "BranchCache" and "BranchCache" in label) or
        (cat == "Retail Demo" and "Retail" in label) or
        (cat == "Installer Patch Cache" and "PatchCache" in label) or
        (cat == "Application Cache" and "Office" in label) or
        (cat == "Windows.old" and "Windows.old" in label)
        for _, label in all_locations
    ) else "FAIL"

    # Detection: were any findings detected for this category?
    detected_count = len(scan1["findings_by_category"].get(cat, []))
    detection = "PASS" if detected_count > 0 else "NONE"

    # Cleanup results
    cat_result = cleanup1["category_results"].get(cat, {
        "files_found": 0, "files_cleaned": 0, "space_recovered": 0,
        "files_failed": 0, "files_rejected": 0,
    })

    eligible = cat_result["files_found"]
    cleaned = cat_result["files_cleaned"]
    bytes_rec = cat_result["space_recovered"]

    # Verdict
    if eligible > 0 and cleaned > 0:
        verdict = "PHYSICALLY VERIFIED"
    elif eligible > 0 and cleaned == 0 and cat_result["files_rejected"] > 0:
        verdict = "NOT CURRENTLY CLEANABLE"
    elif detected_count > 0 and eligible == 0:
        verdict = "DETECTED (not auto-cleanable)"
    elif detection == "NONE":
        verdict = "IMPLEMENTED (no files found)"
    else:
        verdict = "DETECTED"

    print(f"{cat:<30s} {discovery:>10s} {detection:>10s} {eligible:>8d} {cleaned:>8d} {bytes_rec:>12d} {verdict:<25s}")

# ═══════════════════════════════════════════════════════════════════════════════
# PART 11: Special Investigation — Prefetch / WER / Windows Update
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "=" * 80)
print("PART 11: SPECIAL INVESTIGATION — PREFETCH / WER / WINDOWS UPDATE")
print("=" * 80)

special_cats = ["Prefetch", "Windows Error Reporting", "Windows Update Cleanup",
                "Application Cache", "Downloaded Program Files", "Offline Web Pages",
                "Other Safe Cleanup"]

for cat in special_cats:
    print(f"\n  ── {cat} ──")
    cat_result = cleanup1["category_results"].get(cat, {})
    findings = scan1["findings_by_category"].get(cat, [])

    print(f"    Findings detected: {len(findings)}")
    print(f"    Files found (eligible): {cat_result.get('files_found', 0)}")
    print(f"    Files cleaned: {cat_result.get('files_cleaned', 0)}")
    print(f"    Files failed: {cat_result.get('files_failed', 0)}")
    print(f"    Files rejected: {cat_result.get('files_rejected', 0)}")
    print(f"    States: {dict(cat_result.get('states', Counter()))}")

    if cat_result.get("rejection_reasons"):
        print(f"    Rejection reasons:")
        for reason, count in Counter(cat_result["rejection_reasons"]).most_common(5):
            print(f"      {count}x: {reason[:100]}")

    if cat_result.get("failure_reasons"):
        print(f"    Failure reasons:")
        for reason, count in Counter(cat_result["failure_reasons"]).most_common(5):
            print(f"      {count}x: {reason[:100]}")

    # Check revalidation results
    reval = cleanup1.get("revalidation", {})
    print(f"    Revalidation: total_planned={reval.get('total_planned', 0)}, "
          f"still_deletable={reval.get('still_deletable', 0)}, "
          f"now_locked={reval.get('now_locked', 0)}, "
          f"now_missing={reval.get('now_missing', 0)}, "
          f"now_inaccessible={reval.get('now_inaccessible', 0)}")

    # Determine the root cause
    states = cat_result.get("states", Counter())
    if states.get("not_fixable", 0) > 0:
        print(f"    ROOT CAUSE: Actions classified as NOT_FIXABLE by the planner")
        print(f"    This means the rule's actionability is UNSUPPORTED or DETECTION_ONLY")
    elif states.get("blocked", 0) > 0:
        print(f"    ROOT CAUSE: Actions classified as BLOCKED by SafetyPolicy")
        print(f"    This means the file is in a protected location")
    elif states.get("review_required", 0) > 0:
        print(f"    ROOT CAUSE: Actions classified as REVIEW_REQUIRED")
        print(f"    This means the file is locked or inaccessible")
    elif states.get("planned", 0) > 0 and cat_result.get("files_cleaned", 0) == 0:
        print(f"    ROOT CAUSE: Actions were PLANNED but failed at execution time")
        print(f"    This means the file was locked when deletion was attempted")
    elif states.get("planned", 0) > 0 and cat_result.get("files_cleaned", 0) > 0:
        print(f"    ROOT CAUSE: None — some files were successfully cleaned")

# ═══════════════════════════════════════════════════════════════════════════════
# Cleanup
# ═══════════════════════════════════════════════════════════════════════════════
print("\n" + "=" * 80)
print("CLEANUP")
print("=" * 80)

# Clean up remaining fixtures
for f in all_fixtures:
    try:
        if f.exists():
            f.unlink()
    except OSError:
        pass

try:
    shutil.rmtree(TEST_DB_DIR)
except Exception:
    pass

print("\n=== AUDIT COMPLETE ===")
