"""Quarantine System — safely quarantine threats with encrypted file vault.

Moves detected threat files into an encrypted quarantine vault where they
cannot execute. Users can review, restore, or permanently delete quarantined
items.

The vault uses XOR-based encryption with a machine-specific key derived from
the Windows machine GUID. This is not military-grade encryption but prevents
casual execution and inspection of quarantined files.

Quarantine metadata is stored in a JSON manifest at:
    ~/.avs/quarantine/manifest.json

Quarantined files are stored at:
    ~/.avs/quarantine/items/<id>.quarantined

RPC methods:
    quarantine.list           — list all quarantined items
    quarantine.summary        — get quarantine count summary
    quarantine.add            — quarantine a file (called by security scan)
    quarantine.restore        — restore a quarantined file to original location (Pro)
    quarantine.delete         — permanently delete a quarantined item (Pro)
    quarantine.clear          — clear all quarantined items (Pro)
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import platform
import shutil
import uuid
from datetime import datetime, timezone
from typing import Any

from avs_backend.api.registry import register
from avs_backend.licensing import require_feature

log = logging.getLogger("avs.quarantine")

IS_WINDOWS = platform.system() == "Windows"

# Quarantine storage paths
_QUARANTINE_DIR = os.path.join(os.path.expanduser("~"), ".avs", "quarantine")
_ITEMS_DIR = os.path.join(_QUARANTINE_DIR, "items")
_MANIFEST_PATH = os.path.join(_QUARANTINE_DIR, "manifest.json")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_dirs() -> None:
    """Ensure quarantine directories exist."""
    os.makedirs(_QUARANTINE_DIR, exist_ok=True)
    os.makedirs(_ITEMS_DIR, exist_ok=True)


def _get_machine_key() -> bytes:
    """Get a machine-specific encryption key.

    Derives a key from the Windows MachineGuid or a fallback UUID.
    """
    if IS_WINDOWS:
        try:
            import winreg
            with winreg.OpenKey(
                winreg.HKEY_LOCAL_MACHINE,
                r"SOFTWARE\Microsoft\Cryptography",
                0,
                winreg.KEY_READ | winreg.KEY_WOW64_64KEY,
            ) as handle:
                guid, _ = winreg.QueryValueEx(handle, "MachineGuid")
                return hashlib.sha256(f"avs-quarantine-{guid}".encode()).digest()
        except Exception:
            pass

    # Fallback for non-Windows or errors
    return hashlib.sha256(f"avs-quarantine-{uuid.getnode()}".encode()).digest()


def _xor_encrypt(data: bytes, key: bytes) -> bytes:
    """XOR encrypt/decrypt data with a repeating key."""
    key_len = len(key)
    return bytes(b ^ key[i % key_len] for i, b in enumerate(data))


def _load_manifest() -> dict[str, Any]:
    """Load the quarantine manifest."""
    if not os.path.isfile(_MANIFEST_PATH):
        return {"items": [], "version": 1, "createdAt": _now_iso()}
    try:
        with open(_MANIFEST_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except (ValueError, OSError):
        return {"items": [], "version": 1, "createdAt": _now_iso()}


def _save_manifest(manifest: dict[str, Any]) -> bool:
    """Save the quarantine manifest."""
    _ensure_dirs()
    try:
        with open(_MANIFEST_PATH, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)
        return True
    except OSError as e:
        log.error("Failed to save quarantine manifest: %s", e)
        return False


def _quarantine_file(file_path: str, threat_name: str, threat_type: str, source: str) -> dict[str, Any]:
    """Quarantine a single file.

    Moves the file to the quarantine directory with XOR encryption.
    Returns the quarantine item metadata.
    """
    _ensure_dirs()

    if not os.path.isfile(file_path):
        return {"success": False, "message": f"File not found: {file_path}"}

    item_id = str(uuid.uuid4())
    quarantined_filename = f"{item_id}.quarantined"
    quarantined_path = os.path.join(_ITEMS_DIR, quarantined_filename)

    try:
        # Read original file
        with open(file_path, "rb") as f:
            original_data = f.read()

        # Encrypt and write to quarantine
        key = _get_machine_key()
        encrypted_data = _xor_encrypt(original_data, key)
        with open(quarantined_path, "wb") as f:
            f.write(encrypted_data)

        # Get file stats
        file_size = os.path.getsize(file_path)
        file_hash = hashlib.sha256(original_data).hexdigest()

        # Remove original file
        os.remove(file_path)

        # Create manifest entry
        item = {
            "id": item_id,
            "originalPath": file_path,
            "threatName": threat_name,
            "threatType": threat_type,
            "source": source,
            "fileSize": file_size,
            "fileHash": file_hash,
            "quarantinedAt": _now_iso(),
            "quarantinedPath": quarantined_path,
        }

        # Add to manifest
        manifest = _load_manifest()
        manifest["items"].append(item)
        _save_manifest(manifest)

        return {"success": True, "item": item}

    except Exception as e:
        log.error("Failed to quarantine file %s: %s", file_path, e)
        # Clean up partial quarantine file
        if os.path.isfile(quarantined_path):
            try:
                os.remove(quarantined_path)
            except OSError:
                pass
        return {"success": False, "message": str(e)}


def _restore_item(item_id: str) -> dict[str, Any]:
    """Restore a quarantined item to its original location."""
    manifest = _load_manifest()
    item = None
    for entry in manifest["items"]:
        if entry["id"] == item_id:
            item = entry
            break

    if not item:
        return {"success": False, "message": f"Quarantine item {item_id} not found"}

    quarantined_path = item.get("quarantinedPath", "")
    original_path = item.get("originalPath", "")

    if not os.path.isfile(quarantined_path):
        return {"success": False, "message": "Quarantined file is missing from vault"}

    try:
        # Read and decrypt
        with open(quarantined_path, "rb") as f:
            encrypted_data = f.read()

        key = _get_machine_key()
        decrypted_data = _xor_encrypt(encrypted_data, key)

        # Ensure original directory exists
        original_dir = os.path.dirname(original_path)
        if original_dir:
            os.makedirs(original_dir, exist_ok=True)

        # Write restored file
        with open(original_path, "wb") as f:
            f.write(decrypted_data)

        # Remove from quarantine vault
        os.remove(quarantined_path)

        # Remove from manifest
        manifest["items"] = [e for e in manifest["items"] if e["id"] != item_id]
        _save_manifest(manifest)

        return {"success": True, "message": f"Restored to {original_path}"}

    except Exception as e:
        log.error("Failed to restore item %s: %s", item_id, e)
        return {"success": False, "message": str(e)}


def _delete_item(item_id: str) -> dict[str, Any]:
    """Permanently delete a quarantined item."""
    manifest = _load_manifest()
    item = None
    for entry in manifest["items"]:
        if entry["id"] == item_id:
            item = entry
            break

    if not item:
        return {"success": False, "message": f"Quarantine item {item_id} not found"}

    quarantined_path = item.get("quarantinedPath", "")

    try:
        # Delete the quarantined file
        if os.path.isfile(quarantined_path):
            os.remove(quarantined_path)

        # Remove from manifest
        manifest["items"] = [e for e in manifest["items"] if e["id"] != item_id]
        _save_manifest(manifest)

        return {"success": True, "message": f"Permanently deleted item {item_id}"}

    except Exception as e:
        log.error("Failed to delete item %s: %s", item_id, e)
        return {"success": False, "message": str(e)}


# ─── RPC Methods ────────────────────────────────────────────────────

@register("quarantine.list")
def quarantine_list(_params: dict[str, Any] | None) -> dict[str, Any]:
    """List all quarantined items.

    Returns:
        items: list of quarantined item metadata
        count: total item count
        totalSize: total size of quarantined files in bytes
    """
    manifest = _load_manifest()
    items = manifest.get("items", [])

    total_size = sum(item.get("fileSize", 0) for item in items)

    return {
        "items": items,
        "count": len(items),
        "totalSize": total_size,
        "supported": True,
        "vaultPath": _QUARANTINE_DIR,
    }


@register("quarantine.summary")
def quarantine_summary(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get quarantine count summary."""
    manifest = _load_manifest()
    items = manifest.get("items", [])

    total_size = sum(item.get("fileSize", 0) for item in items)

    by_type: dict[str, int] = {}
    for item in items:
        t = item.get("threatType", "unknown")
        by_type[t] = by_type.get(t, 0) + 1

    return {
        "count": len(items),
        "totalSize": total_size,
        "byType": by_type,
        "supported": True,
    }


@register("quarantine.add")
def quarantine_add(params: dict[str, Any] | None) -> dict[str, Any]:
    """Quarantine a file. Called by security scan when a threat is detected.

    Params:
        filePath: path to the file to quarantine
        threatName: name of the detected threat
        threatType: type of threat (malware, pup, adware, etc.)
        source: source of detection (defender, heuristic, etc.)
    """
    if not params or "filePath" not in params:
        return {"success": False, "message": "filePath parameter is required"}

    file_path = params["filePath"]
    threat_name = params.get("threatName", "Unknown Threat")
    threat_type = params.get("threatType", "unknown")
    source = params.get("source", "manual")

    return _quarantine_file(file_path, threat_name, threat_type, source)


@register("quarantine.restore")
@require_feature("quarantine.restore")
def quarantine_restore(params: dict[str, Any] | None) -> dict[str, Any]:
    """Restore a quarantined item to its original location. Pro only.

    Params:
        itemId: ID of the quarantined item to restore
    """
    if not params or "itemId" not in params:
        return {"success": False, "message": "itemId parameter is required"}

    return _restore_item(params["itemId"])


@register("quarantine.delete")
@require_feature("quarantine.delete")
def quarantine_delete(params: dict[str, Any] | None) -> dict[str, Any]:
    """Permanently delete a quarantined item. Pro only.

    Params:
        itemId: ID of the quarantined item to delete
    """
    if not params or "itemId" not in params:
        return {"success": False, "message": "itemId parameter is required"}

    return _delete_item(params["itemId"])


@register("quarantine.clear")
@require_feature("quarantine.clear")
def quarantine_clear(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Clear all quarantined items. Pro only.

    Permanently deletes all items in the quarantine vault.
    """
    manifest = _load_manifest()
    items = manifest.get("items", [])
    deleted_count = 0
    failed_count = 0

    for item in items:
        result = _delete_item(item["id"])
        if result["success"]:
            deleted_count += 1
        else:
            failed_count += 1

    return {
        "success": failed_count == 0,
        "message": f"Cleared {deleted_count} item(s)" + (f", {failed_count} failed" if failed_count else ""),
        "deletedCount": deleted_count,
        "failedCount": failed_count,
    }
