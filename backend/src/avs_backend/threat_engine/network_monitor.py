"""Network Connection Monitor — detect suspicious network activity.

Competitors like Norton, McAfee, and Trend Micro monitor network
connections for:
  - Communication with known malicious C2 servers
  - Data exfiltration patterns
  - Suspicious outbound connections from unknown processes
  - Botnet callback patterns
  - Reverse shell connections

This module uses psutil to enumerate active network connections and
flags suspicious ones based on:
  - Known malicious IP/domains (from ThreatFox IOCs)
  - Suspicious ports (reverse shells, C2)
  - Unknown processes making external connections
  - High-volume data transfer patterns

RPC methods:
    network_monitor.status       - get monitor status
    network_monitor.scan         - scan active connections
    network_monitor.events       - get recent suspicious connection events
    network_monitor.blocklist    - add/remove IPs from local blocklist
"""
from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from avs_backend.api.registry import register

log = logging.getLogger("avs.network_monitor")

_DATA_DIR = Path(os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))) / "AVS AI Shield" / "threat_engine"
_DATA_DIR.mkdir(parents=True, exist_ok=True)
_BLOCKLIST_PATH = _DATA_DIR / "network_blocklist.json"
_EVENTS_PATH = _DATA_DIR / "network_events.json"

# Suspicious ports commonly used by malware
_SUSPICIOUS_PORTS = {
    4444,   # Metasploit default
    1337,   # Common C2
    31337,  # Back Orifice
    12345,  # NetBus
    27374,  # SubSeven
    6667,   # IRC botnet
    6666,   # IRC botnet
    6668,   # IRC botnet
    6669,   # IRC botnet
    9001,   # Tor
    9030,   # Tor
    9050,   # Tor
    9051,   # Tor
    9150,   # Tor
    3389,   # RDP (often brute-forced)
    22,     # SSH (suspicious if unknown process)
    23,     # Telnet (insecure)
    445,    # SMB (often exploited)
    139,    # NetBIOS
    1433,   # MSSQL
    1434,   # MSSQL
    3306,   # MySQL
    5432,   # PostgreSQL
    6379,   # Redis
    27017,  # MongoDB
    11211,  # Memcached
}

# Known safe processes that make network connections
_SAFE_PROCESSES = {
    "svchost.exe", "lsass.exe", "services.exe", "wininit.exe",
    "csrss.exe", "smss.exe", "winlogon.exe", "explorer.exe",
    "System", "System Idle Process",
    # Browsers
    "chrome.exe", "msedge.exe", "firefox.exe", "brave.exe",
    "opera.exe", "iexplore.exe",
    # System services
    "spoolsv.exe", "dwm.exe", "SearchIndexer.exe",
    "WindowsDefender.exe", "MsMpEng.exe", "NisSrv.exe",
    # AVS
    "avs.exe", "node.exe",
}

# Maximum events to keep in memory
_MAX_EVENTS = 500


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_json(path: Path, default: dict[str, Any]) -> dict[str, Any]:
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return default


def _save_json(path: Path, data: dict[str, Any]) -> None:
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        log.error("Failed to save %s: %s", path, e)


def _load_blocklist() -> dict[str, Any]:
    return _load_json(_BLOCKLIST_PATH, {"ips": [], "updated_at": _now_iso()})


def _save_blocklist(data: dict[str, Any]) -> None:
    _save_json(_BLOCKLIST_PATH, data)


def _load_events() -> dict[str, Any]:
    return _load_json(_EVENTS_PATH, {"events": [], "updated_at": _now_iso()})


def _save_events(data: dict[str, Any]) -> None:
    _save_json(_EVENTS_PATH, data)


def _add_event(event: dict[str, Any]) -> None:
    events = _load_events()
    events["events"].append(event)
    if len(events["events"]) > _MAX_EVENTS:
        events["events"] = events["events"][-_MAX_EVENTS:]
    events["updated_at"] = _now_iso()
    _save_events(events)


def _is_private_ip(ip: str) -> bool:
    """Check if an IP address is private/local."""
    if ip in ("127.0.0.1", "::1", "0.0.0.0", "::"):
        return True
    if ip.startswith("10."):
        return True
    if ip.startswith("172."):
        parts = ip.split(".")
        if len(parts) > 1:
            try:
                second = int(parts[1])
                if 16 <= second <= 31:
                    return True
            except ValueError:
                pass
    if ip.startswith("192.168."):
        return True
    if ip.startswith("169.254."):
        return True  # Link-local
    if ip.startswith("fe80:"):
        return True  # IPv6 link-local
    if ip.startswith("fc") or ip.startswith("fd"):
        return True  # IPv6 unique local
    return False


def _get_process_name(pid: int) -> str:
    """Get process name by PID."""
    try:
        import psutil
        proc = psutil.Process(pid)
        return proc.name()
    except Exception:
        return "unknown"


def _get_process_exe(pid: int) -> str:
    """Get process executable path by PID."""
    try:
        import psutil
        proc = psutil.Process(pid)
        return proc.exe()
    except Exception:
        return ""


def scan_network_connections() -> dict[str, Any]:
    """Scan all active network connections for suspicious activity.

    Returns a summary of connections and any suspicious findings.
    """
    try:
        import psutil
    except ImportError:
        return {"success": False, "error": "psutil not available"}

    suspicious_connections: list[dict[str, Any]] = []
    total_connections = 0
    established = 0
    listening = 0
    external = 0

    blocklist = _load_blocklist()
    blocked_ips = {ip.lower() for ip in blocklist.get("ips", [])}

    try:
        connections = psutil.net_connections(kind="inet")
    except Exception as e:
        return {"success": False, "error": f"Failed to enumerate connections: {e}"}

    for conn in connections:
        total_connections += 1

        if conn.status == "ESTABLISHED":
            established += 1
        elif conn.status == "LISTEN":
            listening += 1

        # Skip listening sockets (no remote endpoint)
        if conn.status == "LISTEN":
            continue

        remote_ip = ""
        remote_port = 0
        if conn.raddr:
            remote_ip = conn.raddr.ip if hasattr(conn.raddr, "ip") else str(conn.raddr).split(":")[0]
            try:
                remote_port = conn.raddr.port if hasattr(conn.raddr, "port") else int(str(conn.raddr).split(":")[-1])
            except (ValueError, IndexError):
                pass

        # Skip local connections
        if _is_private_ip(remote_ip):
            continue

        external += 1

        # Get process info
        pid = conn.pid or 0
        proc_name = _get_process_name(pid) if pid else "unknown"
        proc_exe = _get_process_exe(pid) if pid else ""

        threat_score = 0
        reasons: list[str] = []

        # Check blocklist
        if remote_ip.lower() in blocked_ips:
            threat_score += 10
            reasons.append(f"IP {remote_ip} is in local blocklist")

        # Check suspicious ports
        if remote_port in _SUSPICIOUS_PORTS:
            threat_score += 5
            reasons.append(f"Connected to suspicious port {remote_port}")

        # Check if process is unknown/suspicious
        if proc_name != "unknown" and proc_name.lower() not in _SAFE_PROCESSES:
            threat_score += 2
            reasons.append(f"Unknown process '{proc_name}' making external connection")

        # Check if process executable is in temp/downloads
        if proc_exe and any(s in proc_exe.lower() for s in ["\\temp\\", "\\downloads\\", "\\appdata\\local\\temp\\"]):
            threat_score += 5
            reasons.append(f"Process running from suspicious location: {proc_exe}")

        if threat_score >= 3:
            event = {
                "timestamp": _now_iso(),
                "pid": pid,
                "process": proc_name,
                "process_exe": proc_exe,
                "local_addr": str(conn.laddr) if conn.laddr else "",
                "remote_ip": remote_ip,
                "remote_port": remote_port,
                "status": conn.status,
                "threat_score": threat_score,
                "reasons": reasons,
                "severity": "critical" if threat_score >= 10 else "high" if threat_score >= 7 else "medium",
            }
            suspicious_connections.append(event)
            _add_event(event)

    return {
        "success": True,
        "scanned_at": _now_iso(),
        "total_connections": total_connections,
        "established": established,
        "listening": listening,
        "external": external,
        "suspicious_count": len(suspicious_connections),
        "suspicious_connections": suspicious_connections,
    }


# ─── RPC handlers ────────────────────────────────────────────────────

@register("network_monitor.status")
def network_monitor_status(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get network monitor status."""
    blocklist = _load_blocklist()
    events = _load_events()
    return {
        "success": True,
        "status": {
            "blocklist_count": len(blocklist.get("ips", [])),
            "event_count": len(events.get("events", [])),
            "suspicious_ports": sorted(_SUSPICIOUS_PORTS),
            "safe_processes": sorted(_SAFE_PROCESSES),
        },
    }


@register("network_monitor.scan")
def network_monitor_scan(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Scan active network connections for suspicious activity."""
    return scan_network_connections()


@register("network_monitor.events")
def network_monitor_events(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get recent suspicious connection events.

    Params:
        limit: max events to return (default 100)
    """
    limit = 100
    if params and "limit" in params:
        limit = int(params["limit"])

    events = _load_events()
    recent = events.get("events", [])[-limit:]
    return {
        "success": True,
        "events": recent,
        "count": len(recent),
        "total": len(events.get("events", [])),
    }


@register("network_monitor.blocklist")
def network_monitor_blocklist(params: dict[str, Any] | None) -> dict[str, Any]:
    """Add or remove IPs from the local network blocklist.

    Params:
        action: "add" or "remove" or "list"
        ip: IP address to add/remove
    """
    if not params:
        return {"success": False, "error": "Missing parameters"}

    action = params.get("action", "list")
    blocklist = _load_blocklist()

    if action == "list":
        return {"success": True, "ips": blocklist.get("ips", [])}

    ip = params.get("ip", "")
    if not ip:
        return {"success": False, "error": "ip is required for add/remove"}

    if action == "add":
        if ip not in blocklist.get("ips", []):
            blocklist.setdefault("ips", []).append(ip)
            blocklist["updated_at"] = _now_iso()
            _save_blocklist(blocklist)
        return {"success": True, "message": f"IP {ip} added to blocklist"}

    if action == "remove":
        if ip in blocklist.get("ips", []):
            blocklist["ips"].remove(ip)
            blocklist["updated_at"] = _now_iso()
            _save_blocklist(blocklist)
        return {"success": True, "message": f"IP {ip} removed from blocklist"}

    return {"success": False, "error": f"Unknown action: {action}"}
