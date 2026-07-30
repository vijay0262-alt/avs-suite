/**
 * AI Copilot Platform — Action Planner
 *
 * EPIC 5 PHASE A PART 1
 *
 * Plans actions without direct execution. The Copilot NEVER executes
 * optimizations. It only plans and presents actions for user confirmation.
 * Every action plan includes parameters, permissions, and evidence.
 */
import type {
  CopilotConfiguration,
  CopilotActionPlan,
  ActionType,
  CopilotContext,
  CopilotIntentType,
  CopilotEvidence,
  PermissionResult,
} from './types';
import { generateActionPlanId } from './types';
import type { CopilotPermissionEngine } from './copilotPermissionEngine';

export class CopilotActionPlanner {
  private _config: CopilotConfiguration;
  private _permissionEngine: CopilotPermissionEngine;

  constructor(config: CopilotConfiguration, permissionEngine: CopilotPermissionEngine) {
    this._config = config;
    this._permissionEngine = permissionEngine;
  }

  updateConfig(config: CopilotConfiguration): void {
    this._config = config;
  }

  createPlans(
    intent: CopilotIntentType,
    context: CopilotContext,
    userPermissionLevel: string,
  ): CopilotActionPlan[] {
    const plans: CopilotActionPlan[] = [];

    switch (intent) {
      case 'optimization':
      case 'planning': {
        if (context.activeRecommendations.length > 0) {
          plans.push(this._createPlan(
            'generate_optimization_session',
            'Generate Optimization Session',
            'Create an optimization session based on current recommendations.',
            { recommendationCount: context.activeRecommendations.length },
            userPermissionLevel,
            this._createEvidence('recommendations', 'count', context.activeRecommendations.length, 'Active recommendations'),
          ));
        }
        break;
      }
      case 'goal_management': {
        plans.push(this._createPlan(
          'create_goal',
          'Create Goal',
          'Create a new optimization goal.',
          {},
          userPermissionLevel,
          this._createEvidence('goals', 'action', 'create', 'User wants to manage goals'),
        ));
        break;
      }
      case 'comparison': {
        if (context.activeRecommendations.length > 1) {
          plans.push(this._createPlan(
            'compare_plans',
            'Compare Plans',
            'Compare different optimization strategies.',
            { recommendationCount: context.activeRecommendations.length },
            userPermissionLevel,
            this._createEvidence('recommendations', 'count', context.activeRecommendations.length, 'Multiple recommendations available'),
          ));
        }
        break;
      }
      case 'recovery': {
        if (context.recoveryHistory.length > 0) {
          plans.push(this._createPlan(
            'view_recovery',
            'View Recovery Options',
            'View available recovery and rollback options.',
            { recoveryCount: context.recoveryHistory.length },
            userPermissionLevel,
            this._createEvidence('recovery_history', 'count', context.recoveryHistory.length, 'Recovery history available'),
          ));
        }
        break;
      }
      case 'maintenance': {
        plans.push(this._createPlan(
          'start_maintenance',
          'Start Maintenance',
          'Start a maintenance session.',
          {},
          userPermissionLevel,
          this._createEvidence('maintenance', 'action', 'start', 'User wants maintenance'),
        ));
        break;
      }
      case 'navigation': {
        plans.push(this._createPlan(
          'navigate_to',
          'Navigate',
          'Navigate to a specific feature.',
          {},
          userPermissionLevel,
          this._createEvidence('navigation', 'action', 'navigate', 'User wants to navigate'),
        ));
        break;
      }
      case 'reporting': {
        plans.push(this._createPlan(
          'generate_report',
          'Generate Report',
          'Generate a comprehensive system report.',
          {},
          userPermissionLevel,
          this._createEvidence('reporting', 'action', 'generate', 'User wants a report'),
        ));
        break;
      }
    }

    // Always suggest viewing timeline if events exist
    if (context.recentTimelineEvents.length > 0 && intent !== 'navigation') {
      plans.push(this._createPlan(
        'open_timeline',
        'Open Timeline',
        'View your timeline to see recent system activity.',
        { eventCount: context.recentTimelineEvents.length },
        userPermissionLevel,
        this._createEvidence('timeline', 'count', context.recentTimelineEvents.length, 'Recent timeline events'),
      ));
    }

    return plans;
  }

  private _createPlan(
    type: ActionType,
    title: string,
    description: string,
    parameters: Record<string, unknown>,
    userPermissionLevel: string,
    evidence: CopilotEvidence,
  ): CopilotActionPlan {
    const permission = this._permissionEngine.check(type, userPermissionLevel as never);

    return {
      id: generateActionPlanId(),
      type,
      title,
      description,
      parameters,
      requiresConfirmation: type !== 'navigate_to' && type !== 'open_timeline',
      allowed: permission.allowed,
      permissionReason: permission.reason,
      estimatedBenefit: this._estimateBenefit(type),
      evidence: [evidence],
      futureMetadata: {},
    };
  }

  private _createEvidence(
    source: string,
    metric: string,
    value: string | number | boolean,
    description: string,
  ): CopilotEvidence {
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

  private _estimateBenefit(type: ActionType): string {
    switch (type) {
      case 'generate_optimization_session':
        return 'Improved system health and performance';
      case 'create_goal':
        return 'Trackable optimization objectives with measurable progress';
      case 'compare_plans':
        return 'Better decision-making through strategy comparison';
      case 'view_recovery':
        return 'Ability to rollback unwanted changes';
      case 'start_maintenance':
        return 'Preventive care to maintain system health';
      case 'generate_report':
        return 'Comprehensive overview of system status';
      case 'open_timeline':
        return 'Visibility into recent system activity';
      case 'navigate_to':
        return 'Quick access to desired feature';
      default:
        return 'Benefit assessment not available';
    }
  }
}
