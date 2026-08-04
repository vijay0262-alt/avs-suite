/**
 * AI Command Center — State Manager
 *
 * EPIC 5 PHASE A PART 3
 *
 * Manages the overall dashboard state including layout,
 * widget instances, view model, loading state, and search.
 */
import type { DashboardState, DashboardLayout, WidgetInstance, CommandCenterViewModel, SearchResult, SearchQuery, AIAssistantContext } from './types';
import type { AIAssistantSuggestion, AIAssistantActionPlan } from '../AIAssistant/types';
import type { CommandCenterLayoutEngine } from './commandCenterLayoutEngine';
import type { CommandCenterWidgetManager } from './commandCenterWidgetManager';
import type { CommandCenterViewModelEngine } from './commandCenterViewModel';
import type { CommandCenterWidgetRegistry } from './commandCenterWidgetRegistry';

export class CommandCenterStateManager {
  private _layoutEngine: CommandCenterLayoutEngine;
  private _widgetManager: CommandCenterWidgetManager;
  private _viewModelEngine: CommandCenterViewModelEngine;
  private _registry: CommandCenterWidgetRegistry;
  private _state: DashboardState;

  constructor(
    layoutEngine: CommandCenterLayoutEngine,
    widgetManager: CommandCenterWidgetManager,
    viewModelEngine: CommandCenterViewModelEngine,
    registry: CommandCenterWidgetRegistry,
  ) {
    this._layoutEngine = layoutEngine;
    this._widgetManager = widgetManager;
    this._viewModelEngine = viewModelEngine;
    this._registry = registry;

    this._state = {
      layout: layoutEngine.getCurrentLayout() ?? {
        id: 'empty',
        name: 'Empty',
        type: 'grid',
        widgets: [],
        savedAt: new Date().toISOString(),
        futureMetadata: {},
      },
      widgets: [],
      viewModel: null,
      lastLoadedAt: null,
      lastUpdatedAt: null,
      isLoading: false,
      futureMetadata: {},
    };
  }

  getState(): DashboardState {
    return this._state;
  }

  setLoading(loading: boolean): void {
    this._state.isLoading = loading;
  }

  setLayout(layout: DashboardLayout): void {
    this._layoutEngine.setDefaultLayout(layout);
    this._state.layout = layout;
  }

  updateWidgets(instances: WidgetInstance[]): void {
    this._state.widgets = instances;
    this._state.lastUpdatedAt = new Date().toISOString();
  }

  updateViewModel(context: AIAssistantContext, suggestions: AIAssistantSuggestion[] = [], actions: AIAssistantActionPlan[] = []): CommandCenterViewModel {
    const vm = this._viewModelEngine.build(context, suggestions, actions);
    this._state.viewModel = vm;
    this._state.lastUpdatedAt = new Date().toISOString();
    return vm;
  }

  markLoaded(): void {
    this._state.lastLoadedAt = new Date().toISOString();
    this._state.isLoading = false;
  }

  search(query: SearchQuery): SearchResult[] {
    const results: SearchResult[] = [];
    const q = query.query.toLowerCase();

    // Search widgets
    const widgetDefs = this._registry.search(query.query);
    for (const def of widgetDefs) {
      results.push({
        type: 'widget',
        id: def.id,
        title: def.title,
        description: def.category,
        category: def.category,
        futureMetadata: {},
      });
    }

    // Search goals from view model
    if (this._state.viewModel?.goals) {
      for (const goal of this._state.viewModel.goals.activeGoals) {
        if (goal.name.toLowerCase().includes(q)) {
          results.push({
            type: 'goal',
            id: goal.id,
            title: goal.name,
            description: `Status: ${goal.status}, Progress: ${(goal.progress * 100).toFixed(0)}%`,
            category: 'goals',
            futureMetadata: {},
          });
        }
      }
    }

    // Search recommendations
    if (this._state.viewModel?.recommendations) {
      for (const rec of this._state.viewModel.recommendations.topRecommendations) {
        if (rec.title.toLowerCase().includes(q)) {
          results.push({
            type: 'recommendation',
            id: rec.id,
            title: rec.title,
            description: `Priority: ${rec.priority}, Category: ${rec.category}`,
            category: 'recommendations',
            futureMetadata: {},
          });
        }
      }
    }

    // Search timeline
    if (this._state.viewModel?.timeline) {
      for (const event of this._state.viewModel.timeline.recentEvents) {
        if (event.title.toLowerCase().includes(q)) {
          results.push({
            type: 'timeline',
            id: event.id,
            title: event.title,
            description: `Category: ${event.category}, Severity: ${event.severity}`,
            category: 'timeline',
            futureMetadata: {},
          });
        }
      }
    }

    return results;
  }

  reset(): void {
    this._state = {
      layout: this._layoutEngine.getCurrentLayout() ?? this._state.layout,
      widgets: [],
      viewModel: null,
      lastLoadedAt: null,
      lastUpdatedAt: null,
      isLoading: false,
      futureMetadata: {},
    };
  }
}
