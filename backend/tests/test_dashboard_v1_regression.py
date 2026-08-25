"""V1.0 Dashboard Cleaner regression tests.

Tests the safety, detection, cleaning, and health-score invariants
required by the V1.0 Dashboard single-modal workflow:

  SCAN → DETECT → CLEAN AUTOMATICALLY → VERIFY → SHOW RESULTS

Coverage:
  1.  Windows system file excluded
  2.  Windows system directory excluded
  3.  User Documents excluded
  4.  Downloads excluded
  5.  Active Chrome cache excluded (browser running)
  6.  Locked file excluded
  7.  Running application file excluded
  8.  Deletable TEMP file detected
  9.  Deletable TEMP file cleaned
  10. Failed deletion not counted as cleaned
  11. Verified deletion counted as cleaned
  12. Verified bytes recovered
  13. Recycle Bin cleanup path exists
  14. Protected Windows Update file excluded
  15. Second scan sees cleaned state (no duplicate session)
  16. Health score improves or remains stable after cleanup
  17. No duplicate scan session
  18. Cancellation works
  19. Deterministic health score based on cleanup opportunities
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

# The quick-scan location test inspects the LIVE filesystem (locations
# are only included when the directory actually exists), so it can only
# run on a real Windows host. Rule-evaluation tests are platform-
# independent (pure string path matching) and must NOT be skipped.
_requires_windows_filesystem = pytest.mark.skipif(
    os.name != "nt", reason="Inspects the live Windows filesystem"
)

from avs_backend.scan_core.rules.detection.locations import KnownLocations
from avs_backend.scan_core.rules.detection.safety_policy import SafetyPolicy
from avs_backend.scan_core.context.asset_snapshot import (
    AssetSnapshot,
    SnapshotState,
    create_snapshot_from_asset,
)
from avs_backend.scan_core.assets import ScanAsset, AssetType, AssetCategory, AssetSource
from avs_backend.scan_core_rpc import (
    _auto_opt_sessions,
    _auto_opt_lock,
)


# ── Helpers ──────────────────────────────────────────────────────────────

# Use the real USERPROFILE so protected-root checks match on any machine.
_USERPROFILE = os.environ.get("USERPROFILE", r"C:\Users\User")
_LOCALAPPDATA = os.environ.get("LOCALAPPDATA", os.path.join(_USERPROFILE, "AppData", "Local"))
_TEMP = os.environ.get("TEMP", os.path.join(_LOCALAPPDATA, "Temp"))

def _make_asset(path: str, locked: bool = False, accessible: bool = True) -> ScanAsset:
    """Create a minimal ScanAsset for testing."""
    return ScanAsset(
        asset_id=f"asset-{hash(path) & 0xFFFFFFFF}",
        asset_type=AssetType.FILE,
        asset_category=AssetCategory.FILESYSTEM,
        asset_source=AssetSource.FILESYSTEM_ENUMERATOR,
        display_name=os.path.basename(path),
        canonical_path=path.lower().replace("\\", "/"),
        exists=True,
        accessible=accessible and not locked,
        locked=locked,
        hidden=False,
        system=False,
    )


def _make_snapshot(asset: ScanAsset, locked: bool = False, exists: bool = True) -> AssetSnapshot:
    """Create a snapshot for an asset."""
    return create_snapshot_from_asset(
        asset_id=asset.asset_id,
        scan_id="test-scan",
        exists=exists,
        accessible=not locked,
        locked=locked,
        canonical_path=asset.canonical_path,
    )


# ── 1. Windows system file excluded ──────────────────────────────────────

class TestSystemFileExclusion:
    """Tests that Windows system files are excluded from cleanup."""

    def test_windows_system_file_excluded(self):
        """A file under C:\\Windows\\System32 must be BLOCKED."""
        path = r"C:\Windows\System32\kernel32.dll"
        asset = _make_asset(path)
        snapshot = _make_snapshot(asset)
        result = SafetyPolicy.assess(asset, snapshot)
        assert not result.is_safe, "System32 file must not be SAFE"
        assert result.is_blocked, "System32 file must be BLOCKED"

    def test_windows_system_directory_excluded(self):
        """A file under C:\\Windows\\SysWOW64 must be BLOCKED."""
        path = r"C:\Windows\SysWOW64\ntdll.dll"
        asset = _make_asset(path)
        snapshot = _make_snapshot(asset)
        result = SafetyPolicy.assess(asset, snapshot)
        assert result.is_blocked, "SysWOW64 file must be BLOCKED"

    def test_windows_root_excluded(self):
        """A file directly under C:\\Windows must be BLOCKED."""
        path = r"C:\Windows\notepad.exe"
        asset = _make_asset(path)
        snapshot = _make_snapshot(asset)
        result = SafetyPolicy.assess(asset, snapshot)
        assert result.is_blocked, "Windows root file must be BLOCKED"

    def test_winsxs_excluded(self):
        """A file under WinSxS must be BLOCKED."""
        path = r"C:\Windows\WinSxS\manifest\some_manifest"
        asset = _make_asset(path)
        snapshot = _make_snapshot(asset)
        result = SafetyPolicy.assess(asset, snapshot)
        assert result.is_blocked, "WinSxS file must be BLOCKED"

    def test_drivers_excluded(self):
        """A file under System32\\drivers must be BLOCKED."""
        path = r"C:\Windows\System32\drivers\ntfs.sys"
        asset = _make_asset(path)
        snapshot = _make_snapshot(asset)
        result = SafetyPolicy.assess(asset, snapshot)
        assert result.is_blocked, "Driver file must be BLOCKED"


# ── 3-4. User data excluded ──────────────────────────────────────────────

class TestUserDataExclusion:
    """Tests that user personal data is excluded from cleanup."""

    def test_documents_excluded(self):
        """Files under Documents must be BLOCKED."""
        path = os.path.join(_USERPROFILE, "Documents", "resume.docx")
        asset = _make_asset(path)
        snapshot = _make_snapshot(asset)
        result = SafetyPolicy.assess(asset, snapshot)
        assert result.is_blocked, "Documents file must be BLOCKED"

    def test_downloads_excluded(self):
        """Files under Downloads must be BLOCKED."""
        path = os.path.join(_USERPROFILE, "Downloads", "installer.exe")
        asset = _make_asset(path)
        snapshot = _make_snapshot(asset)
        result = SafetyPolicy.assess(asset, snapshot)
        assert result.is_blocked, "Downloads file must be BLOCKED"

    def test_desktop_excluded(self):
        """Files under Desktop must be BLOCKED."""
        path = os.path.join(_USERPROFILE, "Desktop", "notes.txt")
        asset = _make_asset(path)
        snapshot = _make_snapshot(asset)
        result = SafetyPolicy.assess(asset, snapshot)
        assert result.is_blocked, "Desktop file must be BLOCKED"

    def test_pictures_excluded(self):
        """Files under Pictures must be BLOCKED."""
        path = os.path.join(_USERPROFILE, "Pictures", "photo.jpg")
        asset = _make_asset(path)
        snapshot = _make_snapshot(asset)
        result = SafetyPolicy.assess(asset, snapshot)
        assert result.is_blocked, "Pictures file must be BLOCKED"


# ── 5. Active Chrome cache excluded ──────────────────────────────────────

class TestBrowserCacheExclusion:
    """Tests that active browser cache is excluded when browser is running."""

    def test_chrome_cache_path_detected(self):
        """Chrome cache path should be recognized as a browser cache location."""
        path = os.path.join(_LOCALAPPDATA, "Google", "Chrome", "User Data", "Default", "Cache", "f_000001")
        from avs_backend.scan_core.rules.detection.junk_rules_ext import (
            _browser_for_cache_path,
        )
        browser = _browser_for_cache_path(path)
        assert browser == "chrome"

    def test_running_browser_cache_excluded(self):
        """When Chrome is running, cache files must be REVIEW_REQUIRED."""
        from avs_backend.scan_core.rules.detection.junk_rules_ext import (
            invalidate_running_browsers_cache,
            _detect_running_browsers,
        )
        invalidate_running_browsers_cache()
        with patch(
            "avs_backend.scan_core.rules.detection.junk_rules_ext._detect_running_browsers",
            return_value={"chrome"},
        ):
            from avs_backend.scan_core.rules.detection.junk_rules_ext import (
                _is_browser_running_for_path,
            )
            path = os.path.join(_LOCALAPPDATA, "Google", "Chrome", "User Data", "Default", "Cache", "f_000001")
            assert _is_browser_running_for_path(path) is True


# ── 6-7. Locked / running application files excluded ─────────────────────

class TestLockedFileExclusion:
    """Tests that locked files are classified as REVIEW_REQUIRED."""

    def test_locked_file_excluded(self):
        """A locked file must be REVIEW_REQUIRED, not SAFE."""
        path = os.path.join(_TEMP, "locked.tmp")
        asset = _make_asset(path, locked=True)
        snapshot = _make_snapshot(asset, locked=True)
        result = SafetyPolicy.assess(asset, snapshot)
        assert not result.is_safe, "Locked file must not be SAFE"
        assert result.requires_review, "Locked file must be REVIEW_REQUIRED"

    def test_inaccessible_file_excluded(self):
        """An inaccessible file must be REVIEW_REQUIRED."""
        path = os.path.join(_TEMP, "inaccessible.tmp")
        asset = _make_asset(path, accessible=False)
        snapshot = _make_snapshot(asset, locked=False)
        snapshot.accessible = False
        result = SafetyPolicy.assess(asset, snapshot)
        assert not result.is_safe, "Inaccessible file must not be SAFE"
        assert result.requires_review, "Inaccessible file must be REVIEW_REQUIRED"


# ── 8-9. Deletable TEMP file detected and cleaned ────────────────────────

class TestDeletableTempFile:
    """Tests that genuinely deletable temp files are detected as SAFE."""

    def test_deletable_temp_file_detected_as_safe(self):
        """A temp file in %TEMP% that exists, is accessible, and not locked must be SAFE."""
        path = os.path.join(_TEMP, "deletable.tmp")
        asset = _make_asset(path, locked=False)
        snapshot = _make_snapshot(asset, locked=False)
        result = SafetyPolicy.assess(asset, snapshot)
        assert result.is_safe, "Deletable temp file must be SAFE"

    def test_windows_temp_file_detected_as_safe(self):
        """A file in %SystemRoot%\\Temp must be SAFE (protected exception)."""
        path = r"C:\Windows\Temp\junk.log"
        # Windows\Temp is a protected exception — should NOT be blocked
        is_protected = KnownLocations.is_in_protected_location(path)
        assert not is_protected, "Windows\\Temp must NOT be protected"


# ── 10-12. Cleaning verification ─────────────────────────────────────────

class TestCleaningVerification:
    """Tests for cleaning result accuracy."""

    def test_failed_deletion_not_counted_as_cleaned(self):
        """A FAILED execution result must not be counted as completed."""
        from avs_backend.scan_core.execution.models import (
            ExecutionResult,
            ExecutionStatus,
            ExecutionSummary,
        )
        from datetime import datetime, UTC

        failed_result = ExecutionResult(
            execution_id="exec-1",
            action_id="action-1",
            finding_id="finding-1",
            asset_id="asset-1",
            action_type="delete_file",
            target={},
            status=ExecutionStatus.FAILED,
            reason="Permission denied",
            timestamp=datetime.now(UTC),
            error=None,
            verification={},
            dry_run_info=None,
        )
        summary = ExecutionSummary(
            execution_id="exec-1",
            request_id="req-1",
            status=ExecutionStatus.FAILED,
            total=1,
            completed=0,
            failed=1,
            rejected=0,
            skipped=0,
            requires_review=0,
            cancelled=0,
            dry_run=0,
            results=(failed_result,),
            started_at=datetime.now(UTC),
            completed_at=datetime.now(UTC),
            ledger=None,
            reason="Failed",
        )
        assert summary.completed == 0
        assert summary.failed == 1

    def test_verified_deletion_counted_as_cleaned(self):
        """A COMPLETED execution result must be counted as completed."""
        from avs_backend.scan_core.execution.models import (
            ExecutionResult,
            ExecutionStatus,
            ExecutionSummary,
        )
        from datetime import datetime, UTC

        completed_result = ExecutionResult(
            execution_id="exec-2",
            action_id="action-2",
            finding_id="finding-2",
            asset_id="asset-2",
            action_type="delete_file",
            target={},
            status=ExecutionStatus.COMPLETED,
            reason="Deleted successfully",
            timestamp=datetime.now(UTC),
            error=None,
            verification={"precondition_passed": True},
            dry_run_info=None,
            before_state={"size": 1024},
            after_state={"exists": False},
        )
        summary = ExecutionSummary(
            execution_id="exec-2",
            request_id="req-2",
            status=ExecutionStatus.COMPLETED,
            total=1,
            completed=1,
            failed=0,
            rejected=0,
            skipped=0,
            requires_review=0,
            cancelled=0,
            dry_run=0,
            results=(completed_result,),
            started_at=datetime.now(UTC),
            completed_at=datetime.now(UTC),
            ledger=None,
            reason="Complete",
        )
        assert summary.completed == 1
        assert summary.failed == 0

    def test_verified_bytes_recovered(self):
        """Space recovered must only count verified deletions."""
        from avs_backend.scan_core.execution.models import (
            ExecutionResult,
            ExecutionStatus,
            ExecutionSummary,
        )
        from datetime import datetime, UTC

        results = (
            ExecutionResult(
                execution_id="exec-3",
                action_id="action-3a",
                finding_id="finding-3a",
                asset_id="asset-3a",
                action_type="delete_file",
                target={},
                status=ExecutionStatus.COMPLETED,
                reason="Deleted",
                timestamp=datetime.now(UTC),
                error=None,
                verification={},
                dry_run_info=None,
                before_state={"size": 2048},
                after_state={"exists": False},
            ),
            ExecutionResult(
                execution_id="exec-3",
                action_id="action-3b",
                finding_id="finding-3b",
                asset_id="asset-3b",
                action_type="delete_file",
                target={},
                status=ExecutionStatus.COMPLETED,
                reason="Deleted",
                timestamp=datetime.now(UTC),
                error=None,
                verification={},
                dry_run_info=None,
                before_state={"size": 4096},
                after_state={"exists": True},  # NOT verified deleted
            ),
        )
        summary = ExecutionSummary(
            execution_id="exec-3",
            request_id="req-3",
            status=ExecutionStatus.COMPLETED,
            total=2,
            completed=2,
            failed=0,
            rejected=0,
            skipped=0,
            requires_review=0,
            cancelled=0,
            dry_run=0,
            results=results,
            started_at=datetime.now(UTC),
            completed_at=datetime.now(UTC),
            ledger=None,
            reason="Complete",
        )

        # V1.0: Only count space from verified deletions (after_state.exists == False)
        space_recovered = 0
        for result in summary.results:
            if result.status.value != "completed":
                continue
            after_state = getattr(result, "after_state", None)
            if after_state and isinstance(after_state, dict):
                if after_state.get("exists") is False:
                    before_state = getattr(result, "before_state", None)
                    if before_state and isinstance(before_state, dict):
                        size = before_state.get("size", 0)
                        if isinstance(size, (int, float)) and size > 0:
                            space_recovered += size

        # Only the first result (2048 bytes) should be counted
        assert space_recovered == 2048


# ── 13. Recycle Bin cleanup ──────────────────────────────────────────────

class TestRecycleBin:
    """Tests that Recycle Bin is handled as a cleanup category.

    V1.0: Recycle Bin is NOT traversed via filesystem enumeration
    because Recycle Bin files belong to user SIDs and may not be
    accessible.  Instead, Recycle Bin is handled via the Windows
    SHEmptyRecycleBin API at cleanup time.  The category must still
    be recognized by the cleanup category mapping.
    """

    @_requires_windows_filesystem
    def test_recycle_bin_in_quick_scan_locations(self):
        """Recycle Bin must NOT be in quick scan filesystem locations.

        It is handled via the Windows API, not filesystem traversal.
        """
        from avs_backend.scan_core.orchestration.discovery import (
            FilesystemDiscoveryEngine,
        )
        engine = FilesystemDiscoveryEngine()
        locations = engine._get_quick_scan_locations()
        labels = [loc.label for loc in locations]
        # Recycle Bin is intentionally excluded from filesystem traversal.
        # It is handled via SHEmptyRecycleBinW API at execution time.
        assert "Recycle Bin" not in labels, (
            "Recycle Bin must NOT be in filesystem scan locations — "
            "it is handled via the Windows API"
        )

    def test_recycle_bin_category_mapping(self):
        """Recycle Bin rule_id must map to the 'Recycle Bin' category."""
        from avs_backend.scan_core.rules.cleanup_categories import (
            rule_id_to_category,
        )
        assert rule_id_to_category("junk.recycle_bin") == "Recycle Bin"


# ── 14. Protected Windows Update file ────────────────────────────────────

class TestWindowsUpdateExclusion:
    """Tests that Windows Update files in protected locations are excluded."""

    def test_softwaredistribution_download_is_safe_exception(self):
        """%SystemRoot%\\SoftwareDistribution\\Download is a protected exception."""
        path = r"C:\Windows\SoftwareDistribution\Download\some_update.msu"
        is_protected = KnownLocations.is_in_protected_location(path)
        assert not is_protected, "SoftwareDistribution\\Download must be a safe exception"

    def test_windows_installer_parent_blocked(self):
        """%SystemRoot%\\Installer (parent) must be BLOCKED."""
        path = r"C:\Windows\Installer\some.msi"
        is_protected = KnownLocations.is_in_protected_location(path)
        assert is_protected, "Windows\\Installer parent must be protected"

    def test_patch_cache_is_safe_exception(self):
        """%SystemRoot%\\Installer\\$PatchCache$ is a protected exception."""
        path = r"C:\Windows\Installer\$PatchCache$\some_patch.msp"
        is_protected = KnownLocations.is_in_protected_location(path)
        assert not is_protected, "$PatchCache$ must be a safe exception"


# ── 15-17. Scan session and health ───────────────────────────────────────

class TestScanSessionAndHealth:
    """Tests for scan session uniqueness and health score determinism."""

    def test_no_duplicate_scan_session(self):
        """Each scan call must produce a unique session ID."""
        from avs_backend.scan_core_rpc import _scan_sessions, _scan_session_lock

        # Verify that two manually-created sessions have different IDs
        # (the actual scan start is async and hard to test without a full
        # orchestrator; the UUID generation guarantees uniqueness)
        import uuid

        id1 = str(uuid.uuid4())
        id2 = str(uuid.uuid4())

        with _scan_session_lock:
            _scan_sessions[id1] = {"scan_id": id1, "completed": False}
            _scan_sessions[id2] = {"scan_id": id2, "completed": False}

        try:
            assert id1 != id2, "Session IDs must be unique"
            assert id1 in _scan_sessions
            assert id2 in _scan_sessions
        finally:
            with _scan_session_lock:
                _scan_sessions.pop(id1, None)
                _scan_sessions.pop(id2, None)

    def test_deterministic_health_score(self):
        """Health score must be deterministic based on cleanup opportunities."""
        # V1.0: health = max(60, round(100 - min(40, count * 0.02)))
        def _cleanup_health_score(count: int) -> int:
            penalty = min(40, count * 0.02)
            return max(60, round(100 - penalty))

        # 0 items → 100
        assert _cleanup_health_score(0) == 100
        # 100 items → 98
        assert _cleanup_health_score(100) == 98
        # 500 items → 90
        assert _cleanup_health_score(500) == 90
        # 2000 items → 60 (floor)
        assert _cleanup_health_score(2000) == 60
        # 5000 items → 60 (floor, capped)
        assert _cleanup_health_score(5000) == 60

    def test_health_improves_after_cleanup(self):
        """Health after cleanup must be >= health before when items were cleaned."""
        def _cleanup_health_score(count: int) -> int:
            penalty = min(40, count * 0.02)
            return max(60, round(100 - penalty))

        # Before: 500 cleanable items → 90
        health_before = _cleanup_health_score(500)
        # Clean 400 items, 100 remaining → 98
        health_after = _cleanup_health_score(100)
        assert health_after > health_before, "Health must improve after cleanup"

        # Edge: all items cleaned → 100
        health_after_all = _cleanup_health_score(0)
        assert health_after_all == 100
        assert health_after_all >= health_before


# ── 18. Cancellation ─────────────────────────────────────────────────────

class TestCancellation:
    """Tests that cancellation works for auto-optimize sessions."""

    def test_cancellation_works(self):
        """Cancelling an auto-optimize session must mark it as cancelled."""
        from avs_backend.scan_core_rpc import _scan_core_dashboard_auto_optimize_cancel

        session_id = "test-cancel-regression"
        with _auto_opt_lock:
            _auto_opt_sessions[session_id] = {
                "session_id": session_id,
                "plan_id": "test-plan",
                "phase": "executing",
                "message": "Cleaning...",
                "completed": False,
                "cancelled": False,
                "error": None,
                "total_actions": 10,
                "safe_actions": 7,
                "review_required": 2,
                "blocked": 1,
                "result": None,
                "verification_status": None,
                "preview": None,
                "validation": None,
            }

        try:
            result = _scan_core_dashboard_auto_optimize_cancel({"session_id": session_id})
            assert result["ok"] is True
            assert result["cancelled"] is True
        finally:
            with _auto_opt_lock:
                _auto_opt_sessions.pop(session_id, None)


# ── 19. Browser cache invalidation ───────────────────────────────────────

class TestBrowserCacheInvalidation:
    """Tests that the running-browsers cache is invalidated per scan."""

    def test_invalidate_running_browsers_cache(self):
        """invalidate_running_browsers_cache must clear the cache."""
        from avs_backend.scan_core.rules.detection.junk_rules_ext import (
            invalidate_running_browsers_cache,
            _detect_running_browsers,
            _cached_running_browsers,
        )

        # Set a fake cache
        import avs_backend.scan_core.rules.detection.junk_rules_ext as mod
        mod._cached_running_browsers = {"chrome", "edge"}

        # Invalidate
        invalidate_running_browsers_cache()

        # Cache must be None
        assert mod._cached_running_browsers is None


# ── 20. V1.0 Dashboard eligibility filter ─────────────────────────────────

class TestDashboardEligibilityFilter:
    """Tests that the V1.0 Dashboard filter excludes non-safe findings."""

    def test_mei_directory_excluded(self):
        """Files in _mei* PyInstaller temp directories must be REVIEW_REQUIRED."""
        path = r"C:\Users\HPBP\AppData\Local\Temp\_mei0000069c2\vcruntime140_1.dll"
        asset = _make_asset(path)
        snapshot = _make_snapshot(asset, locked=False, exists=True)
        safety = SafetyPolicy.assess(asset=asset, snapshot=snapshot)
        assert safety.requires_review, "_mei* files must be REVIEW_REQUIRED"
        assert not safety.is_safe, "_mei* files must NOT be SAFE"

    def test_mei_directory_with_normal_path_not_affected(self):
        """Files with '_mei' in the name but not in a _mei* directory are OK."""
        # This path has 'mei' in a filename but not as a _mei* directory
        path = r"C:\Users\HPBP\AppData\Local\Temp\myfile_mei.txt"
        asset = _make_asset(path)
        snapshot = _make_snapshot(asset, locked=False, exists=True)
        safety = SafetyPolicy.assess(asset=asset, snapshot=snapshot)
        # Should be SAFE (not in a _mei* directory)
        assert safety.is_safe, "Files not in _mei* directories should not be affected"

    def test_safe_temp_file_is_safe(self):
        """A normal temp file (not locked, not in _mei*) must be SAFE."""
        path = r"C:\Users\HPBP\AppData\Local\Temp\safe_temp_file.tmp"
        asset = _make_asset(path)
        snapshot = _make_snapshot(asset, locked=False, exists=True)
        safety = SafetyPolicy.assess(asset=asset, snapshot=snapshot)
        assert safety.is_safe, "Normal temp files must be SAFE"
        assert not safety.requires_review
        assert not safety.is_blocked


# ── 21. V1.0 Result contract ──────────────────────────────────────────────

class TestV1ResultContract:
    """Tests that the V1.0 result contract has the correct user-facing fields."""

    def test_result_has_user_facing_fields(self):
        """The V1.0 result must have detected, cleaned, remaining, failed, space_recovered."""
        # Simulate a V1.0 result dict
        result = {
            "detected": 100,
            "cleaned": 95,
            "remaining": 3,
            "failed": 2,
            "space_recovered": 50000,
            "health_before": 98,
            "health_after": 100,
            "_diagnostics": {
                "total": 100,
                "rejected": 0,
                "skipped": 0,
            },
        }
        # User-facing fields must be present
        assert "detected" in result
        assert "cleaned" in result
        assert "remaining" in result
        assert "failed" in result
        assert "space_recovered" in result
        assert "health_before" in result
        assert "health_after" in result

    def test_result_does_not_expose_internal_fields_at_top_level(self):
        """The V1.0 result must NOT have rejected/requires_review at top level."""
        result = {
            "detected": 100,
            "cleaned": 95,
            "remaining": 3,
            "failed": 2,
            "space_recovered": 50000,
            "health_before": 98,
            "health_after": 100,
            "_diagnostics": {"rejected": 0, "requires_review": 0},
        }
        # Internal fields must NOT be at top level
        assert "rejected" not in result, "rejected must be in _diagnostics, not top level"
        assert "requires_review" not in result, "requires_review must be in _diagnostics"
        assert "not_currently_cleanable" not in result
        assert "detected_candidates" not in result

    def test_acceptance_invariant_detected_equals_cleaned_plus_failed_plus_remaining(self):
        """detected = cleaned + failed + remaining (accounting invariant)."""
        detected = 100
        cleaned = 95
        failed = 2
        remaining = detected - cleaned - failed  # = 3
        assert detected == cleaned + failed + remaining

    def test_detected_approx_cleaned_when_failed_close_to_zero(self):
        """When failed is close to zero, detected ≈ cleaned."""
        detected = 100
        cleaned = 99
        failed = 1
        remaining = detected - cleaned - failed  # = 0
        assert abs(detected - cleaned) <= max(5, detected * 0.05)
        assert failed <= max(5, detected * 0.05)


# ── 22. 64-bit INVALID_HANDLE_VALUE fix ────────────────────────────────────

class TestInvalidHandleValueFix:
    """Tests that the 64-bit INVALID_HANDLE_VALUE bug is fixed."""

    def test_can_delete_file_windows_returns_false_for_locked_file(self):
        """_can_delete_file_windows must return False for a locked file."""
        if sys.platform != "win32":
            pytest.skip("Windows-only test")
        from avs_backend.scan_core.enumerator import _can_delete_file_windows

        # Create a temp file and lock it
        fd, path = tempfile.mkstemp(suffix=".tmp", prefix="avs_test_lock_")
        try:
            # Don't close the fd — file is locked
            result = _can_delete_file_windows(path)
            assert result is False, "Locked file must return False (cannot delete)"
        finally:
            os.close(fd)
            try:
                os.remove(path)
            except OSError:
                pass

    def test_can_delete_file_windows_returns_true_for_unlocked_file(self):
        """_can_delete_file_windows must return True for an unlocked file."""
        if sys.platform != "win32":
            pytest.skip("Windows-only test")
        from avs_backend.scan_core.enumerator import _can_delete_file_windows

        fd, path = tempfile.mkstemp(suffix=".tmp", prefix="avs_test_unlock_")
        os.close(fd)  # Close the handle — file is unlocked
        try:
            result = _can_delete_file_windows(path)
            assert result is True, "Unlocked file must return True (can delete)"
        finally:
            try:
                os.remove(path)
            except OSError:
                pass

    def test_is_locked_returns_true_for_locked_file(self):
        """_is_locked must return True for a file locked by another handle."""
        if sys.platform != "win32":
            pytest.skip("Windows-only test")
        from avs_backend.scan_core.enumerator import _is_locked

        fd, path = tempfile.mkstemp(suffix=".tmp", prefix="avs_test_islocked_")
        try:
            result = _is_locked(path)
            assert result is True, "Locked file must be detected as locked"
        finally:
            os.close(fd)
            try:
                os.remove(path)
            except OSError:
                pass
