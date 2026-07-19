"""Live Performance Monitor - Real-time system performance monitoring.

Provides real-time monitoring of:
- CPU usage percentage, per-core usage, temperature, processor name
- RAM usage percentage, committed memory
- Disk usage, activity, health
- Network usage
- System uptime, logged-in user, Windows version
- Running processes count, threads count, handles count

Refreshes every 2 seconds with minimal CPU overhead.
"""

from __future__ import annotations

import logging
import platform
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any

import psutil

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class CpuMetrics:
    """CPU performance metrics."""

    usage_percent: float  # Overall CPU usage 0-100
    per_core_usage: list[float]  # Per-core usage percentages
    cores: int  # Number of CPU cores
    frequency_mhz: float  # CPU frequency in MHz
    process_count: int  # Number of running processes
    temperature_celsius: float  # CPU temperature in Celsius (0 if unavailable)
    processor_name: str  # Processor name


@dataclass(slots=True)
class MemoryMetrics:
    """Memory performance metrics."""

    total_bytes: int  # Total RAM in bytes
    used_bytes: int  # Used RAM in bytes
    free_bytes: int  # Free RAM in bytes
    available_bytes: int  # Available RAM in bytes
    usage_percent: float  # Memory usage percentage 0-100
    cached_bytes: int  # Cached memory in bytes
    committed_bytes: int  # Committed memory in bytes


@dataclass(slots=True)
class DiskMetrics:
    """Disk performance metrics."""

    total_bytes: int  # Total disk space in bytes
    used_bytes: int  # Used disk space in bytes
    free_bytes: int  # Free disk space in bytes
    usage_percent: float  # Disk usage percentage 0-100
    read_bytes_per_sec: float  # Disk read rate in bytes/sec
    write_bytes_per_sec: float  # Disk write rate in bytes/sec
    active_time_percent: float  # Disk active time percentage 0-100
    health_status: str  # Disk health status (good, warning, poor, unknown)


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
    uptime_seconds: float  # System uptime in seconds
    logged_in_user: str  # Logged-in user name
    windows_version: str  # Windows version


# Track previous network and disk stats for rate calculation
_prev_net_io = None
_prev_disk_io = None

# Graph history (60 seconds of data, 2-second intervals = 30 points)
_cpu_history: deque[float] = deque(maxlen=30)
_memory_history: deque[float] = deque(maxlen=30)
_disk_read_history: deque[float] = deque(maxlen=30)
_disk_write_history: deque[float] = deque(maxlen=30)
_network_upload_history: deque[float] = deque(maxlen=30)
_network_download_history: deque[float] = deque(maxlen=30)


def get_cpu_metrics() -> CpuMetrics:
    """Get current CPU metrics."""
    try:
        cpu_percent = psutil.cpu_percent(interval=0.1)
        cores = psutil.cpu_count(logical=True)
        freq = psutil.cpu_freq()
        freq_mhz = freq.current if freq else 0.0
        process_count = len(psutil.pids())
        
        # Per-core usage
        per_core_usage = psutil.cpu_percent(interval=0.1, percpu=True)
        
        # Temperature (if available)
        temperature_celsius = 0.0
        try:
            if hasattr(psutil, 'sensors_temperatures'):
                temps = psutil.sensors_temperatures()
                if temps:
                    # Try to get CPU temperature
                    for name, entries in temps.items():
                        if 'cpu' in name.lower() or 'core' in name.lower():
                            if entries:
                                temperature_celsius = entries[0].current
                                break
        except Exception:
            pass
        
        # Processor name
        processor_name = platform.processor() or "Unknown"
        
        return CpuMetrics(
            usage_percent=cpu_percent,
            per_core_usage=per_core_usage,
            cores=cores or 0,
            frequency_mhz=freq_mhz,
            process_count=process_count,
            temperature_celsius=temperature_celsius,
            processor_name=processor_name,
        )
    except Exception as e:
        logger.error(f"Failed to get CPU metrics: {e}")
        return CpuMetrics(
            usage_percent=0.0,
            per_core_usage=[],
            cores=0,
            frequency_mhz=0.0,
            process_count=0,
            temperature_celsius=0.0,
            processor_name="Unknown",
        )


def get_memory_metrics() -> MemoryMetrics:
    """Get current memory metrics."""
    try:
        mem = psutil.virtual_memory()
        
        # Get committed memory (Windows-specific)
        committed_bytes = 0
        if platform.system() == "Windows":
            try:
                import ctypes
                mem_status = ctypes.c_ulonglong * 6
                status = mem_status()
                kernel32 = ctypes.windll.kernel32
                if kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
                    committed_bytes = status[5]  # Total committed memory
            except Exception:
                pass

        return MemoryMetrics(
            total_bytes=mem.total,
            used_bytes=mem.used,
            free_bytes=mem.free,
            available_bytes=mem.available,
            usage_percent=mem.percent,
            cached_bytes=mem.cached if hasattr(mem, 'cached') else 0,
            committed_bytes=committed_bytes,
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
            committed_bytes=0,
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
        active_time_percent = 0.0

        if current_disk_io and _prev_disk_io:
            # Calculate rates (assuming ~2 second interval)
            time_delta = 2.0  # seconds
            read_delta = current_disk_io.read_bytes - _prev_disk_io.read_bytes
            write_delta = current_disk_io.write_bytes - _prev_disk_io.write_bytes
            read_bytes_per_sec = read_delta / time_delta if time_delta > 0 else 0.0
            write_bytes_per_sec = write_delta / time_delta if time_delta > 0 else 0.0
            
            # Calculate active time (simplified estimation)
            total_io = read_delta + write_delta
            # Assume average disk speed of 100 MB/s for active time calculation
            active_time_percent = min(100, (total_io / (100 * 1024 * 1024 * time_delta)) * 100)

        _prev_disk_io = current_disk_io

        # Disk health status (simplified - based on free space)
        health_status = "good"
        if usage_percent > 90:
            health_status = "poor"
        elif usage_percent > 75:
            health_status = "warning"

        return DiskMetrics(
            total_bytes=total_bytes,
            used_bytes=used_bytes,
            free_bytes=free_bytes,
            usage_percent=usage_percent,
            read_bytes_per_sec=read_bytes_per_sec,
            write_bytes_per_sec=write_bytes_per_sec,
            active_time_percent=active_time_percent,
            health_status=health_status,
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
            active_time_percent=0.0,
            health_status="unknown",
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

        # Get system uptime
        uptime_seconds = 0.0
        try:
            uptime_seconds = time.time() - psutil.boot_time()
        except Exception:
            pass

        # Get logged-in user
        logged_in_user = "Unknown"
        try:
            import getpass
            logged_in_user = getpass.getuser()
        except Exception:
            pass

        # Get Windows version
        windows_version = "Unknown"
        try:
            if platform.system() == "Windows":
                windows_version = platform.version()
        except Exception:
            pass

        return SystemMetrics(
            cpu=cpu,
            memory=memory,
            disk=disk,
            network=network,
            threads=threads,
            handles=handles,
            uptime_seconds=uptime_seconds,
            logged_in_user=logged_in_user,
            windows_version=windows_version,
        )
    except Exception as e:
        logger.error(f"Failed to get system metrics: {e}")
        raise


def metrics_to_dict(metrics: SystemMetrics) -> dict[str, Any]:
    """Convert SystemMetrics to dictionary for JSON serialization."""
    return {
        "cpu": {
            "usagePercent": metrics.cpu.usage_percent,
            "perCoreUsage": metrics.cpu.per_core_usage,
            "cores": metrics.cpu.cores,
            "frequencyMhz": metrics.cpu.frequency_mhz,
            "processCount": metrics.cpu.process_count,
            "temperatureCelsius": metrics.cpu.temperature_celsius,
            "processorName": metrics.cpu.processor_name,
        },
        "memory": {
            "totalBytes": metrics.memory.total_bytes,
            "usedBytes": metrics.memory.used_bytes,
            "freeBytes": metrics.memory.free_bytes,
            "availableBytes": metrics.memory.available_bytes,
            "usagePercent": metrics.memory.usage_percent,
            "cachedBytes": metrics.memory.cached_bytes,
            "committedBytes": metrics.memory.committed_bytes,
        },
        "disk": {
            "totalBytes": metrics.disk.total_bytes,
            "usedBytes": metrics.disk.used_bytes,
            "freeBytes": metrics.disk.free_bytes,
            "usagePercent": metrics.disk.usage_percent,
            "readBytesPerSec": metrics.disk.read_bytes_per_sec,
            "writeBytesPerSec": metrics.disk.write_bytes_per_sec,
            "activeTimePercent": metrics.disk.active_time_percent,
            "healthStatus": metrics.disk.health_status,
        },
        "network": {
            "bytesSent": metrics.network.bytes_sent,
            "bytesRecv": metrics.network.bytes_recv,
            "bytesSentPerSec": metrics.network.bytes_sent_per_sec,
            "bytesRecvPerSec": metrics.network.bytes_recv_per_sec,
        },
        "threads": metrics.threads,
        "handles": metrics.handles,
        "uptimeSeconds": metrics.uptime_seconds,
        "loggedInUser": metrics.logged_in_user,
        "windowsVersion": metrics.windows_version,
    }


def update_graph_history(metrics: SystemMetrics) -> None:
    """Update graph history with current metrics."""
    global _cpu_history, _memory_history, _disk_read_history, _disk_write_history
    global _network_upload_history, _network_download_history
    
    try:
        _cpu_history.append(metrics.cpu.usage_percent)
        _memory_history.append(metrics.memory.usage_percent)
        _disk_read_history.append(metrics.disk.read_bytes_per_sec / (1024 * 1024))  # MB/s
        _disk_write_history.append(metrics.disk.write_bytes_per_sec / (1024 * 1024))  # MB/s
        _network_upload_history.append(metrics.network.bytes_sent_per_sec / (1024 * 1024))  # MB/s
        _network_download_history.append(metrics.network.bytes_recv_per_sec / (1024 * 1024))  # MB/s
    except Exception as e:
        logger.error(f"Failed to update graph history: {e}")


def get_graph_history() -> dict[str, Any]:
    """Get current graph history."""
    return {
        "cpu": list(_cpu_history),
        "memory": list(_memory_history),
        "diskRead": list(_disk_read_history),
        "diskWrite": list(_disk_write_history),
        "networkUpload": list(_network_upload_history),
        "networkDownload": list(_network_download_history),
    }


def clear_graph_history() -> None:
    """Clear graph history."""
    global _cpu_history, _memory_history, _disk_read_history, _disk_write_history
    global _network_upload_history, _network_download_history
    
    _cpu_history.clear()
    _memory_history.clear()
    _disk_read_history.clear()
    _disk_write_history.clear()
    _network_upload_history.clear()
    _network_download_history.clear()
    logger.info("Graph history cleared")


@dataclass(slots=True)
class ProcessInfo:
    """Process information for top processes list."""
    
    pid: int
    name: str
    cpu_percent: float
    memory_bytes: int
    status: str


def get_top_processes(sort_by: str = "cpu", limit: int = 10, search: str = "") -> list[ProcessInfo]:
    """Get top processes by CPU or memory usage.
    
    Args:
        sort_by: Sort by "cpu" or "memory"
        limit: Maximum number of processes to return
        search: Filter by process name (case-insensitive)
    
    Returns:
        List of ProcessInfo objects
    """
    processes = []
    
    try:
        for proc in psutil.process_iter(['pid', 'name', 'status']):
            try:
                cpu_percent = proc.cpu_percent(interval=0.1)
                mem_info = proc.memory_info()
                memory_bytes = mem_info.rss if hasattr(mem_info, 'rss') else 0
                
                # Determine status
                status = proc.info['status']
                if status == psutil.STATUS_RUNNING:
                    status_str = "running"
                elif status == psutil.STATUS_SLEEPING:
                    status_str = "sleeping"
                else:
                    status_str = "stopped"
                
                # Search filter
                if search and search.lower() not in proc.info['name'].lower():
                    continue
                
                process_info = ProcessInfo(
                    pid=proc.info['pid'],
                    name=proc.info['name'],
                    cpu_percent=cpu_percent,
                    memory_bytes=memory_bytes,
                    status=status_str,
                )
                processes.append(process_info)
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue
            except Exception as e:
                logger.debug(f"Error processing process: {e}")
                continue
        
        # Sort processes
        if sort_by == "cpu":
            processes.sort(key=lambda p: p.cpu_percent, reverse=True)
        elif sort_by == "memory":
            processes.sort(key=lambda p: p.memory_bytes, reverse=True)
        
        # Limit results
        return processes[:limit]
    
    except Exception as e:
        logger.error(f"Failed to get top processes: {e}")
        return []


@dataclass(slots=True)
class Alert:
    """Performance alert."""
    
    alert_type: str  # "cpu", "memory", "disk", "network"
    severity: str  # "warning", "critical"
    message: str
    value: float  # Current value that triggered the alert
    threshold: float  # Threshold that was exceeded


def generate_alerts(metrics: SystemMetrics) -> list[Alert]:
    """Generate performance alerts based on current metrics.
    
    Args:
        metrics: Current system metrics
    
    Returns:
        List of Alert objects
    """
    alerts = []
    
    try:
        # CPU alert
        if metrics.cpu.usage_percent > 90:
            alerts.append(Alert(
                alert_type="cpu",
                severity="critical",
                message=f"CPU usage critically high: {metrics.cpu.usage_percent:.1f}%",
                value=metrics.cpu.usage_percent,
                threshold=90.0,
            ))
        elif metrics.cpu.usage_percent > 75:
            alerts.append(Alert(
                alert_type="cpu",
                severity="warning",
                message=f"CPU usage elevated: {metrics.cpu.usage_percent:.1f}%",
                value=metrics.cpu.usage_percent,
                threshold=75.0,
            ))
        
        # Memory alert
        if metrics.memory.usage_percent > 90:
            alerts.append(Alert(
                alert_type="memory",
                severity="critical",
                message=f"Memory usage critically high: {metrics.memory.usage_percent:.1f}%",
                value=metrics.memory.usage_percent,
                threshold=90.0,
            ))
        elif metrics.memory.usage_percent > 75:
            alerts.append(Alert(
                alert_type="memory",
                severity="warning",
                message=f"Memory usage elevated: {metrics.memory.usage_percent:.1f}%",
                value=metrics.memory.usage_percent,
                threshold=75.0,
            ))
        
        # Disk space alert
        if metrics.disk.usage_percent > 90:
            alerts.append(Alert(
                alert_type="disk",
                severity="critical",
                message=f"Disk space critically low: {100 - metrics.disk.usage_percent:.1f}% free",
                value=100 - metrics.disk.usage_percent,
                threshold=10.0,
            ))
        elif metrics.disk.usage_percent > 85:
            alerts.append(Alert(
                alert_type="disk",
                severity="warning",
                message=f"Disk space low: {100 - metrics.disk.usage_percent:.1f}% free",
                value=100 - metrics.disk.usage_percent,
                threshold=15.0,
            ))
        
        # Disk activity alert
        if metrics.disk.active_time_percent > 95:
            alerts.append(Alert(
                alert_type="disk",
                severity="critical",
                message=f"Disk activity critically high: {metrics.disk.active_time_percent:.1f}%",
                value=metrics.disk.active_time_percent,
                threshold=95.0,
            ))
        elif metrics.disk.active_time_percent > 85:
            alerts.append(Alert(
                alert_type="disk",
                severity="warning",
                message=f"Disk activity elevated: {metrics.disk.active_time_percent:.1f}%",
                value=metrics.disk.active_time_percent,
                threshold=85.0,
            ))
        
        # Network alert (unusually high)
        total_network_mbps = (metrics.network.bytes_sent_per_sec + metrics.network.bytes_recv_per_sec) / (1024 * 1024)
        if total_network_mbps > 100:  # > 100 MB/s is unusually high
            alerts.append(Alert(
                alert_type="network",
                severity="warning",
                message=f"Unusually high network activity: {total_network_mbps:.1f} MB/s",
                value=total_network_mbps,
                threshold=100.0,
            ))
    
    except Exception as e:
        logger.error(f"Failed to generate alerts: {e}")
    
    return alerts
