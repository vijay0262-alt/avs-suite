/**
 * Centralized Application Configuration (Part 9) — Production Readiness.
 *
 * Centralizes all configurable values to avoid hardcoding.
 * Future adjustments require configuration changes, not code changes.
 *
 * Configuration areas:
 *   - Health Engine
 *   - Module weights
 *   - Logging levels
 *   - Feature flags
 *   - Timeouts
 *   - Retry counts
 *   - UI preferences
 */

import { DEFAULT_HEALTH_WEIGHTS, DEFAULT_MODULE_SETTINGS } from '../module-registry/ModuleConfig';

// ── Configuration Types ─────────────────────────────────────────────

export interface HealthEngineConfig {
  /** Maximum total penalty across all modules. */
  maxTotalPenalty: number;
  /** Minimum health score (clamped). */
  minScore: number;
  /** Maximum health score (clamped). */
  maxScore: number;
  /** Whether to skip locked modules in health calculation. */
  skipLockedModules: boolean;
}

export interface LoggingConfig {
  /** Minimum log level. */
  minLevel: 'debug' | 'info' | 'warning' | 'error';
  /** Maximum log entries to keep in memory. */
  maxEntries: number;
  /** Whether to write logs to console. */
  consoleOutput: boolean;
  /** Whether to include stack traces. */
  includeStackTraces: boolean;
}

export interface TimeoutConfig {
  /** Module initialization timeout (ms). */
  moduleInit: number;
  /** Scan operation timeout (ms). */
  scan: number;
  /** Clean operation timeout (ms). */
  clean: number;
  /** Optimize operation timeout (ms). */
  optimize: number;
  /** Dashboard refresh interval (ms). */
  dashboardRefresh: number;
  /** Health calculation timeout (ms). */
  healthCalculation: number;
  /** License validation timeout (ms). */
  licenseValidation: number;
  /** Backend ping timeout (ms). */
  backendPing: number;
}

export interface RetryConfig {
  /** Maximum retry attempts for recoverable operations. */
  maxAttempts: number;
  /** Base delay between retries (ms). */
  baseDelayMs: number;
  /** Maximum delay between retries (ms). */
  maxDelayMs: number;
  /** Backoff multiplier for exponential backoff. */
  backoffMultiplier: number;
  /** Whether to jitter retry delays. */
  jitter: boolean;
}

export interface BackgroundTaskConfig {
  /** Maximum concurrent background tasks. */
  maxConcurrent: number;
  /** Default task timeout (ms). */
  defaultTimeout: number;
  /** Interval for progress reporting (ms). */
  progressInterval: number;
}

export interface UIPreferencesConfig {
  /** Default theme. */
  defaultTheme: 'dark' | 'light';
  /** Whether to show future modules in the dashboard. */
  showFutureModules: boolean;
  /** Whether to show health breakdown by default. */
  showHealthBreakdown: boolean;
  /** Whether to show recommendations on dashboard. */
  showRecommendations: boolean;
  /** Dashboard card layout columns. */
  dashboardColumns: number;
}

export interface ApplicationConfig {
  healthEngine: HealthEngineConfig;
  logging: LoggingConfig;
  timeouts: TimeoutConfig;
  retry: RetryConfig;
  backgroundTasks: BackgroundTaskConfig;
  uiPreferences: UIPreferencesConfig;
  /** Module health weights from ModuleConfig. */
  moduleWeights: typeof DEFAULT_HEALTH_WEIGHTS;
  /** Module settings from ModuleConfig. */
  moduleSettings: typeof DEFAULT_MODULE_SETTINGS;
}

// ── Default Configuration ───────────────────────────────────────────

const DEFAULT_CONFIG: ApplicationConfig = {
  healthEngine: {
    maxTotalPenalty: 100,
    minScore: 0,
    maxScore: 100,
    skipLockedModules: true,
  },
  logging: {
    minLevel: 'info',
    maxEntries: 1000,
    consoleOutput: true,
    includeStackTraces: true,
  },
  timeouts: {
    moduleInit: 10_000,
    scan: 60_000,
    clean: 120_000,
    optimize: 90_000,
    dashboardRefresh: 5_000,
    healthCalculation: 5_000,
    licenseValidation: 15_000,
    backendPing: 5_000,
  },
  retry: {
    maxAttempts: 3,
    baseDelayMs: 500,
    maxDelayMs: 10_000,
    backoffMultiplier: 2,
    jitter: true,
  },
  backgroundTasks: {
    maxConcurrent: 3,
    defaultTimeout: 60_000,
    progressInterval: 1_000,
  },
  uiPreferences: {
    defaultTheme: 'dark',
    showFutureModules: true,
    showHealthBreakdown: true,
    showRecommendations: true,
    dashboardColumns: 3,
  },
  moduleWeights: DEFAULT_HEALTH_WEIGHTS,
  moduleSettings: DEFAULT_MODULE_SETTINGS,
};

// ── Config Manager ──────────────────────────────────────────────────

class ConfigManagerImpl {
  private config: ApplicationConfig = deepClone(DEFAULT_CONFIG);
  private listeners = new Set<() => void>();

  /**
   * Get the current configuration (immutable copy).
   */
  getConfig(): ApplicationConfig {
    return deepClone(this.config);
  }

  /**
   * Update part of the configuration. Deep-merges with existing config.
   */
  update(partial: DeepPartial<ApplicationConfig>): void {
    this.config = deepMerge(this.config, partial);
    this.notifyListeners();
  }

  /**
   * Reset to default configuration.
   */
  reset(): void {
    this.config = deepClone(DEFAULT_CONFIG);
    this.notifyListeners();
  }

  /**
   * Get a specific config section.
   */
  getHealthEngineConfig(): HealthEngineConfig {
    return { ...this.config.healthEngine };
  }

  getLoggingConfig(): LoggingConfig {
    return { ...this.config.logging };
  }

  getTimeoutConfig(): TimeoutConfig {
    return { ...this.config.timeouts };
  }

  getRetryConfig(): RetryConfig {
    return { ...this.config.retry };
  }

  getBackgroundTaskConfig(): BackgroundTaskConfig {
    return { ...this.config.backgroundTasks };
  }

  getUIPreferences(): UIPreferencesConfig {
    return { ...this.config.uiPreferences };
  }

  /**
   * Subscribe to configuration changes.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // ignore listener errors
      }
    }
  }
}

// ── Type Helpers ────────────────────────────────────────────────────

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function deepMerge<T>(base: T, partial: DeepPartial<T>): T {
  const result = { ...base } as Record<string, unknown>;
  const baseRecord = base as Record<string, unknown>;
  const partialRecord = partial as Record<string, unknown>;
  for (const key of Object.keys(partialRecord)) {
    const baseVal = baseRecord[key];
    const partialVal = partialRecord[key];
    if (
      partialVal !== null &&
      typeof partialVal === 'object' &&
      !Array.isArray(partialVal) &&
      typeof baseVal === 'object' &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(baseVal, partialVal as DeepPartial<typeof baseVal>);
    } else if (partialVal !== undefined) {
      result[key] = partialVal;
    }
  }
  return result as T;
}

// ── Export ──────────────────────────────────────────────────────────

export const configManager = new ConfigManagerImpl();
