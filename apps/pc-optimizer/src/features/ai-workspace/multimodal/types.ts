/**
 * Multimodal AI Interaction Platform — Type Definitions
 *
 * EPIC 5 PHASE A PART 6
 *
 * Unified interaction platform allowing users to interact with AVS Shield
 * through multiple input modalities (text, voice, screenshots, log files,
 * documents, future modalities). All inputs produce the same structured
 * intent model and route through the existing Tool Framework.
 *
 * Architecture:
 *   Input → Input Router → Input Normalizer → Context Enrichment →
 *   Intent Engine → Tool Framework → Response
 *
 * Core principles:
 *   - All modalities produce the same structured intent model.
 *   - All interaction modes use the existing Tool Framework.
 *   - No duplicated business logic.
 *   - Provider/plugin architecture for extensibility.
 *   - Every result carries confidence and evidence.
 */

// ── Re-export Copilot types used by multimodal ────────────────

export type {
  CopilotContext,
  CopilotIntentType,
  CopilotEntity,
  CopilotEvidence,
  PermissionLevel,
  CopilotCapability,
  ContextSourceType,
  DeviceProfileSummary,
  GoalSummary,
  TimelineEventSummary,
  RecommendationSummary,
  PredictionSummary,
  MaintenanceSummary,
  OptimizationHistorySummary,
  RecoverySummary,
} from '../copilot/types';

import type {
  CopilotContext,
  CopilotIntentType,
  CopilotEntity,
  CopilotEvidence,
  PermissionLevel,
  CopilotCapability,
} from '../copilot/types';

// ── Input Modalities ──────────────────────────────────────────

export type InputModality =
  | 'text'
  | 'voice'
  | 'screenshot'
  | 'image'
  | 'system_log'
  | 'report'
  | 'diagnostic_bundle'
  | 'json'
  | 'future_modality';

export function getModalityLabel(modality: InputModality): string {
  const labels: Record<InputModality, string> = {
    text: 'Text',
    voice: 'Voice',
    screenshot: 'Screenshot',
    image: 'Image',
    system_log: 'System Log',
    report: 'Report',
    diagnostic_bundle: 'Diagnostic Bundle',
    json: 'JSON',
    future_modality: 'Future Modality',
  };
  return labels[modality] ?? 'Unknown';
}

// ── Input Source ──────────────────────────────────────────────

export type InputSource =
  | 'user'
  | 'voice_stream'
  | 'screenshot_capture'
  | 'file_upload'
  | 'drag_drop'
  | 'clipboard'
  | 'api'
  | 'automation'
  | 'future_source';

export function getInputSourceLabel(source: InputSource): string {
  const labels: Record<InputSource, string> = {
    user: 'User',
    voice_stream: 'Voice Stream',
    screenshot_capture: 'Screenshot Capture',
    file_upload: 'File Upload',
    drag_drop: 'Drag & Drop',
    clipboard: 'Clipboard',
    api: 'API',
    automation: 'Automation',
    future_source: 'Future Source',
  };
  return labels[source] ?? 'Unknown';
}

// ── Input Model ───────────────────────────────────────────────

export interface MultimodalInput {
  id: string;
  modality: InputModality;
  source: InputSource;
  timestamp: string;
  metadata: MultimodalInputMetadata;
  contentReference: ContentReference;
  context: MultimodalInputContext;
  language: string;
  futureMetadata: Record<string, unknown>;
}

export interface MultimodalInputMetadata {
  sizeBytes: number;
  mimeType: string | null;
  duration: number | null;
  confidence: number;
  tags: string[];
  futureMetadata: Record<string, unknown>;
}

export interface ContentReference {
  type: 'inline' | 'file' | 'stream' | 'url' | 'future_ref';
  data: unknown;
  encoding: string | null;
  checksum: string | null;
  futureMetadata: Record<string, unknown>;
}

export interface MultimodalInputContext {
  sessionId: string | null;
  conversationId: string | null;
  previousInputId: string | null;
  userIntent: string | null;
  futureMetadata: Record<string, unknown>;
}

// ── Normalized Input ──────────────────────────────────────────

export interface NormalizedInput {
  id: string;
  inputId: string;
  modality: InputModality;
  text: string;
  entities: CopilotEntity[];
  language: string;
  confidence: number;
  extractedData: Record<string, unknown>;
  warnings: NormalizationWarning[];
  futureMetadata: Record<string, unknown>;
}

export interface NormalizationWarning {
  code: string;
  message: string;
  field: string;
}

// ── Enriched Context ──────────────────────────────────────────

export interface EnrichedContext {
  inputId: string;
  copilotContext: CopilotContext;
  healthScore: number | null;
  timeline: unknown[];
  goals: unknown[];
  recommendations: unknown[];
  predictions: unknown[];
  optimizationHistory: unknown[];
  recoveryHistory: unknown[];
  deviceProfile: unknown;
  conversationContext: ConversationContext;
  futureMetadata: Record<string, unknown>;
}

export interface ConversationContext {
  sessionId: string | null;
  conversationId: string | null;
  previousInputs: MultimodalInput[];
  activeTopics: string[];
  futureMetadata: Record<string, unknown>;
}

// ── Processing Result ─────────────────────────────────────────

export type ProcessingStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'future_status';

export function getProcessingStatusLabel(status: ProcessingStatus): string {
  const labels: Record<ProcessingStatus, string> = {
    pending: 'Pending',
    processing: 'Processing',
    completed: 'Completed',
    failed: 'Failed',
    cancelled: 'Cancelled',
    future_status: 'Future Status',
  };
  return labels[status] ?? 'Unknown';
}

export interface ProcessingResult {
  inputId: string;
  status: ProcessingStatus;
  modality: InputModality;
  normalizedInput: NormalizedInput;
  enrichedContext: EnrichedContext;
  intent: DetectedIntent;
  toolRouting: ToolRoutingResult;
  response: MultimodalResponse;
  processingTimeMs: number;
  errors: ProcessingError[];
  futureMetadata: Record<string, unknown>;
}

export interface ProcessingError {
  code: string;
  message: string;
  phase: ProcessingPhase;
  recoverable: boolean;
}

export type ProcessingPhase =
  | 'routing'
  | 'normalization'
  | 'context_enrichment'
  | 'intent_detection'
  | 'tool_routing'
  | 'response_generation'
  | 'future_phase';

// ── Detected Intent ───────────────────────────────────────────

export interface DetectedIntent {
  type: CopilotIntentType;
  confidence: number;
  entities: CopilotEntity[];
  sourceModality: InputModality;
  evidence: CopilotEvidence[];
  futureMetadata: Record<string, unknown>;
}

// ── Tool Routing ──────────────────────────────────────────────

export interface ToolRoutingResult {
  toolIds: string[];
  reason: string;
  confidence: number;
  futureMetadata: Record<string, unknown>;
}

// ── Multimodal Response ───────────────────────────────────────

export type ResponseModality =
  | 'text'
  | 'voice'
  | 'visual'
  | 'interactive'
  | 'future_response';

export function getResponseModalityLabel(modality: ResponseModality): string {
  const labels: Record<ResponseModality, string> = {
    text: 'Text',
    voice: 'Voice',
    visual: 'Visual',
    interactive: 'Interactive',
    future_response: 'Future Response',
  };
  return labels[modality] ?? 'Unknown';
}

export interface MultimodalResponse {
  id: string;
  inputId: string;
  modality: ResponseModality;
  text: string;
  speakable: string | null;
  visual: VisualResponse | null;
  actions: ResponseAction[];
  confidence: number;
  evidence: CopilotEvidence[];
  futureMetadata: Record<string, unknown>;
}

export interface VisualResponse {
  type: 'chart' | 'card' | 'table' | 'image' | 'dashboard' | 'future_visual';
  data: Record<string, unknown>;
  futureMetadata: Record<string, unknown>;
}

export interface ResponseAction {
  actionType: string;
  title: string;
  description: string;
  parameters: Record<string, unknown>;
  futureMetadata: Record<string, unknown>;
}

// ── Voice ─────────────────────────────────────────────────────

export type VoiceOperation =
  | 'speech_to_text'
  | 'text_to_speech'
  | 'streaming'
  | 'interruption'
  | 'future_operation';

export interface VoiceSession {
  id: string;
  status: VoiceSessionStatus;
  language: string;
  sampleRate: number;
  startedAt: string;
  endedAt: string | null;
  futureMetadata: Record<string, unknown>;
}

export type VoiceSessionStatus =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'interrupted'
  | 'ended'
  | 'future_status';

export interface VoiceProcessingResult {
  sessionId: string;
  operation: VoiceOperation;
  text: string | null;
  audioData: unknown;
  confidence: number;
  durationMs: number;
  futureMetadata: Record<string, unknown>;
}

export interface VoiceProvider {
  name: string;
  version: string;
  available: boolean;
  speechToText(audio: unknown): Promise<VoiceProcessingResult>;
  textToSpeech(text: string): Promise<VoiceProcessingResult>;
  startStream(): Promise<VoiceSession>;
  stopStream(sessionId: string): Promise<void>;
  interrupt(sessionId: string): Promise<void>;
}

// ── Image ─────────────────────────────────────────────────────

export type ImageAnalysisType =
  | 'screenshot_analysis'
  | 'ui_detection'
  | 'health_visualization'
  | 'chart_understanding'
  | 'future_analysis';

export interface ImageProcessingResult {
  analysisType: ImageAnalysisType;
  description: string;
  detectedElements: DetectedElement[];
  extractedText: string | null;
  confidence: number;
  futureMetadata: Record<string, unknown>;
}

export interface DetectedElement {
  type: string;
  label: string;
  boundingBox: BoundingBox | null;
  confidence: number;
  futureMetadata: Record<string, unknown>;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageProvider {
  name: string;
  version: string;
  available: boolean;
  analyze(image: unknown, analysisType: ImageAnalysisType): Promise<ImageProcessingResult>;
}

// ── Log Analysis ──────────────────────────────────────────────

export type LogType =
  | 'application'
  | 'system'
  | 'crash'
  | 'optimization'
  | 'maintenance'
  | 'future_log';

export function getLogTypeLabel(type: LogType): string {
  const labels: Record<LogType, string> = {
    application: 'Application Log',
    system: 'System Log',
    crash: 'Crash Log',
    optimization: 'Optimization Log',
    maintenance: 'Maintenance Log',
    future_log: 'Future Log',
  };
  return labels[type] ?? 'Unknown';
}

export interface LogProcessingResult {
  logType: LogType;
  totalEntries: number;
  errors: LogEntry[];
  warnings: LogEntry[];
  info: LogEntry[];
  patterns: LogPattern[];
  summary: string;
  confidence: number;
  futureMetadata: Record<string, unknown>;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  source: string;
  futureMetadata: Record<string, unknown>;
}

export interface LogPattern {
  pattern: string;
  occurrences: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  futureMetadata: Record<string, unknown>;
}

export interface LogProvider {
  name: string;
  version: string;
  available: boolean;
  parse(logData: unknown, logType: LogType): Promise<LogProcessingResult>;
}

// ── Documents ─────────────────────────────────────────────────

export type DocumentType =
  | 'report'
  | 'configuration'
  | 'export'
  | 'future_document';

export function getDocumentTypeLabel(type: DocumentType): string {
  const labels: Record<DocumentType, string> = {
    report: 'Report',
    configuration: 'Configuration',
    export: 'Export',
    future_document: 'Future Document',
  };
  return labels[type] ?? 'Unknown';
}

export interface DocumentProcessingResult {
  documentType: DocumentType;
  title: string;
  summary: string;
  sections: DocumentSection[];
  extractedData: Record<string, unknown>;
  confidence: number;
  futureMetadata: Record<string, unknown>;
}

export interface DocumentSection {
  title: string;
  content: string;
  order: number;
  futureMetadata: Record<string, unknown>;
}

export interface DocumentProvider {
  name: string;
  version: string;
  available: boolean;
  process(document: unknown, documentType: DocumentType): Promise<DocumentProcessingResult>;
}

// ── Attachments ───────────────────────────────────────────────

export type AttachmentStatus =
  | 'pending'
  | 'validated'
  | 'stored'
  | 'rejected'
  | 'expired'
  | 'future_status';

export interface Attachment {
  id: string;
  inputId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: AttachmentStatus;
  storagePath: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  expiresAt: string | null;
  futureMetadata: Record<string, unknown>;
}

export interface AttachmentPolicy {
  maxAttachments: number;
  maxTotalSizeBytes: number;
  allowedMimeTypes: string[];
  allowedModalities: InputModality[];
  retentionMs: number;
  futureMetadata: Record<string, unknown>;
}

// ── Modality Registry ─────────────────────────────────────────

export interface ModalityDefinition {
  modality: InputModality;
  label: string;
  description: string;
  supportedSources: InputSource[];
  processorId: string;
  enabled: boolean;
  futureMetadata: Record<string, unknown>;
}

export interface ModalityPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  getModalityDefinitions(): ModalityDefinition[];
  getVoiceProvider?(): VoiceProvider;
  getImageProvider?(): ImageProvider;
  getLogProvider?(): LogProvider;
  getDocumentProvider?(): DocumentProvider;
}

// ── Session Synchronization ──────────────────────────────────

export interface MultimodalSession {
  id: string;
  createdAt: string;
  lastActivityAt: string;
  inputCount: number;
  activeModalities: InputModality[];
  status: SessionStatus;
  futureMetadata: Record<string, unknown>;
}

export type SessionStatus =
  | 'active'
  | 'idle'
  | 'ended'
  | 'future_status';

export function getSessionStatusLabel(status: SessionStatus): string {
  const labels: Record<SessionStatus, string> = {
    active: 'Active',
    idle: 'Idle',
    ended: 'Ended',
    future_status: 'Future Status',
  };
  return labels[status] ?? 'Unknown';
}

// ── Events ────────────────────────────────────────────────────

export type MultimodalEventType =
  | 'input_received'
  | 'modality_detected'
  | 'context_enriched'
  | 'processing_started'
  | 'processing_completed'
  | 'response_generated'
  | 'attachment_added'
  | 'attachment_removed'
  | 'session_created'
  | 'session_ended'
  | 'voice_session_started'
  | 'voice_session_ended'
  | 'modality_registered'
  | 'modality_unregistered';

export interface MultimodalEvent {
  type: MultimodalEventType;
  timestamp: string;
  data: unknown;
}

export type MultimodalEventListener = (event: MultimodalEvent) => void;

// ── Analytics ─────────────────────────────────────────────────

export interface MultimodalAnalyticsData {
  totalInputs: number;
  byModality: Record<string, number>;
  bySource: Record<string, number>;
  averageProcessingTimeMs: number;
  totalAttachments: number;
  totalVoiceSessions: number;
  totalErrors: number;
  averageConfidence: number;
  generatedAt: string;
  futureMetadata: Record<string, unknown>;
}

// ── Validation ────────────────────────────────────────────────

export interface MultimodalValidationResult {
  valid: boolean;
  errors: MultimodalValidationError[];
  warnings: MultimodalValidationWarning[];
  futureMetadata: Record<string, unknown>;
}

export interface MultimodalValidationError {
  code: string;
  message: string;
  field: string;
}

export interface MultimodalValidationWarning {
  code: string;
  message: string;
  field: string;
}

// ── Configuration ─────────────────────────────────────────────

export interface MultimodalConfiguration {
  configVersion: string;
  supportedModalities: InputModality[];
  providerSettings: MultimodalProviderSettings[];
  validationRules: MultimodalValidationRules;
  attachmentPolicies: AttachmentPolicy;
  featureFlags: MultimodalFeatureFlags;
  performanceTargets: MultimodalPerformanceTargets;
  futureMetadata: Record<string, unknown>;
}

export interface MultimodalProviderSettings {
  providerName: string;
  providerVersion: string;
  enabled: boolean;
  config: Record<string, unknown>;
  futureMetadata: Record<string, unknown>;
}

export interface MultimodalValidationRules {
  maxInputSizeBytes: number;
  maxTextLength: number;
  minConfidenceThreshold: number;
  allowedLanguages: string[];
  futureMetadata: Record<string, unknown>;
}

export interface MultimodalFeatureFlags {
  enableMultimodal: boolean;
  enableVoice: boolean;
  enableImage: boolean;
  enableLogAnalysis: boolean;
  enableDocuments: boolean;
  enableAttachments: boolean;
  enableStreaming: boolean;
  enableInterruption: boolean;
  enableSessionSync: boolean;
  enableAnalytics: boolean;
  enableEvents: boolean;
  enablePlugins: boolean;
  futureFlags: Record<string, boolean>;
}

export interface MultimodalPerformanceTargets {
  routingTargetMs: number;
  normalizationTargetMs: number;
  contextEnrichmentTargetMs: number;
  streamingLatencyTargetMs: number;
  futureMetadata: Record<string, unknown>;
}

// ── ID Generators ─────────────────────────────────────────────

export function generateInputId(): string {
  return `mm_input_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function generateNormalizedInputId(): string {
  return `mm_norm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function generateResponseId(): string {
  return `mm_resp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function generateAttachmentId(): string {
  return `mm_attach_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function generateSessionId(): string {
  return `mm_session_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function generateVoiceSessionId(): string {
  return `mm_voice_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

// ── Default Factories ─────────────────────────────────────────

export function createDefaultSupportedModalities(): InputModality[] {
  return ['text', 'voice', 'screenshot', 'image', 'system_log', 'report', 'diagnostic_bundle', 'json'];
}

export function createDefaultModalityDefinitions(): ModalityDefinition[] {
  return [
    { modality: 'text', label: 'Text', description: 'Plain text input', supportedSources: ['user', 'clipboard', 'api'], processorId: 'builtin_text', enabled: true, futureMetadata: {} },
    { modality: 'voice', label: 'Voice', description: 'Voice input via speech-to-text', supportedSources: ['voice_stream', 'user'], processorId: 'builtin_voice', enabled: true, futureMetadata: {} },
    { modality: 'screenshot', label: 'Screenshot', description: 'Screenshot capture analysis', supportedSources: ['screenshot_capture', 'file_upload', 'drag_drop'], processorId: 'builtin_image', enabled: true, futureMetadata: {} },
    { modality: 'image', label: 'Image', description: 'Image file analysis', supportedSources: ['file_upload', 'drag_drop', 'clipboard'], processorId: 'builtin_image', enabled: true, futureMetadata: {} },
    { modality: 'system_log', label: 'System Log', description: 'System log file analysis', supportedSources: ['file_upload', 'drag_drop'], processorId: 'builtin_log', enabled: true, futureMetadata: {} },
    { modality: 'report', label: 'Report', description: 'Report document review', supportedSources: ['file_upload', 'drag_drop'], processorId: 'builtin_document', enabled: true, futureMetadata: {} },
    { modality: 'diagnostic_bundle', label: 'Diagnostic Bundle', description: 'Diagnostic bundle analysis', supportedSources: ['file_upload', 'drag_drop'], processorId: 'builtin_log', enabled: true, futureMetadata: {} },
    { modality: 'json', label: 'JSON', description: 'Structured JSON input', supportedSources: ['api', 'file_upload', 'clipboard'], processorId: 'builtin_text', enabled: true, futureMetadata: {} },
  ];
}

export function createDefaultProviderSettings(): MultimodalProviderSettings[] {
  return [
    { providerName: 'builtin', providerVersion: '1.0.0', enabled: true, config: {}, futureMetadata: {} },
  ];
}

export function createDefaultValidationRules(): MultimodalValidationRules {
  return {
    maxInputSizeBytes: 50 * 1024 * 1024,
    maxTextLength: 10000,
    minConfidenceThreshold: 0.5,
    allowedLanguages: ['en', 'es', 'fr', 'de', 'ja', 'zh'],
    futureMetadata: {},
  };
}

export function createDefaultAttachmentPolicy(): AttachmentPolicy {
  return {
    maxAttachments: 10,
    maxTotalSizeBytes: 100 * 1024 * 1024,
    allowedMimeTypes: ['text/plain', 'application/json', 'image/png', 'image/jpeg', 'image/gif', 'text/csv', 'application/octet-stream'],
    allowedModalities: ['screenshot', 'image', 'system_log', 'report', 'diagnostic_bundle', 'json'],
    retentionMs: 24 * 60 * 60 * 1000,
    futureMetadata: {},
  };
}

export function createDefaultFeatureFlags(): MultimodalFeatureFlags {
  return {
    enableMultimodal: true,
    enableVoice: true,
    enableImage: true,
    enableLogAnalysis: true,
    enableDocuments: true,
    enableAttachments: true,
    enableStreaming: true,
    enableInterruption: true,
    enableSessionSync: true,
    enableAnalytics: true,
    enableEvents: true,
    enablePlugins: true,
    futureFlags: {},
  };
}

export function createDefaultPerformanceTargets(): MultimodalPerformanceTargets {
  return {
    routingTargetMs: 50,
    normalizationTargetMs: 100,
    contextEnrichmentTargetMs: 200,
    streamingLatencyTargetMs: 500,
    futureMetadata: {},
  };
}

export function createDefaultMultimodalConfiguration(): MultimodalConfiguration {
  return {
    configVersion: '1.0.0',
    supportedModalities: createDefaultSupportedModalities(),
    providerSettings: createDefaultProviderSettings(),
    validationRules: createDefaultValidationRules(),
    attachmentPolicies: createDefaultAttachmentPolicy(),
    featureFlags: createDefaultFeatureFlags(),
    performanceTargets: createDefaultPerformanceTargets(),
    futureMetadata: {},
  };
}
