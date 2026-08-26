"""Run pytest and capture results."""
import subprocess, sys, os
os.chdir("backend")
result = subprocess.run(
    [sys.executable, "-m", "pytest",
     "tests/test_dashboard_v1_regression.py",
     "tests/test_disk_cleanup_plus_regression.py",
     "tests/test_quick_scan_scope.py",
     "--tb=short", "-q"],
    capture_output=True, text=True, timeout=300
)
out = result.stdout
print("STDOUT:")
print(out[-3000:] if len(out) > 3000 else out)
print(f"\nExit code: {result.returncode}")
