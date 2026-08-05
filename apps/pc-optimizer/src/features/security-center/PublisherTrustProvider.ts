/**
 * PublisherTrustProvider — assesses publisher trustworthiness.
 *
 * Priority: ⭐⭐⭐⭐ (Reputation Analysis)
 *
 * Assesses:
 *   - Digital signature validity
 *   - Certificate chain integrity
 *   - Known vendor verification
 *   - Publisher reputation score
 *   - Self-signed certificates
 *   - Expired certificates
 *
 * False-positive control: Known vendors with valid certificates
 * are never flagged. Unknown publishers require 2+ risk factors.
 */
import { SecurityProvider } from './SecurityProvider';
import type {
  ProviderScanContext,
  ProviderScanResult,
  Threat,
  SecurityEvidence,
  PublisherReputationDetail,
} from './types';
import { confidenceToLabel } from './types';

export class PublisherTrustProvider extends SecurityProvider {
  constructor() {
    super('publisher-trust', 'Publisher Trust Provider', 'reputation', '1.0.0',
      'Assesses publisher trust: signature validity, certificate chain, known vendor', 20);
    this.addCapability('signature_validation');
    this.addCapability('certificate_chain_analysis');
    this.addCapability('known_vendor_verification');
  }

  async scan(context: ProviderScanContext): Promise<ProviderScanResult> {
    const start = Date.now();
    try {
      this.setStatus('active');
      const threats: Threat[] = [];
      const input = context.options['reputationAnalysis'] as { publishers?: PublisherReputationDetail[] } | undefined;
      const publishers = input?.publishers ?? [];

      for (const pub of publishers) {
        const t = this.analyzePublisher(pub);
        if (t) threats.push(t);
      }

      const duration = Date.now() - start;
      this.markRun();
      this.setStatus('active');
      return this.successResult(context, threats, duration, publishers.length, { analyzed: publishers.length });
    } catch (e) {
      const duration = Date.now() - start;
      const error = e instanceof Error ? e.message : String(e);
      this.setLastError(error);
      return this.failureResult(context, error, duration);
    }
  }

  private analyzePublisher(pub: PublisherReputationDetail): Threat | null {
    if (pub.knownVendor && pub.signed && pub.certificateValid) return null;

    const evidence: SecurityEvidence[] = [];
    let riskFactors = 0;

    if (!pub.signed) {
      evidence.push({ source: this.getId(), type: 'unsigned', value: pub.name, description: 'Publisher does not sign executables', timestamp: Date.now() });
      riskFactors++;
    }

    if (!pub.certificateValid) {
      evidence.push({ source: this.getId(), type: 'invalid_cert', value: pub.name, description: 'Certificate is invalid or expired', timestamp: Date.now() });
      riskFactors++;
    }

    if (!pub.knownVendor) {
      evidence.push({ source: this.getId(), type: 'unknown_vendor', value: pub.name, description: 'Publisher is not a known vendor', timestamp: Date.now() });
      riskFactors++;
    }

    if (pub.certificateChain.length <= 1 && pub.signed) {
      evidence.push({ source: this.getId(), type: 'short_chain', value: pub.certificateChain.length.toString(), description: 'Certificate chain is unusually short', timestamp: Date.now() });
      riskFactors++;
    }

    if (pub.reputationScore < 30) {
      evidence.push({ source: this.getId(), type: 'low_reputation', value: pub.reputationScore.toString(), description: `Low publisher reputation: ${pub.reputationScore}/100`, timestamp: Date.now() });
      riskFactors++;
    }

    // False-positive control: require 2+ risk factors
    if (riskFactors < 2) return null;

    const severity = riskFactors >= 4 ? 'medium' : 'low';
    const confidence = Math.min(0.85, 0.3 + riskFactors * 0.12);

    return this.createThreat({
      name: `Untrusted publisher: ${pub.name}`,
      category: 'pup',
      severity,
      confidence,
      confidenceLabel: confidenceToLabel(confidence),
      risk: 'moderate',
      evidence,
      detectionSource: this.getId(),
      affectedAssets: [{ type: 'file', path: pub.name, name: pub.name }],
      recommendation: 'Exercise caution with software from this publisher. Verify the source before installing.',
      explanation: `Publisher "${pub.name}" has ${riskFactors} trust risk factor(s): ${evidence.map((e) => e.description).join('; ')}. Reputation score: ${pub.reputationScore}/100.`,
      canRemediate: false,
    });
  }
}
