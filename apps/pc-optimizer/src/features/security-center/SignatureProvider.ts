/**
 * SignatureProvider — signature-based detection provider.
 *
 * Scans files against known threat signatures (hash-based, pattern-based).
 * This is the foundation provider for traditional malware detection.
 */
import { SecurityProvider } from './SecurityProvider';
import type { ProviderScanContext, ProviderScanResult, Threat, SecurityEvidence, AffectedAsset } from './types';
import { confidenceToLabel } from './types';

export interface SignatureMatch {
  file: string;
  hash: string;
  signatureName: string;
  category: Threat['category'];
  severity: Threat['severity'];
}

export interface SignatureDetectionInput {
  matches: SignatureMatch[];
}

export class SignatureProvider extends SecurityProvider {
  constructor() {
    super(
      'signature-provider',
      'Signature Detection Provider',
      'signature',
      '1.0.0',
      'Scans files against known threat signatures',
      20,
    );
    this.addCapability('hash_based_detection');
    this.addCapability('pattern_matching');
    this.addCapability('file_scanning');
  }

  async scan(context: ProviderScanContext): Promise<ProviderScanResult> {
    const start = Date.now();
    try {
      this.setStatus('active');
      const threats: Threat[] = [];
      const input = context.options['signatureInput'] as SignatureDetectionInput | undefined;
      const matches = input?.matches ?? [];

      for (const match of matches) {
        const evidence: SecurityEvidence[] = [
          {
            source: this.getId(),
            type: 'signature_match',
            value: match.hash,
            description: `File hash matches signature: ${match.signatureName}`,
            timestamp: Date.now(),
          },
        ];

        const assets: AffectedAsset[] = [{
          type: 'file',
          path: match.file,
          name: match.file.split(/[\\/]/).pop() ?? match.file,
          hash: match.hash,
        }];

        const confidence = 0.95;
        threats.push(this.createThreat({
          name: match.signatureName,
          category: match.category,
          severity: match.severity,
          confidence,
          confidenceLabel: confidenceToLabel(confidence),
          risk: match.severity === 'critical' ? 'severe' : match.severity === 'high' ? 'high' : 'moderate',
          evidence,
          detectionSource: this.getId(),
          affectedAssets: assets,
          recommendation: 'Review the detected file. Do not execute until verified.',
          explanation: `File ${match.file} matched known signature "${match.signatureName}" with hash ${match.hash}.`,
          canRemediate: false,
        }));
      }

      const itemsScanned = context.targets.length;
      const duration = Date.now() - start;
      this.markRun();
      this.setStatus('active');
      return this.successResult(context, threats, duration, itemsScanned, { matches: matches.length });
    } catch (e) {
      const duration = Date.now() - start;
      const error = e instanceof Error ? e.message : String(e);
      this.setLastError(error);
      return this.failureResult(context, error, duration);
    }
  }
}
