"""File Recovery — recover deleted files from Recycle Bin and Volume Shadow Copies.

Provides:
  - List recoverable files from Recycle Bin
  - Restore files from Recycle Bin
  - List Volume Shadow Copy snapshots
  - Recover files from shadow copies (Previous Versions)

RPC methods:
    file_recovery.recyclable    — list files in Recycle Bin
    file_recovery.restore       — restore a file from Recycle Bin
    file_recovery.shadow_copies — list available shadow copies
    file_recovery.shadow_recover — recover a file from a shadow copy
    file_recovery.search        — search for deleted files by name pattern
"""
from __future__ import annotations

import logging
import os
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any

from avs_backend.api.registry import register

log = logging.getLogger("avs.file_recovery")

IS_WINDOWS = os.name == "nt"


def _now_iso() -> str:
    return datetime.now().isoformat()


# ─── Recycle Bin ──────────────────────────────────────────────────


def _get_recycle_bin_items_ps() -> list[dict[str, Any]]:
    """Get Recycle Bin items using PowerShell Shell.Application COM."""
    if not IS_WINDOWS:
        return []

    ps_script = r'''
$shell = New-Object -ComObject Shell.Application
$recycleBin = $shell.Namespace(0xA)
$items = @()
foreach ($item in $recycleBin.Items()) {
    $originalPath = $recycleBin.GetDetailsOf($item, 2)
    $deleteDate = $recycleBin.GetDetailsOf($item, 2)
    $size = $recycleBin.GetDetailsOf($item, 3)
    $items += @{
        Name = $item.Name
        Path = $item.Path
        Size = $item.Size
        ModifyDate = $item.ModifyDate
        Type = $item.Type
        OriginalPath = $originalPath
    }
}
$items | ConvertTo-Json -Depth 3
'''

    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_script],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0 and result.stdout.strip():
            import json
            output = result.stdout.strip()
            if output == "" or output == "null":
                return []
            data = json.loads(output)
            if isinstance(data, dict):
                data = [data]
            return data
    except Exception as e:
        log.warning("Failed to get Recycle Bin items: %s", e)

    return []


def _restore_recycle_bin_item_ps(item_path: str) -> bool:
    """Restore a Recycle Bin item using Shell.Application Restore verb."""
    if not IS_WINDOWS:
        return False

    ps_script = f'''
$shell = New-Object -ComObject Shell.Application
$recycleBin = $shell.Namespace(0xA)
foreach ($item in $recycleBin.Items()) {{
    if ($item.Path -eq '{item_path.replace("'", "''")}') {{
        $item.InvokeVerb('restore')
        Write-Output "restored"
        exit
    }}
}}
Write-Output "not_found"
'''

    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_script],
            capture_output=True, text=True, timeout=30,
        )
        return "restored" in result.stdout
    except Exception as e:
        log.warning("Failed to restore %s: %s", item_path, e)
        return False


# ─── Volume Shadow Copies ─────────────────────────────────────────


def _list_shadow_copies_ps() -> list[dict[str, Any]]:
    """List Volume Shadow Copy snapshots using vssadmin or PowerShell."""
    if not IS_WINDOWS:
        return []

    ps_script = r'''
try {
    $shadows = Get-CimInstance -ClassName Win32_ShadowCopy -ErrorAction Stop
    $result = @()
    foreach ($s in $shadows) {
        $result += @{
            ID = $s.ID
            VolumeName = $s.VolumeName
            CreationTime = $s.CreationTime
            InstallDate = $s.InstallDate
            DeviceObject = $s.DeviceObject
        }
    }
    $result | ConvertTo-Json -Depth 3
} catch {
    Write-Output "[]"
}
'''

    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_script],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0 and result.stdout.strip():
            import json
            output = result.stdout.strip()
            if output == "" or output == "null" or output == "[]":
                return []
            data = json.loads(output)
            if isinstance(data, dict):
                data = [data]
            return data
    except Exception as e:
        log.warning("Failed to list shadow copies: %s", e)

    return []


def _recover_from_shadow_copy(
    shadow_device: str,
    original_path: str,
    dest_path: str,
) -> dict[str, Any]:
    r"""Recover a file from a shadow copy.

    Args:
        shadow_device: Shadow copy device object path (e.g. \\?\GLOBALROOT\Device\HarddiskVolumeShadowCopy1)
        original_path: Original file path relative to the volume (e.g. Users\John\Documents\file.txt)
        dest_path: Where to save the recovered file
    """
    if not IS_WINDOWS:
        return {"success": False, "error": "Not supported on this platform"}

    # Build the shadow copy path
    # The device object path + the relative path from the volume root
    drive = original_path[0]  # e.g. "C"
    relative = original_path[2:]  # strip "C:\"

    shadow_file = f"{shadow_device}\\{relative}"

    try:
        if not os.path.exists(shadow_file):
            return {"success": False, "error": f"File not found in shadow copy: {shadow_file}"}

        import shutil
        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
        shutil.copy2(shadow_file, dest_path)

        return {
            "success": True,
            "recovered_path": dest_path,
            "original_path": original_path,
            "shadow_copy": shadow_device,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


# ─── RPC Handlers ─────────────────────────────────────────────────


@register("file_recovery.recyclable")
def file_recovery_recyclable(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """List files in the Recycle Bin that can be restored."""
    items = _get_recycle_bin_items_ps()
    return {
        "success": True,
        "supported": IS_WINDOWS,
        "items": items,
        "count": len(items),
    }


@register("file_recovery.restore")
def file_recovery_restore(params: dict[str, Any] | None) -> dict[str, Any]:
    """Restore a file from the Recycle Bin.

    Params:
        item_path: Recycle Bin item path (from recyclable list)
    """
    params = params or {}
    item_path = params.get("item_path", "")
    if not item_path:
        return {"success": False, "error": "item_path is required", "error_code": "INVALID_PARAMS"}

    restored = _restore_recycle_bin_item_ps(item_path)
    return {
        "success": restored,
        "item_path": item_path,
        "restored": restored,
    }


@register("file_recovery.shadow_copies")
def file_recovery_shadow_copies(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """List available Volume Shadow Copy snapshots."""
    copies = _list_shadow_copies_ps()
    return {
        "success": True,
        "supported": IS_WINDOWS,
        "copies": copies,
        "count": len(copies),
    }


@register("file_recovery.shadow_recover")
def file_recovery_shadow_recover(params: dict[str, Any] | None) -> dict[str, Any]:
    """Recover a file from a Volume Shadow Copy.

    Params:
        shadow_device: Shadow copy device object path
        original_path: Original file path to recover
        dest_path: Destination path for the recovered file
    """
    params = params or {}
    shadow_device = params.get("shadow_device", "")
    original_path = params.get("original_path", "")
    dest_path = params.get("dest_path", "")

    if not shadow_device or not original_path or not dest_path:
        return {"success": False, "error": "shadow_device, original_path, and dest_path are required", "error_code": "INVALID_PARAMS"}

    return _recover_from_shadow_copy(shadow_device, original_path, dest_path)


@register("file_recovery.search")
def file_recovery_search(params: dict[str, Any] | None) -> dict[str, Any]:
    """Search for recoverable files by name pattern.

    Searches Recycle Bin items for files matching the given pattern.

    Params:
        pattern: Search pattern (e.g. "*.docx", "report*")
    """
    params = params or {}
    pattern = params.get("pattern", "*").lower()

    items = _get_recycle_bin_items_ps()

    # Filter by pattern
    import fnmatch
    matched = []
    for item in items:
        name = item.get("Name", "").lower()
        if fnmatch.fnmatch(name, pattern):
            matched.append(item)

    return {
        "success": True,
        "supported": IS_WINDOWS,
        "pattern": pattern,
        "items": matched,
        "count": len(matched),
    }
