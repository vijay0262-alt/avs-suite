/**
 * AI Threat Investigation — Type Definitions
 *
 * Version 1.2 — EPIC 1 — Part 3 — AI Threat Investigation & Explainable Security
 *
 * Every detected threat becomes an investigation. The user understands:
 *   - What happened
 *   - Why it was detected
 *   - How dangerous it is
 *   - What evidence exists
 *   - What the recommended action is
 *
 * Core principles:
 *   - The AI must never invent information. Every explanation is evidence-based.
 *   - Consume ONLY existing SecurityThreat objects — never scan directly.
 *   - Correlated events appear as a single incident, not separate alerts.
 *   - No remediation, no quarantine, no destructive actions.
 */

import type {
  Threat,
  ThreatCategory,
  ThreatSeverity,
  ThreatRisk,
  ThreatStatus,
  ConfidenceLabel,
  SecurityEvidence,
  MitreAttackMapping,
  AffectedAsset,
  SecuritySnapshot,
  SecurityHistorySummary,
} from '../security-center/types';

// ── Re-exports for convenience ───────────────────────────────────────

export type {
  Threat,
  ThreatCategory,
  ThreatSeverity,
  ThreatRisk,
  ThreatStatus,
  ConfidenceLabel,
  SecurityEvidence,
  MitreAttackMapping,
  AffectedAsset,
  SecuritySnapshot,
  SecurityHistorySummary,
};

// ── Investigation ────────────────────────────────────────────────────

export interface ThreatInvestigation {
  id: string;
  threatIds: string[];
  primaryThreatId: string;
  summary: ThreatSummary;
  explanation: ThreatExplanation;
  severity: InvestigationSeverity;
  confidence: InvestigationConfidence;
  risk: ThreatRisk;
  evidence: CollectedEvidence;
  timeline: TimelineEvent[];
  relationships: ThreatRelationship[];
  affectedComponents: AffectedComponent[];
  mitreAttack: MitreAttackMapping[];
  recommendedActions: RecommendedAction[];
  estimatedImpact: string;
  estimatedRecovery: string;
  falsePositiveAnalysis: FalsePositiveAnalysis;
  status: InvestigationStatus;
  createdAt: number;
  updatedAt: number;
  metadata: InvestigationMetadata;
  relationshipGraph: ThreatRelationshipGraph;
  context: ThreatContext;
}

export type InvestigationStatus = 'open' | 'reviewing' | 'resolved' | 'false_positive' | 'ignored';

// ── Summary ──────────────────────────────────────────────────────────

export interface ThreatSummary {
  title: string;
  oneLiner: string;
  category: ThreatCategory;
  threatCount: number;
  primaryThreatName: string;
  detectedAt: number;
  lastActivity: number;
}

// ── Explanation ──────────────────────────────────────────────────────

export interface ThreatExplanation {
  whatHappened: string;
  whyDetected: string;
  evidenceSummary: string;
  confidenceReasoning: string;
  possibleFalsePositiveFactors: string[];
  userFriendlyExplanation: string;
  technicalExplanation: string;
}

// ── Severity ─────────────────────────────────────────────────────────

export interface InvestigationSeverity {
  level: ThreatSeverity;
  score: number;
  reasoning: string;
  factors: SeverityFactor[];
}

export interface SeverityFactor {
  factor: string;
  weight: number;
  description: string;
}

// ── Confidence ───────────────────────────────────────────────────────

export interface InvestigationConfidence {
  score: number;
  label: ConfidenceLabel;
  reasoning: string;
  factors: ConfidenceFactor[];
  mitigatingFactors: string[];
}

export interface ConfidenceFactor {
  factor: string;
  impact: number;
  description: string;
}

// ── Collected Evidence ───────────────────────────────────────────────

export interface CollectedEvidence {
  total: number;
  bySource: Record<string, number>;
  byType: Record<string, number>;
  items: SecurityEvidence[];
  strongestEvidence: SecurityEvidence | null;
  evidenceQuality: 'weak' | 'moderate' | 'strong' | 'very_strong';
}

// ── Timeline ─────────────────────────────────────────────────────────

export interface TimelineEvent {
  id: string;
  timestamp: number;
  type: TimelineEventType;
  description: string;
  source: string;
  threatId: string | null;
  severity: ThreatSeverity;
  evidenceRef: string | null;
}

export type TimelineEventType =
  | 'discovery'
  | 'execution'
  | 'persistence'
  | 'network'
  | 'privilege_change'
  | 'user_action'
  | 'system_change'
  | 'detection'
  | 'correlation'
  | 'configuration_change';

// ── Relationships ────────────────────────────────────────────────────

export interface ThreatRelationship {
  fromThreatId: string;
  toThreatId: string;
  type: RelationshipType;
  description: string;
  strength: number;
}

export type RelationshipType =
  | 'causes'
  | 'enables'
  | 'downloads'
  | 'creates'
  | 'modifies'
  | 'communicates_with'
  | 'persists_via'
  | 'escalates_to'
  | 'related_to';

// ── Relationship Graph ───────────────────────────────────────────────

export interface ThreatRelationshipGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: GraphCluster[];
  totalNodes: number;
  totalEdges: number;
}

export interface GraphNode {
  id: string;
  threatId: string;
  label: string;
  category: ThreatCategory;
  severity: ThreatSeverity;
  confidence: number;
  isPrimary: boolean;
}

export interface GraphEdge {
  from: string;
  to: string;
  type: RelationshipType;
  strength: number;
  label: string;
}

export interface GraphCluster {
  id: string;
  nodeIds: string[];
  label: string;
  description: string;
}

// ── Affected Components ──────────────────────────────────────────────

export interface AffectedComponent {
  type: AffectedComponentType;
  name: string;
  path: string;
  status: 'affected' | 'modified' | 'created' | 'suspicious';
  description: string;
}

export type AffectedComponentType =
  | 'file'
  | 'process'
  | 'registry'
  | 'scheduled_task'
  | 'service'
  | 'startup_entry'
  | 'browser_extension'
  | 'browser_setting'
  | 'network_connection'
  | 'dns_resolution'
  | 'listening_port';

// ── Recommendations ──────────────────────────────────────────────────

export interface RecommendedAction {
  id: string;
  priority: 'immediate' | 'high' | 'medium' | 'low';
  action: string;
  reason: string;
  userActionRequired: boolean;
  estimatedDifficulty: 'easy' | 'moderate' | 'advanced';
  category: RecommendationCategory;
}

export type RecommendationCategory =
  | 'review'
  | 'monitor'
  | 'remove'
  | 'restore'
  | 'verify'
  | 'isolate'
  | 'report';

// ── False Positive Analysis ──────────────────────────────────────────

export interface FalsePositiveAnalysis {
  couldBeLegitimate: boolean;
  reasons: string[];
  confidenceReducingFactors: string[];
  additionalVerificationSteps: string[];
  similarKnownGoodSoftware: string[];
}

// ── Context ──────────────────────────────────────────────────────────

export interface ThreatContext {
  systemState: SystemStateContext;
  relatedThreats: RelatedThreatContext[];
  historicalContext: HistoricalContext | null;
  processContext: ProcessContext | null;
  hardwareContext: HardwareContext | null;
  networkContext: NetworkContext | null;
}

export interface SystemStateContext {
  osVersion: string;
  lastBootTime: number;
  uptime: number;
  securityScore: number;
  providersActive: number;
  providersTotal: number;
}

export interface RelatedThreatContext {
  threatId: string;
  name: string;
  category: ThreatCategory;
  relationship: string;
}

export interface HistoricalContext {
  firstSeen: number;
  lastSeen: number;
  occurrenceCount: number;
  previousStatus: ThreatStatus;
  trend: 'increasing' | 'stable' | 'decreasing';
}

export interface ProcessContext {
  processName: string | null;
  pid: number | null;
  cpuUsage: number | null;
  memoryUsage: number | null;
  parentProcess: string | null;
  commandLine: string | null;
}

export interface HardwareContext {
  cpuModel: string | null;
  totalMemory: number | null;
  gpuModel: string | null;
  diskHealth: string | null;
}

export interface NetworkContext {
  remoteAddress: string | null;
  remotePort: number | null;
  protocol: string | null;
  connectionState: string | null;
  dnsDomain: string | null;
}

// ── Reports ──────────────────────────────────────────────────────────

export interface ThreatReport {
  investigationId: string;
  generatedAt: number;
  executiveSummary: string;
  technicalDetails: string;
  evidence: ReportEvidenceSection;
  timeline: TimelineEvent[];
  recommendations: RecommendedAction[];
  mitreAttack: MitreAttackMapping[];
  riskScore: number;
  confidenceScore: number;
  severity: ThreatSeverity;
  falsePositiveAnalysis: FalsePositiveAnalysis;
  affectedComponents: AffectedComponent[];
}

export interface ReportEvidenceSection {
  summary: string;
  items: ReportEvidenceItem[];
  qualityAssessment: string;
}

export interface ReportEvidenceItem {
  source: string;
  type: string;
  value: string;
  description: string;
  timestamp: number;
  significance: 'critical' | 'important' | 'supporting' | 'minor';
}

// ── Knowledge Base ───────────────────────────────────────────────────

export interface KnowledgeBaseEntry {
  category: ThreatCategory;
  name: string;
  userFriendlyName: string;
  description: string;
  whatIsIt: string;
  howItWorks: string;
  whyDangerous: string;
  commonIndicators: string[];
  mitreTechniques: string[];
  preventionTips: string[];
  falsePositiveScenarios: string[];
  severityGuidance: string;
}

// ── Investigation Metadata ───────────────────────────────────────────

export interface InvestigationMetadata {
  source: 'automatic' | 'manual' | 'correlation';
  version: string;
  engineVersion: string;
  processingTime: number;
  threatsProcessed: number;
  correlationsFound: number;
}

// ── Events ───────────────────────────────────────────────────────────

export type InvestigationEventType =
  | 'investigation_created'
  | 'investigation_updated'
  | 'investigation_resolved'
  | 'investigation_false_positive'
  | 'correlation_found'
  | 'evidence_collected'
  | 'report_generated';

export interface InvestigationEvent {
  type: InvestigationEventType;
  timestamp: number;
  investigationId?: string;
  message?: string;
  data?: Record<string, unknown>;
}

export type InvestigationEventListener = (event: InvestigationEvent) => void;

// ── Configuration ────────────────────────────────────────────────────

export interface InvestigationConfiguration {
  enabled: boolean;
  enableCorrelation: boolean;
  enableTimeline: boolean;
  enableKnowledgeBase: boolean;
  enableFalsePositiveAnalysis: boolean;
  enableContextualAnalysis: boolean;
  minConfidenceThreshold: number;
  maxInvestigations: number;
  correlationTimeWindow: number;
  enableReports: boolean;
  enableVisualization: boolean;
  autoGenerateReports: boolean;
}

export const DEFAULT_INVESTIGATION_CONFIG: InvestigationConfiguration = {
  enabled: true,
  enableCorrelation: true,
  enableTimeline: true,
  enableKnowledgeBase: true,
  enableFalsePositiveAnalysis: true,
  enableContextualAnalysis: true,
  minConfidenceThreshold: 0.3,
  maxInvestigations: 100,
  correlationTimeWindow: 3600000,
  enableReports: true,
  enableVisualization: true,
  autoGenerateReports: true,
};

// ── Dashboard ────────────────────────────────────────────────────────

export interface InvestigationDashboardData {
  summary: InvestigationDashboardSummary;
  activeInvestigations: InvestigationDashboardEntry[];
  recentInvestigations: InvestigationDashboardEntry[];
  severityDistribution: Record<ThreatSeverity, number>;
  categoryDistribution: Record<string, number>;
  correlationStats: CorrelationStats;
  lastUpdated: number;
}

export interface InvestigationDashboardSummary {
  totalInvestigations: number;
  openInvestigations: number;
  resolvedInvestigations: number;
  falsePositiveCount: number;
  criticalCount: number;
  highCount: number;
  averageConfidence: number;
  averageRiskScore: number;
  totalCorrelations: number;
  totalEvidenceItems: number;
}

export interface InvestigationDashboardEntry {
  id: string;
  title: string;
  category: ThreatCategory;
  severity: ThreatSeverity;
  confidence: number;
  risk: ThreatRisk;
  status: InvestigationStatus;
  threatCount: number;
  evidenceCount: number;
  detectedAt: number;
  lastActivity: number;
  summary: string;
}

export interface CorrelationStats {
  totalCorrelatedGroups: number;
  averageThreatsPerGroup: number;
  maxThreatsInGroup: number;
  commonCorrelationTypes: Record<string, number>;
}

// ── History ──────────────────────────────────────────────────────────

export interface InvestigationHistoryEntry {
  id: string;
  investigationId: string;
  timestamp: number;
  action: 'created' | 'updated' | 'resolved' | 'false_positive' | 'ignored' | 'reopened';
  previousStatus: InvestigationStatus | null;
  newStatus: InvestigationStatus;
  notes: string | null;
}

export interface InvestigationHistoryData {
  entries: InvestigationHistoryEntry[];
  totalInvestigations: number;
  resolvedCount: number;
  falsePositiveCount: number;
  averageResolutionTime: number;
  lastUpdated: number;
}

// ── Input Bundle ─────────────────────────────────────────────────────

export interface InvestigationInput {
  threats: Threat[];
  snapshot: SecuritySnapshot | null;
  historySummary: SecurityHistorySummary | null;
  processContext?: ProcessContext | null;
  hardwareContext?: HardwareContext | null;
  networkContext?: NetworkContext | null;
}

// ── Helper Functions ─────────────────────────────────────────────────

export function severityToScore(severity: ThreatSeverity): number {
  switch (severity) {
    case 'critical': return 100;
    case 'high': return 75;
    case 'medium': return 50;
    case 'low': return 25;
    case 'info': return 5;
    default: return 0;
  }
}

export function confidenceToLabel(confidence: number): ConfidenceLabel {
  if (confidence >= 0.9) return 'very_high';
  if (confidence >= 0.75) return 'high';
  if (confidence >= 0.5) return 'medium';
  if (confidence >= 0.3) return 'low';
  return 'very_low';
}

export function evidenceQualityToString(quality: CollectedEvidence['evidenceQuality']): string {
  switch (quality) {
    case 'very_strong': return 'Very Strong';
    case 'strong': return 'Strong';
    case 'moderate': return 'Moderate';
    case 'weak': return 'Weak';
    default: return 'Unknown';
  }
}
