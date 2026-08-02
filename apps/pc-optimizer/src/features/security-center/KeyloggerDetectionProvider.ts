/**
 * KeyloggerDetectionProvider — detects keylogger behavior indicators.
 *
 * Priority: ⭐⭐⭐⭐⭐ (Behavior Analysis)
 *
 * Detects:
 *   - Keyboard hook APIs (SetWindowsHookEx, GetAsyncKeyState, GetKeyboardState)
 *   - Keylogging-related process names
 *   - Log file creation in suspicious locations
 *   - Clipboard monitoring combined with keyboard hooks
 *   - Input capture from non-interactive processes
 *   - Suspicious DLL injection into input-handling processes
 *
 * False-positive control: Requires 2+ indicators. Single API
 * calls are not sufficient — must have corroborating signals.
 */
import { SecurityProvider } from './SecurityProvider';
import type {
  ProviderScanContext,
  ProviderScanResult,
  Threat,
  SecurityEvidence,
  KeyloggerIndicator,
} from './types';
import { confidenceToLabel } from './types';

const KNOWN_KEYLOGGER_NAMES = ['keylog', 'keylogger', 'keystroke', 'keycapture', 'keyspy', 'keytrap', 'spytector', 'refog', 'ardamax', 'actualspy', 'spytector', 'revealer'];

export class KeyloggerDetectionProvider extends SecurityProvider {
  constructor() {
    super('keylogger-detection', 'Keylogger Detection Provider', 'behavior', '1.0.0',
      'Detects keyloggers: keyboard hooks, input capture, log files, known keylogger names', 42);
    this.addCapability('keyboard_hook_detection');
    this.addCapability('input_capture_detection');
    this.addCapability('keylogger_process_detection');
  }

  async scan(context: ProviderScanContext): Promise<ProviderScanResult> {
    const start = Date.now();
    try {
      this.setStatus('active');
      const threats: Threat[] = [];
      const inputs = (context.options['keyloggerInput'] as KeyloggerIndicator[] | undefined) ?? [];

      for (const input of inputs) {
        const threat = this.analyzeKeylogger(input);
        if (threat) threats.push(threat);
      }

      const duration = Date.now() - start;
      this.markRun();
      this.setStatus('inactive');
      return this.successResult(context, threats, duration, inputs.length, { analyzed: inputs.length });
    } catch (e) {
      const duration = Date.now() - start;
      const error = e instanceof Error ? e.message : String(e);
      this.setLastError(error);
      return this.failureResult(context, error, duration);
    }
  }

  private analyzeKeylogger(input: KeyloggerIndicator): Threat | null {
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

    const hasKeyboardHook = evidence.some((e) => e.type === 'keyboard_hook');
    const hasClipboardMonitoring = evidence.some((e) => e.type === 'clipboard_monitoring');
    const hasLogCreation = evidence.some((e) => e.type === 'log_file_creation');
    const hasKnownName = evidence.some((e) => e.type === 'known_keylogger_name');

    const highSeverityIndicators = [hasKeyboardHook && hasClipboardMonitoring, hasKnownName && hasKeyboardHook, hasLogCreation && hasKeyboardHook].filter(Boolean).length;
    const severity = highSeverityIndicators >= 2 ? 'high' : 'medium';
    const confidence = Math.min(0.92, 0.4 + indicatorCount * 0.13);

    return this.createThreat({
      name: `Keylogger detected: ${input.processName}`,
      category: 'keylogger',
      severity,
      confidence,
      confidenceLabel: confidenceToLabel(confidence),
      risk: severity === 'high' ? 'high' : 'moderate',
      evidence,
      detectionSource: this.getId(),
      affectedAssets: [{ type: 'process', path: input.path, name: input.processName, pid: input.pid }],
      recommendation: 'Terminate this process immediately. Check for data exfiltration. Scan for persistence mechanisms. Change passwords if sensitive input was captured.',
      explanation: `Process "${input.processName}" (PID ${input.pid}) shows ${indicatorCount} keylogger indicator(s): ${evidence.map((e) => e.description).join('; ')}.`,
      mitreAttack: { tactic: 'Collection', technique: 'Input Capture: Keylogging', reference: 'https://attack.mitre.org/techniques/T1056/001' },
      canRemediate: false,
    });
  }
}
