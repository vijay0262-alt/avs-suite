# Security Validation & Testing — AVS AI Shield

How we prove the antivirus side actually detects, quarantines, and
remediates — and what still requires external validation.

## Automated suite (always run)

`backend/tests/` — run with `py -m pytest`:

| File | What it proves |
|---|---|
| `test_eicar_e2e.py` | EICAR (industry-standard test file) is in the hash DB, detected on disk, quarantined, and restored byte-for-byte — the core "detected ⇒ deletable & restorable" invariant. Also covers the RPC path, dedup, and a false-positive guard. Includes a capability-aware AMTSO-style compressed-EICAR test (ZIP → ClamAV `ScanArchive`). |
| `test_web_shield.py` | URL heuristics behind AI Scam Detection: combosquat/typosquat lookalikes, raw-IP hosts, punycode, suspicious TLDs, manual blocklist — plus the popular-domain false-positive suppression that keeps heuristics from blocking legit sites. |
| `test_ransomware_vaccine.py` | Simulated ransomware behaviors (RanSim-style, fully safe): canary content overwrite → `encryption` alert, deletion → `deletion` alert, extension rename → `extension_change` alert, marker-preserving tamper → `modification` alert. |
| `test_scam_detector.py` | Canonical scam scripts (IRS, OTP, tech-support, refund, romance, delivery) classify correctly; legit messages pass. |
| `test_threat_engine_quarantine_fixes.py` | Quarantine dedup, index races, forbidden paths, corrupt-history recovery. |

### Environment caveat — EICAR on disk

Writing real EICAR bytes triggers the *host* AV (Windows Defender
intercepts the read; the file may be removed outright). Tests that need
raw EICAR on disk are written environment-aware: they assert full
detection when readable and graceful `None` degradation when a host AV
neutralized the file — both are correct product behavior. Hash-lookup
and seeded-marker tests cover the same code paths deterministically.

## Manual / external checks (AMTSO suite)

Run `https://www.amtso.org/security-features-check/` with AVS installed:

- [ ] **EICAR download** — real-time/scan detection fires
- [ ] **Compressed malware tests** — EICAR inside ZIP/CAB/etc. → archive scanning
- [ ] **PUA test file** → PUP scanner
- [ ] **Phishing page** → Web Shield / AI Scam Detection URL verdict
- [ ] **Cloud lookup check** → cloud reputation path is live

WICAR (`wicar.org`) offers additional safe browser-exploit test pages —
use a disposable VM/profile only.

## Detection-rate benchmark (VM ONLY)

`backend/scripts/detection_benchmark.py` downloads recent real malware
from MalwareBazaar (zip-locked, never executed) and measures detection
rate per engine layer (hash / YARA / heuristic / ClamAV).

Rules:

- Run ONLY inside a disposable VM — snapshot first, no shared folders,
  no host clipboard.
- Requires explicit opt-in env var `AVS_BENCHMARK_I_AM_IN_A_VM=1`.
- Exits non-zero below 85% — the gate for considering lab submission.

```bash
AVS_BENCHMARK_I_AM_IN_A_VM=1 python detection_benchmark.py --count 100 --out report.json
```

## External certification (not yet claimed)

Green CI is NOT certification. Independent validation paths:

1. **SE Labs** — free quarterly endpoint testing; easiest credible entry.
2. **AV-Comparatives** — Main-Test Series; also runs the **Microsoft MVI**
   certification test (important for Defender handoff / Action Center).
3. **AV-TEST** — protection + performance-impact scoring.
4. **OPSWAT Gold** — practical first certification for new AV vendors.

Do not submit until the MalwareBazaar benchmark shows a healthy
detection rate — a poor public lab score is worse than no score.
