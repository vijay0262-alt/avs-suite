"""Browser Extension Manager — view, disable, and remove browser extensions.

Supports Chrome, Edge, Brave, and Firefox.

For Chromium-based browsers, extensions are disabled by removing the
extension folder (the extension can be re-installed from the Chrome Web
Store). Firefox extensions are toggled via extensions.json.

RPC methods:
    browser_ext.list       — list all extensions across all browsers
    browser_ext.summary    — get extension count summary
    browser_ext.remove     — remove an extension (Pro only)
    browser_ext.disable    — disable an extension (Pro only, Firefox only)
    browser_ext.enable     — enable an extension (Pro only, Firefox only)
"""

from __future__ import annotations

import json
import logging
import os
import platform
import shutil
from datetime import datetime, timezone
from typing import Any

from avs_backend.api.registry import register
from avs_backend.licensing import require_feature

log = logging.getLogger("avs.browser_ext")

IS_WINDOWS = platform.system() == "Windows"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ─── Extension Discovery ───────────────────────────────────────────

def _get_chromium_extensions(browser_name: str, ext_dir: str) -> list[dict[str, Any]]:
    """Get extensions from a Chromium-based browser."""
    extensions: list[dict[str, Any]] = []
    if not os.path.isdir(ext_dir):
        return extensions

    try:
        for ext_id in os.listdir(ext_dir):
            ext_path = os.path.join(ext_dir, ext_id)
            if not os.path.isdir(ext_path):
                continue

            # Find the latest version directory
            versions = sorted(os.listdir(ext_path), reverse=True)
            for ver in versions:
                manifest_path = os.path.join(ext_path, ver, "manifest.json")
                if os.path.isfile(manifest_path):
                    try:
                        with open(manifest_path, "r", encoding="utf-8") as f:
                            manifest = json.load(f)

                        # Check if extension is in "Preferences" file to determine enabled state
                        enabled = _is_chromium_extension_enabled(browser_name, ext_id)

                        extensions.append({
                            "browser": browser_name,
                            "extensionId": ext_id,
                            "version": ver,
                            "name": _resolve_manifest_name(manifest, ext_id),
                            "description": manifest.get("description", ""),
                            "permissions": manifest.get("permissions", []),
                            "hostPermissions": manifest.get("host_permissions", []),
                            "manifestVersion": manifest.get("manifest_version", 2),
                            "path": os.path.join(ext_path, ver),
                            "enabled": enabled,
                            "canDisable": True,
                            "canRemove": True,
                        })
                    except (ValueError, OSError):
                        continue
                break  # Only process the latest version
    except OSError:
        pass

    return extensions


def _resolve_manifest_name(manifest: dict, ext_id: str) -> str:
    """Resolve extension name from manifest (handles __MSG_ placeholders)."""
    name = manifest.get("name", ext_id)
    if isinstance(name, str) and name.startswith("__MSG_"):
        # Try to resolve from _locales
        return name  # Keep raw placeholder if we can't resolve
    return name


def _is_chromium_extension_enabled(browser_name: str, ext_id: str) -> bool:
    """Check if a Chromium extension is enabled by reading the Preferences file.

    Chromium stores extension state in the Preferences JSON file.
    If the extension is not in the disable list, it's considered enabled.
    """
    local_app = os.path.expandvars("%LOCALAPPDATA%")
    browser_paths = {
        "Chrome": os.path.join(local_app, r"Google\Chrome\User Data\Default\Preferences"),
        "Edge": os.path.join(local_app, r"Microsoft\Edge\User Data\Default\Preferences"),
        "Brave": os.path.join(local_app, r"BraveSoftware\Brave-Browser\User Data\Default\Preferences"),
    }

    pref_path = browser_paths.get(browser_name)
    if not pref_path or not os.path.isfile(pref_path):
        return True  # Assume enabled if we can't check

    try:
        with open(pref_path, "r", encoding="utf-8") as f:
            prefs = json.load(f)
        ext_settings = prefs.get("extensions", {}).get("settings", {})
        ext_info = ext_settings.get(ext_id, {})
        # If state is 1, it's enabled; if 0, disabled
        return ext_info.get("state", 1) == 1
    except (ValueError, OSError):
        return True


def _get_firefox_extensions() -> list[dict[str, Any]]:
    """Get extensions from Firefox."""
    extensions: list[dict[str, Any]] = []
    local_app = os.path.expandvars("%LOCALAPPDATA%")
    firefox_profiles = os.path.join(local_app, r"Mozilla\Firefox\Profiles")

    if not os.path.isdir(firefox_profiles):
        return extensions

    for profile in os.listdir(firefox_profiles):
        ext_file = os.path.join(firefox_profiles, profile, "extensions.json")
        if os.path.isfile(ext_file):
            try:
                with open(ext_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                for addon in data.get("addons", []):
                    extensions.append({
                        "browser": "Firefox",
                        "extensionId": addon.get("id", ""),
                        "version": addon.get("version", ""),
                        "name": addon.get("defaultLocale", {}).get("name", addon.get("id", "")),
                        "description": addon.get("defaultLocale", {}).get("description", ""),
                        "permissions": addon.get("permissions", []),
                        "hostPermissions": [],
                        "manifestVersion": 2,
                        "path": addon.get("path", ""),
                        "enabled": addon.get("active", False),
                        "canDisable": True,
                        "canRemove": True,
                        "profile": profile,
                    })
            except (ValueError, OSError):
                continue

    return extensions


def _get_all_extensions() -> list[dict[str, Any]]:
    """Get all browser extensions across all supported browsers."""
    if not IS_WINDOWS:
        return []

    local_app = os.path.expandvars("%LOCALAPPDATA%")
    extensions: list[dict[str, Any]] = []

    # Chromium-based browsers
    chromium_browsers = [
        ("Chrome", os.path.join(local_app, r"Google\Chrome\User Data\Default\Extensions")),
        ("Edge", os.path.join(local_app, r"Microsoft\Edge\User Data\Default\Extensions")),
        ("Brave", os.path.join(local_app, r"BraveSoftware\Brave-Browser\User Data\Default\Extensions")),
    ]

    for browser_name, ext_dir in chromium_browsers:
        extensions.extend(_get_chromium_extensions(browser_name, ext_dir))

    # Firefox
    extensions.extend(_get_firefox_extensions())

    return extensions


# ─── Extension Management ──────────────────────────────────────────

def _remove_chromium_extension(browser_name: str, ext_id: str) -> dict[str, Any]:
    """Remove a Chromium-based browser extension by deleting its folder."""
    local_app = os.path.expandvars("%LOCALAPPDATA%")
    browser_paths = {
        "Chrome": os.path.join(local_app, r"Google\Chrome\User Data\Default\Extensions"),
        "Edge": os.path.join(local_app, r"Microsoft\Edge\User Data\Default\Extensions"),
        "Brave": os.path.join(local_app, r"BraveSoftware\Brave-Browser\User Data\Default\Extensions"),
    }

    ext_dir = browser_paths.get(browser_name)
    if not ext_dir:
        return {"success": False, "message": f"Unknown browser: {browser_name}"}

    ext_path = os.path.join(ext_dir, ext_id)
    if not os.path.isdir(ext_path):
        return {"success": False, "message": f"Extension {ext_id} not found in {browser_name}"}

    try:
        shutil.rmtree(ext_path, ignore_errors=False)
        return {"success": True, "message": f"Removed extension {ext_id} from {browser_name}"}
    except Exception as e:
        return {"success": False, "message": str(e)}


def _remove_firefox_extension(ext_id: str) -> dict[str, Any]:
    """Remove a Firefox extension by updating extensions.json."""
    local_app = os.path.expandvars("%LOCALAPPDATA%")
    firefox_profiles = os.path.join(local_app, r"Mozilla\Firefox\Profiles")

    if not os.path.isdir(firefox_profiles):
        return {"success": False, "message": "Firefox profiles not found"}

    for profile in os.listdir(firefox_profiles):
        ext_file = os.path.join(firefox_profiles, profile, "extensions.json")
        if os.path.isfile(ext_file):
            try:
                with open(ext_file, "r", encoding="utf-8") as f:
                    data = json.load(f)

                addons = data.get("addons", [])
                original_len = len(addons)
                data["addons"] = [a for a in addons if a.get("id") != ext_id]

                if len(data["addons"]) < original_len:
                    with open(ext_file, "w", encoding="utf-8") as f:
                        json.dump(data, f, indent=2)
                    return {"success": True, "message": f"Removed Firefox extension {ext_id}"}
            except (ValueError, OSError) as e:
                return {"success": False, "message": str(e)}

    return {"success": False, "message": f"Firefox extension {ext_id} not found"}


def _toggle_firefox_extension(ext_id: str, enabled: bool) -> dict[str, Any]:
    """Enable or disable a Firefox extension by updating extensions.json."""
    local_app = os.path.expandvars("%LOCALAPPDATA%")
    firefox_profiles = os.path.join(local_app, r"Mozilla\Firefox\Profiles")

    if not os.path.isdir(firefox_profiles):
        return {"success": False, "message": "Firefox profiles not found"}

    for profile in os.listdir(firefox_profiles):
        ext_file = os.path.join(firefox_profiles, profile, "extensions.json")
        if os.path.isfile(ext_file):
            try:
                with open(ext_file, "r", encoding="utf-8") as f:
                    data = json.load(f)

                found = False
                for addon in data.get("addons", []):
                    if addon.get("id") == ext_id:
                        addon["active"] = enabled
                        addon["userPermissions"] = addon.get("userPermissions", [])
                        found = True
                        break

                if found:
                    with open(ext_file, "w", encoding="utf-8") as f:
                        json.dump(data, f, indent=2)
                    action = "enabled" if enabled else "disabled"
                    return {"success": True, "message": f"Firefox extension {ext_id} {action}"}
            except (ValueError, OSError) as e:
                return {"success": False, "message": str(e)}

    return {"success": False, "message": f"Firefox extension {ext_id} not found"}


# ─── RPC Methods ────────────────────────────────────────────────────

@register("browser_ext.list")
def browser_ext_list(_params: dict[str, Any] | None) -> dict[str, Any]:
    """List all browser extensions across all supported browsers.

    Returns:
        extensions: list of extension details
        count: total extension count
        byBrowser: breakdown by browser
    """
    extensions = _get_all_extensions()

    by_browser: dict[str, int] = {}
    for ext in extensions:
        browser = ext.get("browser", "Unknown")
        by_browser[browser] = by_browser.get(browser, 0) + 1

    return {
        "extensions": extensions,
        "count": len(extensions),
        "byBrowser": by_browser,
        "supported": IS_WINDOWS,
        "capturedAt": _now_iso(),
    }


@register("browser_ext.summary")
def browser_ext_summary(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get extension count summary without full details."""
    extensions = _get_all_extensions()

    by_browser: dict[str, int] = {}
    enabled_count = 0
    disabled_count = 0
    for ext in extensions:
        browser = ext.get("browser", "Unknown")
        by_browser[browser] = by_browser.get(browser, 0) + 1
        if ext.get("enabled"):
            enabled_count += 1
        else:
            disabled_count += 1

    return {
        "count": len(extensions),
        "enabledCount": enabled_count,
        "disabledCount": disabled_count,
        "byBrowser": by_browser,
        "supported": IS_WINDOWS,
        "capturedAt": _now_iso(),
    }


@register("browser_ext.remove")
@require_feature("browser_ext.remove")
def browser_ext_remove(params: dict[str, Any] | None) -> dict[str, Any]:
    """Remove a browser extension. Pro only.

    Params:
        browser: browser name (Chrome, Edge, Brave, Firefox)
        extensionId: extension ID to remove
    """
    if not IS_WINDOWS:
        return {"success": False, "message": "Only available on Windows"}

    if not params or "browser" not in params or "extensionId" not in params:
        return {"success": False, "message": "browser and extensionId parameters are required"}

    browser = params["browser"]
    ext_id = params["extensionId"]

    if browser == "Firefox":
        return _remove_firefox_extension(ext_id)
    else:
        return _remove_chromium_extension(browser, ext_id)


@register("browser_ext.disable")
@require_feature("browser_ext.disable")
def browser_ext_disable(params: dict[str, Any] | None) -> dict[str, Any]:
    """Disable a browser extension. Pro only.

    For Firefox: toggles the active flag in extensions.json.
    For Chromium: removes the extension folder (same as remove, since Chromium
    doesn't have a simple disable mechanism via file system).

    Params:
        browser: browser name
        extensionId: extension ID to disable
    """
    if not IS_WINDOWS:
        return {"success": False, "message": "Only available on Windows"}

    if not params or "browser" not in params or "extensionId" not in params:
        return {"success": False, "message": "browser and extensionId parameters are required"}

    browser = params["browser"]
    ext_id = params["extensionId"]

    if browser == "Firefox":
        return _toggle_firefox_extension(ext_id, enabled=False)
    else:
        # For Chromium, disabling via file system means removing the folder
        # The user can re-install from the Chrome Web Store
        return _remove_chromium_extension(browser, ext_id)


@register("browser_ext.enable")
@require_feature("browser_ext.enable")
def browser_ext_enable(params: dict[str, Any] | None) -> dict[str, Any]:
    """Enable a browser extension. Pro only.

    For Firefox: toggles the active flag in extensions.json.
    For Chromium: cannot re-enable via file system (extension was removed).

    Params:
        browser: browser name
        extensionId: extension ID to enable
    """
    if not IS_WINDOWS:
        return {"success": False, "message": "Only available on Windows"}

    if not params or "browser" not in params or "extensionId" not in params:
        return {"success": False, "message": "browser and extensionId parameters are required"}

    browser = params["browser"]
    ext_id = params["extensionId"]

    if browser == "Firefox":
        return _toggle_firefox_extension(ext_id, enabled=True)
    else:
        return {
            "success": False,
            "message": "Chromium extensions cannot be re-enabled via file system. Please re-install from the Web Store.",
        }
