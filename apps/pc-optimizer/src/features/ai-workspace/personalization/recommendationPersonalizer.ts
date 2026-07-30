/**
 * AI Workspace Personalization Platform — Recommendation Personalizer
 *
 * EPIC 5 PHASE A PART 7
 *
 * Personalizes recommendation display and filtering based on user
 * acceptance patterns, preferred categories, and profile settings.
 */
import type {
  UserPreferences,
  BehaviorAnalysisResult,
  PersonalizationSuggestion,
  WorkspaceConfiguration,
  PreferenceEvidence,
} from './types';
import { generateSuggestionId } from './types';

export interface RecommendationFilter {
  categories: string[];
  minPriority: string;
  sortBy: 'priority' | 'confidence' | 'recent';
  maxItems: number;
  futureMetadata: Record<string, unknown>;
}

export class RecommendationPersonalizer {
  private _config: WorkspaceConfiguration;

  constructor(config: WorkspaceConfiguration) {
    this._config = config;
  }

  updateConfig(config: WorkspaceConfiguration): void {
    this._config = config;
  }

  createFilter(
    preferences: UserPreferences,
    analysis: BehaviorAnalysisResult | null,
  ): RecommendationFilter {
    if (!preferences.personalizationEnabled || preferences.manualMode) {
      return {
        categories: [],
        minPriority: 'low',
        sortBy: 'priority',
        maxItems: 20,
        futureMetadata: {},
      };
    }

    const categories: string[] = [];

    if (analysis) {
      if (analysis.recommendationAcceptanceRate > 0.7) {
        categories.push('high_confidence');
      }
      if (analysis.preferredReports.length > 0) {
        categories.push('report_related');
      }
    }

    const minPriority = preferences.notificationPreferences.priorityThreshold;

    return {
      categories,
      minPriority,
      sortBy: 'priority',
      maxItems: 15,
      futureMetadata: {},
    };
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

    if (analysis && analysis.recommendationAcceptanceRate < 0.3 && analysis.totalEvents > 10) {
      suggestions.push({
        id: generateSuggestionId(),
        type: 'notification_adjustment',
        title: 'Adjust notification priority threshold',
        description: `You dismiss ${((1 - analysis.recommendationAcceptanceRate) * 100).toFixed(0)}% of recommendations. Raising the priority threshold may reduce noise.`,
        currentValue: preferences.notificationPreferences.priorityThreshold,
        suggestedValue: 'high',
        confidence: 0.65,
        evidence: [{
          source: 'behavior_analysis',
          metric: 'dismissal_rate',
          value: 1 - analysis.recommendationAcceptanceRate,
          timestamp: now,
          description: `Dismissal rate: ${((1 - analysis.recommendationAcceptanceRate) * 100).toFixed(0)}%`,
          confidence: 0.7,
          futureMetadata: {},
        }],
        actionable: true,
        dismissed: false,
        createdAt: now,
        futureMetadata: {},
      });
    }

    if (analysis && analysis.preferredReports.length > 0) {
      const topReport = analysis.preferredReports[0]!;
      if (!preferences.favoriteReports.includes(topReport)) {
        suggestions.push({
          id: generateSuggestionId(),
          type: 'report_favorite',
          title: `Add "${topReport}" to favorite reports`,
          description: 'This is your most viewed report. Adding it to favorites for quick access.',
          currentValue: null,
          suggestedValue: topReport,
          confidence: 0.7,
          evidence: [{
            source: 'behavior_analysis',
            metric: 'report_view_count',
            value: topReport,
            timestamp: now,
            description: `Most viewed report: ${topReport}`,
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

    if (analysis && analysis.toolUsage.length > 0) {
      const topTool = analysis.toolUsage[0]!;
      if (!preferences.frequentlyUsedTools.includes(topTool.toolId)) {
        suggestions.push({
          id: generateSuggestionId(),
          type: 'tool_favorite',
          title: `Add "${topTool.toolId}" to favorite tools`,
          description: `You've used this tool ${topTool.usageCount} times. Pin it for quick access.`,
          currentValue: null,
          suggestedValue: topTool.toolId,
          confidence: Math.min(0.5 + topTool.usageCount * 0.1, 0.9),
          evidence: [{
            source: 'behavior_analysis',
            metric: 'tool_usage_count',
            value: topTool.usageCount,
            timestamp: now,
            description: `Used ${topTool.usageCount} times`,
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

    return suggestions;
  }

  filterRecommendations<T extends { category: string; priority: string; confidence: number; createdAt: string }>(
    items: T[],
    filter: RecommendationFilter,
  ): T[] {
    let filtered = items;

    if (filter.categories.length > 0) {
      filtered = filtered.filter((item) => filter.categories.includes(item.category));
    }

    const priorityOrder = ['low', 'medium', 'high', 'critical'];
    const minIdx = priorityOrder.indexOf(filter.minPriority);
    if (minIdx > 0) {
      filtered = filtered.filter((item) => {
        const itemIdx = priorityOrder.indexOf(item.priority);
        return itemIdx >= minIdx;
      });
    }

    switch (filter.sortBy) {
      case 'priority':
        filtered.sort((a, b) => priorityOrder.indexOf(b.priority) - priorityOrder.indexOf(a.priority));
        break;
      case 'confidence':
        filtered.sort((a, b) => b.confidence - a.confidence);
        break;
      case 'recent':
        filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
    }

    return filtered.slice(0, filter.maxItems);
  }
}
