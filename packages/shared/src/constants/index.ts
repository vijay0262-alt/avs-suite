/**
 * Application-wide constants.
 * These are pure values with no runtime dependencies.
 */

export const APP_METADATA = {
  name: 'AVS PC Optimizer',
  vendor: 'Advanced Vision Software LLC',
  copyright: '© 2024-2026 Advanced Vision Software LLC. All rights reserved.',
  supportEmail: 'support@avs.example.com',
  websiteUrl: 'https://www.avs.example.com',
  publisherName: 'Advanced Vision Software LLC',
  description: 'Windows performance, cleanup, and privacy utility.',
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
