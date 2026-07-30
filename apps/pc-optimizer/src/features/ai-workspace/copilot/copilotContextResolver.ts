/**
 * AI Copilot Platform — Context Resolver
 *
 * EPIC 5 PHASE A PART 1
 *
 * Resolves context from multiple AI modules and user preferences.
 * Does NOT duplicate business logic — reads from existing module outputs.
 * Every context source carries confidence and evidence.
 */
import type {
  CopilotContext,
  CopilotContextSource,
  ContextSourceType,
  CopilotEvidence,
  DeviceProfileSummary,
  GoalSummary,
  TimelineEventSummary,
  RecommendationSummary,
  PredictionSummary,
  MaintenanceSummary,
  OptimizationHistorySummary,
  RecoverySummary,
} from './types';

export interface CopilotContextResolverInput {
  healthScore: number | null;
  deviceProfile: DeviceProfileSummary | null;
  activeGoals: GoalSummary[];
  recentTimelineEvents: TimelineEventSummary[];
  activeRecommendations: RecommendationSummary[];
  activePredictions: PredictionSummary[];
  maintenanceHistory: MaintenanceSummary[];
  optimizationHistory: OptimizationHistorySummary[];
  recoveryHistory: RecoverySummary[];
  userPreferences: Record<string, unknown>;
  futureMetadata?: Record<string, unknown>;
}

export class CopilotContextResolver {
  resolve(input: CopilotContextResolverInput): CopilotContext {
    const sources: CopilotContextSource[] = [];

    if (input.healthScore !== null) {
      sources.push(this._createSource('health_score', true, input.healthScore, 0.9, [
        this._createEvidence('health_score', 'score', input.healthScore, 'Current health score'),
      ]));
    }

    if (input.deviceProfile) {
      sources.push(this._createSource('device_profile', true, input.deviceProfile, input.deviceProfile.confidence, [
        this._createEvidence('device_profile', 'profileType', input.deviceProfile.profileType, 'Device profile type'),
        this._createEvidence('device_profile', 'performanceTier', input.deviceProfile.performanceTier, 'Performance tier'),
      ]));
    }

    if (input.activeGoals.length > 0) {
      sources.push(this._createSource('goals', true, input.activeGoals, 0.85, [
        this._createEvidence('goals', 'count', input.activeGoals.length, 'Active goals count'),
      ]));
    }

    if (input.recentTimelineEvents.length > 0) {
      sources.push(this._createSource('timeline', true, input.recentTimelineEvents, 0.8, [
        this._createEvidence('timeline', 'count', input.recentTimelineEvents.length, 'Recent timeline events'),
      ]));
    }

    if (input.activeRecommendations.length > 0) {
      sources.push(this._createSource('recommendations', true, input.activeRecommendations, 0.85, [
        this._createEvidence('recommendations', 'count', input.activeRecommendations.length, 'Active recommendations'),
      ]));
    }

    if (input.activePredictions.length > 0) {
      sources.push(this._createSource('predictions', true, input.activePredictions, 0.75, [
        this._createEvidence('predictions', 'count', input.activePredictions.length, 'Active predictions'),
      ]));
    }

    if (input.maintenanceHistory.length > 0) {
      sources.push(this._createSource('maintenance', true, input.maintenanceHistory, 0.8, [
        this._createEvidence('maintenance', 'count', input.maintenanceHistory.length, 'Maintenance history entries'),
      ]));
    }

    if (input.optimizationHistory.length > 0) {
      sources.push(this._createSource('optimization_history', true, input.optimizationHistory, 0.85, [
        this._createEvidence('optimization_history', 'count', input.optimizationHistory.length, 'Optimization history entries'),
      ]));
    }

    if (input.recoveryHistory.length > 0) {
      sources.push(this._createSource('recovery_history', true, input.recoveryHistory, 0.85, [
        this._createEvidence('recovery_history', 'count', input.recoveryHistory.length, 'Recovery history entries'),
      ]));
    }

    if (Object.keys(input.userPreferences).length > 0) {
      sources.push(this._createSource('user_preferences', true, input.userPreferences, 1.0, [
        this._createEvidence('user_preferences', 'keys', Object.keys(input.userPreferences).length, 'User preference keys'),
      ]));
    }

    return {
      sources,
      healthScore: input.healthScore,
      deviceProfile: input.deviceProfile,
      activeGoals: input.activeGoals,
      recentTimelineEvents: input.recentTimelineEvents,
      activeRecommendations: input.activeRecommendations,
      activePredictions: input.activePredictions,
      maintenanceHistory: input.maintenanceHistory,
      optimizationHistory: input.optimizationHistory,
      recoveryHistory: input.recoveryHistory,
      userPreferences: input.userPreferences,
      futureMetadata: input.futureMetadata ?? {},
    };
  }

  private _createSource(
    type: ContextSourceType,
    available: boolean,
    data: unknown,
    confidence: number,
    evidence: CopilotEvidence[],
  ): CopilotContextSource {
    return {
      type,
      available,
      data,
      confidence,
      evidence,
      futureMetadata: {},
    };
  }

  private _createEvidence(
    source: string,
    metric: string,
    value: string | number | boolean,
    description: string,
  ): CopilotEvidence {
    return {
      source,
      metric,
      value,
      timestamp: new Date().toISOString(),
      description,
      confidence: 1.0,
      futureMetadata: {},
    };
  }

  getAvailableSources(context: CopilotContext): CopilotContextSource[] {
    return context.sources.filter((s) => s.available);
  }

  getSourceByType(context: CopilotContext, type: ContextSourceType): CopilotContextSource | null {
    return context.sources.find((s) => s.type === type) ?? null;
  }

  getAverageConfidence(context: CopilotContext): number {
    if (context.sources.length === 0) return 0;
    const sum = context.sources.reduce((acc, s) => acc + s.confidence, 0);
    return sum / context.sources.length;
  }
}
