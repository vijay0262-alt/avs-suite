/**
 * Centralized Error Handling (Part 1) — Production Readiness Framework.
 *
 * All modules report errors through this common service. Errors are
 * categorized by severity and the application continues running
 * whenever safe to do so.
 *
 * Error categories:
 *   - Warning: Non-critical issue, operation can continue
 *   - Recoverable: Operation failed but can be retried
 *   - Critical: Operation failed, module should stop
 *   - UserActionRequired: User must take action (e.g., activate license)
 *   - InternalError: Unexpected error, should be reported
 */

import type { ModuleId } from '../health/HealthContribution';

// ── Error Categories ────────────────────────────────────────────────

export type ErrorCategory =
  | 'warning'
  | 'recoverable'
  | 'critical'
  | 'user_action_required'
  | 'internal_error';

export interface ErrorSeverityConfig {
  label: string;
  /** Whether the application should continue running. */
  shouldContinue: boolean;
  /** Whether the module should be marked as error. */
  shouldMarkModuleError: boolean;
  /** Whether this error should be reported to diagnostics. */
  shouldReport: boolean;
}

export const ERROR_SEVERITY_CONFIG: Record<ErrorCategory, ErrorSeverityConfig> = {
  warning: {
    label: 'Warning',
    shouldContinue: true,
    shouldMarkModuleError: false,
    shouldReport: true,
  },
  recoverable: {
    label: 'Recoverable',
    shouldContinue: true,
    shouldMarkModuleError: true,
    shouldReport: true,
  },
  critical: {
    label: 'Critical',
    shouldContinue: true,
    shouldMarkModuleError: true,
    shouldReport: true,
  },
  user_action_required: {
    label: 'User Action Required',
    shouldContinue: true,
    shouldMarkModuleError: false,
    shouldReport: true,
  },
  internal_error: {
    label: 'Internal Error',
    shouldContinue: true,
    shouldMarkModuleError: true,
    shouldReport: true,
  },
};

// ── Error Record ────────────────────────────────────────────────────

export interface AppError {
  id: string;
  timestamp: string;
  category: ErrorCategory;
  moduleId?: ModuleId;
  moduleName?: string;
  action: string;
  message: string;
  stack?: string;
  durationMs?: number;
  /** Whether the application continued after this error. */
  continued: boolean;
}

type ErrorListener = (error: AppError) => void;

// ── Error Handler Service ───────────────────────────────────────────

class ErrorHandlerServiceImpl {
  private errors: AppError[] = [];
  private listeners = new Set<ErrorListener>();
  private maxErrors = 500;

  /**
   * Report an error through the centralized error handling framework.
   * The application continues running whenever safe to do so.
   */
  report(
    category: ErrorCategory,
    action: string,
    message: string,
    options?: {
      moduleId?: ModuleId;
      moduleName?: string;
      stack?: string;
      durationMs?: number;
    },
  ): AppError {
    const config = ERROR_SEVERITY_CONFIG[category];
    const error: AppError = {
      id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      category,
      moduleId: options?.moduleId,
      moduleName: options?.moduleName,
      action,
      message,
      stack: options?.stack,
      durationMs: options?.durationMs,
      continued: config.shouldContinue,
    };

    this.errors.unshift(error);
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(0, this.maxErrors);
    }

    // Log to console with appropriate level
    const logPrefix = `[ErrorHandler] [${config.label}]`;
    if (category === 'warning') {
      console.warn(logPrefix, message);
    } else {
      console.error(logPrefix, message, options?.stack || '');
    }

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(error);
      } catch (err) {
        console.error('[ErrorHandler] listener error:', err);
      }
    }

    return error;
  }

  /**
   * Report an error from a caught exception.
   */
  reportException(
    category: ErrorCategory,
    action: string,
    error: unknown,
    options?: {
      moduleId?: ModuleId;
      moduleName?: string;
      durationMs?: number;
    },
  ): AppError {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    return this.report(category, action, message, {
      ...options,
      stack,
    });
  }

  /**
   * Wrap an async operation with automatic error handling.
   * If the operation throws, the error is reported and undefined is returned.
   * The application continues running.
   */
  async safeAsync<T>(
    action: string,
    operation: () => Promise<T>,
    options?: {
      moduleId?: ModuleId;
      moduleName?: string;
      category?: ErrorCategory;
    },
  ): Promise<T | undefined> {
    const startedAt = Date.now();
    try {
      return await operation();
    } catch (err) {
      this.reportException(
        options?.category ?? 'recoverable',
        action,
        err,
        {
          ...options,
          durationMs: Date.now() - startedAt,
        },
      );
      return undefined;
    }
  }

  /**
   * Wrap a synchronous operation with automatic error handling.
   */
  safe<T>(
    action: string,
    operation: () => T,
    options?: {
      moduleId?: ModuleId;
      moduleName?: string;
      category?: ErrorCategory;
    },
  ): T | undefined {
    const startedAt = Date.now();
    try {
      return operation();
    } catch (err) {
      this.reportException(
        options?.category ?? 'recoverable',
        action,
        err,
        {
          ...options,
          durationMs: Date.now() - startedAt,
        },
      );
      return undefined;
    }
  }

  // ── Queries ───────────────────────────────────────────────────────

  getErrors(): AppError[] {
    return [...this.errors];
  }

  getRecentErrors(count: number): AppError[] {
    return this.errors.slice(0, count);
  }

  getErrorsByModule(moduleId: ModuleId): AppError[] {
    return this.errors.filter((e) => e.moduleId === moduleId);
  }

  getErrorsByCategory(category: ErrorCategory): AppError[] {
    return this.errors.filter((e) => e.category === category);
  }

  getErrorCount(): number {
    return this.errors.length;
  }

  hasCriticalErrors(): boolean {
    return this.errors.some((e) => e.category === 'critical' || e.category === 'internal_error');
  }

  // ── Subscription ──────────────────────────────────────────────────

  subscribe(listener: ErrorListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  // ── Maintenance ───────────────────────────────────────────────────

  clear(): void {
    this.errors = [];
    this.listeners.clear();
  }

  /**
   * Export errors as a JSON string for support diagnostics.
   */
  exportErrors(): string {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      errorCount: this.errors.length,
      errors: this.errors,
    }, null, 2);
  }
}

export const errorHandler = new ErrorHandlerServiceImpl();
