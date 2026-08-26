"""Debug: check if the locked fixture file is being discovered and evaluated."""
import sys, os, time, ctypes
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "backend" / "src"))

# Create a locked fixture
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

import tempfile
temp_dir = Path(os.environ.get("TEMP", tempfile.gettempdir()))

# Create TWO fixtures: one locked, one unlocked
locked_fixture = temp_dir / "AVS_DEBUG_LOCKED2.tmp"
unlocked_fixture = temp_dir / "AVS_DEBUG_UNLOCKED2.tmp"
locked_fixture.write_bytes(b"X" * 4096)
unlocked_fixture.write_bytes(b"X" * 4096)

# Lock the first file
handle = CreateFileW(
    str(locked_fixture),
    GENERIC_READ,
    FILE_SHARE_READ | FILE_SHARE_WRITE,
    None,
    OPEN_EXISTING,
    0,
    None,
)

print(f"Locked fixture: {locked_fixture}")
print(f"Unlocked fixture: {unlocked_fixture}")

# Run scan with no filter
import avs_backend.scan_core_rpc as scan_core_rpc
scan_core_rpc._scan_orchestrator = None
scan_core_rpc._scan_orchestrator_initializing = False
scan_core_rpc._coordinator = None

orch = None
for i in range(120):
    orch = scan_core_rpc.get_scan_orchestrator()
    if orch: break
    time.sleep(1)

from avs_backend.scan_core.context import ScanType
result = orch.scan(
    ScanType.QUICK,
    scope=None,
    on_progress=lambda p: None,
    generate_action_plan=True,
    dashboard_eligible_only=False,
)

print(f"\nTotal findings: {len(result.findings)}")

# Search for both fixtures
for f_dict in result.findings:
    if isinstance(f_dict, dict):
        cp = f_dict.get("canonical_path", "")
        if "AVS_DEBUG" in cp:
            safety = f_dict.get("safety", {})
            print(f"\nFOUND: {cp}")
            print(f"  rule_id: {f_dict.get('rule_id')}")
            print(f"  safety: {safety}")

# Also check the action plan
plan_id = result.action_plan_id
if plan_id:
    coord = scan_core_rpc.get_coordinator()
    plan = coord._plan_repo.load(plan_id)
    for a in plan.actions:
        target = getattr(a, "target", None)
        if target:
            cp = getattr(target, "canonical_path", "")
            if "AVS_DEBUG" in cp:
                print(f"\nAction: {cp} state={a.state.value}")

# Cleanup
CloseHandle(handle)
try:
    locked_fixture.unlink()
    unlocked_fixture.unlink()
except OSError:
    pass
