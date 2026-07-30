/**
 * Multimodal AI Interaction Platform — Document Processor
 *
 * EPIC 5 PHASE A PART 6
 *
 * Processes document inputs: report review, configuration review,
 * export analysis. Uses provider/plugin architecture.
 */
import type {
  DocumentProcessingResult,
  DocumentType,
  DocumentSection,
  DocumentProvider,
  MultimodalConfiguration,
} from './types';

export class DocumentProcessor {
  private _config: MultimodalConfiguration;
  private _provider: DocumentProvider | null;

  constructor(config: MultimodalConfiguration, provider?: DocumentProvider) {
    this._config = config;
    this._provider = provider ?? null;
  }

  updateConfig(config: MultimodalConfiguration): void {
    this._config = config;
  }

  setProvider(provider: DocumentProvider): void {
    this._provider = provider;
  }

  isAvailable(): boolean {
    return this._config.featureFlags.enableDocuments && this._provider !== null && this._provider.available;
  }

  async process(document: unknown, documentType: DocumentType): Promise<DocumentProcessingResult> {
    if (this.isAvailable()) {
      return this._provider!.process(document, documentType);
    }
    return this._builtinProcess(document, documentType);
  }

  async reviewReport(document: unknown): Promise<DocumentProcessingResult> {
    return this.process(document, 'report');
  }

  async reviewConfiguration(document: unknown): Promise<DocumentProcessingResult> {
    return this.process(document, 'configuration');
  }

  async analyzeExport(document: unknown): Promise<DocumentProcessingResult> {
    return this.process(document, 'export');
  }

  private _builtinProcess(document: unknown, documentType: DocumentType): DocumentProcessingResult {
    const data = document as Record<string, unknown> | string | null;
    const text = typeof data === 'string' ? data : (data as Record<string, unknown> | null);
    const title = this._extractTitle(text);
    const sections = this._extractSections(text);
    const summary = this._generateSummary(documentType, title, sections);
    const extractedData = this._extractData(text);

    return {
      documentType,
      title,
      summary,
      sections,
      extractedData,
      confidence: 0.65,
      futureMetadata: { provider: 'builtin' },
    };
  }

  private _extractTitle(data: unknown): string {
    if (typeof data === 'string') {
      const firstLine = data.split('\n').find((l) => l.trim().length > 0);
      if (firstLine) return firstLine.trim().replace(/^#+\s*/, '');
      return 'Untitled Document';
    }
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      if (typeof record.title === 'string') return record.title;
      if (typeof record.name === 'string') return record.name;
    }
    return 'Untitled Document';
  }

  private _extractSections(data: unknown): DocumentSection[] {
    if (typeof data === 'string') {
      const lines = data.split('\n');
      const sections: DocumentSection[] = [];
      let currentTitle = 'Content';
      let currentContent: string[] = [];
      let order = 0;

      for (const line of lines) {
        const headerMatch = line.match(/^#+\s*(.+)$/);
        if (headerMatch) {
          if (currentContent.length > 0) {
            sections.push({
              title: currentTitle,
              content: currentContent.join('\n').trim(),
              order: order++,
              futureMetadata: {},
            });
          }
          currentTitle = headerMatch[1]!;
          currentContent = [];
        } else {
          currentContent.push(line);
        }
      }
      if (currentContent.length > 0) {
        sections.push({
          title: currentTitle,
          content: currentContent.join('\n').trim(),
          order: order++,
          futureMetadata: {},
        });
      }
      return sections;
    }
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      if (Array.isArray(record.sections)) {
        return record.sections as DocumentSection[];
      }
    }
    return [];
  }

  private _extractData(data: unknown): Record<string, unknown> {
    if (data && typeof data === 'object') {
      const record = data as Record<string, unknown>;
      return {
        metadata: record.metadata ?? {},
        fields: Object.keys(record).filter((k) => !['sections', 'content', 'text'].includes(k)),
      };
    }
    if (typeof data === 'string') {
      return {
        wordCount: data.split(/\s+/).length,
        lineCount: data.split('\n').length,
      };
    }
    return {};
  }

  private _generateSummary(documentType: DocumentType, title: string, sections: DocumentSection[]): string {
    const parts: string[] = [];
    parts.push(`Document "${title}" (${documentType}).`);
    if (sections.length > 0) {
      parts.push(`Contains ${sections.length} section(s): ${sections.map((s) => s.title).join(', ')}.`);
    }
    return parts.join(' ');
  }
}
