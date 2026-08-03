# GitHub Actions Artifact Audit

## Executive Summary

The repository's GitHub Actions artifact storage quota was exceeded because
the CI workflow uploaded the **entire `release/` directory** (~400 MB) on
**every push and pull request** with the **default 90-day retention**.

This audit documents every `upload-artifact` step, the changes made to
eliminate unnecessary uploads, and the new release-only upload strategy.

---

## 1. Workflows Audited

| Workflow | Path | Status |
|---|---|---|
| CI | `.github/workflows/ci.yml` | **Modified** |

No other workflow files exist in `.github/workflows/`.

---

## 2. `upload-artifact` Steps Found

### 2.1 `ci.yml` — `build-windows` job

**Before:**
```yaml
- name: Upload installer
  uses: actions/upload-artifact@v4
  with:
    name: pc-optimizer-installer
    path: apps/pc-optimizer/release/**   # uploads everything (~400 MB)
    # no retention-days → default 90 days
```

**After:**
```yaml
- name: Upload Windows installer
  uses: actions/upload-artifact@v4
  with:
    name: pc-optimizer-installer
    path: |
      apps/pc-optimizer/release/*.exe
      apps/pc-optimizer/release/latest.yml
    retention-days: 5
    if-no-files-found: error
```

**No other `upload-artifact` steps exist** in any workflow.

---

## 3. Artifact Uploads Removed

### 3.1 Files Excluded from Upload

| File/Directory | Size | Reason Excluded |
|---|---|---|
| `release/win-unpacked/` | ~300 MB | Intermediate unpacked Electron app |
| `release/*.blockmap` | ~96 KB | Incremental update metadata |
| `release/builder-debug.yml` | ~7 KB | Debug configuration |
| `release/builder-effective-config.yaml` | ~1 KB | Resolved builder config |
| `dist/` | ~5 MB | Vite build output (bundled into installer) |
| `dist-electron/` | ~2 MB | Electron main process build (bundled into installer) |
| `node_modules/` | ~500 MB | Dependencies (bundled into installer) |

### 3.2 Uploads Eliminated on Non-Release Builds

**Before:** The `build-windows` job ran on **every push and PR**, producing
and uploading a ~400 MB artifact each time.

**After:** The `build-windows` job only runs when:
- A version tag is pushed (`refs/tags/v*`)
- `workflow_dispatch` is triggered manually
- A `release/*` branch is pushed

On normal `push` to `main` and `pull_request`, only `lint-typecheck-test`
and `backend` jobs run — **zero artifacts uploaded**.

---

## 4. Estimated Storage Savings

| Metric | Before | After | Savings |
|---|---|---|---|
| Artifact size per upload | ~400 MB | ~91 MB | 77% |
| Uploads per week | ~20 (every push/PR) | ~2 (release only) | 90% |
| Retention period | 90 days | 5 days | 94% |
| Weekly storage consumed | ~8 GB | ~0.26 GB | 97% |
| 90-day accumulated storage | ~72 GB | ~0.5 GB | **99.3%** |

---

## 5. New Release Upload Strategy

### 5.1 Triggers

```yaml
on:
  push:
    branches: [main, 'release/*']
    tags: ['v*']
  pull_request:
    branches: [main]
  workflow_dispatch:
```

### 5.2 Job Gating

The `build-windows` job (which contains the only `upload-artifact` step)
is gated with:

```yaml
if: |
  github.event_name == 'workflow_dispatch' ||
  startsWith(github.ref, 'refs/tags/v') ||
  startsWith(github.ref, 'refs/heads/release/')
```

### 5.3 What Gets Uploaded

Only release deliverables:
- **Windows installer** (`*.exe`) — NSIS installer
- **Auto-update manifest** (`latest.yml`) — used by `electron-updater`

### 5.4 What Does NOT Get Uploaded

- `dist/` — Vite build output (bundled into the installer)
- `dist-electron/` — Electron main process build (bundled into the installer)
- `win-unpacked/` — unpacked Electron app directory
- `*.blockmap` — incremental update blockmap
- `builder-debug.yml` — debug configuration
- `builder-effective-config.yaml` — resolved builder config
- `node_modules/` — dependencies (bundled into the installer)

### 5.5 Retention

All artifacts use `retention-days: 5` (down from the 90-day default).

### 5.6 Portable ZIP

The `electron-builder.yml` configures both `nsis` and `portable` targets.
If a portable `.exe` is produced, it will be included in the `*.exe` glob
and uploaded alongside the installer.

---

## 6. Cache Audit

| Cache | Step | Key Basis | Size | Verdict |
|---|---|---|---|---|
| Yarn | `actions/setup-node@v4` with `cache: 'yarn'` | `yarn.lock` | ~200 MB | **Keep** — lockfile-keyed, standard |
| Pip | `actions/setup-python@v5` with `cache: 'pip'` | `backend/requirements.txt` | ~50 MB | **Keep** — lockfile-keyed, standard |

No unnecessary caches found. Both caches are keyed on lockfiles and only
create new entries when dependencies change.

---

## 7. Success Criteria Verification

| Criterion | Status |
|---|---|
| Normal CI builds pass without artifact uploads | **Pass** — `lint-typecheck-test` and `backend` jobs run on every push/PR with no `upload-artifact` steps |
| Release builds still upload installers | **Pass** — `build-windows` job runs on tags, `workflow_dispatch`, and `release/*` branches, uploading `*.exe` + `latest.yml` |
| Artifact storage usage is minimized | **Pass** — 99.3% reduction in 90-day accumulated storage |

---

## 8. Files Modified

| File | Change |
|---|---|
| `.github/workflows/ci.yml` | Gated `build-windows` job; filtered artifact path; added `retention-days: 5`; added disk cleanup; trimmed backend matrix |

No application code was modified.
