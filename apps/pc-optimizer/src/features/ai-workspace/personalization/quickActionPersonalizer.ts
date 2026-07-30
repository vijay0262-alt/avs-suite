/**
 * AI Workspace Personalization Platform — Quick Action Personalizer
 *
 * EPIC 5 PHASE A PART 7
 *
 * Personalizes quick actions based on most used actions, context-aware
 * suggestions, goal-based actions, profile-based actions, and recent actions.
 */
import type {
  UserPreferences,
  BehaviorAnalysisResult,
  QuickActionSuggestion,
  WorkspaceProfile,
  WorkspaceConfiguration,
  PersonalizationSuggestion,
} from './types';
import { generateSuggestionId } from './types';

export class QuickActionPersonalizer {
  private _config: WorkspaceConfiguration;

  constructor(config: WorkspaceConfiguration) {
    this._config = config;
  }

  updateConfig(config: WorkspaceConfiguration): void {
    this._config = config;
  }

  personalize(
    preferences: UserPreferences,
    analysis: BehaviorAnalysisResult | null,
    profile: WorkspaceProfile | null,
  ): string[] {
    if (!preferences.personalizationEnabled || preferences.manualMode) {
      return [...preferences.quickActions];
    }

    const actionSet = new Set<string>();
    const result: string[] = [];

    if (analysis) {
      const mostUsed = this._getMostUsedActions(analysis);
      for (const action of mostUsed) {
        if (!actionSet.has(action)) {
          actionSet.add(action);
          result.push(action);
        }
      }
    }

    if (profile) {
      for (const action of profile.quickActions) {
        if (!actionSet.has(action)) {
          actionSet.add(action);
          result.push(action);
        }
      }
    }

    for (const action of preferences.quickActions) {
      if (!actionSet.has(action)) {
        actionSet.add(action);
        result.push(action);
      }
    }

    return result.slice(0, 8);
  }

  generateSuggestions(
    preferences: UserPreferences,
    analysis: BehaviorAnalysisResult | null,
  ): PersonalizationSuggestion[] {
    if (!preferences.personalizationEnabled || preferences.manualMode) {
      return [];
    }

    const suggestions: PersonalizationSuggestion[] = [];
    const now = new Date().toISOString();

    if (analysis && analysis.toolUsage.length > 0) {
      for (const tool of analysis.toolUsage.slice(0, 3)) {
        if (!preferences.quickActions.includes(tool.toolId)) {
          suggestions.push({
            id: generateSuggestionId(),
            type: 'quick_action_add',
            title: `Add "${tool.toolId}" to quick actions`,
            description: `You've used this tool ${tool.usageCount} times. Adding it to quick actions will save time.`,
            currentValue: null,
            suggestedValue: tool.toolId,
            confidence: Math.min(0.5 + tool.usageCount * 0.1, 0.9),
            evidence: [{
              source: 'behavior_analysis',
              metric: 'usage_count',
              value: tool.usageCount,
              timestamp: now,
              description: `Used ${tool.usageCount} times in analysis window`,
              confidence: 0.8,
              futureMetadata: {},
            }],
            actionable: true,
            dismissed: false,
            createdAt: now,
            futureMetadata: {},
          });
        }
      }
    }

    if (preferences.quickActions.length > 6) {
      const leastUsed = preferences.quickActions[preferences.quickActions.length - 1];
      suggestions.push({
        id: generateSuggestionId(),
        type: 'quick_action_remove',
        title: `Remove "${leastUsed}" from quick actions`,
        description: 'You have many quick actions. Removing less-used ones can improve clarity.',
        currentValue: leastUsed,
        suggestedValue: null,
        confidence: 0.4,
        evidence: [{
          source: 'layout_analysis',
          metric: 'action_count',
          value: preferences.quickActions.length,
          timestamp: now,
          description: `${preferences.quickActions.length} quick actions configured`,
          confidence: 0.5,
          futureMetadata: {},
        }],
        actionable: true,
        dismissed: false,
        createdAt: now,
        futureMetadata: {},
      });
    }

    return suggestions;
  }

  getContextAwareSuggestions(
    preferences: UserPreferences,
    context: { activeGoals?: string[]; currentPage?: string; profileType?: string },
  ): QuickActionSuggestion[] {
    const suggestions: QuickActionSuggestion[] = [];

    if (context.activeGoals && context.activeGoals.length > 0) {
      suggestions.push({
        actionId: 'optimize',
        label: 'Optimize for active goals',
        reason: `You have ${context.activeGoals.length} active goal(s)`,
        confidence: 0.7,
        source: 'goal_based',
        futureMetadata: {},
      });
    }

    if (context.currentPage === 'reports') {
      suggestions.push({
        actionId: 'generate_report',
        label: 'Generate a new report',
        reason: 'You are on the reports page',
        confidence: 0.6,
        source: 'context_aware',
        futureMetadata: {},
      });
    }

    if (context.profileType === 'gaming') {
      suggestions.push({
        actionId: 'game_mode',
        label: 'Enable Game Mode',
        reason: 'Gaming profile is active',
        confidence: 0.8,
        source: 'profile_based',
        futureMetadata: {},
      });
    }

    if (preferences.recentActivities.length > 0) {
      const recent = preferences.recentActivities[0];
      if (recent) {
        suggestions.push({
          actionId: recent.type,
          label: recent.label,
          reason: 'Based on your recent activity',
          confidence: 0.5,
          source: 'recent',
          futureMetadata: {},
        });
      }
    }

    return suggestions;
  }

  addAction(preferences: UserPreferences, actionId: string): UserPreferences {
    if (preferences.quickActions.includes(actionId)) {
      return preferences;
    }
    return {
      ...preferences,
      quickActions: [...preferences.quickActions, actionId],
    };
  }

  removeAction(preferences: UserPreferences, actionId: string): UserPreferences {
    return {
      ...preferences,
      quickActions: preferences.quickActions.filter((a) => a !== actionId),
    };
  }

  reorderActions(preferences: UserPreferences, newOrder: string[]): UserPreferences {
    const validActions = newOrder.filter((a) => preferences.quickActions.includes(a));
    const remaining = preferences.quickActions.filter((a) => !validActions.includes(a));
    return {
      ...preferences,
      quickActions: [...validActions, ...remaining],
    };
  }

  private _getMostUsedActions(analysis: BehaviorAnalysisResult): string[] {
    return analysis.toolUsage
      .filter((t) => t.usageCount >= 2)
      .slice(0, 5)
      .map((t) => t.toolId);
  }
}
