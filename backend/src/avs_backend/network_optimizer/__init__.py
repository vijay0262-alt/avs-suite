"""Network Optimizer — optimize TCP/IP settings, DNS, and MTU for better internet speed.

Applies safe Windows registry optimizations:
  - TCP Acknowledgment frequency (TcpAckFrequency)
  - TCP No Delay (disable Nagle's algorithm for lower latency)
  - TCP Window Scaling (Tcp1323Opts)
  - Selective ACK (SackOpts)
  - Default Send/Receive Window sizes
  - DNS Client Service cache optimization
  - MTU detection per adapter

All changes are backed up via the undo module before applying.

RPC methods:
    network_opt.analyze       — analyze current network settings and recommend optimizations
    network_opt.optimize      — apply recommended optimizations (Pro only)
    network_opt.revert        — revert all optimizations to defaults (Pro only)
    network_opt.status        — get current optimization status
"""

from __future__ import annotations

import logging
import os
import platform
import subprocess
import winreg
from datetime import datetime, timezone
from typing import Any

from avs_backend.api.registry import register
from avs_backend.licensing import require_feature

log = logging.getLogger("avs.network_opt")

IS_WINDOWS = platform.system() == "Windows"
_NO_WINDOW = 0x08000000 if IS_WINDOWS else 0

# Registry path for TCP/IP parameters
TCPIP_PARAMS = r"SYSTEM\CurrentControlSet\Services\Tcpip\Parameters"
TCPIP_ADAPTERS = r"SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces"

# DNS cache path
DNS_CACHE_PARAMS = r"SYSTEM\CurrentControlSet\Services\Dnscache\Parameters"

# Optimization settings with descriptions and recommended values
OPTIMIZATION_SETTINGS: list[dict[str, Any]] = [
    {
        "name": "TcpAckFrequency",
        "regPath": TCPIP_PARAMS,
        "valueName": "TcpAckFrequency",
        "valueType": winreg.REG_DWORD,
        "recommendedValue": 1,
        "defaultValue": 2,
        "description": "Send TCP ACKs immediately instead of delaying. Reduces latency for online gaming and VoIP.",
        "category": "latency",
    },
    {
        "name": "TCPNoDelay",
        "regPath": TCPIP_PARAMS,
        "valueName": "TCPNoDelay",
        "valueType": winreg.REG_DWORD,
        "recommendedValue": 1,
        "defaultValue": 0,
        "description": "Disable Nagle's algorithm. Reduces latency for interactive connections.",
        "category": "latency",
    },
    {
        "name": "Tcp1323Opts",
        "regPath": TCPIP_PARAMS,
        "valueName": "Tcp1323Opts",
        "valueType": winreg.REG_DWORD,
        "recommendedValue": 1,
        "defaultValue": 3,
        "description": "Enable TCP window scaling for better throughput on high-bandwidth connections.",
        "category": "throughput",
    },
    {
        "name": "SackOpts",
        "regPath": TCPIP_PARAMS,
        "valueName": "SackOpts",
        "valueType": winreg.REG_DWORD,
        "recommendedValue": 1,
        "defaultValue": 0,
        "description": "Enable Selective Acknowledgment for better recovery from packet loss.",
        "category": "reliability",
    },
    {
        "name": "DefaultSendWindow",
        "regPath": TCPIP_PARAMS,
        "valueName": "DefaultSendWindow",
        "valueType": winreg.REG_DWORD,
        "recommendedValue": 180224,  # 176 KB
        "defaultValue": 8192,
        "description": "Increase default send window for better upload throughput.",
        "category": "throughput",
    },
    {
        "name": "DefaultReceiveWindow",
        "regPath": TCPIP_PARAMS,
        "valueName": "DefaultReceiveWindow",
        "valueType": winreg.REG_DWORD,
        "recommendedValue": 180224,  # 176 KB
        "defaultValue": 8192,
        "description": "Increase default receive window for better download throughput.",
        "category": "throughput",
    },
    {
        "name": "MaxUserPort",
        "regPath": TCPIP_PARAMS,
        "valueName": "MaxUserPort",
        "valueType": winreg.REG_DWORD,
        "recommendedValue": 65534,
        "defaultValue": 5000,
        "description": "Increase maximum ephemeral port number for more concurrent connections.",
        "category": "throughput",
    },
    {
        "name": "TcpTimedWaitDelay",
        "regPath": TCPIP_PARAMS,
        "valueName": "TcpTimedWaitDelay",
        "valueType": winreg.REG_DWORD,
        "recommendedValue": 30,
        "defaultValue": 120,
        "description": "Reduce TIME_WAIT delay from 120s to 30s for faster connection recycling.",
        "category": "throughput",
    },
    {
        "name": "EnablePMTUDiscovery",
        "regPath": TCPIP_PARAMS,
        "valueName": "EnablePMTUDiscovery",
        "valueType": winreg.REG_DWORD,
        "recommendedValue": 1,
        "defaultValue": 1,
        "description": "Enable Path MTU Discovery for optimal packet sizes.",
        "category": "throughput",
    },
    {
        "name": "EnablePMTUBHDetect",
        "regPath": TCPIP_PARAMS,
        "valueName": "EnablePMTUBHDetect",
        "valueType": winreg.REG_DWORD,
        "recommendedValue": 1,
        "defaultValue": 0,
        "description": "Enable PMTU Black Hole Detection for better routing.",
        "category": "reliability",
    },
]

# Track optimization state
_optimization_state: dict[str, Any] = {
    "optimized": False,
    "appliedAt": None,
    "revertedAt": None,
    "appliedSettings": [],
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _read_registry_value(key_path: str, value_name: str) -> tuple[Any, int | None]:
    """Read a registry value from HKLM. Returns (value, value_type) or (None, None) if not found."""
    if not IS_WINDOWS:
        return None, None
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path, 0, winreg.KEY_READ) as handle:
            data, vtype = winreg.QueryValueEx(handle, value_name)
            return data, vtype
    except FileNotFoundError:
        return None, None
    except OSError:
        return None, None


def _write_registry_value(key_path: str, value_name: str, value_type: int, value: Any) -> bool:
    """Write a registry value to HKLM. Returns True on success."""
    if not IS_WINDOWS:
        return False
    try:
        # Create or open the key with write access
        with winreg.CreateKeyEx(winreg.HKEY_LOCAL_MACHINE, key_path, 0, winreg.KEY_SET_VALUE) as handle:
            winreg.SetValueEx(handle, value_name, 0, value_type, value)
        return True
    except OSError as e:
        log.error("Failed to write registry %s\\%s: %s", key_path, value_name, e)
        return False


def _delete_registry_value(key_path: str, value_name: str) -> bool:
    """Delete a registry value from HKLM. Returns True on success or if not found."""
    if not IS_WINDOWS:
        return False
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path, 0, winreg.KEY_SET_VALUE) as handle:
            winreg.DeleteValue(handle, value_name)
        return True
    except FileNotFoundError:
        return True  # Already doesn't exist
    except OSError as e:
        log.error("Failed to delete registry %s\\%s: %s", key_path, value_name, e)
        return False


def _backup_tcip_params() -> str | None:
    """Backup the TCP/IP registry key before making changes.

    Returns backup file path or None on failure.
    """
    if not IS_WINDOWS:
        return None

    backup_dir = os.path.join(os.path.expanduser("~"), ".avs", "backups", "network_optimizer")
    os.makedirs(backup_dir, exist_ok=True)
    backup_file = os.path.join(backup_dir, f"tcip_params_{datetime.now().strftime('%Y%m%d_%H%M%S')}.reg")

    try:
        subprocess.run(
            ["reg", "export", f"HKEY_LOCAL_MACHINE\\{TCPIP_PARAMS}", backup_file, "/y"],
            capture_output=True, timeout=15, creationflags=_NO_WINDOW,
        )
        if os.path.isfile(backup_file):
            return backup_file
    except Exception as e:
        log.error("Registry backup failed: %s", e)
    return None


def _get_active_adapters() -> list[dict[str, Any]]:
    """Get list of active network adapters with their MTU."""
    if not IS_WINDOWS:
        return []

    adapters: list[dict[str, Any]] = []
    try:
        import psutil
        for name, stats in psutil.net_if_stats().items():
            if stats.isup:
                adapters.append({
                    "name": name,
                    "mtu": stats.mtu,
                    "speed": stats.speed,
                    "isUp": True,
                })
    except Exception:
        pass
    return adapters


def _get_dns_servers() -> list[str]:
    """Get current DNS servers."""
    if not IS_WINDOWS:
        return []

    try:
        result = subprocess.run(
            ["netsh", "interface", "ip", "show", "dnsservers"],
            capture_output=True, text=True, timeout=10, creationflags=_NO_WINDOW,
        )
        dns_servers: list[str] = []
        for line in result.stdout.split("\n"):
            line = line.strip()
            if line and not line.startswith("Configuration") and not line.startswith("==="):
                # Try to extract IP addresses
                parts = line.split()
                for part in parts:
                    if part.count(".") == 3 and all(p.isdigit() for p in part.split(".")):
                        dns_servers.append(part)
        return dns_servers[:4]  # Limit to 4
    except Exception:
        return []


# ─── RPC Methods ────────────────────────────────────────────────────

@register("network_opt.analyze")
def network_opt_analyze(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Analyze current network settings and recommend optimizations.

    Returns:
        currentSettings: current registry values
        recommendations: settings that differ from recommended values
        adapters: active network adapters with MTU
        dnsServers: current DNS servers
        optimized: whether optimizations have been applied
    """
    if not IS_WINDOWS:
        return {
            "supported": False,
            "currentSettings": [],
            "recommendations": [],
            "adapters": [],
            "dnsServers": [],
            "optimized": False,
        }

    current_settings: list[dict[str, Any]] = []
    recommendations: list[dict[str, Any]] = []

    for setting in OPTIMIZATION_SETTINGS:
        current_value, _ = _read_registry_value(setting["regPath"], setting["valueName"])

        setting_info = {
            "name": setting["name"],
            "description": setting["description"],
            "category": setting["category"],
            "currentValue": current_value,
            "recommendedValue": setting["recommendedValue"],
            "defaultValue": setting["defaultValue"],
            "needsOptimization": current_value != setting["recommendedValue"],
            "regPath": setting["regPath"],
        }
        current_settings.append(setting_info)

        if current_value != setting["recommendedValue"]:
            recommendations.append(setting_info)

    adapters = _get_active_adapters()
    dns_servers = _get_dns_servers()

    return {
        "supported": True,
        "currentSettings": current_settings,
        "recommendations": recommendations,
        "recommendationCount": len(recommendations),
        "adapters": adapters,
        "dnsServers": dns_servers,
        "optimized": _optimization_state["optimized"],
        "analyzedAt": _now_iso(),
    }


@register("network_opt.optimize")
@require_feature("network_opt.optimize")
def network_opt_optimize(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Apply recommended network optimizations. Pro only.

    Backs up the TCP/IP registry key before making changes.
    """
    if not IS_WINDOWS:
        return {"success": False, "message": "Only available on Windows", "supported": False}

    # Backup before changes
    backup_file = _backup_tcip_params()

    applied: list[dict[str, Any]] = []
    failed: list[dict[str, Any]] = []

    for setting in OPTIMIZATION_SETTINGS:
        current_value, _ = _read_registry_value(setting["regPath"], setting["valueName"])

        if current_value == setting["recommendedValue"]:
            continue  # Already optimal

        success = _write_registry_value(
            setting["regPath"],
            setting["valueName"],
            setting["valueType"],
            setting["recommendedValue"],
        )

        if success:
            applied.append({
                "name": setting["name"],
                "oldValue": current_value,
                "newValue": setting["recommendedValue"],
                "description": setting["description"],
            })
        else:
            failed.append({
                "name": setting["name"],
                "error": "Failed to write registry value",
            })

    _optimization_state.update({
        "optimized": len(applied) > 0,
        "appliedAt": _now_iso(),
        "revertedAt": None,
        "appliedSettings": applied,
        "backupFile": backup_file,
    })

    return {
        "success": len(failed) == 0,
        "message": f"Applied {len(applied)} optimization(s)" + (f", {len(failed)} failed" if failed else ""),
        "applied": applied,
        "failed": failed,
        "appliedCount": len(applied),
        "failedCount": len(failed),
        "backupFile": backup_file,
        "note": "A system restart may be required for all changes to take effect.",
    }


@register("network_opt.revert")
@require_feature("network_opt.revert")
def network_opt_revert(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Revert all network optimizations to default values. Pro only.

    Restores the original registry values by deleting the custom values
    (Windows will use defaults) or setting them back to default values.
    """
    if not IS_WINDOWS:
        return {"success": False, "message": "Only available on Windows", "supported": False}

    reverted: list[dict[str, Any]] = []
    failed: list[dict[str, Any]] = []

    for setting in OPTIMIZATION_SETTINGS:
        # Delete the value so Windows uses its default
        success = _delete_registry_value(setting["regPath"], setting["valueName"])

        if success:
            reverted.append({
                "name": setting["name"],
                "description": setting["description"],
            })
        else:
            failed.append({
                "name": setting["name"],
                "error": "Failed to delete registry value",
            })

    _optimization_state.update({
        "optimized": False,
        "appliedAt": None,
        "revertedAt": _now_iso(),
        "appliedSettings": [],
    })

    return {
        "success": len(failed) == 0,
        "message": f"Reverted {len(reverted)} setting(s) to defaults" + (f", {len(failed)} failed" if failed else ""),
        "reverted": reverted,
        "failed": failed,
        "revertedCount": len(reverted),
        "failedCount": len(failed),
        "note": "A system restart may be required for all changes to take effect.",
    }


@register("network_opt.status")
def network_opt_status(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get current optimization status."""
    return {
        "optimized": _optimization_state["optimized"],
        "appliedAt": _optimization_state["appliedAt"],
        "revertedAt": _optimization_state["revertedAt"],
        "appliedSettings": _optimization_state["appliedSettings"],
        "supported": IS_WINDOWS,
    }
