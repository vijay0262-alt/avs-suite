"""Debug: check the canonical path format of discovered assets."""
import sys, os, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "backend" / "src"))

import tempfile
temp_dir = Path(os.environ.get("TEMP", tempfile.gettempdir()))
fixture = temp_dir / "AVS_DEBUG_PATH.tmp"
fixture.write_bytes(b"X" * 4096)

print(f"Fixture: {fixture}")

# Enumerate and check the canonical path
from avs_backend.scan_core.enumerator import FilesystemEnumerator, EnumerateOptions
from avs_backend.scan_core import ScanLocation

options = EnumerateOptions(check_locked=False)
enum = FilesystemEnumerator()

entries = list(enum.enumerate_locations(
    [ScanLocation(path=str(temp_dir), label="User Temp")],
    options=options,
))

for entry in entries:
    if "AVS_DEBUG_PATH" in entry.path:
        print(f"\nEntry path: {entry.path}")
        print(f"Entry name: {entry.name}")
        print(f"Entry type: {type(entry).__name__}")
        # Check if canonical_path would match
        from avs_backend.scan_core.rules.detection.locations import KnownLocations
        asset_parts = KnownLocations._normalize_windows_path(entry.path)
        print(f"Normalized parts: {asset_parts}")
        
        roots = KnownLocations.get_user_temp_roots()
        for root in roots:
            root_parts = KnownLocations._normalize_windows_path(str(root))
            print(f"Root parts: {root_parts}")
            if len(asset_parts) >= len(root_parts) and asset_parts[:len(root_parts)] == root_parts:
                print(f"  MATCH!")
            else:
                print(f"  NO MATCH")
        break
else:
    print("Fixture NOT found in enumeration!")

# Cleanup
try:
    fixture.unlink()
except OSError:
    pass
