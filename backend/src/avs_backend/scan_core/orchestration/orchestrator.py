"""SC-8C5 Scan orchestrator — end-to-end scan workflow."""

from __future__ import annotations

import logging
import math
from datetime import UTC, datetime
from typing import Any, Callable, Optional

from ..adapters.adapter_registry import convert_to_asset
from ..assets import AssetCategory, AssetType, ScanAsset
from ..context import ScanContext, ScanType
from ..context.asset_snapshot import AssetSnapshot, create_snapshot_from_asset
from ..context.scan_context import (
    generate_machine_id_hash,
    generate_scan_id,
    generate_user_id_hash,
)
from ..metadata.action_plan_repository import ActionPlanRepository
from ..metadata.asset_repository import AssetRepository
from ..metadata.context_repository import ContextRepository
from ..metadata.database import MetadataDatabase
from ..metadata.scan_history_repository import ScanHistoryRepository
from ..metadata.snapshot_repository import SnapshotRepository
from ..rules.action import ActionPlan, ActionPlanner, ActionState
from ..rules.actionability import Actionability, CapabilityContract
from ..rules.aggregation import DetectionAggregator
from ..rules.enums import RuleCategory
from ..rules.evaluator import CancellationToken, RuleEvaluator
from ..rules.priority import FindingPrioritizer, RuleCapability
from ..rules.registry import RuleRegistry
from .discovery import DiscoveryEngine, FilesystemDiscoveryEngine
from .models import ScanOrchestratorError, ScanProgress, ScanResult

logger = logging.getLogger(__name__)

ProgressCallback = Callable[[ScanProgress], None]


class ScanOrchestrator:
    """High-level orchestration for the AVS Shield scan workflow."""

    def __init__(
        self,
        database: MetadataDatabase,
        registry: RuleRegistry,
        *,
        capability_contract: Optional[CapabilityContract] = None,
        discovery_engines: Optional[dict[str, DiscoveryEngine]] = None,
        snapshot_ttl_seconds: int = 3600,
    ) -> None:
        """Initialize the orchestrator with persistent storage and rules."""
        if not isinstance(snapshot_ttl_seconds, int) or snapshot_ttl_seconds < 1:
            raise ValueError("snapshot_ttl_seconds must be a positive integer")
        self._db = database
        self._registry = registry
        self._capability_contract = capability_contract or CapabilityContract()
        self._asset_repo = AssetRepository(database)
        self._snapshot_repo = SnapshotRepository(database)
        self._context_repo = ContextRepository(database)
        self._action_plan_repo = ActionPlanRepository(database)
        self._history_repo = ScanHistoryRepository(database)
        self._evaluator = RuleEvaluator(
            registry,
            asset_repository=self._asset_repo,
            snapshot_repository=self._snapshot_repo,
        )
        self._snapshot_ttl_seconds = snapshot_ttl_seconds
        self._discovery_engines = dict(discovery_engines or {})
        if not self._discovery_engines:
            self._discovery_engines["filesystem"] = FilesystemDiscoveryEngine()
        self._tokens: dict[str, CancellationToken] = {}

    # ── Public API ──────────────────────────────────────────────────────────

    def scan(
        self,
        scan_type: ScanType = ScanType.FULL,
        scope: Optional[list[str]] = None,
        *,
        on_progress: Optional[ProgressCallback] = None,
        generate_action_plan: bool = True,
    ) -> ScanResult:
        """Run a complete scan workflow and return an immutable result."""
        scan_id = generate_scan_id()
        token = CancellationToken()
        self._tokens[scan_id] = token
        started_at = datetime.now(UTC)
        orchestrator_errors: list[ScanOrchestratorError] = []

        try:
            scan_context = self._create_context(scan_id, scan_type, scope)
            self._context_repo.create(scan_context)
            self._emit_progress(
                scan_id,
                on_progress,
                "initializing",
                "scan context persisted",
            )

            discovered_count, asset_lookup, size_lookup, discovery_errors = (
                self._run_discovery(scan_context, token, on_progress)
            )
            orchestrator_errors.extend(discovery_errors)

            self._emit_progress(
                scan_id,
                on_progress,
                "evaluating",
                "evaluating rules",
                assets_discovered=discovered_count,
            )
            eval_batch = self._evaluator.evaluate_scan(
                scan_context,
                cancellation_token=token,
            )

            self._emit_progress(
                scan_id,
                on_progress,
                "aggregating",
                "aggregating findings",
                assets_discovered=discovered_count,
                assets_evaluated=eval_batch.statistics.assets_evaluated,
                findings=eval_batch.statistics.matches,
            )
            aggregation = self._aggregate(eval_batch, asset_lookup)

            self._emit_progress(
                scan_id,
                on_progress,
                "prioritizing",
                "prioritizing findings",
                assets_discovered=discovered_count,
                assets_evaluated=eval_batch.statistics.assets_evaluated,
                findings=len(aggregation.findings),
            )
            prioritized = self._prioritize(aggregation, size_lookup)

            action_plan: Optional[ActionPlan] = None
            if generate_action_plan and not token.is_cancelled:
                self._emit_progress(
                    scan_id,
                    on_progress,
                    "planning",
                    "building action plan",
                    assets_discovered=discovered_count,
                    assets_evaluated=eval_batch.statistics.assets_evaluated,
                    findings=len(prioritized.priorities),
                )
                action_plan = self._plan(prioritized, scan_context)
                if action_plan is not None and action_plan.plan_id is not None:
                    try:
                        self._action_plan_repo.save(action_plan, status="PLANNED")
                    except Exception as exc:
                        orchestrator_errors.append(
                            ScanOrchestratorError(
                                phase="planning",
                                component="ActionPlanRepository",
                                message=str(exc),
                                recoverable=True,
                            )
                        )

            completed_at = datetime.now(UTC)
            elapsed_ms = int((completed_at - started_at).total_seconds() * 1000)
            scan_context = self._finalize_context(
                scan_context,
                token,
                discovered_count,
                orchestrator_errors,
                eval_batch.statistics.failures,
            )
            result = self._build_result(
                scan_context,
                elapsed_ms,
                eval_batch,
                aggregation,
                prioritized,
                action_plan,
                orchestrator_errors,
            )
            self._save_scan_history(result)
            return result
        finally:
            self._tokens.pop(scan_id, None)

    def scan_quick(
        self,
        scope: Optional[list[str]] = None,
        *,
        on_progress: Optional[ProgressCallback] = None,
        generate_action_plan: bool = True,
    ) -> ScanResult:
        """Run a quick scan."""
        return self.scan(
            ScanType.QUICK,
            scope=scope,
            on_progress=on_progress,
            generate_action_plan=generate_action_plan,
        )

    def scan_full(
        self,
        scope: Optional[list[str]] = None,
        *,
        on_progress: Optional[ProgressCallback] = None,
        generate_action_plan: bool = True,
    ) -> ScanResult:
        """Run a full scan."""
        return self.scan(
            ScanType.FULL,
            scope=scope,
            on_progress=on_progress,
            generate_action_plan=generate_action_plan,
        )

    def get_latest_scan_history(self) -> Optional[dict[str, Any]]:
        """Return the latest persisted scan history record."""
        return self._history_repo.get_latest()

    def list_scan_history(self, limit: int = 10) -> list[dict[str, Any]]:
        """Return the most recent persisted scan history records."""
        return self._history_repo.list_recent(limit)

    def get_plan_details(self, plan_id: str) -> dict[str, Any]:
        """Return a read-only, privacy-safe view of a persisted ActionPlan."""
        action_plan = self._action_plan_repo.load(plan_id)
        if action_plan is None:
            return {"ok": False, "error": "Plan not found"}

        actions = action_plan.actions
        findings: list[dict[str, Any]] = []
        for action in actions:
            severity = "info"
            if action.priority_score >= 80:
                severity = "critical"
            elif action.priority_score >= 60:
                severity = "high"
            elif action.priority_score >= 40:
                severity = "medium"
            elif action.priority_score >= 20:
                severity = "low"

            display_name = (
                action.rule_id.replace("-", " ").replace("_", " ").title()
                if action.rule_id
                else action.action_type.value.replace("_", " ").title()
            )

            finding = {
                "finding_id": action.finding_id or action.action_id,
                "display_name": display_name,
                "rule_id": action.rule_id,
                "rule_category": action.action_type.value,
                "severity": severity,
                "confidence": 1.0,
                "safety": action.safety_assessment or "unknown",
                "reason": action.reason or "",
                "recommended_action": action.action_type.value.replace("_", " "),
                "estimated_size": action.estimated_size or 0,
                "is_blocked": action.is_blocked,
                "requires_review": action.requires_review,
                "is_actionable": action.is_actionable,
                "canonical_path": "",
            }
            findings.append(finding)

        summary = action_plan.summary
        statistics: dict[str, Any] = {
            "matches": summary.total_findings,
            "actionable": summary.auto_fixable_actions,
            "blocked": summary.blocked_actions,
            "review": summary.review_required_actions,
            "not_fixable": summary.not_fixable_actions,
            "total_findings": summary.total_findings,
            "actions_planned": summary.actions_planned,
            "estimated_affected_size": summary.estimated_affected_size,
            "generated_at": summary.generated_at.isoformat(),
        }

        return {
            "ok": True,
            "plan_id": plan_id,
            "generated_at": action_plan.generated_at.isoformat(),
            "is_stale": action_plan.is_stale(),
            "statistics": statistics,
            "findings": findings,
        }

    def _save_scan_history(self, result: ScanResult) -> bool:
        """Persist a privacy-safe scan result summary."""
        actionability = result.actionability_summary
        stats = result.statistics
        record = {
            "scan_id": result.scan_id,
            "scan_type": result.scan_type,
            "started_at": result.started_at.isoformat(),
            "completed_at": result.completed_at.isoformat(),
            "duration_ms": result.elapsed_time_ms,
            "cancelled": result.cancelled,
            "completed": not result.cancelled,
            "error_count": len(result.errors) or 0,
            "findings_count": len(result.findings),
            "action_plan_id": result.action_plan_id,
            "actionable_count": actionability.get("actionable", 0),
            "review_count": actionability.get("review_required", 0),
            "blocked_count": actionability.get("blocked", 0),
            "not_fixable_count": actionability.get("not_fixable", 0),
            "statistics": {
                "assets_discovered": stats.get("assets_discovered", 0),
                "assets_evaluated": stats.get("assets_evaluated", 0),
                "matches": stats.get("matches", 0),
                "findings_count": stats.get("findings_count", 0),
                "actions_total": stats.get("actions_total", 0),
                "actions_planned": stats.get("actions_planned", 0),
                "actions_review_required": stats.get("actions_review_required", 0),
                "actions_blocked": stats.get("actions_blocked", 0),
                "actions_not_fixable": stats.get("actions_not_fixable", 0),
                "errors_count": stats.get("errors_count", 0),
            },
        }
        return self._history_repo.save(record)

    def cancel_scan(self, scan_id: str) -> bool:
        """Request cancellation of a running scan."""
        token = self._tokens.get(scan_id)
        if token is not None:
            token.cancel()
            return True
        return False

    # ── Internal workflow ─────────────────────────────────────────────────────

    def _create_context(
        self,
        scan_id: str,
        scan_type: ScanType,
        scope: Optional[list[str]],
    ) -> ScanContext:
        """Create a privacy-safe scan context."""
        return ScanContext(
            scan_id=scan_id,
            started_at=datetime.now(UTC),
            scan_type=scan_type,
            requested_scope=scope or [],
            machine_id_hash=generate_machine_id_hash(),
            user_id_hash=generate_user_id_hash(),
            enumerators_used=sorted(self._discovery_engines.keys()),
        )

    def _run_discovery(
        self,
        scan_context: ScanContext,
        token: CancellationToken,
        on_progress: Optional[ProgressCallback],
    ) -> tuple[
        int, dict[str, Any], dict[str, Optional[int]], list[ScanOrchestratorError]
    ]:
        """Run discovery engines, convert assets, and persist snapshots."""
        asset_lookup: dict[str, tuple[Any, ...]] = {}
        size_lookup: dict[str, Optional[int]] = {}
        errors: list[ScanOrchestratorError] = []
        discovered_count = 0
        batch_assets: list[ScanAsset] = []
        batch_snapshots: list[AssetSnapshot] = []
        batch_size = 500

        engine_names = sorted(self._discovery_engines.keys())
        for engine_name in engine_names:
            if token.is_cancelled:
                break
            engine = self._discovery_engines[engine_name]
            self._emit_progress(
                scan_context.scan_id,
                on_progress,
                "discovery",
                f"enumerating {engine_name}",
                assets_discovered=discovered_count,
            )
            try:
                for raw in engine.enumerate(scan_context, token):
                    if token.is_cancelled:
                        break
                    discovered_count += 1
                    if discovered_count % 500 == 0:
                        self._emit_progress(
                            scan_context.scan_id,
                            on_progress,
                            "discovery",
                            f"{engine_name}: {discovered_count} items discovered",
                            assets_discovered=discovered_count,
                        )
                    try:
                        asset = convert_to_asset(raw)
                    except (ValueError, TypeError) as exc:
                        errors.append(
                            ScanOrchestratorError(
                                phase="discovery",
                                component=engine_name,
                                message=str(exc)[:200],
                                recoverable=True,
                            )
                        )
                        continue

                    raw_size = asset.custom_metadata.get("size")
                    asset_size = (
                        raw_size
                        if isinstance(raw_size, int) and not isinstance(raw_size, bool)
                        else None
                    )
                    snapshot = create_snapshot_from_asset(
                        asset_id=asset.asset_id,
                        scan_id=scan_context.scan_id,
                        exists=asset.exists,
                        accessible=asset.accessible,
                        locked=asset.locked,
                        size=asset_size,
                        modified_time=asset.modified_at,
                        content_fingerprint="",
                        metadata_fingerprint="",
                        canonical_path=asset.canonical_path,
                        attributes={"canonical_path": asset.canonical_path},
                    )
                    asset_lookup[asset.asset_id] = (
                        asset.asset_type,
                        asset.asset_category,
                        asset.display_name,
                        asset.canonical_path,
                    )
                    size_lookup[asset.asset_id] = asset_size
                    batch_assets.append(asset)
                    batch_snapshots.append(snapshot)

                    if len(batch_assets) >= batch_size:
                        self._save_batch(batch_assets, batch_snapshots, errors)
                        batch_assets = []
                        batch_snapshots = []
            except Exception as exc:
                errors.append(
                    ScanOrchestratorError(
                        phase="discovery",
                        component=engine_name,
                        message=str(exc)[:200],
                        recoverable=True,
                    )
                )

        if batch_assets:
            self._save_batch(batch_assets, batch_snapshots, errors)

        return discovered_count, asset_lookup, size_lookup, errors

    def _save_batch(
        self,
        assets: list[ScanAsset],
        snapshots: list[AssetSnapshot],
        errors: list[ScanOrchestratorError],
    ) -> None:
        """Persist a batch of assets and snapshots, recording recoverable errors."""
        try:
            self._asset_repo.upsert_many(assets)
        except Exception as exc:
            errors.append(
                ScanOrchestratorError(
                    phase="discovery",
                    component="AssetRepository",
                    message=str(exc)[:200],
                    recoverable=True,
                )
            )
        try:
            self._snapshot_repo.save_many(snapshots)
        except Exception as exc:
            errors.append(
                ScanOrchestratorError(
                    phase="discovery",
                    component="SnapshotRepository",
                    message=str(exc)[:200],
                    recoverable=True,
                )
            )

    def _aggregate(
        self,
        eval_batch: Any,
        asset_lookup: dict[str, tuple[Any, ...]],
    ) -> Any:
        """Aggregate rule matches into deterministic findings."""
        matches = eval_batch.get_matches()

        def resolve_asset(asset_id: str) -> tuple[Any, ...]:
            if asset_id in asset_lookup:
                return asset_lookup[asset_id]
            return (
                AssetType.UNKNOWN,
                AssetCategory.UNKNOWN,
                f"Unknown ({asset_id[:8]}...)",
                "",
            )

        rule_category_cache = self._build_rule_category_cache()

        def resolve_rule_category(rule_id: str) -> RuleCategory:
            return rule_category_cache.get(rule_id, RuleCategory.CUSTOM)

        aggregator = DetectionAggregator(
            asset_lookup=resolve_asset,
            rule_category_resolver=resolve_rule_category,
        )
        return aggregator.aggregate(matches)

    def _prioritize(
        self,
        aggregation: Any,
        size_lookup: dict[str, Optional[int]],
    ) -> Any:
        """Prioritize findings using the capability contract."""
        rule_cap_resolver = self._build_rule_capability_resolver()

        def resolve_size(asset_id: str) -> Optional[int]:
            return size_lookup.get(asset_id)

        prioritizer = FindingPrioritizer(
            rule_capability_resolver=rule_cap_resolver,
            asset_size_resolver=resolve_size,
        )
        return prioritizer.prioritize(aggregation)

    def _plan(
        self,
        prioritized: Any,
        scan_context: ScanContext,
    ) -> ActionPlan:
        """Build an ActionPlan from prioritized findings."""

        def _resolve_snapshot(asset_id: str) -> Any:
            return self._snapshot_repo.get(
                asset_id, scan_context.scan_id
            ) or self._snapshot_repo.get_latest(asset_id)

        planner = ActionPlanner(
            asset_snapshot_resolver=_resolve_snapshot,  # type: ignore[arg-type]
            capability_contract=self._capability_contract,
            snapshot_ttl_seconds=self._snapshot_ttl_seconds,
        )
        return planner.plan(prioritized)

    def _finalize_context(
        self,
        scan_context: ScanContext,
        token: CancellationToken,
        discovered_count: int,
        orchestrator_errors: list[ScanOrchestratorError],
        evaluation_failures: int,
    ) -> ScanContext:
        """Finalize and persist scan context counts."""
        scan_context.assets_discovered = discovered_count
        scan_context.assets_failed = sum(
            1 for e in orchestrator_errors if e.phase == "discovery"
        )
        scan_context.error_count = len(orchestrator_errors) + evaluation_failures
        scan_context.cancelled = token.is_cancelled
        scan_context.completed = True
        scan_context.mark_completed()
        self._context_repo.complete(scan_context.scan_id, scan_context)
        return scan_context

    def _build_result(
        self,
        scan_context: ScanContext,
        elapsed_ms: int,
        eval_batch: Any,
        aggregation: Any,
        prioritized: Any,
        action_plan: Optional[ActionPlan],
        orchestrator_errors: list[ScanOrchestratorError],
    ) -> ScanResult:
        """Assemble the immutable ScanResult."""
        findings = tuple(f.to_dict() for f in aggregation.findings)
        action_plan_id = action_plan.plan_id if action_plan is not None else None

        stats: dict[str, Any] = {
            "assets_discovered": scan_context.assets_discovered,
            "assets_failed": scan_context.assets_failed,
            "assets_skipped": scan_context.assets_skipped,
            "rules_considered": eval_batch.statistics.rules_considered,
            "rules_evaluated": eval_batch.statistics.rules_evaluated,
            "matches": eval_batch.statistics.matches,
            "findings_count": len(aggregation.findings),
            "actions_total": len(action_plan.actions) if action_plan else 0,
            "actions_planned": self._count_actions(action_plan, "planned"),
            "actions_review_required": self._count_actions(
                action_plan, "review_required"
            ),
            "actions_blocked": self._count_actions(action_plan, "blocked"),
            "actions_not_fixable": self._count_actions(action_plan, "not_fixable"),
            "errors_count": scan_context.error_count,
        }

        return ScanResult(
            scan_id=scan_context.scan_id,
            scan_type=scan_context.scan_type.value,
            started_at=scan_context.started_at,
            completed_at=scan_context.completed_at or datetime.now(UTC),
            elapsed_time_ms=elapsed_ms,
            statistics=stats,
            findings=findings,
            aggregation_summary=aggregation.summary.to_dict(),
            priority_summary=prioritized.summary.to_dict(),
            actionability_summary=self._actionability_summary(action_plan),
            action_plan_id=action_plan_id,
            errors=tuple(orchestrator_errors),
            warnings=tuple(str(e) for e in eval_batch.errors),
            cancelled=scan_context.cancelled,
        )

    # ── Helpers ─────────────────────────────────────────────────────────────

    def _emit_progress(
        self,
        scan_id: str,
        on_progress: Optional[ProgressCallback],
        phase: str,
        current_operation: str,
        *,
        assets_discovered: int = 0,
        assets_evaluated: int = 0,
        findings: int = 0,
        actions_available: int = 0,
    ) -> None:
        """Emit an immutable progress snapshot."""
        if on_progress is None:
            return
        # Map phases to completion percentages so the UI can show real progress.
        # Discovery is the longest phase; use a sub-range within it based on
        # assets discovered (capped at 45% since we don't know the total upfront).
        PHASE_PERCENT = {
            "initializing": 2.0,
            "discovery": 10.0,
            "evaluating": 55.0,
            "aggregating": 75.0,
            "prioritizing": 85.0,
            "planning": 95.0,
        }
        base_percent = PHASE_PERCENT.get(phase, 0.0)
        if phase == "discovery" and assets_discovered > 0:
            # Scale within discovery range (10% → 50%) using a log scale
            # so early files show progress but it doesn't jump to 50% too fast.
            base_percent = min(50.0, 10.0 + math.log10(assets_discovered + 1) * 5.0)
        on_progress(
            ScanProgress(
                scan_id=scan_id,
                phase=phase,
                current_operation=current_operation,
                assets_discovered=assets_discovered,
                assets_evaluated=assets_evaluated,
                findings=findings,
                actions_available=actions_available,
                completion_percent=base_percent,
            )
        )

    def _build_rule_category_cache(self) -> dict[str, RuleCategory]:
        """Build a cache of rule_id -> category from the registry."""
        cache: dict[str, RuleCategory] = {}
        for rule in self._registry.list_all():
            cache[rule.rule_id] = rule.metadata.category
        return cache

    def _build_rule_capability_resolver(self) -> Callable[[str], RuleCapability]:
        """Return a resolver that maps rule categories to capabilities."""
        supported_categories = {
            category
            for (category, _, _), verdict in self._capability_contract._matrix.items()
            if verdict == Actionability.ACTIONABLE
        }

        def resolve(rule_id: str) -> RuleCapability:
            rule = self._registry.get(rule_id)
            if rule is not None and rule.metadata.category in supported_categories:
                return RuleCapability.REMEDIATION_AVAILABLE
            return RuleCapability.NO_REMEDIATION

        return resolve

    def _count_actions(
        self,
        action_plan: Optional[ActionPlan],
        state_value: str,
    ) -> int:
        """Count actions with a given state value."""
        if action_plan is None:
            return 0
        return sum(1 for a in action_plan.actions if a.state.value == state_value)

    def _actionability_summary(
        self, action_plan: Optional[ActionPlan]
    ) -> dict[str, int]:
        """Build a summary of actionability outcomes from the action plan."""
        if action_plan is None:
            return {
                "total": 0,
                "actionable": 0,
                "review_required": 0,
                "blocked": 0,
                "not_fixable": 0,
                "missing_or_locked_target": 0,
            }
        total = len(action_plan.actions)
        actionable = self._count_actions(action_plan, ActionState.PLANNED.value)
        review = self._count_actions(action_plan, ActionState.REVIEW_REQUIRED.value)
        blocked = self._count_actions(action_plan, ActionState.BLOCKED.value)
        not_fixable = self._count_actions(action_plan, ActionState.NOT_FIXABLE.value)
        missing_or_locked = (
            self._count_actions(action_plan, ActionState.MISSING_TARGET.value)
            + self._count_actions(action_plan, ActionState.LOCKED_TARGET.value)
            + self._count_actions(action_plan, ActionState.CONFLICT.value)
        )
        return {
            "total": total,
            "actionable": actionable,
            "review_required": review,
            "blocked": blocked,
            "not_fixable": not_fixable,
            "missing_or_locked_target": missing_or_locked,
        }
