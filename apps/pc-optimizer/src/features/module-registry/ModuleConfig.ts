/**
 * Centralized Module Configuration (Part 13)
 *
 * Avoids hardcoding module metadata. Centralizes:
 *   - Category display order and labels
 *   - Default health weights
 *   - Default settings
 *   - Display order for modules
 *
 * This makes future maintenance easier — change config, not code.
 */

import type { ModuleCategory } from './moduleRegistry.types';

// ── Category Configuration ──────────────────────────────────────────

export interface CategoryConfig {
  label: string;
  /** Sort order — lower comes first. */
  order: number;
  icon: string;
}

export const CATEGORY_CONFIG: Record<ModuleCategory, CategoryConfig> = {
  cleanup:      { label: 'Cleanup',       order: 1, icon: 'TrashIcon' },
  optimization: { label: 'Optimization',  order: 2, icon: 'CpuChipIcon' },
  privacy:      { label: 'Privacy',       order: 3, icon: 'ShieldCheckIcon' },
  security:     { label: 'Security',      order: 4, icon: 'ShieldExclamationIcon' },
  system:       { label: 'System',        order: 5, icon: 'ComputerDesktopIcon' },
  future:       { label: 'Coming Soon',   order: 6, icon: 'SparklesIcon' },
};

// ── Default Health Weights ──────────────────────────────────────────

export const DEFAULT_HEALTH_WEIGHTS = {
  junk: 30,
  registry: 15,
  startup: 15,
  privacy: 10,
  duplicate: 10,
  disk: 10,
  performance: 15,
  system: 10,
  security: 20,
  'driver-updater': 10,
  antivirus: 15,
  vpn: 5,
  backup: 5,
  'file-recovery': 5,
  'browser-cleaner': 8,
  'disk-defragmenter': 8,
  'network-optimizer': 5,
  'memory-optimizer': 7,
  'battery-optimizer': 5,
} as const;

// ── Default Module Settings ─────────────────────────────────────────

export interface DefaultModuleSettings {
  /** Whether future modules should be visible (even if not implemented). */
  showFutureModules: boolean;
  /** Whether to lazy-initialize modules (Part 14). */
  lazyInitialization: boolean;
  /** Max concurrent module operations. */
  maxConcurrentOperations: number;
  /** Whether to auto-retry failed modules on next scan. */
  autoRetryOnError: boolean;
}

export const DEFAULT_MODULE_SETTINGS: DefaultModuleSettings = {
  showFutureModules: true,
  lazyInitialization: true,
  maxConcurrentOperations: 3,
  autoRetryOnError: true,
};

// ── Display Order ───────────────────────────────────────────────────

/**
 * Display order for modules in the Dashboard.
 * Modules not listed here appear at the end, sorted alphabetically.
 */
export const MODULE_DISPLAY_ORDER: string[] = [
  'junk',
  'registry',
  'startup',
  'privacy',
  'duplicate',
  'disk',
  'performance',
  'system',
  'security',
  'driver-updater',
  'antivirus',
  'vpn',
  'backup',
  'file-recovery',
  'browser-cleaner',
  'disk-defragmenter',
  'network-optimizer',
  'memory-optimizer',
  'battery-optimizer',
];

/**
 * Get the display order index for a module ID.
 * Lower index = appears first. Unlisted modules get index 999.
 */
export function getModuleDisplayOrder(moduleId: string): number {
  const index = MODULE_DISPLAY_ORDER.indexOf(moduleId);
  return index === -1 ? 999 : index;
}

/**
 * Sort module entries by their configured display order.
 */
export function sortByDisplayOrder<T extends { metadata: { moduleId: string } }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    const orderA = getModuleDisplayOrder(a.metadata.moduleId);
    const orderB = getModuleDisplayOrder(b.metadata.moduleId);
    return orderA - orderB;
  });
}
