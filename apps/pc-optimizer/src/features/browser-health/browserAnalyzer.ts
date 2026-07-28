/**
 * Browser Analyzer — comprehensive browser health analysis.
 *
 * Generates:
 *   • Browser Health Score (overall)
 *   • Performance Score
 *   • Privacy Score
 *   • Storage Score
 *   • Security Score
 *
 * Identifies:
 *   • Large cache, excessive cookies, old history
 *   • Unused profiles, large downloads history
 *   • Unused extensions, outdated browsers
 *   • Suspicious extensions, excessive notifications
 *
 * This module does NOT modify any existing architecture.
 */
import type {
  BrowserInfo,
  BrowserProfile,
  BrowserHealthResult,
  BrowserHealthIssue,
} from './types';
import {
  daysSince,
  LARGE_CACHE_THRESHOLD,
  EXCESSIVE_COOKIE_THRESHOLD,
  OLD_HISTORY_THRESHOLD_DAYS,
  UNUSED_PROFILE_THRESHOLD_DAYS,
  LARGE_DOWNLOAD_HISTORY_THRESHOLD,
  OUTDATED_BROWSER_THRESHOLD_DAYS,
  EXCESSIVE_NOTIFICATIONS_THRESHOLD,
} from './types';
import { BrowserRepository } from './browserRepository';
import { PrivacyAnalyzer } from './privacyAnalyzer';
import { BrowserStorageAnalyzer } from './browserStorageAnalyzer';
import { browserEvents } from './browserEvents';

export class BrowserAnalyzer {
  private _repo: BrowserRepository;
  private _privacyAnalyzer: PrivacyAnalyzer;
  private _storageAnalyzer: BrowserStorageAnalyzer;

  constructor(
    repo?: BrowserRepository,
    privacyAnalyzer?: PrivacyAnalyzer,
    storageAnalyzer?: BrowserStorageAnalyzer,
  ) {
    this._repo = repo ?? new BrowserRepository();
    this._privacyAnalyzer = privacyAnalyzer ?? new PrivacyAnalyzer(this._repo);
    this._storageAnalyzer = storageAnalyzer ?? new BrowserStorageAnalyzer(this._repo);
  }

  analyze(): BrowserHealthResult {
    const browsers = this._repo.getAllBrowsers();
    const profiles = this._repo.getAllProfiles();

    const privacyResult = this._privacyAnalyzer.analyze();
    const storageResult = this._storageAnalyzer.analyze();

    const issues = this._identifyIssues(browsers, profiles);
    const performanceScore = this._calculatePerformanceScore(issues);
    const privacyScore = privacyResult.score;
    const storageScore = this._calculateStorageScore(storageResult.grandTotal, issues);
    const securityScore = this._calculateSecurityScore(browsers, profiles, issues);
    const overallScore = Math.round(
      (performanceScore * 0.25 + privacyScore * 0.3 + storageScore * 0.25 + securityScore * 0.2),
    );

    const insights = this._generateInsights(browsers, profiles, storageResult.grandTotal);
    const totalRecoverableSpace = this._estimateRecoverableSpace(storageResult, issues);

    const result: BrowserHealthResult = {
      overallScore,
      performanceScore,
      privacyScore,
      storageScore,
      securityScore,
      issues,
      insights,
      browserCount: browsers.length,
      totalStorageUsed: storageResult.grandTotal,
      totalRecoverableSpace,
      analyzedAt: new Date().toISOString(),
    };

    browserEvents.emit('browser_analysis_completed', { result });
    return result;
  }

  private _identifyIssues(browsers: BrowserInfo[], profiles: BrowserProfile[]): BrowserHealthIssue[] {
    const issues: BrowserHealthIssue[] = [];

    for (const profile of profiles) {
      const browserIds = [profile.browserId];

      if (profile.cacheSize > LARGE_CACHE_THRESHOLD) {
        issues.push({
          type: 'large_cache',
          title: `Large cache in ${profile.name}`,
          description: `Cache size exceeds ${(LARGE_CACHE_THRESHOLD / 1024 / 1024).toFixed(0)} MB.`,
          severity: 'medium',
          impact: 10,
          autoFixable: true,
          affectedBrowserIds: browserIds,
        });
      }

      if (profile.cookieCount > EXCESSIVE_COOKIE_THRESHOLD) {
        issues.push({
          type: 'excessive_cookies',
          title: `Excessive cookies in ${profile.name}`,
          description: `${profile.cookieCount} cookies stored.`,
          severity: 'low',
          impact: 5,
          autoFixable: true,
          affectedBrowserIds: browserIds,
        });
      }

      if (profile.downloadHistoryCount > LARGE_DOWNLOAD_HISTORY_THRESHOLD) {
        issues.push({
          type: 'large_downloads_history',
          title: `Large download history in ${profile.name}`,
          description: `${profile.downloadHistoryCount} downloads in history.`,
          severity: 'low',
          impact: 4,
          autoFixable: true,
          affectedBrowserIds: browserIds,
        });
      }

      const unusedDays = daysSince(profile.lastUsed);
      if (unusedDays > UNUSED_PROFILE_THRESHOLD_DAYS) {
        issues.push({
          type: 'unused_profile',
          title: `Unused profile: ${profile.name}`,
          description: `Not used in ${unusedDays} days.`,
          severity: 'low',
          impact: 3,
          autoFixable: false,
          affectedBrowserIds: browserIds,
        });
      }

      const grantedNotifications = profile.notificationPermissions.filter((n) => n.permission === 'granted');
      if (grantedNotifications.length > EXCESSIVE_NOTIFICATIONS_THRESHOLD) {
        issues.push({
          type: 'excessive_notifications',
          title: `Excessive notifications in ${profile.name}`,
          description: `${grantedNotifications.length} sites have notification access.`,
          severity: 'medium',
          impact: 6,
          autoFixable: false,
          affectedBrowserIds: browserIds,
        });
      }

      const suspicious = profile.extensions.filter((e) => e.isSuspicious);
      for (const ext of suspicious) {
        issues.push({
          type: 'suspicious_extension',
          title: `Suspicious extension: ${ext.name}`,
          description: `Extension "${ext.name}" has been flagged as potentially suspicious.`,
          severity: 'high',
          impact: 15,
          autoFixable: false,
          affectedBrowserIds: browserIds,
        });
      }
    }

    for (const browser of browsers) {
      const browserIds = [browser.id];
      const lastUsedDays = daysSince(browser.lastUsed);
      if (lastUsedDays > OLD_HISTORY_THRESHOLD_DAYS) {
        issues.push({
          type: 'old_history',
          title: `Old history in ${browser.name}`,
          description: `Browser not used in ${lastUsedDays} days.`,
          severity: 'low',
          impact: 5,
          autoFixable: true,
          affectedBrowserIds: browserIds,
        });
      }

      if (lastUsedDays > OUTDATED_BROWSER_THRESHOLD_DAYS) {
        issues.push({
          type: 'outdated_browser',
          title: `Outdated browser: ${browser.name}`,
          description: `${browser.name} hasn't been updated in ${lastUsedDays} days.`,
          severity: 'medium',
          impact: 8,
          autoFixable: false,
          affectedBrowserIds: browserIds,
        });
      }
    }

    return issues;
  }

  private _calculatePerformanceScore(issues: BrowserHealthIssue[]): number {
    let score = 100;
    for (const issue of issues) {
      if (issue.type === 'large_cache' || issue.type === 'unused_extensions' || issue.type === 'large_downloads_history') {
        score -= issue.impact;
      }
    }
    return Math.max(0, Math.min(100, score));
  }

  private _calculateStorageScore(totalStorage: number, issues: BrowserHealthIssue[]): number {
    let score = 100;
    const gb = totalStorage / (1024 * 1024 * 1024);
    score -= Math.min(30, gb * 5);
    for (const issue of issues) {
      if (issue.type === 'large_cache' || issue.type === 'excessive_cookies') {
        score -= issue.impact;
      }
    }
    return Math.max(0, Math.min(100, score));
  }

  private _calculateSecurityScore(
    browsers: BrowserInfo[],
    profiles: BrowserProfile[],
    issues: BrowserHealthIssue[],
  ): number {
    let score = 100;
    for (const issue of issues) {
      if (issue.type === 'suspicious_extension' || issue.type === 'outdated_browser' || issue.type === 'excessive_notifications') {
        score -= issue.impact;
      }
    }
    return Math.max(0, Math.min(100, score));
  }

  private _generateInsights(
    browsers: BrowserInfo[],
    profiles: BrowserProfile[],
    totalStorage: number,
  ): string[] {
    const insights: string[] = [];
    insights.push(`Found ${browsers.length} browsers with ${profiles.length} profiles.`);
    insights.push(`Total browser storage: ${(totalStorage / 1024 / 1024).toFixed(1)} MB.`);
    const defaultBrowser = browsers.find((b) => b.isDefault);
    if (defaultBrowser) {
      insights.push(`Default browser: ${defaultBrowser.name}.`);
    }
    const totalExtensions = profiles.reduce((sum, p) => sum + p.extensionCount, 0);
    if (totalExtensions > 0) {
      insights.push(`${totalExtensions} browser extensions installed across all profiles.`);
    }
    return insights;
  }

  private _estimateRecoverableSpace(
    storage: { totalCacheSize: number; totalCookiesSize: number; totalHistoryDbSize: number; totalDownloadsHistorySize: number },
    issues: BrowserHealthIssue[],
  ): number {
    let recoverable = 0;
    if (issues.some((i) => i.type === 'large_cache')) {
      recoverable += storage.totalCacheSize;
    }
    recoverable += Math.floor(storage.totalCookiesSize * 0.8);
    if (issues.some((i) => i.type === 'old_history')) {
      recoverable += storage.totalHistoryDbSize;
    }
    recoverable += storage.totalDownloadsHistorySize;
    return recoverable;
  }
}

export const browserAnalyzer = new BrowserAnalyzer();
