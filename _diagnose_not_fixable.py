"""Diagnose why Prefetch and Windows Temp findings are NOT_FIXABLE."""
import sys, os, time
sys.path.insert(0, 'backend/src')

# Override LOCALAPPDATA to avoid DB lock
audit_dir = os.path.join(os.path.expanduser("~"), "avs_audit_db")
os.makedirs(audit_dir, exist_ok=True)
os.environ["LOCALAPPDATA"] = audit_dir
os.environ["APPDATA"] = audit_dir

import avs_backend.scan_core_rpc as rpc
rpc._scan_orchestrator = None
rpc._scan_orchestrator_initializing = False
rpc._coordinator = None

# Wait for orchestrator
orch = None
for i in range(120):
    orch = rpc.get_scan_orchestrator()
    if orch: break
    time.sleep(1)
if not orch:
    print("FAIL: no orchestrator")
    sys.exit(1)

result = orch.scan_quick(scope=None, on_progress=lambda p: None)
print(f"Findings: {len(result.findings)}")

# Check first few findings of each rule_id
from collections import Counter
rule_ids = Counter()
for f in result.findings:
    if isinstance(f, dict):
        rule_ids[f.get("rule_id", "")] += 1
print(f"\nRule ID counts: {dict(rule_ids)}")

# Show details for first finding of each rule_id
seen_rules = set()
for f in result.findings:
    if isinstance(f, dict):
        rid = f.get("rule_id", "")
        if rid in seen_rules:
            continue
        seen_rules.add(rid)
        print(f"\n--- {rid} ---")
        print(f"  asset_type: {f.get('asset_type', 'MISSING')}")
        print(f"  rule_category: {f.get('rule_category', 'MISSING')}")
        print(f"  canonical_path: {f.get('canonical_path', 'MISSING')}")
        print(f"  recommended_action: {f.get('recommended_action', 'MISSING')}")
        safety = f.get("safety", {})
        if isinstance(safety, dict):
            print(f"  safety.level: {safety.get('level', 'MISSING')}")
            print(f"  safety.is_safe: {safety.get('is_safe', 'MISSING')}")
            print(f"  safety.is_blocked: {safety.get('is_blocked', 'MISSING')}")
            print(f"  safety.requires_review: {safety.get('requires_review', 'MISSING')}")
            print(f"  safety.reason: {safety.get('reason', 'MISSING')}")
        else:
            print(f"  safety: {safety}")

# Now check the action plan
plan_id = result.action_plan_id
if plan_id:
    coord = rpc.get_coordinator()
    plan = coord._plan_repo.load(plan_id)
    state_counts = Counter()
    state_by_rule = {}
    for a in plan.actions:
        state_counts[a.state.value] += 1
        rid = getattr(a, "rule_id", "")
        if rid not in state_by_rule:
            state_by_rule[rid] = Counter()
        state_by_rule[rid][a.state.value] += 1
    print(f"\nAction state counts: {dict(state_counts)}")
    print(f"\nState by rule_id:")
    for rid in sorted(state_by_rule.keys()):
        print(f"  {rid}: {dict(state_by_rule[rid])}")

    # Show details for first NOT_FIXABLE action of each rule
    seen_not_fixable = set()
    for a in plan.actions:
        rid = getattr(a, "rule_id", "")
        if a.state.value == "not_fixable" and rid not in seen_not_fixable:
            seen_not_fixable.add(rid)
            print(f"\n  NOT_FIXABLE action for {rid}:")
            print(f"    action_type: {a.action_type.value}")
            print(f"    state: {a.state.value}")
            print(f"    reason: {getattr(a, 'reason', 'MISSING')}")
            target = getattr(a, "target", None)
            if target:
                print(f"    target.canonical_path: {getattr(target, 'canonical_path', 'MISSING')}")
