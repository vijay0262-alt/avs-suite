"""
Investigate WHY actions are rejected by SafetyGate — check accessible/locked/exists.
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

# Scan
result = orchestrator.scan_quick(scope=None, on_progress=lambda p: None)
findings = list(result.findings) if result.findings else []
action_plan_id = result.action_plan_id
print(f"Findings: {len(findings)}")

# Prepare
coord = scan_core_rpc.get_coordinator()
preview = coord.prepare(action_plan_id)
print(f"Preview: {preview.safety_state_counts}")

# Get the plan and check each action's context
plan = coord._plan_repo.load(action_plan_id)
if plan:
    actions = list(plan.actions)
    print(f"Plan actions: {len(actions)}")

    # Check context for each action
    context_provider = coord._context_provider(plan)

    rejection_reasons = Counter()
    accessible_count = 0
    not_accessible_count = 0
    locked_count = 0
    not_exists_count = 0
    no_context_count = 0
    no_canonical_path_count = 0

    for action in actions[:200]:  # Check first 200
        ctx = context_provider(action)
        if ctx is None:
            no_context_count += 1
            action_type = getattr(action, 'action_type', None)
            rejection_reasons[f"no_context: {action_type.value if action_type else 'unknown'}"] += 1
            continue

        if isinstance(ctx, dict):
            exists = ctx.get("exists", False)
            accessible = ctx.get("accessible", False)
            locked = ctx.get("locked", False)
            canonical = ctx.get("canonical_path", "")

            if not exists:
                not_exists_count += 1
                rejection_reasons["not_exists"] += 1
            elif not accessible:
                not_accessible_count += 1
                rejection_reasons[f"not_accessible: {Path(canonical).parent.name}"] += 1
            elif locked:
                locked_count += 1
                rejection_reasons["locked"] += 1
            else:
                accessible_count += 1

    print(f"\nContext analysis (first 200 actions):")
    print(f"  Accessible (would be approved): {accessible_count}")
    print(f"  Not accessible: {not_accessible_count}")
    print(f"  Locked: {locked_count}")
    print(f"  Not exists: {not_exists_count}")
    print(f"  No context (non-filesystem): {no_context_count}")

    print(f"\nRejection reasons (top 15):")
    for reason, count in rejection_reasons.most_common(15):
        print(f"  {count}: {reason}")

# Cleanup
import shutil
try: shutil.rmtree(TEST_DB_DIR)
except: pass
