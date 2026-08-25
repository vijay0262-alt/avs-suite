"""
Categorize the 1303 not-accessible files by parent directory.
"""
import os
import sys
import time
import tempfile
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

result = orchestrator.scan_quick(scope=None, on_progress=lambda p: None)
action_plan_id = result.action_plan_id

coord = scan_core_rpc.get_coordinator()
preview = coord.prepare(action_plan_id)
plan = coord._plan_repo.load(action_plan_id)

planned = [a for a in plan.actions if a.state.value == "planned"]
context_provider = coord._context_provider(plan)

not_accessible_dirs = Counter()
not_accessible_rules = Counter()
accessible_rules = Counter()

for action in planned:
    ctx = context_provider(action)
    if ctx is None:
        continue
    if isinstance(ctx, dict):
        if not ctx.get("exists", False):
            continue
        if not ctx.get("accessible", False):
            canonical = ctx.get("canonical_path", "")
            # Get the parent directory category
            p = Path(canonical)
            # Get a meaningful parent path (e.g. C:\Windows\Prefetch)
            parts = p.parts
            if len(parts) >= 4:
                parent_key = str(Path(*parts[:4])).lower()
            else:
                parent_key = str(p.parent).lower()
            not_accessible_dirs[parent_key] += 1
            not_accessible_rules[getattr(action, 'rule_id', 'unknown')] += 1
        else:
            accessible_rules[getattr(action, 'rule_id', 'unknown')] += 1

print("Not accessible by parent directory (top 15):")
for d, count in not_accessible_dirs.most_common(15):
    print(f"  {count}: {d}")

print("\nNot accessible by rule (top 10):")
for r, count in not_accessible_rules.most_common(10):
    print(f"  {count}: {r}")

print("\nAccessible by rule (top 10):")
for r, count in accessible_rules.most_common(10):
    print(f"  {count}: {r}")

import shutil
try: shutil.rmtree(TEST_DB_DIR)
except: pass
