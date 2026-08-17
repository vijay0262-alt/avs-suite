/**
 * AI Remediation, Quarantine & Recovery — Type Definitions
 *
 * Version 1.2 — EPIC 1 — Part 4 — AI Remediation, Quarantine & Recovery
 *
 * Safety is the highest priority. Every action must be explainable.
 * Every reversible action must support rollback.
 * Never perform destructive actions without user approval.
 *
 * Default flow:
 *   Detect → Investigate → Recommend → User Approval → Quarantine → Observe → Delete (optional)
 */

import type {
  Threat,
  ThreatCategory,
  ThreatSeverity,
  ThreatRisk,
  ThreatStatus,
  ConfidenceLabel,
  SecurityEvidence,
  AffectedAsset,
} from '../security-center/types';

import type {
  ThreatInvestigation,
  AffectedComponent,
  RecommendedAction,
} from '../security-investigation/types';

// ── Re-exports for convenience ───────────────────────────────────────

export type {
  Threat,
  ThreatCategory,
  ThreatSeverity,
  ThreatRisk,
  ThreatStatus,
  ConfidenceLabel,
  SecurityEvidence,
  AffectedAsset,
  ThreatInvestigation,
  AffectedComponent,
  RecommendedAction,
};

// ── Remediation Actions ──────────────────────────────────────────────

export type RemediationActionType =
  | 'review'
  | 'ignore'
  | 'mark_false_positive'
  | 'quarantine'
  | 'restore'
  | 'delete'
  | 'disable_startup_entry'
  | 'disable_scheduled_task'
  | 'disable_browser_extension'
  | 'reset_browser_setting'
  | 'remove_persistence'
  | 'export_investigation';

export type RemediationActionStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'rolled_back'
  | 'cancelled';

export type RemediationRiskLevel = 'safe' | 'low_risk' | 'medium_risk' | 'high_risk' | 'critical_risk';

export type RemediationTier = 'free' | 'pro';

// ── Remediation Plan ─────────────────────────────────────────────────

export interface RemediationPlan {
  id: string;
  investigationId: string;
  actions: RemediationAction[];
  totalActions: number;
  requiresApproval: boolean;
  autoExecutableActions: number;
  manualActions: number;
  estimatedTime: number;
  rollbackAvailable: boolean;
  createdAt: number;
  status: RemediationPlanStatus;
  summary: string;
}

export type RemediationPlanStatus = 'draft' | 'pending_approval' | 'approved' | 'executing' | 'completed' | 'failed' | 'cancelled';

export interface RemediationAction {
  id: string;
  planId: string;
  investigationId: string;
  threatId: string;
  type: RemediationActionType;
  status: RemediationActionStatus;
  riskLevel: RemediationRiskLevel;
  requiresApproval: boolean;
  requiresUserConfirmation: boolean;
  target: RemediationTarget;
  reason: string;
  explanation: string;
  reversible: boolean;
  rollbackId: string | null;
  tier: RemediationTier;
  createdAt: number;
  executedAt: number | null;
  completedAt: number | null;
  error: string | null;
  metadata: RemediationActionMetadata;
}

export interface RemediationTarget {
  type: 'file' | 'registry' | 'service' | 'scheduled_task' | 'startup_entry' | 'browser_extension' | 'browser_setting' | 'process' | 'network';
  path: string;
  name: string;
  hash?: string;
  pid?: number;
  originalLocation?: string;
}

export interface RemediationActionMetadata {
  detectionSource: string;
  detectionTime: number;
  confidence: number;
  severity: ThreatSeverity;
  category: ThreatCategory;
  evidenceCount: number;
  investigationTitle: string;
}

// ── Quarantine ───────────────────────────────────────────────────────

export interface QuarantineEntry {
  id: string;
  threatId: string;
  investigationId: string;
  originalPath: string;
  quarantinePath: string;
  fileName: string;
  fileSize: number;
  fileHash: string;
  digitalSignature: string | null;
  detectionReason: string;
  detectionSource: string;
  detectionTime: number;
  quarantinedAt: number;
  status: QuarantineStatus;
  encrypted: boolean;
  metadata: QuarantineMetadata;
}

export type QuarantineStatus = 'quarantined' | 'restored' | 'deleted' | 'expired';

export interface QuarantineMetadata {
  threatCategory: ThreatCategory;
  threatSeverity: ThreatSeverity;
  threatConfidence: number;
  investigationId: string;
  originalSignature: string | null;
  fileAttributes: string[];
  hashAlgorithm: string;
  encryptedKey: string | null;
}

export interface QuarantineSummary {
  totalItems: number;
  activeQuarantine: number;
  restored: number;
  deleted: number;
  totalSize: number;
  oldestQuarantine: number | null;
  newestQuarantine: number | null;
}

// ── Rollback ─────────────────────────────────────────────────────────

export interface RollbackEntry {
  id: string;
  actionId: string;
  investigationId: string;
  type: RollbackType;
  description: string;
  timestamp: number;
  rollbackData: RollbackData;
  status: RollbackStatus;
  rolledBackAt: number | null;
}

export type RollbackType =
  | 'file_restore'
  | 'registry_restore'
  | 'browser_setting_restore'
  | 'startup_entry_restore'
  | 'scheduled_task_restore'
  | 'service_restore'
  | 'extension_restore'
  | 'configuration_restore';

export type RollbackStatus = 'available' | 'rolled_back' | 'expired' | 'failed';

export interface RollbackData {
  originalPath: string;
  backupPath: string;
  originalValue: string | null;
  registryKey: string | null;
  registryValueName: string | null;
  browserSetting: string | null;
  extensionId: string | null;
  taskName: string | null;
  serviceName: string | null;
  startupEntryName: string | null;
}

// ── Approval ─────────────────────────────────────────────────────────

export interface ApprovalRequest {
  id: string;
  planId: string;
  investigationId: string;
  actions: RemediationAction[];
  riskLevel: RemediationRiskLevel;
  summary: string;
  explanation: string;
  createdAt: number;
  respondedAt: number | null;
  response: ApprovalResponse | null;
  userId: string | null;
  reason: string | null;
}

export type ApprovalResponse = 'approved' | 'rejected' | 'deferred';

export interface ApprovalSummary {
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  deferredCount: number;
  oldestPending: number | null;
}

// ── Safety Validation ────────────────────────────────────────────────

export interface SafetyAssessment {
  safe: boolean;
  riskLevel: RemediationRiskLevel;
  requiresApproval: boolean;
  requiresUserConfirmation: boolean;
  warnings: string[];
  blockers: string[];
  reasoning: string;
}

export interface SafetyRule {
  id: string;
  name: string;
  description: string;
  check: (action: RemediationAction, threat: Threat) => SafetyRuleResult;
  severity: RemediationRiskLevel;
}

export interface SafetyRuleResult {
  passed: boolean;
  warning?: string;
  blocker?: string;
}

// ── Policy ───────────────────────────────────────────────────────────

export type RemediationPolicyMode =
  | 'manual_only'
  | 'recommend_only'
  | 'auto_remediate_low_risk'
  | 'enterprise';

export interface RemediationPolicy {
  mode: RemediationPolicyMode;
  autoRemediateThreshold: RemediationRiskLevel;
  requireApprovalForHighRisk: boolean;
  requireApprovalForSystemLocations: boolean;
  requireApprovalForCriticalServices: boolean;
  requireApprovalForBootChanges: boolean;
  requireApprovalForUnsignedInProtected: boolean;
  quarantineBeforeDelete: boolean;
  maxAutoRemediatePerRun: number;
  observationPeriodMs: number;
  allowBulkRemediation: boolean;
  allowScheduledRemediation: boolean;
  tier: RemediationTier;
}

export const DEFAULT_REMEDIATION_POLICY: RemediationPolicy = {
  mode: 'manual_only',
  autoRemediateThreshold: 'low_risk',
  requireApprovalForHighRisk: true,
  requireApprovalForSystemLocations: true,
  requireApprovalForCriticalServices: true,
  requireApprovalForBootChanges: true,
  requireApprovalForUnsignedInProtected: true,
  quarantineBeforeDelete: true,
  maxAutoRemediatePerRun: 5,
  observationPeriodMs: 86400000,
  allowBulkRemediation: false,
  allowScheduledRemediation: false,
  tier: 'free',
};

// ── False Positive ───────────────────────────────────────────────────

export interface FalsePositiveEntry {
  id: string;
  threatId: string;
  investigationId: string;
  reason: string;
  markedAt: number;
  markedBy: string;
  exclusionType: FalsePositiveExclusionType;
  hash: string | null;
  path: string | null;
  publisher: string | null;
  notes: string | null;
}

export type FalsePositiveExclusionType = 'mark_safe' | 'exclude' | 'whitelist' | 'restore';

export interface FalsePositiveSummary {
  totalFalsePositives: number;
  markSafeCount: number;
  excludeCount: number;
  whitelistCount: number;
  restoreCount: number;
  recentFalsePositives: FalsePositiveEntry[];
}

// ── Remediation Report ───────────────────────────────────────────────

export interface RemediationReport {
  id: string;
  planId: string;
  investigationId: string;
  generatedAt: number;
  actionsTaken: ActionTakenSummary[];
  filesAffected: AffectedFileSummary[];
  registryChanges: RegistryChangeSummary[];
  browserChanges: BrowserChangeSummary[];
  threatsResolved: number;
  threatsRemaining: number;
  rollbackAvailable: boolean;
  rollbackIds: string[];
  timeRequired: number;
  summary: string;
  details: string;
  tier: RemediationTier;
}

export interface ActionTakenSummary {
  actionType: RemediationActionType;
  count: number;
  successful: number;
  failed: number;
  rolledBack: number;
}

export interface AffectedFileSummary {
  path: string;
  name: string;
  action: RemediationActionType;
  status: RemediationActionStatus;
  quarantined: boolean;
  rollbackAvailable: boolean;
}

export interface RegistryChangeSummary {
  key: string;
  valueName: string;
  action: RemediationActionType;
  status: RemediationActionStatus;
  rollbackAvailable: boolean;
}

export interface BrowserChangeSummary {
  setting: string;
  action: RemediationActionType;
  status: RemediationActionStatus;
  rollbackAvailable: boolean;
}

// ── History ──────────────────────────────────────────────────────────

export interface RemediationHistoryEntry {
  id: string;
  planId: string;
  investigationId: string;
  timestamp: number;
  action: RemediationActionType;
  status: RemediationActionStatus;
  target: string;
  riskLevel: RemediationRiskLevel;
  userId: string | null;
  notes: string | null;
}

export interface RemediationHistoryData {
  entries: RemediationHistoryEntry[];
  totalActions: number;
  successfulActions: number;
  failedActions: number;
  rolledBackActions: number;
  quarantineCount: number;
  restoreCount: number;
  deleteCount: number;
  falsePositiveCount: number;
  lastActionAt: number | null;
}

// ── Events ───────────────────────────────────────────────────────────

export type RemediationEventType =
  | 'plan_created'
  | 'plan_approved'
  | 'plan_rejected'
  | 'action_executing'
  | 'action_completed'
  | 'action_failed'
  | 'action_rolled_back'
  | 'quarantine_added'
  | 'quarantine_restored'
  | 'quarantine_deleted'
  | 'false_positive_marked'
  | 'report_generated';

export interface RemediationEvent {
  type: RemediationEventType;
  timestamp: number;
  planId?: string;
  actionId?: string;
  investigationId?: string;
  message?: string;
  data?: Record<string, unknown>;
}

export type RemediationEventListener = (event: RemediationEvent) => void;

// ── Configuration ────────────────────────────────────────────────────

export interface RemediationConfiguration {
  enabled: boolean;
  policy: RemediationPolicy;
  quarantineEnabled: boolean;
  quarantinePath: string;
  quarantineEncryption: boolean;
  rollbackEnabled: boolean;
  rollbackMaxEntries: number;
  falsePositiveTracking: boolean;
  autoGenerateReports: boolean;
  observationPeriodMs: number;
  maxConcurrentActions: number;
}

export const DEFAULT_REMEDIATION_CONFIG: RemediationConfiguration = {
  enabled: true,
  policy: DEFAULT_REMEDIATION_POLICY,
  quarantineEnabled: true,
  quarantinePath: '%APPDATA%\\AVS Shield\\Quarantine',
  quarantineEncryption: true,
  rollbackEnabled: true,
  rollbackMaxEntries: 200,
  falsePositiveTracking: true,
  autoGenerateReports: true,
  observationPeriodMs: 86400000,
  maxConcurrentActions: 3,
};

// ── Dashboard ────────────────────────────────────────────────────────

export interface RemediationDashboardData {
  summary: RemediationDashboardSummary;
  pendingApprovals: ApprovalSummary;
  quarantineSummary: QuarantineSummary;
  recentActions: RemediationDashboardEntry[];
  falsePositiveSummary: FalsePositiveSummary;
  rollbackAvailable: number;
  lastUpdated: number;
}

export interface RemediationDashboardSummary {
  totalPlans: number;
  pendingPlans: number;
  completedPlans: number;
  totalActions: number;
  pendingActions: number;
  completedActions: number;
  failedActions: number;
  quarantinedItems: number;
  restoredItems: number;
  deletedItems: number;
  falsePositives: number;
  rollbacksAvailable: number;
  rollbacksExecuted: number;
}

export interface RemediationDashboardEntry {
  id: string;
  actionType: RemediationActionType;
  status: RemediationActionStatus;
  riskLevel: RemediationRiskLevel;
  target: string;
  investigationId: string;
  timestamp: number;
  reversible: boolean;
}

// ── Helper Functions ─────────────────────────────────────────────────

export function actionRequiresApproval(
  action: RemediationActionType,
  riskLevel: RemediationRiskLevel,
  policy: RemediationPolicy,
): boolean {
  if (policy.mode === 'manual_only') return true;
  if (policy.mode === 'recommend_only') return true;

  const riskOrder: RemediationRiskLevel[] = ['safe', 'low_risk', 'medium_risk', 'high_risk', 'critical_risk'];
  const thresholdIdx = riskOrder.indexOf(policy.autoRemediateThreshold);
  const riskIdx = riskOrder.indexOf(riskLevel);

  if (riskIdx <= thresholdIdx && policy.mode === 'auto_remediate_low_risk') return false;

  if (riskLevel === 'high_risk' && policy.requireApprovalForHighRisk) return true;
  if (riskLevel === 'critical_risk') return true;

  return riskIdx > thresholdIdx;
}

export function isActionDestructive(action: RemediationActionType): boolean {
  return action === 'delete';
}

export function isActionReversible(action: RemediationActionType): boolean {
  switch (action) {
    case 'quarantine': return true;
    case 'disable_startup_entry': return true;
    case 'disable_scheduled_task': return true;
    case 'disable_browser_extension': return true;
    case 'reset_browser_setting': return true;
    case 'remove_persistence': return true;
    case 'delete': return false;
    case 'ignore': return true;
    case 'mark_false_positive': return true;
    case 'review': return true;
    case 'restore': return false;
    case 'export_investigation': return true;
    default: return false;
  }
}

export function actionToRiskLevel(action: RemediationActionType, severity: ThreatSeverity): RemediationRiskLevel {
  if (action === 'delete') return 'critical_risk';
  if (action === 'quarantine') return severity === 'critical' ? 'high_risk' : 'medium_risk';
  if (action === 'remove_persistence') return 'medium_risk';
  if (action === 'disable_scheduled_task' || action === 'disable_startup_entry') return 'low_risk';
  if (action === 'disable_browser_extension' || action === 'reset_browser_setting') return 'low_risk';
  if (action === 'ignore' || action === 'review' || action === 'mark_false_positive') return 'safe';
  if (action === 'export_investigation') return 'safe';
  if (action === 'restore') return 'safe';
  return 'medium_risk';
}

export function tierAllowsAction(action: RemediationActionType, tier: RemediationTier): boolean {
  const proOnly: RemediationActionType[] = [];
  // All basic actions available in FREE tier
  // PRO adds: bulk, scheduled, automation (handled at plan level)
  if (proOnly.includes(action) && tier === 'free') return false;
  return true;
}
