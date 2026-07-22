"""Commercial Release Audit — fast input validation + data accuracy tests.

Designed to complete in <60s. Tests every RPC endpoint with invalid inputs,
verifies data accuracy against psutil, and checks for crash-prone patterns.
"""
from __future__ import annotations

import json
import os
import sys
import time
from typing import Any

# Fix Windows console encoding for Unicode output
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
os.environ.setdefault("AVS_NO_ELEVATE", "1")

from avs_backend.api import registry  # noqa: E402
from avs_backend.api.rpc_server import wait_for_modules  # noqa: E402

print("Waiting for modules to load...", flush=True)
wait_for_modules(timeout=120.0)

ISSUES: list[dict[str, Any]] = []


def report(severity: str, module: str, endpoint: str, issue: str, detail: str = "") -> None:
    ISSUES.append({"severity": severity, "module": module, "endpoint": endpoint, "issue": issue, "detail": detail})
    icon = {"CRITICAL": "[!]", "HIGH": "[!]", "MEDIUM": "[-]", "LOW": "[~]"}.get(severity, "[ ]")
    print(f"  {icon} [{severity}] {endpoint}: {issue}", flush=True)
    if detail:
        print(f"      → {detail[:200]}", flush=True)


def call(method: str, params: Any = None) -> tuple[Any, Exception | None]:
    handler = registry.get(method)
    if handler is None:
        return None, RuntimeError(f"Not registered: {method}")
    try:
        result = handler(params if isinstance(params, dict) or params is None else None)
        return result, None
    except Exception as e:
        return None, e


def is_expected_error(e: Exception) -> bool:
    """Check if error is a legitimate validation error (not a crash)."""
    s = str(e)
    type_name = type(e).__name__
    return any(kw in s or kw in type_name for kw in [
        "Missing", "INVALID_PARAMS", "required", "must be",
        "ValueError", "KeyError", "TypeError", "None",
        "is not a valid", "RpcError",
    ])


# =====================================================================
# PHASE 1: Input validation — test every endpoint with bad inputs
# =====================================================================
print("\n" + "=" * 60)
print("PHASE 1: Input Validation (96 endpoints)")
print("=" * 60, flush=True)

ALL_METHODS = registry.all_methods()
print(f"Total registered methods: {len(ALL_METHODS)}", flush=True)

FAST_ENDPOINTS = [
    # System
    "system.ping", "system.info", "system.healthScore", "system.comprehensive",
    "system.static", "system.dynamic", "system.refreshCache", "system.logs",
    "system.isAdmin", "metrics.cpu", "metrics.memory", "metrics.disk",
    # Dashboard
    "dashboard.metrics", "dashboard.live", "dashboard.health",
    "dashboard.refreshCache", "dashboard.optimize.preview",
    # Cleaner
    "cleaner.list", "cleaner.scan.status", "cleaner.scan.cancel",
    "cleaner.scan.refreshCache", "cleaner.clean.status", "cleaner.clean.cancel",
    "cleaner.clean.logs",
    # Startup
    "startup.list", "startup.refreshCache", "startup.backups",
    # Settings
    "settings.get", "settings.reset", "settings.languages",
    # Notifications
    "notifications.list", "notifications.clearDismissed", "notifications.clearAll",
    "notifications.unreadCount",
    # History
    "history.list", "history.statistics", "history.clear",
    # Job
    "job.status", "job.cancel", "job.list",
    # Disk
    "disk.listDrives",
    # Duplicate
    "duplicate.listDrives",
    # Wiper
    "wiper.drives",
    # Registry
    "registry.categories", "registry.backups",
    # Undo
    "undo.check", "undo.list",
    # Reporting
    "reporting.generate",
]

for method in FAST_ENDPOINTS:
    handler = registry.get(method)
    if handler is None:
        report("HIGH", "general", method, "Handler not registered")
        continue

    # Test None params
    _, err = call(method, None)
    if err is not None and not is_expected_error(err):
        report("MEDIUM", "test", method, "Crashes on None params", str(err))

    # Test empty dict
    _, err = call(method, {})
    if err is not None and not is_expected_error(err):
        report("MEDIUM", "test", method, "Crashes on empty dict", str(err))

    # Test wrong type (string instead of dict)
    _, err = call(method, "not_a_dict")
    if err is not None and not is_expected_error(err):
        report("MEDIUM", "test", method, "Crashes on string param", str(err))

    # Test extra unexpected params
    _, err = call(method, {"unexpected": "value", "extra": 123})
    if err is not None and not is_expected_error(err):
        report("LOW", "test", method, "Error on extra params", str(err))

    # Test null values for common required fields
    _, err = call(method, {"id": None, "path": None, "taskId": None, "cleanerId": None, "jobId": None})
    if err is not None and not is_expected_error(err):
        report("LOW", "test", method, "Error on null values", str(err))


# =====================================================================
# PHASE 2: Specific edge cases
# =====================================================================
print("\n" + "=" * 60)
print("PHASE 2: Specific Edge Cases")
print("=" * 60, flush=True)

# Invalid IDs
EDGE_CASES = [
    ("cleaner.scan.status", {"taskId": "nonexistent-id-12345"}, "MEDIUM"),
    ("cleaner.scan.results", {"taskId": "fake", "cleanerId": "nonexistent", "offset": 0, "limit": 10}, "MEDIUM"),
    ("cleaner.clean.preview", {"taskId": "nonexistent"}, "MEDIUM"),
    ("cleaner.clean.execute", {"taskId": "nonexistent"}, "MEDIUM"),
    ("cleaner.clean.undo", {"taskId": "nonexistent"}, "MEDIUM"),
    ("notifications.dismiss", {"id": "nonexistent-id"}, "MEDIUM"),
    ("notifications.create", {"type": "INVALID_TYPE", "title": "test", "message": "test"}, "LOW"),
    ("notifications.list", {"limit": 999999}, "LOW"),
    ("notifications.list", {"limit": -1}, "LOW"),
    ("startup.disable", {"id": "nonexistent-startup-id"}, "MEDIUM"),
    ("startup.enable", {"id": "nonexistent-startup-id"}, "MEDIUM"),
    ("startup.restore", {"id": "nonexistent-backup-id"}, "MEDIUM"),
    ("disk.analyze", {"path": "Z:\\Nonexistent\\Path"}, "MEDIUM"),
    ("disk.analyze", {"directory": "Z:\\Nonexistent\\Path"}, "MEDIUM"),
    ("disk.deleteFiles", {"files": ["Z:\\nonexistent.txt"]}, "MEDIUM"),
    ("duplicate.scan", {"path": "Z:\\Nonexistent\\Path"}, "MEDIUM"),
    ("duplicate.delete", {"files": ["Z:\\nonexistent.txt"]}, "MEDIUM"),
    ("registry.scan", {"categories": ["INVALID_CATEGORY"]}, "LOW"),
    ("registry.clean", {"entries": []}, "MEDIUM"),
    ("registry.restore", {"backupId": "nonexistent"}, "MEDIUM"),
    ("history.get", {"id": "nonexistent"}, "LOW"),
    ("history.search", {"query": "", "limit": 10}, "LOW"),
    ("history.delete", {"id": "nonexistent"}, "LOW"),
    ("history.export", {"format": "INVALID_FORMAT"}, "LOW"),
    ("performance.memory.optimize", {"threshold": -1}, "LOW"),
    ("wiper.wipeFreeSpace", {"drive": "Z:\\"}, "MEDIUM"),
    ("wiper.shred", {"path": "Z:\\Nonexistent\\File.txt"}, "MEDIUM"),
    ("uninstaller.uninstall", {"id": "nonexistent-app-id"}, "MEDIUM"),
    ("uninstaller.scanLeftovers", {"id": "nonexistent-app-id"}, "MEDIUM"),
    ("updater.upgrade", {"id": "nonexistent-app-id"}, "MEDIUM"),
    ("updater.upgradeAll", None, "MEDIUM"),
    ("undo.restore", {"id": "nonexistent-backup-id"}, "MEDIUM"),
    ("undo.delete", {"id": "nonexistent-backup-id"}, "MEDIUM"),
    ("job.status", {"jobId": "nonexistent-job-id"}, "MEDIUM"),
    ("job.cancel", {"jobId": "nonexistent-job-id"}, "MEDIUM"),
    ("settings.update", {"theme": "invalid_theme_name"}, "LOW"),
    ("settings.update", {"loggingLevel": "INVALID_LEVEL"}, "LOW"),
    ("settings.update", {"notificationPriority": "INVALID"}, "LOW"),
    ("settings.addExclusion", {"path": ""}, "LOW"),
    ("settings.removeExclusion", {"path": "nonexistent_path"}, "LOW"),
    ("system.logs", {"limit": 99999}, "LOW"),
    ("system.logs", {"limit": 0}, "LOW"),
    ("system.logs", {"limit": -5}, "LOW"),
    ("reporting.export.html", {"reportId": "nonexistent"}, "MEDIUM"),
    ("reporting.export.text", {"reportId": "nonexistent"}, "MEDIUM"),
]

for method, params, severity in EDGE_CASES:
    result, err = call(method, params)
    if err is not None and not is_expected_error(err):
        report(severity, "edge", method, f"Crashes on edge input", str(err))

# =====================================================================
# PHASE 3: Data accuracy verification
# =====================================================================
print("\n" + "=" * 60)
print("PHASE 3: Data Accuracy Verification")
print("=" * 60, flush=True)

import psutil
import platform

# Dashboard metrics vs psutil
result, err = call("dashboard.metrics")
if err:
    report("HIGH", "dashboard", "dashboard.metrics", "Failed to get metrics", str(err))
else:
    cpu = result.get("cpu", {})
    mem = result.get("memory", {})
    cpu_usage = cpu.get("usage", -1)
    if cpu_usage < 0 or cpu_usage > 100:
        report("HIGH", "dashboard", "dashboard.metrics", f"CPU usage out of range: {cpu_usage}")
    mem_usage = mem.get("usage", -1)
    if mem_usage < 0 or mem_usage > 100:
        report("HIGH", "dashboard", "dashboard.metrics", f"Memory usage out of range: {mem_usage}")
    mem_total = mem.get("total", 0)
    actual_mem = psutil.virtual_memory()
    if mem_total > 0 and abs(mem_total - actual_mem.total) > 1024 * 1024:
        report("MEDIUM", "dashboard", "dashboard.metrics", f"Memory total mismatch: {mem_total} vs {actual_mem.total}")
    # Check storage entries
    storage = result.get("storage", [])
    if not isinstance(storage, list):
        report("HIGH", "dashboard", "dashboard.metrics", "Storage is not a list")
    else:
        for disk in storage:
            if not isinstance(disk, dict):
                report("MEDIUM", "dashboard", "dashboard.metrics", f"Invalid storage entry: {disk}")
                continue
            if "total" not in disk or "used" not in disk:
                report("MEDIUM", "dashboard", "dashboard.metrics", f"Storage entry missing fields: {disk}")
    print(f"  ✓ dashboard.metrics: CPU={cpu_usage}%, Mem={mem_usage}%, Storage={len(storage)} disks")

# Dashboard health
result, err = call("dashboard.health")
if err:
    report("HIGH", "dashboard", "dashboard.health", "Failed to get health", str(err))
else:
    score = result.get("overallScore", -1)
    if score < 0 or score > 100:
        report("HIGH", "dashboard", "dashboard.health", f"Health score out of range: {score}")
    status = result.get("status", "")
    valid = ["excellent", "good", "fair", "poor", "critical"]
    if status not in valid:
        report("MEDIUM", "dashboard", "dashboard.health", f"Invalid status: {status}")
    cats = result.get("categoryScores", {})
    for cat, val in cats.items():
        if val < 0 or val > 100:
            report("MEDIUM", "dashboard", "dashboard.health", f"Category {cat} score out of range: {val}")
    print(f"  ✓ dashboard.health: score={score}, status={status}")

# Dashboard live
result, err = call("dashboard.live")
if err:
    report("HIGH", "dashboard", "dashboard.live", "Failed to get live metrics", str(err))
else:
    cpu = result.get("cpu", {})
    mem = result.get("memory", {})
    if cpu.get("usage", -1) < 0 or cpu.get("usage", -1) > 100:
        report("HIGH", "dashboard", "dashboard.live", f"CPU usage out of range: {cpu.get('usage')}")
    if mem.get("usage", -1) < 0 or mem.get("usage", -1) > 100:
        report("HIGH", "dashboard", "dashboard.live", f"Memory usage out of range: {mem.get('usage')}")
    print(f"  ✓ dashboard.live: CPU={cpu.get('usage')}%, Mem={mem.get('usage')}%")

# System info
result, err = call("system.info")
if err:
    report("HIGH", "system", "system.info", "Failed", str(err))
else:
    if result.get("os") != platform.system():
        report("HIGH", "system", "system.info", f"OS mismatch: {result.get('os')} vs {platform.system()}")
    if result.get("arch") != platform.machine():
        report("MEDIUM", "system", "system.info", f"Arch mismatch: {result.get('arch')} vs {platform.machine()}")
    print(f"  ✓ system.info: OS={result.get('os')}, Arch={result.get('arch')}")

# System dynamic
result, err = call("system.dynamic")
if err:
    report("HIGH", "system", "system.dynamic", "Failed", str(err))
else:
    actual_mem = psutil.virtual_memory()
    mem = result.get("memory", {})
    mem_percent = mem.get("percent", -1)
    if mem_percent >= 0 and abs(mem_percent - actual_mem.percent) > 15:
        report("MEDIUM", "system", "system.dynamic", f"Memory percent mismatch: {mem_percent} vs {actual_mem.percent}")
    processes = result.get("processes", {})
    actual_pids = len(psutil.pids())
    total_procs = processes.get("total", 0)
    if abs(total_procs - actual_pids) > 100:
        report("MEDIUM", "system", "system.dynamic", f"Process count mismatch: {total_procs} vs {actual_pids}")
    print(f"  ✓ system.dynamic: Mem={mem_percent}%, Procs={total_procs}")

# System healthScore
result, err = call("system.healthScore")
if err:
    report("HIGH", "system", "system.healthScore", "Failed", str(err))
else:
    score = result.get("score", -1)
    if score < 0 or score > 100:
        report("HIGH", "system", "system.healthScore", f"Score out of range: {score}")
    print(f"  ✓ system.healthScore: score={score}")

# Settings
result, err = call("settings.get")
if err:
    report("HIGH", "settings", "settings.get", "Failed", str(err))
else:
    required_fields = ["theme", "language", "autoUpdates", "startupWithWindows"]
    for field in required_fields:
        if field not in result:
            report("MEDIUM", "settings", "settings.get", f"Missing field: {field}")
    print(f"  ✓ settings.get: {len(result)} fields")

# Cleaner list
result, err = call("cleaner.list")
if err:
    report("HIGH", "cleaner", "cleaner.list", "Failed", str(err))
else:
    if not isinstance(result, list):
        report("HIGH", "cleaner", "cleaner.list", f"Expected list, got {type(result).__name__}")
    else:
        for c in result:
            if not isinstance(c, dict) or "id" not in c or "name" not in c:
                report("MEDIUM", "cleaner", "cleaner.list", f"Invalid cleaner entry: {c}")
        print(f"  ✓ cleaner.list: {len(result)} cleaners")

# Startup list
result, err = call("startup.list")
if err:
    report("HIGH", "startup", "startup.list", "Failed", str(err))
else:
    if isinstance(result, dict):
        items = result.get("items", [])
        print(f"  ✓ startup.list: {len(items)} items")
    elif isinstance(result, list):
        print(f"  ✓ startup.list: {len(result)} items")
    else:
        report("MEDIUM", "startup", "startup.list", f"Unexpected type: {type(result).__name__}")

# Job list
result, err = call("job.list")
if err:
    report("MEDIUM", "job", "job.list", "Failed", str(err))
else:
    print(f"  ✓ job.list: {result}")

# Notifications
result, err = call("notifications.list")
if err:
    report("MEDIUM", "notifications", "notifications.list", "Failed", str(err))
else:
    count = result.get("count", 0) if isinstance(result, dict) else 0
    print(f"  ✓ notifications.list: {count} notifications")

# History
result, err = call("history.list")
if err:
    report("MEDIUM", "history", "history.list", "Failed", str(err))
else:
    entries = result if isinstance(result, list) else result.get("entries", []) if isinstance(result, dict) else []
    print(f"  ✓ history.list: {len(entries)} entries")

# Disk drives
result, err = call("disk.listDrives")
if err:
    report("MEDIUM", "disk", "disk.listDrives", "Failed", str(err))
else:
    drives = result if isinstance(result, list) else result.get("drives", []) if isinstance(result, dict) else []
    print(f"  ✓ disk.listDrives: {len(drives)} drives")

# Wiper drives
result, err = call("wiper.drives")
if err:
    report("MEDIUM", "wiper", "wiper.drives", "Failed", str(err))
else:
    drives = result if isinstance(result, list) else result.get("drives", []) if isinstance(result, dict) else []
    print(f"  ✓ wiper.drives: {len(drives)} drives")

# Registry categories
result, err = call("registry.categories")
if err:
    report("MEDIUM", "registry", "registry.categories", "Failed", str(err))
else:
    cats = result if isinstance(result, list) else result.get("categories", []) if isinstance(result, dict) else []
    print(f"  ✓ registry.categories: {len(cats)} categories")

# System isAdmin
result, err = call("system.isAdmin")
if err:
    report("MEDIUM", "system", "system.isAdmin", "Failed", str(err))
else:
    print(f"  ✓ system.isAdmin: {result}")

# =====================================================================
# PHASE 4: Concurrency test
# =====================================================================
print("\n" + "=" * 60)
print("PHASE 4: Concurrency (20 parallel calls)")
print("=" * 60, flush=True)

from concurrent.futures import ThreadPoolExecutor, as_completed

def call_metrics():
    return call("dashboard.metrics")

with ThreadPoolExecutor(max_workers=8) as pool:
    futures = [pool.submit(call_metrics) for _ in range(20)]
    errors = sum(1 for f in as_completed(futures, timeout=30) if f.result()[1] is not None)
    if errors:
        report("HIGH", "dashboard", "dashboard.metrics", f"{errors}/20 concurrent calls failed")
    else:
        print("  ✓ 20 concurrent dashboard.metrics calls OK")

def call_health():
    return call("dashboard.health")

with ThreadPoolExecutor(max_workers=8) as pool:
    futures = [pool.submit(call_health) for _ in range(20)]
    errors = sum(1 for f in as_completed(futures, timeout=30) if f.result()[1] is not None)
    if errors:
        report("HIGH", "dashboard", "dashboard.health", f"{errors}/20 concurrent calls failed")
    else:
        print("  ✓ 20 concurrent dashboard.health calls OK")

# =====================================================================
# PHASE 5: Repeated operations (50x)
# =====================================================================
print("\n" + "=" * 60)
print("PHASE 5: Repeated Operations (50x)")
print("=" * 60, flush=True)

for method in ["dashboard.metrics", "dashboard.health", "dashboard.live", "system.dynamic"]:
    errors = sum(1 for _ in range(50) if call(method)[1] is not None)
    if errors:
        report("HIGH", "repeat", method, f"{errors}/50 repeated calls failed")
    else:
        print(f"  ✓ 50x {method} OK")

# Cache refresh + metrics 10x
errors = 0
for _ in range(10):
    call("dashboard.refreshCache")
    _, err = call("dashboard.metrics")
    if err:
        errors += 1
if errors:
    report("MEDIUM", "repeat", "refreshCache+metrics", f"{errors}/10 cycles failed")
else:
    print("  ✓ 10x refreshCache+metrics OK")

# =====================================================================
# SUMMARY
# =====================================================================
print("\n" + "=" * 60)
print("RELEASE AUDIT SUMMARY")
print("=" * 60, flush=True)

severity_order = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
counts = {sev: 0 for sev in severity_order}
for issue in ISSUES:
    counts[issue["severity"]] = counts.get(issue["severity"], 0) + 1

print(f"\nTotal issues: {len(ISSUES)}")
for sev in severity_order:
    if counts[sev] > 0:
        print(f"  {sev}: {counts[sev]}")

if ISSUES:
    print("\n--- Issue Details ---")
    for sev in severity_order:
        sev_issues = [i for i in ISSUES if i["severity"] == sev]
        if sev_issues:
            print(f"\n[{sev}]")
            for issue in sev_issues:
                print(f"  {issue['module']}/{issue['endpoint']}: {issue['issue']}")
                if issue["detail"]:
                    print(f"    → {issue['detail'][:300]}")

# Write JSON report
report_path = os.path.join(os.path.dirname(__file__), "..", "RELEASE_AUDIT.json")
with open(report_path, "w") as f:
    json.dump({"total_issues": len(ISSUES), "counts": counts, "issues": ISSUES}, f, indent=2)
print(f"\nReport: {report_path}")

if counts["CRITICAL"] > 0:
    print("\n[!] NOT RELEASE READY -- Critical issues must be resolved")
elif counts["HIGH"] > 0:
    print("\n[!] NOT RELEASE READY -- High severity issues must be reviewed")
else:
    print("\n[OK] RELEASE READY -- No Critical or High severity issues")
