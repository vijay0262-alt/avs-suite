/**
 * ThreatIntelligenceProvider — threat intelligence correlation provider.
 *
 * Correlates detected threats with known threat intelligence data
 * including known IOCs, campaign associations, and threat actor info.
 * Enhances threat detections with additional context and confidence.
 */
import { SecurityProvider } from './SecurityProvider';
import type { ProviderScanContext, ProviderScanResult, Threat, SecurityEvidence, AffectedAsset } from './types';
import { confidenceToLabel } from './types';

export interface ThreatIntelEntry {
  ioc: string;
  iocType: 'hash' | 'ip' | 'domain' | 'url' | 'mutex';
  threatName: string;
  category: Threat['category'];
  severity: Threat['severity'];
  campaign: string | null;
  threatActor: string | null;
  firstSeen: number;
  lastSeen: number;
}

export interface ThreatIntelligenceInput {
  entries: ThreatIntelEntry[];
  targets: string[];
}

export class ThreatIntelligenceProvider extends SecurityProvider {
  constructor() {
    super(
      'threat-intel-provider',
      'Threat Intelligence Provider',
      'threat_intelligence',
      '1.0.0',
      'Correlates detections with known threat intelligence data',
      5,
    );
    this.addCapability('ioc_matching');
    this.addCapability('campaign_correlation');
    this.addCapability('threat_actor_attribution');
  }

  async scan(context: ProviderScanContext): Promise<ProviderScanResult> {
    const start = Date.now();
    try {
      this.setStatus('active');
      const threats: Threat[] = [];
      const input = context.options['threatIntelInput'] as ThreatIntelligenceInput | undefined;
      const entries = input?.entries ?? [];
      const targets = input?.targets ?? context.targets;

      for (const entry of entries) {
        if (!targets.some((t) => t.includes(entry.ioc))) continue;

        const evidence: SecurityEvidence[] = [
          {
            source: this.getId(),
            type: 'threat_intel_match',
            value: entry.ioc,
            description: `IOC match: ${entry.iocType} ${entry.ioc} — ${entry.threatName}`,
            timestamp: Date.now(),
          },
        ];

        if (entry.campaign) {
          evidence.push({
            source: this.getId(),
            type: 'campaign_correlation',
            value: entry.campaign,
            description: `Associated with campaign: ${entry.campaign}`,
            timestamp: Date.now(),
          });
        }

        if (entry.threatActor) {
          evidence.push({
            source: this.getId(),
            type: 'threat_actor',
            value: entry.threatActor,
            description: `Attributed to threat actor: ${entry.threatActor}`,
            timestamp: Date.now(),
          });
        }

        const assets: AffectedAsset[] = [{
          type: 'file',
          path: targets.find((t) => t.includes(entry.ioc)) ?? entry.ioc,
          name: entry.threatName,
        }];

        const confidence = 0.9;
        threats.push(this.createThreat({
          name: entry.threatName,
          category: entry.category,
          severity: entry.severity,
          confidence,
          confidenceLabel: confidenceToLabel(confidence),
          risk: entry.severity === 'critical' ? 'severe' : entry.severity === 'high' ? 'high' : 'moderate',
          evidence,
          detectionSource: this.getId(),
          affectedAssets: assets,
          recommendation: 'This item matches known threat intelligence. Review and take appropriate action.',
          explanation: `IOC "${entry.ioc}" (${entry.iocType}) matches known threat "${entry.threatName}"${entry.campaign ? ` from campaign "${entry.campaign}"` : ''}${entry.threatActor ? ` attributed to "${entry.threatActor}"` : ''}. First seen: ${new Date(entry.firstSeen).toISOString()}.`,
          mitreAttack: {
            tactic: 'Reconnaissance',
            technique: 'Active Scanning',
            reference: 'https://attack.mitre.org/tactics/TA0043',
          },
          canRemediate: false,
        }));
      }

      const itemsScanned = targets.length;
      const duration = Date.now() - start;
      this.markRun();
      this.setStatus('active');
      return this.successResult(context, threats, duration, itemsScanned, { iocsMatched: threats.length });
    } catch (e) {
      const duration = Date.now() - start;
      const error = e instanceof Error ? e.message : String(e);
      this.setLastError(error);
      return this.failureResult(context, error, duration);
    }
  }
}
