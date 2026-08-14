"""SC-8C5 discovery engines for the scan orchestrator."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
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
        """Return filesystem locations for the current scan mode."""
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

        defaults = get_default_scan_locations()
        if scan_context.scan_type.value == "quick":
            return [loc for loc in defaults if loc.label in self.quick_labels]
        return defaults


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
