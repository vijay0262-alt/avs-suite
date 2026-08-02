"""Network Information module — provides detailed network adapter and connection info.

RPC methods:
    network.adapters      — list all network adapters with IP, MAC, status
    network.connections   — list active TCP connections
    network.statistics    — network I/O statistics
    network.ping          — ping a host and return latency
"""

from __future__ import annotations

import logging
import os
import platform
import socket
import subprocess
from typing import Any

import psutil

from avs_backend.api.registry import register

log = logging.getLogger("avs.network")

IS_WINDOWS = os.name == "nt"


def _run_cmd(cmd: list[str], timeout: int = 10) -> str:
    """Run a command and return stdout."""
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=False)
        return result.stdout.strip()
    except Exception as e:
        log.error("Command failed: %s", e)
        return ""


@register("network.adapters")
def network_adapters(_params: dict[str, Any] | None) -> dict[str, Any]:
    """List all network adapters with IP, MAC, status, and link speed."""
    adapters: list[dict[str, Any]] = []

    stats = psutil.net_if_stats()
    addrs = psutil.net_if_addrs()
    io_stats = psutil.net_io_counters(pernic=True)

    for name, stat in stats.items():
        addr_info = addrs.get(name, {})
        ipv4 = None
        ipv6 = None
        mac = None
        for addr in addr_info:
            if addr.family == socket.AF_INET and not ipv4:
                ipv4 = addr.address
            elif addr.family == socket.AF_INET6 and not ipv6:
                ipv6 = addr.address
            elif addr.family == psutil.AF_LINK and not mac:
                mac = addr.address

        io = io_stats.get(name)
        adapters.append({
            "name": name,
            "isup": stat.isup,
            "speedMbps": stat.speed if stat.speed > 0 else None,
            "mtu": stat.mtu,
            "duplex": stat.duplex.name if hasattr(stat.duplex, 'name') else str(stat.duplex),
            "ipv4": ipv4,
            "ipv6": ipv6,
            "mac": mac,
            "bytesSent": io.bytes_sent if io else 0,
            "bytesRecv": io.bytes_recv if io else 0,
            "packetsSent": io.packets_sent if io else 0,
            "packetsRecv": io.packets_recv if io else 0,
            "errorsIn": io.errin if io else 0,
            "errorsOut": io.errout if io else 0,
            "dropsIn": io.dropin if io else 0,
            "dropsOut": io.dropout if io else 0,
        })

    return {"adapters": adapters, "total": len(adapters)}


@register("network.connections")
def network_connections(_params: dict[str, Any] | None) -> dict[str, Any]:
    """List active TCP/UDP connections with process info."""
    try:
        conns = psutil.net_connections(kind='inet')
        connections: list[dict[str, Any]] = []
        for c in conns:
            try:
                proc_name = psutil.Process(c.pid).name() if c.pid else None
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                proc_name = None

            connections.append({
                "fd": c.fd,
                "family": "IPv4" if c.family == socket.AF_INET else "IPv6",
                "type": "TCP" if c.type == socket.SOCK_STREAM else "UDP",
                "localAddress": f"{c.laddr.ip}:{c.laddr.port}" if c.laddr else None,
                "remoteAddress": f"{c.raddr.ip}:{c.raddr.port}" if c.raddr else None,
                "status": c.status,
                "pid": c.pid,
                "processName": proc_name,
            })
        return {"connections": connections, "total": len(connections)}
    except (psutil.AccessDenied, PermissionError):
        return {"connections": [], "error": "Access denied — administrator privileges required"}


@register("network.statistics")
def network_statistics(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Return overall network I/O statistics."""
    io = psutil.net_io_counters()
    return {
        "bytesSent": io.bytes_sent,
        "bytesRecv": io.bytes_recv,
        "packetsSent": io.packets_sent,
        "packetsRecv": io.packets_recv,
        "errorsIn": io.errin,
        "errorsOut": io.errout,
        "dropsIn": io.dropin,
        "dropsOut": io.dropout,
    }


@register("network.ping")
def network_ping(params: dict[str, Any] | None) -> dict[str, Any]:
    """Ping a host and return latency statistics."""
    if not params or "host" not in params:
        return {"error": "host parameter is required"}
    host = params["host"]
    count = params.get("count", 4)

    if IS_WINDOWS:
        cmd = ["ping", "-n", str(count), host]
    else:
        cmd = ["ping", "-c", str(count), host]

    output = _run_cmd(cmd, timeout=30)

    latency_ms = None
    if IS_WINDOWS:
        for line in output.split("\n"):
            if "Average" in line or "average" in line:
                parts = line.split("=")
                if len(parts) >= 2:
                    latency_ms = int(parts[-1].strip().replace("ms", "").strip())
    else:
        for line in output.split("\n"):
            if "rtt min" in line or "round-trip" in line:
                parts = line.split("=")
                if len(parts) >= 2:
                    latency_ms = float(parts[-1].split("/")[0].strip())

    return {
        "host": host,
        "reachable": "Reply" in output or "bytes from" in output,
        "latencyMs": latency_ms,
        "raw": output,
    }


@register("network.dns")
def network_dns(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Return configured DNS servers."""
    if IS_WINDOWS:
        output = _run_cmd(["ipconfig", "/all"], timeout=10)
        dns_servers: list[str] = []
        for line in output.split("\n"):
            if "DNS Servers" in line:
                parts = line.split(":")
                if len(parts) >= 2:
                    ip = parts[-1].strip()
                    if ip and ip != " fec0:0:0:ffff::1":
                        dns_servers.append(ip)
        return {"dnsServers": dns_servers}
    return {"dnsServers": [], "error": "Only available on Windows"}
