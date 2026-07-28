/**
 * Driver Analyzer — analyzes installed drivers for health issues.
 *
 * Evaluates:
 *   • Outdated drivers
 *   • Unknown devices
 *   • Device Manager errors
 *   • Disabled devices
 *   • Unsigned drivers
 *
 * Does NOT download or install drivers.
 *
 * This module does NOT modify any existing architecture.
 */
import type {
  DriverAnalysisResult,
  WindowsHealthIssue,
} from './types';
import { WindowsRepository } from './windowsRepository';

export class DriverAnalyzer {
  private _repo: WindowsRepository;

  constructor(repo?: WindowsRepository) {
    this._repo = repo ?? new WindowsRepository();
  }

  analyze(): DriverAnalysisResult {
    const drivers = this._repo.getDrivers();
    if (drivers.length === 0) {
      return this._emptyResult();
    }

    const issues: WindowsHealthIssue[] = [];
    const outdated = drivers.filter((d) => d.status === 'outdated');
    const unknown = drivers.filter((d) => d.status === 'unknown');
    const errors = drivers.filter((d) => d.hasError);
    const disabled = drivers.filter((d) => !d.isEnabled);
    const unsigned = drivers.filter((d) => !d.isSigned);

    if (outdated.length > 0) {
      issues.push({
        type: 'outdated_driver',
        title: `${outdated.length} outdated drivers`,
        description: 'Some drivers are outdated. Consider updating through Windows Update.',
        severity: 'low',
        impact: Math.min(15, outdated.length * 3),
        autoFixable: false,
      });
    }

    if (unknown.length > 0) {
      issues.push({
        type: 'unknown_device',
        title: `${unknown.length} unknown devices`,
        description: 'Some devices have no driver installed. Install drivers from manufacturer.',
        severity: 'medium',
        impact: Math.min(15, unknown.length * 5),
        autoFixable: false,
      });
    }

    if (errors.length > 0) {
      issues.push({
        type: 'device_error',
        title: `${errors.length} device errors`,
        description: 'Some devices have errors in Device Manager. Check device status.',
        severity: 'medium',
        impact: Math.min(20, errors.length * 5),
        autoFixable: false,
      });
    }

    if (disabled.length > 0) {
      issues.push({
        type: 'disabled_device',
        title: `${disabled.length} disabled devices`,
        description: 'Some devices are disabled. Enable if needed.',
        severity: 'low',
        impact: Math.min(10, disabled.length * 2),
        autoFixable: false,
      });
    }

    if (unsigned.length > 0) {
      issues.push({
        type: 'unsigned_driver',
        title: `${unsigned.length} unsigned drivers`,
        description: 'Some drivers are not digitally signed. This is a security risk.',
        severity: 'high',
        impact: Math.min(20, unsigned.length * 5),
        autoFixable: false,
      });
    }

    const score = this._calculateScore(issues);
    const recommendations = this._generateRecommendations(issues);

    return {
      score,
      issues,
      recommendations,
      totalDrivers: drivers.length,
      outdatedCount: outdated.length,
      unknownDeviceCount: unknown.length,
      errorCount: errors.length,
      disabledCount: disabled.length,
      unsignedCount: unsigned.length,
      analyzedAt: new Date().toISOString(),
    };
  }

  private _calculateScore(issues: WindowsHealthIssue[]): number {
    let score = 100;
    for (const issue of issues) {
      score -= issue.impact;
    }
    return Math.max(0, Math.min(100, score));
  }

  private _generateRecommendations(issues: WindowsHealthIssue[]): string[] {
    if (issues.length === 0) return ['All drivers are up to date'];
    return issues.map((i) => i.title);
  }

  private _emptyResult(): DriverAnalysisResult {
    return {
      score: 100,
      issues: [],
      recommendations: ['Driver information unavailable'],
      totalDrivers: 0,
      outdatedCount: 0,
      unknownDeviceCount: 0,
      errorCount: 0,
      disabledCount: 0,
      unsignedCount: 0,
      analyzedAt: new Date().toISOString(),
    };
  }
}

export const driverAnalyzer = new DriverAnalyzer();
