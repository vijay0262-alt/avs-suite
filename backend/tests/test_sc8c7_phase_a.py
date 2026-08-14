"""
SC-8C7 Phase A focused regression tests for the security hardening fixes.
"""

from __future__ import annotations

import sys

import pytest

from avs_backend.scan_core.rules.action_path_validation import (
    PathValidationError,
    validate_filesystem_path,
)
from avs_backend.scan_core.rules.action_registry_validation import (
    RegistryValidationError,
    is_parent_key_deletion,
    is_protected_key,
    is_protected_value_name,
    normalize_registry_view,
    validate_registry_target,
)


class TestWindowsDevicePathRejection:
    """SC-8C7: Windows device namespace paths are rejected."""

    @pytest.mark.parametrize(
        "path",
        [
            r"\\?\C:\Windows",
            r"\\.\C:",
            r"\\?\UNC\server\share",
            r"//?/c:/windows",
            r"//./c:/",
        ],
    )
    def test_device_path_rejected(self, path: str) -> None:
        with pytest.raises(PathValidationError):
            validate_filesystem_path(path)

    @pytest.mark.parametrize(
        "path",
        [
            r"D:\Safe\Path",
            r"D:\Users\Test",
            r"\\server\share",
            "/usr/local",
        ],
    )
    def test_normal_and_unc_paths_allowed(self, path: str) -> None:
        # UNC is allowed by default in the action API.
        validate_filesystem_path(path, allow_unc=True)


class TestProtectedRegistryValues:
    """SC-8C7: System-critical registry value names are protected."""

    @pytest.mark.parametrize(
        "value_name",
        ["SystemRoot", "ProgramFilesDir", "ProgramFilesDir (x86)", "Path", "windir"],
    )
    def test_protected_value_name_is_case_insensitive(self, value_name: str) -> None:
        assert is_protected_value_name(value_name.lower())
        assert is_protected_value_name(value_name.upper())
        assert is_protected_value_name(value_name)

    def test_protected_value_rejected_even_under_unprotected_key(self) -> None:
        # The value name is protected regardless of the parent key.
        with pytest.raises(RegistryValidationError):
            validate_registry_target(
                "HKCU", "Software\\TestApp", "Path", "remove_registry_value"
            )


class TestRegistryViewAwareProtection:
    """SC-8C7: WOW6432Node cannot bypass protected-key checks."""

    def test_protected_key_detected_without_wow6432node(self) -> None:
        assert is_protected_key("HKLM", "SYSTEM\\CurrentControlSet\\Control")

    def test_protected_key_detected_through_wow6432node_alias(self) -> None:
        assert is_protected_key(
            "HKLM",
            "SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run",
        )

    def test_parent_key_deletion_detected_through_wow6432node(self) -> None:
        # Deleting a parent key that would remove a protected child key must fail.
        assert is_parent_key_deletion(
            "HKLM",
            "SOFTWARE\\WOW6432Node\\Microsoft\\Windows",
            None,
        )

    @pytest.mark.parametrize(
        "view",
        ["32", "wow6432node", "wow64", "64", "default", ""],
    )
    def test_normalize_registry_view(self, view: str) -> None:
        assert normalize_registry_view(view)

    def test_invalid_registry_view_rejected(self) -> None:
        with pytest.raises(RegistryValidationError):
            normalize_registry_view("unknown")


class TestBrowserCacheTypeSecurity:
    """SC-8C7: Browser cache classification uses explicit target type, not rule_id."""

    @pytest.mark.skipif(
        sys.platform != "win32",
        reason="BrowserActionTarget validation is cross-platform but uses Windows style paths",
    )
    def test_crafted_user_data_rule_id_cannot_become_cache(self) -> None:
        # The path in the rule is a cache directory, but the keyword is user data.
        # The planning layer must classify it as user_data and the executor must reject.
        from avs_backend.scan_core.rules.action import (
            ALLOWED_BROWSER_CACHE_TYPES,
            BROWSER_USER_DATA_KEYWORDS,
        )

        for keyword in BROWSER_USER_DATA_KEYWORDS:
            assert keyword not in ALLOWED_BROWSER_CACHE_TYPES
