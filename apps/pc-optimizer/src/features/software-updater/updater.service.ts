/**
 * Software Updater service — RPC wrapper.
 */
import type { UpdaterListResult, UpgradeResult } from './updater.types';
import { RPC_METHODS } from '@avs/shared/rpc';

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
    return await client().call(RPC_METHODS.UPDATER_AVAILABLE);
  }

  async list(): Promise<UpdaterListResult> {
    return await client().call(RPC_METHODS.UPDATER_LIST);
  }

  async upgrade(packageId: string): Promise<UpgradeResult> {
    return await client().call(RPC_METHODS.UPDATER_UPGRADE, { packageId });
  }

  async upgradeAll(): Promise<UpgradeResult> {
    return await client().call(RPC_METHODS.UPDATER_UPGRADE_ALL);
  }
}

export const updaterService = new UpdaterService();
