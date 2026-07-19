/**
 * Startup Manager service
 */

import type { StartupEntry, StartupDisableResponse, StartupEnableResponse, StartupBackup } from './startup.types';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is unavailable (outside Electron?)');
  }
  return window.avs.rpc;
}

export interface IStartupService {
  listEntries(): Promise<StartupEntry[]>;
  disableEntry(entry: StartupEntry): Promise<StartupDisableResponse>;
  enableEntry(entry: StartupEntry): Promise<StartupEnableResponse>;
  getBackups(): Promise<StartupBackup[]>;
  restoreBackup(backupId: string): Promise<{ success: boolean }>;
}

class StartupService implements IStartupService {
  async listEntries(): Promise<StartupEntry[]> {
    return await client().call('startup.list');
  }

  async disableEntry(entry: StartupEntry): Promise<StartupDisableResponse> {
    return await client().call('startup.disable', { entry });
  }

  async enableEntry(entry: StartupEntry): Promise<StartupEnableResponse> {
    return await client().call('startup.enable', { entry });
  }

  async getBackups(): Promise<StartupBackup[]> {
    return await client().call('startup.backups');
  }

  async restoreBackup(backupId: string): Promise<{ success: boolean }> {
    return await client().call('startup.restore', { backupId });
  }
}

export const startupService = new StartupService();
