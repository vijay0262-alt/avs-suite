"""Test: check if the fixture is in the first scan's findings."""
import sys, os, time, ctypes, tempfile
from pathlib import Path

# Delete stale database
db_path = Path(os.environ.get("LOCALAPPDATA", "")) / "AVS AI Shield" / "metadata.db"
for p in db_path.parent.glob("metadata.db*"):
    try:
        p.unlink()
    except OSError:
        pass

sys.path.insert(0, str(Path(__file__).parent / "backend" / "src"))

temp_dir = Path(os.environ.get("TEMP", tempfile.gettempdir()))
locked = temp_dir / "AVS_LOCK_TEST_X_locked.tmp"
unlocked = temp_dir / "AVS_LOCK_TEST_X_unlocked.tmp"
locked.write_bytes(b"X" * 4096)
unlocked.write_bytes(b"X" * 4096)

# Lock the file
GENERIC_READ = 0x80000000
FILE_SHARE_READ = 0x00000001
FILE_SHARE_WRITE = 0x00000002
OPEN_EXISTING = 3

CreateFileW = ctypes.windll.kernel32.CreateFileW
CreateFileW.restype = ctypes.c_void_p
CreateFileW.argtypes = [
    ctypes.c_wchar_p, ctypes.c_uint32, ctypes.c_uint32,
    ctypes.c_void_p, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_void_p
]
CloseHandle = ctypes.windll.kernel32.CloseHandle
CloseHandle.argtypes = [ctypes.c_void_p]

handle = CreateFileW(str(locked), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, None, OPEN_EXISTING, 0, None)

print(f"Locked: {locked}")
print(f"Unlocked: {unlocked}")

import avs_backend.scan_core_rpc as scan_core_rpc
scan_core_rpc._scan_orchestrator = None
scan_core_rpc._scan_orchestrator_initializing = False
scan_core_rpc._coordinator = None

orch = None
for i in range(120):
    orch = scan_core_rpc.get_scan_orchestrator()
    if orch: break
    time.sleep(1)

# Run scan_quick
result = orch.scan_quick(scope=None, on_progress=lambda p: None)
print(f"\nscan_quick findings: {len(result.findings)}")
print(f"phase_timings: {result.statistics.get('phase_timings', {})}")

# Search for fixtures
for f_dict in result.findings:
    if isinstance(f_dict, dict):
        cp = f_dict.get("canonical_path", "")
        if "avs_lock_test_x" in cp.lower():
            safety = f_dict.get("safety", {})
            print(f"  FOUND: {cp} safety={safety.get('level')}")

# Check action plan
plan_id = result.action_plan_id
if plan_id:
    coord = scan_core_rpc.get_coordinator()
    plan = coord._plan_repo.load(plan_id)
    for a in plan.actions:
        target = getattr(a, "target", None)
        if target:
            cp = getattr(target, "canonical_path", "")
            if "avs_lock_test_x" in cp.lower():
                print(f"  Action: {cp} state={a.state.value}")

    from collections import Counter
    states = Counter(a.state.value for a in plan.actions)
    print(f"\n  All states: {dict(states)}")
    print(f"  actions_planned: {result.statistics.get('actions_planned')}")
    print(f"  actions_locked_target: {result.statistics.get('actions_locked_target')}")

# Cleanup
CloseHandle(handle)
try:
    locked.unlink()
    unlocked.unlink()
except OSError:
    pass
