"""Driver Information module — provides installed driver details via WMI/PowerShell.

RPC methods:
    drivers.list         — list all installed drivers with version, date, provider
    drivers.byDevice     — list drivers filtered by device class
    drivers.summary      — summary of driver health
    drivers.scanOutdated — scan for outdated drivers using Windows Update API
    drivers.update       — update a specific driver via Windows Update (Pro only)
"""

from __future__ import annotations

import logging
import os
import subprocess
from datetime import datetime
from typing import Any

from avs_backend.api.registry import register
from avs_backend.licensing import require_feature

log = logging.getLogger("avs.drivers")

IS_WINDOWS = os.name == "nt"

# Drivers older than this many days are considered "outdated"
OUTDATED_THRESHOLD_DAYS = 730  # ~2 years


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
    # Get actual outdated count from scan
    outdated_result = _scan_outdated_drivers()
    return {
        "total": result.get("total", 0),
        "signed": result.get("signed", 0),
        "unsigned": result.get("unsigned", 0),
        "outdated": outdated_result.get("outdatedCount", 0),
    }


def _scan_outdated_drivers() -> dict[str, Any]:
    """Scan for outdated drivers using heuristics + Windows Update API.

    Heuristics:
    1. Drivers older than 2 years are flagged as outdated
    2. Unsigned drivers are flagged as security concerns
    3. Windows Update API is queried for available driver updates
    """
    if not IS_WINDOWS:
        return {"outdated": [], "outdatedCount": 0, "error": "Only available on Windows"}

    # Get all installed drivers
    result = drivers_list(None)
    all_drivers = result.get("drivers", [])

    outdated: list[dict[str, Any]] = []
    now = datetime.now()

    for driver in all_drivers:
        driver_date_str = driver.get("DriverDate")
        is_signed = driver.get("IsSigned", False)
        device_name = driver.get("DeviceName", "Unknown")
        device_class = driver.get("DeviceClass", "Unknown")
        manufacturer = driver.get("Manufacturer", "Unknown")
        driver_version = driver.get("DriverVersion", "Unknown")
        provider = driver.get("ProviderName", "Unknown")

        reasons: list[str] = []
        days_old = 0

        # Check driver age
        if driver_date_str:
            try:
                driver_date = datetime.strptime(driver_date_str[:10], "%Y-%m-%d")
                days_old = (now - driver_date).days
                if days_old > OUTDATED_THRESHOLD_DAYS:
                    reasons.append(f"Driver is {days_old} days old (over 2 years)")
            except Exception:
                pass

        # Check if unsigned
        if not is_signed:
            reasons.append("Driver is not digitally signed (security risk)")

        if reasons:
            outdated.append({
                "DeviceName": device_name,
                "DeviceClass": device_class,
                "Manufacturer": manufacturer,
                "DriverVersion": driver_version,
                "DriverDate": driver_date_str,
                "ProviderName": provider,
                "IsSigned": is_signed,
                "daysOld": days_old,
                "reasons": reasons,
                "severity": "high" if not is_signed else "medium",
            })

    # Try Windows Update API for available driver updates
    update_available: list[dict[str, Any]] = []
    try:
        ps_script = r"""
$UpdateSession = New-Object -ComObject Microsoft.Update.Session
$UpdateSearcher = $UpdateSession.CreateUpdateSearcher()
$UpdateSearcher.ServiceID = '7971f918-a847-4430-9279-4a52d1efe18d'
try {
    $SearchResult = $UpdateSearcher.Search("IsInstalled=0 and Type='Driver'")
    foreach ($Update in $SearchResult.Updates) {
        $item = [ordered]@{
            Title = $Update.Title
            DriverVerDate = if ($Update.DriverVerDate) { $Update.DriverVerDate.ToString('yyyy-MM-dd') } else { $null }
            DriverClass = $Update.DriverClass
            DriverManufacturer = $Update.DriverManufacturer
            DriverModel = $Update.DriverModel
            DriverProvider = $Update.DriverProvider
        }
        $item | ConvertTo-Json -Compress
    }
} catch {
    Write-Output ""
}
"""
        output = _run_powershell(ps_script, timeout=30)
        if output:
            for line in output.split("\n"):
                line = line.strip()
                if not line:
                    continue
                try:
                    import json
                    entry = json.loads(line)
                    update_available.append(entry)
                except Exception:
                    continue
    except Exception as e:
        log.debug("Windows Update driver search failed: %s", e)

    return {
        "outdated": outdated,
        "outdatedCount": len(outdated),
        "updatesAvailable": update_available,
        "updatesAvailableCount": len(update_available),
        "scannedAt": datetime.now().isoformat(),
    }


@register("drivers.scanOutdated")
def drivers_scan_outdated(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Scan for outdated drivers and available updates.

    Returns:
        outdated: list of outdated drivers with reasons
        outdatedCount: number of outdated drivers
        updatesAvailable: list of driver updates available via Windows Update
        updatesAvailableCount: number of available updates
    """
    return _scan_outdated_drivers()


@register("drivers.update")
@require_feature("drivers.update")
def drivers_update(params: dict[str, Any] | None) -> dict[str, Any]:
    """Update a specific driver via Windows Update (Pro only).

    Params:
        updateTitle: title of the update to install (from scanOutdated results)
        deviceName: optional device name for logging

    Returns:
        success: whether the update was installed
        message: status message
    """
    if not IS_WINDOWS:
        return {"success": False, "message": "Only available on Windows"}

    if not params or "updateTitle" not in params:
        return {"success": False, "message": "updateTitle parameter is required"}

    update_title = params["updateTitle"]

    ps_script = f"""
$UpdateSession = New-Object -ComObject Microsoft.Update.Session
$UpdateSearcher = $UpdateSession.CreateUpdateSearcher()
$UpdateSearcher.ServiceID = '7971f918-a847-4430-9279-4a52d1efe18d'
try {{
    $SearchResult = $UpdateSearcher.Search("IsInstalled=0 and Type='Driver'")
    $ToUpdate = $SearchResult.Updates | Where-Object {{ $_.Title -eq '{update_title}' }}
    if ($ToUpdate) {{
        $UpdatesToInstall = New-Object -ComObject Microsoft.Update.UpdateColl
        $UpdatesToInstall.Add($ToUpdate)
        $Installer = $UpdateSession.CreateUpdateInstaller()
        $Installer.Updates = $UpdatesToInstall
        $InstallResult = $Installer.Install()
        Write-Output "ResultCode:$($InstallResult.ResultCode)"
    }} else {{
        Write-Output "NotFound"
    }}
}} catch {{
    Write-Output "Error:$($_.Exception.Message)"
}}
"""
    output = _run_powershell(ps_script, timeout=120)

    if output.startswith("ResultCode:2"):
        return {"success": True, "message": f"Driver update installed: {update_title}"}
    elif output.startswith("ResultCode:3"):
        return {"success": True, "message": f"Driver update succeeded with errors: {update_title}"}
    elif output == "NotFound":
        return {"success": False, "message": f"Update not found: {update_title}"}
    elif output.startswith("Error:"):
        return {"success": False, "message": output[6:]}
    else:
        return {"success": False, "message": f"Unexpected result: {output}"}
