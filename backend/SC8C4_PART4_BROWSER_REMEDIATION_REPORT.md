# SC-8C4 Part 4 — Safe Browser Cache Remediation Report

## Summary

Implemented a safe, dry-run-first `BrowserExecutor` for automatic browser cache cleanup. The executor is the only new execution component for Part 4. Filesystem, registry, startup, and UI components were left unchanged.

## New / Modified Components

- `src/avs_backend/scan_core/execution/browser_executor.py` — real `BrowserExecutor`
- `src/avs_backend/scan_core/execution/target_executors.py` — routes `clear_browser_cache` to `BrowserExecutor`
- `src/avs_backend/scan_core/execution/__init__.py` — exports `BrowserExecutor`
- `src/avs_backend/scan_core/execution/context.py` — extended `BrowserContext` for precondition compatibility
- `src/avs_backend/scan_core/rules/safety_gate.py` — `DefaultSafetyGate` returns `REQUIRES_REVIEW` when the only failing precondition is `browser_not_running`
- `src/avs_backend/scan_core/rules/tests/test_action_part4_safety.py` — updated running-browser expectation to `REQUIRES_REVIEW`
- `tests/test_sc8c4_part4_browser.py` — 36 new browser cache tests
- `SC8C4_PART4_BROWSER_REMEDIATION_REPORT.md` — this report

## Browser Support

The executor does not rely on browser process enumeration; it operates on `BrowserActionTarget` and `BrowserContext`. Tests cover:

- Chrome / Chromium
- Edge
- Firefox
- Brave
- Opera
- Opera GX
- Vivaldi

Browser and profile identity are verified at execution time against the provided live context.

## Cache Allowlist

Rule IDs are classified by `BrowserExecutor._classify_rule(rule_id)`. Allowed cache substrings include:

- `http_cache`
- `gpu_cache`
- `code_cache`
- `service_worker`
- `cache_storage`
- `shader_cache`
- `font_cache`
- `media_cache`
- `blob_storage`
- generic `cache` (when not overridden by denylist)

## User-Data Denylist

Rule IDs matching any of these substrings are rejected without modifying browser data:

- `cookies`, `history`, `bookmarks`, `login_data`, `passwords`
- `autofill`, `extensions`, `session`, `preferences`, `sync`
- `certificates`, `profile`, `database`, `web_data`, `favicons`
- `top_sites`, `visits`

## Profile Validation

The executor and `SafetyGate` verify:

- `browser` matches the target or an explicit context override
- `profile` matches the target
- `browser_profiles` contains the target profile
- `canonical_path` exists and is accessible

## Running-Browser Handling

The `DefaultSafetyGate` and `BrowserExecutor` both check `running_browsers`. When the only failing precondition is `browser_not_running:*`, the `DefaultSafetyGate` returns `REQUIRES_REVIEW` rather than `REJECTED`. The `BrowserExecutor` also refuses to delete cache files for a running browser and returns `REQUIRES_REVIEW`.

No browser process is killed, forced closed, or terminated.

## Path Safety

`BrowserExecutor` reuses `validate_filesystem_path` from `action_path_validation.py` and live re-reads each target. It rejects:

- Forbidden roots
- Path traversal
- Symlinks, junctions, and reparse points
- Paths outside the approved cache scope

## Backup / Rollback

- Every cache child is backed up via the existing `BackupManager` before deletion.
- Backup total size is capped at 50 MiB; larger cache trees require review.
- If any child deletion fails, the executor rolls back already-deleted children.
- Rollback is not claimed unless a backup record was actually created.

## Dry-Run

Dry-run is the default. `BrowserExecutor` returns `DRY_RUN` with metadata including:

- `browser`, `profile`, `cache_type`, `canonical_path`
- `running` state
- `safety_decision`
- `would_remove`
- `children_count`, `children` paths, `total_size`

No browser data is modified.

## Cancellation

Cancellation is checked before enumeration, before backup, and before each child deletion. Interrupted live runs return `CANCELLED`.

## Idempotency

The existing `ExecutionLedger` is used. Re-executing an already-completed cache action returns `SKIPPED`.

## Tests

`tests/test_sc8c4_part4_browser.py` covers:

- Dry-run without modification
- Allowed cache cleanup for all listed browsers / cache types
- User data rejection (cookies, history, bookmarks, login data, passwords, autofill, extensions)
- Ambiguous asset review
- Running browser review
- Wrong profile rejection
- Wrong browser rejection
- Forbidden path rejection
- Path traversal rejection
- TOCTOU (size, missing target)
- Cancellation
- Idempotency
- Symlink rejection
- Safety Gate / 100-action scale
- Backup and restore

Windows-specific symlink tests skip safely on non-Windows CI.

## Validation

```text
python -m pytest -q
1049 passed, 12 skipped in 488.05s (0:08:08)
```

Static checks for modified files:

- `mypy` — no issues
- `flake8 --max-line-length=100` — clean
- `black --check` — clean
- `isort --check-only` — clean

## Limitations

- Real browser profile discovery is not implemented; the executor consumes `BrowserContext` supplied by the caller.
- Running-browser detection is based on the provided `running_browsers` list, not live process enumeration.
- Recursive cache-directory cleanup is limited to the top-level directory; unexpected nested directories are not removed.
- The 50 MiB backup size limit is a static policy.

## Scope Compliance

- No filesystem executor logic was modified.
- No registry executor logic was modified.
- No startup or UI work.
- No SC-8C5 work.
- SafetyGate was not bypassed; it was extended to support the `REQUIRES_REVIEW` semantic for running browsers.
