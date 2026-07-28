/**
 * Windows Recommendation Engine — generates recommendations
 * from Windows health analysis.
 *
 * 10 recommendation types:
 *   • Install Windows Updates
 *   • Restart Computer
 *   • Enable Firewall
 *   • Enable Defender
 *   • Enable SmartScreen
 *   • Enable Secure Boot
 *   • Review Device Errors
 *   • Review Unsigned Drivers
 *   • Free Disk Space
 *   • Review Battery Health
 *
 * This module does NOT modify any existing architecture.
 */
import type {
  WindowsHealthResult,
  WindowsRecommendation,
  WindowsRecommendationType,
  RiskLevel,
  RecommendationPriority,
} from './types';

let _recCounter = 0;

function generateRecId(): string {
  _recCounter += 1;
  return `windows-rec-${Date.now().toString(36)}-${_recCounter}`;
}

export class WindowsRecommendationEngine {
  generate(health: WindowsHealthResult): WindowsRecommendation[] {
    const recs: WindowsRecommendation[] = [];

    // Install Windows Updates
    const pendingIssues = health.issues.filter((i) => i.type === 'pending_updates' || i.type === 'overdue_updates');
    if (pendingIssues.length > 0) {
      recs.push(this._create(
        'install_windows_updates',
        'Install Windows Updates',
        `${pendingIssues.length} update-related issues detected. Install pending updates.`,
        'high', 'none', 20, false, 'update',
      ));
    }

    // Restart Computer
    if (health.issues.some((i) => i.type === 'restart_required')) {
      recs.push(this._create(
        'restart_computer',
        'Restart Computer',
        'A restart is required to complete pending updates.',
        'high', 'none', 10, false, 'system',
      ));
    }

    // Enable Firewall
    if (health.issues.some((i) => i.type === 'firewall_disabled')) {
      recs.push(this._create(
        'enable_firewall',
        'Enable Firewall',
        'Windows Firewall is disabled. Enable it to protect against network threats.',
        'critical', 'medium', 15, true, 'security',
      ));
    }

    // Enable Defender
    const defenderIssues = health.issues.filter(
      (i) => i.type === 'defender_disabled' || i.type === 'realtime_protection_off',
    );
    if (defenderIssues.length > 0) {
      recs.push(this._create(
        'enable_defender',
        'Enable Antivirus Protection',
        'Antivirus protection is disabled. Enable Windows Defender or install third-party AV.',
        'critical', 'medium', 25, true, 'security',
      ));
    }

    // Enable SmartScreen
    if (health.issues.some((i) => i.type === 'smart_screen_disabled')) {
      recs.push(this._create(
        'enable_smartscreen',
        'Enable SmartScreen',
        'SmartScreen filter is disabled. Enable it for protection against malicious websites.',
        'medium', 'low', 5, true, 'security',
      ));
    }

    // Enable Secure Boot
    if (health.issues.some((i) => i.type === 'secure_boot_disabled')) {
      recs.push(this._create(
        'enable_secure_boot',
        'Enable Secure Boot',
        'Secure Boot is disabled. Enable it in BIOS/UEFI settings for boot-time security.',
        'medium', 'high', 8, true, 'security',
      ));
    }

    // Review Device Errors
    if (health.issues.some((i) => i.type === 'device_error')) {
      recs.push(this._create(
        'review_device_errors',
        'Review Device Errors',
        'Some devices have errors in Device Manager. Check device status and reinstall drivers.',
        'medium', 'low', 10, true, 'driver',
      ));
    }

    // Review Unsigned Drivers
    if (health.issues.some((i) => i.type === 'unsigned_driver')) {
      recs.push(this._create(
        'review_unsigned_drivers',
        'Review Unsigned Drivers',
        'Some drivers are not digitally signed. This is a security risk.',
        'high', 'medium', 15, true, 'driver',
      ));
    }

    // Free Disk Space
    if (health.issues.some((i) => i.type === 'low_disk_space')) {
      recs.push(this._create(
        'free_disk_space',
        'Free Disk Space',
        'One or more drives are running low on space. Clean up unnecessary files.',
        'high', 'low', 15, false, 'hardware',
      ));
    }

    // Review Battery Health
    if (health.issues.some((i) => i.type === 'poor_battery_health')) {
      recs.push(this._create(
        'review_battery_health',
        'Review Battery Health',
        'Battery health is degraded. Consider battery replacement.',
        'low', 'none', 5, true, 'hardware',
      ));
    }

    // Sort by priority
    const priorityOrder: Record<RecommendationPriority, number> = {
      critical: 0, high: 1, medium: 2, low: 3,
    };
    recs.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return recs;
  }

  filterByType(recs: WindowsRecommendation[], type: WindowsRecommendationType): WindowsRecommendation[] {
    return recs.filter((r) => r.type === type);
  }

  getReviewRequired(recs: WindowsRecommendation[]): WindowsRecommendation[] {
    return recs.filter((r) => r.reviewRequired);
  }

  getAutoFixable(recs: WindowsRecommendation[]): WindowsRecommendation[] {
    return recs.filter((r) => !r.reviewRequired);
  }

  private _create(
    type: WindowsRecommendationType,
    title: string,
    description: string,
    priority: RecommendationPriority,
    risk: RiskLevel,
    estimatedBenefit: number,
    reviewRequired: boolean,
    affectedComponent: WindowsRecommendation['affectedComponent'],
  ): WindowsRecommendation {
    return {
      id: generateRecId(),
      type,
      title,
      description,
      priority,
      risk,
      estimatedBenefit,
      reviewRequired,
      affectedComponent,
    };
  }
}

export const windowsRecommendationEngine = new WindowsRecommendationEngine();
