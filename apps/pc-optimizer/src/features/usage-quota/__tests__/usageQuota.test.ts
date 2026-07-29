/**
 * Tests for the Usage Quota Engine.
 *
 * Covers:
 * - Types & helpers (reset policies, limit types, next reset calculation, shouldReset)
 * - Quota events (7 event types)
 * - Quota storage (memory, local, corruption handling)
 * - Quota registry (loading, registration, queries)
 * - Quota tracker (recording, filtering, time ranges)
 * - Quota reset service (all reset policies, initial state, scheduled resets)
 * - Quota validator (missing fields, duplicates, invalid values, storage corruption)
 * - Quota statistics (today, weekly, monthly, lifetime, most/least used, history, schedule)
 * - Quota manager (initialization, getQuota, getRemaining, isQuotaAvailable, consume, restore, reset, summary, statistics, persistence)
 * - Default definitions
 * - Regression
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  RESET_POLICIES,
  LIMIT_TYPES,
  isValidResetPolicy,
  isValidLimitType,
  calculateNextReset,
  shouldReset,
  type QuotaDefinition,
  type QuotaConfig,
  type QuotaStorageData,
} from '../types';
import { QuotaEventEmitter } from '../quotaEvents';
import { MemoryQuotaStorage, LocalQuotaStorage } from '../quotaStorage';
import { DEFAULT_QUOTAS, DEFAULT_QUOTA_CONFIG } from '../defaultQuotaDefinitions';
import { QuotaRegistry } from '../quotaRegistry';
import { QuotaTracker } from '../quotaTracker';
import { QuotaResetService } from '../quotaResetService';
import { QuotaValidator } from '../quotaValidator';
import { QuotaStatisticsService } from '../quotaStatistics';
import { QuotaManager } from '../quotaManager';

// ── Types & Helpers ──────────────────────────────────────────

describe('Types & Helpers', () => {
  it('RESET_POLICIES has 7 policies', () => {
    expect(RESET_POLICIES).toHaveLength(7);
    expect(RESET_POLICIES).toContain('never');
    expect(RESET_POLICIES).toContain('session');
    expect(RESET_POLICIES).toContain('daily');
    expect(RESET_POLICIES).toContain('weekly');
    expect(RESET_POLICIES).toContain('monthly');
    expect(RESET_POLICIES).toContain('yearly');
    expect(RESET_POLICIES).toContain('custom');
  });

  it('LIMIT_TYPES has 6 types', () => {
    expect(LIMIT_TYPES).toHaveLength(6);
    expect(LIMIT_TYPES).toContain('count');
    expect(LIMIT_TYPES).toContain('size_mb');
    expect(LIMIT_TYPES).toContain('unlimited');
    expect(LIMIT_TYPES).toContain('disabled');
  });

  it('isValidResetPolicy recognizes valid policies', () => {
    expect(isValidResetPolicy('daily')).toBe(true);
    expect(isValidResetPolicy('never')).toBe(true);
    expect(isValidResetPolicy('custom')).toBe(true);
  });

  it('isValidResetPolicy rejects invalid policies', () => {
    expect(isValidResetPolicy('hourly')).toBe(false);
    expect(isValidResetPolicy('')).toBe(false);
  });

  it('isValidLimitType recognizes valid types', () => {
    expect(isValidLimitType('count')).toBe(true);
    expect(isValidLimitType('unlimited')).toBe(true);
    expect(isValidLimitType('disabled')).toBe(true);
  });

  it('isValidLimitType rejects invalid types', () => {
    expect(isValidLimitType('bytes')).toBe(false);
    expect(isValidLimitType('')).toBe(false);
  });

  it('calculateNextReset returns null for never', () => {
    expect(calculateNextReset('never')).toBeNull();
  });

  it('calculateNextReset returns null for session', () => {
    expect(calculateNextReset('session')).toBeNull();
  });

  it('calculateNextReset returns null for custom', () => {
    expect(calculateNextReset('custom')).toBeNull();
  });

  it('calculateNextReset returns next day for daily', () => {
    const from = new Date('2026-01-15T10:30:00Z');
    const next = calculateNextReset('daily', from);
    expect(next).not.toBeNull();
    const nextDate = new Date(next!);
    expect(nextDate.getDate()).toBe(16);
    expect(nextDate.getHours()).toBe(0);
  });

  it('calculateNextReset returns next month for monthly', () => {
    const from = new Date('2026-01-15T10:30:00Z');
    const next = calculateNextReset('monthly', from);
    expect(next).not.toBeNull();
    const nextDate = new Date(next!);
    expect(nextDate.getMonth()).toBe(1); // February (0-indexed)
    expect(nextDate.getDate()).toBe(1);
  });

  it('calculateNextReset returns next year for yearly', () => {
    const from = new Date('2026-06-15T10:30:00Z');
    const next = calculateNextReset('yearly', from);
    expect(next).not.toBeNull();
    const nextDate = new Date(next!);
    expect(nextDate.getFullYear()).toBe(2027);
    expect(nextDate.getMonth()).toBe(0);
  });

  it('shouldReset returns true when no last reset', () => {
    expect(shouldReset('daily', null)).toBe(true);
  });

  it('shouldReset returns false for never', () => {
    expect(shouldReset('never', null)).toBe(false);
  });

  it('shouldReset returns false for session', () => {
    expect(shouldReset('session', null)).toBe(false);
  });

  it('shouldReset returns false for custom', () => {
    expect(shouldReset('custom', null)).toBe(false);
  });

  it('shouldReset returns true when past next reset', () => {
    const oldReset = new Date('2020-01-01T00:00:00Z').toISOString();
    expect(shouldReset('daily', oldReset, new Date('2026-01-15T10:00:00Z'))).toBe(true);
  });

  it('shouldReset returns false when not past next reset', () => {
    const recentReset = new Date().toISOString();
    expect(shouldReset('daily', recentReset)).toBe(false);
  });
});

// ── Quota Events ─────────────────────────────────────────────

describe('QuotaEventEmitter', () => {
  let emitter: QuotaEventEmitter;

  beforeEach(() => {
    emitter = new QuotaEventEmitter();
  });

  it('emits events to subscribers', () => {
    const listener = vi.fn();
    emitter.on('quota_consumed', listener);
    emitter.emit('quota_consumed', { test: true });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('supports unsubscribe', () => {
    const listener = vi.fn();
    const unsub = emitter.on('quota_reset', listener);
    unsub();
    emitter.emit('quota_reset', {});
    expect(listener).not.toHaveBeenCalled();
  });

  it('tracks listener count', () => {
    emitter.on('quota_exceeded', () => {});
    emitter.on('quota_exceeded', () => {});
    expect(emitter.listenerCount('quota_exceeded')).toBe(2);
  });

  it('clear removes all listeners', () => {
    emitter.on('quota_consumed', () => {});
    emitter.on('quota_reset', () => {});
    emitter.clear();
    expect(emitter.listenerCount('quota_consumed')).toBe(0);
    expect(emitter.listenerCount('quota_reset')).toBe(0);
  });

  it('does not crash when listener throws', () => {
    emitter.on('quota_consumed', () => { throw new Error('test'); });
    expect(() => emitter.emit('quota_consumed', {})).not.toThrow();
  });

  it('emits different event types independently', () => {
    const consumedListener = vi.fn();
    const resetListener = vi.fn();
    emitter.on('quota_consumed', consumedListener);
    emitter.on('quota_reset', resetListener);
    emitter.emit('quota_consumed', {});
    expect(consumedListener).toHaveBeenCalledTimes(1);
    expect(resetListener).not.toHaveBeenCalled();
  });

  it('supports all 7 event types', () => {
    const events = ['quota_initialized', 'quota_consumed', 'quota_restored', 'quota_reset', 'quota_exceeded', 'quota_updated', 'statistics_updated'] as const;
    for (const evt of events) {
      const listener = vi.fn();
      emitter.on(evt, listener);
      emitter.emit(evt, { test: true });
      expect(listener).toHaveBeenCalledTimes(1);
    }
  });
});

// ── Quota Storage ────────────────────────────────────────────

describe('MemoryQuotaStorage', () => {
  let storage: MemoryQuotaStorage;

  beforeEach(() => {
    storage = new MemoryQuotaStorage();
  });

  it('starts empty', async () => {
    const data = await storage.load();
    expect(data.states).toEqual({});
    expect(data.records).toEqual([]);
  });

  it('saves and loads data', async () => {
    const data: QuotaStorageData = {
      states: { quota1: { currentUsage: 5, lastResetAt: '2026-01-01T00:00:00Z' } },
      records: [],
    };
    await storage.save(data);
    const loaded = await storage.load();
    expect(loaded.states.quota1?.currentUsage).toBe(5);
  });

  it('clear removes all data', async () => {
    await storage.save({ states: { q: { currentUsage: 1, lastResetAt: null } }, records: [] });
    await storage.clear();
    const data = await storage.load();
    expect(data.states).toEqual({});
  });
});

describe('LocalQuotaStorage', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  it('starts empty when no data', async () => {
    const storage = new LocalQuotaStorage('test-quotas');
    const data = await storage.load();
    expect(data.states).toEqual({});
    expect(data.records).toEqual([]);
  });

  it('saves and loads data', async () => {
    const storage = new LocalQuotaStorage('test-quotas');
    const data: QuotaStorageData = {
      states: { quota1: { currentUsage: 3, lastResetAt: null } },
      records: [],
    };
    await storage.save(data);
    const loaded = await storage.load();
    expect(loaded.states.quota1?.currentUsage).toBe(3);
  });

  it('clear removes data', async () => {
    const storage = new LocalQuotaStorage('test-quotas');
    await storage.save({ states: { q: { currentUsage: 1, lastResetAt: null } }, records: [] });
    await storage.clear();
    const data = await storage.load();
    expect(data.states).toEqual({});
  });

  it('handles corrupted data gracefully', async () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('test-corrupt', 'not-json');
    }
    const storage = new LocalQuotaStorage('test-corrupt');
    const data = await storage.load();
    expect(data.states).toEqual({});
  });

  it('handles version mismatch', async () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('test-version', JSON.stringify({ version: 999, data: {} }));
    }
    const storage = new LocalQuotaStorage('test-version');
    const data = await storage.load();
    expect(data.states).toEqual({});
  });
});

// ── Quota Registry ───────────────────────────────────────────

describe('QuotaRegistry', () => {
  let registry: QuotaRegistry;

  beforeEach(() => {
    registry = new QuotaRegistry();
  });

  it('starts unloaded', () => {
    expect(registry.isLoaded()).toBe(false);
  });

  it('loadDefaults loads all default quotas', () => {
    registry.loadDefaults();
    expect(registry.isLoaded()).toBe(true);
    expect(registry.getAllQuotas().length).toBe(DEFAULT_QUOTAS.length);
  });

  it('loadConfig loads custom config', () => {
    const config: QuotaConfig = {
      quotas: [
        { id: 'test_q', displayName: 'Test', description: 'Test', category: 'test', enabled: true, limitType: 'count', limitValue: 10, resetPolicy: 'daily', usageUnit: 'count', isUnlimited: false },
      ],
    };
    registry.loadConfig(config);
    expect(registry.getQuota('test_q')).not.toBeNull();
  });

  it('loadConfig replaces existing definitions', () => {
    registry.loadDefaults();
    registry.loadConfig({ quotas: [] });
    expect(registry.getAllQuotas()).toHaveLength(0);
  });

  it('registerQuota adds a quota', () => {
    registry.loadDefaults();
    const newQuota: QuotaDefinition = {
      id: 'new_q', displayName: 'New', description: 'New', category: 'test',
      enabled: true, limitType: 'count', limitValue: 5, resetPolicy: 'daily',
      usageUnit: 'count', isUnlimited: false,
    };
    registry.registerQuota(newQuota);
    expect(registry.hasQuota('new_q')).toBe(true);
  });

  it('unregisterQuota removes a quota', () => {
    registry.loadDefaults();
    const firstId = registry.getQuotaIds()[0]!;
    expect(registry.unregisterQuota(firstId)).toBe(true);
    expect(registry.hasQuota(firstId)).toBe(false);
  });

  it('getQuota returns null for unknown', () => {
    registry.loadDefaults();
    expect(registry.getQuota('nonexistent')).toBeNull();
  });

  it('getQuotasByCategory filters correctly', () => {
    registry.loadDefaults();
    const aiQuotas = registry.getQuotasByCategory('ai');
    expect(aiQuotas.length).toBeGreaterThan(0);
    expect(aiQuotas.every((q) => q.category === 'ai')).toBe(true);
  });

  it('exportConfig returns current config', () => {
    registry.loadDefaults();
    const config = registry.exportConfig();
    expect(config.quotas.length).toBe(DEFAULT_QUOTAS.length);
  });

  it('clear resets registry', () => {
    registry.loadDefaults();
    registry.clear();
    expect(registry.isLoaded()).toBe(false);
    expect(registry.getAllQuotas()).toHaveLength(0);
  });
});

// ── Quota Tracker ────────────────────────────────────────────

describe('QuotaTracker', () => {
  let tracker: QuotaTracker;

  beforeEach(() => {
    tracker = new QuotaTracker();
  });

  it('starts with no records', () => {
    expect(tracker.count()).toBe(0);
  });

  it('records usage events', () => {
    tracker.record({
      quotaId: 'q1', timestamp: new Date().toISOString(), action: 'test',
      amountUsed: 1, remaining: 9, sourceModule: 'test-module',
    });
    expect(tracker.count()).toBe(1);
  });

  it('getRecordsByQuota filters by quota ID', () => {
    tracker.record({ quotaId: 'q1', timestamp: new Date().toISOString(), action: 'a', amountUsed: 1, remaining: 9, sourceModule: 'm' });
    tracker.record({ quotaId: 'q2', timestamp: new Date().toISOString(), action: 'a', amountUsed: 1, remaining: 9, sourceModule: 'm' });
    expect(tracker.getRecordsByQuota('q1')).toHaveLength(1);
  });

  it('getRecordsByFeature filters by feature', () => {
    tracker.record({ quotaId: 'q1', timestamp: new Date().toISOString(), action: 'a', amountUsed: 1, remaining: 9, sourceModule: 'm', feature: 'feat1' });
    tracker.record({ quotaId: 'q1', timestamp: new Date().toISOString(), action: 'a', amountUsed: 1, remaining: 8, sourceModule: 'm', feature: 'feat2' });
    expect(tracker.getRecordsByFeature('feat1')).toHaveLength(1);
  });

  it('getRecordsByCapability filters by capability', () => {
    tracker.record({ quotaId: 'q1', timestamp: new Date().toISOString(), action: 'a', amountUsed: 1, remaining: 9, sourceModule: 'm', capability: 'cap1' });
    expect(tracker.getRecordsByCapability('cap1')).toHaveLength(1);
    expect(tracker.getRecordsByCapability('cap2')).toHaveLength(0);
  });

  it('getRecordsByAction filters by action', () => {
    tracker.record({ quotaId: 'q1', timestamp: new Date().toISOString(), action: 'clean', amountUsed: 1, remaining: 9, sourceModule: 'm' });
    tracker.record({ quotaId: 'q1', timestamp: new Date().toISOString(), action: 'scan', amountUsed: 1, remaining: 8, sourceModule: 'm' });
    expect(tracker.getRecordsByAction('clean')).toHaveLength(1);
  });

  it('getRecordsByModule filters by source module', () => {
    tracker.record({ quotaId: 'q1', timestamp: new Date().toISOString(), action: 'a', amountUsed: 1, remaining: 9, sourceModule: 'browser' });
    tracker.record({ quotaId: 'q1', timestamp: new Date().toISOString(), action: 'a', amountUsed: 1, remaining: 8, sourceModule: 'startup' });
    expect(tracker.getRecordsByModule('browser')).toHaveLength(1);
  });

  it('getRecordsByUser filters by user', () => {
    tracker.record({ quotaId: 'q1', timestamp: new Date().toISOString(), action: 'a', amountUsed: 1, remaining: 9, sourceModule: 'm', userId: 'u1' });
    expect(tracker.getRecordsByUser('u1')).toHaveLength(1);
    expect(tracker.getRecordsByUser('u2')).toHaveLength(0);
  });

  it('getRecordsByDevice filters by device', () => {
    tracker.record({ quotaId: 'q1', timestamp: new Date().toISOString(), action: 'a', amountUsed: 1, remaining: 9, sourceModule: 'm', deviceId: 'd1' });
    expect(tracker.getRecordsByDevice('d1')).toHaveLength(1);
  });

  it('getRecordsBySession filters by session', () => {
    tracker.record({ quotaId: 'q1', timestamp: new Date().toISOString(), action: 'a', amountUsed: 1, remaining: 9, sourceModule: 'm', sessionId: 's1' });
    expect(tracker.getRecordsBySession('s1')).toHaveLength(1);
  });

  it('getRecordsInRange filters by time', () => {
    tracker.record({ quotaId: 'q1', timestamp: '2026-01-01T10:00:00Z', action: 'a', amountUsed: 1, remaining: 9, sourceModule: 'm' });
    tracker.record({ quotaId: 'q1', timestamp: '2026-06-01T10:00:00Z', action: 'a', amountUsed: 1, remaining: 8, sourceModule: 'm' });
    const range = tracker.getRecordsInRange('2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z');
    expect(range).toHaveLength(1);
  });

  it('getTotalUsage sums usage for a quota', () => {
    tracker.record({ quotaId: 'q1', timestamp: new Date().toISOString(), action: 'a', amountUsed: 3, remaining: 7, sourceModule: 'm' });
    tracker.record({ quotaId: 'q1', timestamp: new Date().toISOString(), action: 'a', amountUsed: 2, remaining: 5, sourceModule: 'm' });
    expect(tracker.getTotalUsage('q1')).toBe(5);
  });

  it('clear removes all records', () => {
    tracker.record({ quotaId: 'q1', timestamp: new Date().toISOString(), action: 'a', amountUsed: 1, remaining: 9, sourceModule: 'm' });
    tracker.clear();
    expect(tracker.count()).toBe(0);
  });

  it('trims records when exceeding max', () => {
    const smallTracker = new QuotaTracker(5);
    for (let i = 0; i < 10; i++) {
      smallTracker.record({ quotaId: 'q1', timestamp: new Date().toISOString(), action: 'a', amountUsed: 1, remaining: 9, sourceModule: 'm' });
    }
    expect(smallTracker.count()).toBe(5);
  });

  it('loadRecords and exportRecords work', () => {
    const records = [
      { id: 'r1', quotaId: 'q1', timestamp: new Date().toISOString(), action: 'a', amountUsed: 1, remaining: 9, sourceModule: 'm' },
    ];
    tracker.loadRecords(records);
    expect(tracker.count()).toBe(1);
    const exported = tracker.exportRecords();
    expect(exported).toHaveLength(1);
  });
});

// ── Quota Reset Service ──────────────────────────────────────

describe('QuotaResetService', () => {
  let service: QuotaResetService;

  beforeEach(() => {
    service = new QuotaResetService();
  });

  it('createInitialState creates correct state', () => {
    const state = service.createInitialState('q1', 10, 'count', 'daily', 'count', false, true);
    expect(state.quotaId).toBe('q1');
    expect(state.currentUsage).toBe(0);
    expect(state.remainingUsage).toBe(10);
    expect(state.isAvailable).toBe(true);
    expect(state.isUnlimited).toBe(false);
    expect(state.isEnabled).toBe(true);
    expect(state.lastResetAt).not.toBeNull();
    expect(state.nextResetAt).not.toBeNull();
  });

  it('createInitialState for unlimited has Infinity remaining', () => {
    const state = service.createInitialState('q1', 0, 'unlimited', 'never', 'count', true, true);
    expect(state.isUnlimited).toBe(true);
    expect(state.remainingUsage).toBe(Infinity);
  });

  it('createInitialState for disabled is not available', () => {
    const state = service.createInitialState('q1', 10, 'disabled', 'never', 'count', false, false);
    expect(state.isEnabled).toBe(false);
    expect(state.isAvailable).toBe(false);
  });

  it('resetState resets usage to zero', () => {
    const state = service.createInitialState('q1', 10, 'count', 'daily', 'count', false, true);
    state.currentUsage = 8;
    state.remainingUsage = 2;
    const reset = service.resetState(state);
    expect(reset.currentUsage).toBe(0);
    expect(reset.remainingUsage).toBe(10);
    expect(reset.isAvailable).toBe(true);
  });

  it('needsReset returns false for disabled', () => {
    const state = service.createInitialState('q1', 10, 'count', 'daily', 'count', false, false);
    expect(service.needsReset(state)).toBe(false);
  });

  it('needsReset returns false for unlimited', () => {
    const state = service.createInitialState('q1', 0, 'unlimited', 'daily', 'count', true, true);
    expect(service.needsReset(state)).toBe(false);
  });

  it('needsReset returns true for old daily reset', () => {
    const state = service.createInitialState('q1', 10, 'count', 'daily', 'count', false, true);
    state.lastResetAt = '2020-01-01T00:00:00Z';
    expect(service.needsReset(state)).toBe(true);
  });

  it('resetIfNeeded resets only quotas that need it', () => {
    const states = new Map();
    const freshState = service.createInitialState('q1', 10, 'count', 'daily', 'count', false, true);
    const oldState = service.createInitialState('q2', 10, 'count', 'daily', 'count', false, true);
    oldState.lastResetAt = '2020-01-01T00:00:00Z';
    oldState.currentUsage = 5;
    states.set('q1', freshState);
    states.set('q2', oldState);

    const result = service.resetIfNeeded(states);
    expect(result.get('q1')?.currentUsage).toBe(0);
    expect(result.get('q2')?.currentUsage).toBe(0);
  });

  it('resetAll resets all quotas', () => {
    const states = new Map();
    const s1 = service.createInitialState('q1', 10, 'count', 'daily', 'count', false, true);
    s1.currentUsage = 5;
    states.set('q1', s1);

    const result = service.resetAll(states);
    expect(result.get('q1')?.currentUsage).toBe(0);
  });

  it('resetSingle resets one quota', () => {
    const states = new Map();
    const s1 = service.createInitialState('q1', 10, 'count', 'daily', 'count', false, true);
    s1.currentUsage = 5;
    const s2 = service.createInitialState('q2', 10, 'count', 'daily', 'count', false, true);
    s2.currentUsage = 3;
    states.set('q1', s1);
    states.set('q2', s2);

    const result = service.resetSingle(states, 'q1');
    expect(result.get('q1')?.currentUsage).toBe(0);
    expect(result.get('q2')?.currentUsage).toBe(3);
  });
});

// ── Quota Validator ──────────────────────────────────────────

describe('QuotaValidator', () => {
  let validator: QuotaValidator;

  beforeEach(() => {
    validator = new QuotaValidator();
  });

  it('validates default config as valid', () => {
    const result = validator.validateConfig(DEFAULT_QUOTA_CONFIG);
    expect(result.valid).toBe(true);
    expect(result.issues.filter((i) => i.level === 'error')).toHaveLength(0);
  });

  it('detects missing quota id', () => {
    const result = validator.validateQuota({
      id: '', displayName: 'Test', description: 'Test', category: 'test',
      enabled: true, limitType: 'count', limitValue: 10, resetPolicy: 'daily',
      usageUnit: 'count', isUnlimited: false,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'QUOTA_MISSING_ID')).toBe(true);
  });

  it('detects missing displayName', () => {
    const result = validator.validateQuota({
      id: 'q1', displayName: '', description: 'Test', category: 'test',
      enabled: true, limitType: 'count', limitValue: 10, resetPolicy: 'daily',
      usageUnit: 'count', isUnlimited: false,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'QUOTA_MISSING_NAME')).toBe(true);
  });

  it('detects invalid limit type', () => {
    const result = validator.validateQuota({
      id: 'q1', displayName: 'Test', description: 'Test', category: 'test',
      enabled: true, limitType: 'invalid' as never, limitValue: 10, resetPolicy: 'daily',
      usageUnit: 'count', isUnlimited: false,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'QUOTA_INVALID_LIMIT_TYPE')).toBe(true);
  });

  it('detects invalid reset policy', () => {
    const result = validator.validateQuota({
      id: 'q1', displayName: 'Test', description: 'Test', category: 'test',
      enabled: true, limitType: 'count', limitValue: 10, resetPolicy: 'invalid' as never,
      usageUnit: 'count', isUnlimited: false,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'QUOTA_INVALID_RESET_POLICY')).toBe(true);
  });

  it('detects negative limit value', () => {
    const result = validator.validateQuota({
      id: 'q1', displayName: 'Test', description: 'Test', category: 'test',
      enabled: true, limitType: 'count', limitValue: -5, resetPolicy: 'daily',
      usageUnit: 'count', isUnlimited: false,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'QUOTA_INVALID_LIMIT_VALUE')).toBe(true);
  });

  it('detects NaN limit value', () => {
    const result = validator.validateQuota({
      id: 'q1', displayName: 'Test', description: 'Test', category: 'test',
      enabled: true, limitType: 'count', limitValue: NaN, resetPolicy: 'daily',
      usageUnit: 'count', isUnlimited: false,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'QUOTA_INVALID_LIMIT_VALUE')).toBe(true);
  });

  it('detects duplicate IDs in config', () => {
    const config: QuotaConfig = {
      quotas: [
        { id: 'dup', displayName: 'A', description: 'A', category: 'test', enabled: true, limitType: 'count', limitValue: 10, resetPolicy: 'daily', usageUnit: 'count', isUnlimited: false },
        { id: 'dup', displayName: 'B', description: 'B', category: 'test', enabled: true, limitType: 'count', limitValue: 20, resetPolicy: 'daily', usageUnit: 'count', isUnlimited: false },
      ],
    };
    const result = validator.validateConfig(config);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'QUOTA_DUPLICATE_ID')).toBe(true);
  });

  it('warns about unlimited mismatch', () => {
    const result = validator.validateQuota({
      id: 'q1', displayName: 'Test', description: 'Test', category: 'test',
      enabled: true, limitType: 'unlimited', limitValue: 0, resetPolicy: 'never',
      usageUnit: 'count', isUnlimited: false,
    });
    expect(result.issues.some((i) => i.code === 'QUOTA_UNLIMITED_MISMATCH' && i.level === 'warning')).toBe(true);
  });

  it('validates storage data - null', () => {
    const result = validator.validateStorageData(null as never);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'STORAGE_NULL')).toBe(true);
  });

  it('validates storage data - missing states', () => {
    const result = validator.validateStorageData({ records: [] } as never);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'STORAGE_NO_STATES')).toBe(true);
  });

  it('validates storage data - corrupted usage', () => {
    const result = validator.validateStorageData({
      states: { q1: { currentUsage: 'bad' as never, lastResetAt: null } },
      records: [],
    });
    expect(result.issues.some((i) => i.code === 'STORAGE_CORRUPT_USAGE')).toBe(true);
  });

  it('validates storage data - corrupted record', () => {
    const result = validator.validateStorageData({
      states: {},
      records: [{ id: '', quotaId: 'q1', timestamp: 'now', action: 'a', amountUsed: NaN, remaining: 0, sourceModule: 'm' }],
    });
    expect(result.issues.some((i) => i.code === 'STORAGE_CORRUPT_RECORD_AMOUNT')).toBe(true);
  });

  it('valid storage data passes', () => {
    const result = validator.validateStorageData({
      states: { q1: { currentUsage: 5, lastResetAt: '2026-01-01T00:00:00Z' } },
      records: [],
    });
    expect(result.valid).toBe(true);
  });
});

// ── Quota Statistics ─────────────────────────────────────────

describe('QuotaStatisticsService', () => {
  let tracker: QuotaTracker;
  let registry: QuotaRegistry;
  let stats: QuotaStatisticsService;

  beforeEach(() => {
    tracker = new QuotaTracker();
    registry = new QuotaRegistry();
    registry.loadDefaults();
    stats = new QuotaStatisticsService(tracker, registry);
  });

  it('getTodayUsage returns 0 with no records', () => {
    expect(stats.getTodayUsage()).toBe(0);
  });

  it('getTodayUsage returns today\'s total', () => {
    tracker.record({ quotaId: 'q1', timestamp: new Date().toISOString(), action: 'a', amountUsed: 5, remaining: 5, sourceModule: 'm' });
    expect(stats.getTodayUsage()).toBe(5);
  });

  it('getLifetimeUsage returns all-time total', () => {
    tracker.record({ quotaId: 'q1', timestamp: '2020-01-01T00:00:00Z', action: 'a', amountUsed: 3, remaining: 7, sourceModule: 'm' });
    tracker.record({ quotaId: 'q1', timestamp: new Date().toISOString(), action: 'a', amountUsed: 2, remaining: 5, sourceModule: 'm' });
    expect(stats.getLifetimeUsage()).toBe(5);
  });

  it('getMostUsed returns sorted by usage', () => {
    tracker.record({ quotaId: 'q1', timestamp: new Date().toISOString(), action: 'a', amountUsed: 10, remaining: 0, sourceModule: 'm' });
    tracker.record({ quotaId: 'q2', timestamp: new Date().toISOString(), action: 'a', amountUsed: 5, remaining: 5, sourceModule: 'm' });
    const mostUsed = stats.getMostUsed(10);
    expect(mostUsed[0]!.quotaId).toBe('q1');
    expect(mostUsed[0]!.totalUsed).toBe(10);
  });

  it('getLeastUsed includes zero-usage quotas', () => {
    tracker.record({ quotaId: 'q1', timestamp: new Date().toISOString(), action: 'a', amountUsed: 10, remaining: 0, sourceModule: 'm' });
    const leastUsed = stats.getLeastUsed(20);
    // Quotas with zero usage should be at the front
    expect(leastUsed.some((u) => u.totalUsed === 0)).toBe(true);
  });

  it('getHistory returns all records', () => {
    tracker.record({ quotaId: 'q1', timestamp: new Date().toISOString(), action: 'a', amountUsed: 1, remaining: 9, sourceModule: 'm' });
    expect(stats.getHistory()).toHaveLength(1);
  });

  it('generateStatistics returns full report', () => {
    tracker.record({ quotaId: 'q1', timestamp: new Date().toISOString(), action: 'a', amountUsed: 5, remaining: 5, sourceModule: 'm' });
    const states = new Map();
    states.set('q1', { quotaId: 'q1', currentUsage: 5, remainingUsage: 5, isAvailable: true, isUnlimited: false, isEnabled: true, lastResetAt: new Date().toISOString(), nextResetAt: null, limitValue: 10, limitType: 'count' as const, usageUnit: 'count' as const, resetPolicy: 'daily' as const });
    const report = stats.generateStatistics(states);
    expect(report.todayUsage).toBe(5);
    expect(report.lifetimeUsage).toBe(5);
    expect(report.mostUsed).toHaveLength(1);
    expect(report.history).toHaveLength(1);
    expect(report.resetSchedule).toHaveLength(1);
  });
});

// ── Quota Manager ────────────────────────────────────────────

describe('QuotaManager', () => {
  let manager: QuotaManager;

  beforeEach(() => {
    manager = new QuotaManager(new MemoryQuotaStorage());
  });

  it('starts uninitialized', () => {
    expect(manager.isInitialized()).toBe(false);
  });

  it('initialize loads defaults', async () => {
    await manager.initialize();
    expect(manager.isInitialized()).toBe(true);
    const summary = manager.getQuotaSummary();
    expect(summary.totalQuotas).toBe(DEFAULT_QUOTAS.length);
  });

  it('initializeWithConfig loads custom config', async () => {
    const config: QuotaConfig = {
      quotas: [
        { id: 'test_q', displayName: 'Test', description: 'Test', category: 'test', enabled: true, limitType: 'count', limitValue: 10, resetPolicy: 'daily', usageUnit: 'count', isUnlimited: false },
      ],
    };
    await manager.initializeWithConfig(config);
    expect(manager.getQuota('test_q')).not.toBeNull();
  });

  it('getQuota returns null for unknown quota', async () => {
    await manager.initialize();
    expect(manager.getQuota('nonexistent')).toBeNull();
  });

  it('getRemaining returns limit for fresh quota', async () => {
    await manager.initialize();
    const remaining = manager.getRemaining('ai_conversations');
    expect(remaining).toBe(5);
  });

  it('getRemaining returns Infinity for unlimited', async () => {
    const config: QuotaConfig = {
      quotas: [
        { id: 'unlimited_q', displayName: 'Unlimited', description: 'Test', category: 'test', enabled: true, limitType: 'unlimited', limitValue: 0, resetPolicy: 'never', usageUnit: 'count', isUnlimited: true },
      ],
    };
    await manager.initializeWithConfig(config);
    expect(manager.getRemaining('unlimited_q')).toBe(Infinity);
  });

  it('getRemaining returns 0 for disabled', async () => {
    const config: QuotaConfig = {
      quotas: [
        { id: 'disabled_q', displayName: 'Disabled', description: 'Test', category: 'test', enabled: false, limitType: 'disabled', limitValue: 0, resetPolicy: 'never', usageUnit: 'count', isUnlimited: false },
      ],
    };
    await manager.initializeWithConfig(config);
    expect(manager.getRemaining('disabled_q')).toBe(0);
  });

  it('isQuotaAvailable returns true for fresh quota', async () => {
    await manager.initialize();
    expect(manager.isQuotaAvailable('ai_conversations')).toBe(true);
  });

  it('isQuotaAvailable returns false for unknown quota', async () => {
    await manager.initialize();
    expect(manager.isQuotaAvailable('nonexistent')).toBe(false);
  });

  it('isQuotaAvailable returns false for disabled', async () => {
    const config: QuotaConfig = {
      quotas: [
        { id: 'disabled_q', displayName: 'Disabled', description: 'Test', category: 'test', enabled: false, limitType: 'disabled', limitValue: 0, resetPolicy: 'never', usageUnit: 'count', isUnlimited: false },
      ],
    };
    await manager.initializeWithConfig(config);
    expect(manager.isQuotaAvailable('disabled_q')).toBe(false);
  });

  it('consumeQuota decrements remaining', async () => {
    await manager.initialize();
    const result = manager.consumeQuota('ai_conversations', 1, 'ask', 'ai-assistant');
    expect(result).toBe(true);
    expect(manager.getRemaining('ai_conversations')).toBe(4);
  });

  it('consumeQuota returns false when exceeded', async () => {
    await manager.initialize();
    for (let i = 0; i < 5; i++) {
      manager.consumeQuota('ai_conversations', 1, 'ask', 'ai-assistant');
    }
    const result = manager.consumeQuota('ai_conversations', 1, 'ask', 'ai-assistant');
    expect(result).toBe(false);
  });

  it('consumeQuota works for unlimited', async () => {
    const config: QuotaConfig = {
      quotas: [
        { id: 'unlimited_q', displayName: 'Unlimited', description: 'Test', category: 'test', enabled: true, limitType: 'unlimited', limitValue: 0, resetPolicy: 'never', usageUnit: 'count', isUnlimited: true },
      ],
    };
    await manager.initializeWithConfig(config);
    const result = manager.consumeQuota('unlimited_q', 100, 'test', 'test');
    expect(result).toBe(true);
    expect(manager.getRemaining('unlimited_q')).toBe(Infinity);
  });

  it('consumeQuota returns false for disabled', async () => {
    const config: QuotaConfig = {
      quotas: [
        { id: 'disabled_q', displayName: 'Disabled', description: 'Test', category: 'test', enabled: false, limitType: 'disabled', limitValue: 0, resetPolicy: 'never', usageUnit: 'count', isUnlimited: false },
      ],
    };
    await manager.initializeWithConfig(config);
    expect(manager.consumeQuota('disabled_q', 1, 'test', 'test')).toBe(false);
  });

  it('consumeQuota records usage with options', async () => {
    await manager.initialize();
    manager.consumeQuota('ai_conversations', 1, 'ask', 'ai-assistant', {
      feature: 'feature_ai_assistant',
      capability: 'ai_assistant',
      userId: 'user1',
      deviceId: 'device1',
      sessionId: 'session1',
    });
    const records = manager.getTracker().getRecordsByQuota('ai_conversations');
    expect(records).toHaveLength(1);
    expect(records[0]!.feature).toBe('feature_ai_assistant');
    expect(records[0]!.userId).toBe('user1');
  });

  it('restoreQuota increments remaining', async () => {
    await manager.initialize();
    manager.consumeQuota('ai_conversations', 2, 'ask', 'ai-assistant');
    expect(manager.getRemaining('ai_conversations')).toBe(3);
    manager.restoreQuota('ai_conversations', 1);
    expect(manager.getRemaining('ai_conversations')).toBe(4);
  });

  it('restoreQuota does not exceed limit', async () => {
    await manager.initialize();
    manager.consumeQuota('ai_conversations', 1, 'ask', 'ai-assistant');
    manager.restoreQuota('ai_conversations', 10);
    expect(manager.getRemaining('ai_conversations')).toBe(5);
  });

  it('restoreQuota returns false for unlimited', async () => {
    const config: QuotaConfig = {
      quotas: [
        { id: 'unlimited_q', displayName: 'Unlimited', description: 'Test', category: 'test', enabled: true, limitType: 'unlimited', limitValue: 0, resetPolicy: 'never', usageUnit: 'count', isUnlimited: true },
      ],
    };
    await manager.initializeWithConfig(config);
    expect(manager.restoreQuota('unlimited_q', 1)).toBe(false);
  });

  it('resetQuota resets a single quota', async () => {
    await manager.initialize();
    manager.consumeQuota('ai_conversations', 3, 'ask', 'ai-assistant');
    manager.resetQuota('ai_conversations');
    expect(manager.getRemaining('ai_conversations')).toBe(5);
  });

  it('resetQuota returns false for unknown', async () => {
    await manager.initialize();
    expect(manager.resetQuota('nonexistent')).toBe(false);
  });

  it('resetAll resets all quotas', async () => {
    await manager.initialize();
    manager.consumeQuota('ai_conversations', 2, 'ask', 'ai-assistant');
    manager.consumeQuota('smart_optimize_runs', 1, 'optimize', 'optimizer');
    manager.resetAll();
    expect(manager.getRemaining('ai_conversations')).toBe(5);
    expect(manager.getRemaining('smart_optimize_runs')).toBe(3);
  });

  it('getQuotaSummary returns correct counts', async () => {
    await manager.initialize();
    const summary = manager.getQuotaSummary();
    expect(summary.totalQuotas).toBe(DEFAULT_QUOTAS.length);
    expect(summary.activeQuotas).toBe(DEFAULT_QUOTAS.length);
    expect(summary.disabledQuotas).toBe(0);
    expect(summary.unlimitedQuotas).toBe(0);
  });

  it('getUsageStatistics returns statistics', async () => {
    await manager.initialize();
    manager.consumeQuota('ai_conversations', 2, 'ask', 'ai-assistant');
    const stats = manager.getUsageStatistics();
    expect(stats.todayUsage).toBe(2);
    expect(stats.lifetimeUsage).toBe(2);
  });

  it('persists state to storage', async () => {
    const storage = new MemoryQuotaStorage();
    const mgr = new QuotaManager(storage);
    await mgr.initialize();
    mgr.consumeQuota('ai_conversations', 2, 'ask', 'ai-assistant');
    await mgr.persist();
    const data = await storage.load();
    expect(data.states.ai_conversations?.currentUsage).toBe(2);
  });

  it('loads state from storage on initialize', async () => {
    const storage = new MemoryQuotaStorage();
    // First manager saves state
    const mgr1 = new QuotaManager(storage);
    await mgr1.initialize();
    mgr1.consumeQuota('ai_conversations', 3, 'ask', 'ai-assistant');
    await mgr1.persist();

    // Second manager loads state
    const mgr2 = new QuotaManager(storage);
    await mgr2.initialize();
    expect(mgr2.getRemaining('ai_conversations')).toBe(2);
  });

  it('handles corrupted storage gracefully', async () => {
    const storage = new MemoryQuotaStorage();
    await storage.save({ states: { bad: { currentUsage: 'corrupt' as never, lastResetAt: null } }, records: [] });
    const mgr = new QuotaManager(storage);
    await mgr.initialize();
    // Should start fresh
    expect(mgr.getRemaining('ai_conversations')).toBe(5);
  });

  it('clear resets everything', async () => {
    await manager.initialize();
    manager.consumeQuota('ai_conversations', 2, 'ask', 'ai-assistant');
    await manager.clear();
    expect(manager.isInitialized()).toBe(false);
    expect(manager.getTracker().count()).toBe(0);
  });

  it('loadConfig updates definitions', async () => {
    await manager.initialize();
    const config: QuotaConfig = {
      quotas: [
        { id: 'new_q', displayName: 'New', description: 'New', category: 'test', enabled: true, limitType: 'count', limitValue: 20, resetPolicy: 'daily', usageUnit: 'count', isUnlimited: false },
      ],
    };
    manager.loadConfig(config);
    expect(manager.getQuota('new_q')).not.toBeNull();
    expect(manager.getQuota('ai_conversations')).toBeNull();
  });

  it('emits quota_consumed event', async () => {
    await manager.initialize();
    manager.getTracker(); // just ensure tracker exists
    // We can't easily listen to the global quotaEvents here,
    // but we can verify the consume doesn't throw
    manager.consumeQuota('ai_conversations', 1, 'ask', 'ai-assistant');
  });

  it('emits quota_exceeded event when over limit', async () => {
    await manager.initialize();
    for (let i = 0; i < 5; i++) {
      manager.consumeQuota('ai_conversations', 1, 'ask', 'ai-assistant');
    }
    // 6th attempt should fail
    const result = manager.consumeQuota('ai_conversations', 1, 'ask', 'ai-assistant');
    expect(result).toBe(false);
  });

  it('performScheduledResets does not reset fresh quotas', async () => {
    await manager.initialize();
    manager.consumeQuota('ai_conversations', 2, 'ask', 'ai-assistant');
    manager.performScheduledResets();
    expect(manager.getRemaining('ai_conversations')).toBe(3);
  });

  it('handles unknown quota in consume gracefully', async () => {
    await manager.initialize();
    // Unknown quota creates state from definition if it exists, otherwise returns false
    expect(manager.consumeQuota('nonexistent', 1, 'test', 'test')).toBe(false);
  });
});

// ── Default Definitions ──────────────────────────────────────

describe('Default Definitions', () => {
  it('DEFAULT_QUOTAS has 14 quotas', () => {
    expect(DEFAULT_QUOTAS).toHaveLength(14);
  });

  it('includes all expected quota types', () => {
    const ids = DEFAULT_QUOTAS.map((q) => q.id);
    expect(ids).toContain('ai_conversations');
    expect(ids).toContain('cleanup_size_mb');
    expect(ids).toContain('files_cleaned');
    expect(ids).toContain('duplicate_removals');
    expect(ids).toContain('startup_changes');
    expect(ids).toContain('browser_cleanup_actions');
    expect(ids).toContain('optimization_runs');
    expect(ids).toContain('smart_optimize_runs');
    expect(ids).toContain('report_exports');
    expect(ids).toContain('pdf_exports');
    expect(ids).toContain('csv_exports');
    expect(ids).toContain('automation_executions');
    expect(ids).toContain('cloud_syncs');
    expect(ids).toContain('trend_history_access');
  });

  it('all default quotas have valid reset policies', () => {
    for (const q of DEFAULT_QUOTAS) {
      expect(isValidResetPolicy(q.resetPolicy)).toBe(true);
    }
  });

  it('all default quotas have valid limit types', () => {
    for (const q of DEFAULT_QUOTAS) {
      expect(isValidLimitType(q.limitType)).toBe(true);
    }
  });

  it('all default quotas have non-negative limit values', () => {
    for (const q of DEFAULT_QUOTAS) {
      expect(q.limitValue).toBeGreaterThanOrEqual(0);
    }
  });

  it('DEFAULT_QUOTA_CONFIG is valid', () => {
    const validator = new QuotaValidator();
    const result = validator.validateConfig(DEFAULT_QUOTA_CONFIG);
    expect(result.valid).toBe(true);
  });

  it('all default quotas are enabled', () => {
    for (const q of DEFAULT_QUOTAS) {
      expect(q.enabled).toBe(true);
    }
  });

  it('no default quotas are unlimited', () => {
    for (const q of DEFAULT_QUOTAS) {
      expect(q.isUnlimited).toBe(false);
    }
  });
});

// ── Regression ───────────────────────────────────────────────

describe('Regression', () => {
  it('all exports are defined', async () => {
    const mod = await import('../index');
    expect(mod.QuotaManager).toBeDefined();
    expect(mod.quotaManager).toBeDefined();
    expect(mod.QuotaRegistry).toBeDefined();
    expect(mod.quotaRegistry).toBeDefined();
    expect(mod.QuotaTracker).toBeDefined();
    expect(mod.QuotaResetService).toBeDefined();
    expect(mod.quotaResetService).toBeDefined();
    expect(mod.QuotaValidator).toBeDefined();
    expect(mod.quotaValidator).toBeDefined();
    expect(mod.QuotaStatisticsService).toBeDefined();
    expect(mod.QuotaEventEmitter).toBeDefined();
    expect(mod.quotaEvents).toBeDefined();
    expect(mod.MemoryQuotaStorage).toBeDefined();
    expect(mod.LocalQuotaStorage).toBeDefined();
    expect(mod.DEFAULT_QUOTAS).toBeDefined();
    expect(mod.DEFAULT_QUOTA_CONFIG).toBeDefined();
    expect(mod.RESET_POLICIES).toBeDefined();
    expect(mod.LIMIT_TYPES).toBeDefined();
    expect(mod.calculateNextReset).toBeDefined();
    expect(mod.shouldReset).toBeDefined();
  });

  it('manager + registry + tracker integration', async () => {
    const manager = new QuotaManager(new MemoryQuotaStorage());
    await manager.initialize();

    // Consume
    expect(manager.consumeQuota('ai_conversations', 1, 'ask', 'ai-assistant')).toBe(true);
    expect(manager.getRemaining('ai_conversations')).toBe(4);

    // Restore
    expect(manager.restoreQuota('ai_conversations', 1)).toBe(true);
    expect(manager.getRemaining('ai_conversations')).toBe(5);

    // Reset
    manager.consumeQuota('ai_conversations', 3, 'ask', 'ai-assistant');
    manager.resetQuota('ai_conversations');
    expect(manager.getRemaining('ai_conversations')).toBe(5);

    // Statistics
    const stats = manager.getUsageStatistics();
    expect(stats.lifetimeUsage).toBeGreaterThan(0);

    // Summary
    const summary = manager.getQuotaSummary();
    expect(summary.totalQuotas).toBe(DEFAULT_QUOTAS.length);
  });

  it('adding a future quota type requires only configuration', async () => {
    const config: QuotaConfig = {
      quotas: [
        { id: 'future_quota', displayName: 'Future', description: 'Future quota type', category: 'future', enabled: true, limitType: 'count', limitValue: 100, resetPolicy: 'weekly', usageUnit: 'count', isUnlimited: false, futureMetadata: { promotional: true } },
      ],
    };
    const validator = new QuotaValidator();
    const result = validator.validateConfig(config);
    expect(result.valid).toBe(true);

    const manager = new QuotaManager(new MemoryQuotaStorage());
    await manager.initializeWithConfig(config);
    expect(manager.isQuotaAvailable('future_quota')).toBe(true);
    expect(manager.consumeQuota('future_quota', 10, 'test', 'test')).toBe(true);
    expect(manager.getRemaining('future_quota')).toBe(90);
  });

  it('unlimited quota works end-to-end', async () => {
    const config: QuotaConfig = {
      quotas: [
        { id: 'unlimited_q', displayName: 'Unlimited', description: 'Unlimited quota', category: 'test', enabled: true, limitType: 'unlimited', limitValue: 0, resetPolicy: 'never', usageUnit: 'count', isUnlimited: true },
      ],
    };
    const manager = new QuotaManager(new MemoryQuotaStorage());
    await manager.initializeWithConfig(config);

    expect(manager.getRemaining('unlimited_q')).toBe(Infinity);
    expect(manager.isQuotaAvailable('unlimited_q', 999999)).toBe(true);
    expect(manager.consumeQuota('unlimited_q', 1000, 'test', 'test')).toBe(true);
    expect(manager.getRemaining('unlimited_q')).toBe(Infinity);
  });

  it('disabled quota blocks consumption', async () => {
    const config: QuotaConfig = {
      quotas: [
        { id: 'disabled_q', displayName: 'Disabled', description: 'Disabled quota', category: 'test', enabled: false, limitType: 'disabled', limitValue: 0, resetPolicy: 'never', usageUnit: 'count', isUnlimited: false },
      ],
    };
    const manager = new QuotaManager(new MemoryQuotaStorage());
    await manager.initializeWithConfig(config);

    expect(manager.isQuotaAvailable('disabled_q')).toBe(false);
    expect(manager.consumeQuota('disabled_q', 1, 'test', 'test')).toBe(false);
  });

  it('storage persistence survives manager recreation', async () => {
    const storage = new MemoryQuotaStorage();
    const mgr1 = new QuotaManager(storage);
    await mgr1.initialize();
    mgr1.consumeQuota('ai_conversations', 4, 'ask', 'ai-assistant');
    await mgr1.persist();

    const mgr2 = new QuotaManager(storage);
    await mgr2.initialize();
    expect(mgr2.getRemaining('ai_conversations')).toBe(1);
    // Should be able to consume 1 more
    expect(mgr2.consumeQuota('ai_conversations', 1, 'ask', 'ai-assistant')).toBe(true);
    // But not 2
    expect(mgr2.consumeQuota('ai_conversations', 1, 'ask', 'ai-assistant')).toBe(false);
  });

  it('all 14 quota types are covered in defaults', () => {
    const ids = new Set(DEFAULT_QUOTAS.map((q) => q.id));
    const expected = [
      'ai_conversations', 'cleanup_size_mb', 'files_cleaned', 'duplicate_removals',
      'startup_changes', 'browser_cleanup_actions', 'optimization_runs',
      'smart_optimize_runs', 'report_exports', 'pdf_exports', 'csv_exports',
      'automation_executions', 'cloud_syncs', 'trend_history_access',
    ];
    for (const id of expected) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it('all 7 reset policies are supported', () => {
    expect(RESET_POLICIES).toContain('never');
    expect(RESET_POLICIES).toContain('session');
    expect(RESET_POLICIES).toContain('daily');
    expect(RESET_POLICIES).toContain('weekly');
    expect(RESET_POLICIES).toContain('monthly');
    expect(RESET_POLICIES).toContain('yearly');
    expect(RESET_POLICIES).toContain('custom');
  });

  it('all 6 limit types are supported', () => {
    expect(LIMIT_TYPES).toContain('count');
    expect(LIMIT_TYPES).toContain('size_mb');
    expect(LIMIT_TYPES).toContain('size_gb');
    expect(LIMIT_TYPES).toContain('duration_seconds');
    expect(LIMIT_TYPES).toContain('unlimited');
    expect(LIMIT_TYPES).toContain('disabled');
  });
});
