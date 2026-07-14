"""dev.py — one-command dev launcher.

Runs the Vite dev server and the Electron main process in parallel with
the correct env vars for the JSON-RPC child. Kept in Python because the
same script must work on Windows, macOS, and Linux without a shell
dependency.
"""

from __future__ import annotations

import os
import signal
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    env = os.environ.copy()
    env.setdefault("AVS_ENV", "development")

    vite = subprocess.Popen(
        ["yarn", "workspace", "@avs/pc-optimizer", "dev"], cwd=ROOT, env=env
    )
    env["VITE_DEV_SERVER_URL"] = "http://localhost:5173"

    try:
        electron = subprocess.Popen(
            ["yarn", "workspace", "@avs/pc-optimizer", "dev:electron"], cwd=ROOT, env=env
        )
        electron.wait()
    finally:
        vite.send_signal(signal.SIGTERM)
        vite.wait(timeout=5)
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
