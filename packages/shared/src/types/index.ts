/**
 * Cross-cutting TypeScript types.
 */

export type ThemeMode = 'light' | 'dark' | 'system';

export type NavItemId =
  | 'dashboard'
  | 'junk-cleaner'
  | 'registry-cleaner'
  | 'startup-manager'
  | 'privacy-cleaner'
  | 'duplicate-finder'
  | 'disk-analyzer'
  | 'uninstaller'
  | 'software-updater'
  | 'performance'
  | 'system-information'
  | 'license'
  | 'settings'
  | 'about';

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
