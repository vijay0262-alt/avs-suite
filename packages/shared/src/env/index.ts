/**
 * Environment resolution.
 *
 * Electron and the Python backend read `AVS_ENV` (development | staging |
 * production) to select config, logging verbosity, update channel, and
 * analytics endpoint.
 *
 * Production URLs are sourced from platformConfig.
 */
import { API_URLS, URLS } from '../platformConfig';

export type AppEnvironment = 'development' | 'staging' | 'production';

export interface EnvironmentConfig {
  env: AppEnvironment;
  /** electron-updater feed URL. */
  updateFeedUrl: string;
  /** Base URL for the licensing service. */
  licenseApiUrl: string;
  /** Website URL. */
  websiteUrl: string;
  /** Analytics endpoint (opt-in only). */
  analyticsUrl: string | null;
  /** electron-log level. */
  logLevel: 'silly' | 'debug' | 'info' | 'warn' | 'error';
  /** Open Chromium DevTools automatically at startup. */
  openDevTools: boolean;
}

const CONFIGS: Record<AppEnvironment, EnvironmentConfig> = {
  development: {
    env: 'development',
    updateFeedUrl: 'http://localhost:8000/updates',
    licenseApiUrl: 'http://localhost:8000',
    websiteUrl: 'http://localhost:3000',
    analyticsUrl: null,
    logLevel: 'debug',
    openDevTools: true,
  },
  staging: {
    env: 'staging',
    updateFeedUrl: 'https://api-staging.avsshield.com/updates',
    licenseApiUrl: 'https://api-staging.avsshield.com',
    websiteUrl: 'https://staging.avsshield.com',
    analyticsUrl: null,
    logLevel: 'info',
    openDevTools: false,
  },
  production: {
    env: 'production',
    updateFeedUrl: API_URLS.desktopUpdate,
    licenseApiUrl: API_URLS.licenseServer,
    websiteUrl: URLS.website,
    analyticsUrl: null,
    logLevel: 'warn',
    openDevTools: false,
  },
};

export function resolveEnvironment(raw: string | undefined): EnvironmentConfig {
  const key = (raw ?? 'development').toLowerCase() as AppEnvironment;
  return CONFIGS[key] ?? CONFIGS.development;
}
