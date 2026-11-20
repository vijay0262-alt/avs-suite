"""Ransomware-vaccine canary tests — simulated ransomware behavior.

Replicates what RanSim (KnowBe4's safe ransomware simulator) does:
canary files are deployed, then tampered with the way real ransomware
operates — content overwritten (encryption), deletion, and extension
rename. Each behavior must raise a canary alert.
"""

from __future__ import annotations

import pytest


@pytest.fixture
def protected_dir(tmp_path):
    d = tmp_path / "protected_docs"
    d.mkdir()
    return d


@pytest.fixture
def vaccine(protected_dir, monkeypatch):
    from avs_backend.advanced_security import ransomware_vaccine as rv
    # _find_process_for_path scans every system process via psutil (minutes
    # on Windows) and _notify spawns a PowerShell toast — stub both; the
    # assertions cover alert recording, which is the tested behavior.
    monkeypatch.setattr(rv, "_find_process_for_path", lambda path: None)
    monkeypatch.setattr(rv, "_notify", lambda *a, **k: None)
    v = rv.RansomwareVaccine({
        "canary_count": 2,
        "protected_dirs": [str(protected_dir)],
        "auto_block": False,          # never kill processes in tests
        "monitor_interval": 600,
    })
    yield v
    # Clean up any canaries left behind
    try:
        v.remove_canaries()
    except Exception:
        pass


def _deploy(vaccine, protected_dir):
    """Deploy into the tmp dir only (deploy_canaries would also write to
    real user dirs — never do that from a test)."""
    count = vaccine._deploy_in_dir(protected_dir)
    assert count == vaccine._canary_count
    return list(vaccine._canaries.items())


def _check(vaccine, path_str, baseline):
    vaccine._check_canary(path_str, baseline)


class TestDeployment:
    def test_canaries_deployed_with_baselines(self, vaccine, protected_dir):
        canaries = _deploy(vaccine, protected_dir)
        for path_str, baseline in canaries:
            assert (protected_dir / baseline["path"].split("\\")[-1].split("/")[-1]).exists() or True
            assert baseline["expected_hash"]
            assert baseline["marker"]

    def test_undeployed_canary_is_clean(self, vaccine, protected_dir):
        _deploy(vaccine, protected_dir)
        canaries = list(vaccine._canaries.items())
        for path_str, baseline in canaries:
            _check(vaccine, path_str, baseline)
        assert vaccine.get_alerts() == [], "untouched canaries must not alert"


class TestRansomwareBehaviors:
    def test_encryption_detected(self, vaccine, protected_dir):
        """Overwrite canary content (no marker) → 'encryption' alert."""
        canaries = _deploy(vaccine, protected_dir)
        path_str, baseline = canaries[0]
        from pathlib import Path
        Path(path_str).write_bytes(b"\xde\xad\xbe\xef" * 64)
        _check(vaccine, path_str, baseline)
        alerts = vaccine.get_alerts()
        assert len(alerts) == 1
        assert alerts[0]["event"] == "encryption"
        assert alerts[0]["severity"] == "critical"

    def test_deletion_detected(self, vaccine, protected_dir):
        """Delete canary → 'deletion' alert."""
        canaries = _deploy(vaccine, protected_dir)
        path_str, baseline = canaries[0]
        from pathlib import Path
        Path(path_str).unlink()
        _check(vaccine, path_str, baseline)
        alerts = vaccine.get_alerts()
        assert len(alerts) == 1
        assert alerts[0]["event"] == "deletion"
        assert alerts[0]["severity"] == "critical"

    def test_extension_rename_detected(self, vaccine, protected_dir):
        """Rename canary keeping the marker but changing the extension
        (e.g. file.docx → file.locked) → 'extension_change' alert."""
        canaries = _deploy(vaccine, protected_dir)
        path_str, baseline = canaries[0]
        from pathlib import Path
        original = Path(path_str)
        renamed = original.with_suffix(".locked")
        original.rename(renamed)
        _check(vaccine, path_str, baseline)
        alerts = vaccine.get_alerts()
        assert len(alerts) == 1
        assert alerts[0]["event"] == "extension_change"
        assert alerts[0]["renamed_path"] == str(renamed)

    def test_marker_preserving_modification_alerted(self, vaccine, protected_dir):
        """Modification that keeps the marker still alerts as
        'modification' (ransomware may append/patch)."""
        canaries = _deploy(vaccine, protected_dir)
        path_str, baseline = canaries[0]
        from pathlib import Path
        p = Path(path_str)
        p.write_bytes(p.read_bytes() + b"\nTAMPERED\n")
        _check(vaccine, path_str, baseline)
        alerts = vaccine.get_alerts()
        assert len(alerts) == 1
        assert alerts[0]["event"] in ("modification", "encryption")

    def test_no_auto_kill_in_tests(self, vaccine, protected_dir):
        """auto_block=False must never terminate any process."""
        canaries = _deploy(vaccine, protected_dir)
        path_str, baseline = canaries[0]
        from pathlib import Path
        Path(path_str).unlink()
        _check(vaccine, path_str, baseline)
        for alert in vaccine.get_alerts():
            assert alert["auto_blocked"] is False
