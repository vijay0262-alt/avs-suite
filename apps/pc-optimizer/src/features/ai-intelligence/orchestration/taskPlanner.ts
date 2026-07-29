/**
 * Task Planner — creates multi-step plans for conversation handling.
 *
 * Dynamically selects required modules based on intent.
 * Supports multi-step planning for complex queries.
 */
import type {
  ConversationIntentType,
  TaskPlan,
  TaskStep,
  IntentDefinition,
  ConversationConfiguration,
  AIModuleName,
} from './types';
import { generateTaskPlanId } from './types';

export class TaskPlanner {
  private _config: ConversationConfiguration;

  constructor(config: ConversationConfiguration) {
    this._config = config;
  }

  updateConfig(config: ConversationConfiguration): void {
    this._config = config;
  }

  plan(intent: ConversationIntentType, intentDef: IntentDefinition | undefined): TaskPlan {
    const rules = this._config.plannerRules;
    const steps: TaskStep[] = [];

    // Get tools from intent definition or fallback
    const tools = intentDef?.suggestedTools ?? ['GetHealthSummary'];
    const modules = intentDef?.requiredModules ?? ['context'];

    // Limit steps
    const maxTools = Math.min(tools.length, rules.maxSteps);

    for (let i = 0; i < maxTools; i++) {
      const toolName = tools[i]!;
      const module = this._inferModule(toolName, modules);
      steps.push({
        id: `step_${i + 1}`,
        stepNumber: i + 1,
        module,
        toolName,
        description: `Execute ${toolName} to gather ${this._moduleLabel(module)} data`,
        status: 'pending',
        result: null,
        error: null,
        durationMs: 0,
      });
    }

    // Always add a compose step
    if (steps.length < rules.maxSteps) {
      steps.push({
        id: `step_${steps.length + 1}`,
        stepNumber: steps.length + 1,
        module: 'future',
        toolName: 'ComposeResponse',
        description: 'Compose structured response from collected data',
        status: 'pending',
        result: null,
        error: null,
        durationMs: 0,
      });
    }

    return {
      id: generateTaskPlanId(),
      intent,
      steps,
      createdAt: new Date().toISOString(),
      estimatedDurationMs: steps.length * 50,
    };
  }

  // ── Private ────────────────────────────────────────────────

  private _inferModule(toolName: string, fallbackModules: AIModuleName[]): AIModuleName {
    const toolDef = this._config.toolDefinitions.find((t) => t.name === toolName);
    if (toolDef) return toolDef.module;
    return fallbackModules[0] ?? 'context';
  }

  private _moduleLabel(module: AIModuleName): string {
    const labels: Record<AIModuleName, string> = {
      context: 'Context',
      knowledge: 'Knowledge',
      recommendations: 'Recommendation',
      insights: 'Insight',
      predictions: 'Prediction',
      device_profile: 'Device Profile',
      history: 'History',
      future: 'Response',
    };
    return labels[module] ?? 'Unknown';
  }
}
