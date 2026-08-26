"""Debug: check if the fixture is discovered and converted to an asset."""
import sys, os, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "backend" / "src"))

import tempfile
temp_dir = Path(os.environ.get("TEMP", tempfile.gettempdir()))
fixture = temp_dir / "AVS_DEBUG_ASSET.tmp"
fixture.write_bytes(b"X" * 4096)

print(f"Fixture: {fixture}")

# Enumerate and convert to asset
from avs_backend.scan_core.enumerator import FilesystemEnumerator, EnumerateOptions
from avs_backend.scan_core import ScanLocation
from avs_backend.scan_core.adapters.adapter_registry import convert_to_asset

options = EnumerateOptions(check_locked=False)
enum = FilesystemEnumerator()

for entry in enum.enumerate_locations(
    [ScanLocation(path=str(temp_dir), label="User Temp")],
    options=options,
):
    if "AVS_DEBUG_ASSET" in entry.path:
        print(f"\nEntry: {entry.path}")
        try:
            asset = convert_to_asset(entry)
            print(f"Asset: {asset}")
            print(f"  asset_id: {asset.asset_id}")
            print(f"  canonical_path: {asset.canonical_path}")
            print(f"  asset_type: {asset.asset_type}")
            print(f"  display_name: {asset.display_name}")
            
            # Now evaluate the UserTempRule
            from avs_backend.scan_core.rules.detection.junk_rules import UserTempRule
            rule = UserTempRule()
            result = rule.evaluate(asset, snapshot=None, context=None)
            print(f"\nRule result:")
            print(f"  matched: {result.matched}")
            print(f"  rule_id: {result.rule_id}")
            if not result.matched:
                print(f"  reason: {result.reason}")
            else:
                print(f"  safety: {result.safety}")
        except Exception as e:
            print(f"Error: {e}")
        break
else:
    print("Fixture NOT found in enumeration!")

# Cleanup
try:
    fixture.unlink()
except OSError:
    pass
