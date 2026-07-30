/**
 * Goals & Objectives Engine — Recommendation Engine
 *
 * Generates recommendations for goals: next best action, suggested
 * maintenance, optimization strategy, alternative strategy, priority
 * changes, conflict resolution.
 */
import type {
  Goal,
  GoalRecommendation,
  GoalMeasurementInput,
  GoalConflict,
  GoalConfiguration,
  GoalProgress,
} from './types';
import { generateRecommendationId } from './types';

export class GoalRecommendationEngine {
  private _config: GoalConfiguration;

  constructor(config: GoalConfiguration) {
    this._config = config;
  }

  generateRecommendations(
    goal: Goal,
    input: GoalMeasurementInput,
    progress: GoalProgress | null,
    conflicts: GoalConflict[] = [],
  ): GoalRecommendation[] {
    const recs: GoalRecommendation[] = [];
    const now = new Date().toISOString();

    // Next best action
    const nextAction = this._generateNextBestAction(goal, input, progress);
    if (nextAction) recs.push(nextAction);

    // Suggested maintenance
    if (input.maintenanceResults.length > 0 || goal.category === 'health') {
      recs.push({
        id: generateRecommendationId(),
        type: 'suggested_maintenance',
        title: 'Schedule Maintenance',
        description: 'Run maintenance tasks to support goal progress',
        module: 'maintenance',
        priority: 'medium',
        confidence: 0.7,
        evidence: [{
          source: 'maintenance-engine',
          metric: 'pending_maintenance',
          value: input.maintenanceResults.length,
          timestamp: now,
          description: `${input.maintenanceResults.length} maintenance results available`,
          futureMetadata: {},
        }],
        actionData: { maintenanceType: 'routine' },
        futureMetadata: {},
      });
    }

    // Optimization strategy
    if (goal.strategy.steps.length > 0) {
      recs.push({
        id: generateRecommendationId(),
        type: 'optimization_strategy',
        title: `Execute ${goal.strategy.steps.length}-Step Strategy`,
        description: `Follow the generated strategy for "${goal.name}"`,
        module: 'smart-optimize',
        priority: goal.priority,
        confidence: goal.strategy.confidence,
        evidence: goal.strategy.steps[0]?.evidence ?? [],
        actionData: { strategyType: goal.strategy.type, stepCount: goal.strategy.steps.length },
        futureMetadata: {},
      });
    }

    // Alternative strategy
    if (progress && progress.progress < 0.1 && goal.status === 'in_progress') {
      recs.push({
        id: generateRecommendationId(),
        type: 'alternative_strategy',
        title: 'Consider Alternative Approach',
        description: 'Current progress is minimal — an alternative strategy may be more effective',
        module: 'smart-optimize',
        priority: 'medium',
        confidence: 0.6,
        evidence: [{
          source: 'progress-engine',
          metric: 'progress',
          value: progress.progress,
          timestamp: now,
          description: `Current progress: ${(progress.progress * 100).toFixed(1)}%`,
          futureMetadata: {},
        }],
        actionData: { currentProgress: progress.progress },
        futureMetadata: {},
      });
    }

    // Priority change
    if (progress && progress.progress >= 0.8 && goal.priority !== 'critical') {
      recs.push({
        id: generateRecommendationId(),
        type: 'priority_change',
        title: 'Increase Goal Priority',
        description: 'Goal is near completion — increasing priority may accelerate completion',
        module: 'goals',
        priority: 'high',
        confidence: 0.75,
        evidence: [{
          source: 'progress-engine',
          metric: 'progress',
          value: progress.progress,
          timestamp: now,
          description: `Progress at ${(progress.progress * 100).toFixed(1)}%`,
          futureMetadata: {},
        }],
        actionData: { suggestedPriority: 'critical' },
        futureMetadata: {},
      });
    }

    // Conflict resolution
    for (const conflict of conflicts) {
      if (conflict.goalIds.includes(goal.id) && conflict.resolution) {
        recs.push({
          id: generateRecommendationId(),
          type: 'conflict_resolution',
          title: `Resolve Conflict: ${conflict.description}`,
          description: conflict.resolution.description,
          module: 'goals',
          priority: 'high',
          confidence: conflict.resolution.confidence,
          evidence: [{
            source: 'conflict-resolver',
            metric: 'conflict_type',
            value: conflict.type,
            timestamp: now,
            description: conflict.description,
            futureMetadata: {},
          }],
          actionData: { conflictId: conflict.id, strategy: conflict.resolution.strategy },
          futureMetadata: {},
        });
      }
    }

    return recs;
  }

  private _generateNextBestAction(
    goal: Goal,
    _input: GoalMeasurementInput,
    _progress: GoalProgress | null,
  ): GoalRecommendation | null {
    if (goal.strategy.steps.length === 0) return null;
    const nextStep = goal.strategy.steps[0]!;
    return {
      id: generateRecommendationId(),
      type: 'next_best_action',
      title: `Next: ${nextStep.name}`,
      description: nextStep.description,
      module: nextStep.module,
      priority: nextStep.priority,
      confidence: goal.strategy.confidence,
      evidence: nextStep.evidence,
      actionData: { stepId: nextStep.id, action: nextStep.action },
      futureMetadata: {},
    };
  }
}
