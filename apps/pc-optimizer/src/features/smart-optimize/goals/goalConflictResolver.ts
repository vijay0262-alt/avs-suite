/**
 * Goals & Objectives Engine — Conflict Resolver
 *
 * Detects and resolves conflicts between active goals:
 * Battery vs Performance, Gaming vs Maintenance, Privacy vs Convenience,
 * Storage vs Recovery, Multiple Active Goals, Enterprise Policies.
 */
import type {
  Goal,
  GoalConflict,
  ConflictResolution,
  ConflictAdjustment,
  GoalConfiguration,
} from './types';
import { generateConflictId, priorityToScore } from './types';

export class GoalConflictResolver {
  private _config: GoalConfiguration;

  constructor(config: GoalConfiguration) {
    this._config = config;
  }

  detectConflicts(goals: Goal[]): GoalConflict[] {
    const conflicts: GoalConflict[] = [];
    const active = goals.filter((g) => g.status === 'started' || g.status === 'in_progress');

    // Multiple active goals
    if (active.length > this._config.conflictRules.maxActiveGoals) {
      conflicts.push({
        id: generateConflictId(),
        type: 'multiple_active',
        goalIds: active.map((g) => g.id),
        description: `Too many active goals: ${active.length} (max ${this._config.conflictRules.maxActiveGoals})`,
        severity: 'medium',
        resolution: null,
        detectedAt: new Date().toISOString(),
        futureMetadata: {},
      });
    }

    // Pairwise conflicts
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const conflict = this._detectPairConflict(active[i]!, active[j]!);
        if (conflict) conflicts.push(conflict);
      }
    }

    return conflicts;
  }

  resolve(conflict: GoalConflict, goals: Map<string, Goal>): GoalConflict {
    if (conflict.resolution) return conflict;

    const resolution = this._computeResolution(conflict, goals);
    return { ...conflict, resolution };
  }

  private _detectPairConflict(a: Goal, b: Goal): GoalConflict | null {
    const pair = [a, b];

    // Battery vs Performance
    if (pair.some((g) => g.category === 'battery') && pair.some((g) => g.category === 'performance')) {
      return this._makeConflict('battery_vs_performance', [a.id, b.id],
        'Battery optimization conflicts with performance optimization', 'high');
    }
    // Gaming vs Maintenance
    if (pair.some((g) => g.category === 'gaming') && pair.some((g) => g.category === 'health')) {
      return this._makeConflict('gaming_vs_maintenance', [a.id, b.id],
        'Gaming optimization may interfere with maintenance goals', 'medium');
    }
    // Privacy vs Convenience
    if (pair.some((g) => g.category === 'privacy') && pair.some((g) => g.category === 'performance')) {
      return this._makeConflict('privacy_vs_convenience', [a.id, b.id],
        'Privacy settings may reduce performance convenience', 'low');
    }
    // Storage vs Recovery
    if (pair.some((g) => g.category === 'storage') && pair.some((g) => g.category === 'health')) {
      return this._makeConflict('storage_vs_recovery', [a.id, b.id],
        'Storage cleanup may conflict with recovery snapshots', 'low');
    }

    return null;
  }

  private _makeConflict(type: GoalConflict['type'], goalIds: string[], description: string, severity: GoalConflict['severity']): GoalConflict {
    return {
      id: generateConflictId(),
      type,
      goalIds,
      description,
      severity,
      resolution: null,
      detectedAt: new Date().toISOString(),
      futureMetadata: {},
    };
  }

  private _computeResolution(conflict: GoalConflict, goals: Map<string, Goal>): ConflictResolution {
    const adjustments: ConflictAdjustment[] = [];

    if (conflict.type === 'multiple_active') {
      // Prioritize by priority score, defer lower-priority goals
      const sorted = [...conflict.goalIds]
        .map((id) => goals.get(id))
        .filter((g): g is Goal => g !== undefined)
        .sort((a, b) => priorityToScore(b.priority) - priorityToScore(a.priority));

      const keep = sorted.slice(0, this._config.conflictRules.maxActiveGoals);
      const defer = sorted.slice(this._config.conflictRules.maxActiveGoals);

      for (const g of defer) {
        adjustments.push({
          goalId: g.id,
          field: 'status',
          oldValue: g.status,
          newValue: 'paused',
          reason: 'Deferred due to too many active goals',
        });
      }

      return {
        strategy: 'defer',
        winningGoalId: keep[0]?.id ?? null,
        description: `Deferred ${defer.length} lower-priority goals`,
        adjustments,
        confidence: 0.8,
        futureMetadata: {},
      };
    }

    // Pairwise: prioritize higher priority goal
    const goalA = goals.get(conflict.goalIds[0]!);
    const goalB = goals.get(conflict.goalIds[1]!);
    if (!goalA || !goalB) {
      return { strategy: 'compromise', winningGoalId: null, description: 'Unable to resolve — goal not found', adjustments, confidence: 0, futureMetadata: {} };
    }

    const scoreA = priorityToScore(goalA.priority);
    const scoreB = priorityToScore(goalB.priority);
    const winner = scoreA >= scoreB ? goalA : goalB;
    const loser = scoreA >= scoreB ? goalB : goalA;

    adjustments.push({
      goalId: loser.id,
      field: 'status',
      oldValue: loser.status,
      newValue: 'paused',
      reason: `Paused in favor of higher-priority goal: ${winner.name}`,
    });

    return {
      strategy: 'prioritize',
      winningGoalId: winner.id,
      description: `Prioritized "${winner.name}" over "${loser.name}"`,
      adjustments,
      confidence: 0.75,
      futureMetadata: {},
    };
  }
}
