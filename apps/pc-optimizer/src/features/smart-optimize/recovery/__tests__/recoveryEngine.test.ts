/**
 * Optimization Recovery & Rollback Center — Comprehensive Test Suite
 *
 * EPIC 4 PHASE B PART 3
 *
 * Covers: types/helpers, configuration, events, history, eligibility,
 * snapshot catalog, validator, comparison engine, planner, analytics,
 * formatter, exporter, coordinator, recovery center, manager,
 * regression, performance, and edge cases.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  RecoveryManager,
  RecoveryCenter,
  RecoveryCoordinator,
  RecoveryEvents,
  RecoveryHistory,
  RecoveryEligibilityEngine,
  RecoverySnapshotCatalog,
  RecoveryValidator,
  RecoveryComparisonEngine,
  RecoveryPlanner,
  RecoveryAnalyticsEngine,
  RecoveryFormatter,
  RecoveryExporter,
  DEFAULT_RECOVERY_CONFIGURATION,
  createRecoveryConfiguration,
  generateRecoveryId,
  generateRecoveryPlanId,
  generateRecoveryStepId,
  generateRecoveryHistoryId,
  generateComparisonId,
  generateCatalogEntryId,
  generateAssumptionId,
  generateExportId,
  riskToScore,
  scoreToRisk,
  priorityToScore,
  getRecoveryTypeLabel,
  getRecoveryTypeDescription,
  getRecoveryStatusLabel,
  getEligibilityStateLabel,
  getIntegrityStatusLabel,
  createDefaultRetentionPolicy,
} from '../index';
import type {
  SnapshotCatalogEntry,
  RecoveryPlanningInput,
  SystemSnapshot,
  ExecutionStepResult,
  RecoveryProviderPlugin,
  RecoveryComparisonPlugin,
  ExportPlugin,
  RecoveryHistoryEntry,
  RecoveryRecord,
  RecoveryType,
} from '../index';

// ── Mock Helpers ─────────────────────────────────────────────

function createMockSystemSnapshot(overrides: Partial<SystemSnapshot> = {}): SystemSnapshot {
  return {
    id: `snap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    executionId: 'exec_test_001',
    createdAt: new Date().toISOString(),
    restorePointCreated: true,
    registryBackupCreated: true,
    startupBackupCreated: false,
    configBackupCreated: true,
    moduleStateBackup: {},
    snapshotProviders: ['restore_point', 'registry_backup'],
    futureMetadata: {},
    ...overrides,
  };
}

function createMockCatalogEntry(overrides: Partial<SnapshotCatalogEntry> = {}): SnapshotCatalogEntry {
  return {
    id: generateCatalogEntryId(),
    snapshotId: `snap_${Date.now().toString(36)}`,
    executionId: 'exec_test_001',
    createdAt: new Date().toISOString(),
    optimizationSource: 'smart_optimize',
    profileUsed: 'desktop',
    recoveryAvailable: true,
    retentionPolicy: createDefaultRetentionPolicy(),
    integrityStatus: 'intact',
    dependencies: [],
    providers: ['restore_point', 'registry_backup'],
    metadata: { health: 75, performance: 80, storage: 500 },
    futureMetadata: {},
    ...overrides,
  };
}

function createMockStepResults(overrides: Partial<ExecutionStepResult>[] = []): ExecutionStepResult[] {
  const base: ExecutionStepResult[] = [
    {
      stepId: 'step_1',
      stepTitle: 'Clean Registry',
      status: 'completed',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 5000,
      error: null,
      warnings: [],
      rollbackAvailable: true,
      rollbackExecuted: false,
      output: {},
    },
    {
      stepId: 'step_2',
      stepTitle: 'Remove Temp Files',
      status: 'completed',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 3000,
      error: null,
      warnings: [],
      rollbackAvailable: true,
      rollbackExecuted: false,
      output: {},
    },
  ];
  if (overrides.length > 0) return overrides as ExecutionStepResult[];
  return base;
}

function createMockPlanningInput(overrides: Partial<RecoveryPlanningInput> = {}): RecoveryPlanningInput {
  return {
    operationId: 'exec_test_001',
    snapshotId: 'snap_test_001',
    snapshot: createMockCatalogEntry(),
    systemSnapshot: createMockSystemSnapshot(),
    optimizationHistory: [],
    stepResults: createMockStepResults(),
    recoveryType: 'full_rollback',
    healthBefore: 80,
    healthAfter: 75,
    futureMetadata: {},
    ...overrides,
  };
}

function createMockRecoveryRecord(overrides: Partial<RecoveryRecord> = {}): RecoveryRecord {
  return {
    id: generateRecoveryId(),
    operationId: 'exec_test_001',
    snapshotId: 'snap_test_001',
    createdAt: new Date().toISOString(),
    recoveryType: 'full_rollback',
    affectedModules: ['registry', 'startup'],
    estimatedDuration: 30000,
    estimatedRisk: 'low',
    estimatedSuccess: 0.9,
    rollbackDepth: 2,
    healthBefore: 80,
    healthAfter: 75,
    storageImpact: 0,
    performanceImpact: 0,
    confidence: 0.85,
    supportingEvidence: [],
    futureMetadata: {},
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────

describe('Recovery & Rollback Center', () => {
  const DEFAULT_CONFIG = createRecoveryConfiguration();

  // ── Types & Helpers ──
  describe('Types & Helpers', () => {
    it('generateRecoveryId produces unique ids', () => {
      const a = generateRecoveryId();
      const b = generateRecoveryId();
      expect(a).not.toBe(b);
      expect(a).toMatch(/^rec_/);
    });
    it('generateRecoveryPlanId produces unique ids', () => {
      expect(generateRecoveryPlanId()).toMatch(/^recplan_/);
    });
    it('generateRecoveryStepId produces unique ids', () => {
      expect(generateRecoveryStepId()).toMatch(/^recstep_/);
    });
    it('generateRecoveryHistoryId produces unique ids', () => {
      expect(generateRecoveryHistoryId()).toMatch(/^rechist_/);
    });
    it('generateComparisonId produces unique ids', () => {
      expect(generateComparisonId()).toMatch(/^reccmp_/);
    });
    it('generateCatalogEntryId produces unique ids', () => {
      expect(generateCatalogEntryId()).toMatch(/^cat_/);
    });
    it('generateAssumptionId produces unique ids', () => {
      expect(generateAssumptionId()).toMatch(/^assump_/);
    });
    it('generateExportId produces unique ids', () => {
      expect(generateExportId()).toMatch(/^exp_/);
    });
    it('riskToScore converts correctly', () => {
      expect(riskToScore('none')).toBe(0);
      expect(riskToScore('low')).toBe(1);
      expect(riskToScore('medium')).toBe(2);
      expect(riskToScore('high')).toBe(3);
      expect(riskToScore('critical')).toBe(4);
    });
    it('scoreToRisk converts correctly', () => {
      expect(scoreToRisk(0)).toBe('none');
      expect(scoreToRisk(1)).toBe('low');
      expect(scoreToRisk(2)).toBe('medium');
      expect(scoreToRisk(3)).toBe('high');
      expect(scoreToRisk(4)).toBe('critical');
    });
    it('priorityToScore converts correctly', () => {
      expect(priorityToScore('critical')).toBe(4);
      expect(priorityToScore('high')).toBe(3);
      expect(priorityToScore('medium')).toBe(2);
      expect(priorityToScore('low')).toBe(1);
      expect(priorityToScore('informational')).toBe(0);
    });
    it('getRecoveryTypeLabel works for all types', () => {
      expect(getRecoveryTypeLabel('full_rollback')).toBe('Full Rollback');
      expect(getRecoveryTypeLabel('partial_rollback')).toBe('Partial Rollback');
      expect(getRecoveryTypeLabel('privacy_rollback')).toBe('Privacy Rollback');
    });
    it('getRecoveryTypeDescription works for all types', () => {
      expect(getRecoveryTypeDescription('full_rollback')).toContain('Restores all system state');
      expect(getRecoveryTypeDescription('registry_rollback')).toContain('registry');
    });
    it('getRecoveryStatusLabel works', () => {
      expect(getRecoveryStatusLabel('created')).toBe('Created');
      expect(getRecoveryStatusLabel('completed')).toBe('Completed');
      expect(getRecoveryStatusLabel('failed')).toBe('Failed');
    });
    it('getEligibilityStateLabel works', () => {
      expect(getEligibilityStateLabel('recoverable')).toBe('Recoverable');
      expect(getEligibilityStateLabel('corrupted')).toBe('Corrupted');
    });
    it('getIntegrityStatusLabel works', () => {
      expect(getIntegrityStatusLabel('intact')).toBe('Intact');
      expect(getIntegrityStatusLabel('corrupted')).toBe('Corrupted');
    });
    it('createDefaultRetentionPolicy has defaults', () => {
      const p = createDefaultRetentionPolicy();
      expect(p.maxAgeDays).toBe(30);
      expect(p.maxCount).toBe(50);
      expect(p.action).toBe('keep');
    });
  });

  // ── Configuration ──
  describe('RecoveryConfiguration', () => {
    it('has defaults', () => {
      expect(DEFAULT_RECOVERY_CONFIGURATION.configVersion).toBe('1.0.0');
      expect(DEFAULT_RECOVERY_CONFIGURATION.featureFlags.enableRecovery).toBe(true);
      expect(DEFAULT_RECOVERY_CONFIGURATION.retentionRules.maxSnapshotAgeDays).toBe(30);
      expect(DEFAULT_RECOVERY_CONFIGURATION.recoveryPolicyRules.requireValidation).toBe(true);
    });
    it('createRecoveryConfiguration accepts overrides', () => {
      const cfg = createRecoveryConfiguration({
        enableEvents: false,
        maxHistoryEntries: 50,
      });
      expect(cfg.enableEvents).toBe(false);
      expect(cfg.maxHistoryEntries).toBe(50);
    });
    it('merges featureFlags', () => {
      const cfg = createRecoveryConfiguration({
        featureFlags: { enableComparison: false },
      });
      expect(cfg.featureFlags.enableComparison).toBe(false);
      expect(cfg.featureFlags.enableRecovery).toBe(true);
    });
    it('merges retentionRules', () => {
      const cfg = createRecoveryConfiguration({
        retentionRules: { maxSnapshotAgeDays: 60 },
      });
      expect(cfg.retentionRules.maxSnapshotAgeDays).toBe(60);
      expect(cfg.retentionRules.autoArchive).toBe(true);
    });
  });

  // ── Events ──
  describe('RecoveryEvents', () => {
    let events: RecoveryEvents;
    beforeEach(() => { events = new RecoveryEvents(); });

    it('on/emit receives events', () => {
      let received = 0;
      events.on('recovery_created', () => { received++; });
      events.emitCreated('rec_1', {});
      expect(received).toBe(1);
    });
    it('off removes listener', () => {
      let received = 0;
      const listener = () => { received++; };
      events.on('recovery_started', listener);
      events.emitStarted('rec_1', {});
      events.off('recovery_started', listener);
      events.emitStarted('rec_1', {});
      expect(received).toBe(1);
    });
    it('on returns unsubscribe function', () => {
      let received = 0;
      const unsub = events.on('recovery_completed', () => { received++; });
      events.emitCompleted('rec_1', {});
      unsub();
      events.emitCompleted('rec_1', {});
      expect(received).toBe(1);
    });
    it('emitValidated works', () => {
      let received = 0;
      events.on('recovery_validated', () => { received++; });
      events.emitValidated('rec_1', {});
      expect(received).toBe(1);
    });
    it('emitFailed works', () => {
      let received = 0;
      events.on('recovery_failed', () => { received++; });
      events.emitFailed('rec_1', {});
      expect(received).toBe(1);
    });
    it('emitSnapshotCompared works', () => {
      let received = 0;
      events.on('snapshot_compared', () => { received++; });
      events.emitSnapshotCompared('rec_1', {});
      expect(received).toBe(1);
    });
    it('emitExported works', () => {
      let received = 0;
      events.on('recovery_exported', () => { received++; });
      events.emitExported('rec_1', {});
      expect(received).toBe(1);
    });
    it('clear removes all', () => {
      events.on('recovery_created', () => {});
      events.clear();
      expect(events.listenerCount()).toBe(0);
    });
    it('listenerCount returns correct count', () => {
      events.on('recovery_created', () => {});
      events.on('recovery_started', () => {});
      expect(events.listenerCount()).toBe(2);
      expect(events.listenerCount('recovery_created')).toBe(1);
    });
    it('does not crash on listener error', () => {
      events.on('recovery_created', () => { throw new Error('boom'); });
      expect(() => events.emitCreated('rec_1', {})).not.toThrow();
    });
  });

  // ── History ──
  describe('RecoveryHistory', () => {
    let history: RecoveryHistory;
    beforeEach(() => { history = new RecoveryHistory(100); });

    it('records entries', () => {
      const entry = history.record('rec_1', 'exec_1', 'created');
      expect(entry.recoveryId).toBe('rec_1');
      expect(entry.status).toBe('created');
      expect(history.count).toBe(1);
    });
    it('getAll returns all', () => {
      history.record('rec_1', 'exec_1', 'created');
      history.record('rec_2', 'exec_2', 'completed');
      expect(history.getAll().length).toBe(2);
    });
    it('getByRecovery filters', () => {
      history.record('rec_1', 'exec_1', 'created');
      history.record('rec_1', 'exec_1', 'validated');
      history.record('rec_2', 'exec_2', 'created');
      expect(history.getByRecovery('rec_1').length).toBe(2);
    });
    it('getByOperation filters', () => {
      history.record('rec_1', 'exec_1', 'created');
      history.record('rec_2', 'exec_2', 'created');
      expect(history.getByOperation('exec_1').length).toBe(1);
    });
    it('getByStatus filters', () => {
      history.record('rec_1', 'exec_1', 'created');
      history.record('rec_2', 'exec_2', 'completed');
      expect(history.getByStatus('created').length).toBe(1);
      expect(history.getByStatus('completed').length).toBe(1);
    });
    it('getLatest returns last', () => {
      history.record('rec_1', 'exec_1', 'created');
      history.record('rec_2', 'exec_2', 'completed');
      expect(history.getLatest()?.status).toBe('completed');
    });
    it('getLatestByRecovery returns last for recovery', () => {
      history.record('rec_1', 'exec_1', 'created');
      history.record('rec_1', 'exec_1', 'validated');
      expect(history.getLatestByRecovery('rec_1')?.status).toBe('validated');
    });
    it('updateStatus adds entry', () => {
      history.updateStatus('rec_1', 'completed');
      expect(history.count).toBe(1);
      expect(history.getLatest()?.status).toBe('completed');
    });
    it('clear resets', () => {
      history.record('rec_1', 'exec_1', 'created');
      history.clear();
      expect(history.count).toBe(0);
    });
    it('respects max entries', () => {
      const h = new RecoveryHistory(3);
      for (let i = 0; i < 5; i++) h.record(`rec_${i}`, `exec_${i}`, 'created');
      expect(h.count).toBe(3);
    });
    it('setMaxEntries trims', () => {
      for (let i = 0; i < 5; i++) history.record(`rec_${i}`, `exec_${i}`, 'created');
      history.setMaxEntries(2);
      expect(history.count).toBe(2);
    });
  });

  // ── Eligibility Engine ──
  describe('RecoveryEligibilityEngine', () => {
    let engine: RecoveryEligibilityEngine;
    beforeEach(() => { engine = new RecoveryEligibilityEngine(DEFAULT_CONFIG); });

    it('returns recoverable for intact snapshot', () => {
      const r = engine.evaluate(createMockCatalogEntry());
      expect(r.state).toBe('recoverable');
      expect(r.recoverable).toBe(true);
    });
    it('returns corrupted for corrupted snapshot', () => {
      const r = engine.evaluate(createMockCatalogEntry({ integrityStatus: 'corrupted' }));
      expect(r.state).toBe('corrupted');
      expect(r.recoverable).toBe(false);
    });
    it('returns unavailable for missing snapshot', () => {
      const r = engine.evaluate(createMockCatalogEntry({ integrityStatus: 'missing' }));
      expect(r.state).toBe('unavailable');
      expect(r.recoverable).toBe(false);
    });
    it('returns unavailable when recoveryAvailable is false', () => {
      const r = engine.evaluate(createMockCatalogEntry({ recoveryAvailable: false }));
      expect(r.state).toBe('unavailable');
    });
    it('returns expired for old snapshot', () => {
      const oldDate = new Date(Date.now() - 31 * 86400000).toISOString();
      const r = engine.evaluate(createMockCatalogEntry({ createdAt: oldDate }));
      expect(r.state).toBe('expired');
    });
    it('returns partially_recoverable for degraded snapshot', () => {
      const r = engine.evaluate(createMockCatalogEntry({ integrityStatus: 'degraded' }));
      expect(r.state).toBe('partially_recoverable');
      expect(r.recoverable).toBe(true);
    });
    it('returns blocked for degraded when partial recovery disabled', () => {
      const cfg = createRecoveryConfiguration({ recoveryPolicyRules: { allowPartialRecovery: false } });
      const e = new RecoveryEligibilityEngine(cfg);
      const r = e.evaluate(createMockCatalogEntry({ integrityStatus: 'degraded' }));
      expect(r.state).toBe('blocked');
    });
    it('returns blocked for unresolved dependencies', () => {
      const r = engine.evaluate(createMockCatalogEntry({ dependencies: ['dep_1', 'dep_2'] }));
      expect(r.state).toBe('blocked');
    });
    it('evaluateBatch evaluates all', () => {
      const results = engine.evaluateBatch([
        createMockCatalogEntry(),
        createMockCatalogEntry({ integrityStatus: 'corrupted' }),
      ]);
      expect(results.size).toBe(2);
    });
    it('getRecoverableCount counts recoverable', () => {
      const count = engine.getRecoverableCount([
        createMockCatalogEntry(),
        createMockCatalogEntry({ integrityStatus: 'corrupted' }),
        createMockCatalogEntry(),
      ]);
      expect(count).toBe(2);
    });
  });

  // ── Snapshot Catalog ──
  describe('RecoverySnapshotCatalog', () => {
    let catalog: RecoverySnapshotCatalog;
    beforeEach(() => { catalog = new RecoverySnapshotCatalog(DEFAULT_CONFIG); });

    it('registers a snapshot', () => {
      const snap = createMockSystemSnapshot();
      const entry = catalog.register(snap, 'smart_optimize', 'desktop');
      expect(entry.snapshotId).toBe(snap.id);
      expect(entry.recoveryAvailable).toBe(true);
      expect(catalog.count).toBe(1);
    });
    it('registerEntry adds entry directly', () => {
      catalog.registerEntry(createMockCatalogEntry());
      expect(catalog.count).toBe(1);
    });
    it('get finds by id', () => {
      const entry = catalog.register(createMockSystemSnapshot(), 'smart_optimize', 'desktop');
      expect(catalog.get(entry.id)).toBeDefined();
      expect(catalog.get('unknown')).toBeUndefined();
    });
    it('getBySnapshotId finds entry', () => {
      const snap = createMockSystemSnapshot();
      catalog.register(snap, 'smart_optimize', 'desktop');
      expect(catalog.getBySnapshotId(snap.id)).toBeDefined();
    });
    it('getByExecutionId finds entry', () => {
      const snap = createMockSystemSnapshot({ executionId: 'exec_42' });
      catalog.register(snap, 'smart_optimize', 'desktop');
      expect(catalog.getByExecutionId('exec_42')).toBeDefined();
    });
    it('getAll returns all entries', () => {
      catalog.register(createMockSystemSnapshot(), 'smart_optimize', 'desktop');
      catalog.register(createMockSystemSnapshot({ executionId: 'exec_2' }), 'manual', 'laptop');
      expect(catalog.getAll().length).toBe(2);
    });
    it('getAvailable filters available', () => {
      catalog.register(createMockSystemSnapshot(), 'smart_optimize', 'desktop');
      catalog.register(createMockSystemSnapshot({ snapshotProviders: [] }), 'manual', 'laptop');
      expect(catalog.getAvailable().length).toBe(1);
    });
    it('getByIntegrity filters by status', () => {
      const entry = catalog.register(createMockSystemSnapshot(), 'smart_optimize', 'desktop');
      catalog.updateIntegrity(entry.id, 'corrupted');
      expect(catalog.getByIntegrity('corrupted').length).toBe(1);
    });
    it('getByOptimizationSource filters', () => {
      catalog.register(createMockSystemSnapshot(), 'smart_optimize', 'desktop');
      catalog.register(createMockSystemSnapshot({ executionId: 'e2' }), 'manual', 'laptop');
      expect(catalog.getByOptimizationSource('smart_optimize').length).toBe(1);
    });
    it('updateIntegrity changes status', () => {
      const entry = catalog.register(createMockSystemSnapshot(), 'smart_optimize', 'desktop');
      expect(catalog.updateIntegrity(entry.id, 'degraded')).toBe(true);
      expect(catalog.get(entry.id)?.integrityStatus).toBe('degraded');
    });
    it('updateIntegrity disables recovery for corrupted', () => {
      const entry = catalog.register(createMockSystemSnapshot(), 'smart_optimize', 'desktop');
      catalog.updateIntegrity(entry.id, 'corrupted');
      expect(catalog.get(entry.id)?.recoveryAvailable).toBe(false);
    });
    it('updateRetentionPolicy changes policy', () => {
      const entry = catalog.register(createMockSystemSnapshot(), 'smart_optimize', 'desktop');
      expect(catalog.updateRetentionPolicy(entry.id, { maxAgeDays: 60, maxCount: 100, action: 'archive', priority: 'high' })).toBe(true);
    });
    it('addDependency adds dependency', () => {
      const entry = catalog.register(createMockSystemSnapshot(), 'smart_optimize', 'desktop');
      expect(catalog.addDependency(entry.id, 'dep_1')).toBe(true);
      expect(catalog.get(entry.id)?.dependencies).toContain('dep_1');
    });
    it('remove deletes entry', () => {
      const entry = catalog.register(createMockSystemSnapshot(), 'smart_optimize', 'desktop');
      expect(catalog.remove(entry.id)).toBe(true);
      expect(catalog.count).toBe(0);
    });
    it('clear removes all', () => {
      catalog.register(createMockSystemSnapshot(), 'smart_optimize', 'desktop');
      catalog.clear();
      expect(catalog.count).toBe(0);
    });
    it('applyRetentionPolicy archives old entries', () => {
      const oldDate = new Date(Date.now() - 31 * 86400000).toISOString();
      catalog.register(createMockSystemSnapshot({ createdAt: oldDate }), 'smart_optimize', 'desktop');
      const result = catalog.applyRetentionPolicy();
      expect(result.archived).toBe(1);
    });
    it('applyRetentionPolicy deletes old entries when autoDelete', () => {
      const cfg = createRecoveryConfiguration({ retentionRules: { autoDelete: true, autoArchive: false } });
      const c = new RecoverySnapshotCatalog(cfg);
      const oldDate = new Date(Date.now() - 31 * 86400000).toISOString();
      c.register(createMockSystemSnapshot({ createdAt: oldDate }), 'smart_optimize', 'desktop');
      const result = c.applyRetentionPolicy();
      expect(result.deleted).toBe(1);
    });
  });

  // ── Validator ──
  describe('RecoveryValidator', () => {
    let validator: RecoveryValidator;
    beforeEach(() => { validator = new RecoveryValidator(DEFAULT_CONFIG); });

    it('validates correct snapshot', () => {
      const r = validator.validateSnapshot(createMockCatalogEntry());
      expect(r.valid).toBe(true);
      expect(r.errors.length).toBe(0);
    });
    it('detects corrupted snapshot', () => {
      const r = validator.validateSnapshot(createMockCatalogEntry({ integrityStatus: 'corrupted' }));
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.code === 'SNAPSHOT_INTEGRITY')).toBe(true);
    });
    it('detects missing snapshot', () => {
      const r = validator.validateSnapshot(createMockCatalogEntry({ integrityStatus: 'missing' }));
      expect(r.valid).toBe(false);
    });
    it('warns on degraded snapshot', () => {
      const r = validator.validateSnapshot(createMockCatalogEntry({ integrityStatus: 'degraded' }));
      expect(r.valid).toBe(true);
    });
    it('detects no providers', () => {
      const r = validator.validateSnapshot(createMockCatalogEntry({ providers: [] }));
      expect(r.valid).toBe(false);
    });
    it('detects unavailable recovery', () => {
      const r = validator.validateSnapshot(createMockCatalogEntry({ recoveryAvailable: false }));
      expect(r.valid).toBe(false);
    });
    it('validates correct plan', () => {
      const input = createMockPlanningInput();
      const planner = new RecoveryPlanner(DEFAULT_CONFIG);
      const plan = planner.plan(input);
      const r = validator.validatePlan(plan);
      expect(r.valid).toBe(true);
    });
    it('detects no steps', () => {
      const input = createMockPlanningInput({ stepResults: [] });
      const planner = new RecoveryPlanner(DEFAULT_CONFIG);
      const plan = planner.plan(input);
      plan.steps = [];
      const r = validator.validatePlan(plan);
      expect(r.valid).toBe(false);
    });
    it('detects invalid confidence', () => {
      const input = createMockPlanningInput();
      const planner = new RecoveryPlanner(DEFAULT_CONFIG);
      const plan = planner.plan(input);
      plan.confidence = 1.5;
      const r = validator.validatePlan(plan);
      expect(r.valid).toBe(false);
    });
    it('detects rollback depth exceeded', () => {
      const input = createMockPlanningInput();
      const planner = new RecoveryPlanner(DEFAULT_CONFIG);
      const plan = planner.plan(input);
      plan.rollbackDepth = 999;
      const r = validator.validatePlan(plan);
      expect(r.valid).toBe(false);
    });
    it('warns on no evidence', () => {
      const input = createMockPlanningInput();
      const planner = new RecoveryPlanner(DEFAULT_CONFIG);
      const plan = planner.plan(input);
      plan.supportingEvidence = [];
      const r = validator.validatePlan(plan);
      expect(r.warnings.some((w) => w.code === 'NO_EVIDENCE')).toBe(true);
    });
    it('validate combines snapshot and plan', () => {
      const input = createMockPlanningInput();
      const planner = new RecoveryPlanner(DEFAULT_CONFIG);
      const plan = planner.plan(input);
      const r = validator.validate(createMockCatalogEntry(), plan);
      expect(r.valid).toBe(true);
      expect(r.checks.length).toBeGreaterThan(0);
    });
  });

  // ── Comparison Engine ──
  describe('RecoveryComparisonEngine', () => {
    let engine: RecoveryComparisonEngine;
    beforeEach(() => { engine = new RecoveryComparisonEngine(DEFAULT_CONFIG); });

    it('compares two snapshots', () => {
      const a = createMockCatalogEntry({ metadata: { health: 70, performance: 75, storage: 400 } });
      const b = createMockCatalogEntry({ metadata: { health: 85, performance: 90, storage: 600 } });
      const r = engine.compare(a, b);
      expect(r.healthComparison.delta).toBe(15);
      expect(r.performanceComparison.delta).toBe(15);
      expect(r.storageComparison.delta).toBe(200);
    });
    it('generates summary', () => {
      const a = createMockCatalogEntry({ metadata: { health: 70, performance: 75, storage: 400 } });
      const b = createMockCatalogEntry({ metadata: { health: 85, performance: 75, storage: 400 } });
      const r = engine.compare(a, b);
      expect(r.summary).toContain('Health');
    });
    it('generates recommendation', () => {
      const a = createMockCatalogEntry({ metadata: { health: 70 } });
      const b = createMockCatalogEntry({ metadata: { health: 85 } });
      const r = engine.compare(a, b);
      expect(r.recommendation).toContain('snapshot B');
    });
    it('detects configuration differences', () => {
      const a = createMockCatalogEntry({ metadata: { config: { setting1: 'on', setting2: 'high' } } });
      const b = createMockCatalogEntry({ metadata: { config: { setting1: 'off', setting2: 'high' } } });
      const r = engine.compare(a, b);
      expect(r.configurationDifferences.length).toBe(1);
    });
    it('registers and uses comparison plugins', () => {
      const plugin: RecoveryComparisonPlugin = {
        getPluginName: () => 'test_plugin',
        getVersion: () => '1.0.0',
        getPriority: () => 100,
        isAvailable: () => true,
        getComparisonType: () => 'custom',
        compare: () => ({
          id: 'plugin_cmp',
          snapshotIdA: 'a',
          snapshotIdB: 'b',
          generatedAt: new Date().toISOString(),
          healthComparison: { before: 0, after: 0, delta: 0, unit: 'score' },
          performanceComparison: { before: 0, after: 0, delta: 0, unit: 'score' },
          storageComparison: { before: 0, after: 0, delta: 0, unit: 'MB' },
          configurationDifferences: [],
          summary: 'plugin comparison',
          recommendation: 'use plugin',
          futureMetadata: {},
        }),
      };
      expect(engine.registerPlugin(plugin)).toBe(true);
      const r = engine.compare(createMockCatalogEntry(), createMockCatalogEntry());
      expect(r.summary).toBe('plugin comparison');
    });
    it('unregisters plugins', () => {
      const plugin: RecoveryComparisonPlugin = {
        getPluginName: () => 'test_plugin',
        getVersion: () => '1.0.0',
        getPriority: () => 100,
        isAvailable: () => true,
        getComparisonType: () => 'custom',
        compare: () => null,
      };
      engine.registerPlugin(plugin);
      expect(engine.unregisterPlugin('test_plugin')).toBe(true);
    });
  });

  // ── Planner ──
  describe('RecoveryPlanner', () => {
    let planner: RecoveryPlanner;
    beforeEach(() => { planner = new RecoveryPlanner(DEFAULT_CONFIG); });

    it('creates a recovery plan', () => {
      const plan = planner.plan(createMockPlanningInput());
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.estimatedDuration).toBeGreaterThan(0);
      expect(plan.confidence).toBeGreaterThan(0);
      expect(plan.explainability.reason).toBeTruthy();
    });
    it('includes explainability', () => {
      const plan = planner.plan(createMockPlanningInput());
      expect(plan.explainability.reason).toBeTruthy();
      expect(plan.explainability.affectedComponents.length).toBeGreaterThan(0);
      expect(plan.explainability.estimatedOutcome).toBeTruthy();
    });
    it('generates supporting evidence', () => {
      const plan = planner.plan(createMockPlanningInput());
      expect(plan.supportingEvidence.length).toBeGreaterThan(0);
    });
    it('generates assumptions', () => {
      const plan = planner.plan(createMockPlanningInput());
      expect(plan.assumptions.length).toBeGreaterThan(0);
    });
    it('creates fallback step when no rollbackable steps', () => {
      const input = createMockPlanningInput({ stepResults: [] });
      const plan = planner.plan(input);
      expect(plan.steps.length).toBeGreaterThan(0);
    });
    it('respects max rollback depth', () => {
      const plan = planner.plan(createMockPlanningInput());
      expect(plan.rollbackDepth).toBeLessThanOrEqual(DEFAULT_CONFIG.recoveryPolicyRules.maxRollbackDepth);
    });
    it('creates recovery record', () => {
      const input = createMockPlanningInput();
      const plan = planner.plan(input);
      const record = planner.createRecoveryRecord(input, plan);
      expect(record.id).toMatch(/^rec_/);
      expect(record.recoveryType).toBe(input.recoveryType);
    });
    it('registers and uses provider plugins', () => {
      const plugin: RecoveryProviderPlugin = {
        getPluginName: () => 'test_provider',
        getVersion: () => '1.0.0',
        getPriority: () => 100,
        isAvailable: () => true,
        getRecoveryType: () => 'full_rollback',
        planRecovery: () => ({
          id: 'plugin_plan',
          recoveryId: '',
          steps: [],
          estimatedDuration: 1000,
          estimatedRisk: 'low',
          estimatedSuccess: 0.95,
          rollbackDepth: 1,
          affectedModules: ['test'],
          dependencies: [],
          confidence: 0.9,
          assumptions: [],
          supportingEvidence: [],
          explainability: {
            reason: 'plugin',
            evidenceUsed: [],
            affectedComponents: [],
            estimatedOutcome: 'ok',
            confidence: 0.9,
            potentialRisks: [],
            alternativeRecovery: null,
            futureMetadata: {},
          },
          createdAt: new Date().toISOString(),
          futureMetadata: {},
        }),
      };
      expect(planner.registerPlugin(plugin)).toBe(true);
      const plan = planner.plan(createMockPlanningInput());
      expect(plan.id).toBe('plugin_plan');
    });
  });

  // ── Analytics ──
  describe('RecoveryAnalyticsEngine', () => {
    it('computes empty analytics', () => {
      const r = new RecoveryAnalyticsEngine().compute([], []);
      expect(r.totalRecoveries).toBe(0);
      expect(r.totalSnapshots).toBe(0);
    });
    it('computes total recoveries', () => {
      const r = new RecoveryAnalyticsEngine().compute([], [], [
        createMockRecoveryRecord({ recoveryType: 'full_rollback' }),
        createMockRecoveryRecord({ recoveryType: 'partial_rollback' }),
      ]);
      expect(r.totalRecoveries).toBe(2);
      expect(r.byType['full_rollback']).toBe(1);
    });
    it('computes success rate from history', () => {
      const history: RecoveryHistoryEntry[] = [
        { id: 'h1', recoveryId: 'r1', operationId: 'o1', status: 'completed', timestamp: new Date().toISOString(), metadata: {}, futureMetadata: {} },
        { id: 'h2', recoveryId: 'r2', operationId: 'o2', status: 'failed', timestamp: new Date().toISOString(), metadata: {}, futureMetadata: {} },
      ];
      const r = new RecoveryAnalyticsEngine().compute(history, []);
      expect(r.byStatus['completed']).toBe(1);
      expect(r.byStatus['failed']).toBe(1);
    });
    it('computes snapshot stats', () => {
      const snapshots = [
        createMockCatalogEntry(),
        createMockCatalogEntry({ integrityStatus: 'corrupted' }),
        createMockCatalogEntry({ recoveryAvailable: false }),
      ];
      const r = new RecoveryAnalyticsEngine().compute([], snapshots);
      expect(r.totalSnapshots).toBe(3);
      expect(r.availableSnapshots).toBe(2);
      expect(r.corruptedSnapshots).toBe(1);
    });
    it('computes average confidence', () => {
      const r = new RecoveryAnalyticsEngine().compute([], [], [
        createMockRecoveryRecord({ confidence: 0.8 }),
        createMockRecoveryRecord({ confidence: 0.9 }),
      ]);
      expect(r.averageConfidence).toBeCloseTo(0.85, 5);
    });
  });

  // ── Formatter ──
  describe('RecoveryFormatter', () => {
    let formatter: RecoveryFormatter;
    beforeEach(() => { formatter = new RecoveryFormatter(); });

    it('formats recovery as JSON', () => {
      const rec = createMockRecoveryRecord();
      const result = formatter.formatRecovery(rec, null, 'json');
      expect(() => JSON.parse(result)).not.toThrow();
    });
    it('formats recovery as Markdown', () => {
      const rec = createMockRecoveryRecord();
      const result = formatter.formatRecovery(rec, null, 'markdown');
      expect(result).toContain('# Recovery Report');
      expect(result).toContain('Full Rollback');
    });
    it('formats recovery as PDF-ready', () => {
      const rec = createMockRecoveryRecord();
      const result = formatter.formatRecovery(rec, null, 'pdf_ready');
      expect(() => JSON.parse(result)).not.toThrow();
    });
    it('formats comparison as JSON', () => {
      const engine = new RecoveryComparisonEngine(DEFAULT_CONFIG);
      const cmp = engine.compare(createMockCatalogEntry(), createMockCatalogEntry({ metadata: { health: 90 } }));
      const result = formatter.formatComparison(cmp, 'json');
      expect(() => JSON.parse(result)).not.toThrow();
    });
    it('formats comparison as Markdown', () => {
      const engine = new RecoveryComparisonEngine(DEFAULT_CONFIG);
      const cmp = engine.compare(createMockCatalogEntry(), createMockCatalogEntry({ metadata: { health: 90 } }));
      const result = formatter.formatComparison(cmp, 'markdown');
      expect(result).toContain('# Snapshot Comparison');
    });
    it('formats validation as Markdown', () => {
      const validator = new RecoveryValidator(DEFAULT_CONFIG);
      const result = validator.validateSnapshot(createMockCatalogEntry());
      const formatted = formatter.formatValidation(result, 'markdown');
      expect(formatted).toContain('# Recovery Validation');
    });
    it('formats analytics as Markdown', () => {
      const analytics = new RecoveryAnalyticsEngine().compute([], []);
      const result = formatter.formatAnalytics(analytics, 'markdown');
      expect(result).toContain('# Recovery Analytics');
    });
  });

  // ── Exporter ──
  describe('RecoveryExporter', () => {
    let exporter: RecoveryExporter;
    beforeEach(() => { exporter = new RecoveryExporter(DEFAULT_CONFIG); });

    it('exports as JSON', () => {
      const rec = createMockRecoveryRecord();
      const result = exporter.exportRecovery(rec, null, 'json');
      expect(result.format).toBe('json');
      expect(() => JSON.parse(result.content)).not.toThrow();
      expect(result.metadata.byteSize).toBeGreaterThan(0);
    });
    it('exports as Markdown', () => {
      const rec = createMockRecoveryRecord();
      const result = exporter.exportRecovery(rec, null, 'markdown');
      expect(result.format).toBe('markdown');
      expect(result.content).toContain('# Recovery Report');
    });
    it('exports as PDF-ready', () => {
      const rec = createMockRecoveryRecord();
      const result = exporter.exportRecovery(rec, null, 'pdf_ready');
      expect(result.format).toBe('pdf_ready');
      expect(() => JSON.parse(result.content)).not.toThrow();
    });
    it('exports comparison', () => {
      const engine = new RecoveryComparisonEngine(DEFAULT_CONFIG);
      const cmp = engine.compare(createMockCatalogEntry(), createMockCatalogEntry());
      const result = exporter.exportComparison(cmp, 'json');
      expect(result.format).toBe('json');
    });
    it('exports all formats', () => {
      const rec = createMockRecoveryRecord();
      const results = exporter.exportAll(rec, null);
      expect(results['json']).toBeDefined();
      expect(results['markdown']).toBeDefined();
      expect(results['pdf_ready']).toBeDefined();
    });
    it('getSupportedFormats includes built-in', () => {
      const formats = exporter.getSupportedFormats();
      expect(formats).toContain('json');
      expect(formats).toContain('markdown');
      expect(formats).toContain('pdf_ready');
    });
    it('registers and uses export plugins', () => {
      const plugin: ExportPlugin = {
        getPluginName: () => 'future_export',
        getVersion: () => '1.0.0',
        getPriority: () => 100,
        isAvailable: () => true,
        getFormat: () => 'future_format',
        export: (rec) => ({
          format: 'future_format',
          content: 'future content',
          metadata: {
            exportedAt: new Date().toISOString(),
            recoveryId: rec.id,
            formatVersion: '2.0.0',
            byteSize: 13,
            futureMetadata: {},
          },
          futureMetadata: {},
        }),
      };
      expect(exporter.registerPlugin(plugin)).toBe(true);
      const result = exporter.exportRecovery(createMockRecoveryRecord(), null, 'future_format');
      expect(result.content).toBe('future content');
    });
  });

  // ── Coordinator ──
  describe('RecoveryCoordinator', () => {
    let coordinator: RecoveryCoordinator;
    beforeEach(() => { coordinator = new RecoveryCoordinator(DEFAULT_CONFIG); });

    it('validates snapshot and plan', () => {
      const planner = new RecoveryPlanner(DEFAULT_CONFIG);
      const plan = planner.plan(createMockPlanningInput());
      const result = coordinator.validate(createMockCatalogEntry(), plan);
      expect(result.valid).toBe(true);
    });
    it('execute returns failure when recovery disabled', async () => {
      const cfg = createRecoveryConfiguration({ featureFlags: { enableRecovery: false } });
      const c = new RecoveryCoordinator(cfg);
      const rec = createMockRecoveryRecord();
      const plan = new RecoveryPlanner(DEFAULT_CONFIG).plan(createMockPlanningInput());
      const result = await c.execute(rec, plan, null);
      expect(result.success).toBe(false);
    });
    it('execute succeeds without snapshot manager', async () => {
      const rec = createMockRecoveryRecord();
      const plan = new RecoveryPlanner(DEFAULT_CONFIG).plan(createMockPlanningInput());
      const result = await coordinator.execute(rec, plan, null);
      expect(result.success).toBe(true);
      expect(result.rolledBackSteps).toBeGreaterThan(0);
    });
    it('execute fails on validation failure when required', async () => {
      const cfg = createRecoveryConfiguration({ recoveryPolicyRules: { requireValidation: true } });
      const c = new RecoveryCoordinator(cfg);
      const rec = createMockRecoveryRecord();
      const plan = new RecoveryPlanner(DEFAULT_CONFIG).plan(createMockPlanningInput());
      plan.steps = [];
      const result = await c.execute(rec, plan, null);
      expect(result.success).toBe(false);
    });
  });

  // ── Recovery Center ──
  describe('RecoveryCenter', () => {
    let center: RecoveryCenter;
    beforeEach(() => { center = new RecoveryCenter(DEFAULT_CONFIG); });

    it('registers snapshot', () => {
      const snap = createMockSystemSnapshot();
      const entry = center.registerSnapshot(snap, 'smart_optimize', 'desktop');
      expect(entry.snapshotId).toBe(snap.id);
    });
    it('checks eligibility', () => {
      const snap = createMockSystemSnapshot();
      const entry = center.registerSnapshot(snap, 'smart_optimize', 'desktop');
      const result = center.checkEligibility(entry);
      expect(result.recoverable).toBe(true);
    });
    it('creates recovery plan', () => {
      const snap = createMockSystemSnapshot();
      const entry = center.registerSnapshot(snap, 'smart_optimize', 'desktop');
      const plan = center.createRecoveryPlan(createMockPlanningInput({ snapshot: entry, snapshotId: snap.id }));
      expect(plan.steps.length).toBeGreaterThan(0);
    });
    it('validates recovery', () => {
      const snap = createMockSystemSnapshot();
      const entry = center.registerSnapshot(snap, 'smart_optimize', 'desktop');
      const plan = center.createRecoveryPlan(createMockPlanningInput({ snapshot: entry }));
      const result = center.validateRecovery(entry, plan);
      expect(result.valid).toBe(true);
    });
    it('compares snapshots', () => {
      const snapA = createMockSystemSnapshot();
      const snapB = createMockSystemSnapshot({ executionId: 'exec_2' });
      const entryA = center.registerSnapshot(snapA, 'smart_optimize', 'desktop');
      const entryB = center.registerSnapshot(snapB, 'manual', 'laptop');
      const cmp = center.compareSnapshots(entryA, entryB);
      expect(cmp).toBeDefined();
    });
    it('executes recovery', async () => {
      const plan = center.createRecoveryPlan(createMockPlanningInput());
      const rec = createMockRecoveryRecord();
      const result = await center.executeRecovery(rec, plan, null);
      expect(result.success).toBe(true);
    });
    it('clear resets state', () => {
      center.registerSnapshot(createMockSystemSnapshot(), 'smart_optimize', 'desktop');
      center.clear();
      expect(center.catalog.count).toBe(0);
    });
  });

  // ── Recovery Manager ──
  describe('RecoveryManager', () => {
    let manager: RecoveryManager;
    beforeEach(() => { manager = new RecoveryManager(); });

    it('listRecoveries returns empty initially', () => {
      expect(manager.listRecoveries().length).toBe(0);
    });
    it('createRecoveryPlan returns recovery and plan', () => {
      const snap = createMockSystemSnapshot();
      manager.registerSnapshot(snap, 'smart_optimize', 'desktop');
      const { recovery, plan } = manager.createRecoveryPlan(createMockPlanningInput({ snapshotId: snap.id }));
      expect(recovery.id).toMatch(/^rec_/);
      expect(plan.steps.length).toBeGreaterThan(0);
    });
    it('listRecoveries returns created recoveries', () => {
      manager.registerSnapshot(createMockSystemSnapshot(), 'smart_optimize', 'desktop');
      manager.createRecoveryPlan(createMockPlanningInput());
      expect(manager.listRecoveries().length).toBe(1);
    });
    it('validateRecovery returns result', () => {
      const snap = createMockSystemSnapshot();
      manager.registerSnapshot(snap, 'smart_optimize', 'desktop');
      const { recovery } = manager.createRecoveryPlan(createMockPlanningInput({ snapshotId: snap.id }));
      const result = manager.validateRecovery(recovery.id);
      expect(result).toBeDefined();
    });
    it('compareSnapshots returns comparison', () => {
      const snapA = createMockSystemSnapshot();
      const snapB = createMockSystemSnapshot({ executionId: 'exec_2' });
      manager.registerSnapshot(snapA, 'smart_optimize', 'desktop');
      manager.registerSnapshot(snapB, 'manual', 'laptop');
      const cmp = manager.compareSnapshots(snapA.id, snapB.id);
      expect(cmp).toBeDefined();
    });
    it('executeRecovery returns result', async () => {
      manager.registerSnapshot(createMockSystemSnapshot(), 'smart_optimize', 'desktop');
      const { recovery } = manager.createRecoveryPlan(createMockPlanningInput());
      const result = await manager.executeRecovery(recovery.id, null);
      expect(result).toBeDefined();
      expect(result?.success).toBe(true);
    });
    it('getRecoveryHistory returns entries', () => {
      manager.registerSnapshot(createMockSystemSnapshot(), 'smart_optimize', 'desktop');
      manager.createRecoveryPlan(createMockPlanningInput());
      expect(manager.getRecoveryHistory().length).toBeGreaterThan(0);
    });
    it('exportRecoveryReport returns export', () => {
      manager.registerSnapshot(createMockSystemSnapshot(), 'smart_optimize', 'desktop');
      const { recovery } = manager.createRecoveryPlan(createMockPlanningInput());
      const result = manager.exportRecoveryReport(recovery.id, 'json');
      expect(result).toBeDefined();
      expect(result?.format).toBe('json');
    });
    it('getRecoveryAnalytics returns analytics', () => {
      manager.registerSnapshot(createMockSystemSnapshot(), 'smart_optimize', 'desktop');
      manager.createRecoveryPlan(createMockPlanningInput());
      const analytics = manager.getRecoveryAnalytics();
      expect(analytics.totalRecoveries).toBe(1);
    });
    it('getRecovery returns cached record', () => {
      manager.registerSnapshot(createMockSystemSnapshot(), 'smart_optimize', 'desktop');
      const { recovery } = manager.createRecoveryPlan(createMockPlanningInput());
      expect(manager.getRecovery(recovery.id)).toBeDefined();
    });
    it('emits recovery_created event', () => {
      let received = 0;
      manager.on('recovery_created', () => { received++; });
      manager.registerSnapshot(createMockSystemSnapshot(), 'smart_optimize', 'desktop');
      manager.createRecoveryPlan(createMockPlanningInput());
      expect(received).toBe(1);
    });
    it('emits recovery_validated event', () => {
      let received = 0;
      manager.on('recovery_validated', () => { received++; });
      const snap = createMockSystemSnapshot();
      manager.registerSnapshot(snap, 'smart_optimize', 'desktop');
      const { recovery } = manager.createRecoveryPlan(createMockPlanningInput({ snapshotId: snap.id }));
      manager.validateRecovery(recovery.id);
      expect(received).toBe(1);
    });
    it('emits snapshot_compared event', () => {
      let received = 0;
      manager.on('snapshot_compared', () => { received++; });
      const snapA = createMockSystemSnapshot();
      const snapB = createMockSystemSnapshot({ executionId: 'exec_2' });
      manager.registerSnapshot(snapA, 'smart_optimize', 'desktop');
      manager.registerSnapshot(snapB, 'manual', 'laptop');
      manager.compareSnapshots(snapA.id, snapB.id);
      expect(received).toBe(1);
    });
    it('emits recovery_exported event', () => {
      let received = 0;
      manager.on('recovery_exported', () => { received++; });
      manager.registerSnapshot(createMockSystemSnapshot(), 'smart_optimize', 'desktop');
      const { recovery } = manager.createRecoveryPlan(createMockPlanningInput());
      manager.exportRecoveryReport(recovery.id, 'json');
      expect(received).toBe(1);
    });
    it('events disabled does not emit', () => {
      const m = new RecoveryManager({ enableEvents: false });
      let received = 0;
      m.on('recovery_created', () => { received++; });
      m.registerSnapshot(createMockSystemSnapshot(), 'smart_optimize', 'desktop');
      m.createRecoveryPlan(createMockPlanningInput());
      expect(received).toBe(0);
    });
    it('config is accessible', () => {
      expect(manager.config.configVersion).toBe('1.0.0');
    });
    it('updateConfig updates config', () => {
      manager.updateConfig({ maxHistoryEntries: 50 });
      expect(manager.config.maxHistoryEntries).toBe(50);
    });
    it('clear resets state', () => {
      manager.registerSnapshot(createMockSystemSnapshot(), 'smart_optimize', 'desktop');
      manager.createRecoveryPlan(createMockPlanningInput());
      manager.clear();
      expect(manager.listRecoveries().length).toBe(0);
      expect(manager.getRecoveryHistory().length).toBe(0);
    });
    it('registerProviderPlugin adds plugin', () => {
      const plugin: RecoveryProviderPlugin = {
        getPluginName: () => 'p',
        getVersion: () => '1',
        getPriority: () => 1,
        isAvailable: () => true,
        getRecoveryType: () => 'full_rollback',
        planRecovery: () => null,
      };
      expect(manager.registerProviderPlugin(plugin)).toBe(true);
    });
    it('registerExportPlugin adds plugin', () => {
      const plugin: ExportPlugin = {
        getPluginName: () => 'p',
        getVersion: () => '1',
        getPriority: () => 1,
        isAvailable: () => true,
        getFormat: () => 'json',
        export: (r) => ({
          format: 'json',
          content: '{}',
          metadata: { exportedAt: '', recoveryId: r.id, formatVersion: '1', byteSize: 2, futureMetadata: {} },
          futureMetadata: {},
        }),
      };
      expect(manager.registerExportPlugin(plugin)).toBe(true);
    });
  });

  // ── Regression ──
  describe('Regression', () => {
    it('all exports are defined', () => {
      expect(RecoveryManager).toBeDefined();
      expect(RecoveryCenter).toBeDefined();
      expect(RecoveryCoordinator).toBeDefined();
      expect(RecoveryEvents).toBeDefined();
      expect(RecoveryHistory).toBeDefined();
      expect(RecoveryEligibilityEngine).toBeDefined();
      expect(RecoverySnapshotCatalog).toBeDefined();
      expect(RecoveryValidator).toBeDefined();
      expect(RecoveryComparisonEngine).toBeDefined();
      expect(RecoveryPlanner).toBeDefined();
      expect(RecoveryAnalyticsEngine).toBeDefined();
      expect(RecoveryFormatter).toBeDefined();
      expect(RecoveryExporter).toBeDefined();
      expect(DEFAULT_RECOVERY_CONFIGURATION).toBeDefined();
      expect(createRecoveryConfiguration).toBeDefined();
    });
    it('full lifecycle: create → validate → execute → export', async () => {
      const m = new RecoveryManager();
      const snap = createMockSystemSnapshot();
      m.registerSnapshot(snap, 'smart_optimize', 'desktop');
      const { recovery } = m.createRecoveryPlan(createMockPlanningInput({ snapshotId: snap.id }));
      const validation = m.validateRecovery(recovery.id);
      expect(validation).toBeDefined();
      const exec = await m.executeRecovery(recovery.id, null);
      expect(exec?.success).toBe(true);
      const exportResult = m.exportRecoveryReport(recovery.id, 'markdown');
      expect(exportResult?.content).toContain('# Recovery Report');
    });
    it('all recovery types are supported', () => {
      const types: RecoveryType[] = [
        'full_rollback', 'partial_rollback', 'recommendation_rollback',
        'settings_rollback', 'profile_rollback', 'registry_rollback',
        'startup_rollback', 'privacy_rollback', 'future_recovery',
      ];
      for (const t of types) {
        expect(getRecoveryTypeLabel(t)).toBeTruthy();
        expect(getRecoveryTypeDescription(t)).toBeTruthy();
      }
    });
    it('recovery does not modify system state', () => {
      const m = new RecoveryManager();
      const snap = createMockSystemSnapshot();
      m.registerSnapshot(snap, 'smart_optimize', 'desktop');
      m.createRecoveryPlan(createMockPlanningInput());
      expect(snap.snapshotProviders).toEqual(['restore_point', 'registry_backup']);
    });
    it('every recovery plan is explainable', () => {
      const planner = new RecoveryPlanner(DEFAULT_CONFIG);
      const plan = planner.plan(createMockPlanningInput());
      expect(plan.explainability.reason).toBeTruthy();
      expect(plan.explainability.estimatedOutcome).toBeTruthy();
      expect(plan.explainability.affectedComponents.length).toBeGreaterThan(0);
    });
    it('all eligibility states have labels', () => {
      const states = ['recoverable', 'partially_recoverable', 'expired', 'corrupted', 'unavailable', 'blocked', 'future_state'] as const;
      for (const s of states) {
        expect(getEligibilityStateLabel(s)).toBeTruthy();
      }
    });
    it('all integrity statuses have labels', () => {
      const statuses = ['intact', 'verified', 'degraded', 'corrupted', 'missing', 'unknown'] as const;
      for (const s of statuses) {
        expect(getIntegrityStatusLabel(s)).toBeTruthy();
      }
    });
  });

  // ── Performance ──
  describe('Performance', () => {
    it('recovery validation under 200ms', () => {
      const validator = new RecoveryValidator(DEFAULT_CONFIG);
      const entry = createMockCatalogEntry();
      const planner = new RecoveryPlanner(DEFAULT_CONFIG);
      const plan = planner.plan(createMockPlanningInput());
      const start = performance.now();
      validator.validate(entry, plan);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(200);
    });
    it('snapshot comparison under 300ms', () => {
      const engine = new RecoveryComparisonEngine(DEFAULT_CONFIG);
      const a = createMockCatalogEntry({ metadata: { health: 70, performance: 75, storage: 400, config: { s1: 'on', s2: 'high' } } });
      const b = createMockCatalogEntry({ metadata: { health: 85, performance: 90, storage: 600, config: { s1: 'off', s2: 'high' } } });
      const start = performance.now();
      engine.compare(a, b);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(300);
    });
  });

  // ── Edge Cases ──
  describe('Edge Cases', () => {
    it('handles no step results', () => {
      const planner = new RecoveryPlanner(DEFAULT_CONFIG);
      const plan = planner.plan(createMockPlanningInput({ stepResults: [] }));
      expect(plan.steps.length).toBeGreaterThan(0);
    });
    it('handles snapshot with no providers', () => {
      const eligibility = new RecoveryEligibilityEngine(DEFAULT_CONFIG);
      const entry = createMockCatalogEntry({ providers: [], recoveryAvailable: false });
      const result = eligibility.evaluate(entry);
      expect(result.recoverable).toBe(false);
    });
    it('handles corrupted snapshot', () => {
      const eligibility = new RecoveryEligibilityEngine(DEFAULT_CONFIG);
      const result = eligibility.evaluate(createMockCatalogEntry({ integrityStatus: 'corrupted' }));
      expect(result.state).toBe('corrupted');
      expect(result.blockingIssues.length).toBeGreaterThan(0);
    });
    it('handles very old snapshot', () => {
      const eligibility = new RecoveryEligibilityEngine(DEFAULT_CONFIG);
      const old = new Date(Date.now() - 365 * 86400000).toISOString();
      const result = eligibility.evaluate(createMockCatalogEntry({ createdAt: old }));
      expect(result.state).toBe('expired');
    });
    it('handles all feature flags disabled', () => {
      const cfg = createRecoveryConfiguration({
        featureFlags: {
          enableRecovery: false,
          enableComparison: false,
          enableValidation: false,
          enableHistory: false,
          enableAnalytics: false,
          enableExport: false,
          enableExplainability: false,
          enableSnapshotCatalog: false,
          enableEligibility: false,
          enableCaching: false,
        },
      });
      expect(cfg.featureFlags.enableRecovery).toBe(false);
    });
    it('handles events disabled', () => {
      const m = new RecoveryManager({ enableEvents: false });
      let received = 0;
      m.on('recovery_created', () => { received++; });
      m.registerSnapshot(createMockSystemSnapshot(), 'smart_optimize', 'desktop');
      m.createRecoveryPlan(createMockPlanningInput());
      expect(received).toBe(0);
    });
    it('handles high risk recovery plan', () => {
      const planner = new RecoveryPlanner(DEFAULT_CONFIG);
      const plan = planner.plan(createMockPlanningInput());
      plan.estimatedRisk = 'critical';
      const validator = new RecoveryValidator(DEFAULT_CONFIG);
      const result = validator.validatePlan(plan);
      expect(result.valid).toBe(false);
    });
    it('handles zero confidence plan', () => {
      const planner = new RecoveryPlanner(DEFAULT_CONFIG);
      const plan = planner.plan(createMockPlanningInput());
      plan.confidence = 0;
      const validator = new RecoveryValidator(DEFAULT_CONFIG);
      const result = validator.validatePlan(plan);
      expect(result.valid).toBe(true);
    });
    it('handles empty catalog', () => {
      const catalog = new RecoverySnapshotCatalog(DEFAULT_CONFIG);
      expect(catalog.getAll().length).toBe(0);
      expect(catalog.getAvailable().length).toBe(0);
    });
    it('handles missing recovery on validate', () => {
      const m = new RecoveryManager();
      expect(m.validateRecovery('unknown')).toBeNull();
    });
    it('handles missing recovery on execute', async () => {
      const m = new RecoveryManager();
      expect(await m.executeRecovery('unknown', null)).toBeNull();
    });
    it('handles missing recovery on export', () => {
      const m = new RecoveryManager();
      expect(m.exportRecoveryReport('unknown', 'json')).toBeNull();
    });
  });
});
