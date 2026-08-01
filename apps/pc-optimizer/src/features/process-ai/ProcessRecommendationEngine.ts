/**
 * ProcessRecommendationEngine — generates evidence-based recommendations
 * for process optimization.
 *
 * Never recommends terminating critical Windows processes.
 * Clearly distinguishes: Safe, Review Recommended, Avoid, Critical System Process.
 * Every recommendation explains WHY with evidence.
 */
import type {
  ProcessAnalysis,
  ProcessRecommendation,
  RecommendationAction,
  ProcessConfiguration,
  ProcessUrgency,
  ProcessRecovery,
} from './types';

export class ProcessRecommendationEngine {
  constructor(private config: ProcessConfiguration) {}

  generate(analyses: ProcessAnalysis[]): ProcessRecommendation[] {
    const recommendations: ProcessRecommendation[] = [];

    for (const analysis of analyses) {
      if (analysis.safetyLevel === 'critical_system') continue;
      if (analysis.safetyLevel === 'avoid' && analysis.risk === 'none') continue;

      for (const issue of analysis.issues) {
        const rec = this.generateForIssue(analysis, issue.type, issue.title, issue.description, issue.evidence, issue.confidence);
        if (rec) recommendations.push(rec);
      }
    }

    const urgencyOrder: Record<ProcessUrgency, number> = { immediate: 0, soon: 1, scheduled: 2, none: 3 };
    recommendations.sort((a, b) => {
      const u = urgencyOrder[a.priority] - urgencyOrder[b.priority];
      if (u !== 0) return u;
      return b.confidence - a.confidence;
    });

    return recommendations.slice(0, this.config.maxRecommendations);
  }

  private generateForIssue(
    analysis: ProcessAnalysis,
    issueType: string,
    title: string,
    description: string,
    evidence: ProcessRecommendation['evidence'],
    confidence: number,
  ): ProcessRecommendation | null {
    const action = this.getAction(issueType, analysis.safetyLevel);
    if (action === 'no_action' && analysis.safetyLevel !== 'critical_system') return null;

    const recovery = analysis.expectedRecovery;

    return {
      id: `rec-${analysis.pid}-${issueType}`,
      pid: analysis.pid,
      name: analysis.name,
      displayName: analysis.displayName,
      action,
      title: this.getTitle(issueType, analysis.displayName),
      reason: description,
      evidence,
      expectedImprovement: this.getExpectedImprovement(issueType, recovery),
      risk: this.getRiskText(analysis.safetyLevel),
      safetyLevel: analysis.safetyLevel,
      estimatedTimeMinutes: this.getEstimatedTime(issueType),
      requiresRestart: action === 'restart_process',
      rollbackAvailable: analysis.safetyLevel === 'safe' || analysis.safetyLevel === 'review_recommended',
      canAutomate: this.canAutomate(action, analysis.safetyLevel),
      priority: analysis.urgency,
      confidence,
      expectedRecovery: recovery,
    };
  }

  private getAction(issueType: string, safety: ProcessAnalysis['safetyLevel']): RecommendationAction {
    if (safety === 'critical_system') return 'no_action';
    if (safety === 'avoid') return 'no_action';

    switch (issueType) {
      case 'unused_background_app': return 'close_process';
      case 'idle_process': return 'close_process';
      case 'memory_leak': return 'restart_process';
      case 'high_cpu': return 'investigate';
      case 'high_disk_activity': return 'investigate';
      case 'abnormal_network': return 'scan_security';
      case 'suspicious_behavior': return 'scan_security';
      case 'excessive_startup_impact': return 'delay_startup';
      case 'duplicate_process': return 'close_process';
      default: return 'no_action';
    }
  }

  private getTitle(issueType: string, displayName: string): string {
    switch (issueType) {
      case 'unused_background_app': return `Close Idle Background Process: ${displayName}`;
      case 'memory_leak': return `Restart ${displayName} to Release Memory`;
      case 'high_cpu': return `Investigate High CPU Usage in ${displayName}`;
      case 'excessive_startup_impact': return `Delay ${displayName} at Startup`;
      case 'duplicate_process': return `Close Duplicate ${displayName} Instances`;
      case 'suspicious_behavior': return `Scan ${displayName} for Security Risks`;
      case 'abnormal_network': return `Investigate Abnormal Network Activity in ${displayName}`;
      default: return `Review ${displayName}`;
    }
  }

  private getExpectedImprovement(issueType: string, recovery: ProcessRecovery): string {
    switch (issueType) {
      case 'unused_background_app':
      case 'idle_process':
        return `Recover ${recovery.ramMB.toFixed(0)} MB RAM and ${recovery.cpuPercent.toFixed(1)}% CPU.`;
      case 'memory_leak':
        return `Release ${recovery.ramMB.toFixed(0)} MB of accumulated memory. The application will continue to function normally after restart.`;
      case 'excessive_startup_impact':
        return `Improve boot time by delaying this process. It will start after the system is ready.`;
      case 'duplicate_process':
        return `Recover ${recovery.ramMB.toFixed(0)} MB RAM per closed instance.`;
      default:
        return `Improved system performance and stability.`;
    }
  }

  private getRiskText(safety: ProcessAnalysis['safetyLevel']): string {
    switch (safety) {
      case 'critical_system': return 'CRITICAL: This is a system process. Do NOT terminate.';
      case 'avoid': return 'Terminating this process may reduce system security.';
      case 'review_recommended': return 'Low risk. Review before proceeding. Rollback is available.';
      case 'safe': return 'Low risk. This process can be safely closed and restarted if needed.';
      default: return 'Unknown risk. Investigate before taking action.';
    }
  }

  private getEstimatedTime(issueType: string): number {
    switch (issueType) {
      case 'unused_background_app':
      case 'idle_process':
      case 'duplicate_process': return 1;
      case 'memory_leak': return 2;
      case 'excessive_startup_impact': return 1;
      case 'suspicious_behavior':
      case 'abnormal_network': return 10;
      default: return 5;
    }
  }

  private canAutomate(action: RecommendationAction, safety: ProcessAnalysis['safetyLevel']): boolean {
    if (safety === 'critical_system' || safety === 'avoid') return false;
    if (action === 'delay_startup' || action === 'close_process') return safety === 'safe';
    return false;
  }
}
