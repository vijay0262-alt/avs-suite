/**
 * Goal Orchestration Engine — Conflict Engine
 *
 * Detects and resolves conflicts between active goals:
 * Performance vs Battery, Gaming vs Maintenance, Privacy vs Convenience,
 * Storage vs Performance, Business vs Entertainment, Security vs Speed,
 * Custom Goal Conflicts, Future Conflict Types.
 */
import type {
  Goal,
  OrchestrationConflict,
  OrchestrationConflictResolution,
  ConflictAdjustment,
  OrchestrationConflictType,
  OrchestrationConfiguration,
  OrchestrationProviderPlugin,
  Evidence,
} from './types';
import { generateOrchestrationConflictId } from './types';
import { priorityToScore } from '../types';

export class GoalConflictEngine {
  private _config: OrchestrationConfiguration;
  private _providers: OrchestrationProviderPlugin[] = [];

  constructor(config: OrchestrationConfiguration) {
    this._config = config;
  }

  registerProvider(plugin: OrchestrationProviderPlugin): boolean {
    if (this._providers.some((p) => p.getPluginName() === plugin.getPluginName())) return false;
    this._providers.push(plugin);
    this._providers.sort((a, b) => b.getPriority() - a.getPriority());
    return true;
  }

  detectConflicts(goals: Goal[]): OrchestrationConflict[] {
    // Check provider plugins first
    for (const provider of this._providers) {
      if (!provider.isAvailable()) continue;
      const resolved = provider.resolveConflicts(goals, []);
      if (resolved && resolved.length > 0) return resolved;
    }

    const conflicts: OrchestrationConflict[] = [];
    const active = goals.filter((g) => g.status === 'started' || g.status === 'in_progress');

    // Multiple active goals exceeding max
    if (active.length > this._config.priorityRules.maxActiveGoals) {
      conflicts.push({
        id: generateOrchestrationConflictId(),
        type: 'custom_conflict',
        goalIds: active.map((g) => g.id),
        description: `Too many active goals: ${active.length} (max ${this._config.priorityRules.maxActiveGoals})`,
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

  resolve(conflict: OrchestrationConflict, goals: Map<string, Goal>): OrchestrationConflict {
    if (conflict.resolution) return conflict;

    const resolution = this._computeResolution(conflict, goals);
    return { ...conflict, resolution };
  }

  resolveAll(conflicts: OrchestrationConflict[], goals: Map<string, Goal>): OrchestrationConflict[] {
    return conflicts.map((c) => this.resolve(c, goals));
  }

  private _detectPairConflict(a: Goal, b: Goal): OrchestrationConflict | null {
    const pair = [a, b];

    // Performance vs Battery
    if (pair.some((g) => g.category === 'performance') && pair.some((g) => g.category === 'battery')) {
      return this._makeConflict('performance_vs_battery', [a.id, b.id],
        'Performance optimization conflicts with battery optimization', 'high');
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
    // Storage vs Performance
    if (pair.some((g) => g.category === 'storage') && pair.some((g) => g.category === 'performance')) {
      return this._makeConflict('storage_vs_performance', [a.id, b.id],
        'Storage cleanup may temporarily impact performance', 'low');
    }
    // Business vs Entertainment
    if (pair.some((g) => g.category === 'business') && pair.some((g) => g.category === 'gaming')) {
      return this._makeConflict('business_vs_entertainment', [a.id, b.id],
        'Business optimization conflicts with entertainment goals', 'medium');
    }
    // Security vs Speed
    if (pair.some((g) => g.category === 'security') && pair.some((g) => g.category === 'performance')) {
      return this._makeConflict('security_vs_speed', [a.id, b.id],
        'Security measures may reduce system speed', 'medium');
    }

    return null;
  }

  private _makeConflict(
    type: OrchestrationConflictType,
    goalIds: string[],
    description: string,
    severity: OrchestrationConflict['severity'],
  ): OrchestrationConflict {
    return {
      id: generateOrchestrationConflictId(),
      type,
      goalIds,
      description,
      severity,
      resolution: null,
      detectedAt: new Date().toISOString(),
      futureMetadata: {},
    };
  }

  private _computeResolution(
    conflict: OrchestrationConflict,
    goals: Map<string, Goal>,
  ): OrchestrationConflictResolution {
    const adjustments: ConflictAdjustment[] = [];

    // Multiple active goals: defer lower-priority
    if (conflict.type === 'custom_conflict' && conflict.goalIds.length > this._config.priorityRules.maxActiveGoals) {
      const sorted = [...conflict.goalIds]
        .map((id) => goals.get(id))
        .filter((g): g is Goal => g !== undefined)
        .sort((a, b) => priorityToScore(b.priority) - priorityToScore(a.priority));

      const keep = sorted.slice(0, this._config.priorityRules.maxActiveGoals);
      const defer = sorted.slice(this._config.priorityRules.maxActiveGoals);

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
        deferredGoalId: defer[0]?.id ?? null,
        description: `Deferred ${defer.length} lower-priority goals`,
        adjustments,
        confidence: 0.8,
        alternativeStrategy: 'Sequential execution of deferred goals after current goals complete',
        futureMetadata: {},
      };
    }

    // Pairwise: prioritize higher priority goal
    const goalA = goals.get(conflict.goalIds[0]!);
    const goalB = goals.get(conflict.goalIds[1]!);
    if (!goalA || !goalB) {
      return {
        strategy: 'compromise',
        winningGoalId: null,
        deferredGoalId: null,
        description: 'Unable to resolve — goal not found',
        adjustments,
        confidence: 0,
        alternativeStrategy: 'Manual resolution required',
        futureMetadata: {},
      };
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
      deferredGoalId: loser.id,
      description: `Prioritized "${winner.name}" over "${loser.name}"`,
      adjustments,
      confidence: 0.75,
      alternativeStrategy: this._generateAlternativeStrategy(winner, loser),
      futureMetadata: {},
    };
  }

  private _generateAlternativeStrategy(winner: Goal, loser: Goal): string {
    if (this._config.conflictRules.allowCompromise) {
      return `Compromise: Execute "${winner.name}" first, then run "${loser.name}" with reduced resource allocation`;
    }
    return `Sequential: Execute "${loser.name}" after "${winner.name}" completes`;
  }

  getConflictEvidence(conflict: OrchestrationConflict, goals: Map<string, Goal>): Evidence[] {
    const evidence: Evidence[] = [];
    const now = new Date().toISOString();

    for (const goalId of conflict.goalIds) {
      const goal = goals.get(goalId);
      if (!goal) continue;
      evidence.push({
        source: 'conflict-engine',
        metric: 'goal_priority',
        value: priorityToScore(goal.priority),
        timestamp: now,
        description: `Goal "${goal.name}" priority: ${goal.priority}`,
        futureMetadata: {},
      });
    }

    return evidence;
  }
}
