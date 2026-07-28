/**
 * Startup Impact Calculator — estimates the impact of each
 * startup entry on boot performance.
 *
 * Calculates:
 *   • Impact level (Low, Medium, High, Very High)
 *   • Estimated boot delay (ms)
 *   • CPU usage during startup (%)
 *   • Memory usage at startup (bytes)
 *   • Disk activity during startup (0–100)
 *   • Confidence in each estimate (0–1)
 *
 * The calculator uses heuristics based on:
 *   • Known application categories (browsers, updaters, etc.)
 *   • Publisher information
 *   • Command line patterns
 *   • Raw boot impact data from the RPC service (if available)
 */
import type { StartupEntry, StartupImpact, ImpactLevel } from './types';

/**
 * Known high-impact application name patterns.
 */
const HIGH_IMPACT_PATTERNS: readonly string[] = [
  'chrome',
  'firefox',
  'edge',
  'opera',
  'brave',
  'spotify',
  'discord',
  'slack',
  'teams',
  'skype',
  'zoom',
  'onedrive',
  'dropbox',
  'icloud',
  'googledrive',
  'steam',
  'epic',
  'origin',
  'battle.net',
  'nvidia',
  'amd',
  'razer',
  'corsair',
  'logitech',
];

/**
 * Known very high-impact application patterns.
 */
const VERY_HIGH_IMPACT_PATTERNS: readonly string[] = [
  'antivirus',
  'avast',
  'avg',
  'kaspersky',
  'norton',
  'mcafee',
  'bitdefender',
  'malwarebytes',
  'java',
  'adobe',
  'creative cloud',
  'autodesk',
];

/**
 * Known low-impact application patterns.
 */
const LOW_IMPACT_PATTERNS: readonly string[] = [
  'windows defender',
  'securityhealth',
  'ctfmon',
  'fontdrvhost',
  'dwm',
  'explorer',
  'runtimebroker',
  'sihost',
  'taskhostw',
  'searchhost',
  'startmenu',
];

/**
 * Estimate memory usage based on application type.
 */
function estimateMemory(name: string): number {
  const lower = name.toLowerCase();
  if (HIGH_IMPACT_PATTERNS.some((p) => lower.includes(p))) {
    return 80 * 1024 * 1024; // ~80MB
  }
  if (VERY_HIGH_IMPACT_PATTERNS.some((p) => lower.includes(p))) {
    return 150 * 1024 * 1024; // ~150MB
  }
  if (LOW_IMPACT_PATTERNS.some((p) => lower.includes(p))) {
    return 10 * 1024 * 1024; // ~10MB
  }
  return 30 * 1024 * 1024; // ~30MB default
}

/**
 * Estimate CPU usage based on application type.
 */
function estimateCpuUsage(name: string): number {
  const lower = name.toLowerCase();
  if (VERY_HIGH_IMPACT_PATTERNS.some((p) => lower.includes(p))) return 25;
  if (HIGH_IMPACT_PATTERNS.some((p) => lower.includes(p))) return 15;
  if (LOW_IMPACT_PATTERNS.some((p) => lower.includes(p))) return 2;
  return 5;
}

/**
 * Estimate disk activity based on application type.
 */
function estimateDiskActivity(name: string): number {
  const lower = name.toLowerCase();
  if (VERY_HIGH_IMPACT_PATTERNS.some((p) => lower.includes(p))) return 70;
  if (HIGH_IMPACT_PATTERNS.some((p) => lower.includes(p))) return 40;
  if (LOW_IMPACT_PATTERNS.some((p) => lower.includes(p))) return 5;
  return 15;
}

/**
 * Estimate boot delay based on impact level and application type.
 */
function estimateBootDelay(name: string, level: ImpactLevel, rawDelayMs: number): number {
  // If we have raw delay data from the RPC service, use it
  if (rawDelayMs > 0) return rawDelayMs;

  const lower = name.toLowerCase();
  switch (level) {
    case 'very_high':
      return 3000 + (VERY_HIGH_IMPACT_PATTERNS.some((p) => lower.includes(p)) ? 1000 : 0);
    case 'high':
      return 1500 + (HIGH_IMPACT_PATTERNS.some((p) => lower.includes(p)) ? 500 : 0);
    case 'medium':
      return 500;
    case 'low':
      return 100;
    default:
      return 50;
  }
}

/**
 * Calculate confidence based on available data.
 */
function calculateConfidence(entry: StartupEntry): number {
  let confidence = 0.5;
  if (entry.estimatedBootDelayMs > 0) confidence += 0.2;
  if (entry.publisher) confidence += 0.1;
  if (entry.signatureStatus !== 'unknown') confidence += 0.1;
  if (entry.executablePath) confidence += 0.1;
  return Math.min(1, confidence);
}

export class StartupImpactCalculator {
  /**
   * Calculate the impact for a single entry.
   */
  calculate(entry: StartupEntry): StartupImpact {
    const lower = entry.name.toLowerCase();

    // Determine impact level
    let level: ImpactLevel = entry.impactLevel;
    if (level === 'none') {
      if (VERY_HIGH_IMPACT_PATTERNS.some((p) => lower.includes(p))) {
        level = 'very_high';
      } else if (HIGH_IMPACT_PATTERNS.some((p) => lower.includes(p))) {
        level = 'high';
      } else if (LOW_IMPACT_PATTERNS.some((p) => lower.includes(p))) {
        level = 'low';
      } else {
        level = 'medium';
      }
    }

    const bootDelayMs = estimateBootDelay(entry.name, level, entry.estimatedBootDelayMs);
    const cpuUsage = estimateCpuUsage(entry.name);
    const memoryBytes = estimateMemory(entry.name);
    const diskActivity = estimateDiskActivity(entry.name);
    const confidence = calculateConfidence(entry);

    const explanation = this._generateExplanation(entry.name, level, bootDelayMs);

    return {
      entryId: entry.id,
      level,
      bootDelayMs,
      cpuUsage,
      memoryBytes,
      diskActivity,
      confidence,
      explanation,
    };
  }

  /**
   * Calculate impacts for multiple entries.
   */
  calculateAll(entries: StartupEntry[]): StartupImpact[] {
    return entries.map((e) => this.calculate(e));
  }

  /**
   * Calculate total boot impact from all enabled entries.
   */
  calculateTotalBootImpact(entries: StartupEntry[]): number {
    const enabled = entries.filter((e) => e.enabled);
    const impacts = this.calculateAll(enabled);
    return impacts.reduce((sum, impact) => sum + impact.bootDelayMs, 0);
  }

  /**
   * Generate a human-readable explanation for the impact.
   */
  private _generateExplanation(name: string, level: ImpactLevel, bootDelayMs: number): string {
    const delayStr = bootDelayMs < 1000
      ? `${Math.round(bootDelayMs)} ms`
      : `${(bootDelayMs / 1000).toFixed(1)} sec`;

    switch (level) {
      case 'very_high':
        return `"${name}" has a very high impact on boot time, adding approximately ${delayStr} to startup.`;
      case 'high':
        return `"${name}" has a high impact on boot time, adding approximately ${delayStr} to startup.`;
      case 'medium':
        return `"${name}" has a moderate impact on boot time, adding approximately ${delayStr} to startup.`;
      case 'low':
        return `"${name}" has a low impact on boot time, adding approximately ${delayStr} to startup.`;
      default:
        return `"${name}" has minimal impact on boot time.`;
    }
  }
}

/**
 * Default singleton instance.
 */
export const startupImpactCalculator = new StartupImpactCalculator();
