/**
 * Action Factory — creates action definitions and instances.
 *
 * Supports creating definitions from partials and instantiating
 * BaseAction subclasses.
 */
import type {
  DashboardActionDefinition,
  DashboardActionType,
  WidgetType,
  ActionExplanation,
  ActionRouting,
} from './types';
import { createActionDefinition, generateActionId } from './types';
import type { BaseAction } from './baseAction';

export class ActionFactory {
  static createDefinition(
    actionType: DashboardActionType,
    widgetId: string,
    widgetType: WidgetType,
    overrides?: Partial<Omit<DashboardActionDefinition, 'id' | 'actionType' | 'widgetId' | 'widgetType'>>,
  ): DashboardActionDefinition {
    const id = generateActionId(actionType, widgetId);
    return createActionDefinition({
      id,
      actionType,
      widgetId,
      widgetType,
      ...overrides,
    });
  }

  static createDefinitionWithId(
    id: string,
    actionType: DashboardActionType,
    widgetId: string,
    widgetType: WidgetType,
    overrides?: Partial<Omit<DashboardActionDefinition, 'id' | 'actionType' | 'widgetId' | 'widgetType'>>,
  ): DashboardActionDefinition {
    return createActionDefinition({
      id,
      actionType,
      widgetId,
      widgetType,
      ...overrides,
    });
  }

  static createExplanation(partial: Partial<ActionExplanation>): ActionExplanation {
    return {
      whyExists: partial.whyExists ?? '',
      expectedBenefits: partial.expectedBenefits ?? '',
      estimatedTime: partial.estimatedTime ?? 0,
      estimatedImpact: partial.estimatedImpact ?? 'unknown',
      confidence: partial.confidence ?? 0,
      rollbackAvailable: partial.rollbackAvailable ?? false,
      relatedRecommendations: partial.relatedRecommendations ?? [],
      relatedPredictions: partial.relatedPredictions ?? [],
    };
  }

  static createRouting(route: ActionRouting['route'], target?: string, payload?: Record<string, unknown>): ActionRouting {
    return { route, target, payload };
  }
}

export type { BaseAction };
