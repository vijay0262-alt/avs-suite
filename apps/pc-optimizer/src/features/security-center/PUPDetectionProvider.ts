/**
 * PUPDetectionProvider — detects Potentially Unwanted Programs.
 *
 * Priority: ⭐⭐⭐⭐⭐ (PUP/Adware Detection)
 *
 * Detects:
 *   - Bundled installers
 *   - Optimizer scams
 *   - Driver updater scams
 *   - Fake antivirus
 *   - Potentially unwanted browser extensions
 *   - Crypto mining software
 *   - Download managers with bundled software
 *
 * False-positive control: Requires 2+ indicators or 1 strong indicator
 * (fake_antivirus, crypto_mining_software).
 */
import { SecurityProvider } from './SecurityProvider';
import type {
  ProviderScanContext,
  ProviderScanResult,
  Threat,
  SecurityEvidence,
  AffectedAsset,
  PUPIndicator,
} from './types';
import { confidenceToLabel } from './types';

const STRONG_PUP_TYPES = ['fake_antivirus', 'crypto_mining_software'];

export class PUPDetectionProvider extends SecurityProvider {
  constructor() {
    super('pup-detection', 'PUP Detection Provider', 'behavior', '1.0.0',
      'Detects potentially unwanted programs: bundled installers, optimizer scams, fake AV', 42);
    this.addCapability('bundled_installer_detection');
    this.addCapability('fake_antivirus_detection');
    this.addCapability('optimizer_scam_detection');
    this.addCapability('driver_updater_scam_detection');
    this.addCapability('unwanted_extension_detection');
  }

  async scan(context: ProviderScanContext): Promise<ProviderScanResult> {
    const start = Date.now();
    try {
      this.setStatus('active');
      const threats: Threat[] = [];
      const inputs = (context.options['pupInput'] as PUPIndicator[] | undefined) ?? [];

      for (const input of inputs) {
        const threat = this.analyzePUP(input);
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

  private analyzePUP(input: PUPIndicator): Threat | null {
    const hasStrong = input.indicators.some((i) => STRONG_PUP_TYPES.includes(i.type));
    if (input.indicators.length < 2 && !hasStrong) return null;

    const evidence: SecurityEvidence[] = input.indicators.map((ind) => ({
      source: this.getId(),
      type: `pup_${ind.type}`,
      value: input.target,
      description: ind.description,
      timestamp: ind.timestamp,
    }));

    const assets: AffectedAsset[] = [{
      type: 'file',
      path: input.target,
      name: input.name,
    }];

    const severity = hasStrong ? 'medium' : 'low';
    const confidence = Math.min(0.9, 0.3 + input.indicators.length * 0.15 + (hasStrong ? 0.2 : 0));
    const risk = hasStrong ? 'moderate' : 'low';

    const types = input.indicators.map((i) => i.type);

    return this.createThreat({
      name: `PUP detected: ${input.name}`,
      category: 'pup',
      severity,
      confidence,
      confidenceLabel: confidenceToLabel(confidence),
      risk,
      evidence,
      detectionSource: this.getId(),
      affectedAssets: assets,
      recommendation: 'Review this program. Uninstall if you did not intentionally install it. Be cautious of bundled offers during installation.',
      explanation: `Program "${input.name}" shows ${input.indicators.length} PUP indicators: ${types.join(', ')}. ${hasStrong ? 'Strong indicator detected. ' : ''}This program may be potentially unwanted.`,
      canRemediate: false,
    });
  }
}
