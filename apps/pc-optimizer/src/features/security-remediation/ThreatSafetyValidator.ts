/**
 * ThreatSafetyValidator — validates every remediation action for safety.
 *
 * Safety is the highest priority. This validator checks:
 *   - System location protection
 *   - Critical service protection
 *   - Boot-related change protection
 *   - Unsigned file in protected directory
 *   - Confidence threshold
 *   - Reversibility check
 *   - Destructive action check
 *
 * Returns SafetyAssessment with warnings, blockers, and reasoning.
 */
import type {
  RemediationAction,
  SafetyAssessment,
  SafetyRule,
  Threat,
  RemediationRiskLevel,
} from './types';
import { isActionDestructive, isActionReversible } from './types';

const SYSTEM_PATHS = [
  'c:\\windows\\system32',
  'c:\\windows\\syswow64',
  'c:\\windows\\system',
  'c:\\program files',
  'c:\\program files (x86)',
  'c:\\windows\\boot',
  'c:\\windows\\system32\\drivers',
];

const CRITICAL_SERVICES = [
  'windowsupdate',
  'windefend',
  'mpssvc',
  'wuauserv',
  'bits',
  'cryptsvc',
  'msiserver',
  'eventlog',
  'plugandplay',
  'rpcss',
];

const CRITICAL_PROCESSES = [
  'csrss.exe',
  'wininit.exe',
  'services.exe',
  'lsass.exe',
  'svchost.exe',
  'smss.exe',
  'winlogon.exe',
];

export class ThreatSafetyValidator {
  private rules: SafetyRule[];
  private minConfidence: number;

  constructor(minConfidence = 0.5) {
    this.minConfidence = minConfidence;
    this.rules = this.createRules();
  }

  validate(action: RemediationAction, threat: Threat): SafetyAssessment {
    const warnings: string[] = [];
    const blockers: string[] = [];

    for (const rule of this.rules) {
      const result = rule.check(action, threat);
      if (!result.passed) {
        if (result.blocker) {
          blockers.push(result.blocker);
        } else if (result.warning) {
          warnings.push(result.warning);
        }
      }
    }

    const safe = blockers.length === 0;
    const riskLevel = this.computeRiskLevel(action, threat, warnings, blockers);
    const requiresApproval = blockers.length > 0 || warnings.length > 0 || riskLevel === 'high_risk' || riskLevel === 'critical_risk';
    const requiresUserConfirmation = isActionDestructive(action.type) || riskLevel === 'high_risk' || riskLevel === 'critical_risk';
    const reasoning = this.buildReasoning(safe, warnings, blockers, riskLevel);

    return {
      safe,
      riskLevel,
      requiresApproval,
      requiresUserConfirmation,
      warnings,
      blockers,
      reasoning,
    };
  }

  private createRules(): SafetyRule[] {
    return [
      {
        id: 'destructive-action',
        name: 'Destructive Action Check',
        description: 'Destructive actions (delete) require explicit user confirmation',
        severity: 'critical_risk',
        check: (action) => {
          if (isActionDestructive(action.type)) {
            return { passed: false, warning: 'This action is destructive and cannot be undone. User confirmation required.' };
          }
          return { passed: true };
        },
      },
      {
        id: 'system-location',
        name: 'System Location Protection',
        description: 'Actions targeting system directories require approval',
        severity: 'high_risk',
        check: (action) => {
          if (action.target.type === 'file' && this.isSystemLocation(action.target.path)) {
            return { passed: false, warning: `Target is in a protected system location: ${action.target.path}` };
          }
          return { passed: true };
        },
      },
      {
        id: 'critical-service',
        name: 'Critical Service Protection',
        description: 'Actions targeting critical Windows services are blocked',
        severity: 'critical_risk',
        check: (action) => {
          if (action.target.type === 'service' && CRITICAL_SERVICES.includes(action.target.name.toLowerCase())) {
            return { passed: false, blocker: `Cannot modify critical Windows service: ${action.target.name}` };
          }
          return { passed: true };
        },
      },
      {
        id: 'critical-process',
        name: 'Critical Process Protection',
        description: 'Actions targeting critical Windows processes are blocked',
        severity: 'critical_risk',
        check: (action) => {
          if (action.target.type === 'process' && CRITICAL_PROCESSES.includes(action.target.name.toLowerCase())) {
            return { passed: false, blocker: `Cannot modify critical Windows process: ${action.target.name}` };
          }
          return { passed: true };
        },
      },
      {
        id: 'boot-related',
        name: 'Boot-Related Change Protection',
        description: 'Boot-related changes require approval',
        severity: 'high_risk',
        check: (action) => {
          if (action.target.type === 'service' && action.target.name.toLowerCase().includes('boot')) {
            return { passed: false, warning: 'This action modifies a boot-related service. Approval required.' };
          }
          if (action.target.path.toLowerCase().includes('\\boot\\') || action.target.path.toLowerCase().includes('bcdedit')) {
            return { passed: false, warning: 'This action modifies boot configuration. Approval required.' };
          }
          return { passed: true };
        },
      },
      {
        id: 'confidence-threshold',
        name: 'Confidence Threshold',
        description: 'Actions on low-confidence threats require additional review',
        severity: 'medium_risk',
        check: (_action, threat) => {
          if (threat.confidence < this.minConfidence) {
            return { passed: false, warning: `Threat confidence (${(threat.confidence * 100).toFixed(0)}%) is below threshold (${(this.minConfidence * 100).toFixed(0)}%). Additional review recommended.` };
          }
          return { passed: true };
        },
      },
      {
        id: 'reversibility',
        name: 'Reversibility Check',
        description: 'Non-reversible actions require explicit confirmation',
        severity: 'high_risk',
        check: (action) => {
          if (!isActionReversible(action.type) && action.type !== 'review' && action.type !== 'ignore' && action.type !== 'export_investigation') {
            return { passed: false, warning: 'This action is not reversible. Once executed, it cannot be undone.' };
          }
          return { passed: true };
        },
      },
      {
        id: 'unsigned-protected',
        name: 'Unsigned File in Protected Directory',
        description: 'Unsigned files in protected directories require approval',
        severity: 'high_risk',
        check: (action, threat) => {
          if (action.target.type === 'file' && this.isSystemLocation(action.target.path)) {
            const hasSignature = threat.evidence.some((e) => e.type.includes('signed') && !e.type.includes('unsigned'));
            if (!hasSignature) {
              return { passed: false, warning: 'Target is an unsigned file in a protected directory. Approval required.' };
            }
          }
          return { passed: true };
        },
      },
    ];
  }

  private isSystemLocation(path: string): boolean {
    const lower = path.toLowerCase();
    return SYSTEM_PATHS.some((sp) => lower.startsWith(sp));
  }

  private computeRiskLevel(
    action: RemediationAction,
    threat: Threat,
    warnings: string[],
    blockers: string[],
  ): RemediationRiskLevel {
    if (blockers.length > 0) return 'critical_risk';
    if (isActionDestructive(action.type)) return 'critical_risk';
    if (threat.severity === 'critical') return 'high_risk';
    if (warnings.length >= 3) return 'high_risk';
    if (warnings.length >= 2) return 'medium_risk';
    if (warnings.length >= 1) return 'low_risk';
    if (action.type === 'review' || action.type === 'ignore' || action.type === 'export_investigation') return 'safe';
    return 'low_risk';
  }

  private buildReasoning(
    safe: boolean,
    warnings: string[],
    blockers: string[],
    riskLevel: RemediationRiskLevel,
  ): string {
    if (safe && warnings.length === 0) {
      return `Action is safe to execute. Risk level: ${riskLevel}.`;
    }
    const parts: string[] = [];
    if (blockers.length > 0) parts.push(`BLOCKED: ${blockers.join('; ')}`);
    if (warnings.length > 0) parts.push(`WARNINGS: ${warnings.join('; ')}`);
    parts.push(`Risk level: ${riskLevel}.`);
    return parts.join(' ');
  }
}
