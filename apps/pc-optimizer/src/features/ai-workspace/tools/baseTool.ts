/**
 * AI Tool Framework — Base Tool
 *
 * EPIC 5 PHASE A PART 2
 *
 * Abstract base class for all tools.
 * Provides common structure and helper methods.
 * Tools orchestrate existing business module outputs
 * without duplicating business logic.
 */
import type {
  Tool,
  ToolDefinition,
  ToolInput,
  ToolResult,
  CopilotContext,
  CopilotIntentType,
  CopilotEvidence,
  ContextSourceType,
  ExecutionStatus,
} from './types';
import { generateExecutionId, clampConfidence } from './types';

export abstract class BaseTool implements Tool {
  abstract readonly definition: ToolDefinition;

  abstract execute(input: ToolInput): Promise<ToolResult>;

  canHandle(intent: CopilotIntentType, context: CopilotContext): boolean {
    if (!this.definition.supportedIntents.includes(intent)) return false;
    return this._hasRequiredContext(context);
  }

  getRequiredContext(): ContextSourceType[] {
    return this.definition.requiredContext;
  }

  protected _hasRequiredContext(context: CopilotContext): boolean {
    for (const required of this.definition.requiredContext) {
      const source = context.sources.find((s) => s.type === required);
      if (!source || !source.available) return false;
    }
    return true;
  }

  protected _createEvidence(
    source: string,
    metric: string,
    value: string | number | boolean,
    description: string,
    confidence: number = 1.0,
  ): CopilotEvidence {
    return {
      source,
      metric,
      value,
      timestamp: new Date().toISOString(),
      description,
      confidence,
      futureMetadata: {},
    };
  }

  protected _createSuccessResult(
    toolId: string,
    confidence: number,
    summary: string,
    details: Record<string, unknown>,
    evidence: CopilotEvidence[],
    recommendedActions: ToolResult['recommendedActions'],
    relatedModules: string[],
    executionTime: number,
  ): ToolResult {
    return {
      toolId,
      executionId: generateExecutionId(),
      status: 'success',
      confidence: clampConfidence(confidence),
      summary,
      details,
      supportingEvidence: evidence,
      recommendedActions,
      relatedModules,
      executionTime,
      errorMessage: null,
      futureMetadata: {},
    };
  }

  protected _createFailureResult(
    toolId: string,
    errorMessage: string,
    executionTime: number,
  ): ToolResult {
    return {
      toolId,
      executionId: generateExecutionId(),
      status: 'failed',
      confidence: 0,
      summary: `Tool execution failed: ${errorMessage}`,
      details: {},
      supportingEvidence: [],
      recommendedActions: [],
      relatedModules: [],
      executionTime,
      errorMessage,
      futureMetadata: {},
    };
  }
}
