"""
Investigate rejected actions — what types are being rejected and why?
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

# Categorize findings by rule_id
rule_counts = Counter()
for f in findings:
    if isinstance(f, dict):
        rule_counts[f.get('rule_id', 'unknown')] += 1
print(f"\nFindings by rule:")
for rule, count in rule_counts.most_common():
    print(f"  {rule}: {count}")

# Prepare and execute
coord = scan_core_rpc.get_coordinator()
preview = coord.prepare(action_plan_id)
print(f"\nPreview: total={preview.total_actions} safe={preview.safety_state_counts}")

# Execute
summary = coord.execute(
    action_plan_id,
    request_id=f"investigate-{int(time.time())}",
    approval_token=preview.approval_token,
    mode="live",
)
print(f"\nSummary: total={summary.total} completed={summary.completed} failed={summary.failed} rejected={summary.rejected}")

# Categorize rejected results
rejected_by_reason = Counter()
rejected_by_action_type = Counter()
rejected_by_rule = Counter()
for r in summary.results:
    if r.status.value == "rejected":
        rejected_by_reason[r.reason] += 1
        target = r.target if hasattr(r, 'target') else None
        if target:
            action_type = getattr(target, 'action_type', 'unknown')
            rejected_by_action_type[str(action_type)] += 1
            rule_id = getattr(r, 'rule_id', 'unknown')
            rejected_by_rule[rule_id] += 1

print(f"\nRejected by reason (top 10):")
for reason, count in rejected_by_reason.most_common(10):
    print(f"  {count}: {reason[:100]}")

print(f"\nRejected by action type:")
for at, count in rejected_by_action_type.most_common():
    print(f"  {at}: {count}")

print(f"\nRejected by rule (top 10):")
for rule, count in rejected_by_rule.most_common(10):
    print(f"  {rule}: {count}")

# Cleanup
import shutil
try: shutil.rmtree(TEST_DB_DIR)
except: pass
