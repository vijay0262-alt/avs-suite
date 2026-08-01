/**
 * OptimizationRiskAnalyzer — evaluates risk for each optimization action.
 *
 * Determines: risk level, risk score, reversibility, restart requirement,
 * estimated duration, user confirmation requirement, risk factors, mitigations.
 *
 * No aggressive registry cleaning. No unsafe tweaks. No irreversible operations.
 */
import type {
  SourceFinding,
  OptimizationRisk,
  RiskLevel,
  OptimizationCategory,
  OptimizationActionType,
  OptimizationConfiguration,
} from './types';
import { riskToScore } from './types';

const IRREVERSIBLE_ACTIONS: Set<OptimizationActionType> = new Set([
  'delete_large_files',
  'clear_browser_privacy',
  'clear_privacy_traces',
]);

const RESTART_REQUIRED: Set<OptimizationActionType> = new Set([
  'run_windows_update',
  'update_driver',
  'adjust_power_plan',
]);

const HIGH_RISK_CATEGORIES: Set<OptimizationCategory> = new Set([
  'registry',
  'system_services',
  'windows_update',
  'driver_update',
]);

const DURATION_ESTIMATES: Record<OptimizationActionType, number> = {
  clean_temp_files: 10,
  clean_browser_cache: 15,
  clear_browser_privacy: 10,
  empty_recycle_bin: 5,
  disable_startup_entry: 3,
  delay_startup_entry: 3,
  clean_registry: 30,
  remove_duplicates: 60,
  move_large_files: 30,
  delete_large_files: 15,
  run_windows_update: 300,
  optimize_disk: 120,
  close_background_process: 5,
  adjust_power_plan: 10,
  clear_privacy_traces: 15,
  update_driver: 180,
  custom: 60,
};

export class OptimizationRiskAnalyzer {
  constructor(private config: OptimizationConfiguration) {}

  analyze(finding: SourceFinding, actionType: OptimizationActionType): OptimizationRisk {
    const factors: string[] = [];
    const mitigations: string[] = [];
    let riskLevel: RiskLevel = 'low';

    const irreversible = IRREVERSIBLE_ACTIONS.has(actionType);
    const requiresRestart = RESTART_REQUIRED.has(actionType);
    const isHighRiskCategory = HIGH_RISK_CATEGORIES.has(finding.category);

    if (irreversible) {
      factors.push('This action is irreversible');
      riskLevel = 'moderate';
      mitigations.push('Review carefully before proceeding — no rollback available');
    }

    if (requiresRestart) {
      factors.push('Requires system restart');
      mitigations.push('Save all work before proceeding');
    }

    if (isHighRiskCategory) {
      factors.push(`${finding.category} modifications carry elevated risk`);
      if (riskLevel === 'low') riskLevel = 'moderate';
      mitigations.push('A system restore point will be created');
    }

    if (finding.severity === 'critical' || finding.severity === 'high') {
      if (riskLevel === 'low') riskLevel = 'moderate';
    }

    if (actionType === 'clean_registry') {
      factors.push('Registry modifications can affect system stability');
      mitigations.push('Only safe, validated registry keys will be cleaned');
      mitigations.push('Registry backup will be created before any changes');
      riskLevel = 'moderate';
    }

    if (actionType === 'remove_duplicates' || actionType === 'delete_large_files') {
      factors.push('File deletion is permanent if not backed up');
      mitigations.push('Files will be moved to Recycle Bin where possible');
    }

    if (actionType === 'disable_startup_entry') {
      factors.push('Disabling startup entries may delay application availability');
      mitigations.push('Startup entries can be re-enabled at any time');
    }

    if (factors.length === 0) {
      factors.push('Low risk — standard optimization with rollback');
    }

    if (mitigations.length === 0) {
      mitigations.push('Rollback is available');
    }

    const score = riskToScore(riskLevel);
    const estimatedDurationSeconds = DURATION_ESTIMATES[actionType] ?? 60;
    const userConfirmationRequired =
      score >= 40 || irreversible || !this.config.autoApproveLowRisk;

    const reversible = !irreversible;

    return {
      level: riskLevel,
      score,
      reversible,
      requiresRestart,
      estimatedDurationSeconds,
      userConfirmationRequired,
      factors,
      mitigations,
    };
  }

  isActionSafe(risk: OptimizationRisk): boolean {
    return risk.score <= this.config.thresholds.maxRiskScore;
  }

  isUnsafeAction(_actionType: OptimizationActionType): boolean {
    return false;
  }
}
