"""Test: run scan and check for errors."""
import sys, os, time, ctypes, tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "backend" / "src"))

temp_dir = Path(os.environ.get("TEMP", tempfile.gettempdir()))
fixture = temp_dir / "AVS_LOCK_FINAL4.tmp"
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

# Check for errors in the result
if hasattr(result, 'errors') and result.errors:
    print(f"\nErrors ({len(result.errors)}):")
    for err in result.errors[:5]:
        print(f"  {err}")

# Check the statistics for more info
print(f"\nAll statistics:")
for k, v in sorted(result.statistics.items()):
    print(f"  {k}: {v}")

# Check if the asset is in the asset repository
from avs_backend.scan_core.adapters.adapter_registry import convert_to_asset
from avs_backend.scan_core.enumerator import FilesystemEnumerator, EnumerateOptions
from avs_backend.scan_core import ScanLocation

options = EnumerateOptions(check_locked=False)
enum = FilesystemEnumerator()

for entry in enum.enumerate_locations(
    [ScanLocation(path=str(temp_dir), label="User Temp")],
    options=options,
):
    if "AVS_LOCK_FINAL4" in entry.path:
        asset = convert_to_asset(entry)
        print(f"\nAsset ID: {asset.asset_id}")
        print(f"Canonical: {asset.canonical_path}")
        
        # Check if in repo
        repo_asset = orch._asset_repo.get(asset.asset_id)
        print(f"In asset repo: {repo_asset is not None}")
        
        # Check snapshots
        snaps = orch._snapshot_repo.get_for_scan(result.scan_id)
        snap_ids = [s.asset_id for s in snaps]
        print(f"In snapshots: {asset.asset_id in snap_ids}")
        print(f"Total snapshots: {len(snaps)}")
        
        # Check if it's in findings
        for f_dict in result.findings:
            if isinstance(f_dict, dict):
                cp = f_dict.get("canonical_path", "")
                if "avs_lock_final4" in cp.lower():
                    print(f"FOUND in findings: {cp}")
                    break
        else:
            print("NOT in findings")
        break

# Cleanup
try:
    fixture.unlink()
except OSError:
    pass
