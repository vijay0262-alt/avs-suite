/**
 * ThreatRemediationReport — generates comprehensive remediation reports.
 *
 * Generates:
 *   - Actions taken
 *   - Files affected
 *   - Registry changes
 *   - Browser changes
 *   - Threats resolved
 *   - Threats remaining
 *   - Rollback availability
 *   - Time required
 */
import type {
  RemediationReport,
  RemediationPlan,
  RemediationAction,
  ActionTakenSummary,
  AffectedFileSummary,
  RegistryChangeSummary,
  BrowserChangeSummary,
  RemediationTier,
} from './types';
import type { ThreatRollbackManager } from './ThreatRollbackManager';

export class ThreatRemediationReportGenerator {
  constructor(private rollbackManager: ThreatRollbackManager) {}

  generate(plan: RemediationPlan, tier: RemediationTier = 'free'): RemediationReport {
    const actionsTaken = this.summarizeActions(plan.actions);
    const filesAffected = this.summarizeFiles(plan.actions);
    const registryChanges = this.summarizeRegistry(plan.actions);
    const browserChanges = this.summarizeBrowser(plan.actions);

    const threatsResolved = plan.actions.filter((a) => a.status === 'completed' && a.type !== 'review' && a.type !== 'ignore' && a.type !== 'export_investigation').length;
    const threatsRemaining = plan.actions.filter((a) => a.status === 'pending' || a.status === 'failed').length;

    const rollbackIds = plan.actions
      .filter((a) => a.rollbackId !== null)
      .map((a) => a.rollbackId!);

    const timeRequired = plan.actions.reduce((sum, a) => {
      if (a.executedAt && a.completedAt) return sum + (a.completedAt - a.executedAt);
      return sum;
    }, 0);

    const summary = this.buildSummary(plan, threatsResolved, threatsRemaining, rollbackIds.length);
    const details = this.buildDetails(plan, actionsTaken, filesAffected, registryChanges, browserChanges);

    return {
      id: `report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      planId: plan.id,
      investigationId: plan.investigationId,
      generatedAt: Date.now(),
      actionsTaken,
      filesAffected,
      registryChanges,
      browserChanges,
      threatsResolved,
      threatsRemaining,
      rollbackAvailable: rollbackIds.length > 0,
      rollbackIds,
      timeRequired,
      summary,
      details,
      tier,
    };
  }

  private summarizeActions(actions: RemediationAction[]): ActionTakenSummary[] {
    const byType = new Map<RemediationAction['type'], ActionTakenSummary>();

    for (const action of actions) {
      if (!byType.has(action.type)) {
        byType.set(action.type, {
          actionType: action.type,
          count: 0,
          successful: 0,
          failed: 0,
          rolledBack: 0,
        });
      }
      const summary = byType.get(action.type)!;
      summary.count++;
      if (action.status === 'completed') summary.successful++;
      if (action.status === 'failed') summary.failed++;
      if (action.status === 'rolled_back') summary.rolledBack++;
    }

    return [...byType.values()];
  }

  private summarizeFiles(actions: RemediationAction[]): AffectedFileSummary[] {
    return actions
      .filter((a) => a.target.type === 'file')
      .map((a) => ({
        path: a.target.path,
        name: a.target.name,
        action: a.type,
        status: a.status,
        quarantined: a.type === 'quarantine' && a.status === 'completed',
        rollbackAvailable: a.rollbackId !== null,
      }));
  }

  private summarizeRegistry(actions: RemediationAction[]): RegistryChangeSummary[] {
    return actions
      .filter((a) => a.target.type === 'registry' || a.type === 'remove_persistence')
      .map((a) => ({
        key: a.target.path,
        valueName: a.target.name,
        action: a.type,
        status: a.status,
        rollbackAvailable: a.rollbackId !== null,
      }));
  }

  private summarizeBrowser(actions: RemediationAction[]): BrowserChangeSummary[] {
    return actions
      .filter((a) => a.target.type === 'browser_extension' || a.target.type === 'browser_setting' || a.type === 'reset_browser_setting' || a.type === 'disable_browser_extension')
      .map((a) => ({
        setting: a.target.name,
        action: a.type,
        status: a.status,
        rollbackAvailable: a.rollbackId !== null,
      }));
  }

  private buildSummary(plan: RemediationPlan, resolved: number, remaining: number, rollbackCount: number): string {
    return `REMEDIATION REPORT — Plan: ${plan.id}

Investigation: ${plan.investigationId}
Status: ${plan.status}
Actions: ${plan.totalActions} total (${plan.autoExecutableActions} auto, ${plan.manualActions} manual)
Threats Resolved: ${resolved}
Threats Remaining: ${remaining}
Rollback Available: ${rollbackCount > 0 ? `Yes (${rollbackCount} action(s))` : 'No'}

${plan.summary}`;
  }

  private buildDetails(
    plan: RemediationPlan,
    actionsTaken: ActionTakenSummary[],
    files: AffectedFileSummary[],
    registry: RegistryChangeSummary[],
    browser: BrowserChangeSummary[],
  ): string {
    const actionDetails = actionsTaken.map((a) => `  ${a.actionType}: ${a.successful}/${a.count} successful, ${a.failed} failed, ${a.rolledBack} rolled back`).join('\n');
    const fileDetails = files.length > 0 ? files.map((f) => `  ${f.name} (${f.path}): ${f.action} — ${f.status}${f.quarantined ? ' [quarantined]' : ''}${f.rollbackAvailable ? ' [rollback available]' : ''}`).join('\n') : '  None';
    const registryDetails = registry.length > 0 ? registry.map((r) => `  ${r.key}\\${r.valueName}: ${r.action} — ${r.status}${r.rollbackAvailable ? ' [rollback available]' : ''}`).join('\n') : '  None';
    const browserDetails = browser.length > 0 ? browser.map((b) => `  ${b.setting}: ${b.action} — ${b.status}${b.rollbackAvailable ? ' [rollback available]' : ''}`).join('\n') : '  None';

    return `DETAILED REPORT

Actions Taken:
${actionDetails}

Files Affected:
${fileDetails}

Registry Changes:
${registryDetails}

Browser Changes:
${browserDetails}

Estimated Time: ${plan.estimatedTime}ms
Rollback Available: ${plan.rollbackAvailable ? 'Yes' : 'No'}`;
  }
}
