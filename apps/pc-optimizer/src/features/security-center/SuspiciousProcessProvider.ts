/**
 * SuspiciousProcessProvider — detects suspicious process behavior.
 *
 * Priority: ⭐⭐⭐⭐⭐ (Behavior Analysis)
 *
 * Detects:
 *   - Process injection (VirtualAllocEx, WriteProcessMemory, CreateRemoteThread)
 *   - Rapid child process creation
 *   - Self-replication indicators
 *   - Excessive privilege requests
 *   - Unexpected service creation from processes
 *   - Process hollowing indicators
 *   - Living-off-the-land binary abuse
 */
import { SecurityProvider } from './SecurityProvider';
import type {
  ProviderScanContext,
  ProviderScanResult,
  Threat,
  SecurityEvidence,
  ProcessBehaviorInfo,
} from './types';
import { confidenceToLabel } from './types';

const LOLBINS = ['rundll32', 'regsvr32', 'mshta', 'wmic', 'certutil', 'bitsadmin', 'msiexec', 'forfiles', 'syncappvpublishingserver', 'ieexec', 'msxsl'];

const HIGH_WEIGHT_TYPES = ['process_injection', 'create_remote_thread', 'write_process_memory', 'virtual_allocex', 'process_hollowing'];

export class SuspiciousProcessProvider extends SecurityProvider {
  constructor() {
    super('suspicious-process', 'Suspicious Process Provider', 'behavior', '1.0.0',
      'Detects suspicious process behavior: injection, hollowing, rapid spawning, LOLBin abuse', 47);
    this.addCapability('process_injection_detection');
    this.addCapability('process_hollowing_detection');
    this.addCapability('lolbin_abuse_detection');
    this.addCapability('rapid_spawning_detection');
  }

  async scan(context: ProviderScanContext): Promise<ProviderScanResult> {
    const start = Date.now();
    try {
      this.setStatus('active');
      const threats: Threat[] = [];
      const processes = (context.options['processBehaviors'] as ProcessBehaviorInfo[] | undefined) ?? [];

      for (const proc of processes) {
        const t = this.analyzeProcess(proc);
        if (t) threats.push(t);
      }

      const duration = Date.now() - start;
      this.markRun();
      this.setStatus('active');
      return this.successResult(context, threats, duration, processes.length, { analyzed: processes.length });
    } catch (e) {
      const duration = Date.now() - start;
      const error = e instanceof Error ? e.message : String(e);
      this.setLastError(error);
      return this.failureResult(context, error, duration);
    }
  }

  private analyzeProcess(proc: ProcessBehaviorInfo): Threat | null {
    const evidence: SecurityEvidence[] = [];
    let totalWeight = 0;

    for (const ind of proc.indicators) {
      evidence.push({
        source: this.getId(),
        type: ind.type,
        value: proc.processName,
        description: ind.description,
        timestamp: ind.timestamp,
      });
      totalWeight += ind.weight;
    }

    // Check for LOLBin abuse
    const nameLower = proc.processName.toLowerCase();
    const lolbin = LOLBINS.find((l) => nameLower.includes(l));
    if (lolbin) {
      evidence.push({
        source: this.getId(),
        type: 'lolbin',
        value: lolbin,
        description: `Living-off-the-land binary: ${lolbin}`,
        timestamp: Date.now(),
      });
      totalWeight += 2;
    }

    // False-positive control: require weight >= 3
    if (totalWeight < 3) return null;

    const hasInjection = evidence.some((e) => HIGH_WEIGHT_TYPES.includes(e.type));
    const severity = hasInjection ? 'high' : totalWeight >= 6 ? 'medium' : 'low';
    const confidence = Math.min(0.95, 0.4 + totalWeight * 0.1);

    return this.createThreat({
      name: `Suspicious process: ${proc.processName}`,
      category: 'malware',
      severity,
      confidence,
      confidenceLabel: confidenceToLabel(confidence),
      risk: severity === 'high' ? 'high' : 'moderate',
      evidence,
      detectionSource: this.getId(),
      affectedAssets: [{ type: 'process', path: proc.path, name: proc.processName, pid: proc.pid }],
      recommendation: 'Investigate this process. Check parent process, command line, and network connections.',
      explanation: `Process "${proc.processName}" (PID ${proc.pid}) has ${evidence.length} suspicious behavior indicator(s) with weight ${totalWeight}: ${evidence.map((e) => e.description).join('; ')}.`,
      mitreAttack: hasInjection
        ? { tactic: 'Defense Evasion', technique: 'Process Injection', reference: 'https://attack.mitre.org/techniques/T1055' }
        : { tactic: 'Execution', technique: 'Command and Scripting Interpreter', reference: 'https://attack.mitre.org/techniques/T1059' },
      canRemediate: false,
    });
  }
}
