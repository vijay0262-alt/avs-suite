"""Test that locked files are now classified as LOCKED_TARGET, not safe.
Use a proper Windows lock via CreateFileW with FILE_SHARE_DELETE=0.
"""
import sys, os, time, uuid, tempfile, ctypes
from pathlib import Path
from ctypes import wintypes

sys.path.insert(0, str(Path(__file__).parent / "backend" / "src"))

# First, let's test _check_file_locked directly
from avs_backend.scan_core.orchestration.remediation import _check_file_locked

temp_dir = Path(os.environ.get("TEMP", tempfile.gettempdir()))
fixture = temp_dir / "AVS_LOCK_TEST2_locked.tmp"
fixture.write_bytes(b"X" * 4096)

# Test 1: unlocked file
print(f"Test 1: Unlocked file")
print(f"  _check_file_locked: {_check_file_locked(str(fixture))}")

# Test 2: lock the file using CreateFileW with no DELETE sharing
GENERIC_READ = 0x80000000
GENERIC_WRITE = 0x40000000
FILE_SHARE_READ = 0x00000001
FILE_SHARE_WRITE = 0x00000002
FILE_SHARE_DELETE = 0x00000004
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

# Open with READ access but NO FILE_SHARE_DELETE — this prevents
# the _check_file_locked probe from getting DELETE access
handle = CreateFileW(
    str(fixture),
    GENERIC_READ,
    FILE_SHARE_READ | FILE_SHARE_WRITE,  # NOT FILE_SHARE_DELETE
    None,
    OPEN_EXISTING,
    0,
    None,
)

print(f"\nTest 2: Locked file (no DELETE sharing)")
print(f"  Handle: {handle} (invalid: {INVALID_HANDLE_VALUE})")
if handle != INVALID_HANDLE_VALUE and handle != 0:
    print(f"  _check_file_locked: {_check_file_locked(str(fixture))}")
    CloseHandle(handle)
else:
    print(f"  Failed to open file for locking")

# Test 3: lock with WRITE access and no sharing at all
handle2 = CreateFileW(
    str(fixture),
    GENERIC_READ | GENERIC_WRITE,
    0,  # No sharing at all
    None,
    OPEN_EXISTING,
    0,
    None,
)

print(f"\nTest 3: Locked file (no sharing at all)")
print(f"  Handle: {handle2}")
if handle2 != INVALID_HANDLE_VALUE and handle2 != 0:
    print(f"  _check_file_locked: {_check_file_locked(str(fixture))}")
    CloseHandle(handle2)
else:
    print(f"  Failed to open file for locking")

# Cleanup
try:
    fixture.unlink()
except OSError:
    pass
