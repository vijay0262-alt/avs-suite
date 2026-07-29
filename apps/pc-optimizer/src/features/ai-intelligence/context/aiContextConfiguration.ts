/**
 * AI Context Configuration — default configuration and factory.
 *
 * All settings are data-driven and replaceable at runtime.
 */
import type { AIContextConfiguration } from './types';

export const DEFAULT_CONTEXT_CONFIG: AIContextConfiguration = {
  cacheEnabled: true,
  cacheTtlMs: 30_000, // 30 seconds
  autoRefresh: false,
  autoRefreshIntervalMs: 60_000, // 1 minute
  failOnProviderError: false,
  timeoutMs: 5_000,
  enableTraceability: true,
  minConfidenceThreshold: 0.5,
  metadata: {
    contextVersion: '1.0.0',
    appVersion: '1.0.0',
    platform: typeof process !== 'undefined' ? process.platform : 'unknown',
    language: typeof navigator !== 'undefined' ? navigator.language : 'en-US',
  },
};

export function createConfig(overrides?: Partial<AIContextConfiguration>): AIContextConfiguration {
  return {
    ...DEFAULT_CONTEXT_CONFIG,
    ...overrides,
    metadata: {
      ...DEFAULT_CONTEXT_CONFIG.metadata,
      ...overrides?.metadata,
    },
  };
}
