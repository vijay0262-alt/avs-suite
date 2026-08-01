/**
 * OptimizationInsights — generates explainable AI insights for each
 * optimization action.
 *
 * Every insight answers:
 *   - Why is this recommended?
 *   - Why now?
 *   - What evidence supports it?
 *   - What happens if skipped?
 *   - Expected measurable improvement?
 */
import type {
  OptimizationAction,
  OptimizationInsight,
  OptimizationPlan,
} from './types';

export class OptimizationInsights {
  generateInsights(plan: OptimizationPlan): OptimizationInsight[] {
    return plan.actions.map((a) => this.createInsight(a));
  }

  createInsight(action: OptimizationAction): OptimizationInsight {
    return {
      id: `insight-${action.id}`,
      title: action.title,
      explanation: this.explainWhy(action),
      whyNow: this.explainWhyNow(action),
      evidence: action.evidence,
      expectedImprovement: this.explainExpectedImprovement(action),
      whatHappensIfSkipped: this.explainIfSkipped(action),
      confidence: action.confidence,
      impactTier: action.impactTier,
      category: action.category,
    };
  }

  private explainWhy(action: OptimizationAction): string {
    const parts: string[] = [];
    parts.push(action.description);
    parts.push(`This optimization targets ${action.category.replace(/_/g, ' ')}.`);
    parts.push(`Impact: ${action.impact.description}`);
    if (action.risk.factors.length > 0) {
      parts.push(`Risk factors: ${action.risk.factors.join('; ')}.`);
    }
    if (action.rollbackAvailable) {
      parts.push('This action is reversible — rollback is available if needed.');
    } else {
      parts.push('This action is irreversible.');
    }
    return parts.join(' ');
  }

  private explainWhyNow(action: OptimizationAction): string {
    const parts: string[] = [];
    if (action.impactTier === 'high') {
      parts.push('This optimization has high impact and should be prioritized.');
    } else if (action.impactTier === 'medium') {
      parts.push('This optimization provides moderate benefits and is recommended.');
    } else {
      parts.push('This optimization provides minor benefits.');
    }
    if (action.risk.requiresRestart) {
      parts.push('A system restart will be required — plan accordingly.');
    }
    if (action.confidence >= 0.8) {
      parts.push('High confidence based on strong evidence.');
    } else if (action.confidence >= 0.5) {
      parts.push('Moderate confidence — evidence supports this recommendation.');
    } else {
      parts.push('Lower confidence — consider reviewing the evidence before proceeding.');
    }
    return parts.join(' ');
  }

  private explainExpectedImprovement(action: OptimizationAction): string {
    const b = action.benefits;
    const parts: string[] = [];
    if (b.storageRecoveryMB > 0) parts.push(`${b.storageRecoveryMB.toFixed(0)} MB storage recovery`);
    if (b.ramRecoveryMB > 0) parts.push(`${b.ramRecoveryMB.toFixed(0)} MB RAM recovery`);
    if (b.startupImprovementMs > 0) parts.push(`${(b.startupImprovementMs / 1000).toFixed(1)}s faster startup`);
    if (b.privacyImprovement > 0) parts.push(`${b.privacyImprovement.toFixed(0)}% privacy improvement`);
    if (b.performanceImprovement > 0) parts.push(`${b.performanceImprovement.toFixed(0)}% performance gain`);
    if (b.batteryImprovement > 0) parts.push(`${b.batteryImprovement.toFixed(1)}h battery improvement`);
    if (b.thermalImprovement > 0) parts.push(`${b.thermalImprovement.toFixed(0)}% thermal improvement`);
    if (b.stabilityImpact > 0) parts.push(`${b.stabilityImpact.toFixed(0)}% stability improvement`);
    parts.push(`Health score gain: +${action.impact.estimatedHealthScoreGain}`);
    return parts.join(', ') + '.';
  }

  private explainIfSkipped(action: OptimizationAction): string {
    switch (action.category) {
      case 'temp_files':
      case 'recycle_bin':
        return 'Storage will continue to fill with temporary and deleted files, reducing available disk space.';
      case 'browser_cache':
        return 'Browser cache will continue to grow, potentially slowing browser performance.';
      case 'browser_privacy':
      case 'privacy':
        return 'Privacy traces will accumulate, potentially exposing browsing history and personal data.';
      case 'startup':
        return 'Startup will remain slow, delaying system readiness after boot.';
      case 'registry':
        return 'Registry clutter will persist, potentially causing minor performance degradation over time.';
      case 'duplicate_files':
        return 'Duplicate files will continue consuming storage space unnecessarily.';
      case 'large_files':
        return 'Large files will continue occupying valuable storage space.';
      case 'windows_update':
        return 'Important system updates will remain uninstalled, potentially affecting security and stability.';
      case 'driver_update':
        return 'Outdated drivers may cause compatibility issues or reduced performance.';
      case 'disk_optimization':
        return 'Disk fragmentation may worsen, potentially slowing file access times.';
      case 'memory_optimization':
        return 'Memory usage will remain elevated, potentially causing slowdowns.';
      case 'power':
        return 'Power efficiency will remain suboptimal, reducing battery life on portable devices.';
      default:
        return 'No immediate impact, but the optimization opportunity will persist.';
    }
  }
}
