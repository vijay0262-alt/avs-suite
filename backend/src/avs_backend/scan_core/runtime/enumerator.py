"""
Runtime Enumerator — streaming discovery of runtime assets.

Uses psutil for process, connection, and resource enumeration.
Uses native Windows APIs where they provide measurable benefits.
Avoids PowerShell and WMI unless absolutely necessary.

This module ONLY discovers. It never kills, suspends, optimizes, cleans, or classifies.
"""

from __future__ import annotations

import os
import sys
import time
import ctypes
import subprocess
import logging
from dataclasses import dataclass
from typing import Generator, Optional, Callable

import psutil

logger = logging.getLogger(__name__)

from .models import (
    ProcessAsset,
    ConnectionAsset,
    SessionAsset,
    LockedFileAsset,
    ResourceSnapshot,
    RuntimeStatistics,
)
from .filters import RuntimeFilterChain, AnyRuntimeAsset

_is_windows = sys.platform == "win32"


# ── Platform capabilities ──────────────────────────────────────

class RuntimeCapabilities:
    """Platform capability flags for runtime enumeration.

    Allows the enumerator to gracefully disable unsupported features
    instead of crashing or silently returning empty results.
    """
    supports_handles: bool
    supports_gpu: bool
    supports_locked_files: bool
    supports_sessions: bool

    def __init__(self) -> None:
        self.supports_handles = _is_windows
        self.supports_gpu = True  # nvidia-smi may be available on any platform
        self.supports_locked_files = _is_windows
        self.supports_sessions = True  # who/query user works on all platforms

    def __repr__(self) -> str:
        return (
            f"RuntimeCapabilities(handles={self.supports_handles}, "
            f"gpu={self.supports_gpu}, "
            f"locked_files={self.supports_locked_files}, "
            f"sessions={self.supports_sessions})"
        )

# ── Win32 API bindings ─────────────────────────────────────────

if _is_windows:
    _kernel32 = ctypes.windll.kernel32


# ── Progress events ────────────────────────────────────────────

@dataclass
class RuntimeProgressEvent:
    """Progress event emitted during runtime enumeration."""
    current_category: Optional[str] = None
    current_asset: Optional[str] = None
    assets_enumerated: int = 0
    elapsed_seconds: float = 0.0
    assets_per_second: float = 0.0
    cancelled: bool = False


RuntimeProgressCallback = Callable[[RuntimeProgressEvent], None]


# ── Cancellation ───────────────────────────────────────────────

class RuntimeCancelEvent:
    """Simple cancellation event for cooperative cancellation."""
    def __init__(self) -> None:
        self._cancelled = False

    def cancel(self) -> None:
        self._cancelled = True

    @property
    def is_cancelled(self) -> bool:
        return self._cancelled


# ── Options ────────────────────────────────────────────────────

@dataclass
class RuntimeEnumerateOptions:
    """Options controlling runtime enumeration behavior."""
    include_processes: bool = True
    include_connections: bool = True
    include_sessions: bool = True
    include_locked_files: bool = False
    include_resource_snapshot: bool = True
    progress_interval: int = 50
    filter: Optional[RuntimeFilterChain] = None
    cancel_event: Optional[RuntimeCancelEvent] = None
    locked_file_dirs: tuple[str, ...] = ()
    locked_file_extensions: tuple[str, ...] = ()


# ── Enumerator ─────────────────────────────────────────────────

class RuntimeEnumerator:
    """
    Streaming runtime asset enumerator.

    Usage:
        enumerator = RuntimeEnumerator()
        for asset in enumerator.enumerate():
            process(asset)

    Yields ProcessAsset, ConnectionAsset, SessionAsset, LockedFileAsset,
    and ResourceSnapshot objects incrementally.
    """

    def __init__(self) -> None:
        self.statistics = RuntimeStatistics()
        self.capabilities = RuntimeCapabilities()

    def enumerate(
        self,
        *,
        options: Optional[RuntimeEnumerateOptions] = None,
        on_progress: Optional[RuntimeProgressCallback] = None,
    ) -> Generator[AnyRuntimeAsset, None, None]:
        """Enumerate runtime assets, yielding them incrementally."""
        opts = options or RuntimeEnumerateOptions()
        self.statistics = RuntimeStatistics()
        start_time = time.monotonic()
        state = {"yielded": 0}

        def check_cancel() -> bool:
            if opts.cancel_event and opts.cancel_event.is_cancelled:
                if on_progress:
                    elapsed = time.monotonic() - start_time
                    on_progress(RuntimeProgressEvent(
                        current_category="Cancelled",
                        assets_enumerated=state["yielded"],
                        elapsed_seconds=elapsed,
                        assets_per_second=state["yielded"] / elapsed if elapsed > 0 else 0.0,
                        cancelled=True,
                    ))
                return True
            return False

        def emit_progress(category: str, current_asset: str) -> None:
            n = state["yielded"]
            if on_progress and n > 0 and n % opts.progress_interval == 0:
                elapsed = time.monotonic() - start_time
                on_progress(RuntimeProgressEvent(
                    current_category=category,
                    current_asset=current_asset,
                    assets_enumerated=n,
                    elapsed_seconds=elapsed,
                    assets_per_second=n / elapsed if elapsed > 0 else 0.0,
                ))

        # ── Processes ────────────────────────────────────────────
        if opts.include_processes:
            if check_cancel():
                self.statistics.finalize(time.monotonic() - start_time)
                return
            for asset in self._enumerate_processes(opts):
                if check_cancel():
                    break
                if opts.filter and not opts.filter.matches(asset):
                    self.statistics.skipped += 1
                    continue
                self.statistics.processes += 1
                state["yielded"] += 1
                emit_progress("Processes", asset.name)
                yield asset

        # ── Connections ──────────────────────────────────────────
        if opts.include_connections:
            if check_cancel():
                self.statistics.finalize(time.monotonic() - start_time)
                return
            for conn in self._enumerate_connections():
                if check_cancel():
                    break
                if opts.filter and not opts.filter.matches(conn):
                    self.statistics.skipped += 1
                    continue
                self.statistics.connections += 1
                state["yielded"] += 1
                emit_progress("Connections", conn.asset_name)
                yield conn

        # ── Sessions ─────────────────────────────────────────────
        if opts.include_sessions:
            if check_cancel():
                self.statistics.finalize(time.monotonic() - start_time)
                return
            for session in self._enumerate_sessions():
                if check_cancel():
                    break
                if opts.filter and not opts.filter.matches(session):
                    self.statistics.skipped += 1
                    continue
                self.statistics.sessions += 1
                state["yielded"] += 1
                emit_progress("Sessions", session.asset_name)
                yield session

        # ── Locked Files ─────────────────────────────────────────
        if opts.include_locked_files:
            if check_cancel():
                self.statistics.finalize(time.monotonic() - start_time)
                return
            for locked in self._enumerate_locked_files(opts):
                if check_cancel():
                    break
                if opts.filter and not opts.filter.matches(locked):
                    self.statistics.skipped += 1
                    continue
                self.statistics.locked_files += 1
                state["yielded"] += 1
                emit_progress("Locked Files", locked.asset_name)
                yield locked

        # ── Resource Snapshot ────────────────────────────────────
        if opts.include_resource_snapshot:
            if check_cancel():
                self.statistics.finalize(time.monotonic() - start_time)
                return
            snapshot = self._take_resource_snapshot()
            if snapshot:
                if opts.filter and not opts.filter.matches(snapshot):
                    self.statistics.skipped += 1
                else:
                    self.statistics.resource_snapshots += 1
                    state["yielded"] += 1
                    emit_progress("Resource Snapshot", "System")
                    yield snapshot

        # Finalize statistics
        elapsed = time.monotonic() - start_time
        self.statistics.finalize(elapsed)

        # Final progress event
        if on_progress:
            on_progress(RuntimeProgressEvent(
                current_category="Complete",
                assets_enumerated=state["yielded"],
                elapsed_seconds=elapsed,
                assets_per_second=state["yielded"] / elapsed if elapsed > 0 else 0.0,
            ))

    def _enumerate_processes(
        self, opts: RuntimeEnumerateOptions,
    ) -> Generator[ProcessAsset, None, None]:
        """Enumerate running processes via psutil.

        Platform-specific attributes (e.g. num_handles on Windows) are
        queried per-process with capability checks. One failing process
        never stops discovery.
        """
        # Exclude num_handles from bulk attrs — it's Windows-only and
        # causes process_iter to abort on Linux.
        attrs = [
            "pid", "name", "ppid", "exe", "cmdline", "cwd",
            "username", "cpu_percent", "memory_percent", "memory_info",
            "num_threads", "status", "create_time",
        ]

        try:
            process_iter = psutil.process_iter(attrs=attrs)
        except Exception as e:
            self.statistics.errors += 1
            logger.error("Failed to start process iteration: %s", e)
            return

        for proc in process_iter:
            try:
                info = proc.info
                pid = info["pid"]
                name = info["name"] or ""
                parent_pid = info.get("ppid")
                exe = info.get("exe") or ""
                cmdline = info.get("cmdline")
                cmdline_str = " ".join(cmdline) if cmdline else ""
                cwd = info.get("cwd") or ""
                username = info.get("username") or ""
                cpu_percent = info.get("cpu_percent") or 0.0
                memory_percent = info.get("memory_percent") or 0.0

                mem_info = info.get("memory_info")
                memory_bytes = mem_info.rss if mem_info else 0

                thread_count = info.get("num_threads") or 0
                status = info.get("status") or "Unknown"
                create_time = info.get("create_time") or 0.0

                # Query num_handles per-process only on Windows
                handle_count = 0
                if self.capabilities.supports_handles:
                    try:
                        handle_count = proc.num_handles()
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        pass
                    except Exception:
                        pass

                yield ProcessAsset(
                    pid=pid,
                    name=name,
                    parent_pid=parent_pid,
                    executable_path=exe,
                    command_line=cmdline_str,
                    working_directory=cwd,
                    username=username,
                    cpu_percent=cpu_percent,
                    memory_percent=memory_percent,
                    memory_bytes=memory_bytes,
                    thread_count=thread_count,
                    handle_count=handle_count,
                    status=status,
                    creation_time=create_time,
                )

            except (psutil.NoSuchProcess, psutil.AccessDenied) as e:
                self.statistics.permission_errors += 1
                logger.debug("Skipped process: %s", e)
                continue
            except Exception as e:
                self.statistics.errors += 1
                logger.warning("Unexpected error enumerating process: %s", e)
                continue

    def _enumerate_connections(self) -> Generator[ConnectionAsset, None, None]:
        """Enumerate active network connections via psutil."""
        try:
            connections = psutil.net_connections(kind="inet")
            for conn in connections:
                try:
                    protocol = "tcp" if conn.type == 1 else "udp"
                    local_addr = conn.laddr.ip if conn.laddr else ""
                    local_port = conn.laddr.port if conn.laddr else 0
                    remote_addr = conn.raddr.ip if conn.raddr else ""
                    remote_port = conn.raddr.port if conn.raddr else 0
                    state = conn.status or "UNKNOWN"
                    pid = conn.pid

                    process_name = ""
                    if pid:
                        try:
                            process_name = psutil.Process(pid).name()
                        except (psutil.NoSuchProcess, psutil.AccessDenied):
                            pass

                    yield ConnectionAsset(
                        protocol=protocol,
                        local_address=local_addr,
                        local_port=local_port,
                        remote_address=remote_addr,
                        remote_port=remote_port,
                        state=state,
                        pid=pid,
                        process_name=process_name,
                    )
                except Exception as e:
                    self.statistics.errors += 1
                    logger.debug("Skipped connection: %s", e)
                    continue

        except Exception as e:
            self.statistics.errors += 1
            logger.error("Failed to enumerate connections: %s", e)

    def _enumerate_sessions(self) -> Generator[SessionAsset, None, None]:
        """Enumerate interactive user sessions."""
        if _is_windows:
            yield from self._enumerate_sessions_windows()
        else:
            yield from self._enumerate_sessions_unix()

    def _enumerate_sessions_windows(self) -> Generator[SessionAsset, None, None]:
        """Enumerate sessions on Windows via query user command."""
        try:
            result = subprocess.run(
                ["query", "user"],
                capture_output=True, text=True, timeout=10,
            )
            if result.returncode != 0 or not result.stdout.strip():
                return

            lines = result.stdout.strip().split("\n")
            if len(lines) < 2:
                return

            # Parse header to find column positions
            header = lines[0].upper()

            for line in lines[1:]:
                if not line.strip():
                    continue
                try:
                    # query user output format:
                    # USERNAME SESSIONNAME ID STATE IDLE TIME LOGON TIME
                    # Fields are positional with variable spacing
                    parts = line.split()
                    if len(parts) < 4:
                        continue

                    username = parts[0]
                    # session_name may be absent (disconnected sessions have none)
                    # Check if parts[1] is numeric (session ID) or a name
                    idx = 1
                    session_name = ""
                    if not parts[idx].isdigit():
                        session_name = parts[idx]
                        idx += 1

                    if idx >= len(parts):
                        continue

                    session_id = int(parts[idx])
                    idx += 1
                    state = parts[idx] if idx < len(parts) else "Active"

                    # Remaining fields: idle time, logon time
                    # We don't parse these precisely as formats vary
                    yield SessionAsset(
                        session_id=session_id,
                        username=username,
                        session_type=session_name,
                        state=state,
                    )
                except Exception as e:
                    self.statistics.errors += 1
                    logger.debug("Skipped session line: %s", e)
                    continue

        except Exception as e:
            self.statistics.errors += 1
            logger.error("Failed to enumerate Windows sessions: %s", e)

    def _enumerate_sessions_unix(self) -> Generator[SessionAsset, None, None]:
        """Enumerate sessions on Unix/Linux via who command."""
        try:
            result = subprocess.run(
                ["who"],
                capture_output=True, text=True, timeout=10,
            )
            if result.returncode != 0:
                return

            for line in result.stdout.strip().split("\n"):
                if not line.strip():
                    continue
                try:
                    parts = line.split()
                    if len(parts) < 2:
                        continue
                    username = parts[0]
                    session_type = parts[1]
                    yield SessionAsset(
                        session_id=0,
                        username=username,
                        session_type=session_type,
                        state="Active",
                    )
                except Exception as e:
                    self.statistics.errors += 1
                    logger.debug("Skipped session line: %s", e)
                    continue

        except Exception as e:
            self.statistics.errors += 1
            logger.error("Failed to enumerate Unix sessions: %s", e)

    def _enumerate_locked_files(
        self, opts: RuntimeEnumerateOptions,
    ) -> Generator[LockedFileAsset, None, None]:
        """
        Detect files currently in use.

        On Windows, uses the Restart Manager API to detect locked files.
        On other platforms, gracefully disabled via capability flag.
        """
        if not self.capabilities.supports_locked_files:
            return

        yield from self._enumerate_locked_files_windows(opts)

    def _enumerate_locked_files_windows(
        self, opts: RuntimeEnumerateOptions,
    ) -> Generator[LockedFileAsset, None, None]:
        """Detect locked files on Windows by attempting to open them exclusively."""
        # If no directories specified, skip
        if not opts.locked_file_dirs:
            return

        try:
            for dir_path in opts.locked_file_dirs:
                if not os.path.isdir(dir_path):
                    continue
                try:
                    for entry in os.listdir(dir_path):
                        file_path = os.path.join(dir_path, entry)
                        if not os.path.isfile(file_path):
                            continue

                        # Filter by extension if specified
                        if opts.locked_file_extensions:
                            ext = os.path.splitext(entry)[1].lower()
                            if ext not in opts.locked_file_extensions:
                                continue

                        # Try to open the file exclusively
                        try:
                            fd = os.open(file_path, os.O_RDWR)
                            os.close(fd)
                        except (PermissionError, OSError):
                            # File is locked
                            yield LockedFileAsset(
                                path=file_path,
                                pid=None,
                                process_name="",
                            )
                        except Exception as e:
                            self.statistics.errors += 1
                            logger.debug("Error checking locked file %s: %s", file_path, e)
                            continue

                except (PermissionError, OSError) as e:
                    self.statistics.permission_errors += 1
                    logger.debug("Permission denied scanning %s: %s", dir_path, e)
                    continue

        except Exception as e:
            self.statistics.errors += 1
            logger.error("Failed to enumerate locked files: %s", e)

    def _take_resource_snapshot(self) -> Optional[ResourceSnapshot]:
        """Take a point-in-time snapshot of system resource usage."""
        try:
            cpu_percent = psutil.cpu_percent(interval=0.5)
            cpu_count = psutil.cpu_count() or 0

            mem = psutil.virtual_memory()
            memory_total = mem.total
            memory_used = mem.used
            memory_percent = mem.percent

            # Disk IO
            disk_io = psutil.disk_io_counters()
            disk_read = disk_io.read_bytes if disk_io else 0
            disk_write = disk_io.write_bytes if disk_io else 0

            # Network IO
            net_io = psutil.net_io_counters()
            net_sent = net_io.bytes_sent if net_io else 0
            net_recv = net_io.bytes_recv if net_io else 0

            # GPU (if available via psutil GPU extensions or nvidia-smi)
            gpu_percent = 0.0
            gpu_memory_total = 0
            gpu_memory_used = 0
            gpu_name = ""

            try:
                result = subprocess.run(
                    ["nvidia-smi", "--query-gpu=utilization.gpu,memory.total,memory.used,name",
                     "--format=csv,noheader,nounits"],
                    capture_output=True, text=True, timeout=5,
                )
                if result.returncode == 0 and result.stdout.strip():
                    line = result.stdout.strip().split("\n")[0]
                    parts = [p.strip() for p in line.split(",")]
                    if len(parts) >= 4:
                        gpu_percent = float(parts[0])
                        gpu_memory_total = int(parts[1]) * 1024 * 1024  # MiB to bytes
                        gpu_memory_used = int(parts[2]) * 1024 * 1024
                        gpu_name = parts[3]
            except (FileNotFoundError, Exception):
                pass

            return ResourceSnapshot(
                cpu_percent=cpu_percent,
                cpu_count=cpu_count,
                memory_total=memory_total,
                memory_used=memory_used,
                memory_percent=memory_percent,
                disk_read_bytes=disk_read,
                disk_write_bytes=disk_write,
                net_sent_bytes=net_sent,
                net_recv_bytes=net_recv,
                gpu_percent=gpu_percent,
                gpu_memory_total=gpu_memory_total,
                gpu_memory_used=gpu_memory_used,
                gpu_name=gpu_name,
            )

        except Exception as e:
            self.statistics.errors += 1
            logger.error("Failed to take resource snapshot: %s", e)
            return None

    def get_statistics(self) -> RuntimeStatistics:
        return self.statistics


# ── Convenience function ───────────────────────────────────────

def enumerate_runtime(
    *,
    options: Optional[RuntimeEnumerateOptions] = None,
    on_progress: Optional[RuntimeProgressCallback] = None,
) -> Generator[AnyRuntimeAsset, None, None]:
    """Convenience function to enumerate all runtime assets."""
    enumerator = RuntimeEnumerator()
    yield from enumerator.enumerate(options=options, on_progress=on_progress)
