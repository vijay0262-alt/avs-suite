/**
 * ChecksumValidator — verifies file integrity using SHA256.
 *
 * Uses the Web Crypto API (crypto.subtle) to compute SHA256 hashes
 * of downloaded files. Compares against the expected hash from the
 * product manifest.
 *
 * If the hash doesn't match, the download is considered corrupted
 * or tampered with, and must be discarded.
 */

export type ChecksumResult =
  | { valid: true; computed: string }
  | { valid: false; computed: string; expected: string; message: string };

/**
 * Compute the SHA256 hash of a Uint8Array using Web Crypto API.
 * Returns the hash as a lowercase hex string.
 */
export async function computeSHA256(data: Uint8Array): Promise<string> {
  const cryptoObj = globalThis.crypto ?? (globalThis as unknown as { crypto?: Crypto }).crypto;
  if (!cryptoObj?.subtle) {
    throw new Error('Web Crypto API (crypto.subtle) is not available in this environment.');
  }
  const hashBuffer = await cryptoObj.subtle.digest('SHA-256', data as BufferSource);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Validate a downloaded file against an expected SHA256 hash.
 *
 * @param data - The downloaded file data
 * @param expectedHash - The expected SHA256 hash (hex string from manifest)
 * @returns ChecksumResult indicating whether the hash matches
 */
export async function validateChecksum(
  data: Uint8Array,
  expectedHash: string,
): Promise<ChecksumResult> {
  const computed = await computeSHA256(data);
  const expected = expectedHash.toLowerCase().trim();

  if (computed === expected) {
    return { valid: true, computed };
  }

  return {
    valid: false,
    computed,
    expected,
    message: `Checksum mismatch: expected ${expected.slice(0, 16)}…, got ${computed.slice(0, 16)}…`,
  };
}

/**
 * Quick check: does the data match the expected hash?
 */
export async function isChecksumValid(data: Uint8Array, expectedHash: string): Promise<boolean> {
  const result = await validateChecksum(data, expectedHash);
  return result.valid;
}
