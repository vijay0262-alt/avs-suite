/**
 * Health Delta Analyzer — analyzes health score changes.
 *
 * Computes before → after delta, trend, confidence, and reason for change.
 */
import type { HealthDeltaAnalysis, DeltaContext } from './types';
import { determineTrend } from './types';
import type { PipelineExecution } from '../execution-pipeline/types';

export class HealthDeltaAnalyzer {
  analyze(execution: PipelineExecution, _context?: DeltaContext): HealthDeltaAnalysis {
    const before = execution.healthBefore;
    const after = execution.healthAfter;
    const delta = before !== null && after !== null ? after - before : null;
    const trend = determineTrend(before, after);

    return {
      before,
      after,
      delta,
      confidence: this._computeConfidence(execution),
      reasonForChange: this._describeReason(execution, delta, trend),
      trend,
      contributingFactors: this._identifyFactors(execution),
    };
  }

  private _computeConfidence(execution: PipelineExecution): number {
    const total = execution.stepResults.length;
    if (total === 0) return 0;
    const completed = execution.stepResults.filter((s) => s.status === 'completed').length;
    return Math.round((completed / total) * 100) / 100;
  }

  private _describeReason(
    execution: PipelineExecution,
    delta: number | null,
    trend: string,
  ): string {
    if (delta === null) return 'Health change could not be determined';
    if (trend === 'unchanged') return 'Health score remained stable after optimization';
    if (trend === 'improved') {
      const completed = execution.stepResults.filter((s) => s.status === 'completed').length;
      return `Health improved by ${delta} points due to ${completed} completed optimization action${completed !== 1 ? 's' : ''}`;
    }
    if (trend === 'declined') {
      const failed = execution.stepResults.filter((s) => s.status === 'failed').length;
      return `Health declined by ${Math.abs(delta)} points${failed > 0 ? ` due to ${failed} failed action${failed !== 1 ? 's' : ''}` : ''}`;
    }
    return 'Health change reason unknown';
  }

  private _identifyFactors(execution: PipelineExecution): string[] {
    const factors: string[] = [];
    const completed = execution.stepResults.filter((s) => s.status === 'completed');
    const failed = execution.stepResults.filter((s) => s.status === 'failed');
    const skipped = execution.stepResults.filter((s) => s.status === 'skipped');

    if (completed.length > 0) factors.push(`${completed.length} actions completed successfully`);
    if (failed.length > 0) factors.push(`${failed.length} actions failed`);
    if (skipped.length > 0) factors.push(`${skipped.length} actions skipped`);
    if (execution.warnings.length > 0) factors.push(`${execution.warnings.length} warnings during execution`);

    return factors;
  }
}
