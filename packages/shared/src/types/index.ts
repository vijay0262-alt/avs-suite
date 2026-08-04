/**
 * Cross-cutting TypeScript types.
 */

export type ThemeMode = 'light' | 'dark' | 'system';

export type NavItemId =
  | 'dashboard'
  | 'ai-AIAssistant'
  | 'ai-daily-briefing'
  | 'ai-smart-optimize'
  | 'ai-workspace'
  | 'system-health'
  | 'hardware-center'
  | 'process-intelligence'
  | 'predictive-health'
  | 'performance-analytics'
  | 'security-center'
  | 'quick-scan'
  | 'full-scan'
  | 'custom-scan'
  | 'ai-active-protection'
  | 'spyware-protection'
  | 'malware-protection'
  | 'adware-protection'
  | 'ransomware-protection'
  | 'browser-protection'
  | 'trojan-protection'
  | 'pup-protection'
  | 'crypto-miner-protection'
  | 'script-protection'
  | 'keylogger-protection'
  | 'rootkit-protection'
  | 'backdoor-protection'
  | 'persistence-detection'
  | 'network-behavior-analysis'
  | 'file-reputation-analysis'
  | 'publisher-trust-analysis'
  | 'threat-investigation'
  | 'quarantine'
  | 'security-reports'
  | 'junk-cleaner'
  | 'startup-manager'
  | 'browser-cleaner'
  | 'registry-cleaner'
  | 'duplicate-finder'
  | 'large-files'
  | 'uninstaller'
  | 'software-updater'
  | 'maintenance-history'
  | 'reports'
  | 'reports-timeline'
  | 'analytics'
  | 'export-center'
  | 'system-information'
  | 'disk-analyzer'
  | 'network-information'
  | 'driver-information'
  | 'backup-restore'
  | 'recovery-center'
  | 'security-history'
  | 'antispyware-malware-removal'
  | 'restoration'
  | 'help-support'
  | 'license'
  | 'upgrade'
  | 'settings'
  | 'notifications'
  | 'help'
  | 'about'
  // Legacy aliases for backward compatibility
  | 'security-dashboard'
  | 'privacy-cleaner'
  | 'performance';

export interface SystemHealthSnapshot {
  score: number; // 0-100
  cpuUsage: number; // 0-100
  memoryUsage: number; // 0-100
  diskUsage: number; // 0-100
  startupCount: number;
  junkBytes: number;
  privacyIssues: number;
  capturedAt: string; // ISO-8601 UTC
}

export interface ProgressEvent {
  taskId: string;
  progress: number; // 0-100
  message?: string;
}

/** Discriminated union for async data states used by ViewModels. */
export type AsyncState<T, E = Error> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: E };
