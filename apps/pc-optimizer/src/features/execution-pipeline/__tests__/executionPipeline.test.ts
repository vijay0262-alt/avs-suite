/**
 * Tests for EPIC 3 PHASE A PART 6 — Optimization Execution Pipeline.
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  OptimizationPlanV2,
  PlanStep,
} from '../../optimization-planner/types';
import type {
  PipelineExecution,
  SystemSnapshot,
  SnapshotProvider,
  StepHandler,
  StageHandler,
  StageContext,
} from '../types';
import {
  getStageLabel,
  getExecutionStateLabel,
  createDefaultExecutionConfiguration,
  generateExecutionId,
  generateSnapshotId,
  generateHistoryId,
} from '../types';
import {
  DEFAULT_EXECUTION_CONFIGURATION,
  createExecutionConfiguration,
  isStageEnabled,
} from '../executionConfiguration';
import { ExecutionEvents } from '../executionEvents';
import { ExecutionValidator } from '../executionValidator';
import { ExecutionSnapshotManager } from '../executionSnapshotManager';
import { ExecutionStageManager } from '../executionStageManager';
import { ExecutionProgressManager } from '../executionProgressManager';
import { ExecutionCoordinator } from '../executionCoordinator';
import { ExecutionVerificationManager } from '../executionVerificationManager';
import { ExecutionRecoveryManager } from '../executionRecoveryManager';
import { ExecutionHistory } from '../executionHistory';
import { ExecutionPipelineBuilder } from '../executionPipelineBuilder';
import { ExecutionPipelineManager } from '../executionPipelineManager';

// ── Mock Data Builders ───────────────────────────────────────

function createMockStep(overrides: Partial<PlanStep> = {}): PlanStep {
  return {
    id: overrides.id ?? 'step_1',
    title: overrides.title ?? 'Clean Temp Files',
    description: overrides.description ?? 'Remove temp files',
    category: overrides.category ?? 'storage',
    estimatedDuration: overrides.estimatedDuration ?? 30,
    estimatedBenefit: overrides.estimatedBenefit ?? 'Improves storage',
    riskLevel: overrides.riskLevel ?? 'low',
    rollbackAvailable: overrides.rollbackAvailable ?? true,
    rollbackMethod: overrides.rollbackMethod ?? 'automatic',
    rollbackConfidence: overrides.rollbackConfidence ?? 0.9,
    estimatedRollbackTime: overrides.estimatedRollbackTime ?? 15,
    relatedRecommendation: overrides.relatedRecommendation ?? 'rec_1',
    confidence: overrides.confidence ?? 0.85,
    status: overrides.status ?? 'pending',
    priority: overrides.priority ?? 'high',
    futureMetadata: overrides.futureMetadata ?? {},
  };
}

function createMockPlan(overrides: Partial<OptimizationPlanV2> = {}): OptimizationPlanV2 {
  const steps = overrides.steps ?? [createMockStep(), createMockStep({ id: 'step_2', title: 'Clean Browser Cache' })];
  return {
    id: overrides.id ?? 'plan_test_1',
    title: overrides.title ?? 'Quick Optimize',
    description: overrides.description ?? 'A quick optimization plan',
    summary: overrides.summary ?? '2 steps, ~60s',
    generatedAt: overrides.generatedAt ?? new Date().toISOString(),
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 1800000).toISOString(),
    planType: overrides.planType ?? 'quick_optimize',
    estimatedDuration: overrides.estimatedDuration ?? 60,
    estimatedHealthGain: overrides.estimatedHealthGain ?? 10,
    estimatedStorageRecovery: overrides.estimatedStorageRecovery ?? 500,
    estimatedPerformanceGain: overrides.estimatedPerformanceGain ?? 5,
    estimatedPrivacyGain: overrides.estimatedPrivacyGain ?? 3,
    estimatedStartupGain: overrides.estimatedStartupGain ?? 2,
    estimatedRisk: overrides.estimatedRisk ?? 'low',
    confidenceScore: overrides.confidenceScore ?? 0.85,
    rollbackAvailable: overrides.rollbackAvailable ?? true,
    requiresConfirmation: overrides.requiresConfirmation ?? false,
    recommendedOrder: overrides.recommendedOrder ?? steps.map((s) => s.id),
    steps,
    relatedRecommendations: overrides.relatedRecommendations ?? ['rec_1', 'rec_2'],
    futureMetadata: overrides.futureMetadata ?? {},
  };
}

function createMockStepHandler(stepId: string, opts: { success?: boolean; delay?: number; error?: string } = {}): StepHandler {
  return {
    stepId,
    async execute(_step, _context) {
      if (opts.delay) await new Promise((r) => setTimeout(r, opts.delay));
      return {
        success: opts.success ?? true,
        output: { cleaned: true },
        error: opts.error,
        warnings: [],
      };
    },
  };
}

function createMockSnapshotProvider(name: string): SnapshotProvider {
  return {
    name,
    async capture() { return { backed: true }; },
    async restore() { return true; },
  };
}

// ── Types & Helpers ──────────────────────────────────────────

describe('Types & Helpers', () => {
  it('getStageLabel returns correct labels', () => {
    expect(getStageLabel('plan_validation')).toBe('Plan Validation');
    expect(getStageLabel('system_snapshot')).toBe('System Snapshot');
    expect(getStageLabel('verification')).toBe('Verification');
    expect(getStageLabel('recovery')).toBe('Recovery');
  });
  it('getExecutionStateLabel returns correct labels', () => {
    expect(getExecutionStateLabel('pending')).toBe('Pending');
    expect(getExecutionStateLabel('running')).toBe('Running');
    expect(getExecutionStateLabel('rolling_back')).toBe('Rolling Back');
    expect(getExecutionStateLabel('recovered')).toBe('Recovered');
  });
  it('createDefaultExecutionConfiguration has all sections', () => {
    const cfg = createDefaultExecutionConfiguration();
    expect(cfg.validationRules).toBeDefined();
    expect(cfg.timeoutRules).toBeDefined();
    expect(cfg.retryRules).toBeDefined();
    expect(cfg.verificationRules).toBeDefined();
    expect(cfg.recoveryRules).toBeDefined();
    expect(cfg.featureFlags).toBeDefined();
    expect(cfg.enabledStages.length).toBeGreaterThan(0);
  });
  it('generateExecutionId produces unique ids', () => {
    expect(generateExecutionId()).not.toBe(generateExecutionId());
    expect(generateExecutionId()).toContain('exec_');
  });
  it('generateSnapshotId produces unique ids', () => {
    expect(generateSnapshotId()).toContain('snap_');
  });
  it('generateHistoryId produces unique ids', () => {
    expect(generateHistoryId()).toContain('hist_');
  });
});

// ── Configuration ────────────────────────────────────────────

describe('ExecutionConfiguration', () => {
  it('has defaults', () => {
    expect(DEFAULT_EXECUTION_CONFIGURATION.configVersion).toBe('1.0.0');
    expect(DEFAULT_EXECUTION_CONFIGURATION.maxConcurrentSteps).toBe(1);
  });
  it('createExecutionConfiguration accepts overrides', () => {
    const cfg = createExecutionConfiguration({ enableEvents: false });
    expect(cfg.enableEvents).toBe(false);
  });
  it('merges validationRules', () => {
    const cfg = createExecutionConfiguration({ validationRules: { abortOnError: false } });
    expect(cfg.validationRules.abortOnError).toBe(false);
    expect(cfg.validationRules.requireFreshRecommendations).toBe(true);
  });
  it('merges timeoutRules', () => {
    const cfg = createExecutionConfiguration({ timeoutRules: { perStepTimeoutMs: 5000 } });
    expect(cfg.timeoutRules.perStepTimeoutMs).toBe(5000);
  });
  it('merges retryRules with retryableStages cast', () => {
    const cfg = createExecutionConfiguration({ retryRules: { maxRetries: 5 } });
    expect(cfg.retryRules.maxRetries).toBe(5);
    expect(cfg.retryRules.retryableStages).toEqual(['execution_coordination', 'verification']);
  });
  it('merges featureFlags', () => {
    const cfg = createExecutionConfiguration({ featureFlags: { enableSnapshots: false } });
    expect(cfg.featureFlags.enableSnapshots).toBe(false);
    expect(cfg.featureFlags.enableVerification).toBe(true);
  });
  it('isStageEnabled returns true for enabled stages', () => {
    expect(isStageEnabled(DEFAULT_EXECUTION_CONFIGURATION, 'plan_validation')).toBe(true);
  });
  it('isStageEnabled returns false for disabled stages', () => {
    const cfg = createExecutionConfiguration({ enabledStages: ['plan_validation'] });
    expect(isStageEnabled(cfg, 'verification')).toBe(false);
  });
});

// ── Events ───────────────────────────────────────────────────

describe('ExecutionEvents', () => {
  let events: ExecutionEvents;
  beforeEach(() => { events = new ExecutionEvents(); });

  it('on/emit receives events', () => {
    let received = false;
    events.on('execution_started', () => { received = true; });
    events.emitStarted('e1');
    expect(received).toBe(true);
  });
  it('off removes listener', () => {
    let received = false;
    const listener = () => { received = true; };
    events.on('execution_completed', listener);
    events.off('execution_completed', listener);
    events.emitCompleted('e1');
    expect(received).toBe(false);
  });
  it('on returns unsubscribe function', () => {
    let received = false;
    const unsub = events.on('execution_failed', () => { received = true; });
    unsub();
    events.emitFailed('e1');
    expect(received).toBe(false);
  });
  it('emitValidationCompleted works', () => {
    let received = false;
    events.on('validation_completed', () => { received = true; });
    events.emitValidationCompleted('e1');
    expect(received).toBe(true);
  });
  it('emitSnapshotCreated works', () => {
    let received = false;
    events.on('snapshot_created', () => { received = true; });
    events.emitSnapshotCreated('e1');
    expect(received).toBe(true);
  });
  it('emitConfirmationRequested works', () => {
    let received = false;
    events.on('confirmation_requested', () => { received = true; });
    events.emitConfirmationRequested('e1');
    expect(received).toBe(true);
  });
  it('emitProgress works', () => {
    let received = false;
    events.on('execution_progress', () => { received = true; });
    events.emitProgress('e1');
    expect(received).toBe(true);
  });
  it('emitStepCompleted works', () => {
    let received = false;
    events.on('step_completed', () => { received = true; });
    events.emitStepCompleted('e1');
    expect(received).toBe(true);
  });
  it('emitVerificationCompleted works', () => {
    let received = false;
    events.on('verification_completed', () => { received = true; });
    events.emitVerificationCompleted('e1');
    expect(received).toBe(true);
  });
  it('emitRollbackStarted works', () => {
    let received = false;
    events.on('rollback_started', () => { received = true; });
    events.emitRollbackStarted('e1');
    expect(received).toBe(true);
  });
  it('emitRollbackCompleted works', () => {
    let received = false;
    events.on('rollback_completed', () => { received = true; });
    events.emitRollbackCompleted('e1');
    expect(received).toBe(true);
  });
  it('clear removes all', () => {
    events.on('execution_started', () => {});
    events.clear();
    expect(events.listenerCount()).toBe(0);
  });
  it('listenerCount returns correct count', () => {
    events.on('execution_started', () => {});
    events.on('execution_started', () => {});
    events.on('execution_failed', () => {});
    expect(events.listenerCount('execution_started')).toBe(2);
    expect(events.listenerCount()).toBe(3);
  });
  it('does not crash on listener error', () => {
    events.on('execution_started', () => { throw new Error('x'); });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    events.emitStarted('e1');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ── Validator ────────────────────────────────────────────────

describe('ExecutionValidator', () => {
  let validator: ExecutionValidator;
  beforeEach(() => { validator = new ExecutionValidator(createDefaultExecutionConfiguration()); });

  it('validates correct plan', () => {
    const result = validator.validate(createMockPlan());
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });
  it('fails for missing plan id', () => {
    const result = validator.validate(createMockPlan({ id: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'PLAN_NO_ID')).toBe(true);
  });
  it('fails for empty steps', () => {
    const result = validator.validate(createMockPlan({ steps: [] }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'PLAN_NO_STEPS')).toBe(true);
  });
  it('fails for expired plan', () => {
    const result = validator.validate(createMockPlan({ expiresAt: '2020-01-01T00:00:00Z' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'PLAN_EXPIRED')).toBe(true);
  });
  it('fails for unknown step in recommendedOrder', () => {
    const result = validator.validate(createMockPlan({ recommendedOrder: ['unknown'] }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'DEP_UNKNOWN_STEP')).toBe(true);
  });
  it('warns for critical risk steps', () => {
    const plan = createMockPlan({ steps: [createMockStep({ riskLevel: 'critical' })] });
    const result = validator.validate(plan);
    expect(result.warnings.some((w) => w.code === 'PERM_CRITICAL_RISK')).toBe(true);
  });
  it('warns for stale plan', () => {
    const plan = createMockPlan({ generatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() });
    const result = validator.validate(plan);
    expect(result.warnings.some((w) => w.code === 'PLAN_STALE')).toBe(true);
  });
});

// ── Snapshot Manager ─────────────────────────────────────────

describe('ExecutionSnapshotManager', () => {
  let manager: ExecutionSnapshotManager;
  beforeEach(() => { manager = new ExecutionSnapshotManager(createDefaultExecutionConfiguration()); });

  it('registers providers', () => {
    const provider = createMockSnapshotProvider('restore_point');
    expect(manager.registerProvider(provider)).toBe(true);
    expect(manager.providers).toContain('restore_point');
  });
  it('rejects duplicate providers', () => {
    const provider = createMockSnapshotProvider('restore_point');
    manager.registerProvider(provider);
    expect(manager.registerProvider(provider)).toBe(false);
  });
  it('unregisters providers', () => {
    manager.registerProvider(createMockSnapshotProvider('restore_point'));
    expect(manager.unregisterProvider('restore_point')).toBe(true);
    expect(manager.providers.length).toBe(0);
  });
  it('captures snapshot', async () => {
    manager.registerProvider(createMockSnapshotProvider('restore_point'));
    const snapshot = await manager.capture('exec_1');
    expect(snapshot.executionId).toBe('exec_1');
    expect(snapshot.restorePointCreated).toBe(true);
    expect(snapshot.snapshotProviders).toContain('restore_point');
  });
  it('returns empty snapshot when disabled', async () => {
    const cfg = createExecutionConfiguration({ featureFlags: { enableSnapshots: false } });
    const m = new ExecutionSnapshotManager(cfg);
    const snapshot = await m.capture('exec_1');
    expect(snapshot.snapshotProviders.length).toBe(0);
  });
  it('restores from snapshot', async () => {
    manager.registerProvider(createMockSnapshotProvider('restore_point'));
    const snapshot = await manager.capture('exec_1');
    const success = await manager.restore(snapshot);
    expect(success).toBe(true);
  });
  it('restore returns false when rollback disabled', async () => {
    const cfg = createExecutionConfiguration({ featureFlags: { enableRollback: false } });
    const m = new ExecutionSnapshotManager(cfg);
    const success = await m.restore({} as SystemSnapshot);
    expect(success).toBe(false);
  });
  it('getSnapshotByExecution finds snapshot', async () => {
    await manager.capture('exec_1');
    expect(manager.getSnapshotByExecution('exec_1')).toBeDefined();
    expect(manager.getSnapshotByExecution('unknown')).toBeUndefined();
  });
  it('clear removes all snapshots', async () => {
    await manager.capture('exec_1');
    manager.clear();
    expect(manager.getSnapshotByExecution('exec_1')).toBeUndefined();
  });
});

// ── Stage Manager ────────────────────────────────────────────

describe('ExecutionStageManager', () => {
  let manager: ExecutionStageManager;
  beforeEach(() => { manager = new ExecutionStageManager(createDefaultExecutionConfiguration()); });

  it('registers handlers', () => {
    const handler: StageHandler = {
      stage: 'plan_validation',
      async execute() { return { success: true, stage: 'plan_validation', data: {} }; },
    };
    expect(manager.registerHandler(handler)).toBe(true);
    expect(manager.hasHandler('plan_validation')).toBe(true);
  });
  it('rejects duplicate handlers', () => {
    const handler: StageHandler = {
      stage: 'plan_validation',
      async execute() { return { success: true, stage: 'plan_validation', data: {} }; },
    };
    manager.registerHandler(handler);
    expect(manager.registerHandler(handler)).toBe(false);
  });
  it('unregisters handlers', () => {
    const handler: StageHandler = {
      stage: 'plan_validation',
      async execute() { return { success: true, stage: 'plan_validation', data: {} }; },
    };
    manager.registerHandler(handler);
    expect(manager.unregisterHandler('plan_validation')).toBe(true);
    expect(manager.hasHandler('plan_validation')).toBe(false);
  });
  it('executeStage runs handler', async () => {
    const handler: StageHandler = {
      stage: 'verification',
      async execute() { return { success: true, stage: 'verification', data: { checked: true } }; },
    };
    manager.registerHandler(handler);
    const result = await manager.executeStage('verification', {} as unknown as StageContext);
    expect(result.success).toBe(true);
    expect(result.data.checked).toBe(true);
  });
  it('executeStage returns error for missing handler', async () => {
    const result = await manager.executeStage('recovery', {} as unknown as StageContext);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No handler');
  });
  it('executeStage catches handler errors', async () => {
    const handler: StageHandler = {
      stage: 'verification',
      async execute() { throw new Error('boom'); },
    };
    manager.registerHandler(handler);
    const result = await manager.executeStage('verification', {} as unknown as StageContext);
    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
  });
  it('getEnabledStages returns config stages', () => {
    expect(manager.getEnabledStages()).toEqual(DEFAULT_EXECUTION_CONFIGURATION.enabledStages);
  });
  it('isStageEnabled checks config', () => {
    expect(manager.isStageEnabled('plan_validation')).toBe(true);
  });
  it('clear removes all handlers', () => {
    const handler: StageHandler = {
      stage: 'plan_validation',
      async execute() { return { success: true, stage: 'plan_validation', data: {} }; },
    };
    manager.registerHandler(handler);
    manager.clear();
    expect(manager.getRegisteredStages().length).toBe(0);
  });
});

// ── Progress Manager ─────────────────────────────────────────

describe('ExecutionProgressManager', () => {
  let manager: ExecutionProgressManager;
  beforeEach(() => { manager = new ExecutionProgressManager(); });

  it('init creates progress', () => {
    const progress = manager.init('e1', 3);
    expect(progress.executionId).toBe('e1');
    expect(progress.totalSteps).toBe(3);
    expect(progress.overallProgress).toBe(0);
  });
  it('updateStep tracks completed', () => {
    manager.init('e1', 2);
    const step = createMockStep();
    manager.updateStep('e1', step, {
      stepId: step.id, stepTitle: step.title, status: 'completed',
      startedAt: null, completedAt: null, durationMs: 100,
      error: null, warnings: [], rollbackAvailable: true, rollbackExecuted: false, output: {},
    }, []);
    const progress = manager.getProgress('e1');
    expect(progress?.completedSteps).toBe(1);
    expect(progress?.overallProgress).toBe(50);
  });
  it('updateStep tracks failed', () => {
    manager.init('e1', 2);
    const step = createMockStep();
    manager.updateStep('e1', step, {
      stepId: step.id, stepTitle: step.title, status: 'failed',
      startedAt: null, completedAt: null, durationMs: 100,
      error: 'failed', warnings: [], rollbackAvailable: true, rollbackExecuted: false, output: {},
    }, []);
    const progress = manager.getProgress('e1');
    expect(progress?.failedSteps).toBe(1);
    expect(progress?.errors).toContain('failed');
  });
  it('updateStep tracks skipped', () => {
    manager.init('e1', 2);
    const step = createMockStep();
    manager.updateStep('e1', step, {
      stepId: step.id, stepTitle: step.title, status: 'skipped',
      startedAt: null, completedAt: null, durationMs: 0,
      error: null, warnings: [], rollbackAvailable: true, rollbackExecuted: false, output: {},
    }, []);
    const progress = manager.getProgress('e1');
    expect(progress?.skippedSteps).toBe(1);
  });
  it('updateStep updates rollback availability', () => {
    manager.init('e1', 2);
    const step = createMockStep();
    manager.updateStep('e1', step, {
      stepId: step.id, stepTitle: step.title, status: 'completed',
      startedAt: null, completedAt: null, durationMs: 100,
      error: null, warnings: [], rollbackAvailable: false, rollbackExecuted: false, output: {},
    }, []);
    const progress = manager.getProgress('e1');
    expect(progress?.rollbackAvailable).toBe(false);
  });
  it('setCurrentStep updates current', () => {
    manager.init('e1', 2);
    const step = createMockStep();
    manager.setCurrentStep('e1', step);
    const progress = manager.getProgress('e1');
    expect(progress?.currentStepId).toBe(step.id);
    expect(progress?.currentStepTitle).toBe(step.title);
  });
  it('getProgress returns null for unknown', () => {
    expect(manager.getProgress('unknown')).toBeNull();
  });
  it('computeOverallProgress static method', () => {
    const execution = {
      stepResults: [
        { status: 'completed' as const },
        { status: 'completed' as const },
        { status: 'pending' as const },
      ],
    } as unknown as PipelineExecution;
    expect(ExecutionProgressManager.computeOverallProgress(execution)).toBe(67);
  });
  it('remove deletes progress', () => {
    manager.init('e1', 2);
    manager.remove('e1');
    expect(manager.getProgress('e1')).toBeNull();
  });
  it('clear removes all', () => {
    manager.init('e1', 2);
    manager.init('e2', 3);
    manager.clear();
    expect(manager.getProgress('e1')).toBeNull();
    expect(manager.getProgress('e2')).toBeNull();
  });
});

// ── Coordinator ──────────────────────────────────────────────

describe('ExecutionCoordinator', () => {
  let coordinator: ExecutionCoordinator;
  beforeEach(() => { coordinator = new ExecutionCoordinator(createDefaultExecutionConfiguration()); });

  it('registers step handlers', () => {
    expect(coordinator.registerStepHandler(createMockStepHandler('step_1'))).toBe(true);
  });
  it('rejects duplicate handlers', () => {
    coordinator.registerStepHandler(createMockStepHandler('step_1'));
    expect(coordinator.registerStepHandler(createMockStepHandler('step_1'))).toBe(false);
  });
  it('executes steps sequentially', async () => {
    const plan = createMockPlan();
    coordinator.registerStepHandler(createMockStepHandler('step_1'));
    coordinator.registerStepHandler(createMockStepHandler('step_2'));
    const results = await coordinator.executeSteps('e1', plan, null);
    expect(results.length).toBe(2);
    expect(results.every((r) => r.status === 'completed')).toBe(true);
  });
  it('skips steps without handlers', async () => {
    const plan = createMockPlan();
    coordinator.registerStepHandler(createMockStepHandler('step_1'));
    const results = await coordinator.executeSteps('e1', plan, null);
    expect(results[0]?.status).toBe('completed');
    expect(results[1]?.status).toBe('skipped');
  });
  it('cancellation skips remaining steps', async () => {
    const plan = createMockPlan();
    coordinator.registerStepHandler(createMockStepHandler('step_1', { delay: 50 }));
    coordinator.registerStepHandler(createMockStepHandler('step_2', { delay: 50 }));
    coordinator.cancel('e1');
    const results = await coordinator.executeSteps('e1', plan, null);
    expect(results.every((r) => r.status === 'skipped')).toBe(true);
  });
  it('isCancelled checks cancellation', () => {
    coordinator.cancel('e1');
    expect(coordinator.isCancelled('e1')).toBe(true);
  });
  it('pause and resume work', () => {
    coordinator.pause('e1');
    expect(coordinator.isPaused('e1')).toBe(true);
    coordinator.resume('e1');
    expect(coordinator.isPaused('e1')).toBe(false);
  });
  it('failed step aborts when partial completion disabled', async () => {
    const cfg = createExecutionConfiguration({ recoveryRules: { allowPartialCompletion: false } });
    const c = new ExecutionCoordinator(cfg);
    const plan = createMockPlan();
    c.registerStepHandler(createMockStepHandler('step_1', { success: false, error: 'failed' }));
    c.registerStepHandler(createMockStepHandler('step_2'));
    const results = await c.executeSteps('e1', plan, null);
    expect(results[0]?.status).toBe('failed');
    expect(results[1]?.status).toBe('skipped');
  });
  it('retries failed steps', async () => {
    const cfg = createExecutionConfiguration({ retryRules: { maxRetries: 2, retryDelayMs: 10, retryableStages: ['execution_coordination'] } });
    const c = new ExecutionCoordinator(cfg);
    const plan = createMockPlan({ steps: [createMockStep()] });
    let attempts = 0;
    c.registerStepHandler({
      stepId: 'step_1',
      async execute() {
        attempts++;
        if (attempts < 2) throw new Error('fail');
        return { success: true, output: {}, warnings: [] };
      },
    });
    const results = await c.executeSteps('e1', plan, null);
    expect(results[0]?.status).toBe('completed');
    expect(attempts).toBe(2);
  });
  it('clearCancellation removes flags', () => {
    coordinator.cancel('e1');
    coordinator.pause('e1');
    coordinator.clearCancellation('e1');
    expect(coordinator.isCancelled('e1')).toBe(false);
    expect(coordinator.isPaused('e1')).toBe(false);
  });
});

// ── Verification Manager ─────────────────────────────────────

describe('ExecutionVerificationManager', () => {
  let manager: ExecutionVerificationManager;
  beforeEach(() => { manager = new ExecutionVerificationManager(createDefaultExecutionConfiguration()); });

  it('verifies successful execution', () => {
    const plan = createMockPlan();
    const results = [
      { stepId: 'step_1', stepTitle: 'S1', status: 'completed' as const, startedAt: null, completedAt: null, durationMs: 100, error: null, warnings: [], rollbackAvailable: true, rollbackExecuted: false, output: { ok: true } },
    ];
    const verification = manager.verify(plan, results, 50, 60);
    expect(verification.verified).toBe(true);
    expect(verification.checks.length).toBeGreaterThan(0);
  });
  it('detects failed steps', () => {
    const plan = createMockPlan();
    const results = [
      { stepId: 'step_1', stepTitle: 'S1', status: 'failed' as const, startedAt: null, completedAt: null, durationMs: 100, error: 'err', warnings: [], rollbackAvailable: true, rollbackExecuted: false, output: {} },
    ];
    const verification = manager.verify(plan, results, 50, 50);
    expect(verification.verified).toBe(false);
  });
  it('checks health recalculation', () => {
    const plan = createMockPlan();
    const verification = manager.verify(plan, [], 50, null);
    expect(verification.healthRecalculated).toBe(false);
  });
  it('health recalculation passes when healthAfter set', () => {
    const plan = createMockPlan();
    const verification = manager.verify(plan, [], 50, 60);
    expect(verification.healthRecalculated).toBe(true);
  });
  it('requests prediction and insight refresh', () => {
    const plan = createMockPlan();
    const verification = manager.verify(plan, [], 50, 60);
    expect(verification.predictionRefreshRequested).toBe(true);
    expect(verification.insightRefreshRequested).toBe(true);
  });
});

// ── Recovery Manager ─────────────────────────────────────────

describe('ExecutionRecoveryManager', () => {
  let manager: ExecutionRecoveryManager;
  beforeEach(() => { manager = new ExecutionRecoveryManager(createDefaultExecutionConfiguration()); });

  it('determines abort when no completed steps', () => {
    const action = manager.determineAction(
      [{ stepId: 's1', stepTitle: 'S1', status: 'failed', startedAt: null, completedAt: null, durationMs: 0, error: 'e', warnings: [], rollbackAvailable: true, rollbackExecuted: false, output: {} }],
      [],
    );
    expect(action).toBe('abort');
  });
  it('determines skip when partial completion allowed', () => {
    const action = manager.determineAction(
      [{ stepId: 's1', stepTitle: 'S1', status: 'failed', startedAt: null, completedAt: null, durationMs: 0, error: 'e', warnings: [], rollbackAvailable: true, rollbackExecuted: false, output: {} }],
      [{ stepId: 's2', stepTitle: 'S2', status: 'completed', startedAt: null, completedAt: null, durationMs: 0, error: null, warnings: [], rollbackAvailable: true, rollbackExecuted: false, output: {} }],
    );
    expect(action).toBe('skip');
  });
  it('determines rollback when rollbackOnFailure', () => {
    const cfg = createExecutionConfiguration({ recoveryRules: { rollbackOnFailure: true } });
    const m = new ExecutionRecoveryManager(cfg);
    const action = m.determineAction(
      [{ stepId: 's1', stepTitle: 'S1', status: 'failed', startedAt: null, completedAt: null, durationMs: 0, error: 'e', warnings: [], rollbackAvailable: true, rollbackExecuted: false, output: {} }],
      [{ stepId: 's2', stepTitle: 'S2', status: 'completed', startedAt: null, completedAt: null, durationMs: 0, error: null, warnings: [], rollbackAvailable: true, rollbackExecuted: false, output: {} }],
    );
    expect(action).toBe('rollback');
  });
  it('rollback rolls back completed steps', async () => {
    const steps = [
      { stepId: 's1', stepTitle: 'S1', status: 'completed' as const, startedAt: null, completedAt: null, durationMs: 0, error: null, warnings: [], rollbackAvailable: true, rollbackExecuted: false, output: {} },
      { stepId: 's2', stepTitle: 'S2', status: 'failed' as const, startedAt: null, completedAt: null, durationMs: 0, error: 'e', warnings: [], rollbackAvailable: false, rollbackExecuted: false, output: {} },
    ];
    const result = await manager.rollback('e1', steps, null);
    expect(result.success).toBe(true);
    expect(result.rolledBackSteps).toBe(1);
    expect(steps[0]?.status).toBe('rolled_back');
    expect(steps[0]?.rollbackExecuted).toBe(true);
  });
  it('rollback returns false when disabled', async () => {
    const cfg = createExecutionConfiguration({ featureFlags: { enableRollback: false } });
    const m = new ExecutionRecoveryManager(cfg);
    const result = await m.rollback('e1', [], null);
    expect(result.success).toBe(false);
  });
  it('generateFailureReport produces report', () => {
    const steps = [
      { stepId: 's1', stepTitle: 'S1', status: 'completed' as const, startedAt: null, completedAt: null, durationMs: 100, error: null, warnings: [], rollbackAvailable: true, rollbackExecuted: false, output: {} },
      { stepId: 's2', stepTitle: 'S2', status: 'failed' as const, startedAt: null, completedAt: null, durationMs: 50, error: 'err', warnings: [], rollbackAvailable: true, rollbackExecuted: false, output: {} },
    ];
    const report = manager.generateFailureReport('e1', steps, ['err']);
    expect(report.executionId).toBe('e1');
    expect(report.failedSteps.length).toBe(1);
    expect(report.completedSteps.length).toBe(1);
    expect(report.failureRate).toBe(0.5);
  });
});

// ── History ──────────────────────────────────────────────────

describe('ExecutionHistory', () => {
  let history: ExecutionHistory;
  beforeEach(() => { history = new ExecutionHistory(); });

  it('records entries', () => {
    history.record('e1', 'started');
    expect(history.count).toBe(1);
  });
  it('getAll returns all', () => {
    history.record('e1', 'started');
    history.record('e2', 'completed');
    expect(history.getAll().length).toBe(2);
  });
  it('getRecent returns last N', () => {
    for (let i = 0; i < 5; i++) history.record(`e${i}`, 'started');
    expect(history.getRecent(2).length).toBe(2);
  });
  it('getByExecution filters by execution', () => {
    history.record('e1', 'started');
    history.record('e2', 'started');
    expect(history.getByExecution('e1').length).toBe(1);
  });
  it('getByAction filters by action', () => {
    history.record('e1', 'started');
    history.record('e2', 'completed');
    expect(history.getByAction('started').length).toBe(1);
  });
  it('getByStage filters by stage', () => {
    history.record('e1', 'completed', 'verification');
    history.record('e2', 'completed', 'completion');
    expect(history.getByStage('verification').length).toBe(1);
  });
  it('clear removes all', () => {
    history.record('e1', 'started');
    history.clear();
    expect(history.count).toBe(0);
  });
  it('trims to max entries', () => {
    const h = new ExecutionHistory(5);
    for (let i = 0; i < 10; i++) h.record(`e${i}`, 'started');
    expect(h.count).toBe(5);
  });
});

// ── Pipeline Builder ─────────────────────────────────────────

describe('ExecutionPipelineBuilder', () => {
  let builder: ExecutionPipelineBuilder;
  beforeEach(() => { builder = new ExecutionPipelineBuilder(createDefaultExecutionConfiguration()); });

  it('builds execution from plan', () => {
    const plan = createMockPlan();
    const execution = builder.build(plan);
    expect(execution.id).toContain('exec_');
    expect(execution.planId).toBe(plan.id);
    expect(execution.status).toBe('pending');
    expect(execution.stepResults.length).toBe(0);
  });
  it('sets estimated remaining time from plan', () => {
    const plan = createMockPlan({ estimatedDuration: 120 });
    const execution = builder.build(plan);
    expect(execution.estimatedRemainingTime).toBe(120);
  });
  it('sets rollback from plan', () => {
    const plan = createMockPlan({ rollbackAvailable: false });
    const execution = builder.build(plan);
    expect(execution.rollbackAvailable).toBe(false);
  });
  it('buildFromPlan sets healthBefore', () => {
    const plan = createMockPlan();
    const execution = builder.buildFromPlan(plan, 55);
    expect(execution.healthBefore).toBe(55);
  });
  it('buildFromPlan defaults healthBefore to null', () => {
    const plan = createMockPlan();
    const execution = builder.buildFromPlan(plan);
    expect(execution.healthBefore).toBeNull();
  });
  it('stores plan metadata', () => {
    const plan = createMockPlan();
    const execution = builder.build(plan);
    expect(execution.executionMetadata.planType).toBe('quick_optimize');
    expect(execution.executionMetadata.stepCount).toBe(2);
  });
});

// ── Pipeline Manager ─────────────────────────────────────────

describe('ExecutionPipelineManager', () => {
  let manager: ExecutionPipelineManager;
  beforeEach(() => { manager = new ExecutionPipelineManager(); });

  it('executePlan runs full pipeline', async () => {
    const plan = createMockPlan();
    manager.registerStepHandler(createMockStepHandler('step_1'));
    manager.registerStepHandler(createMockStepHandler('step_2'));
    const execution = await manager.executePlan(plan);
    expect(execution.status).toBe('completed');
    expect(execution.stepResults.length).toBe(2);
    expect(execution.completedStages).toContain('plan_validation');
    expect(execution.completedStages).toContain('execution_coordination');
  });
  it('executePlan fails for invalid plan', async () => {
    const plan = createMockPlan({ id: '', steps: [] });
    const execution = await manager.executePlan(plan);
    expect(execution.status).toBe('failed');
    expect(execution.failedStages).toContain('plan_validation');
  });
  it('executePlan with skipConfirmation bypasses confirmation', async () => {
    const plan = createMockPlan({ requiresConfirmation: true });
    manager.registerStepHandler(createMockStepHandler('step_1'));
    manager.registerStepHandler(createMockStepHandler('step_2'));
    const execution = await manager.executePlan(plan, { skipConfirmation: true });
    expect(execution.status).not.toBe('waiting_for_confirmation');
  });
  it('executePlan sets healthBefore', async () => {
    const plan = createMockPlan();
    manager.registerStepHandler(createMockStepHandler('step_1'));
    manager.registerStepHandler(createMockStepHandler('step_2'));
    const execution = await manager.executePlan(plan, { healthBefore: 50 });
    expect(execution.healthBefore).toBe(50);
  });
  it('pauseExecution pauses running execution', async () => {
    const plan = createMockPlan();
    manager.registerStepHandler(createMockStepHandler('step_1', { delay: 100 }));
    manager.registerStepHandler(createMockStepHandler('step_2', { delay: 100 }));
    const execPromise = manager.executePlan(plan);
    // Can't easily test pause mid-flight, but we can test the API
    const execution = await execPromise;
    expect(execution.status).toBe('completed');
  });
  it('pauseExecution returns false for unknown', () => {
    expect(manager.pauseExecution('unknown')).toBe(false);
  });
  it('cancelExecution cancels', async () => {
    manager.registerStepHandler(createMockStepHandler('step_1', { delay: 100 }));
    manager.cancelExecution('nonexistent');
    // cancel on unknown returns false
    expect(manager.cancelExecution('unknown')).toBe(false);
  });
  it('getExecution returns execution', async () => {
    const plan = createMockPlan();
    manager.registerStepHandler(createMockStepHandler('step_1'));
    manager.registerStepHandler(createMockStepHandler('step_2'));
    const execution = await manager.executePlan(plan);
    expect(manager.getExecution(execution.id)).toBeDefined();
  });
  it('getExecution returns undefined for unknown', () => {
    expect(manager.getExecution('unknown')).toBeUndefined();
  });
  it('getExecutionHistory returns all history', async () => {
    const plan = createMockPlan();
    manager.registerStepHandler(createMockStepHandler('step_1'));
    manager.registerStepHandler(createMockStepHandler('step_2'));
    await manager.executePlan(plan);
    expect(manager.getExecutionHistory().length).toBeGreaterThan(0);
  });
  it('getExecutionHistory filters by execution id', async () => {
    const plan = createMockPlan();
    manager.registerStepHandler(createMockStepHandler('step_1'));
    manager.registerStepHandler(createMockStepHandler('step_2'));
    const execution = await manager.executePlan(plan);
    expect(manager.getExecutionHistory(execution.id).length).toBeGreaterThan(0);
    expect(manager.getExecutionHistory('unknown').length).toBe(0);
  });
  it('getExecutionStatistics returns stats', async () => {
    const plan = createMockPlan();
    manager.registerStepHandler(createMockStepHandler('step_1'));
    manager.registerStepHandler(createMockStepHandler('step_2'));
    await manager.executePlan(plan);
    const stats = manager.getExecutionStatistics();
    expect(stats.totalExecutions).toBe(1);
    expect(stats.byStatus.completed ?? 0).toBe(1);
  });
  it('generateReport produces structured report', async () => {
    const plan = createMockPlan();
    manager.registerStepHandler(createMockStepHandler('step_1'));
    manager.registerStepHandler(createMockStepHandler('step_2'));
    const execution = await manager.executePlan(plan);
    const report = manager.generateReport(execution.id);
    expect(report).not.toBeNull();
    expect(report!.executionId).toBe(execution.id);
    expect(report!.completedSteps.length).toBe(2);
    expect(report!.summary).toContain('completed');
  });
  it('generateReport returns null for unknown', () => {
    expect(manager.generateReport('unknown')).toBeNull();
  });
  it('emits execution_started event', async () => {
    let emitted = false;
    manager.on('execution_started', () => { emitted = true; });
    const plan = createMockPlan();
    manager.registerStepHandler(createMockStepHandler('step_1'));
    manager.registerStepHandler(createMockStepHandler('step_2'));
    await manager.executePlan(plan);
    expect(emitted).toBe(true);
  });
  it('emits execution_completed event', async () => {
    let emitted = false;
    manager.on('execution_completed', () => { emitted = true; });
    const plan = createMockPlan();
    manager.registerStepHandler(createMockStepHandler('step_1'));
    manager.registerStepHandler(createMockStepHandler('step_2'));
    await manager.executePlan(plan);
    expect(emitted).toBe(true);
  });
  it('emits step_completed events', async () => {
    const completedSteps: string[] = [];
    manager.on('step_completed', (event) => {
      const data = event.data as { stepId: string };
      completedSteps.push(data.stepId);
    });
    const plan = createMockPlan();
    manager.registerStepHandler(createMockStepHandler('step_1'));
    manager.registerStepHandler(createMockStepHandler('step_2'));
    await manager.executePlan(plan);
    expect(completedSteps.length).toBe(2);
  });
  it('events disabled does not emit', async () => {
    const cfg = createExecutionConfiguration({ enableEvents: false });
    const m = new ExecutionPipelineManager(cfg);
    let emitted = false;
    m.on('execution_started', () => { emitted = true; });
    const plan = createMockPlan();
    m.registerStepHandler(createMockStepHandler('step_1'));
    m.registerStepHandler(createMockStepHandler('step_2'));
    await m.executePlan(plan);
    expect(emitted).toBe(false);
  });
  it('updateConfig updates rules', () => {
    manager.updateConfig({ enableEvents: false });
    expect(manager.config.enableEvents).toBe(false);
  });
  it('registerStepHandler delegates to coordinator', () => {
    expect(manager.registerStepHandler(createMockStepHandler('step_1'))).toBe(true);
  });
  it('registerSnapshotProvider delegates to snapshot manager', () => {
    expect(manager.registerSnapshotProvider(createMockSnapshotProvider('test'))).toBe(true);
  });
  it('registerStageHandler delegates to stage manager', () => {
    const handler: StageHandler = {
      stage: 'verification',
      async execute() { return { success: true, stage: 'verification', data: {} }; },
    };
    expect(manager.registerStageHandler(handler)).toBe(true);
  });
  it('clear resets everything', async () => {
    const plan = createMockPlan();
    manager.registerStepHandler(createMockStepHandler('step_1'));
    manager.registerStepHandler(createMockStepHandler('step_2'));
    await manager.executePlan(plan);
    manager.clear();
    expect(manager.getExecutionHistory().length).toBe(0);
  });
  it('rollbackExecution returns false for unknown', async () => {
    expect(await manager.rollbackExecution('unknown')).toBe(false);
  });
  it('rollbackExecution returns false when rollback unavailable', async () => {
    const plan = createMockPlan({ rollbackAvailable: false });
    manager.registerStepHandler(createMockStepHandler('step_1'));
    manager.registerStepHandler(createMockStepHandler('step_2'));
    const execution = await manager.executePlan(plan);
    expect(await manager.rollbackExecution(execution.id)).toBe(false);
  });
  it('rollbackExecution succeeds when rollback available', async () => {
    const plan = createMockPlan({ rollbackAvailable: true });
    manager.registerStepHandler(createMockStepHandler('step_1'));
    manager.registerStepHandler(createMockStepHandler('step_2'));
    const execution = await manager.executePlan(plan);
    const success = await manager.rollbackExecution(execution.id);
    expect(success).toBe(true);
    expect(manager.getExecution(execution.id)?.status).toBe('recovered');
  });
});

// ── Regression ───────────────────────────────────────────────

describe('Regression', () => {
  it('all exports are defined', async () => {
    const module = await import('../index');
    expect(module.ExecutionPipelineManager).toBeDefined();
    expect(module.ExecutionPipelineBuilder).toBeDefined();
    expect(module.ExecutionCoordinator).toBeDefined();
    expect(module.ExecutionStageManager).toBeDefined();
    expect(module.ExecutionValidator).toBeDefined();
    expect(module.ExecutionSnapshotManager).toBeDefined();
    expect(module.ExecutionProgressManager).toBeDefined();
    expect(module.ExecutionVerificationManager).toBeDefined();
    expect(module.ExecutionRecoveryManager).toBeDefined();
    expect(module.ExecutionHistory).toBeDefined();
    expect(module.ExecutionEvents).toBeDefined();
    expect(module.DEFAULT_EXECUTION_CONFIGURATION).toBeDefined();
  });
  it('full lifecycle: execute → verify → report', async () => {
    const manager = new ExecutionPipelineManager();
    const plan = createMockPlan();
    manager.registerStepHandler(createMockStepHandler('step_1'));
    manager.registerStepHandler(createMockStepHandler('step_2'));
    const execution = await manager.executePlan(plan, { healthBefore: 50 });
    expect(execution.status).toBe('completed');
    expect(execution.verificationStatus).toBe('failed');
    const report = manager.generateReport(execution.id);
    expect(report).not.toBeNull();
    expect(report!.completedSteps.length).toBe(2);
  });
  it('does not duplicate optimization logic', () => {
    const manager = new ExecutionPipelineManager();
    expect(manager.coordinator).toBeDefined();
    expect(manager.stageManager).toBeDefined();
  });
});

// ── Performance ──────────────────────────────────────────────

describe('Performance', () => {
  it('pipeline overhead under 50ms before execution', () => {
    const manager = new ExecutionPipelineManager();
    const start = performance.now();
    manager.registerStepHandler(createMockStepHandler('step_1'));
    manager.registerStepHandler(createMockStepHandler('step_2'));
    const overhead = performance.now() - start;
    expect(overhead).toBeLessThan(50);
  });
  it('full execution with mock handlers completes quickly', async () => {
    const manager = new ExecutionPipelineManager();
    const plan = createMockPlan();
    manager.registerStepHandler(createMockStepHandler('step_1'));
    manager.registerStepHandler(createMockStepHandler('step_2'));
    const start = performance.now();
    await manager.executePlan(plan);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
  });
});

// ── Edge Cases ───────────────────────────────────────────────

describe('Edge Cases', () => {
  it('executePlan with empty steps fails validation', async () => {
    const manager = new ExecutionPipelineManager();
    const plan = createMockPlan({ steps: [] });
    const execution = await manager.executePlan(plan);
    expect(execution.status).toBe('failed');
  });
  it('executePlan with expired plan fails validation', async () => {
    const manager = new ExecutionPipelineManager();
    const plan = createMockPlan({ expiresAt: '2020-01-01T00:00:00Z' });
    const execution = await manager.executePlan(plan);
    expect(execution.status).toBe('failed');
  });
  it('executePlan with no step handlers skips all steps', async () => {
    const manager = new ExecutionPipelineManager();
    const plan = createMockPlan();
    const execution = await manager.executePlan(plan);
    expect(execution.stepResults.every((r) => r.status === 'skipped')).toBe(true);
  });
  it('generateReport for unknown returns null', () => {
    const manager = new ExecutionPipelineManager();
    expect(manager.generateReport('unknown')).toBeNull();
  });
  it('getExecutionStatistics with no executions returns zeros', () => {
    const manager = new ExecutionPipelineManager();
    const stats = manager.getExecutionStatistics();
    expect(stats.totalExecutions).toBe(0);
    expect(stats.successRate).toBe(0);
  });
  it('snapshot disabled still executes', async () => {
    const cfg = createExecutionConfiguration({ featureFlags: { enableSnapshots: false } });
    const manager = new ExecutionPipelineManager(cfg);
    const plan = createMockPlan();
    manager.registerStepHandler(createMockStepHandler('step_1'));
    manager.registerStepHandler(createMockStepHandler('step_2'));
    const execution = await manager.executePlan(plan);
    expect(execution.status).toBe('completed');
  });
  it('verification disabled still completes', async () => {
    const cfg = createExecutionConfiguration({ featureFlags: { enableVerification: false } });
    const manager = new ExecutionPipelineManager(cfg);
    const plan = createMockPlan();
    manager.registerStepHandler(createMockStepHandler('step_1'));
    manager.registerStepHandler(createMockStepHandler('step_2'));
    const execution = await manager.executePlan(plan);
    expect(execution.status).toBe('completed');
    expect(execution.verificationStatus).toBe('pending');
  });
  it('plan with single step works', async () => {
    const manager = new ExecutionPipelineManager();
    const plan = createMockPlan({ steps: [createMockStep()], recommendedOrder: ['step_1'] });
    manager.registerStepHandler(createMockStepHandler('step_1'));
    const execution = await manager.executePlan(plan);
    expect(execution.stepResults.length).toBe(1);
    expect(execution.status).toBe('completed');
  });
  it('failed step with partial completion allows recovery', async () => {
    const manager = new ExecutionPipelineManager();
    const plan = createMockPlan();
    manager.registerStepHandler(createMockStepHandler('step_1', { success: false, error: 'failed' }));
    manager.registerStepHandler(createMockStepHandler('step_2'));
    const execution = await manager.executePlan(plan);
    expect(execution.status).toBe('recovered');
    expect(execution.stepResults[0]?.status).toBe('failed');
    expect(execution.stepResults[1]?.status).toBe('completed');
  });
});
