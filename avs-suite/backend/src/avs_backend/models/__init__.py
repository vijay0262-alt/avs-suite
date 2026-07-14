"""Shared dataclasses used across feature modules. Scaffold only."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True, frozen=True)
class HealthSnapshot:
    score: float
    cpu_usage: float
    memory_usage: float
    disk_usage: float
    captured_at: str  # ISO-8601 UTC


@dataclass(slots=True, frozen=True)
class StartupEntry:
    name: str
    command: str
    enabled: bool
    location: str  # e.g. "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"
