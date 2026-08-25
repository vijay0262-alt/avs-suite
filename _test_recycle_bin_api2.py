"""
Test SHEmptyRecycleBin with proper error handling.
"""
import ctypes
import os
from ctypes import wintypes

# Count files in Recycle Bin before
def count_recycle_bin_files():
    total = 0
    for drive in ["C:"]:
        rb = f"{drive}\\$Recycle.Bin"
        if not os.path.isdir(rb):
            continue
        for sid in os.listdir(rb):
            sid_path = os.path.join(rb, sid)
            try:
                for entry in os.scandir(sid_path):
                    if entry.is_file(follow_symlinks=False):
                        total += 1
            except (PermissionError, OSError):
                pass
    return total

before = count_recycle_bin_files()
print(f"Recycle Bin files before: {before}")

# Define function signature properly
shell32 = ctypes.windll.shell32
SHEmptyRecycleBinW = shell32.SHEmptyRecycleBinW
SHEmptyRecycleBinW.argtypes = [wintypes.HWND, wintypes.LPCWSTR, wintypes.DWORD]
SHEmptyRecycleBinW.restype = ctypes.c_long  # HRESULT

SHERB_NOCONFIRMATION = 0x00000001
SHERB_NOPROGRESSUI = 0x00000002
SHERB_NOSOUND = 0x00000004
flags = SHERB_NOCONFIRMATION | SHERB_NOPROGRESSUI | SHERB_NOSOUND

# Try with NULL hwnd and NULL path (empty all recycle bins)
print("\nTrying with NULL path (all drives)...")
result = SHEmptyRecycleBinW(None, None, flags)
print(f"Result: {result} (0x{result & 0xFFFFFFFF:08X})")

# Try with explicit C:\ path
print("\nTrying with C:\\ path...")
result = SHEmptyRecycleBinW(None, "C:\\", flags)
print(f"Result: {result} (0x{result & 0xFFFFFFFF:08X})")

# Check if the function exists
print(f"\nFunction address: {SHEmptyRecycleBinW}")

after = count_recycle_bin_files()
print(f"\nRecycle Bin files after: {after}")
print(f"Files removed: {before - after}")

# Also try SHQueryRecycleBin to get info
print("\n--- SHQueryRecycleBinW ---")
try:
    class SHQUERYRBINFO(ctypes.Structure):
        _fields_ = [
            ("cbSize", wintypes.DWORD),
            ("i64Size", ctypes.c_longlong),
            ("i64NumItems", ctypes.c_longlong),
        ]

    SHQueryRecycleBinW = shell32.SHQueryRecycleBinW
    SHQueryRecycleBinW.argtypes = [wintypes.LPCWSTR, ctypes.POINTER(SHQUERYRBINFO)]
    SHQueryRecycleBinW.restype = ctypes.c_long

    info = SHQUERYRBINFO()
    info.cbSize = ctypes.sizeof(SHQUERYRBINFO)
    result = SHQueryRecycleBinW("C:\\", ctypes.byref(info))
    print(f"SHQueryRecycleBinW result: {result}")
    print(f"Size: {info.i64Size} bytes")
    print(f"NumItems: {info.i64NumItems}")
except Exception as e:
    print(f"Error: {e}")
