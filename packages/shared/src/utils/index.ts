/**
 * Pure utility helpers. Zero runtime dependencies.
 */

/** Format bytes with binary units (KiB, MiB, ...). */
export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)) - 1);
  const value = bytes / Math.pow(1024, i + 1);
  return `${value.toFixed(decimals)} ${units[i]}`;
}

/** Clamp a number to [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Return a promise that resolves after `ms` milliseconds. */
export function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Assert an unreachable branch (compile-time exhaustiveness). */
export function assertNever(x: never, message = 'Unreachable'): never {
  throw new Error(`${message}: ${JSON.stringify(x)}`);
}
