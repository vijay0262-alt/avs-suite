/**
 * BehaviorProvider — behavioral analysis security provider.
 *
 * Analyzes process behavior patterns to detect suspicious activity
 * such as process injection, hooking, suspicious network connections,
 * and abnormal system calls.
 */
import { SecurityProvider } from './SecurityProvider';
import type { ProviderScanContext, ProviderScanResult, Threat, SecurityEvidence, AffectedAsset } from './types';
import { confidenceToLabel } from './types';

export interface BehaviorDetectionInput {
  processName: string;
  pid: number;
  behaviors: string[];
  suspiciousIndicators: string[];
}

export class BehaviorProvider extends SecurityProvider {
  constructor() {
    super(
      'behavior-provider',
      'Behavior Analysis Provider',
      'behavior',
      '1.0.0',
      'Analyzes process behavior patterns for suspicious activity',
      10,
    );
    this.addCapability('process_behavior_analysis');
    this.addCapability('injection_detection');
    this.addCapability('hooking_detection');
    this.addCapability('network_behavior_analysis');
  }

  async scan(context: ProviderScanContext): Promise<ProviderScanResult> {
    const start = Date.now();
    try {
      this.setStatus('active');
      const threats: Threat[] = [];
      const itemsScanned = context.targets.length;

      for (const target of context.targets) {
        const input = context.options[target] as BehaviorDetectionInput | undefined;
        if (!input) continue;

        if (input.suspiciousIndicators.length > 0) {
          const evidence: SecurityEvidence[] = input.suspiciousIndicators.map((ind) => ({
            source: this.getId(),
            type: 'behavior_indicator',
            value: ind,
            description: `Suspicious behavior: ${ind}`,
            timestamp: Date.now(),
          }));

          const assets: AffectedAsset[] = [{
            type: 'process',
            path: target,
            name: input.processName,
            pid: input.pid,
          }];

          threats.push(this.createThreat({
            name: `Suspicious behavior: ${input.processName}`,
            category: 'malware',
            severity: input.suspiciousIndicators.length > 3 ? 'high' : 'medium',
            confidence: Math.min(0.9, 0.4 + input.suspiciousIndicators.length * 0.1),
            confidenceLabel: confidenceToLabel(Math.min(0.9, 0.4 + input.suspiciousIndicators.length * 0.1)),
            risk: input.suspiciousIndicators.length > 3 ? 'high' : 'moderate',
            evidence,
            detectionSource: this.getId(),
            affectedAssets: assets,
            recommendation: 'Monitor the process and investigate suspicious indicators.',
            explanation: `Process ${input.processName} (PID ${input.pid}) exhibited ${input.suspiciousIndicators.length} suspicious behavior indicators.`,
            mitreAttack: {
              tactic: 'Execution',
              technique: 'Process Injection',
              reference: 'https://attack.mitre.org/techniques/T1055',
            },
          }));
        }
      }

      const duration = Date.now() - start;
      this.markRun();
      this.setStatus('active');
      return this.successResult(context, threats, duration, itemsScanned, { providerType: 'behavior' });
    } catch (e) {
      const duration = Date.now() - start;
      const error = e instanceof Error ? e.message : String(e);
      this.setLastError(error);
      return this.failureResult(context, error, duration);
    }
  }
}
