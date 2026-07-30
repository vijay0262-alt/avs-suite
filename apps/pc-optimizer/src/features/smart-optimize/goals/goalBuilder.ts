/**
 * Goals & Objectives Engine — Builder
 *
 * Builds Goal objects from input parameters with sensible defaults.
 */
import type { Goal, GoalType, TargetMetric, GoalPriority, GoalStrategyType } from './types';
import { generateGoalId } from './types';

export interface GoalBuildInput {
  name: string;
  description: string;
  category: GoalType;
  targetMetric: TargetMetric;
  targetValue: number;
  currentValue?: number;
  priority?: GoalPriority;
  strategyType?: GoalStrategyType;
  dependencies?: Goal['dependencies'];
  constraints?: Goal['constraints'];
  futureMetadata?: Record<string, unknown>;
}

export class GoalBuilder {
  build(input: GoalBuildInput): Goal {
    const now = new Date().toISOString();
    return {
      id: generateGoalId(),
      name: input.name,
      description: input.description,
      category: input.category,
      priority: input.priority ?? 'medium',
      status: 'draft',
      targetMetric: input.targetMetric,
      targetValue: input.targetValue,
      currentValue: input.currentValue ?? 0,
      progress: 0,
      confidence: 0,
      strategy: {
        type: input.strategyType ?? 'adaptive',
        steps: [],
        estimatedDurationMs: 0,
        estimatedEffort: 'medium',
        riskLevel: 'low',
        confidence: 0,
        rationale: 'Strategy not yet generated',
        futureMetadata: {},
      },
      estimatedCompletion: null,
      dependencies: input.dependencies ?? [],
      constraints: input.constraints ?? [],
      recommendations: [],
      evidence: [],
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
      futureMetadata: input.futureMetadata ?? {},
    };
  }

  buildPerformanceGoal(targetHealthScore: number, currentHealthScore: number): Goal {
    return this.build({
      name: 'Improve Performance',
      description: `Achieve health score of ${targetHealthScore}`,
      category: 'performance',
      targetMetric: 'health_score',
      targetValue: targetHealthScore,
      currentValue: currentHealthScore,
      priority: 'high',
    });
  }

  buildStorageGoal(targetFreeSpaceBytes: number, currentFreeSpaceBytes: number): Goal {
    return this.build({
      name: 'Free Up Disk Space',
      description: `Achieve ${targetFreeSpaceBytes} bytes of free disk space`,
      category: 'storage',
      targetMetric: 'free_disk_space',
      targetValue: targetFreeSpaceBytes,
      currentValue: currentFreeSpaceBytes,
      priority: 'medium',
    });
  }

  buildPrivacyGoal(targetPrivacyScore: number, currentPrivacyScore: number): Goal {
    return this.build({
      name: 'Improve Privacy Score',
      description: `Achieve privacy score of ${targetPrivacyScore}`,
      category: 'privacy',
      targetMetric: 'privacy_score',
      targetValue: targetPrivacyScore,
      currentValue: currentPrivacyScore,
      priority: 'high',
    });
  }

  buildStartupGoal(targetBootTimeMs: number, currentBootTimeMs: number): Goal {
    return this.build({
      name: 'Reduce Startup Time',
      description: `Reduce boot time to ${targetBootTimeMs}ms`,
      category: 'startup',
      targetMetric: 'boot_time',
      targetValue: targetBootTimeMs,
      currentValue: currentBootTimeMs,
      priority: 'medium',
    });
  }

  buildBatteryGoal(targetBatteryUsagePerHour: number, currentBatteryUsagePerHour: number): Goal {
    return this.build({
      name: 'Reduce Battery Usage',
      description: `Reduce battery usage to ${targetBatteryUsagePerHour}% per hour`,
      category: 'battery',
      targetMetric: 'battery_usage',
      targetValue: targetBatteryUsagePerHour,
      currentValue: currentBatteryUsagePerHour,
      priority: 'medium',
    });
  }

  buildGamingGoal(targetHealthScore: number, currentHealthScore: number): Goal {
    return this.build({
      name: 'Optimize for Gaming',
      description: `Achieve gaming-ready health score of ${targetHealthScore}`,
      category: 'gaming',
      targetMetric: 'health_score',
      targetValue: targetHealthScore,
      currentValue: currentHealthScore,
      priority: 'high',
    });
  }
}
