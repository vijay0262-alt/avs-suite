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

/**
 * Format data sizes for user-facing display.
 * - If size > 1000 MB, show in GB with 2 decimal places.
 * - If size > 100 MB, show in MB with 1 decimal place.
 * - Otherwise show in MB with 2-3 significant digits.
 */
export function formatDataSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb > 1000) {
    const gb = mb / 1024;
    return `${gb.toFixed(2)} GB`;
  }
  if (mb >= 100) {
    return `${mb.toFixed(1)} MB`;
  }
  if (mb >= 10) {
    return `${mb.toFixed(1)} MB`;
  }
  return `${mb.toFixed(2)} MB`;
}

/** Round a score to an integer (2-digit max, e.g. 88 not 88.333). */
export function roundScore(score: number): number {
  return Math.round(score);
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
