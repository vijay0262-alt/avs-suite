# AVS Suite × AVS License Server — Integration Plan

## Architectural Review

### Repository A: AVS-License-Server

**Location**: `c:\Users\HPBP\Documents\GitHub\Avs-license-server`

**Stack**: FastAPI + PostgreSQL + SQLAlchemy + Alembic

**Key components**:
- **Admin Portal**: Full admin UI with customer/product/plan/license/release management
- **License API**: `/api/licenses/activate`, `/validate`, `/refresh`, `/deactivate`
- **Update API**: `/api/update/check`, `/api/update/download/{id}`
- **Settings API**: `/api/settings/branding`, `/api/settings/defaults`, `/api/settings/features` (public, for desktop apps)
- **SDK** (`packages/avs_license_sdk/`): Python `LicenseClient` with activate, validate, refresh, deactivate, offline grace, auto-refresh, update check, download, install
- **336 tests passing**

### Repository B: AVS-Suite

**Location**: `c:\Users\HPBP\Documents\GitHub\avs-suite`

**Stack**: Electron + React + TypeScript (frontend) / Python (backend)

**Key components**:
- **Monorepo**: Yarn workspaces (`apps/*`, `packages/*`, `services/*`)
- **App**: `apps/pc-optimizer/` — Electron + React + Vite
- **Python backend**: `backend/src/avs_backend/` — JSON-RPC over stdio, spawned by Electron
- **Licensing package** (`packages/licensing/`): TypeScript interfaces (`ILicenseManager`, `IActivationService`, `IFeatureManager`, `LicenseModel`, `LicenseState`)
  - **No concrete activation service** — `IActivationService` has no implementation
  - `NullLicensingService` is the current fallback (always returns 'free')
  - `LicenseManager` class exists but needs an `IActivationService` implementation
  - `FeatureManager` maps license state → edition → feature availability
- **Updater** (`electron/updater/updater.ts`): Uses `electron-updater` (generic), NOT the AVS License Server's Release Management
- **IPC**: `electron/ipc/handlers.ts` + `pythonBridge.ts` — JSON-RPC to Python backend
- **Preload**: Exposes `window.avs.rpc`, `window.avs.app`, `window.avs.updater`
- **ActivationPage**: Full UI for license activation/deactivation/refresh
- **LicenseContext**: React context bridging `ILicenseManager` to components

### Integration Points

1. **SDK → Python backend**: The AVS License SDK is a Python package. AVS Suite's Python backend can import it directly via editable install.
2. **Python backend → Electron**: JSON-RPC over stdio. New `license.*` RPC methods will bridge SDK calls.
3. **Electron → React**: IPC via preload script. New `window.avs.license` API.
4. **Feature gating**: `FeatureManager` in `@avs/licensing` already maps states to editions. Need to wire it to SDK responses.
5. **Updates**: Replace `electron-updater` generic provider with SDK's `check_for_updates` / `download_update` / `install_update`.

### Conflicts & Risks

- **None identified**. The existing `@avs/licensing` package was designed for this integration — `IActivationService` is explicitly an interface awaiting a concrete implementation.
- The `NullLicensingService` is a placeholder, not a permanent implementation.
- The `electron-updater` can coexist; we'll add SDK-based update checking alongside it.

## Integration Strategy

### Layer 1: Python Backend (SDK Bridge)

Create `avs_backend/licensing/` module in AVS Suite backend:
- Imports `avs_license_sdk.LicenseClient`
- Registers JSON-RPC handlers: `license.activate`, `license.validate`, `license.refresh`, `license.deactivate`, `license.get_status`, `license.is_licensed`, `license.days_remaining`, `license.remaining_devices`, `license.offline_status`, `license.startup`, `license.check_updates`, `license.download_update`, `license.install_update`, `license.get_info`
- Singleton `LicenseClient` initialized from environment variables

### Layer 2: Electron Main Process

- Create `electron/licensing/` module:
  - `licenseBridge.ts` — calls Python RPC `license.*` methods
  - `licenseIpc.ts` — IPC handlers for renderer
  - `licenseStartup.ts` — startup sequence (init SDK, validate, start auto-refresh, check updates)
- Update `main/index.ts` to call license startup after Python backend is ready
- Update `preload/preload.ts` to expose `window.avs.license` API

### Layer 3: React Frontend

- Create `SdkLicenseAdapter` implementing `IActivationService` — calls IPC → Python → SDK
- Wire `LicenseManager` with real `SdkActivationService` at bootstrap
- Update `ActivationPage` to show full SDK data (days remaining, offline grace, last validation, etc.)
- Create `AboutPage` with SDK version, server version, license status
- Create `DiagnosticsPage` with system info + license + logs export

### Layer 4: Update Manager

- Create `electron/updater/sdkUpdater.ts`:
  - Periodic `license.check_updates` via Python RPC
  - Notify renderer of available updates
  - Download with SHA256 verification
  - Launch installer
- Replaces the generic `electron-updater` configuration

### Layer 5: Feature Gate

- The existing `FeatureManager` in `@avs/licensing` already works
- Wire it to use the SDK-backed `LicenseManager` state
- `FeatureGate.can_use("registry_cleaner")` → `featureManager.has('registry_cleaner')`

### Layer 6: Configuration

- `.env.example` with all required env vars
- `config/license_config.py` in Python backend reads env vars
- `electron/main/index.ts` reads env vars and passes to Python backend

### Layer 7: Build Pipeline

- Update `electron-builder` config to include SDK as extraResource
- Update `backend/build.py` to include SDK in PyInstaller bundle

### Layer 8: Tests

- Python: `tests/test_licensing_bridge.py` — test RPC handlers
- TypeScript: `tests/integration/` — test IPC flow, feature gating, update flow
- Existing tests remain unchanged

### Future Products

Adding a new AVS product requires only:
1. New `PRODUCT_CODE` env var
2. New app in `apps/` directory
3. New UI modules
4. Same SDK, same licensing, same update mechanism
