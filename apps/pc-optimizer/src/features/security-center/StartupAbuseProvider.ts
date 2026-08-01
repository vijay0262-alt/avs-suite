/**
 * StartupAbuseProvider — specialized startup entry abuse detection.
 *
 * Priority: ⭐⭐⭐⭐⭐ (Persistence Detection)
 *
 * Focuses specifically on startup folder and registry autostart
 * abuse patterns that PersistenceDetectionProvider covers broadly.
 * This provider adds deeper analysis of startup-specific patterns:
 *   - Startup folder file drops
 *   - RunOnce abuse
 *   - Startup folder in user profile vs all users
 *   - Suspicious command patterns in startup entries
 */
import { SecurityProvider } from './SecurityProvider';
import type {
  ProviderScanContext,
  ProviderScanResult,
  Threat,
  SecurityEvidence,
  StartupEntryDetail,
  RegistryRunKeyDetail,
} from './types';
import { confidenceToLabel } from './types';

const SUSPICIOUS_CMD_PATTERNS = ['powershell -enc', 'cmd /c', 'rundll32', 'regsvr32 /s', 'mshta', 'wscript', 'cscript'];

export class StartupAbuseProvider extends SecurityProvider {
  constructor() {
    super('startup-abuse', 'Startup Abuse Provider', 'persistence', '1.0.0',
      'Deep analysis of startup folder and registry autostart abuse patterns', 40);
    this.addCapability('startup_folder_analysis');
    this.addCapability('runonce_abuse_detection');
    this.addCapability('autostart_command_analysis');
  }

  async scan(context: ProviderScanContext): Promise<ProviderScanResult> {
    const start = Date.now();
    try {
      this.setStatus('active');
      const threats: Threat[] = [];
      const startupEntries = (context.options['startupEntries'] as StartupEntryDetail[] | undefined) ?? [];
      const runKeys = (context.options['registryRunKeys'] as RegistryRunKeyDetail[] | undefined) ?? [];

      for (const entry of startupEntries) {
        const t = this.analyzeStartupCommand(entry);
        if (t) threats.push(t);
      }
      for (const key of runKeys) {
        if (key.key.toLowerCase().includes('runonce')) {
          const t = this.analyzeRunOnce(key);
          if (t) threats.push(t);
        }
      }

      const itemsScanned = startupEntries.length + runKeys.length;
      const duration = Date.now() - start;
      this.markRun();
      this.setStatus('inactive');
      return this.successResult(context, threats, duration, itemsScanned, { analyzed: itemsScanned });
    } catch (e) {
      const duration = Date.now() - start;
      const error = e instanceof Error ? e.message : String(e);
      this.setLastError(error);
      return this.failureResult(context, error, duration);
    }
  }

  private analyzeStartupCommand(entry: StartupEntryDetail): Threat | null {
    const evidence: SecurityEvidence[] = [];
    const cmd = entry.command.toLowerCase();

    for (const pattern of SUSPICIOUS_CMD_PATTERNS) {
      if (cmd.includes(pattern)) {
        evidence.push({
          source: this.getId(),
          type: 'suspicious_command',
          value: entry.command,
          description: `Startup entry uses suspicious command pattern: ${pattern}`,
          timestamp: Date.now(),
        });
      }
    }

    if (!entry.signed) {
      evidence.push({
        source: this.getId(),
        type: 'unsigned',
        value: entry.path,
        description: 'Startup entry executable is unsigned',
        timestamp: Date.now(),
      });
    }

    if (entry.location.toLowerCase().includes('temp')) {
      evidence.push({
        source: this.getId(),
        type: 'temp_location',
        value: entry.location,
        description: 'Startup entry in temp directory',
        timestamp: Date.now(),
      });
    }

    if (evidence.length < 2) return null;

    const hasSuspiciousCmd = evidence.some((e) => e.type === 'suspicious_command');
    const severity = hasSuspiciousCmd ? 'high' : 'medium';
    const confidence = Math.min(0.9, 0.45 + evidence.length * 0.15);

    return this.createThreat({
      name: `Startup abuse: ${entry.name}`,
      category: 'suspicious_startup_entry',
      severity,
      confidence,
      confidenceLabel: confidenceToLabel(confidence),
      risk: severity === 'high' ? 'high' : 'moderate',
      evidence,
      detectionSource: this.getId(),
      affectedAssets: [{ type: 'startup_entry', path: entry.path, name: entry.name }],
      recommendation: `Review startup entry "${entry.name}". Remove if unrecognized. Check command for suspicious patterns.`,
      explanation: `Startup entry "${entry.name}" has ${evidence.length} abuse indicator(s): ${evidence.map((e) => e.description).join('; ')}.`,
      mitreAttack: { tactic: 'Persistence', technique: 'Boot or Logon Autostart Execution', reference: 'https://attack.mitre.org/techniques/T1547' },
      canRemediate: false,
    });
  }

  private analyzeRunOnce(key: RegistryRunKeyDetail): Threat | null {
    if (key.signed && key.publisher) return null;

    const evidence: SecurityEvidence[] = [
      { source: this.getId(), type: 'runonce_key', value: key.key, description: `RunOnce key detected: ${key.hive}\\${key.key}`, timestamp: Date.now() },
    ];

    if (!key.signed) evidence.push({ source: this.getId(), type: 'unsigned', value: key.data, description: 'RunOnce points to unsigned executable', timestamp: Date.now() });
    if (key.data.toLowerCase().includes('powershell') || key.data.toLowerCase().includes('cmd /c'))
      evidence.push({ source: this.getId(), type: 'suspicious_command', value: key.data, description: `RunOnce uses suspicious command: ${key.data}`, timestamp: Date.now() });

    if (evidence.length < 2) return null;

    return this.createThreat({
      name: `RunOnce abuse: ${key.value}`,
      category: 'suspicious_startup_entry',
      severity: 'medium',
      confidence: 0.7,
      confidenceLabel: confidenceToLabel(0.7),
      risk: 'moderate',
      evidence,
      detectionSource: this.getId(),
      affectedAssets: [{ type: 'registry', path: `${key.hive}\\${key.key}`, name: key.value }],
      recommendation: `Review RunOnce key "${key.value}". Remove if unrecognized.`,
      explanation: `RunOnce key "${key.value}" in ${key.hive} will execute "${key.data}" on next boot. ${evidence.map((e) => e.description).join('; ')}.`,
      mitreAttack: { tactic: 'Persistence', technique: 'Boot or Logon Autostart Execution: Registry Run Keys', reference: 'https://attack.mitre.org/techniques/T1547/001' },
      canRemediate: false,
    });
  }
}
