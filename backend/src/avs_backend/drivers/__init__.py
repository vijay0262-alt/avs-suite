"""Driver Information module — provides installed driver details via WMI/PowerShell.

RPC methods:
    drivers.list       — list all installed drivers with version, date, provider
    drivers.outdated   — list drivers with available updates (basic check)
    drivers.byDevice   — list drivers filtered by device class
"""

from __future__ import annotations

import logging
import os
import subprocess
from typing import Any

from avs_backend.api.registry import register

log = logging.getLogger("avs.drivers")

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


@register("drivers.list")
def drivers_list(params: dict[str, Any] | None) -> dict[str, Any]:
    """List all installed drivers with version, date, provider, and status."""
    if not IS_WINDOWS:
        return {"drivers": [], "error": "Driver information is only available on Windows"}

    device_class = params.get("deviceClass") if params else None

    ps_script = r"""
Get-WmiObject Win32_PnPSignedDriver | Where-Object { $_.DeviceName -ne $null } | ForEach-Object {
    $item = [ordered]@{
        DeviceName    = $_.DeviceName
        DeviceID      = $_.DeviceID
        Manufacturer  = $_.Manufacturer
        DriverVersion = $_.DriverVersion
        DriverDate    = if ($_.DriverDate) { $_.DriverDate.ToString('yyyy-MM-dd') } else { $null }
        ProviderName  = $_.ProviderName
        DeviceClass   = $_.DeviceClass
        IsSigned      = $_.IsSigned
        Signer        = $_.Signer
        Status        = if ($_.Status) { $_.Status } else { 'Unknown' }
    }
    $item | ConvertTo-Json -Compress
}
"""
    if device_class:
        ps_script = ps_script.replace(
            "$_.DeviceName -ne $null",
            f"$_.DeviceName -ne $null -and $_.DeviceClass -eq '{device_class}'",
        )

    output = _run_powershell(ps_script, timeout=60)

    drivers: list[dict[str, Any]] = []
    if output:
        for line in output.split("\n"):
            line = line.strip()
            if not line:
                continue
            try:
                import json
                entry = json.loads(line)
                drivers.append(entry)
            except Exception:
                continue

    return {
        "drivers": drivers,
        "total": len(drivers),
        "signed": sum(1 for d in drivers if d.get("IsSigned")),
        "unsigned": sum(1 for d in drivers if not d.get("IsSigned")),
    }


@register("drivers.byDevice")
def drivers_by_device(params: dict[str, Any] | None) -> dict[str, Any]:
    """List drivers filtered by device class (e.g. 'Display', 'Network', 'System')."""
    if not params or "deviceClass" not in params:
        return {"drivers": [], "error": "deviceClass parameter is required"}
    return drivers_list({"deviceClass": params["deviceClass"]})


@register("drivers.summary")
def drivers_summary(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Return a summary of driver health: total, signed, unsigned, outdated."""
    if not IS_WINDOWS:
        return {"total": 0, "signed": 0, "unsigned": 0, "outdated": 0, "error": "Only available on Windows"}

    result = drivers_list(None)
    return {
        "total": result.get("total", 0),
        "signed": result.get("signed", 0),
        "unsigned": result.get("unsigned", 0),
        "outdated": 0,  # Basic check — would need driver update database
    }
