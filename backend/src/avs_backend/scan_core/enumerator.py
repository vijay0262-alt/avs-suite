"""
Filesystem Enumerator — streaming discovery of files, folders, and drives.

Uses os.scandir() for fast directory traversal.
Yields results incrementally as a generator — never loads everything into memory.

This module ONLY discovers. It never decides junk, security, privacy, or optimization.
"""

from __future__ import annotations

import os
import sys
import time
import ctypes
import dataclasses
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Generator, Optional, Callable, Union

from .models import (
    FileEntry,
    DirectoryEntry,
    DriveEntry,
    EntryType,
    _make_file_entry,
    _make_directory_entry,
)
from .filters import FilterChain, EnumerateFilter

# ── Windows attribute constants ───────────────────────────────

FILE_ATTRIBUTE_HIDDEN = 0x2
FILE_ATTRIBUTE_SYSTEM = 0x4
FILE_ATTRIBUTE_READONLY = 0x1
FILE_ATTRIBUTE_ARCHIVE = 0x20
FILE_ATTRIBUTE_TEMPORARY = 0x100
FILE_ATTRIBUTE_DIRECTORY = 0x10
FILE_ATTRIBUTE_REPARSE_POINT = 0x400

_is_windows = sys.platform == "win32"

if _is_windows:
    _GetFileAttributesW = ctypes.windll.kernel32.GetFileAttributesW
    _GetFileAttributesW.restype = ctypes.c_uint32
    _GetFileAttributesW.argtypes = [ctypes.c_wchar_p]
else:
    _GetFileAttributesW = None  # type: ignore[assignment]


def _get_win_attributes(path: str) -> int:
    """Get Windows file attributes via GetFileAttributesW. Returns 0 on error."""
    if not _is_windows or _GetFileAttributesW is None:
        return 0
    try:
        attrs = _GetFileAttributesW(path)
        if attrs == 0xFFFFFFFF:  # INVALID_FILE_ATTRIBUTES
            return 0
        return attrs
    except Exception:
        return 0


def _is_locked(path: str) -> bool:
    """Check if a file is locked by attempting to open it for writing.
    Returns True if the file appears to be locked (in use by another process).
    """
    if not os.path.isfile(path):
        return False
    try:
        # Try opening for writing without actually modifying
        flags = os.O_WRONLY | getattr(os, "O_NONBLOCK", 0)
        fd = os.open(path, flags)
        os.close(fd)
        return False
    except (OSError, PermissionError):
        return True
    except Exception:
        return False


# ── Progress events ────────────────────────────────────────────

@dataclass
class ProgressEvent:
    """Progress event emitted during enumeration."""

    current_drive: Optional[str] = None
    current_folder: Optional[str] = None
    files_enumerated: int = 0
    folders_enumerated: int = 0
    drives_enumerated: int = 0
    elapsed_seconds: float = 0.0
    bytes_discovered: int = 0
    cancelled: bool = False


ProgressCallback = Callable[[ProgressEvent], None]


# ── Scan locations ─────────────────────────────────────────────

@dataclass
class ScanLocation:
    """A root location to enumerate."""

    path: str
    label: str
    enabled: bool = True


def get_default_scan_locations() -> list[ScanLocation]:
    """Return the default set of scan locations for the current platform."""
    locations: list[ScanLocation] = []
    home = str(Path.home())

    # User profile
    locations.append(ScanLocation(path=home, label="User Profile"))

    # Common Windows locations
    if _is_windows:
        system_drive = os.environ.get("SystemDrive", "C:")
        win_dir = os.environ.get("SystemRoot", os.path.join(system_drive, "\\Windows"))
        prog_files = os.environ.get("ProgramFiles", os.path.join(system_drive, "\\Program Files"))
        prog_files_x86 = os.environ.get("ProgramFiles(x86)", os.path.join(system_drive, "\\Program Files (x86)"))
        program_data = os.environ.get("ProgramData", os.path.join(system_drive, "\\ProgramData"))

        for p, label in [
            (program_data, "ProgramData"),
            (prog_files, "Program Files"),
            (prog_files_x86, "Program Files (x86)"),
            (win_dir, "Windows"),
        ]:
            if os.path.isdir(p):
                locations.append(ScanLocation(path=p, label=label))

        # User-specific
        for sub, label in [
            ("Downloads", "Downloads"),
            ("Desktop", "Desktop"),
            ("Documents", "Documents"),
        ]:
            p = os.path.join(home, sub)
            if os.path.isdir(p):
                locations.append(ScanLocation(path=p, label=label))

        # AppData
        local_appdata = os.environ.get("LOCALAPPDATA", os.path.join(home, "AppData", "Local"))
        appdata = os.path.join(home, "AppData", "Roaming")
        temp_dir = os.environ.get("TEMP", os.path.join(local_appdata, "Temp"))

        for p, label in [
            (appdata, "AppData (Roaming)"),
            (local_appdata, "LocalAppData"),
            (temp_dir, "Temp"),
        ]:
            if os.path.isdir(p):
                locations.append(ScanLocation(path=p, label=label))

        # Recycle Bin
        locations.append(ScanLocation(path="C:\\$Recycle.Bin", label="Recycle Bin"))

        # Browser profile roots (common)
        for browser_path in [
            os.path.join(local_appdata, "Google", "Chrome", "User Data"),
            os.path.join(local_appdata, "Microsoft", "Edge", "User Data"),
            os.path.join(appdata, "Mozilla", "Firefox", "Profiles"),
            os.path.join(local_appdata, "BraveSoftware", "Brave-Browser", "User Data"),
        ]:
            if os.path.isdir(browser_path):
                locations.append(ScanLocation(path=browser_path, label=f"Browser: {os.path.basename(os.path.dirname(browser_path))}"))

    # Users root
    users_dir = os.path.join(os.path.dirname(home), "")
    if users_dir and os.path.isdir(users_dir):
        locations.append(ScanLocation(path=users_dir, label="Users"))

    return locations


# ── Drive enumeration ──────────────────────────────────────────

def _enumerate_drives() -> list[DriveEntry]:
    """Enumerate all mounted drives/volumes on the system."""
    drives: list[DriveEntry] = []

    if _is_windows:
        import string
        for letter in string.ascii_uppercase:
            drive_path = f"{letter}:\\"
            if not os.path.exists(drive_path):
                continue
            try:
                drives.append(_build_drive_entry(drive_path))
            except Exception:
                continue
    else:
        # Unix: enumerate mount points from /proc/mounts or /etc/mtab
        # Exclude pseudo filesystems that are not actual storage volumes
        _PSEUDO_FS_TYPES = frozenset({
            "proc", "sysfs", "devtmpfs", "devpts", "tmpfs",
            "overlay", "squashfs", "cgroup", "cgroup2",
            "pstore", "bpf", "tracefs", "debugfs",
            "fusectl", "securityfs", "configfs", "ramfs",
            "rpc_pipefs", "mqueue", "hugetlbfs", "autofs",
            "binfmt_misc", "fuse.gvfsd-fuse", "fuse.snapfuse",
        })
        _PSEUDO_MOUNT_PATHS = frozenset({
            "/proc", "/sys", "/dev", "/run",
        })

        mounts_file = "/proc/mounts"
        if not os.path.exists(mounts_file):
            mounts_file = "/etc/mtab"
        if os.path.exists(mounts_file):
            seen = set()
            with open(mounts_file, "r") as f:
                for line in f:
                    parts = line.split()
                    if len(parts) < 3:
                        continue
                    mount_point = parts[1]
                    fs_type = parts[2]

                    # Skip pseudo filesystems
                    if fs_type in _PSEUDO_FS_TYPES:
                        continue
                    if mount_point in _PSEUDO_MOUNT_PATHS:
                        continue

                    if mount_point in seen:
                        continue
                    seen.add(mount_point)
                    try:
                        stat = os.statvfs(mount_point)  # type: ignore[attr-defined]
                        total = stat.f_blocks * stat.f_frsize
                        free = stat.f_bavail * stat.f_frsize
                        drives.append(DriveEntry(
                            path=mount_point,
                            name=os.path.basename(mount_point) or mount_point,
                            drive_type="local",
                            total_size=total,
                            free_space=free,
                            is_removable=False,
                            is_network=fs_type.lower() in ("nfs", "cifs", "smbfs"),
                            file_system=fs_type,
                        ))
                    except Exception:
                        continue

    return drives


def _build_drive_entry(drive_path: str) -> DriveEntry:
    """Build a DriveEntry for a Windows drive letter."""
    import ctypes.wintypes

    # Get drive type
    drive_type_map = {
        1: "no_root",
        2: "removable",
        3: "fixed",
        4: "network",
        5: "cdrom",
        6: "ramdisk",
    }
    if _is_windows:
        dt = ctypes.windll.kernel32.GetDriveTypeW(drive_path)
        drive_type = drive_type_map.get(dt, "unknown")
    else:
        drive_type = "unknown"

    # Get disk free space
    total_bytes = ctypes.c_ulonglong(0)
    free_bytes = ctypes.c_ulonglong(0)
    available_bytes = ctypes.c_ulonglong(0)

    if _is_windows:
        ctypes.windll.kernel32.GetDiskFreeSpaceExW(
            ctypes.c_wchar_p(drive_path),
            ctypes.pointer(available_bytes),
            ctypes.pointer(total_bytes),
            ctypes.pointer(free_bytes),
        )
    else:
        stat = os.statvfs(drive_path)  # type: ignore[attr-defined]
        total_bytes.value = stat.f_blocks * stat.f_frsize
        free_bytes.value = stat.f_bavail * stat.f_frsize

    # Get file system name
    fs_name = "unknown"
    if _is_windows:
        fs_buffer = ctypes.create_unicode_buffer(256)
        vol_buffer = ctypes.create_unicode_buffer(256)
        serial = ctypes.c_uint32(0)
        max_len = ctypes.c_uint32(0)
        flags = ctypes.c_uint32(0)
        try:
            ctypes.windll.kernel32.GetVolumeInformationW(
                ctypes.c_wchar_p(drive_path),
                vol_buffer, ctypes.sizeof(vol_buffer),
                ctypes.pointer(serial),
                ctypes.pointer(max_len),
                ctypes.pointer(flags),
                fs_buffer, ctypes.sizeof(fs_buffer),
            )
            fs_name = fs_buffer.value or "unknown"
        except Exception:
            pass

    return DriveEntry(
        path=drive_path,
        name=drive_path.rstrip("\\"),
        drive_type=drive_type,
        total_size=total_bytes.value,
        free_space=free_bytes.value,
        is_removable=drive_type == "removable",
        is_network=drive_type == "network",
        file_system=fs_name,
    )


# ── Options ────────────────────────────────────────────────────

@dataclass
class EnumerateOptions:
    """Options controlling enumeration behavior."""

    include_files: bool = True
    include_directories: bool = True
    include_drives: bool = True
    follow_symlinks: bool = False
    check_locked: bool = False
    progress_interval: int = 500  # emit progress every N entries
    filter: Optional[FilterChain] = None
    cancel_event: Optional["CancelEvent"] = None


class CancelEvent:
    """Simple cancellation event for cooperative cancellation."""

    def __init__(self) -> None:
        self._cancelled = False

    def cancel(self) -> None:
        self._cancelled = True

    @property
    def is_cancelled(self) -> bool:
        return self._cancelled


# ── Enumerator ─────────────────────────────────────────────────

class FilesystemEnumerator:
    """
    Streaming filesystem enumerator.

    Usage:
        enumerator = FilesystemEnumerator()
        for entry in enumerator.enumerate("/path/to/scan"):
            process(entry)

    Or with progress:
        for entry in enumerator.enumerate("/path", on_progress=my_callback):
            process(entry)
    """

    def enumerate(
        self,
        root_path: str,
        *,
        options: Optional[EnumerateOptions] = None,
        on_progress: Optional[ProgressCallback] = None,
    ) -> Generator[Union[FileEntry, DirectoryEntry, DriveEntry], None, None]:
        """Enumerate a single root path, yielding entries incrementally.

        Yields FileEntry, DirectoryEntry, and optionally DriveEntry objects.
        Uses os.scandir() for fast traversal. Never loads all entries into memory.
        """
        opts = options or EnumerateOptions()
        filter_chain = opts.filter
        cancel = opts.cancel_event

        start_time = time.monotonic()
        entries_since_progress = 0
        counters = {"files": 0, "dirs": 0, "bytes": 0}

        def emit_progress(current_folder: str) -> None:
            if on_progress is None:
                return
            nonlocal entries_since_progress
            entries_since_progress += 1
            if entries_since_progress >= opts.progress_interval:
                entries_since_progress = 0
                on_progress(ProgressEvent(
                    current_folder=current_folder,
                    files_enumerated=counters["files"],
                    folders_enumerated=counters["dirs"],
                    elapsed_seconds=time.monotonic() - start_time,
                    bytes_discovered=counters["bytes"],
                ))

        # Yield drive entry if requested and root is a drive root
        if opts.include_drives and self._is_drive_root(root_path):
            try:
                drive = _build_drive_entry(root_path)
                yield drive
            except Exception:
                pass

        # Walk the directory tree
        for entry in self._scan_directory(
            root_path,
            depth=0,
            opts=opts,
            filter_chain=filter_chain,
            cancel=cancel,
            on_progress=emit_progress,
            counters=counters,
        ):
            yield entry

        # Final progress event
        if on_progress is not None:
            on_progress(ProgressEvent(
                current_folder=root_path,
                files_enumerated=counters["files"],
                folders_enumerated=counters["dirs"],
                elapsed_seconds=time.monotonic() - start_time,
                bytes_discovered=counters["bytes"],
                cancelled=cancel.is_cancelled if cancel else False,
            ))

    def enumerate_locations(
        self,
        locations: list[ScanLocation],
        *,
        options: Optional[EnumerateOptions] = None,
        on_progress: Optional[ProgressCallback] = None,
    ) -> Generator[Union[FileEntry, DirectoryEntry, DriveEntry], None, None]:
        """Enumerate multiple scan locations sequentially, yielding entries incrementally."""
        opts = options or EnumerateOptions()

        for loc in locations:
            if not loc.enabled:
                continue
            if opts.cancel_event and opts.cancel_event.is_cancelled:
                break
            if not os.path.isdir(loc.path):
                continue
            yield from self.enumerate(loc.path, options=opts, on_progress=on_progress)

    def enumerate_drives(self) -> list[DriveEntry]:
        """Enumerate all mounted drives. Returns a list (not a generator) since drive count is small."""
        return _enumerate_drives()

    # ── Internal traversal ─────────────────────────────────────

    def _scan_directory(
        self,
        dir_path: str,
        depth: int,
        opts: EnumerateOptions,
        filter_chain: Optional[FilterChain],
        cancel: Optional[CancelEvent],
        on_progress: Callable[[str], None],
        counters: dict,
    ) -> Generator[Union[FileEntry, DirectoryEntry], None, None]:
        """Recursively scan a directory using os.scandir(), yielding entries."""

        if cancel and cancel.is_cancelled:
            return

        parent_dir = os.path.dirname(dir_path)
        dir_name = os.path.basename(dir_path) or dir_path

        # Yield the directory itself
        if opts.include_directories:
            try:
                stat_result = os.stat(dir_path, follow_symlinks=not opts.follow_symlinks)
                attrs = _get_win_attributes(dir_path)
                is_symlink = os.path.islink(dir_path)
                is_reparse_point = bool(attrs & FILE_ATTRIBUTE_REPARSE_POINT)

                # Do not scan into or yield reparse points (junctions, mount points, etc.).
                if is_reparse_point and not is_symlink:
                    return

                dir_entry = _make_directory_entry(
                    path=dir_path,
                    name=dir_name,
                    stat_result=stat_result,
                    is_hidden=bool(attrs & FILE_ATTRIBUTE_HIDDEN),
                    is_system=bool(attrs & FILE_ATTRIBUTE_SYSTEM),
                    is_read_only=bool(attrs & FILE_ATTRIBUTE_READONLY),
                    is_symlink=is_symlink,
                    is_reparse_point=is_reparse_point,
                    parent_dir=parent_dir,
                    depth=depth,
                )

                if filter_chain is None or filter_chain.matches(dir_entry):
                    counters["dirs"] += 1
                    on_progress(dir_path)
                    yield dir_entry

                # Check if we should descend
                if filter_chain is not None and not filter_chain.should_descend(dir_entry):
                    return

            except (PermissionError, OSError):
                return

        # Scan directory contents
        try:
            scandir_it = os.scandir(dir_path)
        except (PermissionError, OSError):
            return

        try:
            for entry in scandir_it:
                if cancel and cancel.is_cancelled:
                    return

                entry_path = entry.path

                try:
                    is_symlink = entry.is_symlink()
                    attrs = _get_win_attributes(entry_path)
                    is_reparse_point = bool(attrs & FILE_ATTRIBUTE_REPARSE_POINT)

                    # Never descend into reparse points (junctions, mount points).
                    # Non-symlink reparse points are not emitted; symlinks are
                    # emitted as such but not followed.
                    if is_reparse_point and not is_symlink:
                        continue

                    # Handle symlinks specially: always emit them as entries,
                    # but only traverse into them if follow_symlinks is True.
                    if is_symlink and not opts.follow_symlinks:
                        # Emit the symlink as a file entry without following it.
                        if opts.include_files:
                            file_entry = self._build_symlink_entry(
                                entry, entry_path, depth + 1, opts,
                            )
                            if file_entry is not None:
                                if filter_chain is None or filter_chain.matches(file_entry):
                                    counters["files"] += 1
                                    counters["bytes"] += file_entry.size
                                    on_progress(entry_path)
                                    yield file_entry
                        # Do not recurse into symlinked directories when follow_symlinks=False
                        continue

                    if entry.is_dir(follow_symlinks=opts.follow_symlinks):
                        # Recurse into subdirectory
                        yield from self._scan_directory(
                            entry_path,
                            depth=depth + 1,
                            opts=opts,
                            filter_chain=filter_chain,
                            cancel=cancel,
                            on_progress=on_progress,
                            counters=counters,
                        )
                    elif entry.is_file(follow_symlinks=opts.follow_symlinks) and opts.include_files:
                        file_entry = self._build_file_entry(
                            entry, entry_path, depth + 1, opts,
                        )
                        if file_entry is None:
                            continue
                        if filter_chain is None or filter_chain.matches(file_entry):
                            counters["files"] += 1
                            counters["bytes"] += file_entry.size
                            on_progress(entry_path)
                            yield file_entry
                except (PermissionError, OSError):
                    continue
                except Exception:
                    continue
        except (PermissionError, OSError):
            return
        finally:
            try:
                scandir_it.close()
            except Exception:
                pass

    def _build_file_entry(
        self,
        scandir_entry: os.DirEntry,
        path: str,
        depth: int,
        opts: EnumerateOptions,
    ) -> Optional[FileEntry]:
        """Build a FileEntry from a DirEntry, handling errors gracefully."""
        try:
            stat_result = scandir_entry.stat(follow_symlinks=opts.follow_symlinks)
        except (PermissionError, OSError):
            return None

        name = scandir_entry.name
        parent_dir = os.path.dirname(path)
        attrs = _get_win_attributes(path)
        is_symlink = scandir_entry.is_symlink()
        is_reparse_point = bool(attrs & FILE_ATTRIBUTE_REPARSE_POINT)

        is_locked = False
        if opts.check_locked:
            is_locked = _is_locked(path)

        return _make_file_entry(
            path=path,
            name=name,
            stat_result=stat_result,
            is_hidden=bool(attrs & FILE_ATTRIBUTE_HIDDEN),
            is_system=bool(attrs & FILE_ATTRIBUTE_SYSTEM),
            is_read_only=bool(attrs & FILE_ATTRIBUTE_READONLY),
            is_archive=bool(attrs & FILE_ATTRIBUTE_ARCHIVE),
            is_temporary=bool(attrs & FILE_ATTRIBUTE_TEMPORARY),
            is_symlink=is_symlink,
            is_reparse_point=is_reparse_point,
            is_locked=is_locked,
            parent_dir=parent_dir,
            depth=depth,
        )

    def _build_symlink_entry(
        self,
        scandir_entry: os.DirEntry,
        path: str,
        depth: int,
        opts: EnumerateOptions,
    ) -> Optional[FileEntry]:
        """Build a FileEntry for a symlink without following it."""
        name = scandir_entry.name
        parent_dir = os.path.dirname(path)
        attrs = _get_win_attributes(path)

        # Stat the symlink itself (not the target)
        try:
            stat_result = scandir_entry.stat(follow_symlinks=False)
        except (PermissionError, OSError):
            # If we can't stat the symlink itself, use a zero-size fallback
            stat_result = os.stat_result((0o120777, 0, 0, 0, 0, 0, 0, 0, 0, 0))

        # Resolve the target path
        symlink_target = None
        try:
            symlink_target = os.readlink(path)
        except (OSError, ValueError):
            pass

        # Detect broken symlink: target doesn't exist
        is_broken = False
        if symlink_target is not None:
            target_path = symlink_target
            if not os.path.isabs(target_path):
                target_path = os.path.join(os.path.dirname(path), target_path)
            if not os.path.exists(target_path):
                is_broken = True

        return _make_file_entry(
            path=path,
            name=name,
            stat_result=stat_result,
            is_hidden=bool(attrs & FILE_ATTRIBUTE_HIDDEN),
            is_system=bool(attrs & FILE_ATTRIBUTE_SYSTEM),
            is_read_only=bool(attrs & FILE_ATTRIBUTE_READONLY),
            is_archive=bool(attrs & FILE_ATTRIBUTE_ARCHIVE),
            is_temporary=bool(attrs & FILE_ATTRIBUTE_TEMPORARY),
            is_symlink=True,
            is_reparse_point=True,
            is_locked=False,
            parent_dir=parent_dir,
            depth=depth,
            symlink_target=symlink_target,
            is_broken_symlink=is_broken,
        )

    @staticmethod
    def _is_drive_root(path: str) -> bool:
        """Check if a path is a drive root (e.g. C:\\ or /)."""
        if _is_windows:
            return len(path) <= 3 and path.endswith(":\\")
        return path == "/"


# ── Convenience function ───────────────────────────────────────

def enumerate_filesystem(
    root_path: str,
    *,
    options: Optional[EnumerateOptions] = None,
    on_progress: Optional[ProgressCallback] = None,
) -> Generator[Union[FileEntry, DirectoryEntry, DriveEntry], None, None]:
    """Convenience function to enumerate a filesystem path.

    Equivalent to:
        FilesystemEnumerator().enumerate(root_path, options=options, on_progress=on_progress)
    """
    enumerator = FilesystemEnumerator()
    yield from enumerator.enumerate(root_path, options=options, on_progress=on_progress)
