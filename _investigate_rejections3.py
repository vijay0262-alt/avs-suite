"""
Check action types and states for all actions in the plan.
"""
import os
import sys
import time
import tempfile
import json
from pathlib import Path
from collections import Counter

TEST_DB_DIR = Path(tempfile.mkdtemp(prefix="avs_test_db_"))
os.environ["AVS_DB_PATH"] = str(TEST_DB_DIR / "test.db")
os.environ["AVS_DATA_DIR"] = str(TEST_DB_DIR)

sys.path.insert(0, str(Path(__file__).parent / "backend" / "src"))

import avs_backend.scan_core_rpc as scan_core_rpc
scan_core_rpc._scan_orchestrator = None
scan_core_rpc._scan_orchestrator_initializing = False
scan_core_rpc._coordinator = None

orchestrator = None
for i in range(120):
    orchestrator = scan_core_rpc.get_scan_orchestrator()
    if orchestrator is not None:
        break
    time.sleep(1)

print(f"Orchestrator ready after ~{i}s")

result = orchestrator.scan_quick(scope=None, on_progress=lambda p: None)
action_plan_id = result.action_plan_id
print(f"Action plan ID: {action_plan_id}")

coord = scan_core_rpc.get_coordinator()
preview = coord.prepare(action_plan_id)
print(f"Preview: {preview.safety_state_counts}")

plan = coord._plan_repo.load(action_plan_id)
if plan:
    actions = list(plan.actions)
    print(f"Total actions: {len(actions)}")

    # Categorize by state and action_type
    state_counts = Counter()
    action_type_by_state = {}
    for action in actions:
        state = action.state.value if action.state else "unknown"
        state_counts[state] += 1

        at = getattr(action, 'action_type', None)
        at_val = at.value if at else "None"
        key = f"{state}/{at_val}"
        if key not in action_type_by_state:
            action_type_by_state[key] = 0
        action_type_by_state[key] += 1

    print(f"\nActions by state:")
    for state, count in state_counts.most_common():
        print(f"  {state}: {count}")

    print(f"\nActions by state/action_type:")
    for key, count in sorted(action_type_by_state.items()):
        print(f"  {key}: {count}")

    # Check planned actions specifically
    planned = [a for a in actions if a.state.value == "planned"]
    print(f"\nPlanned actions: {len(planned)}")
    if planned:
        # Check first few planned actions
        for a in planned[:3]:
            target = getattr(a, 'target', None)
            target_dict = target.to_dict() if target and hasattr(target, 'to_dict') else {}
            print(f"  action_type={a.action_type.value if a.action_type else 'None'} "
                  f"rule_id={getattr(a, 'rule_id', 'N/A')} "
                  f"target_path={target_dict.get('canonical_path', 'N/A')}")

        # Check context for planned actions
        context_provider = coord._context_provider(plan)
        accessible = 0
        not_accessible = 0
        locked = 0
        no_context = 0
        for action in planned:
            ctx = context_provider(action)
            if ctx is None:
                no_context += 1
            elif isinstance(ctx, dict):
                if not ctx.get("exists", False):
                    no_context += 1
                elif not ctx.get("accessible", False):
                    not_accessible += 1
                elif ctx.get("locked", False):
                    locked += 1
                else:
                    accessible += 1

        print(f"\nPlanned actions context:")
        print(f"  Accessible: {accessible}")
        print(f"  Not accessible: {not_accessible}")
        print(f"  Locked: {locked}")
        print(f"  No context: {no_context}")

import shutil
try: shutil.rmtree(TEST_DB_DIR)
except: pass
