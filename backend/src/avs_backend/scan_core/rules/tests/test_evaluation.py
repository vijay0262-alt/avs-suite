"""
SC-8C1 Evaluation Infrastructure Tests
"""

import pytest
from datetime import datetime, UTC

from avs_backend.scan_core.rules.evaluation import (
    EvaluationStatus,
    EvaluationError,
    EvaluationResult,
    EvaluationStatistics,
    EvaluationBatch,
)
from avs_backend.scan_core.rules.result import RuleResult, RuleMatchStatus
from avs_backend.scan_core.rules.models import RuleIdentifier, RuleVersion
from avs_backend.scan_core.rules.evidence import Evidence, EvidenceCollection
from avs_backend.scan_core.rules.confidence import Confidence, ConfidenceScore
from avs_backend.scan_core.rules.safety import SafetyAssessment
from avs_backend.scan_core.rules.enums import (
    RuleCategory,
    Severity,
    ActionType,
    SafetyLevel,
    EvidenceType,
    ConfidenceFactor,
)


class TestEvaluationStatus:
    """Test EvaluationStatus enum."""
    
    def test_all_statuses_exist(self):
        """Test that all expected statuses exist."""
        assert EvaluationStatus.SUCCESS == "success"
        assert EvaluationStatus.FAILED == "failed"
        assert EvaluationStatus.SKIPPED_NOT_APPLICABLE == "skipped_not_applicable"
        assert EvaluationStatus.SKIPPED_DISABLED == "skipped_disabled"
        assert EvaluationStatus.CANCELLED == "cancelled"


class TestEvaluationError:
    """Test EvaluationError model."""
    
    def test_create_error(self):
        """Test creating evaluation error."""
        error = EvaluationError(
            rule_id="test.rule",
            rule_version="1.0.0",
            asset_id="test-asset",
            error_type="ValueError",
            error_message="Test error",
            evaluation_stage="rule_evaluation",
        )
        
        assert error.rule_id == "test.rule"
        assert error.rule_version == "1.0.0"
        assert error.asset_id == "test-asset"
        assert error.error_type == "ValueError"
        assert error.error_message == "Test error"
        assert error.evaluation_stage == "rule_evaluation"
    
    def test_error_to_dict(self):
        """Test error serialization."""
        error = EvaluationError(
            rule_id="test.rule",
            rule_version="1.0.0",
            asset_id="test-asset",
            error_type="ValueError",
            error_message="Test error",
            evaluation_stage="rule_evaluation",
        )
        
        data = error.to_dict()
        assert data["rule_id"] == "test.rule"
        assert data["rule_version"] == "1.0.0"
        assert data["asset_id"] == "test-asset"
        assert data["error_type"] == "ValueError"
        assert data["error_message"] == "Test error"
        assert data["evaluation_stage"] == "rule_evaluation"
        assert "timestamp" in data


class TestEvaluationResult:
    """Test EvaluationResult model."""
    
    def create_rule_result(self, matched: bool = True) -> RuleResult:
        """Helper to create rule result."""
        if not matched:
            return RuleResult.create_no_match(
                rule_id="test.rule",
                rule_version="1.0.0",
                asset_id="test-asset",
                reason="Test reason",
            )
        else:
            return RuleResult.create_matched(
                rule_id="test.rule",
                rule_version="1.0.0",
                asset_id="test-asset",
                severity=Severity.LOW,
                confidence=Confidence(
                    score=80.0,
                    factors=tuple(),
                ),
                safety=SafetyAssessment.create_safe("Safe to act"),
                reason="Test match",
                evidence=EvidenceCollection(tuple()),
                recommended_action=ActionType.DELETE,
            )
    
    def test_success_result(self):
        """Test creating success result."""
        rule_result = self.create_rule_result(matched=True)
        
        result = EvaluationResult.success(
            rule_id="test.rule",
            asset_id="test-asset",
            rule_result=rule_result,
            duration_ms=10.5,
        )
        
        assert result.status == EvaluationStatus.SUCCESS
        assert result.is_success is True
        assert result.is_match is True
        assert result.rule_result == rule_result
        assert result.duration_ms == 10.5
    
    def test_success_no_match(self):
        """Test success result with no match."""
        rule_result = self.create_rule_result(matched=False)
        
        result = EvaluationResult.success(
            rule_id="test.rule",
            asset_id="test-asset",
            rule_result=rule_result,
        )
        
        assert result.is_success is True
        assert result.is_match is False
    
    def test_failed_result(self):
        """Test creating failed result."""
        error = EvaluationError(
            rule_id="test.rule",
            rule_version="1.0.0",
            asset_id="test-asset",
            error_type="ValueError",
            error_message="Test error",
            evaluation_stage="rule_evaluation",
        )
        
        result = EvaluationResult.failed(
            rule_id="test.rule",
            asset_id="test-asset",
            error=error,
            duration_ms=5.0,
        )
        
        assert result.status == EvaluationStatus.FAILED
        assert result.is_success is False
        assert result.is_match is False
        assert result.error == error
    
    def test_skipped_not_applicable(self):
        """Test skipped (not applicable) result."""
        result = EvaluationResult.skipped_not_applicable(
            rule_id="test.rule",
            asset_id="test-asset",
        )
        
        assert result.status == EvaluationStatus.SKIPPED_NOT_APPLICABLE
        assert result.is_success is False
    
    def test_skipped_disabled(self):
        """Test skipped (disabled) result."""
        result = EvaluationResult.skipped_disabled(
            rule_id="test.rule",
            asset_id="test-asset",
        )
        
        assert result.status == EvaluationStatus.SKIPPED_DISABLED
        assert result.is_success is False
    
    def test_cancelled_result(self):
        """Test cancelled result."""
        result = EvaluationResult.cancelled(
            rule_id="test.rule",
            asset_id="test-asset",
        )
        
        assert result.status == EvaluationStatus.CANCELLED
        assert result.is_success is False


class TestEvaluationStatistics:
    """Test EvaluationStatistics model."""
    
    def test_initial_statistics(self):
        """Test creating initial statistics."""
        stats = EvaluationStatistics()
        
        assert stats.assets_considered == 0
        assert stats.assets_evaluated == 0
        assert stats.rules_considered == 0
        assert stats.rules_applicable == 0
        assert stats.rules_evaluated == 0
        assert stats.matches == 0
        assert stats.no_matches == 0
        assert stats.failures == 0
        assert stats.skipped == 0
        assert stats.cancelled == 0
    
    def test_record_match(self):
        """Test recording match."""
        stats = EvaluationStatistics()
        stats.record_match()
        
        assert stats.matches == 1
    
    def test_record_no_match(self):
        """Test recording no match."""
        stats = EvaluationStatistics()
        stats.record_no_match()
        
        assert stats.no_matches == 1
    
    def test_record_failure(self):
        """Test recording failure."""
        stats = EvaluationStatistics()
        stats.record_failure()
        
        assert stats.failures == 1
    
    def test_record_skipped(self):
        """Test recording skip."""
        stats = EvaluationStatistics()
        stats.record_skipped()
        
        assert stats.skipped == 1
    
    def test_record_cancelled(self):
        """Test recording cancellation."""
        stats = EvaluationStatistics()
        stats.record_cancelled()
        
        assert stats.cancelled == 1
    
    def test_rules_per_second(self):
        """Test rules per second calculation."""
        stats = EvaluationStatistics()
        stats.rules_evaluated = 100
        stats.evaluation_duration_ms = 1000.0  # 1 second
        
        assert stats.rules_per_second == 100.0
    
    def test_assets_per_second(self):
        """Test assets per second calculation."""
        stats = EvaluationStatistics()
        stats.assets_evaluated = 50
        stats.evaluation_duration_ms = 1000.0  # 1 second
        
        assert stats.assets_per_second == 50.0
    
    def test_zero_duration(self):
        """Test metrics with zero duration."""
        stats = EvaluationStatistics()
        stats.rules_evaluated = 100
        stats.evaluation_duration_ms = 0.0
        
        assert stats.rules_per_second == 0.0
        assert stats.assets_per_second == 0.0
    
    def test_to_dict(self):
        """Test statistics serialization."""
        stats = EvaluationStatistics()
        stats.assets_considered = 10
        stats.matches = 5
        stats.started_at = datetime.now(UTC)
        stats.completed_at = datetime.now(UTC)
        
        data = stats.to_dict()
        assert data["assets_considered"] == 10
        assert data["matches"] == 5
        assert "started_at" in data
        assert "completed_at" in data


class TestEvaluationBatch:
    """Test EvaluationBatch model."""
    
    def test_empty_batch(self):
        """Test creating empty batch."""
        stats = EvaluationStatistics()
        batch = EvaluationBatch(results=[], statistics=stats)
        
        assert len(batch.results) == 0
        assert batch.get_matches() == []
        assert batch.get_errors() == []
    
    def test_get_matches(self):
        """Test getting matched results."""
        # Create match result
        rule_result = RuleResult.create_matched(
            rule_id="test.rule",
            rule_version="1.0.0",
            asset_id="test-asset",
            severity=Severity.LOW,
            confidence=Confidence(
                score=80.0,
                factors=tuple(),
            ),
            safety=SafetyAssessment.create_safe("Safe"),
            reason="Match",
            evidence=EvidenceCollection(tuple()),
            recommended_action=ActionType.DELETE,
        )
        
        success_result = EvaluationResult.success(
            rule_id="test.rule",
            asset_id="test-asset",
            rule_result=rule_result,
        )
        
        # Create no-match result
        no_match_result = RuleResult.create_no_match(
            rule_id="test.rule2",
            rule_version="1.0.0",
            asset_id="test-asset",
            reason="No match",
        )
        
        no_match_eval = EvaluationResult.success(
            rule_id="test.rule2",
            asset_id="test-asset",
            rule_result=no_match_result,
        )
        
        stats = EvaluationStatistics()
        batch = EvaluationBatch(
            results=[success_result, no_match_eval],
            statistics=stats,
        )
        
        matches = batch.get_matches()
        assert len(matches) == 1
        assert matches[0] == rule_result
    
    def test_get_errors(self):
        """Test getting errors."""
        error = EvaluationError(
            rule_id="test.rule",
            rule_version="1.0.0",
            asset_id="test-asset",
            error_type="ValueError",
            error_message="Test error",
            evaluation_stage="rule_evaluation",
        )
        
        stats = EvaluationStatistics()
        batch = EvaluationBatch(
            results=[],
            statistics=stats,
            errors=[error],
        )
        
        errors = batch.get_errors()
        assert len(errors) == 1
        assert errors[0] == error
    
    def test_get_failed_results(self):
        """Test getting failed results."""
        error = EvaluationError(
            rule_id="test.rule",
            rule_version="1.0.0",
            asset_id="test-asset",
            error_type="ValueError",
            error_message="Test error",
            evaluation_stage="rule_evaluation",
        )
        
        failed_result = EvaluationResult.failed(
            rule_id="test.rule",
            asset_id="test-asset",
            error=error,
        )
        
        success_result = EvaluationResult.skipped_disabled(
            rule_id="test.rule2",
            asset_id="test-asset",
        )
        
        stats = EvaluationStatistics()
        batch = EvaluationBatch(
            results=[failed_result, success_result],
            statistics=stats,
        )
        
        failed = batch.get_failed_results()
        assert len(failed) == 1
        assert failed[0].status == EvaluationStatus.FAILED
