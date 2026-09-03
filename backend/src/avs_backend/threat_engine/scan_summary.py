"""Post-Scan Summary Report — generates a comprehensive report after scans.

Takes a completed scan's data and produces a user-friendly summary with:
  - Overall status (clean / threats found / errors)
  - Threats breakdown by category and severity
  - Files scanned and scan duration
  - Actions taken (quarantined, removed, restored)
  - Security posture assessment
  - Recommendations based on findings
  - Comparison with previous scans (trend)

The report is persisted so users can review past scan summaries.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger("avs.threat_engine.scan_summary")

_DATA_DIR = Path(
    os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))
) / "AVS AI Shield" / "threat_engine"

_SUMMARIES_PATH = _DATA_DIR / "scan_summaries.json"
_MAX_SUMMARIES = 100


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_summaries() -> list[dict[str, Any]]:
    if _SUMMARIES_PATH.exists():
        try:
            with open(_SUMMARIES_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            log.warning("Failed to load scan summaries: %s", e)
    return []


def _save_summaries(summaries: list[dict[str, Any]]) -> None:
    try:
        _DATA_DIR.mkdir(parents=True, exist_ok=True)
        with open(_SUMMARIES_PATH, "w", encoding="utf-8") as f:
            json.dump(summaries[-_MAX_SUMMARIES:], f, indent=2)
    except Exception as e:
        log.error("Failed to save scan summaries: %s", e)


def _categorize_threats(threats: list[dict[str, Any]]) -> dict[str, Any]:
    """Break down threats by category and severity."""
    by_category: dict[str, int] = {}
    by_severity: dict[str, int] = {}
    by_source: dict[str, int] = {}
    quarantined = 0
    removed = 0
    pending = 0

    for threat in threats:
        category = threat.get("category", "unknown")
        severity = threat.get("severity", "medium")
        source = threat.get("source", "unknown")

        by_category[category] = by_category.get(category, 0) + 1
        by_severity[severity] = by_severity.get(severity, 0) + 1
        by_source[source] = by_source.get(source, 0) + 1

        if threat.get("quarantined"):
            quarantined += 1
        elif threat.get("removed"):
            removed += 1
        else:
            pending += 1

    return {
        "by_category": by_category,
        "by_severity": by_severity,
        "by_source": by_source,
        "quarantined": quarantined,
        "removed": removed,
        "pending": pending,
    }


def _assess_posture(threats: list[dict[str, Any]], files_scanned: int) -> dict[str, Any]:
    """Assess security posture based on scan results."""
    threat_count = len(threats)
    high_severity = sum(1 for t in threats if t.get("severity") == "high")
    critical_threats = sum(1 for t in threats if t.get("severity") == "critical")

    if threat_count == 0:
        status = "clean"
        score = 100
        label = "Your PC is clean"
        color = "success"
    elif critical_threats > 0:
        status = "critical"
        score = 20
        label = "Critical threats detected"
        color = "danger"
    elif high_severity > 3:
        status = "at_risk"
        score = 40
        label = "Multiple high-severity threats"
        color = "danger"
    elif high_severity > 0:
        status = "at_risk"
        score = 55
        label = "High-severity threats detected"
        color = "warning"
    elif threat_count > 5:
        status = "warning"
        score = 65
        label = "Multiple threats detected"
        color = "warning"
    else:
        status = "warning"
        score = 75
        label = f"{threat_count} threat{'s' if threat_count != 1 else ''} detected"
        color = "warning"

    return {
        "status": status,
        "score": score,
        "label": label,
        "color": color,
        "threat_count": threat_count,
        "high_severity_count": high_severity,
        "critical_count": critical_threats,
    }


def _generate_recommendations(threats: list[dict[str, Any]], posture: dict[str, Any]) -> list[dict[str, Any]]:
    """Generate actionable recommendations based on scan results."""
    recs: list[dict[str, Any]] = []

    if posture["status"] == "clean":
        recs.append({
            "id": "all_clear",
            "priority": "info",
            "title": "No threats found",
            "description": "Your system is clean. Continue regular scans to stay protected.",
            "action": None,
        })
        return recs

    if posture["critical_count"] > 0:
        recs.append({
            "id": "critical_threats",
            "priority": "urgent",
            "title": f"{posture['critical_count']} critical threat(s) need immediate attention",
            "description": "Critical threats can cause data loss or system compromise. Quarantine or remove them immediately.",
            "action": "quarantine_all",
        })

    if posture["high_severity_count"] > 0:
        recs.append({
            "id": "high_threats",
            "priority": "high",
            "title": f"{posture['high_severity_count']} high-severity threat(s) detected",
            "description": "High-severity threats should be quarantined immediately to prevent damage.",
            "action": "quarantine_all",
        })

    pending = sum(1 for t in threats if not t.get("quarantined") and not t.get("removed"))
    if pending > 0:
        recs.append({
            "id": "pending_threats",
            "priority": "medium",
            "title": f"{pending} threat(s) awaiting action",
            "description": "Review and quarantine or remove pending threats from the Quarantine tab.",
            "action": "go_to_quarantine",
        })

    # Check for specific threat categories
    categories = set(t.get("category", "unknown") for t in threats)
    if "ransomware" in categories:
        recs.append({
            "id": "ransomware_found",
            "priority": "urgent",
            "title": "Ransomware detected",
            "description": "Enable Safe Folder protection to prevent ransomware from encrypting your files.",
            "action": "enable_safe_folder",
        })
    if "pup" in categories or "adware" in categories:
        recs.append({
            "id": "pup_found",
            "priority": "low",
            "title": "Potentially unwanted programs detected",
            "description": "PUPs and adware were found. Consider removing them to improve performance.",
            "action": "go_to_quarantine",
        })
    if "trojan" in categories:
        recs.append({
            "id": "trojan_found",
            "priority": "high",
            "title": "Trojan detected",
            "description": "Trojans can steal data or open backdoors. Quarantine and run a full system scan.",
            "action": "run_full_scan",
        })

    return recs


def generate_summary(scan_data: dict[str, Any]) -> dict[str, Any]:
    """Generate a comprehensive post-scan summary report.

    Args:
        scan_data: The scan result dict from _scans (contains status, threats,
                   files_scanned, started_at, completed_at, scan_type, etc.)

    Returns:
        A structured summary report dict.
    """
    threats = scan_data.get("threats", [])
    files_scanned = scan_data.get("files_scanned", 0)
    files_total = scan_data.get("files_total", 0)
    scan_type = scan_data.get("scan_type", "custom")
    started_at = scan_data.get("started_at")
    completed_at = scan_data.get("completed_at")
    errors = scan_data.get("errors", [])

    # Calculate duration
    duration_seconds = 0
    if started_at and completed_at:
        try:
            start = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
            end = datetime.fromisoformat(completed_at.replace("Z", "+00:00"))
            duration_seconds = int((end - start).total_seconds())
        except Exception:
            pass

    threat_breakdown = _categorize_threats(threats)
    posture = _assess_posture(threats, files_scanned)
    recommendations = _generate_recommendations(threats, posture)

    summary = {
        "report_id": f"scan_{int(datetime.now(timezone.utc).timestamp())}",
        "generated_at": _now_iso(),
        "scan_type": scan_type,
        "started_at": started_at,
        "completed_at": completed_at,
        "duration_seconds": duration_seconds,
        "files_scanned": files_scanned,
        "files_total": files_total,
        "threats_found": len(threats),
        "errors_count": len(errors),
        "posture": posture,
        "threat_breakdown": threat_breakdown,
        "recommendations": recommendations,
        "top_threats": [
            {
                "name": t.get("name", "Unknown"),
                "category": t.get("category", "unknown"),
                "severity": t.get("severity", "medium"),
                "path": t.get("path", ""),
                "source": t.get("source", ""),
                "quarantined": t.get("quarantined", False),
            }
            for t in threats[:10]  # Top 10 threats
        ],
    }

    # Persist the summary
    summaries = _load_summaries()
    summaries.append(summary)
    _save_summaries(summaries)

    return summary


def get_recent_summaries(limit: int = 10) -> list[dict[str, Any]]:
    """Get recent scan summary reports."""
    summaries = _load_summaries()
    return summaries[-limit:]


def get_summary_by_id(report_id: str) -> dict[str, Any] | None:
    """Get a specific summary report by ID."""
    summaries = _load_summaries()
    for s in summaries:
        if s.get("report_id") == report_id:
            return s
    return None


def get_trend() -> dict[str, Any]:
    """Get scan trend data (threats found per scan over time)."""
    summaries = _load_summaries()
    if not summaries:
        return {"trend": [], "total_scans": 0, "total_threats": 0, "avg_threats": 0}

    trend = [
        {
            "report_id": s.get("report_id"),
            "scan_type": s.get("scan_type"),
            "date": s.get("completed_at"),
            "threats_found": s.get("threats_found", 0),
            "files_scanned": s.get("files_scanned", 0),
            "posture_status": s.get("posture", {}).get("status"),
            "posture_score": s.get("posture", {}).get("score"),
        }
        for s in summaries[-20:]  # Last 20 scans
    ]

    total_threats = sum(s.get("threats_found", 0) for s in summaries)
    return {
        "trend": trend,
        "total_scans": len(summaries),
        "total_threats": total_threats,
        "avg_threats": round(total_threats / len(summaries), 1) if summaries else 0,
    }
