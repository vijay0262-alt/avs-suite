/**
 * Optimization Recovery & Rollback Center — Recovery Manager
 *
 * Top-level orchestrator and single source of truth for optimization recovery.
 *
 * Public APIs:
 *   listRecoveries()
 *   createRecoveryPlan()
 *   validateRecovery()
 *   compareSnapshots()
 *   executeRecovery()
 *   getRecoveryHistory()
 *   exportRecoveryReport()
 *
 * Emits lifecycle events:
 *   recovery_created, recovery_validated, recovery_started,
 *   recovery_completed, recovery_failed, snapshot_compared, recovery_exported
 */
import type {
  RecoveryConfiguration,
  RecoveryRecord,
  RecoveryPlan,
  RecoveryValidationResult,
  RecoveryComparison,
  RecoveryHistoryEntry,
  RecoveryAnalytics,
  RecoveryExecutionResult,
  SnapshotCatalogEntry,
  RecoveryPlanningInput,
  SystemSnapshot,
  RecoveryEventType,
  RecoveryEventListener,
  RecoveryProviderPlugin,
  RecoveryComparisonPlugin,
  ExportPlugin,
  ExportFormat,
  RecoveryExport,
} from './types';
import { createRecoveryConfiguration, type DeepPartial } from './recoveryConfiguration';
import { RecoveryEvents } from './recoveryEvents';
import { RecoveryHistory } from './recoveryHistory';
import { RecoveryAnalyticsEngine } from './recoveryAnalytics';
import { RecoveryExporter } from './recoveryExporter';
import { RecoveryCenter } from './recoveryCenter';
import type { ExecutionSnapshotManager } from '../../execution-pipeline/executionSnapshotManager';

export class RecoveryManager {
  private _config: RecoveryConfiguration;
  private _events: RecoveryEvents;
  private _history: RecoveryHistory;
  private _analytics: RecoveryAnalyticsEngine;
  private _exporter: RecoveryExporter;
  private _center: RecoveryCenter;
  private _recoveries: Map<string, RecoveryRecord> = new Map();
  private _plans: Map<string, RecoveryPlan> = new Map();
  private _comparisons: Map<string, RecoveryComparison> = new Map();

  constructor(config?: RecoveryConfiguration | DeepPartial<RecoveryConfiguration>) {
    if (config && 'configVersion' in config) {
      this._config = config as RecoveryConfiguration;
    } else {
      this._config = createRecoveryConfiguration(config as DeepPartial<RecoveryConfiguration>);
    }
    this._events = new RecoveryEvents();
    this._history = new RecoveryHistory(this._config.maxHistoryEntries);
    this._analytics = new RecoveryAnalyticsEngine();
    this._exporter = new RecoveryExporter(this._config);
    this._center = new RecoveryCenter(this._config);
  }

  listRecoveries(): RecoveryRecord[] {
    return Array.from(this._recoveries.values());
  }

  createRecoveryPlan(input: RecoveryPlanningInput): { recovery: RecoveryRecord; plan: RecoveryPlan } {
    const plan = this._center.createRecoveryPlan(input);
    const recovery = this._center.planner.createRecoveryRecord(input, plan);
    plan.recoveryId = recovery.id;

    this._recoveries.set(recovery.id, recovery);
    this._plans.set(plan.id, plan);

    this._history.record(recovery.id, input.operationId, 'created', { recoveryType: input.recoveryType });

    if (this._config.enableEvents) {
      this._events.emitCreated(recovery.id, { recoveryType: input.recoveryType, planId: plan.id });
    }

    return { recovery, plan };
  }

  validateRecovery(recoveryId: string): RecoveryValidationResult | null {
    const recovery = this._recoveries.get(recoveryId);
    if (!recovery) return null;
    const plan = Array.from(this._plans.values()).find((p) => p.recoveryId === recoveryId);
    if (!plan) return null;

    const snapshot = this._center.catalog.getBySnapshotId(recovery.snapshotId);
    if (!snapshot) {
      return {
        valid: false,
        errors: [{ code: 'SNAPSHOT_NOT_FOUND', message: 'Snapshot not found in catalog', field: 'snapshotId' }],
        warnings: [],
        checks: [],
      };
    }

    const result = this._center.validateRecovery(snapshot, plan);
    this._history.record(recovery.id, recovery.operationId, 'validated', { valid: result.valid });

    if (this._config.enableEvents) {
      this._events.emitValidated(recovery.id, { valid: result.valid });
    }

    return result;
  }

  compareSnapshots(snapshotIdA: string, snapshotIdB: string): RecoveryComparison | null {
    const snapshotA = this._center.catalog.getBySnapshotId(snapshotIdA);
    const snapshotB = this._center.catalog.getBySnapshotId(snapshotIdB);
    if (!snapshotA || !snapshotB) return null;

    const comparison = this._center.compareSnapshots(snapshotA, snapshotB);
    this._comparisons.set(comparison.id, comparison);

    if (this._config.enableEvents) {
      this._events.emitSnapshotCompared(comparison.id, { snapshotIdA, snapshotIdB });
    }

    return comparison;
  }

  async executeRecovery(recoveryId: string, snapshot: SystemSnapshot | null): Promise<RecoveryExecutionResult | null> {
    const recovery = this._recoveries.get(recoveryId);
    if (!recovery) return null;
    const plan = Array.from(this._plans.values()).find((p) => p.recoveryId === recoveryId);
    if (!plan) return null;

    this._history.record(recovery.id, recovery.operationId, 'started');

    if (this._config.enableEvents) {
      this._events.emitStarted(recovery.id, {});
    }

    const result = await this._center.executeRecovery(recovery, plan, snapshot);

    if (result.success) {
      this._history.record(recovery.id, recovery.operationId, 'completed', { rolledBackSteps: result.rolledBackSteps });
      if (this._config.enableEvents) {
        this._events.emitCompleted(recovery.id, { rolledBackSteps: result.rolledBackSteps });
      }
    } else {
      this._history.record(recovery.id, recovery.operationId, 'failed', { message: result.message });
      if (this._config.enableEvents) {
        this._events.emitFailed(recovery.id, { message: result.message });
      }
    }

    return result;
  }

  getRecoveryHistory(): RecoveryHistoryEntry[] {
    return this._history.getAll();
  }

  getRecoveryHistoryByRecovery(recoveryId: string): RecoveryHistoryEntry[] {
    return this._history.getByRecovery(recoveryId);
  }

  exportRecoveryReport(recoveryId: string, format: ExportFormat): RecoveryExport | null {
    const recovery = this._recoveries.get(recoveryId);
    if (!recovery) return null;

    const plan = Array.from(this._plans.values()).find((p) => p.recoveryId === recoveryId) ?? null;
    const exportResult = this._exporter.exportRecovery(recovery, plan, format);

    if (this._config.enableEvents) {
      this._events.emitExported(recovery.id, { format });
    }

    return exportResult;
  }

  exportComparisonReport(comparisonId: string, format: ExportFormat): RecoveryExport | null {
    const comparison = this._comparisons.get(comparisonId);
    if (!comparison) return null;
    return this._exporter.exportComparison(comparison, format);
  }

  getRecoveryAnalytics(): RecoveryAnalytics {
    return this._analytics.compute(
      this._history.getAll(),
      this._center.catalog.getAll(),
      this.listRecoveries(),
    );
  }

  getRecovery(recoveryId: string): RecoveryRecord | undefined {
    return this._recoveries.get(recoveryId);
  }

  getPlan(planId: string): RecoveryPlan | undefined {
    return this._plans.get(planId);
  }

  getComparison(comparisonId: string): RecoveryComparison | undefined {
    return this._comparisons.get(comparisonId);
  }

  registerSnapshot(snapshot: SystemSnapshot, optimizationSource: string, profileUsed: string): SnapshotCatalogEntry {
    return this._center.registerSnapshot(snapshot, optimizationSource, profileUsed);
  }

  checkEligibility(snapshot: SnapshotCatalogEntry) {
    return this._center.checkEligibility(snapshot);
  }

  on(event: RecoveryEventType, listener: RecoveryEventListener): () => void {
    return this._events.on(event, listener);
  }

  off(event: RecoveryEventType, listener: RecoveryEventListener): void {
    this._events.off(event, listener);
  }

  registerProviderPlugin(plugin: RecoveryProviderPlugin): boolean {
    return this._center.registerProviderPlugin(plugin);
  }

  registerComparisonPlugin(plugin: RecoveryComparisonPlugin): boolean {
    return this._center.registerComparisonPlugin(plugin);
  }

  registerExportPlugin(plugin: ExportPlugin): boolean {
    return this._exporter.registerPlugin(plugin);
  }

  setSnapshotManager(manager: ExecutionSnapshotManager): void {
    this._center.setSnapshotManager(manager);
  }

  get config(): RecoveryConfiguration {
    return this._config;
  }

  updateConfig(overrides: DeepPartial<RecoveryConfiguration>): void {
    this._config = createRecoveryConfiguration(overrides);
    this._history.setMaxEntries(this._config.maxHistoryEntries);
    this._exporter.updateConfig(this._config);
    this._center.updateConfig(this._config);
  }

  get center(): RecoveryCenter {
    return this._center;
  }

  get exporter(): RecoveryExporter {
    return this._exporter;
  }

  clear(): void {
    this._recoveries.clear();
    this._plans.clear();
    this._comparisons.clear();
    this._history.clear();
    this._events.clear();
    this._center.clear();
  }
}
