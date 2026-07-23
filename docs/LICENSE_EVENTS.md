# License Events

**AVS PC Optimizer** — Commercial Licensing Foundation  
**Version:** 1.0.0 | **Date:** 2026-07-23

---

## Overview

The licensing subsystem emits typed events that enable decoupled reactions. The UI can show notifications, the telemetry layer can log, and the feature manager can re-evaluate — all without direct coupling to the LicenseManager.

## Event Types

| Event Type | Trigger | Context |
|------------|---------|---------|
| `application_started` | LicenseManager.initialize() called | — |
| `license_activated` | Successful activation | licenseId, previousState, newState |
| `license_deactivated` | Successful deactivation | previousState, newState |
| `license_expired` | License past expiry and grace | previousState, newState, detail |
| `license_refreshed` | Refresh completed | previousState, newState |
| `license_validated` | Validation completed | previousState, newState |
| `edition_changed` | Edition changed (free→pro etc.) | previousEdition, newEdition |
| `grace_started` | License entered grace period | previousState, newState, detail |
| `grace_ended` | Grace period ended | previousState, newState |
| `license_invalid` | License marked invalid | — |
| `license_revoked` | License revoked | — |
| `storage_error` | Storage read/write failed | detail |
| `device_id_changed` | Device fingerprint changed | — |

## Event Structure

```typescript
interface LicenseEvent {
  type: LicenseEventType;
  timestamp: string;         // ISO-8601 UTC
  previousState?: string;
  newState?: string;
  previousEdition?: string;
  newEdition?: string;
  detail?: string;
  licenseId?: string;
}
```

## Event Emitter

```typescript
class LicenseEventEmitter {
  on(type: LicenseEventType, listener: LicenseEventListener): () => void;
  onAll(listener: LicenseEventListener): () => void;
  emit(event: LicenseEvent): void;
  clear(): void;
}
```

### Features
- **Type-safe:** Each event type is a string literal in a union type
- **Error-isolated:** Listener errors are swallowed (do not propagate to emitter)
- **Unsubscribe:** Both `on()` and `onAll()` return unsubscribe functions
- **No dependencies:** Pure TypeScript, no external libraries

## Usage

### Subscribing to Events

```typescript
const unsub = licenseManager.onEvent((event) => {
  switch (event.type) {
    case 'license_activated':
      showNotification('License activated successfully!');
      break;
    case 'license_expired':
      showNotification('Your license has expired.');
      break;
    case 'grace_started':
      showWarning(`Grace period: ${event.detail}`);
      break;
  }
});

// Later: unsubscribe
unsub();
```

### Subscribing to Specific Events

```typescript
const emitter = new LicenseEventEmitter();
emitter.on('edition_changed', (event) => {
  console.log(`Edition changed: ${event.previousEdition} → ${event.newEdition}`);
});
```

### React Integration

The `LicenseProvider` in the frontend automatically subscribes to all license events and re-renders the context when any event fires. This means any component using `useLicense()` will automatically reflect state changes.

## Event Flow

```
LicenseManager.activate()
  → IActivationService.activate()
  → storage.write()
  → EventEmitter.emit('license_activated')
  → EventEmitter.emit('edition_changed')
  → React LicenseProvider re-renders
  → UI updates with new edition
```
