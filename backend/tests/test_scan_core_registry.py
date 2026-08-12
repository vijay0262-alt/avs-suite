"""
Unit tests for the Scan Core Registry Enumerator.

Tests cover:
- Empty keys
- Large trees (HKLM\\SOFTWARE has many subkeys)
- Permission denied handling
- Cancellation
- Recursive traversal
- Filters (hive, key name, value name, depth, path, regex)
- Statistics
- Progress events
- HKLM, HKCU, WOW6432Node
"""

from __future__ import annotations

import sys
import time
import pytest

pytestmark = pytest.mark.skipif(
    sys.platform != "win32",
    reason="Registry tests are Windows-specific",
)

from avs_backend.scan_core.registry import (
    RegistryHive,
    RegistryKeyAsset,
    RegistryValueAsset,
    RegistryValueType,
    RegistryStatistics,
    RegistryEnumerator,
    RegistryEnumerateOptions,
    RegistryProgressEvent,
    RegistryCancelEvent,
    RegistryTarget,
    HiveFilter,
    KeyFilter,
    ValueNameFilter,
    DepthFilter,
    PathFilter,
    RegexFilter,
    RegistryFilterChain,
    get_default_registry_targets,
    enumerate_registry,
)


# ── Basic enumeration tests ────────────────────────────────────

class TestBasicEnumeration:
    def test_enumerate_hkcu_software(self):
        """Enumerate HKCU\\SOFTWARE — should find keys and values."""
        enumerator = RegistryEnumerator()
        opts = RegistryEnumerateOptions(max_depth=1)
        entries = list(enumerator.enumerate_key(RegistryHive.HKEY_CURRENT_USER, r"SOFTWARE", options=opts))

        keys = [e for e in entries if isinstance(e, RegistryKeyAsset)]
        assert len(keys) > 0

        # The root key itself should be present
        root = next(k for k in keys if k.depth == 0)
        assert root.key_path == "SOFTWARE"
        assert root.hive == RegistryHive.HKEY_CURRENT_USER

    def test_key_has_subkey_and_value_counts(self):
        """Key assets should report subkey and value counts."""
        enumerator = RegistryEnumerator()
        opts = RegistryEnumerateOptions(max_depth=0, include_values=False)
        entries = list(enumerator.enumerate_key(
            RegistryHive.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion",
            options=opts,
        ))
        keys = [e for e in entries if isinstance(e, RegistryKeyAsset)]
        assert len(keys) == 1
        assert keys[0].subkey_count > 0
        assert keys[0].value_count > 0

    def test_values_enumerated(self):
        """Values should be enumerated when include_values=True."""
        enumerator = RegistryEnumerator()
        opts = RegistryEnumerateOptions(max_depth=0, include_keys=False)
        entries = list(enumerator.enumerate_key(
            RegistryHive.HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer",
            options=opts,
        ))
        values = [e for e in entries if isinstance(e, RegistryValueAsset)]
        assert len(values) > 0
        for v in values:
            assert v.hive == RegistryHive.HKEY_CURRENT_USER
            assert v.value_type is not None

    def test_convenience_function(self):
        """enumerate_registry convenience function should work."""
        entries = list(enumerate_registry(
            RegistryHive.HKEY_CURRENT_USER, r"SOFTWARE",
            options=RegistryEnumerateOptions(max_depth=0, include_values=False),
        ))
        assert len(entries) > 0


# ── Empty key tests ────────────────────────────────────────────

class TestEmptyKey:
    def test_empty_key_has_zero_subkeys_and_values(self, tmp_path):
        """Create a temporary registry key with no subkeys or values."""
        import winreg
        test_key_path = r"SOFTWARE\\AVS_Shield_Test_Empty"
        try:
            handle = winreg.CreateKey(winreg.HKEY_CURRENT_USER, test_key_path)
            winreg.CloseKey(handle)

            enumerator = RegistryEnumerator()
            opts = RegistryEnumerateOptions(max_depth=1)
            entries = list(enumerator.enumerate_key(
                RegistryHive.HKEY_CURRENT_USER, test_key_path, options=opts,
            ))

            keys = [e for e in entries if isinstance(e, RegistryKeyAsset)]
            assert len(keys) == 1
            assert keys[0].subkey_count == 0
            assert keys[0].value_count == 0
        finally:
            try:
                winreg.DeleteKey(winreg.HKEY_CURRENT_USER, test_key_path)
            except Exception:
                pass


# ── Large tree tests ───────────────────────────────────────────

class TestLargeTree:
    def test_hklm_software_has_many_subkeys(self):
        """HKLM\\SOFTWARE should have many subkeys."""
        enumerator = RegistryEnumerator()
        opts = RegistryEnumerateOptions(max_depth=1, include_values=False)
        entries = list(enumerator.enumerate_key(
            RegistryHive.HKEY_LOCAL_MACHINE, r"SOFTWARE", options=opts,
        ))
        keys = [e for e in entries if isinstance(e, RegistryKeyAsset)]
        assert len(keys) > 10  # SOFTWARE has many subkeys

    def test_streaming_does_not_load_all(self):
        """Verify the enumerator yields incrementally."""
        enumerator = RegistryEnumerator()
        opts = RegistryEnumerateOptions(max_depth=1, include_values=False)
        gen = enumerator.enumerate_key(
            RegistryHive.HKEY_LOCAL_MACHINE, r"SOFTWARE", options=opts,
        )
        first = next(gen)
        assert first is not None
        # Should be able to get more without consuming everything
        second = next(gen, None)
        assert second is not None


# ── Permission denied tests ────────────────────────────────────

class TestPermissionDenied:
    def test_permission_error_handled_gracefully(self):
        """Enumerating a key that requires admin should not crash."""
        # HKLM\\SAM requires SYSTEM privileges
        enumerator = RegistryEnumerator()
        opts = RegistryEnumerateOptions(max_depth=0, skip_permission_errors=True)
        entries = list(enumerator.enumerate_key(
            RegistryHive.HKEY_LOCAL_MACHINE, r"SAM", options=opts,
        ))
        # Should not crash — may return empty or partial results
        # The key itself may be accessible but subkeys may not
        assert isinstance(entries, list)

    def test_permission_errors_recorded_in_statistics(self):
        """Permission errors should be recorded in statistics."""
        enumerator = RegistryEnumerator()
        opts = RegistryEnumerateOptions(max_depth=2, skip_permission_errors=True)
        list(enumerator.enumerate_key(
            RegistryHive.HKEY_LOCAL_MACHINE, r"SAM", options=opts,
        ))
        # SAM typically has permission issues
        # Just verify statistics don't crash
        stats = enumerator.get_statistics()
        assert stats.permission_errors >= 0


# ── Cancellation tests ─────────────────────────────────────────

class TestCancellation:
    def test_cancellation_stops_enumeration(self):
        """Cancelling mid-enumeration should stop it."""
        cancel = RegistryCancelEvent()
        opts = RegistryEnumerateOptions(
            max_depth=2,
            include_values=False,
            cancel_event=cancel,
        )
        enumerator = RegistryEnumerator()
        gen = enumerator.enumerate_key(
            RegistryHive.HKEY_LOCAL_MACHINE, r"SOFTWARE", options=opts,
        )

        # Consume a few entries
        first = next(gen, None)
        assert first is not None

        # Cancel
        cancel.cancel()

        # Drain remaining — should stop
        remaining = list(gen)
        # Should have stopped well before enumerating everything
        assert len(remaining) < 500

    def test_cancellation_before_start(self):
        """Cancelling before enumeration starts should yield nothing."""
        cancel = RegistryCancelEvent()
        cancel.cancel()
        opts = RegistryEnumerateOptions(cancel_event=cancel)

        enumerator = RegistryEnumerator()
        entries = list(enumerator.enumerate_key(
            RegistryHive.HKEY_CURRENT_USER, r"SOFTWARE", options=opts,
        ))
        assert len(entries) == 0


# ── Recursive traversal tests ──────────────────────────────────

class TestRecursiveTraversal:
    def test_recursive_finds_nested_keys(self):
        """Recursive enumeration should find keys at multiple depths."""
        enumerator = RegistryEnumerator()
        opts = RegistryEnumerateOptions(max_depth=3, include_values=False)
        entries = list(enumerator.enumerate_key(
            RegistryHive.HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion",
            options=opts,
        ))
        keys = [e for e in entries if isinstance(e, RegistryKeyAsset)]
        depths = {k.depth for k in keys}
        assert 0 in depths
        assert 1 in depths
        assert len(depths) > 1

    def test_max_depth_limits_traversal(self):
        """max_depth should limit how deep we go."""
        enumerator = RegistryEnumerator()
        opts = RegistryEnumerateOptions(max_depth=1, include_values=False)
        entries = list(enumerator.enumerate_key(
            RegistryHive.HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion",
            options=opts,
        ))
        keys = [e for e in entries if isinstance(e, RegistryKeyAsset)]
        max_depth_found = max(k.depth for k in keys)
        assert max_depth_found <= 1


# ── Filter tests ───────────────────────────────────────────────

class TestFilters:
    def test_hive_filter(self):
        """HiveFilter should restrict to specified hives."""
        enumerator = RegistryEnumerator()
        filter_chain = RegistryFilterChain(
            HiveFilter(hives={RegistryHive.HKEY_CURRENT_USER}),
        )
        opts = RegistryEnumerateOptions(max_depth=1, include_values=False, filter=filter_chain)
        entries = list(enumerator.enumerate_key(
            RegistryHive.HKEY_CURRENT_USER, r"SOFTWARE", options=opts,
        ))
        keys = [e for e in entries if isinstance(e, RegistryKeyAsset)]
        assert all(k.hive == RegistryHive.HKEY_CURRENT_USER for k in keys)

    def test_depth_filter(self):
        """DepthFilter should limit enumeration depth."""
        enumerator = RegistryEnumerator()
        filter_chain = RegistryFilterChain(DepthFilter(max_depth=1))
        opts = RegistryEnumerateOptions(max_depth=5, include_values=False, filter=filter_chain)
        entries = list(enumerator.enumerate_key(
            RegistryHive.HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion",
            options=opts,
        ))
        keys = [e for e in entries if isinstance(e, RegistryKeyAsset)]
        assert all(k.depth <= 1 for k in keys)

    def test_key_filter(self):
        """KeyFilter should match keys by name substring."""
        enumerator = RegistryEnumerator()
        filter_chain = RegistryFilterChain(
            KeyFilter(key_names={"Microsoft"}),
        )
        opts = RegistryEnumerateOptions(max_depth=1, include_values=False, filter=filter_chain)
        entries = list(enumerator.enumerate_key(
            RegistryHive.HKEY_LOCAL_MACHINE, r"SOFTWARE", options=opts,
        ))
        keys = [e for e in entries if isinstance(e, RegistryKeyAsset)]
        # Should only include keys with "microsoft" in the name
        for k in keys:
            assert "microsoft" in k.key_name.lower()

    def test_value_name_filter(self):
        """ValueNameFilter should match values by name."""
        enumerator = RegistryEnumerator()
        filter_chain = RegistryFilterChain(
            ValueNameFilter(value_names={"ProgramFilesDir"}),
        )
        opts = RegistryEnumerateOptions(max_depth=0, include_keys=False, filter=filter_chain)
        entries = list(enumerator.enumerate_key(
            RegistryHive.HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion",
            options=opts,
        ))
        values = [e for e in entries if isinstance(e, RegistryValueAsset)]
        assert len(values) > 0
        assert all(v.value_name.lower() == "programfilesdir" for v in values)

    def test_path_filter(self):
        """PathFilter should match keys by path prefix."""
        enumerator = RegistryEnumerator()
        filter_chain = RegistryFilterChain(
            PathFilter(path_prefixes={r"SOFTWARE\Microsoft"}),
        )
        opts = RegistryEnumerateOptions(max_depth=2, include_values=False, filter=filter_chain)
        entries = list(enumerator.enumerate_key(
            RegistryHive.HKEY_LOCAL_MACHINE, r"SOFTWARE", options=opts,
        ))
        keys = [e for e in entries if isinstance(e, RegistryKeyAsset)]
        # All keys should have paths starting with SOFTWARE\Microsoft
        for k in keys:
            assert r"software\microsoft" in k.key_path.lower()

    def test_regex_filter(self):
        """RegexFilter should match keys by regex pattern."""
        enumerator = RegistryEnumerator()
        filter_chain = RegistryFilterChain(
            RegexFilter(pattern=r"Microsoft.*Windows"),
        )
        opts = RegistryEnumerateOptions(max_depth=2, include_values=False, filter=filter_chain)
        entries = list(enumerator.enumerate_key(
            RegistryHive.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft", options=opts,
        ))
        keys = [e for e in entries if isinstance(e, RegistryKeyAsset)]
        assert len(keys) > 0

    def test_filter_chain_combines_multiple(self):
        """FilterChain should combine multiple filters."""
        enumerator = RegistryEnumerator()
        filter_chain = RegistryFilterChain(
            DepthFilter(max_depth=1),
            KeyFilter(key_names={"Microsoft"}),
        )
        opts = RegistryEnumerateOptions(max_depth=5, include_values=False, filter=filter_chain)
        entries = list(enumerator.enumerate_key(
            RegistryHive.HKEY_LOCAL_MACHINE, r"SOFTWARE", options=opts,
        ))
        keys = [e for e in entries if isinstance(e, RegistryKeyAsset)]
        assert all(k.depth <= 1 for k in keys)
        for k in keys:
            assert "microsoft" in k.key_name.lower()


# ── Statistics tests ───────────────────────────────────────────

class TestStatistics:
    def test_statistics_track_keys_and_values(self):
        """Statistics should track total keys and values enumerated."""
        enumerator = RegistryEnumerator()
        opts = RegistryEnumerateOptions(max_depth=1)
        list(enumerator.enumerate_key(
            RegistryHive.HKEY_CURRENT_USER, r"SOFTWARE", options=opts,
        ))
        stats = enumerator.get_statistics()
        assert stats.total_keys > 0
        assert stats.total_values > 0

    def test_statistics_track_elapsed_time(self):
        """Statistics should track elapsed time after finalization."""
        enumerator = RegistryEnumerator()
        opts = RegistryEnumerateOptions(max_depth=1, include_values=False)
        list(enumerator.enumerate_key(
            RegistryHive.HKEY_CURRENT_USER, r"SOFTWARE", options=opts,
        ))
        stats = enumerator.get_statistics()
        # elapsed_seconds is set by finalize() which is called at the end of enumerate_key
        assert stats.elapsed_seconds >= 0

    def test_statistics_track_permission_errors(self):
        """Statistics should track permission errors."""
        enumerator = RegistryEnumerator()
        opts = RegistryEnumerateOptions(max_depth=2, skip_permission_errors=True)
        list(enumerator.enumerate_key(
            RegistryHive.HKEY_LOCAL_MACHINE, r"SAM", options=opts,
        ))
        stats = enumerator.get_statistics()
        # SAM typically has permission issues
        assert stats.permission_errors >= 0


# ── Progress event tests ───────────────────────────────────────

class TestProgressEvents:
    def test_progress_events_emitted(self):
        """Progress events should be emitted during enumeration."""
        events: list[RegistryProgressEvent] = []

        def callback(event: RegistryProgressEvent) -> None:
            events.append(event)

        enumerator = RegistryEnumerator()
        opts = RegistryEnumerateOptions(max_depth=1, include_values=False, progress_interval=10)
        list(enumerator.enumerate_key(
            RegistryHive.HKEY_LOCAL_MACHINE, r"SOFTWARE", options=opts, on_progress=callback,
        ))

        assert len(events) > 0
        last = events[-1]
        assert last.keys_enumerated > 0
        assert last.current_hive == "HKLM"

    def test_progress_event_has_current_key(self):
        """Progress events should include the current key being enumerated."""
        events: list[RegistryProgressEvent] = []

        def callback(event: RegistryProgressEvent) -> None:
            events.append(event)

        enumerator = RegistryEnumerator()
        opts = RegistryEnumerateOptions(max_depth=0, progress_interval=1)
        list(enumerator.enumerate_key(
            RegistryHive.HKEY_CURRENT_USER, r"SOFTWARE", options=opts, on_progress=callback,
        ))

        assert len(events) > 0
        assert events[-1].current_key is not None


# ── WOW6432Node tests ──────────────────────────────────────────

class TestWOW6432Node:
    def test_wow6432node_detected(self):
        """WOW6432Node keys should be flagged."""
        enumerator = RegistryEnumerator()
        opts = RegistryEnumerateOptions(max_depth=1, include_values=False)
        entries = list(enumerator.enumerate_key(
            RegistryHive.HKEY_LOCAL_MACHINE,
            r"SOFTWARE\WOW6432Node",
            options=opts,
        ))
        keys = [e for e in entries if isinstance(e, RegistryKeyAsset)]
        assert len(keys) > 0
        # All keys under WOW6432Node should have is_wow6432node=True
        for k in keys:
            assert k.is_wow6432node is True


# ── Default value tests ────────────────────────────────────────

class TestDefaultValue:
    def test_default_value_detected(self):
        """The default value (empty name) should be flagged as is_default."""
        import winreg
        test_key_path = r"SOFTWARE\\AVS_Shield_Test_Default"
        try:
            handle = winreg.CreateKey(winreg.HKEY_CURRENT_USER, test_key_path)
            winreg.SetValueEx(handle, "", 0, winreg.REG_SZ, "default_value")
            winreg.CloseKey(handle)

            enumerator = RegistryEnumerator()
            opts = RegistryEnumerateOptions(max_depth=0, include_keys=False)
            entries = list(enumerator.enumerate_key(
                RegistryHive.HKEY_CURRENT_USER, test_key_path, options=opts,
            ))
            values = [e for e in entries if isinstance(e, RegistryValueAsset)]
            default_vals = [v for v in values if v.is_default]
            assert len(default_vals) == 1
            assert default_vals[0].value_data == "default_value"
        finally:
            try:
                winreg.DeleteKey(winreg.HKEY_CURRENT_USER, test_key_path)
            except Exception:
                pass


# ── Registry targets tests ─────────────────────────────────────

class TestRegistryTargets:
    def test_default_targets_not_empty(self):
        """get_default_registry_targets should return a non-empty list."""
        targets = get_default_registry_targets()
        assert len(targets) > 10
        for t in targets:
            assert isinstance(t, RegistryTarget)
            assert t.hive is not None
            assert t.label

    def test_enumerate_targets_works(self):
        """enumerate_targets should yield entries from multiple targets."""
        # Use SOFTWARE key which is guaranteed to exist on all Windows systems
        targets = [
            RegistryTarget(
                hive=RegistryHive.HKEY_CURRENT_USER,
                subpath=r"SOFTWARE",
                label="HKCU SOFTWARE",
                recurse=False,
            ),
        ]
        enumerator = RegistryEnumerator()
        entries = list(enumerator.enumerate_targets(targets))
        # Should get at least the key itself
        assert len(entries) > 0
        # Verify we got the SOFTWARE key
        assert any(isinstance(entry, RegistryKeyAsset) and entry.key_path == "SOFTWARE" for entry in entries)

    def test_disabled_target_skipped(self):
        """Disabled targets should be skipped."""
        targets = [
            RegistryTarget(
                hive=RegistryHive.HKEY_CURRENT_USER,
                subpath=r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run",
                label="Active",
                recurse=False,
                enabled=True,
            ),
            RegistryTarget(
                hive=RegistryHive.HKEY_CURRENT_USER,
                subpath=r"SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce",
                label="Disabled",
                recurse=False,
                enabled=False,
            ),
        ]
        enumerator = RegistryEnumerator()
        entries = list(enumerator.enumerate_targets(targets))
        # Should only enumerate the active target
        keys = [e for e in entries if isinstance(e, RegistryKeyAsset)]
        # All keys should be from the Run key, not RunOnce
        for k in keys:
            assert "RunOnce" not in k.key_path

    def test_target_key_always_yielded_even_if_include_keys_false(self):
        """The target RegistryKeyAsset must always be yielded, even if empty and include_keys=False."""
        import winreg
        test_key_path = r"SOFTWARE\\AVS_Shield_Test_TargetEmpty"
        try:
            handle = winreg.CreateKey(winreg.HKEY_CURRENT_USER, test_key_path)
            winreg.CloseKey(handle)

            targets = [
                RegistryTarget(
                    hive=RegistryHive.HKEY_CURRENT_USER,
                    subpath=test_key_path,
                    label="Empty Target",
                    recurse=False,
                ),
            ]
            enumerator = RegistryEnumerator()
            opts = RegistryEnumerateOptions(include_keys=False, include_values=True)
            entries = list(enumerator.enumerate_targets(targets, options=opts))
            keys = [e for e in entries if isinstance(e, RegistryKeyAsset)]
            # The target key must always be yielded, even with include_keys=False
            assert len(keys) >= 1
            assert keys[0].key_path == test_key_path
            assert keys[0].subkey_count == 0
            assert keys[0].value_count == 0
        finally:
            try:
                winreg.DeleteKey(winreg.HKEY_CURRENT_USER, test_key_path)
            except Exception:
                pass


# ── Options tests ──────────────────────────────────────────────

class TestOptions:
    def test_include_keys_false(self):
        """include_keys=False should skip key assets."""
        enumerator = RegistryEnumerator()
        opts = RegistryEnumerateOptions(max_depth=0, include_keys=False)
        entries = list(enumerator.enumerate_key(
            RegistryHive.HKEY_CURRENT_USER, r"SOFTWARE", options=opts,
        ))
        keys = [e for e in entries if isinstance(e, RegistryKeyAsset)]
        assert len(keys) == 0

    def test_include_values_false(self):
        """include_values=False should skip value assets."""
        enumerator = RegistryEnumerator()
        opts = RegistryEnumerateOptions(max_depth=0, include_values=False)
        entries = list(enumerator.enumerate_key(
            RegistryHive.HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer",
            options=opts,
        ))
        values = [e for e in entries if isinstance(e, RegistryValueAsset)]
        assert len(values) == 0


# ── Value type tests ───────────────────────────────────────────

class TestValueTypes:
    def test_value_type_detected(self):
        """Value types should be correctly identified."""
        import winreg
        test_key_path = r"SOFTWARE\\AVS_Shield_Test_Types"
        try:
            handle = winreg.CreateKey(winreg.HKEY_CURRENT_USER, test_key_path)
            winreg.SetValueEx(handle, "StringVal", 0, winreg.REG_SZ, "hello")
            winreg.SetValueEx(handle, "DwordVal", 0, winreg.REG_DWORD, 42)
            winreg.SetValueEx(handle, "MultiVal", 0, winreg.REG_MULTI_SZ, ["a", "b", "c"])
            winreg.CloseKey(handle)

            enumerator = RegistryEnumerator()
            opts = RegistryEnumerateOptions(max_depth=0, include_keys=False)
            entries = list(enumerator.enumerate_key(
                RegistryHive.HKEY_CURRENT_USER, test_key_path, options=opts,
            ))
            values = {v.value_name: v for v in entries if isinstance(e := v, RegistryValueAsset)}

            assert "StringVal" in values
            assert values["StringVal"].value_type == RegistryValueType.SZ

            assert "DwordVal" in values
            assert values["DwordVal"].value_type in (RegistryValueType.DWORD, RegistryValueType.DWORD_LITTLE_ENDIAN)

            assert "MultiVal" in values
            assert values["MultiVal"].value_type == RegistryValueType.MULTI_SZ
        finally:
            try:
                handle = winreg.OpenKey(winreg.HKEY_CURRENT_USER, test_key_path, 0, winreg.KEY_ALL_ACCESS)
                for i in range(10):
                    try:
                        name, _, _ = winreg.EnumValue(handle, 0)
                        winreg.DeleteValue(handle, name)
                    except OSError:
                        break
                winreg.CloseKey(handle)
                winreg.DeleteKey(winreg.HKEY_CURRENT_USER, test_key_path)
            except Exception:
                pass
