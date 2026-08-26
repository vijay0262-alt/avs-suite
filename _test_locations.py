"""Test: create fixture, then check if it's in the scan locations."""
import sys, os, time, ctypes, tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "backend" / "src"))

temp_dir = Path(os.environ.get("TEMP", tempfile.gettempdir()))
fixture = temp_dir / "AVS_LOCK_FINAL3.tmp"
fixture.write_bytes(b"X" * 4096)

print(f"Fixture: {fixture}")
print(f"Exists: {fixture.exists()}")

# Check scan locations
from avs_backend.scan_core.orchestration.discovery import FilesystemDiscoveryEngine
from avs_backend.scan_core.context import ScanContext, ScanType
from avs_backend.scan_core.rules.evaluator import CancellationToken

engine = FilesystemDiscoveryEngine()

# Create a scan context
scan_context = ScanContext(
    scan_id="test-scan",
    scan_type=ScanType.QUICK,
    started_at=time.time(),
    machine_id_hash="test",
    user_id_hash="test",
)

# Get quick scan locations
locations = engine._get_quick_scan_locations()
print(f"\nQuick scan locations ({len(locations)}):")
for loc in locations:
    print(f"  {loc.label}: {loc.path}")
    if str(temp_dir).lower() in str(loc.path).lower() or str(loc.path).lower() in str(temp_dir).lower():
        print(f"    *** MATCHES TEMP ***")

# Now enumerate and check
from avs_backend.scan_core.enumerator import FilesystemEnumerator, EnumerateOptions
options = EnumerateOptions(check_locked=False)
enum = FilesystemEnumerator()

found = False
for entry in enum.enumerate_locations(locations, options=options):
    if "AVS_LOCK_FINAL3" in entry.path:
        print(f"\nFOUND in enumeration: {entry.path}")
        found = True
        break

if not found:
    print(f"\nNOT FOUND in enumeration!")

# Cleanup
try:
    fixture.unlink()
except OSError:
    pass
