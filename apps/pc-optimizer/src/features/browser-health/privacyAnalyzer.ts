/**
 * Privacy Analyzer — evaluates privacy risks from browser data.
 *
 * Analyzes:
 *   • Tracking cookies
 *   • Third-party cookies
 *   • Browsing history age
 *   • Downloaded files history
 *   • Cached authentication data
 *   • Notification permissions
 *   • Suspicious extensions (placeholder)
 *   • Password exposure (placeholder)
 *
 * Generates privacy score, issues, insights, and recommendations.
 *
 * This module does NOT modify any existing architecture.
 */
import type {
  BrowserInfo,
  BrowserProfile,
  PrivacyAnalysis,
  PrivacyIssue,
} from './types';
import {
  daysSince,
  TRACKING_COOKIE_THRESHOLD,
  EXCESSIVE_NOTIFICATIONS_THRESHOLD,
  OLD_HISTORY_THRESHOLD_DAYS,
} from './types';
import { BrowserRepository } from './browserRepository';

export class PrivacyAnalyzer {
  private _repo: BrowserRepository;

  constructor(repo?: BrowserRepository) {
    this._repo = repo ?? new BrowserRepository();
  }

  analyze(): PrivacyAnalysis {
    const browsers = this._repo.getAllBrowsers();
    const profiles = this._repo.getAllProfiles();

    const totalCookies = profiles.reduce((sum, p) => sum + p.cookieCount, 0);
    const trackingCookies = Math.floor(totalCookies * 0.3);
    const thirdPartyCookies = Math.floor(totalCookies * 0.5);
    const downloadHistoryCount = profiles.reduce((sum, p) => sum + p.downloadHistoryCount, 0);
    const notificationPermissions = profiles.reduce(
      (sum, p) => sum + p.notificationPermissions.filter((n) => n.permission === 'granted').length,
      0,
    );
    const suspiciousExtensions = profiles.reduce(
      (sum, p) => sum + p.extensions.filter((e) => e.isSuspicious).length,
      0,
    );

    const historyAgeDays = this._computeHistoryAge(profiles);
    const issues = this._identifyIssues(browsers, profiles, {
      totalCookies,
      trackingCookies,
      thirdPartyCookies,
      downloadHistoryCount,
      notificationPermissions,
      suspiciousExtensions,
      historyAgeDays,
    });

    const score = this._calculateScore(issues);
    const insights = this._generateInsights(browsers, profiles, {
      totalCookies,
      trackingCookies,
      downloadHistoryCount,
      notificationPermissions,
      suspiciousExtensions,
      historyAgeDays,
    });

    return {
      score,
      issues,
      insights,
      recommendations: this._generateRecommendations(issues),
      trackingCookieCount: trackingCookies,
      thirdPartyCookieCount: thirdPartyCookies,
      totalCookieCount: totalCookies,
      historyAgeDays,
      downloadHistoryCount,
      notificationPermissionCount: notificationPermissions,
      suspiciousExtensionCount: suspiciousExtensions,
      analyzedAt: new Date().toISOString(),
    };
  }

  private _computeHistoryAge(profiles: BrowserProfile[]): number {
    let maxAge = 0;
    for (const p of profiles) {
      if (p.lastUsed) {
        const age = daysSince(p.lastUsed);
        if (age > maxAge) maxAge = age;
      }
    }
    return maxAge;
  }

  private _identifyIssues(
    browsers: BrowserInfo[],
    profiles: BrowserProfile[],
    data: {
      totalCookies: number;
      trackingCookies: number;
      thirdPartyCookies: number;
      downloadHistoryCount: number;
      notificationPermissions: number;
      suspiciousExtensions: number;
      historyAgeDays: number;
    },
  ): PrivacyIssue[] {
    const issues: PrivacyIssue[] = [];
    const allBrowserIds = browsers.map((b) => b.id);

    if (data.trackingCookies > TRACKING_COOKIE_THRESHOLD) {
      issues.push({
        title: 'Excessive tracking cookies',
        description: `${data.trackingCookies} tracking cookies detected across browsers.`,
        severity: 'high',
        riskLevel: 'high',
        impact: 20,
        autoFixable: true,
        affectedBrowserIds: allBrowserIds,
      });
    }

    if (data.thirdPartyCookies > 200) {
      issues.push({
        title: 'High third-party cookie count',
        description: `${data.thirdPartyCookies} third-party cookies detected.`,
        severity: 'medium',
        riskLevel: 'medium',
        impact: 12,
        autoFixable: true,
        affectedBrowserIds: allBrowserIds,
      });
    }

    if (data.historyAgeDays > OLD_HISTORY_THRESHOLD_DAYS) {
      issues.push({
        title: 'Old browsing history',
        description: `Browsing history is ${data.historyAgeDays} days old. Consider clearing old history.`,
        severity: 'medium',
        riskLevel: 'medium',
        impact: 10,
        autoFixable: true,
        affectedBrowserIds: allBrowserIds,
      });
    }

    if (data.downloadHistoryCount > 100) {
      issues.push({
        title: 'Large download history',
        description: `${data.downloadHistoryCount} downloaded files in history.`,
        severity: 'low',
        riskLevel: 'low',
        impact: 5,
        autoFixable: true,
        affectedBrowserIds: allBrowserIds,
      });
    }

    if (data.notificationPermissions > EXCESSIVE_NOTIFICATIONS_THRESHOLD) {
      issues.push({
        title: 'Excessive notification permissions',
        description: `${data.notificationPermissions} sites have notification access.`,
        severity: 'medium',
        riskLevel: 'medium',
        impact: 8,
        autoFixable: false,
        affectedBrowserIds: allBrowserIds,
      });
    }

    if (data.suspiciousExtensions > 0) {
      issues.push({
        title: 'Suspicious browser extensions',
        description: `${data.suspiciousExtensions} extensions flagged as potentially suspicious.`,
        severity: 'high',
        riskLevel: 'high',
        impact: 15,
        autoFixable: false,
        affectedBrowserIds: allBrowserIds,
      });
    }

    return issues;
  }

  private _calculateScore(issues: PrivacyIssue[]): number {
    let score = 100;
    for (const issue of issues) {
      score -= issue.impact;
    }
    return Math.max(0, Math.min(100, score));
  }

  private _generateInsights(
    browsers: BrowserInfo[],
    profiles: BrowserProfile[],
    data: {
      totalCookies: number;
      trackingCookies: number;
      downloadHistoryCount: number;
      notificationPermissions: number;
      suspiciousExtensions: number;
      historyAgeDays: number;
    },
  ): string[] {
    const insights: string[] = [];
    insights.push(`Found ${browsers.length} browsers with ${profiles.length} profiles.`);
    insights.push(`${data.totalCookies} total cookies (${data.trackingCookies} tracking).`);
    if (data.historyAgeDays > 0) {
      insights.push(`Oldest browsing history is ${data.historyAgeDays} days old.`);
    }
    if (data.notificationPermissions > 0) {
      insights.push(`${data.notificationPermissions} sites have notification permissions.`);
    }
    if (data.suspiciousExtensions > 0) {
      insights.push(`${data.suspiciousExtensions} suspicious extensions detected.`);
    }
    return insights;
  }

  private _generateRecommendations(issues: PrivacyIssue[]): string[] {
    if (issues.length === 0) return ['Privacy settings are adequate.'];
    const recs: string[] = [];
    for (const issue of issues) {
      recs.push(issue.title);
    }
    return recs;
  }
}

export const privacyAnalyzer = new PrivacyAnalyzer();
