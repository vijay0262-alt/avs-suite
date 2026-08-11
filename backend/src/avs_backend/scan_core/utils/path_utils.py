"""
Cross-platform path normalization utilities.

The core problem: ``pathlib.Path`` uses the *current operating system* to
interpret paths.  On Linux, ``Path("C:\\\\test\\\\file.txt").name`` returns
``"C:\\\\test\\\\file.txt"`` because ``PurePosixPath`` treats backslashes as
regular characters, not separators.

Solution: detect the path style (Windows vs POSIX) from the string itself
and use ``PureWindowsPath`` or ``PurePosixPath`` accordingly.  This ensures
identical results regardless of the host OS.
"""

from __future__ import annotations

import re
from pathlib import PureWindowsPath, PurePosixPath

# A drive letter at the start:  C:\  or  C:/  or  C:
_DRIVE_RE = re.compile(r"^[A-Za-z]:")

# Any backslash anywhere in the path
_BACKSLASH_RE = re.compile(r"\\")


def is_windows_path(path: str) -> bool:
    """Return True if *path* uses Windows-style conventions.

    Detection rules (any one is sufficient):
    - Starts with a drive letter followed by ``:``  (e.g. ``C:\\...``)
    - Contains at least one backslash separator
    """
    if not path:
        return False
    if _DRIVE_RE.match(path):
        return True
    if _BACKSLASH_RE.search(path):
        return True
    return False


def is_posix_path(path: str) -> bool:
    """Return True if *path* uses POSIX-style conventions.

    Returns True when the path is non-empty and **not** Windows-style.
    """
    if not path:
        return False
    return not is_windows_path(path)


def _parse(path: str) -> PureWindowsPath | PurePosixPath:
    """Return the correct pure path object for *path* regardless of host OS."""
    if is_windows_path(path):
        return PureWindowsPath(path)
    return PurePosixPath(path)


def asset_name(path: str) -> str:
    """Return the final path component (file/directory name).

    Works correctly for Windows paths on Linux and vice-versa.
    """
    if not path:
        return ""
    return _parse(path).name


def asset_directory(path: str) -> str:
    """Return the parent directory of *path* as a string.

    Works correctly for Windows paths on Linux and vice-versa.
    """
    if not path:
        return ""
    return str(_parse(path).parent)


def asset_extension(path: str) -> str:
    """Return the file extension (including the dot), lowercased.

    Returns an empty string if there is no extension.
    Works correctly for Windows paths on Linux and vice-versa.
    """
    if not path:
        return ""
    return _parse(path).suffix.lower()


def normalize_path(path: str) -> str:
    """Normalise *path* to a canonical string form.

    - Windows paths keep backslash separators.
    - POSIX paths keep forward slash separators.
    - Redundant separators and ``.`` components are collapsed.
    """
    if not path:
        return ""
    return str(_parse(path))
