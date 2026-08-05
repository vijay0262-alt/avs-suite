/**
 * AdwareDetectionProvider — detects adware indicators.
 *
 * Priority: ⭐⭐⭐⭐⭐ (PUP/Adware Detection)
 *
 * Detects:
 *   - Advertising injectors
 *   - Popup generators
 *   - Notification abuse
 *   - Homepage modifications
 *   - Search engine replacement
 *   - Toolbar installation
 *   - Affiliate injectors
 *   - Advertising services
 *
 * False-positive control: Requires 2+ indicators. Single indicator
 * with weak signal is not flagged.
 */
import { SecurityProvider } from './SecurityProvider';
import type {
  ProviderScanContext,
  ProviderScanResult,
  Threat,
  SecurityEvidence,
  AffectedAsset,
  AdwareIndicator,
} from './types';
import { confidenceToLabel } from './types';

export class AdwareDetectionProvider extends SecurityProvider {
  constructor() {
    super('adware-detection', 'Adware Detection Provider', 'behavior', '1.0.0',
      'Detects adware: ad injection, popup generation, notification abuse, homepage hijacking', 45);
    this.addCapability('ad_injection_detection');
    this.addCapability('popup_detection');
    this.addCapability('notification_abuse_detection');
    this.addCapability('homepage_hijack_detection');
    this.addCapability('toolbar_detection');
  }

  async scan(context: ProviderScanContext): Promise<ProviderScanResult> {
    const start = Date.now();
    try {
      this.setStatus('active');
      const threats: Threat[] = [];
      const inputs = (context.options['adwareInput'] as AdwareIndicator[] | undefined) ?? [];

      for (const input of inputs) {
        const threat = this.analyzeAdware(input);
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

  private analyzeAdware(input: AdwareIndicator): Threat | null {
    if (input.indicators.length < 2) return null;

    const evidence: SecurityEvidence[] = input.indicators.map((ind) => ({
      source: this.getId(),
      type: `adware_${ind.type}`,
      value: input.target,
      description: ind.description,
      timestamp: ind.timestamp,
    }));

    const assets: AffectedAsset[] = [{
      type: 'file',
      path: input.target,
      name: input.target.split(/[\\/]/).pop() ?? input.target,
    }];

    const hasHijack = input.indicators.some((i) => i.type === 'homepage_modification' || i.type === 'search_engine_replacement');
    const severity = hasHijack ? 'medium' : 'low';
    const confidence = Math.min(0.9, 0.35 + input.indicators.length * 0.12);
    const risk = hasHijack ? 'moderate' : 'low';

    const types = input.indicators.map((i) => i.type);

    return this.createThreat({
      name: `Adware detected: ${input.target.split(/[\\/]/).pop() ?? input.target}`,
      category: 'adware',
      severity,
      confidence,
      confidenceLabel: confidenceToLabel(confidence),
      risk,
      evidence,
      detectionSource: this.getId(),
      affectedAssets: assets,
      recommendation: 'Remove this adware. Check browser settings and restore defaults if hijacked.',
      explanation: `Target "${input.target}" shows ${input.indicators.length} adware indicators: ${types.join(', ')}. ${hasHijack ? 'Browser hijacking detected. ' : ''}Multiple indicators suggest adware activity.`,
      mitreAttack: hasHijack ? {
        tactic: 'Persistence',
        technique: 'Browser Extensions',
        reference: 'https://attack.mitre.org/techniques/T1176',
      } : null,
      canRemediate: false,
    });
  }
}
