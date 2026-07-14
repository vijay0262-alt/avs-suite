"""Safety rules for the junk scanner.

The scanner is deliberately conservative:

* Cleaners declare **exact target roots**. We never scan above them.
* Any resolved path that starts with a member of :data:`FORBIDDEN_ROOTS`
  is skipped, even if a cleaner mistakenly points there.
* Symbolic links are never followed (see :func:`is_symlink_like`).
* Directory traversal uses ``os.scandir`` and re-uses ``DirEntry.stat``
  cache to minimise ``stat`` syscalls.
"""

from __future__ import annotations

import os
from pathlib import Path


def _norm(p: str | os.PathLike[str]) -> str:
    """Normalise a path for prefix comparison.

    * Backslashes → forward slashes so the check works identically on
      Windows and POSIX build hosts.
    * Case-folded on Windows.
    * Trailing separators stripped.
    """
    s = str(p).replace("\\", "/")
    # Preserve drive-letter colons; only collapse repeated slashes.
    while "//" in s:
        s = s.replace("//", "/")
    s = s.rstrip("/")
    if os.name == "nt":
        return s.lower()
    return s


# Absolute paths (or roots) that must NEVER be scanned even if a cleaner
# is misconfigured. The list is intentionally short and only contains
# folders whose deletion would break Windows.
_FORBIDDEN_RAW: tuple[str, ...] = (
    r"C:\Windows\System32",
    r"C:\Windows\SysWOW64",
    r"C:\Windows\WinSxS",
    r"C:\Windows\Fonts",
    r"C:\Windows\Boot",
    r"C:\Program Files",
    r"C:\Program Files (x86)",
    r"C:\ProgramData\Microsoft\Windows Defender",
)

FORBIDDEN_ROOTS: frozenset[str] = frozenset(_norm(p) for p in _FORBIDDEN_RAW)


def is_forbidden(path: str | os.PathLike[str]) -> bool:
    """Return True iff ``path`` lies inside a hard-forbidden root."""
    candidate = _norm(path)
    for root in FORBIDDEN_ROOTS:
        if candidate == root or candidate.startswith(root + "/"):
            return True
    return False


def is_symlink_like(entry: os.DirEntry[str]) -> bool:
    """Return True for symlinks, junctions, and other reparse points.

    ``os.DirEntry.is_symlink`` catches symlinks. On Windows, junctions
    are reparse points that don't advertise themselves as symlinks, so
    we additionally check for the reparse-point stat flag.
    """
    try:
        if entry.is_symlink():
            return True
    except OSError:
        return True
    if os.name == "nt":
        try:
            st = entry.stat(follow_symlinks=False)
            # 0x400 == FILE_ATTRIBUTE_REPARSE_POINT
            file_attrs = getattr(st, "st_file_attributes", 0)
            if file_attrs & 0x400:
                return True
        except OSError:
            return True
    return False


def expand(path: str) -> Path:
    """Expand ``~`` and ``%ENV%`` and return an absolute ``Path``."""
    return Path(os.path.expandvars(os.path.expanduser(path))).resolve(strict=False)
