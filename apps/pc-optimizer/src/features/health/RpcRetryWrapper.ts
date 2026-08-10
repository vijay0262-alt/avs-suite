/**
 * RpcRetryWrapper — automatic retry with exponential backoff for backend RPC calls.
 *
 * When the Python backend becomes unavailable, RPC calls are retried:
 *   Attempt 1: immediate
 *   Attempt 2: wait 1s
 *   Attempt 3: wait 2s
 *   Attempt 4: wait 4s
 *
 * If all attempts fail, the error is thrown to the caller.
 * The wrapper logs each retry attempt via the structured logging service.
 */

import { log } from './LogService';

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  backoffMultiplier: number;
  /** Optional timeout per attempt in ms. 0 = no timeout. */
  timeoutMs: number;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  backoffMultiplier: 2,
  timeoutMs: 0,
};

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  if (timeoutMs <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms: ${operation}`));
    }, timeoutMs);
    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Execute an async operation with retry and exponential backoff.
 *
 * @param operation - A function that returns a Promise. Called on each attempt.
 * @param label - Human-readable label for logging (e.g. "dashboard.metrics").
 * @param options - Retry configuration. Defaults to 3 attempts with 1s/2s/4s backoff.
 * @returns The result of the operation, or throws the last error.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  label: string,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      const result = await withTimeout(operation(), opts.timeoutMs, label);
      if (attempt > 1) {
        log.info(`RPC recovered: ${label} succeeded on attempt ${attempt}/${opts.maxAttempts}`);
      }
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < opts.maxAttempts) {
        const delayMs = opts.baseDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1);
        log.warning(
          `RPC failed: ${label} attempt ${attempt}/${opts.maxAttempts} — ${lastError.message}. Retrying in ${delayMs}ms...`,
        );
        await delay(delayMs);
      } else {
        log.error(
          `RPC exhausted: ${label} failed after ${attempt} attempts — ${lastError.message}`,
        );
      }
    }
  }

  throw lastError!;
}

/**
 * Execute an async operation with retry, returning a RetryResult instead of throwing.
 * Useful for fire-and-forget calls where you want to check success without try/catch.
 */
export async function withRetrySafe<T>(
  operation: () => Promise<T>,
  label: string,
  options: Partial<RetryOptions> = {},
): Promise<RetryResult<T>> {
  try {
    const result = await withRetry(operation, label, options);
    return { success: true, result, attempts: 1 };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err : new Error(String(err)),
      attempts: options.maxAttempts ?? DEFAULT_RETRY_OPTIONS.maxAttempts,
    };
  }
}
