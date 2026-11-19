"""Lookalike-domain detection — typosquats, homoglyphs, combosquats.

Operates on the *registrable domain* and full hostname rather than raw
substrings, which is what eliminated the old false positives
(``pineapple.com`` ≠ ``apple``; ``notpaypal.com`` is now caught).

Signals returned (callers map them to scores):

  * ``combosquat``   — brand token embedded in a non-official domain
                       (``paypal-login.com``, ``secure-paypal-verify.net``)
  * ``typosquat``    — SLD within edit distance 1 of a brand name
                       (``paypall.com``, ``microsft.com``)
  * ``homoglyph``    — SLD's confusable skeleton equals a brand's skeleton
                       (``paypa1.com``, ``faceb00k.com``)
  * ``subdomain_abuse`` — brand appears as a subdomain token of a foreign
                       registrable domain (``paypal.evil-host.com``)

Nothing here raises; every check short-circuits when the registrable
domain is already legitimate for the brand.
"""

from __future__ import annotations

from dataclasses import dataclass

from avs_backend.threat_intel.brands import BRANDS, is_legitimate_for_brand
from avs_backend.threat_intel.domains import host_key, public_suffix, registrable_domain

# Character equivalence classes for homoglyph skeletons.
_MULTI_SUBS = (("rn", "m"), ("vv", "w"), ("cl", "d"), ("ii", "n"))
_CHAR_SUBS = {
    "0": "o", "1": "l", "2": "z", "3": "e", "4": "a",
    "5": "s", "7": "t", "8": "b", "9": "g",
    "@": "a", "$": "s", "!": "i", "|": "l",
}

# Filler words that make a brand-prefix/suffix domain suspicious
# (paypalsupport.com, appleid-verify.com).
_FILLER_WORDS = {
    "login", "signin", "verify", "verification", "secure", "security",
    "account", "support", "billing", "update", "confirm", "auth",
    "help", "service", "center", "centre", "alert", "unlock",
    "suspended", "restore", "validate", "online", "official", "portal",
    "pay", "payment", "wallet", "app", "web", "mail", "email",
    "refund", "claim", "gift", "bonus", "free", "promo", "reward",
    "notice", "info", "track", "tracking", "delivery", "package", "id",
}

# Short scam-relevant affixes — brand+affix fused domains like
# ``notpaypal.com`` or ``paypalcn.com``. Deliberately small: natural
# compounds (pineapple, snapple, applepie) keep a non-matching remainder
# and stay safe.
_SCAMMY_AFFIXES = {
    "not", "my", "go", "pro", "vip", "hq", "co", "is",
    "cn", "ru", "in", "br", "de", "fr", "jp", "kr", "pl", "nl", "it",
    "es", "au", "ca", "uk", "us",
}


@dataclass(frozen=True)
class LookalikeResult:
    hit: bool
    signal: str = ""       # combosquat | typosquat | homoglyph | subdomain_abuse
    brand: str = ""
    detail: str = ""


def _decode_label(label: str) -> str:
    """Decode a punycode label to Unicode; passthrough on failure."""
    if label.startswith("xn--"):
        try:
            return label.encode("ascii").decode("idna")
        except UnicodeError:
            return label
    return label


def skeleton(text: str) -> str:
    """Map text to its confusable skeleton (leet/homoglyph normalised)."""
    t = text.lower()
    for bad, good in _MULTI_SUBS:
        t = t.replace(bad, good)
    return "".join(_CHAR_SUBS.get(c, c) for c in t)


def _edit_distance_le1(a: str, b: str) -> bool:
    """True if a and b differ by at most one edit (ins/del/sub)."""
    la, lb = len(a), len(b)
    if abs(la - lb) > 1:
        return False
    if la == lb:
        diffs = sum(1 for x, y in zip(a, b) if x != y)
        return diffs <= 1
    # length differs by 1 — single insertion/deletion
    long, short = (a, b) if la > lb else (b, a)
    i = j = 0
    skipped = False
    while i < len(long) and j < len(short):
        if long[i] == short[j]:
            i += 1
            j += 1
        elif skipped:
            return False
        else:
            skipped = True
            i += 1
    return True


def _sld(registrable: str) -> str:
    """Second-level label (leftmost label of the registrable domain)."""
    return registrable.split(".", 1)[0]


def check_domain(host: str) -> LookalikeResult:
    """Check a hostname for brand-lookalike signals."""
    host = host_key(host)
    if not host:
        return LookalikeResult(hit=False)

    registrable = registrable_domain(host)
    sld = _sld(registrable)
    sld_decoded = _decode_label(sld)
    sld_norm = sld_decoded.lower()

    # Tokens come from the checkable part of the host only — everything
    # left of the public suffix. This keeps ``user.github.io`` safe (the
    # 'github' token belongs to the suffix, not the registrable domain).
    suffix = public_suffix(host)
    checkable = host[: -len(suffix)].rstrip(".") if suffix and host.endswith(suffix) else host
    tokens = {t.lower() for part in checkable.split(".") for t in part.split("-") if t}
    tokens.add(sld_norm)

    for brand, info in BRANDS.items():
        if is_legitimate_for_brand(brand, registrable):
            continue

        # 1. Combosquat / subdomain abuse — brand is a hyphen/dot token
        #    inside the SLD or a subdomain label of a foreign domain.
        #    (When the SLD equals the brand exactly, 1b handles it below.)
        if brand in tokens and sld_norm != brand:
            signal = "subdomain_abuse" if brand not in sld_norm else "combosquat"
            return LookalikeResult(True, signal, brand, f"token '{brand}' in host")

        # 1b. Brand is the entire SLD but on a non-official TLD (paypal.xyz).
        if sld_norm == brand:
            return LookalikeResult(True, "combosquat", brand, f"'{brand}' on unofficial TLD")

        # 1c. Brand prefix/suffix fused with a suspicious remainder
        #     (paypalsupport.com, notpaypal.com, appleid-verify.com).
        #     The remainder must be a filler word or scam-relevant affix —
        #     arbitrary substrings like 'pine'+apple stay safe.
        if len(brand) >= 4 and len(sld_norm) > len(brand):
            if sld_norm.startswith(brand):
                rest = sld_norm[len(brand):].lstrip("-")
                if rest in _FILLER_WORDS or rest in _SCAMMY_AFFIXES:
                    return LookalikeResult(True, "combosquat", brand, f"'{brand}+{rest}' fused")
            if sld_norm.endswith(brand):
                rest = sld_norm[: -len(brand)].rstrip("-")
                if rest in _FILLER_WORDS or rest in _SCAMMY_AFFIXES:
                    return LookalikeResult(True, "combosquat", brand, f"'{rest}+{brand}' fused")

        # 2. Typosquat — edit distance 1 (brands ≥5 chars only; shorter
        #    names produce too many collisions).
        if len(brand) >= 5 and abs(len(sld_norm) - len(brand)) <= 1:
            if sld_norm != brand and _edit_distance_le1(sld_norm, brand):
                return LookalikeResult(True, "typosquat", brand, f"'{sld_norm}' ≈ '{brand}'")

        # 3. Homoglyph — skeleton equality with different spelling.
        if len(brand) >= 4 and sld_norm != brand:
            if skeleton(sld_norm) == skeleton(brand):
                return LookalikeResult(True, "homoglyph", brand, f"'{sld_norm}' homoglyph of '{brand}'")

    return LookalikeResult(hit=False)


def check_url_brands(host: str, path: str) -> LookalikeResult:
    """Catch brand names planted in the URL path of a foreign host
    (``evil-host.com/paypal/signin``). Lower-confidence than host-based
    signals — callers should score it accordingly."""
    host = host_key(host)
    registrable = registrable_domain(host)
    path_tokens = {t for seg in path.lower().split("/") for t in seg.replace("_", "-").split("-") if t}
    for brand in BRANDS:
        if is_legitimate_for_brand(brand, registrable):
            continue
        if brand in path_tokens and len(brand) >= 5:
            return LookalikeResult(True, "path_brand", brand, f"'{brand}' in URL path")
    return LookalikeResult(hit=False)
