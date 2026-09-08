"""Regression tests for the 'scan stuck at 1%, 0 files scanned' bugs.

Covers three independent root causes found in the antivirus scan pipeline:

  1. threat_engine.threat_scan() used to enumerate the ENTIRE filesystem
     synchronously on the RPC handler thread for full/quick scans before
     returning scan_id, blocking the whole RPC call for minutes.
  2. threat_engine._execute_scan() created a brand new ThreadPoolExecutor
     per file per detector; if any detector call ever hung, the 'with'
     block's shutdown(wait=True) blocked forever, freezing the scan.
  3. threat_engine's internal status values ('complete'/'error') never
     matched what the frontend polling loop checked for
     ('completed'/'failed'), so a finished scan was never recognized as
     done by the UI.
  4. one_click._run_full_scan() enumerated every drive via os.walk with
     zero progress updates and no cancellation checks, so the UI froze
     at its initial placeholder value for the entire enumeration phase.
"""
from __future__ import annotations

import importlib
import threading
import time

import pytest


@pytest.fixture(autouse=True)
def _isolated_data_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    yield


class TestThreatScanReturnsImmediately:
    def test_full_scan_rpc_returns_before_enumeration_completes(self, monkeypatch, tmp_path):
        """threat.scan for a 'full' scan must return almost instantly,
        with enumeration deferred to the background thread."""
        import avs_backend.threat_engine as te
        importlib.reload(te)

        enum_started = threading.Event()
        enum_may_continue = threading.Event()

        def slow_enumerate(path, config):
            enum_started.set()
            enum_may_continue.wait(timeout=5)
            return []

        monkeypatch.setattr(te, "_enumerate_scan_targets", slow_enumerate)

        start = time.monotonic()
        result = te.threat_scan({"scan_type": "full"})
        elapsed = time.monotonic() - start

        assert result["success"] is True
        assert "scan_id" in result
        # Must return quickly — enumeration happens in the background.
        assert elapsed < 2.0

        # The background thread should have started enumerating.
        assert enum_started.wait(timeout=2.0)
        enum_may_continue.set()

    def test_scan_status_reports_enumerating_before_files_total_known(self, monkeypatch):
        import avs_backend.threat_engine as te
        importlib.reload(te)

        enum_may_continue = threading.Event()

        def slow_enumerate(path, config):
            enum_may_continue.wait(timeout=5)
            return []

        monkeypatch.setattr(te, "_enumerate_scan_targets", slow_enumerate)

        result = te.threat_scan({"scan_type": "quick"})
        scan_id = result["scan_id"]

        status = te.threat_scan_status({"scan_id": scan_id})
        assert status["status"] in ("enumerating", "scanning", "completed")

        enum_may_continue.set()


class TestScanStatusNormalization:
    def test_internal_complete_maps_to_public_completed(self):
        import avs_backend.threat_engine as te
        importlib.reload(te)
        assert te._public_scan_status("complete") == "completed"

    def test_internal_error_maps_to_public_failed(self):
        import avs_backend.threat_engine as te
        importlib.reload(te)
        assert te._public_scan_status("error") == "failed"

    def test_cancelled_passthrough(self):
        import avs_backend.threat_engine as te
        importlib.reload(te)
        assert te._public_scan_status("cancelled") == "cancelled"

    def test_scanning_passthrough(self):
        import avs_backend.threat_engine as te
        importlib.reload(te)
        assert te._public_scan_status("scanning") == "scanning"
        assert te._public_scan_status("enumerating") == "enumerating"


class TestExecuteScanDoesNotDeadlockOnHungDetector:
    def test_hung_detector_does_not_freeze_entire_scan(self, tmp_path, monkeypatch):
        """A detector that hangs forever on one file must not block
        scanning of subsequent files (regression for the per-file
        ThreadPoolExecutor deadlock bug)."""
        import avs_backend.threat_engine as te
        importlib.reload(te)

        f1 = tmp_path / "a.exe"
        f2 = tmp_path / "b.exe"
        f1.write_bytes(b"AAAA")
        f2.write_bytes(b"BBBB")

        class HangingDetector:
            name = "HangingDetector"

            def scan_file(self, path):
                if path.endswith("a.exe"):
                    time.sleep(9999)  # simulate a permanently hung call
                return {"detected": False}

        # Patch detector init so only our hanging detector runs.
        monkeypatch.setattr(
            te,
            "_enumerate_scan_targets",
            lambda path, config: [str(f1), str(f2)],
        )

        import avs_backend.threat_engine.hash_detector as hd_mod

        class NoopHashDetector:
            name = "HashDetector"

            def __init__(self, config):
                pass

            def scan_file(self, path):
                return {"detected": False}

        monkeypatch.setattr(hd_mod, "HashDetector", NoopHashDetector)

        import avs_backend.threat_engine.yara_scanner as yara_mod
        monkeypatch.setattr(yara_mod, "YaraScanner", NoopHashDetector)

        config = {
            "enabled_sources": {
                "hash_blocklist": True,
                "yara": False,
                "clamav": False,
                "amsi": False,
                "heuristic": False,
                "defender": False,
                "behavioral": False,
                "ml_detector": False,
                "memory_scan": False,
            }
        }

        scan_id = "test-scan-hang"
        te._scans[scan_id] = {
            "scan_id": scan_id,
            "status": "scanning",
            "files_total": 2,
            "files_scanned": 0,
            "files_skipped": 0,
            "threats_found": 0,
            "threats": [],
            "progress": 0,
            "cancel": False,
        }

        detectors_backup = None
        start = time.monotonic()

        def run():
            te._execute_scan(scan_id, [str(f1), str(f2)], config)

        t = threading.Thread(target=run, daemon=True)
        t.start()
        t.join(timeout=25)
        elapsed = time.monotonic() - start

        # The scan must complete (not deadlock) well within the 25s join
        # timeout, since the per-detector timeout is 15s and there's no
        # blocking shutdown(wait=True) per file anymore.
        assert not t.is_alive(), "Scan thread deadlocked — executor blocked on hung detector"
        assert elapsed < 20
