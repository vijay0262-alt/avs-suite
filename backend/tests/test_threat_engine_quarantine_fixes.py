"""Regression tests for threat_engine quarantine bug fixes.

Covers:
  1. cloud_reputation._is_trusted_path() correctly trusts well-known
     root-level Windows system executables (e.g. explorer.exe) that
     previously triggered repeated false-positive quarantine.
  2. quarantine_manager.quarantine_file() de-dupes by (original_path,
     sha256) instead of creating a new record every time the same
     locked/in-use file is re-detected.
  3. threat_engine._save_scan_history() writes atomically and recovers
     from a corrupted history file instead of crashing.
"""
from __future__ import annotations

import importlib
import json
import os

import pytest


@pytest.fixture(autouse=True)
def _isolated_data_dir(tmp_path, monkeypatch):
    """Redirect LOCALAPPDATA so tests never touch the real quarantine dir."""
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    yield


def _reload_quarantine_manager():
    import avs_backend.threat_engine.quarantine_manager as qm
    return importlib.reload(qm)


def _reload_cloud_reputation():
    import avs_backend.threat_engine.cloud_reputation as cr
    return importlib.reload(cr)


class TestTrustedSystemPaths:
    def test_explorer_exe_is_trusted(self):
        cr = _reload_cloud_reputation()
        assert cr._is_trusted_path(r"C:\Windows\explorer.exe") is True

    def test_explorer_exe_case_insensitive(self):
        cr = _reload_cloud_reputation()
        assert cr._is_trusted_path(r"c:\windows\EXPLORER.EXE") is True

    def test_notepad_exe_is_trusted(self):
        cr = _reload_cloud_reputation()
        assert cr._is_trusted_path(r"C:\Windows\notepad.exe") is True

    def test_random_windows_root_file_not_trusted(self):
        """Files dropped directly in C:\\Windows\\ that are NOT in the
        curated allowlist must still be scanned normally."""
        cr = _reload_cloud_reputation()
        assert cr._is_trusted_path(r"C:\Windows\totally_random_malware.exe") is False

    def test_system32_prefix_still_trusted(self):
        cr = _reload_cloud_reputation()
        assert cr._is_trusted_path(r"C:\Windows\System32\cmd.exe") is True


class TestQuarantineDeduplication:
    def test_duplicate_quarantine_does_not_create_new_entry(self, tmp_path):
        qm = _reload_quarantine_manager()

        src = tmp_path / "sample.exe"
        src.write_bytes(b"fake-binary-content")

        threat_info = {"detection_source": "HeuristicDetector", "name": "Test.Threat"}

        first = qm.quarantine_file(str(src), threat_info)
        assert first.get("quarantine_id")

        # Simulate the original file still existing (e.g. it was locked and
        # could not be deleted) and being re-detected on a second scan.
        src.write_bytes(b"fake-binary-content")

        second = qm.quarantine_file(str(src), threat_info)

        assert second.get("already_quarantined") is True
        assert second["quarantine_id"] == first["quarantine_id"]

        index = qm._load_index()
        assert len(index) == 1

    def test_different_content_creates_new_entry(self, tmp_path):
        qm = _reload_quarantine_manager()

        src = tmp_path / "sample2.exe"
        threat_info = {"detection_source": "HeuristicDetector", "name": "Test.Threat"}

        src.write_bytes(b"version-one")
        first = qm.quarantine_file(str(src), threat_info)
        assert first.get("quarantine_id")

        src.write_bytes(b"version-one")  # restore file for second quarantine
        src.write_bytes(b"version-two-different-content")
        second = qm.quarantine_file(str(src), threat_info)

        assert second.get("quarantine_id")
        assert second["quarantine_id"] != first["quarantine_id"]

        index = qm._load_index()
        assert len(index) == 2


class TestScanHistoryAtomicWrite:
    def test_save_scan_history_recovers_from_corruption(self, tmp_path, monkeypatch):
        import avs_backend.threat_engine as te
        importlib.reload(te)

        # Corrupt the history file with interleaved/invalid JSON.
        te._HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
        te._HISTORY_PATH.write_text("[]garbage-trailing-data", encoding="utf-8")

        scan = {
            "scan_type": "quick",
            "started_at": "2026-01-01T00:00:00Z",
            "completed_at": "2026-01-01T00:01:00Z",
            "files_scanned": 5,
            "threats_found": 0,
            "threats": [],
        }

        # Should not raise, and should reset to a valid single-entry history.
        te._save_scan_history("scan-1", scan)

        with open(te._HISTORY_PATH, "r", encoding="utf-8") as f:
            history = json.load(f)
        assert isinstance(history, list)
        assert len(history) == 1
        assert history[0]["scan_id"] == "scan-1"

    def test_save_scan_history_appends(self, tmp_path):
        import avs_backend.threat_engine as te
        importlib.reload(te)

        te._HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
        if te._HISTORY_PATH.exists():
            te._HISTORY_PATH.unlink()

        scan = {
            "scan_type": "quick",
            "started_at": "t0",
            "completed_at": "t1",
            "files_scanned": 1,
            "threats_found": 0,
            "threats": [],
        }
        te._save_scan_history("scan-a", dict(scan))
        te._save_scan_history("scan-b", dict(scan))

        with open(te._HISTORY_PATH, "r", encoding="utf-8") as f:
            history = json.load(f)
        assert [h["scan_id"] for h in history] == ["scan-a", "scan-b"]


class TestMemoryScannerInit:
    def test_memory_scanner_takes_no_config_arg(self):
        """Regression: MemoryScanner() must be constructible with no args.

        Previously called as MemoryScanner(config) from _execute_scan,
        raising TypeError and silently failing the memory scan phase
        on every full scan.
        """
        from avs_backend.threat_engine.memory_scanner import MemoryScanner
        scanner = MemoryScanner()
        assert scanner is not None


class TestFalsePositiveCleanup:
    def test_cleanup_removes_trusted_path_entries(self, tmp_path):
        qm = _reload_quarantine_manager()

        # Manually inject a bogus quarantine record for explorer.exe,
        # simulating the pre-fix corrupted state.
        index = qm._load_index()
        index["bogus-id"] = {
            "quarantine_id": "bogus-id",
            "original_path": r"C:\Windows\explorer.exe",
            "quarantine_path": str(qm._QUARANTINE_DIR / "bogus-id.bin"),
            "sha256": "deadbeef",
            "threat_name": "Heuristic.SuspiciousFile",
            "threat_info": {},
            "quarantine_date": "2026-01-01T00:00:00Z",
            "file_size": 0,
        }
        (qm._QUARANTINE_DIR / "bogus-id.bin").write_bytes(b"")
        qm._save_index(index)

        import avs_backend.threat_engine as te
        importlib.reload(te)
        result = te.threat_quarantine_cleanup_false_positives(None)

        assert result["success"] is True
        assert result["removed"] == 1

        remaining = qm._load_index()
        assert "bogus-id" not in remaining
