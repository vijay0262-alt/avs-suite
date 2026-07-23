# License Manager

**AVS PC Optimizer** — Commercial Licensing Infrastructure  
**Version:** 1.0.0 | **Date:** 2026-07-23

---

## Overview

The License Manager is the centralized orchestrator for all licensing operations. It is the single object the application interacts with — no other module accesses storage or activation services directly.

## Responsibilities

| Responsibility | Method |
|----------------|--------|
| License State | `getState()` |
| License Validation | `validate()` |
| Edition | `getEdition()` |
| Expiry | via `getLicenseView()` |
| Activation Status | `isActivated()` |
| Offline Cache | `initialize()` loads from storage |
| Grace Period | `isInGracePeriod()` |

The License Manager does **nothing else**. No UI logic, no payment logic, no telemetry.

## Interface

```typescript
interface ILicenseManager {
  getState(): LicenseState;
  getEdition(): 'free' | 'pro' | 'enterprise' | 'trial';
  isActivated(): boolean;
  isInGracePeriod(): boolean;
  getLicenseView(): LicenseView | null;
  getLicenseModel(): LicenseModel | null;
  activate(key: string, email: string): Promise<ActivationResult>;
  deactivate(): Promise<DeactivationResult>;
  validate(): Promise<ValidationResult>;
  refresh(): Promise<ValidationResult>;
  onEvent(listener: LicenseEventListener): () => void;
  initialize(): Promise<ValidationResult>;
  getDeviceId(): Promise<string>;
}
```

## Lifecycle

### Application Startup

1. Electron main process creates concrete `ILicenseStorage`, `IActivationService`, `IDeviceIdProvider`
2. `LicenseManager` is constructed with these dependencies
3. `LicenseManager.initialize()` is called:
   - Emits `application_started` event
   - Loads cached license from encrypted storage
   - If storage fails, emits `storage_error` and falls back to Free
   - Checks if license should enter grace period
   - Validates license offline
   - Sets current state
4. `FeatureManager` is created with `getState()` as the state provider
5. React `LicenseProvider` wraps the app

### License Activation

1. `activate(key, email)` is called
2. Delegates to `IActivationService.activate()` (interface only — no implementation yet)
3. On success: persists license to storage, emits `license_activated` and `edition_changed` events
4. On failure: returns error result

### License Validation

1. `validate()` is called (e.g., on startup or periodic check)
2. Delegates to `validateOffline()` — checks expiry, state, grace period
3. If state changed, emits appropriate events (`grace_started`, `grace_ended`, `license_expired`)
4. Returns `ValidationResult`

### License Refresh

1. `refresh()` is called
2. Attempts `IActivationService.refresh()` (interface only)
3. On failure (offline), falls back to `validate()` (offline validation)
4. Emits `license_refreshed` event if state changed

## State Resolution

```
LicenseManager.initialize()
  → storage.read()
  → if null: state = 'free'
  → if license exists:
    → shouldEnterGrace()? → set grace_period, calculate graceExpiry
    → hasGraceEnded()? → set expired
    → validateOffline() → set state
```

## Edition Resolution

| State | Edition |
|-------|---------|
| free | free |
| trial | trial |
| monthly, annual, lifetime, grace_period | pro |
| expired, invalid, revoked | free |

## Event Emission

The License Manager emits events through the `LicenseEventEmitter`:

| Action | Events Emitted |
|--------|----------------|
| `initialize()` | `application_started` |
| `activate()` success | `license_activated`, `edition_changed` (if edition changed) |
| `deactivate()` success | `license_deactivated`, `edition_changed` |
| `validate()` state change | `license_validated`, plus `grace_started`/`grace_ended`/`license_expired` |
| `refresh()` state change | `license_refreshed` |
| Storage read failure | `storage_error` |

## Grace Period

- **Duration:** 30 days after license expiry
- **Behavior:** Application continues with Pro features during grace period
- **Calculation:** `graceExpiry = expiryDate + 30 days`
- **End:** When grace period ends, license reverts to Free
- **Never blocks startup:** Application always starts, regardless of license state

## What Is NOT Here

- No payment processing
- No online activation (interface only)
- No mock/fake implementations
- No direct access to optimization modules
- No UI logic (UI uses `LicenseContext` React wrapper)
