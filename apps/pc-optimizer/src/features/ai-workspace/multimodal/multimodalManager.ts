/**
 * Multimodal AI Interaction Platform — Multimodal Manager
 *
 * EPIC 5 PHASE A PART 6
 *
 * The main public API facade for the Multimodal AI Interaction Platform.
 * Orchestrates all multimodal components and provides the public interface:
 *   processInput(), detectModality(), normalizeInput(),
 *   extractContext(), routeToTools(), generateResponse()
 *
 * All interaction modes use the existing Tool Framework.
 * No duplicated business logic.
 */
import type {
  MultimodalConfiguration,
  MultimodalInput,
  NormalizedInput,
  EnrichedContext,
  ProcessingResult,
  DetectedIntent,
  ToolRoutingResult,
  MultimodalResponse,
  InputModality,
  ModalityPlugin,
  MultimodalAnalyticsData,
  MultimodalValidationResult,
  Attachment,
  MultimodalSession,
  MultimodalEventType,
  MultimodalEventListener,
  CopilotContext,
  CopilotIntentType,
  CopilotEvidence,
} from './types';
import {
  DEFAULT_MULTIMODAL_CONFIGURATION,
  createMultimodalConfiguration,
  validateMultimodalConfiguration,
} from './multimodalConfiguration';
import { MultimodalEvents, multimodalEvents } from './multimodalEvents';
import { ModalityRegistry } from './modalityRegistry';
import { InputRouter } from './inputRouter';
import { InputNormalizer } from './inputNormalizer';
import { VoiceProcessor } from './voiceProcessor';
import { ImageProcessor } from './imageProcessor';
import { LogProcessor } from './logProcessor';
import { DocumentProcessor } from './documentProcessor';
import { ContextEnricher } from './contextEnricher';
import { AttachmentManager } from './attachmentManager';
import { SessionSynchronizer } from './sessionSynchronizer';
import { MultimodalAnalytics } from './multimodalAnalytics';
import { MultimodalValidator } from './multimodalValidator';
import { generateResponseId } from './types';
import type { CopilotContextResolverInput } from '../copilot/copilotContextResolver';

export interface ProcessInputOptions {
  copilotContextInput: CopilotContextResolverInput;
  sessionId?: string;
  previousInputs?: MultimodalInput[];
  activeTopics?: string[];
}

export class MultimodalManager {
  private _config: MultimodalConfiguration;
  private _events: MultimodalEvents;
  private _registry: ModalityRegistry;
  private _router: InputRouter;
  private _normalizer: InputNormalizer;
  private _voiceProcessor: VoiceProcessor;
  private _imageProcessor: ImageProcessor;
  private _logProcessor: LogProcessor;
  private _documentProcessor: DocumentProcessor;
  private _contextEnricher: ContextEnricher;
  private _attachmentManager: AttachmentManager;
  private _sessionSync: SessionSynchronizer;
  private _analytics: MultimodalAnalytics;
  private _validator: MultimodalValidator;

  constructor(config?: Partial<MultimodalConfiguration>) {
    this._config = config
      ? createMultimodalConfiguration(config as never)
      : structuredClone(DEFAULT_MULTIMODAL_CONFIGURATION);

    const validation = validateMultimodalConfiguration(this._config);
    if (!validation.valid) {
      throw new Error(`Invalid multimodal configuration: ${validation.errors.join('; ')}`);
    }

    this._events = new MultimodalEvents();
    this._registry = new ModalityRegistry();
    this._router = new InputRouter(this._registry, this._config);
    this._normalizer = new InputNormalizer(this._config);
    this._voiceProcessor = new VoiceProcessor(this._config);
    this._imageProcessor = new ImageProcessor(this._config);
    this._logProcessor = new LogProcessor(this._config);
    this._documentProcessor = new DocumentProcessor(this._config);
    this._contextEnricher = new ContextEnricher(this._config);
    this._attachmentManager = new AttachmentManager(this._config);
    this._sessionSync = new SessionSynchronizer(this._config);
    this._analytics = new MultimodalAnalytics();
    this._validator = new MultimodalValidator(this._config);
  }

  // ── Public API ──────────────────────────────────────────────

  processInput(input: MultimodalInput, options: ProcessInputOptions): ProcessingResult {
    if (!this._config.featureFlags.enableMultimodal) {
      throw new Error('Multimodal platform is disabled');
    }

    const start = Date.now();
    const errors: ProcessingResult['errors'] = [];

    // Validate input
    const inputValidation = this._validator.validateInput(input);
    if (!inputValidation.valid) {
      throw new Error(`Invalid input: ${inputValidation.errors.map((e) => e.message).join('; ')}`);
    }

    // Emit input_received
    this._emit('input_received', { inputId: input.id, modality: input.modality });

    // Record analytics
    this._analytics.recordInput(input);

    // Record in session
    if (options.sessionId) {
      this._sessionSync.recordInput(options.sessionId, input);
    }

    // Route
    const routing = this._router.route(input);
    this._emit('modality_detected', { inputId: input.id, modality: routing.modality, confidence: routing.confidence });

    // Normalize
    const normalized = this._normalizer.normalize(input);

    // Enrich context
    const enriched = this._contextEnricher.enrich({
      input,
      copilotContextInput: options.copilotContextInput,
      previousInputs: options.previousInputs ?? [],
      activeTopics: options.activeTopics ?? [],
      sessionId: options.sessionId ?? input.context.sessionId,
      conversationId: input.context.conversationId,
    });
    this._emit('context_enriched', { inputId: input.id, sourceCount: enriched.copilotContext.sources.length });

    // Detect intent
    const intent = this._detectIntent(normalized, routing.modality);

    // Route to tools
    this._emit('processing_started', { inputId: input.id, intent: intent.type });
    const toolRouting = this._routeToTools(intent, enriched.copilotContext);

    // Generate response
    const response = this._generateResponse(normalized, enriched, intent, toolRouting);
    this._emit('response_generated', { inputId: input.id, responseId: response.id });

    const processingTimeMs = Date.now() - start;

    const result: ProcessingResult = {
      inputId: input.id,
      status: 'completed',
      modality: routing.modality,
      normalizedInput: normalized,
      enrichedContext: enriched,
      intent,
      toolRouting,
      response,
      processingTimeMs,
      errors,
      futureMetadata: { routingTimeMs: routing.futureMetadata },
    };

    // Record processing analytics
    this._analytics.recordProcessing(result);

    this._emit('processing_completed', { inputId: input.id, processingTimeMs, status: result.status });

    return result;
  }

  detectModality(input: MultimodalInput): InputModality {
    return this._router.detectModality(input);
  }

  normalizeInput(input: MultimodalInput): NormalizedInput {
    return this._normalizer.normalize(input);
  }

  extractContext(input: MultimodalInput, copilotContextInput: CopilotContextResolverInput): EnrichedContext {
    return this._contextEnricher.extractContext(input, copilotContextInput);
  }

  routeToTools(intent: CopilotIntentType, context: CopilotContext): ToolRoutingResult {
    return this._routeToTools(
      { type: intent, confidence: 0.8, entities: [], sourceModality: 'text', evidence: [], futureMetadata: {} },
      context,
    );
  }

  generateResponse(normalized: NormalizedInput, enriched: EnrichedContext, intent: DetectedIntent, toolRouting: ToolRoutingResult): MultimodalResponse {
    return this._generateResponse(normalized, enriched, intent, toolRouting);
  }

  // ── Voice ───────────────────────────────────────────────────

  getVoiceProcessor(): VoiceProcessor {
    return this._voiceProcessor;
  }

  // ── Image ───────────────────────────────────────────────────

  getImageProcessor(): ImageProcessor {
    return this._imageProcessor;
  }

  // ── Log ─────────────────────────────────────────────────────

  getLogProcessor(): LogProcessor {
    return this._logProcessor;
  }

  // ── Document ────────────────────────────────────────────────

  getDocumentProcessor(): DocumentProcessor {
    return this._documentProcessor;
  }

  // ── Attachments ─────────────────────────────────────────────

  addAttachment(
    inputId: string,
    filename: string,
    mimeType: string,
    sizeBytes: number,
    modality: InputModality,
    metadata?: Record<string, unknown>,
  ): Attachment {
    const attachment = this._attachmentManager.add(inputId, filename, mimeType, sizeBytes, modality, metadata);
    this._analytics.recordAttachment();
    this._emit('attachment_added', { attachmentId: attachment.id, inputId });
    return attachment;
  }

  removeAttachment(attachmentId: string): boolean {
    const removed = this._attachmentManager.remove(attachmentId);
    if (removed) this._emit('attachment_removed', { attachmentId });
    return removed;
  }

  getAttachments(inputId: string): Attachment[] {
    return this._attachmentManager.getByInput(inputId);
  }

  // ── Sessions ────────────────────────────────────────────────

  createSession(): MultimodalSession {
    const session = this._sessionSync.createSession();
    this._emit('session_created', { sessionId: session.id });
    return session;
  }

  getSession(sessionId: string): MultimodalSession | null {
    return this._sessionSync.getSession(sessionId);
  }

  endSession(sessionId: string): boolean {
    const ended = this._sessionSync.endSession(sessionId);
    if (ended) this._emit('session_ended', { sessionId });
    return ended;
  }

  // ── Modality Registry ───────────────────────────────────────

  getModalityRegistry(): ModalityRegistry {
    return this._registry;
  }

  // ── Analytics ───────────────────────────────────────────────

  getAnalytics(): MultimodalAnalyticsData {
    return this._analytics.getAnalytics();
  }

  // ── Validation ──────────────────────────────────────────────

  validateInput(input: MultimodalInput): MultimodalValidationResult {
    return this._validator.validateInput(input);
  }

  validateNormalized(normalized: NormalizedInput): MultimodalValidationResult {
    return this._validator.validateNormalized(normalized);
  }

  validateProcessingResult(result: ProcessingResult): MultimodalValidationResult {
    return this._validator.validateProcessingResult(result);
  }

  // ── Configuration ───────────────────────────────────────────

  updateConfig(config: Partial<MultimodalConfiguration>): void {
    this._config = createMultimodalConfiguration(config as never);
    this._router.updateConfig(this._config);
    this._normalizer.updateConfig(this._config);
    this._voiceProcessor.updateConfig(this._config);
    this._imageProcessor.updateConfig(this._config);
    this._logProcessor.updateConfig(this._config);
    this._documentProcessor.updateConfig(this._config);
    this._contextEnricher.updateConfig(this._config);
    this._attachmentManager.updateConfig(this._config);
    this._sessionSync.updateConfig(this._config);
    this._validator.updateConfig(this._config);
  }

  getConfig(): MultimodalConfiguration {
    return this._config;
  }

  // ── Plugin Registration ─────────────────────────────────────

  registerPlugin(plugin: ModalityPlugin): boolean {
    if (!this._config.featureFlags.enablePlugins) {
      throw new Error('Plugins are disabled');
    }
    const registered = this._registry.registerPlugin(plugin);
    if (registered) {
      if (plugin.getVoiceProvider) {
        const provider = plugin.getVoiceProvider();
        if (provider) this._voiceProcessor.setProvider(provider);
      }
      if (plugin.getImageProvider) {
        const provider = plugin.getImageProvider();
        if (provider) this._imageProcessor.setProvider(provider);
      }
      if (plugin.getLogProvider) {
        const provider = plugin.getLogProvider();
        if (provider) this._logProcessor.setProvider(provider);
      }
      if (plugin.getDocumentProvider) {
        const provider = plugin.getDocumentProvider();
        if (provider) this._documentProcessor.setProvider(provider);
      }
    }
    return registered;
  }

  unregisterPlugin(pluginName: string): boolean {
    return this._registry.unregisterPlugin(pluginName);
  }

  // ── Events ──────────────────────────────────────────────────

  on(type: MultimodalEventType, listener: MultimodalEventListener): void {
    this._events.on(type, listener);
  }

  off(type: MultimodalEventType, listener: MultimodalEventListener): void {
    this._events.off(type, listener);
  }

  getEvents(): MultimodalEvents {
    return this._events;
  }

  // ── Utility ─────────────────────────────────────────────────

  clearAll(): void {
    this._attachmentManager.clear();
    this._sessionSync.clear();
    this._contextEnricher.clearCache();
    this._analytics.reset();
    this._events.removeAllListeners();
    this._voiceProcessor.clearSessions();
  }

  // ── Private Helpers ─────────────────────────────────────────

  private _detectIntent(normalized: NormalizedInput, modality: InputModality): DetectedIntent {
    const text = normalized.text.toLowerCase();
    let intentType: CopilotIntentType = 'question';
    let confidence = 0.6;

    if (/optimiz|tune|speed|performance/i.test(text)) {
      intentType = 'optimization';
      confidence = 0.85;
    } else if (/health|score|status/i.test(text)) {
      intentType = 'explanation';
      confidence = 0.85;
    } else if (/predict|forecast|future/i.test(text)) {
      intentType = 'explanation';
      confidence = 0.8;
    } else if (/goal|target|objective/i.test(text)) {
      intentType = 'goal_management';
      confidence = 0.8;
    } else if (/report|summary|export/i.test(text)) {
      intentType = 'reporting';
      confidence = 0.8;
    } else if (/recover|restore|rollback/i.test(text)) {
      intentType = 'recovery';
      confidence = 0.85;
    } else if (/maintain|clean|update/i.test(text)) {
      intentType = 'maintenance';
      confidence = 0.75;
    } else if (/simulat|what.if|scenario/i.test(text)) {
      intentType = 'planning';
      confidence = 0.8;
    } else if (/timeline|history|event/i.test(text)) {
      intentType = 'explanation';
      confidence = 0.75;
    } else if (/compar|versus|vs/i.test(text)) {
      intentType = 'comparison';
      confidence = 0.8;
    }

    const evidence: CopilotEvidence[] = [{
      source: 'intent_detection',
      metric: 'matched_keywords',
      value: intentType,
      timestamp: new Date().toISOString(),
      description: `Intent detected from ${modality} input`,
      confidence,
      futureMetadata: {},
    }];

    return {
      type: intentType,
      confidence,
      entities: normalized.entities,
      sourceModality: modality,
      evidence,
      futureMetadata: {},
    };
  }

  private _routeToTools(intent: DetectedIntent, _context: CopilotContext): ToolRoutingResult {
    const toolMap: Partial<Record<CopilotIntentType, string[]>> = {
      explanation: ['explain_health'],
      optimization: ['create_optimization_session'],
      goal_management: ['create_goal'],
      reporting: ['generate_report'],
      recovery: ['show_recovery'],
      maintenance: ['start_maintenance'],
      planning: ['run_simulation'],
      comparison: ['compare_plans'],
      recommendation: ['explain_recommendation'],
      question: ['explain_health'],
    };

    const toolIds = toolMap[intent.type] ?? [];

    return {
      toolIds,
      reason: `Routed intent "${intent.type}" to ${toolIds.length} tool(s)`,
      confidence: intent.confidence,
      futureMetadata: {},
    };
  }

  private _generateResponse(
    normalized: NormalizedInput,
    enriched: EnrichedContext,
    intent: DetectedIntent,
    toolRouting: ToolRoutingResult,
  ): MultimodalResponse {
    const text = this._buildResponseText(normalized, enriched, intent, toolRouting);
    const speakable = this._buildSpeakable(text, intent);

    return {
      id: generateResponseId(),
      inputId: normalized.inputId,
      modality: 'text',
      text,
      speakable,
      visual: this._buildVisual(enriched, intent),
      actions: this._buildActions(intent, toolRouting),
      confidence: intent.confidence,
      evidence: intent.evidence,
      futureMetadata: {},
    };
  }

  private _buildResponseText(
    normalized: NormalizedInput,
    enriched: EnrichedContext,
    intent: DetectedIntent,
    toolRouting: ToolRoutingResult,
  ): string {
    const parts: string[] = [];
    parts.push(`I detected your intent: ${intent.type} (confidence: ${(intent.confidence * 100).toFixed(0)}%).`);

    if (enriched.healthScore !== null) {
      parts.push(`Current health score: ${enriched.healthScore}.`);
    }
    if (enriched.goals.length > 0) {
      parts.push(`Active goals: ${enriched.goals.length}.`);
    }
    if (enriched.recommendations.length > 0) {
      parts.push(`Active recommendations: ${enriched.recommendations.length}.`);
    }
    if (toolRouting.toolIds.length > 0) {
      parts.push(`I'll use ${toolRouting.toolIds.length} tool(s): ${toolRouting.toolIds.join(', ')}.`);
    }
    if (normalized.warnings.length > 0) {
      parts.push(`Note: ${normalized.warnings.length} warning(s) during processing.`);
    }

    return parts.join(' ');
  }

  private _buildSpeakable(text: string, _intent: DetectedIntent): string {
    return text.replace(/[()]/g, '').replace(/\b\d+%/g, 'percent');
  }

  private _buildVisual(enriched: EnrichedContext, intent: DetectedIntent): MultimodalResponse['visual'] {
    if (enriched.healthScore !== null) {
      return {
        type: 'card',
        data: {
          healthScore: enriched.healthScore,
          goals: enriched.goals.length,
          recommendations: enriched.recommendations.length,
          intent: intent.type,
        },
        futureMetadata: {},
      };
    }
    return null;
  }

  private _buildActions(intent: DetectedIntent, toolRouting: ToolRoutingResult): MultimodalResponse['actions'] {
    return toolRouting.toolIds.map((toolId) => ({
      actionType: toolId,
      title: `Execute ${toolId}`,
      description: `Run tool ${toolId} for intent ${intent.type}`,
      parameters: { intent: intent.type },
      futureMetadata: {},
    }));
  }

  private _emit(type: MultimodalEventType, data: unknown): void {
    if (this._config.featureFlags.enableEvents) {
      this._events.emit({ type, timestamp: new Date().toISOString(), data });
    }
  }
}

export { multimodalEvents };
