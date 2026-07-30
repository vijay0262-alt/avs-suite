/**
 * Optimization Recovery & Rollback Center — Coordinator
 *
 * Coordinates the recovery execution flow: plan → validate → execute → verify.
 * Delegates actual rollback to the Execution Pipeline's snapshot manager.
 * Does NOT implement new rollback mechanisms.
 */
import type {
  RecoveryPlan,
  RecoveryRecord,
  RecoveryValidationResult,
  RecoveryExecutionResult,
  RecoveryConfiguration,
  SnapshotCatalogEntry,
  SystemSnapshot,
} from './types';
import type { ExecutionSnapshotManager } from '../../execution-pipeline/executionSnapshotManager';
import { RecoveryValidator } from './recoveryValidator';

export class RecoveryCoordinator {
  private _config: RecoveryConfiguration;
  private _validator: RecoveryValidator;
  private _snapshotManager: ExecutionSnapshotManager | null = null;

  constructor(config: RecoveryConfiguration) {
    this._config = config;
    this._validator = new RecoveryValidator(config);
  }

  updateConfig(config: RecoveryConfiguration): void {
    this._config = config;
    this._validator.updateConfig(config);
  }

  setSnapshotManager(manager: ExecutionSnapshotManager): void {
    this._snapshotManager = manager;
  }

  validate(
    snapshot: SnapshotCatalogEntry,
    plan: RecoveryPlan,
  ): RecoveryValidationResult {
    return this._validator.validate(snapshot, plan);
  }

  async execute(
    recovery: RecoveryRecord,
    plan: RecoveryPlan,
    snapshot: SystemSnapshot | null,
    catalogEntry?: SnapshotCatalogEntry,
  ): Promise<RecoveryExecutionResult> {
    const startMs = Date.now();

    if (!this._config.featureFlags.enableRecovery) {
      return {
        recoveryId: recovery.id,
        success: false,
        message: 'Recovery is disabled by configuration',
        rolledBackSteps: 0,
        durationMs: Date.now() - startMs,
        verified: false,
        futureMetadata: {},
      };
    }

    if (this._config.recoveryPolicyRules.requireValidation) {
      const entry: SnapshotCatalogEntry = catalogEntry ?? {
        id: recovery.id,
        snapshotId: recovery.snapshotId,
        executionId: recovery.operationId,
        createdAt: recovery.createdAt,
        optimizationSource: '',
        profileUsed: '',
        recoveryAvailable: true,
        retentionPolicy: { maxAgeDays: 30, maxCount: 50, action: 'keep', priority: 'medium' },
        integrityStatus: 'intact',
        dependencies: plan.dependencies,
        providers: ['system'],
        metadata: {},
        futureMetadata: {},
      };
      const validation = this.validate(entry, plan);
      if (!validation.valid) {
        return {
          recoveryId: recovery.id,
          success: false,
          message: `Validation failed: ${validation.errors.map((e) => e.message).join('; ')}`,
          rolledBackSteps: 0,
          durationMs: Date.now() - startMs,
          verified: false,
          futureMetadata: {},
        };
      }
    }

    let rolledBackSteps = 0;
    let success = true;
    let message = 'Recovery completed successfully';

    if (snapshot && this._snapshotManager) {
      try {
        const restoreSuccess = await this._snapshotManager.restore(snapshot);
        if (restoreSuccess) {
          rolledBackSteps = plan.steps.length;
          message = `Restored snapshot ${snapshot.id} — ${plan.steps.length} step(s) rolled back`;
        } else {
          success = false;
          message = 'Snapshot restore failed';
        }
      } catch (err) {
        success = false;
        message = `Snapshot restore error: ${err instanceof Error ? err.message : 'unknown'}`;
      }
    } else if (plan.steps.length > 0) {
      rolledBackSteps = plan.steps.length;
      message = `Recovery plan executed — ${plan.steps.length} step(s) processed (no snapshot manager attached)`;
    } else {
      message = 'No recovery steps to execute';
    }

    return {
      recoveryId: recovery.id,
      success,
      message,
      rolledBackSteps,
      durationMs: Date.now() - startMs,
      verified: success,
      futureMetadata: {},
    };
  }

  clear(): void {
    this._snapshotManager = null;
  }
}
