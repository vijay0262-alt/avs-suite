/**
 * Startup Manager types
 */

export interface StartupEntry {
  name: string;
  publisher: string;
  status: 'enabled' | 'disabled' | 'unknown';
  impact: 'high' | 'medium' | 'low' | 'unknown';
  source: 'registry' | 'folder' | 'task' | 'unknown';
  location: string;
  command: string;
  enabled: boolean;
  /** Digital signature status, e.g. 'Signed', 'Unsigned', 'Unknown' */
  signatureStatus?: string;
  /** Estimated boot impact in milliseconds */
  bootImpactMs?: number;
  /** Last launch timestamp or humanized string */
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
}

export interface StartupEnableResponse {
  success: boolean;
  message?: string;
}

export interface StartupBackup {
  backupId: string;
  timestamp: string;
  entryName: string;
  originalLocation: string;
  originalCommand: string;
}

export interface StartupState {
  entries: StartupEntry[];
  loading: boolean;
  error: string | null;
  selectedEntry: StartupEntry | null;
  backups: StartupBackup[];
}
