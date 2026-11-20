"""EICAR / industry-standard detection end-to-end tests.

Uses the real EICAR test signature (the 68-byte string every mainstream
AV agrees to detect) plus a benign stand-in file seeded into the hash
detector's index to prove the full pipeline:

    detect  →  quarantine  →  original removed  →  restore intact

NOTE on host AV: writing the real EICAR bytes to disk triggers Windows
Defender (or whatever AV is installed) — the write succeeds but any
subsequent READ is intercepted (OSError). Raw-EICAR disk tests are
therefore environment-dependent; the hash-lookup and seeded-marker
tests cover the same production code paths deterministically.
"""

from __future__ import annotations

import hashlib
import importlib

import pytest

# The canonical EICAR anti-malware test string — safe, ASCII-only, and
# detected by industry agreement. Its SHA-256 is seeded in hash_detector.
EICAR = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
EICAR_SHA256 = "275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f"


@pytest.fixture(autouse=True)
def _isolated_data_dir(tmp_path, monkeypatch):
    """Redirect LOCALAPPDATA so tests never touch the real quarantine dir."""
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    yield


@pytest.fixture(autouse=True)
def _pro_edition(monkeypatch):
    """threat.* mutation RPCs are Pro-gated; tests exercise the handlers."""
    import avs_backend.licensing as _licensing
    monkeypatch.setattr(_licensing, "_edition_override", "professional")


@pytest.fixture
def seeded_threat(tmp_path):
    """A benign marker file registered in the hash detector's index —
    exercises the real file→hash→lookup path without tripping host AV."""
    from avs_backend.threat_engine.hash_detector import HashDetector

    f = tmp_path / "avs_test_threat.bin"
    f.write_bytes(b"AVS-TEST-THREAT-MARKER " + b"x" * 64)
    sha = hashlib.sha256(f.read_bytes()).hexdigest()
    detector = HashDetector({})
    detector._sha256_index[sha] = {
        "sha256": sha, "name": "AVS.Test.Marker",
        "type": "test", "severity": "low", "source": "test-fixture",
    }
    return f, sha, detector


def _eicar_readable(path) -> bool:
    """True if the host AV lets us read the EICAR file back."""
    try:
        return path.read_bytes() == EICAR
    except OSError:
        return False


class TestEicarDetection:
    """Each detection layer must independently flag EICAR."""

    def test_eicar_string_is_canonical(self):
        """Guard the fixture itself — wrong bytes would pass vacuously."""
        assert len(EICAR) == 68
        assert hashlib.sha256(EICAR).hexdigest() == EICAR_SHA256

    def test_hash_index_contains_eicar(self):
        """The production seed DB must contain the real EICAR SHA-256."""
        from avs_backend.threat_engine.hash_detector import HashDetector

        result = HashDetector({}).check_sha256(EICAR_SHA256)
        assert result is not None and result["detected"] is True
        assert "eicar" in result["threat_name"].lower()
        assert result["details"]["match_type"] == "sha256"

    def test_eicar_on_disk_detected_when_host_av_permits(self, tmp_path):
        """Write real EICAR → scan_file detects it — unless a host AV
        blocks the read (then the file is already neutralized, which is
        also correct: assert scan_file degrades to None gracefully)."""
        from avs_backend.threat_engine.hash_detector import HashDetector

        f = tmp_path / "eicar.com"
        f.write_bytes(EICAR)
        result = HashDetector({}).scan_file(str(f))
        if _eicar_readable(f):
            assert result is not None and result["detected"] is True
            assert "eicar" in result["threat_name"].lower()
        else:
            # Host AV intercepted the read — detector must not crash.
            assert result is None

    def test_yara_detects_eicar_content(self, tmp_path):
        """YARA content rule catches EICAR independent of hash DB."""
        yara = pytest.importorskip("yara", reason="yara-python not installed")
        from avs_backend.threat_engine.yara_scanner import YaraScanner

        f = tmp_path / "eicar.com"
        f.write_bytes(EICAR)
        if not _eicar_readable(f):
            pytest.skip("host AV blocks EICAR reads")
        result = YaraScanner({}).scan_file(str(f))
        assert result is not None and result.get("detected") is True

    def test_scan_file_detects_seeded_threat(self, seeded_threat):
        """Real file→sha256→index lookup flags a registered hash."""
        f, sha, detector = seeded_threat
        result = detector.scan_file(str(f))
        assert result is not None and result["detected"] is True
        assert result["threat_name"] == "AVS.Test.Marker"
        assert result["sha256"] == sha

    def test_clean_file_not_detected(self, tmp_path):
        """False-positive guard — a benign file must NOT be flagged."""
        from avs_backend.threat_engine.hash_detector import HashDetector

        f = tmp_path / "readme.txt"
        f.write_bytes(b"Hello, this is a perfectly ordinary document.\n")
        result = HashDetector({}).scan_file(str(f))
        assert result is not None
        assert result["detected"] is False


class TestCompressedEicar:
    """AMTSO compressed-malware check — EICAR inside a ZIP.

    Archive extraction is delegated to ClamAV (ScanArchive yes), so this
    test is capability-aware: it only asserts when clamd is reachable and
    the host AV didn't intercept the archive on write. On a machine with
    bundled ClamAV running, a ZIP-of-EICAR MUST be detected.
    """

    def test_eicar_zip_detected_by_clamav(self, tmp_path):
        import zipfile

        from avs_backend.threat_engine.clamav_scanner import (
            ClamAvScanner, check_clamav_available)

        if not check_clamav_available():
            pytest.skip("clamd not running — archive detection unavailable")

        z = tmp_path / "eicar.zip"
        with zipfile.ZipFile(z, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("eicar.com", EICAR)
        try:
            z.read_bytes()
        except OSError:
            pytest.skip("host AV intercepted the archive on write")

        result = ClamAvScanner({}).scan_file(str(z))
        assert result is not None, "clamd returned no result for EICAR zip"
        assert result.get("detected") is True, f"EICAR zip missed: {result}"


class TestQuarantineRoundTrip:
    """detected → quarantined → original gone → restored byte-for-byte.

    Uses the seeded marker file: raw EICAR can't survive a host AV, but
    the quarantine pipeline (copy → verify → delete → index → restore) is
    identical for any detected file.
    """

    def test_quarantine_restore_round_trip(self, seeded_threat):
        import avs_backend.threat_engine.quarantine_manager as qm
        qm = importlib.reload(qm)

        f, sha, detector = seeded_threat
        detection = detector.scan_file(str(f))
        assert detection["detected"]

        original_bytes = f.read_bytes()
        result = qm.quarantine_file(str(f), {
            "detection_source": "HashDetector",
            "name": detection["threat_name"],
            "threat_type": detection["threat_type"],
            "severity": detection["severity"],
        })
        qid = result.get("quarantine_id")
        assert qid, f"quarantine failed: {result}"
        assert not f.exists(), "detected file must be removed after quarantine"
        assert result["sha256"] == sha

        listed = qm.list_quarantined()
        assert any(item.get("quarantine_id") == qid for item in listed)

        restored = qm.restore_file(qid)
        assert restored.get("restored") is True, restored
        assert f.read_bytes() == original_bytes
        assert hashlib.sha256(f.read_bytes()).hexdigest() == sha

        assert not any(item.get("quarantine_id") == qid for item in qm.list_quarantined())

    def test_quarantine_via_rpc_layer(self, seeded_threat):
        """Same round-trip through the RPC handlers the UI calls."""
        import avs_backend.threat_engine as te
        te = importlib.reload(te)

        f, sha, detector = seeded_threat
        detection = detector.scan_file(str(f))
        original_bytes = f.read_bytes()

        res = te.threat_quarantine({
            "file_path": str(f),
            "threat_info": {"detection_source": "HashDetector",
                            "name": detection["threat_name"]},
        })
        assert res["success"] is True, res
        qid = res["result"]["quarantine_id"]
        assert not f.exists()

        res = te.threat_restore({"quarantine_id": qid})
        assert res["success"] is True, res
        assert f.read_bytes() == original_bytes

    def test_double_quarantine_no_duplicate_records(self, seeded_threat):
        """Quarantining the same file twice must not create two index
        entries — dedup keeps the accounting honest."""
        import avs_backend.threat_engine.quarantine_manager as qm
        qm = importlib.reload(qm)

        f, sha, detector = seeded_threat
        detection = detector.scan_file(str(f))
        info = {"detection_source": "HashDetector",
                "name": detection["threat_name"]}

        r1 = qm.quarantine_file(str(f), info)
        assert r1.get("quarantine_id")
        # Recreate the identical file and quarantine it again.
        f.write_bytes(b"AVS-TEST-THREAT-MARKER " + b"x" * 64)
        r2 = qm.quarantine_file(str(f), info)

        records = [i for i in qm.list_quarantined()
                   if i.get("sha256") == sha]
        assert len(records) == 1, f"duplicate quarantine records: {records}"
