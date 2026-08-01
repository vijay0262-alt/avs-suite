/**
 * OptimizationRecommendationEngine — converts source findings into
 * optimization actions with full evidence chains.
 *
 * For each finding:
 *   - Determines the appropriate action type
 *   - Calculates benefits (via ImpactCalculator)
 *   - Assesses risk (via RiskAnalyzer)
 *   - Computes impact tier and confidence
 *   - Determines rollback availability
 *   - Builds evidence-based recommendation
 *
 * Every recommendation answers:
 *   - Why is this recommended?
 *   - Why now?
 *   - What evidence supports it?
 *   - What happens if skipped?
 *   - Expected measurable improvement?
 */
import type {
  SourceFinding,
  OptimizationAction,
  OptimizationActionType,
  OptimizationCategory,
  OptimizationConfiguration,
} from './types';
import { OptimizationImpactCalculator } from './OptimizationImpactCalculator';
import { OptimizationRiskAnalyzer } from './OptimizationRiskAnalyzer';

const CATEGORY_TO_ACTION: Record<OptimizationCategory, OptimizationActionType> = {
  temp_files: 'clean_temp_files',
  browser_cache: 'clean_browser_cache',
  browser_privacy: 'clear_browser_privacy',
  recycle_bin: 'empty_recycle_bin',
  startup: 'disable_startup_entry',
  registry: 'clean_registry',
  duplicate_files: 'remove_duplicates',
  large_files: 'move_large_files',
  windows_update: 'run_windows_update',
  system_services: 'close_background_process',
  disk_optimization: 'optimize_disk',
  memory_optimization: 'close_background_process',
  privacy: 'clear_privacy_traces',
  security: 'custom',
  driver_update: 'update_driver',
  power: 'adjust_power_plan',
  general: 'custom',
};

export class OptimizationRecommendationEngine {
  private impactCalculator: OptimizationImpactCalculator;
  private riskAnalyzer: OptimizationRiskAnalyzer;

  constructor(config: OptimizationConfiguration) {
    this.impactCalculator = new OptimizationImpactCalculator(config);
    this.riskAnalyzer = new OptimizationRiskAnalyzer(config);
  }

  generateRecommendations(findings: SourceFinding[]): OptimizationAction[] {
    const actions: OptimizationAction[] = [];

    for (const finding of findings) {
      const action = this.createAction(finding);
      if (action) actions.push(action);
    }

    return actions;
  }

  private createAction(finding: SourceFinding): OptimizationAction | null {
    const actionType = this.determineActionType(finding);
    if (!actionType) return null;

    const benefits = this.impactCalculator.calculateBenefits(finding);
    const impact = this.impactCalculator.calculateImpact(finding, benefits);
    const risk = this.riskAnalyzer.analyze(finding, actionType);
    const confidence = this.computeConfidence(finding);
    const rollbackAvailable = risk.reversible;

    return {
      id: `opt-${finding.module}-${finding.findingId}`,
      type: actionType,
      category: finding.category,
      sourceModule: finding.module,
      sourceFindingId: finding.findingId,
      title: this.buildTitle(finding, actionType),
      description: finding.description,
      impact,
      risk,
      benefits,
      evidence: finding.evidence,
      confidence,
      impactTier: impact.tier,
      rollbackAvailable,
      rollbackPlanId: null,
      dependencies: [],
      conflicts: [],
      requiresUserConfirmation: risk.userConfirmationRequired,
      canAutomate: this.canAutomate(risk.userConfirmationRequired, rollbackAvailable),
      status: 'pending',
    };
  }

  private determineActionType(finding: SourceFinding): OptimizationActionType | null {
    return CATEGORY_TO_ACTION[finding.category] ?? null;
  }

  private computeConfidence(finding: SourceFinding): number {
    if (finding.evidence.length === 0) return 0.3;
    const avgEvidenceConfidence = finding.evidence.reduce((s, e) => s + e.confidence, 0) / finding.evidence.length;
    const severityWeight = finding.severity === 'critical' ? 1.0 :
      finding.severity === 'high' ? 0.9 :
      finding.severity === 'medium' ? 0.7 :
      finding.severity === 'low' ? 0.5 : 0.3;
    return Math.min(1.0, avgEvidenceConfidence * 0.6 + severityWeight * 0.4);
  }

  private canAutomate(requiresConfirmation: boolean, _rollbackAvailable: boolean): boolean {
    return !requiresConfirmation;
  }

  private buildTitle(finding: SourceFinding, actionType: OptimizationActionType): string {
    const actionLabels: Partial<Record<OptimizationActionType, string>> = {
      clean_temp_files: 'Clean Temporary Files',
      clean_browser_cache: 'Clean Browser Cache',
      clear_browser_privacy: 'Clear Browser Privacy Data',
      empty_recycle_bin: 'Empty Recycle Bin',
      disable_startup_entry: 'Disable Startup Entry',
      delay_startup_entry: 'Delay Startup Entry',
      clean_registry: 'Clean Registry Keys',
      remove_duplicates: 'Remove Duplicate Files',
      move_large_files: 'Move Large Files',
      delete_large_files: 'Delete Large Files',
      run_windows_update: 'Run Windows Update',
      optimize_disk: 'Optimize Disk',
      close_background_process: 'Close Background Process',
      adjust_power_plan: 'Adjust Power Plan',
      clear_privacy_traces: 'Clear Privacy Traces',
      update_driver: 'Update Driver',
    };
    const label = actionLabels[actionType] ?? 'Optimize';
    return `${label}: ${finding.title}`;
  }
}
