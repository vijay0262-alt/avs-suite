"""Dashboard Security Score — comprehensive security posture assessment.

Combines multiple security factors into a single 0-100 score:
  - AVS AI Shield AV engine status (ClamAV running, definitions loaded)
  - Detection sources enabled (hash, YARA, AMSI, VirusTotal, heuristic, Defender)
  - Real-time protection status
  - Windows Defender & Firewall status
  - Windows Update status
  - Recent scan results (threats found, last scan date)
  - USB auto-scan enabled
  - Boot sector scan history
  - Definition freshness
  - Quarantine items pending

Each factor contributes a weighted portion of the overall score.
The score is broken down by category so the UI can show what needs attention.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger("avs.dashboard.security_score")

_DATA_DIR = Path(
    os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))
) / "AVS AI Shield" / "threat_engine"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_avs_av_status() -> dict[str, Any]:
    """Get AVS AI Shield AV engine status."""
    try:
        from avs_backend.threat_engine.clamav_scanner import detect_clamav_installation
        info = detect_clamav_installation()
        return {
            "installed": info.get("installed", False),
            "clamd_running": info.get("clamd_running", False),
            "signature_count": info.get("signature_count", 0),
            "version": info.get("version"),
        }
    except Exception:
        return {"installed": False, "clamd_running": False, "signature_count": 0}


def _get_detection_sources() -> dict[str, bool]:
    """Get enabled detection sources."""
    try:
        from avs_backend.threat_engine import _load_config
        cfg = _load_config()
        return cfg.get("enabled_sources", {})
    except Exception:
        return {}


def _get_defender_status() -> dict[str, Any]:
    """Get Windows Defender status."""
    try:
        from avs_backend.dashboard import _get_defender_status
        return _get_defender_status()
    except Exception:
        return {"enabled": False, "realTimeProtection": False}


def _get_firewall_status() -> dict[str, Any]:
    """Get Windows Firewall status."""
    try:
        from avs_backend.dashboard import _get_firewall_status
        return _get_firewall_status()
    except Exception:
        return {"enabled": False}


def _get_windows_update_status() -> dict[str, Any]:
    """Get Windows Update status."""
    try:
        from avs_backend.dashboard import _get_windows_update_status
        return _get_windows_update_status()
    except Exception:
        return {"pendingUpdates": 0}


def _get_recent_scan_info() -> dict[str, Any]:
    """Get info about the most recent scan."""
    try:
        history_path = _DATA_DIR / "history.json"
        if history_path.exists():
            with open(history_path, "r", encoding="utf-8") as f:
                history = json.load(f)
            if history:
                last = history[-1]
                return {
                    "last_scan_date": last.get("completed_at"),
                    "threats_found": last.get("threats_found", 0),
                    "scan_type": last.get("scan_type"),
                }
    except Exception:
        pass
    return {"last_scan_date": None, "threats_found": 0, "scan_type": None}


def _get_quarantine_count() -> int:
    """Get number of items in quarantine."""
    try:
        from avs_backend.threat_engine.quarantine_manager import list_quarantined
        items = list_quarantined()
        return len(items) if items else 0
    except Exception:
        return 0


def _get_realtime_status() -> dict[str, Any]:
    """Get real-time protection status."""
    try:
        from avs_backend.realtime_threat import realtime_threat_status
        result = realtime_threat_status(None)
        # Backend returns {success, status: {...}} — unwrap
        st = result.get("status", result) if isinstance(result, dict) else {}
        return {
            "file_monitor": st.get("etw_file_monitor", {}).get("running", False) if isinstance(st.get("etw_file_monitor"), dict) else False,
            "process_monitor": st.get("etw_process_monitor", {}).get("running", False) if isinstance(st.get("etw_process_monitor"), dict) else False,
            "usb_monitor": st.get("usb_monitor", {}).get("running", False) if isinstance(st.get("usb_monitor"), dict) else False,
        }
    except Exception:
        return {"file_monitor": False, "process_monitor": False, "usb_monitor": False}


def compute_security_score() -> dict[str, Any]:
    """Compute a comprehensive security score (0-100).

    Returns a dict with:
        - overall_score: 0-100
        - status: "excellent" | "good" | "fair" | "poor" | "critical"
        - categories: breakdown by category with sub-scores
        - factors: list of individual factor results
        - recommendations: what to fix to improve the score
    """
    factors: list[dict[str, Any]] = []
    recommendations: list[dict[str, Any]] = []

    # ─── 1. AVS AV Engine (20 points) ───
    avs = _get_avs_av_status()
    avs_score = 0
    if avs["installed"]:
        avs_score += 8
    if avs["clamd_running"]:
        avs_score += 8
    if avs["signature_count"] > 0:
        avs_score += 4
    factors.append({
        "id": "avs_av_engine",
        "name": "AVS AI Shield AV Engine",
        "score": avs_score,
        "max": 20,
        "status": "ok" if avs_score >= 16 else "warning" if avs_score >= 8 else "critical",
        "detail": f"Installed: {avs['installed']}, Running: {avs['clamd_running']}, Signatures: {avs['signature_count']}",
    })
    if avs_score < 16:
        recommendations.append({
            "id": "enable_avs_av",
            "priority": "high",
            "title": "Enable AVS AI Shield AV Engine",
            "description": "The AV engine is not fully active. Ensure ClamAV is running with fresh definitions.",
        })

    # ─── 2. Detection Sources (15 points) ───
    sources = _get_detection_sources()
    enabled_count = sum(1 for v in sources.values() if v)
    total_sources = max(len(sources), 7)
    sources_score = int((enabled_count / total_sources) * 15)
    factors.append({
        "id": "detection_sources",
        "name": "Detection Sources",
        "score": sources_score,
        "max": 15,
        "status": "ok" if sources_score >= 12 else "warning" if sources_score >= 8 else "critical",
        "detail": f"{enabled_count}/{total_sources} sources enabled",
    })
    if sources_score < 12:
        disabled = [k for k, v in sources.items() if not v]
        recommendations.append({
            "id": "enable_sources",
            "priority": "medium",
            "title": f"Enable more detection sources ({', '.join(disabled)})",
            "description": f"{len(disabled)} detection source(s) are disabled. Enable them for better coverage.",
        })

    # ─── 3. Windows Defender & Firewall (15 points) ───
    defender = _get_defender_status()
    firewall = _get_firewall_status()
    df_score = 0
    if defender.get("enabled"):
        df_score += 5
    if defender.get("realTimeProtection"):
        df_score += 5
    if firewall.get("enabled"):
        df_score += 5
    factors.append({
        "id": "defender_firewall",
        "name": "Windows Defender & Firewall",
        "score": df_score,
        "max": 15,
        "status": "ok" if df_score >= 12 else "warning" if df_score >= 7 else "critical",
        "detail": f"Defender: {defender.get('enabled', False)}, Real-time: {defender.get('realTimeProtection', False)}, Firewall: {firewall.get('enabled', False)}",
    })
    if not defender.get("enabled"):
        recommendations.append({
            "id": "enable_defender",
            "priority": "high",
            "title": "Enable Windows Defender",
            "description": "Windows Defender is disabled. Enable it for additional protection.",
        })
    if not firewall.get("enabled"):
        recommendations.append({
            "id": "enable_firewall",
            "priority": "high",
            "title": "Enable Windows Firewall",
            "description": "The firewall is disabled. Enable it to block unauthorized network access.",
        })

    # ─── 4. Real-time Protection (15 points) ───
    rt = _get_realtime_status()
    rt_score = 0
    # ClamAV daemon running = full real-time protection (15 points)
    if avs.get("clamd_running"):
        rt_score = 15
    else:
        # Partial credit for advanced monitoring if no ClamAV
        if rt["file_monitor"]:
            rt_score += 6
        if rt["process_monitor"]:
            rt_score += 5
        if rt["usb_monitor"]:
            rt_score += 4
    factors.append({
        "id": "realtime_protection",
        "name": "Real-time Protection",
        "score": rt_score,
        "max": 15,
        "status": "ok" if rt_score >= 11 else "warning" if rt_score >= 6 else "critical",
        "detail": f"AV Engine: {avs.get('clamd_running', False)}, File: {rt['file_monitor']}, Process: {rt['process_monitor']}, USB: {rt['usb_monitor']}",
    })
    if rt_score < 6:
        recommendations.append({
            "id": "enable_realtime",
            "priority": "high",
            "title": "Enable real-time protection",
            "description": "Real-time file, process, or USB monitoring is not fully active.",
        })

    # ─── 5. Windows Updates (10 points) ───
    updates = _get_windows_update_status()
    pending = updates.get("pendingUpdates", 0)
    upd_score = 10 if pending == 0 else 5 if pending <= 3 else 0
    factors.append({
        "id": "windows_updates",
        "name": "Windows Updates",
        "score": upd_score,
        "max": 10,
        "status": "ok" if pending == 0 else "warning" if pending <= 3 else "critical",
        "detail": f"{pending} pending updates",
    })
    if pending > 0:
        recommendations.append({
            "id": "install_updates",
            "priority": "medium" if pending <= 3 else "high",
            "title": f"Install {pending} pending Windows update(s)",
            "description": "Pending updates may contain security patches. Install them as soon as possible.",
        })

    # ─── 6. Recent Scan (10 points) ───
    recent = _get_recent_scan_info()
    scan_score = 0
    threats = recent.get("threats_found", 0)
    last_scan = recent.get("last_scan_date")

    if last_scan:
        try:
            scan_date = datetime.fromisoformat(last_scan.replace("Z", "+00:00"))
            days_ago = (datetime.now(timezone.utc) - scan_date).days
            if days_ago <= 1:
                scan_score += 7
            elif days_ago <= 7:
                scan_score += 5
            elif days_ago <= 30:
                scan_score += 2
        except Exception:
            pass

    if threats == 0:
        scan_score += 3
    factors.append({
        "id": "recent_scan",
        "name": "Recent Scan",
        "score": scan_score,
        "max": 10,
        "status": "ok" if scan_score >= 8 else "warning" if scan_score >= 4 else "critical",
        "detail": f"Last scan: {last_scan or 'Never'}, Threats: {threats}",
    })
    if scan_score < 4:
        recommendations.append({
            "id": "run_scan",
            "priority": "high",
            "title": "Run a security scan",
            "description": "No recent scan detected. Run a quick scan to check for threats.",
        })

    # ─── 7. Quarantine (10 points) ───
    quar_count = _get_quarantine_count()
    q_score = 10 if quar_count == 0 else 5 if quar_count <= 5 else 0
    factors.append({
        "id": "quarantine",
        "name": "Quarantine",
        "score": q_score,
        "max": 10,
        "status": "ok" if quar_count == 0 else "warning" if quar_count <= 5 else "critical",
        "detail": f"{quar_count} items in quarantine",
    })
    if quar_count > 0:
        recommendations.append({
            "id": "review_quarantine",
            "priority": "medium",
            "title": f"Review {quar_count} quarantined item(s)",
            "description": "Items in quarantine should be reviewed and permanently removed or restored.",
        })

    # ─── 8. Definition Freshness (5 points) ───
    def_score = 0
    sig_count = avs.get("signature_count", 0)
    # If clamd is running, use the live signature count
    if sig_count > 100000:
        def_score = 5
    elif sig_count > 10000:
        def_score = 3
    elif sig_count > 0:
        def_score = 1
    else:
        # ClamAV not running — check if database files exist on disk
        try:
            db_dir = Path(
                os.environ.get("LOCALAPPDATA", "")
            ) / "AVS AI Shield" / "clamav" / "db"
            if db_dir.is_dir():
                db_files = list(db_dir.glob("*.cvd")) + list(db_dir.glob("*.cld"))
                total_db_size = sum(f.stat().st_size for f in db_files if f.exists())
                if total_db_size > 50_000_000:  # >50MB means full definitions
                    def_score = 5
                elif total_db_size > 1_000_000:  # >1MB means partial
                    def_score = 3
                elif db_files:
                    def_score = 1
        except Exception:
            pass
    factors.append({
        "id": "definition_freshness",
        "name": "Definition Freshness",
        "score": def_score,
        "max": 5,
        "status": "ok" if def_score >= 4 else "warning" if def_score >= 2 else "critical",
        "detail": f"{sig_count} signatures loaded",
    })

    # ─── Calculate overall score ───
    overall_score = sum(f["score"] for f in factors)
    overall_score = max(0, min(100, overall_score))

    # Determine status
    if overall_score >= 90:
        status = "excellent"
    elif overall_score >= 75:
        status = "good"
    elif overall_score >= 50:
        status = "fair"
    elif overall_score >= 25:
        status = "poor"
    else:
        status = "critical"

    # Category breakdown
    categories = {
        "av_engine": avs_score,
        "detection_sources": sources_score,
        "defender_firewall": df_score,
        "realtime": rt_score,
        "updates": upd_score,
        "scan_history": scan_score,
        "quarantine": q_score,
        "definitions": def_score,
    }

    return {
        "overall_score": overall_score,
        "status": status,
        "categories": categories,
        "factors": factors,
        "recommendations": recommendations,
        "captured_at": _now_iso(),
    }
