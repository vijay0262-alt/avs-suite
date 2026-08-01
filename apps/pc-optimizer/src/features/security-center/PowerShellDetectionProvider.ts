/**
 * PowerShellDetectionProvider — detects suspicious PowerShell usage.
 *
 * Priority: ⭐⭐⭐⭐ (Script Analysis)
 *
 * Detects:
 *   - Encoded commands (-enc, -encodedcommand)
 *   - Obfuscated scripts
 *   - Execution policy bypass (-ExecutionPolicy Bypass)
 *   - Download cradles (Invoke-WebRequest, Net.WebClient, DownloadString)
 *   - AMSI bypass attempts
 *   - Script block logging disable attempts
 *   - Suspicious cmdlets (Invoke-Expression, Start-Process -WindowStyle Hidden)
 */
import { SecurityProvider } from './SecurityProvider';
import type {
  ProviderScanContext,
  ProviderScanResult,
  Threat,
  SecurityEvidence,
  ScriptDetail,
} from './types';
import { confidenceToLabel } from './types';

const SUSPICIOUS_PATTERNS = [
  { pattern: '-enc', type: 'encoded_command', desc: 'Encoded PowerShell command', weight: 3 },
  { pattern: '-encodedcommand', type: 'encoded_command', desc: 'Encoded PowerShell command', weight: 3 },
  { pattern: 'executionpolicy bypass', type: 'policy_bypass', desc: 'Execution policy bypass', weight: 2 },
  { pattern: 'invoke-expression', type: 'invoke_expression', desc: 'Invoke-Expression usage', weight: 2 },
  { pattern: 'iex ', type: 'invoke_expression', desc: 'IEX (Invoke-Expression alias)', weight: 2 },
  { pattern: 'downloadstring', type: 'download_cradle', desc: 'DownloadString — remote script download', weight: 3 },
  { pattern: 'downloadfile', type: 'download_cradle', desc: 'DownloadFile — remote file download', weight: 3 },
  { pattern: 'net.webclient', type: 'download_cradle', desc: 'WebClient — network download', weight: 2 },
  { pattern: 'invoke-webrequest', type: 'download_cradle', desc: 'Invoke-WebRequest — remote download', weight: 1 },
  { pattern: 'iwr ', type: 'download_cradle', desc: 'IWR (Invoke-WebRequest alias)', weight: 1 },
  { pattern: 'windowstyle hidden', type: 'hidden_window', desc: 'Hidden window style', weight: 2 },
  { pattern: '-w hidden', type: 'hidden_window', desc: 'Hidden window (-w hidden)', weight: 2 },
  { pattern: 'amsiinitfailed', type: 'amsi_bypass', desc: 'AMSI bypass attempt', weight: 4 },
  { pattern: 'set-mppreference', type: 'defender_disable', desc: 'Attempt to modify Defender settings', weight: 3 },
  { pattern: 'add-mppreference', type: 'defender_modify', desc: 'Attempt to modify Defender exclusions', weight: 2 },
  { pattern: 'scriptblocklogging', type: 'logging_disable', desc: 'Attempt to disable script block logging', weight: 3 },
  { pattern: 'bypass', type: 'bypass_flag', desc: 'Bypass flag in command', weight: 1 },
];

export class PowerShellDetectionProvider extends SecurityProvider {
  constructor() {
    super('powershell-detection', 'PowerShell Detection Provider', 'behavior', '1.0.0',
      'Detects suspicious PowerShell: encoded commands, download cradles, AMSI bypass, obfuscation', 44);
    this.addCapability('encoded_command_detection');
    this.addCapability('download_cradle_detection');
    this.addCapability('amsi_bypass_detection');
    this.addCapability('execution_policy_bypass_detection');
    this.addCapability('obfuscation_detection');
  }

  async scan(context: ProviderScanContext): Promise<ProviderScanResult> {
    const start = Date.now();
    try {
      this.setStatus('active');
      const threats: Threat[] = [];
      const scripts = (context.options['scripts'] as ScriptDetail[] | undefined) ?? [];
      const psScripts = scripts.filter((s) => s.type === 'powershell');

      for (const script of psScripts) {
        const t = this.analyzePowerShell(script);
        if (t) threats.push(t);
      }

      const duration = Date.now() - start;
      this.markRun();
      this.setStatus('inactive');
      return this.successResult(context, threats, duration, psScripts.length, { analyzed: psScripts.length });
    } catch (e) {
      const duration = Date.now() - start;
      const error = e instanceof Error ? e.message : String(e);
      this.setLastError(error);
      return this.failureResult(context, error, duration);
    }
  }

  private analyzePowerShell(script: ScriptDetail): Threat | null {
    const content = script.content.toLowerCase();
    const cmdLine = (script.commandLine ?? '').toLowerCase();
    const combined = `${content} ${cmdLine}`;

    const evidence: SecurityEvidence[] = [];
    let totalWeight = 0;

    for (const { pattern, type, desc, weight } of SUSPICIOUS_PATTERNS) {
      if (combined.includes(pattern)) {
        evidence.push({
          source: this.getId(),
          type,
          value: pattern,
          description: desc,
          timestamp: script.timestamp,
        });
        totalWeight += weight;
      }
    }

    if (script.encoded) {
      evidence.push({ source: this.getId(), type: 'encoded_script', value: 'true', description: 'Script is marked as encoded', timestamp: script.timestamp });
      totalWeight += 3;
    }

    if (script.obfuscated) {
      evidence.push({ source: this.getId(), type: 'obfuscated', value: 'true', description: 'Script appears obfuscated', timestamp: script.timestamp });
      totalWeight += 2;
    }

    // False-positive control: require total weight >= 3
    if (totalWeight < 3) return null;

    const severity = totalWeight >= 8 ? 'critical' : totalWeight >= 5 ? 'high' : 'medium';
    const confidence = Math.min(0.95, 0.4 + totalWeight * 0.08);

    return this.createThreat({
      name: `Suspicious PowerShell: ${script.path.split(/[\\/]/).pop() ?? script.path}`,
      category: 'unsafe_script',
      severity,
      confidence,
      confidenceLabel: confidenceToLabel(confidence),
      risk: severity === 'critical' ? 'severe' : severity === 'high' ? 'high' : 'moderate',
      evidence,
      detectionSource: this.getId(),
      affectedAssets: [{ type: 'file', path: script.path, name: script.path.split(/[\\/]/).pop() ?? script.path }],
      recommendation: 'Investigate this PowerShell script. Do not execute if source is untrusted. Check for encoded commands and download cradles.',
      explanation: `PowerShell script "${script.path}" has ${evidence.length} suspicious indicator(s) with total risk weight ${totalWeight}: ${evidence.map((e) => e.description).join('; ')}.`,
      mitreAttack: { tactic: 'Execution', technique: 'PowerShell', reference: 'https://attack.mitre.org/techniques/T1059/001' },
      canRemediate: false,
    });
  }
}
