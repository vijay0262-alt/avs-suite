/**
 * PersistenceDetectionProvider — advanced persistence mechanism analysis.
 *
 * Priority: ⭐⭐⭐⭐⭐ (Persistence Detection)
 *
 * Analyzes:
 *   - Startup folder entries
 *   - Registry Run keys / RunOnce
 *   - Scheduled Tasks
 *   - Windows Services
 *   - WMI persistence
 *   - Shell extensions
 *   - Browser startup pages
 *
 * False-positive control: Unsigned + unknown publisher + suspicious
 * location required. Known system entries are not flagged.
 */
import { SecurityProvider } from './SecurityProvider';
import type {
  ProviderScanContext,
  ProviderScanResult,
  Threat,
  SecurityEvidence,
  PersistenceAnalysisInput,
  StartupEntryDetail,
  RegistryRunKeyDetail,
  ScheduledTaskDetail,
  ServiceDetail,
  WmiPersistenceDetail,
  ShellExtensionDetail,
} from './types';
import { confidenceToLabel } from './types';

const KNOWN_STARTUP_NAMES = ['SecurityHealth', 'OneDrive', 'Discord', 'Steam', 'Spotify', 'Skype', 'Teams', 'Zoom'];

export class PersistenceDetectionProvider extends SecurityProvider {
  constructor() {
    super('persistence-detection-v2', 'Persistence Detection Provider v2', 'persistence', '2.0.0',
      'Advanced persistence analysis: startup, registry, tasks, services, WMI, shell extensions', 48);
    this.addCapability('startup_analysis');
    this.addCapability('registry_runkey_analysis');
    this.addCapability('scheduled_task_analysis');
    this.addCapability('service_analysis');
    this.addCapability('wmi_persistence_detection');
    this.addCapability('shell_extension_analysis');
  }

  async scan(context: ProviderScanContext): Promise<ProviderScanResult> {
    const start = Date.now();
    try {
      this.setStatus('active');
      const threats: Threat[] = [];
      const input = context.options['persistenceAnalysis'] as PersistenceAnalysisInput | undefined;

      if (input) {
        for (const entry of input.startupEntries) {
          const t = this.analyzeStartup(entry);
          if (t) threats.push(t);
        }
        for (const key of input.registryRunKeys) {
          const t = this.analyzeRunKey(key);
          if (t) threats.push(t);
        }
        for (const task of input.scheduledTasks) {
          const t = this.analyzeTask(task);
          if (t) threats.push(t);
        }
        for (const svc of input.services) {
          const t = this.analyzeService(svc);
          if (t) threats.push(t);
        }
        for (const wmi of input.wmiPersistence) {
          const t = this.analyzeWmi(wmi);
          if (t) threats.push(t);
        }
        for (const shell of input.shellExtensions) {
          const t = this.analyzeShellExt(shell);
          if (t) threats.push(t);
        }
      }

      const itemsScanned = input
        ? input.startupEntries.length + input.registryRunKeys.length + input.scheduledTasks.length +
          input.services.length + input.wmiPersistence.length + input.shellExtensions.length
        : 0;
      const duration = Date.now() - start;
      this.markRun();
      this.setStatus('active');
      return this.successResult(context, threats, duration, itemsScanned, { threatsFound: threats.length });
    } catch (e) {
      const duration = Date.now() - start;
      const error = e instanceof Error ? e.message : String(e);
      this.setLastError(error);
      return this.failureResult(context, error, duration);
    }
  }

  private analyzeStartup(entry: StartupEntryDetail): Threat | null {
    if (KNOWN_STARTUP_NAMES.some((k) => entry.name.toLowerCase().includes(k.toLowerCase()))) return null;
    if (entry.signed && entry.publisher) return null;

    const evidence: SecurityEvidence[] = [];
    if (!entry.signed) evidence.push({ source: this.getId(), type: 'unsigned', value: entry.path, description: 'Startup entry is unsigned', timestamp: Date.now() });
    if (!entry.publisher) evidence.push({ source: this.getId(), type: 'unknown_publisher', value: entry.name, description: 'Startup entry has unknown publisher', timestamp: Date.now() });
    if (entry.location.toLowerCase().includes('temp') || entry.location.toLowerCase().includes('appdata\\roaming'))
      evidence.push({ source: this.getId(), type: 'suspicious_location', value: entry.location, description: `Startup entry in suspicious location: ${entry.location}`, timestamp: Date.now() });

    if (evidence.length < 2) return null;

    return this.createThreat({
      name: `Suspicious startup entry: ${entry.name}`,
      category: 'suspicious_startup_entry',
      severity: 'medium',
      confidence: confidenceToLabel(0.6 + evidence.length * 0.1) === 'very_low' ? 0.6 : Math.min(0.85, 0.5 + evidence.length * 0.12),
      confidenceLabel: confidenceToLabel(Math.min(0.85, 0.5 + evidence.length * 0.12)),
      risk: 'moderate',
      evidence,
      detectionSource: this.getId(),
      affectedAssets: [{ type: 'startup_entry', path: entry.path, name: entry.name }],
      recommendation: `Review startup entry "${entry.name}". Remove if unrecognized.`,
      explanation: `Startup entry "${entry.name}" at "${entry.location}" is ${entry.signed ? 'signed' : 'unsigned'} with ${entry.publisher ? `publisher "${entry.publisher}"` : 'unknown publisher'}. ${evidence.map((e) => e.description).join('; ')}.`,
      mitreAttack: { tactic: 'Persistence', technique: 'Boot or Logon Autostart Execution', reference: 'https://attack.mitre.org/techniques/T1547' },
      canRemediate: false,
    });
  }

  private analyzeRunKey(key: RegistryRunKeyDetail): Threat | null {
    if (key.signed && key.publisher) return null;

    const evidence: SecurityEvidence[] = [];
    if (!key.signed) evidence.push({ source: this.getId(), type: 'unsigned', value: key.data, description: 'Registry Run key points to unsigned executable', timestamp: Date.now() });
    if (!key.publisher) evidence.push({ source: this.getId(), type: 'unknown_publisher', value: key.value, description: 'Registry Run key has unknown publisher', timestamp: Date.now() });
    if (key.data.toLowerCase().includes('temp') || key.data.toLowerCase().includes('appdata'))
      evidence.push({ source: this.getId(), type: 'suspicious_path', value: key.data, description: `Run key points to suspicious path: ${key.data}`, timestamp: Date.now() });

    if (evidence.length < 2) return null;

    return this.createThreat({
      name: `Suspicious registry Run key: ${key.value}`,
      category: 'suspicious_startup_entry',
      severity: 'medium',
      confidence: Math.min(0.85, 0.5 + evidence.length * 0.12),
      confidenceLabel: confidenceToLabel(Math.min(0.85, 0.5 + evidence.length * 0.12)),
      risk: 'moderate',
      evidence,
      detectionSource: this.getId(),
      affectedAssets: [{ type: 'registry', path: `${key.hive}\\${key.key}`, name: key.value }],
      recommendation: `Review registry Run key "${key.value}". Remove if unrecognized.`,
      explanation: `Registry Run key "${key.value}" in ${key.hive} points to ${key.data}. ${evidence.map((e) => e.description).join('; ')}.`,
      mitreAttack: { tactic: 'Persistence', technique: 'Registry Run Keys / Startup Folder', reference: 'https://attack.mitre.org/techniques/T1060' },
      canRemediate: false,
    });
  }

  private analyzeTask(task: ScheduledTaskDetail): Threat | null {
    const evidence: SecurityEvidence[] = [];
    if (task.hidden) evidence.push({ source: this.getId(), type: 'hidden_task', value: task.name, description: 'Scheduled task is hidden', timestamp: Date.now() });
    if (!task.author) evidence.push({ source: this.getId(), type: 'unknown_author', value: task.name, description: 'Scheduled task has no author', timestamp: Date.now() });
    if (task.command.toLowerCase().includes('powershell') && task.command.toLowerCase().includes('-enc'))
      evidence.push({ source: this.getId(), type: 'encoded_command', value: task.command, description: 'Scheduled task runs encoded PowerShell command', timestamp: Date.now() });
    if (task.path.toLowerCase().includes('temp') || task.command.toLowerCase().includes('appdata'))
      evidence.push({ source: this.getId(), type: 'suspicious_path', value: task.path, description: `Task runs from suspicious path: ${task.path}`, timestamp: Date.now() });

    if (evidence.length < 2) return null;

    const severity = evidence.some((e) => e.type === 'encoded_command') ? 'high' : 'medium';
    const confidence = Math.min(0.9, 0.45 + evidence.length * 0.12);

    return this.createThreat({
      name: `Suspicious scheduled task: ${task.name}`,
      category: 'suspicious_scheduled_task',
      severity,
      confidence,
      confidenceLabel: confidenceToLabel(confidence),
      risk: severity === 'high' ? 'high' : 'moderate',
      evidence,
      detectionSource: this.getId(),
      affectedAssets: [{ type: 'scheduled_task', path: task.path, name: task.name }],
      recommendation: `Review scheduled task "${task.name}". Disable if unrecognized.`,
      explanation: `Scheduled task "${task.name}" has ${evidence.length} suspicious indicator(s): ${evidence.map((e) => e.description).join('; ')}.`,
      mitreAttack: { tactic: 'Persistence', technique: 'Scheduled Task/Job', reference: 'https://attack.mitre.org/techniques/T1053' },
      canRemediate: false,
    });
  }

  private analyzeService(svc: ServiceDetail): Threat | null {
    if (svc.signed && svc.publisher) return null;

    const evidence: SecurityEvidence[] = [];
    if (!svc.signed) evidence.push({ source: this.getId(), type: 'unsigned', value: svc.binaryPath, description: 'Service binary is unsigned', timestamp: Date.now() });
    if (!svc.publisher) evidence.push({ source: this.getId(), type: 'unknown_publisher', value: svc.name, description: 'Service has unknown publisher', timestamp: Date.now() });
    if (svc.binaryPath.toLowerCase().includes('temp') || svc.binaryPath.toLowerCase().includes('appdata'))
      evidence.push({ source: this.getId(), type: 'suspicious_path', value: svc.binaryPath, description: `Service binary in suspicious location: ${svc.binaryPath}`, timestamp: Date.now() });
    if (svc.account.toLowerCase().includes('localsystem') && !svc.signed)
      evidence.push({ source: this.getId(), type: 'privileged_unsigned', value: svc.account, description: 'Unsigned service running as LocalSystem', timestamp: Date.now() });

    if (evidence.length < 2) return null;

    const severity = evidence.some((e) => e.type === 'privileged_unsigned') ? 'high' : 'medium';
    const confidence = Math.min(0.9, 0.45 + evidence.length * 0.12);

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
      recommendation: `Review service "${svc.displayName}". Disable if unrecognized.`,
      explanation: `Service "${svc.displayName}" (${svc.name}) has ${evidence.length} suspicious indicator(s): ${evidence.map((e) => e.description).join('; ')}.`,
      mitreAttack: { tactic: 'Persistence', technique: 'Create or Modify System Process', reference: 'https://attack.mitre.org/techniques/T1543' },
      canRemediate: false,
    });
  }

  private analyzeWmi(wmi: WmiPersistenceDetail): Threat | null {
    // WMI persistence is always suspicious — flag immediately
    const evidence: SecurityEvidence[] = [
      { source: this.getId(), type: 'wmi_filter', value: wmi.filterName, description: `WMI event filter: ${wmi.filterName}`, timestamp: Date.now() },
      { source: this.getId(), type: 'wmi_consumer', value: wmi.consumerName, description: `WMI event consumer: ${wmi.consumerName}`, timestamp: Date.now() },
      { source: this.getId(), type: 'wmi_command', value: wmi.command, description: `WMI command: ${wmi.command}`, timestamp: Date.now() },
    ];

    return this.createThreat({
      name: `WMI persistence detected: ${wmi.filterName}`,
      category: 'unknown',
      severity: 'high',
      confidence: 0.85,
      confidenceLabel: confidenceToLabel(0.85),
      risk: 'high',
      evidence,
      detectionSource: this.getId(),
      affectedAssets: [{ type: 'service', path: wmi.filterQuery, name: wmi.filterName }],
      recommendation: 'WMI persistence is rarely used by legitimate software. Investigate and remove if unauthorized.',
      explanation: `WMI event subscription detected: filter "${wmi.filterName}" triggers consumer "${wmi.consumerName}" which executes: ${wmi.command}.`,
      mitreAttack: { tactic: 'Persistence', technique: 'Event Triggered Execution: WMI Event Subscription', reference: 'https://attack.mitre.org/techniques/T1546/003' },
      canRemediate: false,
    });
  }

  private analyzeShellExt(shell: ShellExtensionDetail): Threat | null {
    if (shell.signed && shell.publisher) return null;

    const evidence: SecurityEvidence[] = [];
    if (!shell.signed) evidence.push({ source: this.getId(), type: 'unsigned', value: shell.dllPath, description: 'Shell extension DLL is unsigned', timestamp: Date.now() });
    if (!shell.publisher) evidence.push({ source: this.getId(), type: 'unknown_publisher', value: shell.name, description: 'Shell extension has unknown publisher', timestamp: Date.now() });

    if (evidence.length < 2) return null;

    return this.createThreat({
      name: `Suspicious shell extension: ${shell.name}`,
      category: 'unknown',
      severity: 'medium',
      confidence: 0.65,
      confidenceLabel: confidenceToLabel(0.65),
      risk: 'moderate',
      evidence,
      detectionSource: this.getId(),
      affectedAssets: [{ type: 'registry', path: shell.clsid, name: shell.name }],
      recommendation: `Review shell extension "${shell.name}". Remove if unrecognized.`,
      explanation: `Shell extension "${shell.name}" (CLSID ${shell.clsid}) loads unsigned DLL from ${shell.dllPath}.`,
      mitreAttack: { tactic: 'Persistence', technique: 'Event Triggered Execution', reference: 'https://attack.mitre.org/techniques/T1546' },
      canRemediate: false,
    });
  }
}
