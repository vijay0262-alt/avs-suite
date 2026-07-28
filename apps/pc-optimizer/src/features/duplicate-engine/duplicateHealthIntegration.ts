/**
 * Duplicate Health Integration — provides duplicate health data
 * compatible with the existing AI Health Engine.
 *
 * Produces a health contribution for the 'storage' category
 * that can be consumed by the existing StorageHealthAnalyzer.
 *
 * This module does NOT modify the AI Health Engine architecture.
 */
import type {
  DuplicateAnalysisResult,
  DuplicateHealthContribution,
} from './types';
import type { Severity } from '../ai-health-engine/types';
import { formatBytes } from './types';

export class DuplicateHealthIntegration {
  buildContribution(analysis: DuplicateAnalysisResult): DuplicateHealthContribution {
    const issues = analysis.issues;
    const severity = this._worstSeverity(issues.map((i) => i.severity));

    const recommendations: string[] = [];
    if (analysis.totalWastedSpace > 0) {
      recommendations.push(`Remove duplicate files to recover ${formatBytes(analysis.recoverableSpace)}`);
    }
    if (analysis.totalGroups > 0) {
      recommendations.push(`Review ${analysis.totalGroups} duplicate groups`);
    }
    if (issues.some((i) => i.severity === 'high')) {
      recommendations.push('High-priority: large amount of wasted space from duplicates');
    }
    if (issues.some((i) => !i.autoFixable)) {
      recommendations.push('Review low-confidence duplicate groups manually');
    }
    if (recommendations.length === 0) {
      recommendations.push('No duplicate files detected');
    }

    return {
      categoryId: 'storage',
      categoryName: 'Duplicate Files',
      score: analysis.score,
      severity,
      issues,
      insights: analysis.insights,
      recommendations,
      estimatedRecoverableSpace: analysis.recoverableSpace,
      confidence: analysis.totalGroups > 0 ? 0.85 : 0.5,
      analyzedAt: analysis.analyzedAt,
    };
  }

  buildSummary(analysis: DuplicateAnalysisResult): {
    score: number;
    totalDuplicateFiles: number;
    recoverableSpace: number;
    totalGroups: number;
    severity: Severity;
  } {
    return {
      score: analysis.score,
      totalDuplicateFiles: analysis.totalDuplicateFiles,
      recoverableSpace: analysis.recoverableSpace,
      totalGroups: analysis.totalGroups,
      severity: this._worstSeverity(analysis.issues.map((i) => i.severity)),
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

export const duplicateHealthIntegration = new DuplicateHealthIntegration();
