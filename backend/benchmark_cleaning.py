"""Comprehensive cleaning engine benchmark.

Measures each phase of the cleaning pipeline:
  1. Scan (directory traversal + file enumeration)
  2. Validate (pre-flight safety checks)
  3. Clean (parallel deletion)
  4. History write (SQLite persistence)

Usage:
  python benchmark_cleaning.py [file_count]

Defaults to 10,000 files. Override with a command-line argument.
"""
from __future__ import annotations

import os
import sys
import time
import tempfile
import threading
from pathlib import Path

# Ensure src is on the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from avs_backend.cleaner.interfaces import CleanerCategory, CleaningActionResult
from avs_backend.cleaner.scanner_base import BaseCleaner
from avs_backend.cleaner.history_store import HistoryStore


class BenchmarkCleaner(BaseCleaner):
    """Single-root cleaner for benchmarking."""

    id = "benchmark"
    name = "Benchmark"
    description = "Benchmark cleaner"
    category = CleanerCategory.USER

    def __init__(self, root: Path):
        self._root = root

    def targets(self):
        return [self._root]


def make_files(root: Path, n: int, size: int = 8) -> list[str]:
    """Create n small files in root, return list of paths."""
    root.mkdir(parents=True, exist_ok=True)
    paths: list[str] = []
    for i in range(n):
        p = root / f"file_{i:05d}.tmp"
        p.write_bytes(b"x" * size)
        paths.append(str(p))
    return paths


def make_files_batched(root: Path, n: int, size: int = 8) -> list[str]:
    """Create n files using batched I/O for faster setup."""
    root.mkdir(parents=True, exist_ok=True)
    paths: list[str] = []
    # Write files in batches to avoid keeping too many file handles open
    batch = 1000
    data = b"x" * size
    for start in range(0, n, batch):
        end = min(start + batch, n)
        for i in range(start, end):
            p = root / f"file_{i:05d}.tmp"
            p.write_bytes(data)
            paths.append(str(p))
    return paths


def run_benchmark(file_count: int = 10_000) -> dict:
    """Run the full benchmark and return timing results."""
    results = {}
    tmpdir = Path(tempfile.mkdtemp(prefix="avs_bench_"))

    print(f"\n{'='*60}")
    print(f"  Cleaning Engine Benchmark — {file_count:,} files")
    print(f"{'='*60}")

    # ── Setup: create files ──────────────────────────────────────
    print(f"\n[Setup] Creating {file_count:,} files...")
    t0 = time.monotonic()
    paths = make_files_batched(tmpdir, file_count, size=8)
    setup_time = time.monotonic() - t0
    results["setup_seconds"] = round(setup_time, 3)
    print(f"  Setup: {setup_time:.3f}s")

    cleaner = BenchmarkCleaner(tmpdir)
    cancel = threading.Event()
    progress_cb = lambda pct: None

    # ── Phase 1: Scan ────────────────────────────────────────────
    print(f"\n[1/4] Scanning...")
    t0 = time.monotonic()
    scan_result = cleaner.scan(cancel, progress_cb)
    scan_time = time.monotonic() - t0
    results["scan_seconds"] = round(scan_time, 3)
    results["scan_files"] = scan_result.total_files
    results["scan_bytes"] = scan_result.total_bytes
    print(f"  Scan: {scan_time:.3f}s ({scan_result.total_files:,} files, {scan_result.total_bytes:,} bytes)")
    print(f"  Speed: {scan_result.total_files / scan_time:,.0f} files/s")

    # ── Phase 2: Validate ────────────────────────────────────────
    print(f"\n[2/4] Validating {len(paths):,} candidate paths...")
    t0 = time.monotonic()
    preview = cleaner.validate(paths)
    validate_time = time.monotonic() - t0
    results["validate_seconds"] = round(validate_time, 3)
    results["validate_candidates"] = preview.total_files
    results["validate_warnings"] = len(preview.warnings)
    print(f"  Validate: {validate_time:.3f}s ({preview.total_files:,} passed, {len(preview.warnings)} warnings)")
    if validate_time > 0:
        print(f"  Speed: {len(paths) / validate_time:,.0f} paths/s")

    # ── Phase 3: Clean (deletion) ────────────────────────────────
    candidate_paths = preview.candidate_paths
    print(f"\n[3/4] Cleaning {len(candidate_paths):,} files...")
    t0 = time.monotonic()
    clean_result = cleaner.clean(candidate_paths, cancel, progress_cb)
    clean_time = time.monotonic() - t0
    results["clean_seconds"] = round(clean_time, 3)
    results["clean_removed"] = clean_result.files_removed
    results["clean_skipped"] = clean_result.files_skipped
    results["clean_failed"] = clean_result.files_failed
    results["clean_result"] = clean_result.result.value
    print(f"  Clean: {clean_time:.3f}s (removed={clean_result.files_removed}, skipped={clean_result.files_skipped}, failed={clean_result.files_failed})")
    if clean_time > 0:
        print(f"  Speed: {clean_result.files_removed / clean_time:,.0f} files/s")

    # ── Phase 4: History write ───────────────────────────────────
    print(f"\n[4/4] Writing history...")
    db_path = tmpdir / "bench_history.sqlite"
    history = HistoryStore(db_path)
    t0 = time.monotonic()
    history.append({
        "started_at": "2026-01-01T00:00:00Z",
        "finished_at": "2026-01-01T00:00:01Z",
        "cleaner_id": "benchmark",
        "cleaner_name": "Benchmark",
        "category": "user",
        "action": "clean",
        "result": clean_result.result.value,
        "files_removed": clean_result.files_removed,
        "bytes_recovered": clean_result.bytes_recovered,
        "files_skipped": clean_result.files_skipped,
        "files_failed": clean_result.files_failed,
        "duration_ms": int(clean_time * 1000),
        "errors_json": "[]",
    })
    history_time = time.monotonic() - t0
    results["history_seconds"] = round(history_time, 3)
    print(f"  History: {history_time:.3f}s")
    history.close()

    # ── Total pipeline (scan + validate + clean + history) ───────
    total = scan_time + validate_time + clean_time + history_time
    results["total_pipeline_seconds"] = round(total, 3)
    print(f"\n{'─'*60}")
    print(f"  TOTAL PIPELINE: {total:.3f}s")
    print(f"  Target: <10.000s")
    if total < 10.0:
        print(f"  STATUS: ✅ TARGET MET")
    else:
        print(f"  STATUS: ❌ Target not met (need {total - 10.0:.3f}s improvement)")
    print(f"{'─'*60}")

    # ── Cleanup ──────────────────────────────────────────────────
    import shutil
    shutil.rmtree(tmpdir, ignore_errors=True)

    return results


if __name__ == "__main__":
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 10_000
    run_benchmark(count)
