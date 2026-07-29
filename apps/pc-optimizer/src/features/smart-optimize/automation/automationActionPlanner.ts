/**
 * Automation Action Planner — plans actions from matched rules.
 *
 * Supported actions: Generate Optimization Plan, Queue Maintenance,
 * Notify User, Request Approval, Regenerate Recommendations,
 * Refresh Predictions, Refresh Dashboard, Schedule Execution,
 * Dismiss Recommendation, Log Event, Future Actions.
 *
 * Does NOT execute optimizations directly.
 */
import type {
  AutomationAction,
  AutomationActionContext,
  AutomationActionPlugin,
  AutomationPlannedAction,
  AutomationActionType,
} from './types';

export class AutomationActionPlanner {
  private _plugins: AutomationActionPlugin[] = [];

  registerPlugin(plugin: AutomationActionPlugin): void {
    this._plugins.push(plugin);
    this._plugins.sort((a, b) => a.getPriority() - b.getPriority());
  }

  planActions(
    actions: AutomationAction[],
    context: AutomationActionContext,
  ): AutomationPlannedAction[] {
    return actions
      .filter((a) => a.enabled)
      .map((a) => this.planAction(a, context));
  }

  planAction(action: AutomationAction, context: AutomationActionContext): AutomationPlannedAction {
    // Check plugins first
    for (const plugin of this._plugins) {
      if (plugin.isAvailable() && plugin.getActionType() === action.type) {
        return plugin.plan(action, context);
      }
    }

    return this._planBuiltin(action, context);
  }

  private _planBuiltin(action: AutomationAction, context: AutomationActionContext): AutomationPlannedAction {
    const base: AutomationPlannedAction = {
      action,
      executable: true,
      requiresApproval: false,
      parameters: { ...action.parameters },
      futureMetadata: {},
    };

    switch (action.type) {
      case 'generate_optimization_plan':
        return { ...base, requiresApproval: true, parameters: { ...base.parameters, goal: action.parameters['goal'] ?? 'balanced' } };
      case 'queue_maintenance':
        return { ...base, requiresApproval: true, parameters: { ...base.parameters, type: action.parameters['type'] ?? 'routine_maintenance' } };
      case 'notify_user':
        return { ...base, requiresApproval: false, parameters: { ...base.parameters, message: action.parameters['message'] ?? 'Automation triggered' } };
      case 'request_approval':
        return { ...base, requiresApproval: true, parameters: { ...base.parameters } };
      case 'regenerate_recommendations':
        return { ...base, requiresApproval: false, parameters: { ...base.parameters } };
      case 'refresh_predictions':
        return { ...base, requiresApproval: false, parameters: { ...base.parameters } };
      case 'refresh_dashboard':
        return { ...base, requiresApproval: false, parameters: { ...base.parameters } };
      case 'schedule_execution':
        return { ...base, requiresApproval: true, parameters: { ...base.parameters, scheduledTime: action.parameters['scheduledTime'] ?? context.timestamp } };
      case 'dismiss_recommendation':
        return { ...base, requiresApproval: false, parameters: { ...base.parameters, recommendationId: action.parameters['recommendationId'] } };
      case 'log_event':
        return { ...base, requiresApproval: false, parameters: { ...base.parameters, event: action.parameters['event'] ?? 'automation_event' } };
      default:
        return { ...base, executable: false, parameters: {} };
    }
  }

  getSupportedActionTypes(): AutomationActionType[] {
    return [
      'generate_optimization_plan',
      'queue_maintenance',
      'notify_user',
      'request_approval',
      'regenerate_recommendations',
      'refresh_predictions',
      'refresh_dashboard',
      'schedule_execution',
      'dismiss_recommendation',
      'log_event',
    ];
  }
}
