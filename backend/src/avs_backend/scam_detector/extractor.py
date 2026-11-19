"""Entity extraction for the scam detector.

Pulls URLs, phone numbers, email addresses, and crypto wallet addresses
out of pasted message text so the classifier can weigh them and WebShield
can check each URL.
"""

from __future__ import annotations

import re
from typing import Any

# URL — permissive: scams use odd TLDs and bare domains.
_URL_RE = re.compile(
    r"(?i)\b(?:https?://|www\.)[^\s<>'\"()]+|\b[a-z0-9](?:[a-z0-9\-]{0,61}"
    r"[a-z0-9])?\.(?:com|net|org|io|co|info|biz|top|xyz|click|link|site|"
    r"online|live|store|shop|support|help|win|vip|cc|me|us|uk|tk|ml|ga|"
    r"cf|gq|buzz|rest|quest|mom|cam|icu|cfd|bond|sbs|monster|lat)"
    r"(?:/[^\s<>'\"()]*)?\b"
)

# International/US phone — requires at least 7 digits total.
_PHONE_RE = re.compile(
    r"(?<!\d)(?:\+?\d{1,3}[\s.\-]?)?(?:\(\d{3}\)|\d{3})[\s.\-]?\d{3}[\s.\-]?\d{4,6}(?!\d)"
)

_EMAIL_RE = re.compile(r"(?i)\b[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}\b")

# Crypto addresses — BTC (legacy/segwit), ETH, TRON, XMR.
_CRYPTO_RES = [
    re.compile(r"\bbc1[a-z0-9]{25,60}\b", re.I),                    # BTC bech32
    re.compile(r"\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b"),             # BTC legacy
    re.compile(r"\b0x[a-fA-F0-9]{40}\b"),                           # ETH/EVM
    re.compile(r"\bT[A-Za-z1-9]{33}\b"),                            # TRON
    re.compile(r"\b[48][0-9AB][1-9A-HJ-NP-Za-km-z]{93}\b"),         # XMR
]


def extract_entities(text: str, max_items: int = 20) -> dict[str, Any]:
    """Extract analyzable entities from message text."""
    if not text:
        return {"urls": [], "phones": [], "emails": [], "crypto": []}

    urls = []
    seen = set()
    for m in _URL_RE.finditer(text):
        # Skip domains that are the tail of an email address (help@paypal.com)
        # or a user@handle: check the char before the match start.
        prev = text[m.start() - 1] if m.start() > 0 else ""
        if prev == "@" or prev in "abcdefghijklmnopqrstuvwxyz0123456789._%+-":
            continue
        u = m.group(0).rstrip(".,;:!?)\"'")
        if "@" in u:
            continue
        if u not in seen:
            seen.add(u)
            urls.append(u)
        if len(urls) >= max_items:
            break

    phones = []
    for m in _PHONE_RE.finditer(text):
        digits = re.sub(r"\D", "", m.group(0))
        if 7 <= len(digits) <= 15:
            phones.append(m.group(0).strip())
        if len(phones) >= max_items:
            break

    emails = _EMAIL_RE.findall(text)[:max_items]

    crypto: list[str] = []
    for rx in _CRYPTO_RES:
        crypto.extend(rx.findall(text)[:max_items])
    crypto = crypto[:max_items]

    return {"urls": urls, "phones": phones, "emails": emails, "crypto": crypto}
