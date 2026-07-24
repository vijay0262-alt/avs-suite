/**
 * Structured Logging (Part 3) — Production Readiness Framework.
 *
 * Centralized logging with structured fields:
 *   - Timestamp, Module, Action, Severity, Duration, Result, Error details
 *
 * Log levels: Debug, Information, Warning, Error
 *
 * Logging is configurable — verbose logging can be enabled for
 * troubleshooting without affecting normal users.
 */

// ── Log Levels ──────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warning' | 'error';

export const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warning: 2,
  error: 3,
};

export const LOG_LEVEL_LABELS: Record<LogLevel, string> = {
  debug: 'DEBUG',
  info: 'INFO',
  warning: 'WARN',
  error: 'ERROR',
};

// ── Log Entry ───────────────────────────────────────────────────────

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  module: string;
  action: string;
  message: string;
  durationMs?: number;
  result?: 'success' | 'failure' | 'partial';
  errorDetails?: string;
  /** Additional structured data. */
  data?: Record<string, unknown>;
}

type LogListener = (entry: LogEntry) => void;

// ── Logger Configuration ────────────────────────────────────────────

export interface LoggerConfig {
  /** Minimum level to log. Messages below this level are discarded. */
  minLevel: LogLevel;
  /** Maximum number of log entries to keep in memory. */
  maxEntries: number;
  /** Whether to also write to console. */
  consoleOutput: boolean;
  /** Whether to include stack traces in error logs. */
  includeStackTraces: boolean;
}

const DEFAULT_CONFIG: LoggerConfig = {
  minLevel: 'info',
  maxEntries: 1000,
  consoleOutput: true,
  includeStackTraces: true,
};

// ── Logger Service ──────────────────────────────────────────────────

class LoggerServiceImpl {
  private entries: LogEntry[] = [];
  private listeners = new Set<LogListener>();
  private config: LoggerConfig = { ...DEFAULT_CONFIG };

  /**
   * Update the logger configuration.
   * Enables verbose logging for troubleshooting without affecting normal users.
   */
  configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Enable debug-level logging for troubleshooting.
   */
  enableVerbose(): void {
    this.config.minLevel = 'debug';
  }

  /**
   * Reset to default configuration (info level).
   */
  resetToDefault(): void {
    this.config = { ...DEFAULT_CONFIG };
  }

  /**
   * Get the current configuration.
   */
  getConfig(): LoggerConfig {
    return { ...this.config };
  }

  // ── Logging Methods ───────────────────────────────────────────────

  debug(module: string, action: string, message: string, options?: Omit<LogEntry, 'id' | 'timestamp' | 'level' | 'module' | 'action' | 'message'>): void {
    this.log('debug', module, action, message, options);
  }

  info(module: string, action: string, message: string, options?: Omit<LogEntry, 'id' | 'timestamp' | 'level' | 'module' | 'action' | 'message'>): void {
    this.log('info', module, action, message, options);
  }

  warning(module: string, action: string, message: string, options?: Omit<LogEntry, 'id' | 'timestamp' | 'level' | 'module' | 'action' | 'message'>): void {
    this.log('warning', module, action, message, options);
  }

  error(module: string, action: string, message: string, options?: Omit<LogEntry, 'id' | 'timestamp' | 'level' | 'module' | 'action' | 'message'>): void {
    this.log('error', module, action, message, options);
  }

  /**
   * Log an operation with automatic timing.
   */
  async logOperation<T>(
    module: string,
    action: string,
    operation: () => Promise<T>,
    options?: { message?: string },
  ): Promise<T> {
    const startedAt = Date.now();
    const message = options?.message ?? action;
    try {
      const result = await operation();
      this.log('info', module, action, message, {
        durationMs: Date.now() - startedAt,
        result: 'success',
      });
      return result;
    } catch (err) {
      this.log('error', module, action, message, {
        durationMs: Date.now() - startedAt,
        result: 'failure',
        errorDetails: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  // ── Core Log Method ───────────────────────────────────────────────

  private log(
    level: LogLevel,
    module: string,
    action: string,
    message: string,
    options?: Omit<LogEntry, 'id' | 'timestamp' | 'level' | 'module' | 'action' | 'message'>,
  ): void {
    // Check minimum level
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.config.minLevel]) {
      return;
    }

    const entry: LogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      level,
      module,
      action,
      message,
      ...options,
    };

    this.entries.unshift(entry);
    if (this.entries.length > this.config.maxEntries) {
      this.entries = this.entries.slice(0, this.config.maxEntries);
    }

    // Console output
    if (this.config.consoleOutput) {
      const prefix = `[${LOG_LEVEL_LABELS[level]}] [${module}] [${action}]`;
      if (level === 'error') {
        console.error(prefix, message, options?.errorDetails || '');
      } else if (level === 'warning') {
        console.warn(prefix, message);
      } else {
        console.log(prefix, message);
      }
    }

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch (err) {
        console.error('[Logger] listener error:', err);
      }
    }
  }

  // ── Queries ───────────────────────────────────────────────────────

  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  getRecentEntries(count: number): LogEntry[] {
    return this.entries.slice(0, count);
  }

  getEntriesByLevel(level: LogLevel): LogEntry[] {
    return this.entries.filter((e) => e.level === level);
  }

  getEntriesByModule(module: string): LogEntry[] {
    return this.entries.filter((e) => e.module === module);
  }

  getEntriesByAction(action: string): LogEntry[] {
    return this.entries.filter((e) => e.action === action);
  }

  getEntryCount(): number {
    return this.entries.length;
  }

  getErrorCount(): number {
    return this.entries.filter((e) => e.level === 'error').length;
  }

  getWarningCount(): number {
    return this.entries.filter((e) => e.level === 'warning').length;
  }

  // ── Subscription ──────────────────────────────────────────────────

  subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  // ── Maintenance ───────────────────────────────────────────────────

  clear(): void {
    this.entries = [];
    this.listeners.clear();
  }

  /**
   * Export logs as a JSON string for support diagnostics.
   */
  exportLogs(): string {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      config: this.config,
      entryCount: this.entries.length,
      entries: this.entries,
    }, null, 2);
  }
}

export const logger = new LoggerServiceImpl();

// ── Module-specific Logger Helper ───────────────────────────────────

/**
 * Create a logger scoped to a specific module.
 * Automatically includes the module name in all log entries.
 */
export function createModuleLogger(moduleName: string) {
  return {
    debug: (action: string, message: string, options?: Omit<LogEntry, 'id' | 'timestamp' | 'level' | 'module' | 'action' | 'message'>) =>
      logger.debug(moduleName, action, message, options),
    info: (action: string, message: string, options?: Omit<LogEntry, 'id' | 'timestamp' | 'level' | 'module' | 'action' | 'message'>) =>
      logger.info(moduleName, action, message, options),
    warning: (action: string, message: string, options?: Omit<LogEntry, 'id' | 'timestamp' | 'level' | 'module' | 'action' | 'message'>) =>
      logger.warning(moduleName, action, message, options),
    error: (action: string, message: string, options?: Omit<LogEntry, 'id' | 'timestamp' | 'level' | 'module' | 'action' | 'message'>) =>
      logger.error(moduleName, action, message, options),
    logOperation: <T>(action: string, operation: () => Promise<T>, options?: { message?: string }) =>
      logger.logOperation(moduleName, action, operation, options),
  };
}
