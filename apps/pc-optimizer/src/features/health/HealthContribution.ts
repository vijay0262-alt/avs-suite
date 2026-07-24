/**
 * Health Contribution — modular health score interface.
 *
 * Every optimization module exposes a HealthContribution. The
 * HealthScoreService aggregates all contributions to produce the
 * overall health score. Future modules (Driver Updater, Antivirus,
 * VPN, Backup) can register without changing Dashboard logic.
 */

export type ModuleId =
  | 'junk'
  | 'registry'
  | 'startup'
  | 'privacy'
  | 'duplicate'
  | 'performance'
  | 'disk'
  | 'security'
  | 'system'
  // Future modules — automatically participate in health score, dashboard,
  // optimization summary, and recommendations without Dashboard changes.
  | 'driver-updater'
  | 'antivirus'
  | 'vpn'
  | 'backup'
  | 'file-recovery'
  | 'browser-cleaner'
  | 'disk-defragmenter'
  | 'network-optimizer'
  | 'memory-optimizer'
  | 'battery-optimizer';

export interface HealthContribution {
  /** Unique module identifier. */
  moduleId: ModuleId;
  /** Human-readable module name for display. */
  moduleName: string;
  /** Current penalty (0–100). The amount this module currently detracts from the health score. */
  currentPenalty: number;
  /** Maximum possible penalty for this module. */
  maxPenalty: number;
  /** Penalty that has been resolved (e.g. by cleaning). */
  resolvedPenalty: number;
  /** Human-readable detail string for the current state. */
  detail: string;
  /** Whether this module can be auto-fixed. */
  canAutoFix: boolean;
  /** Navigation path to the module's page. */
  actionPath: string;
}

/**
 * A provider that can compute its own health contribution.
 * Modules implement this to supply real measured data.
 */
export interface HealthContributionProvider {
  /** Returns the current health contribution for this module. */
  getContribution(): Promise<HealthContribution>;
}

/**
 * Clamp a value to [min, max].
 */
export function clampHealth(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}
