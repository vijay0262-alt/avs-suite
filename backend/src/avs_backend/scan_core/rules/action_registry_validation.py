"""
SC-8C3 Part 4 — Remediation Action Registry Validation

Validates registry targets before creating executable action plans.

Requires:
- explicit hive allowlist
- normalized key path
- protected-key denylist
- parent-key protection
- correct WOW6432Node/view awareness

Rejects ambiguous or unsafe registry targets.
"""

from __future__ import annotations

from typing import FrozenSet, Optional

# ── Registry Constants ─────────────────────────────────────────────────────────

# Allowed Windows registry hives.
# Only these hives may be targeted for remediation.
ALLOWED_HIVES: FrozenSet[str] = frozenset(
    {
        "HKLM",
        "HKCU",
        "HKCR",
        "HKU",
        "HKCC",
        "HKEY_LOCAL_MACHINE",
        "HKEY_CURRENT_USER",
        "HKEY_CLASSES_ROOT",
        "HKEY_USERS",
        "HKEY_CURRENT_CONFIG",
    }
)

# Map short names to canonical names for normalization.
_HIVE_CANONICAL: dict[str, str] = {
    "HKLM": "HKLM",
    "HKCU": "HKCU",
    "HKCR": "HKCR",
    "HKU": "HKU",
    "HKCC": "HKCC",
    "HKEY_LOCAL_MACHINE": "HKLM",
    "HKEY_CURRENT_USER": "HKCU",
    "HKEY_CLASSES_ROOT": "HKCR",
    "HKEY_USERS": "HKU",
    "HKEY_CURRENT_CONFIG": "HKCC",
}

# Protected registry keys that must never be targeted for removal.
# These are system-critical keys whose deletion would break Windows.
_PROTECTED_KEYS_RAW: tuple[str, ...] = (
    # HKLM critical keys
    r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run",
    r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce",
    r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies",
    r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion",
    r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer",
    r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Controls Folder",
    r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Device Manager",
    r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Group Policy",
    r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Installer",
    r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Setup",
    r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Shell Extensions",
    r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Telephony",
    r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Wbem",
    r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\NetworkList",
    r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList",
    r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Schedule",
    r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Services",
    r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Svchost",
    r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon",
    r"HKLM\SYSTEM\CurrentControlSet",
    r"HKLM\SYSTEM\ControlSet001",
    r"HKLM\SYSTEM\ControlSet002",
    r"HKLM\SOFTWARE\Microsoft\Cryptography",
    r"HKLM\SOFTWARE\Microsoft\Windows Defender",
    r"HKLM\SOFTWARE\Microsoft\Windows Update",
    r"HKLM\SOFTWARE\Microsoft\Windows\WindowsUpdate",
    # HKCU critical keys
    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
    r"HKCU\Software\Microsoft\Windows\CurrentVersion\RunOnce",
    # HKCR critical keys
    r"HKCR\CLSID",
    r"HKCR\Interface",
    r"HKCR\TypeLib",
    # HKU critical keys
    r"HKU\.DEFAULT",
    r"HKU\S-1-5-18",
    r"HKU\S-1-5-19",
    r"HKU\S-1-5-20",
)

# Protected registry value names.
# These values may appear under non-protected keys but are system-critical.
_PROTECTED_VALUE_NAMES: frozenset[str] = frozenset(
    {
        "SystemRoot",
        "ProgramFilesDir",
        "ProgramFilesDir (x86)",
        "ProgramW6432Dir",
        "Path",
        "windir",
        "TEMP",
        "TMP",
        "CommonFilesDir",
        "CommonFilesDir (x86)",
        "CommonW6432Dir",
        "AppData",
        "LocalAppData",
        "ProgramData",
        "DevicePath",
        "MediaPath",
    }
)


# Protected parent key prefixes.
# Any key under these prefixes is considered protected.
_PROTECTED_PREFIXES: tuple[str, ...] = (
    r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run",
    r"HKLM\SYSTEM\CurrentControlSet",
    r"HKLM\SYSTEM\ControlSet",
    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
    r"HKCR\CLSID",
    r"HKU\.DEFAULT",
    r"HKU\S-1-5-",
)

# WOW6432Node marker for 32-bit registry view on 64-bit Windows.
_WOW6432NODE = "WOW6432NODE"


def _strip_wow6432node(key_path: str) -> str:
    """Remove the WOW6432Node component from a key path, returning the 64-bit view path."""
    parts = [p for p in key_path.split("\\") if p]
    filtered = [p for p in parts if p.upper() != _WOW6432NODE]
    return "\\".join(filtered)


def _contains_wow6432node(key_path: str) -> bool:
    """Return True if the key path explicitly includes a WOW6432Node component."""
    return any(p.upper() == _WOW6432NODE for p in key_path.split("\\") if p)


def normalize_registry_view(view: str) -> str:
    """Normalize a registry view string to a canonical form."""
    if not isinstance(view, str):
        raise RegistryValidationError("Registry view must be a string", "invalid_view")
    v = view.strip().lower()
    if v in ("", "default"):
        return "default"
    if v in ("wow6432node", "wow32", "32"):
        return "wow6432node"
    if v in ("wow64", "64"):
        return "wow64"
    raise RegistryValidationError(f"Unrecognized registry view: {view}", "invalid_view")


# ── Validation ─────────────────────────────────────────────────────────────────


class RegistryValidationError(Exception):
    """Raised when a registry target fails validation."""

    def __init__(self, message: str, reason: str) -> None:
        super().__init__(message)
        self.reason = reason


def normalize_hive(hive: str) -> str:
    """
    Normalize hive name to canonical short form.

    Args:
        hive: Raw hive string from finding.

    Returns:
        Canonical hive name (HKLM, HKCU, HKCR, HKU, HKCC).

    Raises:
        RegistryValidationError: If hive is not recognized.
    """
    if not hive:
        raise RegistryValidationError("Hive is empty", "empty_hive")

    hive_upper = hive.upper().strip()
    canonical = _HIVE_CANONICAL.get(hive_upper)
    if canonical is None:
        raise RegistryValidationError(f"Unrecognized hive: {hive}", "invalid_hive")
    return canonical


def normalize_key_path(key_path: str) -> str:
    """
    Normalize registry key path.

    Args:
        key_path: Raw key path string.

    Returns:
        Normalized key path.

    Raises:
        RegistryValidationError: If path is malformed.
    """
    if not key_path or not key_path.strip():
        raise RegistryValidationError("Key path is empty", "empty_key_path")

    # Remove leading/trailing backslashes
    normalized = key_path.strip("\\")

    # Check for null bytes
    if "\x00" in normalized:
        raise RegistryValidationError("Key path contains null byte", "invalid_path")

    # Split and validate components
    parts = [p for p in normalized.split("\\") if p]
    if not parts:
        raise RegistryValidationError("Key path has no components", "empty_key_path")

    return "\\".join(parts)


def is_protected_value_name(value_name: str) -> bool:
    """Return True if the value name is in the protected value name list."""
    if not value_name:
        return False
    return value_name.strip().upper() in {v.upper() for v in _PROTECTED_VALUE_NAMES}


def validate_value_name(value_name: str) -> None:
    """
    Validate a registry value name.

    Args:
        value_name: Raw value name string.

    Raises:
        RegistryValidationError: If value name is malformed.
    """
    if value_name is None:
        return
    if not isinstance(value_name, str):
        raise RegistryValidationError(
            "Value name must be a string", "invalid_value_name"
        )
    if "\x00" in value_name:
        raise RegistryValidationError(
            "Value name contains null byte", "invalid_value_name"
        )
    if value_name.startswith("\\") or value_name.endswith("\\"):
        raise RegistryValidationError(
            f"Value name contains path separators: {value_name}",
            "invalid_value_name",
        )
    # Value names may not span multiple components
    if "\\" in value_name:
        raise RegistryValidationError(
            f"Value name must not contain backslash: {value_name}",
            "invalid_value_name",
        )


def is_protected_key(hive: str, key_path: str) -> bool:
    """
    Check if a registry key is in the protected list.

    Args:
        hive: Canonical hive name.
        key_path: Normalized key path (may include WOW6432Node component).

    Returns:
        True if the key is protected.
    """
    # Compare in the canonical 64-bit view so the same key cannot be reached
    # through a WOW6432Node alias.
    canonical_path = _strip_wow6432node(f"{hive}\\{key_path}").upper()

    # Exact match against protected keys
    for protected in _PROTECTED_KEYS_RAW:
        if canonical_path == protected.upper():
            return True

    # Prefix match against protected prefixes
    for prefix in _PROTECTED_PREFIXES:
        if canonical_path.startswith(prefix.upper()):
            return True

    return False


def is_parent_key_deletion(hive: str, key_path: str, value_name: Optional[str]) -> bool:
    """
    Check if the action would delete an entire parent key.

    For REMOVE_REGISTRY_KEY, value_name must be None (key deletion).
    We must ensure the key is not a parent of protected keys.

    Args:
        hive: Canonical hive name.
        key_path: Normalized key path.
        value_name: Value name (None for key deletion).

    Returns:
        True if the action would delete a parent key.
    """
    if value_name is not None:
        # Value deletion — not a parent key deletion
        return False

    # Check if this key path is a prefix of any protected key, comparing in
    # the canonical 64-bit view.
    key_prefix = _strip_wow6432node(f"{hive}\\{key_path}").upper()
    for protected in _PROTECTED_KEYS_RAW:
        protected_upper = _strip_wow6432node(protected).upper()
        if protected_upper.startswith(key_prefix + "\\"):
            return True

    return False


def validate_registry_target(
    hive: str,
    key_path: str,
    value_name: Optional[str] = None,
    action_type: Optional[str] = None,
) -> None:
    """
    Validate a registry action target.

    Args:
        hive: Raw hive string.
        key_path: Raw key path string.
        value_name: Optional value name.
        action_type: Optional action type string.

    Raises:
        RegistryValidationError: If target is unsafe.
    """
    # Validate hive
    canonical_hive = normalize_hive(hive)

    # Validate key path
    normalized_key = normalize_key_path(key_path)

    # Protected-key and parent-key checks are performed in the canonical
    # 64-bit view so WOW6432Node cannot be used to bypass the denylist.
    canonical_key_for_safety = _strip_wow6432node(normalized_key)

    # Check protected keys
    if is_protected_key(canonical_hive, canonical_key_for_safety):
        raise RegistryValidationError(
            f"Registry key is protected: {canonical_hive}\\{canonical_key_for_safety}",
            "protected_registry_key",
        )

    # Validate value name when provided
    if value_name is not None:
        validate_value_name(value_name)
        if is_protected_value_name(value_name):
            raise RegistryValidationError(
                f"Registry value name is protected: {value_name}",
                "protected_registry_value",
            )

    # Check parent key deletion risk
    if action_type == "remove_registry_key":
        if is_parent_key_deletion(canonical_hive, canonical_key_for_safety, value_name):
            raise RegistryValidationError(
                f"Registry key deletion would affect parent key: "
                f"{canonical_hive}\\{normalized_key}",
                "parent_key_deletion",
            )


def is_registry_target_safe(
    hive: str, key_path: str, value_name: Optional[str] = None
) -> bool:
    """
    Return True if registry target passes safety checks.

    This is a planning-time check. Execution-time checks (key existence,
    value type, etc.) must still be performed.
    """
    try:
        validate_registry_target(hive, key_path, value_name)
        return True
    except RegistryValidationError:
        return False
