/**
 * VersionComparator — semantic version comparison.
 *
 * Parses version strings like "1.2.3" into major.minor.patch
 * and provides comparison utilities.
 *
 * Supports:
 *   - Major, Minor, Patch comparison
 *   - Pre-release suffixes (e.g. "1.0.0-beta.1")
 *   - Build metadata (ignored for comparison)
 *
 * Examples:
 *   1.0.1 > 1.0.0
 *   1.2.0 > 1.1.9
 *   2.0.0 > 1.9.9
 */

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  /** Pre-release identifier (e.g. "beta.1") or null for stable. */
  prerelease: string | null;
  /** Build metadata (ignored for comparison). */
  build: string | null;
  /** Original version string. */
  raw: string;
}

/**
 * Parse a version string into a SemVer object.
 * Throws if the string is not a valid semver.
 */
export function parseVersion(version: string): SemVer {
  const raw = version.trim();

  // Strip leading 'v' if present
  const cleaned = raw.startsWith('v') ? raw.slice(1) : raw;

  // Split build metadata
  const buildSplit = cleaned.split('+');
  const withoutBuild = buildSplit[0] ?? cleaned;
  const build = buildSplit[1] ?? null;
  const buildMeta = build ?? null;

  // Split pre-release
  const prereleaseSplit = withoutBuild.split('-');
  const core = prereleaseSplit[0] ?? withoutBuild;
  const prerelease = prereleaseSplit.slice(1).join('-') || null;
  const prereleaseMeta = prerelease ?? null;

  const parts = core.split('.');
  if (parts.length < 1 || parts.length > 3) {
    throw new Error(`Invalid version string: "${version}"`);
  }

  const major = parseInt(parts[0] ?? '0', 10);
  const minor = parts.length > 1 ? parseInt(parts[1] ?? '0', 10) : 0;
  const patch = parts.length > 2 ? parseInt(parts[2] ?? '0', 10) : 0;

  if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
    throw new Error(`Invalid version string: "${version}"`);
  }

  if (major < 0 || minor < 0 || patch < 0) {
    throw new Error(`Invalid version string: "${version}"`);
  }

  return {
    major,
    minor,
    patch,
    prerelease: prereleaseMeta,
    build: buildMeta,
    raw,
  };
}

/**
 * Compare two pre-release strings.
 * A version with a pre-release is lower than the same version without.
 * Pre-release identifiers are compared lexically.
 */
function comparePrerelease(a: string | null, b: string | null): number {
  // No prerelease = higher priority (stable > prerelease)
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;

  // Compare dot-separated identifiers
  const aParts = a.split('.');
  const bParts = b.split('.');
  const maxLen = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < maxLen; i++) {
    const aPart = aParts[i] ?? '';
    const bPart = bParts[i] ?? '';
    if (aPart === bPart) continue;

    // Try numeric comparison first
    const aNum = parseInt(aPart, 10);
    const bNum = parseInt(bPart, 10);
    const aIsNum = !isNaN(aNum) && aPart === String(aNum);
    const bIsNum = !isNaN(bNum) && bPart === String(bNum);

    if (aIsNum && bIsNum) {
      return aNum - bNum;
    }
    if (aIsNum) return -1; // numeric < non-numeric
    if (bIsNum) return 1;

    return aPart < bPart ? -1 : 1;
  }

  if (aParts.length < bParts.length) return -1;
  if (aParts.length > bParts.length) return 1;
  return 0;
}

/**
 * Compare two SemVer objects.
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
export function compareVersions(a: SemVer, b: SemVer): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  return comparePrerelease(a.prerelease, b.prerelease);
}

/**
 * Check if version `a` is newer than version `b`.
 */
export function isNewer(a: string, b: string): boolean {
  return compareVersions(parseVersion(a), parseVersion(b)) > 0;
}

/**
 * Check if version `a` is older than version `b`.
 */
export function isOlder(a: string, b: string): boolean {
  return compareVersions(parseVersion(a), parseVersion(b)) < 0;
}

/**
 * Check if two version strings are equal.
 */
export function isEqual(a: string, b: string): boolean {
  return compareVersions(parseVersion(a), parseVersion(b)) === 0;
}

/**
 * Check if version `version` is at least `minimum` (>= minimum).
 */
export function isAtLeast(version: string, minimum: string): boolean {
  return compareVersions(parseVersion(version), parseVersion(minimum)) >= 0;
}

/**
 * Get the newer of two versions.
 */
export function maxVersion(a: string, b: string): string {
  return isNewer(a, b) ? a : b;
}
