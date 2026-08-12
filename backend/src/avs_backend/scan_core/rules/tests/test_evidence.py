"""
SC-8A Rule Engine — Evidence Tests
"""

import pytest
from datetime import datetime, UTC

from avs_backend.scan_core.rules.evidence import Evidence, EvidenceCollection
from avs_backend.scan_core.rules.enums import EvidenceType


class TestEvidence:
    """Test Evidence model."""
    
    def test_valid_evidence(self):
        """Test creating valid evidence."""
        evidence = Evidence(
            evidence_type=EvidenceType.PATH_MATCH,
            description="File is in browser cache directory",
            source="filesystem",
            value="C:\\Users\\Test\\AppData\\Local\\Chrome\\Cache",
            weight=0.8,
        )
        
        assert evidence.evidence_type == EvidenceType.PATH_MATCH
        assert evidence.description == "File is in browser cache directory"
        assert evidence.source == "filesystem"
        assert evidence.weight == 0.8
    
    def test_empty_description(self):
        """Test empty description is rejected."""
        with pytest.raises(ValueError, match="description cannot be empty"):
            Evidence(
                evidence_type=EvidenceType.PATH_MATCH,
                description="",
                source="filesystem",
                value="test",
            )
    
    def test_empty_source(self):
        """Test empty source is rejected."""
        with pytest.raises(ValueError, match="source cannot be empty"):
            Evidence(
                evidence_type=EvidenceType.PATH_MATCH,
                description="test",
                source="",
                value="test",
            )
    
    def test_invalid_weight(self):
        """Test invalid weight is rejected."""
        # Weight too low
        with pytest.raises(ValueError, match="weight must be between"):
            Evidence(
                evidence_type=EvidenceType.PATH_MATCH,
                description="test",
                source="filesystem",
                value="test",
                weight=-0.1,
            )
        
        # Weight too high
        with pytest.raises(ValueError, match="weight must be between"):
            Evidence(
                evidence_type=EvidenceType.PATH_MATCH,
                description="test",
                source="filesystem",
                value="test",
                weight=1.1,
            )
    
    def test_valid_weight_range(self):
        """Test valid weight range."""
        # Minimum
        Evidence(
            evidence_type=EvidenceType.PATH_MATCH,
            description="test",
            source="filesystem",
            value="test",
            weight=0.0,
        )
        
        # Maximum
        Evidence(
            evidence_type=EvidenceType.PATH_MATCH,
            description="test",
            source="filesystem",
            value="test",
            weight=1.0,
        )
    
    def test_serialization(self):
        """Test evidence serialization."""
        timestamp = datetime.now(UTC)
        evidence = Evidence(
            evidence_type=EvidenceType.KNOWN_LOCATION,
            description="Known cache location",
            source="rule_engine",
            value="/cache/data",
            weight=0.9,
            timestamp=timestamp,
        )
        
        data = evidence.to_dict()
        assert data["evidence_type"] == "known_location"
        assert data["description"] == "Known cache location"
        assert data["source"] == "rule_engine"
        assert data["value"] == "/cache/data"
        assert data["weight"] == 0.9
        assert data["timestamp"] == timestamp.isoformat()
    
    def test_deserialization(self):
        """Test evidence deserialization."""
        timestamp = datetime.now(UTC)
        data = {
            "evidence_type": "path_match",
            "description": "Path matches pattern",
            "source": "filesystem",
            "value": "/test/path",
            "weight": 0.7,
            "timestamp": timestamp.isoformat(),
        }
        
        evidence = Evidence.from_dict(data)
        assert evidence.evidence_type == EvidenceType.PATH_MATCH
        assert evidence.description == "Path matches pattern"
        assert evidence.source == "filesystem"
        assert evidence.value == "/test/path"
        assert evidence.weight == 0.7
        assert evidence.timestamp == timestamp
    
    def test_immutability(self):
        """Test evidence is immutable."""
        evidence = Evidence(
            evidence_type=EvidenceType.PATH_MATCH,
            description="test",
            source="filesystem",
            value="test",
        )
        
        with pytest.raises(Exception):  # FrozenInstanceError or AttributeError
            evidence.description = "modified"


class TestEvidenceCollection:
    """Test EvidenceCollection model."""
    
    def test_empty_collection(self):
        """Test creating empty collection."""
        collection = EvidenceCollection()
        assert collection.count == 0
        assert collection.total_weight == 0.0
        assert collection.average_weight == 0.0
    
    def test_collection_with_items(self):
        """Test creating collection with items."""
        items = [
            Evidence(
                evidence_type=EvidenceType.PATH_MATCH,
                description="Path match",
                source="filesystem",
                value="/test",
                weight=0.8,
            ),
            Evidence(
                evidence_type=EvidenceType.SIZE_MATCH,
                description="Size match",
                source="filesystem",
                value="1024",
                weight=0.6,
            ),
        ]
        
        collection = EvidenceCollection.create(items)
        assert collection.count == 2
        assert collection.total_weight == 1.4
        assert collection.average_weight == 0.7
    
    def test_get_by_type(self):
        """Test filtering evidence by type."""
        items = [
            Evidence(
                evidence_type=EvidenceType.PATH_MATCH,
                description="Path 1",
                source="filesystem",
                value="/test1",
            ),
            Evidence(
                evidence_type=EvidenceType.PATH_MATCH,
                description="Path 2",
                source="filesystem",
                value="/test2",
            ),
            Evidence(
                evidence_type=EvidenceType.SIZE_MATCH,
                description="Size",
                source="filesystem",
                value="1024",
            ),
        ]
        
        collection = EvidenceCollection.create(items)
        path_matches = collection.get_by_type(EvidenceType.PATH_MATCH)
        assert len(path_matches) == 2
        
        size_matches = collection.get_by_type(EvidenceType.SIZE_MATCH)
        assert len(size_matches) == 1
    
    def test_serialization(self):
        """Test collection serialization."""
        items = [
            Evidence(
                evidence_type=EvidenceType.PATH_MATCH,
                description="test",
                source="filesystem",
                value="/test",
                weight=0.8,
            ),
        ]
        
        collection = EvidenceCollection.create(items)
        data = collection.to_dict()
        
        assert data["count"] == 1
        assert data["total_weight"] == 0.8
        assert data["average_weight"] == 0.8
        assert len(data["items"]) == 1
    
    def test_deserialization(self):
        """Test collection deserialization."""
        data = {
            "items": [
                {
                    "evidence_type": "path_match",
                    "description": "test",
                    "source": "filesystem",
                    "value": "/test",
                    "weight": 0.8,
                    "timestamp": None,
                }
            ]
        }
        
        collection = EvidenceCollection.from_dict(data)
        assert collection.count == 1
        assert collection.items[0].evidence_type == EvidenceType.PATH_MATCH
    
    def test_immutability(self):
        """Test collection is immutable."""
        items = [
            Evidence(
                evidence_type=EvidenceType.PATH_MATCH,
                description="test",
                source="filesystem",
                value="/test",
            ),
        ]
        
        collection = EvidenceCollection.create(items)
        
        # Cannot modify items tuple
        with pytest.raises(Exception):  # AttributeError or FrozenInstanceError
            collection.items = tuple()
