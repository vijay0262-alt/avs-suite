"""Test locked file classification — create fixture BEFORE orchestrator init."""
import sys, os, time, ctypes, tempfile
from pathlib import Path

# Delete any stale database
db_path = Path(os.environ.get("LOCALAPPDATA", "")) / "AVS AI Shield" / "metadata.db"
for p in db_path.parent.glob("metadata.db*"):
    try:
        p.unlink()
    except OSError:
        pass

sys.path.insert(0, str(Path(__file__).parent / "backend" / "src"))

# Create the locked fixture FIRST, before any orchestrator init
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

temp_dir = Path(os.environ.get("TEMP", tempfile.gettempdir()))
locked_fixture = temp_dir / "AVS_LOCK_FINAL_locked.tmp"
unlocked_fixture = temp_dir / "AVS_LOCK_FINAL_unlocked.tmp"
locked_fixture.write_bytes(b"X" * 4096)
unlocked_fixture.write_bytes(b"X" * 4096)

# Lock the locked fixture
handle = CreateFileW(
    str(locked_fixture),
    GENERIC_READ,
    FILE_SHARE_READ | FILE_SHARE_WRITE,  # NOT FILE_SHARE_DELETE
    None,
    OPEN_EXISTING,
    0,
    None,
)

print(f"Locked fixture: {locked_fixture}")
print(f"Unlocked fixture: {unlocked_fixture}")
print(f"Lock handle: {handle}")

# NOW initialize the orchestrator
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

# Run scan
result = orch.scan_quick(scope=None, on_progress=lambda p: None)
print(f"\nScan findings: {len(result.findings)}")
print(f"Statistics:")
for k, v in sorted(result.statistics.items()):
    if isinstance(v, (int, float, str)):
        print(f"  {k}: {v}")

# Check if fixtures are in findings
for f_dict in result.findings:
    if isinstance(f_dict, dict):
        cp = f_dict.get("canonical_path", "")
        if "AVS_LOCK_FINAL" in cp:
            safety = f_dict.get("safety", {})
            print(f"\nFinding: {cp}")
            print(f"  safety: {safety}")

# Also check with no filter
from avs_backend.scan_core.context import ScanType
result2 = orch.scan(
    ScanType.QUICK,
    scope=None,
    on_progress=lambda p: None,
    generate_action_plan=True,
    dashboard_eligible_only=False,
)
print(f"\nNo-filter findings: {len(result2.findings)}")
for f_dict in result2.findings:
    if isinstance(f_dict, dict):
        cp = f_dict.get("canonical_path", "")
        if "avs_lock_final" in cp.lower():
            safety = f_dict.get("safety", {})
            print(f"  {cp} safety={safety.get('level')}")

# Check action plan
plan_id = result.action_plan_id
if plan_id:
    coord = scan_core_rpc.get_coordinator()
    plan = coord._plan_repo.load(plan_id)

    from collections import Counter
    states = Counter()
    for a in plan.actions:
        states[a.state.value] += 1
        target = getattr(a, "target", None)
        if target:
            cp = getattr(target, "canonical_path", "")
            if "AVS_LOCK_FINAL" in cp:
                print(f"\nAction: {cp} state={a.state.value}")

    print(f"\nAll states: {dict(states)}")

    locked_count = result.statistics.get("actions_locked_target", 0)
    planned_count = result.statistics.get("actions_planned", 0)
    print(f"\nactions_planned: {planned_count}")
    print(f"actions_locked_target: {locked_count}")

# Cleanup
CloseHandle(handle)
try:
    locked_fixture.unlink()
    unlocked_fixture.unlink()
except OSError:
    pass
