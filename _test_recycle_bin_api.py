"""
Test SHEmptyRecycleBin directly.
"""
import ctypes
import os
from pathlib import Path

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

# Call SHEmptyRecycleBin
SHERB_NOCONFIRMATION = 0x00000001
SHERB_NOPROGRESSUI = 0x00000002
SHERB_NOSOUND = 0x00000004

shell32 = ctypes.windll.shell32
flags = SHERB_NOCONFIRMATION | SHERB_NOPROGRESSUI | SHERB_NOSOUND

# Try for C: drive
result = shell32.SHEmptyRecycleBinW(None, "C:\\", flags)
print(f"SHEmptyRecycleBinW result: {result}")

# Check GetLastError
err = ctypes.get_last_error()
print(f"GetLastError: {err}")

# Try with format message
if result != 0:
    try:
        buf = ctypes.create_unicode_buffer(512)
        ctypes.windll.kernel32.FormatMessageW(
            0x00001000,  # FORMAT_MESSAGE_FROM_SYSTEM
            None,
            err,
            0,
            buf,
            512,
            None,
        )
        print(f"Error message: {buf.value}")
    except Exception as e:
        print(f"FormatMessage failed: {e}")

after = count_recycle_bin_files()
print(f"Recycle Bin files after: {after}")
print(f"Files removed: {before - after}")
