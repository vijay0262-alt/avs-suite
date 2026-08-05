/**
 * Security Scan Phase Types — Professional Full System Security Scan
 *
 * Defines 14 scan phases, live statistics, scan tree nodes, and live threat cards
 * for the redesigned AI Smart Security scanning experience.
 */

// ── 14 Scan Phases ───────────────────────────────────────────────────

export type SecurityScanPhaseId =
  | 'initialization'
  | 'processes'
  | 'system_dirs'
  | 'user_profile'
  | 'registry'
  | 'scheduled_tasks'
  | 'services'
  | 'browser'
  | 'powershell'
  | 'persistence'
  | 'behavior'
  | 'threat_investigation'
  | 'remediation_planning'
  | 'final_verification';

export interface SecurityScanPhaseInfo {
  id: SecurityScanPhaseId;
  label: string;
  startPercent: number;
  endPercent: number;
  description: string;
  displayFields: string[];
}

export const SECURITY_SCAN_PHASES: SecurityScanPhaseInfo[] = [
  {
    id: 'initialization',
    label: 'Initialization',
    startPercent: 0,
    endPercent: 2,
    description: 'Loading AI Security Engine and detection providers',
    displayFields: ['providersLoaded'],
  },
  {
    id: 'processes',
    label: 'Running Processes',
    startPercent: 2,
    endPercent: 8,
    description: 'Inspecting running processes, loaded DLLs, parent-child relationships, suspicious behavior, unsigned executables',
    displayFields: ['processesAnalyzed', 'suspiciousProcesses'],
  },
  {
    id: 'system_dirs',
    label: 'Windows System Directories',
    startPercent: 8,
    endPercent: 18,
    description: 'Inspecting Windows, System32, SysWOW64, Drivers, Program Files',
    displayFields: ['filesScanned', 'executablesFound', 'unsignedExecutables'],
  },
  {
    id: 'user_profile',
    label: 'User Profile',
    startPercent: 18,
    endPercent: 30,
    description: 'Inspecting Desktop, Downloads, Documents, AppData, Temp, Startup folder, Recycle Bin',
    displayFields: ['filesScanned', 'scriptsDetected', 'executablesDetected'],
  },
  {
    id: 'registry',
    label: 'Registry',
    startPercent: 30,
    endPercent: 42,
    description: 'Inspecting Run keys, RunOnce, Startup, Services, Explorer, Shell, Policies, Browser registry',
    displayFields: ['registryKeysChecked', 'persistenceEntries'],
  },
  {
    id: 'scheduled_tasks',
    label: 'Scheduled Tasks',
    startPercent: 42,
    endPercent: 48,
    description: 'Inspecting Scheduled Tasks, hidden tasks, persistence tasks',
    displayFields: ['scheduledTasks', 'suspiciousTasks'],
  },
  {
    id: 'services',
    label: 'Windows Services',
    startPercent: 48,
    endPercent: 55,
    description: 'Inspecting services, drivers, auto-start services, unsigned services',
    displayFields: ['servicesChecked'],
  },
  {
    id: 'browser',
    label: 'Browser Security',
    startPercent: 55,
    endPercent: 65,
    description: 'Inspecting Chrome, Edge, Firefox — extensions, policies, homepage, search provider, notifications, downloads',
    displayFields: ['browserObjects', 'browserPolicies'],
  },
  {
    id: 'powershell',
    label: 'PowerShell & Script Security',
    startPercent: 65,
    endPercent: 72,
    description: 'Inspecting PowerShell profiles, execution policy, startup scripts, batch files, VBScript, JavaScript',
    displayFields: ['scriptsInspected'],
  },
  {
    id: 'persistence',
    label: 'Persistence Analysis',
    startPercent: 72,
    endPercent: 80,
    description: 'Inspecting autoruns, WMI, registry, startup, tasks, services, browser persistence',
    displayFields: ['persistenceMechanisms'],
  },
  {
    id: 'behavior',
    label: 'Behavior Analysis',
    startPercent: 80,
    endPercent: 88,
    description: 'Running AI detection providers — threat correlation, behavior scoring, publisher trust, file reputation, relationship graph, confidence calculation',
    displayFields: ['threatsFound', 'aiConfidence'],
  },
  {
    id: 'threat_investigation',
    label: 'Threat Investigation',
    startPercent: 88,
    endPercent: 95,
    description: 'Generating threat timeline, evidence, relationships, MITRE mapping, confidence, recommended actions',
    displayFields: ['threatsFound', 'aiConfidence'],
  },
  {
    id: 'remediation_planning',
    label: 'AI Remediation Planning',
    startPercent: 95,
    endPercent: 99,
    description: 'Preparing quarantine plan, rollback, recovery, false positive validation',
    displayFields: ['threatsFound'],
  },
  {
    id: 'final_verification',
    label: 'Final Verification',
    startPercent: 99,
    endPercent: 100,
    description: 'Verifying results, generating Security Score and AI Summary',
    displayFields: ['aiConfidence'],
  },
];

// ── Live Statistics ──────────────────────────────────────────────────

export interface SecurityScanLiveStats {
  filesScanned: number;
  registryKeysChecked: number;
  processesAnalyzed: number;
  servicesChecked: number;
  scheduledTasks: number;
  browserObjects: number;
  scriptsInspected: number;
  threatsFound: number;
  aiConfidence: number;
  executablesFound: number;
  unsignedExecutables: number;
  scriptsDetected: number;
  executablesDetected: number;
  persistenceEntries: number;
  suspiciousProcesses: number;
  suspiciousTasks: number;
  persistenceMechanisms: number;
  browserPolicies: number;
  providersLoaded: number;
}

export const INITIAL_SECURITY_SCAN_STATS: SecurityScanLiveStats = {
  filesScanned: 0,
  registryKeysChecked: 0,
  processesAnalyzed: 0,
  servicesChecked: 0,
  scheduledTasks: 0,
  browserObjects: 0,
  scriptsInspected: 0,
  threatsFound: 0,
  aiConfidence: 0,
  executablesFound: 0,
  unsignedExecutables: 0,
  scriptsDetected: 0,
  executablesDetected: 0,
  persistenceEntries: 0,
  suspiciousProcesses: 0,
  suspiciousTasks: 0,
  persistenceMechanisms: 0,
  browserPolicies: 0,
  providersLoaded: 0,
};

// ── Scan Tree ────────────────────────────────────────────────────────

export type ScanTreeNodeStatus = 'pending' | 'scanning' | 'complete' | 'error';

export interface ScanTreeNode {
  id: string;
  label: string;
  status: ScanTreeNodeStatus;
  itemsScanned: number;
  threatsFound: number;
  children?: ScanTreeNode[];
}

// ── Live Threat Card ─────────────────────────────────────────────────

export interface LiveThreatCard {
  id: string;
  name: string;
  type: string;
  risk: string;
  confidence: number;
  status: string;
  location: string;
  actionPlanned: string;
  detectedAt: number;
}

// ── AI Summary ───────────────────────────────────────────────────────

export interface SecurityAISummary {
  securityScore: number;
  threatsFound: number;
  threatsNeutralized: number;
  manualReviewRequired: number;
  protectedAreas: string[];
  estimatedRisk: string;
  aiVerdict: string;
  scanDuration: number;
  filesScanned: number;
  itemsScanned: number;
}
