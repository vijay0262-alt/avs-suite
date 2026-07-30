/**
 * Multimodal AI Interaction Platform — Input Router
 *
 * EPIC 5 PHASE A PART 6
 *
 * Routes incoming inputs to the appropriate processor based on modality
 * detection. Performance target: routing under 50ms.
 */
import type {
  MultimodalInput,
  InputModality,
  ModalityDefinition,
  MultimodalConfiguration,
} from './types';
import { ModalityRegistry } from './modalityRegistry';

export interface RoutingResult {
  modality: InputModality;
  processorId: string;
  confidence: number;
  detectionMethod: 'explicit' | 'inferred' | 'fallback';
  futureMetadata: Record<string, unknown>;
}

export class InputRouter {
  private _registry: ModalityRegistry;
  private _config: MultimodalConfiguration;

  constructor(registry: ModalityRegistry, config: MultimodalConfiguration) {
    this._registry = registry;
    this._config = config;
  }

  updateConfig(config: MultimodalConfiguration): void {
    this._config = config;
  }

  route(input: MultimodalInput): RoutingResult {
    const start = Date.now();

    // If modality is explicitly set and supported, use it
    if (input.modality !== 'future_modality' && this._isModalitySupported(input.modality)) {
      const def = this._registry.get(input.modality);
      if (def && def.enabled) {
        return {
          modality: input.modality,
          processorId: def.processorId,
          confidence: 1.0,
          detectionMethod: 'explicit',
          futureMetadata: { routingTimeMs: Date.now() - start },
        };
      }
    }

    // Infer modality from content and metadata
    const inferred = this._detectModality(input);
    if (inferred) {
      return inferred;
    }

    // Fallback to text
    return {
      modality: 'text',
      processorId: 'builtin_text',
      confidence: 0.3,
      detectionMethod: 'fallback',
      futureMetadata: { routingTimeMs: Date.now() - start },
    };
  }

  detectModality(input: MultimodalInput): InputModality {
    return this.route(input).modality;
  }

  private _isModalitySupported(modality: InputModality): boolean {
    return this._config.supportedModalities.includes(modality);
  }

  private _detectModality(input: MultimodalInput): RoutingResult | null {
    const mimeType = input.metadata.mimeType;
    const contentRef = input.contentReference;

    // Detect by mime type
    if (mimeType) {
      if (mimeType.startsWith('audio/')) {
        return this._createResult('voice', 'builtin_voice', 0.9, 'inferred');
      }
      if (mimeType.startsWith('image/')) {
        const modality: InputModality = input.source === 'screenshot_capture' ? 'screenshot' : 'image';
        return this._createResult(modality, 'builtin_image', 0.9, 'inferred');
      }
      if (mimeType === 'application/json') {
        return this._createResult('json', 'builtin_text', 0.85, 'inferred');
      }
      if (mimeType.startsWith('text/')) {
        const text = this._extractText(contentRef.data);
        if (text && this._looksLikeLog(text)) {
          return this._createResult('system_log', 'builtin_log', 0.8, 'inferred');
        }
        return this._createResult('text', 'builtin_text', 0.85, 'inferred');
      }
    }

    // Detect by source
    if (input.source === 'voice_stream') {
      return this._createResult('voice', 'builtin_voice', 0.95, 'inferred');
    }
    if (input.source === 'screenshot_capture') {
      return this._createResult('screenshot', 'builtin_image', 0.95, 'inferred');
    }

    // Detect by filename in metadata tags
    const tags = input.metadata.tags;
    if (tags.some((t) => t.endsWith('.log') || t.includes('log'))) {
      return this._createResult('system_log', 'builtin_log', 0.75, 'inferred');
    }
    if (tags.some((t) => t.endsWith('.json'))) {
      return this._createResult('json', 'builtin_text', 0.75, 'inferred');
    }
    if (tags.some((t) => t.endsWith('.png') || t.endsWith('.jpg') || t.endsWith('.jpeg'))) {
      return this._createResult('image', 'builtin_image', 0.75, 'inferred');
    }

    // Try text content
    const text = this._extractText(contentRef.data);
    if (text) {
      if (this._looksLikeLog(text)) {
        return this._createResult('system_log', 'builtin_log', 0.7, 'inferred');
      }
      if (this._looksLikeJson(text)) {
        return this._createResult('json', 'builtin_text', 0.7, 'inferred');
      }
      return this._createResult('text', 'builtin_text', 0.6, 'inferred');
    }

    return null;
  }

  private _createResult(
    modality: InputModality,
    processorId: string,
    confidence: number,
    method: 'explicit' | 'inferred' | 'fallback',
  ): RoutingResult {
    const def = this._registry.get(modality);
    const actualProcessorId = def?.processorId ?? processorId;
    return {
      modality,
      processorId: actualProcessorId,
      confidence,
      detectionMethod: method,
      futureMetadata: {},
    };
  }

  private _extractText(data: unknown): string | null {
    if (typeof data === 'string') return data;
    if (data && typeof data === 'object' && 'text' in data && typeof (data as Record<string, unknown>).text === 'string') {
      return (data as Record<string, string>).text ?? null;
    }
    return null;
  }

  private _looksLikeLog(text: string): boolean {
    const logPatterns = [
      /\d{4}-\d{2}-\d{2}.*\[(INFO|WARN|ERROR|DEBUG)\]/i,
      /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/i,
      /\[ERROR\]|\[WARN\]|\[INFO\]|\[DEBUG\]/i,
      /timestamp.*level.*message/i,
    ];
    return logPatterns.some((p) => p.test(text));
  }

  private _looksLikeJson(text: string): boolean {
    const trimmed = text.trim();
    return (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
           (trimmed.startsWith('[') && trimmed.endsWith(']'));
  }

  getRoutingTargetMs(): number {
    return this._config.performanceTargets.routingTargetMs;
  }
}
