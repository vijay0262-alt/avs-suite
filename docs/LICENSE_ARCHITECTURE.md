# License Architecture

**AVS PC Optimizer** — Commercial Licensing Foundation  
**Version:** 1.0.0 | **Date:** 2026-07-23

---

## Overview

The licensing architecture is designed as a completely isolated subsystem that can be added to the application without touching any existing optimization modules, dashboard, health engine, or RPC architecture.

## Design Principles

1. **Isolation:** All licensing code lives in `@avs/licensing` package and `features/licensing/` in the frontend. No existing module imports licensing directly.
2. **Interface-first:** Clean interfaces are defined for all services. No mock/fake implementations — concrete implementations will be provided when the real license server is built.
3. **Offline-first:** The application must never refuse to start because a server is unreachable. All validation can happen locally.
4. **Feature Manager pattern:** Every premium feature check goes through `FeatureManager.has(feature)`. No direct license checks in modules.
5. **Event-driven:** License state changes emit typed events that the UI and other subsystems can observe.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Application                          │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Feature     │  │ License      │  │ Edition       │  │
│  │ Manager     │  │ Manager      │  │ Manager (UI)  │  │
│  │ .has(feat)  │  │ (orchestrator)│  │ (React ctx)   │  │
│  └──────┬──────┘  └──────┬───────┘  └───────────────┘  │
│         │                │                              │
│         │     ┌──────────┼──────────┐                  │
│         │     │          │          │                   │
│         ▼     ▼          ▼          ▼                   │
│  ┌──────────┐ ┌────────┐ ┌──────┐ ┌────────┐           │
│  │ Feature  │ │Storage │ │Activ.│ │Device  │           │
│  │ Flags    │ │(encrypt)│ │Svc   │ │ID Prov │           │
│  │ Registry │ └────────┘ └──────┘ └────────┘           │
│  └──────────┘                                           │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │              License Event Emitter               │   │
│  │  (application_started, license_activated, ...)  │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Package Structure

```
packages/licensing/src/
├── index.ts          # Barrel — re-exports all public APIs
├── legacy.ts         # Backward-compat: ILicensingService, NullLicensingService
├── states.ts         # License states (FREE, TRIAL, MONTHLY, ...)
├── model.ts          # LicenseModel, LicenseView, ValidationResult
├── events.ts         # LicenseEventEmitter, typed events
├── featureManager.ts # FeatureManager.has(feature) pattern
├── manager.ts        # LicenseManager — centralized orchestrator
├── storage.ts        # ILicenseStorage — encrypted, versioned storage
├── activation.ts     # IActivationService — interfaces only
├── deviceId.ts       # IDeviceIdProvider — anonymous fingerprint
├── offline.ts        # Offline validation, grace period logic
└── *.test.ts         # Automated tests
```

## Frontend Integration

```
apps/pc-optimizer/src/features/licensing/
├── LicenseContext.tsx    # React context for ILicenseManager
└── ActivationPage.tsx    # License activation/deactivation UI
```

## Data Flow

### Application Startup
1. Electron main process creates concrete `ILicenseStorage`, `IActivationService`, `IDeviceIdProvider`
2. `LicenseManager` is constructed with these dependencies
3. `LicenseManager.initialize()` loads cached license from encrypted storage
4. Offline validation determines effective state (active, grace, expired, free)
5. `FeatureManager` is created with the resolved state
6. React `LicenseProvider` wraps the app, providing license state to all components

### Feature Check
```
Module → FeatureManager.has('privacy_cleaner')
       → isFeatureAvailableForState('privacy_cleaner', currentState)
       → stateToEdition(currentState)
       → @avs/shared/featureFlags.isFeatureEnabled(featureKey, edition)
       → boolean
```

### License Activation (Future)
1. User enters license key + email in ActivationPage
2. `LicenseManager.activate(key, email)` is called
3. `IActivationService.activate()` contacts license server (future)
4. On success, `LicenseModel` is persisted to encrypted storage
5. License events are emitted (license_activated, edition_changed)
6. React context updates, UI re-renders with new edition

## What Is NOT Implemented

- No payment processing
- No online activation server
- No mock/fake license responses
- No automatic updates
- No telemetry

## What IS Implemented

- Complete type system for licenses, states, events
- Feature Manager with `has()` pattern
- License Manager orchestrator (concrete class, needs real dependencies)
- Encrypted storage interface and serialization format
- Activation service interface (clean, unimplemented)
- Device ID interface and pure derivation function
- Offline validation with grace period support
- React context and activation UI
- Comprehensive test suite
