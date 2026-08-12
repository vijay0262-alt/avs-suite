"""
SC-8C1 Rule Evaluator Tests
"""

import pytest
from datetime import datetime, UTC

from avs_backend.scan_core.rules.evaluator import RuleEvaluator, CancellationToken
from avs_backend.scan_core.rules.registry import RuleRegistry
from avs_backend.scan_core.rules.rule import Rule, RuleMetadata
from avs_backend.scan_core.rules.models import RuleIdentifier, RuleVersion
from avs_backend.scan_core.rules.result import RuleResult, RuleMatchStatus
from avs_backend.scan_core.rules.evidence import EvidenceCollection
from avs_backend.scan_core.rules.confidence import Confidence, ConfidenceScore
from avs_backend.scan_core.rules.safety import SafetyAssessment
from avs_backend.scan_core.rules.enums import (
    RuleCategory,
    Severity,
    ActionType,
    RuleStatus,
    ConfidenceFactor,
)
from avs_backend.scan_core.rules.evaluation import EvaluationStatus
from avs_backend.scan_core.assets import ScanAsset, AssetType, AssetCategory, AssetSource


class AlwaysMatchRule(Rule):
    """Test rule that always matches."""
    
    def evaluate(self, asset, snapshot=None, context=None):
        return RuleResult.create_matched(
            rule_id=self.rule_id,
            rule_version=str(self.version),
            asset_id=asset.asset_id,
            severity=Severity.LOW,
            confidence=Confidence(
                score=90.0,
                factors=tuple(),
            ),
            safety=SafetyAssessment.create_safe("Safe"),
            reason="Always matches",
            evidence=EvidenceCollection(tuple()),
            recommended_action=ActionType.DELETE,
        )


class NeverMatchRule(Rule):
    """Test rule that never matches."""
    
    def evaluate(self, asset, snapshot=None, context=None):
        return RuleResult.create_no_match(
            rule_id=self.rule_id,
            rule_version=str(self.version),
            asset_id=asset.asset_id,
            reason="Never matches",
        )


class FailingRule(Rule):
    """Test rule that always fails."""
    
    def evaluate(self, asset, snapshot=None, context=None):
        raise ValueError("Intentional failure for testing")


class TestCancellationToken:
    """Test CancellationToken."""
    
    def test_initial_state(self):
        """Test initial state."""
        token = CancellationToken()
        assert token.is_cancelled is False
    
    def test_cancel(self):
        """Test cancellation."""
        token = CancellationToken()
        token.cancel()
        assert token.is_cancelled is True


class TestRuleEvaluator:
    """Test RuleEvaluator."""
    
    def create_asset(self, asset_id: str = "test-asset") -> ScanAsset:
        """Helper to create test asset."""
        return ScanAsset(
            asset_id=asset_id,
            asset_type=AssetType.FILE,
            asset_category=AssetCategory.FILESYSTEM,
            asset_source=AssetSource.FILESYSTEM_ENUMERATOR,
            display_name="Test Asset",
            canonical_path="/test/path",
            discovered_at=datetime.now(UTC),
        )
    
    def test_empty_registry(self):
        """Test evaluator with empty registry."""
        registry = RuleRegistry()
        evaluator = RuleEvaluator(registry)
        
        asset = self.create_asset()
        batch = evaluator.evaluate_asset(asset)
        
        assert len(batch.results) == 0
        assert batch.statistics.assets_evaluated == 1
        assert batch.statistics.rules_considered == 0
    
    def test_single_rule_match(self):
        """Test single rule that matches."""
        registry = RuleRegistry()
        
        metadata = RuleMetadata(
            identifier=RuleIdentifier("test.match"),
            version=RuleVersion(1, 0, 0),
            name="Always Match",
            description="Always matches",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
            supported_asset_types=tuple([AssetType.FILE.value]),
        )
        
        rule = AlwaysMatchRule(metadata)
        registry.register(rule)
        
        evaluator = RuleEvaluator(registry)
        asset = self.create_asset()
        
        batch = evaluator.evaluate_asset(asset)
        
        assert len(batch.results) == 1
        assert batch.results[0].is_success is True
        assert batch.results[0].is_match is True
        assert batch.statistics.matches == 1
        assert batch.statistics.no_matches == 0
        assert batch.statistics.failures == 0
    
    def test_single_rule_no_match(self):
        """Test single rule that doesn't match."""
        registry = RuleRegistry()
        
        metadata = RuleMetadata(
            identifier=RuleIdentifier("test.nomatch"),
            version=RuleVersion(1, 0, 0),
            name="Never Match",
            description="Never matches",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
            supported_asset_types=tuple([AssetType.FILE.value]),
        )
        
        rule = NeverMatchRule(metadata)
        registry.register(rule)
        
        evaluator = RuleEvaluator(registry)
        asset = self.create_asset()
        
        batch = evaluator.evaluate_asset(asset)
        
        assert len(batch.results) == 1
        assert batch.results[0].is_success is True
        assert batch.results[0].is_match is False
        assert batch.statistics.matches == 0
        assert batch.statistics.no_matches == 1
    
    def test_rule_failure_isolation(self):
        """Test that rule failure doesn't stop evaluation."""
        registry = RuleRegistry()
        
        # Register failing rule
        metadata_fail = RuleMetadata(
            identifier=RuleIdentifier("test.fail"),
            version=RuleVersion(1, 0, 0),
            name="Failing Rule",
            description="Always fails",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
            supported_asset_types=tuple([AssetType.FILE.value]),
        )
        registry.register(FailingRule(metadata_fail))
        
        # Register successful rule
        metadata_success = RuleMetadata(
            identifier=RuleIdentifier("test.success"),
            version=RuleVersion(1, 0, 0),
            name="Success Rule",
            description="Always succeeds",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
            supported_asset_types=tuple([AssetType.FILE.value]),
        )
        registry.register(AlwaysMatchRule(metadata_success))
        
        evaluator = RuleEvaluator(registry)
        asset = self.create_asset()
        
        batch = evaluator.evaluate_asset(asset)
        
        # Both rules should have results
        assert len(batch.results) == 2
        
        # One should be failed
        failed = [r for r in batch.results if r.status == EvaluationStatus.FAILED]
        assert len(failed) == 1
        assert failed[0].error is not None
        
        # One should be successful
        successful = [r for r in batch.results if r.status == EvaluationStatus.SUCCESS]
        assert len(successful) == 1
        
        assert batch.statistics.failures == 1
        assert batch.statistics.matches == 1
    
    def test_disabled_rule_skipped(self):
        """Test that disabled rules are skipped."""
        registry = RuleRegistry()
        
        metadata = RuleMetadata(
            identifier=RuleIdentifier("test.disabled"),
            version=RuleVersion(1, 0, 0),
            name="Disabled Rule",
            description="Disabled",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
            status=RuleStatus.DISABLED,
            supported_asset_types=tuple([AssetType.FILE.value]),
        )
        
        rule = AlwaysMatchRule(metadata)
        registry.register(rule)
        
        evaluator = RuleEvaluator(registry)
        asset = self.create_asset()
        
        # Pass all rules explicitly (list_enabled() won't include disabled)
        batch = evaluator.evaluate_asset(asset, rules=registry.list_all())
        
        assert len(batch.results) == 1
        assert batch.results[0].status == EvaluationStatus.SKIPPED_DISABLED
        assert batch.statistics.skipped == 1
    
    def test_unsupported_asset_skipped(self):
        """Test that rules skip unsupported asset types."""
        registry = RuleRegistry()
        
        # Rule only supports REGISTRY_KEY
        metadata = RuleMetadata(
            identifier=RuleIdentifier("test.registry"),
            version=RuleVersion(1, 0, 0),
            name="Registry Rule",
            description="Registry only",
            category=RuleCategory.REGISTRY,
            severity=Severity.LOW,
            supported_asset_types=tuple([AssetType.REGISTRY_KEY.value]),
        )
        
        rule = AlwaysMatchRule(metadata)
        registry.register(rule)
        
        evaluator = RuleEvaluator(registry)
        
        # Evaluate FILE asset
        asset = self.create_asset()
        batch = evaluator.evaluate_asset(asset)
        
        assert len(batch.results) == 1
        assert batch.results[0].status == EvaluationStatus.SKIPPED_NOT_APPLICABLE
        assert batch.statistics.skipped == 1
    
    def test_multiple_assets(self):
        """Test evaluating multiple assets."""
        registry = RuleRegistry()
        
        metadata = RuleMetadata(
            identifier=RuleIdentifier("test.match"),
            version=RuleVersion(1, 0, 0),
            name="Match Rule",
            description="Matches",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
            supported_asset_types=tuple([AssetType.FILE.value]),
        )
        
        rule = AlwaysMatchRule(metadata)
        registry.register(rule)
        
        evaluator = RuleEvaluator(registry)
        
        # Create multiple assets
        assets = [
            self.create_asset("asset-1"),
            self.create_asset("asset-2"),
            self.create_asset("asset-3"),
        ]
        
        batch = evaluator.evaluate_assets(assets)
        
        assert len(batch.results) == 3
        assert batch.statistics.assets_evaluated == 3
        assert batch.statistics.matches == 3
    
    def test_deterministic_ordering(self):
        """Test that evaluation order is deterministic."""
        registry = RuleRegistry()
        
        # Register rules in random order
        for rule_id in ["zebra.rule", "alpha.rule", "middle.rule"]:
            metadata = RuleMetadata(
                identifier=RuleIdentifier(rule_id),
                version=RuleVersion(1, 0, 0),
                name=rule_id,
                description=rule_id,
                category=RuleCategory.JUNK,
                severity=Severity.LOW,
                supported_asset_types=tuple([AssetType.FILE.value]),
            )
            registry.register(AlwaysMatchRule(metadata))
        
        evaluator = RuleEvaluator(registry)
        asset = self.create_asset()
        
        # Evaluate multiple times
        batch1 = evaluator.evaluate_asset(asset)
        batch2 = evaluator.evaluate_asset(asset)
        
        # Results should be in same order
        rule_ids_1 = [r.rule_id for r in batch1.results]
        rule_ids_2 = [r.rule_id for r in batch2.results]
        
        assert rule_ids_1 == rule_ids_2
        assert rule_ids_1 == ["alpha.rule", "middle.rule", "zebra.rule"]
    
    def test_cancellation(self):
        """Test cancellation support."""
        registry = RuleRegistry()
        
        # Register many rules
        for i in range(10):
            metadata = RuleMetadata(
                identifier=RuleIdentifier(f"test.rule.{i}"),
                version=RuleVersion(1, 0, 0),
                name=f"Rule {i}",
                description=f"Rule {i}",
                category=RuleCategory.JUNK,
                severity=Severity.LOW,
                supported_asset_types=tuple([AssetType.FILE.value]),
            )
            registry.register(AlwaysMatchRule(metadata))
        
        evaluator = RuleEvaluator(registry)
        asset = self.create_asset()
        
        # Create cancellation token and cancel immediately
        token = CancellationToken()
        token.cancel()
        
        batch = evaluator.evaluate_asset(asset, cancellation_token=token)
        
        # All results should be cancelled
        assert all(r.status == EvaluationStatus.CANCELLED for r in batch.results)
        assert batch.statistics.cancelled > 0
    
    def test_empty_asset_collection(self):
        """Test evaluating empty asset collection."""
        registry = RuleRegistry()
        evaluator = RuleEvaluator(registry)
        
        batch = evaluator.evaluate_assets([])
        
        assert len(batch.results) == 0
        assert batch.statistics.assets_evaluated == 0
    
    def test_statistics_timing(self):
        """Test that statistics include timing information."""
        registry = RuleRegistry()
        
        metadata = RuleMetadata(
            identifier=RuleIdentifier("test.match"),
            version=RuleVersion(1, 0, 0),
            name="Match Rule",
            description="Matches",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
            supported_asset_types=tuple([AssetType.FILE.value]),
        )
        
        rule = AlwaysMatchRule(metadata)
        registry.register(rule)
        
        evaluator = RuleEvaluator(registry)
        asset = self.create_asset()
        
        batch = evaluator.evaluate_asset(asset)
        
        assert batch.statistics.evaluation_duration_ms > 0
        assert batch.statistics.started_at is not None
        assert batch.statistics.completed_at is not None
    
    def test_no_duplicate_results(self):
        """Test that same asset+rule doesn't produce duplicates."""
        registry = RuleRegistry()
        
        metadata = RuleMetadata(
            identifier=RuleIdentifier("test.match"),
            version=RuleVersion(1, 0, 0),
            name="Match Rule",
            description="Matches",
            category=RuleCategory.JUNK,
            severity=Severity.LOW,
            supported_asset_types=tuple([AssetType.FILE.value]),
        )
        
        rule = AlwaysMatchRule(metadata)
        registry.register(rule)
        
        evaluator = RuleEvaluator(registry)
        asset = self.create_asset()
        
        batch = evaluator.evaluate_asset(asset)
        
        # Should have exactly 1 result
        assert len(batch.results) == 1
        
        # Check no duplicates in results
        result_keys = [(r.rule_id, r.asset_id) for r in batch.results]
        assert len(result_keys) == len(set(result_keys))
    
    def test_large_synthetic_collection(self):
        """Test performance with larger synthetic collection."""
        registry = RuleRegistry()
        
        # Register 100 rules
        for i in range(100):
            metadata = RuleMetadata(
                identifier=RuleIdentifier(f"test.rule.{i:03d}"),
                version=RuleVersion(1, 0, 0),
                name=f"Rule {i}",
                description=f"Rule {i}",
                category=RuleCategory.JUNK,
                severity=Severity.LOW,
                supported_asset_types=tuple([AssetType.FILE.value]),
            )
            # Mix of matching and non-matching rules
            if i % 2 == 0:
                registry.register(AlwaysMatchRule(metadata))
            else:
                registry.register(NeverMatchRule(metadata))
        
        evaluator = RuleEvaluator(registry)
        
        # Create 1000 assets
        assets = [self.create_asset(f"asset-{i:04d}") for i in range(1000)]
        
        batch = evaluator.evaluate_assets(assets)
        
        # Verify results
        assert batch.statistics.assets_evaluated == 1000
        assert batch.statistics.rules_evaluated == 100000  # 1000 assets * 100 rules
        assert batch.statistics.matches == 50000  # Half the rules match
        assert batch.statistics.no_matches == 50000
        
        # Check performance metrics
        assert batch.statistics.rules_per_second > 0
        assert batch.statistics.assets_per_second > 0
        
        print(f"\nPerformance: {batch.statistics.rules_per_second:.0f} rules/sec, "
              f"{batch.statistics.assets_per_second:.0f} assets/sec")
