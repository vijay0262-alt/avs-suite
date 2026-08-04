"""Windows Event Logs cleaner.

Windows Event Tracing logs (.evtx files) accumulate under
``%SystemRoot%\\System32\\Winevt\\Logs\\``. Thousands of audit events
are written daily across Application, System, and Security channels.

This cleaner scans for stale ``.evtx`` files. The actual clearing of
active event log channels should be done via ``wevtutil`` commands
during the cleaning phase, but the scanner identifies the files so
the user can see how much space is consumed.
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

from ..interfaces import CleanerCategory
from ..scanner_base import BaseCleaner, expand


class EventLogCleaner(BaseCleaner):
    id = "event-logs"
    name = "Windows Event Logs"
    description = "Windows Event Log files (.evtx) accumulated by system auditing."
    category = CleanerCategory.LOGS
    extensions = ("evtx",)
    min_age_days = 7

    def targets(self) -> Iterable[Path]:
        return [
            expand(r"%SystemRoot%\System32\Winevt\Logs"),
        ]
