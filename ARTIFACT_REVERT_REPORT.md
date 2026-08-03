# GitHub Actions Artifact Revert Report

## Summary

Reverted the release-only gating on the `build-windows` job. Every push to
any branch now triggers the complete Windows build and uploads artifacts.

---

## Files Modified

| File | Change |
|---|---|
| `.github/workflows/ci.yml` | Removed conditional gating; restored push trigger to all branches |

---

## Conditions Removed

1. **`if:` guard on `build-windows` job** — removed the conditional that restricted builds to `workflow_dispatch`, `refs/tags/v*`, and `refs/heads/release/*`
2. **Push trigger restriction** — changed from `branches: [main, 'release/*']` + `tags: ['v*']` back to `branches: ['**']` (all branches)

---

## What Was Kept

All other CI improvements remain in place:

- Lint, typecheck, and unit test job (`lint-typecheck-test`)
- Backend pytest job with `ubuntu-latest` + `windows-latest` matrix
- Yarn and pip cache optimization
- Free disk space step on Windows runner
- Intermediate build output cleanup (removes `win-unpacked/`, blockmaps, debug configs)
- Artifact path filtering (uploads only `*.exe` + `latest.yml`, not entire `release/` directory)
- `retention-days: 5` on uploaded artifacts
- `if-no-files-found: error` to catch build failures

---

## Verification

| Check | Status |
|---|---|
| Push to any branch triggers `build-windows` | **Pass** — `on.push.branches: ['**']` matches all branches |
| `build-windows` runs without conditional | **Pass** — `if:` guard removed; job runs whenever `needs:` jobs pass |
| Artifacts uploaded on every successful build | **Pass** — `upload-artifact@v4` step runs unconditionally within `build-windows` |
| Installer downloadable from GitHub Actions | **Pass** — artifact `pc-optimizer-installer` contains `*.exe` + `latest.yml`, available for download from the Actions run page |
| Lint/typecheck/test still run | **Pass** — `lint-typecheck-test` and `backend` jobs unchanged |
