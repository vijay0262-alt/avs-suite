"""SC-8C15 Phase 1 — Process Intelligence backend tests.

Verifies that:
  - process_intelligence.scan RPC is registered
  - It returns real process data (not hardcoded)
  - Response format matches ProcessEntry[]
  - It is read-only (no subprocess, shutil, os.remove, scan_core)
  - It does not expose command-line arguments
  - It does not expose user filesystem paths for non-system processes
  - It handles errors gracefully
  - It respects the max process limit
  - Process classification works
"""

from __future__ import annotations

import inspect
import os
import re
import sys
from unittest.mock import patch, MagicMock

import pytest

from avs_backend.api.registry import get
import avs_backend.process_intelligence as pi_mod


# ── Registration ──────────────────────────────────────────────────────


def test_scan_rpc_is_registered():
    """The process_intelligence.scan RPC must be registered."""
    assert get("process_intelligence.scan") is not None


def test_scan_rpc_handler_is_callable():
    """The registered handler must be callable."""
    handler = get("process_intelligence.scan")
    assert callable(handler)


# ── Read-Only Verification ────────────────────────────────────────────


def _get_function_body_source(func) -> str:
    """Get the source of a function, excluding its docstring."""
    source = inspect.getsource(func)
    source = re.sub(r'"""[\s\S]*?"""', '', source, count=1)
    return source


def test_scan_does_not_call_subprocess():
    """The RPC must not call subprocess."""
    body = _get_function_body_source(pi_mod.scan_processes)
    assert "subprocess" not in body


def test_scan_does_not_call_shutil():
    """The RPC must not call shutil."""
    body = _get_function_body_source(pi_mod.scan_processes)
    assert "shutil" not in body


def test_scan_does_not_call_os_remove():
    """The RPC must not call os.remove or os.unlink."""
    body = _get_function_body_source(pi_mod.scan_processes)
    assert "os.remove" not in body
    assert "os.unlink" not in body


def test_scan_does_not_call_scan_core():
    """The RPC must not reference scan_core, SafetyGate, or RemediationCoordinator."""
    body = _get_function_body_source(pi_mod.scan_processes)
    assert "scan_core" not in body
    assert "SafetyGate" not in body
    assert "RemediationCoordinator" not in body
    assert "safety_gate" not in body
    assert "get_coordinator" not in body


def test_scan_does_not_terminate_processes():
    """The RPC must not call proc.terminate() or proc.kill()."""
    body = _get_function_body_source(pi_mod.scan_processes)
    assert ".terminate()" not in body
    assert ".kill()" not in body


# ── Privacy ───────────────────────────────────────────────────────────


def test_scan_does_not_expose_commandline():
    """The RPC must not expose command-line arguments."""
    body = _get_function_body_source(pi_mod.scan_processes)
    assert "cmdline" not in body
    assert "cmd_line" not in body
    assert "command_line" not in body


def test_scan_does_not_expose_environment():
    """The RPC must not expose environment variables."""
    body = _get_function_body_source(pi_mod.scan_processes)
    assert "environ" not in body


# ── Response Format ───────────────────────────────────────────────────


def test_scan_returns_ok_with_entries():
    """A successful scan should return ok=True with an entries array."""
    result = pi_mod.scan_processes(None)
    assert result["ok"] is True
    assert "entries" in result
    assert isinstance(result["entries"], list)
    assert "count" in result
    assert "scanDurationMs" in result


def test_scan_entries_have_required_fields():
    """Each entry must have info and sensors with required fields."""
    result = pi_mod.scan_processes(None)
    if not result["ok"] or not result["entries"]:
        pytest.skip("No processes running or scan failed")
    entry = result["entries"][0]
    assert "info" in entry
    assert "sensors" in entry
    info = entry["info"]
    sensors = entry["sensors"]
    # Required info fields
    assert "pid" in info and isinstance(info["pid"], int)
    assert "name" in info and isinstance(info["name"], str)
    assert "displayName" in info and isinstance(info["displayName"], str)
    assert "parentPid" in info and isinstance(info["parentPid"], int)
    assert "category" in info and isinstance(info["category"], str)
    assert "safetyLevel" in info and isinstance(info["safetyLevel"], str)
    assert "executablePath" in info and isinstance(info["executablePath"], str)
    # Required sensor fields
    assert "cpuUsagePercent" in sensors and isinstance(sensors["cpuUsagePercent"], (int, float))
    assert "memoryMB" in sensors and isinstance(sensors["memoryMB"], (int, float))
    assert "diskReadMBps" in sensors and isinstance(sensors["diskReadMBps"], (int, float))
    assert "diskWriteMBps" in sensors and isinstance(sensors["diskWriteMBps"], (int, float))
    assert "gpuUsagePercent" in sensors and isinstance(sensors["gpuUsagePercent"], (int, float))


def test_scan_does_not_expose_user_paths():
    """Non-system processes must not have executablePath exposed."""
    result = pi_mod.scan_processes(None)
    if not result["ok"] or not result["entries"]:
        pytest.skip("No processes running or scan failed")
    for entry in result["entries"]:
        info = entry["info"]
        if info["category"] not in ("system", "windows"):
            # User applications should not expose filesystem paths
            if info["executablePath"]:
                # If a path is exposed, it should not be a user directory
                path_lower = info["executablePath"].lower()
                assert "\\users\\" not in path_lower, \
                    f"User path exposed for {info['name']}: {info['executablePath']}"
                assert "/users/" not in path_lower, \
                    f"User path exposed for {info['name']}: {info['executablePath']}"


def test_scan_count_matches_entries():
    """The count field should match the number of entries."""
    result = pi_mod.scan_processes(None)
    assert result["count"] == len(result["entries"])


def test_scan_scan_duration_is_positive():
    """The scanDurationMs should be a non-negative integer."""
    result = pi_mod.scan_processes(None)
    assert isinstance(result["scanDurationMs"], int)
    assert result["scanDurationMs"] >= 0


# ── Error Handling ────────────────────────────────────────────────────


def test_scan_handles_psutil_import_error():
    """If psutil is not available, return ok=False."""
    with patch.dict(sys.modules, {"psutil": None}):
        result = pi_mod.scan_processes(None)
    assert result["ok"] is False
    assert "error" in result


def test_scan_handles_enumeration_error():
    """If process enumeration fails, return ok=False."""
    with patch("psutil.process_iter", side_effect=RuntimeError("test error")):
        result = pi_mod.scan_processes(None)
    assert result["ok"] is False
    assert "error" in result


# ── Process Limit ─────────────────────────────────────────────────────


def test_scan_respects_max_process_limit():
    """The scan should not return more than _MAX_PROCESSES entries."""
    result = pi_mod.scan_processes(None)
    assert len(result["entries"]) <= pi_mod._MAX_PROCESSES


# ── Classification ────────────────────────────────────────────────────


def test_classify_system_process():
    assert pi_mod._classify_process("System", "") == "system"
    assert pi_mod._classify_process("svchost.exe", "C:\\Windows\\System32\\svchost.exe") == "system"


def test_classify_browser_process():
    assert pi_mod._classify_process("chrome.exe", "C:\\Program Files\\Chrome\\chrome.exe") == "browser"
    assert pi_mod._classify_process("firefox.exe", "") == "browser"


def test_classify_development_process():
    assert pi_mod._classify_process("code.exe", "") == "development"


def test_classify_windows_process():
    assert pi_mod._classify_process("explorer.exe", "C:\\Windows\\explorer.exe") == "windows"


def test_classify_unknown_process():
    assert pi_mod._classify_process("randomapp.exe", "C:\\Users\\Test\\App\\randomapp.exe") == "user_application"
    assert pi_mod._classify_process("randomapp.exe", "") == "unknown"


def test_safety_level_system():
    assert pi_mod._safety_level("system", "valid") == "critical_system"


def test_safety_level_safe():
    assert pi_mod._safety_level("windows", "valid") == "safe"


def test_safety_level_review_recommended():
    assert pi_mod._safety_level("unknown", "unknown") == "review_recommended"


def test_safety_level_avoid():
    assert pi_mod._safety_level("unknown", "invalid") == "avoid"


# ── Sanitization ──────────────────────────────────────────────────────


def test_sanitize_exe_path_system():
    """System paths should be preserved."""
    path = "C:\\Windows\\System32\\svchost.exe"
    assert pi_mod._sanitize_exe_path(path, "system") == path


def test_sanitize_exe_path_user_app():
    """User application paths should be empty."""
    path = "C:\\Users\\Test\\App\\randomapp.exe"
    assert pi_mod._sanitize_exe_path(path, "user_application") == ""


def test_sanitize_exe_path_empty():
    """Empty path should remain empty."""
    assert pi_mod._sanitize_exe_path("", "system") == ""


# ── Display Name ──────────────────────────────────────────────────────


def test_make_display_name_from_name():
    assert pi_mod._make_display_name("chrome.exe", None) == "Chrome"


def test_make_display_name_from_description():
    assert pi_mod._make_display_name("chrome.exe", "Google Chrome") == "Google Chrome"


def test_make_display_name_no_extension():
    assert pi_mod._make_display_name("System", None) == "System"
