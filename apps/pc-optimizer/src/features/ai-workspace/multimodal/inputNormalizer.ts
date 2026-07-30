/**
 * Multimodal AI Interaction Platform — Input Normalizer
 *
 * EPIC 5 PHASE A PART 6
 *
 * Normalizes all input modalities into a common structured format.
 * Performance target: normalization under 100ms.
 */
import type {
  MultimodalInput,
  NormalizedInput,
  NormalizationWarning,
  MultimodalConfiguration,
  CopilotEntity,
} from './types';
import { generateNormalizedInputId } from './types';

export class InputNormalizer {
  private _config: MultimodalConfiguration;

  constructor(config: MultimodalConfiguration) {
    this._config = config;
  }

  updateConfig(config: MultimodalConfiguration): void {
    this._config = config;
  }

  normalize(input: MultimodalInput): NormalizedInput {
    const start = Date.now();
    const warnings: NormalizationWarning[] = [];

    let text = '';
    let extractedData: Record<string, unknown> = {};
    const confidence = input.metadata.confidence;

    switch (input.modality) {
      case 'text':
        text = this._normalizeText(input, warnings);
        extractedData = this._extractFromText(text);
        break;
      case 'voice':
        text = this._normalizeVoice(input, warnings);
        extractedData = this._extractFromText(text);
        break;
      case 'screenshot':
      case 'image':
        text = this._normalizeImage(input, warnings);
        extractedData = this._extractFromImage(input);
        break;
      case 'system_log':
      case 'diagnostic_bundle':
        text = this._normalizeLog(input, warnings);
        extractedData = this._extractFromLog(text);
        break;
      case 'report':
        text = this._normalizeDocument(input, warnings);
        extractedData = this._extractFromDocument(input);
        break;
      case 'json':
        text = this._normalizeJson(input, warnings);
        extractedData = this._extractFromJson(input);
        break;
      default:
        text = this._normalizeUnknown(input, warnings);
        break;
    }

    // Validate text length
    if (text.length > this._config.validationRules.maxTextLength) {
      warnings.push({
        code: 'TEXT_TRUNCATED',
        message: `Text exceeds max length of ${this._config.validationRules.maxTextLength}, truncated`,
        field: 'text',
      });
      text = text.substring(0, this._config.validationRules.maxTextLength);
    }

    // Check confidence threshold
    if (confidence < this._config.validationRules.minConfidenceThreshold) {
      warnings.push({
        code: 'LOW_CONFIDENCE',
        message: `Confidence ${confidence} below threshold ${this._config.validationRules.minConfidenceThreshold}`,
        field: 'confidence',
      });
    }

    const entities = this._extractEntities(text);

    return {
      id: generateNormalizedInputId(),
      inputId: input.id,
      modality: input.modality,
      text,
      entities,
      language: input.language,
      confidence,
      extractedData,
      warnings,
      futureMetadata: { normalizationTimeMs: Date.now() - start },
    };
  }

  private _normalizeText(input: MultimodalInput, warnings: NormalizationWarning[]): string {
    const data = input.contentReference.data;
    if (typeof data === 'string') return data.trim();
    if (data && typeof data === 'object' && 'text' in data) {
      return String((data as Record<string, unknown>).text ?? '').trim();
    }
    warnings.push({ code: 'NO_TEXT_CONTENT', message: 'No text content found in input', field: 'contentReference.data' });
    return '';
  }

  private _normalizeVoice(input: MultimodalInput, warnings: NormalizationWarning[]): string {
    const data = input.contentReference.data;
    if (typeof data === 'string') return data.trim();
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      if ('transcript' in record && typeof record.transcript === 'string') {
        return record.transcript.trim();
      }
      if ('text' in record && typeof record.text === 'string') {
        return record.text.trim();
      }
    }
    warnings.push({ code: 'NO_VOICE_TRANSCRIPT', message: 'No voice transcript found', field: 'contentReference.data' });
    return '';
  }

  private _normalizeImage(input: MultimodalInput, warnings: NormalizationWarning[]): string {
    const data = input.contentReference.data;
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      if ('description' in record && typeof record.description === 'string') {
        return record.description.trim();
      }
      if ('extractedText' in record && typeof record.extractedText === 'string') {
        return record.extractedText.trim();
      }
    }
    if (typeof data === 'string') return data.trim();
    warnings.push({ code: 'NO_IMAGE_DESCRIPTION', message: 'No image description or extracted text found', field: 'contentReference.data' });
    return `[Image input from ${input.source}]`;
  }

  private _normalizeLog(input: MultimodalInput, warnings: NormalizationWarning[]): string {
    const data = input.contentReference.data;
    if (typeof data === 'string') return data.trim();
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      if ('content' in record && typeof record.content === 'string') {
        return record.content.trim();
      }
      if ('text' in record && typeof record.text === 'string') {
        return record.text.trim();
      }
      try {
        return JSON.stringify(data);
      } catch {
        // ignore
      }
    }
    warnings.push({ code: 'NO_LOG_CONTENT', message: 'No log content found', field: 'contentReference.data' });
    return '';
  }

  private _normalizeDocument(input: MultimodalInput, warnings: NormalizationWarning[]): string {
    const data = input.contentReference.data;
    if (typeof data === 'string') return data.trim();
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      if ('content' in record && typeof record.content === 'string') {
        return record.content.trim();
      }
      if ('text' in record && typeof record.text === 'string') {
        return record.text.trim();
      }
      if ('summary' in record && typeof record.summary === 'string') {
        return record.summary.trim();
      }
    }
    warnings.push({ code: 'NO_DOCUMENT_CONTENT', message: 'No document content found', field: 'contentReference.data' });
    return '';
  }

  private _normalizeJson(input: MultimodalInput, warnings: NormalizationWarning[]): string {
    const data = input.contentReference.data;
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        return JSON.stringify(parsed, null, 2);
      } catch {
        warnings.push({ code: 'INVALID_JSON', message: 'Input is not valid JSON', field: 'contentReference.data' });
        return data;
      }
    }
    if (data && typeof data === 'object') {
      try {
        return JSON.stringify(data, null, 2);
      } catch {
        warnings.push({ code: 'JSON_STRINGIFY_FAILED', message: 'Failed to serialize JSON', field: 'contentReference.data' });
        return '';
      }
    }
    warnings.push({ code: 'NO_JSON_DATA', message: 'No JSON data found', field: 'contentReference.data' });
    return '';
  }

  private _normalizeUnknown(input: MultimodalInput, warnings: NormalizationWarning[]): string {
    warnings.push({ code: 'UNKNOWN_MODALITY', message: `Unknown modality: ${input.modality}`, field: 'modality' });
    const data = input.contentReference.data;
    if (typeof data === 'string') return data;
    if (data && typeof data === 'object') {
      try {
        return JSON.stringify(data);
      } catch {
        return String(data);
      }
    }
    return String(data ?? '');
  }

  private _extractFromText(text: string): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    // Extract keywords
    const keywords = text.match(/\b\w{4,}\b/g);
    if (keywords) data.keywords = Array.from(new Set(keywords)).slice(0, 20);
    // Extract numbers
    const numbers = text.match(/\b\d+(?:\.\d+)?\b/g);
    if (numbers) data.numbers = numbers.slice(0, 10);
    return data;
  }

  private _extractFromImage(input: MultimodalInput): Record<string, unknown> {
    const data = input.contentReference.data;
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      return {
        elements: record.elements ?? [],
        dimensions: record.dimensions ?? null,
        format: record.format ?? null,
      };
    }
    return {};
  }

  private _extractFromLog(text: string): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    const errorCount = (text.match(/\[ERROR\]|ERROR|error/gi) ?? []).length;
    const warnCount = (text.match(/\[WARN\]|WARN|warning/gi) ?? []).length;
    const infoCount = (text.match(/\[INFO\]|INFO/gi) ?? []).length;
    data.errorCount = errorCount;
    data.warningCount = warnCount;
    data.infoCount = infoCount;
    data.totalLines = text.split('\n').length;
    return data;
  }

  private _extractFromDocument(input: MultimodalInput): Record<string, unknown> {
    const data = input.contentReference.data;
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      return {
        title: record.title ?? null,
        sections: record.sections ?? [],
        metadata: record.metadata ?? {},
      };
    }
    return {};
  }

  private _extractFromJson(input: MultimodalInput): Record<string, unknown> {
    const data = input.contentReference.data;
    if (typeof data === 'string') {
      try {
        return { parsed: JSON.parse(data) };
      } catch {
        return { raw: data };
      }
    }
    if (data && typeof data === 'object') {
      return { parsed: data };
    }
    return {};
  }

  private _extractEntities(text: string): CopilotEntity[] {
    const entities: CopilotEntity[] = [];
    // Extract health score references
    const healthMatch = text.match(/health\s*(?:score)?[:\s]+(\d+)/i);
    if (healthMatch) {
      entities.push({
        type: 'health_score',
        id: `entity_health_${Date.now().toString(36)}`,
        name: 'health_score',
        value: parseInt(healthMatch[1]!, 10),
        confidence: 0.8,
        futureMetadata: {},
      });
    }
    // Extract optimization references
    if (/optimiz/i.test(text)) {
      entities.push({
        type: 'optimization_plan',
        id: `entity_opt_${Date.now().toString(36)}`,
        name: 'optimization',
        value: 'optimize',
        confidence: 0.7,
        futureMetadata: {},
      });
    }
    return entities;
  }

  getNormalizationTargetMs(): number {
    return this._config.performanceTargets.normalizationTargetMs;
  }
}
