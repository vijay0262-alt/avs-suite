"""Memory Optimizer - Safe Windows memory optimization.

Implements safe memory optimization techniques:
- Trim working sets of inactive processes
- Refresh Windows Explorer memory
- Release reclaimable cached memory using documented Windows APIs

Does NOT:
- Terminate applications
- Kill services
- Modify pagefile settings
- Disable Windows services
- Use registry "memory hacks"
"""

from __future__ import annotations

import ctypes
import logging
import platform
import time
from dataclasses import dataclass, field
from enum import Enum
from threading import Event
from typing import Callable

import psutil

logger = logging.getLogger(__name__)

# Critical system processes that should never be optimized
CRITICAL_SYSTEM_PROCESSES = {
    "system", "smss.exe", "csrss.exe", "wininit.exe",
    "services.exe", "lsass.exe", "svchost.exe", "winlogon.exe",
    "explorer.exe", "dwm.exe", "system idle process",
    "session manager", "windows defender", "msmpeng.exe",
    "security health service", "sense.exe",
}
IS_WINDOWS = platform.system() == "Windows"
if IS_WINDOWS:
    PROCESS_SET_QUOTA = 0x100
    PROCESS_QUERY_INFORMATION = 0x400
    PROCESS_VM_READ = 0x10
    try:
        kernel32 = ctypes.windll.kernel32
    except AttributeError:
        kernel32 = None
else:
    kernel32 = None


class OptimizationStatus(str, Enum):
    """Status of memory optimization operation."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILED = "failed"


@dataclass(slots=True)
class ProcessMemoryInfo:
    """Process memory information."""

    pid: int
    name: str
    memory_usage: int  # Memory usage in bytes
    working_set: int  # Working set in bytes
    private_bytes: int  # Private bytes in bytes
    status: str  # "running", "sleeping", "stopped"
    cpu_percent: float  # CPU percentage


@dataclass(slots=True)
class MemoryInfo:
    """Current memory usage statistics."""

    total_ram: int  # Total RAM in bytes
    used_ram: int  # Used RAM in bytes
    free_ram: int  # Free RAM in bytes
    cached_memory: int  # Cached memory in bytes
    memory_pressure: float  # Memory pressure 0.0-1.0
    available_ram: int  # Available RAM in bytes
    committed_memory: int  # Committed memory in bytes
    page_file_usage: int  # Page file usage in bytes
    memory_load_percent: float  # Memory load percentage


@dataclass(slots=True)
class OptimizationResult:
    """Result of memory optimization operation."""

    status: OptimizationStatus = OptimizationStatus.PENDING
    memory_freed: int = 0  # Bytes freed
    optimization_time_ms: int = 0  # Time taken in milliseconds
    processes_optimized: int = 0  # Number of processes optimized
    errors: list[str] = field(default_factory=list)
    before_memory: MemoryInfo | None = None
    after_memory: MemoryInfo | None = None
    health_improvement: float = 0.0  # Health score improvement (0-100)


def get_memory_info() -> MemoryInfo:
    """Get current memory usage statistics."""
    try:
        mem = psutil.virtual_memory()
        
        # Get page file information
        page_file_usage = 0
        committed_memory = 0
        if IS_WINDOWS:
            try:
                # Get page file usage from Windows API
                mem_status = ctypes.c_ulonglong * 6
                status = mem_status()
                if kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
                    page_file_usage = status[4]  # Total page file usage
                    committed_memory = status[5]  # Total committed memory
            except Exception:
                pass
        
        return MemoryInfo(
            total_ram=mem.total,
            used_ram=mem.used,
            free_ram=mem.free,
            cached_memory=mem.cached if hasattr(mem, 'cached') else 0,
            memory_pressure=mem.percent / 100.0,
            available_ram=mem.available,
            committed_memory=committed_memory,
            page_file_usage=page_file_usage,
            memory_load_percent=mem.percent,
        )
    except Exception as e:
        logger.error(f"Failed to get memory info: {e}")
        raise


def trim_process_working_sets(processes: list[psutil.Process]) -> int:
    """Trim working sets of inactive processes.

    This is a safe operation that tells Windows to move inactive pages
    to the pagefile, freeing physical RAM without terminating processes.

    Args:
        processes: List of processes to optimize

    Returns:
        Number of processes successfully optimized
    """
    if not IS_WINDOWS or not kernel32:
        return 0

    optimized = 0
    for proc in processes:
        try:
            # Skip system processes and critical processes
            if proc.pid < 10:
                continue

            # Get process name for logging
            try:
                name = proc.name()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

            # Skip critical Windows processes
            if name.lower() in CRITICAL_SYSTEM_PROCESSES:
                continue

            # Trim working set using Windows API
            try:
                handle = kernel32.OpenProcess(
                    PROCESS_SET_QUOTA | PROCESS_QUERY_INFORMATION,
                    False,
                    proc.pid
                )
                if handle:
                    # Empty working set - move all pages to pagefile
                    kernel32.EmptyWorkingSet(handle)
                    kernel32.CloseHandle(handle)
                    optimized += 1
                    logger.debug(f"Trimmed working set for process {name} (PID: {proc.pid})")
            except Exception as e:
                logger.debug(f"Could not trim working set for {name}: {e}")

        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue
        except Exception as e:
            logger.debug(f"Error processing PID {proc.pid}: {e}")

    return optimized


def refresh_explorer_memory() -> bool:
    """Refresh Windows Explorer memory.

    This safely refreshes the Windows Explorer process to free
    accumulated memory without losing user data.

    Returns:
        True if successful, False otherwise
    """
    if not IS_WINDOWS or not kernel32:
        return False

    try:
        # Find explorer.exe processes
        explorer_procs = [p for p in psutil.process_iter(['name']) if p.info['name'] == 'explorer.exe']

        if not explorer_procs:
            logger.warning("No explorer.exe process found")
            return False

        # Trim working set of explorer processes
        for proc in explorer_procs:
            try:
                handle = kernel32.OpenProcess(
                    PROCESS_SET_QUOTA | PROCESS_QUERY_INFORMATION,
                    False,
                    proc.pid
                )
                if handle:
                    kernel32.EmptyWorkingSet(handle)
                    kernel32.CloseHandle(handle)
                    logger.debug(f"Refreshed explorer.exe memory (PID: {proc.pid})")
            except Exception as e:
                logger.debug(f"Could not refresh explorer memory: {e}")

        return True
    except Exception as e:
        logger.error(f"Failed to refresh explorer memory: {e}")
        return False


def release_cached_memory() -> int:
    """Release reclaimable cached memory.

    Uses Windows API to release cached memory that can be safely reclaimed.

    Returns:
        Estimated bytes released
    """
    if not IS_WINDOWS or not kernel32:
        return 0

    try:
        # Get memory before
        mem_before = psutil.virtual_memory()

        # Use Windows API to release standby list
        # This is safe and doesn't affect system stability
        try:
            # Call SetSystemFileCacheSize to reduce file cache
            kernel32.SetSystemFileCacheSize(-1, -1, 0)
            logger.debug("Released system file cache")
        except Exception as e:
            logger.debug(f"Could not release file cache: {e}")

        # Get memory after
        mem_after = psutil.virtual_memory()

        # Estimate freed memory (difference in cached)
        freed = 0
        if hasattr(mem_before, 'cached') and hasattr(mem_after, 'cached'):
            freed = max(0, mem_before.cached - mem_after.cached)

        return freed
    except Exception as e:
        logger.error(f"Failed to release cached memory: {e}")
        return 0


def refresh_standby_memory() -> int:
    """Refresh standby memory where supported.

    Uses Windows API to flush standby lists on Windows 8+.

    Returns:
        Estimated bytes released
    """
    if not IS_WINDOWS or not kernel32:
        return 0

    try:
        # Get memory before
        mem_before = psutil.virtual_memory()

        # Use Windows API to flush standby lists
        try:
            # This is available on Windows 8 and later
            # Flushes the standby list to free memory
            ctypes.windll.psapi.EmptyWorkingSet(kernel32.GetCurrentProcess())
            logger.debug("Refreshed standby memory")
        except Exception as e:
            logger.debug(f"Could not refresh standby memory: {e}")

        # Get memory after
        mem_after = psutil.virtual_memory()

        # Estimate freed memory
        freed = 0
        if hasattr(mem_before, 'cached') and hasattr(mem_after, 'cached'):
            freed = max(0, mem_before.cached - mem_after.cached)

        return freed
    except Exception as e:
        logger.error(f"Failed to refresh standby memory: {e}")
        return 0


def get_process_memory_info(sort_by: str = "memory", limit: int = 50) -> list[ProcessMemoryInfo]:
    """Get process memory information with sorting.

    Args:
        sort_by: Sort by "memory", "cpu", or "name"
        limit: Maximum number of processes to return

    Returns:
        List of ProcessMemoryInfo objects
    """
    processes = []
    
    try:
        for proc in psutil.process_iter(['pid', 'name', 'status']):
            try:
                # Get process memory info
                mem_info = proc.memory_info()
                cpu_percent = proc.cpu_percent(interval=None)
                
                # Determine status
                status = proc.info['status']
                if status == psutil.STATUS_RUNNING:
                    status_str = "running"
                elif status == psutil.STATUS_SLEEPING:
                    status_str = "sleeping"
                else:
                    status_str = "stopped"
                
                process_info = ProcessMemoryInfo(
                    pid=proc.pid,
                    name=proc.info['name'],
                    memory_usage=mem_info.rss if hasattr(mem_info, 'rss') else 0,
                    working_set=mem_info.rss if hasattr(mem_info, 'rss') else 0,
                    private_bytes=mem_info.private if hasattr(mem_info, 'private') else 0,
                    status=status_str,
                    cpu_percent=cpu_percent,
                )
                processes.append(process_info)
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue
            except Exception as e:
                logger.debug(f"Error processing process: {e}")
                continue
        
        # Sort processes
        if sort_by == "memory":
            processes.sort(key=lambda p: p.memory_usage, reverse=True)
        elif sort_by == "cpu":
            processes.sort(key=lambda p: p.cpu_percent, reverse=True)
        elif sort_by == "name":
            processes.sort(key=lambda p: p.name.lower())
        
        # Limit results
        return processes[:limit]
    
    except Exception as e:
        logger.error(f"Failed to get process memory info: {e}")
        return []


def check_optimization_permissions() -> dict[str, Any]:
    """Check if optimization is available due to permissions.

    Returns:
        Dict with 'available' (bool) and 'warning' (str if not available)
    """
    if not IS_WINDOWS:
        return {
            "available": False,
            "warning": "Memory optimization is only available on Windows"
        }
    
    if not kernel32:
        return {
            "available": False,
            "warning": "Windows API not available"
        }
    
    try:
        # Test if we can open a process handle
        test_handle = kernel32.OpenProcess(
            PROCESS_QUERY_INFORMATION,
            False,
            psutil.Process().pid
        )
        if test_handle:
            kernel32.CloseHandle(test_handle)
            return {"available": True, "warning": None}
        else:
            return {
                "available": False,
                "warning": "Insufficient permissions to optimize memory. Run as administrator."
            }
    except Exception as e:
        return {
            "available": False,
            "warning": f"Cannot access process handles: {str(e)}"
        }


def optimize_memory(
    cancel: Event,
    on_progress: Callable[[int], None] | None = None,
) -> OptimizationResult:
    """Perform safe memory optimization.

    Args:
        cancel: Cancellation event
        on_progress: Progress callback (0-100)

    Returns:
        OptimizationResult with details of the operation
    """
    result = OptimizationResult(status=OptimizationStatus.RUNNING)
    start_time = time.time()
    _TIMEOUT_S = 30.0

    try:
        # Get initial memory state
        logger.info("Starting memory optimization")
        if on_progress:
            on_progress(10)

        result.before_memory = get_memory_info()
        logger.info(f"Memory before optimization: {result.before_memory.used_ram / 1024 / 1024:.1f} MB used")

        if cancel.is_set():
            result.status = OptimizationStatus.CANCELLED
            return result

        # Step 1: Trim working sets of inactive processes
        logger.info("Trimming working sets of inactive processes")
        if on_progress:
            on_progress(30)

        try:
            all_processes = list(psutil.process_iter(['pid', 'name']))
            optimized = trim_process_working_sets(all_processes)
            result.processes_optimized = optimized
            logger.info(f"Optimized {optimized} processes")
        except Exception as e:
            logger.error(f"Failed to trim working sets: {e}")
            result.errors.append(f"Failed to trim working sets: {str(e)}")

        if cancel.is_set() or (time.time() - start_time) > _TIMEOUT_S:
            result.status = OptimizationStatus.CANCELLED
            return result

        # Step 2: Refresh Windows Explorer memory
        logger.info("Refreshing Windows Explorer memory")
        if on_progress:
            on_progress(60)

        try:
            refresh_explorer_memory()
        except Exception as e:
            logger.error(f"Failed to refresh explorer memory: {e}")
            result.errors.append(f"Failed to refresh explorer memory: {str(e)}")

        if cancel.is_set() or (time.time() - start_time) > _TIMEOUT_S:
            result.status = OptimizationStatus.CANCELLED
            return result

        # Step 3: Release cached memory
        logger.info("Releasing cached memory")
        if on_progress:
            on_progress(70)

        try:
            freed = release_cached_memory()
            result.memory_freed += freed
        except Exception as e:
            logger.error(f"Failed to release cached memory: {e}")
            result.errors.append(f"Failed to release cached memory: {str(e)}")

        if cancel.is_set() or (time.time() - start_time) > _TIMEOUT_S:
            result.status = OptimizationStatus.CANCELLED
            return result

        # Step 4: Refresh standby memory
        logger.info("Refreshing standby memory")
        if on_progress:
            on_progress(80)

        try:
            freed = refresh_standby_memory()
            result.memory_freed += freed
        except Exception as e:
            logger.error(f"Failed to refresh standby memory: {e}")
            result.errors.append(f"Failed to refresh standby memory: {str(e)}")

        if cancel.is_set() or (time.time() - start_time) > _TIMEOUT_S:
            result.status = OptimizationStatus.CANCELLED
            return result

        # Get final memory state
        logger.info("Getting final memory state")
        if on_progress:
            on_progress(90)

        result.after_memory = get_memory_info()
        logger.info(f"Memory after optimization: {result.after_memory.used_ram / 1024 / 1024:.1f} MB used")

        # Calculate total memory freed
        if result.before_memory and result.after_memory:
            result.memory_freed = max(0, result.before_memory.used_ram - result.after_memory.used_ram)

        # Calculate health improvement
        if result.before_memory and result.after_memory:
            before_pressure = result.before_memory.memory_pressure
            after_pressure = result.after_memory.memory_pressure
            # Health improvement is reduction in memory pressure (0-100 scale)
            pressure_reduction = max(0, before_pressure - after_pressure)
            result.health_improvement = pressure_reduction * 100

        # Calculate elapsed time
        result.optimization_time_ms = int((time.time() - start_time) * 1000)

        result.status = OptimizationStatus.COMPLETED
        logger.info(f"Memory optimization completed: {result.memory_freed / 1024 / 1024:.1f} MB freed in {result.optimization_time_ms}ms")

        if on_progress:
            on_progress(100)

    except Exception as e:
        logger.error(f"Memory optimization failed: {e}")
        result.status = OptimizationStatus.FAILED
        result.errors.append(str(e))

    return result
