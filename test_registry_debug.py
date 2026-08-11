import sys
sys.path.insert(0, 'backend/src')

from avs_backend.scan_core.registry import (
    RegistryEnumerator,
    RegistryTarget,
    RegistryHive,
    RegistryEnumerateOptions,
)

print("Creating enumerator...")
e = RegistryEnumerator()

print("Creating target...")
t = [RegistryTarget(
    hive=RegistryHive.HKEY_CURRENT_USER,
    subpath=r'SOFTWARE\Microsoft\Windows\CurrentVersion\Run',
    label='Test',
    recurse=False,
)]

print("Calling enumerate_targets...")
try:
    entries = list(e.enumerate_targets(t))
    print(f"Success: {len(entries)} entries")
    for i, entry in enumerate(entries[:5]):
        print(f"  {i}: {type(entry).__name__} - {entry}")
except Exception as ex:
    import traceback
    print(f"Exception: {type(ex).__name__}: {ex}")
    traceback.print_exc()
