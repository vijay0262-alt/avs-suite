/**
 * i18n keys and locale registry.
 *
 * Strings are declared as a tree of keys with English defaults. Each
 * supported locale supplies overrides via `./locales/<code>.ts`.
 *
 * The React app wires this into `react-i18next` in
 * `apps/pc-optimizer/src/i18n/`.
 */

export type LocaleCode = 'en' | 'de' | 'fr' | 'es' | 'it' | 'pt-BR' | 'ru' | 'zh-CN' | 'ja';

export const SUPPORTED_LOCALES: readonly LocaleCode[] = [
  'en',
  'de',
  'fr',
  'es',
  'it',
  'pt-BR',
  'ru',
  'zh-CN',
  'ja',
];

export const DEFAULT_LOCALE: LocaleCode = 'en';

/**
 * Canonical translation tree. Add new keys here; then supply per-locale
 * overrides in `./locales/*`.
 */
export const en = {
  app: {
    name: 'AVS PC Optimizer',
    tagline: 'Keep your Windows PC fast, clean, and secure.',
  },
  nav: {
    section: {
      overview: 'Overview',
      optimization: 'Optimization',
      reports: 'Reports & History',
      account: 'Account',
    },
    dashboard: 'Dashboard',
    junkCleaner: 'Junk Cleaner',
    registryCleaner: 'Registry Cleaner',
    startupManager: 'Startup Manager',
    privacyCleaner: 'Privacy Cleaner',
    duplicateFinder: 'Duplicate Finder',
    diskAnalyzer: 'Disk Analyzer',
    uninstaller: 'Uninstaller',
    softwareUpdater: 'Software Updater',
    performance: 'Performance',
    systemInformation: 'System Information',
    hardwareCenter: 'Hardware Center',
    securityDashboard: 'AI Active Protection',
    processIntelligence: 'Process Intelligence',
    predictiveHealth: 'Predictive Health',
    maintenanceHistory: 'Maintenance History',
    reports: 'Reports',
    license: 'Account & License',
    settings: 'Settings',
    about: 'About',
  },
  common: {
    scan: 'Scan',
    clean: 'Clean',
    cancel: 'Cancel',
    apply: 'Apply',
    save: 'Save',
    close: 'Close',
    loading: 'Loading…',
    upgrade: 'Upgrade to Professional',
    comingSoon: 'Coming soon',
  },
  dashboard: {
    healthScore: 'Health Score',
    cpuUsage: 'CPU Usage',
    ramUsage: 'RAM Usage',
    diskUsage: 'Disk Usage',
    storage: 'Storage',
    startupPrograms: 'Startup Programs',
    junkFiles: 'Junk Files',
    privacyStatus: 'Privacy Status',
    quickActions: 'Quick Actions',
    recentActivity: 'Recent Activity',
  },
  settings: {
    appearance: 'Appearance',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeSystem: 'System',
    language: 'Language',
    updates: 'Updates',
    license: 'Account & License',
    advanced: 'Advanced',
  },
} as const;

export type Translations = typeof en;
export type TranslationKey = string; // dotted path — validated at build time in a future step
