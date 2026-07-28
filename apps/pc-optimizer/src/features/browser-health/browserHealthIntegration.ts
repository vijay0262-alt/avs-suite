/**
 * Browser Health Integration — provides browser and privacy health data
 * compatible with the existing AI Health Engine.
 *
 * Produces:
 *   • BrowserHealthContribution (for 'browser' category)
 *   • PrivacyHealthContribution (for 'privacy' category)
 *
 * This module does NOT modify the AI Health Engine architecture.
 * It provides data that the existing BrowserHealthAnalyzer and
 * PrivacyAnalyzer can consume.
 */
import type {
  BrowserHealthResult,
  BrowserHealthContribution,
  PrivacyHealthContribution,
  PrivacyAnalysis,
} from './types';
import type { Severity } from '../ai-health-engine/types';

export class BrowserHealthIntegration {
  buildBrowserContribution(health: BrowserHealthResult): BrowserHealthContribution {
    return {
      categoryId: 'browser',
      categoryName: 'Browser Health',
      score: health.overallScore,
      severity: this._worstSeverity(health.issues.map((i) => i.severity)),
      issues: health.issues,
      insights: health.insights,
      recommendations: health.issues.length > 0
        ? ['Clear browser cache regularly', 'Review browser extensions', 'Update outdated browsers']
        : ['Browser health is good'],
      estimatedRecoverableSpace: health.totalRecoverableSpace,
      confidence: health.browserCount > 0 ? 0.85 : 0.3,
      analyzedAt: health.analyzedAt,
    };
  }

  buildPrivacyContribution(privacy: PrivacyAnalysis): PrivacyHealthContribution {
    return {
      categoryId: 'privacy',
      categoryName: 'Privacy',
      score: privacy.score,
      severity: this._worstSeverity(privacy.issues.map((i) => i.severity)),
      issues: privacy.issues,
      insights: privacy.insights,
      recommendations: privacy.recommendations,
      confidence: privacy.totalCookieCount > 0 ? 0.8 : 0.4,
      analyzedAt: privacy.analyzedAt,
    };
  }

  private _worstSeverity(severities: Severity[]): Severity {
    const order: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
    for (const sev of order) {
      if (severities.includes(sev)) return sev;
    }
    return 'info';
  }
}

export const browserHealthIntegration = new BrowserHealthIntegration();
