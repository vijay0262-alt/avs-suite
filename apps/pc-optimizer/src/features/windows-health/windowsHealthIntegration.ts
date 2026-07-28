/**
 * Windows Health Integration — provides Windows health data
 * compatible with the existing AI Health Engine.
 *
 * Produces health contributions for:
 *   • system_updates (Update Health)
 *   • drivers (Driver Health)
 *   • security (Security Health)
 *
 * This module does NOT modify the AI Health Engine architecture.
 * It provides data that the existing SystemUpdatesAnalyzer,
 * DriversAnalyzer, and SecurityAnalyzer can consume.
 */
import type {
  WindowsHealthResult,
  WindowsHealthContribution,
  WindowsHealthIssue,
} from './types';
import type { Severity } from '../ai-health-engine/types';

export class WindowsHealthIntegration {
  buildUpdateContribution(health: WindowsHealthResult): WindowsHealthContribution {
    const updateIssues = health.issues.filter((i) =>
      i.type === 'pending_updates' || i.type === 'failed_updates' ||
      i.type === 'overdue_updates' || i.type === 'restart_required' ||
      i.type === 'update_service_disabled' || i.type === 'paused_updates',
    );

    return {
      categoryId: 'system_updates',
      categoryName: 'System Updates',
      score: health.updateScore,
      severity: this._worstSeverity(updateIssues.map((i) => i.severity)),
      issues: updateIssues,
      insights: health.insights.filter((i) =>
        i.includes('update') || i.includes('restart') || i.includes('Update'),
      ),
      recommendations: updateIssues.length > 0
        ? ['Install pending Windows updates', 'Enable automatic Windows updates']
        : ['System is up to date'],
      confidence: health.updateStatus !== null ? 0.8 : 0.3,
      analyzedAt: health.analyzedAt,
    };
  }

  buildDriverContribution(health: WindowsHealthResult): WindowsHealthContribution {
    const driverIssues = health.issues.filter((i) =>
      i.type === 'outdated_driver' || i.type === 'unknown_device' ||
      i.type === 'device_error' || i.type === 'unsigned_driver' ||
      i.type === 'disabled_device',
    );

    const score = this._calculateDriverScore(driverIssues);

    return {
      categoryId: 'drivers',
      categoryName: 'Drivers',
      score,
      severity: this._worstSeverity(driverIssues.map((i) => i.severity)),
      issues: driverIssues,
      insights: health.insights.filter((i) => i.includes('driver') || i.includes('Driver')),
      recommendations: driverIssues.length > 0
        ? driverIssues.map((i) => i.title)
        : ['Keep drivers updated through Windows Update or manufacturer tools'],
      confidence: health.driverInfo.length > 0 ? 0.7 : 0.1,
      analyzedAt: health.analyzedAt,
    };
  }

  buildSecurityContribution(health: WindowsHealthResult): WindowsHealthContribution {
    const securityIssues = health.issues.filter((i) =>
      i.type === 'defender_disabled' || i.type === 'realtime_protection_off' ||
      i.type === 'firewall_disabled' || i.type === 'smart_screen_disabled' ||
      i.type === 'secure_boot_disabled' || i.type === 'tpm_not_found' ||
      i.type === 'core_isolation_disabled' || i.type === 'memory_integrity_disabled' ||
      i.type === 'ransomware_protection_off' || i.type === 'virus_definitions_outdated',
    );

    return {
      categoryId: 'security',
      categoryName: 'Security',
      score: health.securityScore,
      severity: this._worstSeverity(securityIssues.map((i) => i.severity)),
      issues: securityIssues,
      insights: health.insights.filter((i) =>
        i.includes('security') || i.includes('Security') ||
        i.includes('antivirus') || i.includes('firewall') || i.includes('Firewall') ||
        i.includes('Antivirus') || i.includes('protection'),
      ),
      recommendations: securityIssues.length > 0
        ? ['Enable antivirus protection immediately', 'Turn on Windows Firewall', 'Enable real-time protection']
        : ['Security settings are properly configured'],
      confidence: health.securityStatus !== null ? 0.85 : 0.3,
      analyzedAt: health.analyzedAt,
    };
  }

  private _calculateDriverScore(issues: WindowsHealthIssue[]): number {
    let score = 100;
    for (const issue of issues) {
      score -= issue.impact;
    }
    return Math.max(0, Math.min(100, score));
  }

  private _worstSeverity(severities: Severity[]): Severity {
    const order: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
    for (const sev of order) {
      if (severities.includes(sev)) return sev;
    }
    return 'info';
  }
}

export const windowsHealthIntegration = new WindowsHealthIntegration();
