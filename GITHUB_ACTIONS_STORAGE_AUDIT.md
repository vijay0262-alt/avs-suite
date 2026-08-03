# GitHub Actions Storage Audit

## Executive Summary

The CI/CD pipeline was exceeding GitHub Actions storage quota due to a single
workflow (`ci.yml`) that uploaded the **entire `release/` directory** (~400 MB)
on **every push and pull request**, with the **default 90-day retention**.

This audit identifies all storage consumers, quantifies the waste, and
documents the changes made to bring the pipeline within quota.

---

## 1. Quota Being Exceeded

**Primary cause: Artifact storage**

GitHub Actions provides 500 MB of free artifact storage for private repos
(2 GB for Pro). The old workflow generated approximately **400 MB per build**
and retained artifacts for **90 days** (the default).

| Metric | Before | After |
|---|---|---|
| Artifact size per build | ~400 MB | ~91 MB |
| Builds per week (push + PR) | ~20+ | ~2 (release only) |
| Retention period | 90 days | 5 days |
| Weekly artifact storage | ~8 GB | ~0.26 GB |
| 90-day accumulated storage | ~72 GB | ~0.5 GB |

**Secondary cause: Runner disk space**

The `windows-latest` runner has ~14 GB of free disk. The Electron build
(`electron-builder`) produces ~1.5 GB of intermediate output (`win-unpacked/`,
blockmaps, etc.) which, combined with pre-installed SDKs (.NET, Android),
can fill the disk and cause the build to fail.

---

## 2. Storage Consumers Identified

### 2.1 Artifact Uploads (`actions/upload-artifact`)

**Before:**
```yaml
- name: Upload installer
  uses: actions/upload-artifact@v4
  with:
    name: pc-optimizer-installer
    path: apps/pc-optimizer/release/**   # ← uploads EVERYTHING
```

The `release/**` glob uploaded:

| File/Directory | Size | Needed? |
|---|---|---|
| `AVS PC Optimizer-Setup-1.0.0.exe` | ~91 MB | **Yes** — installer |
| `win-unpacked/` | ~300 MB | **No** — intermediate unpacked app |
| `*.blockmap` | ~96 KB | **No** — incremental update metadata |
| `builder-debug.yml` | ~7 KB | **No** — debug config |
| `builder-effective-config.yaml` | ~1 KB | **No** — resolved config |
| `latest.yml` | ~1 KB | **Yes** — auto-update manifest |

### 2.2 Cache Storage (`actions/setup-node`, `actions/setup-python`)

| Cache | Key | Size | Issue |
|---|---|---|---|
| Yarn cache | `setup-node` auto | ~200 MB | None — keyed on `yarn.lock` |
| Pip cache | `setup-python` auto | ~50 MB | None — keyed on `requirements.txt` |

**Verdict:** Cache strategy is acceptable. Both use lockfile-based keys and
only create new cache entries when the lockfile changes.

### 2.3 Release Asset Uploads

No `softprops/action-gh-release` or `gh release create` steps found.
Releases are not currently automated — they are manual.

### 2.4 Backend Matrix (Runner Minutes)

**Before:** `os: [ubuntu-latest, windows-latest, macos-latest]`
**After:** `os: [ubuntu-latest, windows-latest]`

The product is Windows-only. macOS tests provide no value and consume
~3 min of macOS runner minutes per build (macOS is 10x more expensive
than Linux).

---

## 3. Changes Made

### 3.1 Workflow Triggers

**Before:**
```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
```

**After:**
```yaml
on:
  push:
    branches: [main, 'release/*']
    tags: ['v*']
  pull_request:
    branches: [main]
  workflow_dispatch:
```

- Added `release/*` branch pushes as triggers
- Added `v*` tag pushes as triggers (release tags)
- Added `workflow_dispatch` for manual runs

### 3.2 Build Job Gating

**Before:** `build-windows` ran on every push/PR.

**After:**
```yaml
if: |
  github.event_name == 'workflow_dispatch' ||
  startsWith(github.ref, 'refs/tags/v') ||
  startsWith(github.ref, 'refs/heads/release/')
```

The installer is only built and uploaded for:
- Release tags (`v*`)
- Release branches (`release/*`)
- Manual dispatch (`workflow_dispatch`)

Lint, typecheck, unit tests, and backend tests still run on every push/PR.

### 3.3 Artifact Path Filtering

**Before:** `path: apps/pc-optimizer/release/**`

**After:**
```yaml
path: |
  apps/pc-optimizer/release/*.exe
  apps/pc-optimizer/release/latest.yml
```

Excluded:
- `win-unpacked/` (~300 MB)
- `*.blockmap` (~96 KB)
- `builder-debug.yml` (~7 KB)
- `builder-effective-config.yaml` (~1 KB)

### 3.4 Artifact Retention

**Before:** No `retention-days` (default: 90 days)

**After:**
```yaml
retention-days: 5
```

### 3.5 Intermediate Build Cleanup

Added a post-build cleanup step to delete `win-unpacked/`, blockmaps, and
debug configs from the runner disk before the upload step:

```yaml
- name: Clean intermediate build outputs
  shell: pwsh
  run: |
    Remove-Item -Recurse -Force "apps/pc-optimizer/release/win-unpacked" -ErrorAction SilentlyContinue
    Remove-Item -Force "apps/pc-optimizer/release/*.blockmap" -ErrorAction SilentlyContinue
    Remove-Item -Force "apps/pc-optimizer/release/builder-debug.yml" -ErrorAction SilentlyContinue
    Remove-Item -Force "apps/pc-optimizer/release/builder-effective-config.yaml" -ErrorAction SilentlyContinue
```

### 3.6 Runner Disk Space Reclamation

Added a `Free disk space` step on the Windows runner that removes:
- `%LOCALAPPDATA%\Temp\*` — temporary files
- `C:\Program Files\dotnet\sdk\*` — .NET SDK (not needed for Electron)
- `C:\Program Files (x86)\Android` — Android SDK (not needed)

This reclaims approximately 10 GB of disk space.

### 3.7 Backend Matrix Trimming

**Before:** `[ubuntu-latest, windows-latest, macos-latest]`
**After:** `[ubuntu-latest, windows-latest]`

Removed `macos-latest` — the product is Windows-only and macOS runner
minutes are 10x more expensive than Linux.

---

## 4. Estimated Savings

| Resource | Before (monthly) | After (monthly) | Savings |
|---|---|---|---|
| Artifact storage | ~72 GB | ~0.5 GB | **99.3%** |
| Runner minutes (build) | ~200 min | ~40 min | **80%** |
| Runner minutes (backend) | ~90 min | ~60 min | **33%** |
| Cache storage | ~250 MB | ~250 MB | 0% (no change needed) |

---

## 5. Files Modified

| File | Change |
|---|---|
| `.github/workflows/ci.yml` | Complete rewrite of `build-windows` job |

## 6. Files NOT Modified

No application code was changed. Only CI/CD configuration was modified.

---

## 7. Recommendations for Future

1. **Add release automation:** When a `v*` tag is pushed, automatically
   create a GitHub Release and attach the installer `.exe` as a release
   asset (not an artifact). Release assets don't count against Actions
   storage quota.

2. **Consider `actions/cache` for Electron download:** The
   `electron-builder` downloads the Electron binary (~100 MB) on every
   build. Caching `~/.cache/electron` would save ~30s per build.

3. **Add `concurrency` groups:** Cancel in-progress builds when a new
   commit is pushed to the same branch to save runner minutes:
   ```yaml
   concurrency:
     group: ${{ github.workflow }}-${{ github.ref }}
     cancel-in-progress: true
   ```

4. **Monitor usage:** Check `Settings → Actions → Storage` monthly to
   ensure the 5-day retention is sufficient and storage stays under quota.
