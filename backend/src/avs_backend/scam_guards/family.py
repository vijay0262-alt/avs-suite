"""Family alerts — notify a trusted contact on critical scam-guard events.

Free transport options, no account/server cost:
  * ntfy.sh topic — contact installs the free ntfy app and subscribes;
    we POST the alert to https://ntfy.sh/<topic>. Genuinely free push.
  * Generic webhook URL — Discord, Slack, or any HTTPS endpoint that
    accepts a JSON POST.

Config lives in family_alerts.json; sending is best-effort and never
blocks the guard thread.
"""

from __future__ import annotations

import json
import logging
import os
import urllib.request
from pathlib import Path
from typing import Any

log = logging.getLogger("avs.scam_guards.family")

_DATA_DIR = Path(os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))) / "AVS AI Shield" / "threat_engine"
_DATA_DIR.mkdir(parents=True, exist_ok=True)
_CONFIG_PATH = _DATA_DIR / "family_alerts.json"

_TIMEOUT = 15


def _load() -> dict[str, Any]:
    try:
        return json.loads(_CONFIG_PATH.read_text("utf-8"))
    except Exception:
        return {}


def _save(cfg: dict[str, Any]) -> None:
    tmp = _CONFIG_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(cfg), "utf-8")
    os.replace(tmp, _CONFIG_PATH)


def get_config() -> dict[str, Any]:
    cfg = _load()
    return {
        "enabled": bool(cfg.get("enabled")),
        "ntfy_topic": cfg.get("ntfy_topic", ""),
        "webhook_url": cfg.get("webhook_url", ""),
        "contact_name": cfg.get("contact_name", ""),
        "min_severity": cfg.get("min_severity", "critical"),
    }


def configure(**kw: Any) -> dict[str, Any]:
    cfg = _load()
    for k in ("enabled", "ntfy_topic", "webhook_url", "contact_name", "min_severity"):
        if k in kw and kw[k] is not None:
            cfg[k] = kw[k]
    _save(cfg)
    return get_config()


_SEVERITY_ORDER = {"low": 0, "medium": 1, "high": 2, "critical": 3}


def send_alert(alert: dict[str, Any]) -> dict[str, Any]:
    """Push a guard alert to configured family channels. Best-effort."""
    cfg = _load()
    if not cfg.get("enabled"):
        return {"sent": 0, "skipped": "disabled"}
    sev = alert.get("severity", "medium")
    if _SEVERITY_ORDER.get(sev, 0) < _SEVERITY_ORDER.get(cfg.get("min_severity", "critical"), 3):
        return {"sent": 0, "skipped": "below_min_severity"}

    title = f"AVS Scam Alert — {alert.get('type', 'event').replace('_', ' ')}"
    body = f"[{sev.upper()}] {alert.get('message', '')}"
    sent = 0
    errors: list[str] = []

    topic = (cfg.get("ntfy_topic") or "").strip()
    if topic:
        try:
            req = urllib.request.Request(
                f"https://ntfy.sh/{topic}", data=body.encode(),
                headers={"Title": title, "Priority": "urgent" if sev == "critical" else "high"},
                method="POST")
            with urllib.request.urlopen(req, timeout=_TIMEOUT):
                pass
            sent += 1
        except Exception as e:
            errors.append(f"ntfy: {e}")

    hook = (cfg.get("webhook_url") or "").strip()
    if hook:
        try:
            payload = json.dumps({
                "content": f"**{title}**\n{body}",
                "username": "AVS AI Shield",
            }).encode()
            req = urllib.request.Request(
                hook, data=payload,
                headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(req, timeout=_TIMEOUT):
                pass
            sent += 1
        except Exception as e:
            errors.append(f"webhook: {e}")

    result: dict[str, Any] = {"sent": sent}
    if errors:
        result["errors"] = errors
    return result
