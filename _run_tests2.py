"""Run pytest for relevant test suites."""
import subprocess, sys, os
os.chdir("backend")
result = subprocess.run(
    [sys.executable, "-m", "pytest",
     "tests/test_dashboard_v1_regression.py",
     "tests/test_disk_cleanup_plus_regression.py",
     "tests/test_sc8c4_phase_c_actionability.py",
     "tests/test_sc8c4_phase_a_safety_hardening.py",
     "tests/test_quick_scan_scope.py",
     "tests/test_v1_scan_workflow_fix.py",
     "--tb=short", "-q"],
    capture_output=True, text=True, timeout=300
)
out = result.stdout
# Count dots
dots = out.count(".")
passes = dots  # Each dot is a pass
# Count F and E
fails = out.count("F")
errors = out.count("E")
print(f"Passed (dots): {passes}")
print(f"Failed (F): {fails}")
print(f"Errors (E): {errors}")
print(f"Exit code: {result.returncode}")
# Show last 500 chars
print("\nLast 500 chars of output:")
print(out[-500:] if len(out) > 500 else out)
