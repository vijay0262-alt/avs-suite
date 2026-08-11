/**
 * AVS Shield Platform Configuration — single source of truth for all
 * platform-wide constants across every repository.
 *
 * Every repo (avs-suite, avs-customer-portal, avs-license-server) imports
 * from this module (or mirrors its structure for non-TS repos).
 *
 * Changing production URLs requires editing this file only.
 */

// ── Company ──────────────────────────────────────────────────────

export const COMPANY = {
  legalCompanyName: 'Advanced Vision Software LLC',
  companyName: 'AVS Shield',
  brandName: 'AVS Shield',
  vendor: 'AVS Shield',
  publisherName: 'AVS Shield',
  copyright: '© 2024-2026 Advanced Vision Software LLC. All rights reserved.',
  description: 'AI-powered PC health, protection, and optimization platform.',
  address: {
    street: '30 N Gould St, Ste 4000',
    city: 'Sheridan',
    state: 'WY',
    zip: '82801',
    country: 'USA',
  },
} as const;

// ── URLs ─────────────────────────────────────────────────────────

export const URLS = {
  website: 'https://www.avsshield.com',
  canonical: 'https://www.avsshield.com',
  support: 'https://www.avsshield.com/contact',
  login: 'https://www.avsshield.com/login',
  register: 'https://www.avsshield.com/register',
  forgotPassword: 'https://www.avsshield.com/forgot-password',
  dashboard: 'https://www.avsshield.com/dashboard',
  downloads: 'https://www.avsshield.com/downloads',
  download: 'https://www.avsshield.com/download',
  pricing: 'https://www.avsshield.com/pricing',
  product: 'https://www.avsshield.com/pc-optimizer',
  features: 'https://www.avsshield.com/features',
  about: 'https://www.avsshield.com/about',
  contact: 'https://www.avsshield.com/contact',
  blog: 'https://www.avsshield.com/blog',
  careers: 'https://www.avsshield.com/careers',
  privacyPolicy: 'https://www.avsshield.com/privacy-policy',
  terms: 'https://www.avsshield.com/terms',
  refundPolicy: 'https://www.avsshield.com/refund-policy',
} as const;

// ── API & Service URLs ───────────────────────────────────────────

export const API_URLS = {
  /** License Server API base URL. */
  licenseServer: 'https://api.avsshield.com',
  /** Desktop application update feed URL. */
  desktopUpdate: 'https://api.avsshield.com/updates',
  /** Customer Portal URL (for desktop to open browser). */
  customerPortal: 'https://www.avsshield.com',
} as const;

// ── Contact ──────────────────────────────────────────────────────

export const CONTACT = {
  supportEmail: 'help@avsshield.com',
  noreplyEmail: 'noreply@avsshield.com',
} as const;

// ── Social Links ─────────────────────────────────────────────────

export const SOCIAL = {
  facebook: 'https://www.facebook.com/avsshield',
  twitter: 'https://www.twitter.com/avsshield',
  youtube: 'https://www.youtube.com/@avsshield',
  linkedin: 'https://www.linkedin.com/company/avsshield',
  email: 'mailto:help@avsshield.com',
} as const;

// ── Product Codes ────────────────────────────────────────────────

export const PRODUCT_CODES = {
  optimizer: 'AVS_PC_OPTIMIZER',
  antivirus: 'AVS_ANTIVIRUS',
  vpn: 'AVS_VPN',
  driverUpdater: 'AVS_DRIVER_UPDATER',
  passwordManager: 'AVS_PASSWORD_MANAGER',
  mobileSecurity: 'AVS_MOBILE_SECURITY',
} as const;

// ── Edition Names ────────────────────────────────────────────────

export const EDITIONS = {
  FREE: 'FREE',
  PROFESSIONAL: 'PROFESSIONAL',
} as const;

export const EDITION_LABELS: Record<string, string> = {
  FREE: 'Free',
  PROFESSIONAL: 'Professional',
};

// ── Legal URLs ───────────────────────────────────────────────────

export const LEGAL = {
  privacyPolicy: URLS.privacyPolicy,
  terms: URLS.terms,
  refundPolicy: URLS.refundPolicy,
} as const;

// ── Environment ──────────────────────────────────────────────────

export type AppEnvironment = 'development' | 'staging' | 'production';

export interface EnvironmentConfig {
  env: AppEnvironment;
  licenseApiUrl: string;
  updateFeedUrl: string;
  websiteUrl: string;
  logLevel: 'debug' | 'info' | 'warn';
  openDevTools: boolean;
}

const ENV_CONFIGS: Record<AppEnvironment, EnvironmentConfig> = {
  development: {
    env: 'development',
    licenseApiUrl: 'http://localhost:8000',
    updateFeedUrl: 'http://localhost:8000/updates',
    websiteUrl: 'http://localhost:3000',
    logLevel: 'debug',
    openDevTools: true,
  },
  staging: {
    env: 'staging',
    licenseApiUrl: 'https://api-staging.avsshield.com',
    updateFeedUrl: 'https://api-staging.avsshield.com/updates',
    websiteUrl: 'https://staging.avsshield.com',
    logLevel: 'info',
    openDevTools: false,
  },
  production: {
    env: 'production',
    licenseApiUrl: API_URLS.licenseServer,
    updateFeedUrl: API_URLS.desktopUpdate,
    websiteUrl: URLS.website,
    logLevel: 'warn',
    openDevTools: false,
  },
};

export function resolveEnvironment(raw: string | undefined): EnvironmentConfig {
  const key = (raw ?? 'development').toLowerCase() as AppEnvironment;
  return ENV_CONFIGS[key] ?? ENV_CONFIGS.development;
}

// ── Convenience: get a URL by key ────────────────────────────────

export type UrlKey = keyof typeof URLS;

export function getUrl(key: UrlKey): string {
  return URLS[key];
}
