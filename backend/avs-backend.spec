# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for avs-backend.
Builds a standalone executable for the JSON-RPC server.
"""

import sys
from pathlib import Path

# Get the backend directory from current working directory
backend_dir = Path.cwd()
src_path = backend_dir / "src"

if str(src_path) not in sys.path:
    sys.path.insert(0, str(src_path))

block_cipher = None

a = Analysis(
    [str(src_path / "avs_backend" / "api" / "rpc_server.py")],
    pathex=[str(src_path)],
    binaries=[],
    datas=[],
    hiddenimports=[
        "avs_backend",
        "avs_backend.api",
        "avs_backend.cleaner",
        "avs_backend.dashboard",
        "avs_backend.disk_analyzer",
        "avs_backend.drive_wiper",
        "avs_backend.duplicate_finder",
        "avs_backend.performance",
        "avs_backend.performance.memory_optimizer",
        "avs_backend.performance.live_monitor",
        "avs_backend.privacy",
        "avs_backend.registry_cleaner",
        "avs_backend.software_updater",
        "avs_backend.startup",
        "avs_backend.startup.startup_manager",
        "avs_backend.system_information",
        "avs_backend.uninstaller",
        "avs_backend.common",
        "avs_backend.common.job_rpc",
        "avs_backend.history",
        "avs_backend.notifications",
        "avs_backend.reporting",
        "avs_backend.undo",
        "avs_backend.models",
        "avs_backend.settings",
        "avs_backend.scheduler",
        "avs_backend.utilities",
        "avs_backend.logs",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "tkinter",
        "matplotlib",
        "PIL",
        "pytest",
        "black",
        "isort",
        "flake8",
        "mypy",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="avs-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)
