"""Backup & Restore module — provides system backup and restore point management.

RPC methods:
    backup.listRestorePoints    — list all Windows System Restore points
    backup.createRestorePoint   — create a new System Restore point
    backup.listBackups          — list all AVS-managed backups (from undo module)
    backup.restore              — restore from a backup or restore point
    backup.delete               — delete a backup or restore point
    backup.systemImage          — check if a Windows system image exists
"""

from __future__ import annotations

import logging
import os
import subprocess
from typing import Any

from avs_backend.api.registry import register

log = logging.getLogger("avs.backup")

IS_WINDOWS = os.name == "nt"


def _run_powershell(script: str, timeout: int = 30) -> str:
    """Run a PowerShell script and return stdout."""
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        return result.stdout.strip()
    except Exception as e:
        log.error("PowerShell command failed: %s", e)
        return ""


@register("backup.listRestorePoints")
def backup_list_restore_points(_params: dict[str, Any] | None) -> dict[str, Any]:
    """List all Windows System Restore points."""
    if not IS_WINDOWS:
        return {"restorePoints": [], "error": "System Restore is only available on Windows"}

    ps_script = r"""
Get-ComputerRestorePoint -ErrorAction SilentlyContinue | ForEach-Object {
    [ordered]@{
        SequenceNumber      = $_.SequenceNumber
        Description         = $_.Description
        CreationTime        = $_.CreationTime.ToString('yyyy-MM-dd HH:mm:ss')
        EventType           = $_.EventType
        RestorePointType    = $_.RestorePointType
    } | ConvertTo-Json -Compress
}
"""
    output = _run_powershell(ps_script, timeout=30)

    restore_points: list[dict[str, Any]] = []
    if output:
        import json
        for line in output.split("\n"):
            line = line.strip()
            if not line:
                continue
            try:
                restore_points.append(json.loads(line))
            except Exception:
                continue

    return {"restorePoints": restore_points, "total": len(restore_points)}


@register("backup.createRestorePoint")
def backup_create_restore_point(params: dict[str, Any] | None) -> dict[str, Any]:
    """Create a new Windows System Restore point."""
    if not IS_WINDOWS:
        return {"success": False, "error": "System Restore is only available on Windows"}

    description = (params.get("description") if params else None) or f"AVS Shield Restore Point"

    ps_script = f"""
    Checkpoint-Computer -Description '{description}' -RestorePointType 'MODIFY_SETTINGS' -ErrorAction Stop
    Write-Output 'SUCCESS'
    """
    output = _run_powershell(ps_script, timeout=60)

    if "SUCCESS" in output:
        return {"success": True, "description": description}
    return {"success": False, "error": output or "Failed to create restore point"}


@register("backup.listBackups")
def backup_list_backups(_params: dict[str, Any] | None) -> dict[str, Any]:
    """List all AVS-managed backups (delegates to undo module)."""
    try:
        from avs_backend.undo import undo_list
        return undo_list(None)
    except Exception as e:
        return {"backups": [], "error": str(e)}


@register("backup.restore")
def backup_restore(params: dict[str, Any] | None) -> dict[str, Any]:
    """Restore from a backup or restore point."""
    if not params:
        return {"success": False, "error": "Parameters required"}

    if "backupId" in params:
        try:
            from avs_backend.undo import undo_restore
            return undo_restore({"backupId": params["backupId"]})
        except Exception as e:
            return {"success": False, "error": str(e)}

    if "sequenceNumber" in params:
        if not IS_WINDOWS:
            return {"success": False, "error": "Only available on Windows"}
        seq = params["sequenceNumber"]
        ps_script = f"Restore-Computer -RestorePoint {seq} -Confirm:$false"
        output = _run_powershell(ps_script, timeout=60)
        return {"success": True, "message": "System restore initiated. Computer will restart."}

    return {"success": False, "error": "Either backupId or sequenceNumber is required"}


@register("backup.delete")
def backup_delete(params: dict[str, Any] | None) -> dict[str, Any]:
    """Delete a backup."""
    if not params or "backupId" not in params:
        return {"success": False, "error": "backupId parameter is required"}
    try:
        from avs_backend.undo import undo_delete
        return undo_delete({"backupId": params["backupId"]})
    except Exception as e:
        return {"success": False, "error": str(e)}


@register("backup.systemImage")
def backup_system_image(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Check if a Windows system image / backup exists."""
    if not IS_WINDOWS:
        return {"available": False, "error": "Only available on Windows"}

    ps_script = r"""
    $backupLoc = Get-WBSummary -ErrorAction SilentlyContinue
    if ($backupLoc) {
        [ordered]@{
            Available = $true
            BackupTime = $backupLoc.LastBackupTime.ToString('yyyy-MM-dd HH:mm:ss')
            BackupTarget = $backupLoc.BackupTargets
        } | ConvertTo-Json -Compress
    } else {
        Write-Output '{"Available": false}'
    }
    """
    output = _run_powershell(ps_script, timeout=15)
    import json
    try:
        result = json.loads(output) if output else {"Available": False}
        return result
    except Exception:
        return {"available": False}
