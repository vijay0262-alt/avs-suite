"""
Data models for the Scan Core filesystem enumerator.

These dataclasses are deliberately decoupled from Junk Cleaner,
Security, Privacy, and Optimization modules. They describe only
what exists on the filesystem — not what should be done about it.
"""

from __future__ import annotations

import os
import dataclasses
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Optional


class EntryType(Enum):
    """Type of filesystem entry discovered by the enumerator."""
    FILE = "file"
    DIRECTORY = "directory"
    DRIVE = "drive"


@dataclass(frozen=True, slots=True)
class FileEntry:
    """A single file discovered on the filesystem."""

    path: str
    name: str
    size: int
    extension: str
    created_time: float
    modified_time: float
    is_hidden: bool
    is_system: bool
    is_read_only: bool
    is_archive: bool
    is_temporary: bool
    is_symlink: bool
    is_locked: bool
    parent_dir: str
    depth: int
    symlink_target: Optional[str] = None
    is_broken_symlink: bool = False

    @property
    def entry_type(self) -> EntryType:
        return EntryType.FILE

    @property
    def asset_name(self) -> str:
        return Path(self.path).name

    @property
    def asset_directory(self) -> str:
        return str(Path(self.path).parent)

    @property
    def asset_extension(self) -> str:
        return Path(self.path).suffix.lower()

    @property
    def created_datetime(self) -> datetime:
        return datetime.fromtimestamp(self.created_time)

    @property
    def modified_datetime(self) -> datetime:
        return datetime.fromtimestamp(self.modified_time)


@dataclass(frozen=True, slots=True)
class DirectoryEntry:
    """A directory/folder discovered on the filesystem."""

    path: str
    name: str
    created_time: float
    modified_time: float
    is_hidden: bool
    is_system: bool
    is_read_only: bool
    is_symlink: bool
    parent_dir: str
    depth: int
    file_count: int = 0
    subdirectory_count: int = 0

    @property
    def entry_type(self) -> EntryType:
        return EntryType.DIRECTORY

    @property
    def asset_name(self) -> str:
        return Path(self.path).name

    @property
    def asset_directory(self) -> str:
        return str(Path(self.path).parent)

    @property
    def created_datetime(self) -> datetime:
        return datetime.fromtimestamp(self.created_time)

    @property
    def modified_datetime(self) -> datetime:
        return datetime.fromtimestamp(self.modified_time)


@dataclass(frozen=True, slots=True)
class DriveEntry:
    """A mounted drive or volume discovered on the system."""

    path: str
    name: str
    drive_type: str
    total_size: int
    free_space: int
    is_removable: bool
    is_network: bool
    file_system: str

    @property
    def entry_type(self) -> EntryType:
        return EntryType.DRIVE

    @property
    def asset_name(self) -> str:
        return self.name

    @property
    def used_space(self) -> int:
        return self.total_size - self.free_space


def _make_file_entry(
    path: str,
    name: str,
    stat_result: os.stat_result,
    *,
    is_hidden: bool,
    is_system: bool,
    is_read_only: bool,
    is_archive: bool,
    is_temporary: bool,
    is_symlink: bool,
    is_locked: bool,
    parent_dir: str,
    depth: int,
    symlink_target: Optional[str] = None,
    is_broken_symlink: bool = False,
) -> FileEntry:
    """Factory to build a FileEntry from stat data and attributes."""
    ext = Path(name).suffix.lower()
    return FileEntry(
        path=path,
        name=name,
        size=stat_result.st_size,
        extension=ext,
        created_time=stat_result.st_ctime,
        modified_time=stat_result.st_mtime,
        is_hidden=is_hidden,
        is_system=is_system,
        is_read_only=is_read_only,
        is_archive=is_archive,
        is_temporary=is_temporary,
        is_symlink=is_symlink,
        is_locked=is_locked,
        parent_dir=parent_dir,
        depth=depth,
        symlink_target=symlink_target,
        is_broken_symlink=is_broken_symlink,
    )


def _make_directory_entry(
    path: str,
    name: str,
    stat_result: os.stat_result,
    *,
    is_hidden: bool,
    is_system: bool,
    is_read_only: bool,
    is_symlink: bool,
    parent_dir: str,
    depth: int,
    file_count: int = 0,
    subdirectory_count: int = 0,
) -> DirectoryEntry:
    """Factory to build a DirectoryEntry from stat data and attributes."""
    return DirectoryEntry(
        path=path,
        name=name,
        created_time=stat_result.st_ctime,
        modified_time=stat_result.st_mtime,
        is_hidden=is_hidden,
        is_system=is_system,
        is_read_only=is_read_only,
        is_symlink=is_symlink,
        parent_dir=parent_dir,
        depth=depth,
        file_count=file_count,
        subdirectory_count=subdirectory_count,
    )
