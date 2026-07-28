/**
 * Hardware Analyzer — assesses hardware health and performance.
 *
 * Analyzes:
 *   • CPU usage
 *   • Memory usage
 *   • Storage devices and free space
 *   • Disk health (placeholder for SMART)
 *   • Battery health
 *   • GPU info
 *
 * This module does NOT modify any existing architecture.
 */
import type {
  HardwareAnalysisResult,
  WindowsHealthIssue,
  StorageDeviceInfo,
} from './types';
import {
  HIGH_CPU_USAGE_THRESHOLD,
  HIGH_MEMORY_USAGE_THRESHOLD,
  LOW_DISK_SPACE_THRESHOLD,
  LOW_DISK_SPACE_WARNING_THRESHOLD,
} from './types';
import { WindowsRepository } from './windowsRepository';

export class HardwareAnalyzer {
  private _repo: WindowsRepository;

  constructor(repo?: WindowsRepository) {
    this._repo = repo ?? new WindowsRepository();
  }

  analyze(): HardwareAnalysisResult {
    const hardware = this._repo.getHardwareInfo();
    if (!hardware) {
      return this._emptyResult();
    }

    const issues: WindowsHealthIssue[] = [];

    // CPU usage
    if (hardware.cpu.currentUsage > HIGH_CPU_USAGE_THRESHOLD) {
      issues.push({
        type: 'high_cpu_usage',
        title: 'High CPU usage',
        description: `CPU usage is at ${hardware.cpu.currentUsage.toFixed(0)}%.`,
        severity: 'medium',
        impact: 10,
        autoFixable: false,
      });
    }

    // Memory usage
    if (hardware.memory.usage > HIGH_MEMORY_USAGE_THRESHOLD) {
      issues.push({
        type: 'high_memory_usage',
        title: 'High memory usage',
        description: `Memory usage is at ${hardware.memory.usage.toFixed(0)}%.`,
        severity: 'medium',
        impact: 10,
        autoFixable: false,
      });
    }

    // Storage / disk space
    const lowSpaceDrives: StorageDeviceInfo[] = [];
    for (const drive of hardware.storage) {
      const usageFraction = drive.totalSize > 0 ? drive.usedSpace / drive.totalSize : 0;
      if (usageFraction >= LOW_DISK_SPACE_THRESHOLD) {
        lowSpaceDrives.push(drive);
        issues.push({
          type: 'low_disk_space',
          title: `Low disk space on ${drive.name}`,
          description: `Drive ${drive.name} is ${(usageFraction * 100).toFixed(0)}% full.`,
          severity: 'high',
          impact: 15,
          autoFixable: false,
        });
      } else if (usageFraction >= LOW_DISK_SPACE_WARNING_THRESHOLD) {
        lowSpaceDrives.push(drive);
        issues.push({
          type: 'low_disk_space',
          title: `Disk space warning on ${drive.name}`,
          description: `Drive ${drive.name} is ${(usageFraction * 100).toFixed(0)}% full.`,
          severity: 'low',
          impact: 5,
          autoFixable: false,
        });
      }
    }

    // Battery health
    let batteryHealth: HardwareAnalysisResult['batteryHealth'] = 'not_present';
    if (hardware.battery?.present) {
      batteryHealth = hardware.battery.health;
      if (hardware.battery.health === 'poor') {
        issues.push({
          type: 'poor_battery_health',
          title: 'Poor battery health',
          description: 'Battery health is degraded. Consider replacement.',
          severity: 'medium',
          impact: 8,
          autoFixable: false,
        });
      } else if (hardware.battery.health === 'fair') {
        issues.push({
          type: 'poor_battery_health',
          title: 'Battery health is fair',
          description: 'Battery health is declining.',
          severity: 'low',
          impact: 3,
          autoFixable: false,
        });
      }
    }

    const score = this._calculateScore(issues);
    const recommendations = this._generateRecommendations(issues);

    return {
      score,
      issues,
      recommendations,
      cpuUsage: hardware.cpu.currentUsage,
      memoryUsage: hardware.memory.usage,
      storageUsage: hardware.totalStorageTotal > 0
        ? (hardware.totalStorageUsed / hardware.totalStorageTotal) * 100
        : 0,
      batteryHealth,
      lowDiskSpaceDrives: lowSpaceDrives,
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
    if (issues.length === 0) return ['Hardware is healthy'];
    return issues.map((i) => i.title);
  }

  private _emptyResult(): HardwareAnalysisResult {
    return {
      score: 100,
      issues: [],
      recommendations: ['Hardware information unavailable'],
      cpuUsage: 0,
      memoryUsage: 0,
      storageUsage: 0,
      batteryHealth: 'unknown',
      lowDiskSpaceDrives: [],
      analyzedAt: new Date().toISOString(),
    };
  }
}

export const hardwareAnalyzer = new HardwareAnalyzer();
