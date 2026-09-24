/**
 * Startup Manager types
 */

export type StartupSource =
  | 'registry_run'
  | 'registry_run_once'
  | 'startup_folder'
  | 'task_scheduler'
  | 'startup_service'
  | 'unknown';

export interface StartupEntry {
  name: string;
  publisher: string;
  status: 'enabled' | 'disabled' | 'unknown';
  impact: 'high' | 'medium' | 'low' | 'unknown';
  source: StartupSource;
  location: string;
  command: string;
  enabled: boolean;
  /** Optional enrichment fields used by the startup-optimizer module. */
  signatureStatus?: string;
  bootImpactMs?: number;
  lastLaunch?: string;
}

export interface StartupListResponse {
  entries: StartupEntry[];
}

export interface StartupDisableResponse {
  success: boolean;
  message?: string;
  isMicrosoftSigned?: boolean;
  reason?: string;
  error?: string;
  backupId?: string;
}

export interface StartupEnableResponse {
  success: boolean;
  message?: string;
}

export interface StartupBackup {
  backupId: string;
  timestamp: string;
  entryName: string;
  source: string;
  location: string;
  enabled: boolean;
}

export interface StartupState {
  entries: StartupEntry[];
  loading: boolean;
  error: string | null;
  selectedEntry: StartupEntry | null;
  backups: StartupBackup[];
}
