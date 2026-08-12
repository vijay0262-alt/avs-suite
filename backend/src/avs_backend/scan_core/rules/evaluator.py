"""
SC-8C1 Rule Evaluator

Generic rule evaluation engine that executes rules against assets.

The evaluator:
- Respects applicability filtering
- Isolates rule failures
- Supports cancellation
- Produces deterministic results
- Tracks evaluation statistics

NO SYSTEM MODIFICATION.
READ-ONLY EVALUATION ONLY.
"""

from __future__ import annotations

import time
from typing import Iterable, Optional, TYPE_CHECKING
from datetime import datetime, UTC

if TYPE_CHECKING:
    from ..assets import ScanAsset
    from ..context import AssetSnapshot, ScanContext
    from ..metadata import AssetRepository, SnapshotRepository
    from .rule import Rule
    from .registry import RuleRegistry

from .context import RuleEvaluationContext
from .applicability import ApplicabilityEngine, ApplicabilityStatus
from .evaluation import (
    EvaluationResult,
    EvaluationError,
    EvaluationStatistics,
    EvaluationBatch,
    EvaluationStatus,
)


class CancellationToken:
    """Simple cancellation token for cooperative cancellation."""
    
    def __init__(self) -> None:
        self._cancelled = False
    
    def cancel(self) -> None:
        """Request cancellation."""
        self._cancelled = True
    
    @property
    def is_cancelled(self) -> bool:
        """Check if cancellation requested."""
        return self._cancelled


class RuleEvaluator:
    """
    Generic rule evaluation engine.
    
    Evaluates rules against assets using the evaluation pipeline:
    
    Asset → Applicability → Context → Rule.evaluate() → RuleResult
    
    Features:
    - Applicability filtering
    - Rule failure isolation
    - Cooperative cancellation
    - Deterministic ordering
    - Evaluation statistics
    - Batch processing
    """
    
    def __init__(
        self,
        registry: RuleRegistry,
        asset_repository: Optional[AssetRepository] = None,
        snapshot_repository: Optional[SnapshotRepository] = None,
    ) -> None:
        """
        Initialize evaluator.
        
        Args:
            registry: Rule registry
            asset_repository: Optional asset repository for context
            snapshot_repository: Optional snapshot repository for context
        """
        self.registry = registry
        self.asset_repository = asset_repository
        self.snapshot_repository = snapshot_repository
    
    def evaluate_asset(
        self,
        asset: ScanAsset,
        snapshot: Optional[AssetSnapshot] = None,
        scan_context: Optional[ScanContext] = None,
        rules: Optional[list[Rule]] = None,
        cancellation_token: Optional[CancellationToken] = None,
    ) -> EvaluationBatch:
        """
        Evaluate all applicable rules against a single asset.
        
        Args:
            asset: Asset to evaluate
            snapshot: Optional snapshot
            scan_context: Optional scan context
            rules: Optional specific rules (defaults to all enabled)
            cancellation_token: Optional cancellation token
        
        Returns:
            EvaluationBatch with results and statistics
        """
        # Use all enabled rules if not specified
        if rules is None:
            rules = self.registry.list_enabled()
        
        # Sort rules for deterministic ordering
        rules = sorted(rules, key=lambda r: r.rule_id)
        
        # Initialize statistics
        stats = EvaluationStatistics()
        stats.started_at = datetime.now(UTC)
        stats.assets_considered = 1
        stats.assets_evaluated = 1
        stats.rules_considered = len(rules)
        
        # Evaluate rules
        results: list[EvaluationResult] = []
        errors: list[EvaluationError] = []
        
        start_time = time.perf_counter()
        
        for rule in rules:
            # Check cancellation
            if cancellation_token and cancellation_token.is_cancelled:
                result = EvaluationResult.cancelled(rule.rule_id, asset.asset_id)
                results.append(result)
                stats.record_cancelled()
                continue
            
            # Check applicability
            applicability = ApplicabilityEngine.check_applicability(rule, asset)
            
            if not applicability.is_applicable:
                if applicability.status == ApplicabilityStatus.DISABLED:
                    result = EvaluationResult.skipped_disabled(rule.rule_id, asset.asset_id)
                else:
                    result = EvaluationResult.skipped_not_applicable(rule.rule_id, asset.asset_id)
                results.append(result)
                stats.record_skipped()
                continue
            
            stats.rules_applicable += 1
            
            # Evaluate rule
            result = self._evaluate_single_rule(
                rule=rule,
                asset=asset,
                snapshot=snapshot,
                scan_context=scan_context,
            )
            
            results.append(result)
            
            # Update statistics
            if result.is_success:
                stats.rules_evaluated += 1
                if result.is_match:
                    stats.record_match()
                else:
                    stats.record_no_match()
            elif result.status == EvaluationStatus.FAILED:
                stats.record_failure()
                if result.error:
                    errors.append(result.error)
        
        end_time = time.perf_counter()
        stats.evaluation_duration_ms = (end_time - start_time) * 1000.0
        stats.completed_at = datetime.now(UTC)
        
        return EvaluationBatch(
            results=results,
            statistics=stats,
            errors=errors,
        )
    
    def evaluate_assets(
        self,
        assets: Iterable[ScanAsset],
        scan_context: Optional[ScanContext] = None,
        rules: Optional[list[Rule]] = None,
        cancellation_token: Optional[CancellationToken] = None,
    ) -> EvaluationBatch:
        """
        Evaluate rules against multiple assets.
        
        Supports streaming/iterable processing for large collections.
        
        Args:
            assets: Iterable of assets to evaluate
            scan_context: Optional scan context
            rules: Optional specific rules (defaults to all enabled)
            cancellation_token: Optional cancellation token
        
        Returns:
            EvaluationBatch with all results and statistics
        """
        # Use all enabled rules if not specified
        if rules is None:
            rules = self.registry.list_enabled()
        
        # Sort rules for deterministic ordering
        rules = sorted(rules, key=lambda r: r.rule_id)
        
        # Initialize statistics
        stats = EvaluationStatistics()
        stats.started_at = datetime.now(UTC)
        stats.rules_considered = len(rules)
        
        # Collect all results
        all_results: list[EvaluationResult] = []
        all_errors: list[EvaluationError] = []
        
        start_time = time.perf_counter()
        
        # Convert to list and sort for deterministic ordering
        asset_list = list(assets)
        asset_list.sort(key=lambda a: a.asset_id)
        
        for asset in asset_list:
            stats.assets_considered += 1
            
            # Check cancellation between assets
            if cancellation_token and cancellation_token.is_cancelled:
                break
            
            # Evaluate asset
            batch = self.evaluate_asset(
                asset=asset,
                snapshot=None,  # Could be enhanced to fetch snapshots
                scan_context=scan_context,
                rules=rules,
                cancellation_token=cancellation_token,
            )
            
            stats.assets_evaluated += 1
            
            # Aggregate results
            all_results.extend(batch.results)
            all_errors.extend(batch.errors)
            
            # Aggregate statistics (don't double-count)
            stats.rules_applicable += batch.statistics.rules_applicable
            stats.rules_evaluated += batch.statistics.rules_evaluated
            stats.matches += batch.statistics.matches
            stats.no_matches += batch.statistics.no_matches
            stats.failures += batch.statistics.failures
            stats.skipped += batch.statistics.skipped
            stats.cancelled += batch.statistics.cancelled
        
        end_time = time.perf_counter()
        stats.evaluation_duration_ms = (end_time - start_time) * 1000.0
        stats.completed_at = datetime.now(UTC)
        
        return EvaluationBatch(
            results=all_results,
            statistics=stats,
            errors=all_errors,
        )
    
    def evaluate_scan(
        self,
        scan_context: ScanContext,
        rules: Optional[list[Rule]] = None,
        cancellation_token: Optional[CancellationToken] = None,
    ) -> EvaluationBatch:
        """
        Evaluate rules against all assets in a scan context.
        
        Args:
            scan_context: Scan context with assets
            rules: Optional specific rules (defaults to all enabled)
            cancellation_token: Optional cancellation token
        
        Returns:
            EvaluationBatch with all results and statistics
        """
        # This would need to fetch assets from the scan context
        # For now, return empty batch as placeholder
        stats = EvaluationStatistics()
        stats.started_at = datetime.now(UTC)
        stats.completed_at = datetime.now(UTC)
        
        return EvaluationBatch(
            results=[],
            statistics=stats,
            errors=[],
        )
    
    def _evaluate_single_rule(
        self,
        rule: Rule,
        asset: ScanAsset,
        snapshot: Optional[AssetSnapshot] = None,
        scan_context: Optional[ScanContext] = None,
    ) -> EvaluationResult:
        """
        Evaluate a single rule against an asset.
        
        Isolates failures - exceptions do not propagate.
        
        Args:
            rule: Rule to evaluate
            asset: Asset to evaluate
            snapshot: Optional snapshot
            scan_context: Optional scan context
        
        Returns:
            EvaluationResult
        """
        start_time = time.perf_counter()
        
        try:
            # Evaluate rule (pass asset, snapshot, context directly)
            rule_result = rule.evaluate(
                asset=asset,
                snapshot=snapshot,
                context=scan_context,
            )
            
            end_time = time.perf_counter()
            duration_ms = (end_time - start_time) * 1000.0
            
            return EvaluationResult.success(
                rule_id=rule.rule_id,
                asset_id=asset.asset_id,
                rule_result=rule_result,
                duration_ms=duration_ms,
            )
        
        except Exception as e:
            end_time = time.perf_counter()
            duration_ms = (end_time - start_time) * 1000.0
            
            # Create error (no sensitive data)
            error = EvaluationError(
                rule_id=rule.rule_id,
                rule_version=str(rule.version),
                asset_id=asset.asset_id,
                error_type=type(e).__name__,
                error_message=str(e)[:200],  # Truncate to avoid exposing too much
                evaluation_stage="rule_evaluation",
            )
            
            return EvaluationResult.failed(
                rule_id=rule.rule_id,
                asset_id=asset.asset_id,
                error=error,
                duration_ms=duration_ms,
            )
