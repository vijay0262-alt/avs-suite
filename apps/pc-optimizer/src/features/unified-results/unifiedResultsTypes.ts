/**
 * Unified AI Results Types — shared types for the premium AI results
 * experience used by ALL modules in AVS Shield.
 *
 * Every completed scan ends with a UnifiedResultsReport containing:
 *   - Header with timestamp, duration, items analyzed, AI confidence
 *   - Overall score (circular gauge, animated)
 *   - AI verdict (natural language summary)
 *   - Issue priority groups (Critical/High/Medium/Low/Informational)
 *   - Impact estimation (storage, memory, startup, performance, time)
 *   - Premium result cards (before/after comparison)
 *   - Recommendations with priority, reason, benefit, risk, rollback, confidence
 *   - Action panel (review, apply, export, save, close)
 *   - Report export (PDF, HTML, JSON, CSV)
 *   - Scan history entry
 */

// ── Issue Priority ──────────────────────────────────────────────

export type IssuePriority = 'critical' | 'high' | 'medium' | 'low' | 'informational';

export interface UnifiedIssue {
  id: string;
  title: string;
  description: string;
  priority: IssuePriority;
  category: string;
  severity: 'danger' | 'warning' | 'info' | 'success';
  location?: string;
  confidence: number;
  evidence: string[];
  recommendationId?: string;
}

// ── Impact Estimation ───────────────────────────────────────────

export interface UnifiedImpactEstimate {
  id: string;
  label: string;
  icon: string;
  currentValue: string;
  estimatedValue: string;
  difference: string;
  unit: 'bytes' | 'seconds' | 'percent' | 'count' | 'plain';
  positive: boolean;
}

// ── Recommendation ──────────────────────────────────────────────

export interface UnifiedRecommendation {
  id: string;
  title: string;
  summary: string;
  description: string;
  priority: IssuePriority;
  category: string;
  reason: string;
  expectedBenefit: string;
  estimatedTime: string;
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  rollbackAvailable: boolean;
  requiresConfirmation: boolean;
  aiConfidence: number;
  evidence: string[];
  whyItMatters: string;
  whatHappensIfIgnored: string;
  requiresPro: boolean;
  selected?: boolean;
}

// ── Result Card ─────────────────────────────────────────────────

export interface UnifiedResultCardData {
  id: string;
  title: string;
  icon: string;
  metrics: UnifiedResultCardMetric[];
  status?: 'good' | 'warning' | 'danger';
}

export interface UnifiedResultCardMetric {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}

// ── Score Display ───────────────────────────────────────────────

export interface UnifiedScoreDisplay {
  label: string;
  value: number;
  max?: number;
  icon?: string;
  description?: string;
}

// ── AI Verdict ──────────────────────────────────────────────────

export interface UnifiedAIVerdict {
  summary: string;
  details: string[];
  confidence: number;
  evidenceCount: number;
  evidenceSources: string[];
}

// ── Scan History Entry ──────────────────────────────────────────

export interface UnifiedScanHistoryEntry {
  id: string;
  module: string;
  moduleName: string;
  moduleIcon: string;
  score: number;
  durationMs: number;
  issuesFound: number;
  threatsFound?: number;
  actionsTaken: string[];
  timestamp: number;
  reportId: string;
}

// ── Results Report ──────────────────────────────────────────────

export interface UnifiedResultsReport {
  reportId: string;
  moduleId: string;
  moduleName: string;
  moduleIcon: string;
  timestamp: number;
  durationMs: number;
  itemsAnalyzed: number;
  issuesFound: number;
  threatsFound?: number;
  aiConfidence: number;

  // Scores
  primaryScore: UnifiedScoreDisplay;
  secondaryScores: UnifiedScoreDisplay[];

  // AI Verdict
  aiVerdict: UnifiedAIVerdict;

  // Issues grouped by priority
  issues: UnifiedIssue[];

  // Impact estimation
  impactEstimates: UnifiedImpactEstimate[];

  // Result cards
  resultCards: UnifiedResultCardData[];

  // Recommendations
  recommendations: UnifiedRecommendation[];

  // Actions
  actions: UnifiedResultAction[];

  // System info for export
  systemInfo?: UnifiedSystemInfo;
}

// ── Result Action ───────────────────────────────────────────────

export interface UnifiedResultAction {
  id: string;
  label: string;
  icon: string;
  variant: 'primary' | 'secondary' | 'danger' | 'ghost';
  action: () => void;
  requiresPro?: boolean;
}

// ── System Info (for report export) ─────────────────────────────

export interface UnifiedSystemInfo {
  os: string;
  osVersion: string;
  cpu: string;
  ram: string;
  disk: string;
  hostname: string;
  appVersion: string;
}

// ── Export Format ───────────────────────────────────────────────

export type ReportExportFormat = 'pdf' | 'html' | 'json' | 'csv';

// ── Helpers ─────────────────────────────────────────────────────

export function priorityOrder(priority: IssuePriority): number {
  const order: Record<IssuePriority, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    informational: 4,
  };
  return order[priority];
}

export function priorityLabel(priority: IssuePriority): string {
  const labels: Record<IssuePriority, string> = {
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
    informational: 'Informational',
  };
  return labels[priority];
}

export function priorityColor(priority: IssuePriority): string {
  const colors: Record<IssuePriority, string> = {
    critical: 'text-semantic-danger',
    high: 'text-semantic-warning',
    medium: 'text-brand-primary',
    low: 'text-text-secondary',
    informational: 'text-text-muted',
  };
  return colors[priority];
}

export function priorityBg(priority: IssuePriority): string {
  const colors: Record<IssuePriority, string> = {
    critical: 'bg-semantic-danger/10 border-semantic-danger/20',
    high: 'bg-semantic-warning/10 border-semantic-warning/20',
    medium: 'bg-brand-primary/10 border-brand-primary/20',
    low: 'bg-[var(--avs-surface-muted)] border-[var(--avs-border)]',
    informational: 'bg-[var(--avs-surface-muted)] border-[var(--avs-border)]',
  };
  return colors[priority];
}

export function riskColor(risk: UnifiedRecommendation['riskLevel']): string {
  const colors: Record<string, string> = {
    none: 'text-semantic-success',
    low: 'text-semantic-success',
    medium: 'text-semantic-warning',
    high: 'text-semantic-warning',
    critical: 'text-semantic-danger',
  };
  return colors[risk] ?? 'text-text-muted';
}

export function scoreColor(score: number): string {
  if (score >= 90) return 'text-semantic-success';
  if (score >= 75) return 'text-brand-primary';
  if (score >= 60) return 'text-semantic-warning';
  return 'text-semantic-danger';
}

export function scoreStrokeColor(score: number): string {
  if (score >= 90) return 'var(--avs-success)';
  if (score >= 75) return 'var(--avs-brand-primary)';
  if (score >= 60) return 'var(--avs-warning)';
  return 'var(--avs-danger)';
}

export function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}m ${rs}s`;
}
