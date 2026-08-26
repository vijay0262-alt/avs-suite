"""Diagnose why browser cache and Office cache fixtures are not cleaned."""
import sys, os, time, uuid, tempfile
from pathlib import Path
from collections import Counter, defaultdict

sys.path.insert(0, str(Path(__file__).parent / "backend" / "src"))

import avs_backend.scan_core_rpc as scan_core_rpc
scan_core_rpc._scan_orchestrator = None
scan_core_rpc._scan_orchestrator_initializing = False
scan_core_rpc._coordinator = None

# Wait for orchestrator
orch = None
for i in range(120):
    orch = scan_core_rpc.get_scan_orchestrator()
    if orch: break
    time.sleep(1)
if not orch:
    print("FATAL: no orchestrator")
    sys.exit(1)

# Check which browsers are running
from avs_backend.scan_core.rules.detection.junk_rules_ext import _detect_running_browsers
running = _detect_running_browsers()
print(f"Running browsers: {running}")

# Create fixtures in browser cache dirs (same as phase 2)
FIXTURE_PREFIX = "AVS_DIAG_"
FIXTURE_SIZE = 4096
real_local = Path(os.environ.get("LOCALAPPDATA", r"C:\Users\HPBP\AppData\Local"))
real_appdata = Path(os.environ.get("APPDATA", r"C:\Users\HPBP\AppData\Roaming"))

fixture_dirs = {
    "Edge": real_local / "Microsoft" / "Edge" / "User Data" / "Default" / "Cache",
    "Brave": real_local / "BraveSoftware" / "Brave-Browser" / "User Data" / "Default" / "Cache",
    "Firefox": real_appdata / "Mozilla" / "Firefox" / "Profiles" / "avs-test-profile" / "cache2",
    "Office": real_local / "Microsoft" / "Office" / "16.0" / "OfficeFileCache",
}

all_fixtures = []
for name, d in fixture_dirs.items():
    d.mkdir(parents=True, exist_ok=True)
    for i in range(2):
        p = d / f"{FIXTURE_PREFIX}{i:04d}.tmp"
        p.write_bytes(b"X" * FIXTURE_SIZE)
        all_fixtures.append((name, p))

# Run scan
result = orch.scan_quick(scope=None, on_progress=lambda p: None)
print(f"\nFindings: {len(result.findings)}")

# Show details for cache.browser and cache.application findings
print("\n--- cache.browser findings ---")
for f in result.findings:
    if isinstance(f, dict) and f.get("rule_id") == "cache.browser":
        cp = f.get("canonical_path", "")
        is_fixture = FIXTURE_PREFIX in cp
        safety = f.get("safety", {})
        safety_level = safety.get("level", "?") if isinstance(safety, dict) else "?"
        safety_reason = safety.get("reason", "?") if isinstance(safety, dict) else "?"
        marker = " *** FIXTURE ***" if is_fixture else ""
        print(f"  [{safety_level}] {cp}{marker}")
        if is_fixture:
            print(f"    reason: {safety_reason}")

print("\n--- cache.application findings ---")
for f in result.findings:
    if isinstance(f, dict) and f.get("rule_id") == "cache.application":
        cp = f.get("canonical_path", "")
        is_fixture = FIXTURE_PREFIX in cp
        safety = f.get("safety", {})
        safety_level = safety.get("level", "?") if isinstance(safety, dict) else "?"
        marker = " *** FIXTURE ***" if is_fixture else ""
        print(f"  [{safety_level}] {cp}{marker}")

# Run cleanup and show what happens to fixture actions
plan_id = result.action_plan_id
if plan_id:
    coord = scan_core_rpc.get_coordinator()
    plan = coord._plan_repo.load(plan_id)

    # Show action details for fixture-related actions
    print("\n--- Actions for fixture files ---")
    for a in plan.actions:
        target = getattr(a, "target", None)
        if target:
            cp = getattr(target, "canonical_path", "")
            if FIXTURE_PREFIX in cp:
                rid = getattr(a, "rule_id", "")
                print(f"  rule_id={rid} action_type={a.action_type.value} state={a.state.value}")
                print(f"    path: {cp}")

    # Execute
    preview = coord.prepare(plan_id)
    summary = coord.execute(
        plan_id,
        request_id=str(uuid.uuid4()),
        approval_token=preview.approval_token,
        mode="live",
        on_progress=lambda p, c, t, i: None,
    )

    # Show results for fixture-related actions
    print("\n--- Execution results for fixture files ---")
    action_rule_map = {a.action_id: getattr(a, "rule_id", "") for a in plan.actions}
    for r in summary.results:
        # Find the action's target path
        action = next((a for a in plan.actions if a.action_id == r.action_id), None)
        if action:
            target = getattr(action, "target", None)
            if target:
                cp = getattr(target, "canonical_path", "")
                if FIXTURE_PREFIX in cp:
                    rid = action_rule_map.get(r.action_id, "")
                    status = r.status.value
                    before = getattr(r, "before_state", None)
                    after = getattr(r, "after_state", None)
                    err = getattr(r, "error", None)
                    reason = getattr(r, "reason", "")
                    print(f"  [{status}] rule={rid} path={cp}")
                    if before and isinstance(before, dict):
                        print(f"    before: exists={before.get('exists')} locked={before.get('locked')} accessible={before.get('accessible')}")
                    if after and isinstance(after, dict):
                        print(f"    after: exists={after.get('exists')}")
                    if err:
                        print(f"    error: {err}")
                    if reason:
                        print(f"    reason: {reason}")

# Cleanup
for name, p in all_fixtures:
    try:
        if p.exists():
            p.unlink()
    except OSError:
        pass
