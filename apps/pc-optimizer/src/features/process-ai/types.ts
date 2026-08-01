/**
 * Process AI Engine — Type Definitions
 *
 * All types for the AI Process Intelligence Engine. The engine collects
 * process data via ProcessScanner, analyzes resource impact, classifies
 * processes, and produces human-readable insights and recommendations.
 *
 * Core principle: Every insight must be traceable to process evidence.
 * No automatic termination. No priority modification. No service changes.
 * The AI must only analyze, explain, and recommend.
 */

// ── Process Identity & Classification ────────────────────────────────

export type ProcessCategory =
  | 'system'
  | 'windows'
  | 'microsoft'
  | 'third_party'
  | 'background'
  | 'user_application'
  | 'updater'
  | 'security'
  | 'driver'
  | 'gaming'
  | 'browser'
  | 'development'
  | 'unknown';

export type ProcessSafetyLevel = 'safe' | 'review_recommended' | 'avoid' | 'critical_system';

export type SignatureStatus = 'valid' | 'invalid' | 'unsigned' | 'unknown' | 'expired';

export type IntegrityLevel = 'untrusted' | 'low' | 'medium' | 'high' | 'system';

export type ProcessPriority =
  | 'idle'
  | 'below_normal'
  | 'normal'
  | 'above_normal'
  | 'high'
  | 'realtime';

// ── Process Info ─────────────────────────────────────────────────────

export interface ProcessInfo {
  pid: number;
  name: string;
  displayName: string;
  parentPid: number;
  parentName: string;
  publisher: string;
  description: string;
  executablePath: string;
  signatureStatus: SignatureStatus;
  signatureIssuer: string;
  launchTime: number;
  priority: ProcessPriority;
  integrityLevel: IntegrityLevel;
  threadCount: number;
  handleCount: number;
  windowTitle: string;
  userAccount: string;
  isService: boolean;
  serviceName: string;
  isStartupEntry: boolean;
  startupEntryName: string;
  category: ProcessCategory;
  safetyLevel: ProcessSafetyLevel;
}

// ── Process Sensors (per-snapshot resource readings) ─────────────────

export interface ProcessSensors {
  cpuUsagePercent: number;
  perCoreUsage: number[];
  memoryMB: number;
  privateMemoryMB: number;
  workingSetMB: number;
  virtualMemoryMB: number;
  diskReadMBps: number;
  diskWriteMBps: number;
  gpuUsagePercent: number;
  vramMB: number;
  networkDownloadMbps: number;
  networkUploadMbps: number;
  powerDrawEstimateW: number;
}

// ── Process Entry (info + sensors for a single scan) ─────────────────

export interface ProcessEntry {
  info: ProcessInfo;
  sensors: ProcessSensors;
}

// ── Process Snapshot ─────────────────────────────────────────────────

export interface ProcessSnapshot {
  id: string;
  timestamp: number;
  scanDurationMs: number;
  processCount: number;
  entries: ProcessEntry[];
  systemTotals: ProcessSystemTotals;
  metadata: ProcessSnapshotMetadata;
}

export interface ProcessSystemTotals {
  totalCpuUsagePercent: number;
  totalMemoryMB: number;
  totalDiskReadMBps: number;
  totalDiskWriteMBps: number;
  totalGpuUsagePercent: number;
  totalNetworkDownloadMbps: number;
  totalNetworkUploadMbps: number;
  totalProcessCount: number;
  totalThreadCount: number;
  totalHandleCount: number;
}

export interface ProcessSnapshotMetadata {
  source: string;
  version: string;
  partial: boolean;
}

// ── Impact Analysis ──────────────────────────────────────────────────

export type ImpactLevel = 'none' | 'minimal' | 'low' | 'moderate' | 'high' | 'critical';
export type TrendDirection = 'improving' | 'stable' | 'degrading' | 'rapid_degradation' | 'unknown';

export interface ProcessImpactAnalysis {
  cpu: CPUImpact;
  memory: MemoryImpact;
  disk: DiskImpact;
  gpu: GPUImpact;
  network: NetworkImpact;
  power: PowerImpact;
  startup: StartupImpact;
  background: BackgroundImpact;
  overall: OverallImpact;
}

export interface CPUImpact {
  level: ImpactLevel;
  usagePercent: number;
  perCoreAverage: number;
  trend: TrendDirection;
  isBackgroundLoad: boolean;
  isSustained: boolean;
  description: string;
  evidence: ProcessEvidence[];
}

export interface MemoryImpact {
  level: ImpactLevel;
  usageMB: number;
  privateMB: number;
  workingSetMB: number;
  virtualMB: number;
  trend: TrendDirection;
  isLeakSuspected: boolean;
  leakRateMBPerHour: number;
  description: string;
  evidence: ProcessEvidence[];
}

export interface DiskImpact {
  level: ImpactLevel;
  readMBps: number;
  writeMBps: number;
  totalIOps: number;
  trend: TrendDirection;
  isActive: boolean;
  description: string;
  evidence: ProcessEvidence[];
}

export interface GPUImpact {
  level: ImpactLevel;
  usagePercent: number;
  vramMB: number;
  trend: TrendDirection;
  description: string;
  evidence: ProcessEvidence[];
}

export interface NetworkImpact {
  level: ImpactLevel;
  downloadMbps: number;
  uploadMbps: number;
  trend: TrendDirection;
  isAbnormal: boolean;
  description: string;
  evidence: ProcessEvidence[];
}

export interface PowerImpact {
  level: ImpactLevel;
  estimatedPowerW: number;
  isBatteryDrain: boolean;
  description: string;
  evidence: ProcessEvidence[];
}

export interface StartupImpact {
  level: ImpactLevel;
  isStartupEntry: boolean;
  startupDelayMs: number;
  description: string;
  evidence: ProcessEvidence[];
}

export interface BackgroundImpact {
  level: ImpactLevel;
  isIdle: boolean;
  idleDurationMs: number;
  isBackgroundProcess: boolean;
  description: string;
  evidence: ProcessEvidence[];
}

export interface OverallImpact {
  level: ImpactLevel;
  score: number; // 0–100, higher = more impact
  primaryConcern: string;
  thermalContribution: number; // estimated °C contribution
  description: string;
}

// ── Process Evidence ─────────────────────────────────────────────────

export interface ProcessEvidence {
  metric: string;
  value: string;
  unit: string;
  timestamp: number;
  source: string;
}

// ── Process Analysis (full per-process result) ───────────────────────

export interface ProcessAnalysis {
  pid: number;
  name: string;
  displayName: string;
  category: ProcessCategory;
  safetyLevel: ProcessSafetyLevel;
  impact: ProcessImpactAnalysis;
  issues: ProcessIssue[];
  strengths: string[];
  health: 'healthy' | 'normal' | 'attention' | 'warning' | 'critical';
  confidence: number;
  risk: ProcessRiskLevel;
  urgency: ProcessUrgency;
  summary: string;
  purpose: string;
  expectedBehavior: string;
  recommendedAction: string;
  expectedRecovery: ProcessRecovery;
  requiresRestart: boolean;
  rollbackAvailable: boolean;
}

export interface ProcessIssue {
  id: string;
  type: ProcessIssueType;
  title: string;
  description: string;
  severity: ProcessSeverity;
  evidence: ProcessEvidence[];
  confidence: number;
}

export type ProcessIssueType =
  | 'idle_process'
  | 'hung_process'
  | 'high_cpu'
  | 'memory_leak'
  | 'repeated_restarts'
  | 'duplicate_process'
  | 'background_abuse'
  | 'suspicious_behavior'
  | 'excessive_startup_impact'
  | 'unused_background_app'
  | 'unsigned_process'
  | 'high_disk_activity'
  | 'abnormal_network';

export type ProcessSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type ProcessRiskLevel = 'none' | 'low' | 'moderate' | 'high' | 'severe';
export type ProcessUrgency = 'immediate' | 'soon' | 'scheduled' | 'none';

export interface ProcessRecovery {
  ramMB: number;
  cpuPercent: number;
  diskMBps: number;
  gpuPercent: number;
  networkMbps: number;
  description: string;
}

// ── Process Insight (AI-generated explanation) ───────────────────────

export interface ProcessInsight {
  id: string;
  pid: number;
  name: string;
  displayName: string;
  category: ProcessCategory;
  title: string;
  summary: string;
  explanation: string;
  purpose: string;
  currentActivity: string;
  resourceExplanation: string;
  expectedBehavior: string;
  evidence: ProcessEvidence[];
  confidence: number;
  confidenceLabel: ProcessConfidenceLabel;
  severity: ProcessSeverity;
  risk: ProcessRiskLevel;
  recommendation: string;
  expectedRecovery: ProcessRecovery;
  requiresRestart: boolean;
  rollbackAvailable: boolean;
  timestamp: number;
}

export type ProcessConfidenceLabel = 'low' | 'medium' | 'high' | 'very_high';

// ── Process Recommendation ───────────────────────────────────────────

export type RecommendationAction =
  | 'no_action'
  | 'close_process'
  | 'disable_startup'
  | 'delay_startup'
  | 'restart_process'
  | 'investigate'
  | 'scan_security'
  | 'update_application'
  | 'reduce_tabs'
  | 'adjust_settings';

export interface ProcessRecommendation {
  id: string;
  pid: number;
  name: string;
  displayName: string;
  action: RecommendationAction;
  title: string;
  reason: string;
  evidence: ProcessEvidence[];
  expectedImprovement: string;
  risk: string;
  safetyLevel: ProcessSafetyLevel;
  estimatedTimeMinutes: number;
  requiresRestart: boolean;
  rollbackAvailable: boolean;
  canAutomate: boolean;
  priority: ProcessUrgency;
  confidence: number;
  expectedRecovery: ProcessRecovery;
}

// ── Process Risk Assessment ──────────────────────────────────────────

export interface ProcessRiskAssessment {
  overallRisk: ProcessRiskLevel;
  overallUrgency: ProcessUrgency;
  highRiskProcesses: ProcessRiskEntry[];
  systemRiskFactors: string[];
  mitigatingFactors: string[];
  protectedProcesses: number;
}

export interface ProcessRiskEntry {
  pid: number;
  name: string;
  risk: ProcessRiskLevel;
  urgency: ProcessUrgency;
  primaryConcern: string;
  safetyLevel: ProcessSafetyLevel;
}

// ── Process Trend ────────────────────────────────────────────────────

export interface ProcessTrendDataPoint {
  timestamp: number;
  cpuUsagePercent: number;
  memoryMB: number;
  diskReadMBps: number;
  diskWriteMBps: number;
  networkMbps: number;
}

export interface ProcessTrendRecord {
  pid: number;
  name: string;
  cpuTrend: TrendDirection;
  memoryTrend: TrendDirection;
  diskTrend: TrendDirection;
  networkTrend: TrendDirection;
  memoryChangeMBPerHour: number;
  cpuChangePercentPerHour: number;
  dataPoints: ProcessTrendDataPoint[];
  duration: number;
  confidence: number;
}

export interface ProcessTrendSummary {
  pid: number;
  name: string;
  overallTrend: TrendDirection;
  notableChanges: string[];
}

// ── Process Dashboard Data ───────────────────────────────────────────

export interface ProcessDashboardData {
  summary: ProcessDashboardSummary;
  topConsumers: ProcessDashboardEntry[];
  startupProcesses: ProcessDashboardEntry[];
  backgroundProcesses: ProcessDashboardEntry[];
  alerts: ProcessDashboardAlert[];
  lastScanAt: number;
}

export interface ProcessDashboardSummary {
  totalProcesses: number;
  totalCpuUsagePercent: number;
  totalMemoryMB: number;
  totalDiskActivityMBps: number;
  totalNetworkMbps: number;
  backgroundProcessCount: number;
  startupProcessCount: number;
  highImpactCount: number;
  criticalProcessCount: number;
  systemProcessCount: number;
  userProcessCount: number;
}

export interface ProcessDashboardEntry {
  pid: number;
  name: string;
  displayName: string;
  category: ProcessCategory;
  cpuUsagePercent: number;
  memoryMB: number;
  impactLevel: ImpactLevel;
  safetyLevel: ProcessSafetyLevel;
}

export interface ProcessDashboardAlert {
  pid: number;
  name: string;
  type: ProcessIssueType;
  severity: ProcessSeverity;
  message: string;
}

// ── Full AI Report ───────────────────────────────────────────────────

export interface ProcessAIReport {
  timestamp: number;
  snapshotId: string;
  totalProcesses: number;
  systemSummary: string;
  systemExplanation: string;
  analyses: ProcessAnalysis[];
  insights: ProcessInsight[];
  recommendations: ProcessRecommendation[];
  riskAssessment: ProcessRiskAssessment;
  trendSummaries: ProcessTrendSummary[];
  dashboard: ProcessDashboardData;
  overallConfidence: number;
}

// ── Configuration ────────────────────────────────────────────────────

export interface ProcessConfiguration {
  enabled: boolean;
  pollIntervalMs: number;
  historyRetentionMs: number;
  maxSnapshots: number;
  maxTrendDataPoints: number;
  minTrendDataPoints: number;
  maxInsights: number;
  maxRecommendations: number;
  enableTrendAnalysis: boolean;
  enableRecommendations: boolean;
  enableRiskAssessment: boolean;
  enableDashboard: boolean;
  thresholds: ProcessThresholds;
  protectedProcesses: string[];
}

export interface ProcessThresholds {
  cpuHighPercent: number;
  cpuBackgroundPercent: number;
  cpuSustainedMinutes: number;
  memoryHighMB: number;
  memoryLeakRateMBPerHour: number;
  diskHighMBps: number;
  gpuHighPercent: number;
  networkHighMbps: number;
  idleThresholdMinutes: number;
  startupHighDelayMs: number;
  duplicateThreshold: number;
  hungThresholdSeconds: number;
}

export const DEFAULT_PROCESS_CONFIG: ProcessConfiguration = {
  enabled: true,
  pollIntervalMs: 5000,
  historyRetentionMs: 30 * 60 * 1000,
  maxSnapshots: 500,
  maxTrendDataPoints: 100,
  minTrendDataPoints: 3,
  maxInsights: 30,
  maxRecommendations: 15,
  enableTrendAnalysis: true,
  enableRecommendations: true,
  enableRiskAssessment: true,
  enableDashboard: true,
  thresholds: {
    cpuHighPercent: 50,
    cpuBackgroundPercent: 15,
    cpuSustainedMinutes: 5,
    memoryHighMB: 500,
    memoryLeakRateMBPerHour: 100,
    diskHighMBps: 50,
    gpuHighPercent: 50,
    networkHighMbps: 100,
    idleThresholdMinutes: 30,
    startupHighDelayMs: 3000,
    duplicateThreshold: 3,
    hungThresholdSeconds: 60,
  },
  protectedProcesses: [
    'System',
    'System Idle Process',
    'Registry',
    'smss.exe',
    'csrss.exe',
    'wininit.exe',
    'services.exe',
    'lsass.exe',
    'svchost.exe',
    'winlogon.exe',
    'dwm.exe',
    'explorer.exe',
    'fontdrvhost.exe',
    'sihost.exe',
    'taskhostw.exe',
    'ctfmon.exe',
    'RuntimeBroker.exe',
    'SearchHost.exe',
    'StartMenuExperienceHost.exe',
    'ShellExperienceHost.exe',
    'TextInputHost.exe',
    'WindowsTerminal.exe',
    'conhost.exe',
  ],
};

// ── Process Events ───────────────────────────────────────────────────

export const ProcessEventType = {
  ScanStarted: 'process_scan_started',
  ScanCompleted: 'process_scan_completed',
  HighCpuDetected: 'process_high_cpu_detected',
  MemoryLeakSuspected: 'process_memory_leak_suspected',
  SuspiciousProcessDetected: 'process_suspicious_detected',
  IdleProcessDetected: 'process_idle_detected',
  DuplicateProcessDetected: 'process_duplicate_detected',
} as const;

export type ProcessEventTypeName =
  (typeof ProcessEventType)[keyof typeof ProcessEventType];

export interface ProcessEvent {
  type: ProcessEventTypeName;
  timestamp: number;
  pid?: number;
  processName?: string;
  data?: ProcessEventData;
}

export interface ProcessEventData {
  snapshotId?: string;
  scanDurationMs?: number;
  processCount?: number;
  cpuUsagePercent?: number;
  memoryMB?: number;
  message?: string;
}

// ── Helper Functions ─────────────────────────────────────────────────

export function confidenceToLabel(confidence: number): ProcessConfidenceLabel {
  if (confidence >= 0.9) return 'very_high';
  if (confidence >= 0.7) return 'high';
  if (confidence >= 0.4) return 'medium';
  return 'low';
}

export function severityToRisk(severity: ProcessSeverity): ProcessRiskLevel {
  switch (severity) {
    case 'critical': return 'severe';
    case 'high': return 'high';
    case 'medium': return 'moderate';
    case 'low': return 'low';
    default: return 'none';
  }
}

export function severityToUrgency(severity: ProcessSeverity): ProcessUrgency {
  switch (severity) {
    case 'critical': return 'immediate';
    case 'high': return 'soon';
    case 'medium': return 'scheduled';
    default: return 'none';
  }
}

export function impactToScore(level: ImpactLevel): number {
  switch (level) {
    case 'none': return 0;
    case 'minimal': return 10;
    case 'low': return 25;
    case 'moderate': return 50;
    case 'high': return 75;
    case 'critical': return 95;
    default: return 0;
  }
}

export function isProtectedProcess(name: string, protectedList: string[]): boolean {
  return protectedList.some((p) => p.toLowerCase() === name.toLowerCase());
}

export function makeProcessEvidence(
  metric: string,
  value: string,
  unit: string,
  timestamp: number = Date.now(),
  source: string = 'process-scanner',
): ProcessEvidence {
  return { metric, value, unit, timestamp, source };
}
