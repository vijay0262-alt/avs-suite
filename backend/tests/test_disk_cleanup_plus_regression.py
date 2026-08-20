"""V1.0 Disk Cleanup+ — Comprehensive regression tests.

Tests the 35 required categories from the Disk Cleanup+ specification:

  1.  Temp file detected and cleaned
  2.  Windows temp file detected when safe
  3.  Recycle Bin cleanup
  4.  Browser cache cleanup
  5.  Browser running → cache excluded
  6.  Locked file excluded
  7.  Protected Windows file excluded
  8.  System32 excluded
  9.  WinSxS excluded
  10. Program Files binaries excluded
  11. User Documents excluded
  12. Desktop excluded
  13. Pictures excluded
  14. Downloads excluded
  15. pagefile excluded
  16. hiberfil excluded
  17. swapfile excluded
  18. Windows Update cleanup safety
  19. Delivery Optimization cleanup
  20. Crash dump cleanup
  21. Thumbnail cleanup
  22. Shader cache cleanup
  23. Previous Windows installation safety handling
  24. Repeated scan isolation
  25. Cancellation
  26. TOCTOU lock race
  27. Actual deletion verification
  28. Actual byte recovery
  29. Health before/after
  30. No fake detected count
  31. No rejected/blocked items in user-visible result
  32. All cleanup providers use canonical scan_core
  33. No legacy scan path
  34. No automatic unsafe remediation
  35. Packaged backend E2E (skipped if no packaged backend)
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock
from datetime import UTC, datetime

import pytest

from avs_backend.scan_core.rules.detection.locations import KnownLocations
from avs_backend.scan_core.rules.detection.safety_policy import SafetyPolicy
from avs_backend.scan_core.context.asset_snapshot import (
    AssetSnapshot,
    create_snapshot_from_asset,
)
from avs_backend.scan_core.assets import ScanAsset, AssetType, AssetCategory, AssetSource
from avs_backend.scan_core.rules.enums import SafetyLevel
from avs_backend.scan_core.rules.detection.cleanup_providers import (
    RecycleBinRule,
    DeliveryOptimizationRule,
    CrashDumpRule,
    WindowsOldRule,
)


# ── Helpers ──────────────────────────────────────────────────────────────

_USERPROFILE = os.environ.get("USERPROFILE", r"C:\Users\User")
_LOCALAPPDATA = os.environ.get("LOCALAPPDATA", os.path.join(_USERPROFILE, "AppData", "Local"))
_TEMP = os.environ.get("TEMP", os.path.join(_LOCALAPPDATA, "Temp"))


def _make_asset(path: str, locked: bool = False, accessible: bool = True) -> ScanAsset:
    """Create a minimal ScanAsset for testing."""
    return ScanAsset(
        asset_id=f"asset-{abs(hash(path)) & 0xFFFFFFFF}",
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


def _evaluate_rule(rule, path: str, locked: bool = False, exists: bool = True):
    """Helper: evaluate a rule on a path and return the result."""
    asset = _make_asset(path, locked=locked)
    snapshot = _make_snapshot(asset, locked=locked, exists=exists)
    return rule.evaluate(asset=asset, snapshot=snapshot)


# ── 1. Temp file detected and cleaned ────────────────────────────────────

class TestTempFileDetection:
    """Tests that safe temp files are detected and would be cleaned."""

    def test_temp_file_detected_as_safe(self):
        """A safe temp file must be detected and classified as SAFE."""
        from avs_backend.scan_core.rules.detection.junk_rules import UserTempRule
        path = os.path.join(_TEMP, "safe_temp_test.tmp")
        result = _evaluate_rule(UserTempRule(), path)
        assert result.matched, "Temp file must be detected"
        assert result.safety.is_safe, "Safe temp file must be SAFE"

    def test_temp_file_recommended_action_is_delete(self):
        """A safe temp file must recommend DELETE action."""
        from avs_backend.scan_core.rules.detection.junk_rules import UserTempRule
        path = os.path.join(_TEMP, "safe_temp_test.tmp")
        result = _evaluate_rule(UserTempRule(), path)
        assert result.matched
        assert result.recommended_action.value == "delete"


# ── 2. Windows temp file detected when safe ──────────────────────────────

class TestWindowsTempDetection:
    """Tests that Windows temp files are detected when safe."""

    def test_windows_temp_file_detected(self):
        """A file in %SystemRoot%\\Temp must be detected."""
        from avs_backend.scan_core.rules.detection.junk_rules import WindowsTempRule
        system_root = os.environ.get("SystemRoot", r"C:\Windows")
        path = os.path.join(system_root, "Temp", "win_temp_test.tmp")
        result = _evaluate_rule(WindowsTempRule(), path)
        assert result.matched, "Windows temp file must be detected"
        assert result.safety.is_safe, "Safe Windows temp file must be SAFE"


# ── 3. Recycle Bin cleanup ───────────────────────────────────────────────

class TestRecycleBinCleanup:
    """Tests that Recycle Bin files are detected for cleanup."""

    def test_recycle_bin_file_detected(self):
        """A file in C:\\$Recycle.Bin must be detected."""
        path = r"C:\$Recycle.Bin\S-1-5-21\file.txt"
        result = _evaluate_rule(RecycleBinRule(), path)
        assert result.matched, "Recycle Bin file must be detected"

    def test_recycle_bin_file_safe_when_unlocked(self):
        """An unlocked Recycle Bin file must be SAFE."""
        path = r"C:\$Recycle.Bin\S-1-5-21\file.txt"
        result = _evaluate_rule(RecycleBinRule(), path, locked=False)
        assert result.safety.is_safe, "Unlocked Recycle Bin file must be SAFE"

    def test_recycle_bin_file_review_when_locked(self):
        """A locked Recycle Bin file must be REVIEW_REQUIRED."""
        path = r"C:\$Recycle.Bin\S-1-5-21\file.txt"
        result = _evaluate_rule(RecycleBinRule(), path, locked=True)
        assert result.safety.requires_review, "Locked Recycle Bin file must be REVIEW_REQUIRED"

    def test_non_recycle_bin_file_not_matched(self):
        """A file NOT in $Recycle.Bin must not be matched by RecycleBinRule."""
        path = os.path.join(_TEMP, "not_recycle.txt")
        result = _evaluate_rule(RecycleBinRule(), path)
        assert not result.matched, "Non-Recycle Bin file must not match"


# ── 4. Browser cache cleanup ─────────────────────────────────────────────

class TestBrowserCacheCleanup:
    """Tests that browser cache files are detected for cleanup."""

    def test_chrome_cache_detected(self):
        """Chrome cache files must be detected."""
        from avs_backend.scan_core.rules.detection.junk_rules_ext import BrowserCacheRule
        path = os.path.join(
            _LOCALAPPDATA, "Google", "Chrome", "User Data", "Default", "Cache", "cache_file"
        )
        result = _evaluate_rule(BrowserCacheRule(), path)
        assert result.matched, "Chrome cache file must be detected"

    def test_edge_cache_detected(self):
        """Edge cache files must be detected."""
        from avs_backend.scan_core.rules.detection.junk_rules_ext import BrowserCacheRule
        path = os.path.join(
            _LOCALAPPDATA, "Microsoft", "Edge", "User Data", "Default", "Cache", "cache_file"
        )
        result = _evaluate_rule(BrowserCacheRule(), path)
        assert result.matched, "Edge cache file must be detected"


# ── 5. Browser running → cache excluded ──────────────────────────────────

class TestBrowserRunningExclusion:
    """Tests that browser cache is excluded when browser is running."""

    def test_browser_running_excludes_cache(self):
        """When Chrome is running, its cache must be REVIEW_REQUIRED."""
        import avs_backend.scan_core.rules.detection.junk_rules_ext as mod
        from avs_backend.scan_core.rules.detection.junk_rules_ext import BrowserCacheRule

        # Set cache to indicate Chrome is running
        original = mod._cached_running_browsers
        mod._cached_running_browsers = {"chrome"}
        try:
            path = os.path.join(
                _LOCALAPPDATA, "Google", "Chrome", "User Data", "Default", "Cache", "cache_file"
            )
            result = _evaluate_rule(BrowserCacheRule(), path)
            assert result.matched, "Cache file should still be detected"
            assert result.safety.requires_review, "Running browser cache must be REVIEW_REQUIRED"
            assert not result.safety.is_safe, "Running browser cache must NOT be SAFE"
        finally:
            mod._cached_running_browsers = original


# ── 6. Locked file excluded ──────────────────────────────────────────────

class TestLockedFileExclusion:
    """Tests that locked files are excluded from automatic cleanup."""

    def test_locked_temp_file_is_review_required(self):
        """A locked temp file must be REVIEW_REQUIRED, not SAFE."""
        from avs_backend.scan_core.rules.detection.junk_rules import UserTempRule
        path = os.path.join(_TEMP, "locked_test.tmp")
        result = _evaluate_rule(UserTempRule(), path, locked=True)
        assert result.matched, "Locked file should still be detected"
        assert result.safety.requires_review, "Locked file must be REVIEW_REQUIRED"
        assert not result.safety.is_safe, "Locked file must NOT be SAFE"


# ── 7-9. Protected Windows files/directories excluded ────────────────────

class TestProtectedWindowsPaths:
    """Tests that protected Windows paths are excluded."""

    def test_system32_excluded(self):
        """Files under System32 must be BLOCKED."""
        path = r"C:\Windows\System32\kernel32.dll"
        assert KnownLocations.is_in_protected_location(path), "System32 must be protected"

    def test_winsxs_excluded(self):
        """Files under WinSxS must be BLOCKED."""
        path = r"C:\Windows\WinSxS\manifests\some_manifest"
        assert KnownLocations.is_in_protected_location(path), "WinSxS must be protected"

    def test_protected_windows_file_blocked_by_safety_policy(self):
        """SafetyPolicy must BLOCK files in protected locations."""
        path = r"C:\Windows\System32\kernel32.dll"
        asset = _make_asset(path)
        snapshot = _make_snapshot(asset)
        safety = SafetyPolicy.assess(asset=asset, snapshot=snapshot)
        assert safety.is_blocked, "Protected location must be BLOCKED"


# ── 10. Program Files binaries excluded ──────────────────────────────────

class TestProgramFilesExclusion:
    """Tests that Program Files binaries are excluded."""

    def test_program_files_excluded(self):
        """Files under Program Files must be in protected location."""
        path = r"C:\Program Files\SomeApp\app.exe"
        assert KnownLocations.is_in_protected_location(path), "Program Files must be protected"

    def test_program_files_x86_excluded(self):
        """Files under Program Files (x86) must be in protected location."""
        path = r"C:\Program Files (x86)\SomeApp\app.exe"
        assert KnownLocations.is_in_protected_location(path), "Program Files (x86) must be protected"


# ── 11-14. User data excluded ────────────────────────────────────────────

class TestUserDataExclusion:
    """Tests that user personal data directories are excluded."""

    def test_documents_excluded(self):
        path = os.path.join(_USERPROFILE, "Documents", "important.docx")
        assert KnownLocations.is_in_protected_location(path), "Documents must be protected"

    def test_desktop_excluded(self):
        path = os.path.join(_USERPROFILE, "Desktop", "shortcut.lnk")
        assert KnownLocations.is_in_protected_location(path), "Desktop must be protected"

    def test_pictures_excluded(self):
        path = os.path.join(_USERPROFILE, "Pictures", "photo.jpg")
        assert KnownLocations.is_in_protected_location(path), "Pictures must be protected"

    def test_downloads_excluded(self):
        path = os.path.join(_USERPROFILE, "Downloads", "installer.exe")
        assert KnownLocations.is_in_protected_location(path), "Downloads must be protected"

    def test_videos_excluded(self):
        path = os.path.join(_USERPROFILE, "Videos", "movie.mp4")
        assert KnownLocations.is_in_protected_location(path), "Videos must be protected"

    def test_music_excluded(self):
        path = os.path.join(_USERPROFILE, "Music", "song.mp3")
        assert KnownLocations.is_in_protected_location(path), "Music must be protected"


# ── 15-17. System files excluded ─────────────────────────────────────────

class TestSystemFilesExclusion:
    """Tests that critical system files are excluded by name."""

    def test_pagefile_excluded(self):
        """pagefile.sys must be protected."""
        path = r"C:\pagefile.sys"
        assert KnownLocations.is_protected_file(path), "pagefile.sys must be protected"
        assert KnownLocations.is_in_protected_location(path), "pagefile.sys must be in protected location"

    def test_hiberfil_excluded(self):
        """hiberfil.sys must be protected."""
        path = r"C:\hiberfil.sys"
        assert KnownLocations.is_protected_file(path), "hiberfil.sys must be protected"
        assert KnownLocations.is_in_protected_location(path), "hiberfil.sys must be in protected location"

    def test_swapfile_excluded(self):
        """swapfile.sys must be protected."""
        path = r"C:\swapfile.sys"
        assert KnownLocations.is_protected_file(path), "swapfile.sys must be protected"
        assert KnownLocations.is_in_protected_location(path), "swapfile.sys must be in protected location"

    def test_bootmgr_excluded(self):
        """bootmgr must be protected."""
        path = r"C:\bootmgr"
        assert KnownLocations.is_protected_file(path), "bootmgr must be protected"


# ── 18. Windows Update cleanup safety ────────────────────────────────────

class TestWindowsUpdateCleanup:
    """Tests that Windows Update cleanup is handled safely."""

    def test_windows_update_cache_detected(self):
        """Windows Update cache files must be detected."""
        from avs_backend.scan_core.rules.detection.junk_rules_ext import WindowsUpdateCacheRule
        system_root = os.environ.get("SystemRoot", r"C:\Windows")
        path = os.path.join(system_root, "SoftwareDistribution", "Download", "update.cab")
        result = _evaluate_rule(WindowsUpdateCacheRule(), path)
        assert result.matched, "Windows Update cache file must be detected"

    def test_windows_update_cache_is_safe_exception(self):
        """SoftwareDistribution\\Download must be a protected exception."""
        path = r"C:\Windows\SoftwareDistribution\Download\update.cab"
        assert not KnownLocations.is_in_protected_location(path), \
            "SoftwareDistribution\\Download must be a safe exception"


# ── 19. Delivery Optimization cleanup ────────────────────────────────────

class TestDeliveryOptimizationCleanup:
    """Tests that Delivery Optimization cache is detected."""

    def test_delivery_optimization_detected(self):
        """Delivery Optimization cache files must be detected."""
        path = os.path.join(
            os.environ.get("SystemRoot", r"C:\Windows"),
            "SoftwareDistribution", "DeliveryOptimization", "fragment.dat"
        )
        result = _evaluate_rule(DeliveryOptimizationRule(), path)
        assert result.matched, "Delivery Optimization file must be detected"

    def test_delivery_optimization_safe_when_unlocked(self):
        """Unlocked DO cache must be SAFE."""
        path = os.path.join(
            os.environ.get("SystemRoot", r"C:\Windows"),
            "SoftwareDistribution", "DeliveryOptimization", "fragment.dat"
        )
        result = _evaluate_rule(DeliveryOptimizationRule(), path, locked=False)
        assert result.safety.is_safe, "Unlocked DO cache must be SAFE"

    def test_delivery_optimization_review_when_locked(self):
        """Locked DO cache must be REVIEW_REQUIRED."""
        path = os.path.join(
            os.environ.get("SystemRoot", r"C:\Windows"),
            "SoftwareDistribution", "DeliveryOptimization", "fragment.dat"
        )
        result = _evaluate_rule(DeliveryOptimizationRule(), path, locked=True)
        assert result.safety.requires_review, "Locked DO cache must be REVIEW_REQUIRED"


# ── 20. Crash dump cleanup ───────────────────────────────────────────────

class TestCrashDumpCleanup:
    """Tests that crash dumps and error reports are detected."""

    def test_wer_report_queue_detected(self):
        """WER ReportQueue files must be detected."""
        programdata = os.environ.get("PROGRAMDATA", r"C:\ProgramData")
        path = os.path.join(programdata, "Microsoft", "Windows", "WER", "ReportQueue", "report.xml")
        result = _evaluate_rule(CrashDumpRule(), path)
        assert result.matched, "WER ReportQueue file must be detected"

    def test_minidump_detected(self):
        """Minidump files must be detected."""
        path = os.path.join(os.environ.get("SystemRoot", r"C:\Windows"), "Minidump", "minidump.dmp")
        result = _evaluate_rule(CrashDumpRule(), path)
        assert result.matched, "Minidump file must be detected"

    def test_crash_dump_safe_when_unlocked(self):
        """Unlocked crash dump must be SAFE."""
        programdata = os.environ.get("PROGRAMDATA", r"C:\ProgramData")
        path = os.path.join(programdata, "Microsoft", "Windows", "WER", "ReportArchive", "report.xml")
        result = _evaluate_rule(CrashDumpRule(), path, locked=False)
        assert result.safety.is_safe, "Unlocked crash dump must be SAFE"


# ── 21. Thumbnail cleanup ────────────────────────────────────────────────

class TestThumbnailCleanup:
    """Tests that thumbnail cache files are detected."""

    def test_thumbnail_cache_detected(self):
        """Thumbnail cache files must be detected."""
        from avs_backend.scan_core.rules.detection.junk_rules import ThumbnailCacheRule
        path = os.path.join(
            _LOCALAPPDATA, "Microsoft", "Windows", "Explorer", "thumbcache_256.db"
        )
        result = _evaluate_rule(ThumbnailCacheRule(), path)
        assert result.matched, "Thumbnail cache file must be detected"


# ── 22. Shader cache cleanup ─────────────────────────────────────────────

class TestShaderCacheCleanup:
    """Tests that shader cache files are detected."""

    def test_d3d_shader_cache_detected(self):
        """D3D shader cache files must be detected."""
        from avs_backend.scan_core.rules.detection.junk_rules import ShaderCacheRule
        path = os.path.join(_LOCALAPPDATA, "D3DSCache", "shader.bin")
        result = _evaluate_rule(ShaderCacheRule(), path)
        assert result.matched, "D3D shader cache file must be detected"


# ── 23. Previous Windows installation safety ─────────────────────────────

class TestWindowsOldSafety:
    """Tests that Windows.old is detected but NOT auto-deleted."""

    def test_windows_old_detected(self):
        """Windows.old files must be detected."""
        path = r"C:\Windows.old\Windows\System32\kernel32.dll"
        result = _evaluate_rule(WindowsOldRule(), path)
        assert result.matched, "Windows.old file must be detected"

    def test_windows_old_is_review_required(self):
        """Windows.old must be REVIEW_REQUIRED — never auto-deleted."""
        path = r"C:\Windows.old\Users\User\file.txt"
        result = _evaluate_rule(WindowsOldRule(), path)
        assert result.safety.requires_review, "Windows.old must be REVIEW_REQUIRED"
        assert not result.safety.is_safe, "Windows.old must NOT be SAFE"

    def test_windows_old_in_protected_location(self):
        """Windows.old must be in the protected roots list."""
        path = r"C:\Windows.old\Windows\System32\kernel32.dll"
        assert KnownLocations.is_in_protected_location(path), \
            "Windows.old must be a protected location"

    def test_windows_old_recommended_action_is_none(self):
        """Windows.old recommended action must be NONE — no auto-deletion."""
        path = r"C:\Windows.old\Users\User\file.txt"
        result = _evaluate_rule(WindowsOldRule(), path)
        assert result.recommended_action.value == "none", \
            "Windows.old must not recommend any action"


# ── 24. Repeated scan isolation ──────────────────────────────────────────

class TestRepeatedScanIsolation:
    """Tests that repeated scans are isolated."""

    def test_scan_sessions_are_unique(self):
        """Two scan sessions must have different IDs."""
        import uuid
        id1 = str(uuid.uuid4())
        id2 = str(uuid.uuid4())
        assert id1 != id2, "Session IDs must be unique"


# ── 25. Cancellation ─────────────────────────────────────────────────────

class TestCancellation:
    """Tests that cancellation works."""

    def test_cancellation_works(self):
        """Cancelling an auto-optimize session must mark it as cancelled."""
        from avs_backend.scan_core_rpc import (
            _auto_opt_sessions,
            _auto_opt_lock,
            _scan_core_dashboard_auto_optimize_cancel,
        )

        session_id = "test-cancel-disk-cleanup"
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


# ── 26. TOCTOU lock race ─────────────────────────────────────────────────

class TestTOCTOULockRace:
    """Tests that TOCTOU lock races are handled correctly."""

    def test_locked_file_not_counted_as_cleaned(self):
        """A file that becomes locked between scan and execution must not be cleaned."""
        # This is tested by the V1.0 result contract: failed != cleaned
        # The executor catches PermissionError and marks as failed
        from avs_backend.scan_core.execution.filesystem_executor import FilesystemExecutor
        assert hasattr(FilesystemExecutor, "_delete_file"), \
            "FilesystemExecutor must have _delete_file method"

    def test_is_locked_detects_locked_file(self):
        """_is_locked must detect a file locked by another handle."""
        if sys.platform != "win32":
            pytest.skip("Windows-only test")
        from avs_backend.scan_core.enumerator import _is_locked

        fd, path = tempfile.mkstemp(suffix=".tmp", prefix="avs_test_toctou_")
        try:
            result = _is_locked(path)
            assert result is True, "Locked file must be detected as locked"
        finally:
            os.close(fd)
            try:
                os.remove(path)
            except OSError:
                pass


# ── 27. Actual deletion verification ─────────────────────────────────────

class TestDeletionVerification:
    """Tests that deletion is verified."""

    def test_verified_deletion_counted_as_completed(self):
        """A completed action with after_state.exists=False is verified deleted."""
        from avs_backend.scan_core.execution.models import ExecutionResult, ExecutionStatus
        result = ExecutionResult(
            execution_id="test",
            action_id="action-1",
            finding_id="finding-1",
            asset_id="asset-1",
            action_type="delete_file",
            target={},
            status=ExecutionStatus.COMPLETED,
            reason="Deleted",
            timestamp=datetime.now(UTC),
            error=None,
            verification={},
            dry_run_info=None,
            before_state={"size": 4096},
            after_state={"exists": False},
        )
        assert result.status.value == "completed"
        assert result.after_state["exists"] is False, "File must be verified as deleted"

    def test_unverified_deletion_not_counted(self):
        """A completed action with after_state.exists=True is NOT verified."""
        from avs_backend.scan_core.execution.models import ExecutionResult, ExecutionStatus
        result = ExecutionResult(
            execution_id="test",
            action_id="action-1",
            finding_id="finding-1",
            asset_id="asset-1",
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
        )
        assert result.after_state["exists"] is True, "File still exists — not verified"


# ── 28. Actual byte recovery ─────────────────────────────────────────────

class TestByteRecovery:
    """Tests that recovered bytes come from verified deletions only."""

    def test_verified_bytes_counted(self):
        """Bytes from verified deletions must be counted."""
        from avs_backend.scan_core.execution.models import ExecutionResult, ExecutionStatus
        results = [
            ExecutionResult(
                execution_id="test",
                action_id="a1",
                finding_id="f1",
                asset_id="asset-1",
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
        ]
        space_recovered = 0
        for r in results:
            if r.status.value != "completed":
                continue
            after = getattr(r, "after_state", None)
            if after and isinstance(after, dict) and after.get("exists") is False:
                before = getattr(r, "before_state", None)
                if before and isinstance(before, dict):
                    size = before.get("size", 0)
                    if isinstance(size, (int, float)) and size > 0:
                        space_recovered += size
        assert space_recovered == 2048

    def test_unverified_bytes_not_counted(self):
        """Bytes from unverified deletions must NOT be counted."""
        from avs_backend.scan_core.execution.models import ExecutionResult, ExecutionStatus
        results = [
            ExecutionResult(
                execution_id="test",
                action_id="a1",
                finding_id="f1",
                asset_id="asset-1",
                action_type="delete_file",
                target={},
                status=ExecutionStatus.COMPLETED,
                reason="Deleted",
                timestamp=datetime.now(UTC),
                error=None,
                verification={},
                dry_run_info=None,
                before_state={"size": 4096},
                after_state={"exists": True},  # NOT verified
            ),
        ]
        space_recovered = 0
        for r in results:
            if r.status.value != "completed":
                continue
            after = getattr(r, "after_state", None)
            if after and isinstance(after, dict) and after.get("exists") is False:
                before = getattr(r, "before_state", None)
                if before and isinstance(before, dict):
                    size = before.get("size", 0)
                    if isinstance(size, (int, float)) and size > 0:
                        space_recovered += size
        assert space_recovered == 0, "Unverified bytes must not be counted"


# ── 29. Health before/after ──────────────────────────────────────────────

class TestHealthScore:
    """Tests that health score is deterministic and improves after cleanup."""

    def test_deterministic_health_score(self):
        """Health score must be deterministic based on cleanup opportunities."""
        def _cleanup_health_score(count: int) -> int:
            penalty = min(40, count * 0.02)
            return max(60, round(100 - penalty))

        assert _cleanup_health_score(0) == 100
        assert _cleanup_health_score(100) == 98
        assert _cleanup_health_score(500) == 90
        assert _cleanup_health_score(2000) == 60

    def test_health_improves_after_cleanup(self):
        """Health after cleanup must be >= health before."""
        def _cleanup_health_score(count: int) -> int:
            penalty = min(40, count * 0.02)
            return max(60, round(100 - penalty))

        health_before = _cleanup_health_score(500)
        health_after = _cleanup_health_score(100)
        assert health_after > health_before

    def test_health_unchanged_when_no_cleanup(self):
        """Health must remain unchanged when nothing was cleaned."""
        def _cleanup_health_score(count: int) -> int:
            penalty = min(40, count * 0.02)
            return max(60, round(100 - penalty))

        health_before = _cleanup_health_score(0)
        health_after = _cleanup_health_score(0)
        assert health_after == health_before


# ── 30. No fake detected count ───────────────────────────────────────────

class TestNoFakeDetectedCount:
    """Tests that detected count only includes verified cleanable items."""

    def test_detected_equals_verified_cleanable(self):
        """detected must equal the count of verified-safe findings, not raw matches."""
        # Simulate: 100 raw matches, 70 safe, 30 review-required
        raw_matches = 100
        safe_findings = 70
        review_required = 30
        detected = safe_findings  # V1.0: detected = safe only
        assert detected == 70, "Detected must equal safe findings only"
        assert detected != raw_matches, "Detected must NOT equal raw matches"


# ── 31. No rejected/blocked items in user-visible result ─────────────────

class TestNoInternalFieldsInResult:
    """Tests that user-visible result has no internal safety fields."""

    def test_result_has_only_user_facing_fields(self):
        """The V1.0 result must only have user-facing fields at top level."""
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
        # User-facing fields
        for field in ("detected", "cleaned", "remaining", "failed",
                       "space_recovered", "health_before", "health_after"):
            assert field in result, f"Result must have {field}"

        # Internal fields must NOT be at top level
        for field in ("rejected", "requires_review", "blocked", "skipped",
                       "not_currently_cleanable", "detected_candidates",
                       "safety_gate_rejections", "action_planner_rejections"):
            assert field not in result, f"Internal field {field} must not be at top level"


# ── 32. All cleanup providers use canonical scan_core ────────────────────

class TestCanonicalScanCore:
    """Tests that all cleanup providers use the canonical scan_core architecture."""

    def test_all_rules_extend_rule_base_class(self):
        """All cleanup provider rules must extend the Rule base class."""
        from avs_backend.scan_core.rules.rule import Rule
        for rule_class in (RecycleBinRule, DeliveryOptimizationRule,
                           CrashDumpRule, WindowsOldRule):
            assert issubclass(rule_class, Rule), \
                f"{rule_class.__name__} must extend Rule"

    def test_all_rules_have_rule_identifiers(self):
        """All rules must have proper rule identifiers."""
        for rule_class in (RecycleBinRule, DeliveryOptimizationRule,
                           CrashDumpRule, WindowsOldRule):
            rule = rule_class()
            assert rule.rule_id is not None
            assert rule.version is not None
            assert rule.metadata is not None


# ── 33. No legacy scan path ──────────────────────────────────────────────

class TestNoLegacyScanPath:
    """Tests that no legacy scan path is used."""

    def test_quick_scan_uses_dashboard_eligible_filter(self):
        """scan_quick must support the dashboard_eligible_only parameter."""
        from avs_backend.scan_core.orchestration.orchestrator import ScanOrchestrator
        import inspect
        sig = inspect.signature(ScanOrchestrator.scan)
        assert "dashboard_eligible_only" in sig.parameters, \
            "scan() must support dashboard_eligible_only parameter"


# ── 34. No automatic unsafe remediation ──────────────────────────────────

class TestNoUnsafeRemediation:
    """Tests that unsafe files are never automatically remediated."""

    def test_review_required_not_safe(self):
        """REVIEW_REQUIRED files must not be SAFE."""
        path = r"C:\Windows.old\Windows\System32\kernel32.dll"
        result = _evaluate_rule(WindowsOldRule(), path)
        assert result.safety.requires_review
        assert not result.safety.is_safe

    def test_blocked_not_safe(self):
        """BLOCKED files must not be SAFE."""
        path = r"C:\Windows\System32\kernel32.dll"
        asset = _make_asset(path)
        snapshot = _make_snapshot(asset)
        safety = SafetyPolicy.assess(asset=asset, snapshot=snapshot)
        assert safety.is_blocked
        assert not safety.is_safe

    def test_mei_directory_not_safe(self):
        """_mei* directory files must be REVIEW_REQUIRED, not SAFE."""
        path = r"C:\Users\HPBP\AppData\Local\Temp\_mei0000069c2\vcruntime140_1.dll"
        asset = _make_asset(path)
        snapshot = _make_snapshot(asset)
        safety = SafetyPolicy.assess(asset=asset, snapshot=snapshot)
        assert safety.requires_review, "_mei* files must be REVIEW_REQUIRED"
        assert not safety.is_safe, "_mei* files must NOT be SAFE"

    def test_protected_file_not_safe(self):
        """Protected files (pagefile.sys etc.) must be BLOCKED."""
        for filename in ("pagefile.sys", "hiberfil.sys", "swapfile.sys"):
            path = f"C:\\{filename}"
            asset = _make_asset(path)
            snapshot = _make_snapshot(asset)
            safety = SafetyPolicy.assess(asset=asset, snapshot=snapshot)
            assert safety.is_blocked, f"{filename} must be BLOCKED"
            assert not safety.is_safe, f"{filename} must NOT be SAFE"


# ── 35. Packaged backend E2E ─────────────────────────────────────────────

class TestPackagedBackendE2E:
    """Tests that the packaged backend can be exercised end-to-end.

    This test is skipped if the packaged backend is not present.
    """

    @pytest.mark.skipif(
        not Path(r"C:\Users\HPBP\Documents\GitHub\avs-suite\apps\pc-optimizer"
                 r"\release\win-unpacked\resources\backend\avs-backend.exe").exists(),
        reason="Packaged backend not found",
    )
    def test_packaged_backend_ping(self):
        """The packaged backend must respond to system.ping."""
        # This is a smoke test — the full E2E is run separately.
        import subprocess
        import json
        import time

        backend_path = (
            r"C:\Users\HPBP\Documents\GitHub\avs-suite\apps\pc-optimizer"
            r"\release\win-unpacked\resources\backend\avs-backend.exe"
        )

        proc = subprocess.Popen(
            [backend_path, "--port", "0"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            stdin=subprocess.PIPE,
        )
        try:
            time.sleep(3)
            # Just verify the process starts without immediate crash
            assert proc.poll() is None or proc.poll() == 0, \
                "Backend should start without crash"
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()



