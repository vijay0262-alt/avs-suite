# License Model

**AVS PC Optimizer** — Commercial Licensing Foundation  
**Version:** 1.0.0 | **Date:** 2026-07-23

---

## Overview

The License Model is the canonical data structure representing a license. It contains every field needed for offline validation, grace period calculation, device management, and UI display.

## LicenseModel

```typescript
interface LicenseModel {
  licenseId: string;          // UUID v4, server-assigned
  licenseKey: string;         // User-supplied key (encrypted at rest)
  state: LicenseState;        // Current state
  edition: 'pro' | 'enterprise';
  activationDate: string;     // ISO-8601 UTC
  expiryDate: string | null;  // ISO-8601 UTC, null for lifetime
  maxDevices: number;         // Max allowed devices
  activatedDevices: number;   // Currently activated (server-reported)
  email: string;              // Licensee email
  deviceId: string;           // Anonymous device fingerprint
  lastValidation: string;     // ISO-8601 UTC
  graceExpiry: string | null; // ISO-8601 UTC, null if not in grace
  formatVersion: number;      // Storage format version
}
```

## LicenseView (UI-Safe)

```typescript
interface LicenseView {
  licenseId: string;
  state: LicenseState;
  edition: 'pro' | 'enterprise';
  activationDate: string;
  expiryDate: string | null;
  maxDevices: number;
  activatedDevices: number;
  email: string;
  deviceId: string;
  lastValidation: string;
  graceExpiry: string | null;
  hasKey: boolean;            // True if key present (key itself NOT included)
}
```

The `toLicenseView()` function converts a `LicenseModel` to a `LicenseView`, stripping the `licenseKey` field. UI components must only use `LicenseView`.

## License States

| State | Description | Edition |
|-------|-------------|---------|
| `free` | No license activated | free |
| `trial` | Trial period active | trial |
| `monthly` | Monthly subscription active | pro |
| `annual` | Annual subscription active | pro |
| `lifetime` | Lifetime license active | pro |
| `expired` | License expired, no grace | free |
| `invalid` | License data corrupt or invalid | free |
| `revoked` | License revoked by server | free |
| `grace_period` | Expired but within grace window | pro |

## Validation Result

```typescript
interface ValidationResult {
  valid: boolean;
  state: LicenseState;
  reason?: string;
  graceExpiry?: string | null;
}
```

## Activation Result

```typescript
interface ActivationResult {
  success: boolean;
  license?: LicenseModel;
  error?: string;
}
```

## Deactivation Result

```typescript
interface DeactivationResult {
  success: boolean;
  error?: string;
}
```

## State Machine

```
                 ┌──────────┐
                 │   FREE   │◄──────────────────────┐
                 └────┬─────┘                       │
                      │ activate()                  │
                      ▼                             │
              ┌──────────────┐                      │
              │    TRIAL     │                      │
              │  MONTHLY     │── expiry ──► EXPIRED │
              │  ANNUAL      │              │       │
              │  LIFETIME    │              │ grace │
              └──────────────┘              ▼       │
                                   ┌──────────────┐ │
                                   │ GRACE_PERIOD │─┤
                                   └──────┬───────┘ │
                                          │ grace   │
                                          │ ends    │
                                          ▼         │
                                   ┌──────────────┐ │
                                   │   EXPIRED    │─┘
                                   └──────────────┘
                                   
  Any state ──► INVALID (corrupt data)
  Any state ──► REVOKED (server revocation)
  Any state ──► FREE (deactivate)
```

## Format Versioning

The `formatVersion` field enables schema evolution. When the model changes:

1. Increment `CURRENT_FORMAT_VERSION`
2. Add migration logic in the storage layer
3. Old licenses are automatically migrated on read
