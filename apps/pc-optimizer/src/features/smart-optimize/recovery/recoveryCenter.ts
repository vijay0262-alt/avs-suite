/**
 * Optimization Recovery & Rollback Center — Recovery Center
 *
 * The central hub for recovery operations. Orchestrates snapshot catalog,
 * eligibility, planning, validation, comparison, and coordination.
 * Does NOT execute optimizations. Does NOT modify optimizer modules.
 */
import type {
  RecoveryConfiguration,
  SnapshotCatalogEntry,
  RecoveryPlan,
  RecoveryRecord,
  RecoveryValidationResult,
  RecoveryComparison,
  RecoveryEligibilityResult,
  RecoveryPlanningInput,
  RecoveryExecutionResult,
  SystemSnapshot,
  RecoveryProviderPlugin,
  RecoveryComparisonPlugin,
  ExportPlugin,
} from './types';
import { RecoverySnapshotCatalog } from './recoverySnapshotCatalog';
import { RecoveryEligibilityEngine } from './recoveryEligibilityEngine';
import { RecoveryPlanner } from './recoveryPlanner';
import { RecoveryValidator } from './recoveryValidator';
import { RecoveryComparisonEngine } from './recoveryComparisonEngine';
import { RecoveryCoordinator } from './recoveryCoordinator';
import type { ExecutionSnapshotManager } from '../../execution-pipeline/executionSnapshotManager';

export class RecoveryCenter {
  private _config: RecoveryConfiguration;
  private _catalog: RecoverySnapshotCatalog;
  private _eligibility: RecoveryEligibilityEngine;
  private _planner: RecoveryPlanner;
  private _validator: RecoveryValidator;
  private _comparison: RecoveryComparisonEngine;
  private _coordinator: RecoveryCoordinator;

  constructor(config: RecoveryConfiguration) {
    this._config = config;
    this._catalog = new RecoverySnapshotCatalog(config);
    this._eligibility = new RecoveryEligibilityEngine(config);
    this._planner = new RecoveryPlanner(config);
    this._validator = new RecoveryValidator(config);
    this._comparison = new RecoveryComparisonEngine(config);
    this._coordinator = new RecoveryCoordinator(config);
  }

  updateConfig(config: RecoveryConfiguration): void {
    this._config = config;
    this._catalog.updateConfig(config);
    this._eligibility.updateConfig(config);
    this._planner.updateConfig(config);
    this._validator.updateConfig(config);
    this._comparison.updateConfig(config);
    this._coordinator.updateConfig(config);
  }

  get catalog(): RecoverySnapshotCatalog { return this._catalog; }
  get eligibility(): RecoveryEligibilityEngine { return this._eligibility; }
  get planner(): RecoveryPlanner { return this._planner; }
  get validator(): RecoveryValidator { return this._validator; }
  get comparison(): RecoveryComparisonEngine { return this._comparison; }
  get coordinator(): RecoveryCoordinator { return this._coordinator; }

  registerSnapshot(snapshot: SystemSnapshot, optimizationSource: string, profileUsed: string): SnapshotCatalogEntry {
    return this._catalog.register(snapshot, optimizationSource, profileUsed);
  }

  checkEligibility(snapshot: SnapshotCatalogEntry): RecoveryEligibilityResult {
    return this._eligibility.evaluate(snapshot);
  }

  createRecoveryPlan(input: RecoveryPlanningInput): RecoveryPlan {
    const plan = this._planner.plan(input);
    const record = this._planner.createRecoveryRecord(input, plan);
    plan.recoveryId = record.id;
    return plan;
  }

  validateRecovery(snapshot: SnapshotCatalogEntry, plan: RecoveryPlan): RecoveryValidationResult {
    return this._validator.validate(snapshot, plan);
  }

  compareSnapshots(snapshotA: SnapshotCatalogEntry, snapshotB: SnapshotCatalogEntry): RecoveryComparison {
    return this._comparison.compare(snapshotA, snapshotB);
  }

  async executeRecovery(
    recovery: RecoveryRecord,
    plan: RecoveryPlan,
    snapshot: SystemSnapshot | null,
  ): Promise<RecoveryExecutionResult> {
    const catalogEntry = this._catalog.getBySnapshotId(recovery.snapshotId);
    return this._coordinator.execute(recovery, plan, snapshot, catalogEntry);
  }

  registerProviderPlugin(plugin: RecoveryProviderPlugin): boolean {
    return this._planner.registerPlugin(plugin);
  }

  registerComparisonPlugin(plugin: RecoveryComparisonPlugin): boolean {
    return this._comparison.registerPlugin(plugin);
  }

  registerExportPlugin(_plugin: ExportPlugin): boolean {
    return false;
  }

  setSnapshotManager(manager: ExecutionSnapshotManager): void {
    this._coordinator.setSnapshotManager(manager);
  }

  clear(): void {
    this._catalog.clear();
    this._coordinator.clear();
  }
}
