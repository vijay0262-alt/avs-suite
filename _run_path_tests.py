"""Run pytest for path validation tests."""
import subprocess, sys, os
os.chdir("backend")
result = subprocess.run(
    [sys.executable, "-m", "pytest",
     "tests/test_sc8c4_phase_c_actionability.py",
     "tests/test_sc8c4_phase_a_safety_hardening.py",
     "--tb=short", "-v"],
    capture_output=True, text=True, timeout=300
)
out = result.stdout
print("STDOUT:")
print(out[-5000:] if len(out) > 5000 else out)
print(f"\nExit code: {result.returncode}")
