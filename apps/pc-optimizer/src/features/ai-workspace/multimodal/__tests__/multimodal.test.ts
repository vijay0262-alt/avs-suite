/**
 * Tests for the Multimodal AI Interaction Platform.
 *
 * Covers: types & helpers, configuration, events, modality registry,
 * input router, input normalizer, voice processor, image processor,
 * log processor, document processor, context enricher, attachment manager,
 * session synchronizer, analytics, validator, manager facade,
 * regression, performance, edge cases.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MultimodalManager } from '../multimodalManager';
import { ModalityRegistry } from '../modalityRegistry';
import { InputRouter } from '../inputRouter';
import { InputNormalizer } from '../inputNormalizer';
import { VoiceProcessor } from '../voiceProcessor';
import { ImageProcessor } from '../imageProcessor';
import { LogProcessor } from '../logProcessor';
import { DocumentProcessor } from '../documentProcessor';
import { ContextEnricher } from '../contextEnricher';
import { AttachmentManager } from '../attachmentManager';
import { SessionSynchronizer } from '../sessionSynchronizer';
import { MultimodalAnalytics } from '../multimodalAnalytics';
import { MultimodalValidator } from '../multimodalValidator';
import { MultimodalEvents } from '../multimodalEvents';
import {
  DEFAULT_MULTIMODAL_CONFIGURATION,
  createMultimodalConfiguration,
  validateMultimodalConfiguration,
} from '../multimodalConfiguration';
import {
  generateInputId,
  generateNormalizedInputId,
  generateResponseId,
  generateAttachmentId,
  generateSessionId,
  generateVoiceSessionId,
  getModalityLabel,
  getInputSourceLabel,
  getProcessingStatusLabel,
  getResponseModalityLabel,
  getLogTypeLabel,
  getDocumentTypeLabel,
  getSessionStatusLabel,
  createDefaultMultimodalConfiguration,
  createDefaultModalityDefinitions,
} from '../types';
import type {
  MultimodalInput,
  MultimodalConfiguration,
  ModalityPlugin,
  InputModality,
  VoiceProvider,
  ImageProvider,
  LogProvider,
  DocumentProvider,
} from '../types';
import type { AIAssistantContextResolverInput } from '../../aiAssistant/AIAssistantContextResolver';

// ── Mock Helpers ─────────────────────────────────────────────

function createMockContextInput(healthScore: number = 75): AIAssistantContextResolverInput {
  return {
    healthScore,
    deviceProfile: { profileType: 'gaming', performanceTier: 'high', confidence: 0.9, futureMetadata: {} },
    activeGoals: [
      { id: 'g1', name: 'Improve Performance', status: 'in_progress', priority: 'high', progress: 0.5, futureMetadata: {} },
    ],
    recentTimelineEvents: [
      { id: 't1', title: 'Optimization completed', timestamp: new Date().toISOString(), category: 'optimization', severity: 'low', futureMetadata: {} },
    ],
    activeRecommendations: [
      { id: 'r1', title: 'Clean temp files', category: 'storage', priority: 'high', confidence: 0.85, futureMetadata: {} },
      { id: 'r2', title: 'Disable startup apps', category: 'performance', priority: 'medium', confidence: 0.75, futureMetadata: {} },
    ],
    activePredictions: [
      { id: 'p1', title: 'Disk space warning', category: 'storage', riskLevel: 'medium', confidence: 0.7, futureMetadata: {} },
    ],
    maintenanceHistory: [
      { id: 'm1', type: 'routine', timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), success: true, futureMetadata: {} },
    ],
    optimizationHistory: [
      { id: 'o1', timestamp: new Date().toISOString(), goal: 'quick_boost', success: true, healthDelta: 5, futureMetadata: {} },
      { id: 'o2', timestamp: new Date(Date.now() - 86400000).toISOString(), goal: 'deep_clean', success: true, healthDelta: 10, futureMetadata: {} },
    ],
    recoveryHistory: [
      { id: 'rc1', timestamp: new Date().toISOString(), type: 'rollback', success: true, futureMetadata: {} },
    ],
    userPreferences: { theme: 'dark' },
  };
}

function createMockTextInput(text: string = 'What is my health score?'): MultimodalInput {
  return {
    id: generateInputId(),
    modality: 'text',
    source: 'user',
    timestamp: new Date().toISOString(),
    metadata: {
      sizeBytes: text.length,
      mimeType: 'text/plain',
      duration: null,
      confidence: 0.95,
      tags: [],
      futureMetadata: {},
    },
    contentReference: {
      type: 'inline',
      data: text,
      encoding: 'utf-8',
      checksum: null,
      futureMetadata: {},
    },
    context: {
      sessionId: null,
      conversationId: null,
      previousInputId: null,
      userIntent: null,
      futureMetadata: {},
    },
    language: 'en',
    futureMetadata: {},
  };
}

function createMockVoiceInput(transcript: string = 'Optimize my PC'): MultimodalInput {
  return {
    id: generateInputId(),
    modality: 'voice',
    source: 'voice_stream',
    timestamp: new Date().toISOString(),
    metadata: {
      sizeBytes: 1024,
      mimeType: 'audio/wav',
      duration: 5.0,
      confidence: 0.88,
      tags: [],
      futureMetadata: {},
    },
    contentReference: {
      type: 'inline',
      data: { transcript },
      encoding: null,
      checksum: null,
      futureMetadata: {},
    },
    context: {
      sessionId: null,
      conversationId: null,
      previousInputId: null,
      userIntent: null,
      futureMetadata: {},
    },
    language: 'en',
    futureMetadata: {},
  };
}

function createMockScreenshotInput(): MultimodalInput {
  return {
    id: generateInputId(),
    modality: 'screenshot',
    source: 'screenshot_capture',
    timestamp: new Date().toISOString(),
    metadata: {
      sizeBytes: 204800,
      mimeType: 'image/png',
      duration: null,
      confidence: 0.9,
      tags: [],
      futureMetadata: {},
    },
    contentReference: {
      type: 'inline',
      data: { description: 'Dashboard showing health score of 85', extractedText: 'Health Score: 85' },
      encoding: 'base64',
      checksum: null,
      futureMetadata: {},
    },
    context: {
      sessionId: null,
      conversationId: null,
      previousInputId: null,
      userIntent: null,
      futureMetadata: {},
    },
    language: 'en',
    futureMetadata: {},
  };
}

function createMockLogInput(): MultimodalInput {
  const logContent = `2024-01-15T10:30:00 [INFO] Application started
2024-01-15T10:31:00 [WARN] High memory usage detected
2024-01-15T10:32:00 [ERROR] Disk space low
2024-01-15T10:33:00 [ERROR] Disk space critical
2024-01-15T10:34:00 [INFO] Cleanup completed`;
  return {
    id: generateInputId(),
    modality: 'system_log',
    source: 'file_upload',
    timestamp: new Date().toISOString(),
    metadata: {
      sizeBytes: logContent.length,
      mimeType: 'text/plain',
      duration: null,
      confidence: 0.85,
      tags: ['app.log'],
      futureMetadata: {},
    },
    contentReference: {
      type: 'inline',
      data: logContent,
      encoding: 'utf-8',
      checksum: null,
      futureMetadata: {},
    },
    context: {
      sessionId: null,
      conversationId: null,
      previousInputId: null,
      userIntent: null,
      futureMetadata: {},
    },
    language: 'en',
    futureMetadata: {},
  };
}

function createMockJsonInput(): MultimodalInput {
  return {
    id: generateInputId(),
    modality: 'json',
    source: 'automation',
    timestamp: new Date().toISOString(),
    metadata: {
      sizeBytes: 256,
      mimeType: 'application/json',
      duration: null,
      confidence: 1.0,
      tags: [],
      futureMetadata: {},
    },
    contentReference: {
      type: 'inline',
      data: { type: 'health_check', score: 78 },
      encoding: null,
      checksum: null,
      futureMetadata: {},
    },
    context: {
      sessionId: null,
      conversationId: null,
      previousInputId: null,
      userIntent: null,
      futureMetadata: {},
    },
    language: 'en',
    futureMetadata: {},
  };
}

function createMockVoiceProvider(): VoiceProvider {
  return {
    name: 'Test Voice Provider',
    version: '1.0.0',
    available: true,
    speechToText: async (audio: unknown) => ({
      sessionId: generateVoiceSessionId(),
      operation: 'speech_to_text' as const,
      text: 'Test transcript',
      audioData: audio,
      confidence: 0.9,
      durationMs: 100,
      futureMetadata: {},
    }),
    textToSpeech: async (text: string) => ({
      sessionId: generateVoiceSessionId(),
      operation: 'text_to_speech' as const,
      text,
      audioData: new ArrayBuffer(100),
      confidence: 0.9,
      durationMs: 100,
      futureMetadata: {},
    }),
    startStream: async () => ({
      id: generateVoiceSessionId(),
      status: 'listening' as const,
      language: 'en',
      sampleRate: 16000,
      startedAt: new Date().toISOString(),
      endedAt: null,
      futureMetadata: {},
    }),
    stopStream: async () => {},
    interrupt: async () => {},
  };
}

function createMockImageProvider(): ImageProvider {
  return {
    name: 'Test Image Provider',
    version: '1.0.0',
    available: true,
    analyze: async (image: unknown, analysisType: string) => ({
      analysisType: analysisType as never,
      description: 'Test image analysis',
      detectedElements: [{ type: 'button', label: 'Submit', boundingBox: { x: 10, y: 20, width: 100, height: 40 }, confidence: 0.9, futureMetadata: {} }],
      extractedText: 'Submit',
      confidence: 0.85,
      futureMetadata: {},
    }),
  };
}

function createMockLogProvider(): LogProvider {
  return {
    name: 'Test Log Provider',
    version: '1.0.0',
    available: true,
    parse: async (logData: unknown, logType: string) => ({
      logType: logType as never,
      totalEntries: 5,
      errors: [],
      warnings: [],
      info: [],
      patterns: [],
      summary: 'Provider parsed log',
      confidence: 0.9,
      futureMetadata: {},
    }),
  };
}

function createMockDocumentProvider(): DocumentProvider {
  return {
    name: 'Test Document Provider',
    version: '1.0.0',
    available: true,
    process: async (document: unknown, documentType: string) => ({
      documentType: documentType as never,
      title: 'Test Document',
      summary: 'Provider processed document',
      sections: [],
      extractedData: {},
      confidence: 0.9,
      futureMetadata: {},
    }),
  };
}

function createMockPlugin(): ModalityPlugin {
  return {
    getPluginName: () => 'Test Plugin',
    getVersion: () => '1.0.0',
    getPriority: () => 10,
    isAvailable: () => true,
    getModalityDefinitions: () => [
      {
        modality: 'future_modality' as InputModality,
        label: 'Future Modality',
        description: 'A test future modality',
        enabled: true,
        processorId: 'test_processor',
        supportedSources: ['future_source'],
        futureMetadata: {},
      },
    ],
    getVoiceProvider: () => createMockVoiceProvider(),
    getImageProvider: () => createMockImageProvider(),
    getLogProvider: () => createMockLogProvider(),
    getDocumentProvider: () => createMockDocumentProvider(),
  };
}

// ── Types & Helpers ──────────────────────────────────────────

describe('Multimodal Types & Helpers', () => {
  it('should generate unique input IDs', () => {
    expect(generateInputId()).not.toBe(generateInputId());
  });

  it('should generate unique normalized input IDs', () => {
    expect(generateNormalizedInputId()).not.toBe(generateNormalizedInputId());
  });

  it('should generate unique response IDs', () => {
    expect(generateResponseId()).not.toBe(generateResponseId());
  });

  it('should generate unique attachment IDs', () => {
    expect(generateAttachmentId()).not.toBe(generateAttachmentId());
  });

  it('should generate unique session IDs', () => {
    expect(generateSessionId()).not.toBe(generateSessionId());
  });

  it('should generate unique voice session IDs', () => {
    expect(generateVoiceSessionId()).not.toBe(generateVoiceSessionId());
  });

  it('should return correct modality labels', () => {
    expect(getModalityLabel('text')).toBe('Text');
    expect(getModalityLabel('voice')).toBe('Voice');
    expect(getModalityLabel('screenshot')).toBe('Screenshot');
    expect(getModalityLabel('image')).toBe('Image');
    expect(getModalityLabel('system_log')).toBe('System Log');
    expect(getModalityLabel('report')).toBe('Report');
    expect(getModalityLabel('diagnostic_bundle')).toBe('Diagnostic Bundle');
    expect(getModalityLabel('json')).toBe('JSON');
  });

  it('should return correct input source labels', () => {
    expect(getInputSourceLabel('user')).toBe('User');
    expect(getInputSourceLabel('voice_stream')).toBe('Voice Stream');
    expect(getInputSourceLabel('screenshot_capture')).toBe('Screenshot Capture');
    expect(getInputSourceLabel('file_upload')).toBe('File Upload');
    expect(getInputSourceLabel('automation')).toBe('Automation');
  });

  it('should return correct processing status labels', () => {
    expect(getProcessingStatusLabel('pending')).toBe('Pending');
    expect(getProcessingStatusLabel('processing')).toBe('Processing');
    expect(getProcessingStatusLabel('completed')).toBe('Completed');
    expect(getProcessingStatusLabel('failed')).toBe('Failed');
    expect(getProcessingStatusLabel('cancelled')).toBe('Cancelled');
  });

  it('should return correct response modality labels', () => {
    expect(getResponseModalityLabel('text')).toBe('Text');
    expect(getResponseModalityLabel('voice')).toBe('Voice');
    expect(getResponseModalityLabel('visual')).toBe('Visual');
    expect(getResponseModalityLabel('interactive')).toBe('Interactive');
  });

  it('should return correct log type labels', () => {
    expect(getLogTypeLabel('application')).toBe('Application Log');
    expect(getLogTypeLabel('system')).toBe('System Log');
    expect(getLogTypeLabel('crash')).toBe('Crash Log');
    expect(getLogTypeLabel('optimization')).toBe('Optimization Log');
    expect(getLogTypeLabel('maintenance')).toBe('Maintenance Log');
  });

  it('should return correct document type labels', () => {
    expect(getDocumentTypeLabel('report')).toBe('Report');
    expect(getDocumentTypeLabel('configuration')).toBe('Configuration');
    expect(getDocumentTypeLabel('export')).toBe('Export');
  });

  it('should return correct session status labels', () => {
    expect(getSessionStatusLabel('active')).toBe('Active');
    expect(getSessionStatusLabel('idle')).toBe('Idle');
    expect(getSessionStatusLabel('ended')).toBe('Ended');
  });

  it('should create default modality definitions', () => {
    const defs = createDefaultModalityDefinitions();
    expect(defs.length).toBeGreaterThan(0);
    expect(defs.some((d) => d.modality === 'text')).toBe(true);
    expect(defs.some((d) => d.modality === 'voice')).toBe(true);
    expect(defs.some((d) => d.modality === 'screenshot')).toBe(true);
  });

  it('should create default configuration', () => {
    const config = createDefaultMultimodalConfiguration();
    expect(config.configVersion).toBe('1.0.0');
    expect(config.supportedModalities.length).toBeGreaterThan(0);
    expect(config.featureFlags.enableMultimodal).toBe(true);
  });
});

// ── Configuration ────────────────────────────────────────────

describe('Multimodal Configuration', () => {
  it('should create default configuration', () => {
    const config = createMultimodalConfiguration();
    expect(config.configVersion).toBe('1.0.0');
    expect(config.supportedModalities).toContain('text');
    expect(config.supportedModalities).toContain('voice');
    expect(config.validationRules.maxInputSizeBytes).toBeGreaterThan(0);
    expect(config.attachmentPolicies.maxAttachments).toBeGreaterThan(0);
  });

  it('should merge partial overrides', () => {
    const config = createMultimodalConfiguration({
      configVersion: '2.0.0',
    });
    expect(config.configVersion).toBe('2.0.0');
    // Other fields should remain default
    expect(config.supportedModalities).toContain('text');
  });

  it('should validate correct configuration', () => {
    const config = createMultimodalConfiguration();
    const result = validateMultimodalConfiguration(config);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('should detect invalid configuration', () => {
    const config = createMultimodalConfiguration();
    config.supportedModalities = [];
    config.validationRules.maxInputSizeBytes = 0;
    config.validationRules.maxTextLength = 0;
    config.validationRules.minConfidenceThreshold = 2;
    const result = validateMultimodalConfiguration(config);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should preserve DEFAULT_MULTIMODAL_CONFIGURATION immutability', () => {
    const original = DEFAULT_MULTIMODAL_CONFIGURATION.configVersion;
    const config = createMultimodalConfiguration({ configVersion: '3.0.0' });
    expect(DEFAULT_MULTIMODAL_CONFIGURATION.configVersion).toBe(original);
    expect(config.configVersion).toBe('3.0.0');
  });
});

// ── Events ───────────────────────────────────────────────────

describe('Multimodal Events', () => {
  let events: MultimodalEvents;

  beforeEach(() => {
    events = new MultimodalEvents();
  });

  it('should register and emit events', () => {
    let received = false;
    events.on('input_received', () => { received = true; });
    events.emit({ type: 'input_received', timestamp: new Date().toISOString(), data: { test: true } });
    expect(received).toBe(true);
  });

  it('should unregister listeners', () => {
    let count = 0;
    const listener = () => { count++; };
    events.on('processing_completed', listener);
    events.emit({ type: 'processing_completed', timestamp: new Date().toISOString(), data: {} });
    events.off('processing_completed', listener);
    events.emit({ type: 'processing_completed', timestamp: new Date().toISOString(), data: {} });
    expect(count).toBe(1);
  });

  it('should count listeners', () => {
    events.on('input_received', () => {});
    events.on('input_received', () => {});
    events.on('processing_completed', () => {});
    expect(events.listenerCount('input_received')).toBe(2);
    expect(events.listenerCount('processing_completed')).toBe(1);
    expect(events.listenerCount()).toBe(3);
  });

  it('should remove all listeners', () => {
    events.on('input_received', () => {});
    events.on('processing_completed', () => {});
    events.removeAllListeners();
    expect(events.listenerCount()).toBe(0);
  });

  it('should remove listeners for specific type', () => {
    events.on('input_received', () => {});
    events.on('processing_completed', () => {});
    events.removeListenersForType('input_received');
    expect(events.listenerCount('input_received')).toBe(0);
    expect(events.listenerCount('processing_completed')).toBe(1);
  });

  it('should not propagate listener errors', () => {
    events.on('input_received', () => { throw new Error('test'); });
    expect(() => {
      events.emit({ type: 'input_received', timestamp: new Date().toISOString(), data: {} });
    }).not.toThrow();
  });
});

// ── Modality Registry ────────────────────────────────────────

describe('Modality Registry', () => {
  let registry: ModalityRegistry;

  beforeEach(() => {
    registry = new ModalityRegistry();
  });

  it('should have default modalities registered', () => {
    expect(registry.has('text')).toBe(true);
    expect(registry.has('voice')).toBe(true);
    expect(registry.has('screenshot')).toBe(true);
    expect(registry.count()).toBeGreaterThan(0);
  });

  it('should get modality definitions', () => {
    const def = registry.get('text');
    expect(def).not.toBeNull();
    expect(def!.modality).toBe('text');
    expect(def!.label).toBe('Text');
  });

  it('should return null for unknown modality', () => {
    expect(registry.get('future_modality')).toBeNull();
  });

  it('should register and unregister custom modalities', () => {
    const customModality: InputModality = 'future_modality';
    const registered = registry.register({
      modality: customModality,
      label: 'Custom',
      description: 'Custom modality',
      enabled: true,
      processorId: 'custom_processor',
      supportedSources: ['future_source'],
      futureMetadata: {},
    });
    expect(registered).toBe(true);
    expect(registry.has(customModality)).toBe(true);

    const unregistered = registry.unregister(customModality);
    expect(unregistered).toBe(true);
    expect(registry.has(customModality)).toBe(false);
  });

  it('should not register duplicate modalities', () => {
    const registered = registry.register({
      modality: 'text',
      label: 'Duplicate',
      description: 'Duplicate',
      enabled: true,
      processorId: 'dup',
      supportedSources: ['user'],
      futureMetadata: {},
    });
    expect(registered).toBe(false);
  });

  it('should enable and disable modalities', () => {
    expect(registry.disable('text')).toBe(true);
    expect(registry.get('text')!.enabled).toBe(false);
    expect(registry.getEnabled().some((d) => d.modality === 'text')).toBe(false);

    expect(registry.enable('text')).toBe(true);
    expect(registry.get('text')!.enabled).toBe(true);
    expect(registry.getEnabled().some((d) => d.modality === 'text')).toBe(true);
  });

  it('should register and unregister plugins', () => {
    const plugin = createMockPlugin();
    expect(registry.registerPlugin(plugin)).toBe(true);
    expect(registry.getPlugin('Test Plugin')).not.toBeNull();
    expect(registry.getPlugins().length).toBe(1);

    expect(registry.unregisterPlugin('Test Plugin')).toBe(true);
    expect(registry.getPlugin('Test Plugin')).toBeNull();
  });

  it('should not register unavailable plugins', () => {
    const plugin = createMockPlugin();
    plugin.isAvailable = () => false;
    expect(registry.registerPlugin(plugin)).toBe(false);
  });

  it('should get definitions by processor ID', () => {
    const defs = registry.getByProcessorId('builtin_text');
    expect(defs.length).toBeGreaterThan(0);
  });
});

// ── Input Router ─────────────────────────────────────────────

describe('Input Router', () => {
  let registry: ModalityRegistry;
  let router: InputRouter;
  let config: MultimodalConfiguration;

  beforeEach(() => {
    registry = new ModalityRegistry();
    config = createMultimodalConfiguration();
    router = new InputRouter(registry, config);
  });

  it('should route text input explicitly', () => {
    const input = createMockTextInput();
    const result = router.route(input);
    expect(result.modality).toBe('text');
    expect(result.detectionMethod).toBe('explicit');
    expect(result.confidence).toBe(1.0);
  });

  it('should route voice input explicitly', () => {
    const input = createMockVoiceInput();
    const result = router.route(input);
    expect(result.modality).toBe('voice');
    expect(result.detectionMethod).toBe('explicit');
  });

  it('should detect modality from mime type', () => {
    const input = createMockTextInput();
    input.modality = 'future_modality';
    input.metadata.mimeType = 'audio/wav';
    const result = router.route(input);
    expect(result.modality).toBe('voice');
    expect(result.detectionMethod).toBe('inferred');
  });

  it('should detect screenshot from source', () => {
    const input = createMockTextInput();
    input.modality = 'future_modality';
    input.source = 'screenshot_capture';
    input.metadata.mimeType = 'image/png';
    const result = router.route(input);
    expect(result.modality).toBe('screenshot');
    expect(result.detectionMethod).toBe('inferred');
  });

  it('should detect image from mime type', () => {
    const input = createMockTextInput();
    input.modality = 'future_modality';
    input.metadata.mimeType = 'image/jpeg';
    const result = router.route(input);
    expect(result.modality).toBe('image');
  });

  it('should detect JSON from mime type', () => {
    const input = createMockTextInput();
    input.modality = 'future_modality';
    input.metadata.mimeType = 'application/json';
    const result = router.route(input);
    expect(result.modality).toBe('json');
  });

  it('should detect system log from content patterns', () => {
    const input = createMockTextInput('2024-01-15T10:30:00 [ERROR] Something went wrong');
    input.modality = 'future_modality';
    input.metadata.mimeType = 'text/plain';
    const result = router.route(input);
    expect(result.modality).toBe('system_log');
  });

  it('should infer text for unknown content with text data', () => {
    const input = createMockTextInput('hello world');
    input.modality = 'future_modality';
    input.metadata.mimeType = null;
    const result = router.route(input);
    expect(result.modality).toBe('text');
    expect(result.detectionMethod).toBe('inferred');
  });

  it('should detectModality method return modality only', () => {
    const input = createMockVoiceInput();
    expect(router.detectModality(input)).toBe('voice');
  });

  it('should route within performance target', () => {
    const input = createMockTextInput();
    const start = Date.now();
    router.route(input);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});

// ── Input Normalizer ─────────────────────────────────────────

describe('Input Normalizer', () => {
  let normalizer: InputNormalizer;
  let config: MultimodalConfiguration;

  beforeEach(() => {
    config = createMultimodalConfiguration();
    normalizer = new InputNormalizer(config);
  });

  it('should normalize text input', () => {
    const input = createMockTextInput('Optimize my PC');
    const result = normalizer.normalize(input);
    expect(result.text).toBe('Optimize my PC');
    expect(result.modality).toBe('text');
    expect(result.inputId).toBe(input.id);
    expect(result.id).toBeDefined();
  });

  it('should normalize voice input with transcript', () => {
    const input = createMockVoiceInput('What is my health score?');
    const result = normalizer.normalize(input);
    expect(result.text).toBe('What is my health score?');
    expect(result.modality).toBe('voice');
  });

  it('should normalize screenshot input', () => {
    const input = createMockScreenshotInput();
    const result = normalizer.normalize(input);
    expect(result.text).toContain('Dashboard');
    expect(result.modality).toBe('screenshot');
  });

  it('should normalize log input', () => {
    const input = createMockLogInput();
    const result = normalizer.normalize(input);
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.modality).toBe('system_log');
    expect(result.extractedData.errorCount).toBeGreaterThan(0);
  });

  it('should normalize JSON input', () => {
    const input = createMockJsonInput();
    const result = normalizer.normalize(input);
    expect(result.text).toContain('health_check');
    expect(result.modality).toBe('json');
  });

  it('should extract entities from text', () => {
    const input = createMockTextInput('health score: 85');
    const result = normalizer.normalize(input);
    expect(result.entities.length).toBeGreaterThan(0);
    const healthEntity = result.entities.find((e) => e.type === 'health_score');
    expect(healthEntity).toBeDefined();
    expect(healthEntity!.value).toBe(85);
  });

  it('should extract optimization entities', () => {
    const input = createMockTextInput('Please optimize my system');
    const result = normalizer.normalize(input);
    const optEntity = result.entities.find((e) => e.type === 'optimization_plan');
    expect(optEntity).toBeDefined();
  });

  it('should warn on low confidence', () => {
    const input = createMockTextInput();
    input.metadata.confidence = 0.1;
    const result = normalizer.normalize(input);
    expect(result.warnings.some((w) => w.code === 'LOW_CONFIDENCE')).toBe(true);
  });

  it('should truncate text exceeding max length', () => {
    const longText = 'a'.repeat(20000);
    const input = createMockTextInput(longText);
    const result = normalizer.normalize(input);
    expect(result.text.length).toBeLessThanOrEqual(config.validationRules.maxTextLength);
    expect(result.warnings.some((w) => w.code === 'TEXT_TRUNCATED')).toBe(true);
  });

  it('should warn on missing voice transcript', () => {
    const input = createMockVoiceInput('');
    input.contentReference.data = { audio: 'data' };
    const result = normalizer.normalize(input);
    expect(result.warnings.some((w) => w.code === 'NO_VOICE_TRANSCRIPT')).toBe(true);
  });

  it('should normalize within performance target', () => {
    const input = createMockTextInput('test');
    const start = Date.now();
    normalizer.normalize(input);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});

// ── Voice Processor ──────────────────────────────────────────

describe('Voice Processor', () => {
  let processor: VoiceProcessor;
  let config: MultimodalConfiguration;

  beforeEach(() => {
    config = createMultimodalConfiguration();
    processor = new VoiceProcessor(config);
  });

  it('should be unavailable without provider', () => {
    expect(processor.isAvailable()).toBe(false);
  });

  it('should be available with provider', () => {
    processor.setProvider(createMockVoiceProvider());
    expect(processor.isAvailable()).toBe(true);
  });

  it('should return error result when unavailable for STT', async () => {
    const result = await processor.speechToText(new ArrayBuffer(100));
    expect(result.text).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it('should return error result when unavailable for TTS', async () => {
    const result = await processor.textToSpeech('hello');
    expect(result.audioData).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it('should perform STT with provider', async () => {
    processor.setProvider(createMockVoiceProvider());
    const result = await processor.speechToText(new ArrayBuffer(100));
    expect(result.text).toBe('Test transcript');
    expect(result.confidence).toBe(0.9);
  });

  it('should perform TTS with provider', async () => {
    processor.setProvider(createMockVoiceProvider());
    const result = await processor.textToSpeech('hello');
    expect(result.text).toBe('hello');
    expect(result.audioData).toBeDefined();
  });

  it('should create local session', () => {
    const session = processor.createLocalSession();
    expect(session.id).toBeDefined();
    expect(session.status).toBe('idle');
    expect(processor.getSession(session.id)).not.toBeNull();
  });

  it('should update session status', () => {
    const session = processor.createLocalSession();
    expect(processor.updateSessionStatus(session.id, 'listening')).toBe(true);
    expect(processor.getSession(session.id)!.status).toBe('listening');
  });

  it('should end session', () => {
    const session = processor.createLocalSession();
    expect(processor.endSession(session.id)).toBe(true);
    expect(processor.getSession(session.id)!.status).toBe('ended');
  });

  it('should track session count', () => {
    expect(processor.getSessionCount()).toBe(0);
    processor.createLocalSession();
    processor.createLocalSession();
    expect(processor.getSessionCount()).toBe(2);
  });

  it('should clear sessions', () => {
    processor.createLocalSession();
    processor.clearSessions();
    expect(processor.getSessionCount()).toBe(0);
  });
});

// ── Image Processor ──────────────────────────────────────────

describe('Image Processor', () => {
  let processor: ImageProcessor;
  let config: MultimodalConfiguration;

  beforeEach(() => {
    config = createMultimodalConfiguration();
    processor = new ImageProcessor(config);
  });

  it('should use builtin fallback when no provider', async () => {
    const result = await processor.analyzeScreenshot({ description: 'Test image' });
    expect(result.description).toBe('Test image');
    expect(result.confidence).toBe(0.6);
  });

  it('should use provider when available', async () => {
    processor.setProvider(createMockImageProvider());
    const result = await processor.analyzeScreenshot({});
    expect(result.description).toBe('Test image analysis');
    expect(result.confidence).toBe(0.85);
  });

  it('should detect UI elements', async () => {
    processor.setProvider(createMockImageProvider());
    const result = await processor.detectUI({});
    expect(result.detectedElements.length).toBeGreaterThan(0);
  });

  it('should analyze health visualization', async () => {
    const result = await processor.analyzeHealthVisualization({ description: 'Health chart' });
    expect(result.analysisType).toBe('health_visualization');
  });

  it('should understand charts', async () => {
    const result = await processor.understandChart({ description: 'Bar chart' });
    expect(result.analysisType).toBe('chart_understanding');
  });

  it('should extract text from image data', async () => {
    const result = await processor.analyzeScreenshot({ extractedText: 'Score: 90' });
    expect(result.extractedText).toBe('Score: 90');
  });
});

// ── Log Processor ────────────────────────────────────────────

describe('Log Processor', () => {
  let processor: LogProcessor;
  let config: MultimodalConfiguration;

  beforeEach(() => {
    config = createMultimodalConfiguration();
    processor = new LogProcessor(config);
  });

  it('should parse application logs with builtin', async () => {
    const logData = '2024-01-15T10:30:00 [INFO] Started\n2024-01-15T10:31:00 [ERROR] Failed';
    const result = await processor.parseApplicationLog(logData);
    expect(result.totalEntries).toBe(2);
    expect(result.errors.length).toBe(1);
    expect(result.info.length).toBe(1);
  });

  it('should detect patterns in logs', async () => {
    const logData = Array(5).fill('2024-01-15T10:30:00 [ERROR] Same error').join('\n');
    const result = await processor.parseSystemLog(logData);
    expect(result.patterns.length).toBeGreaterThan(0);
    expect(result.patterns[0]!.occurrences).toBeGreaterThanOrEqual(2);
  });

  it('should generate summary', async () => {
    const result = await processor.parseApplicationLog('[ERROR] Test error');
    expect(result.summary).toContain('error');
  });

  it('should use provider when available', async () => {
    processor.setProvider(createMockLogProvider());
    const result = await processor.parseSystemLog('test');
    expect(result.summary).toBe('Provider parsed log');
    expect(result.confidence).toBe(0.9);
  });

  it('should parse crash logs', async () => {
    const result = await processor.parseCrashLog('[ERROR] Crash: null pointer');
    expect(result.logType).toBe('crash');
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should parse optimization logs', async () => {
    const result = await processor.parseOptimizationLog('[INFO] Optimization completed');
    expect(result.logType).toBe('optimization');
  });

  it('should parse maintenance logs', async () => {
    const result = await processor.parseMaintenanceLog('[INFO] Maintenance done');
    expect(result.logType).toBe('maintenance');
  });
});

// ── Document Processor ───────────────────────────────────────

describe('Document Processor', () => {
  let processor: DocumentProcessor;
  let config: MultimodalConfiguration;

  beforeEach(() => {
    config = createMultimodalConfiguration();
    processor = new DocumentProcessor(config);
  });

  it('should process reports with builtin', async () => {
    const doc = '# Health Report\n\nHealth score is 85.';
    const result = await processor.reviewReport(doc);
    expect(result.title).toBe('Health Report');
    expect(result.sections.length).toBeGreaterThan(0);
  });

  it('should extract sections from markdown', async () => {
    const doc = '# Section 1\nContent 1\n# Section 2\nContent 2';
    const result = await processor.reviewReport(doc);
    expect(result.sections.length).toBe(2);
    expect(result.sections[0]!.title).toBe('Section 1');
    expect(result.sections[1]!.title).toBe('Section 2');
  });

  it('should review configuration documents', async () => {
    const result = await processor.reviewConfiguration({ title: 'Config', sections: [] });
    expect(result.documentType).toBe('configuration');
  });

  it('should analyze exports', async () => {
    const result = await processor.analyzeExport('Export data');
    expect(result.documentType).toBe('export');
  });

  it('should use provider when available', async () => {
    processor.setProvider(createMockDocumentProvider());
    const result = await processor.reviewReport({});
    expect(result.title).toBe('Test Document');
    expect(result.confidence).toBe(0.9);
  });
});

// ── Context Enricher ─────────────────────────────────────────

describe('Context Enricher', () => {
  let enricher: ContextEnricher;
  let config: MultimodalConfiguration;

  beforeEach(() => {
    config = createMultimodalConfiguration();
    enricher = new ContextEnricher(config);
  });

  it('should enrich context with health score', () => {
    const input = createMockTextInput();
    const ctxInput = createMockContextInput(82);
    const result = enricher.extractContext(input, ctxInput);
    expect(result.healthScore).toBe(82);
    expect(result.aiAssistantContext).toBeDefined();
  });

  it('should include conversation context', () => {
    const input = createMockTextInput();
    const ctxInput = createMockContextInput();
    const result = enricher.enrich({
      input,
      aiAssistantContextInput: ctxInput,
      previousInputs: [createMockTextInput('previous')],
      activeTopics: ['optimization'],
      sessionId: 'sess1',
      conversationId: 'conv1',
    });
    expect(result.conversationContext.sessionId).toBe('sess1');
    expect(result.conversationContext.conversationId).toBe('conv1');
    expect(result.conversationContext.activeTopics).toContain('optimization');
    expect(result.conversationContext.previousInputs.length).toBe(1);
  });

  it('should cache results', () => {
    const input = createMockTextInput();
    const ctxInput = createMockContextInput(75);
    enricher.extractContext(input, ctxInput);
    expect(enricher.getCacheSize()).toBeGreaterThan(0);
  });

  it('should clear cache', () => {
    const input = createMockTextInput();
    const ctxInput = createMockContextInput();
    enricher.extractContext(input, ctxInput);
    enricher.clearCache();
    expect(enricher.getCacheSize()).toBe(0);
  });

  it('should include goals and recommendations', () => {
    const input = createMockTextInput();
    const ctxInput = createMockContextInput(70);
    const result = enricher.extractContext(input, ctxInput);
    expect(result.goals.length).toBeGreaterThan(0);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });
});

// ── Attachment Manager ───────────────────────────────────────

describe('Attachment Manager', () => {
  let manager: AttachmentManager;
  let config: MultimodalConfiguration;

  beforeEach(() => {
    config = createMultimodalConfiguration();
    manager = new AttachmentManager(config);
  });

  it('should add valid attachments', () => {
    const att = manager.add('input1', 'test.png', 'image/png', 1024, 'image');
    expect(att.status).toBe('validated');
    expect(att.filename).toBe('test.png');
    expect(att.storagePath).not.toBeNull();
  });

  it('should reject oversized attachments', () => {
    const att = manager.add('input1', 'big.bin', 'application/octet-stream', 999999999, 'image');
    expect(att.status).toBe('rejected');
  });

  it('should retrieve attachments by input ID', () => {
    manager.add('input1', 'a.png', 'image/png', 1024, 'image');
    manager.add('input1', 'b.png', 'image/png', 2048, 'image');
    const atts = manager.getByInput('input1');
    expect(atts.length).toBe(2);
  });

  it('should remove attachments', () => {
    const att = manager.add('input1', 'test.png', 'image/png', 1024, 'image');
    expect(manager.remove(att.id)).toBe(true);
    expect(manager.get(att.id)).toBeNull();
  });

  it('should remove all attachments for an input', () => {
    manager.add('input1', 'a.png', 'image/png', 1024, 'image');
    manager.add('input1', 'b.png', 'image/png', 2048, 'image');
    expect(manager.removeAllForInput('input1')).toBe(2);
    expect(manager.getByInput('input1').length).toBe(0);
  });

  it('should track total size', () => {
    manager.add('input1', 'a.png', 'image/png', 1024, 'image');
    manager.add('input1', 'b.png', 'image/png', 2048, 'image');
    expect(manager.getTotalSize()).toBe(3072);
  });

  it('should count attachments', () => {
    manager.add('input1', 'a.png', 'image/png', 1024, 'image');
    manager.add('input2', 'b.png', 'image/png', 2048, 'image');
    expect(manager.count()).toBe(2);
    expect(manager.countForInput('input1')).toBe(1);
  });

  it('should reject empty filename', () => {
    const att = manager.add('input1', '', 'image/png', 1024, 'image');
    expect(att.status).toBe('rejected');
  });
});

// ── Session Synchronizer ─────────────────────────────────────

describe('Session Synchronizer', () => {
  let sync: SessionSynchronizer;
  let config: MultimodalConfiguration;

  beforeEach(() => {
    config = createMultimodalConfiguration();
    sync = new SessionSynchronizer(config);
  });

  it('should create sessions', () => {
    const session = sync.createSession();
    expect(session.id).toBeDefined();
    expect(session.status).toBe('active');
    expect(session.inputCount).toBe(0);
  });

  it('should record inputs in sessions', () => {
    const session = sync.createSession();
    const input = createMockTextInput();
    sync.recordInput(session.id, input);
    expect(sync.getSession(session.id)!.inputCount).toBe(1);
    expect(sync.getSession(session.id)!.activeModalities).toContain('text');
  });

  it('should track input history', () => {
    const session = sync.createSession();
    sync.recordInput(session.id, createMockTextInput('first'));
    sync.recordInput(session.id, createMockTextInput('second'));
    const history = sync.getInputHistory(session.id);
    expect(history.length).toBe(2);
  });

  it('should get recent inputs', () => {
    const session = sync.createSession();
    sync.recordInput(session.id, createMockTextInput('first'));
    sync.recordInput(session.id, createMockTextInput('second'));
    const recent = sync.getRecentInputs(session.id, 1);
    expect(recent.length).toBe(1);
  });

  it('should end sessions', () => {
    const session = sync.createSession();
    sync.endSession(session.id);
    expect(sync.getSession(session.id)!.status).toBe('ended');
  });

  it('should get active sessions', () => {
    sync.createSession();
    sync.createSession();
    expect(sync.getActiveSessions().length).toBe(2);
  });

  it('should mark idle sessions', () => {
    const session = sync.createSession();
    // Manually set old timestamp
    sync.getSession(session.id)!.lastActivityAt = new Date(Date.now() - 400000).toISOString();
    sync.markIdle(300000);
    expect(sync.getSession(session.id)!.status).toBe('idle');
  });

  it('should track active modalities', () => {
    const session = sync.createSession();
    sync.recordInput(session.id, createMockTextInput());
    sync.recordInput(session.id, createMockVoiceInput());
    expect(sync.getActiveModalities(session.id)).toContain('text');
    expect(sync.getActiveModalities(session.id)).toContain('voice');
  });

  it('should clear sessions', () => {
    sync.createSession();
    sync.clear();
    expect(sync.count()).toBe(0);
  });
});

// ── Analytics ────────────────────────────────────────────────

describe('Multimodal Analytics', () => {
  let analytics: MultimodalAnalytics;

  beforeEach(() => {
    analytics = new MultimodalAnalytics();
  });

  it('should record inputs', () => {
    analytics.recordInput(createMockTextInput());
    analytics.recordInput(createMockVoiceInput());
    const data = analytics.getAnalytics();
    expect(data.totalInputs).toBe(2);
    expect(data.byModality.text).toBe(1);
    expect(data.byModality.voice).toBe(1);
  });

  it('should track by source', () => {
    analytics.recordInput(createMockTextInput());
    analytics.recordInput(createMockVoiceInput());
    const data = analytics.getAnalytics();
    expect(data.bySource.user).toBe(1);
    expect(data.bySource.voice_stream).toBe(1);
  });

  it('should record attachments', () => {
    analytics.recordAttachment();
    analytics.recordAttachment();
    expect(analytics.getAnalytics().totalAttachments).toBe(2);
  });

  it('should record voice sessions', () => {
    analytics.recordVoiceSession();
    expect(analytics.getAnalytics().totalVoiceSessions).toBe(1);
  });

  it('should reset', () => {
    analytics.recordInput(createMockTextInput());
    analytics.reset();
    expect(analytics.getAnalytics().totalInputs).toBe(0);
  });

  it('should get by modality', () => {
    analytics.recordInput(createMockTextInput());
    analytics.recordInput(createMockTextInput());
    expect(analytics.getByModality('text')).toBe(2);
  });

  it('should get by source', () => {
    analytics.recordInput(createMockVoiceInput());
    expect(analytics.getBySource('voice_stream')).toBe(1);
  });
});

// ── Validator ────────────────────────────────────────────────

describe('Multimodal Validator', () => {
  let validator: MultimodalValidator;
  let config: MultimodalConfiguration;

  beforeEach(() => {
    config = createMultimodalConfiguration();
    validator = new MultimodalValidator(config);
  });

  it('should validate correct input', () => {
    const input = createMockTextInput();
    const result = validator.validateInput(input);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('should detect missing ID', () => {
    const input = createMockTextInput();
    input.id = '';
    const result = validator.validateInput(input);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'MISSING_ID')).toBe(true);
  });

  it('should detect oversized input', () => {
    const input = createMockTextInput();
    input.metadata.sizeBytes = 999999999;
    const result = validator.validateInput(input);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'INPUT_TOO_LARGE')).toBe(true);
  });

  it('should warn on unsupported modality', () => {
    const input = createMockTextInput();
    input.modality = 'custom_modality' as InputModality;
    const result = validator.validateInput(input);
    expect(result.warnings.some((w) => w.code === 'UNSUPPORTED_MODALITY')).toBe(true);
  });

  it('should detect invalid confidence', () => {
    const input = createMockTextInput();
    input.metadata.confidence = 1.5;
    const result = validator.validateInput(input);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'INVALID_CONFIDENCE')).toBe(true);
  });

  it('should validate normalized input', () => {
    const input = createMockTextInput();
    const normalizer = new InputNormalizer(config);
    const normalized = normalizer.normalize(input);
    const result = validator.validateNormalized(normalized);
    expect(result.valid).toBe(true);
  });

  it('should warn on empty normalized text', () => {
    const result = validator.validateNormalized({
      id: 'test',
      inputId: 'test',
      modality: 'text',
      text: '',
      entities: [],
      language: 'en',
      confidence: 0.9,
      extractedData: {},
      warnings: [],
      futureMetadata: {},
    });
    expect(result.warnings.some((w) => w.code === 'EMPTY_TEXT')).toBe(true);
  });
});

// ── Manager Facade ───────────────────────────────────────────

describe('Multimodal Manager', () => {
  let manager: MultimodalManager;

  beforeEach(() => {
    manager = new MultimodalManager();
  });

  it('should create manager with default config', () => {
    expect(manager.getConfig().configVersion).toBe('1.0.0');
  });

  it('should create manager with custom config', () => {
    const m = new MultimodalManager({ configVersion: '2.0.0' });
    expect(m.getConfig().configVersion).toBe('2.0.0');
  });

  it('should throw on invalid config', () => {
    expect(() => new MultimodalManager({ supportedModalities: [] })).toThrow();
  });

  it('should detect modality', () => {
    const input = createMockTextInput();
    expect(manager.detectModality(input)).toBe('text');
  });

  it('should normalize input', () => {
    const input = createMockTextInput('Test normalization');
    const result = manager.normalizeInput(input);
    expect(result.text).toBe('Test normalization');
  });

  it('should extract context', () => {
    const input = createMockTextInput();
    const ctxInput = createMockContextInput(80);
    const result = manager.extractContext(input, ctxInput);
    expect(result.healthScore).toBe(80);
  });

  it('should process text input end-to-end', () => {
    const input = createMockTextInput('Optimize my PC performance');
    const ctxInput = createMockContextInput(70);
    const result = manager.processInput(input, { aiAssistantContextInput: ctxInput });
    expect(result.status).toBe('completed');
    expect(result.modality).toBe('text');
    expect(result.normalizedInput.text).toBe('Optimize my PC performance');
    expect(result.intent.type).toBe('optimization');
    expect(result.response).toBeDefined();
    expect(result.response.text).toBeDefined();
  });

  it('should process voice input end-to-end', () => {
    const input = createMockVoiceInput('What is my health score?');
    const ctxInput = createMockContextInput(85);
    const result = manager.processInput(input, { aiAssistantContextInput: ctxInput });
    expect(result.status).toBe('completed');
    expect(result.modality).toBe('voice');
    expect(result.normalizedInput.text).toBe('What is my health score?');
    expect(result.intent.type).toBe('explanation');
  });

  it('should process screenshot input end-to-end', () => {
    const input = createMockScreenshotInput();
    const ctxInput = createMockContextInput(85);
    const result = manager.processInput(input, { aiAssistantContextInput: ctxInput });
    expect(result.status).toBe('completed');
    expect(result.modality).toBe('screenshot');
  });

  it('should process log input end-to-end', () => {
    const input = createMockLogInput();
    const ctxInput = createMockContextInput(60);
    const result = manager.processInput(input, { aiAssistantContextInput: ctxInput });
    expect(result.status).toBe('completed');
    expect(result.modality).toBe('system_log');
  });

  it('should process JSON input end-to-end', () => {
    const input = createMockJsonInput();
    const ctxInput = createMockContextInput(78);
    const result = manager.processInput(input, { aiAssistantContextInput: ctxInput });
    expect(result.status).toBe('completed');
    expect(result.modality).toBe('json');
  });

  it('should route to tools based on intent', () => {
    const input = createMockTextInput('Optimize my PC');
    const ctxInput = createMockContextInput(70);
    const result = manager.processInput(input, { aiAssistantContextInput: ctxInput });
    expect(result.toolRouting.toolIds.length).toBeGreaterThan(0);
    expect(result.toolRouting.toolIds).toContain('create_optimization_session');
  });

  it('should generate response with evidence', () => {
    const input = createMockTextInput('Show me recommendations');
    const ctxInput = createMockContextInput(75);
    const result = manager.processInput(input, { aiAssistantContextInput: ctxInput });
    expect(result.response.evidence.length).toBeGreaterThan(0);
    expect(result.response.confidence).toBeGreaterThan(0);
  });

  it('should emit events during processing', () => {
    const events: string[] = [];
    manager.on('input_received', (e) => events.push(e.type));
    manager.on('processing_completed', (e) => events.push(e.type));
    const input = createMockTextInput();
    const ctxInput = createMockContextInput();
    manager.processInput(input, { aiAssistantContextInput: ctxInput });
    expect(events).toContain('input_received');
    expect(events).toContain('processing_completed');
  });

  it('should create and manage sessions', () => {
    const session = manager.createSession();
    expect(session.id).toBeDefined();
    expect(manager.getSession(session.id)).not.toBeNull();
    expect(manager.endSession(session.id)).toBe(true);
    expect(manager.getSession(session.id)!.status).toBe('ended');
  });

  it('should manage attachments', () => {
    const att = manager.addAttachment('input1', 'test.png', 'image/png', 1024, 'image');
    expect(att.status).toBe('validated');
    expect(manager.getAttachments('input1').length).toBe(1);
    expect(manager.removeAttachment(att.id)).toBe(true);
    expect(manager.getAttachments('input1').length).toBe(0);
  });

  it('should track analytics', () => {
    const input = createMockTextInput();
    const ctxInput = createMockContextInput();
    manager.processInput(input, { aiAssistantContextInput: ctxInput });
    const analytics = manager.getAnalytics();
    expect(analytics.totalInputs).toBe(1);
  });

  it('should validate input', () => {
    const input = createMockTextInput();
    const result = manager.validateInput(input);
    expect(result.valid).toBe(true);
  });

  it('should register plugins', () => {
    const plugin = createMockPlugin();
    expect(manager.registerPlugin(plugin)).toBe(true);
    expect(manager.getModalityRegistry().getPlugin('Test Plugin')).not.toBeNull();
  });

  it('should get sub-processors', () => {
    expect(manager.getVoiceProcessor()).toBeDefined();
    expect(manager.getImageProcessor()).toBeDefined();
    expect(manager.getLogProcessor()).toBeDefined();
    expect(manager.getDocumentProcessor()).toBeDefined();
  });

  it('should update config', () => {
    manager.updateConfig({ configVersion: '5.0.0' });
    expect(manager.getConfig().configVersion).toBe('5.0.0');
  });

  it('should clear all', () => {
    manager.addAttachment('input1', 'test.png', 'image/png', 1024, 'image');
    manager.createSession();
    manager.clearAll();
    expect(manager.getAttachments('input1').length).toBe(0);
  });

  it('should throw when multimodal is disabled', () => {
    const m = new MultimodalManager();
    const config = m.getConfig();
    config.featureFlags.enableMultimodal = false;
    m.updateConfig(config);
    const input = createMockTextInput();
    const ctxInput = createMockContextInput();
    expect(() => m.processInput(input, { aiAssistantContextInput: ctxInput })).toThrow();
  });

  it('should process input with session tracking', () => {
    const session = manager.createSession();
    const input = createMockTextInput('test with session');
    const ctxInput = createMockContextInput();
    manager.processInput(input, { aiAssistantContextInput: ctxInput, sessionId: session.id });
    expect(manager.getSession(session.id)!.inputCount).toBe(1);
  });
});

// ── Regression Tests ─────────────────────────────────────────

describe('Regression Tests', () => {
  it('should handle empty text input gracefully', () => {
    const manager = new MultimodalManager();
    const input = createMockTextInput('');
    const ctxInput = createMockContextInput();
    const result = manager.processInput(input, { aiAssistantContextInput: ctxInput });
    expect(result.status).toBe('completed');
  });

  it('should handle null health score in context', () => {
    const manager = new MultimodalManager();
    const input = createMockTextInput('What is my status?');
    const ctxInput = createMockContextInput();
    ctxInput.healthScore = null;
    const result = manager.processInput(input, { aiAssistantContextInput: ctxInput });
    expect(result.status).toBe('completed');
    expect(result.enrichedContext.healthScore).toBeNull();
  });

  it('should handle multiple rapid inputs', () => {
    const manager = new MultimodalManager();
    const ctxInput = createMockContextInput();
    for (let i = 0; i < 10; i++) {
      const input = createMockTextInput(`test ${i}`);
      const result = manager.processInput(input, { aiAssistantContextInput: ctxInput });
      expect(result.status).toBe('completed');
    }
    expect(manager.getAnalytics().totalInputs).toBe(10);
  });

  it('should handle all intent types', () => {
    const manager = new MultimodalManager();
    const ctxInput = createMockContextInput();
    const testCases: { text: string; expectedIntent: string }[] = [
      { text: 'optimize my pc', expectedIntent: 'optimization' },
      { text: 'what is my health score', expectedIntent: 'explanation' },
      { text: 'predict future performance', expectedIntent: 'optimization' },
      { text: 'set a goal for improvement', expectedIntent: 'goal_management' },
      { text: 'generate a report', expectedIntent: 'reporting' },
      { text: 'recover from crash', expectedIntent: 'recovery' },
      { text: 'clean my system', expectedIntent: 'maintenance' },
      { text: 'simulate what if scenario', expectedIntent: 'planning' },
      { text: 'show me timeline', expectedIntent: 'explanation' },
      { text: 'compare plans versus each other', expectedIntent: 'comparison' },
    ];
    for (const tc of testCases) {
      const input = createMockTextInput(tc.text);
      const result = manager.processInput(input, { aiAssistantContextInput: ctxInput });
      expect(result.intent.type).toBe(tc.expectedIntent);
    }
  });

  it('should handle unknown modality gracefully', () => {
    const manager = new MultimodalManager();
    const input = createMockTextInput('test');
    input.modality = 'future_modality';
    const ctxInput = createMockContextInput();
    const result = manager.processInput(input, { aiAssistantContextInput: ctxInput });
    expect(result.status).toBe('completed');
  });
});

// ── Performance Tests ────────────────────────────────────────

describe('Performance Tests', () => {
  it('should route input under 50ms', () => {
    const registry = new ModalityRegistry();
    const config = createMultimodalConfiguration();
    const router = new InputRouter(registry, config);
    const input = createMockTextInput();
    const start = performance.now();
    router.route(input);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it('should normalize input under 100ms', () => {
    const config = createMultimodalConfiguration();
    const normalizer = new InputNormalizer(config);
    const input = createMockTextInput('Test text for normalization performance');
    const start = performance.now();
    normalizer.normalize(input);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it('should process input end-to-end under 500ms', () => {
    const manager = new MultimodalManager();
    const input = createMockTextInput('What is my health score?');
    const ctxInput = createMockContextInput(80);
    const start = performance.now();
    manager.processInput(input, { aiAssistantContextInput: ctxInput });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
  });
});

// ── Edge Cases ───────────────────────────────────────────────

describe('Edge Cases', () => {
  it('should handle very long text', () => {
    const manager = new MultimodalManager();
    const input = createMockTextInput('a'.repeat(50000));
    const ctxInput = createMockContextInput();
    const result = manager.processInput(input, { aiAssistantContextInput: ctxInput });
    expect(result.status).toBe('completed');
    expect(result.normalizedInput.text.length).toBeLessThanOrEqual(10000);
  });

  it('should handle special characters in text', () => {
    const manager = new MultimodalManager();
    const input = createMockTextInput('Hello! @#$%^&*() {}[]|"<>?');
    const ctxInput = createMockContextInput();
    const result = manager.processInput(input, { aiAssistantContextInput: ctxInput });
    expect(result.status).toBe('completed');
  });

  it('should handle unicode text', () => {
    const manager = new MultimodalManager();
    const input = createMockTextInput('你好世界 🌍 café');
    const ctxInput = createMockContextInput();
    const result = manager.processInput(input, { aiAssistantContextInput: ctxInput });
    expect(result.status).toBe('completed');
    expect(result.normalizedInput.text).toContain('你好世界');
  });

  it('should handle empty JSON object', () => {
    const manager = new MultimodalManager();
    const input = createMockJsonInput();
    input.contentReference.data = {};
    const ctxInput = createMockContextInput();
    const result = manager.processInput(input, { aiAssistantContextInput: ctxInput });
    expect(result.status).toBe('completed');
  });

  it('should handle log with no errors', () => {
    const manager = new MultimodalManager();
    const input = createMockLogInput();
    input.contentReference.data = '2024-01-15T10:30:00 [INFO] All good';
    const ctxInput = createMockContextInput();
    const result = manager.processInput(input, { aiAssistantContextInput: ctxInput });
    expect(result.status).toBe('completed');
  });

  it('should handle missing content reference data', () => {
    const manager = new MultimodalManager();
    const input = createMockTextInput();
    input.contentReference.data = null;
    const ctxInput = createMockContextInput();
    const result = manager.processInput(input, { aiAssistantContextInput: ctxInput });
    expect(result.status).toBe('completed');
  });
});
