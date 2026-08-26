"""Debug: check what .tmp files ARE in the findings."""
import sys, os, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "backend" / "src"))

import tempfile
temp_dir = Path(os.environ.get("TEMP", tempfile.gettempdir()))
fixture = temp_dir / "AVS_DEBUG_FIND2.tmp"
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

from avs_backend.scan_core.context import ScanType
result = orch.scan(
    ScanType.QUICK,
    scope=None,
    on_progress=lambda p: None,
    generate_action_plan=True,
    dashboard_eligible_only=False,
)

print(f"\nTotal findings: {len(result.findings)}")

# Show ALL findings with .tmp extension
tmp_findings = []
for f_dict in result.findings:
    if isinstance(f_dict, dict):
        cp = f_dict.get("canonical_path", "")
        if cp.lower().endswith(".tmp"):
            tmp_findings.append(f_dict)

print(f"\n.tmp findings: {len(tmp_findings)}")
for f_dict in tmp_findings[:10]:
    cp = f_dict.get("canonical_path", "")
    rid = f_dict.get("rule_id", "")
    safety = f_dict.get("safety", {})
    sl = safety.get("level", "?") if isinstance(safety, dict) else "?"
    print(f"  [{sl}] {rid}: {cp}")

# Check if our fixture is in the assets_discovered count
print(f"\nAssets discovered: {result.statistics.get('assets_discovered')}")

# Check if the fixture path appears anywhere
fixture_lower = str(fixture).lower()
for f_dict in result.findings:
    if isinstance(f_dict, dict):
        cp = f_dict.get("canonical_path", "")
        if fixture_lower in cp.lower() or cp.lower() in fixture_lower:
            print(f"FOUND fixture: {cp}")
            break
else:
    print(f"Fixture NOT in findings")

# Cleanup
try:
    fixture.unlink()
except OSError:
    pass
