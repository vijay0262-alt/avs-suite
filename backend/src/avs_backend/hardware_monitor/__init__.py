"""Hardware Monitoring module — provides hardware sensor data (temperatures, fan speeds, clocks, battery, power).

This module attempts to collect hardware sensor data using multiple methods:
1. psutil.sensors_temperatures() (Linux only, not available on Windows)
2. WMI via PowerShell on Windows (Win32_TemperatureProbe, Win32_Fan, Win32_Battery)
3. OpenHardwareMonitor/LibreHardwareMonitor WMI namespace if installed

If a sensor is not available, the response clearly indicates 'unsupported' rather than returning 0 or None silently.

RPC methods:
    hardware.sensors       — all available hardware sensors (temp, fan, clock, power)
    hardware.temperature   — temperature sensors only
    hardware.fans          — fan speed sensors only
    hardware.battery       — battery health and status
    hardware.power         — power usage information
"""

from __future__ import annotations

import logging
import os
import subprocess
from typing import Any

try:
    import psutil
except ImportError:
    psutil = None  # type: ignore[assignment]

from avs_backend.api.registry import register

log = logging.getLogger("avs.hardware")

IS_WINDOWS = os.name == "nt"


def _run_powershell(script: str, timeout: int = 10) -> str:
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


def _get_temperatures() -> dict[str, Any]:
    """Get temperature readings from available sources."""
    sensors: list[dict[str, Any]] = []
    source = "unknown"

    # Method 1: psutil.sensors_temperatures() — works on Linux, not Windows
    if psutil and hasattr(psutil, 'sensors_temperatures'):
        try:
            temps = psutil.sensors_temperatures()
            if temps:
                source = "psutil"
                for name, entries in temps.items():
                    for entry in entries:
                        sensors.append({
                            "name": entry.label or name,
                            "value": entry.current,
                            "high": entry.high,
                            "critical": entry.critical,
                            "unit": "celsius",
                            "source": source,
                            "supported": True,
                        })
        except Exception:
            pass

    if sensors:
        return {"sensors": sensors, "supported": True, "source": source}

    # Method 2: OpenHardwareMonitor / LibreHardwareMonitor WMI namespace
    if IS_WINDOWS:
        ps_script = r"""
try {
    $ohm = Get-WmiObject -Namespace 'root\OpenHardwareMonitor' -Class Sensor -ErrorAction SilentlyContinue | Where-Object { $_.SensorType -eq 'Temperature' }
    if ($ohm) {
        foreach ($s in $ohm) {
            [ordered]@{
                name = $s.Name
                value = $s.Value
                unit = 'celsius'
                source = 'OpenHardwareMonitor'
                supported = $true
            } | ConvertTo-Json -Compress
        }
    } else {
        $lhm = Get-WmiObject -Namespace 'root\LibreHardwareMonitor' -Class Sensor -ErrorAction SilentlyContinue | Where-Object { $_.SensorType -eq 'Temperature' }
        if ($lhm) {
            foreach ($s in $lhm) {
                [ordered]@{
                    name = $s.Name
                    value = $s.Value
                    unit = 'celsius'
                    source = 'LibreHardwareMonitor'
                    supported = $true
                } | ConvertTo-Json -Compress
            }
        }
    }
} catch { }
"""
        output = _run_powershell(ps_script, timeout=10)
        if output:
            import json
            for line in output.split("\n"):
                line = line.strip()
                if not line:
                    continue
                try:
                    sensors.append(json.loads(line))
                except Exception:
                    continue

    if sensors:
        return {"sensors": sensors, "supported": True, "source": sensors[0].get("source", "wmi")}

    # Not available
    return {
        "sensors": [],
        "supported": False,
        "source": None,
        "message": "Temperature sensors are not available on this system. Install LibreHardwareMonitor for detailed sensor data.",
    }


def _get_fan_speeds() -> dict[str, Any]:
    """Get fan speed readings."""
    sensors: list[dict[str, Any]] = []

    # Method 1: psutil.sensors_fans() — Linux only
    if psutil and hasattr(psutil, 'sensors_fans'):
        try:
            fans = psutil.sensors_fans()
            if fans:
                for name, entries in fans.items():
                    for entry in entries:
                        sensors.append({
                            "name": entry.label or name,
                            "value": entry.current,
                            "unit": "rpm",
                            "source": "psutil",
                            "supported": True,
                        })
        except Exception:
            pass

    if sensors:
        return {"sensors": sensors, "supported": True, "source": "psutil"}

    # Method 2: OpenHardwareMonitor / LibreHardwareMonitor
    if IS_WINDOWS:
        ps_script = r"""
try {
    $ohm = Get-WmiObject -Namespace 'root\OpenHardwareMonitor' -Class Sensor -ErrorAction SilentlyContinue | Where-Object { $_.SensorType -eq 'Fan' }
    if ($ohm) {
        foreach ($s in $ohm) {
            [ordered]@{
                name = $s.Name
                value = $s.Value
                unit = 'rpm'
                source = 'OpenHardwareMonitor'
                supported = $true
            } | ConvertTo-Json -Compress
        }
    } else {
        $lhm = Get-WmiObject -Namespace 'root\LibreHardwareMonitor' -Class Sensor -ErrorAction SilentlyContinue | Where-Object { $_.SensorType -eq 'Fan' }
        if ($lhm) {
            foreach ($s in $lhm) {
                [ordered]@{
                    name = $s.Name
                    value = $s.Value
                    unit = 'rpm'
                    source = 'LibreHardwareMonitor'
                    supported = $true
                } | ConvertTo-Json -Compress
            }
        }
    }
} catch { }
"""
        output = _run_powershell(ps_script, timeout=10)
        if output:
            import json
            for line in output.split("\n"):
                line = line.strip()
                if not line:
                    continue
                try:
                    sensors.append(json.loads(line))
                except Exception:
                    continue

    if sensors:
        return {"sensors": sensors, "supported": True, "source": sensors[0].get("source", "wmi")}

    return {
        "sensors": [],
        "supported": False,
        "source": None,
        "message": "Fan speed sensors are not available on this system. Install LibreHardwareMonitor for fan monitoring.",
    }


def _get_clocks() -> dict[str, Any]:
    """Get CPU/GPU clock speeds."""
    clocks: list[dict[str, Any]] = []

    # CPU clock via psutil
    try:
        if psutil:
            freq = psutil.cpu_freq()
        if freq:
            clocks.append({
                "name": "CPU",
                "current": freq.current,
                "min": freq.min if freq.min else None,
                "max": freq.max if freq.max else None,
                "unit": "mhz",
                "source": "psutil",
                "supported": True,
            })
    except Exception:
        pass

    # GPU clock via OpenHardwareMonitor/LibreHardwareMonitor
    if IS_WINDOWS:
        ps_script = r"""
try {
    $ohm = Get-WmiObject -Namespace 'root\OpenHardwareMonitor' -Class Sensor -ErrorAction SilentlyContinue | Where-Object { $_.SensorType -eq 'Clock' }
    if ($ohm) {
        foreach ($s in $ohm) {
            [ordered]@{
                name = $s.Name
                current = $s.Value
                unit = 'mhz'
                source = 'OpenHardwareMonitor'
                supported = $true
            } | ConvertTo-Json -Compress
        }
    } else {
        $lhm = Get-WmiObject -Namespace 'root\LibreHardwareMonitor' -Class Sensor -ErrorAction SilentlyContinue | Where-Object { $_.SensorType -eq 'Clock' }
        if ($lhm) {
            foreach ($s in $lhm) {
                [ordered]@{
                    name = $s.Name
                    current = $s.Value
                    unit = 'mhz'
                    source = 'LibreHardwareMonitor'
                    supported = $true
                } | ConvertTo-Json -Compress
            }
        }
    }
} catch { }
"""
        output = _run_powershell(ps_script, timeout=10)
        if output:
            import json
            for line in output.split("\n"):
                line = line.strip()
                if not line:
                    continue
                try:
                    clocks.append(json.loads(line))
                except Exception:
                    continue

    return {"clocks": clocks, "supported": len(clocks) > 0}


def _get_battery() -> dict[str, Any]:
    """Get battery health and status."""
    if psutil and hasattr(psutil, 'sensors_battery'):
        try:
            battery = psutil.sensors_battery()
            if battery is not None:
                return {
                    "present": True,
                    "percent": battery.percent,
                    "powerPlugged": battery.power_plugged,
                    "secsLeft": battery.secsleft if battery.secsleft != psutil.POWER_TIME_UNLIMITED else None,
                    "secsLeftUnlimited": battery.secsleft == psutil.POWER_TIME_UNLIMITED,
                    "supported": True,
                }
        except Exception:
            pass

    # Windows WMI battery
    if IS_WINDOWS:
        ps_script = r"""
Get-WmiObject -Class Win32_Battery -ErrorAction SilentlyContinue | ForEach-Object {
    [ordered]@{
        present = $true
        percent = $_.EstimatedChargeRemaining
        powerPlugged = ($_.BatteryStatus -eq 2 -or $_.BatteryStatus -eq 6 -or $_.BatteryStatus -eq 8)
        supported = $true
    } | ConvertTo-Json -Compress
}
"""
        output = _run_powershell(ps_script, timeout=10)
        if output:
            import json
            try:
                return json.loads(output)
            except Exception:
                pass

    return {
        "present": False,
        "percent": None,
        "powerPlugged": None,
        "secsLeft": None,
        "supported": False,
        "message": "No battery detected on this system.",
    }


def _get_power_usage() -> dict[str, Any]:
    """Get power usage information."""
    if IS_WINDOWS:
        ps_script = r"""
try {
    $power = powercfg /batteryreport /output "$env:TEMP\avs_battery_report.xml" /xml 2>$null
    [ordered]@{
        supported = $true
        source = 'powercfg'
    } | ConvertTo-Json -Compress
} catch {
    Write-Output '{"supported": false}'
}
"""
        output = _run_powershell(ps_script, timeout=10)
        if "true" in output.lower():
            return {
                "supported": True,
                "source": "powercfg",
                "message": "Power report available. Use powercfg /batteryreport for details.",
            }

    return {
        "supported": False,
        "source": None,
        "message": "Power usage monitoring is not available on this system.",
    }


@register("hardware.sensors")
def hardware_sensors(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get all available hardware sensors in a single call."""
    temps = _get_temperatures()
    fans = _get_fan_speeds()
    clocks = _get_clocks()
    battery = _get_battery()
    power = _get_power_usage()

    return {
        "temperature": temps,
        "fans": fans,
        "clocks": clocks,
        "battery": battery,
        "power": power,
    }


@register("hardware.temperature")
def hardware_temperature(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get temperature sensors only."""
    return _get_temperatures()


@register("hardware.fans")
def hardware_fans(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get fan speed sensors only."""
    return _get_fan_speeds()


@register("hardware.battery")
def hardware_battery(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get battery health and status."""
    return _get_battery()


@register("hardware.power")
def hardware_power(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get power usage information."""
    return _get_power_usage()
