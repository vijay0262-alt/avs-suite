"""Threat Statistics — aggregate threat data for dashboard visualization.

Provides:
  - Total threats detected (all time)
  - Threats by category (virus, trojan, ransomware, adware, PUP, etc.)
  - Threats by severity (critical, high, medium, low)
  - Threats by source (ClamAV, YARA, hash, AMSI, VirusTotal, etc.)
  - Scan frequency over time (last 30 days)
  - Top threat names
  - Top infected paths/directories
  - Quarantine stats (total ever quarantined, currently in quarantine)
  - Scan stats (total scans, avg files scanned, avg duration)
  - Recent activity timeline (last 10 events)
"""
from __future__ import annotations

import json
import logging
import os
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger("avs.threat_engine.threat_stats")

_DATA_DIR = Path(
    os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))
) / "AVS AI Shield" / "threat_engine"

_HISTORY_PATH = _DATA_DIR / "history.json"
_SCAN_SUMMARIES_PATH = _DATA_DIR / "scan_summaries.json"


def _load_history() -> list[dict[str, Any]]:
    if _HISTORY_PATH.exists():
        try:
            with open(_HISTORY_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            log.warning("Failed to load history: %s", e)
    return []


def _load_summaries() -> list[dict[str, Any]]:
    if _SCAN_SUMMARIES_PATH.exists():
        try:
            with open(_SCAN_SUMMARIES_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return []


def _get_quarantine_count() -> int:
    try:
        from avs_backend.threat_engine.quarantine_manager import list_quarantined
        items = list_quarantined()
        return len(items) if items else 0
    except Exception:
        return 0


def compute_threat_statistics() -> dict[str, Any]:
    """Compute comprehensive threat statistics from scan history."""
    history = _load_history()
    summaries = _load_summaries()

    # ─── Overall totals ───
    total_scans = len(history)
    total_threats = sum(h.get("threats_found", 0) for h in history)
    total_files_scanned = sum(h.get("files_scanned", 0) for h in history)

    # ─── Collect all threats from history ───
    all_threats: list[dict[str, Any]] = []
    for h in history:
        all_threats.extend(h.get("threats", []))

    # ─── By category ───
    by_category = Counter(t.get("category", "unknown") for t in all_threats)

    # ─── By severity ───
    by_severity = Counter(t.get("severity", "medium") for t in all_threats)

    # ─── By source ───
    by_source = Counter(t.get("source", "unknown") for t in all_threats)

    # ─── Top threat names ───
    by_name = Counter(t.get("name", "Unknown") for t in all_threats)
    top_threats = [
        {"name": name, "count": count}
        for name, count in by_name.most_common(10)
    ]

    # ─── Top infected directories ───
    dir_counter: Counter = Counter()
    for t in all_threats:
        path = t.get("path", "")
        if path:
            # Get parent directory
            parent = os.path.dirname(path)
            if parent:
                # Take last 2 path components for readability
                parts = parent.replace("\\", "/").split("/")
                short = "/".join(parts[-2:]) if len(parts) >= 2 else parent
                dir_counter[short] += 1
    top_directories = [
        {"path": d, "count": c}
        for d, c in dir_counter.most_common(10)
    ]

    # ─── Scan frequency (last 30 days) ───
    now = datetime.now(timezone.utc)
    thirty_days_ago = now - timedelta(days=30)
    scan_frequency: list[dict[str, Any]] = []
    for h in history:
        completed = h.get("completed_at")
        if completed:
            try:
                scan_date = datetime.fromisoformat(completed.replace("Z", "+00:00"))
                if scan_date >= thirty_days_ago:
                    scan_frequency.append({
                        "date": completed,
                        "scan_type": h.get("scan_type", "custom"),
                        "threats_found": h.get("threats_found", 0),
                        "files_scanned": h.get("files_scanned", 0),
                    })
            except Exception:
                pass
    scan_frequency.sort(key=lambda x: x["date"])

    # ─── Threats over time (daily aggregation) ───
    daily_threats: dict[str, int] = {}
    for h in history:
        completed = h.get("completed_at")
        if completed:
            try:
                scan_date = datetime.fromisoformat(completed.replace("Z", "+00:00"))
                if scan_date >= thirty_days_ago:
                    day_key = scan_date.strftime("%Y-%m-%d")
                    daily_threats[day_key] = daily_threats.get(day_key, 0) + h.get("threats_found", 0)
            except Exception:
                pass
    threats_over_time = [
        {"date": day, "threats": count}
        for day, count in sorted(daily_threats.items())
    ]

    # ─── Scan type breakdown ───
    by_scan_type = Counter(h.get("scan_type", "custom") for h in history)

    # ─── Quarantine stats ───
    current_quarantine = _get_quarantine_count()
    total_quarantined = sum(
        1 for t in all_threats if t.get("quarantined", False)
    )

    # ─── Recent activity timeline ───
    recent_activity: list[dict[str, Any]] = []
    for h in history[-10:]:
        recent_activity.append({
            "type": "scan",
            "scan_type": h.get("scan_type", "custom"),
            "date": h.get("completed_at"),
            "threats_found": h.get("threats_found", 0),
            "files_scanned": h.get("files_scanned", 0),
        })
    recent_activity.reverse()

    # ─── Avg stats ───
    avg_files = total_files_scanned // total_scans if total_scans > 0 else 0
    clean_scans = sum(1 for h in history if h.get("threats_found", 0) == 0)
    infected_scans = total_scans - clean_scans

    # ─── Last scan info ───
    last_scan = history[-1] if history else None
    last_scan_info = None
    if last_scan:
        last_scan_info = {
            "date": last_scan.get("completed_at"),
            "scan_type": last_scan.get("scan_type"),
            "threats_found": last_scan.get("threats_found", 0),
            "files_scanned": last_scan.get("files_scanned", 0),
        }

    return {
        "total_scans": total_scans,
        "total_threats_detected": total_threats,
        "total_files_scanned": total_files_scanned,
        "avg_files_per_scan": avg_files,
        "clean_scans": clean_scans,
        "infected_scans": infected_scans,
        "current_quarantine_count": current_quarantine,
        "total_quarantined": total_quarantined,
        "by_category": dict(by_category),
        "by_severity": dict(by_severity),
        "by_source": dict(by_source),
        "by_scan_type": dict(by_scan_type),
        "top_threats": top_threats,
        "top_directories": top_directories,
        "scan_frequency": scan_frequency,
        "threats_over_time": threats_over_time,
        "recent_activity": recent_activity,
        "last_scan": last_scan_info,
        "captured_at": datetime.now(timezone.utc).isoformat(),
    }
