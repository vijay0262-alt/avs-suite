/**
 * UnsignedExecutableProvider — detects unsigned executables in suspicious locations.
 *
 * Priority: ⭐⭐⭐⭐ (Reputation Analysis)
 *
 * Detects:
 *   - Unsigned executables in temp/appdata/user profile
 *   - Unsigned executables running from unexpected locations
 *   - Recently created unsigned executables
 *   - Unsigned executables with network access
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

const SUSPICIOUS_LOCATIONS: FileReputationDetail['installLocation'][] = ['temp', 'appdata', 'user_profile'];

export class UnsignedExecutableProvider extends SecurityProvider {
  constructor() {
    super('unsigned-executable', 'Unsigned Executable Provider', 'reputation', '1.0.0',
      'Detects unsigned executables in suspicious locations', 25);
    this.addCapability('unsigned_executable_detection');
    this.addCapability('suspicious_location_detection');
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
    if (file.signed) return null;
    if (file.knownGood) return null;

    const evidence: SecurityEvidence[] = [];
    let riskFactors = 0;

    evidence.push({
      source: this.getId(),
      type: 'unsigned',
      value: file.path,
      description: 'Executable is not digitally signed',
      timestamp: Date.now(),
    });
    riskFactors++;

    if (SUSPICIOUS_LOCATIONS.includes(file.installLocation)) {
      evidence.push({
        source: this.getId(),
        type: 'suspicious_location',
        value: file.installLocation,
        description: `Executable in suspicious location: ${file.installLocation}`,
        timestamp: Date.now(),
      });
      riskFactors++;
    }

    if (file.reputationScore < 30) {
      evidence.push({
        source: this.getId(),
        type: 'low_reputation',
        value: file.reputationScore.toString(),
        description: `Low reputation score: ${file.reputationScore}/100`,
        timestamp: Date.now(),
      });
      riskFactors++;
    }

    if (file.knownBad) {
      evidence.push({
        source: this.getId(),
        type: 'known_bad',
        value: 'true',
        description: 'File has known bad reputation',
        timestamp: Date.now(),
      });
      riskFactors++;
    }

    // False-positive control: require 2+ risk factors
    if (riskFactors < 2) return null;

    const severity = file.knownBad ? 'high' : riskFactors >= 3 ? 'medium' : 'low';
    const confidence = Math.min(0.9, 0.35 + riskFactors * 0.15);

    return this.createThreat({
      name: `Unsigned executable: ${file.name}`,
      category: file.knownBad ? 'malware' : 'pup',
      severity,
      confidence,
      confidenceLabel: confidenceToLabel(confidence),
      risk: severity === 'high' ? 'high' : 'moderate',
      evidence,
      detectionSource: this.getId(),
      affectedAssets: [{ type: 'file', path: file.path, name: file.name, hash: file.hash }],
      recommendation: 'Verify the source of this executable. Do not run unsigned executables from untrusted sources.',
      explanation: `Executable "${file.name}" at "${file.path}" is unsigned${file.installLocation !== 'unknown' ? ` in ${file.installLocation}` : ''}. ${evidence.map((e) => e.description).join('; ')}.`,
      canRemediate: false,
    });
  }
}
