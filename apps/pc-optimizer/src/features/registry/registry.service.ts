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
import { RPC_METHODS } from '@avs/shared/rpc';

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
    return await client().call(RPC_METHODS.REGISTRY_CATEGORIES);
  }

  async scan(categories?: string[]): Promise<RegistryScanResult> {
    const params = categories ? { categories } : undefined;
    return await client().call(RPC_METHODS.REGISTRY_SCAN, params);
  }

  async clean(issues: RegistryIssue[]): Promise<RegistryCleanResult> {
    return await client().call(RPC_METHODS.REGISTRY_CLEAN, { issues });
  }

  async listBackups(): Promise<{ backups: RegistryBackup[] }> {
    return await client().call(RPC_METHODS.REGISTRY_BACKUPS);
  }

  async restore(backupId: string): Promise<{ success: boolean; restored: number; errors: string[] }> {
    return await client().call(RPC_METHODS.REGISTRY_RESTORE, { backupId });
  }
}

export const registryService = new RegistryService();
