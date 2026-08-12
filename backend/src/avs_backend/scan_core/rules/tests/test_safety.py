"""
SC-8A Rule Engine — Safety Tests
"""

import pytest

from avs_backend.scan_core.rules.safety import SafetyAssessment
from avs_backend.scan_core.rules.enums import SafetyLevel, SafetyBlocker


class TestSafetyAssessment:
    """Test SafetyAssessment model."""
    
    def test_safe_assessment(self):
        """Test creating SAFE assessment."""
        assessment = SafetyAssessment.create_safe("No known risks")
        
        assert assessment.level == SafetyLevel.SAFE
        assert assessment.reason == "No known risks"
        assert len(assessment.blockers) == 0
        assert assessment.is_safe is True
        assert assessment.is_blocked is False
        assert assessment.requires_review is False
        assert assessment.is_actionable is True
    
    def test_blocked_assessment(self):
        """Test creating BLOCKED assessment."""
        blockers = [SafetyBlocker.SYSTEM_CRITICAL, SafetyBlocker.ACTIVE]
        assessment = SafetyAssessment.create_blocked(
            "System critical file in use",
            blockers,
        )
        
        assert assessment.level == SafetyLevel.BLOCKED
        assert assessment.reason == "System critical file in use"
        assert len(assessment.blockers) == 2
        assert SafetyBlocker.SYSTEM_CRITICAL in assessment.blockers
        assert SafetyBlocker.ACTIVE in assessment.blockers
        assert assessment.is_safe is False
        assert assessment.is_blocked is True
        assert assessment.requires_review is False
        assert assessment.is_actionable is False
    
    def test_review_required_assessment(self):
        """Test creating REVIEW_REQUIRED assessment."""
        assessment = SafetyAssessment.create_review_required(
            "Uncertain impact, requires manual review"
        )
        
        assert assessment.level == SafetyLevel.REVIEW_REQUIRED
        assert assessment.reason == "Uncertain impact, requires manual review"
        assert len(assessment.blockers) == 0
        assert assessment.is_safe is False
        assert assessment.is_blocked is False
        assert assessment.requires_review is True
        assert assessment.is_actionable is False
    
    def test_low_risk_assessment(self):
        """Test LOW_RISK assessment."""
        assessment = SafetyAssessment(
            level=SafetyLevel.LOW_RISK,
            reason="Minor risk, safe to proceed",
        )
        
        assert assessment.level == SafetyLevel.LOW_RISK
        assert assessment.is_actionable is True
    
    def test_high_risk_assessment(self):
        """Test HIGH_RISK assessment."""
        assessment = SafetyAssessment(
            level=SafetyLevel.HIGH_RISK,
            reason="High risk of data loss",
        )
        
        assert assessment.level == SafetyLevel.HIGH_RISK
        assert assessment.is_actionable is False
    
    def test_blocked_requires_blockers(self):
        """Test BLOCKED level requires at least one blocker."""
        # Valid: BLOCKED with blockers
        SafetyAssessment(
            level=SafetyLevel.BLOCKED,
            reason="test",
            blockers=tuple([SafetyBlocker.LOCKED]),
        )
        
        # Invalid: BLOCKED without blockers
        with pytest.raises(ValueError, match="must have at least one blocker"):
            SafetyAssessment(
                level=SafetyLevel.BLOCKED,
                reason="test",
                blockers=tuple(),
            )
    
    def test_empty_reason(self):
        """Test empty reason is rejected."""
        with pytest.raises(ValueError, match="reason cannot be empty"):
            SafetyAssessment(
                level=SafetyLevel.SAFE,
                reason="",
            )
    
    def test_serialization(self):
        """Test safety assessment serialization."""
        assessment = SafetyAssessment.create_blocked(
            "System critical",
            [SafetyBlocker.SYSTEM_CRITICAL],
        )
        
        data = assessment.to_dict()
        assert data["level"] == "blocked"
        assert data["reason"] == "System critical"
        assert data["blockers"] == ["system_critical"]
        assert data["is_safe"] is False
        assert data["is_blocked"] is True
        assert data["requires_review"] is False
        assert data["is_actionable"] is False
    
    def test_deserialization(self):
        """Test safety assessment deserialization."""
        data = {
            "level": "review_required",
            "reason": "Needs review",
            "blockers": [],
        }
        
        assessment = SafetyAssessment.from_dict(data)
        assert assessment.level == SafetyLevel.REVIEW_REQUIRED
        assert assessment.reason == "Needs review"
        assert len(assessment.blockers) == 0
    
    def test_immutability(self):
        """Test safety assessment is immutable."""
        assessment = SafetyAssessment.create_safe("test")
        
        with pytest.raises(Exception):  # FrozenInstanceError or AttributeError
            assessment.level = SafetyLevel.BLOCKED
    
    def test_create_blocked_without_blockers(self):
        """Test create_blocked requires blockers."""
        with pytest.raises(ValueError, match="must have at least one blocker"):
            SafetyAssessment.create_blocked("test", [])
    
    def test_multiple_blockers(self):
        """Test assessment with multiple blockers."""
        blockers = [
            SafetyBlocker.SYSTEM_CRITICAL,
            SafetyBlocker.LOCKED,
            SafetyBlocker.ACTIVE,
        ]
        
        assessment = SafetyAssessment.create_blocked("Multiple issues", blockers)
        assert len(assessment.blockers) == 3
        assert SafetyBlocker.SYSTEM_CRITICAL in assessment.blockers
        assert SafetyBlocker.LOCKED in assessment.blockers
        assert SafetyBlocker.ACTIVE in assessment.blockers
