/**
 * Multimodal AI Interaction Platform — Barrel Exports
 *
 * EPIC 5 PHASE A PART 6
 *
 * Unified interaction platform allowing users to interact with AVS Shield
 * through multiple input modalities (text, voice, screenshots, log files,
 * documents, future modalities). All inputs produce the same structured
 * intent model and route through the existing Tool Framework.
 */

// ── Types ─────────────────────────────────────────────────────
export type {
  InputModality,
  InputSource,
  MultimodalInput,
  MultimodalInputMetadata,
  ContentReference,
  MultimodalInputContext,
  NormalizedInput,
  NormalizationWarning,
  EnrichedContext,
  ConversationContext,
  ProcessingStatus,
  ProcessingResult,
  ProcessingError,
  ProcessingPhase,
  DetectedIntent,
  ToolRoutingResult,
  ResponseModality,
  MultimodalResponse,
  VisualResponse,
  ResponseAction,
  VoiceOperation,
  VoiceSession,
  VoiceSessionStatus,
  VoiceProcessingResult,
  VoiceProvider,
  ImageAnalysisType,
  ImageProcessingResult,
  DetectedElement,
  BoundingBox,
  ImageProvider,
  LogType,
  LogProcessingResult,
  LogEntry,
  LogPattern,
  LogProvider,
  DocumentType,
  DocumentProcessingResult,
  DocumentSection,
  DocumentProvider,
  AttachmentStatus,
  Attachment,
  AttachmentPolicy,
  ModalityDefinition,
  ModalityPlugin,
  MultimodalSession,
  SessionStatus,
  MultimodalEventType,
  MultimodalEvent,
  MultimodalEventListener,
  MultimodalAnalyticsData,
  MultimodalValidationResult,
  MultimodalValidationError,
  MultimodalValidationWarning,
  MultimodalConfiguration,
  MultimodalProviderSettings,
  MultimodalValidationRules,
  MultimodalFeatureFlags,
  MultimodalPerformanceTargets,
} from './types';

// ── Helper Functions ──────────────────────────────────────────
export {
  getModalityLabel,
  getInputSourceLabel,
  getProcessingStatusLabel,
  getResponseModalityLabel,
  getLogTypeLabel,
  getDocumentTypeLabel,
  getSessionStatusLabel,
  generateInputId,
  generateNormalizedInputId,
  generateResponseId,
  generateAttachmentId,
  generateSessionId,
  generateVoiceSessionId,
  createDefaultSupportedModalities,
  createDefaultModalityDefinitions,
  createDefaultProviderSettings,
  createDefaultValidationRules,
  createDefaultAttachmentPolicy,
  createDefaultFeatureFlags,
  createDefaultPerformanceTargets,
  createDefaultMultimodalConfiguration,
} from './types';

// ── Configuration ─────────────────────────────────────────────
export {
  DEFAULT_MULTIMODAL_CONFIGURATION,
  createMultimodalConfiguration,
  validateMultimodalConfiguration,
} from './multimodalConfiguration';
export type { DeepPartial } from './multimodalConfiguration';

// ── Events ────────────────────────────────────────────────────
export { MultimodalEvents, multimodalEvents } from './multimodalEvents';

// ── Modality Registry ─────────────────────────────────────────
export { ModalityRegistry } from './modalityRegistry';

// ── Input Router ──────────────────────────────────────────────
export { InputRouter } from './inputRouter';
export type { RoutingResult } from './inputRouter';

// ── Input Normalizer ──────────────────────────────────────────
export { InputNormalizer } from './inputNormalizer';

// ── Voice Processor ───────────────────────────────────────────
export { VoiceProcessor } from './voiceProcessor';

// ── Image Processor ───────────────────────────────────────────
export { ImageProcessor } from './imageProcessor';

// ── Log Processor ─────────────────────────────────────────────
export { LogProcessor } from './logProcessor';

// ── Document Processor ────────────────────────────────────────
export { DocumentProcessor } from './documentProcessor';

// ── Context Enricher ──────────────────────────────────────────
export { ContextEnricher } from './contextEnricher';
export type { ContextEnricherInput } from './contextEnricher';

// ── Attachment Manager ────────────────────────────────────────
export { AttachmentManager } from './attachmentManager';

// ── Session Synchronizer ──────────────────────────────────────
export { SessionSynchronizer } from './sessionSynchronizer';

// ── Analytics ─────────────────────────────────────────────────
export { MultimodalAnalytics } from './multimodalAnalytics';

// ── Validator ─────────────────────────────────────────────────
export { MultimodalValidator } from './multimodalValidator';

// ── Manager (Main Facade) ─────────────────────────────────────
export { MultimodalManager } from './multimodalManager';
export type { ProcessInputOptions } from './multimodalManager';
