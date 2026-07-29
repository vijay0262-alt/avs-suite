/**
 * Tests for the AI Context Engine.
 *
 * Covers:
 * - Types & helper functions
 * - Events (7 event types)
 * - Configuration (default, factory, overrides)
 * - Registry (register, unregister, query, priority sort)
 * - Validator (providers, context, duplicates, provenance, confidence)
 * - Cache (get, set, expiration, statistics, enable/disable)
 * - Aggregator (collect, merge, failures, timeout, provenance)
 * - Builder (build, rebuild, cache integration, validation)
 * - Manager (all public APIs, plan, config, statistics)
 * - Traceability (provenance, evidence, confidence)
 * - Regression
 * - Performance
 * - Edge cases
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  AIContextProvider,
  AIContext,
  ContextProviderValidationResult,
} from '../types';
import { AIContextEventEmitter } from '../aiContextEvents';
import { DEFAULT_CONTEXT_CONFIG, createConfig } from '../aiContextConfiguration';
import { AIContextRegistry } from '../aiContextRegistry';
import { AIContextValidator } from '../aiContextValidator';
import { AIContextCache } from '../aiContextCache';
import { AIContextAggregator } from '../aiContextAggregator';
import { AIContextBuilder } from '../aiContextBuilder';
import { AIContextManager } from '../aiContextManager';
import {
  CONTEXT_SECTIONS,
  isValidContextSection,
  createProvenance,
  generateContextId,
} from '../types';

// ── Test Helpers ─────────────────────────────────────────────

function createMockProvider(
  name: string,
  context: Record<string, unknown>,
  opts: {
    version?: string;
    priority?: number;
    available?: boolean;
    valid?: boolean;
    async?: boolean;
    delay?: number;
    confidence?: number;
    evidence?: { source: string; metric: string; value: string | number | boolean; timestamp: string }[];
  } = {},
): AIContextProvider {
  const {
    version = '1.0.0',
    priority = 10,
    available = true,
    valid = true,
    async = false,
    delay = 0,
    confidence,
    evidence,
  } = opts;

  const ctx = { ...context };
  if (confidence !== undefined) ctx._confidence = confidence;
  if (evidence !== undefined) ctx._evidence = evidence;

  return {
    getProviderName: () => name,
    getVersion: () => version,
    getPriority: () => priority,
    isAvailable: () => available,
    getContext: () => {
      if (async) {
        return new Promise((resolve) => {
          setTimeout(() => resolve(ctx), delay);
        });
      }
      return ctx;
    },
    validate: (): ContextProviderValidationResult => ({
      valid,
      issues: valid ? [] : ['Mock validation failure'],
    }),
  };
}

function createSystemProvider(opts: { available?: boolean; valid?: boolean; async?: boolean; delay?: number } = {}): AIContextProvider {
  return createMockProvider('system-provider', {
    system: {
      osVersion: 'Windows 11',
      osBuild: '22631',
      architecture: 'x64',
      hostname: 'DESKTOP-ABC',
      uptime: 3600,
      cpuModel: 'Intel i7',
      cpuCores: 8,
      totalMemoryMB: 16384,
      gpuModel: 'NVIDIA RTX 3060',
    },
  }, opts);
}

function createHealthProvider(opts: { available?: boolean; valid?: boolean; async?: boolean; delay?: number } = {}): AIContextProvider {
  return createMockProvider('health-provider', {
    health: {
      overallScore: 85,
      cpuScore: 90,
      ramScore: 80,
      diskScore: 75,
      stabilityScore: 95,
      securityScore: 88,
      issues: [],
    },
  }, opts);
}

function createStorageProvider(opts: { available?: boolean; valid?: boolean; async?: boolean; delay?: number } = {}): AIContextProvider {
  return createMockProvider('storage-provider', {
    storage: {
      totalCapacityMB: 512000,
      usedMB: 256000,
      freeMB: 256000,
      driveType: 'SSD',
      driveHealth: 'good',
      fragmentationPercent: 2,
      largeFiles: [],
    },
  }, opts);
}

// ── Types & Helpers ──────────────────────────────────────────

describe('Types & Helpers', () => {
  it('CONTEXT_SECTIONS has 17 sections', () => {
    expect(CONTEXT_SECTIONS).toHaveLength(17);
  });

  it('isValidContextSection returns true for known sections', () => {
    expect(isValidContextSection('system')).toBe(true);
    expect(isValidContextSection('health')).toBe(true);
    expect(isValidContextSection('storage')).toBe(true);
  });

  it('isValidContextSection returns false for unknown sections', () => {
    expect(isValidContextSection('unknown')).toBe(false);
    expect(isValidContextSection('')).toBe(false);
  });

  it('createProvenance creates provenance with defaults', () => {
    const prov = createProvenance('test-provider', '1.0.0');
    expect(prov.providerName).toBe('test-provider');
    expect(prov.providerVersion).toBe('1.0.0');
    expect(prov.confidence).toBe(1.0);
    expect(prov.evidence).toEqual([]);
    expect(prov.collectedAt).toBeDefined();
  });

  it('createProvenance clamps confidence to 0-1', () => {
    expect(createProvenance('p', 'v', -1).confidence).toBe(0);
    expect(createProvenance('p', 'v', 2).confidence).toBe(1);
    expect(createProvenance('p', 'v', 0.5).confidence).toBe(0.5);
  });

  it('generateContextId returns unique IDs', () => {
    const id1 = generateContextId();
    const id2 = generateContextId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^ctx_\d+_/);
  });
});

// ── Events ───────────────────────────────────────────────────

describe('AIContextEventEmitter', () => {
  let emitter: AIContextEventEmitter;

  beforeEach(() => {
    emitter = new AIContextEventEmitter();
  });

  it('emits events to subscribers', () => {
    const listener = vi.fn();
    emitter.on('context_build_started', listener);
    emitter.emit('context_build_started', { test: true });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('supports unsubscribe', () => {
    const listener = vi.fn();
    const unsub = emitter.on('context_build_completed', listener);
    unsub();
    emitter.emit('context_build_completed', {});
    expect(listener).not.toHaveBeenCalled();
  });

  it('tracks listener count', () => {
    emitter.on('context_cache_hit', () => {});
    emitter.on('context_cache_hit', () => {});
    expect(emitter.listenerCount('context_cache_hit')).toBe(2);
  });

  it('clear removes all listeners', () => {
    emitter.on('context_build_started', () => {});
    emitter.on('context_provider_failed', () => {});
    emitter.clear();
    expect(emitter.listenerCount('context_build_started')).toBe(0);
  });

  it('does not crash when listener throws', () => {
    emitter.on('context_refreshed', () => { throw new Error('test'); });
    expect(() => emitter.emit('context_refreshed', {})).not.toThrow();
  });

  it('supports all 7 event types', () => {
    const events = [
      'context_build_started', 'context_build_completed', 'context_provider_loaded',
      'context_provider_failed', 'context_cache_hit', 'context_cache_miss',
      'context_refreshed',
    ] as const;
    for (const evt of events) {
      const listener = vi.fn();
      emitter.on(evt, listener);
      emitter.emit(evt, { test: true });
      expect(listener).toHaveBeenCalledTimes(1);
    }
  });
});

// ── Configuration ────────────────────────────────────────────

describe('AIContextConfiguration', () => {
  it('DEFAULT_CONTEXT_CONFIG has sensible defaults', () => {
    expect(DEFAULT_CONTEXT_CONFIG.cacheEnabled).toBe(true);
    expect(DEFAULT_CONTEXT_CONFIG.cacheTtlMs).toBe(30_000);
    expect(DEFAULT_CONTEXT_CONFIG.failOnProviderError).toBe(false);
    expect(DEFAULT_CONTEXT_CONFIG.enableTraceability).toBe(true);
    expect(DEFAULT_CONTEXT_CONFIG.timeoutMs).toBe(5_000);
  });

  it('createConfig returns config with defaults', () => {
    const config = createConfig();
    expect(config.cacheEnabled).toBe(DEFAULT_CONTEXT_CONFIG.cacheEnabled);
  });

  it('createConfig accepts overrides', () => {
    const config = createConfig({ cacheTtlMs: 60_000, timeoutMs: 10_000 });
    expect(config.cacheTtlMs).toBe(60_000);
    expect(config.timeoutMs).toBe(10_000);
    expect(config.cacheEnabled).toBe(DEFAULT_CONTEXT_CONFIG.cacheEnabled);
  });

  it('createConfig merges metadata', () => {
    const config = createConfig({ metadata: { ...DEFAULT_CONTEXT_CONFIG.metadata, appVersion: '2.0.0' } });
    expect(config.metadata.appVersion).toBe('2.0.0');
    expect(config.metadata.contextVersion).toBe(DEFAULT_CONTEXT_CONFIG.metadata.contextVersion);
  });
});

// ── Registry ─────────────────────────────────────────────────

describe('AIContextRegistry', () => {
  let registry: AIContextRegistry;

  beforeEach(() => {
    registry = new AIContextRegistry();
  });

  it('registerProvider adds a provider', () => {
    const provider = createSystemProvider();
    expect(registry.registerProvider(provider)).toBe(true);
    expect(registry.count).toBe(1);
  });

  it('registerProvider rejects empty name', () => {
    const provider = createMockProvider('', { system: {} });
    expect(registry.registerProvider(provider)).toBe(false);
    expect(registry.count).toBe(0);
  });

  it('registerProvider overwrites existing provider', () => {
    const p1 = createSystemProvider();
    const p2 = createMockProvider('system-provider', { system: { osVersion: 'Windows 10' } });
    registry.registerProvider(p1);
    registry.registerProvider(p2);
    expect(registry.count).toBe(1);
    expect(registry.getProvider('system-provider')).toBe(p2);
  });

  it('unregisterProvider removes a provider', () => {
    const provider = createSystemProvider();
    registry.registerProvider(provider);
    expect(registry.unregisterProvider('system-provider')).toBe(true);
    expect(registry.count).toBe(0);
  });

  it('unregisterProvider returns false for unknown', () => {
    expect(registry.unregisterProvider('unknown')).toBe(false);
  });

  it('getProvider returns provider by name', () => {
    const provider = createSystemProvider();
    registry.registerProvider(provider);
    expect(registry.getProvider('system-provider')).toBe(provider);
  });

  it('getProvider returns undefined for unknown', () => {
    expect(registry.getProvider('unknown')).toBeUndefined();
  });

  it('getProviders returns sorted by priority', () => {
    const p1 = createMockProvider('p1', {}, { priority: 20 });
    const p2 = createMockProvider('p2', {}, { priority: 5 });
    const p3 = createMockProvider('p3', {}, { priority: 10 });
    registry.registerProvider(p1);
    registry.registerProvider(p2);
    registry.registerProvider(p3);
    const providers = registry.getProviders();
    expect(providers[0]!.getProviderName()).toBe('p2');
    expect(providers[1]!.getProviderName()).toBe('p3');
    expect(providers[2]!.getProviderName()).toBe('p1');
  });

  it('getAvailableProviders filters unavailable', () => {
    registry.registerProvider(createSystemProvider({ available: true }));
    registry.registerProvider(createHealthProvider({ available: false }));
    expect(registry.getAvailableProviders()).toHaveLength(1);
  });

  it('hasProvider checks registration', () => {
    registry.registerProvider(createSystemProvider());
    expect(registry.hasProvider('system-provider')).toBe(true);
    expect(registry.hasProvider('unknown')).toBe(false);
  });

  it('getProviderNames returns all names', () => {
    registry.registerProvider(createSystemProvider());
    registry.registerProvider(createHealthProvider());
    expect(registry.getProviderNames()).toContain('system-provider');
    expect(registry.getProviderNames()).toContain('health-provider');
  });

  it('clear removes all providers', () => {
    registry.registerProvider(createSystemProvider());
    registry.registerProvider(createHealthProvider());
    registry.clear();
    expect(registry.count).toBe(0);
  });
});

// ── Validator ────────────────────────────────────────────────

describe('AIContextValidator', () => {
  let validator: AIContextValidator;

  beforeEach(() => {
    validator = new AIContextValidator(DEFAULT_CONTEXT_CONFIG);
  });

  it('validateProvider passes for valid provider', () => {
    const result = validator.validateProvider(createSystemProvider());
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('validateProvider fails for empty name', () => {
    const provider = createMockProvider('', { system: {} });
    const result = validator.validateProvider(provider);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'PROVIDER_NO_NAME')).toBe(true);
  });

  it('validateProvider fails for self-validation failure', () => {
    const provider = createSystemProvider({ valid: false });
    const result = validator.validateProvider(provider);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'PROVIDER_SELF_VALIDATION')).toBe(true);
  });

  it('validateContext passes for valid context', () => {
    const context: AIContext = {
      metadata: {
        contextId: 'test-ctx',
        timestamp: new Date().toISOString(),
        contextVersion: '1.0.0',
        appVersion: '1.0.0',
        platform: 'win32',
        language: 'en-US',
        currentPlan: 'FREE',
        generationTimeMs: 10,
      },
      provenance: [createProvenance('test', '1.0.0')],
    };
    const result = validator.validateContext(context);
    expect(result.valid).toBe(true);
  });

  it('validateContext fails for missing metadata', () => {
    const context = { provenance: [] } as unknown as AIContext;
    const result = validator.validateContext(context);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'MISSING_METADATA')).toBe(true);
  });

  it('validateContext fails for missing contextId', () => {
    const context: AIContext = {
      metadata: {
        contextId: '',
        timestamp: new Date().toISOString(),
        contextVersion: '1.0.0',
        appVersion: '1.0.0',
        platform: 'win32',
        language: 'en-US',
        currentPlan: 'FREE',
        generationTimeMs: 10,
      },
      provenance: [createProvenance('test', '1.0.0')],
    };
    const result = validator.validateContext(context);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'MISSING_CONTEXT_ID')).toBe(true);
  });

  it('validateContext warns for missing provenance with traceability', () => {
    const context: AIContext = {
      metadata: {
        contextId: 'test',
        timestamp: new Date().toISOString(),
        contextVersion: '1.0.0',
        appVersion: '1.0.0',
        platform: 'win32',
        language: 'en-US',
        currentPlan: 'FREE',
        generationTimeMs: 10,
      },
    } as unknown as AIContext;
    const result = validator.validateContext(context);
    expect(result.issues.some((i) => i.code === 'MISSING_PROVENANCE')).toBe(true);
  });

  it('validateContext warns for low confidence', () => {
    const context: AIContext = {
      metadata: {
        contextId: 'test',
        timestamp: new Date().toISOString(),
        contextVersion: '1.0.0',
        appVersion: '1.0.0',
        platform: 'win32',
        language: 'en-US',
        currentPlan: 'FREE',
        generationTimeMs: 10,
      },
      provenance: [createProvenance('test', '1.0.0', 0.1)],
    };
    const result = validator.validateContext(context);
    expect(result.issues.some((i) => i.code === 'LOW_CONFIDENCE')).toBe(true);
  });

  it('validateContext warns for unknown sections', () => {
    const context: AIContext = {
      metadata: {
        contextId: 'test',
        timestamp: new Date().toISOString(),
        contextVersion: '1.0.0',
        appVersion: '1.0.0',
        platform: 'win32',
        language: 'en-US',
        currentPlan: 'FREE',
        generationTimeMs: 10,
      },
      provenance: [],
      unknownSection: { foo: 'bar' },
    } as unknown as AIContext;
    const result = validator.validateContext(context);
    expect(result.issues.some((i) => i.code === 'UNKNOWN_SECTION')).toBe(true);
  });

  it('checkDuplicateProviders detects duplicates', () => {
    const p1 = createMockProvider('same-name', {});
    const p2 = createMockProvider('same-name', {});
    const result = validator.checkDuplicateProviders([p1, p2]);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'DUPLICATE_PROVIDER')).toBe(true);
  });

  it('checkDuplicateProviders passes for unique names', () => {
    const p1 = createMockProvider('p1', {});
    const p2 = createMockProvider('p2', {});
    const result = validator.checkDuplicateProviders([p1, p2]);
    expect(result.valid).toBe(true);
  });

  it('isValidSection checks section validity', () => {
    expect(validator.isValidSection('system')).toBe(true);
    expect(validator.isValidSection('unknown')).toBe(false);
  });
});

// ── Cache ────────────────────────────────────────────────────

describe('AIContextCache', () => {
  let cache: AIContextCache;

  beforeEach(() => {
    cache = new AIContextCache(30_000, true);
  });

  function createTestContext(): AIContext {
    return {
      metadata: {
        contextId: 'test',
        timestamp: new Date().toISOString(),
        contextVersion: '1.0.0',
        appVersion: '1.0.0',
        platform: 'win32',
        language: 'en-US',
        currentPlan: 'FREE',
        generationTimeMs: 5,
      },
      provenance: [],
    };
  }

  it('get returns null when cache is empty', () => {
    expect(cache.get()).toBeNull();
  });

  it('set and get work', () => {
    const ctx = createTestContext();
    cache.set(ctx, 5);
    expect(cache.get()).toBe(ctx);
  });

  it('isValid returns true after set', () => {
    cache.set(createTestContext(), 5);
    expect(cache.isValid()).toBe(true);
  });

  it('isValid returns false when empty', () => {
    expect(cache.isValid()).toBe(false);
  });

  it('clear empties cache', () => {
    cache.set(createTestContext(), 5);
    cache.clear();
    expect(cache.get()).toBeNull();
    expect(cache.isValid()).toBe(false);
  });

  it('get returns null and records miss when expired', async () => {
    const shortCache = new AIContextCache(50, true);
    shortCache.set(createTestContext(), 5);
    await new Promise((r) => setTimeout(r, 60));
    expect(shortCache.get()).toBeNull();
  });

  it('tracks hit count', () => {
    cache.set(createTestContext(), 5);
    cache.get();
    cache.get();
    const stats = cache.getStatistics();
    expect(stats.totalHits).toBe(2);
  });

  it('tracks miss count', () => {
    cache.get();
    cache.get();
    const stats = cache.getStatistics();
    expect(stats.totalMisses).toBe(2);
  });

  it('tracks build count', () => {
    cache.set(createTestContext(), 5);
    cache.set(createTestContext(), 10);
    const stats = cache.getStatistics();
    expect(stats.totalBuilds).toBe(2);
    expect(stats.lastBuildTimeMs).toBe(10);
  });

  it('tracks refresh count', () => {
    cache.recordRefresh();
    cache.recordRefresh();
    const stats = cache.getStatistics();
    expect(stats.totalRefreshes).toBe(2);
  });

  it('calculates hit rate', () => {
    cache.set(createTestContext(), 5);
    cache.get(); // hit
    cache.get(); // hit
    cache.clear();
    cache.get(); // miss
    const stats = cache.getStatistics();
    expect(stats.hitRate).toBeCloseTo(2 / 3, 2);
  });

  it('getInfo returns entry info without context', () => {
    cache.set(createTestContext(), 5);
    const info = cache.getInfo();
    expect(info).not.toBeNull();
    expect(info!.cachedAt).toBeDefined();
    expect(info!.expiresAt).toBeDefined();
    expect(info!.hitCount).toBe(0);
  });

  it('getInfo returns null when empty', () => {
    expect(cache.getInfo()).toBeNull();
  });

  it('setEnabled(false) clears cache', () => {
    cache.set(createTestContext(), 5);
    cache.setEnabled(false);
    expect(cache.get()).toBeNull();
    expect(cache.isEnabled()).toBe(false);
  });

  it('setTtl updates TTL', () => {
    cache.setTtl(100);
    cache.set(createTestContext(), 5);
    expect(cache.isValid()).toBe(true);
  });

  it('resetStatistics resets counters', () => {
    cache.set(createTestContext(), 5);
    cache.get();
    cache.resetStatistics();
    const stats = cache.getStatistics();
    expect(stats.totalHits).toBe(0);
    expect(stats.totalMisses).toBe(0);
  });

  it('recordMiss increments miss count', () => {
    cache.recordMiss();
    const stats = cache.getStatistics();
    expect(stats.totalMisses).toBe(1);
  });
});

// ── Aggregator ───────────────────────────────────────────────

describe('AIContextAggregator', () => {
  let aggregator: AIContextAggregator;

  beforeEach(() => {
    aggregator = new AIContextAggregator(DEFAULT_CONTEXT_CONFIG);
  });

  it('aggregates context from multiple providers', async () => {
    const providers = [createSystemProvider(), createHealthProvider(), createStorageProvider()];
    const { context, successes, failures } = await aggregator.aggregate(providers, 'FREE');

    expect(successes).toHaveLength(3);
    expect(failures).toHaveLength(0);
    expect(context.system).toBeDefined();
    expect(context.health).toBeDefined();
    expect(context.storage).toBeDefined();
  });

  it('handles provider failures gracefully', async () => {
    const failingProvider: AIContextProvider = {
      getProviderName: () => 'failing-provider',
      getVersion: () => '1.0.0',
      getPriority: () => 10,
      isAvailable: () => true,
      getContext: () => { throw new Error('Provider error'); },
      validate: () => ({ valid: true, issues: [] }),
    };

    const providers = [createSystemProvider(), failingProvider, createHealthProvider()];
    const { context, successes, failures } = await aggregator.aggregate(providers, 'FREE');

    expect(successes).toHaveLength(2);
    expect(failures).toHaveLength(1);
    expect(failures).toContain('failing-provider');
    expect(context.system).toBeDefined();
    expect(context.health).toBeDefined();
  });

  it('skips unavailable providers', async () => {
    const providers = [createSystemProvider(), createHealthProvider({ available: false })];
    const { successes, failures } = await aggregator.aggregate(providers, 'FREE');

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
  });

  it('creates metadata with correct fields', async () => {
    const { context } = await aggregator.aggregate([createSystemProvider()], 'PRO');
    expect(context.metadata.contextId).toMatch(/^ctx_/);
    expect(context.metadata.currentPlan).toBe('PRO');
    expect(context.metadata.generationTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('tracks provenance for each provider', async () => {
    const providers = [createSystemProvider(), createHealthProvider()];
    const { context } = await aggregator.aggregate(providers, 'FREE');

    expect(context.provenance).toHaveLength(2);
    expect(context.provenance[0]!.providerName).toBe('system-provider');
    expect(context.provenance[1]!.providerName).toBe('health-provider');
  });

  it('extracts confidence from provider context', async () => {
    const provider = createMockProvider('conf-provider', { system: {} }, { confidence: 0.8 });
    const { context } = await aggregator.aggregate([provider], 'FREE');
    expect(context.provenance[0]!.confidence).toBe(0.8);
  });

  it('extracts evidence from provider context', async () => {
    const evidence = [{ source: 'WMI', metric: 'os_version', value: 'Windows 11', timestamp: new Date().toISOString() }];
    const provider = createMockProvider('ev-provider', { system: {} }, { evidence });
    const { context } = await aggregator.aggregate([provider], 'FREE');
    expect(context.provenance[0]!.evidence).toHaveLength(1);
  });

  it('handles async providers', async () => {
    const provider = createSystemProvider({ async: true, delay: 10 });
    const { context, successes } = await aggregator.aggregate([provider], 'FREE');
    expect(successes).toHaveLength(1);
    expect(context.system).toBeDefined();
  });

  it('handles provider timeout', async () => {
    const slowProvider = createSystemProvider({ async: true, delay: 100 });
    const shortConfig = createConfig({ timeoutMs: 10 });
    const shortAggregator = new AIContextAggregator(shortConfig);
    const { context } = await shortAggregator.aggregate([slowProvider], 'FREE');
    // Timeout returns null, which is treated as no context — not a failure
    expect(context.system).toBeUndefined();
  });

  it('unknown sections go to futureExtensions', async () => {
    const provider = createMockProvider('custom', { customSection: { foo: 'bar' } });
    const { context } = await aggregator.aggregate([provider], 'FREE');
    expect(context.futureExtensions).toBeDefined();
    expect(context.futureExtensions!.customSection).toEqual({ foo: 'bar' });
  });

  it('handles empty provider list', async () => {
    const { context, successes, failures } = await aggregator.aggregate([], 'FREE');
    expect(successes).toHaveLength(0);
    expect(failures).toHaveLength(0);
    expect(context.metadata).toBeDefined();
  });

  it('updateConfig updates configuration', async () => {
    aggregator.updateConfig(createConfig({ timeoutMs: 999 }));
    // Just verify it doesn't crash
    await aggregator.aggregate([createSystemProvider()], 'FREE');
  });
});

// ── Builder ──────────────────────────────────────────────────

describe('AIContextBuilder', () => {
  let registry: AIContextRegistry;
  let aggregator: AIContextAggregator;
  let validator: AIContextValidator;
  let cache: AIContextCache;
  let builder: AIContextBuilder;

  beforeEach(() => {
    registry = new AIContextRegistry();
    aggregator = new AIContextAggregator(DEFAULT_CONTEXT_CONFIG);
    validator = new AIContextValidator(DEFAULT_CONTEXT_CONFIG);
    cache = new AIContextCache(30_000, true);
    builder = new AIContextBuilder(registry, aggregator, validator, cache, DEFAULT_CONTEXT_CONFIG);
  });

  it('build returns context with metadata', async () => {
    registry.registerProvider(createSystemProvider());
    const context = await builder.build('FREE');
    expect(context.metadata).toBeDefined();
    expect(context.metadata.contextId).toMatch(/^ctx_/);
    expect(context.system).toBeDefined();
  });

  it('build uses cache on second call', async () => {
    registry.registerProvider(createSystemProvider());
    const ctx1 = await builder.build('FREE');
    const ctx2 = await builder.build('FREE');
    expect(ctx1).toBe(ctx2); // Same object from cache
  });

  it('rebuild bypasses cache', async () => {
    registry.registerProvider(createSystemProvider());
    const ctx1 = await builder.build('FREE');
    const ctx2 = await builder.rebuild('FREE');
    expect(ctx1).not.toBe(ctx2); // Different objects
    expect(ctx2.metadata.contextId).not.toBe(ctx1.metadata.contextId);
  });

  it('build with no providers returns metadata-only context', async () => {
    const context = await builder.build('FREE');
    expect(context.metadata).toBeDefined();
    expect(context.system).toBeUndefined();
  });

  it('build handles provider failures', async () => {
    const failingProvider: AIContextProvider = {
      getProviderName: () => 'failing',
      getVersion: () => '1.0.0',
      getPriority: () => 10,
      isAvailable: () => true,
      getContext: () => { throw new Error('fail'); },
      validate: () => ({ valid: true, issues: [] }),
    };
    registry.registerProvider(createSystemProvider());
    registry.registerProvider(failingProvider);
    const context = await builder.build('FREE');
    expect(context.system).toBeDefined();
  });

  it('validateContext validates a given context', () => {
    const validContext: AIContext = {
      metadata: {
        contextId: 'test',
        timestamp: new Date().toISOString(),
        contextVersion: '1.0.0',
        appVersion: '1.0.0',
        platform: 'win32',
        language: 'en-US',
        currentPlan: 'FREE',
        generationTimeMs: 5,
      },
      provenance: [createProvenance('test', '1.0.0')],
    };
    const result = builder.validateContext(validContext);
    expect(result.valid).toBe(true);
  });

  it('build with disabled cache always rebuilds', async () => {
    const noCacheConfig = createConfig({ cacheEnabled: false });
    const noCacheBuilder = new AIContextBuilder(
      registry, aggregator, validator, cache, noCacheConfig,
    );
    registry.registerProvider(createSystemProvider());
    const ctx1 = await noCacheBuilder.build('FREE');
    const ctx2 = await noCacheBuilder.build('FREE');
    expect(ctx1).not.toBe(ctx2);
  });
});

// ── Manager ──────────────────────────────────────────────────

describe('AIContextManager', () => {
  let manager: AIContextManager;

  beforeEach(() => {
    manager = new AIContextManager({ cacheTtlMs: 30_000 });
  });

  it('starts with no context', () => {
    expect(manager.getLastContext()).toBeNull();
  });

  it('buildContext returns context', async () => {
    manager.registerProvider(createSystemProvider());
    const context = await manager.buildContext();
    expect(context.metadata).toBeDefined();
    expect(context.system).toBeDefined();
  });

  it('getContext builds if not built', async () => {
    manager.registerProvider(createSystemProvider());
    const context = await manager.getContext();
    expect(context).toBeDefined();
    expect(context.system).toBeDefined();
  });

  it('getContext returns cached context', async () => {
    manager.registerProvider(createSystemProvider());
    const ctx1 = await manager.getContext();
    const ctx2 = await manager.getContext();
    expect(ctx1).toBe(ctx2);
  });

  it('refreshContext forces rebuild', async () => {
    manager.registerProvider(createSystemProvider());
    const ctx1 = await manager.buildContext();
    const ctx2 = await manager.refreshContext();
    expect(ctx1).not.toBe(ctx2);
  });

  it('clearCache clears the cache', async () => {
    manager.registerProvider(createSystemProvider());
    await manager.buildContext();
    manager.clearCache();
    // Next build should not use cache
    const ctx = await manager.buildContext();
    expect(ctx).toBeDefined();
  });

  it('registerProvider adds provider', () => {
    expect(manager.registerProvider(createSystemProvider())).toBe(true);
    expect(manager.getProviders()).toHaveLength(1);
  });

  it('unregisterProvider removes provider', () => {
    manager.registerProvider(createSystemProvider());
    expect(manager.unregisterProvider('system-provider')).toBe(true);
    expect(manager.getProviders()).toHaveLength(0);
  });

  it('getProviders returns all providers', () => {
    manager.registerProvider(createSystemProvider());
    manager.registerProvider(createHealthProvider());
    expect(manager.getProviders()).toHaveLength(2);
  });

  it('getProviderNames returns names', () => {
    manager.registerProvider(createSystemProvider());
    manager.registerProvider(createHealthProvider());
    expect(manager.getProviderNames()).toContain('system-provider');
    expect(manager.getProviderNames()).toContain('health-provider');
  });

  it('validateContext validates', () => {
    const validContext: AIContext = {
      metadata: {
        contextId: 'test',
        timestamp: new Date().toISOString(),
        contextVersion: '1.0.0',
        appVersion: '1.0.0',
        platform: 'win32',
        language: 'en-US',
        currentPlan: 'FREE',
        generationTimeMs: 5,
      },
      provenance: [createProvenance('test', '1.0.0')],
    };
    const result = manager.validateContext(validContext);
    expect(result.valid).toBe(true);
  });

  it('getContextStatistics returns stats', async () => {
    manager.registerProvider(createSystemProvider());
    manager.registerProvider(createHealthProvider());
    await manager.buildContext();
    const stats = manager.getContextStatistics();
    expect(stats.totalProviders).toBe(2);
    expect(stats.activeProviders).toBe(2);
    expect(stats.sectionsPresent).toContain('system');
    expect(stats.sectionsPresent).toContain('health');
    expect(stats.sectionsMissing).not.toContain('system');
  });

  it('getContextStatistics with no context shows all missing', () => {
    const stats = manager.getContextStatistics();
    expect(stats.sectionsMissing).toHaveLength(17);
    expect(stats.sectionsPresent).toHaveLength(0);
  });

  it('setCurrentPlan updates plan', async () => {
    manager.setCurrentPlan('PRO');
    manager.registerProvider(createSystemProvider());
    const context = await manager.buildContext();
    expect(context.metadata.currentPlan).toBe('PRO');
  });

  it('getCurrentPlan returns current plan', () => {
    manager.setCurrentPlan('ULTIMATE');
    expect(manager.getCurrentPlan()).toBe('ULTIMATE');
  });

  it('updateConfig updates configuration', async () => {
    manager.updateConfig({ cacheTtlMs: 60_000 });
    manager.registerProvider(createSystemProvider());
    const context = await manager.buildContext();
    expect(context).toBeDefined();
  });

  it('getRegistry returns registry', () => {
    expect(manager.getRegistry()).toBeDefined();
  });

  it('getCache returns cache', () => {
    expect(manager.getCache()).toBeDefined();
  });

  it('getValidator returns validator', () => {
    expect(manager.getValidator()).toBeDefined();
  });

  it('registering a provider clears cache', async () => {
    manager.registerProvider(createSystemProvider());
    await manager.buildContext();
    manager.registerProvider(createHealthProvider());
    // Cache should be cleared, so next build should be fresh
    const ctx = await manager.buildContext();
    expect(ctx.system).toBeDefined();
    expect(ctx.health).toBeDefined();
  });

  it('unregistering a provider clears cache', async () => {
    manager.registerProvider(createSystemProvider());
    manager.registerProvider(createHealthProvider());
    await manager.buildContext();
    manager.unregisterProvider('health-provider');
    const ctx = await manager.buildContext();
    expect(ctx.system).toBeDefined();
    expect(ctx.health).toBeUndefined();
  });

  it('getContextStatistics includes provenance stats', async () => {
    manager.registerProvider(createSystemProvider());
    manager.registerProvider(createHealthProvider());
    await manager.buildContext();
    const stats = manager.getContextStatistics();
    expect(stats.averageConfidence).toBeGreaterThan(0);
    expect(stats.totalEvidencePieces).toBeGreaterThanOrEqual(0);
  });
});

// ── Traceability ─────────────────────────────────────────────

describe('Traceability (Never Invent Principle)', () => {
  it('every context section has provenance', async () => {
    const manager = new AIContextManager();
    manager.registerProvider(createSystemProvider());
    manager.registerProvider(createHealthProvider());
    const context = await manager.buildContext();

    expect(context.provenance).toHaveLength(2);
    for (const prov of context.provenance) {
      expect(prov.providerName).toBeDefined();
      expect(prov.providerVersion).toBeDefined();
      expect(prov.collectedAt).toBeDefined();
      expect(prov.confidence).toBeGreaterThanOrEqual(0);
      expect(prov.confidence).toBeLessThanOrEqual(1);
      expect(Array.isArray(prov.evidence)).toBe(true);
    }
  });

  it('confidence is tracked per provider', async () => {
    const manager = new AIContextManager();
    const provider = createMockProvider('low-conf', { system: {} }, { confidence: 0.3 });
    manager.registerProvider(provider);
    const context = await manager.buildContext();
    expect(context.provenance[0]!.confidence).toBe(0.3);
  });

  it('evidence is tracked per provider', async () => {
    const manager = new AIContextManager();
    const evidence = [
      { source: 'WMI', metric: 'os_version', value: 'Windows 11', timestamp: new Date().toISOString() },
      { source: 'WMI', metric: 'cpu_cores', value: 8, timestamp: new Date().toISOString() },
    ];
    const provider = createMockProvider('ev-provider', { system: {} }, { evidence });
    manager.registerProvider(provider);
    const context = await manager.buildContext();
    expect(context.provenance[0]!.evidence).toHaveLength(2);
  });

  it('statistics include average confidence', async () => {
    const manager = new AIContextManager();
    manager.registerProvider(createMockProvider('p1', { system: {} }, { confidence: 0.8 }));
    manager.registerProvider(createMockProvider('p2', { health: {} }, { confidence: 0.6 }));
    await manager.buildContext();
    const stats = manager.getContextStatistics();
    expect(stats.averageConfidence).toBeCloseTo(0.7, 1);
  });

  it('statistics include total evidence pieces', async () => {
    const manager = new AIContextManager();
    const ev1 = [{ source: 's1', metric: 'm1', value: 'v1', timestamp: new Date().toISOString() }];
    const ev2 = [
      { source: 's2', metric: 'm2', value: 'v2', timestamp: new Date().toISOString() },
      { source: 's3', metric: 'm3', value: 42, timestamp: new Date().toISOString() },
    ];
    manager.registerProvider(createMockProvider('p1', { system: {} }, { evidence: ev1 }));
    manager.registerProvider(createMockProvider('p2', { health: {} }, { evidence: ev2 }));
    await manager.buildContext();
    const stats = manager.getContextStatistics();
    expect(stats.totalEvidencePieces).toBe(3);
  });
});

// ── Regression ───────────────────────────────────────────────

describe('Regression', () => {
  it('all exports are defined', async () => {
    const mod = await import('../index');
    expect(mod.AIContextManager).toBeDefined();
    expect(mod.aiContextManager).toBeDefined();
    expect(mod.AIContextBuilder).toBeDefined();
    expect(mod.AIContextRegistry).toBeDefined();
    expect(mod.AIContextAggregator).toBeDefined();
    expect(mod.AIContextValidator).toBeDefined();
    expect(mod.AIContextCache).toBeDefined();
    expect(mod.AIContextEventEmitter).toBeDefined();
    expect(mod.aiContextEvents).toBeDefined();
    expect(mod.DEFAULT_CONTEXT_CONFIG).toBeDefined();
    expect(mod.CONTEXT_SECTIONS).toBeDefined();
  });

  it('full integration: multiple providers', async () => {
    const manager = new AIContextManager();
    manager.registerProvider(createSystemProvider());
    manager.registerProvider(createHealthProvider());
    manager.registerProvider(createStorageProvider());
    manager.setCurrentPlan('PRO');

    const context = await manager.buildContext();
    expect(context.metadata.currentPlan).toBe('PRO');
    expect(context.system).toBeDefined();
    expect(context.health).toBeDefined();
    expect(context.storage).toBeDefined();
    expect(context.provenance).toHaveLength(3);
  });

  it('full integration: provider failure does not break others', async () => {
    const manager = new AIContextManager();
    const failingProvider: AIContextProvider = {
      getProviderName: () => 'failing',
      getVersion: () => '1.0.0',
      getPriority: () => 10,
      isAvailable: () => true,
      getContext: () => { throw new Error('fail'); },
      validate: () => ({ valid: true, issues: [] }),
    };
    manager.registerProvider(createSystemProvider());
    manager.registerProvider(failingProvider);
    manager.registerProvider(createHealthProvider());

    const context = await manager.buildContext();
    expect(context.system).toBeDefined();
    expect(context.health).toBeDefined();
  });

  it('full integration: cache works across calls', async () => {
    const manager = new AIContextManager({ cacheTtlMs: 60_000 });
    manager.registerProvider(createSystemProvider());

    const ctx1 = await manager.buildContext();
    const ctx2 = await manager.buildContext();
    expect(ctx1).toBe(ctx2); // Same cached object
  });

  it('full integration: refresh creates new context', async () => {
    const manager = new AIContextManager();
    manager.registerProvider(createSystemProvider());

    const ctx1 = await manager.buildContext();
    const ctx2 = await manager.refreshContext();
    expect(ctx1.metadata.contextId).not.toBe(ctx2.metadata.contextId);
  });

  it('full integration: statistics are accurate', async () => {
    const manager = new AIContextManager();
    manager.registerProvider(createSystemProvider());
    manager.registerProvider(createHealthProvider());
    await manager.buildContext();

    const stats = manager.getContextStatistics();
    expect(stats.totalProviders).toBe(2);
    expect(stats.activeProviders).toBe(2);
    expect(stats.failedProviders).toBe(0);
    expect(stats.sectionsPresent.length).toBeGreaterThan(0);
  });

  it('full integration: unregistering provider removes section', async () => {
    const manager = new AIContextManager();
    manager.registerProvider(createSystemProvider());
    manager.registerProvider(createHealthProvider());
    await manager.buildContext();

    manager.unregisterProvider('health-provider');
    const context = await manager.buildContext();
    expect(context.system).toBeDefined();
    expect(context.health).toBeUndefined();
  });

  it('full integration: config update affects behavior', async () => {
    const manager = new AIContextManager({ cacheEnabled: false });
    manager.registerProvider(createSystemProvider());

    const ctx1 = await manager.buildContext();
    const ctx2 = await manager.buildContext();
    expect(ctx1).not.toBe(ctx2); // No caching
  });
});

// ── Performance ──────────────────────────────────────────────

describe('Performance', () => {
  it('cached build is fast', async () => {
    const manager = new AIContextManager({ cacheTtlMs: 60_000 });
    manager.registerProvider(createSystemProvider());
    manager.registerProvider(createHealthProvider());
    manager.registerProvider(createStorageProvider());

    // First build (cold)
    await manager.buildContext();

    // Second build (cached)
    const start = performance.now();
    await manager.buildContext();
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50); // Should be well under 100ms
  });

  it('build with sync providers is fast', async () => {
    const manager = new AIContextManager({ cacheEnabled: false });
    for (let i = 0; i < 10; i++) {
      manager.registerProvider(createMockProvider(`provider-${i}`, { [`section_${i}`]: { data: i } }));
    }

    const start = performance.now();
    await manager.buildContext();
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
  });
});

// ── Edge Cases ───────────────────────────────────────────────

describe('Edge Cases', () => {
  it('build with no providers returns metadata-only context', async () => {
    const manager = new AIContextManager();
    const context = await manager.buildContext();
    expect(context.metadata).toBeDefined();
    expect(context.provenance).toEqual([]);
  });

  it('provider returning null context is handled', async () => {
    const nullProvider: AIContextProvider = {
      getProviderName: () => 'null-provider',
      getVersion: () => '1.0.0',
      getPriority: () => 10,
      isAvailable: () => true,
      getContext: () => null as unknown as Record<string, unknown>,
      validate: () => ({ valid: true, issues: [] }),
    };
    const manager = new AIContextManager();
    manager.registerProvider(nullProvider);
    manager.registerProvider(createSystemProvider());
    const context = await manager.buildContext();
    expect(context.system).toBeDefined();
  });

  it('provider returning empty object is handled', async () => {
    const emptyProvider = createMockProvider('empty', {});
    const manager = new AIContextManager();
    manager.registerProvider(emptyProvider);
    const context = await manager.buildContext();
    expect(context.metadata).toBeDefined();
    // Empty provider contributes nothing but still gets provenance
    expect(context.provenance).toHaveLength(1);
  });

  it('duplicate provider names overwrite', async () => {
    const manager = new AIContextManager();
    manager.registerProvider(createMockProvider('dup', { system: { osVersion: 'v1' } }));
    manager.registerProvider(createMockProvider('dup', { system: { osVersion: 'v2' } }));
    expect(manager.getProviders()).toHaveLength(1);
    const context = await manager.buildContext();
    expect((context.system as { osVersion: string }).osVersion).toBe('v2');
  });

  it('unknown plan is handled', async () => {
    const manager = new AIContextManager();
    manager.setCurrentPlan('UNKNOWN_PLAN');
    manager.registerProvider(createSystemProvider());
    const context = await manager.buildContext();
    expect(context.metadata.currentPlan).toBe('UNKNOWN_PLAN');
  });

  it('clearing cache and rebuilding works', async () => {
    const manager = new AIContextManager();
    manager.registerProvider(createSystemProvider());
    await manager.buildContext();
    manager.clearCache();
    const context = await manager.buildContext();
    expect(context).toBeDefined();
    expect(context.system).toBeDefined();
  });

  it('multiple rapid builds with cache return same context', async () => {
    const manager = new AIContextManager({ cacheTtlMs: 60_000 });
    manager.registerProvider(createSystemProvider());
    const ctx1 = await manager.buildContext();
    const ctx2 = await manager.buildContext();
    const ctx3 = await manager.buildContext();
    // All should be the same cached object
    expect(ctx1).toBe(ctx2);
    expect(ctx2).toBe(ctx3);
  });
});
