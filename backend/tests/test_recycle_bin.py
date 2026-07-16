"""Tests for Windows Recycle Bin integration."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest

from avs_backend.cleaner.recycle_bin import (
    delete_to_recycle_bin,
    delete_to_recycle_bin_single,
    empty_recycle_bin,
    get_recycle_bin_size,
)


@pytest.fixture
def temp_file():
    """Create a temporary test file."""
    fd, path = tempfile.mkstemp(suffix=".txt")
    os.close(fd)
    yield path
    # Cleanup - try to delete from recycle bin if it was moved there
    try:
        os.unlink(path)
    except FileNotFoundError:
        pass


def test_delete_to_recycle_bin_single_success(temp_file):
    """Test successful deletion to Recycle Bin."""
    assert os.path.exists(temp_file)
    result = delete_to_recycle_bin_single(temp_file)
    # File should be moved to Recycle Bin, so it no longer exists at original path
    assert not os.path.exists(temp_file)
    assert result is True


def test_delete_to_recycle_bin_single_nonexistent():
    """Test deletion of non-existent file."""
    result = delete_to_recycle_bin_single("/nonexistent/file.txt")
    assert result is False


def test_delete_to_recycle_bin_empty_list():
    """Test deletion with empty list."""
    success, failed = delete_to_recycle_bin([])
    assert success == 0
    assert failed == 0


def test_delete_to_recycle_bin_mixed(temp_file):
    """Test deletion with mix of existing and non-existing files."""
    existing = temp_file
    nonexistent = "/nonexistent/file.txt"

    assert os.path.exists(existing)

    success, failed = delete_to_recycle_bin([existing, nonexistent])

    # Should succeed for existing file, fail for non-existent
    assert success == 1
    assert failed == 1
    assert not os.path.exists(existing)


def test_get_recycle_bin_size():
    """Test getting Recycle Bin size."""
    size = get_recycle_bin_size()
    assert isinstance(size, int)
    assert size >= 0


def test_empty_recycle_bin():
    """Test emptying Recycle Bin - should not crash."""
    # This is a potentially destructive operation, so we just test it doesn't crash
    result = empty_recycle_bin()
    assert isinstance(result, bool)


@pytest.mark.skipif(os.name != "nt", reason="Windows-specific test")
def test_delete_to_recycle_bin_windows_specific(temp_file):
    """Windows-specific Recycle Bin test."""
    assert os.name == "nt"
    assert os.path.exists(temp_file)
    
    success, failed = delete_to_recycle_bin([temp_file])
    
    assert success == 1
    assert failed == 0
    assert not os.path.exists(temp_file)
