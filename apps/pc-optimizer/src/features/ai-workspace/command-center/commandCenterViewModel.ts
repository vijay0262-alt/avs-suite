/**
 * AI Command Center — View Model
 *
 * EPIC 5 PHASE A PART 3
 *
 * Wraps the data aggregator output and provides
 * view-specific helpers for the dashboard.
 */
import type { CommandCenterViewModel, CopilotContext, WidgetCategory } from './types';
import type { CopilotSuggestion, CopilotActionPlan } from '../copilot/types';
import { CommandCenterDataAggregator } from './commandCenterDataAggregator';

export class CommandCenterViewModelEngine {
  private _aggregator: CommandCenterDataAggregator;
  private _cached: CommandCenterViewModel | null = null;
  private _lastContextHash: string = '';

  constructor() {
    this._aggregator = new CommandCenterDataAggregator();
  }

  build(context: CopilotContext, suggestions: CopilotSuggestion[] = [], actions: CopilotActionPlan[] = []): CommandCenterViewModel {
    const hash = this._hashContext(context);
    if (hash === this._lastContextHash && this._cached) {
      return this._cached;
    }
    this._cached = this._aggregator.aggregate(context, suggestions, actions);
    this._lastContextHash = hash;
    return this._cached;
  }

  getCached(): CommandCenterViewModel | null {
    return this._cached;
  }

  clearCache(): void {
    this._cached = null;
    this._lastContextHash = '';
  }

  getSummary(vm: CommandCenterViewModel): {
    healthScore: number | null;
    activeGoals: number;
    activeRecommendations: number;
    activePredictions: number;
    timelineEvents: number;
  } {
    return {
      healthScore: vm.health?.score ?? null,
      activeGoals: vm.goals?.activeGoals.length ?? 0,
      activeRecommendations: vm.recommendations?.total ?? 0,
      activePredictions: vm.predictions?.total ?? 0,
      timelineEvents: vm.timeline?.totalEvents ?? 0,
    };
  }

  getCategoryData(vm: CommandCenterViewModel, category: WidgetCategory): unknown {
    switch (category) {
      case 'health': return vm.health;
      case 'goals': return vm.goals;
      case 'recommendations': return vm.recommendations;
      case 'predictions': return vm.predictions;
      case 'maintenance': return vm.maintenance;
      case 'automation': return vm.automation;
      case 'timeline': return vm.timeline;
      case 'recovery': return vm.recovery;
      case 'device_profile': return vm.deviceProfile;
      case 'copilot': return vm.copilot;
      case 'optimization': return vm.optimization;
      default: return null;
    }
  }

  private _hashContext(context: CopilotContext): string {
    const parts: string[] = [];
    parts.push(`hs:${context.healthScore ?? 'null'}`);
    parts.push(`goals:${context.activeGoals.length}`);
    parts.push(`recs:${context.activeRecommendations.length}`);
    parts.push(`preds:${context.activePredictions.length}`);
    parts.push(`events:${context.recentTimelineEvents.length}`);
    parts.push(`maint:${context.maintenanceHistory.length}`);
    parts.push(`opt:${context.optimizationHistory.length}`);
    parts.push(`rec:${context.recoveryHistory.length}`);
    return parts.join('|');
  }
}
