"""Test: check if os.path.lexists works with forward slashes."""
import os
from pathlib import Path

# Test with backslashes (Windows native)
p1 = r"C:\Users\HPBP\AppData\Local\Temp\AVS_LOCK_PROBE_test.tmp"
print(f"lexists(backslash): {os.path.lexists(p1)}")

# Test with forward slashes
p2 = "c:/users/hpbp/appdata/local/temp/avs_lock_probe_test.tmp"
print(f"lexists(forward): {os.path.lexists(p2)}")

# Test with Path
p3 = Path(p2)
print(f"Path.lexists(): {p3.exists()}")
print(f"os.path.lexists(Path): {os.path.lexists(p3)}")
