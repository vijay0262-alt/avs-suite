# Device ID

**AVS PC Optimizer** — Commercial Licensing Infrastructure  
**Version:** 1.0.0 | **Date:** 2026-07-23

---

## Overview

The Device ID is an anonymous, stable, non-personal fingerprint used to identify a device for license activation count. It does not contain any personally identifiable information.

## Requirements

- **Stable:** Same device produces the same ID across reboots and updates
- **Anonymous:** No MAC address, no user name, no personal data
- **Non-personal:** Derived from hardware constants only
- **One-way:** SHA-256 hash — cannot be reversed to identify a person

## Fingerprint Derivation

The device fingerprint is a SHA-256 hash of:

| Input | Source | Personal? |
|-------|--------|-----------|
| Machine GUID | Windows registry: `HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid` | No |
| Processor Architecture | `process.arch` (e.g., "x64") | No |
| OS Version | `os.release()` (e.g., "10.0.22631") | No |
| Computer Name | `COMPUTERNAME` env var (machine name, not user name) | No |

```
deviceId = SHA-256(machineGuid | processorArch | osVersion | computerName)
```

The resulting 64-character hex string is non-reversible and cannot identify a person.

## Interface

```typescript
interface IDeviceIdProvider {
  getDeviceId(): Promise<string>;
  hasChanged(): Promise<boolean>;
}
```

The concrete implementation lives in the Electron main process where Node.js APIs are available.

## Pure Function

```typescript
async function deriveDeviceId(
  machineGuid: string,
  processorArch: string,
  osVersion: string,
  computerName: string,
): Promise<string>
```

This pure function is exported for testing and can be called without Node.js dependencies. It uses the Web Crypto API (`crypto.subtle.digest`).

## Validation

```typescript
function isValidDeviceId(id: string): boolean
// Returns true if id is a 64-character lowercase hex string
```

## Usage

### At Activation

```
User enters license key + email
  → LicenseManager.activate(key, email)
  → IDeviceIdProvider.getDeviceId()
  → IActivationService.activate(key, deviceId, email)
  → Server counts this device (future)
```

### At Deactivation

```
User clicks Deactivate
  → LicenseManager.deactivate()
  → IDeviceIdProvider.getDeviceId()
  → IActivationService.deactivate(licenseId, deviceId)
  → Server frees this device seat (future)
```

### In Stored License

The device ID is stored in the encrypted `LicenseModel.deviceId` field. On validation, the current device ID can be compared to the stored one to detect device changes.

## Privacy

- **No MAC address** is used or stored
- **No user name** is used or stored
- **No personal data** is collected
- The SHA-256 hash is **one-way** — cannot be reversed
- The device ID is **anonymous** — it identifies a machine, not a person
- The device ID is used **only** for activation count management

## Stability

The device ID is stable across:
- Application restarts
- Windows updates
- Application updates
- User session changes

The device ID may change if:
- The motherboard is replaced (Machine GUID changes)
- Windows is reinstalled (new Machine GUID)
- The computer name is changed

In these cases, the user would need to deactivate on the old device (if possible) and re-activate on the new configuration.

## Testing

The `deriveDeviceId` function is tested with:
- Same inputs → same output (deterministic)
- Different inputs → different outputs
- Output format: 64-character hex string
- `isValidDeviceId` validates format
