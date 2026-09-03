/**
 * HardwareRecommendationEngine — generates evidence-based recommendations
 * from component analyses and their issues.
 *
 * Every recommendation includes reason, evidence, expected improvement,
 * risk, estimated time, restart requirement, and automation capability.
 * Recommendations are never about hardware modification — only maintenance,
 * monitoring, configuration, and software actions.
 */
import type {
  ComponentAnalysis,
  AIRecommendation,
  AIEvidence,
  HardwareAIConfiguration,
  RecommendationType,
  AIUrgency,
} from './types';
import type { HardwareCategory } from '../hardware-center/types';

export class HardwareRecommendationEngine {
  constructor(private config: HardwareAIConfiguration) {}

  generate(analyses: ComponentAnalysis[]): AIRecommendation[] {
    const recommendations: AIRecommendation[] = [];

    for (const analysis of analyses) {
      for (const issue of analysis.issues) {
        const rec = this.generateForIssue(analysis.category, issue.id, issue.title, issue.description, issue.severity, issue.evidence, issue.confidence);
        if (rec) recommendations.push(rec);
      }
    }

    // Sort by urgency (immediate first) and confidence (highest first)
    const urgencyOrder: Record<AIUrgency, number> = { immediate: 0, soon: 1, scheduled: 2, none: 3 };
    recommendations.sort((a, b) => {
      const u = urgencyOrder[a.priority] - urgencyOrder[b.priority];
      if (u !== 0) return u;
      return b.confidence - a.confidence;
    });

    return recommendations.slice(0, this.config.maxRecommendations);
  }

  private generateForIssue(
    category: HardwareCategory,
    issueId: string,
    title: string,
    description: string,
    severity: string,
    evidence: AIEvidence[],
    confidence: number,
  ): AIRecommendation | null {
    const recId = `rec-${issueId}`;
    const type = this.getRecommendationType(issueId);
    const actions = this.getActions(issueId, category);
    if (actions.length === 0) return null;

    return {
      id: recId,
      category,
      type,
      title: this.getRecommendationTitle(issueId, category),
      reason: description,
      evidence,
      expectedImprovement: this.getExpectedImprovement(issueId),
      risk: this.getRecommendationRisk(issueId),
      estimatedTimeMinutes: this.getEstimatedTime(issueId),
      requiresRestart: this.requiresRestart(issueId),
      canAutomate: this.canAutomate(issueId),
      priority: this.severityToUrgency(severity),
      confidence,
    };
  }

  private getRecommendationType(issueId: string): RecommendationType {
    if (issueId.includes('temp') || issueId.includes('throttling') || issueId.includes('cooling') || issueId.includes('fan')) return 'maintenance';
    if (issueId.includes('smart') || issueId.includes('lifetime') || issueId.includes('wear')) return 'replacement';
    if (issueId.includes('space')) return 'cleaning';
    if (issueId.includes('util') || issueId.includes('usage') || issueId.includes('load') || issueId.includes('pressure') || issueId.includes('vram')) return 'software';
    if (issueId.includes('missing') || issueId.includes('unavailable')) return 'monitoring';
    return 'maintenance';
  }

  private getActions(issueId: string, _category: HardwareCategory): string[] {
    if (issueId.includes('temp-critical') || issueId.includes('throttling')) {
      return [
        'Clean dust from CPU/GPU heatsinks and fans using compressed air',
        'Check that all case fans are operational and unobstructed',
        'Consider reapplying thermal paste on the CPU (every 2–3 years)',
        'Ensure the computer has adequate ventilation and is not in an enclosed space',
      ];
    }
    if (issueId.includes('temp-high')) {
      return [
        'Check for dust buildup in heatsink fins and clean if necessary',
        'Verify case airflow is not obstructed by cables or dust filters',
        'Monitor temperatures under load to confirm the issue persists',
      ];
    }
    if (issueId.includes('smart-critical') || issueId.includes('smart-degraded')) {
      return [
        'Back up all important data from this drive immediately',
        'Run a full disk diagnostic using the manufacturer\'s tool',
        'Consider replacing the drive if SMART attributes continue to degrade',
      ];
    }
    if (issueId.includes('lifetime-low')) {
      return [
        'Back up important data from this drive',
        'Monitor the drive\'s SMART attributes weekly',
        'Plan for drive replacement within the next 1–3 months',
      ];
    }
    if (issueId.includes('low-space')) {
      return [
        'Run AVS AI Shield\'s Junk Cleaner to remove temporary and unnecessary files',
        'Move large files (videos, archives) to another drive or cloud storage',
        'Uninstall applications that are no longer needed',
        'Empty the Recycle Bin and Downloads folder',
      ];
    }
    if (issueId.includes('wear-critical') || issueId.includes('wear-warning')) {
      return [
        'Check if the battery is still under warranty for replacement',
        'Keep the laptop plugged in when possible to reduce charge cycles',
        'Avoid exposing the device to high temperatures',
        'Consider a battery replacement if runtime is insufficient',
      ];
    }
    if (issueId.includes('low-charge')) {
      return ['Connect the power adapter to charge the battery'];
    }
    if (issueId.includes('pressure') || issueId.includes('high-usage')) {
      return [
        'Close unnecessary applications running in the background',
        'Check Task Manager for processes consuming excessive memory',
        'Consider adding more RAM if this is a recurring issue',
      ];
    }
    if (issueId.includes('util-high')) {
      return [
        'Check Task Manager for processes consuming high CPU',
        'Close unnecessary background applications',
        'Scan for malware if CPU usage remains high with no visible applications',
      ];
    }
    if (issueId.includes('util-background') || issueId.includes('background')) {
      return [
        'Review startup programs in AVS AI Shield\'s Startup Manager',
        'Disable unnecessary background services',
        'Check for scheduled tasks that may be running',
      ];
    }
    if (issueId.includes('vram')) {
      return [
        'Close unnecessary GPU-accelerated applications (browsers with hardware acceleration, video editors)',
        'Lower texture quality settings in games if experiencing stuttering',
      ];
    }
    if (issueId.includes('weak-signal')) {
      return [
        'Move closer to the Wi-Fi access point',
        'Remove physical obstructions between the device and router',
        'Switch to a 5 GHz network if available',
        'Consider using a Wi-Fi range extender',
      ];
    }
    if (issueId.includes('fan-stopped')) {
      return [
        'Check that the fan cable is properly connected to the motherboard header',
        'Replace the fan if it has failed',
        'Do not operate the system under load until the fan is repaired',
      ];
    }
    if (issueId.includes('missing') || issueId.includes('unavailable')) {
      return [
        'Install Libre Hardware Monitor for additional sensor coverage',
        'Check if the hardware manufacturer provides a dedicated monitoring tool',
        'Some sensors may not be available on all hardware configurations',
      ];
    }
    if (issueId.includes('high-download') || issueId.includes('high-usage')) {
      return [
        'Check for active downloads or system updates',
        'Review cloud sync settings (OneDrive, Google Drive, etc.)',
        'Close streaming services if not in use',
      ];
    }
    return [];
  }

  private getRecommendationTitle(issueId: string, category: HardwareCategory): string {
    const cat = category.toUpperCase();
    if (issueId.includes('temp-critical')) return `Address Critical ${cat} Temperature`;
    if (issueId.includes('temp-high')) return `Reduce ${cat} Temperature`;
    if (issueId.includes('throttling')) return `Resolve ${cat} Thermal Throttling`;
    if (issueId.includes('smart')) return `Back Up and Replace Degraded Drive`;
    if (issueId.includes('lifetime')) return `Plan Drive Replacement`;
    if (issueId.includes('low-space')) return `Free Up Disk Space`;
    if (issueId.includes('wear')) return `Address Battery Wear`;
    if (issueId.includes('low-charge')) return `Charge the Battery`;
    if (issueId.includes('pressure') || issueId.includes('high-usage')) return `Reduce Memory Usage`;
    if (issueId.includes('util-high')) return `Reduce CPU Usage`;
    if (issueId.includes('background')) return `Reduce Background CPU Load`;
    if (issueId.includes('vram')) return `Reduce GPU VRAM Usage`;
    if (issueId.includes('weak-signal')) return `Improve Wi-Fi Signal`;
    if (issueId.includes('fan-stopped')) return `Repair or Replace Stopped Fan`;
    if (issueId.includes('missing')) return `Install Additional Sensor Monitoring`;
    return `Address ${cat} Issue`;
  }

  private getExpectedImprovement(issueId: string): string {
    if (issueId.includes('temp')) return 'Temperature reduction of 5–15°C, restoring full performance and extending component lifespan.';
    if (issueId.includes('smart') || issueId.includes('lifetime')) return 'Prevents data loss and ensures system reliability with a new drive.';
    if (issueId.includes('low-space')) return 'Recovers 10–50 GB of disk space and improves SSD performance and longevity.';
    if (issueId.includes('wear')) return 'Restores battery runtime to near-original capacity.';
    if (issueId.includes('pressure') || issueId.includes('usage')) return 'Recovers 2–4 GB of RAM and improves system responsiveness.';
    if (issueId.includes('weak-signal')) return 'Improves network speed by 20–50% and reduces connection drops.';
    if (issueId.includes('fan')) return 'Prevents potential thermal damage and restores proper cooling.';
    return 'Improves overall system health and stability.';
  }

  private getRecommendationRisk(issueId: string): string {
    if (issueId.includes('smart') || issueId.includes('fan-stopped')) return 'High risk of data loss or hardware damage if not addressed.';
    if (issueId.includes('temp')) return 'Continued high temperatures may reduce component lifespan.';
    if (issueId.includes('wear')) return 'Battery may fail to hold charge, requiring replacement.';
    return 'Low risk. Action is preventive and non-destructive.';
  }

  private getEstimatedTime(issueId: string): number {
    if (issueId.includes('temp') || issueId.includes('throttling')) return 30;
    if (issueId.includes('smart')) return 60;
    if (issueId.includes('low-space')) return 15;
    if (issueId.includes('wear')) return 45;
    if (issueId.includes('pressure') || issueId.includes('usage')) return 10;
    if (issueId.includes('fan')) return 30;
    if (issueId.includes('weak-signal')) return 5;
    return 15;
  }

  private requiresRestart(issueId: string): boolean {
    return issueId.includes('fan') || issueId.includes('throttling');
  }

  private canAutomate(issueId: string): boolean {
    // AVS AI Shield can automate cleaning and software recommendations
    // but NOT hardware maintenance, replacement, or physical actions
    if (issueId.includes('low-space')) return true;
    if (issueId.includes('util-background') || issueId.includes('background')) return true;
    return false;
  }

  private severityToUrgency(severity: string): AIUrgency {
    switch (severity) {
      case 'critical': return 'immediate';
      case 'high': return 'soon';
      case 'medium': return 'scheduled';
      default: return 'none';
    }
  }
}
