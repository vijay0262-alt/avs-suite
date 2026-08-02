"""Security Remediation backend module — quarantine, rollback, and restore.

Provides safe remediation actions for threats detected by the Security Center:
  - Quarantine: move suspicious files to a secure quarantine directory
  - Restore: move files back from quarantine
  - Delete: permanently remove quarantined files
  - Remediation plans: generate action plans for threats
  - Rollback: undo remediation actions

All file operations use atomic moves where possible and maintain a manifest
of quarantined items for audit and rollback.

RPC methods:
    security.quarantine           — quarantine a file (move to secure location)
    security.quarantine.restore   — restore a quarantined file
    security.quarantine.list      — list all quarantined items
    security.quarantine.delete    — permanently delete a quarantined item
    security.remediation.plan     — generate remediation plan for threats
    security.remediation.execute  — execute a remediation plan
    security.remediation.rollback — rollback a remediation action
"""

from __future__ import annotations

import json
import logging
import os
import platform
import shutil
import threading
import time
from datetime import datetime, timezone
from typing import Any

from avs_backend.api.registry import register

log = logging.getLogger("avs.remediation")

IS_WINDOWS = platform.system() == "Windows"

# Quarantine directory — stored in AppData/Local/AVS Shield/Quarantine
if IS_WINDOWS:
    _QUARANTINE_DIR = os.path.expandvars(r"%LOCALAPPDATA%\AVS Shield\Quarantine")
else:
    _QUARANTINE_DIR = os.path.expanduser("~/.avs-shield/quarantine")

_QUARANTINE_MANIFEST = os.path.join(_QUARANTINE_DIR, "manifest.json")
_quarantine_lock = threading.Lock()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_quarantine_dir() -> None:
    os.makedirs(_QUARANTINE_DIR, exist_ok=True)


def _load_manifest() -> dict[str, Any]:
    """Load the quarantine manifest."""
    try:
        with open(_QUARANTINE_MANIFEST, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, ValueError):
        return {"items": []}


def _save_manifest(manifest: dict[str, Any]) -> None:
    """Save the quarantine manifest."""
    _ensure_quarantine_dir()
    with open(_QUARANTINE_MANIFEST, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)


def _generate_quarantine_id() -> str:
    return f"q-{int(time.time())}-{hash(str(time.time())) % 10000:04d}"


# =====================================================================
# RPC Methods
# =====================================================================

@register("security.quarantine")
def quarantine_file(params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Quarantine a file — move it to a secure quarantine directory.

    Params:
        filePath: str — path to the file to quarantine
        threatId: str — optional threat ID for tracking
        reason: str — optional reason for quarantine

    Returns quarantine ID and status.
    """
    if not params or "filePath" not in params:
        return {"error": "Missing filePath", "quarantined": False}

    file_path = params["filePath"]
    threat_id = params.get("threatId", "")
    reason = params.get("reason", "")

    if not os.path.isfile(file_path):
        return {"error": f"File not found: {file_path}", "quarantined": False}

    with _quarantine_lock:
        _ensure_quarantine_dir()
        q_id = _generate_quarantine_id()
        q_filename = f"{q_id}_{os.path.basename(file_path)}"
        q_path = os.path.join(_QUARANTINE_DIR, q_filename)

        try:
            # Move the file to quarantine
            shutil.move(file_path, q_path)

            # Record in manifest
            manifest = _load_manifest()
            item = {
                "quarantineId": q_id,
                "originalPath": file_path,
                "quarantinePath": q_path,
                "threatId": threat_id,
                "reason": reason,
                "quarantinedAt": _now_iso(),
                "fileSize": os.path.getsize(q_path),
                "restored": False,
            }
            manifest["items"].append(item)
            _save_manifest(manifest)

            log.info("Quarantined file %s -> %s (id=%s)", file_path, q_path, q_id)
            return {
                "quarantineId": q_id,
                "quarantined": True,
                "originalPath": file_path,
                "quarantinePath": q_path,
                "timestamp": _now_iso(),
            }
        except (OSError, PermissionError) as e:
            log.warning("Failed to quarantine %s: %s", file_path, e)
            return {"error": str(e), "quarantined": False}


@register("security.quarantine.restore")
def restore_quarantined(params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Restore a file from quarantine back to its original location.

    Params:
        quarantineId: str — the quarantine ID to restore
    """
    if not params or "quarantineId" not in params:
        return {"error": "Missing quarantineId", "restored": False}

    q_id = params["quarantineId"]

    with _quarantine_lock:
        manifest = _load_manifest()
        item = None
        for it in manifest["items"]:
            if it["quarantineId"] == q_id and not it.get("restored", False):
                item = it
                break

        if not item:
            return {"error": "Quarantine item not found or already restored", "restored": False}

        q_path = item["quarantinePath"]
        original_path = item["originalPath"]

        if not os.path.isfile(q_path):
            return {"error": "Quarantined file no longer exists", "restored": False}

        try:
            # Ensure original directory exists
            os.makedirs(os.path.dirname(original_path), exist_ok=True)
            shutil.move(q_path, original_path)
            item["restored"] = True
            item["restoredAt"] = _now_iso()
            _save_manifest(manifest)

            log.info("Restored file %s -> %s (id=%s)", q_path, original_path, q_id)
            return {
                "quarantineId": q_id,
                "restored": True,
                "originalPath": original_path,
                "timestamp": _now_iso(),
            }
        except (OSError, PermissionError) as e:
            log.warning("Failed to restore %s: %s", q_id, e)
            return {"error": str(e), "restored": False}


@register("security.quarantine.list")
def list_quarantined(_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """List all quarantined items."""
    with _quarantine_lock:
        manifest = _load_manifest()
    items = [it for it in manifest["items"] if not it.get("restored", False)]
    return {
        "items": items,
        "count": len(items),
        "totalItems": len(manifest["items"]),
        "capturedAt": _now_iso(),
    }


@register("security.quarantine.delete")
def delete_quarantined(params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Permanently delete a quarantined file.

    Params:
        quarantineId: str — the quarantine ID to delete
    """
    if not params or "quarantineId" not in params:
        return {"error": "Missing quarantineId", "deleted": False}

    q_id = params["quarantineId"]

    with _quarantine_lock:
        manifest = _load_manifest()
        item = None
        for it in manifest["items"]:
            if it["quarantineId"] == q_id:
                item = it
                break

        if not item:
            return {"error": "Quarantine item not found", "deleted": False}

        q_path = item["quarantinePath"]
        try:
            if os.path.isfile(q_path):
                os.remove(q_path)
            item["deleted"] = True
            item["deletedAt"] = _now_iso()
            _save_manifest(manifest)

            log.info("Deleted quarantined file %s (id=%s)", q_path, q_id)
            return {
                "quarantineId": q_id,
                "deleted": True,
                "timestamp": _now_iso(),
            }
        except (OSError, PermissionError) as e:
            return {"error": str(e), "deleted": False}


@register("security.remediation.plan")
def generate_remediation_plan(params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Generate a remediation plan for a set of threats.

    Params:
        threats: list[dict] — list of threat objects with id, type, filePath, severity

    Returns a plan with ordered actions.
    """
    if not params or "threats" not in params:
        return {"error": "Missing threats", "plan": None}

    threats = params["threats"]
    actions: list[dict[str, Any]] = []

    for i, threat in enumerate(threats):
        threat_id = threat.get("id", f"threat-{i}")
        severity = threat.get("severity", "medium")
        file_path = threat.get("filePath", "")
        threat_type = threat.get("type", "unknown")

        if file_path and os.path.isfile(file_path):
            actions.append({
                "actionId": f"action-{i}",
                "threatId": threat_id,
                "type": "quarantine",
                "target": file_path,
                "severity": severity,
                "threatType": threat_type,
                "description": f"Quarantine {threat_type} threat: {os.path.basename(file_path)}",
                "reversible": True,
                "priority": 1 if severity == "high" else 2 if severity == "medium" else 3,
            })
        else:
            actions.append({
                "actionId": f"action-{i}",
                "threatId": threat_id,
                "type": "alert",
                "target": file_path or threat_id,
                "severity": severity,
                "threatType": threat_type,
                "description": f"Alert: {threat_type} threat detected (no file to quarantine)",
                "reversible": False,
                "priority": 3,
            })

    # Sort by priority
    actions.sort(key=lambda a: a["priority"])

    return {
        "planId": f"plan-{int(time.time())}",
        "actions": actions,
        "totalActions": len(actions),
        "generatedAt": _now_iso(),
    }


@register("security.remediation.execute")
def execute_remediation_plan(params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Execute a remediation plan.

    Params:
        plan: dict — the remediation plan with actions
        actions: list[str] — optional list of actionIds to execute (default: all)

    Returns execution results.
    """
    if not params or "plan" not in params:
        return {"error": "Missing plan", "executed": False}

    plan = params["plan"]
    selected_action_ids = params.get("actionIds", [])
    actions = plan.get("actions", [])

    results: list[dict[str, Any]] = []
    executed = 0
    failed = 0

    for action in actions:
        if selected_action_ids and action["actionId"] not in selected_action_ids:
            continue

        if action["type"] == "quarantine":
            result = quarantine_file({
                "filePath": action["target"],
                "threatId": action.get("threatId", ""),
                "reason": action.get("description", ""),
            })
            if result.get("quarantined"):
                executed += 1
                results.append({
                    "actionId": action["actionId"],
                    "status": "success",
                    "quarantineId": result.get("quarantineId"),
                })
            else:
                failed += 1
                results.append({
                    "actionId": action["actionId"],
                    "status": "failed",
                    "error": result.get("error", "Unknown error"),
                })
        else:
            results.append({
                "actionId": action["actionId"],
                "status": "skipped",
                "reason": f"Action type '{action['type']}' not executable",
            })

    return {
        "planId": plan.get("planId", ""),
        "executed": executed,
        "failed": failed,
        "skipped": len(results) - executed - failed,
        "results": results,
        "timestamp": _now_iso(),
    }


@register("security.remediation.rollback")
def rollback_remediation(params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Rollback a remediation action by restoring quarantined files.

    Params:
        quarantineIds: list[str] — list of quarantine IDs to restore
    """
    if not params or "quarantineIds" not in params:
        return {"error": "Missing quarantineIds", "rolledBack": False}

    q_ids = params["quarantineIds"]
    results: list[dict[str, Any]] = []
    restored = 0

    for q_id in q_ids:
        result = restore_quarantined({"quarantineId": q_id})
        if result.get("restored"):
            restored += 1
            results.append({
                "quarantineId": q_id,
                "status": "restored",
                "originalPath": result.get("originalPath", ""),
            })
        else:
            results.append({
                "quarantineId": q_id,
                "status": "failed",
                "error": result.get("error", "Unknown error"),
            })

    return {
        "restored": restored,
        "total": len(q_ids),
        "results": results,
        "timestamp": _now_iso(),
    }
