import sys, os, time, tempfile
sys.path.insert(0, 'backend/src')
import avs_backend.scan_core_rpc as rpc
rpc._scan_orchestrator = None
rpc._scan_orchestrator_initializing = False
rpc._coordinator = None
orch = None
for i in range(120):
    orch = rpc.get_scan_orchestrator()
    if orch: break
    time.sleep(1)
if not orch:
    print('FAIL: no orchestrator')
    sys.exit(1)
result = orch.scan_quick(scope=None, on_progress=lambda p: None)
print('Findings:', len(result.findings))
if result.findings:
    f = result.findings[0]
    print('Type:', type(f).__name__)
    if isinstance(f, dict):
        print('Keys:', list(f.keys())[:15])
        print('rule_id:', repr(f.get('rule_id', 'MISSING')))
        print('canonical_path:', repr(f.get('canonical_path', 'MISSING')))
        print('display_name:', repr(f.get('display_name', 'MISSING')))
    else:
        print('rule_id:', repr(getattr(f, 'rule_id', 'MISSING')))
        print('canonical_path:', repr(getattr(f, 'canonical_path', 'MISSING')))
# Show first 5 findings rule_ids
for i, f in enumerate(result.findings[:5]):
    if isinstance(f, dict):
        rid = f.get('rule_id', '')
        cp = f.get('canonical_path', '')
    else:
        rid = getattr(f, 'rule_id', '')
        cp = getattr(f, 'canonical_path', '')
    print(f'  [{i}] rule_id={rid!r} path={cp!r}')
