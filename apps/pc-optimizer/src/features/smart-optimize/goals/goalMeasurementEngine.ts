/**
 * Goals & Objectives Engine — Measurement Engine
 *
 * Measures goal progress using data from existing modules:
 * Timeline, Recommendations, Predictions, Maintenance Results,
 * Optimization History, Health Score, Device Profile, System Metrics.
 *
 * NEVER invents values — all measurements come from provided input data.
 */
import type {
  Goal,
  GoalMeasurementInput,
  GoalProgress,
  Evidence,
  TargetMetric,
  GoalConfiguration,
  GoalProviderPlugin,
} from './types';
import { getMeasurementDirection, computeProgress } from './types';

export class GoalMeasurementEngine {
  private _config: GoalConfiguration;
  private _providers: GoalProviderPlugin[] = [];

  constructor(config: GoalConfiguration) {
    this._config = config;
  }

  registerProvider(plugin: GoalProviderPlugin): boolean {
    if (this._providers.some((p) => p.getPluginName() === plugin.getPluginName())) return false;
    this._providers.push(plugin);
    this._providers.sort((a, b) => b.getPriority() - a.getPriority());
    return true;
  }

  measure(goal: Goal, input: GoalMeasurementInput): GoalProgress {
    const direction = getMeasurementDirection(goal.targetMetric);
    const currentValue = this._extractMetric(goal.targetMetric, input, goal);
    const progress = computeProgress(currentValue, goal.targetValue, direction);
    const delta = currentValue - goal.currentValue;
    const evidence = this._collectEvidence(goal, input, currentValue);

    return {
      goalId: goal.id,
      status: goal.status,
      currentValue,
      targetValue: goal.targetValue,
      progress,
      delta,
      direction,
      measuredAt: new Date().toISOString(),
      evidence,
      futureMetadata: {},
    };
  }

  measureBatch(goals: Goal[], input: GoalMeasurementInput): GoalProgress[] {
    return goals.map((g) => this.measure(g, input));
  }

  private _extractMetric(metric: TargetMetric, input: GoalMeasurementInput, goal: Goal): number {
    // Check provider plugins first
    for (const provider of this._providers) {
      if (!provider.isAvailable()) continue;
      if (provider.getGoalType() !== goal.category) continue;
      const value = provider.measure(goal, input);
      if (value !== null) return value;
    }

    // Extract from system metrics
    if (input.systemMetrics) {
      const sm = input.systemMetrics;
      switch (metric) {
        case 'health_score':
          return input.healthScore ?? 0;
        case 'boot_time':
          return sm.bootTimeMs;
        case 'free_disk_space':
          return sm.freeDiskSpaceBytes;
        case 'memory_usage':
          return sm.memoryUsage;
        case 'cpu_usage':
          return sm.cpuUsage;
        case 'background_processes':
          return sm.backgroundProcessCount;
        case 'privacy_score':
          return sm.privacyScore;
        case 'security_score':
          return sm.securityScore;
        case 'startup_duration':
          return sm.startupDurationMs;
        case 'storage_recovery':
          return sm.freeDiskSpaceBytes;
        case 'app_launch_time':
          return sm.appLaunchTimeMs;
        case 'battery_usage':
          return sm.batteryUsagePerHour ?? 0;
        default:
          if (sm.futureMetrics[metric] !== undefined) return sm.futureMetrics[metric]!;
          break;
      }
    }

    // Fallback: use health score if available
    if (metric === 'health_score' && input.healthScore !== null) {
      return input.healthScore;
    }

    // Fallback: use current goal value (no change)
    return goal.currentValue;
  }

  private _collectEvidence(goal: Goal, input: GoalMeasurementInput, currentValue: number): Evidence[] {
    const evidence: Evidence[] = [];
    const now = new Date().toISOString();

    if (input.healthScore !== null) {
      evidence.push({
        source: 'health-engine',
        metric: 'health_score',
        value: input.healthScore,
        timestamp: now,
        description: `Current health score: ${input.healthScore}`,
        futureMetadata: {},
      });
    }

    if (input.systemMetrics) {
      evidence.push({
        source: 'system-metrics',
        metric: goal.targetMetric,
        value: currentValue,
        timestamp: now,
        description: `Measured ${goal.targetMetric}: ${currentValue} (target: ${goal.targetValue})`,
        futureMetadata: {},
      });
    }

    if (input.optimizationHistory.length > 0) {
      const recent = input.optimizationHistory.slice(-5);
      for (const h of recent) {
        evidence.push({
          source: 'optimization-history',
          metric: 'health_after',
          value: h.healthAfter ?? 0,
          timestamp: h.executedAt,
          description: `Optimization ${h.planId} completed with success rate ${h.successRate}`,
          futureMetadata: {},
        });
      }
    }

    if (input.recommendations.length > 0) {
      evidence.push({
        source: 'recommendation-engine',
        metric: 'recommendation_count',
        value: input.recommendations.length,
        timestamp: now,
        description: `${input.recommendations.length} recommendations available`,
        futureMetadata: {},
      });
    }

    return evidence;
  }

  isDataStale(input: GoalMeasurementInput): boolean {
    if (input.systemMetrics === null) return true;
    return false;
  }

  getConfidence(input: GoalMeasurementInput): number {
    let confidence = 0;
    if (input.healthScore !== null) confidence += 0.2;
    if (input.systemMetrics) confidence += 0.3;
    if (input.recommendations.length > 0) confidence += 0.15;
    if (input.predictions.length > 0) confidence += 0.15;
    if (input.optimizationHistory.length > 0) confidence += 0.1;
    if (input.maintenanceResults.length > 0) confidence += 0.1;
    return Math.min(1, confidence);
  }
}
