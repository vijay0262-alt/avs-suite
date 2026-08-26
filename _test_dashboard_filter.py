"""Test: check if fixture is found with dashboard_eligible_only=True."""
import sys, os, time, ctypes, tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "backend" / "src"))

temp_dir = Path(os.environ.get("TEMP", tempfile.gettempdir()))
fixture = temp_dir / "AVS_LOCK_FINAL5.tmp"
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

# Run scan with dashboard_eligible_only=True (scan_quick)
result = orch.scan_quick(scope=None, on_progress=lambda p: None)
print(f"\nScan findings (dashboard_eligible_only=True): {len(result.findings)}")

# Search for fixture
for f_dict in result.findings:
    if isinstance(f_dict, dict):
        cp = f_dict.get("canonical_path", "")
        if "avs_lock_final5" in cp.lower():
            safety = f_dict.get("safety", {})
            print(f"FOUND: {cp}")
            print(f"  safety: {safety}")
            break
else:
    print("NOT found in findings")
    
    # Now run with dashboard_eligible_only=False
    from avs_backend.scan_core.context import ScanType
    result2 = orch.scan(
        ScanType.QUICK,
        scope=None,
        on_progress=lambda p: None,
        generate_action_plan=True,
        dashboard_eligible_only=False,
    )
    print(f"\nScan findings (dashboard_eligible_only=False): {len(result2.findings)}")
    for f_dict in result2.findings:
        if isinstance(f_dict, dict):
            cp = f_dict.get("canonical_path", "")
            if "avs_lock_final5" in cp.lower():
                safety = f_dict.get("safety", {})
                print(f"FOUND: {cp}")
                print(f"  safety: {safety}")
                break
    else:
        print("NOT found in findings (no filter)")

# Cleanup
try:
    fixture.unlink()
except OSError:
    pass
