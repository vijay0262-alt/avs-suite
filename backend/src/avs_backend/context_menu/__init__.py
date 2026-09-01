"""Context Menu Manager — manage right-click context menu entries.

Reads and manages Windows Explorer context menu entries from the registry:
  - HKCR\*\shell                          (all files)
  - HKCR\Directory\shell                  (directories)
  - HKCR\Directory\Background\shell       (directory background / desktop)
  - HKCR\Folder\shell                     (folders)
  - HKCR\AllFilesystemObjects\shell       (all filesystem objects)
  - HKCR\Drive\shell                      (drives)

To disable an entry, adds a "LegacyDisable" string value to the shell subkey.
To enable, removes the "LegacyDisable" value.

RPC methods:
    context_menu.list       — list all context menu entries
    context_menu.summary    — get entry count summary
    context_menu.disable    — disable a context menu entry (Pro only)
    context_menu.enable     — enable a context menu entry (Pro only)
    context_menu.remove     — remove a context menu entry (Pro only)
"""

from __future__ import annotations

import logging
import os
import platform
import winreg
from datetime import datetime, timezone
from typing import Any

from avs_backend.api.registry import register
from avs_backend.licensing import require_feature

log = logging.getLogger("avs.context_menu")

IS_WINDOWS = platform.system() == "Windows"

# Registry locations for context menu entries
# Each location is (hive, key_path, context_description)
CONTEXT_MENU_LOCATIONS: list[tuple[int, str, str]] = [
    (winreg.HKEY_CLASSES_ROOT, r"*\shell", "All Files"),
    (winreg.HKEY_CLASSES_ROOT, r"Directory\shell", "Directories"),
    (winreg.HKEY_CLASSES_ROOT, r"Directory\Background\shell", "Desktop / Folder Background"),
    (winreg.HKEY_CLASSES_ROOT, r"Folder\shell", "Folders"),
    (winreg.HKEY_CLASSES_ROOT, r"AllFilesystemObjects\shell", "All Filesystem Objects"),
    (winreg.HKEY_CLASSES_ROOT, r"Drive\shell", "Drives"),
]

# Also check HKCU for user-specific context menu entries
HKCU_LOCATIONS: list[tuple[int, str, str]] = [
    (winreg.HKEY_CURRENT_USER, r"Software\Classes\*\shell", "All Files (User)"),
    (winreg.HKEY_CURRENT_USER, r"Software\Classes\Directory\shell", "Directories (User)"),
    (winreg.HKEY_CURRENT_USER, r"Software\Classes\Directory\Background\shell", "Desktop (User)"),
]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _read_subkeys(hive: int, key_path: str) -> list[str]:
    """Read all subkey names under a registry key."""
    subkeys: list[str] = []
    try:
        with winreg.OpenKey(hive, key_path, 0, winreg.KEY_READ) as handle:
            num_subkeys, _, _ = winreg.QueryInfoKey(handle)
            for i in range(num_subkeys):
                subkeys.append(winreg.EnumKey(handle, i))
    except FileNotFoundError:
        pass
    except OSError:
        pass
    return subkeys


def _read_value(hive: int, key_path: str, value_name: str) -> str | None:
    """Read a string registry value."""
    try:
        with winreg.OpenKey(hive, key_path, 0, winreg.KEY_READ) as handle:
            data, _ = winreg.QueryValueEx(handle, value_name)
            return str(data) if data else None
    except (FileNotFoundError, OSError):
        return None


def _has_value(hive: int, key_path: str, value_name: str) -> bool:
    """Check if a registry value exists."""
    try:
        with winreg.OpenKey(hive, key_path, 0, winreg.KEY_READ) as handle:
            winreg.QueryValueEx(handle, value_name)
            return True
    except (FileNotFoundError, OSError):
        return False


def _set_value(hive: int, key_path: str, value_name: str, value_type: int, value: str) -> bool:
    """Set a registry value."""
    try:
        with winreg.OpenKey(hive, key_path, 0, winreg.KEY_SET_VALUE) as handle:
            winreg.SetValueEx(handle, value_name, 0, value_type, value)
        return True
    except OSError as e:
        log.error("Failed to set registry value %s\\%s: %s", key_path, value_name, e)
        return False


def _delete_value(hive: int, key_path: str, value_name: str) -> bool:
    """Delete a registry value."""
    try:
        with winreg.OpenKey(hive, key_path, 0, winreg.KEY_SET_VALUE) as handle:
            winreg.DeleteValue(handle, value_name)
        return True
    except FileNotFoundError:
        return True  # Already doesn't exist
    except OSError as e:
        log.error("Failed to delete registry value %s\\%s: %s", key_path, value_name, e)
        return False


def _delete_key(hive: int, key_path: str) -> bool:
    """Delete a registry key and all its subkeys."""
    try:
        winreg.DeleteKey(hive, key_path)
        return True
    except FileNotFoundError:
        return True
    except OSError as e:
        log.error("Failed to delete registry key %s: %s", key_path, e)
        return False


def _collect_entries(hive: int, shell_path: str, context: str) -> list[dict[str, Any]]:
    """Collect context menu entries from a shell registry location."""
    entries: list[dict[str, Any]] = []
    subkeys = _read_subkeys(hive, shell_path)

    for subkey in subkeys:
        entry_path = f"{shell_path}\\{subkey}"

        # Read display name (MUIVerb or default value)
        display_name = _read_value(hive, entry_path, "MUIVerb")
        if not display_name:
            display_name = _read_value(hive, entry_path, "")
        if not display_name:
            display_name = subkey

        # Read command
        command_path = f"{entry_path}\\command"
        command = _read_value(hive, command_path, "")

        # Read icon
        icon = _read_value(hive, entry_path, "Icon")

        # Check if disabled (has LegacyDisable value)
        is_disabled = _has_value(hive, entry_path, "LegacyDisable")

        # Determine hive name
        hive_name = "HKCR" if hive == winreg.HKEY_CLASSES_ROOT else "HKCU"

        entries.append({
            "id": f"{hive_name}\\{entry_path}",
            "name": display_name,
            "subkey": subkey,
            "context": context,
            "command": command or "",
            "icon": icon or "",
            "enabled": not is_disabled,
            "regPath": entry_path,
            "hive": hive_name,
            "hasCommand": bool(command),
        })

    return entries


def _get_all_entries() -> list[dict[str, Any]]:
    """Get all context menu entries from all registry locations."""
    if not IS_WINDOWS:
        return []

    entries: list[dict[str, Any]] = []

    for hive, path, context in CONTEXT_MENU_LOCATIONS:
        entries.extend(_collect_entries(hive, path, context))

    for hive, path, context in HKCU_LOCATIONS:
        entries.extend(_collect_entries(hive, path, context))

    return entries


# ─── RPC Methods ────────────────────────────────────────────────────

@register("context_menu.list")
def context_menu_list(_params: dict[str, Any] | None) -> dict[str, Any]:
    """List all context menu entries from the Windows registry.

    Returns:
        entries: list of context menu entries with details
        count: total entry count
        enabledCount: number of enabled entries
        disabledCount: number of disabled entries
        byContext: breakdown by context (All Files, Directories, etc.)
    """
    entries = _get_all_entries()

    enabled_count = sum(1 for e in entries if e["enabled"])
    disabled_count = len(entries) - enabled_count

    by_context: dict[str, int] = {}
    for entry in entries:
        ctx = entry.get("context", "Unknown")
        by_context[ctx] = by_context.get(ctx, 0) + 1

    return {
        "entries": entries,
        "count": len(entries),
        "enabledCount": enabled_count,
        "disabledCount": disabled_count,
        "byContext": by_context,
        "supported": IS_WINDOWS,
        "capturedAt": _now_iso(),
    }


@register("context_menu.summary")
def context_menu_summary(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get context menu entry count summary."""
    entries = _get_all_entries()

    enabled_count = sum(1 for e in entries if e["enabled"])
    disabled_count = len(entries) - enabled_count

    by_context: dict[str, int] = {}
    for entry in entries:
        ctx = entry.get("context", "Unknown")
        by_context[ctx] = by_context.get(ctx, 0) + 1

    return {
        "count": len(entries),
        "enabledCount": enabled_count,
        "disabledCount": disabled_count,
        "byContext": by_context,
        "supported": IS_WINDOWS,
        "capturedAt": _now_iso(),
    }


@register("context_menu.disable")
@require_feature("context_menu.disable")
def context_menu_disable(params: dict[str, Any] | None) -> dict[str, Any]:
    """Disable a context menu entry by adding LegacyDisable value. Pro only.

    Params:
        hive: registry hive ("HKCR" or "HKCU")
        regPath: full registry path to the shell subkey
    """
    if not IS_WINDOWS:
        return {"success": False, "message": "Only available on Windows"}

    if not params or "hive" not in params or "regPath" not in params:
        return {"success": False, "message": "hive and regPath parameters are required"}

    hive_name = params["hive"]
    reg_path = params["regPath"]

    hive = winreg.HKEY_CLASSES_ROOT if hive_name == "HKCR" else winreg.HKEY_CURRENT_USER

    # Add LegacyDisable value to disable the entry
    success = _set_value(hive, reg_path, "LegacyDisable", winreg.REG_SZ, "")

    if success:
        return {"success": True, "message": f"Disabled context menu entry: {reg_path}"}
    else:
        return {"success": False, "message": f"Failed to disable entry: {reg_path}"}


@register("context_menu.enable")
@require_feature("context_menu.enable")
def context_menu_enable(params: dict[str, Any] | None) -> dict[str, Any]:
    """Enable a context menu entry by removing LegacyDisable value. Pro only.

    Params:
        hive: registry hive ("HKCR" or "HKCU")
        regPath: full registry path to the shell subkey
    """
    if not IS_WINDOWS:
        return {"success": False, "message": "Only available on Windows"}

    if not params or "hive" not in params or "regPath" not in params:
        return {"success": False, "message": "hive and regPath parameters are required"}

    hive_name = params["hive"]
    reg_path = params["regPath"]

    hive = winreg.HKEY_CLASSES_ROOT if hive_name == "HKCR" else winreg.HKEY_CURRENT_USER

    # Remove LegacyDisable value to enable the entry
    success = _delete_value(hive, reg_path, "LegacyDisable")

    if success:
        return {"success": True, "message": f"Enabled context menu entry: {reg_path}"}
    else:
        return {"success": False, "message": f"Failed to enable entry: {reg_path}"}


@register("context_menu.remove")
@require_feature("context_menu.remove")
def context_menu_remove(params: dict[str, Any] | None) -> dict[str, Any]:
    """Remove a context menu entry by deleting its registry key. Pro only.

    Params:
        hive: registry hive ("HKCR" or "HKCU")
        regPath: full registry path to the shell subkey
    """
    if not IS_WINDOWS:
        return {"success": False, "message": "Only available on Windows"}

    if not params or "hive" not in params or "regPath" not in params:
        return {"success": False, "message": "hive and regPath parameters are required"}

    hive_name = params["hive"]
    reg_path = params["regPath"]

    hive = winreg.HKEY_CLASSES_ROOT if hive_name == "HKCR" else winreg.HKEY_CURRENT_USER

    # Delete the entire shell subkey (including command subkey)
    success = _delete_key(hive, reg_path)

    if success:
        return {"success": True, "message": f"Removed context menu entry: {reg_path}"}
    else:
        return {"success": False, "message": f"Failed to remove entry: {reg_path}"}
