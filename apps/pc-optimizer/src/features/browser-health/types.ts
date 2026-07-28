/**
 * Browser Health & Privacy Platform — Type Definitions
 *
 * Complete type system for browser discovery, health analysis,
 * privacy evaluation, storage measurement, cleanup, and integration.
 *
 * This module does NOT modify any existing architecture.
 */
import type { HealthCategoryId, Severity } from '../ai-health-engine/types';

// ── Browser Identity ──────────────────────────────────────────

export type BrowserType =
  | 'chrome'
  | 'edge'
  | 'firefox'
  | 'brave'
  | 'opera'
  | 'vivaldi'
  | 'custom';

export interface BrowserInfo {
  id: string;
  type: BrowserType;
  name: string;
  version: string | null;
  installPath: string | null;
  isDefault: boolean;
  isInstalled: boolean;
  lastUsed: string | null;
  executablePath: string | null;
}

// ── Browser Profile ───────────────────────────────────────────

export interface BrowserExtension {
  id: string;
  name: string;
  version: string | null;
  enabled: boolean;
  permissions: string[];
  isSuspicious: boolean;
}

export interface NotificationPermission {
  origin: string;
  permission: 'granted' | 'denied' | 'default';
  lastAccessed: string | null;
}

export interface BrowserProfile {
  id: string;
  browserId: string;
  name: string;
  path: string;
  size: number;
  lastUsed: string | null;
  isActive: boolean;
  extensionCount: number;
  extensions: BrowserExtension[];
  bookmarkCount: number;
  historySize: number;
  cookieCount: number;
  cacheSize: number;
  downloadHistoryCount: number;
  savedPasswordCount: number;
  autofillEntryCount: number;
  notificationPermissions: NotificationPermission[];
}

// ── Scan Result ───────────────────────────────────────────────

export interface BrowserScanResult {
  browsers: BrowserInfo[];
  profiles: BrowserProfile[];
  scannedAt: string;
  scanDurationMs: number;
  errors: string[];
}

// ── Privacy Analysis ──────────────────────────────────────────

export type PrivacyRiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface PrivacyIssue {
  title: string;
  description: string;
  severity: Severity;
  riskLevel: PrivacyRiskLevel;
  impact: number;
  autoFixable: boolean;
  affectedBrowserIds: string[];
}

export interface PrivacyAnalysis {
  score: number;
  issues: PrivacyIssue[];
  insights: string[];
  recommendations: string[];
  trackingCookieCount: number;
  thirdPartyCookieCount: number;
  totalCookieCount: number;
  historyAgeDays: number;
  downloadHistoryCount: number;
  notificationPermissionCount: number;
  suspiciousExtensionCount: number;
  analyzedAt: string;
}

// ── Storage Analysis ──────────────────────────────────────────

export interface BrowserStorageBreakdown {
  cacheSize: number;
  cookiesSize: number;
  historyDbSize: number;
  downloadsHistorySize: number;
  sessionStorageSize: number;
  localStorageSize: number;
  indexedDbSize: number;
  totalSize: number;
}

export interface BrowserStorageAnalysis {
  perBrowser: Record<string, BrowserStorageBreakdown>;
  perProfile: Record<string, BrowserStorageBreakdown>;
  totalCacheSize: number;
  totalCookiesSize: number;
  totalHistoryDbSize: number;
  totalDownloadsHistorySize: number;
  totalSessionStorageSize: number;
  totalLocalStorageSize: number;
  totalIndexedDbSize: number;
  grandTotal: number;
  analyzedAt: string;
}

// ── Health Analysis ───────────────────────────────────────────

export type BrowserHealthIssueType =
  | 'large_cache'
  | 'excessive_cookies'
  | 'old_history'
  | 'unused_profile'
  | 'large_downloads_history'
  | 'unused_extensions'
  | 'outdated_browser'
  | 'suspicious_extension'
  | 'excessive_notifications'
  | 'tracking_cookies';

export interface BrowserHealthIssue {
  type: BrowserHealthIssueType;
  title: string;
  description: string;
  severity: Severity;
  impact: number;
  autoFixable: boolean;
  affectedBrowserIds: string[];
}

export interface BrowserHealthResult {
  overallScore: number;
  performanceScore: number;
  privacyScore: number;
  storageScore: number;
  securityScore: number;
  issues: BrowserHealthIssue[];
  insights: string[];
  browserCount: number;
  totalStorageUsed: number;
  totalRecoverableSpace: number;
  analyzedAt: string;
}

// ── Recommendations ───────────────────────────────────────────

export type BrowserRecommendationType =
  | 'cache_cleanup'
  | 'cookie_cleanup'
  | 'history_cleanup'
  | 'download_history_cleanup'
  | 'unused_profile_review'
  | 'extension_review'
  | 'browser_update'
  | 'notification_review';

export type RiskLevel = 'none' | 'low' | 'medium' | 'high';
export type RecommendationPriority = 'critical' | 'high' | 'medium' | 'low';

export interface BrowserRecommendation {
  id: string;
  type: BrowserRecommendationType;
  title: string;
  description: string;
  estimatedRecovery: number;
  privacyImprovement: number;
  performanceImprovement: number;
  risk: RiskLevel;
  priority: RecommendationPriority;
  reviewRequired: boolean;
  affectedBrowserIds: string[];
  affectedProfileIds: string[];
  requiresConfirmation: boolean;
}

// ── Execution ─────────────────────────────────────────────────

export type BrowserCleanupOperationType =
  | 'cache_cleanup'
  | 'temp_storage_cleanup'
  | 'download_history_cleanup'
  | 'cookie_cleanup'
  | 'history_cleanup';

export interface BrowserCleanupOperation {
  type: BrowserCleanupOperationType;
  browserIds: string[];
  profileIds: string[];
}

export interface BrowserExecutionConfig {
  operations: BrowserCleanupOperation[];
  confirmHistoryCleanup: boolean;
  confirmCookieCleanup: boolean;
}

export interface BrowserCleanupRecord {
  id: string;
  operationType: BrowserCleanupOperationType;
  browserId: string;
  profileId: string | null;
  itemsRemoved: number;
  bytesRecovered: number;
  timestamp: string;
  backupPath: string | null;
  rolledBack: boolean;
}

// ── Browser History ───────────────────────────────────────────

export interface BrowserHistoryEntry {
  id: string;
  timestamp: string;
  operationType: BrowserCleanupOperationType;
  browserId: string;
  browserName: string;
  profileId: string | null;
  itemsRemoved: number;
  bytesRecovered: number;
  privacyImprovement: number;
  durationMs: number;
  rolledBack: boolean;
  rollbackTimestamp: string | null;
}

// ── Health Integration ────────────────────────────────────────

export interface BrowserHealthContribution {
  categoryId: HealthCategoryId;
  categoryName: string;
  score: number;
  severity: Severity;
  issues: BrowserHealthIssue[];
  insights: string[];
  recommendations: string[];
  estimatedRecoverableSpace: number;
  confidence: number;
  analyzedAt: string;
}

export interface PrivacyHealthContribution {
  categoryId: HealthCategoryId;
  categoryName: string;
  score: number;
  severity: Severity;
  issues: PrivacyIssue[];
  insights: string[];
  recommendations: string[];
  confidence: number;
  analyzedAt: string;
}

// ── Dashboard Integration ─────────────────────────────────────

export interface BrowserDashboardCard {
  browserCount: number;
  installedBrowsers: { name: string; type: BrowserType; version: string | null; isDefault: boolean }[];
  totalStorageUsed: number;
  privacyScore: number;
  overallHealthScore: number;
  topRecommendations: { title: string; priority: RecommendationPriority }[];
  trend: 'improving' | 'declining' | 'stable' | 'insufficient_data';
}

// ── Events ────────────────────────────────────────────────────

export type BrowserEventType =
  | 'browser_scan_started'
  | 'browser_scan_completed'
  | 'browser_analysis_completed'
  | 'browser_cleanup_started'
  | 'browser_cleanup_completed'
  | 'browser_cleanup_failed';

export interface BrowserEventPayloads {
  browser_scan_started: { timestamp: string };
  browser_scan_completed: { result: BrowserScanResult };
  browser_analysis_completed: { result: BrowserHealthResult };
  browser_cleanup_started: { operations: BrowserCleanupOperation[] };
  browser_cleanup_completed: { records: BrowserCleanupRecord[] };
  browser_cleanup_failed: { error: string; partialRecords: BrowserCleanupRecord[] };
}

export type BrowserEventListener = (payload: unknown) => void;

// ── Browser Registry (for pluggable browser support) ──────────

export interface BrowserDefinition {
  type: BrowserType;
  displayName: string;
  windowsInstallPaths: string[];
  macInstallPaths: string[];
  linuxInstallPaths: string[];
  profilePathPatterns: string[];
  executableNames: string[];
}

// ── Helper Functions ──────────────────────────────────────────

export const BROWSER_DEFINITIONS: readonly BrowserDefinition[] = [
  {
    type: 'chrome',
    displayName: 'Google Chrome',
    windowsInstallPaths: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ],
    macInstallPaths: ['/Applications/Google Chrome.app'],
    linuxInstallPaths: ['/usr/bin/google-chrome', '/usr/bin/chromium'],
    profilePathPatterns: ['%LOCALAPPDATA%\\Google\\Chrome\\User Data'],
    executableNames: ['chrome.exe', 'google-chrome', 'chromium'],
  },
  {
    type: 'edge',
    displayName: 'Microsoft Edge',
    windowsInstallPaths: [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ],
    macInstallPaths: ['/Applications/Microsoft Edge.app'],
    linuxInstallPaths: ['/usr/bin/microsoft-edge'],
    profilePathPatterns: ['%LOCALAPPDATA%\\Microsoft\\Edge\\User Data'],
    executableNames: ['msedge.exe', 'microsoft-edge'],
  },
  {
    type: 'firefox',
    displayName: 'Mozilla Firefox',
    windowsInstallPaths: [
      'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
      'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe',
    ],
    macInstallPaths: ['/Applications/Firefox.app'],
    linuxInstallPaths: ['/usr/bin/firefox'],
    profilePathPatterns: ['%APPDATA%\\Mozilla\\Firefox\\Profiles'],
    executableNames: ['firefox.exe', 'firefox'],
  },
  {
    type: 'brave',
    displayName: 'Brave',
    windowsInstallPaths: [
      'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    ],
    macInstallPaths: ['/Applications/Brave Browser.app'],
    linuxInstallPaths: ['/usr/bin/brave-browser'],
    profilePathPatterns: ['%LOCALAPPDATA%\\BraveSoftware\\Brave-Browser\\User Data'],
    executableNames: ['brave.exe', 'brave-browser'],
  },
  {
    type: 'opera',
    displayName: 'Opera',
    windowsInstallPaths: [
      'C:\\Users\\%USERNAME%\\AppData\\Local\\Programs\\Opera\\opera.exe',
      'C:\\Program Files\\Opera\\opera.exe',
    ],
    macInstallPaths: ['/Applications/Opera.app'],
    linuxInstallPaths: ['/usr/bin/opera'],
    profilePathPatterns: ['%APPDATA%\\Opera Software\\Opera Stable'],
    executableNames: ['opera.exe', 'opera'],
  },
];

/**
 * Get browser definition by type.
 */
export function getBrowserDefinition(type: BrowserType): BrowserDefinition | null {
  return BROWSER_DEFINITIONS.find((b) => b.type === type) ?? null;
}

/**
 * Generate a browser ID.
 */
export function generateBrowserId(type: BrowserType): string {
  return `browser-${type}`;
}

/**
 * Generate a profile ID.
 */
export function generateProfileId(browserId: string, name: string): string {
  return `profile-${browserId}-${name.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

/**
 * Format bytes to human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Calculate days since a date.
 */
export function daysSince(dateString: string | null): number {
  if (!dateString) return Infinity;
  const diff = Date.now() - new Date(dateString).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * Thresholds
 */
export const LARGE_CACHE_THRESHOLD = 200 * 1024 * 1024;
export const EXCESSIVE_COOKIE_THRESHOLD = 500;
export const OLD_HISTORY_THRESHOLD_DAYS = 90;
export const UNUSED_PROFILE_THRESHOLD_DAYS = 30;
export const LARGE_DOWNLOAD_HISTORY_THRESHOLD = 100;
export const UNUSED_EXTENSION_THRESHOLD_DAYS = 90;
export const OUTDATED_BROWSER_THRESHOLD_DAYS = 365;
export const EXCESSIVE_NOTIFICATIONS_THRESHOLD = 20;
export const TRACKING_COOKIE_THRESHOLD = 50;
