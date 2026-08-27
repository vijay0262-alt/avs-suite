/**
 * Startup Optimizer — Type Definitions
 *
 * Complete type system for the Startup Optimizer module.
 * Discovers, analyzes, and safely manages startup applications.
 *
 * This module does NOT modify the Execution Engine, AI Health Engine,
 * Optimization Planner, or Maintenance History architectures.
 */

// ── Startup Entry ──────────────────────────────────────────────

/**
 * Source of a startup entry.
 */
export type StartupSource =
  | 'registry_hkcu_run'    // HKCU\Software\Microsoft\Windows\CurrentVersion\Run
  | 'registry_hklm_run'    // HKLM\Software\Microsoft\Windows\CurrentVersion\Run
  | 'startup_folder_user'  // Current User startup folder
  | 'startup_folder_all'   // All Users startup folder
  | 'task_scheduler'       // Task Scheduler startup-triggered tasks
  | 'startup_services';    // Startup services (read-only)

/**
 * User scope of a startup entry.
 */
export type UserScope = 'current_user' | 'all_users' | 'system';

/**
 * Digital signature status.
 */
export type SignatureStatus = 'signed' | 'unsigned' | 'unknown' | 'microsoft' | 'avs';

/**
 * Impact level of a startup entry on boot performance.
 */
export type ImpactLevel = 'low' | 'medium' | 'high' | 'very_high' | 'none';

/**
 * A single startup application discovered on the system.
 */
export interface StartupEntry {
  /** Unique entry ID (generated from source + name + command). */
  id: string;
  /** Display name of the application. */
  name: string;
  /** Publisher or company name. */
  publisher: string;
  /** Executable file path. */
  executablePath: string;
  /** Full command line used to launch the application. */
  commandLine: string;
  /** Where the entry was discovered. */
  source: StartupSource;
  /** Whether the entry is currently enabled or disabled. */
  enabled: boolean;
  /** How the entry is launched (registry, folder, task, service). */
  launchType: 'registry' | 'folder' | 'task' | 'service';
  /** User scope of the entry. */
  userScope: UserScope;
  /** Digital signature status of the executable. */
  signatureStatus: SignatureStatus;
  /** Estimated startup impact level. */
  impactLevel: ImpactLevel;
  /** Estimated boot delay in milliseconds caused by this entry. */
  estimatedBootDelayMs: number;
  /** Estimated CPU usage during startup (percentage). */
  estimatedCpuUsage: number;
  /** Estimated memory usage at startup in bytes. */
  estimatedMemoryBytes: number;
  /** Estimated disk activity during startup (0–100 scale). */
  estimatedDiskActivity: number;
  /** Confidence in the impact estimate (0–1). */
  impactConfidence: number;
  /** Whether the entry is protected (cannot be disabled). */
  isProtected: boolean;
  /** Reason for protection, if applicable. */
  protectedReason: string | null;
  /** Whether the executable file exists on disk. */
  executableExists: boolean;
  /** Additional metadata from the source. */
  metadata?: Record<string, unknown>;
}

// ── Startup Impact ─────────────────────────────────────────────

/**
 * Detailed impact assessment for a startup entry.
 */
export interface StartupImpact {
  /** Entry ID this impact belongs to. */
  entryId: string;
  /** Impact level. */
  level: ImpactLevel;
  /** Estimated boot delay in milliseconds. */
  bootDelayMs: number;
  /** Estimated CPU usage during startup (percentage). */
  cpuUsage: number;
  /** Estimated memory usage at startup in bytes. */
  memoryBytes: number;
  /** Estimated disk activity during startup (0–100 scale). */
  diskActivity: number;
  /** Confidence in the estimate (0–1). */
  confidence: number;
  /** Human-readable explanation. */
  explanation: string;
}

// ── Startup Analysis ───────────────────────────────────────────

/**
 * Complete analysis of the system's startup configuration.
 */
export interface StartupAnalysis {
  /** Total number of startup entries discovered. */
  totalEntries: number;
  /** Number of enabled entries. */
  enabledCount: number;
  /** Number of disabled entries. */
  disabledCount: number;
  /** Estimated total boot time impact in milliseconds. */
  estimatedBootImpactMs: number;
  /** Entries with high or very high impact. */
  highImpactEntries: StartupEntry[];
  /** Duplicate startup entries (same executable, different sources). */
  duplicateEntries: StartupEntry[][];
  /** Entries where the executable file is missing. */
  missingExecutables: StartupEntry[];
  /** Entries that are not digitally signed. */
  unsignedEntries: StartupEntry[];
  /** Entries that are protected from modification. */
  protectedEntries: StartupEntry[];
  /** Startup health score (0–100, higher is better). */
  healthScore: number;
  /** Estimated boot time improvement if all recommendations are applied (ms). */
  estimatedBootImprovementMs: number;
  /** Generated recommendations. */
  recommendations: StartupRecommendation[];
  /** Analysis timestamp. */
  analyzedAt: string;
}

/**
 * A recommendation for startup optimization.
 */
export interface StartupRecommendation {
  /** Recommendation type. */
  type: 'disable_high_impact' | 'remove_broken' | 'review_unsigned' | 'review_duplicate' | 'enable_useful';
  /** Entry IDs this recommendation applies to. */
  entryIds: string[];
  /** Human-readable title. */
  title: string;
  /** Detailed description. */
  description: string;
  /** Estimated boot improvement if applied (ms). */
  estimatedImprovementMs: number;
  /** Risk level of applying this recommendation. */
  risk: 'low' | 'medium' | 'high';
}

// ── Startup Change Record ─────────────────────────────────────

/**
 * Record of a change made to a startup entry.
 */
export interface StartupChangeRecord {
  /** Unique record ID. */
  recordId: string;
  /** Entry ID that was changed. */
  entryId: string;
  /** Entry name at time of change. */
  entryName: string;
  /** Action taken. */
  action: 'disable' | 'enable' | 'restore';
  /** Previous enabled state. */
  previousState: boolean;
  /** New enabled state. */
  newState: boolean;
  /** Timestamp of the change. */
  timestamp: string;
  /** Backup ID from the RPC service, if available. */
  backupId: string | null;
  /** Whether the change was successful. */
  success: boolean;
  /** Error message, if any. */
  error: string | null;
  /** Estimated boot improvement from this change (ms). */
  estimatedImprovementMs: number;
}

// ── Startup Execution Config ───────────────────────────────────

/**
 * Configuration for a startup optimization execution.
 * Specifies which entries to disable/enable.
 */
export interface StartupExecutionConfig {
  /** Entry IDs to disable. */
  disableEntryIds: string[];
  /** Entry IDs to enable. */
  enableEntryIds: string[];
}

// ── Startup Health Contribution ────────────────────────────────

/**
 * Health contribution data for the AI Health Engine.
 * This is consumed by the health engine without modifying its architecture.
 */
export interface StartupHealthContribution {
  /** Startup health score (0–100). */
  score: number;
  /** Startup issues for the health engine. */
  issues: StartupHealthIssue[];
  /** Startup insights for the health engine. */
  insights: string[];
  /** Recommendations for the health engine. */
  recommendations: string[];
  /** Estimated boot improvement in milliseconds. */
  estimatedBootImprovementMs: number;
}

/**
 * A startup health issue for the AI Health Engine.
 */
export interface StartupHealthIssue {
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  impact: number;
  autoFixable: boolean;
}

// ── Events ────────────────────────────────────────────────────

export type StartupEventType =
  | 'startup_scan_started'
  | 'startup_scan_completed'
  | 'startup_analysis_completed'
  | 'startup_item_changed'
  | 'startup_execution_completed';

export interface StartupEventPayloads {
  startup_scan_started: { timestamp: string };
  startup_scan_completed: { entries: StartupEntry[]; timestamp: string };
  startup_analysis_completed: { analysis: StartupAnalysis; timestamp: string };
  startup_item_changed: { change: StartupChangeRecord };
  startup_execution_completed: { changes: StartupChangeRecord[]; durationMs: number };
}

export type StartupEventListener = (payload: unknown) => void;

// ── Protected Applications List ────────────────────────────────

/**
 * Default list of protected application name patterns.
 * These entries cannot be disabled by the startup optimizer.
 */
export const PROTECTED_APP_PATTERNS: readonly string[] = [
  'windows defender',
  'windowssecurity',
  'microsoft defender',
  'securityhealthservice',
  'avsshield',
  'avs shield',
  'avs ai shield',
  'avs-suite',
  'avg',
  'avast',
  'kaspersky',
  'norton',
  'mcafee',
  'bitdefender',
  'malwarebytes',
  'windows security',
  'smartscreen',
  'useraccountcontrol',
  'windowsupdate',
  'searchhost',
  'startmenuexperiencehost',
  'sihost',
  'taskhostw',
  'explorer',
  'dwm',
  'ctfmon',
  'fontdrvhost',
  'runtimebroker',
  'applicationframehost',
];

// ── Helper Functions ────────────────────────────────────────────

/**
 * Generate a stable ID from source + name + command.
 */
export function generateEntryId(source: StartupSource, name: string, commandLine: string): string {
  const raw = `${source}:${name}:${commandLine}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `startup-${Math.abs(hash).toString(36)}`;
}

/**
 * Check if an application name matches any protected pattern.
 */
export function isProtectedApp(name: string): boolean {
  const lower = name.toLowerCase();
  return PROTECTED_APP_PATTERNS.some((pattern) => lower.includes(pattern));
}

/**
 * Format milliseconds into a human-readable boot delay string.
 */
export function formatBootDelay(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `~${seconds.toFixed(1)} sec`;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `~${minutes} min ${remaining} sec`;
}
