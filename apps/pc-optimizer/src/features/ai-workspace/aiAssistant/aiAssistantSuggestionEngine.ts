/**
 * AVS AI Assistant Platform — Suggestion Engine
 *
 * EPIC 5 PHASE A PART 1
 *
 * Generates context-aware suggestions for next actions.
 * Every suggestion is evidence-based with confidence and priority.
 */
import type {
  AIAssistantConfiguration,
  AIAssistantSuggestion,
  AIAssistantContext,
  AIAssistantIntentType,
  SuggestionType,
  SuggestionPriority,
  AIAssistantEvidence,
  AIAssistantProviderPlugin,
  AIAssistantSuggestionInput,
} from './types';
import { generateSuggestionId, clampConfidence } from './types';

export class AIAssistantSuggestionEngine {
  private _config: AIAssistantConfiguration;
  private _plugins: AIAssistantProviderPlugin[] = [];

  constructor(config: AIAssistantConfiguration) {
    this._config = config;
  }

  updateConfig(config: AIAssistantConfiguration): void {
    this._config = config;
  }

  registerPlugin(plugin: AIAssistantProviderPlugin): void {
    this._plugins.push(plugin);
    this._plugins.sort((a, b) => a.getPriority() - b.getPriority());
  }

  generate(intent: AIAssistantIntentType, context: AIAssistantContext, conversationId: string): AIAssistantSuggestion[] {
    const input: AIAssistantSuggestionInput = {
      intent,
      context,
      conversationId,
      futureMetadata: {},
    };

    // Try plugins first
    for (const plugin of this._plugins) {
      if (plugin.isAvailable() && plugin.generateSuggestions) {
        const results = plugin.generateSuggestions(input);
        if (results && results.length > 0) {
          return this._filterAndRank(results);
        }
      }
    }

    return this._generateBuiltin(intent, context);
  }

  private _generateBuiltin(intent: AIAssistantIntentType, context: AIAssistantContext): AIAssistantSuggestion[] {
    const suggestions: AIAssistantSuggestion[] = [];

    // Suggest optimization if recommendations exist
    if (context.activeRecommendations.length > 0) {
      const highPriorityCount = context.activeRecommendations.filter(
        (r) => r.priority === 'critical' || r.priority === 'high',
      ).length;

      suggestions.push(this._createSuggestion(
        'optimize_now',
        'Optimize Now',
        `You have ${context.activeRecommendations.length} active recommendations${highPriorityCount > 0 ? ` (${highPriorityCount} high priority)` : ''}. Start an optimization session to address them.`,
        clampConfidence(0.7 + (highPriorityCount > 0 ? 0.2 : 0)),
        highPriorityCount > 0 ? 'critical' : 'high',
        this._createEvidence('recommendations', 'count', context.activeRecommendations.length, 'Active recommendations'),
      ));
    }

    // Suggest creating a goal if none active
    if (context.activeGoals.length === 0 && context.healthScore !== null) {
      suggestions.push(this._createSuggestion(
        'create_goal',
        'Create a Goal',
        'You don\'t have any active goals. Create one to track your optimization objectives.',
        0.6,
        'medium',
        this._createEvidence('goals', 'count', 0, 'No active goals'),
      ));
    }

    // Suggest viewing timeline if events exist
    if (context.recentTimelineEvents.length > 0) {
      suggestions.push(this._createSuggestion(
        'view_timeline',
        'View Timeline',
        `Review your ${context.recentTimelineEvents.length} recent timeline events to understand system activity.`,
        0.5,
        'low',
        this._createEvidence('timeline', 'count', context.recentTimelineEvents.length, 'Recent timeline events'),
      ));
    }

    // Suggest viewing predictions if available
    if (context.activePredictions.length > 0) {
      const highRiskCount = context.activePredictions.filter(
        (p) => p.riskLevel === 'critical' || p.riskLevel === 'high',
      ).length;

      suggestions.push(this._createSuggestion(
        'view_prediction',
        'View Predictions',
        `You have ${context.activePredictions.length} active predictions${highRiskCount > 0 ? ` (${highRiskCount} high risk)` : ''}. Review them to stay ahead of potential issues.`,
        clampConfidence(0.5 + (highRiskCount > 0 ? 0.2 : 0)),
        highRiskCount > 0 ? 'high' : 'medium',
        this._createEvidence('predictions', 'count', context.activePredictions.length, 'Active predictions'),
      ));
    }

    // Suggest recovery if recovery history exists
    if (context.recoveryHistory.length > 0) {
      suggestions.push(this._createSuggestion(
        'view_recovery',
        'View Recovery Options',
        `You have ${context.recoveryHistory.length} recovery records. Review recovery options if needed.`,
        0.5,
        'low',
        this._createEvidence('recovery_history', 'count', context.recoveryHistory.length, 'Recovery history'),
      ));
    }

    // Suggest maintenance if no recent maintenance
    if (context.maintenanceHistory.length === 0) {
      suggestions.push(this._createSuggestion(
        'start_maintenance',
        'Start Maintenance',
        'No maintenance has been performed yet. Consider running maintenance to keep your system healthy.',
        0.55,
        'medium',
        this._createEvidence('maintenance', 'count', 0, 'No maintenance history'),
      ));
    }

    // Suggest report generation for reporting intent
    if (intent === 'reporting') {
      suggestions.push(this._createSuggestion(
        'generate_report',
        'Generate Report',
        'Generate a comprehensive system report based on current data.',
        0.7,
        'medium',
        this._createEvidence('reporting', 'intent', intent, 'User requested reporting'),
      ));
    }

    // Suggest comparison if multiple recommendations
    if (context.activeRecommendations.length > 1) {
      suggestions.push(this._createSuggestion(
        'compare_plans',
        'Compare Plans',
        'Compare different optimization strategies based on your recommendations.',
        0.5,
        'low',
        this._createEvidence('recommendations', 'count', context.activeRecommendations.length, 'Multiple recommendations available'),
      ));
    }

    return this._filterAndRank(suggestions);
  }

  private _filterAndRank(suggestions: AIAssistantSuggestion[]): AIAssistantSuggestion[] {
    const filtered = suggestions.filter(
      (s) => s.confidence >= this._config.suggestionRules.minConfidence,
    );

    const priorityOrder = this._config.suggestionRules.priorityOrder;
    const priorityIndex = (p: SuggestionPriority): number => {
      const idx = priorityOrder.indexOf(p);
      return idx === -1 ? priorityOrder.length : idx;
    };

    filtered.sort((a, b) => {
      const pDiff = priorityIndex(a.priority) - priorityIndex(b.priority);
      if (pDiff !== 0) return pDiff;
      return b.confidence - a.confidence;
    });

    return filtered.slice(0, this._config.suggestionRules.maxSuggestions);
  }

  private _createSuggestion(
    type: SuggestionType,
    title: string,
    description: string,
    confidence: number,
    priority: SuggestionPriority,
    evidence: AIAssistantEvidence,
  ): AIAssistantSuggestion {
    return {
      id: generateSuggestionId(),
      type,
      title,
      description,
      confidence,
      priority,
      actionId: null,
      evidence: [evidence],
      futureMetadata: {},
    };
  }

  private _createEvidence(
    source: string,
    metric: string,
    value: string | number | boolean,
    description: string,
  ): AIAssistantEvidence {
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
}
