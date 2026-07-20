/**
 * Software Updater service — RPC wrapper.
 */
import type { UpdaterListResult, UpgradeResult } from './updater.types';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is unavailable (outside Electron?)');
  }
  return window.avs.rpc;
}

export interface IUpdaterService {
  available(): Promise<{ available: boolean }>;
  list(): Promise<UpdaterListResult>;
  upgrade(packageId: string): Promise<UpgradeResult>;
  upgradeAll(): Promise<UpgradeResult>;
}

class UpdaterService implements IUpdaterService {
  async available(): Promise<{ available: boolean }> {
    return await client().call('updater.available');
  }

  async list(): Promise<UpdaterListResult> {
    return await client().call('updater.list');
  }

  async upgrade(packageId: string): Promise<UpgradeResult> {
    return await client().call('updater.upgrade', { packageId });
  }

  async upgradeAll(): Promise<UpgradeResult> {
    return await client().call('updater.upgradeAll');
  }
}

export const updaterService = new UpdaterService();
