/**
 * ServiceAnalysisProvider — deep Windows service analysis.
 *
 * Priority: ⭐⭐⭐⭐⭐ (Persistence Detection)
 *
 * Analyzes:
 *   - Unsigned service binaries
 *   - Services running as SYSTEM with unknown publishers
 *   - Services with suspicious binary paths
 *   - Services with unexpected start types
 *   - Services from temp/appdata locations
 */
import { SecurityProvider } from './SecurityProvider';
import type {
  ProviderScanContext,
  ProviderScanResult,
  Threat,
  SecurityEvidence,
  ServiceDetail,
} from './types';
import { confidenceToLabel } from './types';

const KNOWN_SERVICE_PUBLISHERS = ['Microsoft', 'Google', 'Adobe', 'Mozilla', 'NVIDIA', 'Intel', 'Realtek', 'AVG', 'Avast'];

export class ServiceAnalysisProvider extends SecurityProvider {
  constructor() {
    super('service-analysis', 'Service Analysis Provider', 'persistence', '1.0.0',
      'Deep analysis of Windows services for persistence and privilege abuse', 36);
    this.addCapability('unsigned_service_detection');
    this.addCapability('privileged_service_analysis');
    this.addCapability('service_path_analysis');
  }

  async scan(context: ProviderScanContext): Promise<ProviderScanResult> {
    const start = Date.now();
    try {
      this.setStatus('active');
      const threats: Threat[] = [];
      const services = (context.options['services'] as ServiceDetail[] | undefined) ?? [];

      for (const svc of services) {
        const t = this.analyzeService(svc);
        if (t) threats.push(t);
      }

      const duration = Date.now() - start;
      this.markRun();
      this.setStatus('inactive');
      return this.successResult(context, threats, duration, services.length, { analyzed: services.length });
    } catch (e) {
      const duration = Date.now() - start;
      const error = e instanceof Error ? e.message : String(e);
      this.setLastError(error);
      return this.failureResult(context, error, duration);
    }
  }

  private analyzeService(svc: ServiceDetail): Threat | null {
    if (svc.publisher && KNOWN_SERVICE_PUBLISHERS.some((p) => svc.publisher!.includes(p))) return null;
    if (svc.signed && svc.publisher) return null;

    const evidence: SecurityEvidence[] = [];
    const path = svc.binaryPath.toLowerCase();

    if (!svc.signed) evidence.push({ source: this.getId(), type: 'unsigned', value: svc.binaryPath, description: 'Service binary is not digitally signed', timestamp: Date.now() });
    if (!svc.publisher) evidence.push({ source: this.getId(), type: 'unknown_publisher', value: svc.name, description: 'Service has unknown publisher', timestamp: Date.now() });
    if (path.includes('temp') || path.includes('appdata')) evidence.push({ source: this.getId(), type: 'suspicious_path', value: svc.binaryPath, description: `Service binary in suspicious location: ${svc.binaryPath}`, timestamp: Date.now() });
    if (svc.account.toLowerCase().includes('localsystem') && !svc.signed) evidence.push({ source: this.getId(), type: 'system_unsigned', value: svc.account, description: 'Unsigned service running as LocalSystem', timestamp: Date.now() });
    if (svc.startType === 'Auto' && !svc.signed && !svc.publisher) evidence.push({ source: this.getId(), type: 'auto_start', value: svc.startType, description: 'Unknown unsigned service set to auto-start', timestamp: Date.now() });

    if (evidence.length < 2) return null;

    const hasSystemUnsigned = evidence.some((e) => e.type === 'system_unsigned');
    const severity = hasSystemUnsigned ? 'high' : 'medium';
    const confidence = Math.min(0.9, 0.4 + evidence.length * 0.13);

    return this.createThreat({
      name: `Suspicious service: ${svc.displayName}`,
      category: 'suspicious_service',
      severity,
      confidence,
      confidenceLabel: confidenceToLabel(confidence),
      risk: severity === 'high' ? 'high' : 'moderate',
      evidence,
      detectionSource: this.getId(),
      affectedAssets: [{ type: 'service', path: svc.binaryPath, name: svc.name }],
      recommendation: `Review service "${svc.displayName}" (${svc.name}). Disable if unrecognized. Verify the binary path and publisher.`,
      explanation: `Service "${svc.displayName}" has ${evidence.length} suspicious indicator(s): ${evidence.map((e) => e.description).join('; ')}. Binary: ${svc.binaryPath}. Start type: ${svc.startType}. Account: ${svc.account}.`,
      mitreAttack: { tactic: 'Persistence', technique: 'Create or Modify System Process: Windows Service', reference: 'https://attack.mitre.org/techniques/T1543/003' },
      canRemediate: false,
    });
  }
}
