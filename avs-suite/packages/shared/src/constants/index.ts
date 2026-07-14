/**
 * Application-wide constants.
 * These are pure values with no runtime dependencies.
 */

export const APP_METADATA = {
  name: 'AVS PC Optimizer',
  vendor: 'AVS Software',
  copyright: '© AVS Software. All rights reserved.',
  supportEmail: 'support@avs.example.com',
  websiteUrl: 'https://www.avs.example.com',
} as const;

/** Filesystem folders used at runtime, relative to the OS userData path. */
export const USER_DATA_PATHS = {
  logs: 'logs',
  db: 'database',
  settings: 'settings',
  cache: 'cache',
  crashes: 'crashes',
} as const;

/** Names of persisted settings files (JSON). */
export const SETTINGS_FILES = {
  app: 'app.settings.json',
  ui: 'ui.settings.json',
  scheduler: 'scheduler.settings.json',
} as const;

/** SQLite filename (created in USER_DATA_PATHS.db). */
export const DATABASE_FILE = 'avs-pc-optimizer.sqlite';
