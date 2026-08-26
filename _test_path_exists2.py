"""Test: does os.path.lexists work with forward slashes on Windows?"""
import os, tempfile
from pathlib import Path

temp_dir = Path(os.environ.get("TEMP", tempfile.gettempdir()))
test_file = temp_dir / "AVS_PATH_TEST.tmp"
test_file.write_bytes(b"X" * 4096)

# Test with backslashes
p1 = str(test_file)
print(f"Backslash: {p1}")
print(f"  lexists: {os.path.lexists(p1)}")

# Test with forward slashes
p2 = p1.replace("\\", "/")
print(f"Forward: {p2}")
print(f"  lexists: {os.path.lexists(p2)}")

# Test with lowercase forward slashes (canonical path format)
p3 = p2.lower()
print(f"Lower forward: {p3}")
print(f"  lexists: {os.path.lexists(p3)}")

# Test with Path object
p4 = Path(p3)
print(f"Path(lower forward): {p4}")
print(f"  exists: {p4.exists()}")
print(f"  lexists: {os.path.lexists(p4)}")

# Test os.access
print(f"\nos.access(W_OK) backslash: {os.access(p1, os.W_OK)}")
print(f"os.access(W_OK) forward: {os.access(p2, os.W_OK)}")
print(f"os.access(W_OK) lower forward: {os.access(p3, os.W_OK)}")

# Cleanup
test_file.unlink()
