/**
 * Registry Cleaner service — RPC wrapper.
 */
import type {
  RegistryScanResult,
  RegistryCleanResult,
  RegistryIssue,
  RegistryBackup,
  RegistryCategory,
} from './registry.types';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is unavailable (outside Electron?)');
  }
  return window.avs.rpc;
}

export interface IRegistryService {
  listCategories(): Promise<{ categories: RegistryCategory[] }>;
  scan(categories?: string[]): Promise<RegistryScanResult>;
  clean(issues: RegistryIssue[]): Promise<RegistryCleanResult>;
  listBackups(): Promise<{ backups: RegistryBackup[] }>;
  restore(backupId: string): Promise<{ success: boolean; restored: number; errors: string[] }>;
}

class RegistryService implements IRegistryService {
  async listCategories(): Promise<{ categories: RegistryCategory[] }> {
    return await client().call('registry.categories');
  }

  async scan(categories?: string[]): Promise<RegistryScanResult> {
    const params = categories ? { categories } : undefined;
    return await client().call('registry.scan', params);
  }

  async clean(issues: RegistryIssue[]): Promise<RegistryCleanResult> {
    return await client().call('registry.clean', { issues });
  }

  async listBackups(): Promise<{ backups: RegistryBackup[] }> {
    return await client().call('registry.backups');
  }

  async restore(backupId: string): Promise<{ success: boolean; restored: number; errors: string[] }> {
    return await client().call('registry.restore', { backupId });
  }
}

export const registryService = new RegistryService();
