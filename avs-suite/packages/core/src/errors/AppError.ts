/**
 * Application error hierarchy. Domain errors extend `AppError`; unknown
 * errors are wrapped into `AppError.unknown(cause)` before crossing
 * layer boundaries so upper layers never receive raw `Error` instances.
 */
export class AppError extends Error {
  readonly code: string;
  readonly cause?: unknown;

  constructor(code: string, message: string, cause?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.cause = cause;
  }

  static unknown(cause: unknown): AppError {
    const message = cause instanceof Error ? cause.message : String(cause);
    return new AppError('E_UNKNOWN', message, cause);
  }

  static rpc(code: number, message: string, data?: unknown): AppError {
    return new AppError(`E_RPC_${code}`, message, data);
  }

  static featureLocked(featureKey: string): AppError {
    return new AppError('E_FEATURE_LOCKED', `Feature "${featureKey}" requires a higher edition.`);
  }
}
