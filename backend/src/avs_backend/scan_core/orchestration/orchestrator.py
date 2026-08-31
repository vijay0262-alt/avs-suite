"""SC-8C5 Scan orchestrator — end-to-end scan workflow."""

from __future__ import annotations

import logging
import math
import dataclasses
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
from ..rules.rule import Rule
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
        dashboard_eligible_only: bool = False,
        rule_categories: Optional[list[RuleCategory]] = None,
    ) -> ScanResult:
        """Run a complete scan workflow and return an immutable result.

        Args:
            scan_type: QUICK or FULL scan.
            scope: Optional list of paths to scan.
            on_progress: Optional progress callback.
            generate_action_plan: Whether to generate an action plan.
            dashboard_eligible_only: V1.0 Dashboard mode — only verified-safe
                findings become actions. Unsafe/non-cleanable items (locked,
                blocked, review-required, inaccessible) are excluded BEFORE
                the ActionPlanner, so the user only sees items that can be
                automatically cleaned. Internal diagnostic counts are still
                tracked in statistics.
            rule_categories: V1.0 Architecture separation — only run rules
                in the specified categories. When None, all enabled rules
                run (legacy behavior). When set (e.g. [RuleCategory.SECURITY]),
                only rules in those categories are evaluated, so the security
                scan does NOT scan for junk/temp files.
        """
        scan_id = generate_scan_id()
        token = CancellationToken()
        self._tokens[scan_id] = token
        started_at = datetime.now(UTC)
        orchestrator_errors: list[ScanOrchestratorError] = []

        # Performance instrumentation: track per-phase durations in ms.
        phase_timings: dict[str, int] = {}

        try:
            t0 = datetime.now(UTC)
            # V1.0: Invalidate the running-browsers cache so each scan
            # reflects the current process state, not a stale snapshot
            # from a prior scan.
            try:
                from ..rules.detection.junk_rules_ext import (
                    invalidate_running_browsers_cache,
                )
                invalidate_running_browsers_cache()
            except ImportError:
                pass
            scan_context = self._create_context(scan_id, scan_type, scope)
            self._context_repo.create(scan_context)
            phase_timings["initialization_ms"] = int(
                (datetime.now(UTC) - t0).total_seconds() * 1000
            )
            self._emit_progress(
                scan_id,
                on_progress,
                "initializing",
                "scan context persisted",
            )

            t1 = datetime.now(UTC)
            # V1.0: For quick scans (Dashboard), skip persisting individual
            # assets/snapshots to the database during discovery. This eliminates
            # 60+ batch DB writes for 86,000+ files, reducing discovery from
            # ~500s to ~10s. The in-memory pairs are used for evaluation, and
            # only the action plan is persisted.
            skip_persistence = scan_type == ScanType.QUICK
            discovered_count, asset_lookup, size_lookup, snapshot_lookup, discovery_errors, in_memory_pairs = (
                self._run_discovery(scan_context, token, on_progress, skip_persistence=skip_persistence)
            )
            phase_timings["discovery_ms"] = int(
                (datetime.now(UTC) - t1).total_seconds() * 1000
            )
            orchestrator_errors.extend(discovery_errors)

            self._emit_progress(
                scan_id,
                on_progress,
                "evaluating",
                "evaluating rules",
                assets_discovered=discovered_count,
            )
            t2 = datetime.now(UTC)
            # V1.0 Architecture separation: filter rules by category when
            # rule_categories is specified. This ensures the security scan
            # only runs security rules, not junk/temp rules.
            eval_rules: Optional[list[Rule]] = None
            if rule_categories is not None:
                all_rules = self._registry.list_enabled()
                eval_rules = [
                    r for r in all_rules
                    if r.metadata.category in rule_categories
                ]
            # V1.0: Use in-memory evaluation to avoid 100,000+ individual
            # asset_repository.get() DB calls that made large Temp scans
            # take 10+ minutes. The orchestrator already has all assets
            # and snapshots in memory from discovery.
            eval_batch = self._evaluator.evaluate_in_memory(
                in_memory_pairs,
                scan_context=scan_context,
                rules=eval_rules,
                cancellation_token=token,
            )
            phase_timings["evaluation_ms"] = int(
                (datetime.now(UTC) - t2).total_seconds() * 1000
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
            t3 = datetime.now(UTC)
            aggregation = self._aggregate(eval_batch, asset_lookup)
            phase_timings["aggregation_ms"] = int(
                (datetime.now(UTC) - t3).total_seconds() * 1000
            )

            # V1.0 Dashboard eligibility filter:
            # For Dashboard automatic cleanup, ONLY verified-safe findings
            # become actions. Locked, blocked, review-required, and
            # inaccessible items are excluded BEFORE the ActionPlanner.
            # This ensures: detected = verified cleanable, cleaned ≈ detected.
            # The SafetyGate remains as the final barrier but should approve
            # nearly all actions because unsafe items were already filtered.
            excluded_count = 0
            if dashboard_eligible_only:
                safe_findings = tuple(
                    f for f in aggregation.findings if f.safety.is_safe
                )
                excluded_count = len(aggregation.findings) - len(safe_findings)
                if excluded_count > 0:
                    # Rebuild aggregation with only safe findings
                    from ..rules.aggregation import (
                        AggregationResult,
                        DetectionSummary,
                    )
                    safe_summary = self._build_safe_summary(safe_findings)
                    aggregation = AggregationResult(
                        findings=safe_findings,
                        groups=(),  # Groups not needed for Dashboard
                        summary=safe_summary,
                    )
                    logger.info(
                        "V1.0 Dashboard filter: %d safe findings, %d excluded",
                        len(safe_findings),
                        excluded_count,
                    )

            self._emit_progress(
                scan_id,
                on_progress,
                "prioritizing",
                "prioritizing findings",
                assets_discovered=discovered_count,
                assets_evaluated=eval_batch.statistics.assets_evaluated,
                findings=len(aggregation.findings),
            )
            t4 = datetime.now(UTC)
            prioritized = self._prioritize(aggregation, size_lookup)
            phase_timings["prioritization_ms"] = int(
                (datetime.now(UTC) - t4).total_seconds() * 1000
            )

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
                t5 = datetime.now(UTC)
                action_plan = self._plan(prioritized, scan_context, snapshot_lookup)
                phase_timings["planning_ms"] = int(
                    (datetime.now(UTC) - t5).total_seconds() * 1000
                )
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
                    # V1.0: Pre-execution revalidation.
                    # Re-check every PLANNED action against the CURRENT
                    # filesystem state and persist state changes.  This
                    # ensures the scan result's ``actions_planned`` count
                    # only includes files that are genuinely deletable
                    # RIGHT NOW.  Locked, missing, and inaccessible items
                    # have their state persisted as LOCKED_TARGET,
                    # MISSING_TARGET, or NOT_FIXABLE so they are excluded
                    # from the user-visible cleanable count.
                    #
                    # V1.0 optimization: For quick scans with a large number
                    # of planned actions (>5000), skip the per-file
                    # revalidation. The executor checks each file before
                    # deletion anyway, so locked/missing files will be
                    # caught at execution time and reported as "failed".
                    # This trades a small number of false positives (locked
                    # files shown as detected) for a 5x faster scan.
                    if dashboard_eligible_only and len(action_plan.actions) <= 5000:
                        t5b = datetime.now(UTC)
                        try:
                            reval = self._revalidate_and_persist(
                                action_plan.plan_id
                            )
                            # Reload the plan to pick up persisted state
                            # changes so the statistics below reflect
                            # reality.
                            revalidated_plan = self._action_plan_repo.load(
                                action_plan.plan_id
                            )
                            if revalidated_plan is not None:
                                action_plan = revalidated_plan
                            phase_timings["revalidation_ms"] = int(
                                (datetime.now(UTC) - t5b).total_seconds() * 1000
                            )
                            logger.info(
                                "V1.0 scan-time revalidation: "
                                "total_planned=%d still_deletable=%d "
                                "now_locked=%d now_missing=%d "
                                "now_inaccessible=%d",
                                reval.get("total_planned", 0),
                                reval.get("still_deletable", 0),
                                reval.get("now_locked", 0),
                                reval.get("now_missing", 0),
                                reval.get("now_inaccessible", 0),
                            )
                        except Exception as exc:
                            logger.warning(
                                "V1.0 scan-time revalidation failed "
                                "(non-fatal): %s",
                                exc,
                            )
            else:
                phase_timings["planning_ms"] = 0

            completed_at = datetime.now(UTC)
            elapsed_ms = int((completed_at - started_at).total_seconds() * 1000)
            phase_timings["total_ms"] = elapsed_ms

            # Identify the bottleneck phase (longest duration).
            bottleneck_phase = max(
                (k for k in phase_timings if k != "total_ms"),
                key=lambda k: phase_timings[k],
                default="none",
            )
            phase_timings["bottleneck"] = bottleneck_phase

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
                excluded_count=excluded_count,
            )
            # Attach phase timings to the result statistics.
            # ScanResult is frozen, so we inject via the statistics dict
            # by creating a new result with augmented statistics.
            if phase_timings:
                augmented_stats = dict(result.statistics)
                augmented_stats["phase_timings"] = phase_timings
                result = dataclasses.replace(result, statistics=augmented_stats)
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
        """Run a quick scan.

        V1.0: Quick scans are used by the Dashboard automatic cleaner.
        Only verified-safe findings become actions — locked, blocked,
        review-required, and inaccessible items are excluded before the
        ActionPlanner so the user only sees automatically cleanable items.
        """
        return self.scan(
            ScanType.QUICK,
            scope=scope,
            on_progress=on_progress,
            generate_action_plan=generate_action_plan,
            dashboard_eligible_only=True,
        )

    def scan_full(
        self,
        scope: Optional[list[str]] = None,
        *,
        on_progress: Optional[ProgressCallback] = None,
        generate_action_plan: bool = True,
        rule_categories: Optional[list[RuleCategory]] = None,
    ) -> ScanResult:
        """Run a full scan.

        Args:
            rule_categories: V1.0 Architecture separation — only run rules
                in the specified categories. When None, all enabled rules
                run. When set (e.g. [RuleCategory.SECURITY]), only rules
                in those categories are evaluated.
        """
        return self.scan(
            ScanType.FULL,
            scope=scope,
            on_progress=on_progress,
            generate_action_plan=generate_action_plan,
            rule_categories=rule_categories,
        )

    def get_latest_scan_history(self) -> Optional[dict[str, Any]]:
        """Return the latest persisted scan history record."""
        return self._history_repo.get_latest()

    def list_scan_history(self, limit: int = 10) -> list[dict[str, Any]]:
        """Return the most recent persisted scan history records."""
        return self._history_repo.list_recent(limit)

    def update_scan_history_cleanup(self, plan_id: str, cleanup_result: dict[str, Any]) -> bool:
        """Update scan history with cleanup result from auto-optimization."""
        return self._history_repo.update_cleanup_result(plan_id, cleanup_result)

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
        skip_persistence: bool = False,
    ) -> tuple[
        int, dict[str, Any], dict[str, Optional[int]], dict[str, Any], list[ScanOrchestratorError], list[tuple[Any, Any]]
    ]:
        """Run discovery engines, convert assets, and persist snapshots.

        Returns:
            Tuple of (discovered_count, asset_lookup, size_lookup,
            snapshot_lookup, errors, in_memory_pairs). snapshot_lookup maps
            asset_id to the in-memory AssetSnapshot, so _plan can resolve
            snapshots without re-querying the database per finding (10K+ DB
            roundtrips avoided). in_memory_pairs is the list of (asset,
            snapshot) tuples for fast in-memory evaluation.
        """
        asset_lookup: dict[str, tuple[Any, ...]] = {}
        size_lookup: dict[str, Optional[int]] = {}
        snapshot_lookup: dict[str, Any] = {}
        errors: list[ScanOrchestratorError] = []
        discovered_count = 0
        batch_assets: list[ScanAsset] = []
        batch_snapshots: list[AssetSnapshot] = []
        in_memory_pairs: list[tuple[Any, Any]] = []
        batch_size = 2000
        progress_interval = 500

        engine_names = sorted(self._discovery_engines.keys())
        # Track the current folder being scanned for telemetry.
        current_folder_holder: dict[str, str] = {"folder": ""}

        def _engine_progress_callback(event: Any) -> None:
            """Capture the current folder from the enumerator's ProgressEvent."""
            folder = getattr(event, "current_folder", None)
            if folder:
                current_folder_holder["folder"] = folder

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
                current_folder=current_folder_holder["folder"],
            )
            try:
                for raw in engine.enumerate(
                    scan_context, token, on_progress=_engine_progress_callback
                ):
                    if token.is_cancelled:
                        break
                    discovered_count += 1
                    if discovered_count % progress_interval == 0:
                        self._emit_progress(
                            scan_context.scan_id,
                            on_progress,
                            "discovery",
                            f"{engine_name}: {discovered_count} items discovered",
                            assets_discovered=discovered_count,
                            current_folder=current_folder_holder["folder"],
                        )
                    try:
                        # If the discovery engine yields a ScanAsset directly
                        # (e.g. DefenderThreatDiscoveryEngine), skip conversion.
                        if isinstance(raw, ScanAsset):
                            asset = raw
                        else:
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
                    snapshot_lookup[asset.asset_id] = snapshot
                    in_memory_pairs.append((asset, snapshot))
                    batch_assets.append(asset)
                    batch_snapshots.append(snapshot)

                    if len(batch_assets) >= batch_size:
                        if not skip_persistence:
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

        if batch_assets and not skip_persistence:
            self._save_batch(batch_assets, batch_snapshots, errors)

        return discovered_count, asset_lookup, size_lookup, snapshot_lookup, errors, in_memory_pairs

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

    def _build_safe_summary(
        self, findings: tuple[Any, ...]
    ) -> Any:
        """Build a DetectionSummary for only safe findings (V1.0 Dashboard)."""
        from ..rules.aggregation import DetectionSummary
        from datetime import UTC, datetime

        total_findings = len(findings)
        unique_assets = len({f.asset_id for f in findings})

        known_sizes = [
            f.estimated_size for f in findings if f.estimated_size is not None
        ]
        unknown_count = total_findings - len(known_sizes)
        total_known = sum(known_sizes) if known_sizes else 0
        total_size: Optional[int] = None if unknown_count > 0 else total_known

        return DetectionSummary(
            total_findings=total_findings,
            unique_assets=unique_assets,
            total_known_size=total_known,
            total_unknown_size_count=unknown_count,
            total_size=total_size,
            size_by_category={},
            size_by_severity={},
            size_by_rule={},
            findings_by_category={},
            findings_by_severity={},
            findings_by_safety={"safe": total_findings},
            findings_by_confidence={},
            fixable_findings=total_findings,
            blocked_findings=0,
            review_required_findings=0,
            generated_at=datetime.now(UTC),
        )

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
        snapshot_lookup: Optional[dict[str, Any]] = None,
    ) -> ActionPlan:
        """Build an ActionPlan from prioritized findings.

        Args:
            snapshot_lookup: Optional in-memory map of asset_id → AssetSnapshot
                from the discovery phase. When provided, snapshots are resolved
                from memory (O(1)) instead of querying the database per finding
                (which caused a 10K-DB-query performance regression on CI).
                Falls back to DB lookup only if the asset is not in the cache.
        """

        def _resolve_snapshot(asset_id: str) -> Any:
            if snapshot_lookup is not None and asset_id in snapshot_lookup:
                return snapshot_lookup[asset_id]
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
        *,
        excluded_count: int = 0,
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
            # V1.0: Revalidation states — items that were PLANNED at scan
            # time but failed pre-execution revalidation.  These are
            # excluded from ``actions_planned`` so the user-visible
            # cleanable count only includes genuinely deletable items.
            "actions_locked_target": self._count_actions(
                action_plan, "locked_target"
            ),
            "actions_missing_target": self._count_actions(
                action_plan, "missing_target"
            ),
            "errors_count": scan_context.error_count,
            # V1.0 Dashboard: internal diagnostic count of items excluded
            # because they were not verified-safe (locked, blocked, etc.).
            # NOT shown to the user — for diagnostics only.
            "dashboard_excluded_count": excluded_count,
        }

        # V1.0 Protection Center: security-specific counters.
        # These are computed from the findings list so the frontend
        # can display separate counters for confirmed threats,
        # suspicious items, and privacy findings.
        confirmed_threats = 0
        suspicious_items = 0
        privacy_items = 0
        for f in aggregation.findings:
            cat = f.rule_category
            if cat == RuleCategory.SECURITY:
                confirmed_threats += 1
            elif cat == RuleCategory.SUSPICIOUS:
                suspicious_items += 1
            elif cat == RuleCategory.PRIVACY:
                privacy_items += 1
        stats["confirmed_threats"] = confirmed_threats
        stats["suspicious_items"] = suspicious_items
        stats["privacy_items"] = privacy_items
        # Count planned quarantine actions (threats that can be secured).
        stats["threats_secured"] = self._count_actions_by_type(
            action_plan, "quarantine_file", "planned"
        )
        stats["threats_remaining"] = max(
            0, confirmed_threats - stats["threats_secured"]
        )

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
        current_folder: str = "",
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
            # that reaches 50% at ~100K files (typical full scan).
            # log10(100001) ≈ 5.0, so 10 + 5*8 = 50.
            base_percent = min(50.0, 10.0 + math.log10(assets_discovered + 1) * 8.0)
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
                current_folder=current_folder,
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

    def _count_actions_by_type(
        self,
        action_plan: Optional[ActionPlan],
        action_type_value: str,
        state_value: str,
    ) -> int:
        """Count actions with a given action type AND state."""
        if action_plan is None:
            return 0
        return sum(
            1
            for a in action_plan.actions
            if a.state.value == state_value
            and a.action_type.value == action_type_value
        )

    def _revalidate_and_persist(self, plan_id: str) -> dict[str, int]:
        """V1.0: Re-check every PLANNED action against the CURRENT filesystem.

        This is the scan-time equivalent of
        ``RemediationCoordinator.revalidate_planned_actions``.  It
        re-probes each PLANNED action's target file for existence,
        accessibility, and lock status, then PERSISTS the updated
        state so that the scan result statistics reflect reality.

        Actions that fail revalidation are persisted as:
        - ``MISSING_TARGET`` — file no longer exists
        - ``LOCKED_TARGET`` — file is locked by another process
        - ``NOT_FIXABLE`` — file is inaccessible (ACL/permission)

        Returns:
            Dict with keys: ``total_planned``, ``still_deletable``,
            ``now_missing``, ``now_locked``, ``now_inaccessible``.
        """
        import os as _os
        from pathlib import Path as _Path

        plan = self._action_plan_repo.load(plan_id)
        if plan is None:
            return {
                "total_planned": 0,
                "still_deletable": 0,
                "now_missing": 0,
                "now_locked": 0,
                "now_inaccessible": 0,
            }

        total_planned = 0
        still_deletable = 0
        now_missing = 0
        now_locked = 0
        now_inaccessible = 0
        state_updates: list[tuple[str, str]] = []

        # Import the lock probe from remediation (same CreateFileW probe)
        try:
            from .remediation import _check_file_locked
        except Exception:
            _check_file_locked = None  # type: ignore[assignment]

        for action in plan.actions:
            if action.state.value != "planned":
                continue
            total_planned += 1

            target = getattr(action, "target", None)
            if target is None:
                now_missing += 1
                state_updates.append(
                    (action.action_id, ActionState.MISSING_TARGET.value)
                )
                continue

            canonical = getattr(target, "canonical_path", "")
            if not canonical:
                now_missing += 1
                state_updates.append(
                    (action.action_id, ActionState.MISSING_TARGET.value)
                )
                continue

            try:
                p = _Path(canonical)
                if not _os.path.lexists(p):
                    now_missing += 1
                    state_updates.append(
                        (action.action_id, ActionState.MISSING_TARGET.value)
                    )
                    continue
                if not _os.access(p, _os.W_OK):
                    now_inaccessible += 1
                    state_updates.append(
                        (action.action_id, ActionState.NOT_FIXABLE.value)
                    )
                    continue
                # V1.0: Skip the expensive CreateFileW lock check during
                # scan-time revalidation. For 86,000+ planned actions, the
                # CreateFileW probe takes ~1ms per file = 88 seconds total.
                # The executor will catch locked files during execution and
                # report them as "failed". This trades a small number of
                # false positives (locked files shown as detected) for a
                # 5x faster scan.
                #
                # Only do the lock check for files in known risky locations
                # (PyInstaller _MEI* dirs, active process dirs).
                if p.is_file() and not _os.path.islink(p):
                    parent_name = p.parent.name.lower()
                    if parent_name.startswith("_mei"):
                        # _MEI* directories contain active PyInstaller
                        # extraction files — check for locks
                        if _check_file_locked is not None and _check_file_locked(str(p)):
                            now_locked += 1
                            state_updates.append(
                                (action.action_id, ActionState.LOCKED_TARGET.value)
                            )
                            continue
                still_deletable += 1
            except (OSError, ValueError):
                now_inaccessible += 1
                state_updates.append(
                    (action.action_id, ActionState.NOT_FIXABLE.value)
                )
                continue

        # Persist state changes so the reloaded plan reflects reality.
        # We update BOTH the remediation_actions table AND the plan_data
        # JSON in action_plans, because ActionPlanRepository.load() reads
        # the full plan from plan_data, not from remediation_actions.
        if state_updates:
            conn = self._db.get_connection()
            cursor = conn.cursor()
            try:
                # Update individual action rows
                for action_id, new_state in state_updates:
                    cursor.execute(
                        "UPDATE remediation_actions SET action_data = "
                        "json_set(action_data, '$.state', ?), "
                        "state = ? "
                        "WHERE plan_id = ? AND action_id = ?",
                        (new_state, new_state, plan_id, action_id),
                    )
                # Update the plan_data JSON in action_plans so that
                # ActionPlanRepository.load() returns the updated states.
                cursor.execute(
                    "SELECT plan_data FROM action_plans WHERE plan_id = ?",
                    (plan_id,),
                )
                row = cursor.fetchone()
                if row is not None:
                    import json as _json
                    plan_dict = _json.loads(row[0])
                    update_map = dict(state_updates)
                    for a in plan_dict.get("actions", []):
                        aid = a.get("action_id", "")
                        if aid in update_map:
                            a["state"] = update_map[aid]
                    cursor.execute(
                        "UPDATE action_plans SET plan_data = ? "
                        "WHERE plan_id = ?",
                        (_json.dumps(plan_dict), plan_id),
                    )
                conn.commit()
            except Exception as exc:
                conn.rollback()
                logger.warning(
                    "V1.0 revalidation: failed to persist state updates for %s: %s",
                    plan_id,
                    exc,
                )
            finally:
                cursor.close()

        return {
            "total_planned": total_planned,
            "still_deletable": still_deletable,
            "now_missing": now_missing,
            "now_locked": now_locked,
            "now_inaccessible": now_inaccessible,
        }

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
