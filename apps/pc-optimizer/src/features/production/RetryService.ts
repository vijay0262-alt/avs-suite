/**
 * Retry & Recovery (Part 10) — Production Readiness Framework.
 *
 * Safe retry strategies for recoverable operations:
 *   - License validation
 *   - Background synchronization
 *   - Module initialization
 *   - Local file access
 *
 * Uses exponential backoff with jitter. Retries have reasonable limits
 * and never loop infinitely.
 */

import { configManager } from './AppConfig';
import { errorHandler } from './ErrorHandler';
import { logger } from './Logger';

export interface RetryOptions {
  /** Maximum retry attempts. Defaults to config value. */
  maxAttempts?: number;
  /** Base delay in ms. Defaults to config value. */
  baseDelayMs?: number;
  /** Maximum delay in ms. Defaults to config value. */
  maxDelayMs?: number;
  /** Backoff multiplier. Defaults to config value. */
  backoffMultiplier?: number;
  /** Whether to jitter delays. Defaults to config value. */
  jitter?: boolean;
  /** Operation name for logging. */
  operationName?: string;
  /** Whether to log each retry attempt. */
  logRetries?: boolean;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  attempts: number;
  lastError?: unknown;
  totalDelayMs: number;
}

/**
 * Calculate the delay for a given retry attempt using exponential backoff.
 */
export function calculateRetryDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  backoffMultiplier: number,
  jitter: boolean,
): number {
  const exponentialDelay = baseDelayMs * Math.pow(backoffMultiplier, attempt);
  const clampedDelay = Math.min(exponentialDelay, maxDelayMs);
  if (jitter) {
    // Add up to 25% jitter to avoid thundering herd
    const jitterAmount = clampedDelay * 0.25 * Math.random();
    return Math.round(clampedDelay + jitterAmount);
  }
  return Math.round(clampedDelay);
}

/**
 * Execute an async operation with automatic retry on failure.
 * Uses exponential backoff with configurable limits.
 *
 * Never loops infinitely — always bounded by maxAttempts.
 */
export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options?: RetryOptions,
): Promise<RetryResult<T>> {
  const config = configManager.getRetryConfig();
  const maxAttempts = options?.maxAttempts ?? config.maxAttempts;
  const baseDelayMs = options?.baseDelayMs ?? config.baseDelayMs;
  const maxDelayMs = options?.maxDelayMs ?? config.maxDelayMs;
  const backoffMultiplier = options?.backoffMultiplier ?? config.backoffMultiplier;
  const jitter = options?.jitter ?? config.jitter;
  const opName = options?.operationName ?? 'operation';
  const logRetries = options?.logRetries ?? true;

  let lastError: unknown;
  let totalDelayMs = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await operation(attempt);
      if (attempt > 0 && logRetries) {
        logger.info('RetryService', opName, `Succeeded after ${attempt + 1} attempts`, {
          durationMs: totalDelayMs,
          result: 'success',
          data: { attempts: attempt + 1 },
        });
      }
      return { success: true, result, attempts: attempt + 1, totalDelayMs };
    } catch (err) {
      lastError = err;

      if (attempt < maxAttempts - 1) {
        const delay = calculateRetryDelay(
          attempt, baseDelayMs, maxDelayMs, backoffMultiplier, jitter,
        );
        totalDelayMs += delay;

        if (logRetries) {
          logger.warning('RetryService', opName, `Attempt ${attempt + 1} failed, retrying in ${delay}ms`, {
            errorDetails: err instanceof Error ? err.message : String(err),
            data: { attempt: attempt + 1, nextDelayMs: delay },
          });
        }

        await sleep(delay);
      }
    }
  }

  // All attempts exhausted
  errorHandler.reportException('recoverable', opName, lastError, {
    durationMs: totalDelayMs,
  });

  return {
    success: false,
    attempts: maxAttempts,
    lastError,
    totalDelayMs,
  };
}

/**
 * Retry specifically for module initialization.
 * Reports errors through the error handler on final failure.
 */
export async function retryModuleInit(
  moduleId: string,
  initFn: () => Promise<void>,
  options?: Partial<RetryOptions>,
): Promise<boolean> {
  const result = await withRetry(initFn, {
    ...options,
    operationName: `module-init:${moduleId}`,
  });
  return result.success;
}

/**
 * Retry specifically for license validation.
 */
export async function retryLicenseValidation(
  validateFn: () => Promise<boolean>,
  options?: Partial<RetryOptions>,
): Promise<boolean> {
  const result = await withRetry(validateFn, {
    maxAttempts: 2,
    baseDelayMs: 1000,
    ...options,
    operationName: 'license-validation',
  });
  return result.success && result.result === true;
}

/**
 * Retry specifically for local file access.
 * Uses shorter delays since file I/O is typically fast.
 */
export async function retryFileAccess<T>(
  fileFn: () => Promise<T>,
  options?: Partial<RetryOptions>,
): Promise<RetryResult<T>> {
  return withRetry(fileFn, {
    maxAttempts: 3,
    baseDelayMs: 200,
    maxDelayMs: 2000,
    ...options,
    operationName: 'file-access',
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
