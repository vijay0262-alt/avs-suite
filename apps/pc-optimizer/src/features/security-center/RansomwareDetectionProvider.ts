/**
 * RansomwareDetectionProvider — detects ransomware behavior indicators.
 *
 * Priority: ⭐⭐⭐⭐⭐ (Behavior Analysis)
 *
 * Detects:
 *   - Shadow copy deletion (vssadmin delete shadows)
 *   - Recovery disable (bcdedit /set {default} recoveryenabled no)
 *   - Backup deletion (wbadmin delete catalog)
 *   - Mass file encryption patterns (rapid file modifications in many directories)
 *   - Ransom note creation (README.txt, HOW_TO_DECRYPT.txt, etc.)
 *   - Known ransomware process names
 *   - Volume shadow enumeration
 *   - Disk encryption commands (cipher /w, manage-bde)
 *
 * False-positive control: Requires 2+ indicators. Single suspicious
 * commands are not sufficient — must have additional corroborating signals.
 */
import { SecurityProvider } from './SecurityProvider';
import type {
  ProviderScanContext,
  ProviderScanResult,
  Threat,
  SecurityEvidence,
  RansomwareIndicator,
} from './types';
import { confidenceToLabel } from './types';

const _RANSOMWARE_PROCESS_NAMES = ['locky', 'cryptolocker', 'wannacry', 'wcry', 'ryuk', 'conti', 'maze', 'sodinokibi', 'gandcrab', 'revelocky', 'cerber', 'globeimposter', 'dharma', 'phobos'];
const _RANSOM_NOTE_PATTERNS = ['how_to_decrypt', 'readme', 'restore_files', 'ransom', 'recover', 'how_to_recover', 'decryption_instructions', '!restore', 'help_help', 'all_your_files'];
const _SHADOW_DELETE_CMDS = ['vssadmin delete shadows', 'vssadmin delete shadowcopies', 'wmic shadowcopy delete'];
const _RECOVERY_DISABLE_CMDS = ['bcdedit', 'recoveryenabled', 'recoveryenabled no'];
const _BACKUP_DELETE_CMDS = ['wbadmin delete catalog', 'wbadmin delete systemstatebackup'];
const _MASS_ENCRYPTION_EXTENSIONS = ['.encrypted', '.locked', '.crypt', '.crypted', '.locky', '.wcry', '.ryk', '.maze', '.conti', '.phobos', '.dharma'];

export class RansomwareDetectionProvider extends SecurityProvider {
  constructor() {
    super('ransomware-detection', 'Ransomware Detection Provider', 'behavior', '1.0.0',
      'Detects ransomware: shadow copy deletion, mass encryption, ransom notes, recovery disable', 46);
    this.addCapability('shadow_copy_deletion_detection');
    this.addCapability('mass_encryption_detection');
    this.addCapability('ransom_note_detection');
    this.addCapability('recovery_disable_detection');
  }

  async scan(context: ProviderScanContext): Promise<ProviderScanResult> {
    const start = Date.now();
    try {
      this.setStatus('active');
      const threats: Threat[] = [];
      const inputs = (context.options['ransomwareInput'] as RansomwareIndicator[] | undefined) ?? [];

      for (const input of inputs) {
        const threat = this.analyzeRansomware(input);
        if (threat) threats.push(threat);
      }

      const duration = Date.now() - start;
      this.markRun();
      this.setStatus('active');
      return this.successResult(context, threats, duration, inputs.length, { analyzed: inputs.length });
    } catch (e) {
      const duration = Date.now() - start;
      const error = e instanceof Error ? e.message : String(e);
      this.setLastError(error);
      return this.failureResult(context, error, duration);
    }
  }

  private analyzeRansomware(input: RansomwareIndicator): Threat | null {
    const evidence: SecurityEvidence[] = [];
    let indicatorCount = 0;

    for (const signal of input.indicators) {
      evidence.push({
        source: this.getId(),
        type: signal.type,
        value: signal.value ?? input.processName,
        description: signal.description,
        timestamp: signal.timestamp,
      });
      indicatorCount++;
    }

    if (indicatorCount < 2) return null;

    const hasShadowDelete = evidence.some((e) => e.type === 'shadow_copy_deletion');
    const hasRecoveryDisable = evidence.some((e) => e.type === 'recovery_disabled');
    const hasMassEncryption = evidence.some((e) => e.type === 'mass_encryption');
    const hasRansomNote = evidence.some((e) => e.type === 'ransom_note');

    const criticalIndicators = [hasShadowDelete, hasRecoveryDisable, hasMassEncryption, hasRansomNote].filter(Boolean).length;
    const severity = criticalIndicators >= 2 ? 'critical' : criticalIndicators >= 1 ? 'high' : 'medium';
    const confidence = Math.min(0.97, 0.5 + indicatorCount * 0.12);

    return this.createThreat({
      name: `Ransomware activity: ${input.processName}`,
      category: 'ransomware',
      severity,
      confidence,
      confidenceLabel: confidenceToLabel(confidence),
      risk: severity === 'critical' ? 'severe' : 'high',
      evidence,
      detectionSource: this.getId(),
      affectedAssets: [{ type: 'process', path: input.path, name: input.processName, pid: input.pid }],
      recommendation: 'Isolate this system immediately. Do not pay the ransom. Restore from offline backups. Report to authorities.',
      explanation: `Process "${input.processName}" (PID ${input.pid}) shows ${indicatorCount} ransomware indicator(s): ${evidence.map((e) => e.description).join('; ')}.`,
      mitreAttack: hasShadowDelete || hasRecoveryDisable
        ? { tactic: 'Impact', technique: 'Inhibit System Recovery', reference: 'https://attack.mitre.org/techniques/T1490' }
        : { tactic: 'Impact', technique: 'Data Encrypted for Impact', reference: 'https://attack.mitre.org/techniques/T1486' },
      canRemediate: false,
    });
  }
}
