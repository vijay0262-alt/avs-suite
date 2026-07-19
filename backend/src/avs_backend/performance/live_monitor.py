"""Live Performance Monitor - Real-time system performance monitoring.

Provides real-time monitoring of:
- CPU usage percentage
- RAM usage percentage
- Disk usage and activity
- Network usage
- Running processes count
- Threads count
- Handles count

Refreshes every 2 seconds with minimal CPU overhead.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import psutil

from avs_backend.logs import get_logger

logger = get_logger(__name__)


@dataclass(slots=True)
class CpuMetrics:
    """CPU performance metrics."""

    usage_percent: float  # Overall CPU usage 0-100
    cores: int  # Number of CPU cores
    frequency_mhz: float  # CPU frequency in MHz
    process_count: int  # Number of running processes


@dataclass(slots=True)
class MemoryMetrics:
    """Memory performance metrics."""

    total_bytes: int  # Total RAM in bytes
    used_bytes: int  # Used RAM in bytes
    free_bytes: int  # Free RAM in bytes
    available_bytes: int  # Available RAM in bytes
    usage_percent: float  # Memory usage percentage 0-100
    cached_bytes: int  # Cached memory in bytes


@dataclass(slots=True)
class DiskMetrics:
    """Disk performance metrics."""

    total_bytes: int  # Total disk space in bytes
    used_bytes: int  # Used disk space in bytes
    free_bytes: int  # Free disk space in bytes
    usage_percent: float  # Disk usage percentage 0-100
    read_bytes_per_sec: float  # Disk read rate in bytes/sec
    write_bytes_per_sec: float  # Disk write rate in bytes/sec


@dataclass(slots=True)
class NetworkMetrics:
    """Network performance metrics."""

    bytes_sent: int  # Total bytes sent
    bytes_recv: int  # Total bytes received
    bytes_sent_per_sec: float  # Send rate in bytes/sec
    bytes_recv_per_sec: float  # Receive rate in bytes/sec


@dataclass(slots=True)
class SystemMetrics:
    """Complete system performance metrics."""

    cpu: CpuMetrics
    memory: MemoryMetrics
    disk: DiskMetrics
    network: NetworkMetrics
    threads: int  # Total threads
    handles: int  # Total handles


# Track previous network and disk stats for rate calculation
_prev_net_io = None
_prev_disk_io = None


def get_cpu_metrics() -> CpuMetrics:
    """Get current CPU metrics."""
    try:
        cpu_percent = psutil.cpu_percent(interval=0.1)
        cores = psutil.cpu_count(logical=True)
        freq = psutil.cpu_freq()
        freq_mhz = freq.current if freq else 0.0
        process_count = len(psutil.pids())

        return CpuMetrics(
            usage_percent=cpu_percent,
            cores=cores or 0,
            frequency_mhz=freq_mhz,
            process_count=process_count,
        )
    except Exception as e:
        logger.error(f"Failed to get CPU metrics: {e}")
        return CpuMetrics(usage_percent=0.0, cores=0, frequency_mhz=0.0, process_count=0)


def get_memory_metrics() -> MemoryMetrics:
    """Get current memory metrics."""
    try:
        mem = psutil.virtual_memory()

        return MemoryMetrics(
            total_bytes=mem.total,
            used_bytes=mem.used,
            free_bytes=mem.free,
            available_bytes=mem.available,
            usage_percent=mem.percent,
            cached_bytes=mem.cached if hasattr(mem, 'cached') else 0,
        )
    except Exception as e:
        logger.error(f"Failed to get memory metrics: {e}")
        return MemoryMetrics(
            total_bytes=0,
            used_bytes=0,
            free_bytes=0,
            available_bytes=0,
            usage_percent=0.0,
            cached_bytes=0,
        )


def get_disk_metrics() -> DiskMetrics:
    """Get current disk metrics."""
    global _prev_disk_io

    try:
        # Get primary disk (C:) usage
        disk = psutil.disk_usage("C:\\")
        total_bytes = disk.total
        used_bytes = disk.used
        free_bytes = disk.free
        usage_percent = disk.percent

        # Get disk I/O rates
        current_disk_io = psutil.disk_io_counters()
        read_bytes_per_sec = 0.0
        write_bytes_per_sec = 0.0

        if current_disk_io and _prev_disk_io:
            # Calculate rates (assuming ~2 second interval)
            time_delta = 2.0  # seconds
            read_delta = current_disk_io.read_bytes - _prev_disk_io.read_bytes
            write_delta = current_disk_io.write_bytes - _prev_disk_io.write_bytes
            read_bytes_per_sec = read_delta / time_delta if time_delta > 0 else 0.0
            write_bytes_per_sec = write_delta / time_delta if time_delta > 0 else 0.0

        _prev_disk_io = current_disk_io

        return DiskMetrics(
            total_bytes=total_bytes,
            used_bytes=used_bytes,
            free_bytes=free_bytes,
            usage_percent=usage_percent,
            read_bytes_per_sec=read_bytes_per_sec,
            write_bytes_per_sec=write_bytes_per_sec,
        )
    except Exception as e:
        logger.error(f"Failed to get disk metrics: {e}")
        return DiskMetrics(
            total_bytes=0,
            used_bytes=0,
            free_bytes=0,
            usage_percent=0.0,
            read_bytes_per_sec=0.0,
            write_bytes_per_sec=0.0,
        )


def get_network_metrics() -> NetworkMetrics:
    """Get current network metrics."""
    global _prev_net_io

    try:
        current_net_io = psutil.net_io_counters()
        if not current_net_io:
            return NetworkMetrics(
                bytes_sent=0,
                bytes_recv=0,
                bytes_sent_per_sec=0.0,
                bytes_recv_per_sec=0.0,
            )

        bytes_sent = current_net_io.bytes_sent
        bytes_recv = current_net_io.bytes_recv
        bytes_sent_per_sec = 0.0
        bytes_recv_per_sec = 0.0

        if _prev_net_io:
            # Calculate rates (assuming ~2 second interval)
            time_delta = 2.0  # seconds
            sent_delta = bytes_sent - _prev_net_io.bytes_sent
            recv_delta = bytes_recv -(_prev_net_io.bytes_recv if _prev_net_io else 0)
            bytes_sent_per_sec = sent_delta / time_delta if time_delta > 0 else 0.0
            bytes_recv_per_sec = recv_delta / time_delta if time_delta > 0 else 0.0

        _prev_net_io = current_net_io

        return NetworkMetrics(
            bytes_sent=bytes_sent,
            bytes_recv=bytes_recv,
            bytes_sent_per_sec=bytes_sent_per_sec,
            bytes_recv_per_sec=bytes_recv_per_sec,
        )
    except Exception as e:
        logger.error(f"Failed to get network metrics: {e}")
        return NetworkMetrics(
            bytes_sent=0,
            bytes_recv=0,
            bytes_sent_per_sec=0.0,
            bytes_recv_per_sec=0.0,
        )


def get_system_metrics() -> SystemMetrics:
    """Get complete system performance metrics."""
    try:
        cpu = get_cpu_metrics()
        memory = get_memory_metrics()
        disk = get_disk_metrics()
        network = get_network_metrics()

        # Get threads and handles
        threads = 0
        handles = 0
        try:
            threads = sum(p.num_threads() for p in psutil.process_iter(['num_threads']) if p.info['num_threads'])
            handles = sum(p.num_handles() for p in psutil.process_iter(['num_handles']) if p.info.get('num_handles'))
        except Exception as e:
            logger.debug(f"Could not get threads/handles: {e}")

        return SystemMetrics(
            cpu=cpu,
            memory=memory,
            disk=disk,
            network=network,
            threads=threads,
            handles=handles,
        )
    except Exception as e:
        logger.error(f"Failed to get system metrics: {e}")
        raise


def metrics_to_dict(metrics: SystemMetrics) -> dict[str, Any]:
    """Convert SystemMetrics to dictionary for JSON serialization."""
    return {
        "cpu": {
            "usagePercent": metrics.cpu.usage_percent,
            "cores": metrics.cpu.cores,
            "frequencyMhz": metrics.cpu.frequency_mhz,
            "processCount": metrics.cpu.process_count,
        },
        "memory": {
            "totalBytes": metrics.memory.total_bytes,
            "usedBytes": metrics.memory.used_bytes,
            "freeBytes": metrics.memory.free_bytes,
            "availableBytes": metrics.memory.available_bytes,
            "usagePercent": metrics.memory.usage_percent,
            "cachedBytes": metrics.memory.cached_bytes,
        },
        "disk": {
            "totalBytes": metrics.disk.total_bytes,
            "usedBytes": metrics.disk.used_bytes,
            "freeBytes": metrics.disk.free_bytes,
            "usagePercent": metrics.disk.usage_percent,
            "readBytesPerSec": metrics.disk.read_bytes_per_sec,
            "writeBytesPerSec": metrics.disk.write_bytes_per_sec,
        },
        "network": {
            "bytesSent": metrics.network.bytes_sent,
            "bytesRecv": metrics.network.bytes_recv,
            "bytesSentPerSec": metrics.network.bytes_sent_per_sec,
            "bytesRecvPerSec": metrics.network.bytes_recv_per_sec,
        },
        "threads": metrics.threads,
        "handles": metrics.handles,
    }
