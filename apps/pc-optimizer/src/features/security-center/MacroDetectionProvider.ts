/**
 * MacroDetectionProvider — detects suspicious document macros.
 *
 * Priority: ⭐⭐⭐⭐ (Script Analysis)
 *
 * Detects:
 *   - Auto-open/auto-execute macros
 *   - Shell/WSH invocation from macros
 *   - Download attempts from macros
 *   - DLL loading from macros
 *   - Obfuscated macro code
 *   - Macro-enabled documents from untrusted sources
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

const MACRO_PATTERNS = [
  { pattern: 'auto_open', type: 'auto_open', desc: 'Auto_Open macro — executes on document open', weight: 3 },
  { pattern: 'autoexec', type: 'auto_exec', desc: 'AutoExec macro — executes on startup', weight: 3 },
  { pattern: 'document_open', type: 'document_open', desc: 'Document_Open event handler', weight: 2 },
  { pattern: 'workbook_open', type: 'workbook_open', desc: 'Workbook_Open event handler', weight: 2 },
  { pattern: 'shell(', type: 'shell_call', desc: 'Shell() invocation — command execution', weight: 3 },
  { pattern: 'wscript.shell', type: 'wsh_call', desc: 'WScript.Shell invocation', weight: 3 },
  { pattern: 'createobject', type: 'create_object', desc: 'CreateObject — COM object creation', weight: 2 },
  { pattern: 'downloadstring', type: 'download', desc: 'DownloadString — remote download', weight: 3 },
  { pattern: 'urldownloadtofile', type: 'download', desc: 'URLDownloadToFile — remote file download', weight: 3 },
  { pattern: 'declare', type: 'declare', desc: 'Declare statement — DLL function import', weight: 2 },
  { pattern: 'callbyname', type: 'call_by_name', desc: 'CallByName — indirect execution', weight: 2 },
  { pattern: 'environ(', type: 'environ', desc: 'Environ() — environment variable access', weight: 1 },
];

export class MacroDetectionProvider extends SecurityProvider {
  constructor() {
    super('macro-detection', 'Macro Detection Provider', 'behavior', '1.0.0',
      'Detects suspicious document macros: auto-execute, shell calls, downloads, obfuscation', 33);
    this.addCapability('auto_open_macro_detection');
    this.addCapability('macro_shell_call_detection');
    this.addCapability('macro_download_detection');
    this.addCapability('macro_obfuscation_detection');
  }

  async scan(context: ProviderScanContext): Promise<ProviderScanResult> {
    const start = Date.now();
    try {
      this.setStatus('active');
      const threats: Threat[] = [];
      const scripts = (context.options['scripts'] as ScriptDetail[] | undefined) ?? [];
      const macros = scripts.filter((s) => s.type === 'macro');

      for (const macro of macros) {
        const t = this.analyzeMacro(macro);
        if (t) threats.push(t);
      }

      const duration = Date.now() - start;
      this.markRun();
      this.setStatus('inactive');
      return this.successResult(context, threats, duration, macros.length, { analyzed: macros.length });
    } catch (e) {
      const duration = Date.now() - start;
      const error = e instanceof Error ? e.message : String(e);
      this.setLastError(error);
      return this.failureResult(context, error, duration);
    }
  }

  private analyzeMacro(macro: ScriptDetail): Threat | null {
    const content = macro.content.toLowerCase();
    const evidence: SecurityEvidence[] = [];
    let totalWeight = 0;

    for (const { pattern, type, desc, weight } of MACRO_PATTERNS) {
      if (content.includes(pattern)) {
        evidence.push({ source: this.getId(), type, value: pattern, description: desc, timestamp: macro.timestamp });
        totalWeight += weight;
      }
    }

    if (macro.obfuscated) {
      evidence.push({ source: this.getId(), type: 'obfuscated', value: 'true', description: 'Macro code appears obfuscated', timestamp: macro.timestamp });
      totalWeight += 2;
    }

    // False-positive control: require weight >= 3
    if (totalWeight < 3) return null;

    const hasAutoExec = evidence.some((e) => e.type === 'auto_open' || e.type === 'auto_exec' || e.type === 'document_open' || e.type === 'workbook_open');
    const hasShell = evidence.some((e) => e.type === 'shell_call' || e.type === 'wsh_call');
    const severity = (hasAutoExec && hasShell) ? 'high' : totalWeight >= 5 ? 'medium' : 'low';
    const confidence = Math.min(0.9, 0.35 + totalWeight * 0.1);

    return this.createThreat({
      name: `Suspicious macro: ${macro.path.split(/[\\/]/).pop() ?? macro.path}`,
      category: 'unsafe_script',
      severity,
      confidence,
      confidenceLabel: confidenceToLabel(confidence),
      risk: severity === 'high' ? 'high' : 'moderate',
      evidence,
      detectionSource: this.getId(),
      affectedAssets: [{ type: 'file', path: macro.path, name: macro.path.split(/[\\/]/).pop() ?? macro.path }],
      recommendation: 'Do not enable macros in this document. Scan the document with antivirus and verify the sender.',
      explanation: `Document macro in "${macro.path}" has ${evidence.length} suspicious indicator(s) with weight ${totalWeight}: ${evidence.map((e) => e.description).join('; ')}.`,
      mitreAttack: { tactic: 'Execution', technique: 'User Execution: Malicious File', reference: 'https://attack.mitre.org/techniques/T1204/002' },
      canRemediate: false,
    });
  }
}
