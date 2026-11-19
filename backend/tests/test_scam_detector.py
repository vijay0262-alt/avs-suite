"""Scam detector tests — extractor, classifier verdicts, sensitivity,
advice, and the RPC dispatch path."""

from __future__ import annotations

import pytest

from avs_backend.scam_detector.classifier import ScamClassifier
from avs_backend.scam_detector.extractor import extract_entities


@pytest.fixture
def clf():
    return ScamClassifier()  # no URL checker → offline deterministic


# ----------------------------------------------------------------------
# Extractor
# ----------------------------------------------------------------------

class TestExtractor:
    def test_urls(self):
        e = extract_entities("visit https://evil-site.com/pay and www.bad.xyz now")
        assert "https://evil-site.com/pay" in e["urls"]
        assert any(u.startswith("www.bad.xyz") for u in e["urls"])

    def test_bare_domain(self):
        e = extract_entities("go to paypal-login.com and verify")
        assert "paypal-login.com" in e["urls"]

    def test_phone(self):
        e = extract_entities("call us at +1 (800) 555-0199 immediately")
        assert len(e["phones"]) == 1

    def test_email_and_crypto(self):
        e = extract_entities(
            "reply to scam@evil.com or send BTC to 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa")
        assert "scam@evil.com" in e["emails"]
        assert e["crypto"]

    def test_empty(self):
        assert extract_entities("") == {"urls": [], "phones": [], "emails": [], "crypto": []}

    def test_email_not_captured_as_url(self):
        e = extract_entities("contact help@paypal.com for info")
        assert "paypal.com" not in e["urls"]


# ----------------------------------------------------------------------
# Classifier verdicts — canonical scam scripts
# ----------------------------------------------------------------------

IRS_SCAM = ("This is the IRS. You owe $4,980 in back taxes. A warrant has been "
            "issued for your arrest. Pay immediately via gift cards. Do not tell "
            "your bank. Call 1-800-555-0199 now.")

DELIVERY_SCAM = ("USPS: Your package could not be delivered. Pay the $1.99 "
                 "redelivery fee at usps-redelivery.top within 24 hours.")

OTP_SCAM = ("This is your bank. We detected unusual activity on your account. "
            "Please share the 6-digit verification code we just sent you.")

TECH_SUPPORT = ("ALERT! Your computer is infected with 5 viruses! Call Microsoft "
                "support immediately at 1-844-555-0123. Do not close this window.")

REFUND_SCAM = ("You were overcharged $399 for your antivirus subscription renewal. "
               "To process your refund call us now and install AnyDesk.")

ROMANCE_SCAM = ("My love, I'm stationed overseas on a military base. Please send "
                "money for the package fee so I can come home to you.")

LEGIT_MSG = ("Hi team, the project update is moved to 3pm tomorrow. "
             "See https://github.com/company/repo/pull/42 for the diff. Thanks!")

BANK_ALERT = ("Chase Fraud Alert: did you authorize a $89.99 charge at AMZN "
              "Marketplace? Reply YES or NO. Your card has been locked.")


class TestVerdicts:
    @pytest.mark.parametrize("text,min_score", [
        (IRS_SCAM, 60), (OTP_SCAM, 60), (TECH_SUPPORT, 60),
        (REFUND_SCAM, 60), (ROMANCE_SCAM, 45), (DELIVERY_SCAM, 30),
    ])
    def test_scam_detected(self, clf, text, min_score):
        r = clf.analyze(text)
        assert r["verdict"] in ("scam", "suspicious"), text[:50]
        assert r["score"] >= min_score
        assert r["tactics"]

    def test_irs_is_critical(self, clf):
        r = clf.analyze(IRS_SCAM)
        assert r["verdict"] == "scam"
        assert "gift_card_payment" in {t["id"] for t in r["tactics"]}
        assert "secrecy_isolation" in {t["id"] for t in r["tactics"]}

    def test_legit_passes(self, clf):
        r = clf.analyze(LEGIT_MSG)
        assert r["verdict"] == "likely_legitimate"
        assert r["risk_level"] in ("low", "safe")

    def test_normal_bank_alert_flagged(self, clf):
        # Fraud-alert phrasing SHOULD flag — users must verify in-app anyway.
        r = clf.analyze(BANK_ALERT)
        assert r["verdict"] in ("scam", "suspicious")
        assert "bank_fraud_alert" in {t["id"] for t in r["tactics"]}

    def test_short_text(self, clf):
        r = clf.analyze("hi there")
        assert r["verdict"] == "insufficient_content"

    def test_empty_text(self, clf):
        assert clf.analyze("")["verdict"] == "insufficient_content"

    def test_reasons_and_advice_present(self, clf):
        r = clf.analyze(IRS_SCAM)
        assert r["reasons"] and r["advice"]
        assert len(r["tactics"]) == len(r["reasons"])

    def test_confidence_scale(self, clf):
        assert clf.analyze(IRS_SCAM)["confidence"] == "high"
        assert clf.analyze(LEGIT_MSG)["confidence"] == "low"


class TestSensitivity:
    def test_high_catches_more(self, clf):
        mild = "Your subscription will expire soon. Update your payment information now."
        hi = clf.analyze(mild, sensitivity="high")
        lo = clf.analyze(mild, sensitivity="low")
        order = {"scam": 3, "suspicious": 2, "likely_legitimate": 1}
        assert order[hi["verdict"]] >= order[lo["verdict"]]

    def test_balanced_default(self, clf):
        r = clf.analyze(DELIVERY_SCAM)  # no sensitivity arg
        assert r["sensitivity_thresholds"]["scam"] == 60


class TestUrlIntegration:
    def test_flagged_url_boosts_score(self):
        def fake_check(url):
            return {"safe": False, "risk_level": "high"}
        clf = ScamClassifier(check_url_fn=fake_check)
        r = clf.analyze("Please visit evil-login.com to continue your session now please")
        assert any(t["id"] == "known_bad_url" for t in r["tactics"])
        assert r["url_findings"][0]["safe"] is False

    def test_clean_url_no_boost(self):
        clf = ScamClassifier(check_url_fn=lambda u: {"safe": True, "risk_level": "safe"})
        r = clf.analyze(LEGIT_MSG)
        assert not any(t["id"] == "known_bad_url" for t in r["tactics"])

    def test_check_failure_graceful(self):
        def boom(url):
            raise RuntimeError("down")
        clf = ScamClassifier(check_url_fn=boom)
        r = clf.analyze("look at evil-login.com right now ok")
        assert r["verdict"] in ("scam", "suspicious", "likely_legitimate")

    def test_check_urls_disabled(self):
        clf = ScamClassifier(check_url_fn=lambda u: {"safe": False, "risk_level": "high"})
        r = clf.analyze("go to evil-login.com today and sign in to verify", check_urls=False)
        assert not any(t["id"] == "known_bad_url" for t in r["tactics"])


# ----------------------------------------------------------------------
# RPC dispatch path
# ----------------------------------------------------------------------

class TestRpc:
    def test_analyze_text_rpc(self):
        from avs_backend.scam_detector import analyze_text
        r = analyze_text({"text": IRS_SCAM})
        assert r["success"] is True
        assert r["result"]["verdict"] == "scam"

    def test_missing_text(self):
        from avs_backend.scam_detector import analyze_text
        assert analyze_text({})["error_code"] == "INVALID_PARAMS"

    def test_bad_sensitivity_defaults(self):
        from avs_backend.scam_detector import analyze_text
        r = analyze_text({"text": IRS_SCAM, "sensitivity": "paranoid"})
        assert r["success"] is True

    def test_check_phone(self):
        from avs_backend.scam_detector import check_phone
        r = check_phone({"phone": "1-800-555-0199"})
        assert r["success"] is True
        assert "toll_free_common_in_support_scams" in r["result"]["signals"]

    def test_check_phone_invalid(self):
        from avs_backend.scam_detector import check_phone
        r = check_phone({"phone": "123"})
        assert r["result"]["verdict"] == "invalid"

    def test_image_missing_path(self):
        from avs_backend.scam_detector import analyze_image
        assert analyze_image({})["error_code"] == "INVALID_PARAMS"

    def test_status(self):
        from avs_backend.scam_detector import status
        r = status(None)
        assert r["success"] and r["result"]["classifier"] == "tactic_rules_v1"
