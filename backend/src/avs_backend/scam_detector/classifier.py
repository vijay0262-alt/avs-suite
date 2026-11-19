"""On-device scam message classifier.

Explainable tactic-based scoring — every verdict lists *why*, matching how
the major vendors present scam analysis. No cloud calls, no paid APIs.

Sensitivity profiles shift verdict thresholds, not the raw score:
  - "high":      more protective (elder/family use)
  - "balanced":  default
  - "low":      fewer flags for power users
"""

from __future__ import annotations

import re
from typing import Any, Callable

from avs_backend.scam_detector.extractor import extract_entities

# ---------------------------------------------------------------------------
# Tactic rules: (id, label, weight, [patterns])
# Weight is added once per tactic if ANY of its patterns match.
# ---------------------------------------------------------------------------

_TACTICS: list[dict[str, Any]] = [
    {
        "id": "urgency_pressure",
        "label": "Urgency or threat of consequences",
        "weight": 15,
        "patterns": [
            r"\bact (?:now|immediately|fast)\b", r"\bwithin \d{1,2} ?(?:hour|day)",
            r"\bfinal (?:notice|warning|reminder)\b", r"\bexpires? (?:today|soon|in )\b",
            r"\bwill be (?:suspended|terminated|closed|locked|deactivated|arrested)\b",
            r"\blimited time\b", r"\burgent(?:ly)?\b", r"\bimmediately\b.{0,40}\b(?:account|payment|verify)",
            r"\blast chance\b", r"\blegal action\b",
        ],
    },
    {
        "id": "gift_card_payment",
        "label": "Payment demanded via gift cards",
        "weight": 40,
        "patterns": [
            r"\bgift ?cards?\b", r"\bitunes\b.{0,20}\bcard", r"\bgoogle play\b.{0,20}\bcard",
            r"\bsteam\b.{0,20}\bcard", r"\b(?:buy|purchase|get).{0,30}\bcard.{0,30}\b(?:send|scratch|code)",
        ],
    },
    {
        "id": "crypto_payment",
        "label": "Cryptocurrency payment demand",
        "weight": 30,
        "patterns": [
            r"\bbitcoin\b|\bbtc\b|\bethereum\b|\busdt\b|\btether\b",
            r"\bcrypto(?:currency)?\b.{0,40}\b(?:send|pay|deposit|wallet|transfer)",
            r"\bwallet address\b|\bcrypto wallet\b",
        ],
    },
    {
        "id": "wire_transfer",
        "label": "Wire transfer / untraceable payment",
        "weight": 30,
        "patterns": [
            r"\bwire (?:transfer|the money)\b", r"\bwestern union\b", r"\bmoney ?gram\b",
            r"\bzelle\b.{0,30}\b(?:send|pay)", r"\bcash ?app\b.{0,30}\b(?:send|pay)",
            r"\bvenmo\b.{0,30}\b(?:send|pay)", r"\b(?:send|pay).{0,20}\bcash\b",
        ],
    },
    {
        "id": "credential_theft",
        "label": "Credential or account verification request",
        "weight": 35,
        "patterns": [
            r"\bverify your (?:account|identity|email|password)\b",
            r"\bconfirm your (?:password|account|details|information)\b",
            r"\bupdate your (?:payment|billing|account) (?:info|details|information)\b",
            r"\blog ?in\b.{0,40}\b(?:verify|confirm|secure)",
            r"\bunusual (?:activity|sign-?in|login)\b", r"\bsuspended\b.{0,40}\b(?:verify|confirm)",
        ],
    },
    {
        "id": "otp_theft",
        "label": "One-time code / OTP theft",
        "weight": 40,
        "patterns": [
            r"\b(?:verification|one-?time|security|authentication) code\b.{0,40}\b(?:send|share|tell|give|provide)",
            r"\b(?:send|share|tell|give|provide|read).{0,30}\b(?:the )?(?:verification|one-?time|security) code\b",
            r"\botp\b.{0,30}\b(?:send|share|tell|give)",
            r"\b6-?digit code\b.{0,30}\b(?:send|share|tell)",
        ],
    },
    {
        "id": "remote_access",
        "label": "Remote access tool request",
        "weight": 45,
        "patterns": [
            r"\banydesk\b", r"\bteamviewer\b", r"\bquick assist\b|\bquickassist\b",
            r"\bultraviewer\b|\brustdesk\b|\blogmein\b|\bgotopc\b|\bjoin\.me\b",
            r"\bremote (?:access|desktop|support)\b.{0,40}\b(?:install|download|allow|grant)",
            r"\b(?:install|download|open)\b.{0,30}\b(?:remote|support) (?:tool|app|software)",
        ],
    },
    {
        "id": "authority_impersonation",
        "label": "Impersonates government or trusted organization",
        "weight": 20,
        "patterns": [
            r"\birs\b.{0,40}\b(?:owe|debt|arrest|refund|payment)",
            r"\bsocial security\b.{0,40}\b(?:suspend|fraud|arrest|number)",
            r"\b(?:arrest|warrant).{0,30}\b(?:issued|against you)\b",
            r"\b(?:microsoft|windows|apple|amazon) (?:support|security|team)\b",
            r"\bpolice\b.{0,40}\b(?:fine|arrest|payment)",
            r"\b(?:bank|paypal|netflix|amazon).{0,40}\b(?:suspend|locked|verify|unusual)",
        ],
    },
    {
        "id": "delivery_scam",
        "label": "Fake delivery or toll notice",
        "weight": 20,
        "patterns": [
            r"\b(?:package|parcel|delivery).{0,50}\b(?:could not|failed|held|pending|reschedul)",
            r"\b(?:usps|fedex|dhl|ups|royal mail)\b.{0,40}\b(?:link|click|verify|fee|redeliver)",
            r"\bunpaid (?:toll|shipping|customs) (?:fee|charge|bill)?\b",
            r"\bredeliver(?:y)?\b.{0,30}\b(?:fee|link|click)",
        ],
    },
    {
        "id": "prize_scam",
        "label": "Prize, lottery, or inheritance claim",
        "weight": 35,
        "patterns": [
            r"\byou (?:have )?won\b|\bcongratulations?.{0,40}\b(?:won|winner|selected|chosen)",
            r"\bclaim your (?:prize|reward|winnings?|gift)\b",
            r"\blottery\b.{0,40}\b(?:won|winner|claim)",
            r"\binheritance\b.{0,40}\b(?:fund|transfer|beneficiary)",
            r"\bnext of kin\b|\bbeneficiary\b.{0,40}\bfund",
        ],
    },
    {
        "id": "refund_scam",
        "label": "Refund or subscription cancellation bait",
        "weight": 30,
        "patterns": [
            r"\brefund\b.{0,50}\b(?:call|contact|claim|process|overpaid|charged)",
            r"\b(?:overpaid|overcharged|double charged)\b.{0,40}\b(?:refund|call)",
            r"\bcancel\b.{0,30}\b(?:subscription|order|renewal)\b.{0,30}\b(?:call|phone|now)",
            r"\byour (?:subscription|membership|antivirus|plan).{0,40}\b(?:renew|charg|expir)",
        ],
    },
    {
        "id": "secrecy_isolation",
        "label": "Demands secrecy or isolation",
        "weight": 35,
        "patterns": [
            r"\bdo not (?:tell|inform|share with)\b", r"\bkeep (?:this|it) (?:confidential|secret|between us)\b",
            r"\bdon'?t (?:hang up|tell anyone|contact)\b", r"\bstay on (?:the )?line\b",
            r"\bnot.{0,10}tell (?:your )?(?:family|bank|police|anyone)\b",
        ],
    },
    {
        "id": "job_scam",
        "label": "Fake job / guaranteed income offer",
        "weight": 30,
        "patterns": [
            r"\bwork from home\b.{0,50}\b(?:earn|income|\$)",
            r"\bguaranteed (?:income|returns?|profit)\b",
            r"\bmystery shopper\b|\breship(?:ping)?\b.{0,30}\b(?:package|job)",
            r"\bearn \$[\d,]+\s*(?:per|a|/)?\s*(?:week|day|month)\b.{0,40}\b(?:easy|no experience|from home)",
        ],
    },
    {
        "id": "investment_scam",
        "label": "Investment / trading profit pitch",
        "weight": 30,
        "patterns": [
            r"\b(?:risk-?free|guaranteed).{0,30}\b(?:profit|returns?|investment)\b",
            r"\bdouble your (?:money|bitcoin|investment)\b",
            r"\btrading (?:platform|bot|signals?)\b.{0,40}\b(?:profit|earn|guarantee)",
            r"\b(?:forex|binary options?)\b.{0,40}\b(?:profit|earn|expert)",
        ],
    },
    {
        "id": "romance_scam",
        "label": "Romance / emergency money request",
        "weight": 30,
        "patterns": [
            r"\b(?:my )?(?:love|dear|honey|soulmate)\b.{0,60}\b(?:send|money|help|transfer)",
            r"\b(?:stationed|deployed|overseas)\b.{0,40}\b(?:military|army|base)\b.{0,60}\b(?:money|package|fee)",
            r"\bstranded\b.{0,40}\b(?:money|help|wire)",
        ],
    },
    {
        "id": "family_emergency",
        "label": "Fake family emergency",
        "weight": 35,
        "patterns": [
            r"\b(?:grandma|grandpa|mom|dad|mother|father)\b.{0,20}\bit'?s me\b",
            r"\bin (?:jail|custody|hospital)\b.{0,50}\b(?:bail|money|help|send)",
            r"\b(?:car )?accident\b.{0,40}\b(?:money|hospital|help|urgent)",
            r"\bnew (?:phone|number)\b.{0,50}\b(?:send|money|help|emergency)",
        ],
    },
    {
        "id": "payment_request",
        "label": "Asks you to send money or payment",
        "weight": 15,
        "patterns": [
            r"\b(?:send|wire|transfer|give|lend)\b.{0,25}\b(?:money|payment|funds?|cash)\b",
            r"\b(?:money|payment|funds?|fee)\b.{0,25}\b(?:send|pay|transfer|deposit)\b",
        ],
    },
    {
        "id": "tech_support_scare",
        "label": "Fake virus / tech support scare",
        "weight": 40,
        "patterns": [
            r"\byour (?:computer|pc|device|system) (?:is|has been) (?:infected|compromised|hacked|blocked)\b",
            r"\bvirus (?:detected|found|alert)\b",
            r"\bcall (?:microsoft|apple|windows|tech )?support (?:immediately|now|at)\b",
            r"\bmalware\b.{0,30}\b(?:detected|found)\b.{0,40}\b(?:call|support)",
        ],
    },
    {
        "id": "bank_fraud_alert",
        "label": "Fake bank fraud alert",
        "weight": 35,
        "patterns": [
            r"\bfraud(?:ulent)? (?:alert|charge|transaction|activity)\b",
            r"\b(?:did you (?:make|authorize)|was this you)\b.{0,50}\b(?:charge|purchase|transaction|payment)",
            r"\bdeclined?\b.{0,30}\b(?:card|transaction)\b.{0,40}\b(?:call|click|verify)",
            r"\byour (?:card|account|bank)\b.{0,30}\b(?:locked|frozen|blocked)\b",
        ],
    },
]

# Pre-compile all patterns (case-insensitive).
for _t in _TACTICS:
    _t["_re"] = [re.compile(p, re.I) for p in _t["patterns"]]

# Score thresholds per sensitivity profile: (scam, suspicious, likely_legit)
_THRESHOLDS: dict[str, tuple[int, int, int]] = {
    "high":     (45, 20, 5),
    "balanced": (60, 30, 10),
    "low":      (80, 45, 20),
}

_URL_SHORTENER_HINT = re.compile(
    r"(?i)\b(?:bit\.ly|tinyurl\.com|goo\.gl|t\.co|ow\.ly|is\.gd|buff\.ly|"
    r"adf\.ly|shorte\.st|cutt\.ly|rb\.gy|s\.id|v\.gd)\b"
)


class ScamClassifier:
    """Tactic-based scam scorer. `check_url_fn` injects WebShield so unit
    tests stay offline; production wires it in scam_detector/__init__.py."""

    def __init__(self, check_url_fn: Callable[[str], dict[str, Any]] | None = None) -> None:
        self._check_url = check_url_fn

    def analyze(self, text: str, sensitivity: str = "balanced",
                check_urls: bool = True) -> dict[str, Any]:
        text = (text or "").strip()
        thresholds = _THRESHOLDS.get(sensitivity, _THRESHOLDS["balanced"])

        if len(text) < 20:
            return self._result("insufficient_content", "safe", 0, [],
                                extract_entities(text), [], thresholds,
                                ["Paste the full message (20+ characters) for analysis."])

        entities = extract_entities(text)
        matched: list[dict[str, Any]] = []
        score = 0
        for tactic in _TACTICS:
            if any(rx.search(text) for rx in tactic["_re"]):
                matched.append({"id": tactic["id"], "label": tactic["label"],
                                "weight": tactic["weight"]})
                score += tactic["weight"]

        # Entity-derived signals
        url_findings: list[dict[str, Any]] = []
        for url in entities["urls"][:5]:
            if _URL_SHORTENER_HINT.search(url):
                score += 10
                matched.append({"id": "shortened_url",
                                "label": "Shortened URL hides the real destination",
                                "weight": 10})
            if check_urls and self._check_url:
                try:
                    res = self._check_url(url if "://" in url else f"https://{url}")
                except Exception:
                    res = None
                if res:
                    url_findings.append({"url": url, "safe": res.get("safe"),
                                         "risk_level": res.get("risk_level")})
                    if res.get("safe") is False:
                        score += 50
                        matched.append({"id": "known_bad_url",
                                        "label": f"Link flagged by threat intelligence: {url[:60]}",
                                        "weight": 50})

        if entities["crypto"]:
            score += 15
            matched.append({"id": "crypto_address",
                            "label": "Contains a crypto wallet address",
                            "weight": 15})
        if entities["phones"] and re.search(r"\bcall\b|\bcontact\b|\btext\b", text, re.I):
            score += 10
            matched.append({"id": "callback_number",
                            "label": "Directs you to call or text a phone number",
                            "weight": 10})

        score = min(score, 100)

        scam_t, susp_t, legit_t = thresholds
        if score >= scam_t:
            verdict, risk = "scam", "critical" if score >= 85 else "high"
        elif score >= susp_t:
            verdict, risk = "suspicious", "medium"
        elif score >= legit_t:
            verdict, risk = "likely_legitimate", "low"
        else:
            verdict, risk = "likely_legitimate", "safe"

        return self._result(verdict, risk, score, matched, entities,
                            url_findings, thresholds, _advice_for(verdict, matched))

    @staticmethod
    def _result(verdict, risk, score, tactics, entities, url_findings,
                thresholds, advice) -> dict[str, Any]:
        return {
            "verdict": verdict,
            "risk_level": risk,
            "score": score,
            "confidence": "high" if score >= 70 else ("medium" if score >= 30 else "low"),
            "tactics": tactics,
            "entities": entities,
            "url_findings": url_findings,
            "reasons": [t["label"] for t in tactics],
            "advice": advice,
            "sensitivity_thresholds": {"scam": thresholds[0], "suspicious": thresholds[1]},
        }


def _advice_for(verdict: str, tactics: list[dict[str, Any]]) -> list[str]:
    ids = {t["id"] for t in tactics}
    advice: list[str] = []
    if verdict in ("scam", "suspicious"):
        advice.append("Do not reply, click links, or send money or codes.")
        advice.append("Verify the claim by contacting the organization through its official app or website.")
    if {"gift_card_payment", "crypto_payment", "wire_transfer"} & ids:
        advice.append("No legitimate business or agency accepts gift cards or crypto as payment.")
    if {"remote_access"} & ids:
        advice.append("Never install remote-access software at a stranger's request — this is how devices get emptied.")
    if {"otp_theft"} & ids:
        advice.append("Never share a verification code — it lets someone take over your account.")
    if {"credential_theft"} & ids:
        advice.append("Go to the site directly (type the address yourself) instead of using the link.")
    if {"tech_support_scare"} & ids:
        advice.append("Microsoft/Apple never ask you to call a number from a popup — close the page.")
    if verdict == "likely_legitimate":
        advice.append("No strong scam signals found, but stay cautious with links and requests for money or codes.")
    if verdict == "insufficient_content":
        advice.append("Longer messages give more reliable verdicts.")
    return advice[:6]
