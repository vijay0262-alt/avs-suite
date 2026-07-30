/**
 * AI Tool Framework — Executor
 *
 * EPIC 5 PHASE A PART 2
 *
 * Executes tools with: Validation → Permission Check → Capability Check →
 * Quota Check → Context Resolution → Execution → Result Formatting → Telemetry
 *
 * The executor NEVER executes optimizations directly.
 * It calls tool.execute() which orchestrates business module outputs.
 */
import type { ToolConfiguration, ToolInput, ToolResult, Tool } from './types';
import { generateExecutionId } from './types';
import type { ToolRegistry } from './toolRegistry';
import type { ToolValidator } from './toolValidator';
import type { ToolPermissionEngine } from './toolPermissionEngine';
import type { ToolTelemetry } from './toolTelemetry';
import type { ToolEvents } from './toolEvents';

export class ToolExecutor {
  private _config: ToolConfiguration;
  private _registry: ToolRegistry;
  private _validator: ToolValidator;
  private _permissionEngine: ToolPermissionEngine;
  private _telemetry: ToolTelemetry;
  private _events: ToolEvents;
  private _activeExecutions: number = 0;

  constructor(
    config: ToolConfiguration,
    registry: ToolRegistry,
    validator: ToolValidator,
    permissionEngine: ToolPermissionEngine,
    telemetry: ToolTelemetry,
    events: ToolEvents,
  ) {
    this._config = config;
    this._registry = registry;
    this._validator = validator;
    this._permissionEngine = permissionEngine;
    this._telemetry = telemetry;
    this._events = events;
  }

  updateConfig(config: ToolConfiguration): void {
    this._config = config;
  }

  async execute(input: ToolInput): Promise<ToolResult> {
    const executionId = generateExecutionId();
    const startTime = Date.now();
    const startISO = new Date().toISOString();

    // 1. Check feature flag
    if (!this._config.featureFlags.enableToolExecution) {
      return this._fail(executionId, input.toolId, 'Tool execution is disabled', startTime, startISO);
    }

    // 2. Find tool
    const tool = this._registry.getTool(input.toolId);
    if (!tool) {
      return this._fail(executionId, input.toolId, `Tool not found: ${input.toolId}`, startTime, startISO);
    }

    // 3. Validate input
    const validation = this._validator.validateInput(input, tool);
    if (!validation.valid) {
      return this._fail(executionId, input.toolId, `Validation failed: ${validation.errors.map((e) => e.message).join('; ')}`, startTime, startISO);
    }

    // 4. Permission check
    const permission = this._permissionEngine.check(
      tool.definition,
      input.userPermissionLevel,
      input.userCapabilities,
    );
    if (!permission.allowed) {
      return this._fail(executionId, input.toolId, `Permission denied: ${permission.reason}`, startTime, startISO);
    }

    // 5. Quota check
    if (this._activeExecutions >= this._config.executionPolicies.maxConcurrentExecutions) {
      return this._fail(executionId, input.toolId, 'Max concurrent executions reached', startTime, startISO);
    }

    // 6. Emit selected event
    this._events.emit({
      type: 'tool_selected',
      toolId: input.toolId,
      timestamp: startISO,
      data: { executionId },
    });

    // 7. Execute
    this._activeExecutions++;
    let result: ToolResult;
    try {
      if (this._config.executionPolicies.defaultTimeoutMs > 0) {
        result = await this._executeWithTimeout(tool, input, executionId, startTime);
      } else {
        result = await tool.execute(input);
      }
    } catch (err) {
      result = {
        toolId: input.toolId,
        executionId,
        status: 'failed',
        confidence: 0,
        summary: `Execution error: ${err instanceof Error ? err.message : String(err)}`,
        details: {},
        supportingEvidence: [],
        recommendedActions: [],
        relatedModules: [],
        executionTime: Date.now() - startTime,
        errorMessage: err instanceof Error ? err.message : String(err),
        futureMetadata: {},
      };
    } finally {
      this._activeExecutions--;
    }

    // 8. Record telemetry
    const endISO = new Date().toISOString();
    this._telemetry.record({
      executionId,
      toolId: input.toolId,
      status: result.status,
      startTime: startISO,
      endTime: endISO,
      durationMs: result.executionTime,
      confidence: result.confidence,
      errorMessage: result.errorMessage,
      futureMetadata: {},
    });

    // 9. Emit event
    this._events.emit({
      type: result.status === 'success' ? 'tool_executed' : 'tool_failed',
      toolId: input.toolId,
      timestamp: endISO,
      data: { executionId, result },
    });

    return result;
  }

  private async _executeWithTimeout(
    tool: Tool,
    input: ToolInput,
    executionId: string,
    startTime: number,
  ): Promise<ToolResult> {
    const timeoutMs = this._config.executionPolicies.defaultTimeoutMs;
    return new Promise<ToolResult>((resolve) => {
      const timer = setTimeout(() => {
        resolve({
          toolId: input.toolId,
          executionId,
          status: 'timeout',
          confidence: 0,
          summary: `Tool execution timed out after ${timeoutMs}ms`,
          details: {},
          supportingEvidence: [],
          recommendedActions: [],
          relatedModules: [],
          executionTime: Date.now() - startTime,
          errorMessage: `Timeout after ${timeoutMs}ms`,
          futureMetadata: {},
        });
      }, timeoutMs);

      tool.execute(input).then((result) => {
        clearTimeout(timer);
        resolve(result);
      });
    });
  }

  private _fail(
    executionId: string,
    toolId: string,
    message: string,
    startTime: number,
    startISO: string,
  ): ToolResult {
    const endISO = new Date().toISOString();
    const result: ToolResult = {
      toolId,
      executionId,
      status: 'failed',
      confidence: 0,
      summary: message,
      details: {},
      supportingEvidence: [],
      recommendedActions: [],
      relatedModules: [],
      executionTime: Date.now() - startTime,
      errorMessage: message,
      futureMetadata: {},
    };

    this._telemetry.record({
      executionId,
      toolId,
      status: 'failed',
      startTime: startISO,
      endTime: endISO,
      durationMs: result.executionTime,
      confidence: 0,
      errorMessage: message,
      futureMetadata: {},
    });

    this._events.emit({
      type: 'tool_failed',
      toolId,
      timestamp: endISO,
      data: { executionId, message },
    });

    return result;
  }

  getActiveExecutionCount(): number {
    return this._activeExecutions;
  }
}
