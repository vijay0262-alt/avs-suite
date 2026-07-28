/**
 * Update Analyzer — analyzes Windows Update status.
 *
 * Evaluates:
 *   • Pending updates (security, feature, optional)
 *   • Failed updates
 *   • Overdue updates
 *   • Restart required
 *   • Update service status
 *   • Paused updates
 *   • Delivery optimization
 *
 * This module does NOT modify any existing architecture.
 */
import type {
  UpdateAnalysisResult,
  WindowsHealthIssue,
} from './types';
import { OVERDUE_UPDATE_THRESHOLD_DAYS } from './types';
import { WindowsRepository } from './windowsRepository';

export class UpdateAnalyzer {
  private _repo: WindowsRepository;

  constructor(repo?: WindowsRepository) {
    this._repo = repo ?? new WindowsRepository();
  }

  analyze(): UpdateAnalysisResult {
    const status = this._repo.getUpdateStatus();
    if (!status) {
      return this._emptyResult();
    }

    const issues: WindowsHealthIssue[] = [];

    if (!status.serviceEnabled) {
      issues.push({
        type: 'update_service_disabled',
        title: 'Windows Update service is disabled',
        description: 'Windows Update service is not running. Security patches will not be installed.',
        severity: 'critical',
        impact: 25,
        autoFixable: false,
      });
    }

    if (status.pausedUpdates) {
      issues.push({
        type: 'paused_updates',
        title: 'Windows Updates are paused',
        description: 'Updates are paused. Resume to receive security patches.',
        severity: 'medium',
        impact: 10,
        autoFixable: false,
      });
    }

    if (status.securityUpdatesPending > 0) {
      issues.push({
        type: 'pending_updates',
        title: `${status.securityUpdatesPending} security updates pending`,
        description: 'Security updates are waiting to be installed.',
        severity: 'high',
        impact: 20,
        autoFixable: false,
      });
    } else if (status.pendingUpdates.length > 0) {
      issues.push({
        type: 'pending_updates',
        title: `${status.pendingUpdates.length} updates pending`,
        description: 'Windows updates are pending installation.',
        severity: 'medium',
        impact: 10,
        autoFixable: false,
      });
    }

    if (status.failedUpdates.length > 0) {
      issues.push({
        type: 'failed_updates',
        title: `${status.failedUpdates.length} failed updates`,
        description: 'Some updates failed to install. Retry installation recommended.',
        severity: 'medium',
        impact: 8,
        autoFixable: false,
      });
    }

    if (status.daysSinceLastUpdate > OVERDUE_UPDATE_THRESHOLD_DAYS) {
      issues.push({
        type: 'overdue_updates',
        title: 'Windows updates are overdue',
        description: `Last update was ${status.daysSinceLastUpdate} days ago. Security patches may be missing.`,
        severity: 'high',
        impact: 15,
        autoFixable: false,
      });
    }

    if (status.restartRequired) {
      issues.push({
        type: 'restart_required',
        title: 'Restart required',
        description: 'A restart is required to complete pending updates.',
        severity: 'medium',
        impact: 8,
        autoFixable: false,
      });
    }

    const score = this._calculateScore(issues);
    const recommendations = this._generateRecommendations(issues);

    return {
      score,
      issues,
      recommendations,
      pendingCount: status.pendingUpdates.length,
      failedCount: status.failedUpdates.length,
      securityPendingCount: status.securityUpdatesPending,
      restartRequired: status.restartRequired,
      analyzedAt: new Date().toISOString(),
    };
  }

  private _calculateScore(issues: WindowsHealthIssue[]): number {
    let score = 100;
    for (const issue of issues) {
      score -= issue.impact;
    }
    return Math.max(0, Math.min(100, score));
  }

  private _generateRecommendations(issues: WindowsHealthIssue[]): string[] {
    if (issues.length === 0) return ['System is up to date'];
    const recs: string[] = [];
    for (const issue of issues) {
      recs.push(issue.title);
    }
    return recs;
  }

  private _emptyResult(): UpdateAnalysisResult {
    return {
      score: 100,
      issues: [],
      recommendations: ['Update status unavailable'],
      pendingCount: 0,
      failedCount: 0,
      securityPendingCount: 0,
      restartRequired: false,
      analyzedAt: new Date().toISOString(),
    };
  }
}

export const updateAnalyzer = new UpdateAnalyzer();
