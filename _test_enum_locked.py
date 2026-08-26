"""Test: check if a locked file is enumerated."""
import sys, os, ctypes, tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "backend" / "src"))

temp_dir = Path(os.environ.get("TEMP", tempfile.gettempdir()))
locked = temp_dir / "AVS_ENUM_LOCK_test.tmp"
unlocked = temp_dir / "AVS_ENUM_UNLOCK_test.tmp"
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

handle = CreateFileW(
    str(locked),
    GENERIC_READ,
    FILE_SHARE_READ | FILE_SHARE_WRITE,
    None,
    OPEN_EXISTING,
    0,
    None,
)

print(f"Locked: {locked}")
print(f"Unlocked: {unlocked}")
print(f"Lock handle: {handle}")

# Enumerate
from avs_backend.scan_core.enumerator import FilesystemEnumerator, EnumerateOptions
from avs_backend.scan_core import ScanLocation

options = EnumerateOptions(check_locked=False)
enum = FilesystemEnumerator()

entries = list(enum.enumerate_locations(
    [ScanLocation(path=str(temp_dir), label="User Temp")],
    options=options,
))

locked_found = False
unlocked_found = False
for entry in entries:
    if "AVS_ENUM_LOCK_test" in entry.path:
        locked_found = True
    if "AVS_ENUM_UNLOCK_test" in entry.path:
        unlocked_found = True

print(f"\nLocked found: {locked_found}")
print(f"Unlocked found: {unlocked_found}")

# Cleanup
CloseHandle(handle)
try:
    locked.unlink()
    unlocked.unlink()
except OSError:
    pass
