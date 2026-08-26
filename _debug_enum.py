"""Debug: enumerate the temp directory directly to see if the fixture shows up."""
import sys, os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "backend" / "src"))

import tempfile
temp_dir = Path(os.environ.get("TEMP", tempfile.gettempdir()))
fixture = temp_dir / "AVS_DEBUG_ENUM.tmp"
fixture.write_bytes(b"X" * 4096)

print(f"Fixture: {fixture}")
print(f"Exists: {fixture.exists()}")

# Enumerate the temp directory directly
from avs_backend.scan_core.enumerator import FilesystemEnumerator, EnumerateOptions
from avs_backend.scan_core import ScanLocation

options = EnumerateOptions(
    check_locked=False,
)

enum = FilesystemEnumerator()
entries = list(enum.enumerate_locations(
    [ScanLocation(path=str(temp_dir), label="User Temp")],
    options=options,
))

print(f"\nTotal entries: {len(entries)}")

# Search for our fixture
found = False
for entry in entries:
    if "AVS_DEBUG_ENUM" in entry.path:
        print(f"FOUND: {entry.path} (type={type(entry).__name__})")
        found = True
        break

if not found:
    print("Fixture NOT found in enumeration!")
    # Show first 10 entries
    print("\nFirst 10 entries:")
    for entry in entries[:10]:
        print(f"  {entry.path}")

# Cleanup
try:
    fixture.unlink()
except OSError:
    pass
