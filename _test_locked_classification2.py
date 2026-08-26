"""Test that locked files are classified as LOCKED_TARGET after revalidation."""
import sys, os, time, uuid, tempfile, ctypes
from pathlib import Path
from ctypes import wintypes

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

# Create a locked fixture using CreateFileW with no DELETE sharing
GENERIC_READ = 0x80000000
FILE_SHARE_READ = 0x00000001
FILE_SHARE_WRITE = 0x00000002
OPEN_EXISTING = 3
INVALID_HANDLE_VALUE = ctypes.c_void_p(-1).value

CreateFileW = ctypes.windll.kernel32.CreateFileW
CreateFileW.restype = ctypes.c_void_p
CreateFileW.argtypes = [
    ctypes.c_wchar_p, ctypes.c_uint32, ctypes.c_uint32,
    ctypes.c_void_p, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_void_p
]
CloseHandle = ctypes.windll.kernel32.CloseHandle
CloseHandle.argtypes = [ctypes.c_void_p]

FIXTURE_PREFIX = "AVS_LOCK_TEST3_"
temp_dir = Path(os.environ.get("TEMP", tempfile.gettempdir()))
fixture = temp_dir / f"{FIXTURE_PREFIX}locked.tmp"
fixture.write_bytes(b"X" * 4096)

# Lock the file
handle = CreateFileW(
    str(fixture),
    GENERIC_READ,
    FILE_SHARE_READ | FILE_SHARE_WRITE,  # NOT FILE_SHARE_DELETE
    None,
    OPEN_EXISTING,
    0,
    None,
)

print(f"Created locked fixture: {fixture}")
print(f"Lock handle: {handle}")

# Run scan
result = orch.scan_quick(scope=None, on_progress=lambda p: None)
print(f"\nScan findings: {len(result.findings)}")
print(f"Statistics:")
for k, v in sorted(result.statistics.items()):
    if isinstance(v, (int, float, str)):
        print(f"  {k}: {v}")

# Check if the fixture is in the findings
fixture_found = False
for f_dict in result.findings:
    if isinstance(f_dict, dict):
        cp = f_dict.get("canonical_path", "")
        if FIXTURE_PREFIX in cp:
            fixture_found = True
            safety = f_dict.get("safety", {})
            print(f"\nFixture finding:")
            print(f"  path: {cp}")
            print(f"  safety: {safety}")

if not fixture_found:
    print("\nFixture NOT found in findings!")

# Check action plan states
plan_id = result.action_plan_id
if plan_id:
    coord = scan_core_rpc.get_coordinator()
    plan = coord._plan_repo.load(plan_id)

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

    print(f"\nAction plan states: {dict(states)}")
    print(f"Fixture action state: {fixture_action_state}")

    if fixture_action_state == "locked_target":
        print(f"\nPASS: Locked fixture is classified as LOCKED_TARGET")
    elif fixture_action_state == "planned":
        print(f"\nFAIL: Locked fixture is still classified as PLANNED")
    else:
        print(f"\nUnexpected fixture action state: {fixture_action_state}")

# Cleanup
CloseHandle(handle)
try:
    if fixture.exists():
        fixture.unlink()
except OSError:
    pass
