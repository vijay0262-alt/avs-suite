# Scan Engine Responsiveness Audit Report

**Date:** 2026-08-07 | **Scope:** Backend orchestrator + all scan/optimize modules

## Summary

All modules now emit progress at ≤400ms intervals via heartbeat threads, in-walk progress callbacks, and per-category/per-item progress emission. Instrumentation records per-module timing, throughput, and max UI update gap.

## Changes

### `orchestrator/__init__.py`
- Heartbeat threads (400ms) for scan, optimize, verify loops
- Privacy scan: passes progress callback to `scan_privacy_items`
- Privacy optimize: passes progress callback to `clean_privacy_items`
- Registry scan: iterates categories individually with per-category progress
- Performance optimize: passes progress callback to `optimize_memory`
- Instrumentation: `_init_instrument`, `_record_module_instrument`, `_tick_update` on all scan/optimize/verify functions
- Verification: per-module progress with heartbeat
- Status endpoint exposes `instrumentation` dict
- Completion logs `[INSTRUMENT]` per-module and session totals

### `cleaner/scanner_base.py`
- `_PROGRESS_STRIDE`: 1000 → 100 files
- `_walk`: accepts `on_progress`, emits every 100 files during directory walks

## Progress Emission Matrix

| Module | Scan | Optimize | Heartbeat |
|--------|------|----------|-----------|
| junk | 300ms poll + 100 files | per-category | 400ms |
| privacy | 10% callback | 10% callback | 400ms |
| registry | per-category | per-issue | 400ms |
| startup | fast | per-entry | 400ms |
| performance | fast | 10% callback | 400ms |
| disk | per-drive | N/A | 400ms |
| security | fast | N/A | 400ms |
| system | fast | N/A | 400ms |

## Instrumentation Metrics

Exposed via `orchestrator.status` → `instrumentation`: per-module `scan_ms`, `optimize_ms`, `verify_ms`, `filesScanned`, `filesCleaned`, `scanThroughput`, session `maxUpdateGapMs`.

## UI Freeze Prevention

Frontend polls at 300ms + heartbeat at 400ms = max gap ~700ms (target: <2s). All files pass `ast.parse()`.
