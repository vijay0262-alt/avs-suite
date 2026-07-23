# Activation Design

**AVS PC Optimizer** — Commercial Licensing Foundation  
**Version:** 1.0.0 | **Date:** 2026-07-23

---

## Overview

The activation service handles the license lifecycle: activation, deactivation, validation, and refresh. Per the user's directive, **no mock implementations are provided**. Clean interfaces are defined here. The concrete implementation will be provided when the real license server is built.

## Interface

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

## Configuration

```typescript
interface ActivationConfig {
  serverUrl?: string;      // License server API URL (undefined = offline)
  timeoutMs: number;       // Request timeout (default: 10000)
  maxRetries: number;      // Network retry count (default: 3)
  gracePeriodDays: number; // Grace period after expiry (default: 14)
  trialDurationDays: number; // Trial length (default: 30)
}
```

## Activation Flow (Future)

```
User enters key + email
  → LicenseManager.activate(key, email)
  → IActivationService.activate(key, deviceId, email)
  → POST {serverUrl}/activate
    Body: { key, deviceId, email }
    Response: { license: LicenseModel } | { error: string }
  → On success:
    → storage.write(license)
    → emit license_activated event
    → emit edition_changed event
  → On failure:
    → return ActivationResult { success: false, error }
```

## Deactivation Flow (Future)

```
User clicks Deactivate
  → LicenseManager.deactivate()
  → IActivationService.deactivate(licenseId, deviceId)
  → POST {serverUrl}/deactivate
    Body: { licenseId, deviceId }
  → On success:
    → storage.remove()
    → emit license_deactivated event
    → emit edition_changed event (pro → free)
```

## Validation Flow (Offline)

```
LicenseManager.validate()
  → validateOffline(license, config, now)
  → Check state (not invalid/revoked)
  → Check expiry date
  → If expired + grace: return grace_period
  → If expired + no grace: return expired
  → Else: return current state
```

## Refresh Flow

```
LicenseManager.refresh()
  → IActivationService.refresh(license)
  → If online (future):
    → POST {serverUrl}/validate
    → Update license data
    → return ValidationResult
  → If offline:
    → Fallback to validateOffline()
    → return ValidationResult
```

## Error Reasons

| Error | Description |
|-------|-------------|
| `INVALID_KEY` | License key is invalid or malformed |
| `KEY_IN_USE` | Key has reached max device limit |
| `KEY_EXPIRED` | Key has expired |
| `KEY_REVOKED` | Key has been revoked |
| `NETWORK_ERROR` | Cannot reach server |
| `OFFLINE` | Activation requires internet |
| `DEVICE_MISMATCH` | License not valid for this device |
| `UNKNOWN` | Unexpected error |

## Offline Mode

The application must **never refuse to start** because the server is unreachable. Offline behavior:

1. **Startup:** Load cached license from encrypted storage. Validate locally.
2. **Grace period:** If license has expired but grace period is active, continue with Pro features.
3. **Grace expiry:** If grace period has ended, revert to Free edition.
4. **No license:** If no cached license, start in Free edition.
5. **Future online:** When server becomes available, `refresh()` will sync license data.

## What Is NOT Implemented

- No HTTP client
- No server URL configuration
- No mock responses
- No trial activation
- No device seat management

## What IS Implemented

- Clean `IActivationService` interface
- Offline validation logic (`validateOffline()`)
- Grace period calculation
- Error reason constants for UI display
- Configuration structure with sensible defaults
