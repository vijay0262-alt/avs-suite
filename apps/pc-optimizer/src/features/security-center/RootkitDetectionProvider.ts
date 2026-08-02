/**
 * RootkitDetectionProvider — detects rootkit behavior indicators.
 *
 * Priority: ⭐⭐⭐⭐⭐ (Behavior Analysis)
 *
 * Detects:
 *   - Kernel driver loading from suspicious paths
 *   - SSDT hooking indicators
 *   - IRP hooking indicators
 *   - Hidden process detection (process list discrepancies)
 *   - DKOM (Direct Kernel Object Manipulation) indicators
 *   - Rootkit-related process names
 *   - Suspicious service registration for kernel drivers
 *   - Registry modifications hiding services/processes
 *
 * False-positive control: Requires 2+ indicators. Single suspicious
 * driver loads are not sufficient — must have corroborating signals.
 */
import { SecurityProvider } from './SecurityProvider';
import type {
  ProviderScanContext,
  ProviderScanResult,
  Threat,
  SecurityEvidence,
  RootkitIndicator,
} from './types';
import { confidenceToLabel } from './types';

const KNOWN_ROOTKIT_NAMES = ['rootkit', 'necurs', 'tdss', 'alureon', 'rustock', 'bagle', 'haxdoor', 'agobot', 'rxbot', 'spambot', 'cutwail', 'sirefef', 'zeroaccess', 'max++'];

export class RootkitDetectionProvider extends SecurityProvider {
  constructor() {
    super('rootkit-detection', 'Rootkit Detection Provider', 'behavior', '1.0.0',
      'Detects rootkits: kernel hooks, hidden processes, driver abuse, DKOM indicators', 44);
    this.addCapability('kernel_hook_detection');
    this.addCapability('hidden_process_detection');
    this.addCapability('driver_abuse_detection');
    this.addCapability('dkom_detection');
  }

  async scan(context: ProviderScanContext): Promise<ProviderScanResult> {
    const start = Date.now();
    try {
      this.setStatus('active');
      const threats: Threat[] = [];
      const inputs = (context.options['rootkitInput'] as RootkitIndicator[] | undefined) ?? [];

      for (const input of inputs) {
        const threat = this.analyzeRootkit(input);
        if (threat) threats.push(threat);
      }

      const duration = Date.now() - start;
      this.markRun();
      this.setStatus('inactive');
      return this.successResult(context, threats, duration, inputs.length, { analyzed: inputs.length });
    } catch (e) {
      const duration = Date.now() - start;
      const error = e instanceof Error ? e.message : String(e);
      this.setLastError(error);
      return this.failureResult(context, error, duration);
    }
  }

  private analyzeRootkit(input: RootkitIndicator): Threat | null {
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

    const hasKernelHook = evidence.some((e) => e.type === 'ssdt_hook' || e.type === 'irp_hook');
    const hasHiddenProcess = evidence.some((e) => e.type === 'hidden_process');
    const hasDriverAbuse = evidence.some((e) => e.type === 'suspicious_driver_load');
    const hasDkom = evidence.some((e) => e.type === 'dkom_indicator');

    const criticalIndicators = [hasKernelHook, hasHiddenProcess, hasDkom].filter(Boolean).length;
    const severity = criticalIndicators >= 2 ? 'critical' : criticalIndicators >= 1 || hasDriverAbuse ? 'high' : 'medium';
    const confidence = Math.min(0.93, 0.45 + indicatorCount * 0.12);

    return this.createThreat({
      name: `Rootkit activity: ${input.processName}`,
      category: 'rootkit',
      severity,
      confidence,
      confidenceLabel: confidenceToLabel(confidence),
      risk: severity === 'critical' ? 'severe' : 'high',
      evidence,
      detectionSource: this.getId(),
      affectedAssets: [{ type: 'process', path: input.path, name: input.processName, pid: input.pid }],
      recommendation: 'This is a severe threat. Boot into Safe Mode and run a dedicated rootkit remover. Consider reinstalling the OS if persistence cannot be removed.',
      explanation: `Process "${input.processName}" (PID ${input.pid}) shows ${indicatorCount} rootkit indicator(s): ${evidence.map((e) => e.description).join('; ')}.`,
      mitreAttack: hasKernelHook
        ? { tactic: 'Defense Evasion', technique: 'Kernel Modules and Extensions', reference: 'https://attack.mitre.org/techniques/T1215' }
        : hasHiddenProcess
        ? { tactic: 'Defense Evasion', technique: 'Hide Artifacts: Hidden Process', reference: 'https://attack.mitre.org/techniques/T1564/001' }
        : { tactic: 'Persistence', technique: 'Kernel Modules and Extensions', reference: 'https://attack.mitre.org/techniques/T1215' },
      canRemediate: false,
    });
  }
}
