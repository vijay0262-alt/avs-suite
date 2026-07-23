/**
 * Device ID — anonymous, stable, non-personal device fingerprint.
 *
 * Requirements satisfied:
 * - Stable: same device produces the same ID across reboots
 * - Anonymous: no MAC address, no user name, no personal data
 * - Non-personal: derived from hardware constants only
 *
 * The fingerprint is a SHA-256 hash of:
 *   - Machine GUID (Windows registry, non-personal)
 *   - Processor architecture
 *   - OS version
 *   - Computer name (not user name)
 *
 * The resulting hash is non-reversible and cannot identify a person.
 */

/**
 * Interface for device fingerprint generation.
 * The concrete implementation lives in the Electron main process
 * where Node.js APIs are available.
 */
export interface IDeviceIdProvider {
  /** Generate or retrieve the stable anonymous device ID. */
  getDeviceId(): Promise<string>;
  /** Check if the device ID has changed since last call (rare). */
  hasChanged(): Promise<boolean>;
}

/**
 * Pure function to derive a device fingerprint from raw hardware values.
 * This is used by the concrete implementation and in tests.
 *
 * @param machineGuid - Windows HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid
 * @param processorArch - e.g., "x64", "arm64"
 * @param osVersion - e.g., "10.0.22631"
 * @param computerName - Windows COMPUTERNAME env var (machine name, not user)
 * @returns A 64-character hex string (SHA-256)
 */
export async function deriveDeviceId(
  machineGuid: string,
  processorArch: string,
  osVersion: string,
  computerName: string,
): Promise<string> {
  const input = [machineGuid, processorArch, osVersion, computerName].join('|');
  // Use Web Crypto API (available in both browser and Node 18+)
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Validate that a device ID is a well-formed 64-char hex string.
 */
export function isValidDeviceId(id: string): boolean {
  return /^[0-9a-f]{64}$/.test(id);
}
