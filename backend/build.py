#!/usr/bin/env python3
"""
Build script for avs-backend using PyInstaller.
Creates a standalone executable in backend/dist/backend-py/
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path


def run_command(cmd: list[str], cwd: Path) -> None:
    """Run a command and exit on failure."""
    print(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=cwd)
    if result.returncode != 0:
        sys.exit(result.returncode)


def main() -> None:
    backend_dir = Path(__file__).parent
    dist_dir = backend_dir / "dist" / "backend-py"
    spec_file = backend_dir / "avs-backend.spec"

    # Clean previous build
    if dist_dir.exists():
        print(f"Cleaning previous build: {dist_dir}")
        shutil.rmtree(dist_dir)

    # Create output directory
    dist_dir.mkdir(parents=True, exist_ok=True)

    # Build with PyInstaller
    print("Building avs-backend with PyInstaller...")
    run_command(
        [
            sys.executable,
            "-m",
            "PyInstaller",
            "--clean",
            str(spec_file),
            "--distpath",
            str(dist_dir),
        ],
        cwd=backend_dir,
    )

    # Verify the executable was created
    exe_name = "avs-backend.exe" if sys.platform == "win32" else "avs-backend"
    exe_path = dist_dir / exe_name
    if not exe_path.exists():
        print(f"ERROR: Expected executable not found at {exe_path}")
        sys.exit(1)

    print(f"✓ Backend built successfully: {exe_path}")


if __name__ == "__main__":
    main()
