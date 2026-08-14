"""
SC-8C4 Part 4 — Safe browser cache remediation tests.

All destructive operations run against pytest temporary directories.
No real browser profile is modified.
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Optional

import pytest

from avs_backend.scan_core.assets import AssetCategory, AssetType
from avs_backend.scan_core.execution import (
    BackupManager,
    BrowserContext,
    DefaultExecutor,
    ExecutionRequest,
    ExecutionStatus,
)
from avs_backend.scan_core.rules.action import ActionPlan, ActionPlanner
from avs_backend.scan_core.rules.aggregation import DetectionAggregator
from avs_backend.scan_core.rules.confidence import Confidence, ConfidenceScore
from avs_backend.scan_core.rules.enums import (
    ActionType,
    ConfidenceFactor,
    EvidenceType,
    RuleCategory,
    SafetyBlocker,
    SafetyLevel,
    Severity,
)
from avs_backend.scan_core.rules.evidence import Evidence, EvidenceCollection
from avs_backend.scan_core.rules.priority import FindingPrioritizer, RuleCapability
from avs_backend.scan_core.rules.result import RuleMatchStatus, RuleResult
from avs_backend.scan_core.rules.safety import SafetyAssessment


@dataclass
class _Snapshot:
    exists: bool = True
    is_accessible: bool = True
    is_locked: bool = False
    canonical_path: str = ""
    asset_id: str = "asset-0"
    size: Optional[int] = None
    content_hash: Optional[str] = None
    modified_time: Optional[datetime] = None
    snapshot_timestamp: Optional[datetime] = None
    snapshot_version: Optional[str] = None
    is_symlink: bool = False
    is_junction: bool = False
    is_reparse_point: bool = False


# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_confidence() -> Confidence:
    return Confidence(
        score=90.0,
        factors=(
            ConfidenceScore(
                factor=ConfidenceFactor.RULE_CERTAINTY,
                score=90.0,
                description="test",
            ),
        ),
    )


def _make_evidence() -> EvidenceCollection:
    return EvidenceCollection(
        items=(
            Evidence(
                evidence_type=EvidenceType.PATH_MATCH,
                description="Test",
                source="test",
                value="x",
                weight=1.0,
            ),
        )
    )


def _make_result(
    rule_id: str = "browser.chrome.http_cache",
    asset_id: str = "asset-0",
    safety: Optional[SafetyAssessment] = None,
) -> RuleResult:
    return RuleResult(
        rule_id=rule_id,
        rule_version="1.0.0",
        asset_id=asset_id,
        status=RuleMatchStatus.MATCHED,
        severity=Severity.LOW,
        confidence=_make_confidence(),
        safety=safety or SafetyAssessment.create_safe("test"),
        reason="x",
        evidence=_make_evidence(),
        recommended_action=ActionType.DELETE,
        estimated_size=100,
        evaluated_at=datetime.now(UTC),
    )


def _rule_category_resolver(rule_id: str) -> RuleCategory:
    if rule_id.lower().startswith("browser"):
        return RuleCategory.BROWSER
    return RuleCategory.BROWSER


def _make_browser_plan(
    *,
    canonical_path: str,
    rule_id: str = "browser.chrome.http_cache",
    asset_id: str = "asset-0",
    browser: str = "chrome",
    profile: str = "default",
    safety: Optional[SafetyAssessment] = None,
    size: Optional[int] = None,
    modified_time: Optional[datetime] = None,
    content_hash: Optional[str] = None,
    running_browsers: tuple[str, ...] = (),
    browser_profiles: tuple[str, ...] = ("default",),
) -> tuple[ActionPlan, dict[str, Any]]:
    """Create a single-action browser cache plan."""
    lookup = {
        asset_id: (
            AssetType.BROWSER_CACHE,
            AssetCategory.BROWSER,
            "Test",
            canonical_path,
        )
    }
    result = _make_result(rule_id=rule_id, asset_id=asset_id, safety=safety)
    agg = DetectionAggregator(
        asset_lookup=lambda aid: lookup.get(
            aid, (AssetType.UNKNOWN, AssetCategory.UNKNOWN, f"U {aid}", "")
        ),
        rule_category_resolver=_rule_category_resolver,
    ).aggregate([result])
    prio = FindingPrioritizer(
        rule_capability_resolver=lambda r: RuleCapability.REMEDIATION_AVAILABLE
    ).prioritize(agg)
    plan = ActionPlanner(
        asset_snapshot_resolver=lambda aid: _Snapshot(
            canonical_path=canonical_path,
            asset_id=aid,
            size=size,
            modified_time=modified_time,
            content_hash=content_hash,
        ),
    ).plan(prio)

    ctx = BrowserContext(
        exists=True,
        accessible=True,
        locked=False,
        browser=browser,
        profile=profile,
        running=False,
        running_browsers=running_browsers,
        browser_profiles=browser_profiles,
        cache_type="cache",
        cache_scope=rule_id,
        canonical_path=canonical_path,
        asset_id=asset_id,
        size=size,
        modified_time=modified_time,
        content_hash=content_hash,
        symlink=False,
        junction=False,
        reparse_point=False,
        safety_level="safe",
    ).to_dict()

    return plan, ctx


@pytest.fixture
def live_browser_executor(tmp_path):
    return DefaultExecutor(backup_manager=BackupManager(tmp_path / "backups"))


@pytest.fixture
def dry_browser_executor():
    return DefaultExecutor()


# ── Dry-Run ───────────────────────────────────────────────────────────────────


class TestDryRun:
    def test_dry_run_does_not_modify(self, dry_browser_executor, tmp_path):
        cache = tmp_path / "Chrome" / "Default" / "Cache"
        cache.mkdir(parents=True)
        (cache / "f_000001").write_text("cached")
        canonical = str(cache)
        plan, ctx = _make_browser_plan(
            canonical_path=canonical,
            rule_id="browser.chrome.http_cache",
            asset_id="http-cache",
        )
        request = ExecutionRequest(
            plan=plan,
            mode="dry_run",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = dry_browser_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.DRY_RUN
        assert (cache / "f_000001").exists()
        info = summary.results[0].dry_run_info
        assert info.get("browser") == "chrome"
        assert info.get("profile") == "default"
        assert info.get("cache_type") == "cache"
        assert info.get("would_remove") is True

    def test_dry_run_reports_safety_decision(self, dry_browser_executor, tmp_path):
        cache = tmp_path / "Chrome" / "Default" / "Cache"
        cache.mkdir(parents=True)
        (cache / "f_000001").write_text("cached")
        canonical = str(cache)
        plan, ctx = _make_browser_plan(
            canonical_path=canonical,
            rule_id="browser.chrome.http_cache",
            asset_id="http-cache",
        )
        request = ExecutionRequest(
            plan=plan,
            mode="dry_run",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = dry_browser_executor.execute(request)
        info = summary.results[0].dry_run_info
        assert info.get("safety_decision") == "ALLOWED"
        assert info.get("children_count") == 1


# ── Allowed Cache Cleanup ─────────────────────────────────────────────────────


class TestAllowedCache:
    @pytest.mark.parametrize(
        "rule_id,browser",
        [
            ("browser.chrome.http_cache", "chrome"),
            ("browser.edge.http_cache", "edge"),
            ("browser.firefox.http_cache", "firefox"),
            ("browser.brave.http_cache", "brave"),
            ("browser.opera.http_cache", "opera"),
            ("browser.vivaldi.http_cache", "vivaldi"),
            ("browser.chromium.http_cache", "chromium"),
            ("browser.chrome.gpu_cache", "chrome"),
            ("browser.chrome.code_cache", "chrome"),
            ("browser.chrome.service_worker_cache", "chrome"),
        ],
    )
    def test_allowed_cache_cleaned(
        self, live_browser_executor, tmp_path, rule_id, browser
    ):
        cache = tmp_path / browser.title() / "Cache"
        cache.mkdir(parents=True)
        (cache / "data.bin").write_bytes(b"x" * 100)
        canonical = str(cache)
        plan, ctx = _make_browser_plan(
            canonical_path=canonical,
            rule_id=rule_id,
            asset_id="cache-asset",
            browser=browser,
        )
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = live_browser_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.COMPLETED
        assert not (cache / "data.bin").exists()

    def test_backup_created_and_can_restore(self, live_browser_executor, tmp_path):
        cache = tmp_path / "Chrome" / "Default" / "GPUCache"
        cache.mkdir(parents=True)
        (cache / "data.bin").write_bytes(b"preserve")
        canonical = str(cache)
        plan, ctx = _make_browser_plan(
            canonical_path=canonical,
            rule_id="browser.chrome.gpu_cache",
            asset_id="gpu-cache",
        )
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = live_browser_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.COMPLETED
        result = summary.results[0]
        assert result.backup_identity is not None
        record = live_browser_executor.backup_manager.get(result.backup_identity)
        assert record is not None
        assert Path(record.backup_location).exists()
        restore = live_browser_executor.backup_manager.restore(record)
        assert restore.success
        assert (cache / "data.bin").exists()


# ── User Data Denylist ────────────────────────────────────────────────────────


class TestUserData:
    @pytest.mark.parametrize(
        "rule_id",
        [
            "browser.chrome.cookies",
            "browser.chrome.history",
            "browser.chrome.bookmarks",
            "browser.chrome.login_data",
            "browser.chrome.passwords",
            "browser.chrome.autofill",
            "browser.chrome.extensions",
            "browser.chrome.session",
            "browser.chrome.preferences",
            "browser.chrome.sync_data",
            "browser.chrome.certificates",
        ],
    )
    def test_user_data_rejected(self, dry_browser_executor, tmp_path, rule_id):
        cache = tmp_path / "Chrome" / "Default" / "Cache"
        cache.mkdir(parents=True)
        (cache / "data.bin").write_bytes(b"x")
        canonical = str(cache)
        plan, ctx = _make_browser_plan(
            canonical_path=canonical,
            rule_id=rule_id,
            asset_id="user-data",
        )
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = dry_browser_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.REJECTED
        assert (cache / "data.bin").exists()


# ── Safety and Review ─────────────────────────────────────────────────────────


class TestSafety:
    def test_ambiguous_requires_review(self, dry_browser_executor, tmp_path):
        cache = tmp_path / "Chrome" / "Default" / "Cache"
        cache.mkdir(parents=True)
        (cache / "data.bin").write_bytes(b"x")
        canonical = str(cache)
        plan, ctx = _make_browser_plan(
            canonical_path=canonical,
            rule_id="browser.chrome.unknown_file",
            asset_id="unknown",
        )
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = dry_browser_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.REQUIRES_REVIEW

    def test_browser_running_requires_review(self, dry_browser_executor, tmp_path):
        cache = tmp_path / "Chrome" / "Default" / "Cache"
        cache.mkdir(parents=True)
        (cache / "data.bin").write_bytes(b"x")
        canonical = str(cache)
        plan, ctx = _make_browser_plan(
            canonical_path=canonical,
            rule_id="browser.chrome.http_cache",
            asset_id="running-cache",
            running_browsers=("chrome",),
        )
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = dry_browser_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.REQUIRES_REVIEW

    def test_wrong_profile_rejected(self, dry_browser_executor, tmp_path):
        cache = tmp_path / "Chrome" / "Other" / "Cache"
        cache.mkdir(parents=True)
        (cache / "data.bin").write_bytes(b"x")
        canonical = str(cache)
        plan, ctx = _make_browser_plan(
            canonical_path=canonical,
            rule_id="browser.chrome.http_cache",
            asset_id="wrong-profile",
            browser_profiles=("other",),
        )
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = dry_browser_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.REJECTED

    def test_wrong_browser_rejected(self, dry_browser_executor, tmp_path):
        cache = tmp_path / "Chrome" / "Default" / "Cache"
        cache.mkdir(parents=True)
        (cache / "data.bin").write_bytes(b"x")
        canonical = str(cache)
        plan, ctx = _make_browser_plan(
            canonical_path=canonical,
            rule_id="browser.chrome.http_cache",
            asset_id="wrong-browser",
            browser="firefox",
        )
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = dry_browser_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.REJECTED

    def test_forbidden_path_rejected(self, dry_browser_executor):
        canonical = r"C:\Windows\System32\browser_cache"
        plan, ctx = _make_browser_plan(
            canonical_path=canonical,
            rule_id="browser.chrome.http_cache",
            asset_id="forbidden",
        )
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = dry_browser_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.REJECTED

    def test_traversal_rejected(self, dry_browser_executor):
        canonical = r"C:\Users\Public\..\Windows\chrome_cache"
        plan, ctx = _make_browser_plan(
            canonical_path=canonical,
            rule_id="browser.chrome.http_cache",
            asset_id="traversal",
        )
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = dry_browser_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.REJECTED


# ── TOCTOU and State Mismatch ─────────────────────────────────────────────────


class TestTOCTOU:
    def test_changed_size_fails(self, live_browser_executor, tmp_path):
        cache = tmp_path / "Chrome" / "Default" / "Cache"
        cache.mkdir(parents=True)
        target = cache / "data.bin"
        target.write_bytes(b"short")
        canonical = str(cache)
        size = target.stat().st_size
        plan, ctx = _make_browser_plan(
            canonical_path=canonical,
            rule_id="browser.chrome.http_cache",
            asset_id="toctou-size",
            size=size,
        )
        target.write_bytes(b"this is a much longer value")
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = live_browser_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.FAILED
        assert target.exists()

    def test_missing_target_fails(self, live_browser_executor, tmp_path):
        cache = tmp_path / "Chrome" / "Default" / "Cache"
        cache.mkdir(parents=True)
        canonical = str(cache)
        plan, ctx = _make_browser_plan(
            canonical_path=canonical,
            rule_id="browser.chrome.http_cache",
            asset_id="missing",
        )
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = live_browser_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.FAILED


# ── Cancellation and Idempotency ──────────────────────────────────────────────


class TestCancellationAndIdempotency:
    def test_cancels_before_deletion(self, live_browser_executor, tmp_path):
        cache = tmp_path / "Chrome" / "Default" / "Cache"
        cache.mkdir(parents=True)
        (cache / "a.bin").write_bytes(b"x")
        (cache / "b.bin").write_bytes(b"y")
        canonical = str(cache)
        plan, ctx = _make_browser_plan(
            canonical_path=canonical,
            rule_id="browser.chrome.http_cache",
            asset_id="cancel-cache",
        )
        from avs_backend.scan_core.execution import CancellationToken

        token = CancellationToken()
        token.cancel()
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
            cancellation_token=token,
        )
        summary = live_browser_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.CANCELLED
        assert (cache / "a.bin").exists()
        assert (cache / "b.bin").exists()

    def test_idempotent_reexecution(self, live_browser_executor, tmp_path):
        cache = tmp_path / "Chrome" / "Default" / "Cache"
        cache.mkdir(parents=True)
        (cache / "data.bin").write_bytes(b"x")
        canonical = str(cache)
        plan, ctx = _make_browser_plan(
            canonical_path=canonical,
            rule_id="browser.chrome.http_cache",
            asset_id="idempotent",
        )
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        first = live_browser_executor.execute(request)
        assert first.results[0].status == ExecutionStatus.COMPLETED
        second = live_browser_executor.execute(request)
        assert second.results[0].status == ExecutionStatus.SKIPPED


# ── Symlink / Reparse Safety ──────────────────────────────────────────────────


class TestReparseSafety:
    @pytest.mark.skipif(
        sys.platform != "win32",
        reason="Windows-specific symlink reparse safety",
    )
    def test_symlink_cache_rejected(self, live_browser_executor, tmp_path):
        real = tmp_path / "real_cache"
        real.mkdir()
        (real / "data.bin").write_bytes(b"x")
        link = tmp_path / "Chrome" / "Default" / "Cache"
        link.parent.mkdir(parents=True)
        try:
            os.symlink(real, link, target_is_directory=True)
        except OSError as exc:
            pytest.skip(f"Cannot create symlink: {exc}")
        canonical = str(link)
        plan, ctx = _make_browser_plan(
            canonical_path=canonical,
            rule_id="browser.chrome.http_cache",
            asset_id="symlink-cache",
        )
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = live_browser_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.REJECTED
        assert (real / "data.bin").exists()


# ── Safety Gate and Scale ─────────────────────────────────────────────────────


class TestSafetyGateAndScale:
    def test_safety_gate_blocks_user_data(self, dry_browser_executor, tmp_path):
        safety = SafetyAssessment(
            level=SafetyLevel.BLOCKED,
            reason="Contains user data",
            blockers=(SafetyBlocker.USER_DATA,),
        )
        cache = tmp_path / "Chrome" / "Default" / "Cache"
        cache.mkdir(parents=True)
        canonical = str(cache)
        plan, ctx = _make_browser_plan(
            canonical_path=canonical,
            rule_id="browser.chrome.http_cache",
            asset_id="blocked",
            safety=safety,
        )
        request = ExecutionRequest(
            plan=plan,
            mode="live",
            execution_context={plan.actions[0].action_id: ctx},
        )
        summary = dry_browser_executor.execute(request)
        assert summary.results[0].status == ExecutionStatus.REJECTED

    def test_100_browser_actions_cannot_bypass_safety_gate(
        self, dry_browser_executor, tmp_path
    ):
        results = [_make_result(asset_id=f"cache-{i}") for i in range(100)]
        base = tmp_path / "Chrome" / "Default" / "Cache"
        base.mkdir(parents=True)
        lookup = {
            f"cache-{i}": (
                AssetType.BROWSER_CACHE,
                AssetCategory.BROWSER,
                "Test",
                str(base / f"group-{i}"),
            )
            for i in range(100)
        }
        # Inject one user-data action.
        lookup["cache-50"] = (
            AssetType.BROWSER_CACHE,
            AssetCategory.BROWSER,
            "Test",
            str(base / "cookies"),
        )
        results[50] = _make_result(
            rule_id="browser.chrome.cookies",
            asset_id="cache-50",
        )
        agg = DetectionAggregator(
            asset_lookup=lambda aid: lookup.get(
                aid, (AssetType.UNKNOWN, AssetCategory.UNKNOWN, f"U {aid}", "")
            ),
            rule_category_resolver=_rule_category_resolver,
        ).aggregate(results)
        prio = FindingPrioritizer(
            rule_capability_resolver=lambda r: RuleCapability.REMEDIATION_AVAILABLE
        ).prioritize(agg)
        plan = ActionPlanner(
            asset_snapshot_resolver=lambda aid: _Snapshot(
                canonical_path=lookup[aid][3],
                asset_id=aid,
            ),
        ).plan(prio)
        request = ExecutionRequest(plan=plan, mode="dry_run")
        summary = dry_browser_executor.execute(request)
        assert summary.total == 100
        assert any(r.status == ExecutionStatus.REJECTED for r in summary.results)
