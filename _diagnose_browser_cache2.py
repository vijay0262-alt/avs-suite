"""Diagnose why no actions are created for cache.browser/cache.application findings."""
import sys, os, time, uuid
from pathlib import Path
from collections import Counter, defaultdict

sys.path.insert(0, str(Path(__file__).parent / "backend" / "src"))

import avs_backend.scan_core_rpc as scan_core_rpc
scan_core_rpc._scan_orchestrator = None
scan_core_rpc._scan_orchestrator_initializing = False
scan_core_rpc._coordinator = None

orch = None
for i in range(120):
    orch = scan_core_rpc.get_scan_orchestrator()
    if orch: break
    time.sleep(1)
if not orch:
    print("FATAL: no orchestrator")
    sys.exit(1)

# Create a fixture
FIXTURE_PREFIX = "AVS_DIAG2_"
real_local = Path(os.environ.get("LOCALAPPDATA", r"C:\Users\HPBP\AppData\Local"))
fixture_dir = real_local / "BraveSoftware" / "Brave-Browser" / "User Data" / "Default" / "Cache"
fixture_dir.mkdir(parents=True, exist_ok=True)
fixture = fixture_dir / f"{FIXTURE_PREFIX}test.tmp"
fixture.write_bytes(b"X" * 4096)

result = orch.scan_quick(scope=None, on_progress=lambda p: None)
print(f"Findings: {len(result.findings)}")

# Show all cache.browser findings
print("\n--- All cache.browser findings ---")
for f in result.findings:
    if isinstance(f, dict) and f.get("rule_id") == "cache.browser":
        cp = f.get("canonical_path", "")
        at = f.get("asset_type", "")
        rc = f.get("rule_category", "")
        ra = f.get("recommended_action", "")
        safety = f.get("safety", {})
        sl = safety.get("level", "?") if isinstance(safety, dict) else "?"
        print(f"  [{sl}] asset_type={at} rule_cat={rc} rec_action={ra}")
        print(f"    path: {cp}")

# Load the action plan and show ALL actions
plan_id = result.action_plan_id
if plan_id:
    coord = scan_core_rpc.get_coordinator()
    plan = coord._plan_repo.load(plan_id)

    state_by_rule = defaultdict(Counter)
    type_by_rule = defaultdict(Counter)
    for a in plan.actions:
        rid = getattr(a, "rule_id", "")
        state_by_rule[rid][a.state.value] += 1
        type_by_rule[rid][a.action_type.value] += 1

    print("\n--- Action states by rule_id ---")
    for rid in sorted(state_by_rule.keys()):
        print(f"  {rid}: states={dict(state_by_rule[rid])} types={dict(type_by_rule[rid])}")

    # Show details for cache.browser actions specifically
    print("\n--- cache.browser actions ---")
    count = 0
    for a in plan.actions:
        rid = getattr(a, "rule_id", "")
        if rid == "cache.browser":
            count += 1
            target = getattr(a, "target", None)
            cp = getattr(target, "canonical_path", "NO TARGET") if target else "NO TARGET"
            print(f"  action_type={a.action_type.value} state={a.state.value} path={cp}")
            if a.state.value == "not_fixable":
                print(f"    reason: {getattr(a, 'reason', '?')}")
    if count == 0:
        print("  NONE — no actions created for cache.browser findings!")

    # Also check cache.application
    print("\n--- cache.application actions ---")
    count = 0
    for a in plan.actions:
        rid = getattr(a, "rule_id", "")
        if rid == "cache.application":
            count += 1
            target = getattr(a, "target", None)
            cp = getattr(target, "canonical_path", "NO TARGET") if target else "NO TARGET"
            print(f"  action_type={a.action_type.value} state={a.state.value} path={cp}")
    if count == 0:
        print("  NONE — no actions created for cache.application findings!")

# Cleanup
try:
    if fixture.exists():
        fixture.unlink()
except OSError:
    pass
