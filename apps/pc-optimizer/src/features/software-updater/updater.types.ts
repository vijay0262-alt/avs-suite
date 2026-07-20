/**
 * Software Updater types.
 */

export interface Upgrade {
  name: string;
  packageId: string;
  currentVersion: string;
  availableVersion: string;
  source: string;
}

export interface UpdaterListResult {
  available: boolean;
  reason: string | null;
  upgrades: Upgrade[];
  total: number;
}

export interface UpgradeResult {
  success: boolean;
  message: string;
  launched?: boolean;
}
