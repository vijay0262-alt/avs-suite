"""Test that locked files are now classified as LOCKED_TARGET, not safe."""
import sys, os, time, uuid, tempfile
from pathlib import Path

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

# Create a locked fixture
FIXTURE_PREFIX = "AVS_LOCK_TEST_"
temp_dir = Path(os.environ.get("TEMP", tempfile.gettempdir()))
fixture = temp_dir / f"{FIXTURE_PREFIX}locked.tmp"
fixture.write_bytes(b"X" * 4096)

# Lock the file by opening it with exclusive access
import msvcrt
f = open(fixture, "rb")
try:
    msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
except OSError:
    pass

print(f"Created locked fixture: {fixture}")
print(f"Fixture exists: {fixture.exists()}")

# Run scan
result = orch.scan_quick(scope=None, on_progress=lambda p: None)
print(f"\nScan findings: {len(result.findings)}")
print(f"Statistics:")
for k, v in sorted(result.statistics.items()):
    if isinstance(v, (int, float, str)):
        print(f"  {k}: {v}")

# Check if the fixture is in the findings
fixture_found = False
fixture_safety = None
for f_dict in result.findings:
    if isinstance(f_dict, dict):
        cp = f_dict.get("canonical_path", "")
        if FIXTURE_PREFIX in cp:
            fixture_found = True
            fixture_safety = f_dict.get("safety", {})
            print(f"\nFixture finding:")
            print(f"  path: {cp}")
            print(f"  safety: {fixture_safety}")

if not fixture_found:
    print("\nFixture NOT found in findings!")

# Check action plan states
plan_id = result.action_plan_id
if plan_id:
    coord = scan_core_rpc.get_coordinator()
    plan = coord._plan_repo.load(plan_id)

    print(f"\nAction plan states:")
    from collections import Counter
    states = Counter()
    fixture_action_state = None
    for a in plan.actions:
        states[a.state.value] += 1
        target = getattr(a, "target", None)
        if target:
            cp = getattr(target, "canonical_path", "")
            if FIXTURE_PREFIX in cp:
                fixture_action_state = a.state.value
                print(f"  Fixture action state: {a.state.value}")

    print(f"  All states: {dict(states)}")

    if fixture_action_state == "locked_target":
        print(f"\nPASS: Locked fixture is classified as LOCKED_TARGET")
    elif fixture_action_state == "planned":
        print(f"\nFAIL: Locked fixture is still classified as PLANNED")
    else:
        print(f"\nUnexpected fixture action state: {fixture_action_state}")

    # Check actions_planned count
    planned_count = result.statistics.get("actions_planned", 0)
    locked_count = result.statistics.get("actions_locked_target", 0)
    print(f"\nactions_planned: {planned_count}")
    print(f"actions_locked_target: {locked_count}")

# Cleanup
try:
    msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)
except OSError:
    pass
f.close()
try:
    if fixture.exists():
        fixture.unlink()
except OSError:
    pass
