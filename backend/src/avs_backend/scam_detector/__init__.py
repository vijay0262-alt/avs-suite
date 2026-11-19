"""Scam Detector — "Is this a scam?" assistant backend.

Analyzes pasted messages, screenshots (Windows OCR), URLs, and phone
numbers with a local explainable tactic classifier. Each extracted URL is
additionally checked by WebShield against signed threat intel.

RPC methods:
    scam_detector.analyzeText   {text, sensitivity?}
    scam_detector.analyzeImage  {path, sensitivity?}
    scam_detector.checkPhone    {phone}
    scam_detector.status

All analysis is on-device — no content leaves the PC. A future Pro tier
can attach a cloud AI verdict via the `cloud_hook` seam below without
changing the RPC contract.
"""

from __future__ import annotations

import logging
import platform
import re
from typing import Any

from avs_backend.api.registry import register
from avs_backend.scam_detector.classifier import ScamClassifier
from avs_backend.scam_detector.extractor import extract_entities
from avs_backend.scam_detector.ocr import ocr_image

log = logging.getLogger("avs.scam_detector")

_classifier: ScamClassifier | None = None
_shared_shield: Any = None
_analyses_run = 0


def _get_classifier() -> ScamClassifier:
    global _classifier
    if _classifier is None:
        _classifier = ScamClassifier(check_url_fn=_web_shield_check)
    return _classifier


def _web_shield_check(url: str) -> dict[str, Any] | None:
    """Bridge to WebShield without import-time coupling."""
    global _shared_shield
    try:
        if _shared_shield is None:
            from avs_backend.advanced_security.web_shield import WebShield
            _shared_shield = WebShield({})
        return _shared_shield.check_url(url)
    except Exception as e:
        log.warning("WebShield check unavailable: %s", e)
        return None


def _error(msg: str, code: str) -> dict[str, Any]:
    return {"success": False, "error": msg, "error_code": code}


_SENSITIVITIES = {"high", "balanced", "low"}


@register("scam_detector.analyzeText")
def analyze_text(params: dict[str, Any] | None) -> dict[str, Any]:
    """Analyze pasted message text for scam tactics."""
    global _analyses_run
    params = params or {}
    text = params.get("text")
    if not isinstance(text, str) or not text.strip():
        return _error("text is required", "INVALID_PARAMS")
    if len(text) > 100_000:
        text = text[:100_000]
    sensitivity = params.get("sensitivity", "balanced")
    if sensitivity not in _SENSITIVITIES:
        sensitivity = "balanced"

    try:
        result = _get_classifier().analyze(
            text, sensitivity=sensitivity,
            check_urls=params.get("check_urls", True),
        )
        _analyses_run += 1
        return {"success": True, "result": result}
    except Exception as e:
        log.error("Scam analysis failed: %s", e)
        return _error(str(e), "ANALYSIS_FAILED")


@register("scam_detector.analyzeImage")
def analyze_image(params: dict[str, Any] | None) -> dict[str, Any]:
    """OCR a screenshot then analyze its text."""
    params = params or {}
    path = params.get("path")
    if not isinstance(path, str) or not path.strip():
        return _error("path is required", "INVALID_PARAMS")

    text = ocr_image(path.strip())
    if not text:
        return _error(
            "Could not extract text from the image (unsupported format or OCR unavailable)",
            "OCR_FAILED",
        )

    sensitivity = params.get("sensitivity", "balanced")
    if sensitivity not in _SENSITIVITIES:
        sensitivity = "balanced"

    try:
        result = _get_classifier().analyze(text, sensitivity=sensitivity)
        result["extracted_text"] = text[:2000]
        return {"success": True, "result": result}
    except Exception as e:
        log.error("Image scam analysis failed: %s", e)
        return _error(str(e), "ANALYSIS_FAILED")


@register("scam_detector.checkPhone")
def check_phone(params: dict[str, Any] | None) -> dict[str, Any]:
    """Heuristic check on a phone number — flags VoIP-range/scam patterns
    without needing a paid lookup feed."""
    params = params or {}
    phone = params.get("phone")
    if not isinstance(phone, str) or not phone.strip():
        return _error("phone is required", "INVALID_PARAMS")

    digits = re.sub(r"\D", "", phone)
    signals: list[str] = []
    # Premium / toll-free numbers heavily used by refund & support scams.
    if re.match(r"^1?8(?:00|44|55|66|77|88)", digits):
        signals.append("toll_free_common_in_support_scams")
    if len(digits) < 7:
        return {"success": True, "result": {
            "phone": phone, "verdict": "invalid",
            "signals": ["too_few_digits"], "advice": "Enter a complete phone number."}}

    verdict = "suspicious" if signals else "unknown"
    advice = (
        "Search this number online — scam numbers are usually reported publicly."
        if signals else
        "No local signal. If a message asked you to call this number, analyze the message text instead."
    )
    return {"success": True, "result": {
        "phone": phone, "verdict": verdict, "signals": signals, "advice": advice}}


@register("scam_detector.status")
def status(params: dict[str, Any] | None) -> dict[str, Any]:
    """Scam detector status for the UI."""
    return {"success": True, "result": {
        "analyses_run": _analyses_run,
        "ocr_available": platform.system() == "Windows",  # WinRT engine
        "classifier": "tactic_rules_v1",
        "sensitivities": sorted(_SENSITIVITIES),
    }}
