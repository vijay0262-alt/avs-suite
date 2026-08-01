/**
 * SpywareDetectionProvider — detects spyware behavior indicators.
 *
 * Priority: ⭐⭐⭐⭐⭐ (Behavior Analysis)
 *
 * Detects:
 *   - Credential access attempts
 *   - Browser credential access
 *   - Clipboard monitoring
 *   - Screen capture attempts
 *   - Keyboard hook registration
 *   - Microphone/camera access
 *   - Unauthorized browser data access
 *   - Suspicious persistence combined with spyware indicators
 *
 * False-positive control: Requires 2+ indicators to flag.
 * Single weak indicators are reported as info only.
 */
import { SecurityProvider } from './SecurityProvider';
import type {
  ProviderScanContext,
  ProviderScanResult,
  Threat,
  SecurityEvidence,
  AffectedAsset,
  SpywareIndicator,
  SpywareSignal,
} from './types';
import { confidenceToLabel } from './types';

const SPYWARE_MITRE_MAP: Record<SpywareSignal['type'], { tactic: string; technique: string; reference: string }> = {
  credential_access: { tactic: 'Credential Access', technique: 'OS Credential Dumping', reference: 'https://attack.mitre.org/techniques/T1003' },
  browser_credential_access: { tactic: 'Credential Access', technique: 'Credentials from Web Browsers', reference: 'https://attack.mitre.org/techniques/T1555/003' },
  clipboard_monitoring: { tactic: 'Collection', technique: 'Clipboard Data', reference: 'https://attack.mitre.org/techniques/T1115' },
  screen_capture: { tactic: 'Collection', technique: 'Screen Capture', reference: 'https://attack.mitre.org/techniques/T1113' },
  keyboard_hook: { tactic: 'Collection', technique: 'Keylogging', reference: 'https://attack.mitre.org/techniques/T1056/001' },
  microphone_access: { tactic: 'Collection', technique: 'Audio Capture', reference: 'https://attack.mitre.org/techniques/T1123' },
  camera_access: { tactic: 'Collection', technique: 'Video Capture', reference: 'https://attack.mitre.org/techniques/T1125' },
  browser_data_access: { tactic: 'Collection', technique: 'Data from Information Repositories', reference: 'https://attack.mitre.org/techniques/T1213' },
  suspicious_persistence: { tactic: 'Persistence', technique: 'Boot or Logon Autostart Execution', reference: 'https://attack.mitre.org/techniques/T1547' },
};

const HIGH_SEVERITY_TYPES: SpywareSignal['type'][] = ['credential_access', 'browser_credential_access', 'keyboard_hook'];

export class SpywareDetectionProvider extends SecurityProvider {
  constructor() {
    super('spyware-detection', 'Spyware Detection Provider', 'behavior', '1.0.0',
      'Detects spyware indicators: credential access, keylogging, screen capture, clipboard monitoring', 50);
    this.addCapability('credential_access_detection');
    this.addCapability('keylogger_detection');
    this.addCapability('clipboard_monitoring');
    this.addCapability('screen_capture_detection');
    this.addCapability('camera_microphone_access');
  }

  async scan(context: ProviderScanContext): Promise<ProviderScanResult> {
    const start = Date.now();
    try {
      this.setStatus('active');
      const threats: Threat[] = [];
      const inputs = (context.options['spywareInput'] as SpywareIndicator[] | undefined) ?? [];

      for (const input of inputs) {
        const threat = this.analyzeSpyware(input);
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

  private analyzeSpyware(input: SpywareIndicator): Threat | null {
    const indicators = input.indicators;
    if (indicators.length === 0) return null;

    // False-positive control: require 2+ indicators
    if (indicators.length < 2) return null;

    const evidence: SecurityEvidence[] = indicators.map((ind) => ({
      source: this.getId(),
      type: `spyware_${ind.type}`,
      value: input.processName,
      description: ind.description,
      timestamp: ind.timestamp,
    }));

    const assets: AffectedAsset[] = [{
      type: 'process',
      path: input.path,
      name: input.processName,
      pid: input.pid,
    }];

    const hasHighSeverity = indicators.some((i) => HIGH_SEVERITY_TYPES.includes(i.type));
    const severity = hasHighSeverity ? 'high' : indicators.length >= 4 ? 'high' : 'medium';
    const confidence = Math.min(0.95, 0.4 + indicators.length * 0.12);
    const risk = severity === 'high' ? 'high' : 'moderate';

    const indicatorTypes = indicators.map((i) => i.type);
    const primaryType = hasHighSeverity
      ? indicators.find((i) => HIGH_SEVERITY_TYPES.includes(i.type))!.type
      : indicators[0]!.type;
    const mitre = SPYWARE_MITRE_MAP[primaryType] ?? null;

    return this.createThreat({
      name: `Spyware behavior: ${input.processName}`,
      category: 'spyware',
      severity,
      confidence,
      confidenceLabel: confidenceToLabel(confidence),
      risk,
      evidence,
      detectionSource: this.getId(),
      affectedAssets: assets,
      recommendation: 'Investigate this process immediately. Check for unauthorized data access and remove if confirmed spyware.',
      explanation: `Process "${input.processName}" (PID ${input.pid}) exhibited ${indicators.length} spyware indicators: ${indicatorTypes.join(', ')}. Multiple indicators suggest systematic data collection behavior.`,
      mitreAttack: mitre,
      canRemediate: false,
    });
  }
}
