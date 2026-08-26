"""Test the full scan → optimize flow with a locked fixture."""
import sys, os, time, ctypes, tempfile
from pathlib import Path

# Delete stale DB
db_path = Path(os.environ.get("LOCALAPPDATA", "")) / "AVS Shield" / "metadata.db"
for p in db_path.parent.glob("metadata.db*"):
    try: p.unlink()
    except: pass

sys.path.insert(0, str(Path(__file__).parent / "backend" / "src"))

temp_dir = Path(os.environ.get("TEMP", tempfile.gettempdir()))
locked = temp_dir / "AVS_OPT_TEST_locked.tmp"
unlocked = temp_dir / "AVS_OPT_TEST_unlocked.tmp"
locked.write_bytes(b"X" * 4096)
unlocked.write_bytes(b"X" * 4096)

# Lock the file
GENERIC_READ = 0x80000000
FILE_SHARE_READ = 0x00000001
FILE_SHARE_WRITE = 0x00000002
OPEN_EXISTING = 3
CreateFileW = ctypes.windll.kernel32.CreateFileW
CreateFileW.restype = ctypes.c_void_p
CreateFileW.argtypes = [ctypes.c_wchar_p, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_void_p, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_void_p]
CloseHandle = ctypes.windll.kernel32.CloseHandle
CloseHandle.argtypes = [ctypes.c_void_p]
handle = CreateFileW(str(locked), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, None, OPEN_EXISTING, 0, None)

print(f"Locked: {locked}")
print(f"Unlocked: {unlocked}")

import avs_backend.scan_core_rpc as rpc
rpc._scan_orchestrator = None
rpc._scan_orchestrator_initializing = False
rpc._coordinator = None

orch = rpc.get_scan_orchestrator()
result = orch.scan_quick(scope=None, on_progress=lambda p: None)
plan_id = result.action_plan_id
print(f"\nScan: {len(result.findings)} findings")
print(f"actions_planned: {result.statistics.get('actions_planned')}")
print(f"actions_locked_target: {result.statistics.get('actions_locked_target')}")

# Now run auto-optimize
print(f"\nStarting auto-optimize for plan {plan_id}...")
opt_result = rpc._scan_core_dashboard_auto_optimize({"plan_id": plan_id})
print(f"Auto-optimize started: {opt_result}")
session_id = opt_result.get("session_id")

# Poll until complete
for i in range(120):
    status = rpc._scan_core_dashboard_auto_optimize_status({"session_id": session_id})
    phase = status.get("phase", "?")
    msg = status.get("message", "")
    completed = status.get("completed", False)
    if completed or phase in ("error", "complete"):
        print(f"\nFinal status: phase={phase} message={msg}")
        print(f"Full status: {status}")
        break
    if i % 5 == 0:
        print(f"  [{i}] phase={phase} msg={msg} progress={status.get('overall_progress', 0)}%")
    time.sleep(2)
else:
    print("TIMEOUT waiting for optimization")
    status = rpc._scan_core_dashboard_auto_optimize_status({"session_id": session_id})
    print(f"Last status: {status}")

# Check if the unlocked file was deleted and the locked file remains
print(f"\nUnlocked exists: {unlocked.exists()}")
print(f"Locked exists: {locked.exists()}")

# Cleanup
CloseHandle(handle)
try: locked.unlink()
except: pass
try:
    if unlocked.exists(): unlocked.unlink()
except: pass
