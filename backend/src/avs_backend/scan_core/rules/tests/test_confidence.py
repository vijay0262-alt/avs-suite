"""
SC-8A Rule Engine — Confidence Tests
"""

import pytest

from avs_backend.scan_core.rules.confidence import Confidence, ConfidenceScore
from avs_backend.scan_core.rules.enums import ConfidenceFactor


class TestConfidenceScore:
    """Test ConfidenceScore model."""
    
    def test_valid_confidence_score(self):
        """Test creating valid confidence score."""
        score = ConfidenceScore(
            factor=ConfidenceFactor.PATH_MATCH,
            score=75.0,
            description="Path matches known cache location",
        )
        
        assert score.factor == ConfidenceFactor.PATH_MATCH
        assert score.score == 75.0
        assert score.description == "Path matches known cache location"
    
    def test_invalid_score_range(self):
        """Test invalid score range is rejected."""
        # Score too low
        with pytest.raises(ValueError, match="must be between 0.0 and 100.0"):
            ConfidenceScore(
                factor=ConfidenceFactor.PATH_MATCH,
                score=-1.0,
                description="test",
            )
        
        # Score too high
        with pytest.raises(ValueError, match="must be between 0.0 and 100.0"):
            ConfidenceScore(
                factor=ConfidenceFactor.PATH_MATCH,
                score=101.0,
                description="test",
            )
    
    def test_empty_description(self):
        """Test empty description is rejected."""
        with pytest.raises(ValueError, match="description cannot be empty"):
            ConfidenceScore(
                factor=ConfidenceFactor.PATH_MATCH,
                score=50.0,
                description="",
            )
    
    def test_serialization(self):
        """Test confidence score serialization."""
        score = ConfidenceScore(
            factor=ConfidenceFactor.METADATA_MATCH,
            score=80.0,
            description="Metadata indicates cache file",
        )
        
        data = score.to_dict()
        assert data["factor"] == "metadata_match"
        assert data["score"] == 80.0
        assert data["description"] == "Metadata indicates cache file"
    
    def test_deserialization(self):
        """Test confidence score deserialization."""
        data = {
            "factor": "rule_certainty",
            "score": 90.0,
            "description": "Rule has high certainty",
        }
        
        score = ConfidenceScore.from_dict(data)
        assert score.factor == ConfidenceFactor.RULE_CERTAINTY
        assert score.score == 90.0
        assert score.description == "Rule has high certainty"


class TestConfidence:
    """Test Confidence model."""
    
    def test_valid_confidence(self):
        """Test creating valid confidence."""
        confidence = Confidence(score=75.0)
        assert confidence.score == 75.0
        assert confidence.level == "high"
    
    def test_invalid_confidence_range(self):
        """Test invalid confidence range is rejected."""
        # Score too low
        with pytest.raises(ValueError, match="must be between 0.0 and 100.0"):
            Confidence(score=-1.0)
        
        # Score too high
        with pytest.raises(ValueError, match="must be between 0.0 and 100.0"):
            Confidence(score=101.0)
    
    def test_confidence_levels(self):
        """Test confidence level categorization."""
        assert Confidence(score=10.0).level == "very_low"
        assert Confidence(score=20.0).level == "very_low"
        
        assert Confidence(score=21.0).level == "low"
        assert Confidence(score=40.0).level == "low"
        
        assert Confidence(score=41.0).level == "medium"
        assert Confidence(score=60.0).level == "medium"
        
        assert Confidence(score=61.0).level == "high"
        assert Confidence(score=80.0).level == "high"
        
        assert Confidence(score=81.0).level == "very_high"
        assert Confidence(score=100.0).level == "very_high"
    
    def test_is_high(self):
        """Test is_high property."""
        assert Confidence(score=70.0).is_high is True
        assert Confidence(score=90.0).is_high is True
        assert Confidence(score=60.0).is_high is False
        assert Confidence(score=50.0).is_high is False
    
    def test_is_low(self):
        """Test is_low property."""
        assert Confidence(score=20.0).is_low is True
        assert Confidence(score=40.0).is_low is True
        assert Confidence(score=41.0).is_low is False
        assert Confidence(score=50.0).is_low is False
    
    def test_confidence_with_factors(self):
        """Test confidence with factors."""
        factors = [
            ConfidenceScore(
                factor=ConfidenceFactor.PATH_MATCH,
                score=80.0,
                description="Path matches",
            ),
            ConfidenceScore(
                factor=ConfidenceFactor.METADATA_MATCH,
                score=70.0,
                description="Metadata matches",
            ),
        ]
        
        confidence = Confidence.create(score=75.0, factors=factors)
        assert confidence.score == 75.0
        assert len(confidence.factors) == 2
    
    def test_serialization(self):
        """Test confidence serialization."""
        factors = [
            ConfidenceScore(
                factor=ConfidenceFactor.PATH_MATCH,
                score=80.0,
                description="Path matches",
            ),
        ]
        
        confidence = Confidence.create(score=75.0, factors=factors)
        data = confidence.to_dict()
        
        assert data["score"] == 75.0
        assert data["level"] == "high"
        assert len(data["factors"]) == 1
        assert data["factors"][0]["factor"] == "path_match"
    
    def test_deserialization(self):
        """Test confidence deserialization."""
        data = {
            "score": 85.0,
            "factors": [
                {
                    "factor": "rule_certainty",
                    "score": 90.0,
                    "description": "High certainty rule",
                }
            ],
        }
        
        confidence = Confidence.from_dict(data)
        assert confidence.score == 85.0
        assert confidence.level == "very_high"
        assert len(confidence.factors) == 1
    
    def test_immutability(self):
        """Test confidence is immutable."""
        confidence = Confidence(score=75.0)
        
        with pytest.raises(Exception):  # FrozenInstanceError or AttributeError
            confidence.score = 80.0
    
    def test_boundary_values(self):
        """Test boundary values."""
        # Minimum
        Confidence(score=0.0)
        
        # Maximum
        Confidence(score=100.0)
