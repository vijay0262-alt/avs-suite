# Activation Flow

**AVS AI Shield: Security & System Intelligence** — Commercial Licensing Infrastructure  
**Version:** 1.0.0 | **Date:** 2026-07-23

---

## Overview

This document describes the complete activation flow — from user input to license persistence. The activation service is defined as a clean interface with no implementation. The concrete implementation will be provided when the real license server is built.

## Activation Interface

```typescript
interface IActivationService {
  activate(key: string, deviceId: string, email: string): Promise<ActivationResult>;
  deactivate(licenseId: string, deviceId: string): Promise<DeactivationResult>;
  validate(license: LicenseModel): Promise<ValidationResult>;
  refresh(license: LicenseModel): Promise<ValidationResult>;
  getLicense(): Promise<LicenseModel | null>;
  isOnline(): Promise<boolean>;
}
```

## Activation Flow (Future)

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  User enters │     │  LicenseManager  │     │ IActivation     │
│  key + email │────►│  .activate()     │────►│ Service         │
└──────────────┘     └────────┬─────────┘     │ .activate()     │
                              │               └────────┬────────┘
                              │                        │
                              │               ┌────────▼────────┐
                              │               │  License Server  │
                              │               │  (future)        │
                              │               └────────┬────────┘
                              │                        │
                     ┌────────▼────────┐               │
                     │  Storage        │◄──────────────┘
                     │  .write()       │   LicenseModel
                     └────────┬────────┘
                              │
                     ┌────────▼────────┐
                     │  Event Emitter  │
                     │  license_activated│
                     │  edition_changed │
                     └─────────────────┘
```

### Step-by-Step

1. User enters license key and email in Activation UI
2. `LicenseManager.activate(key, email)` is called
3. LicenseManager retrieves device ID via `IDeviceIdProvider.getDeviceId()`
4. `IActivationService.activate(key, deviceId, email)` is called
5. (Future) Server validates key, checks device count, returns `LicenseModel`
6. On success:
   - `ILicenseStorage.write(license)` persists encrypted license
   - `license_activated` event emitted
   - `edition_changed` event emitted (if edition changed)
   - React context updates, UI re-renders
7. On failure:
   - Error returned with reason (invalid key, key in use, expired, etc.)

## Deactivation Flow

```
User clicks Deactivate
  → LicenseManager.deactivate()
  → IActivationService.deactivate(licenseId, deviceId)
  → (Future) Server frees device seat
  → ILicenseStorage.remove()
  → license_deactivated event emitted
  → edition_changed event emitted (pro → free)
  → UI reverts to Free edition
```

## Validation Flow (Offline)

```
LicenseManager.validate()
  → validateOffline(license, config, now)
  → Check 1: State is not invalid/revoked
  → Check 2: Expiry date
    → If expired + graceExpiry in future → grace_period (valid)
    → If expired + no grace → expired (invalid)
    → If not expired → active (valid)
  → Return ValidationResult { valid, state, reason? }
```

## Refresh Flow

```
LicenseManager.refresh()
  → IActivationService.refresh(license)
  → If online (future):
    → Server returns updated license data
    → Storage updated
    → license_refreshed event
  → If offline:
    → Fallback to validateOffline()
    → Returns ValidationResult
```

## Offline Startup Flow

```
Application starts
  → LicenseManager.initialize()
  → application_started event
  → ILicenseStorage.read()
    → If null: state = 'free', done
    → If error: storage_error event, state = 'free', done
  → License loaded from encrypted storage
  → shouldEnterGrace(license)?
    → Yes: set grace_period, calculate graceExpiry (30 days), write back
  → hasGraceEnded(license)?
    → Yes: set expired, write back
  → validateOffline(license)
  → Set current state
  → Application continues — NEVER blocked
```

## Error Reasons

| Error | User Message |
|-------|-------------|
| `INVALID_KEY` | The license key is invalid or malformed. |
| `KEY_IN_USE` | This license key has reached its maximum device limit. |
| `KEY_EXPIRED` | This license key has expired. |
| `KEY_REVOKED` | This license key has been revoked. |
| `NETWORK_ERROR` | Unable to connect to the license server. Please try again later. |
| `OFFLINE` | Activation requires an internet connection. |
| `DEVICE_MISMATCH` | This license is not valid for this device. |
| `UNKNOWN` | An unexpected error occurred during activation. |

## Grace Period

- **Duration:** 30 days after license expiry
- **Trigger:** License expiry date has passed
- **Behavior:** Application continues with Pro features
- **End:** Grace period expires → revert to Free edition
- **Server unavailable:** Application continues working (offline validation)
- **Never blocks startup:** Application always starts regardless of server or license state

## What Is NOT Implemented

- No HTTP client for server communication
- No server URL configured
- No mock/fake responses
- No trial activation
- No automatic device seat management

## What IS Implemented

- Clean `IActivationService` interface
- Offline validation logic (`validateOffline()`)
- 30-day grace period calculation
- Error reason constants for UI display
- Configuration with sensible defaults
- Complete activation UI with all required buttons
