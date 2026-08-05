/**
 * ScriptDetectionProvider — detects suspicious scripts (VBScript, JS, Batch).
 *
 * Priority: ⭐⭐⭐⭐ (Script Analysis)
 *
 * Detects:
 *   - VBScript abuse (WScript.Shell, ActiveX, downloads)
 *   - JavaScript launchers (WScript, CScript, ActiveX)
 *   - Batch file abuse (cmd /c, registry mods, service creation)
 *   - Obfuscated scripts
 *   - Scripts executing from temp/appdata
 *   - Scripts downloading and executing payloads
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

const VBS_PATTERNS = [
  { pattern: 'createobject("wscript.shell")', type: 'wsh_shell', desc: 'WScript.Shell — command execution', weight: 3 },
  { pattern: 'createobject("scripting.filesystemobject")', type: 'fso', desc: 'FileSystemObject — file system access', weight: 2 },
  { pattern: 'createobject("msxml2.xmlhttp")', type: 'xmlhttp', desc: 'XMLHTTP — network request', weight: 2 },
  { pattern: 'createobject("adodb.stream")', type: 'adodb', desc: 'ADODB.Stream — binary write', weight: 3 },
  { pattern: 'shell.application', type: 'shell_app', desc: 'Shell.Application — execution', weight: 3 },
  { pattern: 'environ("temp")', type: 'temp_env', desc: 'Temp directory access', weight: 1 },
];

const JS_PATTERNS = [
  { pattern: 'wscript.shell', type: 'wsh_shell', desc: 'WScript.Shell — command execution', weight: 3 },
  { pattern: 'activexobject', type: 'activex', desc: 'ActiveXObject — COM instantiation', weight: 2 },
  { pattern: 'scripting.filesystemobject', type: 'fso', desc: 'FileSystemObject — file system access', weight: 2 },
  { pattern: 'msxml2.xmlhttp', type: 'xmlhttp', desc: 'XMLHTTP — network request', weight: 2 },
  { pattern: 'eval(', type: 'eval', desc: 'eval() — dynamic code execution', weight: 2 },
  { pattern: 'fromcharcode', type: 'from_charcode', desc: 'String.fromCharCode — possible obfuscation', weight: 2 },
];

const BATCH_PATTERNS = [
  { pattern: 'reg add', type: 'reg_add', desc: 'Registry modification via reg add', weight: 2 },
  { pattern: 'reg delete', type: 'reg_delete', desc: 'Registry deletion via reg delete', weight: 3 },
  { pattern: 'sc create', type: 'service_create', desc: 'Service creation via sc create', weight: 3 },
  { pattern: 'sc config', type: 'service_config', desc: 'Service modification via sc config', weight: 2 },
  { pattern: 'net user', type: 'net_user', desc: 'User account manipulation', weight: 3 },
  { pattern: 'net localgroup', type: 'net_localgroup', desc: 'Local group manipulation', weight: 3 },
  { pattern: 'powershell', type: 'ps_call', desc: 'PowerShell invocation from batch', weight: 2 },
  { pattern: 'bitsadmin', type: 'bitsadmin', desc: 'BITSAdmin — background download', weight: 3 },
  { pattern: 'certutil', type: 'certutil', desc: 'CertUtil — possible decode/download', weight: 3 },
  { pattern: 'mshta', type: 'mshta', desc: 'MSHTA — HTA application execution', weight: 3 },
];

export class ScriptDetectionProvider extends SecurityProvider {
  constructor() {
    super('script-detection', 'Script Detection Provider', 'behavior', '1.0.0',
      'Detects suspicious VBScript, JavaScript, and batch file abuse', 32);
    this.addCapability('vbscript_abuse_detection');
    this.addCapability('javascript_launcher_detection');
    this.addCapability('batch_abuse_detection');
    this.addCapability('script_obfuscation_detection');
  }

  async scan(context: ProviderScanContext): Promise<ProviderScanResult> {
    const start = Date.now();
    try {
      this.setStatus('active');
      const threats: Threat[] = [];
      const scripts = (context.options['scripts'] as ScriptDetail[] | undefined) ?? [];
      const targetScripts = scripts.filter((s) => s.type === 'vbscript' || s.type === 'javascript' || s.type === 'batch');

      for (const script of targetScripts) {
        const t = this.analyzeScript(script);
        if (t) threats.push(t);
      }

      const duration = Date.now() - start;
      this.markRun();
      this.setStatus('active');
      return this.successResult(context, threats, duration, targetScripts.length, { analyzed: targetScripts.length });
    } catch (e) {
      const duration = Date.now() - start;
      const error = e instanceof Error ? e.message : String(e);
      this.setLastError(error);
      return this.failureResult(context, error, duration);
    }
  }

  private analyzeScript(script: ScriptDetail): Threat | null {
    const content = script.content.toLowerCase();
    const evidence: SecurityEvidence[] = [];
    let totalWeight = 0;

    let patterns: typeof VBS_PATTERNS;
    let scriptType: string;

    switch (script.type) {
      case 'vbscript': patterns = VBS_PATTERNS; scriptType = 'VBScript'; break;
      case 'javascript': patterns = JS_PATTERNS; scriptType = 'JavaScript'; break;
      case 'batch': patterns = BATCH_PATTERNS; scriptType = 'Batch'; break;
      default: return null;
    }

    for (const { pattern, type, desc, weight } of patterns) {
      if (content.includes(pattern)) {
        evidence.push({ source: this.getId(), type, value: pattern, description: desc, timestamp: script.timestamp });
        totalWeight += weight;
      }
    }

    if (script.obfuscated) {
      evidence.push({ source: this.getId(), type: 'obfuscated', value: 'true', description: 'Script appears obfuscated', timestamp: script.timestamp });
      totalWeight += 2;
    }

    if (script.path.toLowerCase().includes('temp') || script.path.toLowerCase().includes('appdata')) {
      evidence.push({ source: this.getId(), type: 'temp_location', value: script.path, description: 'Script executing from temp/appdata', timestamp: script.timestamp });
      totalWeight += 1;
    }

    if (totalWeight < 3) return null;

    const severity = totalWeight >= 6 ? 'high' : totalWeight >= 4 ? 'medium' : 'low';
    const confidence = Math.min(0.9, 0.35 + totalWeight * 0.1);

    return this.createThreat({
      name: `Suspicious ${scriptType}: ${script.path.split(/[\\/]/).pop() ?? script.path}`,
      category: 'unsafe_script',
      severity,
      confidence,
      confidenceLabel: confidenceToLabel(confidence),
      risk: severity === 'high' ? 'high' : 'moderate',
      evidence,
      detectionSource: this.getId(),
      affectedAssets: [{ type: 'file', path: script.path, name: script.path.split(/[\\/]/).pop() ?? script.path }],
      recommendation: `Do not execute this ${scriptType} file. Investigate the source and verify intent.`,
      explanation: `${scriptType} file "${script.path}" has ${evidence.length} suspicious indicator(s) with weight ${totalWeight}: ${evidence.map((e) => e.description).join('; ')}.`,
      mitreAttack: { tactic: 'Execution', technique: 'Command and Scripting Interpreter', reference: 'https://attack.mitre.org/techniques/T1059' },
      canRemediate: false,
    });
  }
}
