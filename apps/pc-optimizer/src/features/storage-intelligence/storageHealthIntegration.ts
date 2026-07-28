/**
 * Storage Health Integration — provides storage health data
 * compatible with the existing AI Health Engine.
 *
 * Produces:
 *   • Storage Health Score (0–100)
 *   • Storage Insights
 *   • Storage Issues
 *   • Estimated Recoverable Space
 *   • Recommendations for the health engine
 *
 * This module does NOT modify the AI Health Engine architecture.
 * It provides data that the existing StorageHealthAnalyzer can consume.
 */
import type {
  StorageAnalysis,
  StorageHealthContribution,
  StorageHealthIssue,
  StorageRecommendation,
} from './types';
import type { Severity } from '../ai-health-engine/types';

export class StorageHealthIntegration {
  /**
   * Build a health contribution from storage analysis and recommendations.
   */
  buildContribution(
    analysis: StorageAnalysis,
    recommendations: StorageRecommendation[],
  ): StorageHealthContribution {
    const issues = this._identifyIssues(analysis, recommendations);
    const insights = this._generateInsights(analysis, recommendations);
    const score = this._calculateScore(analysis, recommendations, issues);
    const severity = this._worstSeverity(issues);
    const estimatedRecoverableSpace = this._estimateRecoverableSpace(recommendations);

    return {
      categoryId: 'storage',
      categoryName: 'Storage Intelligence',
      score,
      severity,
      issues,
      insights,
      recommendations: recommendations.map((r) => r.title),
      estimatedRecoverableSpace,
      confidence: analysis.totalFileCount > 0 ? 0.9 : 0.3,
      analyzedAt: analysis.analyzedAt,
    };
  }

  // ── Internal ────────────────────────────────────────────────

  private _identifyIssues(
    analysis: StorageAnalysis,
    recommendations: StorageRecommendation[],
  ): StorageHealthIssue[] {
    const issues: StorageHealthIssue[] = [];

    // Large amount of temporary files
    const tempRec = recommendations.find((r) => r.type === 'temp_cleanup');
    if (tempRec && tempRec.estimatedRecovery > 500 * 1024 * 1024) {
      issues.push({
        title: 'Excessive temporary files',
        description: `${this._formatBytes(tempRec.estimatedRecovery)} of temporary files can be cleaned.`,
        severity: 'high',
        impact: 15,
        autoFixable: true,
      });
    }

    // Old installers
    const installerRec = recommendations.find((r) => r.type === 'old_installer_cleanup');
    if (installerRec && installerRec.estimatedRecovery > 200 * 1024 * 1024) {
      issues.push({
        title: 'Old installer files',
        description: `${this._formatBytes(installerRec.estimatedRecovery)} of old installers can be reviewed.`,
        severity: 'medium',
        impact: 8,
        autoFixable: false,
      });
    }

    // Download folder bloat
    const downloadRec = recommendations.find((r) => r.type === 'download_cleanup');
    if (downloadRec && downloadRec.estimatedRecovery > 1024 * 1024 * 1024) {
      issues.push({
        title: 'Download folder needs cleanup',
        description: `${this._formatBytes(downloadRec.estimatedRecovery)} in Downloads folder.`,
        severity: 'medium',
        impact: 10,
        autoFixable: false,
      });
    }

    // Duplicate files
    if (analysis.duplicateGroups.length > 5) {
      const wastedSpace = analysis.duplicateGroups.reduce((sum, g) => sum + g.wastedSpace, 0);
      issues.push({
        title: 'Duplicate files detected',
        description: `${analysis.duplicateGroups.length} duplicate groups wasting ${this._formatBytes(wastedSpace)}.`,
        severity: 'medium',
        impact: 12,
        autoFixable: false,
      });
    }

    // Empty folders
    if (analysis.emptyFolders.length > 20) {
      issues.push({
        title: 'Many empty folders',
        description: `${analysis.emptyFolders.length} empty folders can be removed.`,
        severity: 'low',
        impact: 3,
        autoFixable: true,
      });
    }

    // Unused large files
    if (analysis.unusedLargeFiles.length > 10) {
      const totalSize = analysis.unusedLargeFiles.reduce((sum, lf) => sum + lf.entry.size, 0);
      issues.push({
        title: 'Unused large files',
        description: `${analysis.unusedLargeFiles.length} large files not accessed in 90+ days (${this._formatBytes(totalSize)}).`,
        severity: 'low',
        impact: 5,
        autoFixable: false,
      });
    }

    return issues;
  }

  private _generateInsights(
    analysis: StorageAnalysis,
    recommendations: StorageRecommendation[],
  ): string[] {
    const insights: string[] = [];

    // Total storage analyzed
    insights.push(`Analyzed ${analysis.totalFileCount} files totaling ${this._formatBytes(analysis.totalAnalyzedSize)}.`);

    // Largest category
    const categoryEntries = Object.entries(analysis.storageByCategory)
      .filter(([, size]) => size > 0)
      .sort(([, a], [, b]) => b - a);
    if (categoryEntries.length > 0) {
      const [topCategory, topSize] = categoryEntries[0]!;
      insights.push(`${topCategory} files occupy the most space (${this._formatBytes(topSize)}).`);
    }

    // Recoverable space
    const totalRecoverable = recommendations.reduce((sum, r) => sum + r.estimatedRecovery, 0);
    if (totalRecoverable > 0) {
      insights.push(`${this._formatBytes(totalRecoverable)} can potentially be recovered through cleanup.`);
    }

    // Auto-fixable recommendations
    const autoFixable = recommendations.filter((r) => r.autoFixable);
    if (autoFixable.length > 0) {
      insights.push(`${autoFixable.length} recommendations can be automatically applied.`);
    }

    // Review required
    const reviewRequired = recommendations.filter((r) => r.reviewRequired);
    if (reviewRequired.length > 0) {
      insights.push(`${reviewRequired.length} recommendations require manual review.`);
    }

    return insights;
  }

  private _calculateScore(
    analysis: StorageAnalysis,
    recommendations: StorageRecommendation[],
    issues: StorageHealthIssue[],
  ): number {
    let score = 100;

    // Deduct based on issues
    for (const issue of issues) {
      score -= issue.impact;
    }

    // Deduct based on recoverable space (1 point per GB, max 20)
    const totalRecoverable = recommendations.reduce((sum, r) => sum + r.estimatedRecovery, 0);
    const recoverableGB = totalRecoverable / (1024 * 1024 * 1024);
    score -= Math.min(20, recoverableGB);

    // Bonus for clean system
    if (issues.length === 0 && totalRecoverable < 100 * 1024 * 1024) {
      score = Math.min(100, score + 5);
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private _worstSeverity(issues: StorageHealthIssue[]): Severity {
    const order: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
    for (const sev of order) {
      if (issues.some((i) => i.severity === sev)) return sev;
    }
    return 'info';
  }

  private _estimateRecoverableSpace(recommendations: StorageRecommendation[]): number {
    return recommendations
      .filter((r) => r.autoFixable)
      .reduce((sum, r) => sum + r.estimatedRecovery, 0);
  }

  private _formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }
}

export const storageHealthIntegration = new StorageHealthIntegration();
