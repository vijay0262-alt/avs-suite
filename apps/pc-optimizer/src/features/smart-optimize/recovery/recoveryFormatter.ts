/**
 * Optimization Recovery & Rollback Center — Formatter
 *
 * Formats recovery records, plans, and comparisons as JSON, Markdown,
 * and PDF-ready data models.
 */
import type {
  RecoveryRecord,
  RecoveryPlan,
  RecoveryComparison,
  RecoveryValidationResult,
  RecoveryAnalytics,
  ExportFormat,
} from './types';
import { getRecoveryTypeLabel, getRecoveryStatusLabel } from './types';

export class RecoveryFormatter {
  formatRecovery(
    recovery: RecoveryRecord,
    plan: RecoveryPlan | null,
    format: ExportFormat,
  ): string {
    switch (format) {
      case 'json':
        return JSON.stringify({ recovery, plan }, null, 2);
      case 'markdown':
        return this._formatRecoveryMarkdown(recovery, plan);
      case 'pdf_ready':
        return JSON.stringify(this._formatRecoveryPdf(recovery, plan), null, 2);
      default:
        return JSON.stringify({ recovery, plan }, null, 2);
    }
  }

  formatComparison(comparison: RecoveryComparison, format: ExportFormat): string {
    switch (format) {
      case 'json':
        return JSON.stringify(comparison, null, 2);
      case 'markdown':
        return this._formatComparisonMarkdown(comparison);
      case 'pdf_ready':
        return JSON.stringify(this._formatComparisonPdf(comparison), null, 2);
      default:
        return JSON.stringify(comparison, null, 2);
    }
  }

  formatValidation(result: RecoveryValidationResult, format: ExportFormat): string {
    switch (format) {
      case 'json':
        return JSON.stringify(result, null, 2);
      case 'markdown':
        return this._formatValidationMarkdown(result);
      case 'pdf_ready':
        return JSON.stringify({ validation: result }, null, 2);
      default:
        return JSON.stringify(result, null, 2);
    }
  }

  formatAnalytics(analytics: RecoveryAnalytics, format: ExportFormat): string {
    switch (format) {
      case 'json':
        return JSON.stringify(analytics, null, 2);
      case 'markdown':
        return this._formatAnalyticsMarkdown(analytics);
      case 'pdf_ready':
        return JSON.stringify({ analytics }, null, 2);
      default:
        return JSON.stringify(analytics, null, 2);
    }
  }

  private _formatRecoveryMarkdown(recovery: RecoveryRecord, plan: RecoveryPlan | null): string {
    const lines: string[] = [];
    lines.push(`# Recovery Report: ${recovery.id}`);
    lines.push('');
    lines.push(`**Type:** ${getRecoveryTypeLabel(recovery.recoveryType)}`);
    lines.push(`**Operation:** ${recovery.operationId}`);
    lines.push(`**Snapshot:** ${recovery.snapshotId}`);
    lines.push(`**Created:** ${recovery.createdAt}`);
    lines.push(`**Risk:** ${recovery.estimatedRisk}`);
    lines.push(`**Confidence:** ${(recovery.confidence * 100).toFixed(1)}%`);
    lines.push(`**Estimated Success:** ${(recovery.estimatedSuccess * 100).toFixed(1)}%`);
    lines.push(`**Estimated Duration:** ${recovery.estimatedDuration}ms`);
    lines.push(`**Rollback Depth:** ${recovery.rollbackDepth}`);
    lines.push('');
    lines.push('## Affected Modules');
    for (const mod of recovery.affectedModules) {
      lines.push(`- ${mod}`);
    }
    lines.push('');
    lines.push('## Supporting Evidence');
    for (const ev of recovery.supportingEvidence) {
      lines.push(`- **${ev.source}** / ${ev.metric}: ${ev.value} — ${ev.description}`);
    }
    if (plan) {
      lines.push('');
      lines.push('## Recovery Plan');
      lines.push(`**Steps:** ${plan.steps.length}`);
      lines.push(`**Reason:** ${plan.explainability.reason}`);
      lines.push(`**Estimated Outcome:** ${plan.explainability.estimatedOutcome}`);
      if (plan.explainability.potentialRisks.length > 0) {
        lines.push('');
        lines.push('### Potential Risks');
        for (const risk of plan.explainability.potentialRisks) {
          lines.push(`- ${risk}`);
        }
      }
      if (plan.explainability.alternativeRecovery) {
        lines.push('');
        lines.push(`### Alternative Recovery: ${plan.explainability.alternativeRecovery}`);
      }
    }
    return lines.join('\n');
  }

  private _formatRecoveryPdf(recovery: RecoveryRecord, plan: RecoveryPlan | null): Record<string, unknown> {
    return {
      title: `Recovery Report: ${recovery.id}`,
      type: getRecoveryTypeLabel(recovery.recoveryType),
      operationId: recovery.operationId,
      snapshotId: recovery.snapshotId,
      createdAt: recovery.createdAt,
      risk: recovery.estimatedRisk,
      confidence: recovery.confidence,
      estimatedSuccess: recovery.estimatedSuccess,
      estimatedDuration: recovery.estimatedDuration,
      rollbackDepth: recovery.rollbackDepth,
      affectedModules: recovery.affectedModules,
      evidenceCount: recovery.supportingEvidence.length,
      hasPlan: plan !== null,
      planSteps: plan?.steps.length ?? 0,
      planReason: plan?.explainability.reason ?? '',
    };
  }

  private _formatComparisonMarkdown(comparison: RecoveryComparison): string {
    const lines: string[] = [];
    lines.push(`# Snapshot Comparison: ${comparison.id}`);
    lines.push('');
    lines.push(`**Snapshot A:** ${comparison.snapshotIdA}`);
    lines.push(`**Snapshot B:** ${comparison.snapshotIdB}`);
    lines.push(`**Generated:** ${comparison.generatedAt}`);
    lines.push('');
    lines.push('## Health Comparison');
    lines.push(`- Before: ${comparison.healthComparison.before}`);
    lines.push(`- After: ${comparison.healthComparison.after}`);
    lines.push(`- Delta: ${comparison.healthComparison.delta > 0 ? '+' : ''}${comparison.healthComparison.delta}`);
    lines.push('');
    lines.push('## Performance Comparison');
    lines.push(`- Before: ${comparison.performanceComparison.before}`);
    lines.push(`- After: ${comparison.performanceComparison.after}`);
    lines.push(`- Delta: ${comparison.performanceComparison.delta > 0 ? '+' : ''}${comparison.performanceComparison.delta}`);
    lines.push('');
    lines.push('## Storage Comparison');
    lines.push(`- Before: ${comparison.storageComparison.before} ${comparison.storageComparison.unit}`);
    lines.push(`- After: ${comparison.storageComparison.after} ${comparison.storageComparison.unit}`);
    lines.push(`- Delta: ${comparison.storageComparison.delta > 0 ? '+' : ''}${comparison.storageComparison.delta} ${comparison.storageComparison.unit}`);
    lines.push('');
    if (comparison.configurationDifferences.length > 0) {
      lines.push('## Configuration Differences');
      for (const diff of comparison.configurationDifferences) {
        lines.push(`- **${diff.module}/${diff.setting}:** ${diff.beforeValue} → ${diff.afterValue} (${diff.impact})`);
      }
      lines.push('');
    }
    lines.push('## Summary');
    lines.push(comparison.summary);
    lines.push('');
    lines.push('## Recommendation');
    lines.push(comparison.recommendation);
    return lines.join('\n');
  }

  private _formatComparisonPdf(comparison: RecoveryComparison): Record<string, unknown> {
    return {
      title: 'Snapshot Comparison',
      snapshotA: comparison.snapshotIdA,
      snapshotB: comparison.snapshotIdB,
      healthDelta: comparison.healthComparison.delta,
      performanceDelta: comparison.performanceComparison.delta,
      storageDelta: comparison.storageComparison.delta,
      configDiffCount: comparison.configurationDifferences.length,
      summary: comparison.summary,
      recommendation: comparison.recommendation,
    };
  }

  private _formatValidationMarkdown(result: RecoveryValidationResult): string {
    const lines: string[] = [];
    lines.push(`# Recovery Validation: ${result.valid ? 'VALID' : 'INVALID'}`);
    lines.push('');
    if (result.errors.length > 0) {
      lines.push('## Errors');
      for (const err of result.errors) {
        lines.push(`- **[${err.code}]** ${err.message} (field: ${err.field})`);
      }
      lines.push('');
    }
    if (result.warnings.length > 0) {
      lines.push('## Warnings');
      for (const warn of result.warnings) {
        lines.push(`- **[${warn.code}]** ${warn.message} (field: ${warn.field})`);
      }
      lines.push('');
    }
    lines.push('## Checks');
    for (const check of result.checks) {
      lines.push(`- ${check.passed ? '✓' : '✗'} **${check.name}:** ${check.message}`);
    }
    return lines.join('\n');
  }

  private _formatAnalyticsMarkdown(analytics: RecoveryAnalytics): string {
    const lines: string[] = [];
    lines.push('# Recovery Analytics');
    lines.push('');
    lines.push(`**Total Recoveries:** ${analytics.totalRecoveries}`);
    lines.push(`**Success Rate:** ${(analytics.successRate * 100).toFixed(1)}%`);
    lines.push(`**Average Duration:** ${analytics.averageDuration.toFixed(0)}ms`);
    lines.push(`**Average Confidence:** ${(analytics.averageConfidence * 100).toFixed(1)}%`);
    lines.push('');
    lines.push('## Snapshots');
    lines.push(`- Total: ${analytics.totalSnapshots}`);
    lines.push(`- Available: ${analytics.availableSnapshots}`);
    lines.push(`- Corrupted: ${analytics.corruptedSnapshots}`);
    lines.push(`- Expired: ${analytics.expiredSnapshots}`);
    lines.push(`- Retention Compliance: ${(analytics.retentionCompliance * 100).toFixed(1)}%`);
    lines.push('');
    lines.push('## By Status');
    for (const [status, count] of Object.entries(analytics.byStatus)) {
      lines.push(`- ${getRecoveryStatusLabel(status as never)}: ${count}`);
    }
    lines.push('');
    lines.push('## By Type');
    for (const [type, count] of Object.entries(analytics.byType)) {
      lines.push(`- ${type}: ${count}`);
    }
    return lines.join('\n');
  }
}
