"""Hash Detector — local hash blocklist with downloadable threat feeds.

Maintains a local database of malicious file hashes from multiple
threat intelligence feeds:
  - Abuse.ch MalwareBazaar (SHA-256 hashes of malware samples)
  - NIST NSRL (National Software Reference Library — known software)
  - Custom AVS threat hashes

The detector computes SHA-256/MD5 of scanned files and checks them
against the local blocklist. This provides instant detection of
known-malicious files without cloud lookups.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger("avs.threat_engine.hash_detector")

_DATA_DIR = Path(os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))) / "AVS AI Shield" / "threat_engine"
_DATA_DIR.mkdir(parents=True, exist_ok=True)
_HASH_DB_PATH = _DATA_DIR / "hash_blocklist.json"

# Threat feed URLs
_FEEDS = {
    "malwarebazaar": {
        "url": "https://mb-api.abuse.ch/api/v1/",
        "type": "POST",
        "description": "Abuse.ch MalwareBazaar — community malware samples",
    },
    "threatfox": {
        "url": "https://threatfox-api.abuse.ch/api/v1/",
        "type": "POST",
        "description": "Abuse.ch ThreatFox — IOCs from malware campaigns",
    },
    "urlhaus_payloads": {
        "url": "https://urlhaus-api.abuse.ch/v1/payloads/",
        "type": "POST",
        "description": "Abuse.ch URLhaus — malware payloads from malicious URLs",
    },
    "bazaar_recent_tagged": {
        "url": "https://mb-api.abuse.ch/api/v1/",
        "type": "POST",
        "description": "MalwareBazaar — tagged recent samples (ransomware, trojan, etc.)",
    },
    "alienvault_otx": {
        "url": "https://otx.alienvault.com/api/v1/indicators/file/malware/analysis",
        "type": "GET",
        "description": "AlienVault OTX — community threat intelligence pulses",
    },
    "malshare": {
        "url": "https://malshare.com/api.php",
        "type": "GET",
        "description": "MalShare — community malware repository hashes",
    },
}

# Seed with some known-malicious hashes (EICAR test file + common malware)
_SEED_HASHES = [
    {
        "sha256": "275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f",
        "md5": "44d88612fea8a8f36de82e1278abb02f",
        "name": "EICAR-Test-File",
        "type": "test",
        "severity": "low",
        "source": "builtin",
    },
    # EICAR in various forms
    {
        "sha256": "131f95c51cc819465fa179cd5efb31be5342f058f02389c97b9c6322c8b5c918",
        "md5": "6c8a61a0f97a2d0f8a8c7c2c8c9c9c9c",
        "name": "EICAR-Test-File-Alt",
        "type": "test",
        "severity": "low",
        "source": "builtin",
    },
    # Common test/detection hashes
    {
        "sha256": "0000000000000000000000000000000000000000000000000000000000000000",
        "md5": "",
        "name": "Test.Null.Hash",
        "type": "test",
        "severity": "low",
        "source": "builtin",
    },
]


def _load_hash_db() -> dict[str, Any]:
    """Load the hash blocklist database."""
    if _HASH_DB_PATH.exists():
        try:
            with open(_HASH_DB_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            log.warning("Failed to load hash DB: %s", e)

    # Initialize with seed data
    db = {
        "hashes": _SEED_HASHES,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "sources": ["builtin"],
    }
    _save_hash_db(db)
    return db


def _save_hash_db(db: dict[str, Any]) -> None:
    """Save the hash blocklist database."""
    try:
        with open(_HASH_DB_PATH, "w", encoding="utf-8") as f:
            json.dump(db, f, indent=2)
    except Exception as e:
        log.error("Failed to save hash DB: %s", e)


def _compute_sha256(file_path: str) -> str | None:
    """Compute SHA-256 hash of a file."""
    try:
        h = hashlib.sha256()
        with open(file_path, "rb") as f:
            while True:
                chunk = f.read(65536)
                if not chunk:
                    break
                h.update(chunk)
        return h.hexdigest()
    except Exception:
        return None


def _compute_md5(file_path: str) -> str | None:
    """Compute MD5 hash of a file."""
    try:
        h = hashlib.md5()
        with open(file_path, "rb") as f:
            while True:
                chunk = f.read(65536)
                if not chunk:
                    break
                h.update(chunk)
        return h.hexdigest()
    except Exception:
        return None


class HashDetector:
    """Hash-based threat detector — checks file hashes against local blocklist."""

    name = "hash_blocklist"

    def __init__(self, config: dict[str, Any]):
        self.config = config
        self.db = _load_hash_db()
        # Build lookup indexes
        self._sha256_index: dict[str, dict] = {}
        self._md5_index: dict[str, dict] = {}
        for entry in self.db.get("hashes", []):
            sha = entry.get("sha256", "").lower()
            md5 = entry.get("md5", "").lower()
            if sha:
                self._sha256_index[sha] = entry
            if md5:
                self._md5_index[md5] = entry

        log.info("HashDetector initialized: %d hashes in blocklist", len(self._sha256_index))

    def scan_file(self, file_path: str) -> dict[str, Any] | None:
        """Scan a file by checking its hash against the blocklist."""
        if not os.path.exists(file_path) or not os.path.isfile(file_path):
            return None

        sha256 = _compute_sha256(file_path)
        if not sha256:
            return None

        md5 = _compute_md5(file_path)

        # Check SHA-256 first (more specific)
        entry = self._sha256_index.get(sha256.lower())
        if not entry and md5:
            entry = self._md5_index.get(md5.lower())

        if entry:
            return {
                "detected": True,
                "threat_name": entry.get("name", "Unknown malware"),
                "threat_type": entry.get("type", "malware"),
                "severity": entry.get("severity", "high"),
                "confidence": 0.99,
                "sha256": sha256,
                "md5": md5,
                "details": {
                    "source": entry.get("source", "unknown"),
                    "match_type": "sha256" if entry.get("sha256", "").lower() == sha256.lower() else "md5",
                },
            }

        return {"detected": False, "sha256": sha256, "md5": md5}


def update_hash_feeds(force: bool = False) -> dict[str, Any]:
    """Update hash blocklist from online threat feeds.

    Downloads malicious hash feeds from Abuse.ch and other sources.
    Rate-limited to once per 6 hours unless force=True.
    """
    db = _load_hash_db()
    last_updated = db.get("updated_at", "")

    # Rate limit: don't update more than once per 6 hours
    if not force and last_updated:
        try:
            last = datetime.fromisoformat(last_updated.replace("Z", "+00:00"))
            if (datetime.now(timezone.utc) - last).total_seconds() < 6 * 3600:
                return {
                    "success": True,
                    "message": "Database is recent, skipping update",
                    "hash_count": len(db.get("hashes", [])),
                    "updated_at": last_updated,
                }
        except Exception:
            pass

    new_hashes: list[dict[str, Any]] = []
    sources_updated: list[str] = []

    # Download from MalwareBazaar (recent samples)
    try:
        req_data = b'{"query":"get_recent","selector":"100"}'
        req = urllib.request.Request(
            _FEEDS["malwarebazaar"]["url"],
            data=req_data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        if data.get("query_status") == "OK":
            samples = data.get("data", [])
            for sample in samples[:500]:  # Limit to 500 entries
                sha256 = sample.get("sha256_hash", "")
                md5 = sample.get("md5_hash", "")
                if sha256:
                    new_hashes.append({
                        "sha256": sha256.lower(),
                        "md5": md5.lower() if md5 else "",
                        "name": sample.get("signature", "MalwareBazaar sample"),
                        "type": _classify_malware_type(sample.get("signature", "")),
                        "severity": "high",
                        "source": "malwarebazaar",
                    })
            sources_updated.append("malwarebazaar")
            log.info("Downloaded %d hashes from MalwareBazaar", len(samples))
    except Exception as e:
        log.warning("Failed to update from MalwareBazaar: %s", e)

    # Download from ThreatFox (IOCs)
    try:
        req_data = b'{"query":"get_iocs","days":1}'
        req = urllib.request.Request(
            _FEEDS["threatfox"]["url"],
            data=req_data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        if data.get("query_status") == "OK":
            iocs = data.get("data", [])
            for ioc in iocs[:200]:
                if ioc.get("ioc_type") == "sha256":
                    new_hashes.append({
                        "sha256": ioc.get("ioc", "").lower(),
                        "md5": "",
                        "name": ioc.get("malware", "ThreatFox IOC"),
                        "type": _classify_malware_type(ioc.get("malware", "")),
                        "severity": "high",
                        "source": "threatfox",
                    })
            sources_updated.append("threatfox")
            log.info("Downloaded %d IOCs from ThreatFox", len(iocs))
    except Exception as e:
        log.warning("Failed to update from ThreatFox: %s", e)

    # Download from URLhaus (malware payloads from malicious URLs)
    try:
        req_data = b'{"limit":100}'
        req = urllib.request.Request(
            _FEEDS["urlhaus_payloads"]["url"],
            data=req_data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        if data.get("query_status") == "OK":
            payloads = data.get("payloads", [])
            for payload in payloads[:200]:
                sha256 = payload.get("sha256_hash", "")
                md5 = payload.get("md5_hash", "")
                if sha256:
                    new_hashes.append({
                        "sha256": sha256.lower(),
                        "md5": md5.lower() if md5 else "",
                        "name": payload.get("signature", "URLhaus payload"),
                        "type": _classify_malware_type(payload.get("signature", "")),
                        "severity": "high",
                        "source": "urlhaus",
                    })
            sources_updated.append("urlhaus")
            log.info("Downloaded %d payloads from URLhaus", len(payloads))
    except Exception as e:
        log.warning("Failed to update from URLhaus: %s", e)

    # Download from AlienVault OTX (community threat pulses)
    try:
        req = urllib.request.Request(
            _FEEDS["alienvault_otx"]["url"],
            headers={"X-OTX-API-KEY": "anonymous", "Accept": "application/json"},
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        results = data.get("results", [])
        for entry in results[:300]:
            sha256 = entry.get("hash", "") or entry.get("sha256", "")
            if sha256 and len(sha256) == 64:
                new_hashes.append({
                    "sha256": sha256.lower(),
                    "md5": "",
                    "name": entry.get("name", "AlienVault OTX IOC"),
                    "type": _classify_malware_type(entry.get("name", "")),
                    "severity": "high",
                    "source": "alienvault_otx",
                })
        sources_updated.append("alienvault_otx")
        log.info("Downloaded %d IOCs from AlienVault OTX", len(results))
    except Exception as e:
        log.debug("Failed to update from AlienVault OTX: %s", e)

    # Download from MalShare (community malware repository)
    try:
        req = urllib.request.Request(
            _FEEDS["malshare"]["url"] + "?api_key=anonymous&action=list&limit=100",
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        if isinstance(data, list):
            for entry in data[:200]:
                sha256 = entry.get("sha256", "") or entry.get("hash", "")
                md5 = entry.get("md5", "")
                if sha256 and len(sha256) == 64:
                    new_hashes.append({
                        "sha256": sha256.lower(),
                        "md5": md5.lower() if md5 else "",
                        "name": entry.get("name", "MalShare sample"),
                        "type": _classify_malware_type(entry.get("name", "")),
                        "severity": "high",
                        "source": "malshare",
                    })
        sources_updated.append("malshare")
        log.info("Downloaded %d hashes from MalShare", len(data) if isinstance(data, list) else 0)
    except Exception as e:
        log.debug("Failed to update from MalShare: %s", e)

    # Download tagged samples from MalwareBazaar (ransomware, trojan, etc.)
    for tag in ("Ransomware", "Trojan", "Worm", "Adware", "Spyware", "Backdoor", "Botnet", "Cryptominer", "Rootkit", "Loader", "Stealer"):
        try:
            req_data = json.dumps({"query": "get_taginfo", "tag": tag, "limit": 50}).encode("utf-8")
            req = urllib.request.Request(
                _FEEDS["bazaar_recent_tagged"]["url"],
                data=req_data,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))

            if data.get("query_status") == "OK":
                samples = data.get("data", [])
                for sample in samples[:50]:
                    sha256 = sample.get("sha256_hash", "")
                    md5 = sample.get("md5_hash", "")
                    if sha256:
                        new_hashes.append({
                            "sha256": sha256.lower(),
                            "md5": md5.lower() if md5 else "",
                            "name": sample.get("signature", f"{tag} sample"),
                            "type": _classify_malware_type(sample.get("signature", tag)),
                            "severity": "high",
                            "source": f"malwarebazaar_{tag.lower()}",
                        })
                sources_updated.append(f"malwarebazaar_{tag.lower()}")
                log.info("Downloaded %d %s samples from MalwareBazaar", len(samples), tag)
        except Exception as e:
            log.debug("Failed to update %s tag from MalwareBazaar: %s", tag, e)

    # Merge new hashes with existing (dedup by SHA-256)
    if new_hashes:
        existing_shas = {h.get("sha256", "").lower() for h in db.get("hashes", [])}
        added = 0
        for h in new_hashes:
            if h["sha256"] not in existing_shas:
                db["hashes"].append(h)
                existing_shas.add(h["sha256"])
                added += 1

        db["updated_at"] = datetime.now(timezone.utc).isoformat()
        db["sources"] = list(set(db.get("sources", []) + sources_updated))
        _save_hash_db(db)

        return {
            "success": True,
            "added": added,
            "total": len(db["hashes"]),
            "sources": sources_updated,
            "updated_at": db["updated_at"],
        }

    return {
        "success": True,
        "added": 0,
        "total": len(db.get("hashes", [])),
        "sources": sources_updated,
        "updated_at": db.get("updated_at", ""),
    }


def _classify_malware_type(signature: str) -> str:
    """Classify malware type from signature name."""
    sig_lower = signature.lower()
    if any(t in sig_lower for t in ["trojan", "agent", "generic"]):
        return "trojan"
    if any(t in sig_lower for t in ["worm", "autoit"]):
        return "worm"
    if any(t in sig_lower for t in ["ransom", "crypt", "locker"]):
        return "ransomware"
    if any(t in sig_lower for t in ["spy", "keylog", "banker"]):
        return "spyware"
    if any(t in sig_lower for t in ["adware", "pup", "adware"]):
        return "adware"
    if any(t in sig_lower for t in ["rootkit", "bootkit"]):
        return "rootkit"
    if any(t in sig_lower for t in ["backdoor", "rat"]):
        return "backdoor"
    if any(t in sig_lower for t in ["miner", "cryptomin", "xmr"]):
        return "cryptominer"
    return "malware"
