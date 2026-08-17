"""Security Remediation backend module — protection enablement.

Provides:
  - SmartScreen, Defender, and Firewall enablement RPCs

The quarantine manifest infrastructure (directory, manifest path, load/save
helpers) is preserved for future canonical quarantine write operations.
The read-only quarantine listing is now served by the canonical RPC
``scan_core.security_remediation.quarantine_list`` registered in
``scan_core_rpc/__init__.py`` (SC-8C14 Phase 3).

RPC methods:
    security.enableSmartScreen    — enable Windows SmartScreen
    security.enableDefender       — enable Windows Defender
    security.enableFirewall       — enable Windows Firewall
"""

from __future__ import annotations

import json
import logging
import os
import platform
import subprocess
import threading
from datetime import datetime, timezone
from typing import Any

from avs_backend.api.registry import register

log = logging.getLogger("avs.remediation")

IS_WINDOWS = platform.system() == "Windows"

# Quarantine directory — stored in AppData/Local/AVS Shield/Quarantine
# Preserved for future canonical quarantine write operations.
if IS_WINDOWS:
    _QUARANTINE_DIR = os.path.expandvars(r"%LOCALAPPDATA%\AVS Shield\Quarantine")
else:
    _QUARANTINE_DIR = os.path.expanduser("~/.avs-shield/quarantine")

_QUARANTINE_MANIFEST = os.path.join(_QUARANTINE_DIR, "manifest.json")
_quarantine_lock = threading.Lock()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_quarantine_dir() -> None:
    os.makedirs(_QUARANTINE_DIR, exist_ok=True)


def _load_manifest() -> dict[str, Any]:
    """Load the quarantine manifest."""
    try:
        with open(_QUARANTINE_MANIFEST, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, ValueError):
        return {"items": []}


def _save_manifest(manifest: dict[str, Any]) -> None:
    """Save the quarantine manifest."""
    _ensure_quarantine_dir()
    with open(_QUARANTINE_MANIFEST, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)


# =====================================================================
# Security Feature Enable RPCs
# =====================================================================

def _run_powershell(script: str, timeout: int = 15) -> tuple[bool, str]:
    """Run a PowerShell script and return (success, output)."""
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        output = (result.stdout or "").strip()
        if result.returncode != 0:
            output = (result.stderr or "").strip() or output
        return result.returncode == 0, output
    except Exception as e:
        return False, str(e)


@register("security.enableSmartScreen")
def enable_smartscreen(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Enable Windows SmartScreen filter for Explorer and Edge.

    Sets the relevant registry keys to enable SmartScreen.
    Requires admin privileges.
    """
    if os.name != "nt":
        return {"enabled": False, "error": "Not supported on this platform"}

    ps_script = r"""
    # Enable SmartScreen for Windows Explorer
    Set-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer' -Name 'SmartScreenEnabled' -Value 'On' -ErrorAction SilentlyContinue
    # Enable SmartScreen for Edge
    Set-ItemProperty -Path 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System' -Name 'EnableSmartScreen' -Value 1 -Type DWord -ErrorAction SilentlyContinue
    # Enable SmartScreen for Edge (per-user policy)
    Set-ItemProperty -Path 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppHost' -Name 'EnableWebContentEvaluation' -Value 1 -Type DWord -ErrorAction SilentlyContinue
    Write-Output 'OK'
"""
    success, output = _run_powershell(ps_script)
    return {
        "enabled": success,
        "message": "SmartScreen enabled" if success else f"Failed: {output}",
        "timestamp": _now_iso(),
    }


@register("security.enableDefender")
def enable_defender(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Enable Windows Defender and real-time protection.

    Uses Set-MpPreference cmdlet to re-enable Defender.
    Requires admin privileges.
    """
    if os.name != "nt":
        return {"enabled": False, "error": "Not supported on this platform"}

    ps_script = r"""
    try {
        # Re-enable Defender anti-spyware
        Set-MpPreference -DisableAntiSpyware $false -ErrorAction SilentlyContinue
        # Re-enable real-time protection
        Set-MpPreference -DisableRealtimeMonitoring $false -ErrorAction SilentlyContinue
        Write-Output 'OK'
    } catch {
        # Fallback: try registry approach
        try {
            $path = 'HKLM:\SOFTWARE\Microsoft\Windows Defender'
            Set-ItemProperty -Path $path -Name 'DisableAntiSpyware' -Value 0 -Type DWord -ErrorAction SilentlyContinue
            $rtpPath = 'HKLM:\SOFTWARE\Microsoft\Windows Defender\Real-Time Protection'
            Set-ItemProperty -Path $rtpPath -Name 'DisableRealtimeMonitoring' -Value 0 -Type DWord -ErrorAction SilentlyContinue
            Write-Output 'OK'
        } catch {
            Write-Output $_.Exception.Message
        }
    }
"""
    success, output = _run_powershell(ps_script)
    return {
        "enabled": success,
        "message": "Windows Defender enabled" if success else f"Failed: {output}",
        "timestamp": _now_iso(),
    }


@register("security.enableFirewall")
def enable_firewall(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Enable Windows Firewall for all profiles.

    Uses netsh advfirewall to enable firewall.
    Requires admin privileges.
    """
    if os.name != "nt":
        return {"enabled": False, "error": "Not supported on this platform"}

    ps_script = r"""
    try {
        netsh advfirewall set allprofiles state on
        Write-Output 'OK'
    } catch {
        Write-Output $_.Exception.Message
    }
"""
    success, output = _run_powershell(ps_script)
    return {
        "enabled": success,
        "message": "Firewall enabled" if success else f"Failed: {output}",
        "timestamp": _now_iso(),
    }
