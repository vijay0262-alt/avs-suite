/**
 * Multimodal AI Interaction Platform — Image Processor
 *
 * EPIC 5 PHASE A PART 6
 *
 * Processes image inputs: screenshot analysis, UI detection,
 * health visualization, chart understanding. Uses provider/plugin architecture.
 */
import type {
  ImageProcessingResult,
  ImageAnalysisType,
  ImageProvider,
  MultimodalConfiguration,
  DetectedElement,
} from './types';

export class ImageProcessor {
  private _config: MultimodalConfiguration;
  private _provider: ImageProvider | null;

  constructor(config: MultimodalConfiguration, provider?: ImageProvider) {
    this._config = config;
    this._provider = provider ?? null;
  }

  updateConfig(config: MultimodalConfiguration): void {
    this._config = config;
  }

  setProvider(provider: ImageProvider): void {
    this._provider = provider;
  }

  isAvailable(): boolean {
    return this._config.featureFlags.enableImage && this._provider !== null && this._provider.available;
  }

  async analyze(image: unknown, analysisType: ImageAnalysisType): Promise<ImageProcessingResult> {
    if (this.isAvailable()) {
      return this._provider!.analyze(image, analysisType);
    }
    return this._builtinAnalyze(image, analysisType);
  }

  async analyzeScreenshot(image: unknown): Promise<ImageProcessingResult> {
    return this.analyze(image, 'screenshot_analysis');
  }

  async detectUI(image: unknown): Promise<ImageProcessingResult> {
    return this.analyze(image, 'ui_detection');
  }

  async analyzeHealthVisualization(image: unknown): Promise<ImageProcessingResult> {
    return this.analyze(image, 'health_visualization');
  }

  async understandChart(image: unknown): Promise<ImageProcessingResult> {
    return this.analyze(image, 'chart_understanding');
  }

  private _builtinAnalyze(image: unknown, analysisType: ImageAnalysisType): ImageProcessingResult {
    const data = image as Record<string, unknown> | null;
    const description = this._generateDescription(data, analysisType);
    const elements = this._extractElements(data);
    const extractedText = this._extractText(data);

    return {
      analysisType,
      description,
      detectedElements: elements,
      extractedText,
      confidence: 0.6,
      futureMetadata: { provider: 'builtin' },
    };
  }

  private _generateDescription(data: Record<string, unknown> | null, analysisType: ImageAnalysisType): string {
    if (!data) return `No image data available for ${analysisType}`;
    if (typeof data.description === 'string') return data.description;
    if (typeof data.alt === 'string') return data.alt;
    if (typeof data.caption === 'string') return data.caption;
    return `Image analyzed as ${analysisType}`;
  }

  private _extractElements(data: Record<string, unknown> | null): DetectedElement[] {
    if (!data) return [];
    if (Array.isArray(data.elements)) {
      return data.elements as DetectedElement[];
    }
    if (Array.isArray(data.detectedObjects)) {
      return (data.detectedObjects as Record<string, unknown>[]).map((obj, i) => ({
        type: String(obj.type ?? 'unknown'),
        label: String(obj.label ?? `element_${i}`),
        boundingBox: (obj.boundingBox as DetectedElement['boundingBox']) ?? null,
        confidence: typeof obj.confidence === 'number' ? obj.confidence : 0.5,
        futureMetadata: {},
      }));
    }
    return [];
  }

  private _extractText(data: Record<string, unknown> | null): string | null {
    if (!data) return null;
    if (typeof data.text === 'string') return data.text;
    if (typeof data.ocr === 'string') return data.ocr;
    if (typeof data.extractedText === 'string') return data.extractedText;
    return null;
  }
}
