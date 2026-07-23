# License Storage

**AVS PC Optimizer** — Commercial Licensing Foundation  
**Version:** 1.0.0 | **Date:** 2026-07-23

---

## Overview

License storage uses encrypted, tamper-resistant, versioned local storage. No plain-text license keys are ever written to disk.

## Design

### Encryption
- **Algorithm:** AES-256-GCM (authenticated encryption)
- **Key derivation:** Machine-bound key derived from the device fingerprint
- **IV:** Unique per write operation (random 12 bytes)
- **Authentication tag:** GCM tag verifies integrity on read

### Tamper Resistance
- SHA-256 checksum of the decrypted payload is stored in the envelope
- On read, the checksum is verified after decryption
- If the checksum does not match, a `LicenseStorageError` with type `tampered` is thrown
- GCM authentication tag also detects modification of the ciphertext

### Versioned Format
- Each storage envelope includes a `version` field
- The current format version is `1` (defined in `CURRENT_FORMAT_VERSION`)
- Future schema changes increment the version and add migration logic
- The `getVersion()` method reads the version without decrypting, enabling pre-migration checks

## Storage Envelope

```typescript
interface StorageEnvelope {
  magic: 'AVSLIC';           // File identification header
  version: number;            // Format version (currently 1)
  cipher: 'aes-256-gcm';     // Cipher identifier
  iv: string;                 // Base64-encoded initialization vector
  ciphertext: string;         // Base64-encoded encrypted payload
  tag: string;                // Base64-encoded GCM auth tag
  checksum: string;           // SHA-256 of decrypted payload
  writtenAt: string;          // ISO-8601 UTC timestamp
}
```

## File Location

The license file is stored in the application's userData directory:
```
%APPDATA%\@avs\pc-optimizer\license\license.dat
```

## Interface

```typescript
interface ILicenseStorage {
  read(): Promise<LicenseModel | null>;
  write(license: LicenseModel): Promise<void>;
  remove(): Promise<void>;
  exists(): Promise<boolean>;
  getVersion(): Promise<number | null>;
}
```

The concrete implementation uses Node.js `crypto` and `fs` modules in the Electron main process. It is injected into the `LicenseManager` at bootstrap.

## Error Handling

```typescript
type StorageErrorType =
  | 'not_found'       // No license file exists
  | 'corrupted'       // File exists but data is invalid
  | 'tampered'        // Checksum mismatch (intentional modification)
  | 'decryption_failed' // Decryption failed (wrong key or corrupted)
  | 'version_unsupported' // Future version not yet supported
  | 'io_error';       // Filesystem error
```

## Migration Strategy

When the storage format changes:

1. Increment `CURRENT_FORMAT_VERSION` in `model.ts`
2. Add a migration function in the concrete storage implementation
3. On `read()`, check the file version before decrypting
4. If version > current, run migration to transform old format to new
5. Write the migrated license back to disk
6. Return the migrated `LicenseModel`

## Security Considerations

- The encryption key is derived from the device fingerprint, which is a SHA-256 hash of non-personal hardware identifiers
- The key is never stored on disk — it is recomputed at runtime
- An attacker cannot decrypt the license file by copying it to another machine (different device fingerprint)
- The GCM authentication tag prevents bit-flipping attacks on the ciphertext
- The SHA-256 checksum provides a second layer of integrity verification
