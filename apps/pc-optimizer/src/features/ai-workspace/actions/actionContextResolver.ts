/**
 * Natural Language Action Engine — Context Resolver
 *
 * EPIC 5 PHASE A PART 4
 *
 * Resolves CopilotContext for action planning.
 * Reuses existing AI context — does NOT create new context.
 */
import type { CopilotContext, ClassifiedIntent, ExtractedEntity } from './types';

export interface ResolvedActionContext {
  context: CopilotContext;
  relevantEntities: ExtractedEntity[];
  missingEntities: string[];
  futureMetadata: Record<string, unknown>;
}

export class ActionContextResolver {
  private _contextProvider: (() => CopilotContext) | null = null;

  setContextProvider(provider: () => CopilotContext): void {
    this._contextProvider = provider;
  }

  resolve(intent: ClassifiedIntent, entities: ExtractedEntity[]): ResolvedActionContext {
    if (!this._contextProvider) {
      return {
        context: this._createEmptyContext(),
        relevantEntities: [],
        missingEntities: ['context_provider'],
        futureMetadata: {},
      };
    }

    const context = this._contextProvider();
    const relevantEntities = this._filterRelevantEntities(intent, entities);
    const missingEntities = this._findMissingEntities(intent, context);

    return {
      context,
      relevantEntities,
      missingEntities,
      futureMetadata: {},
    };
  }

  private _filterRelevantEntities(_intent: ClassifiedIntent, entities: ExtractedEntity[]): ExtractedEntity[] {
    // Return all extracted entities — the planner will use what it needs
    return entities;
  }

  private _findMissingEntities(intent: ClassifiedIntent, context: CopilotContext): string[] {
    const missing: string[] = [];

    if (intent.intent === 'optimization' && context.healthScore === null) {
      missing.push('health_score');
    }
    if (intent.intent === 'recovery' && context.recoveryHistory.length === 0) {
      missing.push('recovery_history');
    }
    if (intent.intent === 'timeline_navigation' && context.recentTimelineEvents.length === 0) {
      missing.push('timeline_events');
    }

    return missing;
  }

  private _createEmptyContext(): CopilotContext {
    return {
      sources: [],
      healthScore: null,
      deviceProfile: null,
      activeGoals: [],
      recentTimelineEvents: [],
      activeRecommendations: [],
      activePredictions: [],
      maintenanceHistory: [],
      optimizationHistory: [],
      recoveryHistory: [],
      userPreferences: {},
      futureMetadata: {},
    } as CopilotContext;
  }
}
