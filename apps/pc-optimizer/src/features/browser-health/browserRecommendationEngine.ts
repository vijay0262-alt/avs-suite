/**
 * Browser Recommendation Engine — generates cleanup recommendations
 * from browser health analysis and privacy analysis.
 *
 * 8 recommendation types:
 *   • Cache cleanup
 *   • Cookie cleanup
 *   • History cleanup
 *   • Download history cleanup
 *   • Unused profile review
 *   • Extension review
 *   • Browser update reminder
 *   • Notification review
 *
 * This module does NOT modify any existing architecture.
 */
import type {
  BrowserHealthResult,
  BrowserRecommendation,
  BrowserRecommendationType,
  RiskLevel,
  RecommendationPriority,
  PrivacyAnalysis,
  BrowserStorageAnalysis,
} from './types';
import { formatBytes } from './types';

let _recCounter = 0;

function generateRecId(): string {
  _recCounter += 1;
  return `browser-rec-${Date.now().toString(36)}-${_recCounter}`;
}

export class BrowserRecommendationEngine {
  generate(
    health: BrowserHealthResult,
    privacy: PrivacyAnalysis,
    storage: BrowserStorageAnalysis,
  ): BrowserRecommendation[] {
    const recs: BrowserRecommendation[] = [];

    // Cache cleanup
    if (storage.totalCacheSize > 0) {
      recs.push(this._create(
        'cache_cleanup',
        'Browser Cache Cleanup',
        `Clear ${formatBytes(storage.totalCacheSize)} of browser cache across all browsers.`,
        storage.totalCacheSize,
        10,
        20,
        'none',
        'high',
        false,
        [],
        [],
      ));
    }

    // Cookie cleanup
    if (privacy.totalCookieCount > 0) {
      recs.push(this._create(
        'cookie_cleanup',
        'Cookie Cleanup',
        `Remove ${privacy.totalCookieCount} cookies (${privacy.trackingCookieCount} tracking).`,
        Math.floor(privacy.totalCookieCount * 512),
        25,
        5,
        'medium',
        'medium',
        true,
        [],
        [],
      ));
    }

    // History cleanup
    if (privacy.historyAgeDays > 90) {
      recs.push(this._create(
        'history_cleanup',
        'Browsing History Cleanup',
        `Clear browsing history older than ${privacy.historyAgeDays} days.`,
        storage.totalHistoryDbSize,
        20,
        2,
        'medium',
        'medium',
        true,
        [],
        [],
      ));
    }

    // Download history cleanup
    if (privacy.downloadHistoryCount > 0) {
      recs.push(this._create(
        'download_history_cleanup',
        'Download History Cleanup',
        `Clear ${privacy.downloadHistoryCount} download history entries.`,
        storage.totalDownloadsHistorySize,
        5,
        3,
        'low',
        'low',
        false,
        [],
        [],
      ));
    }

    // Unused profile review
    const unusedProfileIssues = health.issues.filter((i) => i.type === 'unused_profile');
    if (unusedProfileIssues.length > 0) {
      recs.push(this._create(
        'unused_profile_review',
        'Unused Profile Review',
        `${unusedProfileIssues.length} browser profiles haven't been used recently.`,
        0,
        0,
        5,
        'low',
        'low',
        true,
        unusedProfileIssues.flatMap((i) => i.affectedBrowserIds),
        [],
      ));
    }

    // Extension review
    const suspiciousIssues = health.issues.filter((i) => i.type === 'suspicious_extension');
    if (suspiciousIssues.length > 0) {
      recs.push(this._create(
        'extension_review',
        'Extension Review',
        `${suspiciousIssues.length} suspicious extensions detected. Review and remove.`,
        0,
        15,
        5,
        'high',
        'high',
        true,
        suspiciousIssues.flatMap((i) => i.affectedBrowserIds),
        [],
      ));
    }

    // Browser update
    const outdatedIssues = health.issues.filter((i) => i.type === 'outdated_browser');
    if (outdatedIssues.length > 0) {
      recs.push(this._create(
        'browser_update',
        'Browser Update Reminder',
        `${outdatedIssues.length} browsers are outdated. Update for security and performance.`,
        0,
        10,
        15,
        'none',
        'medium',
        true,
        outdatedIssues.flatMap((i) => i.affectedBrowserIds),
        [],
      ));
    }

    // Notification review
    if (privacy.notificationPermissionCount > 20) {
      recs.push(this._create(
        'notification_review',
        'Notification Permission Review',
        `${privacy.notificationPermissionCount} sites have notification access. Review permissions.`,
        0,
        8,
        0,
        'low',
        'low',
        true,
        [],
        [],
      ));
    }

    // Sort by priority
    const priorityOrder: Record<RecommendationPriority, number> = {
      critical: 0, high: 1, medium: 2, low: 3,
    };
    recs.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return recs;
  }

  filterByType(recs: BrowserRecommendation[], type: BrowserRecommendationType): BrowserRecommendation[] {
    return recs.filter((r) => r.type === type);
  }

  getAutoFixable(recs: BrowserRecommendation[]): BrowserRecommendation[] {
    return recs.filter((r) => !r.reviewRequired);
  }

  getReviewRequired(recs: BrowserRecommendation[]): BrowserRecommendation[] {
    return recs.filter((r) => r.reviewRequired);
  }

  getTotalEstimatedRecovery(recs: BrowserRecommendation[]): number {
    return recs.reduce((sum, r) => sum + r.estimatedRecovery, 0);
  }

  private _create(
    type: BrowserRecommendationType,
    title: string,
    description: string,
    estimatedRecovery: number,
    privacyImprovement: number,
    performanceImprovement: number,
    risk: RiskLevel,
    priority: RecommendationPriority,
    reviewRequired: boolean,
    affectedBrowserIds: string[],
    affectedProfileIds: string[],
  ): BrowserRecommendation {
    return {
      id: generateRecId(),
      type,
      title,
      description,
      estimatedRecovery,
      privacyImprovement,
      performanceImprovement,
      risk,
      priority,
      reviewRequired,
      affectedBrowserIds,
      affectedProfileIds,
      requiresConfirmation: type === 'history_cleanup' || type === 'cookie_cleanup',
    };
  }
}

export const browserRecommendationEngine = new BrowserRecommendationEngine();
