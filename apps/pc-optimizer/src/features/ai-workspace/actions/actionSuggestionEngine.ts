/**
 * Natural Language Action Engine — Action Suggestion Engine
 *
 * EPIC 5 PHASE A PART 4
 *
 * Suggests actions to users based on context and rules.
 */
import type { ActionSuggestion, SuggestionRule, AIAssistantContext } from './types';
import { generateSuggestionId } from './types';

export class ActionSuggestionEngine {
  private _rules: SuggestionRule[];

  constructor(rules: SuggestionRule[]) {
    this._rules = rules;
  }

  updateRules(rules: SuggestionRule[]): void {
    this._rules = rules;
  }

  getSuggestions(context: AIAssistantContext, limit: number = 5): ActionSuggestion[] {
    const suggestions: ActionSuggestion[] = [];

    for (const rule of this._rules) {
      const suggestion = this._evaluateRule(rule, context);
      if (suggestion) suggestions.push(suggestion);
    }

    return suggestions
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);
  }

  private _evaluateRule(rule: SuggestionRule, context: AIAssistantContext): ActionSuggestion | null {
    let confidence = 0;
    let shouldSuggest = false;

    switch (rule.actionType) {
      case 'optimization':
        if (context.healthScore !== null && context.healthScore < 60) {
          shouldSuggest = true;
          confidence = 0.9;
        }
        break;

      case 'maintenance':
        if (context.maintenanceHistory.length === 0) {
          shouldSuggest = true;
          confidence = 0.8;
        } else {
          const lastMaint = context.maintenanceHistory[0]!;
          const daysSince = (Date.now() - new Date(lastMaint.timestamp).getTime()) / (1000 * 60 * 60 * 24);
          if (daysSince > 7) {
            shouldSuggest = true;
            confidence = 0.7;
          }
        }
        break;

      case 'report_generation':
        if (context.optimizationHistory.length > 0) {
          shouldSuggest = true;
          confidence = 0.6;
        }
        break;

      case 'simulation':
        if (context.activeRecommendations.length >= 2) {
          shouldSuggest = true;
          confidence = 0.75;
        }
        break;

      case 'goal_management':
        if (context.activeGoals.length === 0) {
          shouldSuggest = true;
          confidence = 0.7;
        }
        break;

      default:
        // Check if trigger matches any context data
        if (context.activePredictions.length > 0 && rule.actionType === 'recovery') {
          shouldSuggest = true;
          confidence = 0.6;
        }
        break;
    }

    if (!shouldSuggest) return null;

    return {
      id: generateSuggestionId(),
      title: rule.title,
      description: rule.description,
      actionType: rule.actionType,
      confidence,
      trigger: rule.trigger,
      futureMetadata: {},
    };
  }

  getByActionType(actionType: string): SuggestionRule | null {
    return this._rules.find((r) => r.actionType === actionType) ?? null;
  }
}
