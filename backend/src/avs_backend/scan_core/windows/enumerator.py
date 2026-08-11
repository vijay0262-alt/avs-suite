"""
Windows Enumerator — streaming discovery of Windows assets.

Uses native Win32 APIs (via ctypes) whenever possible.
Falls back to subprocess calls only when no native API exists.
Yields results incrementally as a generator.

This module ONLY discovers. It never modifies, classifies, or cleans.
"""

from __future__ import annotations

import os
import sys
import time
import ctypes
import subprocess
from datetime import datetime
from dataclasses import dataclass
from typing import Generator, Optional, Callable, Any

if sys.platform == "win32":
    import ctypes.wintypes
    import winreg
else:
    winreg = None  # type: ignore[assignment]

from .models import (
    WindowsAssetType,
    ServiceAsset,
    DriverAsset,
    ScheduledTaskAsset,
    InstalledProgramAsset,
    SecurityAsset,
    RestorePointAsset,
    SystemAsset,
    NetworkAdapterAsset,
    WindowsStatistics,
)
from ..registry.models import PlatformNotSupported
from .filters import WindowsFilterChain, WindowsFilter, AnyWindowsAsset

_is_windows = sys.platform == "win32"

# ── Win32 API bindings ─────────────────────────────────────────

if _is_windows:
    _kernel32 = ctypes.windll.kernel32


# ── Progress events ────────────────────────────────────────────

@dataclass
class WindowsProgressEvent:
    """Progress event emitted during Windows enumeration."""
    current_category: Optional[str] = None
    current_asset: Optional[str] = None
    assets_enumerated: int = 0
    elapsed_seconds: float = 0.0
    assets_per_second: float = 0.0
    cancelled: bool = False


WindowsProgressCallback = Callable[[WindowsProgressEvent], None]


# ── Cancellation ───────────────────────────────────────────────

class WindowsCancelEvent:
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
class WindowsEnumerateOptions:
    """Options controlling Windows enumeration behavior."""
    include_services: bool = True
    include_drivers: bool = True
    include_tasks: bool = True
    include_programs: bool = True
    include_security: bool = True
    include_system: bool = True
    include_network: bool = True
    include_restore_points: bool = True
    include_event_logs: bool = False
    include_power_plans: bool = False
    include_environment: bool = False
    progress_interval: int = 50
    filter: Optional[WindowsFilterChain] = None
    cancel_event: Optional[WindowsCancelEvent] = None


# ── Enumerator ─────────────────────────────────────────────────

class WindowsEnumerator:
    """
    Streaming Windows asset enumerator.

    Usage:
        enumerator = WindowsEnumerator()
        for asset in enumerator.enumerate():
            process(asset)
    """

    def __init__(self) -> None:
        self.statistics = WindowsStatistics()

    def enumerate(
        self,
        *,
        options: Optional[WindowsEnumerateOptions] = None,
        on_progress: Optional[WindowsProgressCallback] = None,
    ) -> Generator[AnyWindowsAsset, None, None]:
        """Enumerate all Windows assets, yielding incrementally."""
        if not _is_windows:
            raise PlatformNotSupported(
                "Windows Enumerator is only available on Windows. "
                f"Current platform: {sys.platform}"
            )

        opts = options or WindowsEnumerateOptions()
        filter_chain = opts.filter
        cancel = opts.cancel_event

        start_time = time.monotonic()
        entries_since_progress = 0

        def emit_progress(category: str, asset_name: str = "") -> None:
            nonlocal entries_since_progress
            if on_progress is None:
                return
            entries_since_progress += 1
            if entries_since_progress >= opts.progress_interval:
                entries_since_progress = 0
                elapsed = time.monotonic() - start_time
                total = self.statistics.total_assets
                on_progress(WindowsProgressEvent(
                    current_category=category,
                    current_asset=asset_name,
                    assets_enumerated=total,
                    elapsed_seconds=elapsed,
                    assets_per_second=total / elapsed if elapsed > 0 else 0,
                ))

        def check_cancel() -> bool:
            return cancel is not None and cancel.is_cancelled

        # System info first (fast, single asset)
        if opts.include_system and not check_cancel():
            system = self._enumerate_system()
            if system is not None:
                if filter_chain is None or filter_chain.matches(system):
                    emit_progress("System", system.computer_name)
                    yield system

        # Services
        if opts.include_services and not check_cancel():
            for service in self._enumerate_services():
                if check_cancel():
                    break
                if filter_chain is not None and not filter_chain.matches(service):
                    continue
                self.statistics.services += 1
                emit_progress("Services", service.service_name)
                yield service

        # Drivers
        if opts.include_drivers and not check_cancel():
            for driver in self._enumerate_drivers():
                if check_cancel():
                    break
                if filter_chain is not None and not filter_chain.matches(driver):
                    continue
                self.statistics.drivers += 1
                emit_progress("Drivers", driver.driver_name)
                yield driver

        # Scheduled Tasks
        if opts.include_tasks and not check_cancel():
            for task in self._enumerate_scheduled_tasks():
                if check_cancel():
                    break
                if filter_chain is not None and not filter_chain.matches(task):
                    continue
                self.statistics.tasks += 1
                emit_progress("Scheduled Tasks", task.task_name)
                yield task

        # Installed Programs
        if opts.include_programs and not check_cancel():
            for prog in self._enumerate_installed_programs():
                if check_cancel():
                    break
                if filter_chain is not None and not filter_chain.matches(prog):
                    continue
                if prog.is_update:
                    self.statistics.updates += 1
                else:
                    self.statistics.programs += 1
                emit_progress("Installed Programs", prog.display_name)
                yield prog

        # Security
        if opts.include_security and not check_cancel():
            for sec in self._enumerate_security():
                if check_cancel():
                    break
                if filter_chain is not None and not filter_chain.matches(sec):
                    continue
                self.statistics.security_assets += 1
                emit_progress("Security", sec.name)
                yield sec

        # Network Adapters
        if opts.include_network and not check_cancel():
            for adapter in self._enumerate_network_adapters():
                if check_cancel():
                    break
                if filter_chain is not None and not filter_chain.matches(adapter):
                    continue
                self.statistics.network_adapters += 1
                emit_progress("Network", adapter.adapter_name)
                yield adapter

        # Restore Points
        if opts.include_restore_points and not check_cancel():
            for rp in self._enumerate_restore_points():
                if check_cancel():
                    break
                if filter_chain is not None and not filter_chain.matches(rp):
                    continue
                self.statistics.restore_points += 1
                emit_progress("Restore Points", rp.description)
                yield rp

        # Event Logs
        if opts.include_event_logs and not check_cancel():
            for log in self._enumerate_event_logs():
                if check_cancel():
                    break
                if filter_chain is not None and not filter_chain.matches(log):
                    continue
                self.statistics.event_logs += 1
                emit_progress("Event Logs", log.name)
                yield log

        # Power Plans
        if opts.include_power_plans and not check_cancel():
            for plan in self._enumerate_power_plans():
                if check_cancel():
                    break
                if filter_chain is not None and not filter_chain.matches(plan):
                    continue
                self.statistics.power_plans += 1
                emit_progress("Power Plans", plan.name)
                yield plan

        # Environment Variables
        if opts.include_environment and not check_cancel():
            for env in self._enumerate_environment():
                if check_cancel():
                    break
                if filter_chain is not None and not filter_chain.matches(env):
                    continue
                self.statistics.environment_vars += 1
                emit_progress("Environment", env.name)
                yield env

        # Final progress
        if on_progress is not None:
            elapsed = time.monotonic() - start_time
            self.statistics.finalize(elapsed)
            on_progress(WindowsProgressEvent(
                assets_enumerated=self.statistics.total_assets,
                elapsed_seconds=elapsed,
                assets_per_second=self.statistics.assets_per_second,
                cancelled=check_cancel(),
            ))

    def get_statistics(self) -> WindowsStatistics:
        return self.statistics

    # ── Services ───────────────────────────────────────────────

    def _enumerate_services(self) -> Generator[ServiceAsset, None, None]:
        """Enumerate Windows services via sc queryex command."""
        try:
            result = subprocess.run(
                ["sc", "queryex", "type=", "service", "state=", "all"],
                capture_output=True, text=True, timeout=30,
            )
            if result.returncode != 0:
                return

            blocks = result.stdout.strip().split("\n\n")
            for block in blocks:
                lines = block.strip().split("\n")
                if not lines:
                    continue

                service_name = ""
                display_name = ""
                status = "Unknown"
                pid = None

                for line in lines:
                    line = line.strip()
                    if line.startswith("SERVICE_NAME:"):
                        service_name = line.split(":", 1)[1].strip()
                    elif line.startswith("DISPLAY_NAME:"):
                        display_name = line.split(":", 1)[1].strip()
                    elif line.startswith("STATE"):
                        parts = line.split(":", 1)
                        if len(parts) > 1:
                            state_parts = parts[1].strip().split()
                            if len(state_parts) >= 2:
                                status = state_parts[1].replace("_", " ").title()
                            elif state_parts:
                                status = state_parts[0].replace("_", " ").title()
                    elif line.startswith("PID"):
                        parts = line.split(":", 1)
                        if len(parts) > 1:
                            try:
                                pid_val = int(parts[1].strip())
                                pid = pid_val if pid_val > 0 else None
                            except ValueError:
                                pass

                if not service_name:
                    continue

                startup_type = "Unknown"
                binary_path = ""
                service_account = ""
                dependencies: tuple[str, ...] = ()
                description = ""

                try:
                    qc_result = subprocess.run(
                        ["sc", "qc", service_name],
                        capture_output=True, text=True, timeout=5,
                    )
                    if qc_result.returncode == 0:
                        for qline in qc_result.stdout.split("\n"):
                            qline = qline.strip()
                            if qline.startswith("START_TYPE"):
                                parts = qline.split(":", 1)
                                if len(parts) > 1:
                                    val = parts[1].strip()
                                    if "AUTO_START" in val:
                                        startup_type = "Auto"
                                    elif "DEMAND_START" in val:
                                        startup_type = "Manual"
                                    elif "DISABLED" in val:
                                        startup_type = "Disabled"
                                    elif "BOOT_START" in val:
                                        startup_type = "Boot"
                                    elif "SYSTEM_START" in val:
                                        startup_type = "System"
                            elif qline.startswith("BINARY_PATH_NAME"):
                                parts = qline.split(":", 1)
                                if len(parts) > 1:
                                    binary_path = parts[1].strip()
                            elif qline.startswith("SERVICE_START_NAME"):
                                parts = qline.split(":", 1)
                                if len(parts) > 1:
                                    service_account = parts[1].strip()
                            elif qline.startswith("DEPENDENCIES"):
                                parts = qline.split(":", 1)
                                if len(parts) > 1:
                                    deps_str = parts[1].strip()
                                    if deps_str:
                                        dependencies = tuple(d.strip() for d in deps_str.split("/") if d.strip())
                except Exception:
                    pass

                try:
                    qdesc_result = subprocess.run(
                        ["sc", "qdescription", service_name],
                        capture_output=True, text=True, timeout=5,
                    )
                    if qdesc_result.returncode == 0:
                        for dline in qdesc_result.stdout.split("\n"):
                            dline = dline.strip()
                            if dline.startswith("DESCRIPTION"):
                                parts = dline.split(":", 1)
                                if len(parts) > 1:
                                    description = parts[1].strip()
                                break
                except Exception:
                    pass

                yield ServiceAsset(
                    service_name=service_name,
                    display_name=display_name,
                    status=status,
                    startup_type=startup_type,
                    binary_path=binary_path,
                    service_account=service_account,
                    dependencies=dependencies,
                    description=description,
                    pid=pid,
                )

        except Exception:
            self.statistics.errors += 1

    # ── Drivers ────────────────────────────────────────────────

    def _enumerate_drivers(self) -> Generator[DriverAsset, None, None]:
        """Enumerate device drivers via sc queryex command."""
        try:
            result = subprocess.run(
                ["sc", "queryex", "type=", "driver", "state=", "all"],
                capture_output=True, text=True, timeout=30,
            )
            if result.returncode != 0:
                return

            blocks = result.stdout.strip().split("\n\n")
            for block in blocks:
                lines = block.strip().split("\n")
                if not lines:
                    continue

                driver_name = ""
                state = "Unknown"
                driver_type = "Unknown"

                for line in lines:
                    line = line.strip()
                    if line.startswith("SERVICE_NAME:"):
                        driver_name = line.split(":", 1)[1].strip()
                    elif line.startswith("STATE"):
                        parts = line.split(":", 1)
                        if len(parts) > 1:
                            state_parts = parts[1].strip().split()
                            if len(state_parts) >= 2:
                                state = state_parts[1].replace("_", " ").title()
                            elif state_parts:
                                state = state_parts[0].replace("_", " ").title()
                    elif line.startswith("TYPE"):
                        parts = line.split(":", 1)
                        if len(parts) > 1:
                            val = parts[1].strip()
                            if "KERNEL_DRIVER" in val:
                                driver_type = "Kernel Driver"
                            elif "FILE_SYSTEM_DRIVER" in val:
                                driver_type = "File System Driver"
                            elif "ADAPTER" in val:
                                driver_type = "Adapter"
                            else:
                                driver_type = val

                if not driver_name:
                    continue

                start_mode = "Unknown"
                path = ""
                provider = ""
                version = ""

                try:
                    qc_result = subprocess.run(
                        ["sc", "qc", driver_name],
                        capture_output=True, text=True, timeout=5,
                    )
                    if qc_result.returncode == 0:
                        for qline in qc_result.stdout.split("\n"):
                            qline = qline.strip()
                            if qline.startswith("START_TYPE"):
                                parts = qline.split(":", 1)
                                if len(parts) > 1:
                                    val = parts[1].strip()
                                    if "AUTO_START" in val:
                                        start_mode = "Auto"
                                    elif "DEMAND_START" in val:
                                        start_mode = "Manual"
                                    elif "DISABLED" in val:
                                        start_mode = "Disabled"
                                    elif "BOOT_START" in val:
                                        start_mode = "Boot"
                                    elif "SYSTEM_START" in val:
                                        start_mode = "System"
                            elif qline.startswith("BINARY_PATH_NAME"):
                                parts = qline.split(":", 1)
                                if len(parts) > 1:
                                    path = parts[1].strip()
                except Exception:
                    pass

                if path:
                    try:
                        if os.path.isfile(path):
                            version = self._get_file_version(path)
                    except Exception:
                        pass

                yield DriverAsset(
                    driver_name=driver_name,
                    provider=provider,
                    version=version,
                    path=path,
                    driver_type=driver_type,
                    state=state,
                    start_mode=start_mode,
                )

        except Exception:
            self.statistics.errors += 1

    # ── Scheduled Tasks ────────────────────────────────────────

    def _enumerate_scheduled_tasks(self) -> Generator[ScheduledTaskAsset, None, None]:
        """Enumerate scheduled tasks via schtasks command (fallback for COM)."""
        try:
            # Use schtasks /query /fo CSV /v for detailed info
            result = subprocess.run(
                ["schtasks", "/query", "/fo", "CSV", "/v", "/nh"],
                capture_output=True, text=True, timeout=30,
            )
            if result.returncode != 0:
                return

            lines = result.stdout.strip().split("\n")
            for line in lines:
                try:
                    # Parse CSV — fields are quoted
                    import csv
                    reader = csv.reader([line])
                    fields = next(reader, [])

                    if len(fields) < 10:
                        continue

                    # schtasks /v CSV format:
                    # 0: HostName, 1: TaskName, 2: Next Run Time, 3: Status,
                    # 4: Logon Mode, 5: Last Run Time, 6: Last Result,
                    # 7: Author, 8: Task To Run, 9: Run As User, ...
                    # Actually the exact columns vary; let's use a simpler approach
                    task_name = fields[1] if len(fields) > 1 else ""
                    if not task_name:
                        continue

                    # Extract folder from task name
                    if "\\" in task_name:
                        parts = task_name.rsplit("\\", 1)
                        task_folder = parts[0] if parts[0] else "\\"
                        task_name = parts[1]
                    else:
                        task_folder = "\\"

                    status_str = fields[3] if len(fields) > 3 else ""
                    enabled = "enabled" in status_str.lower() or status_str.strip() == ""

                    # Parse last run time
                    last_run_str = fields[5] if len(fields) > 5 else ""
                    last_run = self._parse_task_time(last_run_str)

                    # Parse next run time
                    next_run_str = fields[2] if len(fields) > 2 else ""
                    next_run = self._parse_task_time(next_run_str)

                    principal = fields[9] if len(fields) > 9 else ""

                    # Count triggers and actions — not available in CSV easily
                    trigger_count = 0
                    action_count = 0

                    yield ScheduledTaskAsset(
                        task_name=task_name,
                        task_folder=task_folder,
                        enabled=enabled,
                        last_run_time=last_run,
                        next_run_time=next_run,
                        trigger_count=trigger_count,
                        action_count=action_count,
                        principal=principal,
                    )
                except Exception:
                    self.statistics.skipped += 1
                    continue

        except Exception:
            self.statistics.errors += 1

    @staticmethod
    def _parse_task_time(time_str: str) -> Optional[float]:
        """Parse a schtasks time string to Unix timestamp."""
        if not time_str or time_str.strip() in ("N/A", ""):
            return None
        try:
            # Common formats: "MM/DD/YYYY HH:MM:SS" or locale-specific
            for fmt in ("%m/%d/%Y %I:%M:%S %p", "%m/%d/%Y %H:%M:%S", "%-m/%-d/%Y %-I:%M:%S %p"):
                try:
                    dt = datetime.strptime(time_str.strip(), fmt)
                    return dt.timestamp()
                except ValueError:
                    continue
        except Exception:
            pass
        return None

    # ── Installed Programs ─────────────────────────────────────

    def _enumerate_installed_programs(self) -> Generator[InstalledProgramAsset, None, None]:
        """Enumerate installed programs from registry Uninstall keys."""
        uninstall_keys = [
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall", "HKLM", "x64"),
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall", "HKLM", "x86"),
            (winreg.HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall", "HKCU", "x64"),
        ]

        for hive, base_path, source, arch in uninstall_keys:
            try:
                key = winreg.OpenKey(hive, base_path, 0, winreg.KEY_READ)
            except OSError:
                continue

            try:
                subkey_count, _, _ = winreg.QueryInfoKey(key)
                for i in range(subkey_count):
                    try:
                        subkey_name = winreg.EnumKey(key, i)
                        subkey = winreg.OpenKey(key, subkey_name, 0, winreg.KEY_READ)

                        display_name = self._reg_get(subkey, "DisplayName", "")
                        if not display_name:
                            winreg.CloseKey(subkey)
                            continue

                        publisher = self._reg_get(subkey, "Publisher", "")
                        version = self._reg_get(subkey, "DisplayVersion", "")
                        install_date = self._reg_get(subkey, "InstallDate", "")
                        install_location = self._reg_get(subkey, "InstallLocation", "")
                        estimated_size = self._reg_get_int(subkey, "EstimatedSize", 0)

                        # Check if this is an update
                        is_update = (
                            subkey_name.startswith("KB") or
                            "Update" in display_name or
                            self._reg_get(subkey, "ParentKeyName", "") != ""
                        )

                        # Check if this is a Windows feature
                        is_feature = self._reg_get(subkey, "SystemComponent", "0") == "1"

                        registry_source = f"{source}\\{base_path}\\{subkey_name}"

                        winreg.CloseKey(subkey)

                        yield InstalledProgramAsset(
                            display_name=display_name,
                            publisher=publisher,
                            version=version,
                            install_date=install_date,
                            install_location=install_location,
                            estimated_size=estimated_size,
                            registry_source=registry_source,
                            architecture=arch,
                            is_update=is_update,
                            is_feature=is_feature,
                        )
                    except OSError:
                        self.statistics.skipped += 1
                        continue

                winreg.CloseKey(key)
            except OSError:
                continue

    @staticmethod
    def _reg_get(key: Any, name: str, default: str = "") -> str:
        try:
            value, _ = winreg.QueryValueEx(key, name)
            return str(value) if value is not None else default
        except OSError:
            return default

    @staticmethod
    def _reg_get_int(key: Any, name: str, default: int = 0) -> int:
        try:
            value, _ = winreg.QueryValueEx(key, name)
            return int(value) if value is not None else default
        except OSError:
            return default

    # ── Security ───────────────────────────────────────────────

    def _enumerate_security(self) -> Generator[SecurityAsset, None, None]:
        """Enumerate Windows security status (Defender, Firewall, SmartScreen, BitLocker)."""

        # Windows Defender status
        try:
            result = subprocess.run(
                ["powershell", "-NoProfile", "-Command",
                 "Get-MpComputerStatus | Select-Object AMRunningMode,RealTimeProtectionEnabled,AntivirusEnabled,AntispywareEnabled,TamperProtectionEnabled | ConvertTo-Csv -NoTypeInformation"],
                capture_output=True, text=True, timeout=10,
            )
            if result.returncode == 0 and result.stdout.strip():
                lines = result.stdout.strip().split("\n")
                if len(lines) >= 2:
                    import csv
                    reader = csv.reader([lines[1]])
                    values = next(reader, [])
                    if len(values) >= 5:
                        running = values[0] != ""
                        rtp = values[1].lower() == "true"
                        av_enabled = values[2].lower() == "true"
                        antispy = values[3].lower() == "true"
                        tamper = values[4].lower() == "true"

                        yield SecurityAsset(
                            security_type="Defender",
                            name="Windows Defender",
                            status="Enabled" if av_enabled else "Disabled",
                            details=f"Real-time: {'On' if rtp else 'Off'}, Tamper: {'On' if tamper else 'Off'}",
                            is_enabled=av_enabled,
                        )

                        yield SecurityAsset(
                            security_type="RealTimeProtection",
                            name="Real-time Protection",
                            status="Enabled" if rtp else "Disabled",
                            details="",
                            is_enabled=rtp,
                        )

                        yield SecurityAsset(
                            security_type="TamperProtection",
                            name="Tamper Protection",
                            status="Enabled" if tamper else "Disabled",
                            details="",
                            is_enabled=tamper,
                        )
        except Exception:
            self.statistics.errors += 1

        # Firewall profiles
        try:
            result = subprocess.run(
                ["netsh", "advfirewall", "show", "allprofiles", "state"],
                capture_output=True, text=True, timeout=10,
            )
            if result.returncode == 0:
                current_profile = ""
                for line in result.stdout.split("\n"):
                    line = line.strip()
                    if line.startswith("Profile Settings:"):
                        current_profile = line.split(":", 1)[1].strip()
                    elif line.startswith("State") and current_profile:
                        state = line.split(":", 1)[1].strip()
                        is_on = state.lower() == "on"
                        yield SecurityAsset(
                            security_type="Firewall",
                            name=f"Firewall - {current_profile}",
                            status="Enabled" if is_on else "Disabled",
                            details=state,
                            is_enabled=is_on,
                        )
                        current_profile = ""
        except Exception:
            self.statistics.errors += 1

        # SmartScreen
        try:
            key = winreg.OpenKey(
                winreg.HKEY_LOCAL_MACHINE,
                r"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer",
                0, winreg.KEY_READ,
            )
            smart_screen_val = self._reg_get(key, "SmartScreenEnabled", "")
            winreg.CloseKey(key)

            is_enabled = smart_screen_val.lower() in ("on", "warn", "block")
            yield SecurityAsset(
                security_type="SmartScreen",
                name="Windows SmartScreen",
                status="Enabled" if is_enabled else "Disabled",
                details=smart_screen_val,
                is_enabled=is_enabled,
            )
        except Exception:
            yield SecurityAsset(
                security_type="SmartScreen",
                name="Windows SmartScreen",
                status="Unknown",
                details="",
                is_enabled=False,
            )

        # BitLocker
        try:
            result = subprocess.run(
                ["manage-bde", "-status"],
                capture_output=True, text=True, timeout=10,
            )
            if result.returncode == 0:
                # Parse BitLocker status
                lines = result.stdout.split("\n")
                current_drive = ""
                for line in lines:
                    if "Conversion Status" in line:
                        protection = "Protected" if "Fully Encrypted" in line else "Unprotected"
                        yield SecurityAsset(
                            security_type="BitLocker",
                            name=f"BitLocker - {current_drive or 'System'}",
                            status=protection,
                            details=line.strip(),
                            is_enabled="Protected" == protection,
                        )
        except Exception:
            pass

    # ── System ─────────────────────────────────────────────────

    def _enumerate_system(self) -> Optional[SystemAsset]:
        """Collect Windows system information."""
        try:
            computer_name = os.environ.get("COMPUTERNAME", "Unknown")

            # OS version via kernel32
            class _OSVERSIONINFOEX(ctypes.Structure):
                _fields_ = [
                    ("dwOSVersionInfoSize", ctypes.wintypes.DWORD),
                    ("dwMajorVersion", ctypes.wintypes.DWORD),
                    ("dwMinorVersion", ctypes.wintypes.DWORD),
                    ("dwBuildNumber", ctypes.wintypes.DWORD),
                    ("dwPlatformId", ctypes.wintypes.DWORD),
                    ("szCSDVersion", ctypes.c_wchar * 128),
                    ("wServicePackMajor", ctypes.wintypes.USHORT),
                    ("wServicePackMinor", ctypes.wintypes.USHORT),
                    ("wSuiteMask", ctypes.wintypes.USHORT),
                    ("wProductType", ctypes.wintypes.BYTE),
                    ("wReserved", ctypes.wintypes.BYTE),
                ]

            osvi = _OSVERSIONINFOEX()
            osvi.dwOSVersionInfoSize = ctypes.sizeof(_OSVERSIONINFOEX)
            _kernel32.GetVersionExW(ctypes.pointer(osvi))

            os_version = f"{osvi.dwMajorVersion}.{osvi.dwMinorVersion}"
            build_number = str(osvi.dwBuildNumber)

            # Edition from registry
            edition = "Unknown"
            try:
                key = winreg.OpenKey(
                    winreg.HKEY_LOCAL_MACHINE,
                    r"SOFTWARE\Microsoft\Windows NT\CurrentVersion",
                    0, winreg.KEY_READ,
                )
                edition = self._reg_get(key, "ProductName", "Unknown")
                if not edition:
                    edition = self._reg_get(key, "EditionID", "Unknown")
                winreg.CloseKey(key)
            except OSError:
                pass

            # Architecture
            arch = os.environ.get("PROCESSOR_ARCHITECTURE", "Unknown")

            # Boot time and uptime
            boot_time = time.time() - _kernel32.GetTickCount64() / 1000.0
            uptime = _kernel32.GetTickCount64() / 1000.0

            # Language
            import locale
            try:
                language = locale.getlocale()[0] or "Unknown"
            except Exception:
                language = "Unknown"

            # Timezone
            import time as _time
            tz_name = _time.tzname[0] if _time.tzname else "Unknown"

            # Domain/workgroup
            domain = os.environ.get("USERDOMAIN", "WORKGROUP")

            return SystemAsset(
                computer_name=computer_name,
                os_version=os_version,
                build_number=build_number,
                edition=edition,
                architecture=arch,
                boot_time=boot_time,
                uptime_seconds=uptime,
                language=language,
                timezone=tz_name,
                domain=domain,
            )
        except Exception:
            self.statistics.errors += 1
            return None

    # ── Network Adapters ───────────────────────────────────────

    def _enumerate_network_adapters(self) -> Generator[NetworkAdapterAsset, None, None]:
        """Enumerate network adapters via ipconfig command."""
        try:
            result = subprocess.run(
                ["ipconfig", "/all"],
                capture_output=True, text=True, timeout=15,
                encoding="utf-8", errors="replace",
            )
            if not result.stdout.strip():
                return

            # Parse ipconfig /all output
            current_adapter = None
            current_data: dict[str, str] = {}

            for line in result.stdout.split("\n"):
                if not line.strip():
                    # Empty line — flush current adapter if it has data
                    if current_adapter and current_data:
                        yield self._build_network_adapter(current_adapter, current_data)
                        current_adapter = None
                        current_data = {}
                    # If no data yet, keep current_adapter (ipconfig has blank
                    # lines between adapter header and its data)
                    continue

                # Check if this is an adapter header (no leading space)
                if not line.startswith(" ") and ":" in line:
                    if current_adapter and current_data:
                        yield self._build_network_adapter(current_adapter, current_data)
                    current_adapter = line.split(":")[0].strip()
                    current_data = {}
                elif ":" in line and current_adapter:
                    key, _, val = line.strip().partition(":")
                    key = key.strip()
                    val = val.strip()
                    if key and val:
                        current_data[key] = val

            # Flush last adapter
            if current_adapter and current_data:
                yield self._build_network_adapter(current_adapter, current_data)

        except Exception:
            self.statistics.errors += 1

    @staticmethod
    def _build_network_adapter(name: str, data: dict[str, str]) -> NetworkAdapterAsset:
        """Build a NetworkAdapterAsset from ipconfig parsed data."""
        # ipconfig keys have dot-padding, so match by substring
        def find_value(key: str) -> str:
            for k, v in data.items():
                if key.lower() in k.lower():
                    return v
            return ""

        description = find_value("Description")
        mac = find_value("Physical Address").replace("-", ":")
        ipv4_str = find_value("IPv4 Address")
        ipv6_str = find_value("IPv6 Address")
        gateway = find_value("Default Gateway")
        dns_str = find_value("DNS Servers")
        dhcp_str = find_value("DHCP Enabled")
        media_str = find_value("Media State")

        ipv4 = tuple(ipv4_str.split(",")) if ipv4_str else ()
        ipv6 = tuple(ipv6_str.split(",")) if ipv6_str else ()
        dns = tuple(d.strip() for d in dns_str.split(",")) if dns_str else ()
        dhcp = "Yes" in dhcp_str
        state = "Down" if media_str else "Up"

        return NetworkAdapterAsset(
            adapter_name=name,
            description=description,
            mac_address=mac,
            ipv4_addresses=ipv4,
            ipv6_addresses=ipv6,
            default_gateway=gateway,
            dns_servers=dns,
            dhcp_enabled=dhcp,
            state=state,
        )

    # ── Restore Points ─────────────────────────────────────────

    def _enumerate_restore_points(self) -> Generator[RestorePointAsset, None, None]:
        """Enumerate system restore points via WMI (no native API available)."""
        try:
            result = subprocess.run(
                ["powershell", "-NoProfile", "-Command",
                 "Get-ComputerRestorePoint | Select-Object Description,CreationTime,SequenceNumber | ConvertTo-Csv -NoTypeInformation"],
                capture_output=True, text=True, timeout=10,
            )
            if result.returncode != 0 or not result.stdout.strip():
                return

            lines = result.stdout.strip().split("\n")
            if len(lines) < 2:
                return

            import csv
            for line in lines[1:]:
                try:
                    reader = csv.reader([line])
                    fields = next(reader, [])
                    if len(fields) < 3:
                        continue

                    description = fields[0]
                    creation_str = fields[1]
                    seq = int(fields[2]) if fields[2].isdigit() else 0

                    # Parse WMI datetime (DTMF format: 20230811120000.000000+300)
                    creation_time = time.time()
                    try:
                        if "." in creation_str:
                            dt_part = creation_str.split(".")[0]
                            creation_time = datetime.strptime(dt_part, "%Y%m%d%H%M%S").timestamp()
                    except Exception:
                        pass

                    yield RestorePointAsset(
                        description=description,
                        creation_time=creation_time,
                        sequence_number=seq,
                    )
                except Exception:
                    self.statistics.skipped += 1
                    continue

        except Exception:
            self.statistics.errors += 1

    # ── Event Logs ─────────────────────────────────────────────

    def _enumerate_event_logs(self) -> Generator[Any, None, None]:
        """Enumerate event log channels."""
        try:
            result = subprocess.run(
                ["wevtutil", "el"],
                capture_output=True, text=True, timeout=10,
            )
            if result.returncode != 0:
                return

            for line in result.stdout.strip().split("\n"):
                log_name = line.strip()
                if not log_name:
                    continue
                from dataclasses import dataclass as _dc
                @_dc(frozen=True, slots=True)
                class _EventLogAsset:
                    name: str
                    asset_type: WindowsAssetType = WindowsAssetType.EVENT_LOG
                    @property
                    def asset_name(self) -> str: return self.name
                    @property
                    def asset_path(self) -> str: return ""
                yield _EventLogAsset(name=log_name)
        except Exception:
            self.statistics.errors += 1

    # ── Power Plans ────────────────────────────────────────────

    def _enumerate_power_plans(self) -> Generator[Any, None, None]:
        """Enumerate power plans via powercfg."""
        try:
            result = subprocess.run(
                ["powercfg", "/list"],
                capture_output=True, text=True, timeout=10,
            )
            if result.returncode != 0:
                return

            for line in result.stdout.split("\n"):
                if "Power Scheme GUID:" in line:
                    parts = line.split(":")
                    if len(parts) >= 3:
                        guid = parts[1].strip()
                        name = parts[2].strip().strip("()")
                        from dataclasses import dataclass as _dc
                        @_dc(frozen=True, slots=True)
                        class _PowerPlanAsset:
                            name: str
                            guid: str
                            asset_type: WindowsAssetType = WindowsAssetType.POWER_PLAN
                            @property
                            def asset_name(self) -> str: return self.name
                            @property
                            def asset_path(self) -> str: return self.guid
                        yield _PowerPlanAsset(name=name, guid=guid)
        except Exception:
            self.statistics.errors += 1

    # ── Environment Variables ──────────────────────────────────

    def _enumerate_environment(self) -> Generator[Any, None, None]:
        """Enumerate system and user environment variables."""
        try:
            for key, value in os.environ.items():
                from dataclasses import dataclass as _dc
                @_dc(frozen=True, slots=True)
                class _EnvVarAsset:
                    name: str
                    value: str
                    asset_type: WindowsAssetType = WindowsAssetType.ENVIRONMENT
                    @property
                    def asset_name(self) -> str: return self.name
                    @property
                    def asset_path(self) -> str: return ""
                yield _EnvVarAsset(name=key, value=value)
        except Exception:
            self.statistics.errors += 1

    # ── Utilities ──────────────────────────────────────────────

    @staticmethod
    def _get_file_version(path: str) -> str:
        """Get file version using GetFileVersionInfoW."""
        try:
            size = ctypes.windll.version.GetFileVersionInfoSizeW(path, None)
            if size == 0:
                return ""
            buffer = ctypes.create_string_buffer(size)
            if not ctypes.windll.version.GetFileVersionInfoW(path, 0, size, buffer):
                return ""
            res = ctypes.c_uint32(0)
            ver_ptr = ctypes.c_void_p(0)
            if ctypes.windll.version.VerQueryValueW(
                buffer, r"\\".encode("utf-16-le"),
                ctypes.pointer(ver_ptr), ctypes.pointer(res),
            ):
                ver_data = ctypes.string_at(ver_ptr, res.value)
                if len(ver_data) >= 16:
                    import struct
                    _, _, file_ver_ms, file_ver_ls = struct.unpack_from("<IIII", ver_data)
                    major = (file_ver_ms >> 16) & 0xFFFF
                    minor = file_ver_ms & 0xFFFF
                    build = (file_ver_ls >> 16) & 0xFFFF
                    return f"{major}.{minor}.{build}"
        except Exception:
            pass
        return ""


# ── Convenience function ───────────────────────────────────────

def enumerate_windows(
    *,
    options: Optional[WindowsEnumerateOptions] = None,
    on_progress: Optional[WindowsProgressCallback] = None,
) -> Generator[AnyWindowsAsset, None, None]:
    """Convenience function to enumerate all Windows assets."""
    enumerator = WindowsEnumerator()
    yield from enumerator.enumerate(options=options, on_progress=on_progress)
