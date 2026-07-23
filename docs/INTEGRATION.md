# AVS Suite × AVS License Server — Integration Documentation

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    AVS Suite (Electron)                  │
│                                                         │
│  ┌──────────┐   IPC    ┌──────────┐   RPC    ┌────────┐ │
│  │  React   │─────────▶│  Main    │─────────▶│ Python │ │
│  │  UI      │          │  Process │          │ Backend│ │
│  │          │◀─────────│          │◀─────────│        │ │
│  └──────────┘          └──────────┘          └────┬───┘ │
│        │                                          │     │
│   FeatureGate                               SDK Bridge │
│   UpdateManager                                  │     │
│   LicenseContext                                 │     │
└──────────────────────────────────────────────────┼─────┘
                                                   │
                                          AVS License SDK │
                                                   │
                                    ┌──────────────▼─────┐
                                    │  AVS License Server │
                                    │  (FastAPI + PG)     │
                                    │                     │
                                    │  /api/licenses/*    │
                                    │  /api/update/*      │
                                    │  /api/settings/*    │
                                    └─────────────────────┘
```

## Repository Relationship

| Repository | Location | Role |
|-----------|----------|------|
| AVS-License-Server | `../Avs-license-server` | License server, admin portal, SDK package |
| avs-suite | `.` | Desktop applications (PC Optimizer, future products) |

**Repositories remain independent.** The SDK is consumed via editable install — no source files are copied.

## SDK Integration Guide

### How the SDK is consumed

1. **Python backend**: `pip install -e ../Avs-license-server/packages/avs_license_sdk`
2. **Editable install**: Changes to the SDK source are immediately available
3. **Production**: SDK is bundled via PyInstaller into the backend executable

### Communication flow

```
React UI → IPC (preload) → Electron Main → JSON-RPC → Python Backend → SDK → License Server
```

The renderer **never** calls REST APIs directly. Only the SDK communicates with the server.

### Key modules

| Module | Location | Purpose |
|--------|----------|---------|
| `licensing/__init__.py` | `backend/src/avs_backend/licensing/` | Python RPC handlers bridging SDK |
| `licenseBridge.ts` | `apps/pc-optimizer/electron/licensing/` | TypeScript bridge calling Python RPC |
| `licenseIpc.ts` | `apps/pc-optimizer/electron/licensing/` | IPC handlers for renderer |
| `licenseStartup.ts` | `apps/pc-optimizer/electron/licensing/` | Startup sequence orchestration |
| `SdkActivationService.ts` | `apps/pc-optimizer/src/features/licensing/` | Implements `IActivationService` via IPC |
| `FeatureGate.ts` | `apps/pc-optimizer/src/features/licensing/` | Feature access checks |
| `UpdateManager.ts` | `apps/pc-optimizer/src/features/licensing/` | SDK-based update management |

## Development Setup

### Prerequisites

- Node.js >= 18.18.0
- Python >= 3.10
- Yarn >= 1.22.0
- PostgreSQL (for AVS-License-Server)
- Git

### Quick Start

```powershell
# Clone both repositories (they should be sibling directories)
git clone https://github.com/vijay0262-alt/Avs-license-server.git
git clone <avs-suite-repo-url>

# Run the setup script
cd avs-suite
.\scripts\setup-dev.ps1
```

The setup script will:
1. Install AVS License Server Python dependencies
2. Install the AVS License SDK in editable mode
3. Install AVS Suite backend Python dependencies
4. Install AVS Suite Node.js dependencies
5. Create `.env` from `.env.example`

### Manual Setup

```powershell
# 1. Install License Server dependencies
cd ../Avs-license-server
pip install -r requirements.txt

# 2. Install SDK in editable mode
pip install -e packages/avs_license_sdk

# 3. Install AVS Suite backend dependencies
cd ../avs-suite/backend
pip install -r requirements.txt

# 4. Install AVS Suite Node.js dependencies
cd ..
yarn install

# 5. Configure environment
copy .env.example .env
# Edit .env with your settings
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LICENSE_SERVER_URL` | `http://localhost:8000` | License server URL |
| `PRODUCT_CODE` | `AVS_PC_OPTIMIZER` | Product identifier |
| `APP_VERSION` | `1.0.0` | Application version |
| `UPDATE_CHANNEL` | `stable` | Release channel (stable, beta, preview, internal) |
| `SDK_LOG_LEVEL` | `INFO` | SDK logging verbosity |
| `OFFLINE_GRACE_DAYS` | `7` | Offline grace period in days |
| `REFRESH_INTERVAL_HOURS` | `24` | License refresh interval |
| `AVS_ENV` | `development` | Environment (development, staging, production) |

## Startup Sequence

When AVS Suite starts:

1. Electron main process spawns Python backend (JSON-RPC over stdio)
2. After backend is ready, `initLicensing()` is called:
   - Creates `LicenseBridge` (IPC handlers)
   - Calls `license.startup` RPC → SDK loads local license, validates or checks grace
   - Starts auto-refresh if licensed
   - Checks for updates immediately
   - Starts periodic update checks
3. React app loads with `LicenseProvider` context
4. If no license: Free edition, premium modules locked
5. If license valid: Full access based on edition
6. If license invalid: Activation window shown

## License Management

### Operations

| Operation | IPC Channel | SDK Method |
|-----------|-------------|------------|
| Startup | `avs:license:startup` | `client.startup()` |
| Activate | `avs:license:activate` | `client.activate()` |
| Validate | `avs:license:validate` | `client.validate()` |
| Refresh | `avs:license:refresh` | `client.refresh()` |
| Deactivate | `avs:license:deactivate` | `client.deactivate()` |
| Get Status | `avs:license:getStatus` | `client.get_status()` |
| Is Licensed | `avs:license:isLicensed` | `client.is_licensed()` |
| Get Info | `avs:license:getInfo` | `client.get_status() + helpers` |

### Edition Support

| Edition | SDK Status | Features |
|---------|-----------|----------|
| Free | No license | Basic junk cleaner, startup manager, disk analyzer |
| Professional | `active` | All PC Optimizer features |
| Ultimate | `active` (enterprise edition) | All features + multi-device |

Feature access is determined by `FeatureGate.can_use()` which queries the `FeatureManager` based on the current license state.

## Automatic Updates

The `UpdateManager` uses the SDK's Release Management API:

1. **Check**: `license.checkUpdates()` → SDK calls `/api/update/check`
2. **Download**: `license.downloadUpdate(releaseId)` → SDK calls `/api/update/download/{id}`
3. **Verify**: SDK verifies SHA256 checksum
4. **Install**: `license.installUpdate(filePath)` → Launches installer

Update events are broadcast to the renderer via `avs:license:event`.

## Diagnostics

The `license.get_info` RPC endpoint provides:
- License status, edition, expiry
- Days remaining, remaining devices
- Offline status
- Server URL, device fingerprint
- SDK version, product code, app version

This data powers the About window and diagnostics export.

## Error Handling

| Error | Behavior |
|-------|----------|
| Network offline | SDK falls back to offline grace |
| Wrong device | License invalidated, activation required |
| Wrong product | Activation error shown |
| Product retired | Activation error shown |
| License expired | Status set to expired, features locked |
| License suspended | Status set to suspended, features locked |
| Offline grace expired | Validation required, features locked |
| Force upgrade | Update notification with force flag |
| Critical update | Update notification with critical flag |
| Corrupted license | Storage error, license removed |
| SDK failure | Error logged, free mode continues |

Never exposes stack traces to users — shows user-friendly dialogs.

## Adding a New AVS Product

1. **Register the product** in the AVS License Server admin portal
2. **Create a new app** in `apps/` (e.g., `apps/driver-updater/`)
3. **Set `PRODUCT_CODE`** in `.env` (e.g., `AVS_DRIVER_UPDATER`)
4. **Build new UI modules** for the product
5. **Reuse all existing infrastructure**: SDK, licensing, updates, feature gating

No architecture changes needed — the SDK and server already support multiple products.

## Build Pipeline

### Development
```bash
yarn dev:pc-optimizer
```

### Production Build
```bash
# Build everything
yarn build:pc-optimizer
yarn build:backend
yarn package:pc-optimizer

# Or specific builds:
yarn package:installer    # NSIS installer
yarn package:portable     # Portable build
```

### Electron Builder Config

The build config in `apps/pc-optimizer/package.json` includes:
- SDK as part of the Python backend bundle (PyInstaller)
- License configuration via environment variables
- Update configuration via SDK (not electron-updater)

## Testing

### Run All Tests

```bash
# AVS License Server
cd ../Avs-license-server
python -m pytest

# AVS Suite frontend
yarn test

# AVS Suite backend
cd backend && python -m pytest
```

### Integration Tests

- `backend/tests/test_licensing_bridge.py` — Tests all RPC handlers
- Frontend integration tests cover IPC flow, feature gating, and update flow

## Versioning Strategy

- **AVS License Server**: Semantic versioning (e.g., `1.2.0`)
- **AVS License SDK**: Tracks with server version (`1.2.0`)
- **AVS Suite**: Independent versioning per product (e.g., PC Optimizer `1.0.0`)
- **SDK compatibility**: SDK version >= server version is guaranteed compatible

## Troubleshooting

### "License IPC API not available"
- Preload script not loaded. Check Electron `webPreferences.preload` path.

### "Cannot connect to server"
- Verify `LICENSE_SERVER_URL` in `.env`
- Ensure the license server is running

### "No license found"
- Expected on first run. Activate a license key.

### "Offline grace expired"
- The device has been offline longer than `OFFLINE_GRACE_DAYS`.
- Connect to the internet and validate.

### SDK not found in Python backend
- Run `pip install -e ../Avs-license-server/packages/avs_license_sdk`
- Verify with `python -c "from avs_license_sdk import LicenseClient"`

### Build fails with missing SDK
- Ensure SDK is installed before building backend
- For production builds, PyInstaller must find the SDK package
