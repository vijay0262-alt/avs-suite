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
    name: 'AVS AI Shield: Security & System Intelligence',
    tagline: 'Keep your Windows PC fast, clean, and secure.',
  },
  nav: {
    section: {
      home: 'Home',
      systemHealth: 'System Health',
      security: 'Security',
      optimization: 'Optimization',
      reports: 'Reports',
      tools: 'Tools',
      account: 'Account',
      // Legacy aliases
      overview: 'Home',
    },
    dashboard: 'Dashboard',
    protectionCenter: 'AI Protection Center',
    aiSmartOptimize: 'AI Smart Optimize',
    aiSmartSecurity: 'AI Smart Security',
    systemHealth: 'System Health',
    hardwareCenter: 'Hardware Center',
    processIntelligence: 'Process Intelligence',
    predictiveHealth: 'Predictive Health',
    performanceAnalytics: 'Performance Analytics',
    securityCenter: 'Security Center',
    quickScan: 'Quick Scan',
    fullScan: 'Full Scan',
    customScan: 'Custom Scan',
    aiActiveProtection: 'AI Active Protection',
    spywareProtection: 'Spyware Protection',
    malwareProtection: 'Malware Protection',
    adwareProtection: 'Adware Protection',
    ransomwareProtection: 'Ransomware Protection',
    browserProtection: 'Browser Protection',
    trojanProtection: 'Trojan Protection',
    pupProtection: 'PUP / PUA Protection',
    cryptoMinerProtection: 'Crypto Miner Protection',
    scriptProtection: 'Script Protection',
    keyloggerProtection: 'Keylogger Protection',
    rootkitProtection: 'Rootkit Protection',
    backdoorProtection: 'Backdoor Protection',
    persistenceDetection: 'Persistence Detection',
    networkBehaviorAnalysis: 'Network Behavior Analysis',
    fileReputationAnalysis: 'File Reputation Analysis',
    publisherTrustAnalysis: 'Publisher Trust Analysis',
    threatInvestigation: 'Threat Investigation',
    quarantine: 'Quarantine',
    securityReports: 'Security Reports',
    junkCleaner: 'Junk Cleaner',
    startupManager: 'Startup Manager',
    browserCleaner: 'Browser Cleaner',
    registryCleaner: 'Registry Cleaner',
    duplicateFinder: 'Duplicate Finder',
    largeFiles: 'Large Files',
    uninstaller: 'Uninstaller',
    softwareUpdater: 'Software Updater',
    maintenanceHistory: 'Maintenance History',
    reports: 'Reports',
    reportsTimeline: 'Timeline',
    analytics: 'Analytics',
    exportCenter: 'Export Center',
    systemInformation: 'System Information',
    diskAnalyzer: 'Disk Analyzer',
    networkInformation: 'Network Information',
    driverInformation: 'Driver Information',
    backupRestore: 'Backup & Restore',
    recoveryCenter: 'Recovery Center',
    fileShredder: 'File Shredder',
    diskOptimizer: 'Disk Optimizer',
    pupScanner: 'PUP Scanner',
    browserExtensions: 'Browser Extensions',
    networkOptimizer: 'Network Optimizer',
    contextMenu: 'Context Menu Manager',
    autoCare: 'AI Auto-Care',
    workload: 'Workload Detection',
    driverUpdater: 'Driver Updater',
    securityHistory: 'Security History',
    antispywareMalwareRemoval: 'Antispyware/Malware Removal',
    restoration: 'Restoration',
    helpSupport: 'Help and Support',
    license: 'Account & License',
    upgrade: 'Upgrade',
    settings: 'Settings',
    notifications: 'Notifications',
    help: 'Help',
    about: 'About',
    // Legacy aliases
    securityDashboard: 'AI Active Protection',
    privacyCleaner: 'Privacy Cleaner',
    performance: 'Performance',
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
