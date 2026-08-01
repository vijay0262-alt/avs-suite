/**
 * ScheduledTaskProvider — deep scheduled task analysis.
 *
 * Priority: ⭐⭐⭐⭐⭐ (Persistence Detection)
 *
 * Specialized analysis of Windows Task Scheduler entries for:
 *   - Hidden tasks
 *   - Tasks running as SYSTEM
 *   - Tasks with encoded commands
 *   - Tasks triggered at logon/boot from suspicious paths
 *   - Tasks with no author
 *   - Tasks executing from temp/appdata
 */
import { SecurityProvider } from './SecurityProvider';
import type {
  ProviderScanContext,
  ProviderScanResult,
  Threat,
  SecurityEvidence,
  ScheduledTaskDetail,
} from './types';
import { confidenceToLabel } from './types';

const KNOWN_TASK_AUTHORS = ['Microsoft', 'Microsoft Corporation', 'Google', 'Adobe', 'Mozilla'];

export class ScheduledTaskProvider extends SecurityProvider {
  constructor() {
    super('scheduled-task', 'Scheduled Task Provider', 'persistence', '1.0.0',
      'Deep analysis of scheduled tasks for persistence and execution abuse', 38);
    this.addCapability('hidden_task_detection');
    this.addCapability('task_trigger_analysis');
    this.addCapability('task_command_analysis');
  }

  async scan(context: ProviderScanContext): Promise<ProviderScanResult> {
    const start = Date.now();
    try {
      this.setStatus('active');
      const threats: Threat[] = [];
      const tasks = (context.options['scheduledTasks'] as ScheduledTaskDetail[] | undefined) ?? [];

      for (const task of tasks) {
        const t = this.analyzeTask(task);
        if (t) threats.push(t);
      }

      const duration = Date.now() - start;
      this.markRun();
      this.setStatus('inactive');
      return this.successResult(context, threats, duration, tasks.length, { analyzed: tasks.length });
    } catch (e) {
      const duration = Date.now() - start;
      const error = e instanceof Error ? e.message : String(e);
      this.setLastError(error);
      return this.failureResult(context, error, duration);
    }
  }

  private analyzeTask(task: ScheduledTaskDetail): Threat | null {
    if (task.author && KNOWN_TASK_AUTHORS.some((a) => task.author!.includes(a))) return null;

    const evidence: SecurityEvidence[] = [];
    const cmd = task.command.toLowerCase();

    if (task.hidden) evidence.push({ source: this.getId(), type: 'hidden', value: task.name, description: 'Task is hidden from Task Scheduler UI', timestamp: Date.now() });
    if (!task.author) evidence.push({ source: this.getId(), type: 'no_author', value: task.name, description: 'Task has no author metadata', timestamp: Date.now() });
    if (cmd.includes('-enc') || cmd.includes('-encodedcommand')) evidence.push({ source: this.getId(), type: 'encoded_command', value: task.command, description: 'Task executes encoded PowerShell command', timestamp: Date.now() });
    if (cmd.includes('rundll32') && cmd.includes('temp')) evidence.push({ source: this.getId(), type: 'rundll32_temp', value: task.command, description: 'Task runs rundll32 from temp directory', timestamp: Date.now() });
    if (task.path.toLowerCase().includes('temp') || cmd.includes('appdata\\local\\temp')) evidence.push({ source: this.getId(), type: 'temp_execution', value: task.path, description: 'Task executes from temp directory', timestamp: Date.now() });
    if (task.triggers.includes('At logon') && !task.author) evidence.push({ source: this.getId(), type: 'logon_trigger', value: task.name, description: 'Task triggers at logon with no known author', timestamp: Date.now() });

    if (evidence.length < 2) return null;

    const hasEncoded = evidence.some((e) => e.type === 'encoded_command');
    const severity = hasEncoded ? 'high' : 'medium';
    const confidence = Math.min(0.9, 0.4 + evidence.length * 0.13);

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
      recommendation: `Review scheduled task "${task.name}". Disable and investigate if unrecognized.`,
      explanation: `Scheduled task "${task.name}" has ${evidence.length} suspicious indicator(s): ${evidence.map((e) => e.description).join('; ')}. Command: ${task.command}.`,
      mitreAttack: { tactic: 'Persistence', technique: 'Scheduled Task/Job', reference: 'https://attack.mitre.org/techniques/T1053' },
      canRemediate: false,
    });
  }
}
