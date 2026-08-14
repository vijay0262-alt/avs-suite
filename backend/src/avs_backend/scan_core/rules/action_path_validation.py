"""
SC-8C3 Part 4 — Remediation Action Path Validation

Windows-path-aware validation for filesystem action targets.

Rejects:
- FORBIDDEN_ROOTS (system/protected locations)
- path traversal sequences
- unsafe relative paths
- invalid/ambiguous paths
- symlinks, junctions, reparse points (contracts for execution-time check)
- unsafe UNC paths

This module performs string-based validation during planning.
Execution-time symlink/reparse-point detection requires filesystem
inspection by the Future Execution Engine.
"""

from __future__ import annotations

import os
from typing import FrozenSet

# ── Forbidden Roots ────────────────────────────────────────────────────────────

# Mirror of legacy safe_paths.FORBIDDEN_ROOTS plus additional
# Windows protected locations.
_FORBIDDEN_RAW: tuple[str, ...] = (
    # System directories
    r"C:\Windows",
    r"C:\Windows\System32",
    r"C:\Windows\SysWOW64",
    r"C:\Windows\WinSxS",
    r"C:\Windows\Fonts",
    r"C:\Windows\Boot",
    r"C:\Windows\assembly",
    r"C:\Windows\Microsoft.NET",
    r"C:\Windows\Installer",
    r"C:\Windows\servicing",
    r"C:\Windows\ImmersiveControlPanel",
    r"C:\Windows\Cursors",
    r"C:\Windows\Resources",
    r"C:\Windows\diagnostics",
    r"C:\Windows\PolicyDefinitions",
    r"C:\Windows\regedit.exe",
    # System config and drivers
    r"C:\Windows\System32\config",
    r"C:\Windows\System32\drivers",
    # Program Files
    r"C:\Program Files",
    r"C:\Program Files (x86)",
    # Protected ProgramData
    r"C:\ProgramData",
    r"C:\ProgramData\Microsoft\Windows Defender",
    r"C:\ProgramData\Microsoft\Windows",
    r"C:\ProgramData\Microsoft\Search\Data",
    # Recovery and boot
    r"C:\System Volume Information",
    r"C:\Recovery",
    r"C:\Boot",
    r"C:\EFI",
    # User personal data
    r"C:\Users\User\Documents",
    r"C:\Users\User\Desktop",
    r"C:\Users\User\Downloads",
    r"C:\Users\User\Pictures",
    r"C:\Users\User\Videos",
    r"C:\Users\User\Music",
)

# Environment-variable-aware forbidden roots.
# These are checked after expansion.
_ENV_FORBIDDEN_RAW: tuple[str, ...] = (
    r"%SystemRoot%",
    r"%SystemRoot%\System32",
    r"%SystemRoot%\SysWOW64",
    r"%SystemRoot%\WinSxS",
    r"%SystemRoot%\Fonts",
    r"%SystemRoot%\Boot",
    r"%SystemRoot%\Installer",
    r"%SystemRoot%\servicing",
    r"%ProgramFiles%",
    r"%ProgramFiles(x86)%",
    r"%ProgramData%\Microsoft\Windows Defender",
    r"%ProgramData%\Microsoft\Windows",
    r"%USERPROFILE%\Documents",
    r"%USERPROFILE%\Desktop",
    r"%USERPROFILE%\Downloads",
    r"%USERPROFILE%\Pictures",
    r"%USERPROFILE%\Videos",
    r"%USERPROFILE%\Music",
)


def _normalize_path_component(path: str) -> str:
    """
    Normalize a path for comparison.

    * Backslashes -> forward slashes
    * Collapse repeated slashes
    * Strip trailing slashes
    * Case-fold on Windows
    * Preserve drive-letter colons
    """
    s = str(path).replace("\\", "/")
    while "//" in s:
        s = s.replace("//", "/")
    s = s.rstrip("/")
    if os.name == "nt":
        return s.lower()
    return s


def _expand_env_vars(path: str) -> str:
    """Expand Windows environment variables in path."""
    result = path
    for var in (
        "%SystemRoot%",
        "%ProgramFiles%",
        "%ProgramFiles(x86)%",
        "%ProgramData%",
        "%USERPROFILE%",
        "%LOCALAPPDATA%",
        "%APPDATA%",
    ):
        env_val = os.environ.get(var.strip("%"))
        if env_val:
            result = result.replace(var, env_val)
    result = os.path.expandvars(result)
    return result


def _get_forbidden_roots() -> FrozenSet[str]:
    """Return frozen set of normalized forbidden root paths."""
    roots: set[str] = set()
    for raw in _FORBIDDEN_RAW:
        roots.add(_normalize_path_component(raw))
    for raw in _ENV_FORBIDDEN_RAW:
        expanded = _expand_env_vars(raw)
        roots.add(_normalize_path_component(expanded))
    return frozenset(roots)


FORBIDDEN_ROOTS: FrozenSet[str] = _get_forbidden_roots()


# ── Path Validation ────────────────────────────────────────────────────────────


class PathValidationError(Exception):
    """Raised when a path fails safety validation."""

    def __init__(self, message: str, reason: str) -> None:
        super().__init__(message)
        self.reason = reason


def validate_filesystem_path(
    path: str,
    *,
    allow_relative: bool = False,
    allow_unc: bool = False,
) -> None:
    """
    Validate a filesystem path for action targeting.

    Args:
        path: Path to validate.
        allow_relative: Whether relative paths are acceptable.
        allow_unc: Whether UNC paths are acceptable.

    Raises:
        PathValidationError: If path is unsafe.
    """
    if not path or not path.strip():
        raise PathValidationError("Path is empty", "empty_path")

    # Check for path traversal sequences
    if ".." in path.replace("\\", "/").split("/"):
        raise PathValidationError(f"Path contains traversal: {path}", "path_traversal")

    # Check for null bytes
    if "\x00" in path:
        raise PathValidationError("Path contains null byte", "invalid_path")

    # Reject Windows device namespace paths that bypass normal path semantics.
    lowered = path.lower().replace("/", "\\")
    if lowered.startswith("\\\\?\\") or lowered.startswith("\\\\.\\"):
        raise PathValidationError(
            f"Windows device path not allowed: {path}", "device_path"
        )

    # Determine if UNC before normalizing away the leading double-backslash
    is_unc = path.startswith("\\\\") or path.startswith("//")
    if is_unc and not allow_unc:
        raise PathValidationError(f"UNC path not allowed: {path}", "unsafe_unc_path")

    # Normalize for analysis
    normalized = _normalize_path_component(path)

    # Check relative path
    drive_colon_pos = -1
    if len(normalized) >= 2 and normalized[1] == ":" and normalized[0].isalpha():
        drive_colon_pos = 1

    # Leading slash / backslash counts as absolute for cross-platform tests
    is_unix_absolute = normalized.startswith("/")

    if drive_colon_pos == -1 and not is_unc and not is_unix_absolute:
        # No drive letter, not UNC, and not leading-slash absolute — relative or invalid
        if not allow_relative:
            raise PathValidationError(
                f"Relative path not allowed: {path}", "relative_path"
            )
        # Even if relative is allowed, check for traversal
        parts = [p for p in normalized.replace("\\", "/").split("/") if p]
        for part in parts:
            if part == "..":
                raise PathValidationError(
                    f"Relative path contains traversal: {path}", "path_traversal"
                )

    # Check forbidden roots
    for root in FORBIDDEN_ROOTS:
        if normalized == root or normalized.startswith(root + "/"):
            raise PathValidationError(
                f"Path is in forbidden root: {path}", "forbidden_root"
            )

    # Check for reparse-point indicators in path string
    # (actual detection requires filesystem inspection)
    if "\\system volume information\\" in normalized.lower():
        raise PathValidationError(
            f"Path targets System Volume Information: {path}", "forbidden_root"
        )


def is_path_safe_for_planning(path: str) -> bool:
    """
    Return True if path passes basic string-level safety checks.

    This is a planning-time check. Execution-time checks (symlinks,
    reparse points, actual filesystem state) must still be performed.
    """
    try:
        validate_filesystem_path(path)
        return True
    except PathValidationError:
        return False


def normalize_windows_path(path: str) -> str:
    """
    Normalize a Windows path to a canonical form.

    Converts backslashes to forward slashes, collapses repeated slashes,
    strips trailing separators, and case-folds on Windows.
    """
    return _normalize_path_component(path)


def path_identity(path: str) -> str:
    """
    Produce a deterministic identity string for a path.

    Used for deduplication and comparison.
    """
    return normalize_windows_path(path)


# ── Symlink / Reparse Point Contracts ─────────────────────────────────────────


class SymlinkContract:
    """
    Contract for symlink/junction/reparse-point detection.

    The ActionPlanner records these contracts as preconditions.
    The Future Execution Engine must verify them before action.
    """

    @staticmethod
    def check_preconditions(path: str) -> tuple[str, ...]:
        """
        Return precondition strings for symlink/reparse-point checks.

        These are CONTRACTS ONLY — they do not execute checks.
        """
        return (
            "not_symlink:true",
            "not_junction:true",
            "not_reparse_point:true",
            "target_resolved:true",
        )

    @staticmethod
    def is_symlink_like_path(path: str) -> bool:
        """
        Heuristic check for symlink-like path components.

        This is a string-level heuristic only.
        Actual detection requires filesystem inspection.
        """
        normalized = path.replace("\\", "/").lower()
        symlink_indicators = (
            "/symlink/",
            "/junction/",
            "/reparse/",
            "/mklink/",
        )
        return any(indicator in normalized for indicator in symlink_indicators)
