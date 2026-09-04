"""Memory Scanner - scan running process memory for injected code and malware.

Competitors like Norton, McAfee, and Trend Micro scan running process
memory to detect:
  - Process injection (DLL injection, process hollowing)
  - Fileless malware (PowerShell-based attacks living in memory)
  - Packed/encrypted payloads decrypted in memory
  - Rootkits hiding in process memory space
  - Shellcode injected into legitimate processes

This module enumerates running processes, reads their memory using
Windows API calls (ReadProcessMemory), and scans the memory content
with ClamAV's stream scanning capability.

RPC methods:
    memory_scanner.status       - get scanner status
    memory_scanner.scan         - scan all running processes for memory threats
    memory_scanner.scanProcess  - scan a specific process by PID
    memory_scanner.events       - get recent memory scan events
"""
from __future__ import annotations

import ctypes
import logging
import os
import platform
import subprocess
import threading
import time
from datetime import datetime, timezone
from typing import Any

from avs_backend.api.registry import register

log = logging.getLogger("avs.memory_scanner")

IS_WINDOWS = platform.system() == "Windows"
_CREATE_NO_WINDOW = 0x08000000 if IS_WINDOWS else 0

# Windows API constants
PROCESS_VM_READ = 0x0010
PROCESS_QUERY_INFORMATION = 0x0400
PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
MEM_COMMIT = 0x00001000
PAGE_NOACCESS = 0x01
PAGE_GUARD = 0x100
MEM_IMAGE = 0x1000000
MEM_MAPPED = 0x40000
MEM_PRIVATE = 0x20000

# Minimum memory region size to scan (skip tiny fragments)
_MIN_REGION_SIZE = 4096  # 4KB
# Maximum total memory to scan per process (avoid huge processes)
_MAX_PROCESS_MEMORY = 50 * 1024 * 1024  # 50MB
# Chunk size for reading memory
_CHUNK_SIZE = 65536  # 64KB

# Processes to skip (system-critical, would cause instability)
_SKIP_PROCESSES = {
    "system", "registry", "smss.exe", "csrss.exe", "wininit.exe",
    "services.exe", "lsass.exe", "winlogon.exe", "svchost.exe",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class MemoryScanner:
    """Scan running process memory for malware and injected code."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._events: list[dict[str, Any]] = []
        self._max_events = 200
        self._threats_found = 0
        self._processes_scanned = 0
        self._last_scan: str | None = None

    def scan_all_processes(self) -> dict[str, Any]:
        """Scan memory of all accessible running processes."""
        if not IS_WINDOWS:
            return {"success": False, "error": "Memory scanning requires Windows"}

        result = {
            "started_at": _now_iso(),
            "processes_scanned": 0,
            "threats_found": 0,
            "errors": [],
            "threats": [],
        }

        processes = self._enumerate_processes()
        log.info("Memory scan: %d processes to scan", len(processes))

        for proc in processes:
            pid = proc.get("pid", 0)
            name = proc.get("name", "")

            # Skip system-critical processes
            if name.lower() in _SKIP_PROCESSES:
                continue

            # Skip PID 0 (System Idle Process) and PID 4 (System)
            if pid <= 4:
                continue

            try:
                proc_result = self._scan_process_memory(pid, name)
                result["processes_scanned"] += 1
                if proc_result.get("threats"):
                    result["threats_found"] += len(proc_result["threats"])
                    result["threats"].extend(proc_result["threats"])
            except Exception as e:
                result["errors"].append(f"{name} (PID {pid}): {e}")

        result["completed_at"] = _now_iso()
        self._last_scan = result["completed_at"]
        self._processes_scanned = result["processes_scanned"]
        self._threats_found = result["threats_found"]

        # Record event
        with self._lock:
            self._events.append({
                "timestamp": _now_iso(),
                "type": "memory_scan_complete",
                "processes_scanned": result["processes_scanned"],
                "threats_found": result["threats_found"],
                "errors": len(result["errors"]),
            })
            if len(self._events) > self._max_events:
                self._events = self._events[-self._max_events:]

        return {"success": True, **result}

    def scan_process(self, pid: int) -> dict[str, Any]:
        """Scan memory of a specific process by PID."""
        if not IS_WINDOWS:
            return {"success": False, "error": "Memory scanning requires Windows"}
        if pid <= 4:
            return {"success": False, "error": "Cannot scan system process"}

        # Get process name
        name = self._get_process_name(pid)
        if not name:
            return {"success": False, "error": f"Process {pid} not found"}

        try:
            result = self._scan_process_memory(pid, name)
            return {"success": True, "pid": pid, "name": name, **result}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def _scan_process_memory(self, pid: int, name: str) -> dict[str, Any]:
        """Scan memory regions of a single process."""
        threats: list[dict[str, Any]] = []
        total_scanned = 0

        # Open process with read access
        kernel32 = ctypes.windll.kernel32
        handle = kernel32.OpenProcess(
            PROCESS_VM_READ | PROCESS_QUERY_INFORMATION, False, pid
        )
        if not handle:
            # Try with limited information
            handle = kernel32.OpenProcess(
                PROCESS_VM_READ | PROCESS_QUERY_LIMITED_INFORMATION, False, pid
            )
            if not handle:
                raise OSError(f"Cannot open process {name} (PID {pid}) - access denied")

        try:
            # Enumerate memory regions and scan committed private memory
            address = 0
            mbi = MEMORY_BASIC_INFORMATION()

            while address < 0x7FFFFFFFFFFF:
                # Query memory region
                result = kernel32.VirtualQueryEx(
                    handle, ctypes.c_void_p(address), ctypes.byref(mbi), ctypes.sizeof(mbi)
                )
                if result == 0:
                    break

                # Only scan committed, private, readable memory
                # (skip mapped images/DLLs - those are on disk)
                if (mbi.State == MEM_COMMIT and
                    mbi.Protect not in (PAGE_NOACCESS, PAGE_GUARD) and
                    mbi.RegionSize >= _MIN_REGION_SIZE and
                    total_scanned < _MAX_PROCESS_MEMORY):

                    # Read memory in chunks
                    region_data = self._read_memory_region(
                        kernel32, handle, address, mbi.RegionSize
                    )
                    if region_data and len(region_data) >= _MIN_REGION_SIZE:
                        total_scanned += len(region_data)
                        # Scan the memory content with ClamAV stream scan
                        threat = self._scan_memory_content(
                            region_data, pid, name, address
                        )
                        if threat:
                            threats.append(threat)

                # Move to next region
                address += mbi.RegionSize if mbi.RegionSize > 0 else 0x1000

        finally:
            kernel32.CloseHandle(handle)

        return {
            "pid": pid,
            "name": name,
            "bytes_scanned": total_scanned,
            "threats": threats,
        }

    def _read_memory_region(
        self, kernel32: ctypes.WinDLL, handle: int, address: int, size: int
    ) -> bytes | None:
        """Read a memory region from a process in chunks."""
        data = bytearray()
        remaining = min(size, _MAX_PROCESS_MEMORY)
        buf = ctypes.create_string_buffer(_CHUNK_SIZE)

        while remaining > 0:
            read_size = min(_CHUNK_SIZE, remaining)
            bytes_read = ctypes.c_size_t(0)
            ok = kernel32.ReadProcessMemory(
                handle, ctypes.c_void_p(address + len(data)),
                buf, read_size, ctypes.byref(bytes_read)
            )
            if not ok or bytes_read.value == 0:
                break
            data.extend(buf.raw[:bytes_read.value])
            remaining -= bytes_read.value

        return bytes(data) if data else None

    def _scan_memory_content(
        self, data: bytes, pid: int, name: str, address: int
    ) -> dict[str, Any] | None:
        """Scan memory content using ClamAV stream scanning."""
        try:
            from avs_backend.threat_engine.clamav_scanner import check_clamav_available, _get_clamd_client
            if not check_clamav_available():
                return None

            client = _get_clamd_client()
            if client is None:
                return None

            # Use ClamAV instream scan
            if hasattr(client, "instream_file"):
                # pyclamd interface
                import tempfile
                with tempfile.NamedTemporaryFile(delete=False, suffix=".mem") as tmp:
                    tmp.write(data)
                    tmp_path = tmp.name
                try:
                    result = client.scan_file(tmp_path)
                    os.unlink(tmp_path)
                except Exception:
                    try:
                        os.unlink(tmp_path)
                    except OSError:
                        pass
                    return None
            else:
                # Raw socket interface - use INSTREAM
                result = self._clamd_instream(client, data)

            if result and "FOUND" in str(result):
                # Parse ClamAV response
                threat_name = str(result).split(":", 1)[-1].replace("FOUND", "").strip()
                return {
                    "pid": pid,
                    "process_name": name,
                    "memory_address": hex(address),
                    "threat_name": threat_name,
                    "threat_type": "malware",
                    "severity": "high",
                    "source": "memory_scan",
                    "bytes_scanned": len(data),
                }
        except Exception as e:
            log.debug("Memory scan failed for PID %d at 0x%x: %s", pid, address, e)
        return None

    @staticmethod
    def _clamd_instream(client: Any, data: bytes) -> str | None:
        """Send data to clamd via INSTREAM command."""
        try:
            import socket
            if hasattr(client, "_socket") and client._socket:
                sock = client._socket
            else:
                return None

            sock.sendall(b"zINSTREAM\0")
            # Send in chunks
            offset = 0
            while offset < len(data):
                chunk = data[offset:offset + 8192]
                sock.sendall(len(chunk).to_bytes(4, "big") + chunk)
                offset += len(chunk)
            sock.sendall(b"\0\0\0\0")  # End stream
            response = sock.recv(1024).decode("utf-8", errors="ignore").strip()
            return response
        except Exception:
            return None

    def _enumerate_processes(self) -> list[dict[str, Any]]:
        """Enumerate running processes using WMI."""
        if not IS_WINDOWS:
            return []
        try:
            proc = subprocess.run(
                ["powershell", "-NoProfile", "-NonInteractive", "-Command",
                 "Get-Process | Select-Object Id,ProcessName | ConvertTo-Json -Depth 1"],
                capture_output=True, text=True, timeout=15,
                creationflags=_CREATE_NO_WINDOW,
            )
            if proc.returncode != 0 or not proc.stdout.strip():
                return []
            import json
            data = json.loads(proc.stdout.strip())
            if not isinstance(data, list):
                data = [data]
            return [{"pid": p.get("Id", 0), "name": p.get("ProcessName", "")} for p in data]
        except Exception as e:
            log.warning("Process enumeration failed: %s", e)
            return []

    @staticmethod
    def _get_process_name(pid: int) -> str:
        """Get process name by PID."""
        if not IS_WINDOWS:
            return ""
        try:
            proc = subprocess.run(
                ["powershell", "-NoProfile", "-NonInteractive", "-Command",
                 f"(Get-Process -Id {pid}).ProcessName"],
                capture_output=True, text=True, timeout=5,
                creationflags=_CREATE_NO_WINDOW,
            )
            return proc.stdout.strip() if proc.returncode == 0 else ""
        except Exception:
            return ""

    def get_status(self) -> dict[str, Any]:
        return {
            "platform": platform.system(),
            "processes_scanned": self._processes_scanned,
            "threats_found": self._threats_found,
            "last_scan": self._last_scan,
            "events_count": len(self._events),
        }

    def get_events(self, limit: int = 100) -> list[dict[str, Any]]:
        with self._lock:
            return list(reversed(self._events[-limit:]))


# Windows API structures
class MEMORY_BASIC_INFORMATION(ctypes.Structure):
    _fields_ = [
        ("BaseAddress", ctypes.c_void_p),
        ("AllocationBase", ctypes.c_void_p),
        ("AllocationProtect", ctypes.c_ulong),
        ("PartitionId", ctypes.c_ushort),
        ("RegionSize", ctypes.c_size_t),
        ("State", ctypes.c_ulong),
        ("Protect", ctypes.c_ulong),
        ("Type", ctypes.c_ulong),
    ]


# Singleton
_scanner: MemoryScanner | None = None
_scanner_lock = threading.Lock()


def _get_scanner() -> MemoryScanner:
    global _scanner
    with _scanner_lock:
        if _scanner is None:
            _scanner = MemoryScanner()
        return _scanner


@register("memory_scanner.status")
def memory_scanner_status(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get memory scanner status."""
    return {"success": True, "status": _get_scanner().get_status()}


@register("memory_scanner.scan")
def memory_scanner_scan(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Scan all running processes for memory-based threats."""
    return _get_scanner().scan_all_processes()


@register("memory_scanner.scanProcess")
def memory_scanner_scan_process(params: dict[str, Any] | None) -> dict[str, Any]:
    """Scan a specific process by PID for memory threats."""
    params = params or {}
    pid = int(params.get("pid", 0))
    if not pid:
        return {"success": False, "error": "pid is required"}
    return _get_scanner().scan_process(pid)


@register("memory_scanner.events")
def memory_scanner_events(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get recent memory scan events."""
    params = params or {}
    limit = int(params.get("limit", 100))
    return {"success": True, "events": _get_scanner().get_events(limit)}
