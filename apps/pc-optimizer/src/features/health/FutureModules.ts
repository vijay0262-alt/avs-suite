/**
 * Future Module Registration — Part 17
 *
 * Future modules (Driver Updater, Antivirus, VPN, Backup, File Recovery)
 * register here at startup. They automatically participate in:
 *   - Health Score (via registerModuleWeight)
 *   - Optimization Summary (via HealthContributionProvider)
 *   - Dashboard (via healthScore.categoryDetails)
 *   - Recommendations (via generateRecommendations)
 *
 * No Dashboard code changes are needed when a new module is added.
 */
import type { ModuleId } from './HealthContribution';

export interface FutureModuleConfig {
  moduleId: ModuleId;
  displayName: string;
  maxPenalty: number;
  actionPath: string;
  icon?: string;
}

export const FUTURE_MODULE_CONFIGS: FutureModuleConfig[] = [
  {
    moduleId: 'driver-updater',
    displayName: 'Driver Updater',
    maxPenalty: 10,
    actionPath: '/driver-updater',
  },
  {
    moduleId: 'antivirus',
    displayName: 'Antivirus',
    maxPenalty: 15,
    actionPath: '/antivirus',
  },
  {
    moduleId: 'vpn',
    displayName: 'VPN',
    maxPenalty: 5,
    actionPath: '/vpn',
  },
  {
    moduleId: 'backup',
    displayName: 'Backup',
    maxPenalty: 5,
    actionPath: '/backup',
  },
  {
    moduleId: 'file-recovery',
    displayName: 'File Recovery',
    maxPenalty: 5,
    actionPath: '/file-recovery',
  },
];

export function isFutureModule(moduleId: string): boolean {
  return FUTURE_MODULE_CONFIGS.some((m) => m.moduleId === moduleId);
}

export function getFutureModuleConfig(moduleId: string): FutureModuleConfig | undefined {
  return FUTURE_MODULE_CONFIGS.find((m) => m.moduleId === moduleId);
}
