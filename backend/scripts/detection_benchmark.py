#!/usr/bin/env python3
"""Detection-rate benchmark against a real malware corpus (VM-ONLY).

Downloads recent samples from MalwareBazaar (https://bazaar.abuse.ch)
and measures what AVS's detection layers catch. This is the honest way to
answer "is detection good enough" before submitting to SE Labs /
AV-Comparatives.

SAFETY — run this ONLY inside a disposable VM:
  * snapshot before running; no shared folders; no host clipboard
  * samples are zipped (password 'infected') but treat them as live
  * this script NEVER executes samples — hash/YARA scan only
  * requires explicit opt-in: set AVS_BENCHMARK_I_AM_IN_A_VM=1

Usage (inside the VM, with the backend importable):
    AVS_BENCHMARK_I_AM_IN_A_VM=1 MB_AUTH_KEY=<key> python detection_benchmark.py --count 100
    AVS_BENCHMARK_I_AM_IN_A_VM=1 MB_AUTH_KEY=<key> python detection_benchmark.py \\
        --count 500 --since-days 7 --out report.json

MB_AUTH_KEY: free API key from https://bazaar.abuse.ch/ (account →
settings → Auth-Key). Required — the API returns 401 without one.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import sys
import tempfile
import zipfile
from pathlib import Path

BAZAAR_API = "https://mb-api.abuse.ch/api/v1/"
ZIP_PASSWORD = b"infected"


def _require_vm() -> None:
    if os.environ.get("AVS_BENCHMARK_I_AM_IN_A_VM") != "1":
        sys.exit(
            "Refusing to run outside a VM.\n"
            "This script downloads REAL MALWARE (inert, zip-locked).\n"
            "Run inside a disposable VM and set AVS_BENCHMARK_I_AM_IN_A_VM=1."
        )


def _auth_headers() -> dict[str, str]:
    key = os.environ.get("MB_AUTH_KEY", "").strip()
    if not key:
        sys.exit(
            "MB_AUTH_KEY not set.\n"
            "Get a free Auth-Key at https://bazaar.abuse.ch/ "
            "(account → settings), then export MB_AUTH_KEY=<key>."
        )
    return {"Auth-Key": key}


def _post(body: str, timeout: int):
    import urllib.request
    req = urllib.request.Request(BAZAAR_API, data=body.encode(),
                                 headers=_auth_headers())
    return urllib.request.urlopen(req, timeout=timeout)


def fetch_recent_hashes(count: int, since_days: int) -> list[dict]:
    """Query MalwareBazaar for recent sample metadata (hashes, no files)."""
    with _post(f"query=get_recent&selector={count}", timeout=30) as resp:
        payload = json.loads(resp.read())
    samples = payload.get("data") or []
    return [s for s in samples if s.get("sha256_hash")][:count]


def download_sample(sha256: str) -> bytes | None:
    """Download one sample (returns the raw extracted file bytes)."""
    try:
        with _post(f"query=get_file&sha256_hash={sha256}", timeout=60) as resp:
            blob = resp.read()
    except Exception as e:
        print(f"  ! download failed {sha256[:12]}…: {e}", file=sys.stderr)
        return None
    try:
        with zipfile.ZipFile(io.BytesIO(blob)) as zf:
            name = zf.namelist()[0]
            return zf.read(name, pwd=ZIP_PASSWORD)
    except Exception as e:
        print(f"  ! unzip failed {sha256[:12]}…: {e}", file=sys.stderr)
        return None


def build_detectors():
    """Instantiate the same detectors the threat engine uses."""
    from avs_backend.threat_engine.hash_detector import HashDetector
    detectors = {"hash": HashDetector({})}
    try:
        from avs_backend.threat_engine.yara_scanner import YaraScanner
        detectors["yara"] = YaraScanner({})
    except Exception as e:
        print(f"yara unavailable: {e}", file=sys.stderr)
    try:
        from avs_backend.threat_engine.heuristic import HeuristicDetector
        detectors["heuristic"] = HeuristicDetector({})
    except Exception as e:
        print(f"heuristic unavailable: {e}", file=sys.stderr)
    try:
        from avs_backend.threat_engine.clamav_scanner import ClamAvScanner
        c = ClamAvScanner({})
        if getattr(c, "available", True):
            detectors["clamav"] = c
    except Exception as e:
        print(f"clamav unavailable: {e}", file=sys.stderr)
    return detectors


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--count", type=int, default=100)
    ap.add_argument("--since-days", type=int, default=3)
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args()

    _require_vm()
    detectors = build_detectors()
    print(f"Detectors active: {', '.join(detectors)}")

    samples = fetch_recent_hashes(args.count, args.since_days)
    print(f"Fetched {len(samples)} recent sample records from MalwareBazaar")

    results = []
    detected_any = 0
    per_detector_hits = {k: 0 for k in detectors}

    with tempfile.TemporaryDirectory(prefix="avs-bench-") as workdir:
        work = Path(workdir)
        for i, meta in enumerate(samples, 1):
            sha256 = meta["sha256_hash"]
            raw = download_sample(sha256)
            if raw is None:
                results.append({"sha256": sha256, "error": "download_failed"})
                continue
            sample_path = work / f"sample_{i}"
            sample_path.write_bytes(raw)
            row = {
                "sha256": sha256,
                "signature": meta.get("signature") or "unclassified",
                "file_type": meta.get("file_type"),
                "hits": {},
            }
            caught = False
            for name, det in detectors.items():
                try:
                    r = det.scan_file(str(sample_path))
                except Exception as e:
                    r = {"detected": False, "error": str(e)}
                hit = bool(r and r.get("detected"))
                row["hits"][name] = hit
                if hit:
                    per_detector_hits[name] += 1
                    caught = True
            row["detected"] = caught
            detected_any += int(caught)
            results.append(row)
            sample_path.unlink()  # delete immediately after scanning
            status = "HIT " if caught else "miss"
            print(f"[{i:>4}/{len(samples)}] {status} {sha256[:16]}… "
                  f"{row['signature']}")

    total = len([r for r in results if "error" not in r])
    rate = (detected_any / total * 100) if total else 0.0
    report = {
        "total_scanned": total,
        "detected": detected_any,
        "detection_rate_pct": round(rate, 2),
        "per_detector_hits": per_detector_hits,
        "results": results,
    }
    print(f"\nDetection rate: {detected_any}/{total} = {rate:.1f}%")
    for name, hits in per_detector_hits.items():
        print(f"  {name:<10} {hits}")
    if args.out:
        args.out.write_text(json.dumps(report, indent=2))
        print(f"Report written to {args.out}")
    # Nonzero exit if detection is poor — gate for future lab submission.
    return 0 if rate >= 85 else 1


if __name__ == "__main__":
    raise SystemExit(main())
