"""Debug: check scan context and asset repository."""
import sys, os, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "backend" / "src"))

import tempfile
temp_dir = Path(os.environ.get("TEMP", tempfile.gettempdir()))
fixture = temp_dir / "AVS_DEBUG_CTX.tmp"
fixture.write_bytes(b"X" * 4096)

print(f"Fixture: {fixture}")

import avs_backend.scan_core_rpc as scan_core_rpc
scan_core_rpc._scan_orchestrator = None
scan_core_rpc._scan_orchestrator_initializing = False
scan_core_rpc._coordinator = None

orch = None
for i in range(120):
    orch = scan_core_rpc.get_scan_orchestrator()
    if orch: break
    time.sleep(1)

# Check the orchestrator's database
print(f"DB path: {orch._db}")

# Run scan
from avs_backend.scan_core.context import ScanType
result = orch.scan(
    ScanType.QUICK,
    scope=None,
    on_progress=lambda p: None,
    generate_action_plan=True,
    dashboard_eligible_only=False,
)

print(f"\nScan ID: {result.scan_id}")
print(f"Total findings: {len(result.findings)}")
print(f"Assets discovered: {result.statistics.get('assets_discovered')}")

# Check the asset repository for our fixture
from avs_backend.scan_core.adapters.adapter_registry import convert_to_asset
from avs_backend.scan_core.enumerator import FilesystemEnumerator, EnumerateOptions
from avs_backend.scan_core import ScanLocation

options = EnumerateOptions(check_locked=False)
enum = FilesystemEnumerator()

for entry in enum.enumerate_locations(
    [ScanLocation(path=str(temp_dir), label="User Temp")],
    options=options,
):
    if "AVS_DEBUG_CTX" in entry.path:
        asset = convert_to_asset(entry)
        print(f"\nAsset ID: {asset.asset_id}")
        print(f"Canonical: {asset.canonical_path}")
        
        # Check if this asset is in the repository
        repo_asset = orch._asset_repo.get(asset.asset_id)
        print(f"In repo: {repo_asset is not None}")
        if repo_asset:
            print(f"Repo canonical: {repo_asset.canonical_path}")
        
        # Check snapshots for this asset
        snaps = orch._snapshot_repo.get_for_scan(result.scan_id)
        snap_ids = [s.asset_id for s in snaps]
        print(f"Asset in snapshots: {asset.asset_id in snap_ids}")
        print(f"Total snapshots: {len(snaps)}")
        break
else:
    print("Fixture NOT found in enumeration!")

# Search for the fixture in ALL findings (case-insensitive)
fixture_lower = "avs_debug_ctx"
found = False
for f_dict in result.findings:
    if isinstance(f_dict, dict):
        cp = f_dict.get("canonical_path", "").lower()
        if fixture_lower in cp:
            print(f"\nFOUND in findings: {cp}")
            found = True
            break
if not found:
    print(f"\nFixture NOT in findings ({len(result.findings)} total)")
    # Show a few findings with .tmp extension
    tmp_count = 0
    for f_dict in result.findings:
        if isinstance(f_dict, dict):
            cp = f_dict.get("canonical_path", "")
            if cp.lower().endswith(".tmp"):
                tmp_count += 1
                if tmp_count <= 3:
                    print(f"  .tmp finding: {cp}")
    print(f"  Total .tmp findings: {tmp_count}")

# Cleanup
try:
    fixture.unlink()
except OSError:
    pass
