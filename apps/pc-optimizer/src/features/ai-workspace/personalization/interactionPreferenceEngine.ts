/**
 * AI Workspace Personalization Platform — Interaction Preference Engine
 *
 * EPIC 5 PHASE A PART 7
 *
 * Manages AI interaction style preferences (concise, detailed, technical,
 * beginner) and preferred intent types/capabilities.
 */
import type {
  UserPreferences,
  BehaviorAnalysisResult,
  AIInteractionStyle,
  CopilotIntentType,
  CopilotCapability,
  PersonalizationSuggestion,
  WorkspaceConfiguration,
} from './types';
import { generateSuggestionId } from './types';

export class InteractionPreferenceEngine {
  private _config: WorkspaceConfiguration;

  constructor(config: WorkspaceConfiguration) {
    this._config = config;
  }

  updateConfig(config: WorkspaceConfiguration): void {
    this._config = config;
  }

  determineInteractionStyle(
    preferences: UserPreferences,
    analysis: BehaviorAnalysisResult | null,
  ): AIInteractionStyle {
    if (!preferences.personalizationEnabled || preferences.manualMode) {
      return preferences.aiInteractionStyle;
    }

    if (analysis) {
      if (analysis.toolUsage.length > 10 && analysis.recommendationAcceptanceRate > 0.6) {
        return 'technical';
      }
      if (analysis.totalEvents < 10) {
        return 'beginner';
      }
      if (analysis.averageSessionDuration < 60000) {
        return 'concise';
      }
    }

    return preferences.aiInteractionStyle;
  }

  determinePreferredIntents(
    preferences: UserPreferences,
    analysis: BehaviorAnalysisResult | null,
  ): CopilotIntentType[] {
    if (!preferences.personalizationEnabled || preferences.manualMode) {
      return [...preferences.preferredIntentTypes];
    }

    const intents: CopilotIntentType[] = [...preferences.preferredIntentTypes];

    if (analysis) {
      const intentMap: Record<string, CopilotIntentType> = {
        create_optimization_session: 'optimization',
        explain_health: 'explanation',
        generate_report: 'reporting',
        create_goal: 'goal_management',
        start_maintenance: 'maintenance',
        run_simulation: 'planning',
        compare_plans: 'comparison',
        explain_recommendation: 'recommendation',
        show_recovery: 'recovery',
      };

      for (const tool of analysis.toolUsage.slice(0, 5)) {
        const intent = intentMap[tool.toolId];
        if (intent && !intents.includes(intent)) {
          intents.push(intent);
        }
      }
    }

    return intents.slice(0, 8);
  }

  determinePreferredCapabilities(
    preferences: UserPreferences,
    analysis: BehaviorAnalysisResult | null,
  ): CopilotCapability[] {
    if (!preferences.personalizationEnabled || preferences.manualMode) {
      return [...preferences.preferredCapabilities];
    }

    const capabilities: CopilotCapability[] = [...preferences.preferredCapabilities];

    if (analysis) {
      if (analysis.toolUsage.some((t) => t.toolId === 'generate_report')) {
        if (!capabilities.includes('generate_reports')) {
          capabilities.push('generate_reports');
        }
      }
      if (analysis.toolUsage.some((t) => t.toolId === 'create_optimization_session')) {
        if (!capabilities.includes('suggest_optimizations')) {
          capabilities.push('suggest_optimizations');
        }
      }
      if (analysis.toolUsage.some((t) => t.toolId === 'create_goal')) {
        if (!capabilities.includes('navigate_features')) {
          capabilities.push('navigate_features');
        }
      }
    }

    return capabilities.slice(0, 10);
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

    const detectedStyle = this.determineInteractionStyle(preferences, analysis);
    if (detectedStyle !== preferences.aiInteractionStyle) {
      suggestions.push({
        id: generateSuggestionId(),
        type: 'interaction_style',
        title: `Switch to ${detectedStyle} interaction style`,
        description: `Based on your usage patterns, ${detectedStyle} style may better suit your needs.`,
        currentValue: preferences.aiInteractionStyle,
        suggestedValue: detectedStyle,
        confidence: 0.65,
        evidence: [{
          source: 'behavior_analysis',
          metric: 'interaction_pattern',
          value: detectedStyle,
          timestamp: now,
          description: `Detected style: ${detectedStyle}`,
          confidence: 0.7,
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

  setInteractionStyle(
    preferences: UserPreferences,
    style: AIInteractionStyle,
  ): UserPreferences {
    return { ...preferences, aiInteractionStyle: style };
  }

  setPreferredIntents(
    preferences: UserPreferences,
    intents: CopilotIntentType[],
  ): UserPreferences {
    return { ...preferences, preferredIntentTypes: intents };
  }

  setPreferredCapabilities(
    preferences: UserPreferences,
    capabilities: CopilotCapability[],
  ): UserPreferences {
    return { ...preferences, preferredCapabilities: capabilities };
  }
}
