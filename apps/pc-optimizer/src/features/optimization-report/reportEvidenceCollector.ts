/**
 * Report Evidence Collector — collects evidence from execution results.
 *
 * Every claim in the report must be traceable to evidence.
 * The AI must never invent information.
 */
import type { ExecutionReport, ExecutionStepResult } from '../execution-pipeline/types';
import type { ReportEvidence } from './types';

export class ReportEvidenceCollector {
  collectFromExecution(executionReport: ExecutionReport): ReportEvidence[] {
    const evidence: ReportEvidence[] = [];

    for (const step of executionReport.completedSteps) {
      evidence.push(...this.collectFromStep(step));
    }

    for (const ev of executionReport.evidence) {
      evidence.push({
        source: ev.source,
        metric: ev.metric,
        value: ev.value,
        timestamp: ev.timestamp,
        description: `${ev.metric}: ${ev.value}`,
      });
    }

    if (executionReport.healthBefore !== null && executionReport.healthAfter !== null) {
      evidence.push({
        source: 'health_engine',
        metric: 'health_score',
        value: executionReport.healthAfter,
        timestamp: executionReport.generatedAt,
        description: `Health score changed from ${executionReport.healthBefore} to ${executionReport.healthAfter}`,
      });
    }

    if (executionReport.storageRecovered > 0) {
      evidence.push({
        source: 'execution_pipeline',
        metric: 'storage_recovered',
        value: executionReport.storageRecovered,
        timestamp: executionReport.generatedAt,
        description: `${executionReport.storageRecovered} bytes recovered`,
      });
    }

    return evidence;
  }

  collectFromStep(step: ExecutionStepResult): ReportEvidence[] {
    const evidence: ReportEvidence[] = [];

    evidence.push({
      source: 'execution_pipeline',
      metric: 'step_status',
      value: step.status,
      timestamp: step.completedAt ?? new Date().toISOString(),
      description: `Step "${step.stepTitle}" status: ${step.status}`,
    });

    if (step.durationMs > 0) {
      evidence.push({
        source: 'execution_pipeline',
        metric: 'step_duration',
        value: step.durationMs,
        timestamp: step.completedAt ?? new Date().toISOString(),
        description: `Step "${step.stepTitle}" took ${step.durationMs}ms`,
      });
    }

    for (const [key, value] of Object.entries(step.output)) {
      evidence.push({
        source: 'execution_pipeline',
        metric: `step_output_${key}`,
        value: typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : JSON.stringify(value),
        timestamp: step.completedAt ?? new Date().toISOString(),
        description: `Step "${step.stepTitle}" output: ${key}`,
      });
    }

    return evidence;
  }

  collectHealthEvidence(before: number | null, after: number | null, timestamp: string): ReportEvidence[] {
    const evidence: ReportEvidence[] = [];
    if (before !== null) {
      evidence.push({
        source: 'health_engine',
        metric: 'health_before',
        value: before,
        timestamp,
        description: `Health score before optimization: ${before}`,
      });
    }
    if (after !== null) {
      evidence.push({
        source: 'health_engine',
        metric: 'health_after',
        value: after,
        timestamp,
        description: `Health score after optimization: ${after}`,
      });
    }
    return evidence;
  }

  collectStorageEvidence(bytes: number, timestamp: string): ReportEvidence[] {
    if (bytes <= 0) return [];
    return [{
      source: 'storage_intelligence',
      metric: 'storage_recovered',
      value: bytes,
      timestamp,
      description: `${bytes} bytes of storage recovered`,
    }];
  }
}
