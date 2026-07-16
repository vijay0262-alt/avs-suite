"""Tests for Dashboard metrics and health score calculation."""

from __future__ import annotations

import pytest

from avs_backend.dashboard import (
    _calculate_cpu_score,
    _calculate_memory_score,
    _calculate_storage_score,
    _calculate_security_score,
    _calculate_performance_score,
    _get_health_status,
    _estimate_optimization_time,
)


def test_calculate_cpu_score():
    """Test CPU health score calculation."""
    # Low usage = high score
    assert _calculate_cpu_score({"usage": 10}) == 100
    assert _calculate_cpu_score({"usage": 30}) == 90
    assert _calculate_cpu_score({"usage": 50}) == 70
    assert _calculate_cpu_score({"usage": 70}) == 50
    assert _calculate_cpu_score({"usage": 90}) == 30
    
    # Missing usage defaults to 0
    assert _calculate_cpu_score({}) == 100


def test_calculate_memory_score():
    """Test memory health score calculation."""
    # Low usage = high score
    assert _calculate_memory_score({"usage": 30}) == 100
    assert _calculate_memory_score({"usage": 60}) == 80
    assert _calculate_memory_score({"usage": 80}) == 60
    assert _calculate_memory_score({"usage": 90}) == 40
    
    # Missing usage defaults to 0
    assert _calculate_memory_score({}) == 100


def test_calculate_storage_score():
    """Test storage health score calculation."""
    # Low usage = high score
    drives = [{"usage": 30}]
    assert _calculate_storage_score(drives) == 100
    
    drives = [{"usage": 60}]
    assert _calculate_storage_score(drives) == 80
    
    drives = [{"usage": 80}]
    assert _calculate_storage_score(drives) == 60
    
    drives = [{"usage": 90}]
    assert _calculate_storage_score(drives) == 40
    
    drives = [{"usage": 97}]
    assert _calculate_storage_score(drives) == 20
    
    # Empty list = perfect score
    assert _calculate_storage_score([]) == 100
    
    # Multiple drives uses worst drive
    drives = [{"usage": 30}, {"usage": 80}]
    assert _calculate_storage_score(drives) == 60


def test_calculate_security_score():
    """Test security health score calculation."""
    # Perfect security
    security = {
        "defender": {"enabled": True, "realTimeProtection": True},
        "firewall": {"enabled": True},
        "updates": {"pendingUpdates": 0},
    }
    assert _calculate_security_score(security) == 100
    
    # Defender disabled
    security["defender"]["enabled"] = False
    assert _calculate_security_score(security) == 70
    
    # Real-time protection disabled
    security["defender"]["enabled"] = True
    security["defender"]["realTimeProtection"] = False
    assert _calculate_security_score(security) == 80
    
    # Firewall disabled
    security["defender"]["realTimeProtection"] = True
    security["firewall"]["enabled"] = False
    assert _calculate_security_score(security) == 80
    
    # Pending updates
    security["firewall"]["enabled"] = True
    security["updates"]["pendingUpdates"] = 5
    assert _calculate_security_score(security) == 85
    
    # Empty security metrics = 50
    assert _calculate_security_score({}) == 50


def test_calculate_performance_score():
    """Test performance health score calculation."""
    # Perfect performance
    perf = {
        "startupApps": 3,
        "temporaryFilesSize": 100 * 1024 * 1024,  # 100MB
        "recycleBinSize": 50 * 1024 * 1024,  # 50MB
    }
    assert _calculate_performance_score(perf) == 100
    
    # Many startup apps
    perf["startupApps"] = 12
    assert _calculate_performance_score(perf) == 80
    
    # Large temp files
    perf["startupApps"] = 3
    perf["temporaryFilesSize"] = 6 * 1024 * 1024 * 1024  # 6GB
    assert _calculate_performance_score(perf) == 85
    
    # Large recycle bin
    perf["temporaryFilesSize"] = 100 * 1024 * 1024
    perf["recycleBinSize"] = 2 * 1024 * 1024 * 1024  # 2GB
    assert _calculate_performance_score(perf) == 90
    
    # Empty metrics = 100
    assert _calculate_performance_score({}) == 100


def test_get_health_status():
    """Test health status label mapping."""
    assert _get_health_status(95) == "excellent"
    assert _get_health_status(85) == "excellent"
    assert _get_health_status(75) == "good"
    assert _get_health_status(65) == "fair"
    assert _get_health_status(55) == "fair"
    assert _get_health_status(45) == "poor"
    assert _get_health_status(35) == "poor"
    assert _get_health_status(25) == "critical"
    assert _get_health_status(10) == "critical"


def test_estimate_optimization_time():
    """Test optimization time estimation."""
    # Small size
    assert _estimate_optimization_time(100 * 1024 * 1024) == 5  # 100MB -> minimum 5s
    
    # 1GB
    assert _estimate_optimization_time(1024 * 1024 * 1024) == 10
    
    # 5GB
    assert _estimate_optimization_time(5 * 1024 * 1024 * 1024) == 50
    
    # 10GB
    assert _estimate_optimization_time(10 * 1024 * 1024 * 1024) == 100
    
    # Zero size
    assert _estimate_optimization_time(0) == 5
