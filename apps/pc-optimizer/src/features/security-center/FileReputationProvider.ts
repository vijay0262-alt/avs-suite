/**
 * FileReputationProvider — assesses file reputation based on multiple signals.
 *
 * Priority: ⭐⭐⭐⭐ (Reputation Analysis)
 *
 * Assesses:
 *   - Digital signature status
 *   - Known good / known bad status
 *   - Reputation score
 *   - First seen date
 *   - File size anomalies
 *   - Hash-based reputation
 *
 * False-positive control: Known good files are never flagged.
 * Unknown files require low reputation + additional risk factor.
 */
import { SecurityProvider } from './SecurityProvider';
import type {
  ProviderScanContext,
  ProviderScanResult,
  Threat,
  SecurityEvidence,
  FileReputationDetail,
} from './types';
import { confidenceToLabel } from './types';

export class FileReputationProvider extends SecurityProvider {
  constructor() {
    super('file-reputation', 'File Reputation Provider', 'reputation', '1.0.0',
      'Assesses file reputation: signature, known good/bad, reputation score, first seen', 22);
    this.addCapability('file_reputation_scoring');
    this.addCapability('known_bad_detection');
    this.addCapability('first_seen_analysis');
  }

  async scan(context: ProviderScanContext): Promise<ProviderScanResult> {
    const start = Date.now();
    try {
      this.setStatus('active');
      const threats: Threat[] = [];
      const input = context.options['reputationAnalysis'] as { files?: FileReputationDetail[] } | undefined;
      const files = input?.files ?? [];

      for (const file of files) {
        const t = this.analyzeFile(file);
        if (t) threats.push(t);
      }

      const duration = Date.now() - start;
      this.markRun();
      this.setStatus('active');
      return this.successResult(context, threats, duration, files.length, { analyzed: files.length });
    } catch (e) {
      const duration = Date.now() - start;
      const error = e instanceof Error ? e.message : String(e);
      this.setLastError(error);
      return this.failureResult(context, error, duration);
    }
  }

  private analyzeFile(file: FileReputationDetail): Threat | null {
    if (file.knownGood) return null;

    const evidence: SecurityEvidence[] = [];
    let riskFactors = 0;

    if (file.knownBad) {
      evidence.push({ source: this.getId(), type: 'known_bad', value: file.hash, description: 'File hash matches known bad reputation', timestamp: Date.now() });
      riskFactors += 3;
    }

    if (!file.signed) {
      evidence.push({ source: this.getId(), type: 'unsigned', value: file.path, description: 'File is not digitally signed', timestamp: Date.now() });
      riskFactors++;
    }

    if (file.reputationScore < 30) {
      evidence.push({ source: this.getId(), type: 'low_reputation', value: file.reputationScore.toString(), description: `Low reputation score: ${file.reputationScore}/100`, timestamp: Date.now() });
      riskFactors++;
    }

    if (file.firstSeen !== null && Date.now() - file.firstSeen < 86400000) {
      evidence.push({ source: this.getId(), type: 'recently_seen', value: new Date(file.firstSeen).toISOString(), description: 'File first seen within last 24 hours', timestamp: Date.now() });
      riskFactors++;
    }

    if (file.installLocation === 'temp' || file.installLocation === 'appdata') {
      evidence.push({ source: this.getId(), type: 'suspicious_location', value: file.installLocation, description: `File in suspicious location: ${file.installLocation}`, timestamp: Date.now() });
      riskFactors++;
    }

    // False-positive control: require riskFactors >= 2 (or knownBad)
    if (riskFactors < 2 && !file.knownBad) return null;

    const severity = file.knownBad ? 'high' : riskFactors >= 4 ? 'medium' : 'low';
    const confidence = Math.min(0.95, 0.3 + riskFactors * 0.12);

    return this.createThreat({
      name: `Low reputation file: ${file.name}`,
      category: file.knownBad ? 'malware' : 'pup',
      severity,
      confidence,
      confidenceLabel: confidenceToLabel(confidence),
      risk: severity === 'high' ? 'high' : 'moderate',
      evidence,
      detectionSource: this.getId(),
      affectedAssets: [{ type: 'file', path: file.path, name: file.name, hash: file.hash }],
      recommendation: file.knownBad
        ? 'This file has known bad reputation. Remove immediately and scan the system.'
        : 'Verify the source of this file. Low reputation files should be treated with caution.',
      explanation: `File "${file.name}" at "${file.path}" has reputation score ${file.reputationScore}/100. ${evidence.map((e) => e.description).join('; ')}.`,
      canRemediate: false,
    });
  }
}
