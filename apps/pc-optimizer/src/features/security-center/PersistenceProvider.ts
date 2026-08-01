/**
 * PersistenceProvider — persistence mechanism detection provider.
 *
 * Detects suspicious scheduled tasks, services, startup entries,
 * and registry persistence mechanisms used by threats to maintain
 * presence on the system.
 */
import { SecurityProvider } from './SecurityProvider';
import type { ProviderScanContext, ProviderScanResult, Threat, SecurityEvidence, AffectedAsset } from './types';
import { confidenceToLabel } from './types';

export interface PersistenceEntry {
  type: 'scheduled_task' | 'service' | 'startup_entry' | 'registry';
  name: string;
  path: string;
  command: string;
  suspicious: boolean;
  reasons: string[];
}

export interface PersistenceDetectionInput {
  entries: PersistenceEntry[];
}

export class PersistenceProvider extends SecurityProvider {
  constructor() {
    super(
      'persistence-provider',
      'Persistence Detection Provider',
      'persistence',
      '1.0.0',
      'Detects suspicious persistence mechanisms (scheduled tasks, services, startup entries)',
      15,
    );
    this.addCapability('scheduled_task_analysis');
    this.addCapability('service_analysis');
    this.addCapability('startup_entry_analysis');
    this.addCapability('registry_persistence_detection');
  }

  async scan(context: ProviderScanContext): Promise<ProviderScanResult> {
    const start = Date.now();
    try {
      this.setStatus('active');
      const threats: Threat[] = [];
      const input = context.options['persistenceInput'] as PersistenceDetectionInput | undefined;
      const entries = input?.entries ?? [];

      for (const entry of entries) {
        if (!entry.suspicious) continue;

        const evidence: SecurityEvidence[] = entry.reasons.map((reason) => ({
          source: this.getId(),
          type: 'persistence_indicator',
          value: entry.name,
          description: reason,
          timestamp: Date.now(),
        }));

        const assetType: AffectedAsset['type'] =
          entry.type === 'scheduled_task' ? 'scheduled_task' :
          entry.type === 'service' ? 'service' :
          entry.type === 'startup_entry' ? 'startup_entry' :
          'registry';

        const assets: AffectedAsset[] = [{
          type: assetType,
          path: entry.path,
          name: entry.name,
        }];

        const category = entry.type === 'scheduled_task' ? 'suspicious_scheduled_task' :
          entry.type === 'service' ? 'suspicious_service' :
          entry.type === 'startup_entry' ? 'suspicious_startup_entry' :
          'unknown';

        const confidence = Math.min(0.9, 0.5 + entry.reasons.length * 0.1);
        threats.push(this.createThreat({
          name: `Suspicious ${entry.type.replace(/_/g, ' ')}: ${entry.name}`,
          category,
          severity: entry.reasons.length > 3 ? 'high' : 'medium',
          confidence,
          confidenceLabel: confidenceToLabel(confidence),
          risk: entry.reasons.length > 3 ? 'high' : 'moderate',
          evidence,
          detectionSource: this.getId(),
          affectedAssets: assets,
          recommendation: `Review the ${entry.type.replace(/_/g, ' ')} "${entry.name}" and remove if unauthorized.`,
          explanation: `Suspicious ${entry.type.replace(/_/g, ' ')} detected: ${entry.name}. Command: ${entry.command}. Reasons: ${entry.reasons.join(', ')}.`,
          mitreAttack: {
            tactic: 'Persistence',
            technique: entry.type === 'scheduled_task' ? 'Scheduled Task/Job' : entry.type === 'service' ? 'Create or Modify System Process' : 'Boot or Logon Autostart Execution',
            reference: 'https://attack.mitre.org/tactics/TA0003',
          },
          reversible: true,
          canRemediate: false,
        }));
      }

      const itemsScanned = entries.length;
      const duration = Date.now() - start;
      this.markRun();
      this.setStatus('inactive');
      return this.successResult(context, threats, duration, itemsScanned, { entriesScanned: entries.length });
    } catch (e) {
      const duration = Date.now() - start;
      const error = e instanceof Error ? e.message : String(e);
      this.setLastError(error);
      return this.failureResult(context, error, duration);
    }
  }
}
