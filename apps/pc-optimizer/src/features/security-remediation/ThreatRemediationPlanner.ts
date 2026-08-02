/**
 * ThreatRemediationPlanner — creates remediation plans from investigations.
 *
 * Pipeline:
 *   1. Receive ThreatInvestigation
 *   2. For each recommended action, create a RemediationAction
 *   3. Validate each action with ThreatSafetyValidator
 *   4. Determine which actions need approval
 *   5. Determine which actions can auto-execute
 *   6. Return a RemediationPlan
 */
import type {
  ThreatInvestigation,
  Threat,
  RemediationPlan,
  RemediationAction,
  RemediationActionType,
  RemediationTarget,
  RemediationTier,
} from './types';
import { actionToRiskLevel, isActionReversible, tierAllowsAction } from './types';
import type { ThreatSafetyValidator } from './ThreatSafetyValidator';
import type { ThreatRemediationPolicyManager } from './ThreatRemediationPolicy';

const CATEGORY_ACTIONS: Record<string, RemediationActionType[]> = {
  spyware: ['quarantine', 'remove_persistence'],
  adware: ['quarantine', 'reset_browser_setting'],
  pup: ['quarantine', 'review'],
  browser_hijacker: ['disable_browser_extension', 'reset_browser_setting', 'quarantine'],
  crypto_miner: ['quarantine', 'remove_persistence'],
  malware: ['quarantine', 'remove_persistence'],
  trojans: ['quarantine'],
  ransomware: ['quarantine', 'export_investigation'],
  keylogger: ['quarantine', 'remove_persistence'],
  rootkit: ['export_investigation', 'review'],
  bootkit: ['export_investigation', 'review'],
  backdoor: ['quarantine', 'remove_persistence'],
  dropper: ['quarantine'],
  downloader: ['quarantine'],
  unsafe_script: ['quarantine', 'review'],
  suspicious_scheduled_task: ['disable_scheduled_task', 'remove_persistence'],
  suspicious_service: ['review', 'quarantine'],
  suspicious_startup_entry: ['disable_startup_entry', 'remove_persistence'],
  pua: ['quarantine', 'review'],
  unknown: ['review', 'export_investigation'],
};

export class ThreatRemediationPlanner {
  constructor(
    private safetyValidator: ThreatSafetyValidator,
    private policyManager: ThreatRemediationPolicyManager,
  ) {}

  createPlan(
    investigation: ThreatInvestigation,
    threats: Threat[],
    tier: RemediationTier = 'free',
  ): RemediationPlan {
    const planId = `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const actions: RemediationAction[] = [];

    for (const threat of threats) {
      const actionTypes = CATEGORY_ACTIONS[threat.category] ?? ['review'];

      for (const actionType of actionTypes) {
        if (!tierAllowsAction(actionType, tier)) continue;

        const target = this.extractTarget(threat);
        const riskLevel = actionToRiskLevel(actionType, threat.severity);
        const reversible = isActionReversible(actionType);

        const action: RemediationAction = {
          id: `act-${planId}-${actions.length}`,
          planId,
          investigationId: investigation.id,
          threatId: threat.id,
          type: actionType,
          status: 'pending',
          riskLevel,
          requiresApproval: false, // Will be set by safety validation
          requiresUserConfirmation: false,
          target,
          reason: threat.recommendation,
          explanation: this.buildActionExplanation(actionType, threat),
          reversible,
          rollbackId: null,
          tier,
          createdAt: Date.now(),
          executedAt: null,
          completedAt: null,
          error: null,
          metadata: {
            detectionSource: threat.detectionSource,
            detectionTime: threat.detectionTime,
            confidence: threat.confidence,
            severity: threat.severity,
            category: threat.category,
            evidenceCount: threat.evidence.length,
            investigationTitle: investigation.summary.title,
          },
        };

        // Validate safety
        const assessment = this.safetyValidator.validate(action, threat);
        action.requiresApproval = assessment.requiresApproval || this.policyManager.requiresApproval(action);
        action.requiresUserConfirmation = assessment.requiresUserConfirmation;
        action.riskLevel = assessment.riskLevel;

        actions.push(action);
      }
    }

    const autoExecutable = actions.filter((a) => this.policyManager.shouldAutoExecute(a) && !a.requiresApproval).length;
    const manual = actions.filter((a) => a.requiresApproval).length;
    const rollbackAvailable = actions.some((a) => a.reversible);

    return {
      id: planId,
      investigationId: investigation.id,
      actions,
      totalActions: actions.length,
      requiresApproval: manual > 0,
      autoExecutableActions: autoExecutable,
      manualActions: manual,
      estimatedTime: this.estimateTime(actions),
      rollbackAvailable,
      createdAt: Date.now(),
      status: manual > 0 ? 'pending_approval' : 'draft',
      summary: this.buildPlanSummary(investigation, actions),
    };
  }

  private extractTarget(threat: Threat): RemediationTarget {
    const asset = threat.affectedAssets[0];
    if (asset) {
      return {
        type: this.mapAssetType(asset.type),
        path: asset.path,
        name: asset.name,
        pid: asset.pid,
      };
    }
    return {
      type: 'file',
      path: 'unknown',
      name: threat.name,
    };
  }

  private mapAssetType(assetType: string): RemediationTarget['type'] {
    const mapping: Record<string, RemediationTarget['type']> = {
      file: 'file',
      process: 'process',
      registry: 'registry',
      service: 'service',
      scheduled_task: 'scheduled_task',
      startup_entry: 'startup_entry',
      browser_extension: 'browser_extension',
      network: 'network',
    };
    return mapping[assetType] ?? 'file';
  }

  private buildActionExplanation(actionType: RemediationActionType, threat: Threat): string {
    const explanations: Record<RemediationActionType, string> = {
      review: `Review the detected threat "${threat.name}" before taking action. This is the safest option.`,
      ignore: `Ignore the detected threat "${threat.name}". The threat will remain on the system. Use only if you are certain this is a false positive.`,
      mark_false_positive: `Mark "${threat.name}" as a false positive. Future detections of this item will be suppressed.`,
      quarantine: `Move the file associated with "${threat.name}" to encrypted quarantine. The file will be safely stored and can be restored if needed.`,
      restore: `Restore a previously quarantined item to its original location.`,
      delete: `Permanently delete the quarantined item associated with "${threat.name}". This action is irreversible.`,
      disable_startup_entry: `Disable the startup entry associated with "${threat.name}" so it no longer runs at system startup. Can be re-enabled if needed.`,
      disable_scheduled_task: `Disable the scheduled task associated with "${threat.name}" so it no longer runs automatically. Can be re-enabled if needed.`,
      disable_browser_extension: `Disable the browser extension associated with "${threat.name}". Can be re-enabled if needed.`,
      reset_browser_setting: `Reset the browser setting modified by "${threat.name}" to its default value. Can be manually changed back if needed.`,
      remove_persistence: `Remove the persistence mechanism used by "${threat.name}" to survive reboots. The threat will no longer start automatically.`,
      export_investigation: `Export the investigation report for "${threat.name}" for external analysis or record-keeping.`,
    };
    return explanations[actionType] ?? `Perform action: ${actionType}`;
  }

  private estimateTime(actions: RemediationAction[]): number {
    let total = 0;
    for (const action of actions) {
      switch (action.type) {
        case 'review': total += 5000; break;
        case 'ignore': total += 1000; break;
        case 'mark_false_positive': total += 2000; break;
        case 'quarantine': total += 10000; break;
        case 'restore': total += 10000; break;
        case 'delete': total += 5000; break;
        case 'disable_startup_entry': total += 3000; break;
        case 'disable_scheduled_task': total += 3000; break;
        case 'disable_browser_extension': total += 3000; break;
        case 'reset_browser_setting': total += 3000; break;
        case 'remove_persistence': total += 5000; break;
        case 'export_investigation': total += 2000; break;
        default: total += 5000;
      }
    }
    return total;
  }

  private buildPlanSummary(investigation: ThreatInvestigation, actions: RemediationAction[]): string {
    const quarantineCount = actions.filter((a) => a.type === 'quarantine').length;
    const disableCount = actions.filter((a) => a.type.startsWith('disable')).length;
    const reviewCount = actions.filter((a) => a.type === 'review').length;
    const otherCount = actions.length - quarantineCount - disableCount - reviewCount;

    const parts: string[] = [];
    if (quarantineCount > 0) parts.push(`${quarantineCount} quarantine`);
    if (disableCount > 0) parts.push(`${disableCount} disable`);
    if (reviewCount > 0) parts.push(`${reviewCount} review`);
    if (otherCount > 0) parts.push(`${otherCount} other`);

    return `Remediation plan for "${investigation.summary.title}": ${actions.length} action(s) — ${parts.join(', ')}. ${actions.filter((a) => a.requiresApproval).length} require approval.`;
  }
}
