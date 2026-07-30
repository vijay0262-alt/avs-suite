/**
 * Optimization Recovery & Rollback Center — Eligibility Engine
 *
 * Determines recoverability of snapshots based on integrity, age,
 * dependencies, and blocking issues.
 */
import type {
  SnapshotCatalogEntry,
  RecoveryEligibilityResult,
  RecoveryEligibilityState,
  RecoveryConfiguration,
} from './types';

export class RecoveryEligibilityEngine {
  private _config: RecoveryConfiguration;

  constructor(config: RecoveryConfiguration) {
    this._config = config;
  }

  updateConfig(config: RecoveryConfiguration): void {
    this._config = config;
  }

  evaluate(snapshot: SnapshotCatalogEntry): RecoveryEligibilityResult {
    const reasons: string[] = [];
    const recommendations: string[] = [];
    const blockingIssues: string[] = [];

    if (snapshot.integrityStatus === 'corrupted') {
      blockingIssues.push('Snapshot integrity is corrupted');
      reasons.push('Snapshot data is corrupted and cannot be trusted');
      recommendations.push('Capture a new snapshot before attempting recovery');
      return this._buildResult('corrupted', false, reasons, recommendations, blockingIssues, 0);
    }

    if (snapshot.integrityStatus === 'missing') {
      blockingIssues.push('Snapshot is missing');
      reasons.push('Snapshot data cannot be located');
      recommendations.push('Verify backup storage or capture a new snapshot');
      return this._buildResult('unavailable', false, reasons, recommendations, blockingIssues, 0);
    }

    if (!snapshot.recoveryAvailable) {
      blockingIssues.push('Recovery not available for this snapshot');
      reasons.push('Snapshot was marked as non-recoverable');
      recommendations.push('Check retention policy settings');
      return this._buildResult('unavailable', false, reasons, recommendations, blockingIssues, 0);
    }

    const ageMs = Date.now() - new Date(snapshot.createdAt).getTime();
    const maxAgeMs = this._config.retentionRules.maxSnapshotAgeDays * 86400000;
    if (ageMs > maxAgeMs) {
      blockingIssues.push(`Snapshot expired (age: ${Math.round(ageMs / 86400000)}d, max: ${this._config.retentionRules.maxSnapshotAgeDays}d)`);
      reasons.push('Snapshot has exceeded the retention period');
      recommendations.push('Capture a fresh snapshot for recovery');
      return this._buildResult('expired', false, reasons, recommendations, blockingIssues, 0);
    }

    if (snapshot.integrityStatus === 'degraded') {
      reasons.push('Snapshot integrity is degraded — partial recovery may be possible');
      recommendations.push('Validate snapshot before full recovery');
      if (this._config.recoveryPolicyRules.allowPartialRecovery) {
        return this._buildResult('partially_recoverable', true, reasons, recommendations, blockingIssues, snapshot.metadata['estimatedRecoveryTime'] as number ?? 30000);
      }
      blockingIssues.push('Partial recovery is disabled by policy');
      return this._buildResult('blocked', false, reasons, recommendations, blockingIssues, 0);
    }

    if (snapshot.dependencies.length === 0) {
      reasons.push('Snapshot has no dependencies and is fully recoverable');
    } else {
      reasons.push(`Snapshot has ${snapshot.dependencies.length} dependency/dependencies`);
    }

    if (this._config.recoveryPolicyRules.blockOnDependencyFailure && snapshot.dependencies.length > 0) {
      const unresolved = snapshot.dependencies.filter((d) => !d.startsWith('resolved:'));
      if (unresolved.length > 0) {
        blockingIssues.push(`${unresolved.length} unresolved dependency/dependencies`);
        reasons.push('Unresolved dependencies block full recovery');
        recommendations.push('Resolve dependencies before attempting recovery');
        return this._buildResult('blocked', false, reasons, recommendations, blockingIssues, 0);
      }
    }

    reasons.push('Snapshot is intact and within retention period');
    recommendations.push('Proceed with recovery validation');
    return this._buildResult('recoverable', true, reasons, recommendations, blockingIssues, snapshot.metadata['estimatedRecoveryTime'] as number ?? 30000);
  }

  evaluateBatch(snapshots: SnapshotCatalogEntry[]): Map<string, RecoveryEligibilityResult> {
    const results = new Map<string, RecoveryEligibilityResult>();
    for (const s of snapshots) {
      results.set(s.id, this.evaluate(s));
    }
    return results;
  }

  getRecoverableCount(snapshots: SnapshotCatalogEntry[]): number {
    return snapshots.filter((s) => this.evaluate(s).recoverable).length;
  }

  private _buildResult(
    state: RecoveryEligibilityState,
    recoverable: boolean,
    reasons: string[],
    recommendations: string[],
    blockingIssues: string[],
    estimatedRecoveryTime: number,
  ): RecoveryEligibilityResult {
    return {
      state,
      recoverable,
      reasons,
      recommendations,
      estimatedRecoveryTime,
      blockingIssues,
      futureMetadata: {},
    };
  }
}
