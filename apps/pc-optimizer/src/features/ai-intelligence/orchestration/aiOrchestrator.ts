/**
 * AI Orchestrator — the single gateway between LLMs and the AVS AI Shield
 * Intelligence Platform.
 *
 * Coordinates:
 *   Intent Resolution → Task Planning → Tool Execution →
 *   Context Building → Explanation Building → Response Composition →
 *   Validation → Events
 *
 * It NEVER executes system actions.
 * It NEVER exposes raw internal services.
 * It ONLY coordinates existing AI modules.
 */
import type {
  AIContext,
  KnowledgeObject,
  RecommendationList,
  InsightList,
  PredictionList,
  DeviceProfile,
  ConversationRequest,
  ConversationResponse,
  ConversationContext,
  ConversationStatistics,
  ConversationConfiguration,
  ConversationValidationResult,
  ConversationMemoryData,
  ConversationIntentType,
  IntentResolutionResult,
  ToolParams,
  OrchestratorTool,
  ContextDetailLevel,
} from './types';
import { IntentResolver } from './intentResolver';
import { TaskPlanner } from './taskPlanner';
import { ToolRegistry } from './toolRegistry';
import { ToolExecutor } from './toolExecutor';
import { ConversationContextBuilder } from './conversationContextBuilder';
import { ExplanationBuilder } from './explanationBuilder';
import { ResponseComposer } from './responseComposer';
import { ConversationValidator } from './conversationValidator';
import { ConversationMemory } from './conversationMemory';
import { ConversationEventEmitter } from './conversationEvents';
import { DEFAULT_CONVERSATION_CONFIG, createConversationConfig } from './conversationConfiguration';

export interface OrchestratorDataBundle {
  context: AIContext | null;
  knowledge: KnowledgeObject | null;
  recommendations: RecommendationList | null;
  insights: InsightList | null;
  predictions: PredictionList | null;
  deviceProfile: DeviceProfile | null;
}

export class AIOrchestrator {
  private _config: ConversationConfiguration;
  private _intentResolver: IntentResolver;
  private _taskPlanner: TaskPlanner;
  private _toolRegistry: ToolRegistry;
  private _toolExecutor: ToolExecutor;
  private _contextBuilder: ConversationContextBuilder;
  private _explanationBuilder: ExplanationBuilder;
  private _responseComposer: ResponseComposer;
  private _validator: ConversationValidator;
  private _memory: ConversationMemory;
  private _events: ConversationEventEmitter;

  private _stats: {
    totalConversations: number;
    totalTurns: number;
    byIntent: Record<string, number>;
    totalConfidence: number;
    totalResponseTimeMs: number;
    toolInvocations: number;
    failedConversations: number;
    lastConversationAt: string | null;
  };

  constructor(config?: ConversationConfiguration) {
    this._config = config ?? { ...DEFAULT_CONVERSATION_CONFIG };
    this._intentResolver = new IntentResolver(this._config);
    this._taskPlanner = new TaskPlanner(this._config);
    this._toolRegistry = new ToolRegistry();
    this._toolExecutor = new ToolExecutor(this._toolRegistry);
    this._contextBuilder = new ConversationContextBuilder(this._config);
    this._explanationBuilder = new ExplanationBuilder(this._config);
    this._responseComposer = new ResponseComposer(this._config);
    this._validator = new ConversationValidator(this._config);
    this._memory = new ConversationMemory(this._config);
    this._events = new ConversationEventEmitter();

    this._stats = {
      totalConversations: 0,
      totalTurns: 0,
      byIntent: {},
      totalConfidence: 0,
      totalResponseTimeMs: 0,
      toolInvocations: 0,
      failedConversations: 0,
      lastConversationAt: null,
    };
  }

  // ── Public API ─────────────────────────────────────────────

  processConversation(
    request: ConversationRequest,
    data: OrchestratorDataBundle,
  ): ConversationResponse | null {
    const startTime = performance.now();
    const sessionId = request.conversationId ?? this._memory.sessionId;

    this._events.emit('conversation_started', { sessionId, message: request.message });

    try {
      // 1. Resolve intent
      const intentResult = this._intentResolver.resolve(request.message);
      this._events.emit('intent_resolved', {
        sessionId,
        intent: intentResult.intent,
        confidence: intentResult.confidence,
      });

      // 2. Plan tasks
      const intentDef = this._intentResolver.getIntentDefinition(intentResult.intent);
      const plan = this._taskPlanner.plan(intentResult.intent, intentDef);
      this._events.emit('task_planned', { sessionId, planId: plan.id, stepCount: plan.steps.length });

      // 3. Execute tools
      const toolParams: ToolParams = {
        context: data.context,
        knowledge: data.knowledge,
        recommendations: data.recommendations,
        insights: data.insights,
        predictions: data.predictions,
        deviceProfile: data.deviceProfile,
        options: request.options ?? {},
      };

      const toolNames = plan.steps
        .filter((s) => s.toolName !== 'ComposeResponse')
        .map((s) => s.toolName);

      const toolResults = this._toolExecutor.executeSteps(toolNames, toolParams);
      this._stats.toolInvocations += this._toolExecutor.invocationCount;

      for (const result of toolResults) {
        this._events.emit('tool_invoked', {
          sessionId,
          tool: result.toolName,
          success: result.status === 'completed',
        });
      }

      // Update plan steps with results
      let stepIdx = 0;
      for (const step of plan.steps) {
        if (step.toolName === 'ComposeResponse') {
          step.status = 'running';
          continue;
        }
        if (stepIdx < toolResults.length) {
          const result = toolResults[stepIdx]!;
          step.status = result.status;
          step.result = result.result;
          step.error = result.error;
          step.durationMs = result.durationMs;
          stepIdx++;
        }
      }

      // 4. Build context
      const modulesUsed = intentDef?.requiredModules ?? ['context'];
      const detailLevel: ContextDetailLevel = this._memory.preferences.detailLevel;
      const contextBuildStart = performance.now();
      const conversationContext = this._contextBuilder.build(
        intentResult.intent,
        detailLevel,
        data.context,
        data.knowledge,
        data.recommendations,
        data.insights,
        data.predictions,
        data.deviceProfile,
        modulesUsed,
        0,
      );
      conversationContext.metadata.generationTimeMs = performance.now() - contextBuildStart;

      // 5. Build explanation
      const explanation = this._explanationBuilder.build(
        intentResult.intent,
        conversationContext,
        intentResult.confidence,
      );

      // 6. Compose response
      const response = this._responseComposer.compose(
        sessionId,
        intentResult.intent,
        intentDef,
        conversationContext,
        explanation,
        plan,
      );

      // Mark compose step as completed
      for (const step of plan.steps) {
        if (step.toolName === 'ComposeResponse') {
          step.status = 'completed';
          step.result = response.id;
        }
      }

      // 7. Validate
      const validation = this._validator.validateAll(intentResult, conversationContext, plan, response);
      this._events.emit('response_generated', {
        sessionId,
        responseId: response.id,
        valid: validation.valid,
        confidence: response.confidence,
      });

      // 8. Update memory
      this._memory.recordQuestion(request.message);
      if (data.recommendations) {
        for (const r of data.recommendations.recommendations.slice(0, 5)) {
          this._memory.referenceRecommendation(r.id);
        }
      }
      if (data.predictions) {
        for (const p of data.predictions.predictions.slice(0, 5)) {
          this._memory.referencePrediction(p.id);
        }
      }

      // 9. Update stats
      const elapsed = performance.now() - startTime;
      this._stats.totalConversations++;
      this._stats.totalTurns++;
      this._stats.byIntent[intentResult.intent] = (this._stats.byIntent[intentResult.intent] ?? 0) + 1;
      this._stats.totalConfidence += response.confidence;
      this._stats.totalResponseTimeMs += elapsed;
      this._stats.lastConversationAt = new Date().toISOString();

      this._events.emit('conversation_completed', {
        sessionId,
        responseId: response.id,
        durationMs: elapsed,
        valid: validation.valid,
      });

      return response;

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._stats.failedConversations++;
      this._events.emit('conversation_failed', { sessionId, error: message });
      return null;
    }
  }

  resolveIntent(message: string): IntentResolutionResult {
    return this._intentResolver.resolve(message);
  }

  buildConversationContext(
    intent: ConversationIntentType,
    detailLevel: ContextDetailLevel,
    data: OrchestratorDataBundle,
  ): ConversationContext {
    return this._contextBuilder.build(
      intent,
      detailLevel,
      data.context,
      data.knowledge,
      data.recommendations,
      data.insights,
      data.predictions,
      data.deviceProfile,
      [],
      0,
    );
  }

  generateExplanation(
    intent: ConversationIntentType,
    context: ConversationContext,
    confidence: number,
  ) {
    return this._explanationBuilder.build(intent, context, confidence);
  }

  getConversationMemory(): ConversationMemoryData {
    return this._memory.getData();
  }

  clearConversation(): void {
    this._memory.clear();
    this._toolExecutor.reset();
  }

  getConversationStatistics(): ConversationStatistics {
    const count = this._stats.totalConversations;
    return {
      totalConversations: count,
      totalTurns: this._stats.totalTurns,
      byIntent: { ...this._stats.byIntent },
      averageConfidence: count > 0 ? this._stats.totalConfidence / count : 0,
      averageResponseTimeMs: count > 0 ? this._stats.totalResponseTimeMs / count : 0,
      toolInvocations: this._stats.toolInvocations,
      failedConversations: this._stats.failedConversations,
      lastConversationAt: this._stats.lastConversationAt,
    };
  }

  // ── Tool Management ────────────────────────────────────────

  registerTool(tool: OrchestratorTool): boolean {
    return this._toolRegistry.registerTool(tool);
  }

  unregisterTool(name: string): boolean {
    return this._toolRegistry.unregisterTool(name);
  }

  getAvailableTools(): string[] {
    return this._toolRegistry.getAvailableTools().map((t) => t.name);
  }

  // ── Validation ─────────────────────────────────────────────

  validate(response: ConversationResponse): ConversationValidationResult {
    return this._validator.validateResponse(response);
  }

  // ── Configuration ──────────────────────────────────────────

  updateConfig(overrides: Partial<ConversationConfiguration>): void {
    this._config = createConversationConfig(overrides);
    this._intentResolver.updateConfig(this._config);
    this._taskPlanner.updateConfig(this._config);
    this._contextBuilder.updateConfig(this._config);
    this._explanationBuilder.updateConfig(this._config);
    this._responseComposer.updateConfig(this._config);
    this._validator.updateConfig(this._config);
    this._memory.updateConfig(this._config);
  }

  get config(): ConversationConfiguration {
    return this._config;
  }

  get events(): ConversationEventEmitter {
    return this._events;
  }

  get registry(): ToolRegistry {
    return this._toolRegistry;
  }

  get memory(): ConversationMemory {
    return this._memory;
  }
}
