"""Run pytest and show failures."""
import subprocess, sys, os
os.chdir("backend")
result = subprocess.run(
    [sys.executable, "-m", "pytest",
     "tests/test_dashboard_v1_regression.py",
     "tests/test_disk_cleanup_plus_regression.py",
     "tests/test_sc8c4_phase_c_actionability.py",
     "tests/test_sc8c4_phase_a_safety_hardening.py",
     "tests/test_quick_scan_scope.py",
     "--tb=short", "-v"],
    capture_output=True, text=True, timeout=300
)
out = result.stdout
# Show FAILED lines
for line in out.split("\n"):
    if "FAILED" in line or "PASSED" in line and "test_" in line:
        if "FAILED" in line:
            print(line)
print(f"\nExit code: {result.returncode}")
# Show the failure details
lines = out.split("\n")
for i, line in enumerate(lines):
    if "FAILED" in line or "assert" in line.lower() or "Error" in line:
        start = max(0, i-2)
        end = min(len(lines), i+5)
        for l in lines[start:end]:
            print(l)
        print("---")
