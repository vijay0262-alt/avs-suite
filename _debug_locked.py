"""Debug: check if the locked fixture is being discovered at all."""
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
fixture = temp_dir / "AVS_DEBUG_LOCKED.tmp"
fixture.write_bytes(b"X" * 4096)

# Lock the file
handle = CreateFileW(
    str(fixture),
    GENERIC_READ,
    FILE_SHARE_READ | FILE_SHARE_WRITE,
    None,
    OPEN_EXISTING,
    0,
    None,
)

print(f"Fixture: {fixture}")
print(f"Exists: {fixture.exists()}")
print(f"Handle: {handle}")

# Check if the file is accessible
print(f"os.access(W_OK): {os.access(fixture, os.W_OK)}")

# Now run a scan and check ALL findings (not just safe ones)
import avs_backend.scan_core_rpc as scan_core_rpc
scan_core_rpc._scan_orchestrator = None
scan_core_rpc._scan_orchestrator_initializing = False
scan_core_rpc._coordinator = None

orch = None
for i in range(120):
    orch = scan_core_rpc.get_scan_orchestrator()
    if orch: break
    time.sleep(1)

# Use scan() directly with dashboard_eligible_only=False to see ALL findings
from avs_backend.scan_core.context import ScanType
result = orch.scan(
    ScanType.QUICK,
    scope=None,
    on_progress=lambda p: None,
    generate_action_plan=True,
    dashboard_eligible_only=False,  # See ALL findings
)

print(f"\nTotal findings (no filter): {len(result.findings)}")

# Search for our fixture
for f_dict in result.findings:
    if isinstance(f_dict, dict):
        cp = f_dict.get("canonical_path", "")
        if "AVS_DEBUG_LOCKED" in cp:
            safety = f_dict.get("safety", {})
            print(f"\nFOUND fixture in findings:")
            print(f"  path: {cp}")
            print(f"  rule_id: {f_dict.get('rule_id')}")
            print(f"  safety: {safety}")
            break
else:
    print("\nFixture NOT found in findings!")
    # Check if it's in the assets
    print(f"Checking assets_discovered: {result.statistics.get('assets_discovered')}")

# Cleanup
CloseHandle(handle)
try:
    fixture.unlink()
except OSError:
    pass
