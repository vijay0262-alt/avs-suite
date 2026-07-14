"""bundle_backend.py — package the Python backend into a single
executable using PyInstaller.

The output is copied into ``backend/dist/backend-py/`` where
``electron-builder`` picks it up via ``extraResources`` in
``apps/pc-optimizer/package.json``.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
OUT = BACKEND / "dist" / "backend-py"


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)

    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onefile",
        "--name",
        "avs-backend",
        "--distpath",
        str(OUT),
        "--specpath",
        str(BACKEND / "build" / "spec"),
        "--workpath",
        str(BACKEND / "build" / "work"),
        str(BACKEND / "src" / "avs_backend" / "api" / "rpc_server.py"),
    ]
    print(" ".join(cmd))
    return subprocess.call(cmd, cwd=BACKEND)


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
