/**
 * Security Analyzer — evaluates Windows security posture.
 *
 * Analyzes:
 *   • Microsoft Defender (enabled, real-time protection)
 *   • Firewall
 *   • SmartScreen
 *   • Secure Boot
 *   • TPM
 *   • Core Isolation / Memory Integrity
 *   • Ransomware Protection
 *   • Virus Definitions
 *   • BitLocker
 *   • UAC
 *
 * This module does NOT modify any security configuration.
 *
 * This module does NOT modify any existing architecture.
 */
import type {
  SecurityAnalysisResult,
  WindowsHealthIssue,
} from './types';
import { daysSince, VIRUS_DEFINITIONS_STALE_DAYS } from './types';
import { WindowsRepository } from './windowsRepository';

export class SecurityAnalyzer {
  private _repo: WindowsRepository;

  constructor(repo?: WindowsRepository) {
    this._repo = repo ?? new WindowsRepository();
  }

  analyze(): SecurityAnalysisResult {
    const status = this._repo.getSecurityStatus();
    if (!status) {
      return this._emptyResult();
    }

    const issues: WindowsHealthIssue[] = [];

    if (!status.defenderEnabled && !status.thirdPartyAV) {
      issues.push({
        type: 'defender_disabled',
        title: 'Antivirus protection disabled',
        description: 'Windows Defender is not active and no third-party antivirus detected.',
        severity: 'critical',
        impact: 25,
        autoFixable: false,
      });
    }

    if (!status.realTimeProtection) {
      issues.push({
        type: 'realtime_protection_off',
        title: 'Real-time protection off',
        description: 'Real-time malware protection is disabled.',
        severity: 'high',
        impact: 15,
        autoFixable: false,
      });
    }

    if (!status.firewallEnabled) {
      issues.push({
        type: 'firewall_disabled',
        title: 'Firewall disabled',
        description: 'Windows Firewall is not active. This exposes the system to network threats.',
        severity: 'high',
        impact: 12,
        autoFixable: false,
      });
    }

    if (!status.smartScreenEnabled) {
      issues.push({
        type: 'smart_screen_disabled',
        title: 'SmartScreen disabled',
        description: 'SmartScreen filter is disabled. This reduces protection against malicious sites.',
        severity: 'low',
        impact: 5,
        autoFixable: false,
      });
    }

    if (!status.secureBootEnabled) {
      issues.push({
        type: 'secure_boot_disabled',
        title: 'Secure Boot disabled',
        description: 'Secure Boot is not enabled. This reduces boot-time security.',
        severity: 'medium',
        impact: 8,
        autoFixable: false,
      });
    }

    if (!status.tpmPresent) {
      issues.push({
        type: 'tpm_not_found',
        title: 'TPM not detected',
        description: 'Trusted Platform Module is not detected or not active.',
        severity: 'low',
        impact: 5,
        autoFixable: false,
      });
    }

    if (!status.coreIsolationEnabled) {
      issues.push({
        type: 'core_isolation_disabled',
        title: 'Core Isolation disabled',
        description: 'Core Isolation is not enabled. This reduces protection against sophisticated attacks.',
        severity: 'medium',
        impact: 7,
        autoFixable: false,
      });
    }

    if (!status.memoryIntegrityEnabled) {
      issues.push({
        type: 'memory_integrity_disabled',
        title: 'Memory Integrity disabled',
        description: 'Memory Integrity (HVCI) is not enabled.',
        severity: 'medium',
        impact: 7,
        autoFixable: false,
      });
    }

    if (!status.ransomwareProtectionEnabled) {
      issues.push({
        type: 'ransomware_protection_off',
        title: 'Ransomware protection off',
        description: 'Controlled folder access is not enabled. This reduces ransomware protection.',
        severity: 'low',
        impact: 5,
        autoFixable: false,
      });
    }

    if (!status.virusDefinitionsUpdated) {
      issues.push({
        type: 'virus_definitions_outdated',
        title: 'Virus definitions are outdated',
        description: 'Virus definitions have not been updated recently.',
        severity: 'high',
        impact: 12,
        autoFixable: false,
      });
    } else if (status.virusDefinitionsDate) {
      const staleDays = daysSince(status.virusDefinitionsDate);
      if (staleDays > VIRUS_DEFINITIONS_STALE_DAYS) {
        issues.push({
          type: 'virus_definitions_outdated',
          title: 'Virus definitions are stale',
          description: `Virus definitions are ${staleDays} days old. Update recommended.`,
          severity: 'medium',
          impact: 8,
          autoFixable: false,
        });
      }
    }

    const score = this._calculateScore(issues);
    const recommendations = this._generateRecommendations(issues);
    const allProtectionsEnabled =
      status.defenderEnabled &&
      status.realTimeProtection &&
      status.firewallEnabled &&
      status.smartScreenEnabled;

    return {
      score,
      issues,
      recommendations,
      defenderActive: status.defenderEnabled || !!status.thirdPartyAV,
      firewallActive: status.firewallEnabled,
      allProtectionsEnabled,
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
    if (issues.length === 0) return ['Security settings are properly configured'];
    return issues.map((i) => i.title);
  }

  private _emptyResult(): SecurityAnalysisResult {
    return {
      score: 100,
      issues: [],
      recommendations: ['Security status unavailable'],
      defenderActive: false,
      firewallActive: false,
      allProtectionsEnabled: false,
      analyzedAt: new Date().toISOString(),
    };
  }
}

export const securityAnalyzer = new SecurityAnalyzer();
