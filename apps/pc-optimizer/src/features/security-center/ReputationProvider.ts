/**
 * ReputationProvider — reputation analysis provider.
 *
 * Evaluates the reputation of files, processes, and publishers
 * based on known reputation data. Low-reputation items are flagged
 * for review.
 */
import { SecurityProvider } from './SecurityProvider';
import type { ProviderScanContext, ProviderScanResult, Threat, SecurityEvidence, AffectedAsset } from './types';
import { confidenceToLabel } from './types';

export interface ReputationEntry {
  target: string;
  type: 'file' | 'publisher' | 'process';
  reputationScore: number;
  knownGood: boolean;
  knownBad: boolean;
  reasons: string[];
}

export interface ReputationDetectionInput {
  entries: ReputationEntry[];
}

export class ReputationProvider extends SecurityProvider {
  constructor() {
    super(
      'reputation-provider',
      'Reputation Analysis Provider',
      'reputation',
      '1.0.0',
      'Evaluates reputation of files, processes, and publishers',
      8,
    );
    this.addCapability('file_reputation');
    this.addCapability('publisher_reputation');
    this.addCapability('process_reputation');
  }

  async scan(context: ProviderScanContext): Promise<ProviderScanResult> {
    const start = Date.now();
    try {
      this.setStatus('active');
      const threats: Threat[] = [];
      const input = context.options['reputationInput'] as ReputationDetectionInput | undefined;
      const entries = input?.entries ?? [];

      for (const entry of entries) {
        if (entry.knownGood) continue;
        if (entry.reputationScore > 60 && !entry.knownBad) continue;

        const evidence: SecurityEvidence[] = entry.reasons.map((reason) => ({
          source: this.getId(),
          type: 'reputation_indicator',
          value: entry.target,
          description: reason,
          timestamp: Date.now(),
        }));

        const assets: AffectedAsset[] = [{
          type: entry.type === 'file' ? 'file' : entry.type === 'process' ? 'process' : 'file',
          path: entry.target,
          name: entry.target.split(/[\\/]/).pop() ?? entry.target,
        }];

        const confidence = entry.knownBad ? 0.9 : Math.max(0.3, 1 - entry.reputationScore / 100);
        const severity = entry.knownBad ? 'high' : entry.reputationScore < 30 ? 'medium' : 'low';

        threats.push(this.createThreat({
          name: `Low reputation ${entry.type}: ${entry.target.split(/[\\/]/).pop() ?? entry.target}`,
          category: entry.knownBad ? 'malware' : 'pup',
          severity,
          confidence,
          confidenceLabel: confidenceToLabel(confidence),
          risk: entry.knownBad ? 'high' : 'low',
          evidence,
          detectionSource: this.getId(),
          affectedAssets: assets,
          recommendation: entry.knownBad
            ? 'This item has known bad reputation. Remove immediately.'
            : 'This item has low reputation. Verify before trusting.',
          explanation: `${entry.type.charAt(0).toUpperCase() + entry.type.slice(1)} "${entry.target}" has reputation score ${entry.reputationScore}/100. ${entry.reasons.join(', ')}.`,
          canRemediate: false,
        }));
      }

      const itemsScanned = entries.length;
      const duration = Date.now() - start;
      this.markRun();
      this.setStatus('active');
      return this.successResult(context, threats, duration, itemsScanned, { entriesScanned: entries.length });
    } catch (e) {
      const duration = Date.now() - start;
      const error = e instanceof Error ? e.message : String(e);
      this.setLastError(error);
      return this.failureResult(context, error, duration);
    }
  }
}
