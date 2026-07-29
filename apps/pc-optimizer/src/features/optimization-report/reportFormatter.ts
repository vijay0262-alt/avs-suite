/**
 * Report Formatter — formats report data into display components.
 *
 * Converts raw execution data into the user-facing display format:
 *   Execution Time: 1m 42s
 *   Health Score: 88 → 94 (+6)
 *   Storage Recovered: 1.8 GB
 *   Startup Improvement: 1.6 seconds
 *   Privacy Score: +4
 */
import type {
  ExecutionTimeDisplay,
  HealthDeltaDisplay,
  StorageDisplay,
  StartupDisplay,
  PrivacyDisplay,
  PerformanceDisplay,
  ActionDisplay,
  ActionIcon,
  PredictionUpdateDisplay,
  RecommendationRemainingDisplay,
  RollbackDisplay,
  ReportConfiguration,
} from './types';
import { formatDuration, formatStorage, formatHealthDelta, determineHealthTrend } from './types';
import type { ExecutionStepResult } from '../execution-pipeline/types';
import type { OptimizationPlanV2 } from '../optimization-planner/types';

export class ReportFormatter {
  private _config: ReportConfiguration;

  constructor(config: ReportConfiguration) {
    this._config = config;
  }

  updateConfig(config: ReportConfiguration): void {
    this._config = config;
  }

  formatExecutionTime(durationMs: number): ExecutionTimeDisplay {
    return { durationMs, formatted: formatDuration(durationMs) };
  }

  formatHealthDelta(before: number | null, after: number | null): HealthDeltaDisplay {
    return {
      before,
      after,
      delta: before !== null && after !== null ? after - before : null,
      formatted: formatHealthDelta(before, after),
      trend: determineHealthTrend(before, after),
    };
  }

  formatStorage(bytes: number): StorageDisplay {
    return { bytes, formatted: formatStorage(bytes) };
  }

  formatStartup(secondsSaved: number): StartupDisplay {
    if (secondsSaved <= 0) return { secondsSaved: 0, formatted: 'No improvement' };
    return { secondsSaved, formatted: `${secondsSaved.toFixed(1)} seconds` };
  }

  formatPrivacy(pointsImproved: number): PrivacyDisplay {
    if (pointsImproved <= 0) return { pointsImproved: 0, formatted: 'No change' };
    return { pointsImproved, formatted: `+${pointsImproved}` };
  }

  formatPerformance(pointsImproved: number): PerformanceDisplay {
    if (pointsImproved <= 0) return { pointsImproved: 0, formatted: 'No change' };
    return { pointsImproved, formatted: `+${pointsImproved}` };
  }

  formatActions(
    steps: ExecutionStepResult[],
    plan: OptimizationPlanV2,
    iconType: ActionIcon,
  ): ActionDisplay[] {
    const stepMap = new Map(plan.steps.map((s) => [s.id, s]));
    return steps.map((step) => {
      const planStep = stepMap.get(step.stepId);
      return {
        stepId: step.stepId,
        title: step.stepTitle,
        description: planStep?.description ?? '',
        category: planStep?.category ?? 'unknown',
        durationMs: step.durationMs,
        icon: iconType,
        evidence: [],
      };
    });
  }

  formatPredictions(plan: OptimizationPlanV2, healthDelta: number | null): PredictionUpdateDisplay[] {
    const predictions: PredictionUpdateDisplay[] = [];

    if (healthDelta !== null && healthDelta > 0) {
      predictions.push({
        prediction: 'System health trend',
        status: 'improved',
        detail: `Health improved by ${healthDelta} points, stabilizing overall system trend`,
      });
    }

    if (plan.estimatedStorageRecovery > 0) {
      predictions.push({
        prediction: 'Storage growth',
        status: 'stabilized',
        detail: 'Storage growth rate reduced due to cleanup actions',
      });
    }

    if (plan.estimatedStartupGain > 0) {
      predictions.push({
        prediction: 'Startup performance',
        status: 'updated',
        detail: `Startup time reduced by approximately ${plan.estimatedStartupGain} seconds`,
      });
    }

    return predictions;
  }

  formatRecommendationsRemaining(
    remainingCount: number,
    priorityBreakdown: Record<string, number>,
  ): RecommendationRemainingDisplay {
    const summary = remainingCount === 0
      ? 'All recommendations addressed'
      : `${remainingCount} item${remainingCount !== 1 ? 's' : ''} remaining`;

    return { count: remainingCount, priorityBreakdown, summary };
  }

  formatRollback(available: boolean, rollbackableSteps: number): RollbackDisplay {
    const hours = this._config.rollbackDurationHours;
    return {
      available,
      durationHours: hours,
      formatted: available ? `Available for ${hours} hours` : 'Not available',
      stepsRollbackable: rollbackableSteps,
    };
  }
}
