"""SC-8C14 Phase 3 — Canonical quarantine_list RPC tests.

Verifies that:
  - scan_core.security_remediation.quarantine_list is registered
  - It is read-only (does not mutate the manifest)
  - It returns privacy-safe fields (no quarantinePath, originalPath, etc.)
  - It handles empty/missing/malformed manifests
  - It does not call executors, subprocess, or shutil
"""

from __future__ import annotations

import inspect
import json
import os
import tempfile
from typing import Any
from unittest.mock import patch

import pytest

from avs_backend.api.registry import all_methods, get
import avs_backend.scan_core_rpc as scan_core_rpc


# ── Registration ───────────────────────────────────────────────────────


def test_quarantine_list_rpc_is_registered():
    """The canonical quarantine_list RPC must be registered."""
    assert get("scan_core.security_remediation.quarantine_list") is not None


def test_old_security_quarantine_list_rpc_is_removed():
    """The transitional security.quarantine.list RPC must be removed."""
    assert get("security.quarantine.list") is None


def _get_function_body_source(func) -> str:
    """Get the source of a function, excluding its docstring."""
    source = inspect.getsource(func)
    # Remove the docstring (everything between triple quotes)
    import re
    source = re.sub(r'"""[\s\S]*?"""', '', source, count=1)
    return source


# ── Read-Only ──────────────────────────────────────────────────────────


def test_quarantine_list_does_not_call_subprocess():
    """The RPC must not call subprocess."""
    body = _get_function_body_source(scan_core_rpc._scan_core_security_remediation_quarantine_list)
    assert "subprocess" not in body


def test_quarantine_list_does_not_call_shutil():
    """The RPC must not call shutil."""
    body = _get_function_body_source(scan_core_rpc._scan_core_security_remediation_quarantine_list)
    assert "shutil" not in body


def test_quarantine_list_does_not_call_os_remove():
    """The RPC must not call os.remove or os.unlink."""
    body = _get_function_body_source(scan_core_rpc._scan_core_security_remediation_quarantine_list)
    assert "os.remove" not in body
    assert "os.unlink" not in body


def test_quarantine_list_does_not_call_coordinator():
    """The RPC must not call RemediationCoordinator."""
    body = _get_function_body_source(scan_core_rpc._scan_core_security_remediation_quarantine_list)
    assert "get_coordinator" not in body
    assert "RemediationCoordinator" not in body


def test_quarantine_list_does_not_call_safety_gate():
    """The RPC must not call SafetyGate."""
    body = _get_function_body_source(scan_core_rpc._scan_core_security_remediation_quarantine_list)
    assert "SafetyGate" not in body
    assert "safety_gate" not in body


# ── Privacy ────────────────────────────────────────────────────────────


def test_quarantine_list_response_has_no_quarantine_path():
    """The RPC response must not expose quarantinePath."""
    with patch.object(scan_core_rpc, "_QUARANTINE_MANIFEST_CANONICAL", "/nonexistent/manifest.json"):
        result = scan_core_rpc._scan_core_security_remediation_quarantine_list(None)
    assert result["ok"] is True
    for item in result.get("items", []):
        assert "quarantinePath" not in item
        assert "originalPath" not in item
        assert "asset_id" not in item
        assert "backup_location" not in item
        assert "canonical_path" not in item


def test_quarantine_list_response_has_safe_fields_only():
    """The RPC response must only contain display-oriented fields."""
    with patch.object(scan_core_rpc, "_QUARANTINE_MANIFEST_CANONICAL", "/nonexistent/manifest.json"):
        result = scan_core_rpc._scan_core_security_remediation_quarantine_list(None)
    assert result["ok"] is True
    # Top-level fields
    assert "ok" in result
    assert "items" in result
    assert "count" in result
    assert "totalItems" in result
    assert "capturedAt" in result
    # If there are items, check their fields
    for item in result.get("items", []):
        allowed = {
            "id",
            "displayName",
            "status",
            "detectedAt",
            "threatType",
            "severity",
            "size",
            "rollbackAvailable",
            "detectionReason",
        }
        assert set(item.keys()).issubset(allowed), f"Unexpected fields: {set(item.keys()) - allowed}"


# ── Manifest Handling ──────────────────────────────────────────────────


@pytest.fixture
def temp_manifest(tmp_path: Any) -> str:
    """Create a temporary manifest file and return its path."""
    manifest_path = os.path.join(str(tmp_path), "manifest.json")
    return manifest_path


def test_quarantine_list_empty_manifest(temp_manifest: str):
    """An empty manifest should return zero items."""
    with open(temp_manifest, "w", encoding="utf-8") as f:
        json.dump({"items": []}, f)
    with patch.object(scan_core_rpc, "_QUARANTINE_MANIFEST_CANONICAL", temp_manifest):
        result = scan_core_rpc._scan_core_security_remediation_quarantine_list(None)
    assert result["ok"] is True
    assert result["count"] == 0
    assert result["totalItems"] == 0
    assert result["items"] == []


def test_quarantine_list_missing_manifest():
    """A missing manifest should return zero items (tolerant)."""
    with patch.object(scan_core_rpc, "_QUARANTINE_MANIFEST_CANONICAL", "/nonexistent/path/manifest.json"):
        result = scan_core_rpc._scan_core_security_remediation_quarantine_list(None)
    assert result["ok"] is True
    assert result["count"] == 0
    assert result["totalItems"] == 0


def test_quarantine_list_malformed_manifest(tmp_path: Any):
    """A malformed manifest should return zero items (tolerant)."""
    manifest_path = os.path.join(str(tmp_path), "manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        f.write("{invalid json")
    with patch.object(scan_core_rpc, "_QUARANTINE_MANIFEST_CANONICAL", manifest_path):
        result = scan_core_rpc._scan_core_security_remediation_quarantine_list(None)
    assert result["ok"] is True
    assert result["count"] == 0
    assert result["totalItems"] == 0


def test_quarantine_list_valid_manifest(temp_manifest: str):
    """A valid manifest should return sanitized items."""
    with open(temp_manifest, "w", encoding="utf-8") as f:
        json.dump(
            {
                "items": [
                    {
                        "quarantineId": "q-1",
                        "originalPath": "C:\\Users\\Test\\Downloads\\evil.exe",
                        "quarantinePath": "C:\\Quarantine\\q-1_evil.exe",
                        "threatId": "threat-1",
                        "reason": "Spyware detected",
                        "quarantinedAt": "2024-01-01T00:00:00Z",
                        "fileSize": 1024,
                        "restored": False,
                    },
                    {
                        "quarantineId": "q-2",
                        "originalPath": "C:\\Users\\Test\\Downloads\\adware.exe",
                        "quarantinePath": "C:\\Quarantine\\q-2_adware.exe",
                        "threatId": "threat-2",
                        "reason": "Adware",
                        "quarantinedAt": "2024-01-02T00:00:00Z",
                        "fileSize": 2048,
                        "restored": True,
                    },
                ]
            },
            f,
        )
    with patch.object(scan_core_rpc, "_QUARANTINE_MANIFEST_CANONICAL", temp_manifest):
        result = scan_core_rpc._scan_core_security_remediation_quarantine_list(None)
    assert result["ok"] is True
    assert result["totalItems"] == 2
    assert result["count"] == 1  # only non-restored
    # Check first item (active)
    item0 = result["items"][0]
    assert item0["id"] == "q-1"
    assert item0["displayName"] == "evil.exe"
    assert item0["status"] == "quarantined"
    assert item0["size"] == 1024
    assert item0["rollbackAvailable"] is True
    assert item0["detectionReason"] == "Spyware detected"
    # Privacy: no paths
    assert "quarantinePath" not in item0
    assert "originalPath" not in item0
    # Check second item (restored)
    item1 = result["items"][1]
    assert item1["id"] == "q-2"
    assert item1["status"] == "restored"
    assert item1["rollbackAvailable"] is False


def test_quarantine_list_invalid_entries_skipped(temp_manifest: str):
    """Invalid entries (missing quarantineId) should be skipped."""
    with open(temp_manifest, "w", encoding="utf-8") as f:
        json.dump(
            {
                "items": [
                    {"quarantineId": "q-valid", "originalPath": "C:\\test.exe", "restored": False},
                    {"quarantineId": "", "originalPath": "C:\\invalid.exe"},  # empty ID
                    {"originalPath": "C:\\noid.exe"},  # no ID
                    "not-a-dict",  # not a dict
                ]
            },
            f,
        )
    with patch.object(scan_core_rpc, "_QUARANTINE_MANIFEST_CANONICAL", temp_manifest):
        result = scan_core_rpc._scan_core_security_remediation_quarantine_list(None)
    assert result["ok"] is True
    assert result["totalItems"] == 1
    assert result["items"][0]["id"] == "q-valid"


def test_quarantine_list_deleted_entry(temp_manifest: str):
    """Deleted entries should have status 'deleted'."""
    with open(temp_manifest, "w", encoding="utf-8") as f:
        json.dump(
            {
                "items": [
                    {
                        "quarantineId": "q-deleted",
                        "originalPath": "C:\\deleted.exe",
                        "fileSize": 100,
                        "restored": False,
                        "deleted": True,
                    },
                ]
            },
            f,
        )
    with patch.object(scan_core_rpc, "_QUARANTINE_MANIFEST_CANONICAL", temp_manifest):
        result = scan_core_rpc._scan_core_security_remediation_quarantine_list(None)
    assert result["ok"] is True
    assert result["items"][0]["status"] == "deleted"
    assert result["items"][0]["rollbackAvailable"] is False


def test_quarantine_list_is_read_only(temp_manifest: str):
    """The RPC must not modify the manifest file."""
    original_data = {
        "items": [
            {
                "quarantineId": "q-1",
                "originalPath": "C:\\test.exe",
                "quarantinePath": "C:\\Quarantine\\q-1_test.exe",
                "fileSize": 100,
                "restored": False,
            }
        ]
    }
    with open(temp_manifest, "w", encoding="utf-8") as f:
        json.dump(original_data, f)

    with patch.object(scan_core_rpc, "_QUARANTINE_MANIFEST_CANONICAL", temp_manifest):
        scan_core_rpc._scan_core_security_remediation_quarantine_list(None)

    # Verify manifest was not modified
    with open(temp_manifest, "r", encoding="utf-8") as f:
        after = json.load(f)
    assert after == original_data


# ── Module-Level Safety ────────────────────────────────────────────────


def test_security_remediation_module_has_no_list_quarantined():
    """The old security_remediation module should not have list_quarantined."""
    from avs_backend.security_remediation import __init__ as sec_rem

    assert not hasattr(sec_rem, "list_quarantined")


def test_security_remediation_module_preserves_active_rpcs():
    """The security_remediation module should still register active RPCs."""
    assert get("security.enableSmartScreen") is not None
    assert get("security.enableDefender") is not None
    assert get("security.enableFirewall") is not None
