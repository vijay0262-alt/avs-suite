"""Debug: check if the fixture file is being discovered at all."""
import sys, os, time, ctypes
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "backend" / "src"))

import tempfile
temp_dir = Path(os.environ.get("TEMP", tempfile.gettempdir()))
fixture = temp_dir / "AVS_DEBUG_FIND.tmp"
fixture.write_bytes(b"X" * 4096)

print(f"Fixture: {fixture}")
print(f"Exists: {fixture.exists()}")
print(f"Canonical: {fixture.resolve()}")

# Check if the file is in the scan location
from avs_backend.scan_core.enumerator import get_default_scan_locations
locations = get_default_scan_locations()
print(f"\nScan locations ({len(locations)}):")
for loc in locations:
    print(f"  {loc.label}: {loc.path}")
    if str(temp_dir).lower() in str(loc.path).lower():
        print(f"    *** TEMP IS HERE ***")

# Check if the file would be matched by the UserTempRule
from avs_backend.scan_core.rules.detection.locations import KnownLocations
user_temp_roots = KnownLocations.get_user_temp_roots()
print(f"\nUser temp roots: {user_temp_roots}")

canonical = str(fixture.resolve()).lower()
for root in user_temp_roots:
    root_str = str(root).lower()
    if canonical.startswith(root_str):
        print(f"  Fixture IS under root: {root}")
        break
else:
    print(f"  Fixture is NOT under any user temp root!")

# Now check the rule directly
from avs_backend.scan_core.rules.detection.junk_rules import UserTempRule
from avs_backend.scan_core.assets import ScanAsset, AssetType
from datetime import datetime, UTC

asset = ScanAsset(
    asset_id="test-asset",
    canonical_path=str(fixture.resolve()),
    asset_type=AssetType.FILE,
    size=4096,
    modified_time=datetime.now(UTC),
    discovered_at=datetime.now(UTC),
    custom_metadata={},
)

rule = UserTempRule()
result = rule.evaluate(asset, snapshot=None, context=None)
print(f"\nRule evaluation:")
print(f"  matched: {result.matched}")
print(f"  rule_id: {result.rule_id}")
if not result.matched:
    print(f"  reason: {result.reason}")

# Cleanup
try:
    fixture.unlink()
except OSError:
    pass
