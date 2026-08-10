/**
 * LogService — structured logging for AVS Shield.
 *
 * Every unexpected exception contains:
 *   - Timestamp
 *   - Module
 *   - Operation
 *   - Exception message
 *   - Recovery attempt (if any)
 *
 * Log levels: INFO < WARNING < ERROR < CRITICAL
 *
 * Logs are written to:
 *   1. Console (development)
 *   2. In-memory ring buffer (for diagnostics export)
 *
 * The ring buffer keeps the last 500 entries, preventing unbounded memory growth.
 */

export type LogLevel = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  operation: string;
  message: string;
  exception?: string;
  recoveryAttempt?: string;
  data?: Record<string, unknown>;
}

const MAX_BUFFER_SIZE = 500;

class LogServiceImpl {
  private buffer: LogEntry[] = [];
  private listeners = new Set<(entry: LogEntry) => void>();
  private minLevel: LogLevel = 'INFO';

  private readonly levelOrder: Record<LogLevel, number> = {
    INFO: 0,
    WARNING: 1,
    ERROR: 2,
    CRITICAL: 3,
  };

  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelOrder[level] >= this.levelOrder[this.minLevel];
  }

  private addEntry(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) return;

    this.buffer.push(entry);
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      this.buffer.shift();
    }

    // Console output
    const prefix = `[${entry.timestamp}] [${entry.level}] [${entry.module}:${entry.operation}]`;
    const fullMessage = `${prefix} ${entry.message}${entry.exception ? ` — ${entry.exception}` : ''}`;

    switch (entry.level) {
      case 'INFO':
        console.info(fullMessage);
        break;
      case 'WARNING':
        console.warn(fullMessage);
        break;
      case 'ERROR':
      case 'CRITICAL':
        console.error(fullMessage);
        break;
    }

    // Notify listeners (for real-time log viewer)
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch {
        // listener errors must not affect logging
      }
    }
  }

  info(message: string, module = 'system', operation = 'unknown', data?: Record<string, unknown>): void {
    this.addEntry({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      module,
      operation,
      message,
      data,
    });
  }

  warning(message: string, module = 'system', operation = 'unknown', data?: Record<string, unknown>): void {
    this.addEntry({
      timestamp: new Date().toISOString(),
      level: 'WARNING',
      module,
      operation,
      message,
      data,
    });
  }

  error(
    message: string,
    module = 'system',
    operation = 'unknown',
    exception?: Error,
    recoveryAttempt?: string,
    data?: Record<string, unknown>,
  ): void {
    this.addEntry({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      module,
      operation,
      message,
      exception: exception ? `${exception.name}: ${exception.message}` : undefined,
      recoveryAttempt,
      data,
    });
  }

  critical(
    message: string,
    module = 'system',
    operation = 'unknown',
    exception?: Error,
    recoveryAttempt?: string,
    data?: Record<string, unknown>,
  ): void {
    this.addEntry({
      timestamp: new Date().toISOString(),
      level: 'CRITICAL',
      module,
      operation,
      message,
      exception: exception ? `${exception.name}: ${exception.message}` : undefined,
      recoveryAttempt,
      data,
    });
  }

  getEntries(): LogEntry[] {
    return [...this.buffer];
  }

  getEntriesByLevel(level: LogLevel): LogEntry[] {
    return this.buffer.filter((e) => e.level === level);
  }

  getEntriesByModule(module: string): LogEntry[] {
    return this.buffer.filter((e) => e.module === module);
  }

  clear(): void {
    this.buffer = [];
  }

  subscribe(listener: (entry: LogEntry) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Export all log entries as a formatted string for diagnostics. */
  export(): string {
    const header = [
      'AVS Shield — Structured Log Export',
      '==================================',
      `Exported: ${new Date().toISOString()}`,
      `Entries: ${this.buffer.length}`,
      '',
    ].join('\n');

    const body = this.buffer
      .map((e) => {
        const parts = [
          `[${e.timestamp}] [${e.level}] [${e.module}:${e.operation}]`,
          `  ${e.message}`,
        ];
        if (e.exception) parts.push(`  Exception: ${e.exception}`);
        if (e.recoveryAttempt) parts.push(`  Recovery: ${e.recoveryAttempt}`);
        if (e.data) parts.push(`  Data: ${JSON.stringify(e.data)}`);
        return parts.join('\n');
      })
      .join('\n\n');

    return `${header}\n${body}\n\n--- End of Log ---`;
  }
}

export const log = new LogServiceImpl();
export type { LogServiceImpl };
