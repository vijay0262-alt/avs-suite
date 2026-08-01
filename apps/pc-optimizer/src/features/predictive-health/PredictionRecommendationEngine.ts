/**
 * PredictionRecommendationEngine — generates actionable recommendations
 * for each prediction.
 *
 * Every recommendation includes:
 *   - Recommended action
 *   - Urgency
 *   - Estimated benefit
 *   - Can AVS automate?
 *   - Requires user action?
 *   - Estimated completion time
 *   - Preventive actions
 */
import type {
  Prediction,
  PredictionRecommendation,
  PredictionRisk,
  ForecastDomain,
} from './types';

export class PredictionRecommendationEngine {
  generate(prediction: Prediction): PredictionRecommendation {
    const domain = prediction.domain;
    const risk = prediction.risk;
    const urgency = prediction.urgency;

    const action = this.getAction(domain, risk, prediction);
    const estimatedBenefit = this.getEstimatedBenefit(domain, prediction);
    const canAutomate = this.canAutomate(domain);
    const requiresUserAction = this.requiresUserAction(domain, risk);
    const estimatedCompletionTimeMinutes = this.getEstimatedTime(domain);
    const preventiveActions = this.getPreventiveActions(domain, risk);

    return {
      predictionId: prediction.id,
      action,
      urgency,
      estimatedBenefit,
      canAutomate,
      requiresUserAction,
      estimatedCompletionTimeMinutes,
      preventiveActions,
    };
  }

  generateForAll(predictions: Prediction[]): Map<string, PredictionRecommendation> {
    const recommendations = new Map<string, PredictionRecommendation>();
    for (const p of predictions) {
      recommendations.set(p.id, this.generate(p));
    }
    return recommendations;
  }

  private getAction(domain: ForecastDomain, risk: PredictionRisk, prediction: Prediction): string {
    if (prediction.behavior === 'improving') {
      return 'No action needed — trend is improving. Continue regular monitoring.';
    }

    if (risk === 'none' || risk === 'low') {
      return 'Monitor the trend. No immediate action required.';
    }

    switch (domain) {
      case 'storage':
        if (risk === 'severe') return 'Free up disk space immediately. Run storage cleanup, remove large unnecessary files, and empty Recycle Bin.';
        if (risk === 'high') return 'Free up disk space soon. Consider running storage cleanup and removing unnecessary files.';
        return 'Monitor storage usage. Consider cleaning up unnecessary files when convenient.';
      case 'battery':
        if (risk === 'severe' || risk === 'high') return 'Plan for battery replacement. Reduce charge cycles and avoid deep discharges to extend remaining lifespan.';
        return 'Monitor battery health. Avoid extreme temperatures and deep discharges.';
      case 'thermal':
        if (risk === 'severe' || risk === 'high') return 'Address thermal issues: clean dust from fans, ensure proper ventilation, and check cooling system.';
        return 'Monitor temperatures. Ensure adequate ventilation around the device.';
      case 'memory_pressure':
        if (risk === 'severe' || risk === 'high') return 'Reduce memory usage: close unnecessary applications, disable startup programs, and consider adding more RAM.';
        return 'Monitor memory usage. Close memory-heavy applications when not in use.';
      case 'system_health':
        if (risk === 'severe' || risk === 'high') return 'Run comprehensive system optimization. Address identified issues across all subsystems.';
        return 'Monitor system health. Run regular maintenance and optimization.';
      case 'startup_performance':
        if (risk === 'severe' || risk === 'high') return 'Disable unnecessary startup programs. Review and remove startup entries that delay boot.';
        return 'Review startup programs. Consider disabling non-essential startup entries.';
      case 'reliability':
        if (risk === 'severe' || risk === 'high') return 'Back up important data immediately. Address identified hardware risks and consider professional diagnostics.';
        return 'Ensure regular backups. Monitor identified risk areas.';
      default:
        return 'Monitor the trend and take action if it worsens.';
    }
  }

  private getEstimatedBenefit(domain: ForecastDomain, prediction: Prediction): string {
    switch (domain) {
      case 'storage':
        return `Prevent storage from reaching critical levels. Projected free space: ${prediction.projectedValue.toFixed(0)} MB.`;
      case 'battery':
        return `Extend battery lifespan. Current health: ${(100 - prediction.currentValue).toFixed(0)}%.`;
      case 'thermal':
        return `Prevent thermal throttling and potential hardware damage. Projected temperature: ${prediction.projectedValue.toFixed(1)}°C.`;
      case 'memory_pressure':
        return `Prevent memory exhaustion and application crashes. Projected usage: ${prediction.projectedValue.toFixed(0)} MB.`;
      case 'system_health':
        return `Improve overall system health score. Projected: ${prediction.projectedValue.toFixed(0)}/100.`;
      case 'startup_performance':
        return `Reduce startup time. Projected: ${prediction.projectedValue.toFixed(1)}s.`;
      case 'reliability':
        return `Prevent system failures and data loss. Improve reliability score.`;
      default:
        return 'Maintain system performance and prevent degradation.';
    }
  }

  private canAutomate(domain: ForecastDomain): boolean {
    switch (domain) {
      case 'storage': return true;
      case 'startup_performance': return true;
      case 'memory_pressure': return true;
      case 'system_health': return true;
      case 'battery': return false;
      case 'thermal': return false;
      case 'reliability': return false;
      default: return false;
    }
  }

  private requiresUserAction(domain: ForecastDomain, risk: PredictionRisk): boolean {
    if (risk === 'severe' || risk === 'high') return true;
    switch (domain) {
      case 'battery': return true;
      case 'thermal': return true;
      case 'reliability': return true;
      default: return false;
    }
  }

  private getEstimatedTime(domain: ForecastDomain): number {
    switch (domain) {
      case 'storage': return 10;
      case 'startup_performance': return 5;
      case 'memory_pressure': return 5;
      case 'system_health': return 15;
      case 'battery': return 60;
      case 'thermal': return 30;
      case 'reliability': return 30;
      default: return 10;
    }
  }

  private getPreventiveActions(domain: ForecastDomain, risk: PredictionRisk): string[] {
    const actions: string[] = [];

    switch (domain) {
      case 'storage':
        actions.push('Regularly clean temporary files and cache');
        actions.push('Remove unused applications');
        actions.push('Move large files to external storage');
        if (risk === 'severe' || risk === 'high') actions.push('Run disk cleanup utility');
        break;
      case 'battery':
        actions.push('Avoid deep discharges below 20%');
        actions.push('Keep battery between 20-80% charge when possible');
        actions.push('Avoid exposure to high temperatures');
        if (risk === 'severe' || risk === 'high') actions.push('Schedule battery replacement');
        break;
      case 'thermal':
        actions.push('Clean dust from vents and fans regularly');
        actions.push('Ensure adequate ventilation');
        actions.push('Avoid using on soft surfaces that block airflow');
        if (risk === 'severe' || risk === 'high') actions.push('Consider reapplying thermal paste');
        break;
      case 'memory_pressure':
        actions.push('Close unused applications');
        actions.push('Disable unnecessary startup programs');
        actions.push('Browser tabs consume memory — close unused tabs');
        if (risk === 'severe' || risk === 'high') actions.push('Consider upgrading RAM');
        break;
      case 'system_health':
        actions.push('Run regular system maintenance');
        actions.push('Keep software and drivers updated');
        actions.push('Perform periodic system optimization');
        break;
      case 'startup_performance':
        actions.push('Review and disable unnecessary startup programs');
        actions.push('Delay non-essential startup entries');
        break;
      case 'reliability':
        actions.push('Maintain regular backups');
        actions.push('Monitor SMART status of storage drives');
        actions.push('Keep system updated');
        if (risk === 'severe' || risk === 'high') actions.push('Consider professional hardware diagnostics');
        break;
      default:
        actions.push('Monitor system health regularly');
        break;
    }

    return actions;
  }
}
