"""
SC-8A Rule Engine — Result Tests
"""

import pytest
from datetime import datetime, UTC

from avs_backend.scan_core.rules.result import RuleResult, RuleMatchStatus
from avs_backend.scan_core.rules.enums import Severity, ActionType
from avs_backend.scan_core.rules.evidence import Evidence, EvidenceCollection, EvidenceType
from avs_backend.scan_core.rules.confidence import Confidence, ConfidenceScore, ConfidenceFactor
from avs_backend.scan_core.rules.safety import SafetyAssessment, SafetyLevel, SafetyBlocker


class TestRuleMatchStatus:
    """Test RuleMatchStatus enum."""
    
    def test_all_statuses_exist(self):
        """Test that all expected statuses exist."""
        assert RuleMatchStatus.NO_MATCH == "no_match"
        assert RuleMatchStatus.MATCHED == "matched"
        assert RuleMatchStatus.MATCHED_BLOCKED == "matched_blocked"
        assert RuleMatchStatus.MATCHED_REVIEW == "matched_review"


class TestRuleResult:
    """Test RuleResult model."""
    
    def test_no_match_result(self):
        """Test creating NO_MATCH result."""
        result = RuleResult.create_no_match(
            rule_id="junk.temp",
            rule_version="1.0.0",
            asset_id="asset123",
            reason="Asset does not match rule criteria",
        )
        
        assert result.rule_id == "junk.temp"
        assert result.rule_version == "1.0.0"
        assert result.asset_id == "asset123"
        assert result.status == RuleMatchStatus.NO_MATCH
        assert result.matched is False
        assert result.is_blocked is False
        assert result.requires_review is False
        assert result.is_actionable is False
        assert result.severity == Severity.INFO
        assert result.recommended_action == ActionType.NONE
    
    def test_matched_result(self):
        """Test creating MATCHED result."""
        evidence = EvidenceCollection.create([
            Evidence(
                evidence_type=EvidenceType.PATH_MATCH,
                description="Path matches cache pattern",
                source="filesystem",
                value="/cache/test",
            )
        ])
        
        confidence = Confidence(score=85.0)
        safety = SafetyAssessment.create_safe("Safe to delete")
        
        result = RuleResult.create_matched(
            rule_id="junk.browser.cache",
            rule_version="1.0.0",
            asset_id="asset456",
            severity=Severity.LOW,
            confidence=confidence,
            safety=safety,
            reason="Browser cache file",
            evidence=evidence,
            recommended_action=ActionType.DELETE,
            estimated_size=1024,
        )
        
        assert result.status == RuleMatchStatus.MATCHED
        assert result.matched is True
        assert result.is_blocked is False
        assert result.requires_review is False
        assert result.is_actionable is True
        assert result.severity == Severity.LOW
        assert result.confidence.score == 85.0
        assert result.safety.level == SafetyLevel.SAFE
        assert result.recommended_action == ActionType.DELETE
        assert result.estimated_size == 1024
    
    def test_matched_blocked_result(self):
        """Test creating MATCHED_BLOCKED result."""
        evidence = EvidenceCollection()
        confidence = Confidence(score=90.0)
        safety = SafetyAssessment.create_blocked(
            "System critical file",
            [SafetyBlocker.SYSTEM_CRITICAL],
        )
        
        result = RuleResult.create_matched(
            rule_id="junk.temp",
            rule_version="1.0.0",
            asset_id="asset789",
            severity=Severity.HIGH,
            confidence=confidence,
            safety=safety,
            reason="Matches junk pattern but is system critical",
            evidence=evidence,
            recommended_action=ActionType.REVIEW,
        )
        
        assert result.status == RuleMatchStatus.MATCHED_BLOCKED
        assert result.matched is True
        assert result.is_blocked is True
        assert result.requires_review is False
        assert result.is_actionable is False
        assert result.safety.level == SafetyLevel.BLOCKED
    
    def test_matched_review_result(self):
        """Test creating MATCHED_REVIEW result."""
        evidence = EvidenceCollection()
        confidence = Confidence(score=60.0)
        safety = SafetyAssessment.create_review_required("Uncertain impact")
        
        result = RuleResult.create_matched(
            rule_id="privacy.browser.history",
            rule_version="1.0.0",
            asset_id="asset999",
            severity=Severity.MEDIUM,
            confidence=confidence,
            safety=safety,
            reason="Browser history requires review",
            evidence=evidence,
            recommended_action=ActionType.REVIEW,
        )
        
        assert result.status == RuleMatchStatus.MATCHED_REVIEW
        assert result.matched is True
        assert result.is_blocked is False
        assert result.requires_review is True
        assert result.is_actionable is False
    
    def test_empty_rule_id(self):
        """Test empty rule ID is rejected."""
        with pytest.raises(ValueError, match="Rule ID cannot be empty"):
            RuleResult(
                rule_id="",
                rule_version="1.0.0",
                asset_id="asset123",
                status=RuleMatchStatus.NO_MATCH,
                severity=Severity.INFO,
                confidence=Confidence(score=0.0),
                safety=SafetyAssessment.create_safe("test"),
                reason="test",
                evidence=EvidenceCollection(),
                recommended_action=ActionType.NONE,
            )
    
    def test_empty_rule_version(self):
        """Test empty rule version is rejected."""
        with pytest.raises(ValueError, match="Rule version cannot be empty"):
            RuleResult(
                rule_id="junk.temp",
                rule_version="",
                asset_id="asset123",
                status=RuleMatchStatus.NO_MATCH,
                severity=Severity.INFO,
                confidence=Confidence(score=0.0),
                safety=SafetyAssessment.create_safe("test"),
                reason="test",
                evidence=EvidenceCollection(),
                recommended_action=ActionType.NONE,
            )
    
    def test_empty_asset_id(self):
        """Test empty asset ID is rejected."""
        with pytest.raises(ValueError, match="Asset ID cannot be empty"):
            RuleResult(
                rule_id="junk.temp",
                rule_version="1.0.0",
                asset_id="",
                status=RuleMatchStatus.NO_MATCH,
                severity=Severity.INFO,
                confidence=Confidence(score=0.0),
                safety=SafetyAssessment.create_safe("test"),
                reason="test",
                evidence=EvidenceCollection(),
                recommended_action=ActionType.NONE,
            )
    
    def test_empty_reason(self):
        """Test empty reason is rejected."""
        with pytest.raises(ValueError, match="Reason cannot be empty"):
            RuleResult(
                rule_id="junk.temp",
                rule_version="1.0.0",
                asset_id="asset123",
                status=RuleMatchStatus.NO_MATCH,
                severity=Severity.INFO,
                confidence=Confidence(score=0.0),
                safety=SafetyAssessment.create_safe("test"),
                reason="",
                evidence=EvidenceCollection(),
                recommended_action=ActionType.NONE,
            )
    
    def test_serialization(self):
        """Test result serialization."""
        evidence = EvidenceCollection.create([
            Evidence(
                evidence_type=EvidenceType.PATH_MATCH,
                description="Path match",
                source="filesystem",
                value="/test",
            )
        ])
        
        confidence = Confidence(score=75.0)
        safety = SafetyAssessment.create_safe("Safe")
        
        result = RuleResult.create_matched(
            rule_id="junk.cache",
            rule_version="1.0.0",
            asset_id="asset123",
            severity=Severity.LOW,
            confidence=confidence,
            safety=safety,
            reason="Cache file",
            evidence=evidence,
            recommended_action=ActionType.DELETE,
            estimated_size=2048,
            metadata={"category": "browser"},
        )
        
        data = result.to_dict()
        assert data["rule_id"] == "junk.cache"
        assert data["rule_version"] == "1.0.0"
        assert data["asset_id"] == "asset123"
        assert data["status"] == "matched"
        assert data["matched"] is True
        assert data["severity"] == "low"
        assert data["confidence"]["score"] == 75.0
        assert data["safety"]["level"] == "safe"
        assert data["recommended_action"] == "delete"
        assert data["estimated_size"] == 2048
        assert data["metadata"]["category"] == "browser"
        assert data["is_actionable"] is True
    
    def test_deserialization(self):
        """Test result deserialization."""
        data = {
            "rule_id": "junk.temp",
            "rule_version": "1.0.0",
            "asset_id": "asset456",
            "status": "matched",
            "severity": "medium",
            "confidence": {
                "score": 80.0,
                "factors": [],
            },
            "safety": {
                "level": "safe",
                "reason": "Safe to delete",
                "blockers": [],
            },
            "reason": "Temporary file",
            "evidence": {
                "items": [],
            },
            "recommended_action": "delete",
            "estimated_size": 512,
            "metadata": {},
            "evaluated_at": datetime.now(UTC).isoformat(),
        }
        
        result = RuleResult.from_dict(data)
        assert result.rule_id == "junk.temp"
        assert result.rule_version == "1.0.0"
        assert result.asset_id == "asset456"
        assert result.status == RuleMatchStatus.MATCHED
        assert result.severity == Severity.MEDIUM
        assert result.confidence.score == 80.0
        assert result.recommended_action == ActionType.DELETE
    
    def test_immutability(self):
        """Test result is immutable."""
        result = RuleResult.create_no_match(
            rule_id="junk.temp",
            rule_version="1.0.0",
            asset_id="asset123",
            reason="No match",
        )
        
        with pytest.raises(Exception):  # FrozenInstanceError or AttributeError
            result.status = RuleMatchStatus.MATCHED
    
    def test_result_with_metadata(self):
        """Test result with custom metadata."""
        result = RuleResult.create_matched(
            rule_id="junk.temp",
            rule_version="1.0.0",
            asset_id="asset123",
            severity=Severity.LOW,
            confidence=Confidence(score=70.0),
            safety=SafetyAssessment.create_safe("Safe"),
            reason="Temp file",
            evidence=EvidenceCollection(),
            recommended_action=ActionType.DELETE,
            metadata={
                "file_extension": ".tmp",
                "age_days": 30,
                "application": "chrome",
            },
        )
        
        assert result.metadata["file_extension"] == ".tmp"
        assert result.metadata["age_days"] == 30
        assert result.metadata["application"] == "chrome"
