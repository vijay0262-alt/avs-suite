/**
 * Natural Language Action Engine — Action Resolver
 *
 * EPIC 5 PHASE A PART 4
 *
 * Resolves intents to tools using the AI Tool Framework.
 * Does NOT execute tools — only selects them.
 */
import type { ClassifiedIntent, ToolDefinition, CopilotContext, CopilotIntentType } from './types';
import type { ToolManager } from '../tools/toolManager';

export class ActionResolver {
  private _toolManager: ToolManager | null = null;

  setToolManager(manager: ToolManager): void {
    this._toolManager = manager;
  }

  resolve(intent: ClassifiedIntent, context: CopilotContext): ToolDefinition[] {
    if (!this._toolManager) return [];

    // Map intent action types to Copilot intent types for tool resolution
    const copilotIntent = this._mapToCopilotIntent(intent.intent);
    if (!copilotIntent) return [];

    const resolution = this._toolManager.resolveTool(copilotIntent, context);
    const tools: ToolDefinition[] = [];

    if (resolution.selectedTool) {
      tools.push(resolution.selectedTool);
    }
    for (const alt of resolution.alternatives) {
      tools.push(alt);
    }

    // Also include tools explicitly required by the intent
    for (const toolId of intent.requiredTools) {
      const meta = this._toolManager.getToolMetadata(toolId);
      if (meta && !tools.some((t) => t.id === meta.id)) {
        tools.push(meta);
      }
    }

    return tools;
  }

  resolveByIds(toolIds: string[]): ToolDefinition[] {
    if (!this._toolManager) return [];
    const tools: ToolDefinition[] = [];
    for (const id of toolIds) {
      const meta = this._toolManager.getToolMetadata(id);
      if (meta) tools.push(meta);
    }
    return tools;
  }

  private _mapToCopilotIntent(actionType: string): CopilotIntentType | null {
    const mapping: Record<string, CopilotIntentType> = {
      optimization: 'optimization',
      maintenance: 'maintenance',
      recovery: 'recovery',
      simulation: 'planning',
      goal_management: 'goal_management',
      timeline_navigation: 'explanation',
      health_analysis: 'explanation',
      report_generation: 'reporting',
      recommendation_management: 'explanation',
      automation_management: 'maintenance',
      settings_navigation: 'navigation',
    };
    return mapping[actionType] ?? null;
  }
}
