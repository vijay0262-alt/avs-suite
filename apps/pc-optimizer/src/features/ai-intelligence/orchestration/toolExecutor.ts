/**
 * Tool Executor — executes registered tools safely.
 *
 * Collects results from tool execution. Handles failures gracefully.
 * Never executes system actions — only reads data from AI modules.
 */
import type {
  ToolParams,
  ToolResult,
  TaskStep,
  AIModuleName,
} from './types';
import type { ToolRegistry } from './toolRegistry';
import { generateTaskStepId } from './types';

export class ToolExecutor {
  private _registry: ToolRegistry;
  private _invocationCount = 0;

  constructor(registry: ToolRegistry) {
    this._registry = registry;
  }

  executeTool(name: string, params: ToolParams): ToolResult {
    const tool = this._registry.getTool(name);
    if (!tool) {
      return { success: false, data: null, error: `Tool not found: ${name}`, metadata: {} };
    }
    if (!tool.isAvailable()) {
      return { success: false, data: null, error: `Tool not available: ${name}`, metadata: {} };
    }

    this._invocationCount++;
    try {
      return tool.execute(params);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, data: null, error: message, metadata: { toolName: name } };
    }
  }

  executeSteps(
    toolNames: string[],
    params: ToolParams,
  ): TaskStep[] {
    const steps: TaskStep[] = [];

    for (let i = 0; i < toolNames.length; i++) {
      const name = toolNames[i]!;
      const step: TaskStep = {
        id: generateTaskStepId(),
        stepNumber: i + 1,
        module: this._getModuleForTool(name),
        toolName: name,
        description: `Execute ${name}`,
        status: 'pending',
        result: null,
        error: null,
        durationMs: 0,
      };

      const start = performance.now();
      step.status = 'running';
      const result = this.executeTool(name, params);
      step.durationMs = performance.now() - start;

      if (result.success) {
        step.status = 'completed';
        step.result = result.data;
      } else {
        step.status = 'failed';
        step.error = result.error;
      }

      steps.push(step);
    }

    return steps;
  }

  get invocationCount(): number {
    return this._invocationCount;
  }

  reset(): void {
    this._invocationCount = 0;
  }

  private _getModuleForTool(name: string): AIModuleName {
    const tool = this._registry.getTool(name);
    return tool?.module ?? 'future';
  }
}
