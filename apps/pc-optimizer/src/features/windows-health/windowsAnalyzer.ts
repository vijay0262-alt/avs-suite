/**
 * Windows Analyzer — comprehensive Windows health analysis.
 *
 * Combines results from Update, Driver, Security, and Hardware analyzers
 * to produce an overall Windows Health Score with sub-scores.
 *
 * This module does NOT modify any existing architecture.
 */
import type { WindowsHealthResult, WindowsHealthIssue } from './types';
import { WindowsRepository } from './windowsRepository';
import { UpdateAnalyzer } from './updateAnalyzer';
import { DriverAnalyzer } from './driverAnalyzer';
import { SecurityAnalyzer } from './securityAnalyzer';
import { HardwareAnalyzer } from './hardwareAnalyzer';
import { windowsEvents } from './windowsEvents';

export class WindowsAnalyzer {
  private _repo: WindowsRepository;
  private _updateAnalyzer: UpdateAnalyzer;
  private _driverAnalyzer: DriverAnalyzer;
  private _securityAnalyzer: SecurityAnalyzer;
  private _hardwareAnalyzer: HardwareAnalyzer;

  constructor(
    repo?: WindowsRepository,
    updateAnalyzer?: UpdateAnalyzer,
    driverAnalyzer?: DriverAnalyzer,
    securityAnalyzer?: SecurityAnalyzer,
    hardwareAnalyzer?: HardwareAnalyzer,
  ) {
    this._repo = repo ?? new WindowsRepository();
    this._updateAnalyzer = updateAnalyzer ?? new UpdateAnalyzer(this._repo);
    this._driverAnalyzer = driverAnalyzer ?? new DriverAnalyzer(this._repo);
    this._securityAnalyzer = securityAnalyzer ?? new SecurityAnalyzer(this._repo);
    this._hardwareAnalyzer = hardwareAnalyzer ?? new HardwareAnalyzer(this._repo);
  }

  analyze(): WindowsHealthResult {
    const updateResult = this._updateAnalyzer.analyze();
    const driverResult = this._driverAnalyzer.analyze();
    const securityResult = this._securityAnalyzer.analyze();
    const hardwareResult = this._hardwareAnalyzer.analyze();

    const allIssues: WindowsHealthIssue[] = [
      ...updateResult.issues,
      ...driverResult.issues,
      ...securityResult.issues,
      ...hardwareResult.issues,
    ];

    const performanceScore = this._calculatePerformanceScore(hardwareResult.issues);
    const updateScore = updateResult.score;
    const securityScore = securityResult.score;
    const hardwareScore = hardwareResult.score;

    const overallScore = Math.round(
      performanceScore * 0.2 +
      updateScore * 0.25 +
      securityScore * 0.35 +
      hardwareScore * 0.2,
    );

    const insights = this._generateInsights(
      updateResult,
      driverResult,
      securityResult,
      hardwareResult,
    );

    const result: WindowsHealthResult = {
      overallScore,
      performanceScore,
      updateScore,
      securityScore,
      hardwareScore,
      issues: allIssues,
      insights,
      systemInfo: this._repo.getSystemInfo(),
      updateStatus: this._repo.getUpdateStatus(),
      securityStatus: this._repo.getSecurityStatus(),
      hardwareInfo: this._repo.getHardwareInfo(),
      driverInfo: this._repo.getDrivers(),
      analyzedAt: new Date().toISOString(),
    };

    windowsEvents.emit('windows_analysis_completed', { result });
    return result;
  }

  private _calculatePerformanceScore(hardwareIssues: WindowsHealthIssue[]): number {
    let score = 100;
    for (const issue of hardwareIssues) {
      if (issue.type === 'high_cpu_usage' || issue.type === 'high_memory_usage' || issue.type === 'low_disk_space') {
        score -= issue.impact;
      }
    }
    return Math.max(0, Math.min(100, score));
  }

  private _generateInsights(
    update: { pendingCount: number; failedCount: number; securityPendingCount: number; restartRequired: boolean },
    driver: { totalDrivers: number; outdatedCount: number; errorCount: number; unsignedCount: number },
    security: { defenderActive: boolean; firewallActive: boolean; allProtectionsEnabled: boolean },
    hardware: { cpuUsage: number; memoryUsage: number; storageUsage: number; batteryHealth: string },
  ): string[] {
    const insights: string[] = [];

    if (update.securityPendingCount > 0) {
      insights.push(`${update.securityPendingCount} security updates pending installation.`);
    }
    if (update.restartRequired) {
      insights.push('A restart is required to complete pending updates.');
    }
    if (update.failedCount > 0) {
      insights.push(`${update.failedCount} updates failed to install.`);
    }

    if (driver.totalDrivers > 0) {
      insights.push(`${driver.totalDrivers} drivers installed, ${driver.outdatedCount} outdated, ${driver.errorCount} with errors.`);
    }

    if (security.allProtectionsEnabled) {
      insights.push('All essential security protections are enabled.');
    } else {
      if (!security.defenderActive) insights.push('Antivirus protection is not active.');
      if (!security.firewallActive) insights.push('Firewall is disabled.');
    }

    insights.push(`CPU usage: ${hardware.cpuUsage.toFixed(0)}%, Memory usage: ${hardware.memoryUsage.toFixed(0)}%.`);
    if (hardware.batteryHealth !== 'not_present' && hardware.batteryHealth !== 'unknown') {
      insights.push(`Battery health: ${hardware.batteryHealth}.`);
    }

    return insights;
  }
}

export const windowsAnalyzer = new WindowsAnalyzer();
