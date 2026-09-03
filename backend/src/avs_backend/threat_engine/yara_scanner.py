"""YARA Scanner — pattern-based malware detection using YARA rules.

YARA rules provide powerful pattern-based detection for malware families.
This module:
  - Loads YARA rules from the local rules directory
  - Compiles rules at startup for fast scanning
  - Ships with built-in rules for common malware patterns
  - Supports downloading community rule sets
  - Scans files against compiled rules

YARA is optional — if yara-python is not installed, the scanner
gracefully degrades and reports that YARA is unavailable.
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

log = logging.getLogger("avs.threat_engine.yara_scanner")

_DATA_DIR = Path(os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))) / "AVS AI Shield" / "threat_engine"
_YARA_RULES_DIR = _DATA_DIR / "yara_rules"
_YARA_RULES_DIR.mkdir(parents=True, exist_ok=True)

# Try to import yara
try:
    import yara  # type: ignore
    YARA_AVAILABLE = True
    log.info("YARA engine available (yara-python %s)", getattr(yara, "__version__", "unknown"))
except ImportError:
    YARA_AVAILABLE = False
    log.info("YARA engine not available — yara-python not installed")


# Built-in YARA rules for common malware patterns
_BUILTIN_RULES = {
    "eicar_test.yar": r'''
rule EICAR_Test_File {
    meta:
        description = "EICAR test file"
        threat_type = "test"
        severity = "low"
    strings:
        $eicar = "X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
    condition:
        $eicar
}
''',
    "suspicious_packer.yar": r'''
rule Suspicious_Packer_UPX {
    meta:
        description = "UPX packed executable — often used by malware"
        threat_type = "packed"
        severity = "low"
    strings:
        $upx1 = "UPX0" ascii
        $upx2 = "UPX1" ascii
        $upx3 = "UPX!" ascii
    condition:
        2 of ($upx1, $upx2, $upx3)
}
''',
    "ransomware_patterns.yar": r'''
rule Ransomware_File_Encryption_Indicator {
    meta:
        description = "File encryption activity indicator"
        threat_type = "ransomware"
        severity = "high"
    strings:
        $ransom1 = ".encrypted" ascii nocase
        $ransom2 = ".locked" ascii nocase
        $ransom3 = ".crypto" ascii nocase
        $ransom4 = "YOUR FILES ARE ENCRYPTED" ascii nocase
        $ransom5 = "PAY RANSOM" ascii nocase
        $ransom6 = "RECOVER YOUR FILES" ascii nocase
        $ransom7 = ".ransomware" ascii nocase
    condition:
        3 of ($ransom1, $ransom2, $ransom3, $ransom4, $ransom5, $ransom6, $ransom7)
}

rule Ransom_Note_Pattern {
    meta:
        description = "Common ransom note filenames"
        threat_type = "ransomware"
        severity = "high"
    strings:
        $note1 = "HOW_TO_DECRYPT" ascii nocase
        $note2 = "README_RECOVER" ascii nocase
        $note3 = "RESTORE_FILES" ascii nocase
        $note4 = "DECRYPT_INSTRUCTION" ascii nocase
        $note5 = "_RECOVER_" ascii nocase
    condition:
        any of ($note1, $note2, $note3, $note4, $note5)
}
''',
    "trojan_indicators.yar": r'''
rule Trojan_Downloader_Pattern {
    meta:
        description = "Trojan downloader behavior indicators"
        threat_type = "trojan"
        severity = "high"
    strings:
        $dl1 = "powershell -enc" ascii nocase
        $dl2 = "Invoke-WebRequest" ascii nocase
        $dl3 = "System.Net.WebClient" ascii nocase
        $dl4 = "DownloadFile" ascii nocase
        $dl5 = "cmd.exe /c" ascii nocase
        $dl6 = "/c reg add" ascii nocase
    condition:
        3 of ($dl1, $dl2, $dl3, $dl4, $dl5, $dl6)
}

rule Trojan_Backdoor_Pattern {
    meta:
        description = "Backdoor/reverse shell indicators"
        threat_type = "backdoor"
        severity = "critical"
    strings:
        $bd1 = "reverse_tcp" ascii nocase
        $bd2 = "meterpreter" ascii nocase
        $bd3 = "shell_reverse" ascii nocase
        $bd4 = "bind_tcp" ascii nocase
        $bd5 = "nc -e" ascii nocase
        $bd6 = "nc -l -p" ascii nocase
    condition:
        2 of ($bd1, $bd2, $bd3, $bd4, $bd5, $bd6)
}
''',
    "crypto_miner.yar": r'''
rule CryptoMiner_Indicator {
    meta:
        description = "Cryptocurrency mining indicators"
        threat_type = "cryptominer"
        severity = "medium"
    strings:
        $miner1 = "stratum+tcp" ascii nocase
        $miner2 = "xmrig" ascii nocase
        $miner3 = "cryptonight" ascii nocase
        $miner4 = "ethash" ascii nocase
        $miner5 = "pool.minexmr" ascii nocase
        $miner6 = "monero" ascii nocase
    condition:
        2 of ($miner1, $miner2, $miner3, $miner4, $miner5, $miner6)
}
''',
    "adware_pup.yar": r'''
rule Adware_BrowserHijacker {
    meta:
        description = "Adware / browser hijacker indicators"
        threat_type = "adware"
        severity = "medium"
    strings:
        $ad1 = "conduit" ascii nocase
        $ad2 = "babylon" ascii nocase
        $ad3 = "mindspark" ascii nocase
        $ad4 = "mywebsearch" ascii nocase
        $ad5 = "delta-homes" ascii nocase
        $ad6 = "trovi" ascii nocase
    condition:
        2 of ($ad1, $ad2, $ad3, $ad4, $ad5, $ad6)
}
''',
    "suspicious_api.yar": r'''
rule Suspicious_Windows_API_Usage {
    meta:
        description = "Suspicious Windows API usage patterns"
        threat_type = "suspicious"
        severity = "medium"
    strings:
        $api1 = "VirtualAllocEx" ascii
        $api2 = "WriteProcessMemory" ascii
        $api3 = "CreateRemoteThread" ascii
        $api4 = "NtUnmapViewOfSection" ascii
        $api5 = "SetWindowsHookEx" ascii
        $api6 = "GetAsyncKeyState" ascii
        $api7 = "CreateToolhelp32Snapshot" ascii
    condition:
        3 of ($api1, $api2, $api3, $api4, $api5, $api6, $api7)
}
''',
}


def _write_builtin_rules() -> None:
    """Write built-in YARA rules to the rules directory."""
    for filename, content in _BUILTIN_RULES.items():
        rule_path = _YARA_RULES_DIR / filename
        if not rule_path.exists():
            try:
                rule_path.write_text(content.strip(), encoding="utf-8")
                log.info("Wrote built-in YARA rule: %s", filename)
            except Exception as e:
                log.warning("Failed to write YARA rule %s: %s", filename, e)


def _compute_sha256(file_path: str) -> str | None:
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


class YaraScanner:
    """YARA rules-based malware scanner."""

    name = "yara"

    def __init__(self, config: dict[str, Any]):
        self.config = config
        self.rules: list[Any] = []  # Compiled YARA rules
        self.rule_metadata: list[dict] = []

        if not YARA_AVAILABLE:
            log.warning("YARA not available — yara-python not installed. Install with: pip install yara-python")
            return

        # Write built-in rules
        _write_builtin_rules()

        # Compile all rules
        self._compile_rules()

        log.info("YaraScanner initialized: %d rules compiled", len(self.rules))

    def _compile_rules(self) -> None:
        """Compile all YARA rules from the rules directory."""
        self.rules = []
        self.rule_metadata = []

        rule_files = list(_YARA_RULES_DIR.glob("*.yar")) + list(_YARA_RULES_DIR.glob("*.yara"))

        for rule_file in rule_files:
            try:
                compiled = yara.compile(str(rule_file))
                self.rules.append(compiled)
                self.rule_metadata.append({
                    "file": rule_file.name,
                    "path": str(rule_file),
                })
            except Exception as e:
                log.warning("Failed to compile YARA rule %s: %s", rule_file.name, e)

    def scan_file(self, file_path: str) -> dict[str, Any] | None:
        """Scan a file against all compiled YARA rules."""
        if not YARA_AVAILABLE or not self.rules:
            return None

        if not os.path.exists(file_path) or not os.path.isfile(file_path):
            return None

        sha256 = _compute_sha256(file_path)

        for i, rule in enumerate(self.rules):
            try:
                matches = rule.match(file_path)
                if matches:
                    # Get the first matching rule's metadata
                    match = matches[0]
                    meta = {}
                    if hasattr(match, 'meta'):
                        meta = dict(match.meta)

                    return {
                        "detected": True,
                        "threat_name": match.rule,
                        "threat_type": meta.get("threat_type", "suspicious"),
                        "severity": meta.get("severity", "medium"),
                        "confidence": 0.85,
                        "sha256": sha256,
                        "details": {
                            "rule_file": self.rule_metadata[i]["file"] if i < len(self.rule_metadata) else "",
                            "rule_name": match.rule,
                            "matched_strings": [str(s) for s in match.strings[:10]],
                            "meta": meta,
                            "source": "yara",
                        },
                    }
            except Exception as e:
                log.debug("YARA scan error on %s: %s", file_path, e)

        return {"detected": False, "sha256": sha256}


def update_yara_rules(force: bool = False) -> dict[str, Any]:
    """Update YARA rules from community feeds.

    Downloads community YARA rule sets. Rate-limited to once per 24 hours.
    """
    # Check if update is needed
    marker = _YARA_RULES_DIR / ".last_update"
    if not force and marker.exists():
        try:
            last = datetime.fromisoformat(marker.read_text(encoding="utf-8").strip())
            if (datetime.now(timezone.utc) - last).total_seconds() < 86400:
                return {
                    "success": True,
                    "message": "Rules are recent, skipping update",
                    "rule_count": len(list(_YARA_RULES_DIR.glob("*.yar")) + list(_YARA_RULES_DIR.glob("*.yara"))),
                }
        except Exception:
            pass

    # Write/update built-in rules
    _write_builtin_rules()

    # Try to download community rules (Yara Rules Project)
    community_urls = [
        ("https://raw.githubusercontent.com/Yara-Rules/rules/master/malware/Ransomware.yar", "community_ransomware.yar"),
        ("https://raw.githubusercontent.com/Yara-Rules/rules/master/malware/Trojans.yar", "community_trojans.yar"),
        ("https://raw.githubusercontent.com/Yara-Rules/rules/master/malware/Worms.yar", "community_worms.yar"),
    ]

    downloaded = 0
    for url, filename in community_urls:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "AVS-Shield/1.0"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                content = resp.read().decode("utf-8")
                if "rule " in content:  # Basic validation
                    rule_path = _YARA_RULES_DIR / filename
                    rule_path.write_text(content, encoding="utf-8")
                    downloaded += 1
                    log.info("Downloaded YARA rule: %s", filename)
        except Exception as e:
            log.debug("Failed to download %s: %s", filename, e)

    # Update marker
    marker.write_text(datetime.now(timezone.utc).isoformat(), encoding="utf-8")

    rule_count = len(list(_YARA_RULES_DIR.glob("*.yar")) + list(_YARA_RULES_DIR.glob("*.yara")))

    return {
        "success": True,
        "downloaded": downloaded,
        "rule_count": rule_count,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
