/**
 * AI Workspace Personalization Platform — Layout Personalizer
 *
 * EPIC 5 PHASE A PART 7
 *
 * Personalizes dashboard layout and widget ordering based on
 * user preferences, behavior analysis, and profile templates.
 */
import type {
  UserPreferences,
  WorkspaceLayout,
  BehaviorAnalysisResult,
  WorkspaceProfile,
  PersonalizationSuggestion,
  WidgetPlacement,
  WorkspaceConfiguration,
} from './types';
import { generateSuggestionId } from './types';

export class LayoutPersonalizer {
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
  ): WorkspaceLayout {
    if (!preferences.personalizationEnabled || preferences.manualMode) {
      return structuredClone(preferences.layout);
    }

    let layout = structuredClone(preferences.layout);

    if (analysis) {
      layout = this._reorderBasedOnUsage(layout, analysis);
    }

    if (preferences.widgetOrdering.length > 0) {
      layout = this._applyWidgetOrdering(layout, preferences.widgetOrdering);
    }

    return layout;
  }

  applyProfileLayout(profile: WorkspaceProfile, currentLayout: WorkspaceLayout): WorkspaceLayout {
    return structuredClone(profile.layout);
  }

  generateLayoutSuggestions(
    preferences: UserPreferences,
    analysis: BehaviorAnalysisResult | null,
  ): PersonalizationSuggestion[] {
    if (!preferences.personalizationEnabled || preferences.manualMode) {
      return [];
    }

    const suggestions: PersonalizationSuggestion[] = [];
    const now = new Date().toISOString();

    if (analysis && analysis.toolUsage.length > 0) {
      const topTool = analysis.toolUsage[0]!;
      const relatedWidget = this._getWidgetForTool(topTool.toolId);
      if (relatedWidget) {
        const currentWidget = preferences.layout.widgets.find((w) => w.widgetId === relatedWidget);
        if (currentWidget && currentWidget.order > 0) {
          suggestions.push({
            id: generateSuggestionId(),
            type: 'widget_reorder',
            title: `Move ${relatedWidget} to top`,
            description: `Widget "${relatedWidget}" is related to your most used tool "${topTool.toolId}" but is not in the top position.`,
            currentValue: currentWidget.order,
            suggestedValue: 0,
            confidence: 0.7,
            evidence: [{
              source: 'behavior_analysis',
              metric: 'tool_usage_count',
              value: topTool.usageCount,
              timestamp: now,
              description: `Tool used ${topTool.usageCount} times`,
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

    if (preferences.layout.widgets.length > 5) {
      const hiddenWidgets = preferences.layout.widgets.filter((w) => !w.visible);
      if (hiddenWidgets.length === 0) {
        suggestions.push({
          id: generateSuggestionId(),
          type: 'layout_change',
          title: 'Consider hiding unused widgets',
          description: `You have ${preferences.layout.widgets.length} widgets visible. Hiding less-used ones can improve focus.`,
          currentValue: preferences.layout.widgets.length,
          suggestedValue: 5,
          confidence: 0.5,
          evidence: [{
            source: 'layout_analysis',
            metric: 'widget_count',
            value: preferences.layout.widgets.length,
            timestamp: now,
            description: `${preferences.layout.widgets.length} widgets visible`,
            confidence: 0.6,
            futureMetadata: {},
          }],
          actionable: true,
          dismissed: false,
          createdAt: now,
          futureMetadata: {},
        });
      }
    }

    if (analysis && analysis.activeHours.length > 0) {
      const peakHour = analysis.activeHours.reduce((max, h) => h.activityCount > max.activityCount ? h : max);
      if (peakHour.hour >= 22 || peakHour.hour < 6) {
        suggestions.push({
          id: generateSuggestionId(),
          type: 'layout_change',
          title: 'Enable dark mode for nighttime use',
          description: 'You are most active during nighttime hours. Dark mode may reduce eye strain.',
          currentValue: preferences.layout.theme,
          suggestedValue: 'dark',
          confidence: 0.6,
          evidence: [{
            source: 'behavior_analysis',
            metric: 'peak_activity_hour',
            value: peakHour.hour,
            timestamp: now,
            description: `Peak activity at ${peakHour.hour}:00`,
            confidence: 0.7,
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

  setWidgetVisibility(
    layout: WorkspaceLayout,
    widgetId: string,
    visible: boolean,
  ): WorkspaceLayout {
    const widgets = layout.widgets.map((w) =>
      w.widgetId === widgetId ? { ...w, visible } : w,
    );
    return { ...layout, widgets };
  }

  reorderWidgets(
    layout: WorkspaceLayout,
    widgetOrdering: string[],
  ): WorkspaceLayout {
    return this._applyWidgetOrdering(layout, widgetOrdering);
  }

  setTheme(
    layout: WorkspaceLayout,
    theme: WorkspaceLayout['theme'],
  ): WorkspaceLayout {
    return { ...layout, theme };
  }

  setCompactMode(layout: WorkspaceLayout, compact: boolean): WorkspaceLayout {
    return { ...layout, compactMode: compact };
  }

  private _reorderBasedOnUsage(layout: WorkspaceLayout, analysis: BehaviorAnalysisResult): WorkspaceLayout {
    const widgetPriority = new Map<string, number>();

    for (const tool of analysis.toolUsage) {
      const widget = this._getWidgetForTool(tool.toolId);
      if (widget) {
        widgetPriority.set(widget, (widgetPriority.get(widget) ?? 0) + tool.usageCount);
      }
    }

    const widgets = [...layout.widgets];
    widgets.sort((a, b) => {
      const aPriority = widgetPriority.get(a.widgetId) ?? 0;
      const bPriority = widgetPriority.get(b.widgetId) ?? 0;
      if (bPriority !== aPriority) return bPriority - aPriority;
      return a.order - b.order;
    });

    return {
      ...layout,
      widgets: widgets.map((w, i) => ({ ...w, order: i })),
    };
  }

  private _applyWidgetOrdering(layout: WorkspaceLayout, ordering: string[]): WorkspaceLayout {
    const widgetMap = new Map(layout.widgets.map((w) => [w.widgetId, w]));
    const reordered: WidgetPlacement[] = [];

    for (let i = 0; i < ordering.length; i++) {
      const orderId = ordering[i]!;
      const widget = widgetMap.get(orderId);
      if (widget) {
        reordered.push({ ...widget, order: i });
        widgetMap.delete(orderId);
      }
    }

    let nextOrder = ordering.length;
    for (const remaining of widgetMap.values()) {
      reordered.push({ ...remaining, order: nextOrder++ });
    }

    return { ...layout, widgets: reordered };
  }

  private _getWidgetForTool(toolId: string): string | null {
    const toolWidgetMap: Record<string, string> = {
      create_optimization_session: 'health_score',
      explain_health: 'health_score',
      generate_report: 'recommendations',
      create_goal: 'goals',
      start_maintenance: 'timeline',
      run_simulation: 'recommendations',
      compare_plans: 'recommendations',
      explain_recommendation: 'recommendations',
    };
    return toolWidgetMap[toolId] ?? null;
  }
}
