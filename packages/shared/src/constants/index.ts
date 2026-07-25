/**
 * Application-wide constants.
 * These are pure values with no runtime dependencies.
 *
 * Company/brand/URL values are sourced from platformConfig to ensure
 * a single source of truth across all repositories.
 */
import { COMPANY, URLS, CONTACT } from '../platformConfig';

export const APP_METADATA = {
  name: 'AVS Shield Optimizer',
  vendor: COMPANY.vendor,
  copyright: COMPANY.copyright,
  supportEmail: CONTACT.supportEmail,
  websiteUrl: URLS.website,
  publisherName: COMPANY.publisherName,
  description: COMPANY.description,
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
