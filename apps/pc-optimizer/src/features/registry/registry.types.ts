/**
 * Registry Cleaner types.
 */

export interface RegistryIssue {
  id: string;
  category: string;
  description: string;
  hive: string;
  subkey: string;
  valueName: string;
  valueData: string;
  severity: 'low' | 'medium';
}

export interface RegistryScanResult {
  issues: RegistryIssue[];
  totalIssues: number;
  categoryBreakdown: Record<string, number>;
}

export interface RegistryCategory {
  id: string;
  name: string;
}

export interface RegistryCleanResult {
  fixed: number;
  failed: number;
  backupId: string | null;
  errors: string[];
}

export interface RegistryBackup {
  backupId: string;
  createdAt: string | null;
  count: number;
}

export const CATEGORY_LABELS: Record<string, string> = {
  startup: 'Obsolete startup entries',
  app_paths: 'Invalid application paths',
  shared_dlls: 'Missing shared DLLs',
  uninstall: 'Leftover uninstall entries',
  muicache: 'Invalid MUICache entries',
};
