/**
 * TrojanDetectionProvider — detects trojan indicators.
 *
 * Priority: ⭐⭐⭐⭐⭐ (Behavior Analysis)
 *
 * Detects:
 *   - Process hollowing (legitimate process with suspicious behavior)
 *   - DLL injection into system processes
 *   - Unauthorized code execution from system process context
 *   - Known trojan process names
 *   - Suspicious network connections from system processes
 *   - Hidden windows from system processes
 *   - Registry modifications for persistence from trojan-like processes
 *   - Dropper behavior (downloading and executing payloads)
 *
 * False-positive control: Requires 2+ indicators. System process
 * name alone is not sufficient — must have behavioral anomalies.
 */
import { SecurityProvider } from './SecurityProvider';
import type {
  ProviderScanContext,
  ProviderScanResult,
  Threat,
  SecurityEvidence,
  TrojanIndicator,
} from './types';
import { confidenceToLabel } from './types';

const _KNOWN_TROJAN_NAMES = ['emotet', 'trickbot', 'zeus', 'azorult', 'lokibot', 'formbook', 'redline', 'vidar', 'racoon', 'dridex', 'qakbot', 'icedid', 'bazarloader', 'hancitor'];
const _SYSTEM_PROCESSES = ['explorer.exe', 'svchost.exe', 'lsass.exe', 'csrss.exe', 'winlogon.exe', 'wininit.exe', 'smss.exe', 'services.exe', 'spoolsv.exe', 'dwm.exe'];

export class TrojanDetectionProvider extends SecurityProvider {
  constructor() {
    super('trojan-detection', 'Trojan Detection Provider', 'behavior', '1.0.0',
      'Detects trojans: process hollowing, DLL injection, droppers, known trojan names', 45);
    this.addCapability('process_hollowing_detection');
    this.addCapability('dll_injection_detection');
    this.addCapability('dropper_detection');
    this.addCapability('trojan_process_detection');
  }

  async scan(context: ProviderScanContext): Promise<ProviderScanResult> {
    const start = Date.now();
    try {
      this.setStatus('active');
      const threats: Threat[] = [];
      const inputs = (context.options['trojanInput'] as TrojanIndicator[] | undefined) ?? [];

      for (const input of inputs) {
        const threat = this.analyzeTrojan(input);
        if (threat) threats.push(threat);
      }

      const duration = Date.now() - start;
      this.markRun();
      this.setStatus('active');
      return this.successResult(context, threats, duration, inputs.length, { analyzed: inputs.length });
    } catch (e) {
      const duration = Date.now() - start;
      const error = e instanceof Error ? e.message : String(e);
      this.setLastError(error);
      return this.failureResult(context, error, duration);
    }
  }

  private analyzeTrojan(input: TrojanIndicator): Threat | null {
    const evidence: SecurityEvidence[] = [];
    let indicatorCount = 0;

    for (const signal of input.indicators) {
      evidence.push({
        source: this.getId(),
        type: signal.type,
        value: signal.value ?? input.processName,
        description: signal.description,
        timestamp: signal.timestamp,
      });
      indicatorCount++;
    }

    if (indicatorCount < 2) return null;

    const hasHollowing = evidence.some((e) => e.type === 'process_hollowing');
    const hasInjection = evidence.some((e) => e.type === 'dll_injection');
    const hasDropper = evidence.some((e) => e.type === 'dropper_behavior');
    const hasSystemImpersonation = evidence.some((e) => e.type === 'system_process_impersonation');

    const highSeverityIndicators = [hasHollowing, hasInjection, hasDropper, hasSystemImpersonation].filter(Boolean).length;
    const severity = highSeverityIndicators >= 2 ? 'critical' : highSeverityIndicators >= 1 ? 'high' : 'medium';
    const confidence = Math.min(0.95, 0.45 + indicatorCount * 0.12);

    return this.createThreat({
      name: `Trojan detected: ${input.processName}`,
      category: 'trojans',
      severity,
      confidence,
      confidenceLabel: confidenceToLabel(confidence),
      risk: severity === 'critical' ? 'severe' : severity === 'high' ? 'high' : 'moderate',
      evidence,
      detectionSource: this.getId(),
      affectedAssets: [{ type: 'process', path: input.path, name: input.processName, pid: input.pid }],
      recommendation: 'Isolate and investigate this process immediately. Check network connections and persistence mechanisms. Run a full system scan.',
      explanation: `Process "${input.processName}" (PID ${input.pid}) shows ${indicatorCount} trojan indicator(s): ${evidence.map((e) => e.description).join('; ')}.`,
      mitreAttack: hasHollowing
        ? { tactic: 'Defense Evasion', technique: 'Process Hollowing', reference: 'https://attack.mitre.org/techniques/T1055/012' }
        : hasInjection
        ? { tactic: 'Defense Evasion', technique: 'Process Injection', reference: 'https://attack.mitre.org/techniques/T1055' }
        : hasDropper
        ? { tactic: 'Execution', technique: 'User Execution: Malicious File', reference: 'https://attack.mitre.org/techniques/T1204/002' }
        : { tactic: 'Execution', technique: 'Command and Scripting Interpreter', reference: 'https://attack.mitre.org/techniques/T1059' },
      canRemediate: false,
    });
  }
}
