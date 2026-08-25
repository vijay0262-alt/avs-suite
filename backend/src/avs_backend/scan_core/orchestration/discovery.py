"""SC-8C5 discovery engines for the scan orchestrator."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator, Optional, Protocol

from ..adapters.adapter_registry import convert_to_asset
from ..context import ScanContext
from ..rules.action_path_validation import PathValidationError, validate_filesystem_path
from ..enumerator import (
    CancelEvent,
    EnumerateOptions,
    FilesystemEnumerator,
    ProgressCallback,
    ProgressEvent,
    ScanLocation,
    get_default_scan_locations,
)
from ..rules.evaluator import CancellationToken


logger = logging.getLogger(__name__)


class DiscoveryEngine(Protocol):
    """Pluggable discovery source for ScanOrchestrator."""

    name: str

    def enumerate(
        self,
        scan_context: ScanContext,
        cancellation_token: CancellationToken,
        on_progress: Optional[ProgressCallback] = None,
    ) -> Iterator[Any]:
        """Yield raw discovered objects for the scan."""
        ...


class _CancelAdapter(CancelEvent):
    """Wraps a CancellationToken so the FilesystemEnumerator can query it."""

    def __init__(self, token: CancellationToken) -> None:
        self._token = token

    @property
    def is_cancelled(self) -> bool:  # type: ignore[override]
        return self._token.is_cancelled

    def cancel(self) -> None:  # type: ignore[override]
        self._token.cancel()


@dataclass
class FilesystemDiscoveryEngine:
    """Filesystem discovery via the existing streaming enumerator and adapter."""

    name: str = "filesystem"
    quick_labels: frozenset[str] = frozenset(
        {"Temp", "LocalAppData", "AppData (Roaming)"}
    )

    def enumerate(
        self,
        scan_context: ScanContext,
        cancellation_token: CancellationToken,
        on_progress: Optional[ProgressCallback] = None,
    ) -> Iterator[Any]:
        """Yield filesystem entries converted to ScanAsset."""
        locations = self._select_locations(scan_context)
        if not locations:
            return

        enumerator = FilesystemEnumerator()
        adapter = _AdapterProgress(on_progress)
        # V1.0: Apply a filter chain that excludes pytest temp directories
        # from production scans.  Pytest creates temp dirs inside %TEMP%
        # (e.g. pytest-of-<user>/pytest-<N>/...) which are test artifacts,
        # not real cleanup targets.
        # NOTE: The filter is ONLY applied to production scan locations
        # (quick/full scans).  When an explicit requested_scope is provided
        # (e.g. by tests), no filter is applied so the scope is enumerated
        # exactly as requested.
        from ..filters import FilterChain, PytestTempExclusionFilter

        filter_chain = None
        if not scan_context.requested_scope:
            filter_chain = FilterChain(PytestTempExclusionFilter())

        options = EnumerateOptions(
            cancel_event=_CancelAdapter(cancellation_token),
            progress_interval=250,
            # V1.0: Lock checking is deferred to the pre-execution
            # revalidation phase (RemediationCoordinator.
            # revalidate_planned_actions) which only checks PLANNED
            # actions (typically ~1K), not all discovered files (67K+).
            # Doing CreateFileW per file during discovery is too slow.
            check_locked=False,
            filter=filter_chain,
        )
        for entry in enumerator.enumerate_locations(
            locations,
            options=options,
            on_progress=adapter.wrap if on_progress else None,
        ):
            if cancellation_token.is_cancelled:
                break
            yield entry

    def _select_locations(self, scan_context: ScanContext) -> list[ScanLocation]:
        """Return filesystem locations for the current scan mode.

        For quick scans, we target only the specific directories where the
        canonical detection rules look for junk/cache files. This is NOT
        an arbitrary exclusion — it is a deliberate scan profile that
        matches the rule registry's known locations:

        - User temp (%TEMP%, %LOCALAPPDATA%\\Temp)
        - Windows temp (%SystemRoot%\\Temp)
        - Shader caches (D3DSCache, NVIDIA/AMD caches)
        - Thumbnail cache (Explorer)
        - Browser caches (Chrome, Edge, Brave, Firefox)
        - Application temp (Office)
        - Recycle Bin

        This reduces a 150K-file enumeration to ~5-15K files while still
        evaluating every canonical rule against every relevant asset.
        """
        if scan_context.requested_scope:
            valid: list[ScanLocation] = []
            for p in scan_context.requested_scope:
                try:
                    validate_filesystem_path(
                        p, allow_relative=False, allow_unc=False
                    )
                    normalized = os.path.abspath(os.path.normpath(p))
                    valid.append(ScanLocation(path=normalized, label=f"scope:{p}"))
                except PathValidationError as exc:
                    scan_context.error_count += 1
                    logger.warning(f"Rejected unsafe requested_scope path {p!r}: {exc}")
            return valid

        if scan_context.scan_type.value == "quick":
            return self._get_quick_scan_locations()

        return get_default_scan_locations()

    def _get_quick_scan_locations(self) -> list[ScanLocation]:
        """Return the deliberate quick-scan location set.

        These locations correspond exactly to the directories checked by
        the canonical junk/cache detection rules. Each location is a leaf
        directory that the rules evaluate, not a broad parent like
        LocalAppData or AppData.

        V1.0 Disk Cleanup+: Added Recycle Bin (all drives), Delivery
        Optimization, crash dumps, Windows Error Reporting, and
        Windows.old detection.
        """
        from ..rules.detection.locations import KnownLocations

        locations: list[ScanLocation] = []
        seen: set[str] = set()

        def _add(path: Path, label: str) -> None:
            key = str(path).lower()
            if key in seen:
                return
            seen.add(key)
            if path.is_dir():
                locations.append(ScanLocation(path=str(path), label=label))

        # User temp roots
        for root in KnownLocations.get_user_temp_roots():
            _add(root, "Temp")

        # Windows temp
        _add(KnownLocations.get_windows_temp_root(), "Windows Temp")

        # Shader caches
        for root in KnownLocations.get_shader_cache_roots():
            _add(root, "Shader Cache")

        # Thumbnail cache
        _add(KnownLocations.get_thumbnail_cache_root(), "Thumbnail Cache")

        # Application temp
        for root in KnownLocations.get_application_temp_roots():
            _add(root, "App Temp")

        # Browser caches
        for root in KnownLocations.get_browser_cache_roots():
            _add(root, "Browser Cache")

        # V1.0: Recycle Bin — NOT scanned via filesystem enumeration.
        # Recycle Bin files belong to user SIDs and may not be accessible
        # to the current user (WinError 5).  Instead, the Recycle Bin is
        # handled via the Windows SHEmptyRecycleBin API at cleanup time.
        # See RecycleBinExecutor and the auto-optimize RPC.
        # (Do NOT add Recycle Bin roots to the filesystem scan locations.)

        # V1.0: Delivery Optimization cache
        for root in KnownLocations.get_delivery_optimization_roots():
            _add(root, "Delivery Optimization")

        # V1.0: Crash dumps and Windows Error Reporting
        # Note: WER ReportArchive/ReportQueue may have restrictive ACLs.
        # The _is_locked check uses CreateFileW which may fail on these,
        # correctly classifying them as non-deletable. But we still scan
        # them because some WER files are deletable.
        for root in KnownLocations.get_crash_dump_roots():
            _add(root, "Crash Dumps")

        # V1.0: Windows.old (detected but NOT auto-cleaned — REVIEW_REQUIRED)
        _add(KnownLocations.get_windows_old_root(), "Windows.old")

        # V1.0: Windows Update cache
        _add(KnownLocations.get_windows_update_cache_root(), "Windows Update Cache")

        # V1.0: Installer patch cache
        _add(KnownLocations.get_installer_cache_root(), "Installer Cache")

        # V1.0: Application cache
        for root in KnownLocations.get_application_cache_roots():
            _add(root, "App Cache")

        # V1.0: Prefetch (Windows Disk Cleanup category)
        _add(KnownLocations.get_prefetch_root(), "Prefetch")

        # V1.0: Downloaded Program Files (legacy ActiveX)
        _add(KnownLocations.get_downloaded_program_files_root(), "Downloaded Program Files")

        # V1.0: Offline Web Pages (legacy IE)
        _add(KnownLocations.get_offline_web_pages_root(), "Offline Web Pages")

        # V1.0: Font Cache (auto-regenerated)
        _add(KnownLocations.get_font_cache_root(), "Font Cache")

        # V1.0: BranchCache (if enabled)
        _add(KnownLocations.get_branch_cache_root(), "BranchCache")

        # V1.0: RetailDemo
        _add(KnownLocations.get_retail_demo_root(), "RetailDemo")

        logger.info(
            f"Quick scan locations ({len(locations)}): "
            f"{[loc.label for loc in locations]}"
        )
        return locations


class _AdapterProgress:
    """Wraps a ProgressCallback to forward FilesystemEnumerator events."""

    def __init__(self, callback: Optional[ProgressCallback]) -> None:
        self._callback = callback

    def wrap(self, event: ProgressEvent) -> None:
        """Forward the progress event unchanged."""
        if self._callback is not None:
            self._callback(event)


def convert_entries_to_assets(entries: Iterator[Any]) -> Iterator[Any]:
    """Convert an iterator of raw discovery entries to ScanAssets."""
    for entry in entries:
        try:
            yield convert_to_asset(entry)
        except (ValueError, TypeError):
            continue
