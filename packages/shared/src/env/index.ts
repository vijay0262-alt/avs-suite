/**
 * Environment resolution.
 *
 * Electron and the Python backend read `AVS_ENV` (development | staging |
 * production) to select config, logging verbosity, update channel, and
 * analytics endpoint.
 */

export type AppEnvironment = 'development' | 'staging' | 'production';

export interface EnvironmentConfig {
  env: AppEnvironment;
  /** electron-updater feed URL. */
  updateFeedUrl: string;
  /** Base URL for the licensing service. */
  licenseApiUrl: string;
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
    updateFeedUrl: 'https://updates.dev.avs.example.com',
    licenseApiUrl: 'https://license.dev.avs.example.com',
    analyticsUrl: null,
    logLevel: 'debug',
    openDevTools: true,
  },
  staging: {
    env: 'staging',
    updateFeedUrl: 'https://updates.staging.avs.example.com',
    licenseApiUrl: 'https://license.staging.avs.example.com',
    analyticsUrl: 'https://telemetry.staging.avs.example.com',
    logLevel: 'info',
    openDevTools: false,
  },
  production: {
    env: 'production',
    updateFeedUrl: 'https://updates.avs.example.com',
    licenseApiUrl: 'https://license.avs.example.com',
    analyticsUrl: 'https://telemetry.avs.example.com',
    logLevel: 'warn',
    openDevTools: false,
  },
};

export function resolveEnvironment(raw: string | undefined): EnvironmentConfig {
  const key = (raw ?? 'development').toLowerCase() as AppEnvironment;
  return CONFIGS[key] ?? CONFIGS.development;
}
