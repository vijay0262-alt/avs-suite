/**
 * Multimodal AI Interaction Platform — Log Processor
 *
 * EPIC 5 PHASE A PART 6
 *
 * Processes log file inputs: application logs, system logs, crash logs,
 * optimization logs, maintenance logs. Uses provider/plugin architecture.
 */
import type {
  LogProcessingResult,
  LogType,
  LogEntry,
  LogPattern,
  LogProvider,
  MultimodalConfiguration,
} from './types';

export class LogProcessor {
  private _config: MultimodalConfiguration;
  private _provider: LogProvider | null;

  constructor(config: MultimodalConfiguration, provider?: LogProvider) {
    this._config = config;
    this._provider = provider ?? null;
  }

  updateConfig(config: MultimodalConfiguration): void {
    this._config = config;
  }

  setProvider(provider: LogProvider): void {
    this._provider = provider;
  }

  isAvailable(): boolean {
    return this._config.featureFlags.enableLogAnalysis && this._provider !== null && this._provider.available;
  }

  async parse(logData: unknown, logType: LogType): Promise<LogProcessingResult> {
    if (this.isAvailable()) {
      return this._provider!.parse(logData, logType);
    }
    return this._builtinParse(logData, logType);
  }

  async parseApplicationLog(logData: unknown): Promise<LogProcessingResult> {
    return this.parse(logData, 'application');
  }

  async parseSystemLog(logData: unknown): Promise<LogProcessingResult> {
    return this.parse(logData, 'system');
  }

  async parseCrashLog(logData: unknown): Promise<LogProcessingResult> {
    return this.parse(logData, 'crash');
  }

  async parseOptimizationLog(logData: unknown): Promise<LogProcessingResult> {
    return this.parse(logData, 'optimization');
  }

  async parseMaintenanceLog(logData: unknown): Promise<LogProcessingResult> {
    return this.parse(logData, 'maintenance');
  }

  private _builtinParse(logData: unknown, logType: LogType): LogProcessingResult {
    const text = typeof logData === 'string' ? logData : JSON.stringify(logData);
    const lines = text.split('\n').filter((l) => l.trim().length > 0);

    const errors: LogEntry[] = [];
    const warnings: LogEntry[] = [];
    const info: LogEntry[] = [];

    for (const line of lines) {
      const entry = this._parseLine(line);
      if (!entry) continue;
      const level = entry.level.toUpperCase();
      if (level === 'ERROR' || level === 'FATAL' || level === 'CRITICAL') {
        errors.push(entry);
      } else if (level === 'WARN' || level === 'WARNING') {
        warnings.push(entry);
      } else {
        info.push(entry);
      }
    }

    const patterns = this._detectPatterns(lines);

    const summary = this._generateSummary(logType, lines.length, errors.length, warnings.length, patterns);

    return {
      logType,
      totalEntries: lines.length,
      errors,
      warnings,
      info,
      patterns,
      summary,
      confidence: 0.7,
      futureMetadata: { provider: 'builtin' },
    };
  }

  private _parseLine(line: string): LogEntry | null {
    // Try ISO timestamp format
    let match = line.match(/^(\d{4}-\d{2}-\d{2}T?\d{2}:\d{2}:\d{2}[.\dZ]*)\s*\[(\w+)\]\s*(.+)$/);
    if (!match) {
      match = line.match(/^(\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2})\s+(\w+)\s+(.+)$/);
    }
    if (!match) {
      match = line.match(/^\[(\w+)\]\s*(.+)$/);
      if (match) {
        return {
          timestamp: new Date().toISOString(),
          level: match[1]!,
          message: match[2]!,
          source: 'unknown',
          futureMetadata: {},
        };
      }
      // Plain line — treat as info
      if (line.trim().length > 0) {
        return {
          timestamp: new Date().toISOString(),
          level: 'INFO',
          message: line.trim(),
          source: 'unknown',
          futureMetadata: {},
        };
      }
      return null;
    }
    return {
      timestamp: match[1]!,
      level: match[2]!,
      message: match[3]!,
      source: 'log',
      futureMetadata: {},
    };
  }

  private _detectPatterns(lines: string[]): LogPattern[] {
    const patternCounts: Map<string, number> = new Map();
    for (const line of lines) {
      // Normalize by removing timestamps and numbers
      const normalized = line.replace(/\d{4}-\d{2}-\d{2}T?\d{2}:\d{2}:\d{2}[.\dZ]*/g, 'TIMESTAMP').replace(/\b\d+\b/g, 'N');
      const key = normalized.substring(0, 80);
      patternCounts.set(key, (patternCounts.get(key) ?? 0) + 1);
    }
    const patterns: LogPattern[] = [];
    for (const [pattern, occurrences] of patternCounts) {
      if (occurrences >= 2) {
        const hasError = /error|fatal|critical/i.test(pattern);
        const hasWarn = /warn/i.test(pattern);
        patterns.push({
          pattern: pattern.substring(0, 100),
          occurrences,
          severity: hasError ? 'high' : hasWarn ? 'medium' : 'low',
          description: `Pattern occurred ${occurrences} times`,
          futureMetadata: {},
        });
      }
    }
    return patterns.sort((a, b) => b.occurrences - a.occurrences).slice(0, 10);
  }

  private _generateSummary(
    logType: LogType,
    total: number,
    errors: number,
    warnings: number,
    patterns: LogPattern[],
  ): string {
    const parts: string[] = [];
    parts.push(`Analyzed ${total} log entries (${logType}).`);
    if (errors > 0) parts.push(`Found ${errors} error(s).`);
    if (warnings > 0) parts.push(`Found ${warnings} warning(s).`);
    if (patterns.length > 0) parts.push(`Detected ${patterns.length} recurring pattern(s).`);
    if (errors === 0 && warnings === 0) parts.push('No errors or warnings detected.');
    return parts.join(' ');
  }
}
