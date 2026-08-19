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
        options = EnumerateOptions(
            cancel_event=_CancelAdapter(cancellation_token),
            progress_interval=250,
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

        # Recycle Bin
        _add(Path("C:\\$Recycle.Bin"), "Recycle Bin")

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
