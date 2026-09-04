"""Email Notification System — alert users about threat detections.

Sends email notifications when threats are detected, quarantined, or
when scan results are available. Supports SMTP configuration and
template-based email generation.

Notifications are sent for:
  - Critical threat detections (immediate)
  - Scan completion summary (batch)
  - Quarantine actions
  - Real-time protection events

Configuration is stored in:
    %LOCALAPPDATA%\\AVS AI Shield\\threat_engine\\email_config.json

RPC methods:
    email_notify.status       - get notification status
    email_notify.configure    - configure SMTP settings
    email_notify.test         - send a test email
    email_notify.send         - send a threat notification
    email_notify.history      - get notification history
"""
from __future__ import annotations

import json
import logging
import os
import smtplib
import ssl
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any

from avs_backend.api.registry import register

log = logging.getLogger("avs.email_notify")

_DATA_DIR = Path(os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))) / "AVS AI Shield" / "threat_engine"
_DATA_DIR.mkdir(parents=True, exist_ok=True)
_CONFIG_PATH = _DATA_DIR / "email_config.json"
_HISTORY_PATH = _DATA_DIR / "email_history.json"

_MAX_HISTORY = 200


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_json(path: Path, default: dict[str, Any]) -> dict[str, Any]:
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return default


def _save_json(path: Path, data: dict[str, Any]) -> None:
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        log.error("Failed to save %s: %s", path, e)


def _load_config() -> dict[str, Any]:
    config = _load_json(_CONFIG_PATH, {
        "enabled": False,
        "smtp_server": "",
        "smtp_port": 587,
        "use_tls": True,
        "username": "",
        "password_encrypted": "",  # DPAPI-encrypted, base64-encoded
        "from_email": "",
        "to_emails": [],
        "notify_on_critical": True,
        "notify_on_scan_complete": False,
        "notify_on_quarantine": True,
        "min_severity": "high",
    })
    # Decrypt password for in-memory use
    config["password"] = _decrypt_password(config.pop("password_encrypted", ""))
    return config


def _save_config(config: dict[str, Any]) -> None:
    # Encrypt password before saving to disk
    save_config = dict(config)
    save_config["password_encrypted"] = _encrypt_password(save_config.pop("password", ""))
    _save_json(_CONFIG_PATH, save_config)


def _encrypt_password(plaintext: str) -> str:
    """Encrypt password using Windows DPAPI if available, else base64."""
    if not plaintext:
        return ""
    try:
        import base64
        # Try Windows DPAPI via ctypes
        import ctypes
        from ctypes import wintypes

        class DATA_BLOB(ctypes.Structure):
            _fields_ = [("cbData", wintypes.DWORD),
                        ("pbData", ctypes.POINTER(ctypes.c_char))]

        src = DATA_BLOB()
        src.cbData = len(plaintext.encode("utf-8"))
        src.pbData = ctypes.cast(
            ctypes.create_string_buffer(plaintext.encode("utf-8")),
            ctypes.POINTER(ctypes.c_char))
        dst = DATA_BLOB()
        # CRYPTPROTECT_UI_FORBIDDEN = 0x01
        if ctypes.windll.crypt32.CryptProtectData(
                ctypes.byref(src), None, None, None, None, 0x01, ctypes.byref(dst)):
            encrypted = ctypes.string_at(dst.pbData, dst.cbData)
            ctypes.windll.kernel32.LocalFree(dst.pbData)
            return base64.b64encode(encrypted).decode("ascii")
    except Exception:
        pass
    # Fallback: base64 encoding (obfuscation, not real encryption)
    import base64
    return "b64:" + base64.b64encode(plaintext.encode("utf-8")).decode("ascii")


def _decrypt_password(encrypted: str) -> str:
    """Decrypt password using Windows DPAPI if available, else base64."""
    if not encrypted:
        return ""
    try:
        import base64
        # Check if it's base64 fallback
        if encrypted.startswith("b64:"):
            return base64.b64decode(encrypted[4:]).decode("utf-8")
        # Try Windows DPAPI
        import ctypes
        from ctypes import wintypes

        class DATA_BLOB(ctypes.Structure):
            _fields_ = [("cbData", wintypes.DWORD),
                        ("pbData", ctypes.POINTER(ctypes.c_char))]

        src = DATA_BLOB()
        raw = base64.b64decode(encrypted)
        src.cbData = len(raw)
        src.pbData = ctypes.cast(
            ctypes.create_string_buffer(raw),
            ctypes.POINTER(ctypes.c_char))
        dst = DATA_BLOB()
        if ctypes.windll.crypt32.CryptUnprotectData(
                ctypes.byref(src), None, None, None, None, 0x01, ctypes.byref(dst)):
            decrypted = ctypes.string_at(dst.pbData, dst.cbData)
            ctypes.windll.kernel32.LocalFree(dst.pbData)
            return decrypted.decode("utf-8")
    except Exception:
        pass
    return ""


def _load_history() -> dict[str, Any]:
    return _load_json(_HISTORY_PATH, {"notifications": [], "updated_at": _now_iso()})


def _save_history(history: dict[str, Any]) -> None:
    _save_json(_HISTORY_PATH, history)


def _add_history_entry(entry: dict[str, Any]) -> None:
    history = _load_history()
    history["notifications"].append(entry)
    if len(history["notifications"]) > _MAX_HISTORY:
        history["notifications"] = history["notifications"][-_MAX_HISTORY:]
    history["updated_at"] = _now_iso()
    _save_history(history)


def _build_threat_email(threats: list[dict[str, Any]], scan_summary: dict[str, Any] | None = None) -> tuple[str, str]:
    """Build email subject and body for threat notification.

    Returns (subject, body) as a tuple. Body is HTML.
    """
    critical_count = sum(1 for t in threats if t.get("severity") == "critical")
    high_count = sum(1 for t in threats if t.get("severity") == "high")
    medium_count = sum(1 for t in threats if t.get("severity") == "medium")
    low_count = sum(1 for t in threats if t.get("severity") == "low")

    subject = f"[AVS AI Shield] {len(threats)} threat(s) detected"

    html_parts = [
        "<html><body style='font-family: Arial, sans-serif; max-width: 800px;'>",
        "<h2 style='color: #d32f2f;'>AVS AI Shield — Threat Detection Alert</h2>",
        f"<p><strong>Detection time:</strong> {_now_iso()}</p>",
        f"<p><strong>Total threats:</strong> {len(threats)}</p>",
        "<ul>",
        f"<li style='color: #d32f2f;'><strong>Critical:</strong> {critical_count}</li>",
        f"<li style='color: #f57c00;'><strong>High:</strong> {high_count}</li>",
        f"<li style='color: #fbc02d;'><strong>Medium:</strong> {medium_count}</li>",
        f"<li style='color: #388e3c;'><strong>Low:</strong> {low_count}</li>",
        "</ul>",
    ]

    if scan_summary:
        html_parts.append(f"<p><strong>Scan type:</strong> {scan_summary.get('scan_type', 'N/A')}</p>")
        html_parts.append(f"<p><strong>Files scanned:</strong> {scan_summary.get('files_scanned', 0)}</p>")

    html_parts.append("<h3>Threat Details:</h3><table border='1' cellpadding='5' style='border-collapse: collapse;'>")
    html_parts.append("<tr><th>File</th><th>Threat Name</th><th>Type</th><th>Severity</th><th>Source</th><th>Status</th></tr>")

    for threat in threats[:50]:  # Limit to 50 in email
        file_name = os.path.basename(threat.get("file_path", "Unknown"))
        threat_name = threat.get("threat_name", "Unknown")
        threat_type = threat.get("threat_type", "unknown")
        severity = threat.get("severity", "medium")
        source = threat.get("detection_source", "unknown")
        status = threat.get("status", "detected")

        severity_color = {
            "critical": "#d32f2f",
            "high": "#f57c00",
            "medium": "#fbc02d",
            "low": "#388e3c",
        }.get(severity, "#757575")

        html_parts.append(
            f"<tr>"
            f"<td>{file_name}</td>"
            f"<td>{threat_name}</td>"
            f"<td>{threat_type}</td>"
            f"<td style='color: {severity_color};'><strong>{severity}</strong></td>"
            f"<td>{source}</td>"
            f"<td>{status}</td>"
            f"</tr>"
        )

    if len(threats) > 50:
        html_parts.append(f"<tr><td colspan='6'><em>... and {len(threats) - 50} more</em></td></tr>")

    html_parts.append("</table>")
    html_parts.append("<hr><p style='color: #757575; font-size: 12px;'>This alert was generated by AVS AI Shield.</p>")
    html_parts.append("</body></html>")

    return subject, "".join(html_parts)


def _send_email(config: dict[str, Any], subject: str, html_body: str) -> dict[str, Any]:
    """Send an email using the configured SMTP server."""
    if not config.get("smtp_server") or not config.get("to_emails"):
        return {"success": False, "error": "SMTP server and recipient emails are required"}

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = config.get("from_email", config.get("username", "avs@localhost"))
    msg["To"] = ", ".join(config["to_emails"])

    # Plain text fallback
    text_body = subject + "\n\nPlease view this email in an HTML-compatible client."
    msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    try:
        if config.get("use_tls", True):
            context = ssl.create_default_context()
            with smtplib.SMTP(config["smtp_server"], int(config.get("smtp_port", 587)), timeout=30) as server:
                server.starttls(context=context)
                if config.get("username") and config.get("password"):
                    server.login(config["username"], config["password"])
                server.sendmail(msg["From"], config["to_emails"], msg.as_string())
        else:
            with smtplib.SMTP(config["smtp_server"], int(config.get("smtp_port", 25)), timeout=30) as server:
                if config.get("username") and config.get("password"):
                    server.login(config["username"], config["password"])
                server.sendmail(msg["From"], config["to_emails"], msg.as_string())

        return {"success": True, "sent_at": _now_iso()}
    except Exception as e:
        log.error("Failed to send email: %s", e)
        return {"success": False, "error": str(e)}


def notify_threats(threats: list[dict[str, Any]], scan_summary: dict[str, Any] | None = None) -> dict[str, Any]:
    """Send a threat detection notification email.

    Called automatically when threats are detected (if enabled).
    """
    config = _load_config()

    if not config.get("enabled"):
        return {"success": False, "error": "Email notifications are disabled"}

    if not threats:
        return {"success": True, "message": "No threats to report"}

    # Check severity filter
    min_severity = config.get("min_severity", "high")
    severity_order = {"low": 0, "medium": 1, "high": 2, "critical": 3}
    min_level = severity_order.get(min_severity, 2)
    filtered = [t for t in threats if severity_order.get(t.get("severity", "medium"), 1) >= min_level]

    if not filtered:
        return {"success": True, "message": f"No threats at or above {min_severity} severity"}

    subject, html_body = _build_threat_email(filtered, scan_summary)
    result = _send_email(config, subject, html_body)

    # Record in history
    _add_history_entry({
        "type": "threat_detection",
        "sent_at": _now_iso(),
        "threat_count": len(filtered),
        "subject": subject,
        "success": result.get("success", False),
        "error": result.get("error"),
    })

    return result


# ─── RPC handlers ────────────────────────────────────────────────────

@register("email_notify.status")
def email_notify_status(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get email notification status."""
    config = _load_config()
    history = _load_history()

    # Don't expose the password
    safe_config = {k: v for k, v in config.items() if k != "password"}
    safe_config["has_password"] = bool(config.get("password"))

    return {
        "success": True,
        "config": safe_config,
        "history_count": len(history.get("notifications", [])),
    }


@register("email_notify.configure")
def email_notify_configure(params: dict[str, Any] | None) -> dict[str, Any]:
    """Configure email notification settings.

    Params:
        enabled: bool
        smtp_server: str
        smtp_port: int
        use_tls: bool
        username: str
        password: str
        from_email: str
        to_emails: list[str]
        notify_on_critical: bool
        notify_on_scan_complete: bool
        notify_on_quarantine: bool
        min_severity: str (low, medium, high, critical)
    """
    params = params or {}
    config = _load_config()

    # Update fields that are provided
    for key in ["enabled", "smtp_server", "smtp_port", "use_tls", "username",
                "from_email", "to_emails", "notify_on_critical",
                "notify_on_scan_complete", "notify_on_quarantine", "min_severity"]:
        if key in params:
            config[key] = params[key]

    # Only update password if provided (don't clear it)
    if params.get("password"):
        config["password"] = params["password"]

    _save_config(config)
    return {"success": True, "message": "Email configuration updated"}


@register("email_notify.test")
def email_notify_test(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Send a test email to verify configuration."""
    config = _load_config()

    if not config.get("enabled"):
        return {"success": False, "error": "Email notifications are disabled"}

    subject = "[AVS AI Shield] Test Notification"
    html_body = (
        "<html><body style='font-family: Arial, sans-serif;'>"
        "<h2>AVS AI Shield — Test Notification</h2>"
        f"<p>This is a test email sent at {_now_iso()}.</p>"
        "<p>If you received this email, your AVS AI Shield notification "
        "configuration is working correctly.</p>"
        "<hr><p style='color: #757575; font-size: 12px;'>AVS AI Shield</p>"
        "</body></html>"
    )

    result = _send_email(config, subject, html_body)

    _add_history_entry({
        "type": "test",
        "sent_at": _now_iso(),
        "subject": subject,
        "success": result.get("success", False),
        "error": result.get("error"),
    })

    return result


@register("email_notify.send")
def email_notify_send(params: dict[str, Any] | None) -> dict[str, Any]:
    """Send a threat notification email manually.

    Params:
        threats: list of threat dicts
        scan_summary: optional scan summary dict
    """
    params = params or {}
    threats = params.get("threats", [])
    scan_summary = params.get("scan_summary")
    return notify_threats(threats, scan_summary)


@register("email_notify.history")
def email_notify_history(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get notification history.

    Params:
        limit: max entries to return (default 50)
    """
    limit = 50
    if params and "limit" in params:
        limit = int(params["limit"])

    history = _load_history()
    notifications = history.get("notifications", [])[-limit:]
    return {
        "success": True,
        "notifications": notifications,
        "count": len(notifications),
        "total": len(history.get("notifications", [])),
    }
