/**
 * Goals & Objectives Engine — Planner
 *
 * Coordinates strategy generation, measurement, progress tracking,
 * and recommendation generation into a single planning workflow.
 */
import type {
  Goal,
  GoalStrategy,
  GoalProgress,
  GoalRecommendation,
  GoalMeasurementInput,
  GoalConflict,
  GoalConfiguration,
} from './types';
import { GoalStrategyEngine } from './goalStrategyEngine';
import { GoalMeasurementEngine } from './goalMeasurementEngine';
import { GoalProgressEngine } from './goalProgressEngine';
import { GoalRecommendationEngine } from './goalRecommendationEngine';
import { GoalConflictResolver } from './goalConflictResolver';

export interface GoalPlanResult {
  strategy: GoalStrategy;
  progress: GoalProgress;
  recommendations: GoalRecommendation[];
  conflicts: GoalConflict[];
  estimatedCompletion: string | null;
}

export class GoalPlanner {
  private _config: GoalConfiguration;
  private _strategyEngine: GoalStrategyEngine;
  private _measurementEngine: GoalMeasurementEngine;
  private _progressEngine: GoalProgressEngine;
  private _recommendationEngine: GoalRecommendationEngine;
  private _conflictResolver: GoalConflictResolver;

  constructor(config: GoalConfiguration) {
    this._config = config;
    this._strategyEngine = new GoalStrategyEngine(config);
    this._measurementEngine = new GoalMeasurementEngine(config);
    this._progressEngine = new GoalProgressEngine(config);
    this._recommendationEngine = new GoalRecommendationEngine(config);
    this._conflictResolver = new GoalConflictResolver(config);
  }

  plan(goal: Goal, input: GoalMeasurementInput, allGoals: Goal[] = []): GoalPlanResult {
    // Generate strategy
    const strategy = this._strategyEngine.generateStrategy(goal, input);
    goal.strategy = strategy;

    // Measure current progress
    const progress = this._measurementEngine.measure(goal, input);
    this._progressEngine.updateProgress(goal, progress);

    // Detect conflicts
    const conflicts = this._conflictResolver.detectConflicts(allGoals);

    // Generate recommendations
    const recommendations = this._recommendationEngine.generateRecommendations(
      goal, input, progress, conflicts,
    );
    goal.recommendations = recommendations;

    // Estimate completion
    const estimatedCompletion = this._progressEngine.computeEstimatedCompletion(goal);
    goal.estimatedCompletion = estimatedCompletion;

    return { strategy, progress, recommendations, conflicts, estimatedCompletion };
  }

  measureOnly(goal: Goal, input: GoalMeasurementInput): GoalProgress {
    const progress = this._measurementEngine.measure(goal, input);
    this._progressEngine.updateProgress(goal, progress);
    return progress;
  }

  get strategyEngine(): GoalStrategyEngine { return this._strategyEngine; }
  get measurementEngine(): GoalMeasurementEngine { return this._measurementEngine; }
  get progressEngine(): GoalProgressEngine { return this._progressEngine; }
  get recommendationEngine(): GoalRecommendationEngine { return this._recommendationEngine; }
  get conflictResolver(): GoalConflictResolver { return this._conflictResolver; }
}
