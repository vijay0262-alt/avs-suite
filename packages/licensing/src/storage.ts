/**
 * License Storage — encrypted, tamper-resistant, versioned local storage.
 *
 * Design:
 * - License data is serialized to JSON, then encrypted with AES-256-GCM
 *   using a machine-bound key derived from the device fingerprint.
 * - The encrypted blob is stored as a binary file on disk.
 * - A version header enables future migration without re-activation.
 * - A SHA-256 integrity hash detects tampering.
 * - No plain-text license keys are ever written to disk.
 *
 * The concrete file I/O implementation lives in the Electron main
 * process. This module defines the interface and the serialization
 * format.
 */
import type { LicenseModel } from './model';
import { CURRENT_FORMAT_VERSION } from './model';

/**
 * Encrypted storage envelope.
 * This is what gets written to disk.
 */
export interface StorageEnvelope {
  /** Magic header for file identification. */
  magic: 'AVSLIC';
  /** Storage format version. */
  version: number;
  /** Encryption algorithm identifier. */
  cipher: 'aes-256-gcm';
  /** IV (initialization vector) as base64. */
  iv: string;
  /** Encrypted payload as base64. */
  ciphertext: string;
  /** GCM authentication tag as base64. */
  tag: string;
  /** SHA-256 of the decrypted payload (integrity check). */
  checksum: string;
  /** ISO-8601 UTC timestamp of last write. */
  writtenAt: string;
}

/**
 * Interface for the license storage backend.
 * The concrete implementation uses Node.js crypto + fs in the
 * Electron main process.
 */
export interface ILicenseStorage {
  /** Read and decrypt the stored license. Returns null if no license stored. */
  read(): Promise<LicenseModel | null>;

  /** Encrypt and write the license to disk. */
  write(license: LicenseModel): Promise<void>;

  /** Delete the stored license file. */
  remove(): Promise<void>;

  /** Check if a license file exists. */
  exists(): Promise<boolean>;

  /** Get the storage format version without decrypting. */
  getVersion(): Promise<number | null>;
}

/**
 * Storage error types for precise error handling.
 */
export type StorageErrorType =
  | 'not_found'
  | 'corrupted'
  | 'tampered'
  | 'decryption_failed'
  | 'version_unsupported'
  | 'io_error';

export class LicenseStorageError extends Error {
  constructor(
    public readonly type: StorageErrorType,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'LicenseStorageError';
  }
}

/**
 * Serialize a LicenseModel to the storage envelope format (pre-encryption).
 * The concrete implementation handles the actual encryption.
 */
export function serializeLicense(license: LicenseModel): string {
  return JSON.stringify({
    ...license,
    formatVersion: CURRENT_FORMAT_VERSION,
  });
}

/**
 * Deserialize a decrypted JSON string back to a LicenseModel.
 * Validates the format version and required fields.
 */
export function deserializeLicense(json: string): LicenseModel {
  const parsed = JSON.parse(json) as Record<string, unknown>;

  if (parsed.formatVersion !== CURRENT_FORMAT_VERSION) {
    throw new LicenseStorageError(
      'version_unsupported',
      `Unsupported storage format version: ${parsed.formatVersion}. Expected ${CURRENT_FORMAT_VERSION}.`,
    );
  }

  const required = [
    'licenseId', 'licenseKey', 'state', 'edition',
    'activationDate', 'expiryDate', 'maxDevices', 'activatedDevices',
    'email', 'deviceId', 'lastValidation', 'graceExpiry', 'formatVersion',
  ];

  for (const field of required) {
    if (!(field in parsed)) {
      throw new LicenseStorageError(
        'corrupted',
        `Missing required field: ${field}`,
      );
    }
  }

  return parsed as unknown as LicenseModel;
}

/**
 * Compute a SHA-256 checksum of the serialized license for integrity verification.
 */
export async function computeChecksum(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
