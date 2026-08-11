"""
Registry Enumerator — streaming discovery of registry keys and values.

Uses winreg for efficient recursive traversal of the Windows registry.
Yields results incrementally as a generator — never loads everything into memory.

This module ONLY discovers. It never classifies, repairs, or deletes.
"""

from __future__ import annotations

import os
import sys
import time
import dataclasses
from dataclasses import dataclass, field
from typing import Generator, Optional, Callable, Union, Any

if sys.platform == "win32":
    import winreg
else:
    winreg = None  # type: ignore[assignment]

from .models import (
    RegistryHive,
    RegistryKeyAsset,
    RegistryValueAsset,
    RegistryValueType,
    RegistryStatistics,
    PlatformNotSupported,
)
from .filters import RegistryFilterChain, RegistryFilter

_is_windows = sys.platform == "win32"

# ── Progress events ────────────────────────────────────────────

@dataclass
class RegistryProgressEvent:
    """Progress event emitted during registry enumeration."""

    current_hive: Optional[str] = None
    current_key: Optional[str] = None
    keys_enumerated: int = 0
    values_enumerated: int = 0
    elapsed_seconds: float = 0.0
    keys_per_second: float = 0.0
    cancelled: bool = False


RegistryProgressCallback = Callable[[RegistryProgressEvent], None]


# ── Cancellation ───────────────────────────────────────────────

class RegistryCancelEvent:
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
class RegistryEnumerateOptions:
    """Options controlling registry enumeration behavior."""

    include_values: bool = True
    include_keys: bool = True
    max_depth: int = -1  # -1 = unlimited
    progress_interval: int = 500
    filter: Optional[RegistryFilterChain] = None
    cancel_event: Optional[RegistryCancelEvent] = None
    skip_permission_errors: bool = True


# ── Registry targets ───────────────────────────────────────────

@dataclass
class RegistryTarget:
    """A predefined registry location to enumerate."""

    hive: RegistryHive
    subpath: str
    label: str
    recurse: bool = True
    max_depth: int = -1
    enabled: bool = True


def get_default_registry_targets() -> list[RegistryTarget]:
    """Return the default set of registry targets for enumeration."""
    targets: list[RegistryTarget] = []

    # Startup / Run keys
    for hive, subpath, label in [
        (RegistryHive.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run", "HKLM Run"),
        (RegistryHive.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce", "HKLM RunOnce"),
        (RegistryHive.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnceEx", "HKLM RunOnceEx"),
        (RegistryHive.HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run", "HKCU Run"),
        (RegistryHive.HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce", "HKCU RunOnce"),
        (RegistryHive.HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnceEx", "HKCU RunOnceEx"),
        (RegistryHive.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run", "HKLM WOW64 Run"),
        (RegistryHive.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\RunOnce", "HKLM WOW64 RunOnce"),
    ]:
        targets.append(RegistryTarget(hive=hive, subpath=subpath, label=label, recurse=False))

    # StartupApproved
    for hive in [RegistryHive.HKEY_CURRENT_USER, RegistryHive.HKEY_LOCAL_MACHINE]:
        targets.append(RegistryTarget(
            hive=hive,
            subpath=r"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved",
            label=f"{hive.abbrev} StartupApproved",
            recurse=True,
            max_depth=2,
        ))

    # Uninstall
    for hive, wow64 in [
        (RegistryHive.HKEY_LOCAL_MACHINE, False),
        (RegistryHive.HKEY_LOCAL_MACHINE, True),
        (RegistryHive.HKEY_CURRENT_USER, False),
    ]:
        path = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"
        if wow64:
            path = r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
        targets.append(RegistryTarget(
            hive=hive,
            subpath=path,
            label=f"{hive.abbrev} Uninstall{' (WOW64)' if wow64 else ''}",
            recurse=True,
            max_depth=2,
        ))

    # Services and Drivers
    targets.append(RegistryTarget(
        hive=RegistryHive.HKEY_LOCAL_MACHINE,
        subpath=r"SYSTEM\CurrentControlSet\Services",
        label="HKLM Services",
        recurse=True,
        max_depth=2,
    ))

    # COM CLSID
    for wow64 in [False, True]:
        path = r"SOFTWARE\Classes\CLSID"
        if wow64:
            path = r"SOFTWARE\WOW6432Node\Classes\CLSID"
        targets.append(RegistryTarget(
            hive=RegistryHive.HKEY_LOCAL_MACHINE,
            subpath=path,
            label=f"HKLM CLSID{' (WOW64)' if wow64 else ''}",
            recurse=True,
            max_depth=2,
        ))

    # File Associations
    targets.append(RegistryTarget(
        hive=RegistryHive.HKEY_CLASSES_ROOT,
        subpath="",
        label="HKCR File Associations",
        recurse=True,
        max_depth=1,
    ))

    # Shell Extensions
    targets.append(RegistryTarget(
        hive=RegistryHive.HKEY_LOCAL_MACHINE,
        subpath=r"SOFTWARE\Microsoft\Windows\CurrentVersion\Shell Extensions\Approved",
        label="HKLM Shell Extensions",
        recurse=False,
    ))

    # App Paths
    targets.append(RegistryTarget(
        hive=RegistryHive.HKEY_LOCAL_MACHINE,
        subpath=r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths",
        label="HKLM App Paths",
        recurse=True,
        max_depth=1,
    ))

    # Shared DLLs
    targets.append(RegistryTarget(
        hive=RegistryHive.HKEY_LOCAL_MACHINE,
        subpath=r"SOFTWARE\Microsoft\Windows\CurrentVersion\SharedDLLs",
        label="HKLM Shared DLLs",
        recurse=False,
    ))

    # MUI Cache
    targets.append(RegistryTarget(
        hive=RegistryHive.HKEY_CURRENT_USER,
        subpath=r"SOFTWARE\Classes\Local Settings\MuiCache",
        label="HKCU MUI Cache",
        recurse=True,
        max_depth=2,
    ))

    # RecentDocs
    targets.append(RegistryTarget(
        hive=RegistryHive.HKEY_CURRENT_USER,
        subpath=r"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\RecentDocs",
        label="HKCU RecentDocs",
        recurse=True,
        max_depth=2,
    ))

    # Explorer settings
    targets.append(RegistryTarget(
        hive=RegistryHive.HKEY_CURRENT_USER,
        subpath=r"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer",
        label="HKCU Explorer",
        recurse=True,
        max_depth=2,
    ))

    # Windows policies
    for hive in [RegistryHive.HKEY_LOCAL_MACHINE, RegistryHive.HKEY_CURRENT_USER]:
        targets.append(RegistryTarget(
            hive=hive,
            subpath=r"SOFTWARE\Policies",
            label=f"{hive.abbrev} Policies",
            recurse=True,
            max_depth=3,
        ))

    # Browser registrations
    targets.append(RegistryTarget(
        hive=RegistryHive.HKEY_LOCAL_MACHINE,
        subpath=r"SOFTWARE\Clients\StartMenuInternet",
        label="HKLM Browser Registrations",
        recurse=True,
        max_depth=2,
    ))

    # Installed software
    for hive, wow64 in [
        (RegistryHive.HKEY_LOCAL_MACHINE, False),
        (RegistryHive.HKEY_LOCAL_MACHINE, True),
        (RegistryHive.HKEY_CURRENT_USER, False),
    ]:
        path = r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Management"
        if wow64:
            path = r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Management"
        targets.append(RegistryTarget(
            hive=hive,
            subpath=path,
            label=f"{hive.abbrev} App Management{' (WOW64)' if wow64 else ''}",
            recurse=True,
            max_depth=2,
        ))

    return targets


# ── Enumerator ─────────────────────────────────────────────────

class RegistryEnumerator:
    """
    Streaming registry enumerator.

    Usage:
        enumerator = RegistryEnumerator()
        for asset in enumerator.enumerate_key(RegistryHive.HKEY_LOCAL_MACHINE, r"SOFTWARE\\Microsoft"):
            process(asset)

    Or with predefined targets:
        for asset in enumerator.enumerate_targets(get_default_registry_targets()):
            process(asset)
    """

    def __init__(self) -> None:
        self.statistics = RegistryStatistics()

    def enumerate_key(
        self,
        hive: RegistryHive,
        subpath: str = "",
        *,
        options: Optional[RegistryEnumerateOptions] = None,
        on_progress: Optional[RegistryProgressCallback] = None,
    ) -> Generator[Union[RegistryKeyAsset, RegistryValueAsset], None, None]:
        """Enumerate a single registry key, yielding assets incrementally.

        Recursively descends into subkeys unless max_depth is reached.
        """
        if not _is_windows:
            raise PlatformNotSupported(
                "Registry Enumerator is only available on Windows. "
                f"Current platform: {sys.platform}"
            )

        opts = options or RegistryEnumerateOptions()
        filter_chain = opts.filter
        cancel = opts.cancel_event

        start_time = time.monotonic()
        entries_since_progress = 0

        def emit_progress(current_key: str) -> None:
            nonlocal entries_since_progress
            if on_progress is None:
                return
            entries_since_progress += 1
            if entries_since_progress >= opts.progress_interval:
                entries_since_progress = 0
                elapsed = time.monotonic() - start_time
                kps = self.statistics.total_keys / elapsed if elapsed > 0 else 0
                on_progress(RegistryProgressEvent(
                    current_hive=hive.abbrev,
                    current_key=current_key,
                    keys_enumerated=self.statistics.total_keys,
                    values_enumerated=self.statistics.total_values,
                    elapsed_seconds=elapsed,
                    keys_per_second=kps,
                ))

        yield from self._scan_key(
            hive=hive,
            subpath=subpath,
            depth=0,
            opts=opts,
            filter_chain=filter_chain,
            cancel=cancel,
            on_progress=emit_progress,
        )

        # Final progress event
        if on_progress is not None:
            elapsed = time.monotonic() - start_time
            self.statistics.finalize(elapsed)
            on_progress(RegistryProgressEvent(
                current_hive=hive.abbrev,
                current_key=subpath,
                keys_enumerated=self.statistics.total_keys,
                values_enumerated=self.statistics.total_values,
                elapsed_seconds=elapsed,
                keys_per_second=self.statistics.keys_per_second,
                cancelled=cancel.is_cancelled if cancel else False,
            ))

    def enumerate_targets(
        self,
        targets: list[RegistryTarget],
        *,
        options: Optional[RegistryEnumerateOptions] = None,
        on_progress: Optional[RegistryProgressCallback] = None,
    ) -> Generator[Union[RegistryKeyAsset, RegistryValueAsset], None, None]:
        """Enumerate multiple registry targets sequentially."""
        opts = options or RegistryEnumerateOptions()

        for target in targets:
            if not target.enabled:
                continue
            if opts.cancel_event and opts.cancel_event.is_cancelled:
                break

            target_opts = RegistryEnumerateOptions(
                include_values=opts.include_values,
                include_keys=opts.include_keys,
                max_depth=target.max_depth if target.max_depth >= 0 else opts.max_depth,
                progress_interval=opts.progress_interval,
                filter=opts.filter,
                cancel_event=opts.cancel_event,
                skip_permission_errors=opts.skip_permission_errors,
            )

            if target.recurse:
                yield from self.enumerate_key(
                    target.hive, target.subpath,
                    options=target_opts, on_progress=on_progress,
                )
            else:
                # Non-recursive: enumerate just the key and its values, no subkeys
                target_opts = RegistryEnumerateOptions(
                    include_values=target_opts.include_values,
                    include_keys=target_opts.include_keys,
                    max_depth=0,
                    progress_interval=target_opts.progress_interval,
                    filter=target_opts.filter,
                    cancel_event=target_opts.cancel_event,
                    skip_permission_errors=target_opts.skip_permission_errors,
                )
                yield from self.enumerate_key(
                    target.hive, target.subpath,
                    options=target_opts, on_progress=on_progress,
                )

    def get_statistics(self) -> RegistryStatistics:
        """Return the current enumeration statistics."""
        return self.statistics

    # ── Internal traversal ─────────────────────────────────────

    def _scan_key(
        self,
        hive: RegistryHive,
        subpath: str,
        depth: int,
        opts: RegistryEnumerateOptions,
        filter_chain: Optional[RegistryFilterChain],
        cancel: Optional[RegistryCancelEvent],
        on_progress: Callable[[str], None],
    ) -> Generator[Union[RegistryKeyAsset, RegistryValueAsset], None, None]:
        """Recursively scan a registry key, yielding assets."""

        if cancel and cancel.is_cancelled:
            return

        if opts.max_depth >= 0 and depth > opts.max_depth:
            return

        # Open the key
        try:
            key_handle = winreg.OpenKey(
                hive.winreg_constant,
                subpath,
                0,
                winreg.KEY_READ,
            )
        except PermissionError:
            if opts.skip_permission_errors:
                self.statistics.record_permission_error()
                return
            raise
        except FileNotFoundError:
            self.statistics.record_skip()
            return
        except OSError:
            self.statistics.record_skip()
            return

        # Determine key name and parent
        key_name = subpath.split("\\")[-1] if subpath else hive.abbrev
        parent_path = "\\".join(subpath.split("\\")[:-1]) if subpath else ""
        is_wow64 = "WOW6432Node" in subpath

        # Get key info
        subkey_count = 0
        value_count = 0
        last_write_time = None
        permission_denied = False

        try:
            subkey_count, value_count, last_write_filetime = winreg.QueryInfoKey(key_handle)
            # last_write_filetime is a 64-bit FILETIME (100ns intervals since 1601-01-01)
            # Convert to Unix timestamp
            if last_write_filetime and last_write_filetime > 0:
                last_write_time = (last_write_filetime - 116444736000000000) / 10000000.0
        except PermissionError:
            permission_denied = True
        except OSError:
            permission_denied = True

        # Build key asset
        key_asset = RegistryKeyAsset(
            hive=hive,
            key_path=subpath,
            key_name=key_name,
            subkey_count=subkey_count,
            value_count=value_count,
            last_write_time=last_write_time,
            depth=depth,
            parent_path=parent_path,
            is_wow6432node=is_wow64,
            permission_denied=permission_denied,
        )

        # Yield key if it passes filters
        if opts.include_keys:
            if filter_chain is None or filter_chain.matches_key(key_asset):
                self.statistics.record_key()
                on_progress(subpath)
                yield key_asset

        # Check if we should descend
        if filter_chain is not None and not filter_chain.should_descend(key_asset):
            try:
                winreg.CloseKey(key_handle)
            except Exception:
                pass
            return

        # Enumerate values
        if opts.include_values and not permission_denied:
            yield from self._enum_values(
                key_handle, hive, subpath, depth,
                filter_chain, on_progress,
            )

        # Enumerate subkeys recursively
        if not permission_denied:
            for i in range(subkey_count):
                if cancel and cancel.is_cancelled:
                    break
                try:
                    subkey_name = winreg.EnumKey(key_handle, i)
                    child_path = f"{subpath}\\{subkey_name}" if subpath else subkey_name
                    yield from self._scan_key(
                        hive=hive,
                        subpath=child_path,
                        depth=depth + 1,
                        opts=opts,
                        filter_chain=filter_chain,
                        cancel=cancel,
                        on_progress=on_progress,
                    )
                except PermissionError:
                    if opts.skip_permission_errors:
                        self.statistics.record_permission_error()
                        continue
                    raise
                except OSError:
                    self.statistics.record_skip()
                    continue

        try:
            winreg.CloseKey(key_handle)
        except Exception:
            pass

    def _enum_values(
        self,
        key_handle: Any,
        hive: RegistryHive,
        key_path: str,
        depth: int,
        filter_chain: Optional[RegistryFilterChain],
        on_progress: Callable[[str], None],
    ) -> Generator[RegistryValueAsset, None, None]:
        """Enumerate all values under a key handle."""

        try:
            _, value_count, _ = winreg.QueryInfoKey(key_handle)
        except OSError:
            return

        for i in range(value_count):
            try:
                value_name, value_data, value_type_id = winreg.EnumValue(key_handle, i)
            except PermissionError:
                self.statistics.record_permission_error()
                continue
            except OSError:
                self.statistics.record_skip()
                continue

            # Handle default value (empty string name)
            is_default = (value_name == "")
            display_name = value_name if value_name else ""

            # Convert value_data to string representation
            data_str = self._stringify_value(value_data, value_type_id)
            data_size = len(value_data) if isinstance(value_data, (bytes, bytearray)) else len(str(value_data))

            value_asset = RegistryValueAsset(
                hive=hive,
                key_path=key_path,
                value_name=display_name,
                value_type=RegistryValueType.from_winreg(value_type_id),
                value_data=data_str,
                is_default=is_default,
                data_size=data_size,
            )

            if filter_chain is None or filter_chain.matches_value(value_asset):
                self.statistics.record_value()
                on_progress(key_path)
                yield value_asset

    @staticmethod
    def _stringify_value(data: Any, type_id: int) -> str:
        """Convert registry value data to a string representation."""
        if data is None:
            return ""
        if isinstance(data, str):
            return data
        if isinstance(data, (bytes, bytearray)):
            # Try to decode as UTF-16 for string types, otherwise hex
            try:
                return data.decode("utf-16-le", errors="replace").rstrip("\x00")
            except Exception:
                return data.hex()
        if isinstance(data, int):
            return str(data)
        if isinstance(data, (list, tuple)):
            return " | ".join(str(item) for item in data)
        return str(data)


# ── Convenience function ───────────────────────────────────────

def enumerate_registry(
    hive: RegistryHive,
    subpath: str = "",
    *,
    options: Optional[RegistryEnumerateOptions] = None,
    on_progress: Optional[RegistryProgressCallback] = None,
) -> Generator[Union[RegistryKeyAsset, RegistryValueAsset], None, None]:
    """Convenience function to enumerate a registry key."""
    enumerator = RegistryEnumerator()
    yield from enumerator.enumerate_key(hive, subpath, options=options, on_progress=on_progress)
