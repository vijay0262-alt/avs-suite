"""AI Threat Explanation module for AVS AI Shield.

This module generates human-readable explanations of detected threats using
a **local rule-based explanation engine**.  It does **NOT** call any external
LLM API — all explanations are produced from a built-in threat knowledge base
that covers the most common malware categories.

The ``ThreatExplainer`` class accepts a threat dict (as produced by the scan
engine) and returns a rich explanation dict containing:

  * ``explanation``           — a short, human-readable summary
  * ``category``              — the matched malware category
  * ``what_it_does``          — description of the threat's behaviour
  * ``how_it_spreads``        — description of the spread vector(s)
  * ``damage_potential``      — qualitative damage assessment
  * ``recommended_actions``   — list of recommended user actions
  * ``risk_level``            — ``low`` / ``medium`` / ``high`` / ``critical``
  * ``confidence``            — 0.0 – 1.0 confidence in the explanation

Threats are matched by inspecting the threat ``name`` and ``type`` fields
against the knowledge base.  Unknown threats receive a generic fallback
explanation so the explainer never fails.
"""

from __future__ import annotations

import logging
import platform
from datetime import datetime, timezone
from typing import Any

log = logging.getLogger("avs.ai_features.threat_explainer")

IS_WINDOWS = platform.system() == "Windows"


# =====================================================================
# Helpers
# =====================================================================

def _now_iso() -> str:
    """Return the current UTC time as an ISO-8601 string."""
    return datetime.now(timezone.utc).isoformat()


# =====================================================================
# Threat knowledge base
# =====================================================================

# Each entry maps a canonical category name to its explanation fields.
# ``keywords`` are lower-case fragments matched against the threat name /
# type to identify the category.
_THREAT_KNOWLEDGE_BASE: dict[str, dict[str, Any]] = {
    "Trojan": {
        "keywords": ("trojan", "backdoor-trojan", "trojandropper", "trojandropper"),
        "what_it_does": (
            "A Trojan disguises itself as legitimate software to trick users "
            "into executing it.  Once running, it opens a hidden backdoor that "
            "allows an attacker to remotely control the system, steal data, or "
            "deploy additional payloads."
        ),
        "how_it_spreads": (
            "Trojans are typically distributed through phishing emails, "
            "malicious attachments, pirated software, compromised websites, "
            "and fake software updates."
        ),
        "damage_potential": (
            "High — can lead to full system compromise, data theft, "
            "credential harvesting, and installation of further malware."
        ),
        "recommended_actions": [
            "Quarantine or delete the detected file immediately.",
            "Run a full system scan with AVS AI Shield.",
            "Change passwords for sensitive accounts accessed on this machine.",
            "Review recently installed software and remove anything unrecognised.",
            "Monitor network traffic for unusual outbound connections.",
        ],
    },
    "Ransomware": {
        "keywords": ("ransomware", "ransom", "cryptolocker", "locky", "wannacry"),
        "what_it_does": (
            "Ransomware encrypts user files using strong cryptography and then "
            "demands a ransom payment in exchange for the decryption key.  Some "
            "variants also lock the entire system or display a fake law-enforcement "
            "warning."
        ),
        "how_it_spreads": (
            "Ransomware spreads through malicious email attachments, exploit "
            "kits, drive-by downloads, RDP brute-force attacks, and network "
            "worm propagation."
        ),
        "damage_potential": (
            "Critical — can cause permanent loss of personal and business "
            "data.  Even if the ransom is paid, decryption is not guaranteed."
        ),
        "recommended_actions": [
            "Immediately disconnect the machine from the network to prevent spread.",
            "Quarantine the detected file and do NOT execute it.",
            "Restore affected files from offline backups if available.",
            "Run a full system scan and remove all detected components.",
            "Report the incident to local cyber-authorities.",
            "Do not pay the ransom — there is no guarantee of recovery.",
        ],
    },
    "Worm": {
        "keywords": ("worm", "conficker", "mydoom", "i love you", "iloveyou"),
        "what_it_does": (
            "A worm is a self-replicating malware that spreads across networks "
            "without user interaction.  It exploits network vulnerabilities or "
            "removable drives to propagate and may carry additional payloads "
            "such as backdoors or ransomware."
        ),
        "how_it_spreads": (
            "Worms spread automatically through network shares, removable USB "
            "drives, email contacts, and unpatched software vulnerabilities."
        ),
        "damage_potential": (
            "High — can rapidly infect entire networks, consume bandwidth, "
            "and open systems to secondary infections."
        ),
        "recommended_actions": [
            "Disconnect the machine from the network immediately.",
            "Quarantine or delete the detected file.",
            "Apply all available OS and software security patches.",
            "Disable AutoRun / AutoPlay for removable drives.",
            "Run a full system and network scan with AVS AI Shield.",
        ],
    },
    "Adware": {
        "keywords": ("adware", "adware-fake", "pop-up", "popup", "adinjector"),
        "what_it_does": (
            "Adware displays unwanted advertising content, often in the form of "
            "pop-ups, banners, or browser redirects.  While often more annoying "
            "than destructive, it can degrade system performance and expose "
            "users to further malicious content."
        ),
        "how_it_spreads": (
            "Adware is commonly bundled with free software downloads, browser "
            "extensions, and fake codec or update installers."
        ),
        "damage_potential": (
            "Low to Medium — primarily degrades user experience and system "
            "performance, but may collect browsing data or redirect to "
            "malicious sites."
        ),
        "recommended_actions": [
            "Uninstall the associated program via the control panel.",
            "Remove suspicious browser extensions and reset browser settings.",
            "Run a full system scan with AVS AI Shield.",
            "Be cautious when installing free software — opt out of bundled offers.",
        ],
    },
    "Spyware": {
        "keywords": ("spyware", "tracking-cookie", "stalkerware", "finfisher"),
        "what_it_does": (
            "Spyware silently monitors user activity and collects sensitive "
            "information such as browsing habits, keystrokes, credentials, and "
            "personal data.  Collected data is transmitted to a remote server "
            "without the user's consent."
        ),
        "how_it_spreads": (
            "Spyware is distributed through software bundles, malicious "
            "downloads, phishing links, and sometimes physical access to the "
            "device."
        ),
        "damage_potential": (
            "High — can lead to identity theft, financial fraud, and serious "
            "privacy violations."
        ),
        "recommended_actions": [
            "Quarantine or delete the detected file immediately.",
            "Run a full system scan with AVS AI Shield.",
            "Change passwords for all sensitive accounts.",
            "Enable multi-factor authentication where available.",
            "Review installed programs and remove anything unfamiliar.",
        ],
    },
    "PUP": {
        "keywords": ("pup", "potentially unwanted", "unwanted program", "bundle"),
        "what_it_does": (
            "A Potentially Unwanted Program (PUP) is software that users may "
            "not have intentionally installed.  PUPs often display ads, modify "
            "browser settings, collect usage data, or bundle additional "
            "unwanted software."
        ),
        "how_it_spreads": (
            "PUPs are typically bundled with free software installers and "
            "distributed through aggressive download portals and misleading "
            "advertisements."
        ),
        "damage_potential": (
            "Low to Medium — usually not directly harmful but can degrade "
            "performance, compromise privacy, and open the door to more "
            "serious threats."
        ),
        "recommended_actions": [
            "Review the installed program and uninstall if not needed.",
            "Reset browser homepage and search settings.",
            "Run a full system scan with AVS AI Shield.",
            "Pay attention to custom install options when installing software.",
        ],
    },
    "Rootkit": {
        "keywords": ("rootkit", "kernel-rootkit", "userland-rootkit", "necurs"),
        "what_it_does": (
            "A rootkit is designed to maintain privileged access to a system "
            "while actively hiding its presence.  It operates at a low level "
            "(kernel or userland) to conceal files, processes, registry keys, "
            "and network connections from detection."
        ),
        "how_it_spreads": (
            "Rootkits are deployed after initial compromise — via Trojans, "
            "exploit kits, or malicious drivers — and then establish "
            "persistence at the kernel or boot level."
        ),
        "damage_potential": (
            "Critical — provides deep, persistent system control that is very "
            "difficult to detect and remove.  Often a precursor to full network "
            "compromise."
        ),
        "recommended_actions": [
            "Quarantine the detected file immediately.",
            "Run an offline scan (boot from AVS AI Shield rescue media if available).",
            "Consider reinstalling the operating system if removal is incomplete.",
            "Update all firmware and drivers to latest versions.",
            "Check for unauthorised user accounts and scheduled tasks.",
        ],
    },
    "Bootkit": {
        "keywords": ("bootkit", "mbr", "master boot record", "vbr", "stoned"),
        "what_it_does": (
            "A bootkit infects the Master Boot Record (MBR) or Volume Boot "
            "Record (VBR) to execute malicious code before the operating "
            "system loads.  This allows it to bypass OS-level security and "
            "load kernel-mode rootkits or ransomware."
        ),
        "how_it_spreads": (
            "Bootkits spread through infected removable media, drive-by "
            "downloads, and exploitation of boot-sector vulnerabilities."
        ),
        "damage_potential": (
            "Critical — operates below the OS, making detection and removal "
            "extremely difficult.  Can render a system unbootable."
        ),
        "recommended_actions": [
            "Do NOT reboot the machine until the threat is removed.",
            "Quarantine the detected file immediately.",
            "Run an offline / boot-time scan with AVS AI Shield.",
            "Repair the MBR using system recovery tools if the system is "
            "unbootable.",
            "Consider a full OS reinstall if the infection persists.",
        ],
    },
    "Keylogger": {
        "keywords": ("keylogger", "key-logger", "keystroke-logger", "form-grabber"),
        "what_it_does": (
            "A keylogger records every keystroke typed by the user, capturing "
            "passwords, credit-card numbers, messages, and other sensitive "
            "input.  Recorded data is periodically sent to an attacker."
        ),
        "how_it_spreads": (
            "Keyloggers are delivered through phishing emails, malicious "
            "downloads, bundled software, and sometimes physical access to "
            "the device."
        ),
        "damage_potential": (
            "High — can capture credentials and financial data, leading to "
            "identity theft and unauthorised account access."
        ),
        "recommended_actions": [
            "Quarantine or delete the detected file immediately.",
            "Change all passwords typed on this machine, using a different device.",
            "Enable multi-factor authentication on all sensitive accounts.",
            "Run a full system scan with AVS AI Shield.",
            "Use a virtual keyboard for sensitive inputs until the threat is removed.",
        ],
    },
    "Miner": {
        "keywords": ("miner", "cryptominer", "coinminer", "xmrig", "coinhive"),
        "what_it_does": (
            "A cryptocurrency miner hijacks system resources (CPU / GPU) to "
            "mine cryptocurrency for an attacker.  It runs silently in the "
            "background, consuming computing power and electricity."
        ),
        "how_it_spreads": (
            "Miners are distributed through malicious downloads, compromised "
            "websites, browser-based scripts, and bundled with pirated "
            "software."
        ),
        "damage_potential": (
            "Medium — primarily causes high resource usage, increased power "
            "consumption, and reduced hardware lifespan, but may also bundle "
            "other malware."
        ),
        "recommended_actions": [
            "Quarantine or delete the detected file.",
            "Check for suspicious scheduled tasks or startup entries.",
            "Monitor CPU / GPU usage for unexpected spikes.",
            "Run a full system scan with AVS AI Shield.",
            "Review browser extensions for cryptomining scripts.",
        ],
    },
    "Downloader": {
        "keywords": ("downloader", "dropper", "loader", "emotet", "qakbot"),
        "what_it_does": (
            "A downloader is a lightweight malware whose primary purpose is to "
            "fetch and execute additional payloads from a remote server.  It "
            "acts as the first stage of a multi-stage infection chain."
        ),
        "how_it_spreads": (
            "Downloaders are distributed through phishing emails, malicious "
            "documents with macros, exploit kits, and bundled with other "
            "malware."
        ),
        "damage_potential": (
            "High — while the downloader itself may seem minor, it opens the "
            "door to ransomware, Trojans, and other severe threats."
        ),
        "recommended_actions": [
            "Quarantine or delete the detected file immediately.",
            "Run a full system scan with AVS AI Shield to detect secondary payloads.",
            "Block the associated C2 domains / IPs at the firewall if known.",
            "Review network connections for outbound traffic to unknown servers.",
            "Check for newly created files in temp and AppData directories.",
        ],
    },
    "Backdoor": {
        "keywords": ("backdoor", "remote-access-trojan", "rat", "njrat", "darkcomet"),
        "what_it_does": (
            "A backdoor provides an attacker with remote, unauthorised access "
            "to the system, bypassing normal authentication.  It enables file "
            "exfiltration, screen capture, keylogging, webcam access, and "
            "execution of arbitrary commands."
        ),
        "how_it_spreads": (
            "Backdoors are deployed via Trojans, exploit kits, malicious "
            "attachments, and supply-chain attacks on legitimate software."
        ),
        "damage_potential": (
            "Critical — grants full remote control of the system, enabling "
            "data theft, surveillance, and use of the machine as a launchpad "
            "for further attacks."
        ),
        "recommended_actions": [
            "Quarantine or delete the detected file immediately.",
            "Disconnect the machine from the network.",
            "Run a full system scan with AVS AI Shield.",
            "Change all passwords using a separate, trusted device.",
            "Review firewall logs for unauthorised inbound / outbound connections.",
            "Consider a clean OS reinstall if persistent backdoor components remain.",
        ],
    },
}

# Generic fallback explanation used when no category matches.
_GENERIC_EXPLANATION: dict[str, Any] = {
    "what_it_does": (
        "This threat was detected by AVS AI Shield but does not match a known "
        "malware category in the local knowledge base.  It may exhibit "
        "suspicious or malicious behaviour and should be treated with caution."
    ),
    "how_it_spreads": (
        "The exact spread mechanism for this threat is not documented in the "
        "local knowledge base.  Common vectors include email attachments, "
        "malicious downloads, and compromised websites."
    ),
    "damage_potential": (
        "Unknown — the potential impact cannot be precisely determined without "
        "further analysis.  Treat as potentially harmful."
    ),
    "recommended_actions": [
        "Quarantine the detected file immediately.",
        "Run a full system scan with AVS AI Shield.",
        "Submit the sample to the AVS AI Shield threat research team for analysis.",
        "Monitor the system for unusual behaviour.",
    ],
}

# Mapping from severity strings to risk levels.
_SEVERITY_TO_RISK: dict[str, str] = {
    "critical": "critical",
    "severe": "critical",
    "high": "high",
    "medium": "medium",
    "moderate": "medium",
    "low": "low",
    "info": "low",
    "informational": "low",
}


# =====================================================================
# ThreatExplainer
# =====================================================================

class ThreatExplainer:
    """Local rule-based threat explanation engine for AVS AI Shield.

    The explainer matches threat names and types against a built-in knowledge
    base to produce human-readable explanations.  No external LLM API is used
    — all logic runs locally and offline.

    All errors are handled gracefully: a failed explanation returns a generic
    fallback result rather than raising.
    """

    name = "threat_explainer"

    def __init__(self, config: dict[str, Any]) -> None:
        self._config = config or {}
        # The knowledge base can be overridden via config for testing or
        # extensibility, but defaults to the built-in database.
        self._knowledge_base: dict[str, dict[str, Any]] = dict(
            self._config.get("knowledge_base", _THREAT_KNOWLEDGE_BASE)
        )
        self._generic = dict(
            self._config.get("generic_explanation", _GENERIC_EXPLANATION)
        )
        self._explanations_generated = 0
        log.info(
            "ThreatExplainer initialised with %d threat categories",
            len(self._knowledge_base),
        )

    # -----------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------

    def explain(self, threat: dict[str, Any]) -> dict[str, Any]:
        """Generate a human-readable explanation for a single threat.

        Parameters
        ----------
        threat:
            A dict containing at least ``name`` and/or ``type``, plus
            optional ``source``, ``severity``, ``file_path``, ``sha256``,
            and ``detection_reasons``.

        Returns
        -------
        dict
            Explanation with keys: ``explanation``, ``category``,
            ``what_it_does``, ``how_it_spreads``, ``damage_potential``,
            ``recommended_actions``, ``risk_level``, ``confidence``.
        """
        result: dict[str, Any] = {
            "explanation": "",
            "category": "Unknown",
            "what_it_does": "",
            "how_it_spreads": "",
            "damage_potential": "",
            "recommended_actions": [],
            "risk_level": "medium",
            "confidence": 0.0,
            "timestamp": _now_iso(),
        }

        if not threat or not isinstance(threat, dict):
            result["error"] = "invalid threat input"
            log.warning("ThreatExplainer.explain: invalid threat input")
            return result

        try:
            threat_name = str(threat.get("name", "") or "").lower()
            threat_type = str(threat.get("type", "") or "").lower()
            severity = str(threat.get("severity", "") or "").lower()
            detection_reasons = threat.get("detection_reasons", []) or []

            category, knowledge, confidence = self._match_category(
                threat_name, threat_type, detection_reasons
            )

            result["category"] = category
            result["confidence"] = round(confidence, 2)
            result["what_it_does"] = knowledge["what_it_does"]
            result["how_it_spreads"] = knowledge["how_it_spreads"]
            result["damage_potential"] = knowledge["damage_potential"]
            result["recommended_actions"] = list(knowledge["recommended_actions"])

            result["risk_level"] = self._risk_level(category, severity, confidence)
            result["explanation"] = self._build_summary(
                threat_name=threat.get("name", "") or threat_name,
                category=category,
                severity=severity,
                file_path=threat.get("file_path", "") or "",
            )

            self._explanations_generated += 1
            log.info(
                "ThreatExplainer: explained '%s' as %s (confidence=%.2f)",
                threat.get("name", "unknown"), category, confidence,
            )
        except Exception as e:
            log.warning("ThreatExplainer.explain failed: %s", e)
            result["error"] = f"explanation failed: {e}"
            # Ensure fallback values are present.
            result["what_it_does"] = self._generic["what_it_does"]
            result["how_it_spreads"] = self._generic["how_it_spreads"]
            result["damage_potential"] = self._generic["damage_potential"]
            result["recommended_actions"] = list(
                self._generic["recommended_actions"]
            )
            result["explanation"] = (
                "An error occurred while generating the explanation.  A generic "
                "fallback has been provided."
            )
            result["confidence"] = 0.0

        return result

    def explain_batch(self, threats: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Generate explanations for multiple threats.

        Parameters
        ----------
        threats:
            A list of threat dicts (see :meth:`explain`).

        Returns
        -------
        list[dict]
            A list of explanation dicts, one per input threat, preserving
            order.
        """
        if not threats or not isinstance(threats, list):
            return []

        results: list[dict[str, Any]] = []
        for threat in threats:
            try:
                results.append(self.explain(threat))
            except Exception as e:
                log.warning("ThreatExplainer.explain_batch item failed: %s", e)
                results.append({
                    "explanation": "Failed to generate explanation.",
                    "category": "Unknown",
                    "what_it_does": self._generic["what_it_does"],
                    "how_it_spreads": self._generic["how_it_spreads"],
                    "damage_potential": self._generic["damage_potential"],
                    "recommended_actions": list(
                        self._generic["recommended_actions"]
                    ),
                    "risk_level": "medium",
                    "confidence": 0.0,
                    "error": str(e),
                    "timestamp": _now_iso(),
                })
        log.info("ThreatExplainer: explained batch of %d threats", len(results))
        return results

    def get_status(self) -> dict[str, Any]:
        """Return the current explainer status."""
        return {
            "available": True,
            "name": self.name,
            "engine": "local-rule-based",
            "categories_loaded": len(self._knowledge_base),
            "explanations_generated": self._explanations_generated,
            "platform": platform.system(),
            "captured_at": _now_iso(),
        }

    # -----------------------------------------------------------------
    # Internal helpers
    # -----------------------------------------------------------------

    def _match_category(
        self,
        threat_name: str,
        threat_type: str,
        detection_reasons: list[str],
    ) -> tuple[str, dict[str, Any], float]:
        """Match a threat against the knowledge base.

        Returns a tuple of ``(category, knowledge_dict, confidence)``.
        Confidence is 1.0 for an exact type match, 0.8 for a keyword match
        in the name, 0.6 for a keyword match in detection reasons, and
        0.3 for the generic fallback.
        """
        # 1. Exact type match (highest confidence).
        if threat_type:
            for category, knowledge in self._knowledge_base.items():
                if category.lower() == threat_type:
                    return category, knowledge, 1.0

        # 2. Keyword match against the threat name.
        if threat_name:
            for category, knowledge in self._knowledge_base.items():
                for kw in knowledge["keywords"]:
                    if kw in threat_name:
                        return category, knowledge, 0.8

        # 3. Keyword match against detection reasons.
        reasons_text = " ".join(str(r) for r in detection_reasons).lower()
        if reasons_text:
            for category, knowledge in self._knowledge_base.items():
                for kw in knowledge["keywords"]:
                    if kw in reasons_text:
                        return category, knowledge, 0.6

        # 4. Fuzzy type match — check if type contains a category name.
        if threat_type:
            for category, knowledge in self._knowledge_base.items():
                if category.lower() in threat_type:
                    return category, knowledge, 0.7

        # 5. Generic fallback.
        return "Unknown", self._generic, 0.3

    def _risk_level(
        self, category: str, severity: str, confidence: float
    ) -> str:
        """Determine the risk level from severity, category, and confidence."""
        # Prefer explicit severity mapping.
        if severity and severity in _SEVERITY_TO_RISK:
            return _SEVERITY_TO_RISK[severity]

        # Fall back to category-based defaults.
        category_defaults = {
            "Ransomware": "critical",
            "Bootkit": "critical",
            "Rootkit": "critical",
            "Backdoor": "critical",
            "Trojan": "high",
            "Worm": "high",
            "Spyware": "high",
            "Keylogger": "high",
            "Downloader": "high",
            "Miner": "medium",
            "Adware": "low",
            "PUP": "low",
        }
        if category in category_defaults:
            return category_defaults[category]

        # Unknown category with low confidence is medium risk by default.
        if confidence < 0.5:
            return "medium"
        return "medium"

    def _build_summary(
        self,
        threat_name: str,
        category: str,
        severity: str,
        file_path: str,
    ) -> str:
        """Build a short human-readable summary string."""
        display_name = threat_name or "Unknown threat"
        parts: list[str] = []

        if category == "Unknown":
            parts.append(
                f"{display_name} was detected as a potentially malicious file."
            )
            parts.append(
                "It does not match a known malware category in the local "
                "knowledge base and should be treated with caution."
            )
        else:
            parts.append(
                f"{display_name} is classified as {category}."
            )
            if severity:
                parts.append(f"The detected severity is {severity}.")
            else:
                parts.append("No explicit severity was provided by the scanner.")

        if file_path:
            parts.append(f"The affected file is located at: {file_path}.")

        parts.append(
            "Review the detailed fields below for more information and "
            "recommended actions."
        )

        return " ".join(parts)
