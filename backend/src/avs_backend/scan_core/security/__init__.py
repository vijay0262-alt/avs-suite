"""Security integration package — Windows Defender threat information."""

from __future__ import annotations

from .defender_integration import (
    DefenderStatus,
    DefenderThreat,
    DefenderThreatInfo,
    get_defender_threat_info,
)

__all__ = [
    "DefenderStatus",
    "DefenderThreat",
    "DefenderThreatInfo",
    "get_defender_threat_info",
]
