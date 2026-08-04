/**
 * AI Command Center — Data Aggregator
 *
 * EPIC 5 PHASE A PART 3
 *
 * Aggregates data from all AI modules into a unified view model.
 * Does NOT duplicate business logic — reads from AIAssistantContext
 * which is already resolved from existing AI modules.
 */
import type { AIAssistantContext, AIAssistantEvidence, CommandCenterViewModel, HealthViewModel, GoalsViewModel, RecommendationsViewModel, PredictionsViewModel, MaintenanceViewModel, AutomationViewModel, TimelineViewModel, RecoveryViewModel, DeviceProfileViewModel, AIAssistantViewModel, OptimizationViewModel } from './types';
import type { AIAssistantSuggestion, AIAssistantActionPlan } from '../aiAssistant/types';

export class CommandCenterDataAggregator {
  aggregate(context: AIAssistantContext, aiAssistantSuggestions: AIAssistantSuggestion[] = [], aiAssistantActions: AIAssistantActionPlan[] = []): CommandCenterViewModel {
    return {
      health: this._aggregateHealth(context),
      goals: this._aggregateGoals(context),
      recommendations: this._aggregateRecommendations(context),
      predictions: this._aggregatePredictions(context),
      maintenance: this._aggregateMaintenance(context),
      automation: this._aggregateAutomation(context),
      timeline: this._aggregateTimeline(context),
      recovery: this._aggregateRecovery(context),
      deviceProfile: this._aggregateDeviceProfile(context),
      aiAssistant: this._aggregateAIAssistant(aiAssistantSuggestions, aiAssistantActions),
      optimization: this._aggregateOptimization(context),
      generatedAt: new Date().toISOString(),
      futureMetadata: {},
    };
  }

  private _aggregateHealth(context: AIAssistantContext): HealthViewModel {
    const score = context.healthScore;
    const level = score === null ? 'unknown' : score >= 80 ? 'good' : score >= 60 ? 'fair' : score >= 40 ? 'poor' : 'critical';
    const evidence: AIAssistantEvidence[] = score !== null
      ? [{ source: 'health_score', metric: 'score', value: score, timestamp: new Date().toISOString(), description: 'Current health score', confidence: 0.9, futureMetadata: {} }]
      : [];

    const history = context.optimizationHistory;
    let trend: HealthViewModel['trend'] = 'unknown';
    if (history.length >= 2) {
      const recent = history.slice(0, 2);
      if (recent[0]!.healthDelta > 0) trend = 'improving';
      else if (recent[0]!.healthDelta < 0) trend = 'declining';
      else trend = 'stable';
    }

    return { score, level, trend, evidence, futureMetadata: {} };
  }

  private _aggregateGoals(context: AIAssistantContext): GoalsViewModel {
    const goals = context.activeGoals;
    return {
      activeGoals: goals.map((g) => ({ id: g.id, name: g.name, status: g.status, priority: g.priority, progress: g.progress, futureMetadata: {} })),
      completedCount: goals.filter((g) => g.status === 'completed').length,
      blockedCount: goals.filter((g) => g.status === 'blocked').length,
      futureMetadata: {},
    };
  }

  private _aggregateRecommendations(context: AIAssistantContext): RecommendationsViewModel {
    const recs = context.activeRecommendations;
    const byPriority: Record<string, number> = {};
    for (const r of recs) byPriority[r.priority] = (byPriority[r.priority] ?? 0) + 1;
    return {
      total: recs.length,
      byPriority,
      topRecommendations: recs.slice(0, 5).map((r) => ({ id: r.id, title: r.title, category: r.category, priority: r.priority, confidence: r.confidence, futureMetadata: {} })),
      futureMetadata: {},
    };
  }

  private _aggregatePredictions(context: AIAssistantContext): PredictionsViewModel {
    const preds = context.activePredictions;
    const byRiskLevel: Record<string, number> = {};
    for (const p of preds) byRiskLevel[p.riskLevel] = (byRiskLevel[p.riskLevel] ?? 0) + 1;
    return {
      total: preds.length,
      byRiskLevel,
      topPredictions: preds.slice(0, 5).map((p) => ({ id: p.id, title: p.title, category: p.category, riskLevel: p.riskLevel, confidence: p.confidence, futureMetadata: {} })),
      futureMetadata: {},
    };
  }

  private _aggregateMaintenance(context: AIAssistantContext): MaintenanceViewModel {
    const history = context.maintenanceHistory;
    return {
      lastMaintenance: history.length > 0 ? history[0]!.timestamp : null,
      isRunning: false,
      historyCount: history.length,
      futureMetadata: {},
    };
  }

  private _aggregateAutomation(context: AIAssistantContext): AutomationViewModel {
    const sources = context.sources.filter((s) => s.type === 'automation');
    return {
      enabled: sources.length > 0 && sources[0]!.available,
      activeRules: 0,
      lastTriggered: null,
      futureMetadata: {},
    };
  }

  private _aggregateTimeline(context: AIAssistantContext): TimelineViewModel {
    const events = context.recentTimelineEvents;
    return {
      totalEvents: events.length,
      recentEvents: events.slice(0, 10).map((e) => ({ id: e.id, title: e.title, timestamp: e.timestamp, category: e.category, severity: e.severity, futureMetadata: {} })),
      futureMetadata: {},
    };
  }

  private _aggregateRecovery(context: AIAssistantContext): RecoveryViewModel {
    const history = context.recoveryHistory;
    return {
      available: history.length > 0,
      historyCount: history.length,
      lastRecovery: history.length > 0 ? history[0]!.timestamp : null,
      futureMetadata: {},
    };
  }

  private _aggregateDeviceProfile(context: AIAssistantContext): DeviceProfileViewModel | null {
    if (!context.deviceProfile) return null;
    return {
      profileType: context.deviceProfile.profileType,
      performanceTier: context.deviceProfile.performanceTier,
      confidence: context.deviceProfile.confidence,
      futureMetadata: {},
    };
  }

  private _aggregateAIAssistant(suggestions: AIAssistantSuggestion[], actions: AIAssistantActionPlan[]): AIAssistantViewModel {
    return {
      suggestions,
      pendingActions: actions,
      futureMetadata: {},
    };
  }

  private _aggregateOptimization(context: AIAssistantContext): OptimizationViewModel {
    const history = context.optimizationHistory;
    return {
      activeSession: false,
      lastSession: history.length > 0 ? history[0]!.timestamp : null,
      totalSessions: history.length,
      futureMetadata: {},
    };
  }
}
