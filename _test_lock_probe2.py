"""Test: check if _check_file_locked detects our lock."""
import sys, os, ctypes, tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "backend" / "src"))

temp_dir = Path(os.environ.get("TEMP", tempfile.gettempdir()))
locked = temp_dir / "AVS_LOCK_PROBE_test.tmp"
locked.write_bytes(b"X" * 4096)

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
print(f"Handle: {handle}")

# Check with _check_file_locked
from avs_backend.scan_core.orchestration.remediation import _check_file_locked
print(f"_check_file_locked: {_check_file_locked(str(locked))}")

# Also check with the canonical path (lowercase, forward slashes)
canonical = str(locked).replace("\\", "/").lower()
print(f"Canonical: {canonical}")
print(f"_check_file_locked(canonical): {_check_file_locked(canonical)}")

# Cleanup
CloseHandle(handle)
try:
    locked.unlink()
except OSError:
    pass
